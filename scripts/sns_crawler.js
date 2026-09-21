/**
 * sns_crawler.js
 * 
 * ラーメン二郎 直系全店舗の公式X / Instagramを巡回し、
 * 最新の投稿・添付画像を収集して Gemini 1.5 Flash で営業変更を自動解析。
 * 承認待ちデータ（data/pending_updates.json）を更新する。
 */

const fs = require('fs');
const path = require('path');
const { analyzePostWithGemini } = require('./analyze_posts');

const SHOPS_JSON_PATH = path.join(__dirname, '..', 'shops.json');
const PENDING_UPDATES_PATH = path.join(__dirname, '..', 'data', 'pending_updates.json');
const CRAWLED_CACHE_PATH = path.join(__dirname, '..', 'data', 'crawled_cache.json');
const AI_GUIDELINES_PATH = path.join(__dirname, '..', 'data', 'ai_guidelines.json');

/**
 * ルール管理ファイル (data/ai_guidelines.json) からキーワード設定を読み込む
 */
function loadScheduleKeywords() {
    if (fs.existsSync(AI_GUIDELINES_PATH)) {
        try {
            const data = JSON.parse(fs.readFileSync(AI_GUIDELINES_PATH, 'utf8'));
            if (data && data.scheduleKeywords) {
                return data.scheduleKeywords;
            }
        } catch (e) {
            console.warn('[WARN] Failed to load scheduleKeywords from ai_guidelines.json:', e.message);
        }
    }
    return null;
}

/**
 * Yahoo!リアルタイム検索を利用して特定アカウントの直近投稿を取得（IP制限・429回避）
 */
async function fetchXFromYahooRealtime(screenName) {
    if (!screenName) return [];
    const cleanHandle = screenName.replace(/^@/, '').trim();
    const url = `https://search.yahoo.co.jp/realtime/search?p=id%3A${cleanHandle}`;

    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
            }
        });

        if (!res.ok) {
            console.warn(`[WARN] Yahoo Realtime search failed for @${cleanHandle}: ${res.status}`);
            return null;
        }

        const html = await res.text();
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
        if (!match) return null;

        const nextData = JSON.parse(match[1]);
        const entries = nextData?.props?.pageProps?.pageData?.timeline?.entry || [];

        const posts = [];
        for (const entry of entries) {
            const tweetId = entry.id;
            if (!tweetId) continue;

            const text = entry.displayText || entry.displayTextBody || '';
            let createdAt = new Date().toISOString();
            if (entry.createdAt) {
                const ts = Number(entry.createdAt);
                if (!isNaN(ts)) {
                    // Unix秒なら1000倍、ミリ秒ならそのまま
                    createdAt = new Date(ts < 10000000000 ? ts * 1000 : ts).toISOString();
                }
            }

            // メディアURL（画像）の抽出
            const mediaUrls = [];
            if (Array.isArray(entry.media)) {
                entry.media.forEach(m => {
                    const imgUrl = m?.item?.mediaUrl || m?.metaImageUrl || m?.item?.thumbnailImageUrl;
                    if (imgUrl) mediaUrls.push(imgUrl);
                });
            } else if (entry.media?.item?.mediaUrl) {
                mediaUrls.push(entry.media.item.mediaUrl);
            }

            // リプライ判定フラグ
            const isReply = Boolean(entry.isReply || entry.inReplyToStatusId || entry.inReplyToUserId || entry.inReplyToScreenName);

            posts.push({
                source: 'x',
                postId: tweetId,
                postUrl: `https://x.com/${cleanHandle}/status/${tweetId}`,
                text: text,
                postedAt: createdAt,
                mediaUrls: mediaUrls,
                isReply: isReply
            });
        }

        return posts;
    } catch (err) {
        console.warn(`[WARN] Error crawling Yahoo Realtime for @${cleanHandle}:`, err.message);
        return null;
    }
}

/**
 * X Syndication API を利用して特定アカウントの直近投稿を取得（フォールバック用）
 */
