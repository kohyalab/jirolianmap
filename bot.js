const { chromium } = require('playwright');
const { TwitterApi } = require('twitter-api-v2');

function getTodayText() {
    const now = new Date();
    const jstDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const month = jstDate.getMonth() + 1;
    const date = jstDate.getDate();
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayStr = dayNames[jstDate.getDay()];
    return `${month}/${date}(${dayStr})`;
}

function getFormattedDateYMD() {
    const now = new Date();
    const jstDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const year = jstDate.getFullYear();
    const month = String(jstDate.getMonth() + 1).padStart(2, '0');
    const date = String(jstDate.getDate()).padStart(2, '0');
    return `${year}/${month}/${date}`;
}

async function run() {
    // --- TWEET TEMPLATES START ---
    const templates = {
        default: {
            text: `【本日${getTodayText()}のラーメン二郎営業情報】\n\n詳しい情報はジロリアンマップで↓\n🔗https://app.jirolianmap.com\n \n#ラーメン二郎 #二郎 #営業情報 #ジロリアンマップ`,
            captureElement: '#sidebar-container',
            listMode: 'today',
            sortBy: 'pref'
        }
    };
    // --- TWEET TEMPLATES END ---

    const templateKey = process.argv[2] || 'default';
    const config = templates[templateKey] || templates.default;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        viewport: { width: 1280, height: 1600 },
        deviceScaleFactor: 2 // 高解像度（Retina）
    });

    await page.goto('https://app.jirolianmap.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#sidebar-container', { timeout: 30000 });

    // 画面初期設定 & 縦長用スタイル・日本語フォント注入
    await page.evaluate(({ ymdDate, listMode, sortBy }) => {
        // 1. Google Fonts（Noto Sans JP）の動的読み込み
        const fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap';
        document.head.appendChild(fontLink);

        // 2. 表示モード & ソート
        if (typeof setListSubMode === 'function') setListSubMode(listMode);
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) {
            sortSelect.value = sortBy;
            if (typeof onSortChange === 'function') onSortChange();
        }

        // 3. 日付表示を「yyyy/mm/dd」に固定置換 ＆ 右側に「の営業状況」「橙文字: 臨時営業/休業」の注釈を表示
        const dateArea = document.getElementById('date-selector-area');
        if (dateArea) {
            dateArea.style.width = '100%';
            dateArea.style.display = 'flex';
            dateArea.style.alignItems = 'center';
            dateArea.style.justifyContent = 'space-between';
            dateArea.innerHTML = `
        <div style="display:inline-flex; align-items:center; gap:6px;">
          <div style="display:inline-flex; align-items:center; gap:6px; background:#141414; border:1px solid #333; border-radius:4px; padding:4px 8px; color:#fff; font-size:0.85rem; font-weight:bold; font-family:'Noto Sans JP', sans-serif;">
            <span>${ymdDate}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <span style="font-size:0.75rem; color:#aaa; font-weight:500; font-family:'Noto Sans JP', sans-serif; white-space:nowrap;">の営業状況</span>
        </div>
        <div style="font-size:0.75rem; font-weight:bold; color:#ff9f43; font-family:'Noto Sans JP', sans-serif; white-space:nowrap;">
          橙文字: 臨時営業/休業
        </div>
      `;
        }

        // 4. サイドバー最下部に注意書きを追記
        const sidebar = document.getElementById('sidebar-container');
        if (sidebar) {
            const footerNote = document.createElement('div');
            footerNote.style.cssText = 'padding: 8px 12px; margin-top: 4px; border-top: 1px solid #333; color: #aaa; font-size: 0.72rem; text-align: center; width: 100%; box-sizing: border-box; font-family: "Noto Sans JP", sans-serif;';
            footerNote.textContent = '※記載内容は変更となる場合がありますので、ご自身でもご確認ください';
            sidebar.appendChild(footerNote);
        }

        // 4. 縦長・フォント指定CSSの適用
        const style = document.createElement('style');
        style.id = 'bot-capture-style';
        style.innerHTML = `
      * {
        font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif !important;
      }
      #sidebar-container {
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 534px !important;
        min-width: 534px !important;
        height: auto !important;
        max-height: none !important;
        background-color: #121212 !important;
        z-index: 999999 !important;
        overflow: visible !important;
        padding-bottom: 12px !important;
      }
      .list-header-controls {
        display: none !important;
      }
      #date-selector-area {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        border-bottom: 1px solid #333 !important;
        padding: 10px 12px !important;
        background-color: #121212 !important;
      }
      .container {
        overflow: visible !important;
        height: auto !important;
        max-height: none !important;
        padding: 8px 10px !important;
      }
      .shop-grid.view-mode-today {
        grid-template-columns: repeat(5, 98px) !important;
        gap: 6px !important;
        width: 100% !important;
      }
      .shop-grid.view-mode-minimal {
        grid-template-columns: repeat(5, 98px) !important;
        gap: 6px !important;
        width: 100% !important;
      }
    `;
        document.head.appendChild(style);
    }, {
        ymdDate: getFormattedDateYMD(),
        listMode: config.listMode || 'today',
        sortBy: config.sortBy || 'opened'
    });

    // フォント読み込み・レンダリング完了待機
    await page.waitForTimeout(1500);

    // 要素をキャプチャ
    const captureSelector = config.captureElement || '#sidebar-container';
    const targetElement = await page.$(captureSelector);
    if (targetElement) {
        await targetElement.screenshot({ path: 'sheet.png' });
    } else {
        await page.screenshot({ path: 'sheet.png', fullPage: true });
    }

    await browser.close();
    console.log('画像生成(sheet.png)が完了しました。');

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
            text: config.text || config,
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