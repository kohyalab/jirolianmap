/**
 * analyze_posts.js
 * 
 * Google Gemini 1.5 Flash (マルチモーダル) を使用して、
 * ラーメン二郎各店のSNS投稿（テキストおよび添付画像）から
 * 臨時休業・営業時間変更・特別営業スケジュールを自動解析・構造化抽出するモジュール。
 */

const fs = require('fs');
const path = require('path');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

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

    const postedDateObj = postData.postedAt ? new Date(postData.postedAt) : new Date();
    const todayStr = postedDateObj.toISOString().split('T')[0];
    const dayOfWeekStr = ['日', '月', '火', '水', '木', '金', '土'][postedDateObj.getDay()];

    const systemPrompt = `
あなたは全国の「ラーメン二郎」直系店舗の営業情報を専門に監視・判定するエキスパートAIです。
店舗の公式SNS（X / Instagram）の投稿テキスト、および添付された画像（店頭の手書き貼り紙、ホワイトボード、カレンダー等）を解析し、
「臨時休業」「営業時間変更」「臨時営業」の有無と、具体的な日程・時間を正確に抽出してください。

【基準日情報】
・投稿日時: ${postData.postedAt || '不明'}
・投稿日（今日）: ${todayStr} (${dayOfWeekStr}曜日)
・対象店舗: ${postData.shopName} (ID: ${postData.shopId})

【二郎特有の表現とルール】
1. 日付表現の解釈:
   - 「本日」「今日」＝ ${todayStr}
   - 「明日」＝ 翌日
   - 「○日(○)」＝ 今月または翌月の該当月日を西暦YYYY-MM-DD形式に変換。
   - 「カレンダー」の画像がある場合、〇印（営業）、✕印や斜線（休業）、手書きの注釈を読み取ること。
2. 営業状態の分類:
   - "temporary_closure" (臨時休業): 終日休業、または昼・夜の部どちらかの休業。
     - 例: 「本日夜の部お休み」「助手不在のため休業」「材料切れ終了」
   - "special_open" (臨時営業): 通常定休日の曜日に特別に営業する、または祝日営業。
     - 例: 「祝日ですが昼のみやります」「臨時営業します」
   - "temporary_hours" (営業時間変更): 通常と異なる開店・閉店時間。
     - 例: 「本日18時〜20時営業」「14時閉店」
3. 通常営業や関係のない雑談の場合:
   - hasScheduleChange を false にし、changes を空配列にする。
   - 「本日も通常通り営業します」「おはようございます」「限定トッピングあります」等は通常営業のため false。
4. 時間の表現:
   - 小数点表記（例: 11:30＝11.5, 14:00＝14, 17:30＝17.5, 21:00＝21）で [[start, end]] 形式の配列にする。
   - 終日休業の場合は hours を空配列 [] にする。

【出力フォーマット (JSON)】
必ず以下のJSONスキーマに従って出力してください（Markdownのコードブロックではなく純粋なJSON文字列で返すこと）:
{
  "hasScheduleChange": boolean, // 臨時休業・時間変更・臨時営業がある場合 true
  "summary": string, // 管理者向けの要約（例: "9/21(月) 助手不在のため夜の部休業"）
  "changes": [
    {
      "type": "temporary_closure" | "special_open" | "temporary_hours",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "hours": [[number, number]], // 例: [[11, 14.5]]。終日休業は []
      "reason": string, // 理由・備考（例: "助手不在", "材料切れ", "祝日昼営業"）
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

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
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

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error (${response.status}): ${errText}`);
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