async function fetchXFromSyndication(screenName) {
    if (!screenName) return [];
    const cleanHandle = screenName.replace(/^@/, '').trim();
    const url = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${cleanHandle}?limit=10`;

    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });

        if (!res.ok) {
            console.warn(`[WARN] X timeline fetch failed for @${cleanHandle}: ${res.status}`);
            return [];
        }

        const html = await res.text();
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
        if (!match) return [];

        const nextData = JSON.parse(match[1]);
        const timeline = nextData?.props?.pageProps?.timeline?.entries || [];

        const posts = [];
        for (const entry of timeline) {
            const tweet = entry?.content?.tweet;
            if (!tweet) continue;

            const tweetId = tweet.id_str;
            const text = tweet.text || '';
            const createdAt = tweet.created_at ? new Date(tweet.created_at).toISOString() : new Date().toISOString();
            
            const mediaUrls = [];
            if (tweet.photos && Array.isArray(tweet.photos)) {
                tweet.photos.forEach(p => {
                    if (p.url) mediaUrls.push(p.url);
                });
            } else if (tweet.mediaDetails && Array.isArray(tweet.mediaDetails)) {
                tweet.mediaDetails.forEach(m => {
                    if (m.media_url_https) mediaUrls.push(m.media_url_https);
                });
            }

            const isReply = Boolean(tweet.in_reply_to_status_id_str || tweet.in_reply_to_screen_name || tweet.in_reply_to_user_id_str);

            posts.push({
                source: 'x',
                postId: tweetId,
                postUrl: `https://x.com/${cleanHandle}/status/${tweetId}`,
                text: text,
                postedAt: createdAt,
                mediaUrls: mediaUrls,
                isReply: isReply
            });
        }

        return posts;
    } catch (err) {
        console.warn(`[WARN] Error crawling @${cleanHandle}:`, err.message);
        return [];
    }
}

/**
 * 他アカウントへのメンションまたはリプライであるかを判定
 * （公式の営業案内告知ではなく、個別会話や返信とみなして解析から除外）
 */
function isMentionOrReply(post, ownHandle = '') {
    if (!post) return false;

    // 1. メタデータによるリプライ判定
    if (post.isReply) return true;

    const text = (post.text || '').trim();
    if (!text) return false;

    // 2. 本文先頭が @ で始まる場合はリプライ
    if (/^@[a-zA-Z0-9_]+/i.test(text)) {
        return true;
    }

    // 3. 本文中に含まれるメンション (@username) の抽出と判定
    const cleanOwnHandle = (ownHandle || '').replace(/^@/, '').toLowerCase();
    const mentionMatches = text.match(/@[a-zA-Z0-9_]+/g);
    if (mentionMatches && mentionMatches.length > 0) {
        for (const m of mentionMatches) {
            const mentionedUser = m.replace(/^@/, '').toLowerCase();
            // 自分自身のアカウント名以外のメンションが含まれていれば「他アカウントへのメンション」と判定
            if (mentionedUser !== cleanOwnHandle) {
                return true;
            }
        }
    }

    return false;
}

/**
 * 営業情報に関連する可能性が高い投稿か事前判定（API消費を7〜8割カット）
 * ルール管理ファイル (data/ai_guidelines.json) のキーワード設定を動的に反映
 */
