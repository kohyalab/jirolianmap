/**
 * Cloudflare Worker: ラーメン二郎マップ 定期タスクスケジューラー
 * 
 * - SNS公式投稿巡回 (毎時0分、30分)
 * - 毎朝の定期X自動投稿 (毎日 JST 07:00 / UTC 22:00)
 * - 将来的な定期実行タスクの追加にも柔軟に対応できる汎用ジョブ管理アーキテクチャ
 */

// ==============================================================================
// 1. 定期実行ジョブの定義リスト (汎用設定テーブル)
//    ※ 今後新しい定期ジョブを追加する場合は、この配列にエントリを追加するだけで対応可能です。
// ==============================================================================
const SCHEDULED_JOBS = [
    {
        id: 'sns-monitor',
        name: 'SNS公式投稿巡回 & 営業変更自動検知',
        description: 'ラーメン二郎直系各店舗の公式Xを巡回し、Geminiで営業変更を解析してsns_posts.jsonを更新',
        cron: '0,30 * * * *', // 毎時0分, 30分
        eventType: 'trigger-sns-monitor',
        defaultPayload: { ref: 'main' },
        enabled: true
    },
    {
        id: 'daily-post',
        name: '二郎営業マップ 毎朝の定期自動ツイート',
        description: '当日の直系各店舗の営業状況・臨時営業情報を画像化して公式Xへ自動ポスト',
        cron: '0 22 * * *', // 毎日 JST 07:00 (UTC 22:00)
        eventType: 'trigger-daily-post',
        defaultPayload: { environment: 'prod' },
        enabled: true
    }
];

// ==============================================================================
// 2. 共通ヘルパー: GitHub Repository Dispatch API 呼び出し
// ==============================================================================
async function dispatchGitHubAction(env, eventType, clientPayload = {}) {
    const owner = env.GITHUB_OWNER || 'kohyalab';
    const repo = env.GITHUB_REPO || 'jirolianmap';
    const token = env.GH_PAT || env.GITHUB_PAT || env.GITHUB_TOKEN;

    if (!token) {
        throw new Error('GH_PAT (または GITHUB_PAT) が環境変数に設定されていません。');
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/dispatches`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'Cloudflare-Worker-JiroScheduler/1.0',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            event_type: eventType,
            client_payload: clientPayload
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub API Dispatch失敗: HTTP ${response.status} ${response.statusText} - ${errorText}`);
    }

    return { success: true, status: response.status, owner, repo, eventType, clientPayload };
}

// ==============================================================================
// 3. Cronマッチング判定ロジック (時刻ベースのフォールバック評価)
// ==============================================================================
function matchesCron(cronExpr, date = new Date()) {
    // cronExpr: "minute hour day month day-of-week"
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length < 5) return false;

    const [cronMin, cronHour, cronDay, cronMonth, cronDow] = parts;
    const min = date.getUTCMinutes();
    const hour = date.getUTCHours();
    const day = date.getUTCDate();
    const month = date.getUTCMonth() + 1;
    const dow = date.getUTCDay();

    function matchField(field, val) {
        if (field === '*') return true;
        if (field.startsWith('*/')) {
            const step = parseInt(field.slice(2), 10);
            return !isNaN(step) && step > 0 && (val % step === 0);
        }
        if (field.includes(',')) {
            return field.split(',').map(s => parseInt(s, 10)).includes(val);
        }
        const parsed = parseInt(field, 10);
        return !isNaN(parsed) && parsed === val;
    }

    return (
        matchField(cronMin, min) &&
        matchField(cronHour, hour) &&
        matchField(cronDay, day) &&
        matchField(cronMonth, month) &&
        matchField(cronDow, dow)
    );
}

