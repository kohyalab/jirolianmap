/**
 * Cloudflare Worker: ラーメン二郎マップ 定期タスクスケジューラー
 * 
 * - SNS公式投稿巡回 (毎時0分、30分)
 * - 毎朝の定期X自動投稿 (毎日 JST 07:00 / UTC 22:00)
 * - 将来的な定期実行タスクの追加にも柔軟に対応できる汎用ジョブ管理アーキテクチャ
 */

// ==============================================================================
// 1. 定期実行ジョブの定義リスト (汎用設定テーブル)
// ==============================================================================
const SCHEDULED_JOBS = [
    {
        id: 'sns-monitor',
        name: 'SNS公式投稿巡回 & 営業変更自動検知',
        description: 'ラーメン二郎直系各店舗の公式Xを巡回し、Geminiで営業変更を解析してsns_posts.jsonを更新',
        cron: '0,30 * * * *', // 毎時0分, 30分 (*/30 * * * * も同等にマッチ)
        eventType: 'trigger-sns-monitor',
        workflowFile: 'sns_monitor.yml',
        defaultPayload: { ref: 'main' },
        enabled: true
    },
    {
        id: 'daily-post',
        name: '二郎営業マップ 毎朝の定期自動ツイート',
        description: '当日の直系各店舗の営業状況・臨時営業情報を画像化して公式Xへ自動ポスト',
        cron: '0 22 * * *', // 毎日 JST 07:00 (UTC 22:00)
        eventType: 'trigger-daily-post',
        workflowFile: 'daily_post.yml',
        defaultPayload: { environment: 'prod' },
        enabled: true
    }
];

// ==============================================================================
// 2. 直近の実行履歴ログ (Workerインスタンスメモリに保持)
// ==============================================================================
const executionHistory = [];

function recordExecution(entry) {
    executionHistory.unshift({
        ...entry,
        timestampUtc: new Date().toISOString(),
        timestampJst: new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00')
    });
    if (executionHistory.length > 20) {
        executionHistory.pop();
    }
}

// ==============================================================================
// 3. 共通ヘルパー: GitHub API 呼び出し (repository_dispatch & workflow_dispatch 自動フォールバック)
// ==============================================================================
async function dispatchGitHubAction(env, job, clientPayload = {}) {
    const owner = env.GITHUB_OWNER || 'kohyalab';
    const repo = env.GITHUB_REPO || 'jirolianmap';
    const token = env.GH_PAT || env.GITHUB_PAT || env.GITHUB_TOKEN;

    if (!token) {
        throw new Error('GH_PAT (または GITHUB_PAT) が環境変数に設定されていません。CloudflareのSettings > Variables and Secrets で GH_PAT を登録してください。');
    }

    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Cloudflare-Worker-JiroScheduler/1.0',
        'Content-Type': 'application/json'
    };

    const eventType = job.eventType;
    const workflowFile = job.workflowFile;

    // 1. まず repository_dispatch API を試行
    const dispatchUrl = `https://api.github.com/repos/${owner}/${repo}/dispatches`;
    let response;
    try {
        response = await fetch(dispatchUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                event_type: eventType,
                client_payload: clientPayload
            })
        });
    } catch (netErr) {
        throw new Error(`GitHub APIへの接続エラー: ${netErr.message}`);
    }

    if (response.ok) {
        return { success: true, method: 'repository_dispatch', status: response.status, owner, repo, eventType, clientPayload };
    }

    const errorText = await response.text();

    // 2. 403 Forbidden（PAT権限制限等）の場合、workflow_dispatch API に自動フォールバック試行
    if ((response.status === 403 || response.status === 404) && workflowFile) {
        console.warn(`[WARN] repository_dispatch failed (HTTP ${response.status}). Trying workflow_dispatch for ${workflowFile}...`);
        const workflowUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;

        const workflowPayload = {
            ref: clientPayload.ref || 'main',
            inputs: {}
        };
        if (clientPayload.environment) {
            workflowPayload.inputs.environment = clientPayload.environment;
        }
        if (clientPayload.force_rescan) {
            workflowPayload.inputs.force_rescan = String(clientPayload.force_rescan);
        }

        let wfResponse;
        try {
            wfResponse = await fetch(workflowUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(workflowPayload)
            });
        } catch (wfNetErr) {
            throw new Error(`workflow_dispatchへの接続エラー: ${wfNetErr.message}`);
        }

        if (wfResponse.ok) {
            return { success: true, method: 'workflow_dispatch', status: wfResponse.status, owner, repo, workflowFile, payload: workflowPayload };
        }

        const wfErrorText = await wfResponse.text();
        throw new Error(
            `GitHub API呼び出し失敗 (HTTP 403 Forbidden): GitHub Personal Access Token (GH_PAT) の権限が不足しています。\n` +
            `【エラー詳細】\n` +
            `- repository_dispatch: ${errorText}\n` +
            `- workflow_dispatch: ${wfErrorText}\n\n` +
            `【解決策 (GitHubのトークン設定)】\n` +
            `・Fine-grained PATをご利用の場合: 対象リポジトリ (${owner}/${repo}) に対し、Permissions > Repository permissions で「Contents: Read and write」および「Actions: Read and write」の両方を付与してください。\n` +
            `・Classic PATをご利用の場合: スコープで「repo」にチェックを入れて再生成してください。`
        );
    }

    throw new Error(`GitHub API Dispatch失敗: HTTP ${response.status} ${response.statusText} - ${errorText}`);
}