function isLikelySchedulePost(post, keywordConfig = null) {
    // 添付画像がある場合はカレンダーや貼り紙の可能性があるため常に解析
    if (Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0) {
        return true;
    }

    const text = post.text || '';
    if (!text) return false;

    const keywords = (keywordConfig && Array.isArray(keywordConfig.keywords))
        ? keywordConfig.keywords
        : [
            '休', 'やすみ', '休み', '臨休', '営業', '開店', '閉店', '時短',
            '時間', '早仕舞い', '早じまい', '昼', '夜', '部', '祝', '特別',
            'カレンダー', 'お知らせ', '告知', '案内', '終了', '完売', '材料切れ',
            '売り切れ', '並び', '宣告', 'オープン', 'ラスト', 'お休み', '休業'
        ];

    if (keywords.some(kw => text.includes(kw))) {
        return true;
    }

    const periodKeywords = (keywordConfig && Array.isArray(keywordConfig.periodKeywords))
        ? keywordConfig.periodKeywords
        : ['本日', '今日', '明日', '明後日', 'あさって', '今週', '来週', '今月', '来月', '今年', '来年'];

    if (periodKeywords.some(kw => text.includes(kw))) {
        return true;
    }

    const patterns = (keywordConfig && Array.isArray(keywordConfig.patterns))
        ? keywordConfig.patterns
        : [
            '\\d{1,2}[:：]\\d{2}',
            '\\d{1,2}時',
            '\\d{1,2}[\\/／]\\d{1,2}',
            '\\d{1,2}月\\d{1,2}日',
            '\\d{1,2}日',
            '[\\(（][月火水木金土日][\\)）]',
            '[月火水木金土日]曜'
        ];

    for (const pat of patterns) {
        try {
            if (new RegExp(pat).test(text)) return true;
        } catch (e) {}
    }

    return false;
}

/**
 * Xの直近投稿を取得（Yahoo!リアルタイム検索優先、失敗時にSyndication APIへフォールバック）
 */
async function fetchXRecentPosts(screenName) {
    // 1. Yahoo!リアルタイム検索（データセンターIP遮断・429回避）
    const yahooPosts = await fetchXFromYahooRealtime(screenName);
    if (yahooPosts !== null) {
        return yahooPosts;
    }

    // 2. フォールバック
    return await fetchXFromSyndication(screenName);
}

/**
 * メイン巡回処理
 */