// ==============================================================================
// 4. Cloudflare Worker メインエクスポート
// ==============================================================================
export default {
    /**
     * 定期実行トリガー (Cloudflare Cron Triggers)
     */
    async scheduled(event, env, ctx) {
        const now = new Date();
        const triggeredCron = event.cron || '';
        console.log(`[SCHEDULED] Cron Trigger fired at ${now.toISOString()} with cron: "${triggeredCron}"`);

        // 実行すべきジョブを抽出
        let jobsToRun = SCHEDULED_JOBS.filter(job => {
            if (!job.enabled) return false;
            // 1. Cloudflareから渡されたcron文字列と完全一致する場合
            if (triggeredCron && job.cron === triggeredCron) return true;
            // 2. cron文字列が異なる場合でも現在時刻とcron式が一致する場合
            return matchesCron(job.cron, now);
        });

        // テスト実行への配慮: Cloudflareダッシュボードの「Test」ボタンや /__scheduled 手動呼び出しで
        // cron が空文字 "" かつ 定時外に手動実行された場合は、テスト対象として sns-monitor を実行
        if (jobsToRun.length === 0 && (!triggeredCron || triggeredCron === '')) {
            console.log(`[SCHEDULED] テスト実行（cron未指定かつ定時外）と判定したため、テスト対象として sns-monitor を実行します。`);
            const defaultTestJob = SCHEDULED_JOBS.find(j => j.id === 'sns-monitor');
            if (defaultTestJob) {
                jobsToRun = [defaultTestJob];
            }
        }

        if (jobsToRun.length === 0) {
            console.log(`[SCHEDULED] 該当する実行対象ジョブはありませんでした (cron: "${triggeredCron}")`);
            return;
        }

        const results = [];
        for (const job of jobsToRun) {
            try {
                console.log(`[JOB START] ジョブ "${job.name}" (${job.id}) を実行中... イベント: ${job.eventType}`);
                const res = await dispatchGitHubAction(env, job.eventType, job.defaultPayload);
                results.push({ id: job.id, success: true, res });
                console.log(`[JOB SUCCESS] ジョブ "${job.name}" 完了`);
            } catch (err) {
                console.error(`[JOB ERROR] ジョブ "${job.name}" 失敗:`, err.message);
                results.push({ id: job.id, success: false, error: err.message });
            }
        }

        return results;
    },

    /**
     * HTTPリクエストハンドラー (手動トリガー・状態確認API)
     */
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS対応
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                }
            });
        }

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json; charset=utf-8'
        };

        // 1. ヘルスチェック & ジョブ一覧表示
        if (path === '/' || path === '/health') {
            return new Response(JSON.stringify({
                status: 'ok',
                message: 'ラーメン二郎マップ 定期タスクスケジューラー (Cloudflare Worker)',
                serverTimeUtc: new Date().toISOString(),
                serverTimeJst: new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00'),
                registeredJobs: SCHEDULED_JOBS.map(j => ({
                    id: j.id,
                    name: j.name,
                    cron: j.cron,
                    eventType: j.eventType,
                    enabled: j.enabled
                }))
            }, null, 2), { headers: corsHeaders });
        }

        // 2. 手動トリガーエンドポイント (/trigger/:jobId) - ブラウザからのGET・POST両対応
        if (path.startsWith('/trigger/')) {
            const jobId = path.replace('/trigger/', '').trim();
            const job = SCHEDULED_JOBS.find(j => j.id === jobId);

            if (!job) {
                return new Response(JSON.stringify({
                    error: `Job not found: ${jobId}`,
                    availableJobs: SCHEDULED_JOBS.map(j => j.id)
                }), { status: 404, headers: corsHeaders });
            }

            // 簡易セキュリティトークン認証（環境変数 ADMIN_SECRET が設定されている場合のみチェック）
            if (env.ADMIN_SECRET) {
                const authHeader = request.headers.get('Authorization') || '';
                const queryToken = url.searchParams.get('token');
                const provided = authHeader.replace(/^Bearer\s+/i, '').trim() || queryToken;
                if (provided !== env.ADMIN_SECRET) {
                    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), { status: 401, headers: corsHeaders });
                }
            }

            try {
                let customPayload = { ...job.defaultPayload };
                if (request.method === 'POST') {
                    try {
                        const body = await request.json();
                        if (body && typeof body === 'object') {
                            customPayload = { ...customPayload, ...body };
                        }
                    } catch (e) {}
                }

                console.log(`[MANUAL TRIGGER] ジョブ "${job.name}" (${job.id}) を手動実行します`);
                const result = await dispatchGitHubAction(env, job.eventType, customPayload);
                return new Response(JSON.stringify({
                    success: true,
                    message: `ジョブ "${job.name}" をトリガーしました`,
                    result
                }, null, 2), { headers: corsHeaders });
            } catch (err) {
                return new Response(JSON.stringify({
                    success: false,
                    error: err.message
                }), { status: 500, headers: corsHeaders });
            }
        }

        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
    }
};
