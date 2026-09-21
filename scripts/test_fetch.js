/**
 * test_fetch.js
 * 
 * SNS（X / Instagram）からの投稿取得とAI解析を安全にテストするための単体テストスクリプト。
 * ※ shops.json や pending_updates.json への書き込み、Gitコミットは一切行いません（完全Dry Run）。
 * 
 * 使い方:
 *   node scripts/test_fetch.js [店舗ID または Xアカウント名]
 *   例: node scripts/test_fetch.js jiro_kame
 *       node scripts/test_fetch.js sendai2
 *       node scripts/test_fetch.js --sample
 */

const fs = require('fs');
const path = require('path');
const { fetchXRecentPosts, isMentionOrReply } = require('./sns_crawler');
const { analyzePostWithGemini } = require('./analyze_posts');

const SHOPS_JSON_PATH = path.join(__dirname, '..', 'shops.json');

async function main() {
    const targetArg = process.argv[2] || 'jiro_kame';
    console.log(`\n========================================`);
    console.log(`🧪 SNS投稿取得 & AI解析 テスト実行 (Dry Run)`);
    console.log(`========================================\n`);

    let targetShop = null;
    let targetHandle = targetArg.replace(/^@/, '');

    if (fs.existsSync(SHOPS_JSON_PATH)) {
        const shops = JSON.parse(fs.readFileSync(SHOPS_JSON_PATH, 'utf8'));
        targetShop = shops.find(s => s.id === targetArg || (s.x && s.x.toLowerCase() === targetHandle.toLowerCase()));
        if (targetShop && targetShop.x) {
            targetHandle = targetShop.x;
        }
    }

    const shopName = targetShop ? targetShop.name : `@${targetHandle}`;
    console.log(`📍 対象店舗: ${shopName} (X: @${targetHandle})`);
    console.log(`⏳ Xタイムラインから最新の投稿を取得中...`);

    const posts = await fetchXRecentPosts(targetHandle);

    if (!posts || posts.length === 0) {
        console.log(`\n⚠️ 投稿を取得できませんでした（または直近の投稿がありません）。`);
        console.log(`   ※ X側のレート制限や一時的なアクセスの可能性もあります。`);
        return;
    }

    console.log(`\n✅ 正常に取得成功！ 取得件数: ${posts.length}件\n`);

    // GitHub Actions Step Summary にも出力できるようにマークダウン文字列を蓄積
    let summaryMd = `### 🧪 SNS取得テスト結果: ${shopName} (@${targetHandle})\n\n`;
    summaryMd += `取得件数: **${posts.length}件**\n\n`;

    const apiKey = process.env.GEMINI_API_KEY;

    for (let i = 0; i < posts.length; i++) {
        const p = posts[i];
        console.log(`----------------------------------------`);
        console.log(`[投稿 #${i + 1}] 日時: ${p.postedAt}`);
        console.log(`URL: ${p.postUrl}`);
        console.log(`本文: \n${p.text}`);
        if (p.mediaUrls && p.mediaUrls.length > 0) {
            console.log(`添付画像 (${p.mediaUrls.length}枚):`);
            p.mediaUrls.forEach(url => console.log(`  - ${url}`));
        }

        summaryMd += `#### 投稿 #${i + 1} (${new Date(p.postedAt).toLocaleString('ja-JP')})\n`;
        summaryMd += `- **URL**: [元ポストを開く](${p.postUrl})\n`;
        summaryMd += `- **本文**:\n> ${p.text.replace(/\n/g, '\n> ')}\n\n`;
        if (p.mediaUrls && p.mediaUrls.length > 0) {
            summaryMd += `- **添付画像**: ${p.mediaUrls.map((u, idx) => `[画像${idx + 1}](${u})`).join(', ')}\n\n`;
        }

        // 他アカウントへのメンション判定（自ポストへのリプライ・ツリーは解析対象）
        const isMention = isMentionOrReply(p, targetHandle);
        if (isMention) {
            console.log(`\n⏭️ 他アカウントへのメンションのため、Gemini AI解析はスキップします。`);
            summaryMd += `- **AI判定**: ⏭️ **スキップ（他アカウントへのメンション）**\n\n`;
            continue;
        }

        if (apiKey) {
            console.log(`\n🤖 Gemini AI で営業変更を解析中...`);
            try {
                const analysis = await analyzePostWithGemini({
                    shopId: targetShop ? targetShop.id : 'test',
                    shopName: shopName,
                    postText: p.text,
                    postedAt: p.postedAt,
                    mediaUrls: p.mediaUrls
                }, apiKey);

                console.log(`🤖 AI判定結果:`, JSON.stringify(analysis, null, 2));
                summaryMd += `- **AI判定**: ${analysis.hasScheduleChange ? '✨ **営業変更あり**' : '通常営業・変更なし'}\n`;
                if (analysis.summary) summaryMd += `- **要約**: ${analysis.summary}\n`;
                if (analysis.changes && analysis.changes.length > 0) {
                    analysis.changes.forEach(c => {
                        summaryMd += `  - 種類: \`${c.type}\`, 日付: \`${c.startDate}\`, 営業時間: \`${JSON.stringify(c.hours)}\`\n`;
                    });
                }
            } catch (err) {
                console.error(`❌ AI解析エラー:`, err.message);
                summaryMd += `- **AI解析エラー**: ${err.message}\n`;
            }
        } else {
            console.log(`ℹ️ GEMINI_API_KEY が設定されていないため、AI解析テストはスキップしました。`);
        }
        console.log(`----------------------------------------\n`);
        summaryMd += `\n---\n`;
    }

    // GITHUB_STEP_SUMMARY 環境変数があれば書き込み
    if (process.env.GITHUB_STEP_SUMMARY) {
        try {
            fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMd, 'utf8');
        } catch (e) {}
    }

    console.log(`🎉 テスト完了。本番データ（shops.json）への変更は一切行われていません。`);
}

main().catch(err => {
    console.error('Fatal error during test:', err);
    process.exit(1);
});