async function runCrawler() {
    console.log('=== ラーメン二郎 公式SNS巡回 & 営業変更解析 開始 ===');

    if (!fs.existsSync(SHOPS_JSON_PATH)) {
        console.error(`shops.json not found at ${SHOPS_JSON_PATH}`);
        process.exit(1);
    }

    const shops = JSON.parse(fs.readFileSync(SHOPS_JSON_PATH, 'utf8'));
    // 自動巡回はXアカウントを持つ店舗のみを対象（Instagramはエディタからの手動貼り付けAI解析で対応）
    const activeShops = shops.filter(s => !s.closedAt && s.x);

    // キャッシュ読み込み
    let cache = { lastCrawledAt: null, processedPostIds: [] };
    if (fs.existsSync(CRAWLED_CACHE_PATH)) {
        try {
            cache = JSON.parse(fs.readFileSync(CRAWLED_CACHE_PATH, 'utf8'));
            if (!Array.isArray(cache.processedPostIds)) cache.processedPostIds = [];
        } catch (e) {}
    }
    const processedSet = new Set(cache.processedPostIds || []);

    // 既存の pending_updates 読み込み
    let pendingUpdates = [];
    if (fs.existsSync(PENDING_UPDATES_PATH)) {
        try {
            pendingUpdates = JSON.parse(fs.readFileSync(PENDING_UPDATES_PATH, 'utf8'));
            if (!Array.isArray(pendingUpdates)) pendingUpdates = [];
        } catch (e) {}
    }

    // ルール管理ファイルからキーワード設定を読み込み
    const keywordConfig = loadScheduleKeywords();
    if (keywordConfig) {
        console.log(`ℹ️ AIルール管理ファイルからキーワード設定をロードしました (キーワード: ${keywordConfig.keywords.length}語)`);
    }

    console.log(`対象店舗数: ${activeShops.length}店舗 (処理済み投稿数: ${processedSet.size}件)`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('⚠️ GEMINI_API_KEY が未設定です。Gemini解析はスキップされ、モックまたは収集のみ実行されます。');
    }

    let newlyDetectedCount = 0;

    for (const shop of activeShops) {
        console.log(`\n🔍 チェック中: ${shop.name} (X: @${shop.x})`);

        let posts = [];
        if (shop.x) {
            const xPosts = await fetchXRecentPosts(shop.x);
            posts.push(...xPosts);
        }

        // 新規かつ直近48時間以内の投稿のみをフィルタリング
        const twoDaysAgo = Date.now() - (48 * 60 * 60 * 1000);
        const newPosts = posts.filter(p => {
            if (processedSet.has(p.postId)) return false;
            const postTime = new Date(p.postedAt).getTime();
            return postTime >= twoDaysAgo;
        });

        console.log(`  -> 新規投稿: ${newPosts.length}件`);

        for (const post of newPosts) {
            // 0. 他アカウントへのメンションまたはリプライはGemini解析対象外
            if (isMentionOrReply(post, shop.x)) {
                console.log(`  ⏭️ メンション・リプライと判定しスキップ: "${post.text.substring(0, 25).replace(/\n/g, ' ')}..."`);
                const skippedItem = {
                    id: `pending_skipped_${shop.id}_${post.postId}`,
                    shopId: shop.id,
                    shopName: shop.name,
                    postSource: post.source,
                    postUrl: post.postUrl,
                    postedAt: post.postedAt,
                    postText: post.text,
                    mediaUrls: post.mediaUrls || [],
                    detectedChange: {
                        type: 'temporary_hours',
                        startDate: post.postedAt.split('T')[0],
                        endDate: post.postedAt.split('T')[0],
                        hours: [],
                        reason: '他アカウントへのメンション・リプライ'
                    },
                    status: 'skipped',
                    skipReason: '他アカウントへのメンションまたはリプライのため解析対象外'
                };
                pendingUpdates = pendingUpdates.filter(p => p.id !== skippedItem.id);
                pendingUpdates.push(skippedItem);
                processedSet.add(post.postId);
                continue;
            }

            // 事前フィルタ: 営業変更の可能性がない日常雑談ポストはスキップ済みとして記録（APIは呼ばない）
            if (!isLikelySchedulePost(post, keywordConfig)) {
                console.log(`  ⏭️ 日常ポストと判定しスキップとして記録: "${post.text.substring(0, 25).replace(/\n/g, ' ')}..."`);
                
                const skippedItem = {
                    id: `pending_skipped_${shop.id}_${post.postId}`,
                    shopId: shop.id,
                    shopName: shop.name,
                    postSource: post.source,
                    postUrl: post.postUrl,
                    postedAt: post.postedAt,
                    postText: post.text,
                    mediaUrls: post.mediaUrls || [],
                    detectedChange: {
                        type: 'temporary_hours',
                        startDate: post.postedAt.split('T')[0],
                        endDate: post.postedAt.split('T')[0],
                        hours: [],
                        reason: '日常ポスト（営業関連ワードなし）'
                    },
                    status: 'skipped',
                    skipReason: '営業・日程関連のキーワードが含まれないためスキップ（日常ポスト・雑談等）'
                };
                pendingUpdates = pendingUpdates.filter(p => p.id !== skippedItem.id);
                pendingUpdates.push(skippedItem);
                processedSet.add(post.postId);
                continue;
            }

            if (!apiKey) {
                continue;
            }

            try {
                console.log(`  🤖 Gemini解析中: "${post.text.substring(0, 30).replace(/\n/g, ' ')}..."`);
                const analysis = await analyzePostWithGemini({
                    shopId: shop.id,
                    shopName: shop.name,
                    postText: post.text,
                    postedAt: post.postedAt,
                    mediaUrls: post.mediaUrls,
                    shiftsByDay: shop.shiftsByDay || {},
                    temporary: shop.temporary || []
                }, apiKey);

                if (analysis && analysis.hasScheduleChange && Array.isArray(analysis.changes) && analysis.changes.length > 0) {
                    for (let idx = 0; idx < analysis.changes.length; idx++) {
                        const change = analysis.changes[idx];
                        
                        // 対象日の曜日を特定 (0=日曜, 1=月曜, ...)
                        let dayOfWeek = null;
                        if (change.startDate) {
                            const d = new Date(change.startDate + 'T00:00:00+09:00');
                            if (!isNaN(d.getTime())) {
                                dayOfWeek = d.getDay().toString();
                            }
                        }

                        // 既存の登録スケジュール（通常シフトまたは既存temporary）との完全一致判定
                        let isExactMatch = false;
                        let matchReason = '';

                        // 1. 既存の temporary との一致チェック
                        const matchedTemp = (shop.temporary || []).find(t => t.startDate === change.startDate);
                        if (matchedTemp) {
                            if (JSON.stringify(matchedTemp.hours || []) === JSON.stringify(change.hours || [])) {
                                isExactMatch = true;
                                matchReason = '既に登録済みの臨時スケジュールと完全に一致';
                            }
                        } else if (dayOfWeek !== null && shop.shiftsByDay) {
                            // 2. 通常営業時間との一致チェック（定休日は [] と空配列の一致含む）
                            const normalHours = shop.shiftsByDay[dayOfWeek] || [];
                            if (JSON.stringify(normalHours) === JSON.stringify(change.hours || [])) {
                                isExactMatch = true;
                                matchReason = '対象曜日の通常営業時間と完全に一致（変更なし）';
                            }
                        }

                        const status = isExactMatch ? 'skipped' : 'pending';
                        const pendingItem = {
                            id: `pending_${shop.id}_${change.startDate.replace(/-/g, '')}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
                            shopId: shop.id,
                            shopName: shop.name,
                            postSource: post.source,
                            postUrl: post.postUrl,
                            postedAt: post.postedAt,
                            postText: post.text,
                            mediaUrls: post.mediaUrls || [],
                            detectedChange: change,
                            status: status,
                            skipReason: isExactMatch ? matchReason : null
                        };

                        // 既存の同一日・同一タイプの候補があれば上書き、別日程・別タイプなら追加
                        pendingUpdates = pendingUpdates.filter(p => !(p.shopId === shop.id && p.detectedChange.startDate === change.startDate && p.detectedChange.type === change.type));
                        pendingUpdates.push(pendingItem);

                        if (isExactMatch) {
                            console.log(`    ℹ️ 既存スケジュールと完全一致のためスキップとして記録: ${change.startDate} (${matchReason})`);
                        } else {
                            newlyDetectedCount++;
                            console.log(`    ✨ 営業変更を検出！ (${idx + 1}/${analysis.changes.length}) [${change.type}] ${change.startDate}: ${change.reason || analysis.summary}`);
                        }
                    }
                }

                // 正常に解析が完了した場合のみ、処理済みキャッシュに追加（エラー時は次回再試行可能に保持）
                processedSet.add(post.postId);
            } catch (err) {
                console.error(`  ❌ Gemini解析エラー (Shop: ${shop.id}):`, err.message);
            }

            // APIレートリミット・負荷対策（3秒ウェイトでRPM 5の制限を確実に回避）
            await new Promise(r => setTimeout(r, 3000));
        }

        // 相手サーバーへの負荷軽減・Polite Crawling（店舗間に2.5秒ウェイト）
        await new Promise(r => setTimeout(r, 2500));
    }

    // キャッシュ保存（最大1,000件保持）
    cache.lastCrawledAt = new Date().toISOString();
    cache.processedPostIds = Array.from(processedSet).slice(-1000);
    fs.writeFileSync(CRAWLED_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');

    // pending_updates 保存
    fs.writeFileSync(PENDING_UPDATES_PATH, JSON.stringify(pendingUpdates, null, 2), 'utf8');

    console.log(`\n=== 巡回完了: 新たに ${newlyDetectedCount} 件の営業変更候補を pending_updates.json に保存しました ===`);
}

if (require.main === module) {
    runCrawler().catch(err => {
        console.error('Crawler fatal error:', err);
        process.exit(1);
    });
}

module.exports = {
    runCrawler,
    fetchXRecentPosts,
    isMentionOrReply
};

