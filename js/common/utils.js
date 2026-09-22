/**
 * JiroCommonUtils - 共通ユーティリティ関数群
 */
(function (global) {
    'use strict';

    const JiroUtils = {
        /**
         * ひらがなをカタカナに変換
         */
        hiraganaToKatakana(str) {
            if (!str) return '';
            return str.replace(/[\u3041-\u3096]/g, function (match) {
                return String.fromCharCode(match.charCodeAt(0) + 0x60);
            });
        },

        /**
         * 全角英数字記号・スペースを半角に正規化
         */
        toHalfWidth(str) {
            if (!str) return '';
            return str.replace(/[！-～]/g, function (s) {
                return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
            }).replace(/　/g, ' ').trim();
        },

        /**
         * 日付文字列（YYYY, YYYY-MM, YYYY-MM-DD）を比較用の YYYY-MM-DD に正規化
         */
        parseNormalizedDateStr(dateStr) {
            if (!dateStr) return null;
            const str = String(dateStr).trim();
            const parts = str.split('-');

            if (parts.length === 1 && parts[0].length === 4) {
                const year = parseInt(parts[0], 10);
                return `${year}-12-31`;
            }
            if (parts.length === 2) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10);
                const lastDay = new Date(year, month, 0).getDate();
                const mStr = String(month).padStart(2, '0');
                const dStr = String(lastDay).padStart(2, '0');
                return `${year}-${mStr}-${dStr}`;
            }
            return str;
        },

        /**
         * Dateオブジェクトからローカル日付キー (YYYY-MM-DD) を取得
         */
        getLocalDateKey(date = new Date()) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        },

        /**
         * JST基準の YYYY-MM-DD 文字列を取得
         */
        getJSTDateString(date = new Date()) {
            const jstOffset = 9 * 60;
            const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
            const jstDate = new Date(utc + (jstOffset * 60000));
            const y = jstDate.getFullYear();
            const m = String(jstDate.getMonth() + 1).padStart(2, '0');
            const d = String(jstDate.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        },

        /**
         * 開店日の表示用テキストを整形
         */
        formatOpenedDateText(openedAt) {
            if (!openedAt) return '';
            const parts = String(openedAt).trim().split('-');
            if (parts.length === 1) return `${parts[0]}開店`;
            if (parts.length === 2) return `${parts[0]}/${parseInt(parts[1], 10)}開店`;
            if (parts.length === 3) return `${parts[0]}/${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}開店`;
            return `${openedAt}開店`;
        },

        /**
         * 小数点時間 (e.g. 11.5) を "11:30" 形式に変換
         */
        formatTime(hourFloat) {
            if (hourFloat === null || hourFloat === undefined || isNaN(hourFloat)) return '';
            const h = Math.floor(hourFloat);
            const m = Math.round((hourFloat - h) * 60);
            return `${h}:${m.toString().padStart(2, '0')}`;
        },

        /**
         * formatTime のエイリアス
         */
        floatToTime(hourFloat) {
            return this.formatTime(hourFloat);
        },

        /**
         * "11:30" 形式の文字列を小数時間 (11.5) に変換
         */
        timeToFloat(timeStr) {
            if (!timeStr) return 0;
            const parts = timeStr.trim().split(':');
            const h = parseInt(parts[0], 10) || 0;
            const m = parseInt(parts[1], 10) || 0;
            return h + (m / 60);
        },

        /**
         * 2点間の緯度経度から距離 (km) を計算 (ヒュベニ/球面三角法)
         */
        calculateDistance(lat1, lon1, lat2, lon2) {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
            return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        },

        /**
         * 距離 (km) の表示用テキスト整形
         */
        formatDistance(km) {
            if (km === null || km === undefined || isNaN(km)) return '';
            return `約 ${km < 1 ? km.toFixed(2) : km.toFixed(1)}km`;
        },

        /**
         * 住所テキストのクレンジング（全角英数記号の半角化、ハイフン統一）
         */
        cleanAddress(str) {
            if (!str) return '';
            let cleaned = this.toHalfWidth(str);
            cleaned = cleaned.replace(/[ー―‐–—]/g, '-');
            return cleaned.trim();
        },

        /**
         * フリガナの正規化（全角カタカナ化、長音等）
         */
        normalizeFurigana(str) {
            if (!str) return '';
            let katakana = this.hiraganaToKatakana(str);
            katakana = katakana.replace(/[\uff61-\uff9f]/g, function (m) {
                const map = {
                    'ｱ':'ア','ｲ':'イ','ｳ':'ウ','ｴ':'エ','ｵ':'オ',
                    'ｶ':'カ','ｷ':'キ','ｸ':'ク','ｹ':'ケ','ｺ':'コ',
                    'ｻ':'サ','ｼ':'シ','ｽ':'ス','ｾ':'セ','ｿ':'ソ',
                    'ﾀ':'タ','ﾁ':'チ','ﾂ':'ツ','ﾃ':'テ','ﾄ':'ト',
                    'ﾅ':'ナ','ﾆ':'ニ','ﾇ':'ヌ','ﾈ':'ネ','ﾉ':'ノ',
                    'ﾊ':'ハ','ﾋ':'ヒ','ﾌ':'フ','ﾍ':'ヘ','ﾎ':'ホ',
                    'ﾏ':'マ','ﾐ':'ミ','ﾑ':'ム','ﾒ':'メ','ﾓ':'モ',
                    'ﾔ':'ヤ','ﾕ':'ユ','ﾖ':'ヨ',
                    'ﾗ':'ラ','ﾘ':'リ','ﾙ':'ル','ﾚ':'レ','ﾛ':'ロ',
                    'ﾜ':'ワ','ｦ':'ヲ','ﾝ':'ン',
                    'ｧ':'ァ','ｨ':'ィ','ｩ':'ゥ','ｪ':'ェ','ｫ':'ォ',
                    'ｬ':'ャ','ｭ':'ュ','ｮ':'ョ','ｯ':'ッ','ｰ':'ー'
                };
                return map[m] || m;
            });
            return katakana.trim();
        },

        /**
         * SNSアカウントIDの正規化 (@の除去、小文字化等)
         */
        normalizeAccountID(str) {
            if (!str) return '';
            let clean = this.toHalfWidth(str);
            clean = clean.replace(/^@+/, '');
            clean = clean.replace(/^https?:\/\/(twitter|x|instagram)\.com\//i, '');
            clean = clean.split('/')[0].split('?')[0];
            return clean.trim();
        }
    };

    // グローバルおよびCommonJSへのエクスポート
    global.JiroUtils = JiroUtils;

    // 後方互換性用（既存のトップレベル関数呼び出しに対応）
    global.hiraganaToKatakana = JiroUtils.hiraganaToKatakana;
    global.parseNormalizedDateStr = JiroUtils.parseNormalizedDateStr;
    global.getLocalDateKey = JiroUtils.getLocalDateKey;
    global.formatOpenedDateText = JiroUtils.formatOpenedDateText;
    global.formatTime = JiroUtils.formatTime;
    global.floatToTime = JiroUtils.floatToTime;
    global.timeToFloat = JiroUtils.timeToFloat;
    global.calculateDistance = JiroUtils.calculateDistance;
    global.formatDistance = JiroUtils.formatDistance;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = JiroUtils;
    }
})(typeof window !== 'undefined' ? window : globalThis);

