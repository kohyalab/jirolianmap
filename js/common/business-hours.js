/**
 * JiroBusinessHours - ラーメン二郎 営業日時・祝日・シフト計算共通モジュール
 * 依存: js/common/utils.js (JiroUtils)
 */
(function (global) {
    'use strict';

    const Utils = global.JiroUtils || {};

    const JiroBusinessHours = {
        /**
         * 日本の祝日判定 (振替休日・国民の休日・春分秋分対応)
         */
        isJapaneseHoliday(date = new Date()) {
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const dayOfWeek = date.getDay();

            function isBaseHoliday(y, m, d) {
                if (m === 1 && d === 1) return true;
                if (m === 1 && Math.ceil(d / 7) === 2 && new Date(y, 0, d).getDay() === 1) return true;
                if (m === 2 && d === 11) return true;
                if (m === 2 && d === 23) return true;

                const vernalEquinox = Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
                if (m === 3 && d === vernalEquinox) return true;

                if (m === 4 && d === 29) return true;
                if (m === 5 && d === 3) return true;
                if (m === 5 && d === 4) return true;
                if (m === 5 && d === 5) return true;

                if (m === 7 && Math.ceil(d / 7) === 3 && new Date(y, 6, d).getDay() === 1) return true;
                if (m === 8 && d === 11) return true;
                if (m === 9 && Math.ceil(d / 7) === 3 && new Date(y, 8, d).getDay() === 1) return true;

                const autumnalEquinox = Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
                if (m === 9 && d === autumnalEquinox) return true;

                if (m === 10 && Math.ceil(d / 7) === 2 && new Date(y, 9, d).getDay() === 1) return true;
                if (m === 11 && d === 3) return true;
                if (m === 11 && d === 23) return true;

                return false;
            }

            if (isBaseHoliday(year, month, day)) return true;

            // 振替休日判定
            if (dayOfWeek !== 0) {
                for (let offset = 1; offset <= 7; offset++) {
                    const prev = new Date(year, month - 1, day - offset);
                    if (prev.getDay() === 0) {
                        if (isBaseHoliday(prev.getFullYear(), prev.getMonth() + 1, prev.getDate())) {
                            return true;
                        }
                        break;
                    }
                    if (!isBaseHoliday(prev.getFullYear(), prev.getMonth() + 1, prev.getDate())) {
                        break;
                    }
                }
            }

            // 国民の休日判定（祝日と祝日に挟まれた平日）
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                const prev = new Date(year, month - 1, day - 1);
                const next = new Date(year, month - 1, day + 1);
                if (isBaseHoliday(prev.getFullYear(), prev.getMonth() + 1, prev.getDate()) &&
                    isBaseHoliday(next.getFullYear(), next.getMonth() + 1, next.getDate())) {
                    return true;
                }
            }

            return false;
        },

        /**
         * 営業時間表記の正規化 (全角数字や「時半」等の表記揺れを補正)
         */
        normalizeBusinessHours(str, inputElem = null) {
            if (!str || !str.trim()) {
                if (inputElem) { inputElem.classList.remove('error'); inputElem.title = ''; }
                return '';
            }

            let normalized = str
                .replace(/[ \u3000]/g, '')
                .replace(/[０-９：]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
                .replace(/[、/／]/g, ',')
                .replace(/[~～〜ー－]/g, '-');

            normalized = normalized
                .replace(/(\d{1,2})時半/g, '$1:30')
                .replace(/(\d{1,2})時(\d{1,2})分?/g, (m, h, min) => `${h}:${min.padStart(2, '0')}`)
                .replace(/(\d{1,2})時/g, '$1:00');

            normalized = normalized.replace(/\b(\d{2})(\d{2})-(\d{2})(\d{2})\b/g, '$1:$2-$3:$4');
            normalized = normalized.replace(/[^\d:\-,\s]/g, '').trim();

            if (inputElem) {
                const isValid = /^(\d{1,2}:\d{2}-\d{1,2}:\d{2})(,\s*\d{1,2}:\d{2}-\d{1,2}:\d{2})*$/.test(normalized);
                if (!isValid && normalized !== '') {
                    inputElem.classList.add('error');
                    inputElem.title = 'フォーマット違反: 時間表記ルール (HH:MM-HH:MM) に従っていません。';
                } else {
                    inputElem.classList.remove('error');
                    inputElem.title = '';
                }
            }
            return normalized;
        },

        /**
         * シフト文字列 ("11:00-14:30, 17:00-21:00") を [[11, 14.5], [17, 21]] にパース
         */
        parseShiftString(str) {
            const normalized = this.normalizeBusinessHours(str);
            if (!normalized) return [];
            const ranges = normalized.split(',');
            const result = [];
            for (let range of ranges) {
                const parts = range.trim().split('-');
                if (parts.length === 2) {
                    const start = Utils.timeToFloat ? Utils.timeToFloat(parts[0]) : this._timeToFloat(parts[0]);
                    const end = Utils.timeToFloat ? Utils.timeToFloat(parts[1]) : this._timeToFloat(parts[1]);
                    if (start !== null && end !== null && !isNaN(start) && !isNaN(end)) {
                        result.push([start, end]);
                    }
                }
            }
            return result;
        },

        _timeToFloat(timeStr) {
            if (!timeStr) return 0;
            const parts = timeStr.trim().split(':');
            const h = parseInt(parts[0], 10) || 0;
            const m = parseInt(parts[1], 10) || 0;
            return h + (m / 60);
        },

        /**
         * シフト配列 [[11, 14.5], [17, 21]] を文字列にフォーマット
         */
        formatShiftArray(arr) {
            if (!arr || !Array.isArray(arr) || arr.length === 0) return '';
            const fmt = Utils.formatTime || (v => `${Math.floor(v)}:${Math.round((v - Math.floor(v)) * 60).toString().padStart(2, '0')}`);
            return arr.map(([s, e]) => `${fmt(s)}-${fmt(e)}`).join(', ');
        },

        formatShiftList(shifts) {
            if (!Array.isArray(shifts) || shifts.length === 0) return '定休日';
            const fmt = Utils.formatTime || (v => `${Math.floor(v)}:${Math.round((v - Math.floor(v)) * 60).toString().padStart(2, '0')}`);
            return shifts.map(([start, end]) => `${fmt(start)}-${fmt(end)}`).join(', ');
        },

        /**
         * カレンダーやカード用のシフト時間HTMLタグ生成
         */
        formatShiftTimeText(timeStr, mode = false) {
            let hourSize = '0.86rem';
            let minuteSize = '0.52rem';
            let dashSize = '0.54rem';
            if (mode === 'calendar') {
                hourSize = '0.64rem';
                minuteSize = '0.42rem';
                dashSize = '0.44rem';
            } else if (mode === 'today') {
                hourSize = '0.74rem';
                minuteSize = '0.54rem';
                dashSize = '0.56rem';
            } else if (mode === 'compact' || mode === true) {
                hourSize = '0.74rem';
                minuteSize = '0.46rem';
                dashSize = '0.48rem';
            }

            if (!timeStr || timeStr === '休業') return `<span style="font-size:${mode === 'today' ? '0.72rem' : hourSize}; font-weight:normal; letter-spacing:0.2px;">休業</span>`;
            return timeStr.split('-').map(t => {
                const parts = t.trim().split(':');
                if (parts.length === 2) {
                    return `<span style="display:inline-flex; align-items:baseline;"><span style="font-size:${hourSize}; font-weight:normal; font-family:sans-serif; letter-spacing:-0.5px; vertical-align:baseline;">${parts[0]}</span><span style="font-size:${minuteSize}; opacity:0.85; letter-spacing:-0.3px; vertical-align:baseline;">:${parts[1]}</span></span>`;
                }
                return t;
            }).join(`<span style="font-size:${dashSize}; opacity:0.7; margin:0 0.5px; vertical-align:baseline;">-</span>`);
        },

        /**
         * 開店前判定
         */
        isPreOpen(shop, targetDate = new Date()) {
            if (!shop || !shop.openedAt) return false;
            const parseNorm = Utils.parseNormalizedDateStr || (s => s);
            const getLocKey = Utils.getLocalDateKey || (d => d.toISOString().split('T')[0]);
            const normalizedOpenDate = parseNorm(shop.openedAt);
            return normalizedOpenDate > getLocKey(targetDate);
        },

        /**
         * 閉店判定
         */
        isClosedShopExpired(shop, targetDate = new Date()) {
            if (!shop || !shop.closedAt) return false;
            const parseNorm = Utils.parseNormalizedDateStr || (s => s);
            const normalizedCloseDate = parseNorm(shop.closedAt);
            const todayStr = targetDate.toISOString().split('T')[0];

            if (normalizedCloseDate < todayStr) return true;
            if (normalizedCloseDate === todayStr) {
                const currentHour = targetDate.getHours() + (targetDate.getMinutes() / 60);
                const todayShifts = this.getTodayShifts(shop, targetDate);
                if (todayShifts?.length) {
                    return currentHour > Math.max(...todayShifts.map(s => s[1]));
                }
                return currentHour >= 4;
            }
            return false;
        },

        areShiftsEqual(shiftsA, shiftsB) {
            const a = shiftsA || [];
            const b = shiftsB || [];
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
            }
            return true;
        },

        getNthDayOfWeek(year, month, week, dayOfWeek) {
            let count = 0;
            const targetDate = new Date(year, month - 1, 1);
            const lastDate = new Date(year, month, 0).getDate();

            if (week > 0) {
                for (let d = 1; d <= lastDate; d++) {
                    targetDate.setDate(d);
                    if (targetDate.getDay() === dayOfWeek) {
                        count++;
                        if (count === week) return d;
                    }
                }
            } else if (week === -1) {
                let lastMatch = null;
                for (let d = 1; d <= lastDate; d++) {
                    targetDate.setDate(d);
                    if (targetDate.getDay() === dayOfWeek) {
                        lastMatch = d;
                    }
                }
                return lastMatch;
            }
            return null;
        },

        findSpecialShiftEntry(shop, targetDate = new Date()) {
            if (!Array.isArray(shop.specialShifts) || shop.specialShifts.length === 0) return null;
            const year = targetDate.getFullYear();
            const month = targetDate.getMonth() + 1;
            const date = targetDate.getDate();
            const dayOfWeek = targetDate.getDay();

            for (const spec of shop.specialShifts) {
                if (spec.day !== undefined && spec.day !== dayOfWeek) continue;
                const nth = this.getNthDayOfWeek(year, month, spec.week, spec.day);
                if (nth === date) {
                    return spec.hours;
                }
            }
            return null;
        },

        getRegularShiftsByDay(shop, targetDate = new Date()) {
            if (Array.isArray(shop.holidaySpecialShifts)) {
                for (const rule of shop.holidaySpecialShifts) {
                    const offset = rule.targetOffset !== undefined ? rule.targetOffset : 1;
                    const baseDate = new Date(targetDate.getTime());
                    baseDate.setDate(baseDate.getDate() - offset);

                    if (baseDate.getDay() === rule.triggerDay && this.isJapaneseHoliday(baseDate)) {
                        return rule.hours || [];
                    }
                }
            }

            if (this.isJapaneseHoliday(targetDate) && shop.holidayShifts !== null && shop.holidayShifts !== undefined) {
                return shop.holidayShifts;
            }

            const specialShifts = this.findSpecialShiftEntry(shop, targetDate);
            if (specialShifts !== null && specialShifts !== undefined) {
                return specialShifts;
            }

            const mondayBasedDay = (targetDate.getDay() + 6) % 7;
            return shop.shiftsByDay ? shop.shiftsByDay[mondayBasedDay] : null;
        },

        isRedundantTempEntry(shop, tempEntry, targetDate) {
            if (!tempEntry) return false;
            if (tempEntry.endDate === null) return false;

            const regularShifts = this.getRegularShiftsByDay(shop, targetDate);
            return this.areShiftsEqual(tempEntry.hours, regularShifts);
        },

        findTemporaryEntry(shop, targetDate = new Date()) {
            if (!Array.isArray(shop.temporary) || shop.temporary.length === 0) return null;
            const getLocKey = Utils.getLocalDateKey || (d => d.toISOString().split('T')[0]);
            const dateString = getLocKey(targetDate);

            const temp = shop.temporary.find(t => {
                const start = t.startDate || t.date;
                if (!start) return false;

                if (t.endDate === null) {
                    return dateString >= start;
                } else if (t.endDate) {
                    return dateString >= start && dateString <= t.endDate;
                } else {
                    return dateString === start;
                }
            });

            if (!temp) return null;
            if (this.isRedundantTempEntry(shop, temp, targetDate)) {
                return null;
            }

            return temp;
        },

        getTodayShifts(shop, targetDate = new Date()) {
            const tempEntry = this.findTemporaryEntry(shop, targetDate);
            if (tempEntry) return tempEntry.hours;

            return this.getRegularShiftsByDay(shop, targetDate);
        },

        getTemporaryStatus(shop, targetDate = new Date()) {
            const tempEntry = this.findTemporaryEntry(shop, targetDate);
            if (tempEntry) return tempEntry.hours.length === 0 ? '休業' : '営業';
            return null;
        },

        getBusinessStatus(shop, targetDate = new Date()) {
            if (this.isPreOpen(shop, targetDate)) return { type: 'preopen', bgClass: 'bg-preopen', label: 'オープン予定' };
            const tempStatus = this.getTemporaryStatus(shop, targetDate);
            if (tempStatus === '休業') return { type: 'closed', bgClass: 'bg-closed', label: '営業時間外' };

            let currentHour = targetDate.getHours() + (targetDate.getMinutes() / 60);

            // 1. 前日からの跨ぎ営業（例: 25:00終了 ＝ 本日1:00まで営業）をチェック
            const yesterday = new Date(targetDate);
            yesterday.setDate(targetDate.getDate() - 1);
            const yesterdayShifts = this.getTodayShifts(shop, yesterday);
            if (yesterdayShifts?.length) {
                const adjustedHour = currentHour + 24.0;
                for (const [start, end] of yesterdayShifts) {
                    if (end > 24.0 && adjustedHour >= start && adjustedHour <= end) {
                        const isClosingSoon = (end - adjustedHour) <= 1.0;
                        return {
                            type: isClosingSoon ? 'closing-soon' : 'open',
                            bgClass: isClosingSoon ? 'bg-closing-soon' : 'bg-open',
                            isClosingSoon, endTime: end - 24.0, label: isClosingSoon ? 'まもなく終了' : '営業中'
                        };
                    }
                }
            }

            // 2. 当日シフトの判定
            let shifts = this.getTodayShifts(shop, targetDate);
            if (shifts?.length) {
                for (const [start, end] of shifts) {
                    if (currentHour >= start && currentHour <= end) {
                        const isClosingSoon = (end - currentHour) <= 1.0;
                        return {
                            type: isClosingSoon ? 'closing-soon' : 'open',
                            bgClass: isClosingSoon ? 'bg-closing-soon' : 'bg-open',
                            isClosingSoon, endTime: end, label: isClosingSoon ? 'まもなく終了' : '営業中'
                        };
                    }
                }

                const upcomingShift = shifts.find(([start]) => currentHour < start);
                if (upcomingShift) {
                    return {
                        type: 'scheduled',
                        bgClass: 'bg-scheduled',
                        label: '営業開始前',
                        startTime: upcomingShift[0]
                    };
                }
            }

            return { type: 'closed', bgClass: 'bg-closed', label: '営業時間外' };
        },

        getNextShiftTimes(shop, targetDate = new Date()) {
            if (this.isPreOpen(shop)) return { startTime: 99999, endTime: 99999 };
            const now = targetDate;
            const currentHour = now.getHours() + (now.getMinutes() / 60);
            const status = this.getBusinessStatus(shop, now);

            if (status.type === 'open' || status.type === 'closing-soon') {
                return { startTime: currentHour, endTime: status.endTime };
            }

            const todayShifts = this.getTodayShifts(shop, now);
            if (todayShifts?.some(([start]) => currentHour < start)) {
                const nextShift = todayShifts.find(([start]) => currentHour < start);
                return { startTime: nextShift[0], endTime: nextShift[1] };
            }

            for (let offset = 1; offset <= 30; offset++) {
                const checkDate = new Date(now);
                checkDate.setDate(now.getDate() + offset);
                const checkShifts = this.getTodayShifts(shop, checkDate);
                if (checkShifts?.length) {
                    return {
                        startTime: offset * 24 + checkShifts[0][0],
                        endTime: offset * 24 + checkShifts[0][1]
                    };
                }
            }
            return { startTime: 99999, endTime: 99999 };
        },

        getNextOpenScheduleText(shop, targetDate = new Date()) {
            const fmt = Utils.formatTime || (v => `${Math.floor(v)}:${Math.round((v - Math.floor(v)) * 60).toString().padStart(2, '0')}`);

            if (this.isPreOpen(shop)) {
                const openDateStr = shop.openedAt ? shop.openedAt.replace(/-/g, '/') : '';
                return `<span class="next-schedule" title="オープン予定: ${openDateStr}">オープン予定: ${openDateStr}</span>`;
            }
            const now = targetDate;
            const status = this.getBusinessStatus(shop, now);

            let text = '';
            let extraClass = '';

            if (status.type === 'open' || status.type === 'closing-soon') {
                text = `-${fmt(status.endTime)}`;
                extraClass = status.type === 'closing-soon' ? 'is-closing-soon' : 'is-open';
            } else if (status.type === 'scheduled') {
                text = `${fmt(status.startTime)}-`;
                extraClass = 'is-scheduled';
            } else {
                const todayShifts = this.getTodayShifts(shop, now);
                const currentHour = now.getHours() + (now.getMinutes() / 60);
                if (todayShifts?.some(([start]) => currentHour < start)) {
                    const nextStart = todayShifts.find(([start]) => currentHour < start)[0];
                    text = `${fmt(nextStart)}-`;
                } else {
                    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
                    let found = false;
                    for (let offset = 1; offset <= 30; offset++) {
                        const checkDate = new Date(now);
                        checkDate.setDate(now.getDate() + offset);
                        const checkShifts = this.getTodayShifts(shop, checkDate);
                        if (checkShifts?.length) {
                            let dayPrefix = '';
                            if (offset === 1) {
                                dayPrefix = "明日";
                            } else if (offset === 2) {
                                dayPrefix = "明後日";
                            } else {
                                const m = checkDate.getMonth() + 1;
                                const d = checkDate.getDate();
                                const w = dayNames[checkDate.getDay()];
                                dayPrefix = `${m}/${d}(${w})`;
                            }
                            text = `${dayPrefix}${fmt(checkShifts[0][0])}-`;
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        text = `30日後以降-`;
                    }
                }
            }

            return `<span class="next-schedule ${extraClass}" title="${text}">${text}</span>`;
        },

        getWeeklyTemporaryText(shop, targetDate = new Date()) {
            if (!Array.isArray(shop.temporary) || shop.temporary.length === 0) return { text: null, hasToday: false };

            const fmt = Utils.formatTime || (v => `${Math.floor(v)}:${Math.round((v - Math.floor(v)) * 60).toString().padStart(2, '0')}`);
            const getLocKey = Utils.getLocalDateKey || (d => d.toISOString().split('T')[0]);
            const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
            const now = targetDate;
            const todayKey = getLocKey(now);
            const dailyList = [];
            let hasTodayTemp = false;

            const self = (this && this.findTemporaryEntry) ? this : JiroBusinessHours;
            for (let i = 0; i < 30; i++) {
                const d = new Date();
                d.setDate(now.getDate() + i);
                const tempEntry = self.findTemporaryEntry(shop, d);
                if (tempEntry) {
                    if (getLocKey(d) === todayKey) {
                        hasTodayTemp = true;
                    }
                    const hours = tempEntry.hours;
                    const statusType = (!hours || hours.length === 0) ? '休業' : hours.map(s => `${fmt(s[0])}-${fmt(s[1])}`).join(', ');

                    const startD = new Date(tempEntry.startDate || tempEntry.date);

                    dailyList.push({
                        dateObj: d,
                        month: d.getMonth() + 1,
                        date: d.getDate(),
                        dayStr: dayNames[d.getDay()],
                        startMonth: startD.getMonth() + 1,
                        startDate: startD.getDate(),
                        startDayStr: dayNames[startD.getDay()],
                        statusType: statusType,
                        hasHours: !!(hours && hours.length > 0)
                    });
                }
            }

            if (dailyList.length === 0) return { text: null, hasToday: false };

            const groups = [];
            let currentGroup = null;

            for (let i = 0; i < dailyList.length; i++) {
                const item = dailyList[i];
                if (!currentGroup) {
                    currentGroup = {
                        start: item,
                        end: item,
                        statusType: item.statusType,
                        items: [item]
                    };
                } else {
                    const prevItem = dailyList[i - 1];
                    const diffDays = Math.round((item.dateObj - prevItem.dateObj) / (1000 * 60 * 60 * 24));

                    if (diffDays === 1 && item.statusType === currentGroup.statusType) {
                        currentGroup.end = item;
                        currentGroup.items.push(item);
                    } else {
                        groups.push(currentGroup);
                        currentGroup = {
                            start: item,
                            end: item,
                            statusType: item.statusType,
                            items: [item]
                        };
                    }
                }
            }
            if (currentGroup) groups.push(currentGroup);

            const parts = groups.map(g => {
                let dateStr = '';
                if (g.start === g.end) {
                    dateStr = `${g.start.month}/${g.start.date}(${g.start.dayStr})`;
                } else {
                    dateStr = `${g.start.month}/${g.start.date}(${g.start.dayStr})〜${g.end.month}/${g.end.date}(${g.end.dayStr})`;
                }
                const label = g.statusType === '休業' ? '休業' : `${g.statusType}`;
                return `${dateStr} ${label}`;
            });

            return {
                text: parts.join('、'),
                hasToday: hasTodayTemp
            };
        }
    };

    // グローバルおよびCommonJSへのエクスポート
    global.JiroBusinessHours = JiroBusinessHours;

    // 後方互換性のためトップレベル関数としても公開
    global.isJapaneseHoliday = JiroBusinessHours.isJapaneseHoliday.bind(JiroBusinessHours);
    global.parseShiftString = JiroBusinessHours.parseShiftString.bind(JiroBusinessHours);
    global.formatShiftArray = JiroBusinessHours.formatShiftArray.bind(JiroBusinessHours);
    global.formatShiftList = JiroBusinessHours.formatShiftList.bind(JiroBusinessHours);
    global.formatShiftTimeText = JiroBusinessHours.formatShiftTimeText.bind(JiroBusinessHours);
    global.isPreOpen = JiroBusinessHours.isPreOpen.bind(JiroBusinessHours);
    global.isClosedShopExpired = JiroBusinessHours.isClosedShopExpired.bind(JiroBusinessHours);
    global.areShiftsEqual = JiroBusinessHours.areShiftsEqual.bind(JiroBusinessHours);
    global.getNthDayOfWeek = JiroBusinessHours.getNthDayOfWeek.bind(JiroBusinessHours);
    global.findSpecialShiftEntry = JiroBusinessHours.findSpecialShiftEntry.bind(JiroBusinessHours);
    global.getRegularShiftsByDay = JiroBusinessHours.getRegularShiftsByDay.bind(JiroBusinessHours);
    global.isRedundantTempEntry = JiroBusinessHours.isRedundantTempEntry.bind(JiroBusinessHours);
    global.findTemporaryEntry = JiroBusinessHours.findTemporaryEntry.bind(JiroBusinessHours);
    global.getTodayShifts = JiroBusinessHours.getTodayShifts.bind(JiroBusinessHours);
    global.getTemporaryStatus = JiroBusinessHours.getTemporaryStatus.bind(JiroBusinessHours);
    global.getBusinessStatus = JiroBusinessHours.getBusinessStatus.bind(JiroBusinessHours);
    global.getNextShiftTimes = JiroBusinessHours.getNextShiftTimes.bind(JiroBusinessHours);
    global.getNextOpenScheduleText = JiroBusinessHours.getNextOpenScheduleText.bind(JiroBusinessHours);
    global.getWeeklyTemporaryText = JiroBusinessHours.getWeeklyTemporaryText.bind(JiroBusinessHours);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = JiroBusinessHours;
    }
})(typeof window !== 'undefined' ? window : globalThis);

