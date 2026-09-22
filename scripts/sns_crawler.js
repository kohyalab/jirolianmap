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
const JiroBusinessHours = require('../js/common/business-hours.js');

const SHOPS_JSON_PATH = path.join(__dirname, '..', 'shops.json');
const SNS_POSTS_PATH = path.join(__dirname, '..', 'data', 'sns_posts.json');
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
 * 他アカウントへのメンションであるかを判定
 * （自分自身へのツリー返信・リプライは営業情報告知の可能性があるため除外せず、他アカウント宛ての会話・メンションのみ除外）
 */
function isMentionOrReply(post, ownHandle = '') {
    if (!post) return false;

    const text = (post.text || '').trim();
    if (!text) return false;

    // 本文中に含まれるメンション (@username) の抽出と判定
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
 * data/sns_posts.json から投稿履歴・判定データを読み込む
 */
function loadSnsPosts() {
    let posts = [];
    if (fs.existsSync(SNS_POSTS_PATH)) {
        try {
            posts = JSON.parse(fs.readFileSync(SNS_POSTS_PATH, 'utf8'));
            if (!Array.isArray(posts)) posts = [];
        } catch (e) {
            console.warn('[WARN] Failed to read sns_posts.json:', e.message);
        }
    }
    return posts;
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

    // 既存の sns_posts 読み込み
    let snsPosts = loadSnsPosts();

    // ルール管理ファイルからキーワード設定を読み込み
    const keywordConfig = loadScheduleKeywords();
    if (keywordConfig) {
        console.log(`ℹ️ AIルール管理ファイルからキーワード設定をロードしました (キーワード: ${keywordConfig.keywords.length}語)`);
    }

    console.log(`対象店舗数: ${activeShops.length}店舗 (処理済み投稿数: ${processedSet.size}件)`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('⚠️ GEMINI_API_KEY が未設定です。Gemini解析はスキップされ、収集のみ実行されます。');
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
            // 0. 他アカウントへのメンションはGemini解析対象外（自ポストへのリプライ・ツリーは解析対象）
            if (isMentionOrReply(post, shop.x)) {
                console.log(`  ⏭️ 他アカウントへのメンションと判定し記録: "${post.text.substring(0, 25).replace(/\n/g, ' ')}..."`);
                const mentionItem = {
                    id: `sns_post_mention_${shop.id}_${post.postId}`,
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
                        reason: ''
                    },
                    processed: false,
                    processedAt: null,
                    aiStatus: 'mention',
                    aiReason: '他アカウントへのメンションのため除外'
                };
                const existing = snsPosts.find(p => p.id === mentionItem.id && p.processed);
                if (!existing) {
                    snsPosts = snsPosts.filter(p => p.id !== mentionItem.id);
                    snsPosts.push(mentionItem);
                }
                processedSet.add(post.postId);
                continue;
            }

            // 事前フィルタ: 営業変更の可能性がない日常雑談ポストは記録（APIは呼ばない）
            if (!isLikelySchedulePost(post, keywordConfig)) {
                console.log(`  ⏭️ 日常ポストと判定し記録: "${post.text.substring(0, 25).replace(/\n/g, ' ')}..."`);
                const dailyItem = {
                    id: `sns_post_daily_${shop.id}_${post.postId}`,
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
                        reason: ''
                    },
                    processed: false,
                    processedAt: null,
                    aiStatus: 'daily',
                    aiReason: '営業・日程関連のキーワードが含まれないため除外（日常・雑談）'
                };
                const existing = snsPosts.find(p => p.id === dailyItem.id && p.processed);
                if (!existing) {
                    snsPosts = snsPosts.filter(p => p.id !== dailyItem.id);
                    snsPosts.push(dailyItem);
                }
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
                        
                        // 対象日の実効営業時間を index.html と同一ロジックで取得 (祝日・特定週・通常シフト・既存temporaryを網羅)
                        const targetDate = new Date(`${change.startDate}T00:00:00+09:00`);
                        const effectiveShifts = JiroBusinessHours.getTodayShifts(shop, targetDate) || [];
                        const isExactMatch = JiroBusinessHours.areShiftsEqual(effectiveShifts, change.hours || []);

                        let matchReason = '';
                        if (isExactMatch) {
                            const tempEntry = JiroBusinessHours.findTemporaryEntry(shop, targetDate);
                            if (tempEntry) {
                                matchReason = '既に登録済みの臨時スケジュールと一致';
                            } else {
                                matchReason = '通常営業スケジュール（祝日・特定シフト等含む）と一致';
                            }
                        }

                        const aiStatus = isExactMatch ? 'match' : 'schedule_change';
                        const aiReason = isExactMatch ? matchReason : (change.reason ? `営業変更検出: ${change.reason}` : '営業時間の変更を検出');

                        const postItem = {
                            id: `sns_post_${shop.id}_${change.startDate.replace(/-/g, '')}_${idx}_${post.postId}`,
                            shopId: shop.id,
                            shopName: shop.name,
                            postSource: post.source,
                            postUrl: post.postUrl,
                            postedAt: post.postedAt,
                            postText: post.text,
                            mediaUrls: post.mediaUrls || [],
                            detectedChange: change,
                            processed: false,
                            processedAt: null,
                            aiStatus: aiStatus,
                            aiReason: aiReason
                        };

                        // 既存の同一投稿ID/同一対象日で、既に人間系により処理済み(processed: true)なものがあれば上書きせず保護
                        const existingProcessed = snsPosts.find(p => 
                            (p.id === postItem.id || (p.postUrl === postItem.postUrl && p.detectedChange?.startDate === change.startDate)) && p.processed
                        );
                        if (existingProcessed) {
                            console.log(`    ℹ️ 既に人間系により処理済みのため保護: ${change.startDate}`);
                            continue;
                        }

                        // 同一店舗・同一日・同一タイプの未処理アイテムがあれば更新、なければ追加
                        snsPosts = snsPosts.filter(p => !(p.shopId === shop.id && p.detectedChange?.startDate === change.startDate && p.detectedChange?.type === change.type && !p.processed));
                        snsPosts.push(postItem);

                        if (isExactMatch) {
                            console.log(`    ℹ️ 既存スケジュールと一致（変更なし）: ${change.startDate} (${matchReason})`);
                        } else {
                            newlyDetectedCount++;
                            console.log(`    ✨ 営業変更を検出！ (${idx + 1}/${analysis.changes.length}) [${change.type}] ${change.startDate}: ${change.reason || analysis.summary}`);
                        }
                    }
                }

                // 正常に解析が完了した場合のみ、処理済みキャッシュに追加
                processedSet.add(post.postId);
            } catch (err) {
                console.error(`  ❌ Gemini解析エラー (Shop: ${shop.id}):`, err.message);
            }

            // APIレートリミット・負荷対策（3秒ウェイト）
            await new Promise(r => setTimeout(r, 3000));
        }

        // 店舗間に2.5秒ウェイト
        await new Promise(r => setTimeout(r, 2500));
    }

    // キャッシュ保存（最大1,000件保持）
    cache.lastCrawledAt = new Date().toISOString();
    cache.processedPostIds = Array.from(processedSet).slice(-1000);
    fs.writeFileSync(CRAWLED_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');

    // sns_posts.json 保存
    fs.writeFileSync(SNS_POSTS_PATH, JSON.stringify(snsPosts, null, 2), 'utf8');

    console.log(`\n=== 巡回完了: 合計 ${snsPosts.length} 件 (新規検出: ${newlyDetectedCount}件) を sns_posts.json に保存しました ===`);
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

