/**
 * analyze_posts.js
 * 
 * Google Gemini 1.5 Flash (マルチモーダル) を使用して、
 * ラーメン二郎各店のSNS投稿（テキストおよび添付画像）から
 * 臨時休業・営業時間変更・特別営業スケジュールを自動解析・構造化抽出するモジュール。
 */

const fs = require('fs');
const path = require('path');

let cachedModelName = null;

/**
 * APIキーで利用可能な最適なGeminiモデルを自動判定
 */
async function resolveGeminiModel(apiKey) {
    if (process.env.GEMINI_MODEL) {
        return process.env.GEMINI_MODEL;
    }
    if (cachedModelName) {
        return cachedModelName;
    }

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (res.ok) {
            const data = await res.json();
            const models = data?.models || [];
            
            // generateContentをサポートしているモデルをフィルタ
            const contentModels = models.filter(m => {
                const methods = m.supportedGenerationMethods || [];
                return methods.includes('generateContent');
            }).map(m => m.name.replace(/^models\//, ''));

            console.log(`ℹ️ 利用可能なGeminiモデル候補: ${contentModels.slice(0, 5).join(', ')}...`);

            // 優先度順に回数が稼げる軽量（Lite）モデルを最優先で検索（RPD 500 / RPM 15）
            const priorityList = [
                /^gemini-3\.1-flash-lite/,
                /^gemini-3\.5-flash-lite/,
                /^gemini-3-flash-lite/,
                /^gemini-2\.5-flash-lite/,
                /^gemini-2-flash-lite/,
                /^gemini-3\.1-flash/,
                /^gemini-3\.5-flash/,
                /^gemini-2\.5-flash/,
                /^gemini-3\.6-flash/,
                /^gemini-3-flash/
            ];

            for (const regex of priorityList) {
                const found = contentModels.find(name => regex.test(name));
                if (found) {
                    console.log(`🤖 使用するGeminiモデル: ${found}`);
                    cachedModelName = found;
                    return found;
                }
            }

            if (contentModels.length > 0) {
                cachedModelName = contentModels[0];
                return contentModels[0];
            }
        }
    } catch (e) {
        console.warn('[WARN] Failed to list available Gemini models:', e.message);
    }

    // フォールバック（最もクォータの大きいFlash Liteモデル: RPD 500 / RPM 15）
    cachedModelName = 'gemini-3.1-flash-lite';
    return cachedModelName;
}

/**
 * 画像URLまたはローカルファイルパスをBase64パートに変換
 */
async function fileToGenerativePart(imagePathOrUrl) {
    try {
        let buffer;
        let mimeType = 'image/jpeg';

        if (imagePathOrUrl.startsWith('http://') || imagePathOrUrl.startsWith('https://')) {
            const res = await fetch(imagePathOrUrl);
            if (!res.ok) throw new Error(`Failed to fetch image (${res.status}): ${imagePathOrUrl}`);
            const arrayBuffer = await res.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            const contentType = res.headers.get('content-type');
            if (contentType) mimeType = contentType.split(';')[0].trim();
        } else {
            buffer = fs.readFileSync(imagePathOrUrl);
            if (imagePathOrUrl.endsWith('.png')) mimeType = 'image/png';
            if (imagePathOrUrl.endsWith('.webp')) mimeType = 'image/webp';
        }

        return {
            inlineData: {
                data: buffer.toString('base64'),
                mimeType: mimeType
            }
        };
    } catch (err) {
        console.warn(`[WARN] Could not load image for Gemini: ${imagePathOrUrl}`, err.message);
        return null;
    }
}

/**
 * Gemini 1.5 Flash による投稿解析（テキスト ＋ 画像マルチモーダル）
 * 
 * @param {Object} postData
 * @param {string} postData.shopId
 * @param {string} postData.shopName
 * @param {string} postData.postText
 * @param {string} postData.postedAt (ISO 8601)
 * @param {string[]} postData.mediaUrls
 * @param {string} [apiKey]
 * @returns {Promise<Object>}
 */
async function analyzePostWithGemini(postData, apiKey = process.env.GEMINI_API_KEY) {
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set in environment variables.');
    }

    // 日本標準時 (JST, UTC+9) での年・月・日・時・分・曜日を厳密に計算
    const postedDateObj = postData.postedAt ? new Date(postData.postedAt) : new Date();
    const jstDate = new Date(postedDateObj.getTime() + (9 * 60 * 60 * 1000));
    const jstYear = jstDate.getUTCFullYear();
    const jstMonth = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
    const jstDay = String(jstDate.getUTCDate()).padStart(2, '0');
    const jstHours = String(jstDate.getUTCHours()).padStart(2, '0');
    const jstMinutes = String(jstDate.getUTCMinutes()).padStart(2, '0');
    
    const todayStr = `${jstYear}-${jstMonth}-${jstDay}`;
    const jstFullStr = `${todayStr} ${jstHours}:${jstMinutes}`;
    const dayOfWeekStr = ['日', '月', '火', '水', '木', '金', '土'][jstDate.getUTCDay()];

    // 管理者学習ルール・ガイドラインおよび人間判定フィードバックの読み込み
    let guidelinesText = '';
    const guidelinesPath = path.join(__dirname, '..', 'data', 'ai_guidelines.json');
    if (fs.existsSync(guidelinesPath)) {
        try {
            const guidelinesData = JSON.parse(fs.readFileSync(guidelinesPath, 'utf8'));
            const rules = (guidelinesData.generalRules || []).map(r => `・【${r.title}】: ${r.rule}`).join('\n');
            const shopRules = (guidelinesData.shopSpecificRules && guidelinesData.shopSpecificRules[postData.shopId]) ? `・【店舗固有ルール】: ${guidelinesData.shopSpecificRules[postData.shopId]}` : '';

            // 人間判定の学習履歴（直近15件）を教師データとして動的注入
            let feedbackText = '';
            if (Array.isArray(guidelinesData.learnedFeedback) && guidelinesData.learnedFeedback.length > 0) {
                const sampleFeedbacks = guidelinesData.learnedFeedback.slice(0, 15).map(f => {
                    const actionStr = f.humanAction === 'applied' ? '反映(要変更)' : 'スキップ(反映不要)';
                    const detail = f.finalDetails ? ` (反映内容: ${f.finalDetails.startDate} ${f.finalDetails.hours ? JSON.stringify(f.finalDetails.hours) : '休業'} 理由:${f.finalDetails.reason || 'なし'})` : '';
                    return `  - 投稿: "${f.postText}" => 人間判定: ${actionStr}${detail}`;
                }).join('\n');
                feedbackText = `\n【人間による過去の判定・反映学習事例（これらを基準として判定してください）】\n${sampleFeedbacks}\n`;
            }

            guidelinesText = `\n【管理者学習ルール・判定ガイドライン】\n${rules}\n${shopRules}\n${feedbackText}\n`;
        } catch (e) {
            console.warn('[WARN] Failed to load ai_guidelines.json:', e.message);
        }
    }

    // 店舗の通常営業時間および登録済み臨時スケジュールのテキスト化
    const shiftsByDay = postData.shiftsByDay || {};
    const dayNames = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];
    const normalShiftsText = dayNames.map((dName, idx) => {
        const shifts = shiftsByDay[idx] || [];
        if (shifts.length === 0) return `${dName}: 定休日`;
        const shiftStrs = shifts.map(s => `${s[0]}:00〜${s[1]}:00`.replace(/\.5:00/g, ':30'));
        return `${dName}: ${shiftStrs.join(', ')}`;
    }).join(' / ');

    const registeredTemps = (postData.temporary || []).slice(-5).map(t => {
        const hStr = (t.hours && t.hours.length > 0) ? JSON.stringify(t.hours) : '終日休業';
        return `${t.startDate}${t.endDate && t.endDate !== t.startDate ? '〜' + t.endDate : ''}: ${hStr}`;
    }).join('; ');

    const systemPrompt = `
あなたは全国の「ラーメン二郎」直系店舗の営業情報を専門に監視・判定するエキスパートAIです。
店舗の公式SNS（X / Instagram）の投稿テキスト、および添付された画像（店頭の手書き貼り紙、ホワイトボード、カレンダー等）を解析し、
「臨時休業」「営業時間変更」「臨時営業」の有無と、具体的な日程・時間を正確に抽出してください。

【基準日・店舗情報】
・投稿日時（日本時間 JST）: ${jstFullStr} (${dayOfWeekStr}曜日)
・投稿日（基準日・日本時間）: ${todayStr}
・対象店舗: ${postData.shopName} (ID: ${postData.shopId})
・店舗の通常営業時間 (shiftsByDay): ${normalShiftsText}
・現在登録済みの臨時スケジュール (temporary): ${registeredTemps || 'なし'}
${guidelinesText}
【最重要判定ルール】
1. 時間の解釈と日本時間（JST）の厳守:
   - 投稿日時はすべて【日本標準時（JST）】です。
   - 「只今並びの方で終了」「昼の営業を終了」などの早仕舞い告知で、投稿時刻を営業終了時刻として採用する場合は、必ず上記「投稿日時（日本時間 JST）」の時刻（例: ${jstHours}:${jstMinutes}）を基準としてください。UTC（協定世界時・9時間前）と誤認しては絶対にいけません（例: 投稿が13:36の場合、終了時刻は13:36または13:30等であり、4:36ではありません）。
2. 推測での変更提案の禁止（記載がない場合は既存の営業時間どおりが基本）:
   - 投稿内容に明確な記載や変更の指示がない限り、勝手な推測や憶測で営業時間を変更しないでください。
   - 投稿内容から変更後の営業時間が具体的に読み取れない場合は、無理に変更提案を行わず hasScheduleChange: false としてください。
3. 通常営業や日常投稿の場合:
   - 「本日も通常通り営業します」「おはようございます」「仕込み中です」「限定トッピングあります」等は通常営業のため hasScheduleChange: false としてください。
4. 日付・期間表現の解釈:
   - 「本日」「今日」＝ ${todayStr}
   - 「明日」＝ 翌日、「明後日」＝ 翌々日
   - 「○日(○)」＝ 今月または翌月の該当月日を西暦YYYY-MM-DD形式に変換。
   - カレンダー画像がある場合、〇印（営業）、✕印や斜線（休業）、手書きの注釈を正確に読み取ること。
5. 昼の部・夜の部、および片側休業の厳格な解釈:
   - 「昼の部」「昼」＝ 店舗の通常営業のうち前半側（1部目）。
   - 「夜の部」「夜」＝ 店舗の通常営業のうち後半側（2部目）。
   - 「夜の部お休み」「夜はお休み」等＝昼の部は通常営業で夜の部のみ休業を意味するため、hours には前半の通常営業時間（例: [[11, 14.5]]）を設定し、type は "temporary_hours" としてください（終日休業と誤判定しないこと）。
   - 「昼のみ」「昼営業のみ」＝ 前半の通常営業時間のみ営業（夜休業）。
   - 「夜のみ」「夜営業のみ」＝ 後半の通常営業時間のみ営業（昼休業）。
6. リアルタイム営業終了アナウンス（早仕舞い）の終了時刻反映:
   - 「只今並びの方で終了」「宣告」「麺切れ終了」「本日分終了」等の当日終了告知は、投稿時刻（JST）を終了時刻として hours に反映してください。
   - 【最重要】2部営業のうち1部目（昼営業）の終了投稿は『昼営業のみの終了時刻変更』です。夜営業は予定通り実施されるのが基本のため、夜営業まで終了と誤判定せず、夜営業の時間は維持してください。
7. 時間の数値化:
   - 小数点表記（例: 11:30＝11.5, 13:36＝13.6, 13:45＝13.75, 14:00＝14, 17:30＝17.5, 21:00＝21）で [[start, end], [start, end]] 形式の配列にする。
   - 終日休業の場合は hours を空配列 [] にする。
8. 複数日程・複数変更の網羅抽出:
   - 1つの投稿に複数の日付の変更が含まれる場合は、変更がある日付ごとに【別々の要素として changes 配列にすべて漏れなく網羅】してください。
9. 理由（reason）の抽出ルール:
   - reason には営業時間が変更・休業となる【原因・理由（例: 台風接近のため、設備点検のため、店主急病のため、祝日特別営業のため など）】のみを記載してください。
   - 「昼のみ営業」「夜休業」「14時閉店」等の【変更内容】は reason に記載しないでください。
   - 投稿テキストや画像から原因・理由がわかる場合のみ記載し、不明・記載がない場合は必ず空文字 ""（空欄）としてください。

【出力フォーマット (JSON)】
必ず以下のJSONスキーマに従って出力してください（Markdownのコードブロックではなく純粋なJSON文字列で返すこと）:
{
  "hasScheduleChange": boolean, // 臨時休業・時間変更・臨時営業がある場合 true
  "summary": string, // 管理者向けの要約（例: "9/21(月) 昼のみ営業、9/22(火) 終日臨時休業"）
  "changes": [
    {
      "type": "temporary_closure" | "special_open" | "temporary_hours",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "hours": [[number, number]], // 例: [[11, 14.5]]。終日休業は []
      "reason": string, // 原因・理由（例: "台風接近のため", "設備工事のため", "祝日特別営業"）。変更内容（「昼のみ」等）は書かない。不明な場合は必ず ""（空文字）
      "confidence": number // 0.0〜1.0 の確信度
    }
  ]
}
`;

    const parts = [
        { text: systemPrompt },
        { text: `【解析対象の投稿テキスト】\n${postData.postText || '（テキストなし）'}` }
    ];

    // 添付画像の取得とパート追加（最大3枚）
    if (Array.isArray(postData.mediaUrls) && postData.mediaUrls.length > 0) {
        for (const imgUrl of postData.mediaUrls.slice(0, 3)) {
            const imgPart = await fileToGenerativePart(imgUrl);
            if (imgPart) parts.push(imgPart);
        }
    }

    const primaryModel = await resolveGeminiModel(apiKey);
    const candidateModels = Array.from(new Set([
        primaryModel,
        'gemini-3.1-flash-lite',
        'gemini-3.5-flash-lite',
        'gemini-2.5-flash-lite',
        'gemini-3.6-flash',
        'gemini-2.5-flash'
    ]));

    let response = null;
    let successfulModel = null;
    let lastErrorText = '';

    for (const model of candidateModels) {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // 503 (High demand) や 429 の一時的スパイクに対応するため、モデルごとに最大2回試行
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: parts }],
                        generationConfig: {
                            responseMimeType: 'application/json',
                            temperature: 0.1
                        }
                    })
                });

                if (response.ok) {
                    successfulModel = model;
                    break;
                }

                if (response.status === 503 || response.status === 429) {
                    // 一時的な混雑スパイク: 2.5秒待って再試行
                    console.warn(`[WARN] Model ${model} is experiencing high demand (${response.status}). Waiting 2.5s before retry (attempt ${attempt}/2)...`);
                    await new Promise(r => setTimeout(r, 2500));
                    continue;
                }

                // 404など他のエラーの場合はリトライせず次のモデル候補へ
                lastErrorText = await response.text();
                console.warn(`[WARN] Model ${model} returned ${response.status}. Trying next candidate model...`);
                break;
            } catch (err) {
                lastErrorText = err.message;
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        if (response && response.ok) {
            cachedModelName = successfulModel;
            break;
        }
    }

    if (!response || !response.ok) {
        throw new Error(`Gemini API Error: All model candidates failed. Last error: ${lastErrorText}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
        throw new Error('Gemini returned an empty response.');
    }

    try {
        return JSON.parse(rawText);
    } catch (e) {
        // 万が一バッククォート等が含まれている場合のサニタイズ
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    }
}

module.exports = {
    analyzePostWithGemini
};

