process.env.TZ = 'Asia/Tokyo';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { TwitterApi } = require('twitter-api-v2');

function startLocalServer(port = 3000) {
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml'
    };
    const server = http.createServer((req, res) => {
        let reqPath = req.url.split('?')[0];
        if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
        const filePath = path.join(__dirname, reqPath);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            res.end(fs.readFileSync(filePath));
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });
    return new Promise((resolve, reject) => {
        server.listen(port, () => resolve(server));
        server.on('error', reject);
    });
}

async function run() {
    // --- TWEET TEMPLATES START ---
    const templates = {
        default: {
            listMode: 'today',
            sortBy: 'pref'
        }
    };
    // --- TWEET TEMPLATES END ---

    const templateKey = process.argv[2] || 'default';
    const config = templates[templateKey] || templates.default;

    let localServer = null;
    let targetUrl = 'https://app.jirolianmap.com/';
    try {
        const port = 3000 + Math.floor(Math.random() * 1000);
        localServer = await startLocalServer(port);
        targetUrl = `http://localhost:${port}/`;
        console.log(`[BOT] Local HTTP server started at ${targetUrl}`);
    } catch (e) {
        console.warn(`[BOT] Could not start local server, fallback to remote:`, e.message);
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        viewport: { width: 1280, height: 1600 },
        deviceScaleFactor: 2, // 高解像度（Retina）
        locale: 'ja-JP',
        timezoneId: 'Asia/Tokyo'
    });

    // ブラウザ内のログとエラーを捕捉
    page.on('console', msg => console.log(`[PAGE ${msg.type()}]:`, msg.text()));
    page.on('pageerror', err => console.error('[PAGE ERROR]:', err));

    console.log(`[BOT] Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#shop-grid', { timeout: 30000 });

    // アプリの初期化完了および店舗データ読み込み待機
    await page.waitForFunction(() => typeof isAppInitialized !== 'undefined' && isAppInitialized && typeof shareFullGridImage === 'function');
    await page.waitForTimeout(1000);

    // 日別レイアウトの共有処理（shareFullGridImage）を実行し、画像データと共有テキストを取得
    const shareResult = await page.evaluate(async ({ listMode, sortBy }) => {
        // 1. Google Fonts（Noto Sans JP）の読み込みと日本語フォント優先スタイルの適用
        if (!document.querySelector('link[href*="Noto+Sans+JP"]')) {
            const fontLink = document.createElement('link');
            fontLink.rel = 'stylesheet';
            fontLink.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap';
            document.head.appendChild(fontLink);
        }

        if (!document.getElementById('bot-jp-font-style')) {
            const fontStyle = document.createElement('style');
            fontStyle.id = 'bot-jp-font-style';
            fontStyle.innerHTML = `
                * {
                    font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif !important;
                }
            `;
            document.head.appendChild(fontStyle);
        }

        if (document.fonts) {
            try {
                await document.fonts.load('14px "Noto Sans JP"');
                await document.fonts.load('bold 14px "Noto Sans JP"');
                await document.fonts.ready;
            } catch (e) {
                console.warn('Font load warning:', e);
            }
        }

        // 2. 「営業情報」-「日別」モード & ソート設定
        if (typeof setMainViewMode === 'function') {
            setMainViewMode('today');
        }
        if (typeof setPeriodMode === 'function') {
            setPeriodMode('1'); // 1: 日別
        }
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) {
            sortSelect.value = sortBy;
            if (typeof onSortChange === 'function') onSortChange();
        }

        // 表示切り替えとレンダリングの反映を少し待機
        await new Promise(r => setTimeout(r, 600));

        // 3. captureElementWithPadding をフックして生成キャンバスを取得
        let capturedDataUrl = null;
        let capturedText = null;

        const originalCapture = window.captureElementWithPadding;
        window.captureElementWithPadding = async function (target, padding) {
            const canvas = await originalCapture(target, padding);
            if (canvas && !capturedDataUrl) {
                capturedDataUrl = canvas.toDataURL('image/png');
            }
            return canvas;
        };

        // 4. 「営業情報」-「日別」レイアウトの共有処理（shareFullGridImage でモーダル初期化）
        if (typeof shareFullGridImage === 'function') {
            shareFullGridImage();
        }

        // 5. 画像分割は行わない（1枚の画像として出力）
        const splitCb = document.getElementById('share-opt-split');
        if (splitCb) {
            splitCb.checked = false;
            splitCb.dataset.userTouched = 'true';
        }

        // 6. 画像生成実行（executeImageShare）
        if (typeof executeImageShare === 'function') {
            try {
                if (splitCb) splitCb.checked = false;
                await executeImageShare(true);
            } catch (shareErr) {
                console.warn('executeImageShare error:', shareErr);
            }
        }

        // 画像生成完了を待機 (最大 15 秒)
        for (let i = 0; i < 150; i++) {
            if (capturedDataUrl) break;
            await new Promise(r => setTimeout(r, 100));
        }

        // フォールバック: 万が一 capturedDataUrl が取れなかった場合は直接 grid をキャプチャ
        if (!capturedDataUrl && originalCapture) {
            const gridEl = document.getElementById('shop-grid');
            if (gridEl) {
                try {
                    const fallbackCanvas = await originalCapture(gridEl, 16);
                    if (fallbackCanvas) {
                        capturedDataUrl = fallbackCanvas.toDataURL('image/png');
                    }
                } catch (fbErr) {
                    console.error('Fallback capture error:', fbErr);
                }
            }
        }

        if (typeof currentShareTarget !== 'undefined' && currentShareTarget && currentShareTarget.shareText) {
            capturedText = currentShareTarget.shareText;
        }

        return {
            dataUrl: capturedDataUrl,
            text: capturedText
        };
    }, {
        listMode: config.listMode || 'today',
        sortBy: config.sortBy || 'pref'
    });

    if (!shareResult || !shareResult.dataUrl) {
        console.error('日別レイアウト共有画像の生成に失敗しました。');
        await browser.close();
        if (localServer) localServer.close();
        process.exit(1);
    }

    // Base64 データを sheet.png として保存
    const base64Data = shareResult.dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync('sheet.png', Buffer.from(base64Data, 'base64'));

    await browser.close();
    if (localServer) localServer.close();
    console.log('画像生成(sheet.png)が完了しました。');

    const activeDate = new Date();
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const defaultDateStr = `${activeDate.getMonth() + 1}/${activeDate.getDate()}(${dayNames[activeDate.getDay()]})`;
    const fallbackText = `【${defaultDateStr}のラーメン二郎営業情報】\nhttps://app.jirolianmap.com/\n#ラーメン二郎 #二郎 #営業情報 #ジロリアンマップ`;
    const tweetText = config.text || shareResult.text || fallbackText;
    console.log('投稿テキスト:\n' + tweetText);

    const execEnv = (process.env.EXEC_ENV || '').toLowerCase();
    const previewOnly = (process.env.PREVIEW_ONLY || '').toLowerCase();
    console.log(`[BOT LOG] EXEC_ENV: "${process.env.EXEC_ENV}", PREVIEW_ONLY: "${process.env.PREVIEW_ONLY}"`);

    if (execEnv === 'preview' || previewOnly === 'true' || previewOnly === '1') {
        console.log('プレビューモード（preview）のため、Xへの投稿はスキップします。');
        return;
    }

    const hasTwitterCreds = process.env.TWITTER_API_KEY && 
                            process.env.TWITTER_API_SECRET && 
                            process.env.TWITTER_ACCESS_TOKEN && 
                            process.env.TWITTER_ACCESS_SECRET;

    if (!hasTwitterCreds) {
        console.log('X (Twitter) の環境変数が設定されていないため、自動投稿をスキップします。');
        return;
    }

    try {
        console.log('X (Twitter) への自動投稿を開始します...');
        const client = new TwitterApi({
            appKey: process.env.TWITTER_API_KEY,
            appSecret: process.env.TWITTER_API_SECRET,
            accessToken: process.env.TWITTER_ACCESS_TOKEN,
            accessSecret: process.env.TWITTER_ACCESS_SECRET,
        });

        const mediaId = await client.v1.uploadMedia('sheet.png');

        await client.v2.tweet({
            text: tweetText,
            media: {
                media_ids: [mediaId]
            }
        });

        console.log('画像の自動投稿が完了しました。');
    } catch (twitterErr) {
        console.error('X (Twitter) への投稿中にエラーが発生しましたが、画像生成は成功しています:', twitterErr.message);
    }
}

run().catch(err => {
    console.error('実行エラー:', err);
    process.exit(1);
});