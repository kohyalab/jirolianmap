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
    const dayNames = ['月曜', '火曜', '水曜', '木曜', '金曜', '土曜', '日曜'];
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
   - 投稿日時はすべて【日本標準時（JST）】です。UTC（協定世界時・9時間前）と誤認しては絶対にいけません。
2. 推測での変更提案の厳禁（具体的な時刻記載がない場合は変更提案しない）:
   - 「かなり早めの閉店」「早めの閉店になりそう」「材料なくなり次第終了」「仕込みの関係で早仕舞い」「売り切れ次第終了」など、具体的な営業終了時刻が記載されていない抽象的な表現の場合、営業終了時刻を勝手に推測して変更提案を作らないでください。具体的な時刻が指定されていない場合は必ず hasScheduleChange: false としてください。
3. 投稿時刻以前の過去の営業シフト・および言及のないシフトの改変厳禁:
   - 投稿時刻より前に既に終了している過去の営業シフト（例: 14:50投稿における昼の部）について、投稿文に明示的な変更の言及がない限り、絶対に修正を加えないでください。
   - 投稿文で言及されていないシフト（例: 夜の部の案内のみで昼の部に言及がない場合）は、店舗の通常登録営業時間の数値をそのまま維持してください（例: 札幌店の昼が10:30〜14:00の場合、夜の案内投稿で昼を勝手に11:00〜14:00に変更しては絶対にいけません）。
4. 通常営業・日常投稿・限定メニュー時間帯・テイクアウト営業の除外（hasScheduleChange: false）:
   - 投稿文に記載された営業時間が、対象曜日の通常登録営業時間と同一である場合、営業時間の変更ではないため必ず hasScheduleChange: false としてください。
   - 【最重要・限定メニュー時間帯の混同禁止】「19日(木)通常営業です🍜 12:30〜14:00、17:00〜18:30『塩汁なし(醤油ベース)』対応します」のように、店舗の営業時間自体は「通常営業」であり、記載された時間帯が【限定メニューや特定トッピングの提供時間帯】である場合は、営業時間の変更ではないため必ず hasScheduleChange: false, changes: [] としてください。
   - 【最重要・テイクアウト営業の除外】「テイクアウト販売のみの営業」「お持ち帰りブタ・ラーメンセットの販売」などのテイクアウト営業は原則反映対象外です。テイクアウト販売の時間帯を通常の店内営業時間として登録しないでください（店内営業が明確に休業・短縮される場合のみ、店内営業分の変更として扱うこと）。
   - 【最重要】「本日も通常通り営業します」「仕込み中です」「限定トッピングあります」「切り落とし・崩れ売り切れました」「列が切れたのでどうぞ」等の日常投稿・売り切れ報告は、**絶対に休業や時間変更と判定せず、必ず hasScheduleChange: false, changes: []** としてください。
5. 日付・期間表現の解釈:
   - 「本日」「今日」＝ ${todayStr}
   - 「明日」＝ 翌日、「明後日」＝ 翌々日
   - 「○日(○)」＝ 今月または翌月の該当月日を西暦YYYY-MM-DD形式に変換。
   - カレンダー画像がある場合、〇印（営業）、✕印や斜線（休業）、手書きの注釈を正確に読み取ること。
6. 昼の部・夜の部、および片側休業の厳格な解釈:
   - 「昼の部」「昼」＝ 店舗の通常営業のうち前半側（1部目）。
   - 「夜の部」「夜」＝ 店舗の通常営業のうち後半側（2部目）。
   - 「夜の部お休み」「夜はお休み」等＝昼の部は通常営業で夜の部のみ休業を意味するため、hours には前半の通常営業時間（例: [[11, 14.5]]）を設定し、type は "temporary_hours" としてください（終日休業と誤判定しないこと）。
   - 「昼のみ」「昼営業のみ」＝ 前半の通常営業時間のみ営業（夜休業）。
   - 「夜のみ」「夜営業のみ」＝ 後半の通常営業時間のみ営業（昼休業）。