// ==============================================================================
// 4. Cronマッチング判定ロジック (Cron式の揺れ・時刻ズレの完全吸収)
// ==============================================================================
function matchesCron(cronExpr, date = new Date()) {
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

/**
 * ジョブがトリガー対象かを判定（完全一致・同義語吸収・時刻近似判定）
 */
function isJobDue(job, triggeredCron, now) {
    if (!job.enabled) return false;

    // 1. 完全一致
    if (triggeredCron && job.cron === triggeredCron) return true;

    // 2. 30分毎のあらゆるcron表現を同一視
    if (job.id === 'sns-monitor') {
        if (
            triggeredCron === '*/30 * * * *' ||
            triggeredCron === '0,30 * * * *' ||
            triggeredCron.startsWith('*/30 ') ||
            triggeredCron.startsWith('0,30 ')
        ) {
            return true;
        }
    }

    // 3. 毎日 JST 07:00 (UTC 22:00) のあらゆる表現を同一視
    if (job.id === 'daily-post') {
        if (
            triggeredCron === '0 22 * * *' ||
            triggeredCron === '17 22 * * *' ||
            triggeredCron.includes('22 * *')
        ) {
            return true;
        }
    }

    // 4. 時刻ベースの評価（分単位の若干のズレを許容）
    const utcMin = now.getUTCMinutes();
    const utcHour = now.getUTCHours();

    if (job.id === 'sns-monitor') {
        // 0分付近 (58〜02分) または 30分付近 (28〜32分)
        if ((utcMin >= 58 || utcMin <= 2) || (utcMin >= 28 && utcMin <= 32)) {
            return true;
        }
    }

    if (job.id === 'daily-post') {
        // UTC 22:00（JST 07:00）付近
        if ((utcHour === 22 && utcMin <= 5) || (utcHour === 21 && utcMin >= 58)) {
            return true;
        }
    }

    return matchesCron(job.cron, now);
}

// ==============================================================================
// 5. Cloudflare Worker メインエクスポート
// ==============================================================================
export default {
    /**
     * 定期実行トリガー (Cloudflare Cron Triggers)
     */
    async scheduled(event, env, ctx) {
        const now = new Date();
        const triggeredCron = (event.cron || '').trim();
        console.log(`[SCHEDULED] Cron Trigger fired at ${now.toISOString()} with cron: "${triggeredCron}"`);

        // 実行すべきジョブを抽出
        let jobsToRun = SCHEDULED_JOBS.filter(job => isJobDue(job, triggeredCron, now));

        // フェイルセーフ: 万が一cron表現や時刻がズレて該当が0件でも、Cronが起動された以上は適切なジョブを実行
        if (jobsToRun.length === 0) {
            const utcHour = now.getUTCHours();
            const utcMin = now.getUTCMinutes();
            console.warn(`[SCHEDULED WARN] 厳密マッチなし。フェイルセーフ判定を行います (hour: ${utcHour}, min: ${utcMin})`);

            if (utcHour === 22 || (utcHour === 21 && utcMin >= 50)) {
                // 朝の自動ポスト時間帯
                const dailyJob = SCHEDULED_JOBS.find(j => j.id === 'daily-post');
                if (dailyJob) jobsToRun = [dailyJob];
            } else {
                // それ以外の定期実行はSNS巡回
                const snsJob = SCHEDULED_JOBS.find(j => j.id === 'sns-monitor');
                if (snsJob) jobsToRun = [snsJob];
            }
        }

        const results = [];
        for (const job of jobsToRun) {
            const startTime = Date.now();
            try {
                console.log(`[JOB START] ジョブ "${job.name}" (${job.id}) を実行中... イベント: ${job.eventType}`);
                const res = await dispatchGitHubAction(env, job, job.defaultPayload);
                const durationMs = Date.now() - startTime;
                
                recordExecution({
                    type: 'scheduled',
                    jobId: job.id,
                    jobName: job.name,
                    cron: triggeredCron || job.cron,
                    success: true,
                    durationMs,
                    result: res
                });

                results.push({ id: job.id, success: true, res });
                console.log(`[JOB SUCCESS] ジョブ "${job.name}" 完了 (${durationMs}ms)`);
            } catch (err) {
                const durationMs = Date.now() - startTime;
                console.error(`[JOB ERROR] ジョブ "${job.name}" 失敗:`, err.message);
                
                recordExecution({
                    type: 'scheduled',
                    jobId: job.id,
                    jobName: job.name,
                    cron: triggeredCron || job.cron,
                    success: false,
                    durationMs,
                    error: err.message
                });

                results.push({ id: job.id, success: false, error: err.message });
            }
        }

        return results;
    },

    /**
     * HTTPリクエストハンドラー (手動トリガー・状態確認・履歴ダッシュボード)
     */
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

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

        // 1. ヘルスチェック & 実行履歴ダッシュボード表示
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
                })),
                recentExecutions: executionHistory,
                quickTestLinks: {
                    snsMonitor: `${url.origin}/trigger/sns-monitor`,
                    dailyPost: `${url.origin}/trigger/daily-post`
                }
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

            if (env.ADMIN_SECRET) {
                const authHeader = request.headers.get('Authorization') || '';
                const queryToken = url.searchParams.get('token');
                const provided = authHeader.replace(/^Bearer\s+/i, '').trim() || queryToken;
                if (provided !== env.ADMIN_SECRET) {
                    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), { status: 401, headers: corsHeaders });
                }
            }

            const startTime = Date.now();
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
                const result = await dispatchGitHubAction(env, job, customPayload);
                const durationMs = Date.now() - startTime;

                recordExecution({
                    type: 'manual',
                    jobId: job.id,
                    jobName: job.name,
                    success: true,
                    durationMs,
                    result
                });

                return new Response(JSON.stringify({
                    success: true,
                    message: `ジョブ "${job.name}" をトリガーしました`,
                    durationMs,
                    result
                }, null, 2), { headers: corsHeaders });
            } catch (err) {
                const durationMs = Date.now() - startTime;

                recordExecution({
                    type: 'manual',
                    jobId: job.id,
                    jobName: job.name,
                    success: false,
                    durationMs,
                    error: err.message
                });

                return new Response(JSON.stringify({
                    success: false,
                    durationMs,
                    error: err.message
                }), { status: 500, headers: corsHeaders });
            }
        }

        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
    }
};
