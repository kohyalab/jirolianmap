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

            posts.push({
                source: 'x',
                postId: tweetId,
                postUrl: `https://x.com/${cleanHandle}/status/${tweetId}`,
                text: text,
                postedAt: createdAt,
                mediaUrls: mediaUrls
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

            posts.push({
                source: 'x',
                postId: tweetId,
                postUrl: `https://x.com/${cleanHandle}/status/${tweetId}`,
                text: text,
                postedAt: createdAt,
                mediaUrls: mediaUrls
            });
        }

        return posts;
    } catch (err) {
        console.warn(`[WARN] Error crawling @${cleanHandle}:`, err.message);
        return [];
    }
}

/**
 * 営業情報に関連する可能性が高い投稿か事前判定（API消費を7〜8割カット）
 */
function isLikelySchedulePost(post) {
    // 添付画像がある場合はカレンダーや貼り紙の可能性があるため常に解析
    if (Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0) {
        return true;
    }

    const text = post.text || '';
    if (!text) return false;

    // 営業・休業・時間変更に関連するキーワードリスト
    const scheduleKeywords = [
        '休', 'やすみ', '休み', '臨休', '営業', '開店', '閉店', '時短',
        '時間', '早仕舞い', '早じまい', '昼', '夜', '部', '祝', '特別',
        'カレンダー', 'お知らせ', '告知', '案内', '終了', '完売', '材料切れ',
        '売り切れ', '並び', '宣告', 'オープン', 'ラスト'
    ];

    return scheduleKeywords.some(kw => text.includes(kw));
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
            // 事前フィルタ: 営業変更の可能性がない日常雑談ポストはGeminiを呼ばずに処理済みとしてスキップ
            if (!isLikelySchedulePost(post)) {
                console.log(`  ⏭️ 日常ポストと判定しGemini解析をスキップ: "${post.text.substring(0, 25).replace(/\n/g, ' ')}..."`);
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
                    mediaUrls: post.mediaUrls
                }, apiKey);

                if (analysis && analysis.hasScheduleChange && Array.isArray(analysis.changes) && analysis.changes.length > 0) {
                    for (let idx = 0; idx < analysis.changes.length; idx++) {
                        const change = analysis.changes[idx];
                        // 既に shops.json に同一日付・同一時間の temporary が登録されていないか確認
                        const alreadyRegistered = (shop.temporary || []).some(t => {
                            return t.startDate === change.startDate && JSON.stringify(t.hours || []) === JSON.stringify(change.hours || []);
                        });

                        if (alreadyRegistered) {
                            console.log(`    ℹ️ 既に shops.json に登録済みのスケジュールのため除外: ${change.startDate}`);
                            continue;
                        }

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
                            status: 'pending'
                        };

                        // 既存の未承認同日・同タイプの候補があれば上書き、別日程・別タイプなら追加
                        pendingUpdates = pendingUpdates.filter(p => !(p.shopId === shop.id && p.detectedChange.startDate === change.startDate && p.detectedChange.type === change.type));
                        pendingUpdates.push(pendingItem);
                        newlyDetectedCount++;

                        console.log(`    ✨ 営業変更を検出！ (${idx + 1}/${analysis.changes.length}) [${change.type}] ${change.startDate}: ${change.reason || analysis.summary}`);
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
    fetchXRecentPosts
};