7. 早仕舞い・リアルタイム営業終了アナウンスの厳格な線引き:
   - 【反映不要】「只今並びの方で終了」「お並びのお客様までで営業終了」「宣告」「麺切れ終了」「売り切れ終了」「本日分終了」「昼の部は終了しました」など、その場でのリアルタイム終了告知は**一切反映不要**です。必ず hasScheduleChange: false, changes: [] としてください（ただし、同じ投稿内に「なお、明後日は臨時休業します」等の別日の予定が含まれる場合は、その別日の予定のみ抽出すること）。
   - 【反映対象】「本日、都合により14時過ぎの早閉まいといたします」「都合により20時くらいで営業終了致します」など、**具体的な営業終了時刻が明記された早仕舞い告知**は、type: "temporary_hours" として正確に抽出してください。
8. 時間の数値化:
   - 小数点表記（例: 11:30＝11.5, 13:45＝13.75, 14:00＝14, 17:30＝17.5, 21:00＝21）で [[start, end], [start, end]] 形式の配列にする。
   - 終日休業の場合は hours を空配列 [] にする。
9. 複数日程・週間予定フォーマットの網羅抽出:
   - 1つの投稿に複数の日付の変更が含まれる場合は、変更がある日付ごとに【別々の要素として changes 配列にすべて漏れなく網羅】してください。
   - 【週間予定の展開例（環七新新代田店等）】日曜（例: 2026年11月22日(日)）に「月 〇 火 〇 水 お休み 木 お休み 金 〇(15:00くらい) 土 〇 日 〇 11:00〜16:00くらい」と投稿された場合、投稿翌日の月曜（11/23）〜日曜（11/29）の7日分について、〇＝基本時間 [[11, 16]]、〇(15:00くらい)＝短縮時間 [[11, 15]]、お休み＝休業 [] として各日ごとに正確に展開してください。
10. 理由（reason）の抽出ルール:
   - reason には営業時間が変更・休業となる【原因・理由（例: 台風接近のため、設備点検のため、店主急病のため、祝日特別営業のため など）】のみを記載してください。
   - 「昼のみ営業」「夜休業」「14時閉店」等の【変更内容】は reason に記載しないでください。
   - 投稿テキストや画像から原因・理由がわかる場合のみ記載し、不明・記載がない場合は必ず空文字 ""（空欄）としてください。
11. 通常営業の変更（定休日の変更、通常営業時間の恒久的な変更、祝日営業設定）の抽出:
   - 単発の臨時休業/臨時営業だけでなく、「○月より定休日を毎週○曜日に変更します」「平日の営業時間を変更します」「祝日は今後一律○時〜○時の営業となります」といった通常営業ルールの変更も検出してください。
   - この場合、type は "regular_schedule_change" とし、hasScheduleChange: true としてください。
   - 変更後の通常営業時間を hours に設定し、対象の曜日（0:月, 1:火, 2:水, 3:木, 4:金, 5:土, 6:日、祝日は 7）を daysOfWeek: number[] として含めてください。
12. 確信度（confidence）の厳格な採点基準（自動反映の判定に使用）:
   - 0.90〜1.00: 対象日（複数日・画像カレンダー含む）と、休業または具体的な営業時間（昼のみ・時刻明記の早仕舞い含む）が明確に読み取れ、推測や曖昧さが一切ない場合のみ設定すること。
   - 0.85以下: 画像の文字が不鮮明、対象日や時間帯に推測が混じる、日常投稿や限定メニュー案内・テイクアウト案内と紛らわしい場合は、必ず 0.85 以下に設定すること（安易に 1.0 を付けないこと）。

【出力フォーマット (JSON)】
必ず以下のJSONスキーマに従って出力してください（Markdownのコードブロックではなく純粋なJSON文字列で返すこと）:
{
  "hasScheduleChange": boolean, // 臨時休業・時間変更・臨時営業・通常営業変更がある場合 true
  "summary": string, // 管理者向けの要約（例: "9/21(月) 昼のみ営業、9/22(火) 終日臨時休業"、または "11月より水曜定休に変更"）
  "changes": [
    {
      "type": "temporary_closure" | "special_open" | "temporary_hours" | "regular_schedule_change",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "hours": [[number, number]], // 例: [[11, 14.5]]。定休日・終日休業は []
      "daysOfWeek": [number], // regular_schedule_change の場合に対象曜日（0:月〜6:日, 7:祝日）。臨時営業変更時は省略可
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


