        function getOrCreateUserId() {
            try {
                let userId = localStorage.getItem('jiro_user_id');
                if (!userId) {
                    if (window.crypto && crypto.getRandomValues) {
                        const arr = new Uint8Array(6);
                        crypto.getRandomValues(arr);
                        const randStr = Array.from(arr, b => b.toString(36).padStart(2, '0')).join('').substring(0, 8);
                        userId = 'user_' + randStr + '_' + Date.now().toString(36);
                    } else {
                        userId = 'user_' + Math.random().toString(36).substring(2, 8) + '_' + Date.now().toString(36);
                    }
                    localStorage.setItem('jiro_user_id', userId);
                }
                return userId;
            } catch (err) {
                console.warn('LocalStorage unavailable for userId:', err);
                return 'user_temp_' + Date.now().toString(36);
            }
        }

        const CURRENT_USER_ID = getOrCreateUserId();
        const GAS_API_URL = "https://script.google.com/macros/s/AKfycbzIEpLl3ZCaH8-OJEqezCFYOO0Tq4q3tsKc3577vbGGlDnfjvJlrlH67EZHK_IwguKb/exec";

        const MITA_HONTON_COORDS = { lat: 35.64805, lng: 139.74160 };

        let shops = [];
        let isAppInitialized = false;
        let visitedState = (() => {
            try {
                const mainData = localStorage.getItem('jiro_pc_visited');
                if (mainData) {
                    try {
                        return JSON.parse(mainData) || {};
                    } catch (e) {
                        console.warn('Failed to parse jiro_pc_visited, trying backup:', e);
                    }
                }
                const backupData = localStorage.getItem('jiro_pc_visited_backup');
                if (backupData) {
                    try {
                        const parsed = JSON.parse(backupData);
                        if (parsed && typeof parsed === 'object') {
                            localStorage.setItem('jiro_pc_visited', backupData);
                            return parsed;
                        }
                    } catch (e) {
                        console.warn('Failed to parse jiro_pc_visited_backup:', e);
                    }
                }
            } catch (err) {
                console.warn('LocalStorage access error during visitedState init:', err);
            }
            return {};
        })();

        let listSubMode = 'detailed';
        let selectedDateKey = getLocalDateKey(new Date());

        let isShowMap = true;
        let isShowList = true;

        let narrowViewMode = 'map';

        let userCoords = null;
        let userMarker = null;
        let locationBtnElement = null;
        let isProgrammaticMove = false;
        let userHasInteractedWithMap = false;
        let lastMapCenter = { lat: MITA_HONTON_COORDS.lat, lng: MITA_HONTON_COORDS.lng };
        const markers = {};
        const processingShops = new Set();
        let customPreservedOrder = null;

        const geoOptions = { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 };

        // 文字列・日付・祝日・フォーマット等の共通ユーティリティは js/common/utils.js, js/common/business-hours.js に集約されています。


        function getSelectedDateObject() {
            const dateInput = document.getElementById('date-selector');
            const rawValue = dateInput && dateInput.value ? dateInput.value : selectedDateKey;
            if (!rawValue) return new Date();
            const [year, month, day] = rawValue.split('-').map(Number);
            if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
                return new Date();
            }
            return new Date(year, month - 1, day);
        }

        function setSelectedDate(dateStr) {
            const minDate = getLocalDateKey(new Date());
            const safeDate = !dateStr || dateStr < minDate ? minDate : dateStr;
            selectedDateKey = safeDate;
            const dateInput = document.getElementById('date-selector');
            if (dateInput) {
                dateInput.min = minDate;
                dateInput.value = safeDate;
            }
            render();
        }

        function switchToTodayView(dateStr) {
            if (!dateStr) return;
            const minDate = getLocalDateKey(new Date());
            const safeDate = dateStr < minDate ? minDate : dateStr;
            selectedDateKey = safeDate;
            const dateInput = document.getElementById('date-selector');
            if (dateInput) {
                dateInput.min = minDate;
                dateInput.value = safeDate;
            }
            currentMainViewMode = 'today';
            const mainViewModeOptions = document.querySelectorAll('input[name="main-view-mode"]');
            mainViewModeOptions.forEach(opt => {
                opt.checked = (opt.value === 'today');
            });
            currentPeriodMode = '1';
            updateModeSwitchButtons();
            render();
        }

        function formatShiftList(shifts) {
            if (!Array.isArray(shifts) || shifts.length === 0) return '定休日';
            return shifts.map(([start, end]) => `${formatTime(start)}-${formatTime(end)}`).join(', ');
        }

        function getEffectiveDisplayDate() {
            return currentMainViewMode === 'today' ? getSelectedDateObject() : new Date();
        }

        function getLocalDateKey(date = new Date()) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        // 距離計算・営業判定等は js/common/utils.js および js/common/business-hours.js に集約されています。


        // シフト一致・判定処理は js/common/business-hours.js に集約されています。


        // シフト検索・臨時営業判定は js/common/business-hours.js に集約されています。


        // 営業状態判定は js/common/business-hours.js に集約されています。


        // 次回営業時刻・営業スケジュール案内テキスト生成は js/common/business-hours.js に集約されています。


        // 週間臨時営業・休業案内テキスト生成は js/common/business-hours.js に集約されています。


        function formatWeekNumbers(weeks) {
            if (!weeks || weeks.length === 0) return '';
            weeks.sort((a, b) => a - b);

            let ranges = [];
            let start = weeks[0];
            let end = weeks[0];

            for (let i = 1; i < weeks.length; i++) {
                if (weeks[i] === end + 1) {
                    end = weeks[i];
                } else {
                    ranges.push(start === end ? `${start}` : `${start}-${end}`);
                    start = weeks[i];
                    end = weeks[i];
                }
            }
            ranges.push(start === end ? `${start}` : `${start}-${end}`);
            return ranges.join(',');
        }

        function renderBusinessHoursTable(shop, targetDate = new Date(), hasFeatures = false) {
            if (!shop.shiftsByDay && (!Array.isArray(shop.specialShifts) || shop.specialShifts.length === 0)) return '情報なし';

            const baseDayNames = ["月", "火", "水", "木", "金", "土", "日"];
            const rawEntries = [];

            // 本日の日時・祝日情報・臨時情報取得
            const now = targetDate;
            const currentHour = now.getHours() + (now.getMinutes() / 60);

            // 24:00（深夜跨ぎ）営業の判定ロジック：深夜0〜4時等で前日からの営業中である場合、前日を「本日扱い」の対象とする
            let activeTargetDate = new Date(now);
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            const yesterdayShifts = getTodayShifts(shop, yesterday);
            let isLateNightOvernight = false;

            if (yesterdayShifts?.length) {
                const adjustedHour = currentHour + 24.0;
                for (const [start, end] of yesterdayShifts) {
                    if (end > 24.0 && adjustedHour >= start && adjustedHour <= end) {
                        isLateNightOvernight = true;
                        activeTargetDate = yesterday;
                        break;
                    }
                }
            }

            const tempEntryToday = findTemporaryEntry(shop, activeTargetDate);
            const hasTodayTemp = !!tempEntryToday; // 臨時営業情報が適用される日か判定

            const targetJsDay = activeTargetDate.getDay(); // 0:日, 1:月...
            const targetMondayBasedDay = (targetJsDay + 6) % 7; // 0:月... 6:日
            const targetIsHoliday = isJapaneseHoliday(activeTargetDate);
            const hasHolidayShift = shop.holidayShifts !== null && shop.holidayShifts !== undefined;

            for (let mondayIndex = 0; mondayIndex < 7; mondayIndex++) {
                const jsDayOfWeek = (mondayIndex + 1) % 7;
                const dayLabel = baseDayNames[mondayIndex];

                const normalShifts = shop.shiftsByDay ? shop.shiftsByDay[mondayIndex] : null;
                const normalStr = formatShiftList(normalShifts);

                const specsForThisDay = Array.isArray(shop.specialShifts)
                    ? shop.specialShifts.filter(spec => spec.day === jsDayOfWeek)
                    : [];

                // 祝日特別シフトによる注釈を取得（該当曜日欄）
                const specRulesForThisDay = [];
                if (Array.isArray(shop.holidaySpecialShifts)) {
                    shop.holidaySpecialShifts.forEach(rule => {
                        const targetDayOfWeek = (rule.triggerDay + rule.targetOffset) % 7;
                        if (targetDayOfWeek === jsDayOfWeek) {
                            const hrsStr = (!rule.hours || rule.hours.length === 0) ? "定休日" : formatShiftList(rule.hours);
                            if (hrsStr !== normalStr) {
                                const label = rule.targetOffset === 0 ? "祝" : "翌祝";
                                specRulesForThisDay.push(`${label}: ${hrsStr}`);
                            }
                        }
                    });
                }

                let fullText = normalStr;
                const specTexts = [];
                if (specsForThisDay.length > 0) {
                    const hoursToWeeksMap = {};
                    specsForThisDay.forEach(spec => {
                        const hoursStr = formatShiftList(spec.hours);
                        if (!hoursToWeeksMap[hoursStr]) {
                            hoursToWeeksMap[hoursStr] = [];
                        }
                        hoursToWeeksMap[hoursStr].push(spec.week === -1 ? 5 : spec.week);
                    });

                    for (const [hrs, weeks] of Object.entries(hoursToWeeksMap)) {
                        const weeksStr = formatWeekNumbers(weeks);
                        specTexts.push(`第${weeksStr}: ${hrs}`);
                    }
                }

                if (specTexts.length > 0 || specRulesForThisDay.length > 0) {
                    const combined = [...specTexts, ...specRulesForThisDay];
                    fullText += `（${combined.join('、')}）`;
                }

                // 強調判定：臨時営業適用日は強調しない。祝日で祝日枠がない場合は該当曜日を強調
                let isTodayRow = false;
                if (!hasTodayTemp) {
                    if (targetIsHoliday) {
                        if (!hasHolidayShift && mondayIndex === targetMondayBasedDay) {
                            isTodayRow = true;
                        }
                    } else {
                        if (mondayIndex === targetMondayBasedDay) {
                            isTodayRow = true;
                        }
                    }
                }

                rawEntries.push({ dayLabel, text: fullText, isHoliday: false, isToday: isTodayRow });
            }

            if (hasHolidayShift) {
                let holidayStr = formatShiftList(shop.holidayShifts);
                const specRulesForHolidayRow = [];
                if (Array.isArray(shop.holidaySpecialShifts)) {
                    const dayNamesShort = ["日", "月", "火", "水", "木", "金", "土"];
                    shop.holidaySpecialShifts.forEach(rule => {
                        if (rule.targetOffset === 0) {
                            const hrsStr = (!rule.hours || rule.hours.length === 0) ? "定休日" : formatShiftList(rule.hours);
                            if (hrsStr !== holidayStr) {
                                const triggerDayName = dayNamesShort[rule.triggerDay];
                                specRulesForHolidayRow.push(`${triggerDayName}: ${hrsStr}`);
                            }
                        }
                    });
                }
                if (specRulesForHolidayRow.length > 0) {
                    holidayStr += `（${specRulesForHolidayRow.join('、')}）`;
                }
                // 祝日の場合かつ臨時営業がない場合「祝」を強調
                const isTodayRow = !hasTodayTemp && targetIsHoliday;
                rawEntries.push({ dayLabel: '祝', text: holidayStr, isHoliday: true, isToday: isTodayRow });
            }

            const groupedEntries = [];
            let currentGroup = null;

            rawEntries.forEach(entry => {
                if (!currentGroup) {
                    currentGroup = { labels: [entry.dayLabel], text: entry.text, hasHoliday: entry.isHoliday, isToday: entry.isToday };
                } else {
                    if (currentGroup.text === entry.text && (!currentGroup.hasHoliday || (currentGroup.labels.length === 1 && currentGroup.labels[0] === '日' && entry.isHoliday))) {
                        currentGroup.labels.push(entry.dayLabel);
                        if (entry.isHoliday) currentGroup.hasHoliday = true;
                        if (entry.isToday || currentGroup.isToday) currentGroup.isToday = true; // グループ内に本日が含まれていれば isToday を true にする
                    } else {
                        groupedEntries.push(currentGroup);
                        currentGroup = { labels: [entry.dayLabel], text: entry.text, hasHoliday: entry.isHoliday, isToday: entry.isToday };
                    }
                }
            });
            if (currentGroup) {
                groupedEntries.push(currentGroup);
            }

            let rowsHtml = '';
            groupedEntries.forEach(group => {
                let labelDisplay = '';
                const labels = group.labels;
                const hasHoliday = group.hasHoliday;
                const nonHolidayLabels = labels.filter(l => l !== '祝');

                if (labels.length === 3 && labels.includes('土') && labels.includes('日') && labels.includes('祝')) {
                    labelDisplay = '土日祝';
                } else if (labels.length === 2 && labels.includes('土') && labels.includes('日')) {
                    labelDisplay = '土日';
                } else if (labels.length === 2 && labels.includes('日') && labels.includes('祝')) {
                    labelDisplay = '日祝';
                } else if (labels.length === 2 && !hasHoliday) {
                    labelDisplay = `${labels[0]}${labels[1]}`;
                } else if (nonHolidayLabels.length >= 2) {
                    const rangeText = `${nonHolidayLabels[0]}-${nonHolidayLabels[nonHolidayLabels.length - 1]}`;
                    labelDisplay = hasHoliday ? `${rangeText}祝` : rangeText;
                } else {
                    labelDisplay = labels.join('');
                }

                const todayClass = group.isToday ? 'class="today-highlight"' : '';
                const tdStyle = hasFeatures
                    ? 'style="width: 142px; min-width: 142px; max-width: 142px; word-break: break-word; white-space: normal;"'
                    : 'style="width: 100%;"';
                rowsHtml += `<tr ${todayClass}><th>${labelDisplay}</th><td ${tdStyle}>${group.text}</td></tr>`;
            });

            const tableStyle = hasFeatures ? 'style="width: auto;"' : 'style="width: 100%;"';
            return `<table class="hours-table" ${tableStyle}><tbody>${rowsHtml}</tbody></table>`;
        }

        let currentCalendarModalShop = null;

        function openCalendarModal(shopId) {
            const shop = shops.find(s => s.id === shopId);
            if (!shop) return;
            currentCalendarModalShop = shop;

            const modalTitleEl = document.getElementById('calendar-modal-title');
            const modalBodyEl = document.getElementById('calendar-modal-body');
            
            if (modalTitleEl) modalTitleEl.textContent = shop.name;
            if (modalBodyEl) modalBodyEl.innerHTML = render28DaysCalendarTable(shop, getEffectiveDisplayDate());

            const modal = document.getElementById('calendar-modal');
            if (modal && typeof modal.showModal === 'function') {
                modal.showModal();
            }
        }

        function selectCalendarDate(dateStr, shopId) {
            const modal = document.getElementById('calendar-modal');
            if (modal && typeof modal.close === 'function') {
                modal.close();
            }

            setListSubMode('today');
            setSelectedDate(dateStr);

            setTimeout(() => {
                const targetCard = document.querySelector(`.shop-info[data-shop-id="${shopId}"]`) || document.querySelector(`.shop-item[data-shop-id="${shopId}"]`);
                if (targetCard) {
                    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }

        function getDayOfWeekColorStyle(dayOfWeek) {
            if (dayOfWeek === 0) {
                return 'color: var(--jiro-red);';
            } else if (dayOfWeek === 6) {
                return 'color: #60a5fa;';
            }
            return 'color: #ffffff;';
        }

        function render28DaysCalendarTable(shop, startDate = new Date()) {
            const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
            const todayStr = getLocalDateKey(new Date());

            // 上部の曜日ヘッダー行（枠・背景なし、日付と同じ文字サイズ 0.72rem）
            let headerCellsHtml = '';
            for (let i = 0; i < 7; i++) {
                const d = new Date(startDate);
                d.setDate(startDate.getDate() + i);
                const dayOfWeek = d.getDay();
                const dayLabel = dayNames[dayOfWeek];
                const dayColorStyle = getDayOfWeekColorStyle(dayOfWeek);
                headerCellsHtml += `<th style="text-align: center; padding: 2px; font-size: 0.72rem; font-weight: normal; ${dayColorStyle} border: none; background: transparent; width: 14.28%;">${dayLabel}</th>`;
            }
            const headerRowHtml = `<tr>${headerCellsHtml}</tr>`;

            // 7日ずつ4行（計28日）を生成
            let bodyRowsHtml = '';
            for (let row = 0; row < 4; row++) {
                let rowCellsHtml = '';
                
                // その週（7日間）の中での最大シフト数を算出（最低2行分の高さを保証）
                let maxShiftsInRow = 2;
                for (let col = 0; col < 7; col++) {
                    const offset = row * 7 + col;
                    const d = new Date(startDate);
                    d.setDate(startDate.getDate() + offset);
                    const shifts = getTodayShifts(shop, d);
                    if (shifts && shifts.length > maxShiftsInRow) {
                        maxShiftsInRow = shifts.length;
                    }
                }
                
                // 昼夜2部営業（2行）の標準高さを基準に、シフト数に応じたセル高さを動的計算
                // 1~2部営業: 44px, 3部営業: 約 57px
                const cellMinHeight = 18 + (maxShiftsInRow * 13);

                for (let col = 0; col < 7; col++) {
                    const offset = row * 7 + col;
                    const d = new Date(startDate);
                    d.setDate(startDate.getDate() + offset);
                    const dStr = getLocalDateKey(d);

                    const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
                    const dayColorStyle = getDateDayColorStyle(d);
                    const tempStatus = getTemporaryStatus(shop, d);
                    const shifts = getTodayShifts(shop, d);
                    const isTodayOpen = !!(shifts && shifts.length > 0 && !isPreOpen(shop, d));
                    let hoursHtml = '';
                    let plainText = '休業';
                    if (!shifts || shifts.length === 0) {
                        hoursHtml = `<span style="white-space: nowrap; line-height: 1.1; display: inline-block;">${formatShiftTimeText('休業', 'calendar')}</span>`;
                    } else {
                        plainText = shifts.map(([s, e]) => `${formatTime(s)}-${formatTime(e)}`).join(' / ');
                        hoursHtml = shifts.map(([s, e]) => `<span style="white-space: nowrap; line-height: 1.1; display: inline-block;">${formatShiftTimeText(`${formatTime(s)}-${formatTime(e)}`, 'calendar')}</span>`).join('');
                    }

                    const textClass = tempStatus ? 'is-temp' : (isTodayOpen ? 'is-open' : 'is-closed');
                    const bgBorderClass = isTodayOpen ? 'today-open' : 'today-closed';

                    rowCellsHtml += `
                        <td style="padding: 0; vertical-align: top; width: 14.28%;">
                            <div class="calendar-cell ${bgBorderClass}" style="padding: 2px 1px; height: ${cellMinHeight}px; min-height: ${cellMinHeight}px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; cursor: pointer;" title="${dateLabel} の1日表示を表示" onclick="switchToTodayView('${dStr}')">
                                <div class="today-summary-card">
                                    <div class="today-summary-name" style="font-size: 0.72rem; line-height: 1.1; ${dayColorStyle}">${dateLabel}</div>
                                    <div class="today-hours-text ${textClass}" title="${plainText}">${hoursHtml}</div>
                                </div>
                            </div>
                        </td>
                    `;
                }

                bodyRowsHtml += `<tr>${rowCellsHtml}</tr>`;
            }

            return `
                <div style="width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch;">
                    <table style="width: 100%; min-width: 320px; border-collapse: separate; border-spacing: 3px; border: none; table-layout: fixed;">
                        <thead>
                            ${headerRowHtml}
                        </thead>
                        <tbody>
                            ${bodyRowsHtml}
                        </tbody>
                    </table>
                </div>
            `;
        }

        function renderBusinessHoursAndFeatures(shop, selectedDate) {
            const hasFeatures = !!(shop.ticketTiming || shop.soupType || shop.renge || shop.takeout);
            const tableHtml = renderBusinessHoursTable(shop, selectedDate, hasFeatures);
            const openedDateStr = formatOpenedDateText(shop.openedAt);

            const hoursHeaderHtml = `
                <div class="hours-title" style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 2px;">
                    <span style="font-weight: bold; color: var(--jiro-yellow); font-size: 0.82rem;">営業時間</span>
                    ${openedDateStr ? `<span class="open-date-text" style="font-size: 0.68rem; color: #aaa; text-align: right; margin-left: 8px;">${openedDateStr}</span>` : ''}
                </div>
            `;

            if (!hasFeatures) {
                return `
                    <div style="display: flex; flex-direction: column; width: 100%;">
                        ${hoursHeaderHtml}
                        ${tableHtml}
                    </div>
                `;
            }

            const rengeSvgIcon = `<svg title="レンゲ" width="18" height="15" viewBox="0 0 32 24" fill="none" style="display:inline-block; vertical-align:middle; opacity:0.95; margin-right:4px; flex-shrink:0;"><path d="M 3 12 C 3 18 8 20 16 20 C 21 20 25 16 28 8.5 C 28.5 7.2 27.2 6.2 26 7 C 23.5 8.5 19.5 11.5 14.5 11.5 C 8.5 11.5 3 12 3 12 Z" fill="#ffffff"/><path d="M 4.5 12.2 C 9.5 14 15.5 14 20.8 11.6 C 23.8 10.2 26.5 7.8 26.5 7.8" stroke="#121212" stroke-width="1.3" stroke-linecap="round"/></svg>`;
            const soupSvgIcon = `<svg title="スープ" width="18" height="15" viewBox="0 0 32 24" fill="none" style="display:inline-block; vertical-align:middle; opacity:0.95; margin-right:4px; flex-shrink:0;"><path d="M 4 8 C 4 17 9 20 16 20 C 23 20 28 17 28 8 Z" fill="#ffffff"/><path d="M 11 20 L 12 22 L 20 22 L 21 20 Z" fill="#ffffff"/><path d="M 4 8.5 C 9.5 10.2 22.5 10.2 28 8.5" stroke="#121212" stroke-width="1.3"/></svg>`;
            const takeoutSvgIcon = `<svg title="テイクアウト" width="18" height="15" viewBox="0 0 32 24" fill="none" style="display:inline-block; vertical-align:middle; opacity:0.95; margin-right:4px; flex-shrink:0;"><path d="M 13 4 L 16 1 L 19 4 M 16 1 L 16 5" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/><path d="M 12 5 C 6 6 2 10 2 16 C 2 22 7 23 16 23 C 25 23 30 22 30 16 C 30 10 26 6 20 5 Z" stroke="#ffffff" stroke-width="1.4" stroke-dasharray="3,1" fill="rgba(255,255,255,0.1)"/><path d="M 6 11 C 10 8 10 15 15 11 C 19 8 21 15 26 11" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/><path d="M 5 15 C 9 12 10 19 15 15 C 19 12 22 19 27 15" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/><path d="M 8 19 C 11 16 13 22 17 19 C 20 16 23 22 25 19" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/><path d="M 9 8 C 8 12 12 16 11 20" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><path d="M 22 8 C 23 12 19 16 21 20" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/></svg>`;

            const featuresHeaderHtml = `
                <div class="features-title" style="display: flex; align-items: baseline; width: 100%; margin-bottom: 2px;">
                    <span style="font-weight: bold; color: var(--jiro-yellow); font-size: 0.82rem;">特徴</span>
                </div>
            `;

            let featuresHtml = '';
            if (shop.ticketTiming) featuresHtml += `<div style="white-space: normal; word-break: break-word; line-height: 1.35; font-weight: 400; font-size: 0.72rem; display: flex; align-items: flex-start;" title="食券"><span title="食券" style="filter: grayscale(100%) brightness(1.6); opacity: 0.95; margin-right: 4px; display: inline-block; flex-shrink: 0; margin-top: 1px;">🎟️</span><span style="font-weight: 400;">${shop.ticketTiming}</span></div>`;
            if (shop.soupType) featuresHtml += `<div style="white-space: normal; word-break: break-word; line-height: 1.35; font-weight: 400; font-size: 0.72rem; display: flex; align-items: flex-start;" title="スープ">${soupSvgIcon}<span style="font-weight: 400;">${shop.soupType}</span></div>`;
            if (shop.renge) featuresHtml += `<div style="white-space: normal; word-break: break-word; line-height: 1.35; font-weight: 400; font-size: 0.72rem; display: flex; align-items: flex-start;" title="レンゲ">${rengeSvgIcon}<span style="font-weight: 400;">${shop.renge}</span></div>`;
            if (shop.takeout) featuresHtml += `<div style="white-space: normal; word-break: break-word; line-height: 1.35; font-weight: 400; font-size: 0.72rem; display: flex; align-items: flex-start;" title="テイクアウト">${takeoutSvgIcon}<span style="font-weight: 400;">${shop.takeout}</span></div>`;

            return `
                <div style="display: flex; gap: 12px; align-items: flex-start; flex-wrap: nowrap; width: 100%;">
                    <div style="display: flex; flex-direction: column; flex: 0 0 auto;">
                        ${hoursHeaderHtml}
                        ${tableHtml}
                    </div>
                    <div style="flex: 1; min-width: 140px; font-size: 0.72rem; color: #d0d0d0; font-weight: 400; display: flex; flex-direction: column; gap: 3px; box-sizing: border-box; overflow: visible;">
                        ${featuresHeaderHtml}
                        ${featuresHtml}
                    </div>
                </div>
            `;
        }

        // 画像生成・SNS共有機能は js/app/share.js にモジュール分離されています。

        function generateCardContentHTML(shop, isVisited, fromPopup = false) {
            const isProcessing = processingShops.has(shop.id);
            const fullAddress = (typeof LG_CODES !== 'undefined' ? LG_CODES.getShopFullAddress(shop) : `${shop.addressText || ''}`).trim();
            const gmapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('ラーメン二郎 ' + shop.name + ' ' + fullAddress)}`;
            const selectedDate = (fromPopup || listSubMode !== 'today') ? new Date() : getEffectiveDisplayDate();

            let linksHtml = '';
            if (shop.x) linksHtml += `<a href="https://x.com/${shop.x}" target="_blank" rel="noopener noreferrer" class="shop-link">X ↗</a>`;
            if (shop.instagram) linksHtml += `<a href="https://instagram.com/${shop.instagram}" target="_blank" rel="noopener noreferrer" class="shop-link">Instagram ↗</a>`;
            if (shop.urls?.pc) linksHtml += `<a href="${shop.urls.pc}" target="_blank" rel="noopener noreferrer" class="shop-link">PC店Ⅲ ↗</a>`;
            if (shop.urls?.rdb) linksHtml += `<a href="${shop.urls.rdb}" target="_blank" rel="noopener noreferrer" class="shop-link">RDB ↗</a>`;
            if (shop.urls?.tabelog) linksHtml += `<a href="${shop.urls.tabelog}" target="_blank" rel="noopener noreferrer" class="shop-link">食べログ ↗</a>`;

            const status = getBusinessStatus(shop, selectedDate);
            const statusTag = `<span class="status-badge ${status.bgClass}">${status.label}</span>`;

            let distanceText = '';
            const sortSelect = document.getElementById('sort-select');
            const sortVal = sortSelect ? sortSelect.value : '';

            if (sortVal === 'distance_center' && shop.centerDistance !== undefined) {
                distanceText = `<span class="distance-tag">📍 中心から ${formatDistance(shop.centerDistance)}</span>`;
            } else if (userCoords && shop.userDistance !== undefined) {
                distanceText = `<span class="distance-tag">📍 現在地から ${formatDistance(shop.userDistance)}</span>`;
            }

            const tempWeeklyInfo = getWeeklyTemporaryText(shop, selectedDate);
            const tempWeeklyHtml = tempWeeklyInfo.text ? `
        <div class="temp-schedule-box ${tempWeeklyInfo.hasToday ? 'today-highlight' : ''}">
            <span class="temp-schedule-label">臨時営業情報（～30日後）:</span>
            <div class="temp-schedule-text">${tempWeeklyInfo.text}</div>
        </div>
    ` : '';

            const remarksText = shop.remarks || shop.notes || '';
            const hasFeatures = !!(shop.ticketTiming || shop.soupType || shop.renge || shop.takeout);

            return `
        <div class="shop-info" data-shop-id="${shop.id}">
            <div class="shop-header-row">
                <div class="shop-title-wrapper">
                    <span class="shop-name">${shop.name}</span>
                    ${statusTag}
                </div>
                <button type="button" class="visit-toggle-btn ${isVisited ? 'is-visited' : ''}" ${isProcessing ? 'disabled' : ''} onclick="toggleVisit('${shop.id}', ${fromPopup}, event)" aria-label="${shop.name}の制覇状態を切り替え">
                    ${isVisited ? '制覇済' : '未制覇'}
                </button>
            </div>
            <div class="shop-sub-row">
                ${getNextOpenScheduleText(shop, selectedDate)}
                ${distanceText}
            </div>
            <div class="detailed-content">
                <div class="meta-text-outside">
                    <div><a href="${gmapUrl}" target="_blank" rel="noopener noreferrer" class="gmap-link">📍 ${fullAddress || '住所不明'} ↗</a></div>
                    ${(!hasFeatures && shop.ticketTiming) ? `<div>🎟️ ${shop.ticketTiming}</div>` : ''}
                </div>
                <div class="hours-box">
                    ${renderBusinessHoursAndFeatures(shop, selectedDate)}
                    ${shop.hoursNotes ? `<div style="font-size:0.75rem; color:#ccc; margin-top:4px;"><strong>補足:</strong> ${shop.hoursNotes}</div>` : ''}
                    ${tempWeeklyHtml}
                </div>
                ${remarksText ? `<div class="meta-text-outside"><div>${remarksText}</div></div>` : ''}
                <div class="detailed-card-footer">
                    <div class="links-group">${linksHtml}</div>
                    <button type="button" class="sns-share-btn" onclick="shareShopCardImage('${shop.id}', event)" aria-label="SNSに画像付きでシェア" title="SNSに画像付きでシェア"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg></button>
                </div>
            </div>
        </div>
    `;
        }

        const map = L.map('map', { 
            fadeAnimation: false, 
            zoomAnimation: true,
            attributionControl: false
        }).setView([MITA_HONTON_COORDS.lat, MITA_HONTON_COORDS.lng], 9);
        
        L.control.attribution({ position: 'bottomright' }).addTo(map);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        map.on('movestart dragstart zoomstart', () => {
            if (!isProgrammaticMove) {
                userHasInteractedWithMap = true;
            }
        });

        function checkPopupBounds() {
            map.eachLayer(layer => {
                if (layer.getPopup && layer.getPopup() && layer.isPopupOpen()) {
                    const popup = layer.getPopup();
                    const latLng = popup.getLatLng();
                    if (latLng) {
                        const mapBounds = map.getBounds();
                        if (!mapBounds.contains(latLng)) {
                            map.closePopup(popup);
                        }
                    }
                }
            });
        }

        map.on('move', checkPopupBounds);
        map.on('moveend', () => {
            const center = map.getCenter();
            lastMapCenter = { lat: center.lat, lng: center.lng };
            checkPopupBounds();
            const sortSelect = document.getElementById('sort-select');
            if (sortSelect && sortSelect.value === 'distance_center') {
                render();
            }
        });

        function updateLocationButtonUI(hasLocation) {
            if (!locationBtnElement) return;
            locationBtnElement.classList.toggle('active-loc', hasLocation);
            locationBtnElement.classList.add('is-visible');
        }

        function fitMapToAllShops() {
            const validShops = shops.filter(shop => shop.lat !== undefined && shop.lng !== undefined && !isClosedShopExpired(shop));
            if (validShops.length === 0) return;

            const bounds = L.latLngBounds(validShops.map(shop => [shop.lat, shop.lng]));
            map.fitBounds(bounds, {
                padding: [30, 30],
                maxZoom: 6,
                animate: true
            });
            userHasInteractedWithMap = false;
        }

        function createIcon(shop, isVisited) {
            const status = getBusinessStatus(shop, new Date());
            return L.divIcon({
                className: 'custom-icon',
                html: `<div class="marker-pin ${status.bgClass} ${isVisited ? 'border-visited' : 'border-unvisited'}"></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
        }

        function saveState() {
            const dataStr = JSON.stringify(visitedState);
            localStorage.setItem('jiro_pc_visited', dataStr);
            localStorage.setItem('jiro_pc_visited_backup', dataStr);
            updateStats();
        }

        function exportVisitedData() {
            const dataStr = localStorage.getItem('jiro_pc_visited') || '{}';
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `jirolianmap_visited_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function importVisitedData(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const imported = JSON.parse(e.target.result);
                    if (imported && typeof imported === 'object') {
                        const cleaned = {};
                        for (const key in imported) {
                            if (typeof imported[key] === 'boolean' || imported[key] === 1 || imported[key] === 0) {
                                cleaned[key] = !!imported[key];
                            }
                        }
                        const dataStr = JSON.stringify(cleaned);
                        localStorage.setItem('jiro_pc_visited', dataStr);
                        localStorage.setItem('jiro_pc_visited_backup', dataStr);
                        alert("制覇データのインポートが完了しました。ページをリロードして反映します。");
                        window.location.reload();
                    } else {
                        throw new Error("不正なデータ形式");
                    }
                } catch (err) {
                    alert("インポートに失敗しました。正しいJSON形式のバックアップファイルを選択してください。");
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        }

        function updateStats() {
            const activeShops = shops.filter(s => s && !isClosedShopExpired(s));
            const total = activeShops.length;
            const visitedCount = activeShops.filter(s => visitedState[s.id]).length;
            const percent = total > 0 ? Math.round((visitedCount / total) * 100) : 0;

            const totalEl = document.getElementById('total-count');
            const visitedEl = document.getElementById('visited-count');
            const percentEl = document.getElementById('percentage');

            if (totalEl) totalEl.textContent = total;
            if (visitedEl) visitedEl.textContent = visitedCount;
            if (percentEl) percentEl.textContent = percent + '%';

            const fill = document.getElementById('progress-fill');
            if (fill) {
                fill.style.width = percent + '%';
                fill.style.backgroundColor = 'var(--jiro-yellow)';
            }
            const progressBar = document.getElementById('progress-bar');
            if (progressBar) {
                progressBar.setAttribute('aria-valuenow', percent);
            }
        }

        function updateVisibleCount(count) {
            const countNode = document.getElementById('controls-toggle-count');
            if (countNode) {
                countNode.innerHTML = `表示: <strong>${count}</strong> 店舗`;
            }
        }

        let currentMainViewMode = 'realtime'; // 'realtime' | 'today'
        let currentPeriodMode = '1';         // '1', '28shop', '28'
        let currentDensityMode = 'detailed';   // 'minimal', 'compact', 'detailed'
        window.currentMainViewMode = currentMainViewMode;
        window.currentPeriodMode = currentPeriodMode;
        window.currentDensityMode = currentDensityMode;

        function setMainViewMode(viewMode) {
            currentMainViewMode = viewMode;
            window.currentMainViewMode = viewMode;
            if (viewMode === 'today') {
                applyPeriodMode(currentPeriodMode);
            } else {
                setListSubMode(currentDensityMode);
            }
        }

        function setPeriodMode(period) {
            currentPeriodMode = period;
            window.currentPeriodMode = period;
            currentMainViewMode = 'today';
            window.currentMainViewMode = 'today';
            applyPeriodMode(period);
        }

        function applyPeriodMode(period) {
            if (period === '28shop') {
                setListSubMode('calendar');
            } else if (period === '1') {
                setListSubMode('minimal'); // 1日の時はコンパクト(minimal)指定
            } else {
                setListSubMode('today');
            }
        }

        function setDensityMode(density) {
            currentDensityMode = density;
            window.currentDensityMode = density;
            currentMainViewMode = 'realtime';
            window.currentMainViewMode = 'realtime';
            setListSubMode(density);
        }

        function updateModeSwitchButtons() {
            window.currentMainViewMode = currentMainViewMode;
            window.currentPeriodMode = currentPeriodMode;
            window.currentDensityMode = currentDensityMode;

            const optRealtime = document.getElementById('opt-realtime');
            const optToday = document.getElementById('opt-today');

            if (optRealtime) optRealtime.classList.toggle('active', currentMainViewMode === 'realtime');
            if (optToday) optToday.classList.toggle('active', currentMainViewMode === 'today');

            // 期間プルダウンの表示・値の同期
            const periodSelect = document.getElementById('period-select');
            if (periodSelect) {
                periodSelect.style.display = (currentMainViewMode === 'today') ? 'inline-block' : 'none';
                periodSelect.value = currentPeriodMode;
            }

            // 表示密度ボタンのアクティブ切り替え
            const optMinimal = document.getElementById('opt-minimal');
            const optCompact = document.getElementById('opt-compact');
            const optDetailed = document.getElementById('opt-detailed');

            if (optMinimal) optMinimal.classList.toggle('active', currentDensityMode === 'minimal');
            if (optCompact) optCompact.classList.toggle('active', currentDensityMode === 'compact');
            if (optDetailed) optDetailed.classList.toggle('active', currentDensityMode === 'detailed');

            // 表示密度コントロール群の表示/非表示（店舗情報時のみ表示）
            const densityWrapper = document.getElementById('density-control-wrapper');
            if (densityWrapper) {
                densityWrapper.style.display = (currentMainViewMode === 'realtime') ? 'inline-flex' : 'none';
            }
        }

        function setListSubMode(mode) {
            listSubMode = mode;

            if (mode === 'calendar') {
                currentMainViewMode = 'today';
                currentPeriodMode = '28shop';
            } else if (mode === 'today') {
                currentMainViewMode = 'today';
            } else if (mode === 'minimal' || mode === 'compact' || mode === 'detailed') {
                if (currentMainViewMode !== 'today') {
                    currentMainViewMode = 'realtime';
                    currentDensityMode = mode;
                }
            }

            updateModeSwitchButtons();

            const dateArea = document.getElementById('date-selector-area');
            if (dateArea) {
                dateArea.style.display = (currentMainViewMode === 'today') ? 'inline-flex' : 'none';
            }

            const todayFilterRow = document.getElementById('today-filter-row');
            if (todayFilterRow) {
                if (currentMainViewMode === 'today') {
                    todayFilterRow.style.display = 'block';
                } else {
                    todayFilterRow.style.display = 'none';
                    // 日別以外のレイアウトになったら、日付指定の営業/休業フィルタを全てONにリセットする
                    const checkboxes = document.querySelectorAll('input[name="today-open-filter"]');
                    checkboxes.forEach(cb => cb.checked = true);
                }
            }

            const grid = document.getElementById('shop-grid');
            if (grid) {
                grid.classList.remove('view-mode-minimal', 'view-mode-compact', 'view-mode-detailed', 'view-mode-today', 'view-mode-calendar');
                if (currentMainViewMode === 'today' && currentPeriodMode === '28shop') {
                    grid.classList.add('view-mode-calendar');
                } else if (currentMainViewMode === 'today') {
                    if (currentPeriodMode === '1') {
                        grid.classList.add('view-mode-minimal');
                    } else {
                        grid.classList.add('view-mode-calendar');
                    }
                } else {
                    grid.classList.add('view-mode-' + currentDensityMode);
                }
            }

            const sidebar = document.getElementById('sidebar-container');
            if (sidebar) {
                sidebar.style.minWidth = (listSubMode === 'minimal' || (currentMainViewMode === 'realtime' && currentDensityMode === 'minimal')) ? '280px' : '390px';
            }

            render();
        }
        window.setListSubMode = setListSubMode;

        function updateLayout() {
            const isWide = window.innerWidth >= 900;
            const mapWrapper = document.getElementById('map-wrapper');
            const sidebar = document.getElementById('sidebar-container');
            const resizer = document.getElementById('drag-resizer');
            const container = document.getElementById('layout-switch-group');

            sidebar.style.minWidth = (listSubMode === 'minimal') ? '280px' : '390px';

            if (isWide) {
                resizer.style.display = (isShowMap && isShowList) ? 'block' : 'none';
                mapWrapper.style.display = isShowMap ? 'block' : 'none';
                sidebar.style.display = isShowList ? 'flex' : 'none';

                if (!isShowMap && isShowList) {
                    sidebar.style.width = '100%';
                } else if (isShowMap && isShowList) {
                    if (sidebar.style.width === '100%') sidebar.style.width = '380px';
                }

                container.innerHTML = `
            <button type="button" class="mode-switch-option ${isShowMap ? 'active' : ''}" onclick="toggleWideComponent('map')">地図</button>
            <button type="button" class="mode-switch-option ${isShowList ? 'active' : ''}" onclick="toggleWideComponent('list')">リスト</button>
        `;
            } else {
                resizer.style.display = 'none';
                sidebar.style.width = '100%';

                if (narrowViewMode === 'map') {
                    mapWrapper.style.display = 'block';
                    sidebar.style.display = 'none';
                } else {
                    mapWrapper.style.display = 'none';
                    sidebar.style.display = 'flex';
                }

                container.innerHTML = `
            <button type="button" class="mode-switch-option ${narrowViewMode === 'map' ? 'active' : ''}" onclick="setNarrowView('map')">地図</button>
            <button type="button" class="mode-switch-option ${narrowViewMode === 'list' ? 'active' : ''}" onclick="setNarrowView('list')">リスト</button>
        `;
            }

            updateSortDropdownOptions();
            setTimeout(() => map.invalidateSize(), 50);
            setTimeout(updateMatrixWrapperHeight, 30);
        }

        function toggleWideComponent(component) {
            if (component === 'map') {
                if (isShowMap && !isShowList) return;
                isShowMap = !isShowMap;
            } else if (component === 'list') {
                if (isShowList && !isShowMap) return;
                isShowList = !isShowList;
            }
            updateLayout();
            render();
        }

        function setNarrowView(mode) {
            narrowViewMode = mode;
            updateLayout();
            render();
        }

        function updateSortDropdownOptions() {
            const sortSelect = document.getElementById('sort-select');
            if (!sortSelect) return;

            let emptyOption = sortSelect.querySelector('option[value=""]');
            if (!emptyOption) {
                emptyOption = document.createElement('option');
                emptyOption.value = "";
                emptyOption.textContent = "";
                emptyOption.style.display = "none";
                sortSelect.appendChild(emptyOption);
            }

            const distUserOpt = sortSelect.querySelector('option[value="distance_user"]');
            const distCenterOpt = sortSelect.querySelector('option[value="distance_center"]');

            if (distUserOpt) distUserOpt.disabled = !userCoords;
            if (distCenterOpt) distCenterOpt.disabled = !isShowMap && (window.innerWidth >= 900 ? !isShowMap : narrowViewMode !== 'map');
        }

        function onSortChange() {
            customPreservedOrder = null;
            render();
        }

        function updateMatrixWrapperHeight() {
            const wrapper = document.querySelector('.matrix-schedule-wrapper');
            const containerEl = document.querySelector('.container');
            const isMatrixMode = (currentMainViewMode === 'today' && ['7', '14', '21', '28'].includes(currentPeriodMode));
            
            if (!wrapper || !isMatrixMode) {
                if (containerEl && !isMatrixMode) {
                    containerEl.style.padding = '';
                    containerEl.style.overflow = '';
                }
                return;
            }

            const footer = document.getElementById('app-footer');
            const isFooterCollapsed = footer ? footer.classList.contains('is-collapsed') : false;
            const footerHeight = (footer && !isFooterCollapsed) ? footer.offsetHeight : 0;
            const rect = wrapper.getBoundingClientRect();
            const availableHeight = Math.max(100, Math.floor(window.innerHeight - rect.top - footerHeight));

            wrapper.style.maxHeight = `${availableHeight}px`;
            wrapper.style.height = `${availableHeight}px`;

            if (containerEl) {
                containerEl.style.padding = '0';
                containerEl.style.overflow = 'hidden';
            }
        }

        function toggleControlsVisibility() {
            const wrapper = document.getElementById('controls-wrapper');
            const toggleText = document.getElementById('controls-toggle-text');
            wrapper.classList.toggle('collapsed');

            if (wrapper.classList.contains('collapsed')) {
                toggleText.textContent = '▼ フィルタを表示する';
            } else {
                toggleText.textContent = '▲ フィルタを隠す';
            }
            updateMatrixWrapperHeight();
            setTimeout(updateMatrixWrapperHeight, 100);
            setTimeout(updateMatrixWrapperHeight, 310);
        }

        function toggleFooterVisibility() {
            const footer = document.getElementById('app-footer');
            const btn = document.getElementById('footer-toggle-btn');
            if (!footer || !btn) return;
            const isCollapsed = footer.classList.toggle('is-collapsed');
            btn.innerHTML = isCollapsed
                ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>'
                : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
            btn.setAttribute('aria-label', isCollapsed ? 'フッターを再表示' : 'フッターを隠す');

            const leafletBottom = document.querySelector('.leaflet-bottom');
            if (leafletBottom) {
                const bottomVal = isCollapsed ? '0px' : (window.innerWidth <= 767 ? '50px' : '26px');
                leafletBottom.style.setProperty('bottom', bottomVal, 'important');
            }
            updateMatrixWrapperHeight();
            setTimeout(updateMatrixWrapperHeight, 100);
            setTimeout(updateMatrixWrapperHeight, 260);
        }

        function toggleHeaderVisibility() {
            const header = document.querySelector('header');
            if (!header) return;
            header.classList.toggle('is-collapsed');
            updateMatrixWrapperHeight();
            setTimeout(updateMatrixWrapperHeight, 100);
            setTimeout(updateMatrixWrapperHeight, 310);
        }

        function toggleVisit(id, fromPopup = false, event = null) {
            if (event) event.stopPropagation();

            visitedState[id] = !visitedState[id];
            saveState();

            const isVisited = !!visitedState[id];
            const shop = shops.find(s => s.id === id);
            if (markers[id] && shop) {
                markers[id].setIcon(createIcon(shop, isVisited));
                markers[id].setPopupContent(generateCardContentHTML(shop, isVisited, true));
                if (fromPopup || markers[id].isPopupOpen()) {
                    setTimeout(() => {
                        markers[id].openPopup();
                    }, 0);
                }
            }

            const gridModal = document.getElementById('grid-popup-modal');
            if (gridModal && gridModal.open) {
                const contentArea = document.getElementById('grid-popup-content-area');
                if (contentArea && contentArea.dataset.shopId === id) {
                    contentArea.innerHTML = generateCardContentHTML(shop, isVisited, true);
                }
            }

            render();

            if (GAS_API_URL) {
                fetch(GAS_API_URL, {
                    method: "POST",
                    headers: { "Content-Type": "text/plain" },
                    body: JSON.stringify({ user_id: CURRENT_USER_ID, shop_id: id, is_completed: isVisited })
                }).catch(err => {
                    console.error("GASエラー:", err);
                });
            }
        }

        function focusShopOnMap(shopId) {
            const shop = shops.find(s => s.id === shopId);
            if (shop?.lat && shop?.lng && markers[shopId]) {
                isProgrammaticMove = true;
                map.invalidateSize();
                map.setView([shop.lat, shop.lng], 15, { animate: false });
                markers[shopId].openPopup();
                setTimeout(() => {
                    isProgrammaticMove = false;
                }, 100);
            }
        }

        function handleShopSelect(shopId) {
            const isMapVisible = isShowMap && (window.innerWidth >= 900 || narrowViewMode === 'map');

            if (!isMapVisible) {
                showGridShopPopup(shopId);
            } else {
                focusShopOnMap(shopId);
            }
        }

        function showGridShopPopup(shopId) {
            const shop = shops.find(s => s.id === shopId);
            if (!shop) return;

            const isVisited = !!visitedState[shop.id];
            const contentArea = document.getElementById('grid-popup-content-area');
            contentArea.dataset.shopId = shop.id;
            contentArea.innerHTML = generateCardContentHTML(shop, isVisited, true);

            const modal = document.getElementById('grid-popup-modal');
            if (modal && !modal.open) {
                modal.showModal();
            }
        }

        function onSearchInput() {
            render();

            const rawSearchQuery = document.getElementById('search-input').value.toLowerCase().trim();
            if (!rawSearchQuery) return;

            const katakanaQuery = hiraganaToKatakana(rawSearchQuery);
            const selectedOpen = Array.from(document.querySelectorAll('input[name="open-filter"]:checked')).map(cb => cb.value);
            const selectedVisit = Array.from(document.querySelectorAll('input[name="visit-filter"]:checked')).map(cb => cb.value);

            const matchedShops = shops.filter(shop => {
                if (shop.lat === undefined || shop.lng === undefined || isClosedShopExpired(shop)) return false;
                const isVisited = !!visitedState[shop.id];
                if (!selectedVisit.includes(isVisited ? 'visited' : 'unvisited')) return false;
                const status = getBusinessStatus(shop);
                let statusKey = status.type === 'preopen' ? 'closed' : status.type;
                if (!selectedOpen.includes(statusKey)) return false;

                const fullAddress = (typeof LG_CODES !== 'undefined' ? LG_CODES.getShopFullAddress(shop) : `${shop.addressText || ''}`).toLowerCase();
                const shopKana = shop.kana || '';

                return shop.name.toLowerCase().includes(rawSearchQuery) ||
                    fullAddress.includes(rawSearchQuery) ||
                    shopKana.includes(katakanaQuery) ||
                    shopKana.includes(rawSearchQuery);
            });

            if (matchedShops.length === 1) {
                const targetShop = matchedShops[0];
                if (markers[targetShop.id]) {
                    focusShopOnMap(targetShop.id);
                }
            }
        }

        function render() {
            const dateInput = document.getElementById('date-selector');
            const activeDate = getEffectiveDisplayDate();
            if (dateInput && !dateInput.value) {
                const minDate = getLocalDateKey(new Date());
                dateInput.min = minDate;
                dateInput.value = minDate;
                selectedDateKey = minDate;
            }
            if (dateInput) {
                dateInput.min = getLocalDateKey(new Date());
                const activeColorStyle = getDateDayColorStyle(activeDate);
                const colorMatch = activeColorStyle.match(/color:\s*([^;]+);/);
                if (colorMatch) {
                    dateInput.style.color = colorMatch[1];
                }
            }

            const grid = document.getElementById('shop-grid');

            grid.className = 'shop-grid';
            if (currentMainViewMode === 'today') {
                if (currentPeriodMode === '1') {
                    grid.classList.add('view-mode-today');
                } else {
                    grid.classList.add('view-mode-calendar');
                }
            } else {
                grid.classList.add('view-mode-' + currentDensityMode);
            }

            const fullGridShareBtn = document.getElementById('full-grid-share-btn');
            if (fullGridShareBtn) {
                let showFullShare = true;
                if (currentMainViewMode === 'today' && currentPeriodMode === '28shop') {
                    showFullShare = false;
                } else if (currentMainViewMode === 'realtime' && (currentDensityMode === 'compact' || currentDensityMode === 'detailed')) {
                    showFullShare = false;
                }
                fullGridShareBtn.style.display = showFullShare ? 'inline-flex' : 'none';
            }

            const rawSearchQuery = document.getElementById('search-input').value.toLowerCase().trim();
            const katakanaQuery = hiraganaToKatakana(rawSearchQuery);

            const selectedOpen = Array.from(document.querySelectorAll('input[name="open-filter"]:checked')).map(cb => cb.value);
            const selectedVisit = Array.from(document.querySelectorAll('input[name="visit-filter"]:checked')).map(cb => cb.value);

            const sortSelect = document.getElementById('sort-select');
            const sortType = sortSelect ? sortSelect.value : 'distance_center';

            grid.innerHTML = '';
            let displayShops = shops.filter(s => s.lat !== undefined && s.lng !== undefined && !isClosedShopExpired(s));

            const center = map.getCenter();
            displayShops.forEach(shop => {
                if (userCoords) {
                    shop.userDistance = calculateDistance(userCoords.lat, userCoords.lng, shop.lat, shop.lng);
                } else {
                    shop.userDistance = undefined;
                }
                shop.centerDistance = calculateDistance(center.lat, center.lng, shop.lat, shop.lng);

                if (markers[shop.id]) {
                    markers[shop.id].setPopupContent(generateCardContentHTML(shop, !!visitedState[shop.id], true));
                    markers[shop.id].setIcon(createIcon(shop, !!visitedState[shop.id]));
                }
            });

            if (sortType === "") {
                if (!customPreservedOrder) {
                    customPreservedOrder = [...displayShops].sort((a, b) => {
                        if (a.userDistance !== undefined && b.userDistance !== undefined) return a.userDistance - b.userDistance;
                        return a.centerDistance - b.centerDistance;
                    }).map(s => s.id);
                }
                const orderMap = new Map(customPreservedOrder.map((id, index) => [id, index]));
                displayShops.sort((a, b) => {
                    const indexA = orderMap.has(a.id) ? orderMap.get(a.id) : 9999;
                    const indexB = orderMap.has(b.id) ? orderMap.get(b.id) : 9999;
                    return indexA - indexB;
                });
            } else if (sortType === 'distance_user') {
                displayShops.sort((a, b) => {
                    if (a.userDistance === undefined && b.userDistance === undefined) return 0;
                    if (a.userDistance === undefined) return 1;
                    if (b.userDistance === undefined) return -1;
                    return a.userDistance - b.userDistance;
                });
            } else if (sortType === 'distance_center') {
                displayShops.sort((a, b) => a.centerDistance - b.centerDistance);
            } else if (sortType === 'pref') {
                displayShops.sort((a, b) => {
                    const cityA = a.cityCode || '';
                    const cityB = b.cityCode || '';
                    if (cityA !== cityB) {
                        return cityA.localeCompare(cityB);
                    }
                    const dateA = parseNormalizedDateStr(a.openedAt);
                    const dateB = parseNormalizedDateStr(b.openedAt);
                    if (dateA && dateB && dateA !== dateB) {
                        return dateA.localeCompare(dateB);
                    }
                    return (a.kana || a.name).localeCompare(b.kana || b.name, 'ja');
                });
            } else if (sortType === 'opened') {
                displayShops.sort((a, b) => {
                    const dateA = parseNormalizedDateStr(a.openedAt);
                    const dateB = parseNormalizedDateStr(b.openedAt);
                    if (!dateA) return 1;
                    if (!dateB) return -1;
                    return dateA.localeCompare(dateB);
                });
            } else if (sortType === 'hours') {
                displayShops.sort((a, b) => {
                    const shiftA = getNextShiftTimes(a);
                    const shiftB = getNextShiftTimes(b);

                    if (shiftA.startTime !== shiftB.startTime) {
                        return shiftA.startTime - shiftB.startTime;
                    }
                    if (shiftA.endTime !== shiftB.endTime) {
                        return shiftA.endTime - shiftB.endTime;
                    }
                    if (userCoords) {
                        if (a.userDistance !== undefined && b.userDistance !== undefined) {
                            return a.userDistance - b.userDistance;
                        }
                    }
                    return a.centerDistance - b.centerDistance;
                });
            } else if (sortType === 'name') {
                displayShops.sort((a, b) => (a.kana || a.name).localeCompare(b.kana || b.name, 'ja'));
            }

            const fragment = document.createDocumentFragment();
            let visibleShopCount = 0;
            const visibleShops = [];
            const isMatrixMode = (currentMainViewMode === 'today' && ['7', '14', '21', '28'].includes(currentPeriodMode));

            displayShops.forEach(shop => {
                const isVisited = !!visitedState[shop.id];
                const status = getBusinessStatus(shop, activeDate);
                const currentStatus = getBusinessStatus(shop, new Date());

                if (!selectedVisit.includes(isVisited ? 'visited' : 'unvisited')) {
                    updateMarkerVisibility(shop.id, false);
                    return;
                }

                let statusKey = currentStatus.type === 'preopen' ? 'closed' : currentStatus.type;
                if (!selectedOpen.includes(statusKey)) {
                    updateMarkerVisibility(shop.id, false);
                    return;
                }

                if (listSubMode === 'today' || currentMainViewMode === 'today') {
                    const selectedTodayOpen = Array.from(document.querySelectorAll('input[name="today-open-filter"]:checked')).map(cb => cb.value);
                    const shifts = getTodayShifts(shop, activeDate);
                    const isShopOpenOnDay = shifts && shifts.length > 0;
                    const shopTodayStatus = isShopOpenOnDay ? 'open' : 'closed';
                    if (!selectedTodayOpen.includes(shopTodayStatus)) {
                        updateMarkerVisibility(shop.id, false);
                        return;
                    }
                }

                const fullAddress = (typeof LG_CODES !== 'undefined' ? LG_CODES.getShopFullAddress(shop) : `${shop.addressText || ''}`).toLowerCase();
                const shopKana = shop.kana || '';

                if (rawSearchQuery) {
                    const isMatch = shop.name.toLowerCase().includes(rawSearchQuery) ||
                        fullAddress.includes(rawSearchQuery) ||
                        shopKana.includes(katakanaQuery) ||
                        shopKana.includes(rawSearchQuery);
                    if (!isMatch) {
                        updateMarkerVisibility(shop.id, false);
                        return;
                    }
                }

                updateMarkerVisibility(shop.id, true);
                visibleShopCount++;
                visibleShops.push(shop);

                if (isMatrixMode) {
                    return;
                }

                const item = document.createElement('div');
                const isTodayOpen = ['open', 'closing-soon', 'scheduled'].includes(status.type);

                const displayName = (shop.shortName && shop.shortName.trim()) ? shop.shortName.trim() : shop.name;

                if (currentMainViewMode === 'today' && currentPeriodMode === '1') {
                    // 日付指定 × 1日指定: 従来の「日別レイアウト」
                    item.onclick = (e) => {
                        if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') {
                            handleShopSelect(shop.id);
                        }
                    };
                    item.dataset.shopId = shop.id;
                    item.className = `shop-item ${isVisited ? 'visited' : ''} ${isTodayOpen ? 'today-open' : 'today-closed'}`;

                    const tempStatus = getTemporaryStatus(shop, activeDate);
                    const todayHoursData = (() => {
                        const shifts = getTodayShifts(shop, activeDate);
                        if (!shifts || shifts.length === 0) return { html: `<span>${formatShiftTimeText('休業', 'today')}</span>`, text: '休業' };
                        const plainText = shifts.map(([start, end]) => `${formatTime(start)}-${formatTime(end)}`).join(' / ');
                        const htmlContent = shifts.map(([start, end]) => {
                            return `<span>${formatShiftTimeText(`${formatTime(start)}-${formatTime(end)}`, 'today')}</span>`;
                        }).join('');
                        return { html: htmlContent, text: plainText };
                    })();

                    const textClass = tempStatus ? 'is-temp' : (isTodayOpen ? 'is-open' : 'is-closed');

                    item.innerHTML = `
                <div class="today-summary-card">
                    <div class="today-summary-name" title="${shop.name}">${displayName}</div>
                    <div class="today-hours-text ${textClass}" title="${todayHoursData.text}">${todayHoursData.html}</div>
                </div>
            `;
                } else if (listSubMode === 'minimal' || (currentMainViewMode === 'realtime' && currentDensityMode === 'minimal')) {
                    item.onclick = (e) => {
                        if (e.target.tagName !== 'BUTTON') handleShopSelect(shop.id);
                    };
                    const currentStatus = getBusinessStatus(shop, new Date());
                    item.className = `shop-item ${isVisited ? 'visited' : ''} current-${currentStatus.type}`;
                    const nextOpenHtml = getNextOpenScheduleText(shop, activeDate);
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = nextOpenHtml;
                    const nextOpenText = tempDiv.textContent || tempDiv.innerText || '';

                    item.innerHTML = `
                <div class="today-summary-card">
                    <div class="today-summary-name" title="${shop.name}">${displayName}</div>
                    <div class="today-hours-text" style="color: #ddd;" title="${nextOpenText}">${nextOpenHtml}</div>
                    <div style="display:flex; align-items:center; justify-content:center; width:100%;">
                        <button type="button" class="visit-toggle-btn-minimal ${isVisited ? 'is-visited' : ''}" onclick="toggleVisit('${shop.id}', false, event)" aria-label="${shop.name}の制覇状態を切り替え" style="background:none; border:none; color: ${isVisited ? 'var(--jiro-yellow)' : '#555'}; font-size: 0.9rem; padding: 0; cursor: pointer; line-height: 1; outline: none; flex-shrink: 0;">
                            ${isVisited ? '✔' : '☐'}
                        </button>
                    </div>
                </div>
            `;
                } else if (listSubMode === 'calendar' || (currentMainViewMode === 'today' && currentPeriodMode === '28_shop')) {
                    item.onclick = (e) => {
                        if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') {
                            handleShopSelect(shop.id);
                        }
                    };
                    item.dataset.shopId = shop.id;
                    const currentStatus = getBusinessStatus(shop, new Date());
                    item.className = `shop-item ${isVisited ? 'visited' : ''} current-${currentStatus.type}`;
                    
                    const calendarHtml = render28DaysCalendarTable(shop, activeDate);

                    let sortMetaHtml = '';
                    const sortSelect = document.getElementById('sort-select');
                    const sortVal = sortSelect ? sortSelect.value : '';

                    if (sortVal === 'distance_user' && shop.userDistance !== undefined) {
                        const distStr = `📍 現在地から ${formatDistance(shop.userDistance)}`;
                        sortMetaHtml = `<span class="distance-tag" style="font-size:0.75rem; white-space:nowrap; text-align:right; margin-left:auto;" title="${distStr}">${distStr}</span>`;
                    } else if (sortVal === 'distance_center' && shop.centerDistance !== undefined) {
                        const distStr = `📍 中心から ${formatDistance(shop.centerDistance)}`;
                        sortMetaHtml = `<span class="distance-tag" style="font-size:0.75rem; white-space:nowrap; text-align:right; margin-left:auto;" title="${distStr}">${distStr}</span>`;
                    } else if (sortVal === 'pref') {
                        const fullAddress = (typeof LG_CODES !== 'undefined' ? LG_CODES.getShopFullAddress(shop) : `${shop.addressText || ''}`).trim();
                        const gmapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('ラーメン二郎 ' + shop.name + ' ' + fullAddress)}`;
                        sortMetaHtml = `<a href="${gmapUrl}" target="_blank" rel="noopener noreferrer" class="gmap-link" onclick="event.stopPropagation();" style="font-size:0.75rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; flex:1 1 auto; text-align:right; margin-left:auto; font-weight:normal;" title="📍 ${fullAddress || '住所不明'} ↗">📍 ${fullAddress || '住所不明'} ↗</a>`;
                    } else if (sortVal === 'opened') {
                        const openedStr = formatOpenedDateText(shop.openedAt);
                        if (openedStr) {
                            sortMetaHtml = `<span style="font-size:0.75rem; color:#aaa; white-space:nowrap; flex-shrink:0; text-align:right; margin-left:auto;" title="${openedStr}">${openedStr}</span>`;
                        }
                    } else if (sortVal === 'hours') {
                        const nextScheduleHtml = getNextOpenScheduleText(shop, new Date());
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = nextScheduleHtml;
                        const nextScheduleText = tempDiv.textContent || tempDiv.innerText || '';
                        sortMetaHtml = `<span style="font-size:0.75rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; flex:1 1 auto; text-align:right; margin-left:auto;" title="${nextScheduleText}">${nextScheduleHtml}</span>`;
                    } else if (sortVal === 'name') {
                        sortMetaHtml = '';
                    }

                    item.innerHTML = `
                        <div class="shop-info" data-shop-id="${shop.id}">
                            <div class="shop-header-row" style="margin-bottom: 2px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
                                <div class="shop-title-wrapper" style="display:flex; align-items:center; gap:6px; flex:1; min-width:0; overflow:hidden; justify-content:space-between;">
                                    <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                                        <span class="shop-name" style="white-space:nowrap;">${shop.name}</span>
                                        <button type="button" class="sns-share-btn" onclick="shareCalendarCardImage('${shop.id}', event)" aria-label="SNSに画像付きでシェア" title="SNSに画像付きでシェア"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg></button>
                                    </div>
                                    ${sortMetaHtml}
                                </div>
                            </div>
                            <div>
                                ${calendarHtml}
                            </div>
                        </div>
                    `;
                } else {
                    item.onclick = (e) => {
                        if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') {
                            handleShopSelect(shop.id);
                        }
                    };
                    const currentStatus = getBusinessStatus(shop, new Date());
                    item.className = `shop-item ${isVisited ? 'visited' : ''} current-${currentStatus.type}`;
                    item.innerHTML = generateCardContentHTML(shop, isVisited, false);

                    const detailedContent = item.querySelector('.detailed-content');
                    if (detailedContent) {
                        if (listSubMode === 'detailed') {
                            detailedContent.style.display = 'flex';
                        } else if (listSubMode === 'compact') {
                            detailedContent.style.display = 'none';
                        }
                    }
                }

                fragment.appendChild(item);
            });

            const containerEl = grid.closest('.container');
            if (containerEl) {
                if (isMatrixMode) {
                    containerEl.style.overflow = 'hidden';
                    containerEl.style.padding = '0';
                } else {
                    containerEl.style.overflow = '';
                    containerEl.style.padding = '';
                }
            }

            if (isMatrixMode) {
                grid.innerHTML = renderMatrixScheduleTable(visibleShops, activeDate, parseInt(currentPeriodMode, 10));
            } else {
                grid.appendChild(fragment);
            }
            updateVisibleCount(visibleShopCount);
            updateStats();
            setTimeout(updateMatrixWrapperHeight, 30);
        }

        function getDateDayColorStyle(dateObj) {
            if (isJapaneseHoliday(dateObj) || dateObj.getDay() === 0) {
                return 'color: var(--jiro-red);';
            } else if (dateObj.getDay() === 6) {
                return 'color: #60a5fa;';
            }
            return 'color: #ffffff;';
        }

        function renderMatrixScheduleTable(displayShops, startDate, daysCount) {
            const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
            const baseDate = new Date(startDate);
            const dates = [];

            for (let i = 0; i < daysCount; i++) {
                const targetDate = new Date(baseDate);
                targetDate.setDate(baseDate.getDate() + i);
                const month = targetDate.getMonth() + 1;
                const dateNum = targetDate.getDate();
                const dayOfWeek = dayNames[targetDate.getDay()];
                dates.push({ dateObj: targetDate, label: `${month}/${dateNum}(${dayOfWeek})` });
            }

            let thsHtml = dates.map(d => {
                const dayColorStyle = getDateDayColorStyle(d.dateObj);
                const dStr = getLocalDateKey(d.dateObj);
                return `<th style="padding: 3px 3px; min-width: 52px; box-sizing: border-box; border: none; background-color: #1a1a1a; ${dayColorStyle} font-size: 0.62rem; font-weight: normal; white-space: nowrap; position: sticky; top: 0; z-index: 10; cursor: pointer; text-align: center; line-height: 1.1;" title="${d.label} の1日表示を表示" onclick="switchToTodayView('${dStr}')">${d.label}</th>`;
            }).join('');

            let rowsHtml = '';
            displayShops.forEach(shop => {
                const displayName = (shop.shortName && shop.shortName.trim()) ? shop.shortName.trim() : shop.name;

                // 昼夜2部営業（2行）の標準高さを基準に動的適用（視認性と縦横バランスを両立）
                let maxShiftsInShopRow = 2;
                dates.forEach(d => {
                    const shifts = getTodayShifts(shop, d.dateObj);
                    if (shifts && shifts.length > maxShiftsInShopRow) {
                        maxShiftsInShopRow = shifts.length;
                    }
                });

                const cellMinHeight = Math.max(32, 10 + (maxShiftsInShopRow * 11));

                let tdsHtml = dates.map(d => {
                    const tempStatus = getTemporaryStatus(shop, d.dateObj);
                    const shifts = getTodayShifts(shop, d.dateObj);
                    const isShopOpenOnDay = !!(shifts && shifts.length > 0 && !isPreOpen(shop, d.dateObj));
                    
                    let hoursHtml = '';
                    let plainText = '休業';
                    if (!shifts || shifts.length === 0) {
                        hoursHtml = `<span style="white-space: nowrap; line-height: 1.05; display: inline-block;">${formatShiftTimeText('休業', 'calendar')}</span>`;
                    } else {
                        plainText = shifts.map(([s, e]) => `${formatTime(s)}-${formatTime(e)}`).join(' / ');
                        hoursHtml = shifts.map(([s, e]) => `<span style="white-space: nowrap; line-height: 1.05; display: inline-block;">${formatShiftTimeText(`${formatTime(s)}-${formatTime(e)}`, 'calendar')}</span>`).join('');
                    }

                    const textClass = tempStatus ? 'is-temp' : (isShopOpenOnDay ? 'is-open' : 'is-closed');
                    const bgBorderClass = isShopOpenOnDay ? 'today-open' : 'today-closed';

                    return `
                        <td style="padding: 0; min-width: 52px; box-sizing: border-box; border: none; vertical-align: middle; text-align: center;">
                            <div class="calendar-cell ${bgBorderClass}" style="padding: 2px 2px; height: ${cellMinHeight}px; min-height: ${cellMinHeight}px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; border-radius: 4px; cursor: pointer;" title="${shop.name} の詳細情報を表示" onclick="handleShopSelect('${shop.id}')">
                                <div class="today-summary-card">
                                    <div class="today-hours-text ${textClass}" style="font-size: 0.64rem; line-height: 1.05;" title="${plainText}">${hoursHtml}</div>
                                </div>
                            </div>
                        </td>
                    `;
                }).join('');

                rowsHtml += `
                    <tr>
                        <td style="padding: 3px 3px; width: 72px; min-width: 72px; max-width: 72px; box-sizing: border-box; border: none; background-color: #1e1e1e; font-weight: normal; text-align: center; color: var(--jiro-yellow); font-size: 0.62rem; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; position: sticky; left: 0; z-index: 5; cursor: pointer;" title="${shop.name}" onclick="handleShopSelect('${shop.id}')">
                            ${displayName}
                        </td>
                        ${tdsHtml}
                    </tr>
                `;
            });

            return `
                <div class="matrix-schedule-wrapper" style="grid-column: 1 / -1; width: 100%; height: auto; max-height: calc(100vh - 175px); overflow-x: auto; overflow-y: auto; border: none; border-radius: 6px; background: #141414;">
                    <table style="width: 100%; min-width: max-content; table-layout: fixed; border-collapse: separate; border-spacing: 3px 3px; border: none; font-family: inherit;">
                        <thead>
                            <tr>
                                <th style="padding: 3px 3px; width: 72px; min-width: 72px; max-width: 72px; box-sizing: border-box; border: none; background-color: #1a1a1a; position: sticky; top: 0; left: 0; z-index: 20;"></th>
                                ${thsHtml}
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            `;
        }

        function updateMarkerVisibility(shopId, isVisible) {
            if (markers[shopId]) {
                if (isVisible && !map.hasLayer(markers[shopId])) map.addLayer(markers[shopId]);
                else if (!isVisible && map.hasLayer(markers[shopId])) map.removeLayer(markers[shopId]);
            }
        }

        function locateAndFitToNearest(lat, lng, forceMove = false) {
            userCoords = { lat, lng };
            updateLocationButtonUI(true);

            if (userMarker) userMarker.setLatLng([lat, lng]);
            else userMarker = L.marker([lat, lng], { icon: L.divIcon({ className: 'custom-icon', html: '<div class="user-location-pin"></div>', iconSize: [16, 16] }) }).addTo(map);

            let nearestShop = null;
            let minDistance = Infinity;

            shops.forEach(shop => {
                if (shop.lat !== undefined && shop.lng !== undefined && !isClosedShopExpired(shop)) {
                    const dist = calculateDistance(lat, lng, shop.lat, shop.lng);
                    shop.userDistance = dist;
                    if (dist < minDistance) {
                        minDistance = dist;
                        nearestShop = shop;
                    }
                }
            });

            if (forceMove || !userHasInteractedWithMap) {
                isProgrammaticMove = true;

                if (nearestShop && nearestShop.lat !== undefined && nearestShop.lng !== undefined) {
                    const bounds = L.latLngBounds([
                        [lat, lng],
                        [nearestShop.lat, nearestShop.lng]
                    ]);
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });

                    setTimeout(() => {
                        isProgrammaticMove = false;
                        if (markers[nearestShop.id]) {
                            markers[nearestShop.id].openPopup();
                        }
                        map.invalidateSize();
                    }, 500);
                } else {
                    map.flyTo([lat, lng], 13);
                    setTimeout(() => {
                        isProgrammaticMove = false;
                        map.invalidateSize();
                    }, 500);
                }
            }

            updateSortDropdownOptions();

            render();
        }

        function requestUserLocation(silent = false, isUserClick = false) {
            if (!navigator.geolocation) {
                if (!silent) alert("お使いのブラウザは位置情報に対応していません。");
                return;
            }

            if (isUserClick) {
                userHasInteractedWithMap = false;
            }

            navigator.geolocation.getCurrentPosition(
                pos => locateAndFitToNearest(pos.coords.latitude, pos.coords.longitude, isUserClick),
                err => {
                    updateLocationButtonUI(false);
                    if (!silent) {
                        let msg = "現在地の取得に失敗しました。";
                        if (err.code === err.PERMISSION_DENIED) msg = "位置情報の利用が許可されていません。";
                        else if (err.code === err.TIMEOUT) msg = "位置情報の取得がタイムアウトしました。";
                        alert(msg);
                    }
                },
                geoOptions
            );
        }

        const GlobalViewControl = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd: function () {
                const btn = L.DomUtil.create('button', 'global-view-btn');
                btn.setAttribute('type', 'button');
                btn.setAttribute('aria-label', '全国表示');
                btn.setAttribute('data-tooltip', '全国表示');
                btn.title = '全国表示';
                btn.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon>
                <line x1="9" y1="3" x2="9" y2="18"></line>
                <line x1="15" y1="6" x2="15" y2="21"></line>
            </svg>
        `;
                btn.onclick = function (e) {
                    e.stopPropagation();
                    fitMapToAllShops();
                };
                return btn;
            }
        });

        const LocationControl = L.Control.extend({
            options: { position: 'bottomright' },
            onAdd: function () {
                const btn = L.DomUtil.create('button', 'location-btn is-visible');
                locationBtnElement = btn;
                btn.setAttribute('aria-label', '現在地');
                btn.setAttribute('data-tooltip', '現在地');
                btn.title = '現在地';
                btn.innerHTML = `
            <svg class="location-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="3"></circle>
                <line x1="12" y1="1" x2="12" y2="4"></line>
                <line x1="12" y1="20" x2="12" y2="23"></line>
                <line x1="1" y1="12" x2="4" y2="12"></line>
                <line x1="20" y1="12" x2="23" y2="12"></line>
            </svg>
        `;
                btn.onclick = function (e) {
                    e.stopPropagation();
                    requestUserLocation(false, true);
                };
                return btn;
            }
        });

        function initResizer() {
            const resizer = document.getElementById('drag-resizer');
            const sidebar = document.getElementById('sidebar-container');
            let isDragging = false;

            function handleStart(e) {
                isDragging = true;
                resizer.classList.add('is-dragging');
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
            }

            function handleMove(clientX) {
                if (!isDragging) return;
                const containerWidth = document.querySelector('.content-area').clientWidth;
                let newSidebarWidth = containerWidth - clientX;

                const minW = (listSubMode === 'minimal') ? 160 : 340;
                if (newSidebarWidth < minW) newSidebarWidth = minW;
                if (newSidebarWidth > containerWidth - 250) newSidebarWidth = containerWidth - 250;

                sidebar.style.width = newSidebarWidth + 'px';
                map.invalidateSize();
            }

            function handleEnd() {
                if (isDragging) {
                    isDragging = false;
                    resizer.classList.remove('is-dragging');
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                }
            }

            // マウスイベント
            resizer.addEventListener('mousedown', handleStart);
            document.addEventListener('mousemove', (e) => handleMove(e.clientX));
            document.addEventListener('mouseup', handleEnd);

            // タッチスクリーン（スマホ）対応イベント
            resizer.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) handleStart(e.touches[0]);
            }, { passive: true });

            document.addEventListener('touchmove', (e) => {
                if (isDragging && e.touches.length === 1) {
                    handleMove(e.touches[0].clientX);
                }
            }, { passive: true });

            document.addEventListener('touchend', handleEnd);
            document.addEventListener('touchcancel', handleEnd);
        }

        function initDateSelector() {
            const dateInput = document.getElementById('date-selector');
            if (!dateInput) return;
            const minDate = getLocalDateKey(new Date());
            dateInput.min = minDate;
            dateInput.value = selectedDateKey || minDate;
            selectedDateKey = dateInput.value;

            const handler = (event) => {
                const nextValue = event.target.value || minDate;
                setSelectedDate(nextValue);
            };
            dateInput.addEventListener('change', handler);
            dateInput.addEventListener('input', handler);
        }

        function showLoadingOverlay(msg = '店舗情報を読み込み中...') {
            const overlay = document.getElementById('app-loading-overlay');
            const spinner = document.getElementById('app-loading-spinner');
            const text = document.getElementById('app-loading-text');
            const errorAction = document.getElementById('app-loading-error-action');
            if (overlay) {
                overlay.classList.remove('is-hidden');
            }
            if (spinner) spinner.style.display = 'block';
            if (text) {
                text.textContent = msg;
                text.style.color = '#e0e0e0';
            }
            if (errorAction) errorAction.style.display = 'none';
        }

        function hideLoadingOverlay() {
            const overlay = document.getElementById('app-loading-overlay');
            if (overlay) {
                overlay.classList.add('is-hidden');
            }
        }

        function showLoadingError(msg) {
            const overlay = document.getElementById('app-loading-overlay');
            const spinner = document.getElementById('app-loading-spinner');
            const text = document.getElementById('app-loading-text');
            const errorAction = document.getElementById('app-loading-error-action');
            if (overlay) overlay.classList.remove('is-hidden');
            if (spinner) spinner.style.display = 'none';
            if (text) {
                text.textContent = msg || '店舗情報の読み込みに失敗しました。';
                text.style.color = 'var(--jiro-red)';
            }
            if (errorAction) errorAction.style.display = 'block';
        }

        async function initApp() {
            showLoadingOverlay();

            if (!isAppInitialized) {
                map.addControl(new GlobalViewControl());
                map.addControl(new LocationControl());
                initDateSelector();
            }

            try {
                if (typeof LG_CODES !== 'undefined' && LG_CODES.fetchExternalData) {
                    await LG_CODES.fetchExternalData();
                }
                const isLocalEnv = window.location.protocol === 'file:' || 
                                   window.location.hostname === 'localhost' || 
                                   window.location.hostname === '127.0.0.1';
                const url = isLocalEnv ? 'shops.json' : 'shops.json?t=' + Date.now();
                const fetchOptions = isLocalEnv ? {} : { cache: 'no-cache' };
                const response = await fetch(url, fetchOptions);
                if (!response.ok) throw new Error('読み込み失敗');
                shops = (await response.json()).filter(shop => !isClosedShopExpired(shop));
                window.shops = shops;
            } catch (error) {
                console.error(error);
                const grid = document.getElementById('shop-grid');
                if (grid) {
                    grid.innerHTML = `
                        <div style="grid-column: 1 / -1; padding: 20px; text-align: center; color: var(--jiro-red); font-weight: bold; font-family: sans-serif; font-size: 0.85rem; line-height: 1.6;">
                            店舗情報の読み込みに失敗しました。<br>
                            通信環境を確認の上、再試行してください。<br><br>
                            <button type="button" onclick="initApp()" style="padding: 6px 16px; background-color: var(--jiro-yellow); color: #000; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; outline: none; font-size: 0.8rem;">再読み込み</button>
                        </div>
                    `;
                }
                showLoadingError('店舗情報の読み込みに失敗しました。\n通信環境を確認の上、再試行してください。');
                return;
            }

            let mitaShopId = null;

            const currentShopIds = new Set(shops.map(s => s.id));
            for (const key in markers) {
                if (Object.hasOwn(markers, key) && !currentShopIds.has(key)) {
                    if (markers[key]) {
                        map.removeLayer(markers[key]);
                        delete markers[key];
                    }
                }
            }

            shops.forEach(shop => {
                if (shop.lat && shop.lng) {
                    const isVisited = !!visitedState[shop.id];
                    const icon = createIcon(shop, isVisited);
                    const popupHtml = generateCardContentHTML(shop, isVisited, true);

                    if (markers[shop.id]) {
                        markers[shop.id].setLatLng([shop.lat, shop.lng]);
                        markers[shop.id].setIcon(icon);
                        markers[shop.id].setPopupContent(popupHtml);
                    } else {
                        const marker = L.marker([shop.lat, shop.lng], { icon: icon }).addTo(map);
                        marker.bindPopup(popupHtml, {
                            minWidth: 360,
                            maxWidth: 440,
                            autoPan: true
                        });
                        markers[shop.id] = marker;
                    }

                    if (shop.id === 'mita' || shop.name.includes("三田本店")) {
                        mitaShopId = shop.id;
                    }
                }
            });

            updateLayout();
            render();

            if (mitaShopId && markers[mitaShopId]) {
                markers[mitaShopId].openPopup();
            }

            if (!isAppInitialized) {
                if ("geolocation" in navigator) {
                    requestUserLocation(true, false);
                } else {
                    updateSortDropdownOptions();
                }
                initResizer();
            }

            isAppInitialized = true;
            window.isAppInitialized = true;
            window.shops = shops;
            window.renderMatrixScheduleTable = renderMatrixScheduleTable;
            setTimeout(() => {
                map.invalidateSize();
                hideLoadingOverlay();
            }, 100);
        }

        window.addEventListener('resize', () => {
            updateLayout();
            setTimeout(updateMatrixWrapperHeight, 30);
        });

        window.addEventListener('DOMContentLoaded', initApp);
