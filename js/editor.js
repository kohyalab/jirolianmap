class EditorApp {
    constructor() {
        this.shops = [];
        this.selectedId = null;
        this.currentMode = 'single';
        this.currentTemporary = [];
        this.currentHolidaySpecialShifts = [];
        this.currentSpecialShifts = [];
        this.githubFileSha = null;
        this.pendingSaveContext = null;

        this.el = {
            fileInput: document.getElementById('file-input'),
            exportBtn: document.getElementById('btn-export'),
            searchInput: document.getElementById('search-input'),
            shopCountHeader: document.getElementById('shop-count-header'),
            summaryShopCount: document.getElementById('summary-shop-count'),
            shopList: document.getElementById('shop-list'),
            addBtn: document.getElementById('btn-add'),
            noSelection: document.getElementById('no-selection'),
            form: document.getElementById('shop-form'),
            saveBtn: document.getElementById('btn-save'),
            deleteBtn: document.getElementById('btn-delete'),
            duplicateBtn: document.getElementById('btn-duplicate'),
            kanaInput: document.getElementById('field-kana'),
            prefCodeInput: document.getElementById('field-prefCode'),
            cityCodeInput: document.getElementById('field-cityCode'),
            xInput: document.getElementById('field-x'),
            instaInput: document.getElementById('field-instagram'),
            addressInput: document.getElementById('field-addressText'),
            latInput: document.getElementById('field-lat'),
            lngInput: document.getElementById('field-lng'),
            singleMapLink: document.getElementById('single-map-link'),
            singleGMapSearchLink: document.getElementById('single-gmap-search-link'),
            singleXLink: document.getElementById('single-x-link'),
            singleInstaLink: document.getElementById('single-insta-link'),
            singlePcLink: document.getElementById('single-pc-link'),
            singleRdbLink: document.getElementById('single-rdb-link'),
            singleTabelogLink: document.getElementById('single-tabelog-link'),
            tabSingle: document.getElementById('tab-single'),
            tabBulk: document.getElementById('tab-bulk'),
            viewSingle: document.getElementById('view-single'),
            viewBulk: document.getElementById('view-bulk'),
            bulkTargetField: document.getElementById('bulk-target-field'),
            bulkTableBody: document.getElementById('bulk-table-body'),
            bulkFieldHeader: document.getElementById('bulk-field-header'),
            bulkSaveBtn: document.getElementById('btn-bulk-save'),
            tempContainer: document.getElementById('temporary-list-container'),
            addTempBtn: document.getElementById('btn-add-temp'),
            holidaySpecialContainer: document.getElementById('holiday-special-shifts-container'),
            addHolidaySpecialBtn: document.getElementById('btn-add-holiday-special-shift'),
            specialContainer: document.getElementById('special-shifts-container'),
            addSpecialBtn: document.getElementById('btn-add-special'),
            chkFollowWeekday: document.getElementById('chk-follow-weekday'),
            shiftHolInput: document.getElementById('shift-hol'),
            openedAtInput: document.getElementById('field-openedAt'),
            closedAtInput: document.getElementById('field-closedAt'),
            sidebarDetails: document.getElementById('sidebar-details'),
            githubModal: document.getElementById('github-modal'),
            btnGithubPull: document.getElementById('btn-github-pull'),
            btnGithubPush: document.getElementById('btn-github-push'),
            btnGithubConfig: document.getElementById('btn-github-config'),
            diffModal: document.getElementById('diff-modal'),
            diffModalBody: document.getElementById('diff-modal-body'),
            tabPending: document.getElementById('tab-pending'),
            pendingBadge: document.getElementById('pending-badge'),
            viewPending: document.getElementById('view-pending'),
            pendingCountTag: document.getElementById('pending-count-tag'),
            pendingListContainer: document.getElementById('pending-list-container'),
            imagePreviewModal: document.getElementById('image-preview-modal'),
            imagePreviewImg: document.getElementById('image-preview-img'),
            imagePreviewTitle: document.getElementById('image-preview-title'),
            skippedListContainer: document.getElementById('skipped-list-container'),
            skippedCountTag: document.getElementById('skipped-count-tag'),
            aiRulesModal: document.getElementById('ai-rules-modal'),
            aiRulesList: document.getElementById('ai-rules-list'),
            aiRulesRawJson: document.getElementById('ai-rules-raw-json'),
            aiRulesSaveStatus: document.getElementById('ai-rules-save-status')
        };

        this.pendingUpdates = [];
        this.manualAiImages = [];
        this.aiGuidelines = null;
        this.initPrefOptions();
        this.bindEvents();
        this.loadGithubConfigUI();
        this.loadPendingUpdates();
        this.loadAiGuidelines();
        this.initManualAiPanel();
        if (typeof LG_CODES !== 'undefined' && LG_CODES.fetchExternalData) {
            LG_CODES.fetchExternalData().then(() => {
                this.initPrefOptions();
                if (this.selectedId) {
                    const shop = this.shops.find(s => s.id === this.selectedId);
                    if (shop) {
                        const prefCode = typeof LG_CODES !== 'undefined' ? LG_CODES.getPrefCodeByCityCode(shop.cityCode) : '';
                        if (this.el.prefCodeInput) this.el.prefCodeInput.value = prefCode;
                        this.updateCityOptions(prefCode, shop.cityCode || '');
                    }
                }
                if (this.currentMode === 'bulk') this.renderBulkTable();
            });
        }
    }

    initPrefOptions() {
        if (!this.el.prefCodeInput || typeof LG_CODES === 'undefined') return;
        const currentPref = this.el.prefCodeInput.value;
        let html = '<option value="">選択</option>';
        for (const code in LG_CODES.prefs) {
            html += `<option value="${code}">${LG_CODES.prefs[code]}</option>`;
        }
        this.el.prefCodeInput.innerHTML = html;
        if (currentPref) this.el.prefCodeInput.value = currentPref;
    }

    handlePrefSelectChange() {
        const prefCode = this.el.prefCodeInput.value;
        this.updateCityOptions(prefCode, '');
        this.updateSingleGMapSearchLink();
    }

    updateCityOptions(prefCode, selectedCityCode = '') {
        if (!this.el.cityCodeInput || typeof LG_CODES === 'undefined') return;
        let html = '<option value="">選択</option>';
        if (prefCode) {
            const cities = LG_CODES.getCitiesByPref(prefCode);
            for (const cCode in cities) {
                html += `<option value="${cCode}">${cities[cCode]}</option>`;
            }
        }
        this.el.cityCodeInput.innerHTML = html;
        this.el.cityCodeInput.value = selectedCityCode || '';
    }

    openDiffModal() {
        if (this.el.diffModal) this.el.diffModal.classList.add('active');
    }

    closeDiffModal() {
        if (this.el.diffModal) this.el.diffModal.classList.remove('active');
    }

    confirmSave() {
        if (this.pendingSaveContext) {
            if (this.pendingSaveContext.mode === 'single' && this.pendingSaveContext.draftShop) {
                const draft = JSON.parse(JSON.stringify(this.pendingSaveContext.draftShop));
                const targetId = this.pendingSaveContext.targetId;

                let shopIndex = this.shops.findIndex(s => s.id === targetId || s.id === draft.id);
                if (shopIndex >= 0) {
                    this.shops[shopIndex] = draft;
                } else {
                    this.shops.push(draft);
                }
                this.selectedId = draft.id;
                this.sortShopsByOpenedAt();
                this.renderList();
                this.selectShop(draft.id);
                alert('変更内容を保存しました。');
            } else if (this.pendingSaveContext.mode === 'bulk' && this.pendingSaveContext.draftShops) {
                this.shops = JSON.parse(JSON.stringify(this.pendingSaveContext.draftShops));
                this.sortShopsByOpenedAt();
                this.renderList();
                if (this.currentMode === 'bulk') this.renderBulkTable();
                alert('一括編集した内容を保存しました。');
            }
            this.pendingSaveContext = null;
        }
        this.closeDiffModal();
    }

    revertChanges() {
        if (this.pendingSaveContext) {
            if (this.pendingSaveContext.targetId && this.currentMode === 'single') {
                this.selectShop(this.pendingSaveContext.targetId);
            } else if (this.currentMode === 'bulk') {
                this.renderBulkTable();
            }
            this.pendingSaveContext = null;
            alert('編集内容を破棄し、保存前の状態に戻しました。');
        }
        this.closeDiffModal();
    }

    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    formatDiffValue(key, val) {
        if (val === null || val === undefined || val === '') return '(なし)';
        if (key === 'temporary') {
            if (Array.isArray(val) && val.length > 0) {
                return val.map(t => {
                    const s = t.startDate || t.date || '';
                    const e = t.endDate ? `～ ${t.endDate}` : '～ 未定';
                    const h = this.formatShiftArray(t.hours) || '休業';
                    return `${s} ${e} [${h}]`;
                }).join(' / ');
            }
            return '(なし)';
        }
        if (key === 'shiftsByDay') {
            if (!val) return '(設定なし)';
            const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
            const parts = [];
            for (let i = 0; i <= 6; i++) {
                const s = this.formatShiftArray(val[i]);
                if (s) parts.push(`${dayNames[i]}:${s}`);
            }
            return parts.length > 0 ? parts.join(', ') : '(全日定休/未設定)';
        }
        if (key === 'holidayShifts') {
            if (val === null) return '平日準拠';
            return this.formatShiftArray(val) || '(定休)';
        }
        if (key === 'specialShifts') {
            if (Array.isArray(val) && val.length > 0) {
                const weeks = {1:'第1', 2:'第2', 3:'第3', 4:'第4', 5:'第5', '-1':'最終'};
                const days = {1:'月', 2:'火', 3:'水', 4:'木', 5:'金', 6:'土', 0:'日'};
                return val.map(s => `${weeks[s.week]||''}${days[s.day]||''}曜:${this.formatShiftArray(s.hours)||'休業'}`).join(' / ');
            }
            return '(なし)';
        }
        if (key === 'holidaySpecialShifts') {
            if (Array.isArray(val) && val.length > 0) {
                const days = {1:'月', 2:'火', 3:'水', 4:'木', 5:'金', 6:'土', 0:'日'};
                return val.map(s => `${days[s.triggerDay]||''}曜祝日(${s.targetOffset===0?'当日':'翌日'}):${this.formatShiftArray(s.hours)||'定休'}`).join(' / ');
            }
            return '(なし)';
        }
        if (typeof val === 'object') {
            return JSON.stringify(val);
        }
        return String(val);
    }

    normalizeValueForDiff(key, val) {
        if (val === null || val === undefined || val === '') return '';
        if (Array.isArray(val)) {
            if (val.length === 0) return '';
            return JSON.stringify(val);
        }
        if (key === 'shiftsByDay' && typeof val === 'object') {
            let hasVal = false;
            for (let k in val) {
                if (Array.isArray(val[k]) && val[k].length > 0) hasVal = true;
            }
            if (!hasVal) return '';
            return JSON.stringify(val);
        }
        if (typeof val === 'object') {
            return JSON.stringify(val);
        }
        return String(val).trim();
    }

    getTemporaryDiffText(oldTemp, newTemp) {
        const oldArr = Array.isArray(oldTemp) ? oldTemp : [];
        const newArr = Array.isArray(newTemp) ? newTemp : [];

        const formatTempItem = (t) => {
            const s = t.startDate || t.date || '';
            const e = t.endDate ? `～ ${t.endDate}` : (t.startDate ? '～ 未定' : '');
            const h = this.formatShiftArray(t.hours) || '休業';
            return `${s} ${e} [${h}]`.trim();
        };

        const oldMap = new Map();
        oldArr.forEach(t => {
            const key = (t.startDate || t.date || '') + '_' + (t.endDate || '');
            oldMap.set(key, t);
        });

        const newMap = new Map();
        newArr.forEach(t => {
            const key = (t.startDate || t.date || '') + '_' + (t.endDate || '');
            newMap.set(key, t);
        });

        const diffStrings = [];

        newArr.forEach(t => {
            const key = (t.startDate || t.date || '') + '_' + (t.endDate || '');
            const oldItem = oldMap.get(key);
            if (!oldItem) {
                diffStrings.push(`追加 ${formatTempItem(t)}`);
            } else if (JSON.stringify(oldItem) !== JSON.stringify(t)) {
                diffStrings.push(`変更 ${formatTempItem(t)}`);
            }
        });

        oldArr.forEach(t => {
            const key = (t.startDate || t.date || '') + '_' + (t.endDate || '');
            if (!newMap.has(key)) {
                const s = t.startDate || t.date || '';
                const e = t.endDate ? `～ ${t.endDate}` : (t.startDate ? '～ 未定' : '');
                diffStrings.push(`削除 ${s} ${e}`.trim());
            }
        });

        if (diffStrings.length === 0) return '(差分なし)';
        return diffStrings.join(' / ');
    }

    getShopsDiffList(beforeShops, afterShops) {
        const beforeMap = new Map(beforeShops.map(s => [s.id, s]));
        const afterMap = new Map(afterShops.map(s => [s.id, s]));
        const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);

        const result = [];
        const fieldLabels = {
            name: '店舗名',
            id: 'ID',
            kana: 'フリガナ',
            shortName: '店舗名略称',
            prefecture: '都道府県',
            addressText: '住所',
            lat: '緯度',
            lng: '経度',
            openedAt: '開店日',
            closedAt: '閉店日',
            'urls.pc': 'PC店 URL',
            'urls.rdb': 'RDB URL',
            'urls.tabelog': '食べログ URL',
            x: '𝕏 ID',
            instagram: 'Instagram ID',
            ticketTiming: '食券 Timing',
            soupType: 'スープ',
            renge: 'レンゲ',
            takeout: 'テイクアウト',
            hoursNotes: '営業時間補足',
            remarks: '備考',
            temporary: '臨時営業・休業設定',
            shiftsByDay: '営業時間シフト設定',
            holidayShifts: '祝日シフト',
            specialShifts: '特定週・曜日の設定',
            holidaySpecialShifts: '祝日特別シフト'
        };

        allIds.forEach(id => {
            const oldShop = beforeMap.get(id);
            const newShop = afterMap.get(id);

            if (!oldShop && newShop) {
                result.push({
                    shopId: id,
                    shopName: newShop.name || id,
                    changes: [{
                        field: 'shop',
                        label: '新規店舗追加',
                        isTemp: false,
                        oldValStr: '(なし)',
                        newValStr: '追加されました'
                    }]
                });
                return;
            }

            if (oldShop && !newShop) {
                result.push({
                    shopId: id,
                    shopName: oldShop.name || id,
                    changes: [{
                        field: 'shop',
                        label: '店舗削除',
                        isTemp: false,
                        oldValStr: '削除前',
                        newValStr: '(削除されました)'
                    }]
                });
                return;
            }

            const changes = [];
            const checkKeys = [
                'id', 'name', 'kana', 'shortName', 'prefecture', 'addressText', 'lat', 'lng',
                'openedAt', 'closedAt', 'x', 'instagram', 'ticketTiming', 'soupType',
                'renge', 'takeout', 'hoursNotes', 'remarks', 'temporary', 'shiftsByDay',
                'holidayShifts', 'specialShifts', 'holidaySpecialShifts'
            ];

            checkKeys.forEach(key => {
                const oldVal = oldShop[key];
                const newVal = newShop[key];
                const normOld = this.normalizeValueForDiff(key, oldVal);
                const normNew = this.normalizeValueForDiff(key, newVal);
                if (normOld !== normNew) {
                    const newValStr = key === 'temporary'
                        ? this.getTemporaryDiffText(oldVal, newVal)
                        : this.formatDiffValue(key, newVal);
                    changes.push({
                        field: key,
                        label: fieldLabels[key] || key,
                        isTemp: key === 'temporary',
                        oldValStr: this.formatDiffValue(key, oldVal),
                        newValStr: newValStr
                    });
                }
            });

            const oldUrls = oldShop.urls || {};
            const newUrls = newShop.urls || {};
            ['pc', 'rdb', 'tabelog'].forEach(subKey => {
                const oldVal = oldUrls[subKey];
                const newVal = newUrls[subKey];
                const normOld = this.normalizeValueForDiff(`urls.${subKey}`, oldVal);
                const normNew = this.normalizeValueForDiff(`urls.${subKey}`, newVal);
                if (normOld !== normNew) {
                    const fullKey = `urls.${subKey}`;
                    changes.push({
                        field: fullKey,
                        label: fieldLabels[fullKey] || fullKey,
                        isTemp: false,
                        oldValStr: this.formatDiffValue(fullKey, oldVal),
                        newValStr: this.formatDiffValue(fullKey, newVal)
                    });
                }
            });

            if (changes.length > 0) {
                result.push({
                    shopId: id,
                    shopName: newShop.name || oldShop.name || id,
                    changes
                });
            }
        });

        return result;
    }

    showSaveDiffModal(beforeShops, afterShops, targetId = null) {
        let diffs = this.getShopsDiffList(beforeShops, afterShops);
        if (targetId) {
            diffs = diffs.filter(d => d.shopId === targetId);
        }
        if (diffs.length === 0) {
            alert('変更箇所はありません。');
            return;
        }

        let hasNonTempChange = false;
        let html = '<div class="diff-list">';

        diffs.forEach(shopDiff => {
            html += `<div class="diff-shop-item">`;
            html += `<div class="diff-shop-title">${this.escapeHtml(shopDiff.shopName)} [ID: ${this.escapeHtml(shopDiff.shopId)}]</div>`;
            html += `<ul style="margin: 4px 0 0 18px; padding: 0;">`;

            shopDiff.changes.forEach(change => {
                if (!change.isTemp) {
                    hasNonTempChange = true;
                }
                const itemClass = change.isTemp ? 'diff-field-item' : 'diff-field-item diff-non-temp';
                html += `<li class="${itemClass}">${this.escapeHtml(change.label)}: ${this.escapeHtml(change.newValStr)}</li>`;
            });

            html += `</ul></div>`;
        });

        html += '</div>';

        if (hasNonTempChange) {
            html = `<div style="color: #ff5252; font-weight: bold; margin-bottom: 8px; padding: 6px; background: rgba(229,57,53,0.15); border-radius: 4px; border: 1px solid var(--danger-color);">⚠️ 臨時営業・休業設定以外の項目に変更が含まれています。</div>` + html;
        }

        this.el.diffModalBody.innerHTML = html;
        this.openDiffModal();
    }

    toHalfWidth(input) {
        let val = input.value;
        val = val.replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
        input.value = val;
    }

    handleAddressBlur(input) {
        let val = this.cleanAddress(input.value);
        if (typeof LG_CODES !== 'undefined') {
            for (const pCode in LG_CODES.prefs) {
                const pName = LG_CODES.prefs[pCode];
                if (val.startsWith(pName)) {
                    if (this.el.prefCodeInput) {
                        this.el.prefCodeInput.value = pCode;
                        this.updateCityOptions(pCode, '');
                    }
                    val = val.substring(pName.length).trim();
                    break;
                }
            }
            const currentPrefCode = this.el.prefCodeInput ? this.el.prefCodeInput.value : '';
            if (currentPrefCode) {
                const cities = LG_CODES.getCitiesByPref(currentPrefCode);
                const cityEntries = Object.entries(cities).sort((a, b) => b[1].length - a[1].length);
                for (const [cCode, cName] of cityEntries) {
                    if (val.startsWith(cName)) {
                        if (this.el.cityCodeInput) {
                            this.el.cityCodeInput.value = cCode;
                        }
                        val = val.substring(cName.length).trim();
                        break;
                    }
                }
            }
        }
        input.value = val;
        this.updateSingleGMapSearchLink();
    }

    generateMapUrl(prefCode, cityCode, addressText, name) {
        const queryParts = ['ラーメン二郎'];
        if (name && name.trim() !== '') queryParts.push(name.trim());
        const fullAddr = typeof LG_CODES !== 'undefined'
            ? LG_CODES.getShopFullAddress({ prefCode, cityCode, addressText })
            : `${prefCode||''}${cityCode||''}${addressText||''}`;
        if (fullAddr && fullAddr.trim() !== '') queryParts.push(fullAddr.trim());
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryParts.join(' '))}`;
    }

    sortTemporaryDates(tempArray) {
        if (!Array.isArray(tempArray)) return [];
        return tempArray.sort((a, b) => {
            const dateA = a.startDate || a.date || '';
            const dateB = b.startDate || b.date || '';
            return dateA.localeCompare(dateB);
        });
    }

    sortShopsByOpenedAt() {
        this.shops.sort((a, b) => {
            if (!a.openedAt && !b.openedAt) return 0;
            if (!a.openedAt) return 1;
            if (!b.openedAt) return -1;
            return a.openedAt.localeCompare(b.openedAt);
        });
    }

    normalizeFurigana(str) {
        if (typeof JiroUtils !== 'undefined' && JiroUtils.normalizeFurigana) {
            return JiroUtils.normalizeFurigana(str);
        }
        if (!str) return '';
        return str.replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
    }

    cleanAddress(str) {
        if (typeof JiroUtils !== 'undefined' && JiroUtils.cleanAddress) {
            return JiroUtils.cleanAddress(str);
        }
        if (!str) return '';
        return str.trim();
    }

    normalizeAccountID(str) {
        if (typeof JiroUtils !== 'undefined' && JiroUtils.normalizeAccountID) {
            return JiroUtils.normalizeAccountID(str);
        }
        if (!str) return '';
        return str.replace(/^@/, '').trim();
    }

    normalizeBusinessHours(str, inputElem = null) {
        if (typeof JiroBusinessHours !== 'undefined' && JiroBusinessHours.normalizeBusinessHours) {
            return JiroBusinessHours.normalizeBusinessHours(str, inputElem);
        }
        return str ? str.trim() : '';
    }

    handleShiftBlur(input) {
        input.value = this.normalizeBusinessHours(input.value, input);
    }

    normalizeDate(str) {
        if (!str) return null;
        let val = str.trim()
            .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
            .replace(/[/.\s]/g, '-');
        if (val === '') return null;
        const parts = val.split('-');
        if (parts.length >= 1 && parts[0].length > 0) {
            const year = parts[0];
            if (parts.length === 2) return `${year}-${parts[1].padStart(2, '0')}`;
            if (parts.length >= 3) return `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            return year;
        }
        return val;
    }

    getJSTDateString(date = new Date()) {
        if (typeof JiroUtils !== 'undefined' && JiroUtils.getJSTDateString) {
            return JiroUtils.getJSTDateString(date);
        }
        return date.toISOString().split('T')[0];
    }

    getShopStatus(shop) {
        const todayStr = this.getJSTDateString();

        if (shop.openedAt) {
            let openCompareStr = shop.openedAt;
            if (openCompareStr.length === 4) openCompareStr += '-01-01';
            else if (openCompareStr.length === 7) openCompareStr += '-01';
            if (openCompareStr > todayStr) return 'BEFORE_OPEN';
        }

        if (shop.closedAt) {
            let closeCompareStr = shop.closedAt;
            if (closeCompareStr.length === 4) closeCompareStr += '-12-31';
            else if (closeCompareStr.length === 7) {
                const [y, m] = closeCompareStr.split('-').map(Number);
                const lastDay = new Date(y, m, 0).getDate();
                closeCompareStr += `-${String(lastDay).padStart(2, '0')}`;
            }
            if (closeCompareStr <= todayStr) return 'CLOSED';
        }

        return 'OPEN';
    }

    handleLatLngInput(latTarget, lngTarget) {
        const val = latTarget.value.trim();
        if (val.includes(',') || val.includes(' ') || val.includes(' ')) {
            const parts = val.split(/[,,\s\u3000]+/).map(s => s.trim()).filter(Boolean);
            if (parts.length >= 2) {
                latTarget.value = parts[0];
                lngTarget.value = parts[1];
            }
        }
    }

    updateSingleMapLink() {
        const lat = this.el.latInput.value.trim();
        const lng = this.el.lngInput.value.trim();
        if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
            this.el.singleMapLink.href = `https://www.google.com/maps?q=${lat},${lng}`;
            this.el.singleMapLink.style.display = 'inline-flex';
        } else {
            this.el.singleMapLink.style.display = 'none';
        }
    }

    updateSingleGMapSearchLink() {
        const prefCode = this.el.prefCodeInput ? this.el.prefCodeInput.value : '';
        const cityCode = this.el.cityCodeInput ? this.el.cityCodeInput.value : '';
        const address = document.getElementById('field-addressText').value;
        const name = document.getElementById('field-name').value;
        if (prefCode || cityCode || address || name) {
            this.el.singleGMapSearchLink.href = this.generateMapUrl(prefCode, cityCode, address, name);
            this.el.singleGMapSearchLink.style.display = 'inline-flex';
        } else {
            this.el.singleGMapSearchLink.style.display = 'none';
        }
    }

    updateSingleXLink() {
        const val = this.normalizeAccountID(this.el.xInput.value);
        if (val) {
            this.el.singleXLink.href = `https://x.com/${val}`;
            this.el.singleXLink.style.display = 'inline-flex';
        } else {
            this.el.singleXLink.style.display = 'none';
        }
    }

    updateSingleInstaLink() {
        const val = this.normalizeAccountID(this.el.instaInput.value);
        if (val) {
            this.el.singleInstaLink.href = `https://instagram.com/${val}`;
            this.el.singleInstaLink.style.display = 'inline-flex';
        } else {
            this.el.singleInstaLink.style.display = 'none';
        }
    }

    updateSingleUrlLink(type) {
        const input = document.getElementById(`field-url-${type}`);
        const linkBtn = document.getElementById(`single-${type}-link`);
        if (!input || !linkBtn) return;
        const val = input.value.trim();
        if (val) {
            linkBtn.href = val.startsWith('http') ? val : `https://${val}`;
            linkBtn.style.display = 'inline-flex';
        } else {
            linkBtn.style.display = 'none';
        }
    }

    bindEvents() {
        this.el.fileInput.addEventListener('change', (e) => this.loadFile(e));
        this.el.exportBtn.addEventListener('click', () => this.exportJSON());
        this.el.searchInput.addEventListener('input', () => this.renderList());
        this.el.addBtn.addEventListener('click', () => this.addNewShop());
        this.el.saveBtn.addEventListener('click', () => {
            this.saveCurrentShop();
        });
        this.el.deleteBtn.addEventListener('click', () => this.deleteCurrentShop());
        this.el.duplicateBtn.addEventListener('click', () => this.duplicateCurrentShop());
        
        this.el.addTempBtn.addEventListener('click', () => {
            this.gatherTemporaryFromDOM();
            const today = this.getJSTDateString();
            this.currentTemporary.push({ startDate: today, endDate: today, hours: [] });
            this.renderTemporaryList();
        });

        this.el.addHolidaySpecialBtn.addEventListener('click', () => {
            this.gatherHolidaySpecialFromDOM();
            this.currentHolidaySpecialShifts.push({ triggerDay: 1, targetOffset: 0, hours: [] });
            this.renderHolidaySpecialList();
        });

        this.el.addSpecialBtn.addEventListener('click', () => {
            this.gatherSpecialFromDOM();
            this.currentSpecialShifts.push({ week: 1, day: 1, hours: [] });
            this.renderSpecialList();
        });
        
        this.el.tabSingle.addEventListener('click', () => this.switchMode('single'));
        this.el.tabBulk.addEventListener('click', () => this.switchMode('bulk'));
        if (this.el.tabPending) this.el.tabPending.addEventListener('click', () => this.switchMode('pending'));
        this.el.bulkTargetField.addEventListener('change', () => this.renderBulkTable());
        this.el.bulkSaveBtn.addEventListener('click', () => this.saveBulkData());

        this.el.btnGithubConfig.addEventListener('click', () => this.openGithubModal());
        this.el.btnGithubPull.addEventListener('click', () => this.pullFromGithub());
        this.el.btnGithubPush.addEventListener('click', () => this.pushToGithub());

        const onLatChange = () => { this.handleLatLngInput(this.el.latInput, this.el.lngInput); this.updateSingleMapLink(); };
        const onLngChange = () => { this.handleLatLngInput(this.el.lngInput, this.el.latInput); this.updateSingleMapLink(); };
        this.el.latInput.addEventListener('input', onLatChange);
        this.el.latInput.addEventListener('paste', () => setTimeout(onLatChange, 10));
        this.el.lngInput.addEventListener('input', onLngChange);
        this.el.lngInput.addEventListener('paste', () => setTimeout(onLngChange, 10));

        this.el.chkFollowWeekday.addEventListener('change', () => {
            if (this.el.chkFollowWeekday.checked) {
                this.el.shiftHolInput.value = '';
                this.el.shiftHolInput.disabled = true;
                this.el.shiftHolInput.style.opacity = '0.4';
                this.el.shiftHolInput.classList.remove('error');
            } else {
                this.el.shiftHolInput.disabled = false;
                this.el.shiftHolInput.style.opacity = '1';
            }
        });

        this.el.kanaInput.addEventListener('blur', () => { this.el.kanaInput.value = this.normalizeFurigana(this.el.kanaInput.value); });
        this.el.xInput.addEventListener('blur', () => { this.el.xInput.value = this.normalizeAccountID(this.el.xInput.value); this.updateSingleXLink(); });
        this.el.instaInput.addEventListener('blur', () => { this.el.instaInput.value = this.normalizeAccountID(this.el.instaInput.value); this.updateSingleInstaLink(); });
        this.el.openedAtInput.addEventListener('blur', () => { this.el.openedAtInput.value = this.normalizeDate(this.el.openedAtInput.value) || ''; });
        this.el.closedAtInput.addEventListener('blur', () => { this.el.closedAtInput.value = this.normalizeDate(this.el.closedAtInput.value) || ''; });
    }

    getGithubConfig() {
        let token = sessionStorage.getItem('gh_token') || '';
        if (!token && localStorage.getItem('gh_token')) {
            token = localStorage.getItem('gh_token');
            sessionStorage.setItem('gh_token', token);
            localStorage.removeItem('gh_token');
        }
        return {
            token: token,
            owner: localStorage.getItem('gh_owner') || '',
            repo: localStorage.getItem('gh_repo') || '',
            branch: localStorage.getItem('gh_branch') || 'main',
            path: localStorage.getItem('gh_path') || 'shops.json'
        };
    }

    loadGithubConfigUI() {
        const config = this.getGithubConfig();
        document.getElementById('gh-token').value = config.token;
        document.getElementById('gh-owner').value = config.owner;
        document.getElementById('gh-repo').value = config.repo;
        document.getElementById('gh-branch').value = config.branch;
        document.getElementById('gh-path').value = config.path;
    }

    openGithubModal() {
        this.loadGithubConfigUI();
        this.el.githubModal.classList.add('active');
    }

    closeGithubModal() {
        this.el.githubModal.classList.remove('active');
    }

    saveGithubConfig() {
        const tokenVal = document.getElementById('gh-token').value.trim();
        if (tokenVal) {
            sessionStorage.setItem('gh_token', tokenVal);
        } else {
            sessionStorage.removeItem('gh_token');
        }
        localStorage.removeItem('gh_token');
        localStorage.setItem('gh_owner', document.getElementById('gh-owner').value.trim());
        localStorage.setItem('gh_repo', document.getElementById('gh-repo').value.trim());
        localStorage.setItem('gh_branch', document.getElementById('gh-branch').value.trim() || 'main');
        localStorage.setItem('gh_path', document.getElementById('gh-path').value.trim() || 'shops.json');
        this.closeGithubModal();
        alert('GitHub設定を保存しました（トークンは現在のセッションのみ安全に保持されます）。');
    }

    async pullFromGithub(silent = false) {
        const cfg = this.getGithubConfig();
        if (!cfg.token || !cfg.owner || !cfg.repo || !cfg.path) {
            if (!silent) {
                alert('GitHub連携設定が不足しています。「設定」ボタンから入力してください。');
                this.openGithubModal();
            }
            return false;
        }

        const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?ref=${cfg.branch}`;
        
        try {
            if (!silent && this.el.btnGithubPull) {
                this.el.btnGithubPull.disabled = true;
                this.el.btnGithubPull.textContent = '取得中...';
            }

            const res = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${cfg.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!res.ok) {
                throw new Error(`GitHub APIエラー: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            this.githubFileSha = data.sha;

            const jsonText = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
            this.shops = JSON.parse(jsonText);

            this.shops.forEach(shop => {
                if (shop.temporary) shop.temporary = this.sortTemporaryDates(shop.temporary);
                if (shop.notes !== undefined && shop.remarks === undefined) {
                    shop.remarks = shop.notes;
                    delete shop.notes;
                }
            });
            this.sortShopsByOpenedAt();
            this.renderList();
            if (this.currentMode === 'bulk') this.renderBulkTable();

            if (!silent) {
                alert(`GitHubから ${this.shops.length}件 のデータを正常に取得しました。`);
            }
            return true;
        } catch (err) {
            if (!silent) {
                alert(`GitHubからの取得に失敗しました:\n${err.message}`);
            }
            return false;
        } finally {
            if (!silent && this.el.btnGithubPull) {
                this.el.btnGithubPull.disabled = false;
                this.el.btnGithubPull.textContent = '🐙 GitHubから取得';
            }
        }
    }

    async pushToGithub() {
        const cfg = this.getGithubConfig();
        if (!cfg.token || !cfg.owner || !cfg.repo || !cfg.path) {
            alert('GitHub連携設定が不足しています。「設定」ボタンから入力してください。');
            this.openGithubModal();
            return;
        }

        const commitMessage = prompt('コミットメッセージを入力してください:', '臨時営業反映');
        if (commitMessage === null) return;

        this.shops.forEach(shop => { if (shop.temporary) shop.temporary = this.sortTemporaryDates(shop.temporary); });
        this.sortShopsByOpenedAt();

        const jsonString = JSON.stringify(this.shops, null, 2);
        const utf8Bytes = new TextEncoder().encode(jsonString);
        let binaryStr = '';
        for (let i = 0; i < utf8Bytes.length; i++) {
            binaryStr += String.fromCharCode(utf8Bytes[i]);
        }
        const base64Content = btoa(binaryStr);

        const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`;

        try {
            this.el.btnGithubPush.disabled = true;
            this.el.btnGithubPush.textContent = '送信中...';

            if (!this.githubFileSha) {
                const getRes = await fetch(`${url}?ref=${cfg.branch}`, {
                    headers: { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github.v3+json' }
                });
                if (getRes.ok) {
                    const getData = await getRes.json();
                    this.githubFileSha = getData.sha;
                }
            }

            const payload = {
                message: commitMessage || 'Update shops.json',
                content: base64Content,
                branch: cfg.branch
            };
            if (this.githubFileSha) {
                payload.sha = this.githubFileSha;
            }

            const res = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${cfg.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(`GitHub APIエラー (${res.status}): ${errData.message || res.statusText}`);
            }

            const resData = await res.json();
            this.githubFileSha = resData.content.sha;

            alert('GitHubに正常にコミット・反映しました！');
        } catch (err) {
            alert(`GitHubへの反映に失敗しました:\n${err.message}`);
        } finally {
            this.el.btnGithubPush.disabled = false;
            this.el.btnGithubPush.textContent = '🚀 GitHubへ送信';
        }
    }

    switchMode(mode) {
        this.currentMode = mode;
        this.el.tabSingle.classList.toggle('active', mode === 'single');
        this.el.tabBulk.classList.toggle('active', mode === 'bulk');
        if (this.el.tabPending) this.el.tabPending.classList.toggle('active', mode === 'pending');

        this.el.viewSingle.style.display = (mode === 'single') ? 'flex' : 'none';
        this.el.viewBulk.style.display = (mode === 'bulk') ? 'flex' : 'none';
        if (this.el.viewPending) this.el.viewPending.style.display = (mode === 'pending') ? 'block' : 'none';

        if (mode === 'single') {
            if (this.selectedId) this.selectShop(this.selectedId, true);
        } else if (mode === 'bulk') {
            this.renderBulkTable();
        } else if (mode === 'pending') {
            this.renderPendingList();
        }
    }

    async loadPendingUpdates(isUserClick = false) {
        const refreshBtn = document.getElementById('btn-pending-refresh');
        if (isUserClick && refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '🔄 取得中...';
        }

        try {
            let loadedData = null;
            const cfg = this.getGithubConfig();

            // 1. GitHub連携設定がある場合は、GitHub APIから最新コミットのファイルを直接取得
            if (cfg.token && cfg.owner && cfg.repo) {
                try {
                    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/data/pending_updates.json?ref=${cfg.branch || 'main'}`;
                    const ghRes = await fetch(url, {
                        headers: {
                            'Authorization': `Bearer ${cfg.token}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    });
                    if (ghRes.ok) {
                        const ghData = await ghRes.json();
                        const jsonText = decodeURIComponent(escape(atob(ghData.content.replace(/\n/g, ''))));
                        loadedData = JSON.parse(jsonText);
                    }
                } catch (ghErr) {
                    console.warn('GitHub API pending_updates fetch failed, falling back to local:', ghErr);
                }
            }

            // 2. GitHubから取得できなかった場合はローカル/ホスティングURLから取得
            if (!loadedData) {
                const res = await fetch('data/pending_updates.json?t=' + Date.now());
                if (res.ok) {
                    loadedData = await res.json();
                }
            }

            this.pendingUpdates = Array.isArray(loadedData) ? loadedData.filter(d => d.status === 'pending') : [];

            if (isUserClick) {
                const count = this.pendingUpdates.length;
                if (count > 0) {
                    alert(`最新の承認待ちデータを取得しました（${count}件）。`);
                } else {
                    alert('最新の承認待ちデータを取得しました。現在、未承認の候補はありません（0件）。');
                }
            }
        } catch (e) {
            console.warn('pending_updates.json could not be loaded:', e);
            this.pendingUpdates = [];
            if (isUserClick) {
                alert('承認待ちデータの取得中にエラーが発生しました:\n' + e.message);
            }
        } finally {
            if (isUserClick && refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 再取得';
            }
        }

        this.updatePendingBadge();
        if (this.currentMode === 'pending') {
            this.renderPendingList();
        }
    }

    async triggerSnsCrawler() {
        const cfg = this.getGithubConfig();
        if (!cfg.token || !cfg.owner || !cfg.repo) {
            alert('GitHub連携設定（トークン・リポジトリ名）が必要です。右上の「⚙️ 設定」ボタンから入力してください。');
            this.openGithubModal();
            return;
        }

        if (!confirm('GitHub Actionsで最新のSNS巡回＆AI解析ワークフローを今すぐ実行しますか？\n（実行完了まで通常1〜2分かかります）')) return;

        const btn = document.getElementById('btn-pending-trigger-crawler');
        const progressBox = document.getElementById('pending-crawler-progress');
        const progressTitle = document.getElementById('crawler-progress-title');
        const progressDesc = document.getElementById('crawler-progress-desc');
        const progressBar = document.getElementById('crawler-progress-bar');
        const progressTimer = document.getElementById('crawler-progress-timer');
        const progressLogLink = document.getElementById('crawler-progress-log-link');

        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ 起動中...';
        }

        if (progressBox) {
            progressBox.style.display = 'block';
            progressBox.style.borderColor = 'var(--jiro-yellow)';
            if (progressTitle) { progressTitle.style.color = 'var(--jiro-yellow)'; progressTitle.textContent = 'SNS巡回ワークフローを起動中...'; }
            if (progressDesc) progressDesc.textContent = 'GitHub Actions に実行リクエストを送信しています...';
            if (progressBar) { progressBar.style.width = '10%'; progressBar.style.background = 'var(--jiro-yellow)'; }
            if (progressTimer) progressTimer.textContent = '0秒';
            if (progressLogLink) progressLogLink.style.display = 'none';
        }

        const startTime = Date.now();
        let timerInterval = null;
        if (progressTimer) {
            timerInterval = setInterval(() => {
                const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
                progressTimer.textContent = `${elapsedSec}秒`;
                if (btn) btn.textContent = `⏳ 巡回実行中 (${elapsedSec}s)...`;
            }, 1000);
        }

        try {
            const dispatchUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/actions/workflows/sns_monitor.yml/dispatches`;
            const dispatchRes = await fetch(dispatchUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cfg.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ref: cfg.branch || 'main' })
            });

            if (!dispatchRes.ok) {
                const errData = await dispatchRes.json().catch(() => ({}));
                if (dispatchRes.status === 403) {
                    throw new Error(
                        `GitHub APIエラー (403 権限不足):\n` +
                        `お使いのPersonal Access TokenにGitHub Actionsの実行権限がありません。\n\n` +
                        `【解決方法】\n` +
                        `1. GitHubのPAT設定画面で「workflow」（Actions実行）権限を付与する\n` +
                        `または\n` +
                        `2. GitHubリポジトリの「Actions」タブ >「SNS Schedule Monitor」>「Run workflow」から直接手動実行する`
                    );
                }
                throw new Error(`GitHub APIエラー (${dispatchRes.status}): ${errData.message || dispatchRes.statusText}`);
            }

            if (progressDesc) progressDesc.textContent = '起動リクエストを受理しました。ジョブの開始を監視しています...';
            if (progressBar) progressBar.style.width = '25%';

            // ジョブのポーリング監視（最大5分）
            let targetRun = null;
            const runsUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/actions/workflows/sns_monitor.yml/runs?per_page=5`;
            const maxWaitMs = 5 * 60 * 1000;

            while (Date.now() - startTime < maxWaitMs) {
                await new Promise(r => setTimeout(r, 4000));

                try {
                    const runsRes = await fetch(runsUrl, {
                        headers: {
                            'Authorization': `Bearer ${cfg.token}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    });

                    if (runsRes.ok) {
                        const runsData = await runsRes.json();
                        const runs = runsData.workflow_runs || [];

                        // 今回起動したランを特定（ディスパッチ送信時刻付近に作成されたもの）
                        if (!targetRun && runs.length > 0) {
                            targetRun = runs.find(r => {
                                const createdTime = new Date(r.created_at).getTime();
                                return createdTime >= startTime - 15000;
                            }) || runs[0];
                        }

                        if (targetRun) {
                            const currentRun = runs.find(r => r.id === targetRun.id) || targetRun;

                            if (progressLogLink && currentRun.html_url) {
                                progressLogLink.href = currentRun.html_url;
                                progressLogLink.style.display = 'inline';
                            }

                            if (currentRun.status === 'queued') {
                                if (progressTitle) progressTitle.textContent = '⏳ 実行待ち（キュー中）';
                                if (progressDesc) progressDesc.textContent = 'GitHub Actionsランナーの起動を待機しています...';
                                if (progressBar) progressBar.style.width = '35%';
                            } else if (currentRun.status === 'in_progress') {
                                if (progressTitle) progressTitle.textContent = '⚡ SNS巡回＆Gemini AI解析を実行中...';
                                if (progressDesc) progressDesc.textContent = '全店舗の公式X/Instagramを巡回し、最新投稿・添付画像をGemini 1.5 Flashで解析しています（通常1〜2分）...';
                                if (progressBar) progressBar.style.width = '70%';
                            } else if (currentRun.status === 'completed') {
                                if (timerInterval) clearInterval(timerInterval);

                                if (currentRun.conclusion === 'success') {
                                    if (progressTitle) {
                                        progressTitle.textContent = '✅ SNS巡回が完了しました！';
                                        progressTitle.style.color = '#4caf50';
                                    }
                                    if (progressBox) progressBox.style.borderColor = '#4caf50';
                                    if (progressDesc) progressDesc.textContent = '巡回とAI解析が正常に終了しました。最新の承認待ちデータを自動更新しています...';
                                    if (progressBar) {
                                        progressBar.style.width = '100%';
                                        progressBar.style.background = '#4caf50';
                                    }

                                    // 自動で最新の承認待ちデータをロード
                                    await this.loadPendingUpdates(false);

                                    setTimeout(() => {
                                        if (progressBox && progressTitle && progressTitle.textContent.includes('完了')) {
                                            progressBox.style.display = 'none';
                                        }
                                    }, 8000);
                                } else {
                                    if (progressTitle) {
                                        progressTitle.textContent = `❌ SNS巡回ワークフローが終了しました (${currentRun.conclusion})`;
                                        progressTitle.style.color = '#ff5252';
                                    }
                                    if (progressBox) progressBox.style.borderColor = '#ff5252';
                                    if (progressDesc) progressDesc.textContent = '実行中にエラーが発生した可能性があります。「GitHub Actionsでログを見る」から詳細をご確認ください。';
                                    if (progressBar) {
                                        progressBar.style.width = '100%';
                                        progressBar.style.background = '#ff5252';
                                    }
                                }
                                break;
                            }
                        }
                    }
                } catch (pollErr) {
                    console.warn('Run polling error:', pollErr);
                }
            }

        } catch (err) {
            if (timerInterval) clearInterval(timerInterval);
            if (progressBox) {
                if (progressTitle) {
                    progressTitle.textContent = '❌ 起動エラー';
                    progressTitle.style.color = '#ff5252';
                }
                if (progressBox) progressBox.style.borderColor = '#ff5252';
                if (progressDesc) progressDesc.textContent = err.message;
            }
            alert(`ワークフローの起動に失敗しました:\n\n${err.message}`);
        } finally {
            if (timerInterval) clearInterval(timerInterval);
            if (btn) {
                btn.disabled = false;
                btn.textContent = '⚡ 今すぐSNS再巡回';
            }
        }
    }

    async ensureLatestShopsLoaded() {
        const cfg = this.getGithubConfig();
        const hasGhConfig = cfg.token && cfg.owner && cfg.repo && cfg.path;

        // 1. 店舗データがまだ読み込まれていない（空）の場合
        if (!this.shops || this.shops.length === 0) {
            if (hasGhConfig) {
                const ok = await this.pullFromGithub(true);
                if (!ok) {
                    alert('承認の前にGitHubから最新の店舗データ（shops.json）を取得できませんでした。右上の「⚙️ 設定」でトークンやリポジトリ設定をご確認ください。');
                    return false;
                }
            } else {
                // GitHub設定がない場合はローカル shops.json から読み込み試行
                try {
                    const res = await fetch('shops.json?t=' + Date.now());
                    if (res.ok) {
                        this.shops = await res.json();
                        this.sortShopsByOpenedAt();
                        this.renderList();
                    } else {
                        throw new Error('shops.json の取得に失敗');
                    }
                } catch (e) {
                    alert('店舗データがロードされていません。「🐙 GitHubから取得」または「ファイル選択」で shops.json を読み込んでから承認してください。');
                    return false;
                }
            }
            return true;
        }

        // 2. 店舗データはロード済みだが、GitHub上に新しいコミットがあるか安全確認
        if (hasGhConfig) {
            try {
                const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?ref=${cfg.branch}`;
                const checkRes = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${cfg.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                if (checkRes.ok) {
                    const remoteData = await checkRes.json();
                    if (this.githubFileSha && remoteData.sha !== this.githubFileSha) {
                        const doSync = confirm(
                            '⚠️ GitHub上の shops.json が他のコミットによって更新されています！\n\n' +
                            '承認・反映の前に、GitHubの最新データを同期（取得）しますか？\n' +
                            '（「OK」を押すと最新データを取得してから承認をマージします。推奨）'
                        );
                        if (doSync) {
                            const ok = await this.pullFromGithub(true);
                            if (!ok) return false;
                        }
                    } else if (!this.githubFileSha) {
                        this.githubFileSha = remoteData.sha;
                    }
                }
            } catch (checkErr) {
                console.warn('Remote sha check skipped:', checkErr);
            }
        }

        return true;
    }

    updatePendingBadge() {
        const pendingItems = (this.pendingUpdates || []).filter(p => p.status !== 'skipped');
        const skippedItems = (this.pendingUpdates || []).filter(p => p.status === 'skipped');
        const count = pendingItems.length;
        if (this.el.pendingBadge) {
            this.el.pendingBadge.textContent = count;
            this.el.pendingBadge.style.display = count > 0 ? 'inline-block' : 'none';
        }
        if (this.el.pendingCountTag) {
            this.el.pendingCountTag.textContent = `${count}件`;
        }
        if (this.el.skippedCountTag) {
            this.el.skippedCountTag.textContent = `${skippedItems.length}件`;
        }
    }

    initManualAiPanel() {
        // APIキーの初期読み込み
        const savedKey = localStorage.getItem('gemini_api_key');
        const keyInput = document.getElementById('manual-gemini-key');
        if (savedKey && keyInput) {
            keyInput.value = savedKey;
        }

        // クリップボードからの画像ペースト（Ctrl+V）対応
        const textElem = document.getElementById('manual-ai-text');
        const panelElem = document.getElementById('manual-ai-panel');

        const handlePaste = (e) => {
            const items = (e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData))?.items;
            if (!items) return;
            const imageFiles = [];
            for (const item of items) {
                if (item.type && item.type.indexOf('image') !== -1) {
                    const blob = item.getAsFile();
                    if (blob) imageFiles.push(blob);
                }
            }
            if (imageFiles.length > 0) {
                this.handleManualAiFiles(imageFiles);
            }
        };

        if (textElem) textElem.addEventListener('paste', handlePaste);
        if (panelElem) panelElem.addEventListener('paste', handlePaste);
    }

    saveGeminiApiKey() {
        const input = document.getElementById('manual-gemini-key');
        if (!input) return;
        const key = input.value.trim();
        if (!key) {
            localStorage.removeItem('gemini_api_key');
            alert('Gemini APIキーの設定を削除しました。');
            return;
        }
        localStorage.setItem('gemini_api_key', key);
        alert('Gemini APIキーをブラウザに保存しました！');
    }

    updateManualAiShopOptions() {
        const select = document.getElementById('manual-ai-shop');
        if (!select) return;

        const currentVal = select.value;
        let html = '<option value="">店舗を選択してください</option>';

        (this.shops || []).forEach(s => {
            let snsInfo = [];
            if (s.instagram) snsInfo.push(`IG: @${s.instagram}`);
            if (s.x) snsInfo.push(`X: @${s.x}`);
            const snsText = snsInfo.length > 0 ? ` (${snsInfo.join(', ')})` : '';
            html += `<option value="${s.id}">${s.name}${snsText}</option>`;
        });

        select.innerHTML = html;
        if (currentVal) {
            select.value = currentVal;
        } else if (this.selectedId) {
            select.value = this.selectedId;
        }
    }

    handleManualAiFiles(files) {
        if (!files || files.length === 0) return;
        if (!this.manualAiImages) this.manualAiImages = [];

        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target.result;
                const base64Data = dataUrl.split(',')[1];
                this.manualAiImages.push({
                    name: file.name,
                    data: base64Data,
                    mimeType: file.type,
                    dataUrl: dataUrl
                });
                this.renderManualAiPreviews();
            };
            reader.readAsDataURL(file);
        });
    }

    removeManualAiImage(index) {
        if (!this.manualAiImages) return;
        this.manualAiImages.splice(index, 1);
        this.renderManualAiPreviews();
    }

    renderManualAiPreviews() {
        const container = document.getElementById('manual-ai-previews');
        if (!container) return;
        container.innerHTML = '';

        (this.manualAiImages || []).forEach((img, idx) => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position: relative; display: inline-block; border-radius: 4px; overflow: hidden; border: 1px solid #555; background: #000;';
            wrap.innerHTML = `
                <img src="${img.dataUrl}" style="height: 60px; width: 60px; object-fit: cover; display: block;">
                <button type="button" onclick="app.removeManualAiImage(${idx})" style="position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.7); color: #ff5252; border: none; border-radius: 50%; width: 18px; height: 18px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;">✕</button>
            `;
            container.appendChild(wrap);
        });
    }

    clearManualAiForm() {
        const text = document.getElementById('manual-ai-text');
        const url = document.getElementById('manual-ai-url');
        const status = document.getElementById('manual-ai-status');
        if (text) text.value = '';
        if (url) url.value = '';
        if (status) status.style.display = 'none';
        this.manualAiImages = [];
        this.renderManualAiPreviews();
    }

    async runManualAiAnalysis() {
        // 店舗チェック
        const shopSelect = document.getElementById('manual-ai-shop');
        const shopId = shopSelect ? shopSelect.value : '';
        if (!shopId) {
            alert('対象店舗を選択してください。');
            if (shopSelect) shopSelect.focus();
            return;
        }

        const shop = (this.shops || []).find(s => s.id === shopId);
        const shopName = shop ? shop.name : shopId;

        const textInput = document.getElementById('manual-ai-text');
        const postText = textInput ? textInput.value.trim() : '';
        const hasImages = (this.manualAiImages || []).length > 0;

        if (!postText && !hasImages) {
            alert('投稿テキストを入力するか、画像を添付してください。');
            if (textInput) textInput.focus();
            return;
        }

        // APIキーの取得
        let apiKey = localStorage.getItem('gemini_api_key');
        if (!apiKey) {
            const keyInput = document.getElementById('manual-gemini-key');
            if (keyInput && keyInput.value.trim()) {
                apiKey = keyInput.value.trim();
                localStorage.setItem('gemini_api_key', apiKey);
            } else {
                apiKey = prompt('Gemini API Key を入力してください:\n（Google AI Studioで取得した無料のキー。ブラウザ内に安全に保存されます）');
                if (!apiKey) return;
                apiKey = apiKey.trim();
                localStorage.setItem('gemini_api_key', apiKey);
                if (keyInput) keyInput.value = apiKey;
            }
        }

        const btn = document.getElementById('btn-manual-ai-submit');
        const statusElem = document.getElementById('manual-ai-status');
        if (btn) btn.disabled = true;
        if (statusElem) {
            statusElem.textContent = '🤖 Gemini解析中...';
            statusElem.style.display = 'inline';
        }

        try {
            const sourceSelect = document.getElementById('manual-ai-source');
            const postSource = sourceSelect ? sourceSelect.value : 'instagram';
            const urlInput = document.getElementById('manual-ai-url');
            const postUrl = urlInput ? urlInput.value.trim() : '';

            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            const dayOfWeekStr = ['日', '月', '火', '水', '木', '金', '土'][today.getDay()];

            // 管理者学習ルールのテキスト化
            let guidelinesText = '';
            if (this.aiGuidelines && Array.isArray(this.aiGuidelines.generalRules)) {
                const rules = this.aiGuidelines.generalRules.map(r => `・【${r.title}】: ${r.rule}`).join('\n');
                const shopRules = (this.aiGuidelines.shopSpecificRules && this.aiGuidelines.shopSpecificRules[shop.id]) ? `・【店舗固有ルール】: ${this.aiGuidelines.shopSpecificRules[shop.id]}` : '';
                guidelinesText = `\n【管理者学習ルール・判定ガイドライン】\n${rules}\n${shopRules}\n`;
            }

            // 店舗の通常シフトと登録済み臨時設定のテキスト化
            const shiftsByDay = shop.shiftsByDay || {};
            const dayNames = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];
            const normalShiftsText = dayNames.map((dName, idx) => {
                const shifts = shiftsByDay[idx] || [];
                if (shifts.length === 0) return `${dName}: 定休日`;
                const shiftStrs = shifts.map(s => `${s[0]}:00〜${s[1]}:00`.replace(/\.5:00/g, ':30'));
                return `${dName}: ${shiftStrs.join(', ')}`;
            }).join(' / ');

            const registeredTemps = (shop.temporary || []).slice(-5).map(t => {
                const hStr = (t.hours && t.hours.length > 0) ? JSON.stringify(t.hours) : '終日休業';
                return `${t.startDate}${t.endDate && t.endDate !== t.startDate ? '〜' + t.endDate : ''}: ${hStr}`;
            }).join('; ');

            const systemPrompt = `
あなたは全国の「ラーメン二郎」直系店舗の営業情報を専門に監視・判定するエキスパートAIです。
店舗の公式SNS（Instagram / X）や店頭告知の投稿テキスト、および添付画像（店頭の手書き貼り紙、ホワイトボード、カレンダー等）を解析し、
「臨時休業」「営業時間変更」「臨時営業」の有無と、具体的な日程・時間を正確に抽出してください。

【基準日・店舗情報】
・今日の日付: ${todayStr} (${dayOfWeekStr}曜日)
・対象店舗: ${shopName} (ID: ${shopId})
・店舗の通常営業時間 (shiftsByDay): ${normalShiftsText}
・現在登録済みの臨時スケジュール (temporary): ${registeredTemps || 'なし'}
${guidelinesText}
【二郎特有の表現と重要判定ルール】
1. 日付・期間表現の解釈:
   - 「本日」「今日」＝ ${todayStr}
   - 「明日」＝ 翌日、「明後日」＝ 翌々日
   - 「○日(○)」＝ 今月または翌月の該当月日を西暦YYYY-MM-DD形式に変換。
   - 「カレンダー」の画像がある場合、〇印（営業）、✕印や斜線（休業）、手書きの注釈を正確に読み取ること。
2. 昼の部・夜の部、および片側休業の厳格な解釈:
   - 「昼の部」「昼」＝ 店舗の通常営業のうち前半側（1部目）。
   - 「夜の部」「夜」＝ 店舗の通常営業のうち後半側（2部目）。
   - 「夜の部お休み」「夜はお休み」等＝【終日休業と誤判定しないこと！】。昼の部は通常営業で夜の部のみ休業を意味するため、hours には前半の通常営業時間（例: [[11, 14.5]]）を設定し、type は "temporary_hours" としてください。
   - 「昼のみ」「昼営業のみ」＝ 前半の通常営業時間のみ営業（夜休業）。
   - 「夜のみ」「夜営業のみ」＝ 後半の通常営業時間のみ営業（昼休業）。
3. リアルタイム営業終了アナウンス（早仕舞い）の終了時刻反映:
   - 「只今並びの方で終了」「宣告」「麺切れ終了」「本日分終了」等の当日終了告知は、除外せず【投稿時刻（または文中に記載された時刻）を該当営業の終了時刻として hours に反映】してください。
   - 【最重要】2部営業のうち1部目（昼営業）の終了投稿は『昼営業のみの終了時刻変更』です。夜営業は予定通り実施されるのが基本のため、夜営業まで終了と誤判定せず、夜営業の時間は維持してください（例: 昼が通常11-14.5、夜が通常17.5-21で、13:45に昼終了なら hours: [[11, 13.75], [17.5, 21]]）。
4. 通常営業や雑談の場合:
   - 「本日も通常通り営業します」「おはようございます」「限定トッピングあります」等は通常通りのため hasScheduleChange: false としてください。
5. 時間の数値化:
   - 小数点表記（例: 11:30＝11.5, 13:45＝13.75, 14:00＝14, 17:30＝17.5, 21:00＝21）で [[start, end], [start, end]] 形式の配列にする。
   - 終日休業の場合は hours を空配列 [] にする。
6. 複数日程・複数変更の網羅抽出:
   - 1つの投稿に複数の日付の変更情報が含まれる場合は、変更がある日付ごとに【別々の要素として changes 配列にすべて漏れなく網羅】して出力してください。

【出力フォーマット (JSON)】
必ず以下のJSONスキーマに従って出力してください（Markdownのコードブロックではなく純粋なJSON文字列で返すこと）:
{
  "hasScheduleChange": boolean,
  "summary": string,
  "changes": [
    {
      "type": "temporary_closure" | "special_open" | "temporary_hours",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "hours": [[number, number]],
      "reason": string,
      "confidence": number
    }
  ]
}
`;

            const parts = [
                { text: systemPrompt },
                { text: `【解析対象の投稿テキスト】\n${postText || '（テキストなし。添付画像を優先解析してください）'}` }
            ];

            // 添付画像パート
            if (this.manualAiImages && this.manualAiImages.length > 0) {
                this.manualAiImages.forEach(img => {
                    parts.push({
                        inlineData: {
                            data: img.data,
                            mimeType: img.mimeType || 'image/jpeg'
                        }
                    });
                });
            }

            // 利用可能なモデル候補リスト（回数が稼げる Flash Lite モデルを最優先: RPD 500 / RPM 15）
            const modelCandidates = [
                'gemini-3.1-flash-lite',
                'gemini-3.5-flash-lite',
                'gemini-2.5-flash-lite',
                'gemini-3.6-flash',
                'gemini-2.5-flash'
            ];
            let resultJson = null;
            let lastError = null;

            for (const model of modelCandidates) {
                try {
                    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                    const res = await fetch(apiUrl, {
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

                    if (res.ok) {
                        const data = await res.json();
                        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (rawText) {
                            const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
                            resultJson = JSON.parse(cleanJson);
                            break;
                        }
                    } else if (res.status === 404) {
                        console.warn(`Model ${model} returned 404. Trying next candidate...`);
                        continue;
                    } else {
                        const errText = await res.text();
                        lastError = new Error(`Gemini API (${res.status}): ${errText}`);
                        break;
                    }
                } catch (fetchErr) {
                    lastError = fetchErr;
                }
            }

            if (!resultJson) {
                throw lastError || new Error('Geminiから有効な解析結果が得られませんでした。');
            }

            if (!resultJson.hasScheduleChange || !Array.isArray(resultJson.changes) || resultJson.changes.length === 0) {
                alert(`ℹ️ AI解析完了: 「${shopName}」\n\n営業変更（臨時休業や特別営業など）は検出されませんでした。\n（通常通りの営業、または雑談・告知以外の内容と判定されました）`);
                return;
            }

            // pendingUpdates に追加（既存完全一致の判定含む）
            const addedCount = resultJson.changes.length;
            const imageUrls = (this.manualAiImages || []).map(img => img.dataUrl);
            let pendingAdded = 0;
            let skippedAdded = 0;

            resultJson.changes.forEach(change => {
                // 対象日の曜日を特定
                let dayOfWeek = null;
                if (change.startDate) {
                    const d = new Date(change.startDate + 'T00:00:00+09:00');
                    if (!isNaN(d.getTime())) {
                        dayOfWeek = d.getDay().toString();
                    }
                }

                let isExactMatch = false;
                let matchReason = '';

                // 1. 既存の temporary との一致チェック
                const matchedTemp = (shop.temporary || []).find(t => t.startDate === change.startDate);
                if (matchedTemp) {
                    if (JSON.stringify(matchedTemp.hours || []) === JSON.stringify(change.hours || [])) {
                        isExactMatch = true;
                        matchReason = '既に登録済みの臨時スケジュールと完全に一致';
                    }
                } else if (dayOfWeek !== null && shop.shiftsByDay) {
                    // 2. 通常営業時間との一致チェック
                    const normalHours = shop.shiftsByDay[dayOfWeek] || [];
                    if (JSON.stringify(normalHours) === JSON.stringify(change.hours || [])) {
                        isExactMatch = true;
                        matchReason = '対象曜日の通常営業時間と完全に一致（変更なし）';
                    }
                }

                const status = isExactMatch ? 'skipped' : 'pending';
                if (isExactMatch) skippedAdded++; else pendingAdded++;

                const pendingItem = {
                    id: `pending_manual_${shop.id}_${change.startDate.replace(/-/g, '')}_${Date.now().toString(36)}`,
                    shopId: shop.id,
                    shopName: shop.name,
                    postSource: postSource,
                    postUrl: postUrl,
                    postedAt: new Date().toISOString(),
                    postText: postText || `[手動添付画像解析] ${change.reason || ''}`,
                    mediaUrls: imageUrls,
                    detectedChange: change,
                    status: status,
                    skipReason: isExactMatch ? matchReason : null
                };

                // 既存の同一日候補があれば上書き、なければ先頭に追加
                this.pendingUpdates = this.pendingUpdates.filter(p => !(p.shopId === shop.id && p.detectedChange.startDate === change.startDate));
                this.pendingUpdates.unshift(pendingItem);
            });

            this.renderPendingList();
            this.updatePendingBadge();
            this.clearManualAiForm();

            if (pendingAdded > 0) {
                alert(`✨ AI解析成功！ [${pendingAdded}件の変更候補${skippedAdded > 0 ? `、${skippedAdded}件の既存一致スキップ` : ''}]\n\n「${shopName}」の営業変更候補を承認待ち一覧に追加しました！\n一覧に表示されたカードの「✅ 承認して反映」を押すと shops.json に適用されます。`);
            } else {
                alert(`ℹ️ AI解析完了: 「${shopName}」\n\n抽出された営業スケジュール（${skippedAdded}件）は、すでに登録されている営業時間と完全に一致しているため「スキップ済み」として記録されました。\n承認待ち画面下部の「📋 スキップされた投稿」よりご確認いただけます。`);
            }

            // 承認待ち一覧の該当カードへスムーズスクロール
            const targetCard = document.getElementById(`pending-card-${this.pendingUpdates[0].id}`);
            if (targetCard) {
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetCard.style.outline = '2px solid var(--jiro-yellow)';
                setTimeout(() => targetCard.style.outline = '', 2500);
            }

        } catch (err) {
            console.error('Manual AI Analysis Error:', err);
            alert(`❌ AI解析エラー:\n${err.message}`);
        } finally {
            if (btn) btn.disabled = false;
            if (statusElem) statusElem.style.display = 'none';
        }
    }

    renderPendingList() {
        if (!this.el.pendingListContainer) return;
        this.el.pendingListContainer.innerHTML = '';
        if (this.el.skippedListContainer) this.el.skippedListContainer.innerHTML = '';

        const pendingItems = (this.pendingUpdates || []).filter(p => p.status !== 'skipped');
        const skippedItems = (this.pendingUpdates || []).filter(p => p.status === 'skipped');

        if (pendingItems.length === 0) {
            this.el.pendingListContainer.innerHTML = `
                <div style="text-align: center; padding: 48px 16px; color: #888; background: #1a1a1a; border-radius: 8px;">
                    <div style="font-size: 2.5rem; margin-bottom: 8px;">🎉</div>
                    <div style="font-size: 1.1rem; font-weight: bold; color: #ccc;">未承認のSNS更新候補はありません</div>
                    <div style="font-size: 0.85rem; margin-top: 6px;">新しい臨時休業や営業時間の変更投稿が検出されると、ここに自動表示されます。</div>
                </div>
            `;
        } else {
            pendingItems.forEach(item => {
                const card = this.createPendingCardElement(item, false);
                this.el.pendingListContainer.appendChild(card);
            });
        }

        // スキップ済みリストの描画
        if (this.el.skippedListContainer) {
            if (skippedItems.length === 0) {
                this.el.skippedListContainer.innerHTML = `
                    <div style="text-align: center; padding: 16px; color: #777; font-size: 0.85rem;">
                        スキップされた投稿はありません。
                    </div>
                `;
            } else {
                skippedItems.forEach(item => {
                    const card = this.createPendingCardElement(item, true);
                    this.el.skippedListContainer.appendChild(card);
                });
            }
        }

        this.updatePendingBadge();
    }

    createPendingCardElement(item, isSkipped = false) {
        const card = document.createElement('div');
        card.className = 'pending-card' + (isSkipped ? ' skipped-card' : '');
        card.id = `pending-card-${item.id}`;
        if (isSkipped) {
            card.style.opacity = '0.85';
            card.style.border = '1px dashed #555';
        }

        const shop = (this.shops || []).find(s => s.id === item.shopId);
        const postSource = item.postSource || 'x';
        let handle = '';
        let accountUrl = '';

        if (postSource === 'instagram') {
            handle = (shop && shop.instagram) ? shop.instagram : (item.accountHandle || '');
            if (handle) accountUrl = `https://instagram.com/${handle.replace(/^@/, '')}`;
        } else {
            handle = (shop && shop.x) ? shop.x : (item.accountHandle || '');
            if (handle) accountUrl = `https://x.com/${handle.replace(/^@/, '')}`;
        }

        const change = item.detectedChange || {};
        const isClosure = change.type === 'temporary_closure';
        const isSpecial = change.type === 'special_open';
        const typeClass = isClosure ? 'closure' : (isSpecial ? 'special' : 'hours');
        const typeLabel = isClosure ? '🚫 臨時休業' : (isSpecial ? '✨ 臨時営業' : '⏰ 営業時間変更');

        // 日時フォーマット
        const postDateStr = item.postedAt ? new Date(item.postedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const hoursText = (change.hours && change.hours.length > 0)
            ? change.hours.map(([s, e]) => `${this.floatToTime(s)}-${this.floatToTime(e)}`).join(' / ')
            : '終日休業';

        // 添付画像サムネイル
        const mediaHtml = (item.mediaUrls && item.mediaUrls.length > 0)
            ? `<div class="pending-media-thumbs">
                ${item.mediaUrls.map((url, idx) => `
                    <img src="${url}" class="pending-thumb" alt="添付画像${idx + 1}" onclick="app.openImageModal('${url}', '${item.shopName}の投稿画像')">
                `).join('')}
               </div>`
            : '';

        const skipBannerHtml = isSkipped ? `
            <div style="background: #2a2215; border: 1px solid #7a5c1a; border-radius: 4px; padding: 6px 10px; margin-bottom: 8px; font-size: 0.8rem; color: #ffca28; display: flex; align-items: center; gap: 6px;">
                <span>ℹ️ <strong>スキップ理由:</strong> ${item.skipReason || '既存の営業時間・登録スケジュールと完全に一致するため反映不要'}</span>
            </div>
        ` : '';

        card.innerHTML = `
            ${skipBannerHtml}
            <div class="pending-header">
                <div class="pending-shop-title">
                    <span>🍜 ${item.shopName || item.shopId}</span>
                    ${accountUrl ? `
                        <a href="${accountUrl}" target="_blank" rel="noopener noreferrer" class="pending-source-tag ${postSource}" title="公式アカウント (@${handle}) を開く" style="text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-size:0.75rem; cursor:pointer;">
                            <span>${postSource.toUpperCase()}</span>
                            <span>@${handle}</span>
                            <span style="font-size:0.65rem;">↗</span>
                        </a>
                    ` : `
                        <span class="pending-source-tag ${postSource}">${postSource.toUpperCase()}</span>
                    `}
                </div>
                <div class="pending-meta">
                    <span>${postDateStr}</span>
                    ${accountUrl ? `<a href="${accountUrl}" target="_blank" rel="noopener noreferrer" style="color:#aaa; text-decoration:none; display:inline-flex; align-items:center; gap:3px; padding:2px 6px; background:#222; border-radius:4px; border:1px solid #444;" title="公式アカウントのプロフィールを開く">👤 公式アカウント</a>` : ''}
                    ${item.postUrl ? `<a href="${item.postUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--jiro-yellow); text-decoration:none; font-weight:bold; padding:2px 6px; background:#222; border-radius:4px; border:1px solid #444;">↗ 元ポストを開く</a>` : ''}
                </div>
            </div>

            <div class="pending-post-box">
                <div>${item.postText || '（テキストなし）'}</div>
                ${mediaHtml}
            </div>

            <div class="pending-ai-box ${isClosure ? 'is-closure' : (isSpecial ? 'is-special' : '')}">
                <div class="pending-ai-title ${typeClass}">
                    <span>🤖 AI抽出結果: <strong>${typeLabel}</strong></span>
                    <span style="font-size:0.75rem; font-weight:normal; opacity:0.8;">(信頼度: ${Math.round((change.confidence || 1) * 100)}%)</span>
                </div>
                <div class="pending-ai-details">
                    <div>📅 <strong>対象期間:</strong> ${change.startDate || ''} ${change.endDate && change.endDate !== change.startDate ? '〜 ' + change.endDate : ''}</div>
                    <div>⏰ <strong>営業時間:</strong> ${hoursText}</div>
                    ${change.reason ? `<div>💬 <strong>理由・備考:</strong> ${change.reason}</div>` : ''}
                </div>
            </div>

            <div class="pending-actions">
                <button class="btn btn-sm" onclick="app.rejectPending('${item.id}')" style="background:#2a2a2a; border-color:#444; color:#bbb;">❌ 削除</button>
                <button class="btn btn-sm" onclick="app.editPending('${item.id}')" style="background:#263238; border-color:#37474f; color:#80d8ff;">✏️ 編集して反映</button>
                <button class="btn btn-sm btn-success" onclick="app.approvePending('${item.id}')">✅ ${isSkipped ? '強制反映' : '承認して反映'}</button>
            </div>
        `;

        return card;
    }

    async approvePending(pendingId) {
        const item = this.pendingUpdates.find(p => p.id === pendingId);
        if (!item) return;

        // 承認の前に最新の shops.json が取得・同期されているか確認
        const loaded = await this.ensureLatestShopsLoaded();
        if (!loaded) return;

        const shop = this.shops.find(s => s.id === item.shopId);
        if (!shop) {
            alert(`店舗ID "${item.shopId}" が見つかりませんでした。店舗データ内に該当店舗が存在しません。`);
            return;
        }

        if (!shop.temporary) shop.temporary = [];
        const change = item.detectedChange || {};
        const startDate = change.startDate;
        const endDate = change.endDate || startDate;
        const hours = change.hours || [];

        // 既存の同日重複エントリを削除（上書き）
        shop.temporary = shop.temporary.filter(t => t.startDate !== startDate);

        // 新規エントリ挿入
        shop.temporary.push({
            startDate: startDate,
            endDate: endDate,
            hours: hours
        });

        // 日付順にソート
        shop.temporary = this.sortTemporaryDates(shop.temporary);

        // 承認リストから除外
        this.pendingUpdates = this.pendingUpdates.filter(p => p.id !== pendingId);
        this.updatePendingBadge();
        this.renderPendingList();

        alert(`【${shop.name}】の営業変更（${startDate}）を承認し、shops.json に反映しました！\n反映を確定するには、上部の「🚀 GitHubへ送信」を押して保存してください。`);
    }

    async approveAllPending() {
        if (!this.pendingUpdates || this.pendingUpdates.length === 0) return;
        if (!confirm(`表示中の未承認候補（${this.pendingUpdates.length}件）をすべて承認して shops.json に反映しますか？`)) return;

        // 承認の前に最新の shops.json が取得・同期されているか確認
        const loaded = await this.ensureLatestShopsLoaded();
        if (!loaded) return;

        let successCount = 0;
        const pendingCopy = [...this.pendingUpdates];
        pendingCopy.forEach(item => {
            const shop = this.shops.find(s => s.id === item.shopId);
            if (shop) {
                if (!shop.temporary) shop.temporary = [];
                const change = item.detectedChange || {};
                const startDate = change.startDate;
                const endDate = change.endDate || startDate;
                const hours = change.hours || [];

                shop.temporary = shop.temporary.filter(t => t.startDate !== startDate);
                shop.temporary.push({
                    startDate: startDate,
                    endDate: endDate,
                    hours: hours
                });
                shop.temporary = this.sortTemporaryDates(shop.temporary);
                successCount++;
            }
        });

        this.pendingUpdates = [];
        this.updatePendingBadge();
        this.renderPendingList();

        alert(`${successCount}件の営業変更をすべて承認・反映しました！\n反映を確定するには、上部の「🚀 GitHubへ送信」を押して保存してください。`);
    }

    editPending(pendingId) {
        const item = this.pendingUpdates.find(p => p.id === pendingId);
        if (!item) return;

        const shop = this.shops.find(s => s.id === item.shopId);
        if (!shop) {
            alert(`店舗 "${item.shopId}" が見つかりません。`);
            return;
        }

        // 店舗別タブに切り替えて対象店舗を選択
        this.switchMode('single');
        this.selectShop(shop.id);

        // 臨時休業リストにAI提案値を仮追加
        const change = item.detectedChange || {};
        const hoursStr = (change.hours && change.hours.length > 0)
            ? change.hours.map(([s, e]) => `${this.floatToTime(s)}-${this.floatToTime(e)}`).join(', ')
            : '';

        this.currentTemporary.push({
            startDate: change.startDate || '',
            endDate: change.endDate || change.startDate || '',
            hours: hoursStr
        });
        this.renderTemporaryList();

        // 承認待ちリストから消化
        this.pendingUpdates = this.pendingUpdates.filter(p => p.id !== pendingId);
        this.updatePendingBadge();

        // フォーム最下部へスクロールしてハイライト
        setTimeout(() => {
            const tempBox = document.getElementById('temporary-list-container');
            if (tempBox) tempBox.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }

    rejectPending(pendingId) {
        if (!confirm('この更新候補を却下・削除しますか？')) return;
        this.pendingUpdates = this.pendingUpdates.filter(p => p.id !== pendingId);
        this.updatePendingBadge();
        this.renderPendingList();
    }

    openImageModal(src, title) {
        if (!this.el.imagePreviewModal) return;
        this.el.imagePreviewImg.src = src;
        if (this.el.imagePreviewTitle) this.el.imagePreviewTitle.textContent = title || '投稿添付画像';
        this.el.imagePreviewModal.classList.add('active');
    }

    closeImageModal() {
        if (!this.el.imagePreviewModal) return;
        this.el.imagePreviewModal.classList.remove('active');
        this.el.imagePreviewImg.src = '';
    }

    loadFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                this.shops = JSON.parse(evt.target.result);
                this.shops.forEach(shop => {
                    if (shop.temporary) shop.temporary = this.sortTemporaryDates(shop.temporary);
                    if (shop.notes !== undefined && shop.remarks === undefined) {
                        shop.remarks = shop.notes;
                        delete shop.notes;
                    }
                });
                this.sortShopsByOpenedAt();
                this.renderList();
                if (this.currentMode === 'bulk') this.renderBulkTable();
                alert(`${this.shops.length}件のデータを読み込みました。`);
            } catch (err) {
                alert('JSONの解析に失敗しました。');
            }
        };
        reader.readAsText(file);
    }

    parseShiftString(str) {
        if (typeof JiroBusinessHours !== 'undefined' && JiroBusinessHours.parseShiftString) {
            return JiroBusinessHours.parseShiftString(str);
        }
        return [];
    }

    formatShiftArray(arr) {
        if (typeof JiroBusinessHours !== 'undefined' && JiroBusinessHours.formatShiftArray) {
            return JiroBusinessHours.formatShiftArray(arr);
        }
        return '';
    }

    timeToFloat(timeStr) {
        if (typeof JiroUtils !== 'undefined' && JiroUtils.timeToFloat) {
            return JiroUtils.timeToFloat(timeStr);
        }
        const [h, m] = (timeStr || '').trim().split(':').map(Number);
        if (isNaN(h)) return null;
        return h + ((m || 0) / 60);
    }

    floatToTime(val) {
        if (typeof JiroUtils !== 'undefined' && JiroUtils.formatTime) {
            return JiroUtils.formatTime(val);
        }
        const h = Math.floor(val);
        const m = Math.round((val - h) * 60);
        return `${h}:${m < 10 ? '0' : ''}${m}`;
    }

    renderTemporaryList() {
        this.el.tempContainer.innerHTML = '';
        if (this.currentTemporary.length === 0) {
            this.el.tempContainer.innerHTML = `<div style="color: #666; font-size: 0.75rem; text-align: center; padding: 2px;">設定はありません</div>`;
            return;
        }

        this.currentTemporary.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'list-row';
            const hoursStr = this.formatShiftArray(item.hours);
            const sDate = item.startDate || item.date || '';
            const eDate = item.endDate || '';
            const isNoEndDate = !item.endDate;

            row.innerHTML = `
                <div class="date-input-wrapper" style="position: relative; display: inline-block;">
                    <input type="text" class="date-pick s-date date-input" value="${sDate}" placeholder="開始日" data-idx="${index}" style="padding-right: 24px;">
                    <span class="cal-icon" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); pointer-events: none; opacity: 0.5; display: inline-flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></span>
                </div>
                <span style="color:#666;">～</span>
                <div class="date-input-wrapper" style="position: relative; display: inline-block; ${isNoEndDate ? 'opacity: 0.4;' : ''}">
                    <input type="text" class="date-pick e-date date-input" value="${eDate}" placeholder="終了日" data-idx="${index}" ${isNoEndDate ? 'disabled' : ''} style="padding-right: 24px;">
                    <span class="cal-icon" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); pointer-events: none; opacity: 0.5; display: inline-flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></span>
                </div>
                <label class="checkbox-label" style="margin: 0 4px;">
                    <input type="checkbox" ${isNoEndDate ? 'checked' : ''} onchange="app.toggleTempNoEndDate(${index}, this)"> 未定
                </label>
                <input type="text" class="hours-input" value="${hoursStr}" placeholder="例: 11:00-14:30 (休業は空欄)" data-temp-hours="${index}" onblur="app.handleShiftBlur(this)">
                <button type="button" class="btn btn-danger btn-sm" onclick="app.removeTemporary(${index})">削除</button>
            `;
            this.el.tempContainer.appendChild(row);
        });

        const rows = this.el.tempContainer.querySelectorAll('.list-row');
        rows.forEach((row, idx) => {
            const sInput = row.querySelector('.s-date');
            const eInput = row.querySelector('.e-date');
            const chkNoEnd = row.querySelector('input[type="checkbox"]');

            let ePick = flatpickr(eInput, {
                locale: "ja", dateFormat: "Y-m-d", allowInput: true, disableMobile: true
            });

            flatpickr(sInput, {
                locale: "ja",
                dateFormat: "Y-m-d",
                allowInput: true,
                disableMobile: true,
                onChange: (selectedDates, dateStr) => {
                    const currentEndVal = eInput.value.trim();
                    if (!chkNoEnd.checked && currentEndVal && currentEndVal < dateStr) {
                        eInput.value = dateStr;
                        ePick.setDate(dateStr);
                        this.currentTemporary[idx].endDate = dateStr;
                    }
                    this.currentTemporary[idx].startDate = dateStr;
                }
            });
        });
    }

    toggleTempNoEndDate(index, checkbox) {
        this.gatherTemporaryFromDOM();
        const row = checkbox.closest('.list-row');
        const endInput = row.querySelector('.e-date');
        const wrapper = endInput ? endInput.closest('.date-input-wrapper') : null;
        if (checkbox.checked) {
            endInput.value = '';
            endInput.disabled = true;
            if (wrapper) wrapper.style.opacity = '0.4';
            else endInput.style.opacity = '0.4';
            this.currentTemporary[index].endDate = null;
        } else {
            endInput.disabled = false;
            if (wrapper) wrapper.style.opacity = '1';
            else endInput.style.opacity = '1';
        }
    }

    removeTemporary(index) {
        this.gatherTemporaryFromDOM();
        this.currentTemporary.splice(index, 1);
        this.renderTemporaryList();
    }

    gatherTemporaryFromDOM() {
        const rows = this.el.tempContainer.querySelectorAll('.list-row');
        const updated = [];
        rows.forEach((row) => {
            const sInput = row.querySelector('.s-date');
            const eInput = row.querySelector('.e-date');
            const hInput = row.querySelector('input[data-temp-hours]');
            const chkNoEnd = row.querySelector('input[type="checkbox"]');
            
            if (sInput && sInput.value) {
                const sDate = sInput.value;
                const eDate = chkNoEnd.checked ? null : (eInput.value || null);
                updated.push({
                    startDate: sDate,
                    endDate: eDate,
                    hours: this.parseShiftString(hInput ? hInput.value : '')
                });
            }
        });
        this.currentTemporary = updated;
    }

    renderSpecialList() {
        this.el.specialContainer.innerHTML = '';
        if (this.currentSpecialShifts.length === 0) {
            this.el.specialContainer.innerHTML = `<div style="color: #666; font-size: 0.75rem; text-align: center; padding: 2px;">設定はありません</div>`;
            return;
        }

        const weeks = [{v:1, l:'第1'}, {v:2, l:'第2'}, {v:3, l:'第3'}, {v:4, l:'第4'}, {v:5, l:'第5'}, {v:-1, l:'最終'}];
        const days = [{v:1, l:'月'}, {v:2, l:'火'}, {v:3, l:'水'}, {v:4, l:'木'}, {v:5, l:'金'}, {v:6, l:'土'}, {v:0, l:'日'}];

        this.currentSpecialShifts.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'list-row';
            const hoursStr = this.formatShiftArray(item.hours);
            
            let weekOpts = weeks.map(w => `<option value="${w.v}" ${item.week === w.v ? 'selected' : ''}>${w.l}</option>`).join('');
            let dayOpts = days.map(d => `<option value="${d.v}" ${item.day === d.v ? 'selected' : ''}>${d.l}曜</option>`).join('');

            row.innerHTML = `
                <select class="spec-week" style="width:70px;">${weekOpts}</select>
                <select class="spec-day" style="width:70px;">${dayOpts}</select>
                <input type="text" class="hours-input spec-hours" value="${hoursStr}" placeholder="例: 11:00-14:30 (休業は空欄)" onblur="app.handleShiftBlur(this)">
                <button type="button" class="btn btn-danger btn-sm" onclick="app.removeSpecial(${index})">削除</button>
            `;
            this.el.specialContainer.appendChild(row);
        });
    }

    removeSpecial(index) {
        this.gatherSpecialFromDOM();
        this.currentSpecialShifts.splice(index, 1);
        this.renderSpecialList();
    }

    gatherSpecialFromDOM() {
        const rows = this.el.specialContainer.querySelectorAll('.list-row');
        const updated = [];
        rows.forEach(row => {
            const wVal = parseInt(row.querySelector('.spec-week').value, 10);
            const dVal = parseInt(row.querySelector('.spec-day').value, 10);
            const hVal = row.querySelector('.spec-hours').value;
            updated.push({ week: wVal, day: dVal, hours: this.parseShiftString(hVal) });
        });
        this.currentSpecialShifts = updated;
    }

    renderHolidaySpecialList() {
        this.el.holidaySpecialContainer.innerHTML = '';
        if (this.currentHolidaySpecialShifts.length === 0) {
            this.el.holidaySpecialContainer.innerHTML = `<div style="color: #666; font-size: 0.75rem; text-align: center; padding: 2px;">設定はありません</div>`;
            return;
        }

        const days = [{v:1, l:'月'}, {v:2, l:'火'}, {v:3, l:'水'}, {v:4, l:'木'}, {v:5, l:'金'}, {v:6, l:'土'}, {v:0, l:'日'}];
        const offsets = [{v:0, l:'当日(0日後)'}, {v:1, l:'翌日(1日後)'}];

        this.currentHolidaySpecialShifts.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'list-row';
            const hoursStr = this.formatShiftArray(item.hours);
            
            let dayOpts = days.map(d => `<option value="${d.v}" ${item.triggerDay === d.v ? 'selected' : ''}>${d.l}曜</option>`).join('');
            let offsetOpts = offsets.map(o => `<option value="${o.v}" ${item.targetOffset === o.v ? 'selected' : ''}>${o.l}</option>`).join('');

            row.innerHTML = `
                <select class="transfer-trigger" style="width:70px;">${dayOpts}</select>
                <span style="font-size:0.8rem; color:#aaa;">が祝日の場合、</span>
                <select class="transfer-offset" style="width:110px;">${offsetOpts}</select>
                <span style="font-size:0.8rem; color:#aaa;">の営業時間を</span>
                <input type="text" class="hours-input transfer-hours" value="${hoursStr}" placeholder="例: 11:00-14:00 (空欄で定休)" onblur="app.handleShiftBlur(this)">
                <button type="button" class="btn btn-danger btn-sm" onclick="app.removeHolidaySpecial(${index})">削除</button>
            `;
            this.el.holidaySpecialContainer.appendChild(row);
        });
    }

    removeHolidaySpecial(index) {
        this.gatherHolidaySpecialFromDOM();
        this.currentHolidaySpecialShifts.splice(index, 1);
        this.renderHolidaySpecialList();
    }

    gatherHolidaySpecialFromDOM() {
        const rows = this.el.holidaySpecialContainer.querySelectorAll('.list-row');
        const updated = [];
        rows.forEach(row => {
            const triggerEl = row.querySelector('.transfer-trigger');
            const offsetEl = row.querySelector('.transfer-offset');
            const hoursEl = row.querySelector('.transfer-hours');
            if (triggerEl && offsetEl) {
                const tVal = parseInt(triggerEl.value, 10);
                const oVal = parseInt(offsetEl.value, 10);
                const hVal = hoursEl ? hoursEl.value : '';
                updated.push({
                    triggerDay: tVal,
                    targetOffset: oVal,
                    hours: this.parseShiftString(hVal)
                });
            }
        });
        this.currentHolidaySpecialShifts = updated;
    }

    hiraganaToKatakana(str) {
        if (typeof JiroUtils !== 'undefined') return JiroUtils.hiraganaToKatakana(str);
        if (!str) return '';
        return str.replace(/[\u3041-\u3096]/g, function(match) {
            return String.fromCharCode(match.charCodeAt(0) + 0x60);
        });
    }

    renderList() {
        this.updateManualAiShopOptions();
        const query = this.el.searchInput.value.toLowerCase().trim();
        const katakanaQuery = this.hiraganaToKatakana(query);
        const showOpen = document.getElementById('filter-open').checked;
        const showPreOpen = document.getElementById('filter-preopen').checked;
        const showClosed = document.getElementById('filter-closed').checked;
        
        this.el.shopList.innerHTML = '';
        let count = 0;

        this.shops.forEach(shop => {
            if (query) {
                const name = (shop.name || '').toLowerCase();
                const id = (shop.id || '').toLowerCase();
                const fullAddress = (typeof LG_CODES !== 'undefined' ? LG_CODES.getShopFullAddress(shop) : `${shop.addressText || ''}`).toLowerCase();
                const kana = (shop.kana || '').toLowerCase();

                const matches = name.includes(query) ||
                                id.includes(query) ||
                                fullAddress.includes(query) ||
                                kana.includes(katakanaQuery) ||
                                kana.includes(query);
                if (!matches) return;
            }
            
            const status = this.getShopStatus(shop);
            if (status === 'OPEN' && !showOpen) return;
            if (status === 'BEFORE_OPEN' && !showPreOpen) return;
            if (status === 'CLOSED' && !showClosed) return;

            count++;
            let badgeHtml = '';
            if (status === 'BEFORE_OPEN') badgeHtml = `<span class="status-badge before-open">オープン前</span>`;
            else if (status === 'CLOSED') badgeHtml = `<span class="status-badge closed">閉店</span>`;

            const prefCity = typeof LG_CODES !== 'undefined' ? LG_CODES.getPrefAndCityName(shop.prefCode, shop.cityCode) : '';
            const item = document.createElement('div');
            item.className = `shop-item ${shop.id === this.selectedId ? 'active' : ''}`;
            item.innerHTML = `
                <div class="shop-item-title"><span>${shop.name || '(名称未設定)'}</span>${badgeHtml}</div>
                <div class="shop-item-sub">${shop.id} | ${prefCity || ''}</div>
            `;
            item.onclick = () => this.selectShop(shop.id);
            this.el.shopList.appendChild(item);
        });

        const countText = query ? `表示中 ${count} 件 (検索ヒット)` : `表示中 ${count} 件`;
        this.el.shopCountHeader.textContent = countText;
        this.el.summaryShopCount.textContent = countText;
    }

    updateEditingTitle(shop) {
        const titleEl = document.getElementById('editing-shop-title');
        if (!titleEl) return;
        const name = shop ? (shop.name || '(名称未設定)') : '';
        const id = shop ? (shop.id || '') : '';
        titleEl.textContent = shop ? `${name} [ID: ${id}]` : '';
    }

    updateEditingTitleFromInputs() {
        const titleEl = document.getElementById('editing-shop-title');
        if (!titleEl) return;
        const name = document.getElementById('field-name')?.value?.trim() || '(名称未設定)';
        const id = document.getElementById('field-id')?.value?.trim() || '';
        titleEl.textContent = `${name} [ID: ${id}]`;
    }

    selectShop(id, skipSave = false) {
        this.selectedId = id;
        this.renderList();

        const shop = this.shops.find(s => s.id === id);
        if (!shop) return;

        if (window.innerWidth < 768) {
            this.el.sidebarDetails.removeAttribute('open');
        }

        this.el.noSelection.style.display = 'none';
        this.el.form.style.display = 'block';

        this.updateEditingTitle(shop);

        document.getElementById('field-id').value = shop.id || '';
        document.getElementById('field-name').value = shop.name || '';
        document.getElementById('field-kana').value = this.normalizeFurigana(shop.kana || '');
        document.getElementById('field-shortName').value = shop.shortName || '';
        const prefCode = typeof LG_CODES !== 'undefined' ? LG_CODES.getPrefCodeByCityCode(shop.cityCode) : '';
        if (this.el.prefCodeInput) this.el.prefCodeInput.value = prefCode;
        this.updateCityOptions(prefCode, shop.cityCode || '');
        document.getElementById('field-addressText').value = this.cleanAddress(shop.addressText || '');
        document.getElementById('field-lat').value = shop.lat ?? '';
        document.getElementById('field-lng').value = shop.lng ?? '';
        
        this.updateSingleMapLink();
        this.updateSingleGMapSearchLink();
        
        document.getElementById('field-openedAt').value = shop.openedAt || '';
        document.getElementById('field-closedAt').value = shop.closedAt || '';
        
        if (shop.urls) {
            document.getElementById('field-url-pc').value = shop.urls.pc || '';
            document.getElementById('field-url-rdb').value = shop.urls.rdb || '';
            document.getElementById('field-url-tabelog').value = shop.urls.tabelog || '';
        } else {
            document.getElementById('field-url-pc').value = '';
            document.getElementById('field-url-rdb').value = '';
            document.getElementById('field-url-tabelog').value = '';
        }
        this.updateSingleUrlLink('pc');
        this.updateSingleUrlLink('rdb');
        this.updateSingleUrlLink('tabelog');

        document.getElementById('field-x').value = this.normalizeAccountID(shop.x || '');
        document.getElementById('field-instagram').value = this.normalizeAccountID(shop.instagram || '');
        this.updateSingleXLink();
        this.updateSingleInstaLink();

        document.getElementById('field-ticketTiming').value = shop.ticketTiming || '';
        document.getElementById('field-soupType').value = shop.soupType || '';
        document.getElementById('field-renge').value = shop.renge || '';
        document.getElementById('field-takeout').value = shop.takeout || '';
        document.getElementById('field-hoursNotes').value = shop.hoursNotes || '';
        document.getElementById('field-remarks').value = shop.remarks || shop.notes || '';
        
        this.currentTemporary = shop.temporary ? JSON.parse(JSON.stringify(shop.temporary)) : [];
        this.renderTemporaryList();

        this.currentSpecialShifts = shop.specialShifts ? JSON.parse(JSON.stringify(shop.specialShifts)) : [];
        this.renderSpecialList();

        this.currentHolidaySpecialShifts = shop.holidaySpecialShifts ? JSON.parse(JSON.stringify(shop.holidaySpecialShifts)) : [];
        this.renderHolidaySpecialList();

        const shifts = shop.shiftsByDay || {};
        for (let i = 0; i <= 6; i++) {
            const input = document.getElementById(`shift-${i}`);
            input.value = this.formatShiftArray(shifts[i]);
            input.classList.remove('error');
        }

        if (shop.holidayShifts === null) {
            this.el.chkFollowWeekday.checked = true;
            this.el.shiftHolInput.value = '';
            this.el.shiftHolInput.disabled = true;
            this.el.shiftHolInput.style.opacity = '0.4';
            this.el.shiftHolInput.classList.remove('error');
        } else {
            this.el.chkFollowWeekday.checked = false;
            this.el.shiftHolInput.disabled = false;
            this.el.shiftHolInput.style.opacity = '1';
            this.el.shiftHolInput.value = this.formatShiftArray(shop.holidayShifts);
            this.el.shiftHolInput.classList.remove('error');
        }
    }

    gatherFormShopData() {
        if (!this.selectedId) return null;
        const idInput = document.getElementById('field-id');
        if (!idInput) return null;
        const id = idInput.value.trim();
        if (!id) return null;

        this.gatherTemporaryFromDOM();
        this.gatherSpecialFromDOM();
        this.gatherHolidaySpecialFromDOM();

        const shiftsByDay = {};
        for (let i = 0; i <= 6; i++) {
            shiftsByDay[i] = this.parseShiftString(document.getElementById(`shift-${i}`).value);
        }

        return {
            id: id,
            name: document.getElementById('field-name').value,
            kana: this.normalizeFurigana(document.getElementById('field-kana').value),
            shortName: document.getElementById('field-shortName').value.trim(),
            prefCode: this.el.prefCodeInput ? this.el.prefCodeInput.value : '',
            cityCode: this.el.cityCodeInput ? this.el.cityCodeInput.value : '',
            addressText: this.cleanAddress(document.getElementById('field-addressText').value),
            lat: parseFloat(document.getElementById('field-lat').value) || 0,
            lng: parseFloat(document.getElementById('field-lng').value) || 0,
            openedAt: this.normalizeDate(document.getElementById('field-openedAt').value),
            closedAt: this.normalizeDate(document.getElementById('field-closedAt').value),
            urls: {
                pc: document.getElementById('field-url-pc').value.trim(),
                rdb: document.getElementById('field-url-rdb').value.trim(),
                tabelog: document.getElementById('field-url-tabelog').value.trim()
            },
            x: this.normalizeAccountID(document.getElementById('field-x').value),
            instagram: this.normalizeAccountID(document.getElementById('field-instagram').value),
            ticketTiming: document.getElementById('field-ticketTiming').value,
            soupType: document.getElementById('field-soupType').value.trim(),
            renge: document.getElementById('field-renge').value.trim(),
            takeout: document.getElementById('field-takeout').value.trim(),
            hoursNotes: document.getElementById('field-hoursNotes').value,
            remarks: document.getElementById('field-remarks').value,
            temporary: JSON.parse(JSON.stringify(this.sortTemporaryDates(this.currentTemporary))),
            specialShifts: this.currentSpecialShifts.length > 0 ? JSON.parse(JSON.stringify(this.currentSpecialShifts)) : undefined,
            holidaySpecialShifts: this.currentHolidaySpecialShifts.length > 0 ? JSON.parse(JSON.stringify(this.currentHolidaySpecialShifts)) : undefined,
            shiftsByDay: shiftsByDay,
            holidayShifts: this.el.chkFollowWeekday.checked ? null : this.parseShiftString(this.el.shiftHolInput.value)
        };
    }

    saveCurrentShop() {
        try {
            const draftShop = this.gatherFormShopData();
            if (!draftShop) return;

            const beforeShops = JSON.parse(JSON.stringify(this.shops));
            const afterShops = JSON.parse(JSON.stringify(this.shops));

            let idx = afterShops.findIndex(s => s.id === this.selectedId);
            if (idx >= 0) {
                afterShops[idx] = draftShop;
            } else {
                afterShops.push(draftShop);
            }

            const diffs = this.getShopsDiffList(beforeShops, afterShops);
            const targetDiffs = diffs.filter(d => d.shopId === draftShop.id);

            if (targetDiffs.length === 0) {
                alert('変更箇所はありません。');
                return;
            }

            this.pendingSaveContext = {
                mode: 'single',
                targetId: this.selectedId,
                draftShop: draftShop
            };

            this.showSaveDiffModal(beforeShops, afterShops, draftShop.id);
        } catch (err) {
            console.error('saveCurrentShop Error:', err);
            alert('保存処理中にエラーが発生しました:\n' + err.message);
        }
    }

    renderBulkTable() {
        const fieldKey = this.el.bulkTargetField.value;
        const selectedOptionText = this.el.bulkTargetField.options[this.el.bulkTargetField.selectedIndex].text;
        
        if (fieldKey === 'id_pc') {
            this.el.bulkFieldHeader.innerHTML = `<div style="display:flex; gap:8px;"><span style="width:120px;">ID (id)</span><span style="flex:1;">PC URL</span></div>`;
        } else if (fieldKey === 'name_kana_short' || fieldKey === 'name_kana') {
            this.el.bulkFieldHeader.innerHTML = `<div style="display:flex; gap:8px;"><span style="flex:1;">店舗名</span><span style="flex:1;">フリガナ</span><span style="width:100px;">略称(5字)</span></div>`;
        } else if (fieldKey === 'pref_city_address' || fieldKey === 'pref_address') {
            this.el.bulkFieldHeader.innerHTML = `<div style="display:flex; gap:8px;"><span style="width:90px;">都道府県</span><span style="width:120px;">市区町村</span><span style="flex:1;">町名・番地等</span></div>`;
        } else if (fieldKey === 'lat_lng') {
            this.el.bulkFieldHeader.innerHTML = `<div style="display:flex; gap:8px;"><span style="flex:1;">緯度</span><span style="flex:1;">経度</span></div>`;
        } else if (fieldKey === 'dates') {
            this.el.bulkFieldHeader.innerHTML = `<div style="display:flex; gap:8px;"><span style="flex:1;">開店日</span><span style="flex:1;">閉店日</span></div>`;
        } else if (fieldKey === 'x_instagram') {
            this.el.bulkFieldHeader.innerHTML = `<div style="display:flex; gap:8px;"><span style="flex:1;">𝕏 ID</span><span style="flex:1;">Instagram ID</span></div>`;
        } else if (fieldKey === 'features') {
            this.el.bulkFieldHeader.innerHTML = `<div style="display:flex; gap:6px;"><span style="flex:1;">食券</span><span style="flex:1;">スープ</span><span style="flex:1;">レンゲ</span><span style="flex:1;">テイクアウト</span></div>`;
        } else if (fieldKey === 'notes') {
            this.el.bulkFieldHeader.innerHTML = `<div style="display:flex; gap:8px;"><span style="flex:1;">営業時間補足</span><span style="flex:1;">備考</span></div>`;
        } else {
            this.el.bulkFieldHeader.innerHTML = `<span>${selectedOptionText}</span>`;
        }

        this.el.bulkTableBody.innerHTML = '';
        if (this.shops.length === 0) return;

        this.shops.forEach((shop) => {
            const tr = document.createElement('tr');
            let inputHtml = '';
            const status = this.getShopStatus(shop);
            let badgeHtml = status === 'BEFORE_OPEN' ? `<span class="status-badge before-open">オープン前</span>` : (status === 'CLOSED' ? `<span class="status-badge closed">閉店</span>` : '');

            if (fieldKey === 'id_pc') {
                const pcVal = shop.urls?.pc || '';
                const linkUrl = pcVal ? (pcVal.startsWith('http') ? pcVal : `https://${pcVal}`) : '#';
                inputHtml = `
                    <div class="bulk-row-flex">
                        <div class="bulk-field-wrap" style="width:120px; flex:none;">
                            <input type="text" data-shop-id="${shop.id}" data-bulk-sub="id" value="${shop.id || ''}" oninput="app.toHalfWidth(this)">
                        </div>
                        <div class="bulk-field-wrap" style="flex:1;">
                            <input type="text" data-shop-id="${shop.id}" data-bulk-sub="urls.pc" value="${pcVal}" oninput="app.toHalfWidth(this); app.updateBulkLink(this, 'urls.pc')">
                        </div>
                        <a href="${linkUrl}" target="_blank" class="btn btn-sm" data-bulk-link-btn="${shop.id}" style="${pcVal?'':'display:none;'}">🔗</a>
                    </div>`;
            } else if (fieldKey === 'name_kana_short' || fieldKey === 'name_kana') {
                const gmapUrl = this.generateMapUrl(shop.prefCode, shop.cityCode, shop.addressText, shop.name);
                inputHtml = `
                    <div class="bulk-row-flex">
                        <div class="bulk-field-wrap" style="flex:1;"><input type="text" data-shop-id="${shop.id}" data-bulk-sub="name" value="${shop.name || ''}" placeholder="店舗名" oninput="app.updateBulkGMapLink(this)"></div>
                        <div class="bulk-field-wrap" style="flex:1;"><input type="text" data-shop-id="${shop.id}" data-bulk-sub="kana" value="${shop.kana || ''}" placeholder="フリガナ" onblur="this.value=app.normalizeFurigana(this.value)"></div>
                        <div class="bulk-field-wrap" style="width:100px; flex:none;"><input type="text" data-shop-id="${shop.id}" data-bulk-sub="shortName" maxlength="5" value="${shop.shortName || ''}" placeholder="略称(5字)"></div>
                        <a href="${gmapUrl}" target="_blank" class="btn btn-sm" data-bulk-gmap-btn="${shop.id}">🗺️</a>
                    </div>`;
            } else if (fieldKey === 'pref_city_address' || fieldKey === 'pref_address') {
                const prefCode = typeof LG_CODES !== 'undefined' ? LG_CODES.getPrefCodeByCityCode(shop.cityCode) : '';
                let prefOpts = '<option value="">選択</option>';
                if (typeof LG_CODES !== 'undefined') {
                    for (const pCode in LG_CODES.prefs) {
                        prefOpts += `<option value="${pCode}" ${prefCode === pCode ? 'selected' : ''}>${LG_CODES.prefs[pCode]}</option>`;
                    }
                }
                let cityOpts = '<option value="">選択</option>';
                if (typeof LG_CODES !== 'undefined' && prefCode) {
                    const cities = LG_CODES.getCitiesByPref(prefCode);
                    for (const cCode in cities) {
                        cityOpts += `<option value="${cCode}" ${shop.cityCode === cCode ? 'selected' : ''}>${cities[cCode]}</option>`;
                    }
                }
                const gmapUrl = this.generateMapUrl(prefCode, shop.cityCode, shop.addressText, shop.name);
                inputHtml = `
                    <div class="bulk-row-flex">
                        <div class="bulk-field-wrap" style="width:90px; flex:none;"><select data-shop-id="${shop.id}" data-bulk-sub="prefCode" onchange="app.handleBulkPrefChange(this)"><option value="">選択</option>${prefOpts}</select></div>
                        <div class="bulk-field-wrap" style="width:120px; flex:none;"><select data-shop-id="${shop.id}" data-bulk-sub="cityCode" onchange="app.updateBulkGMapLink(this)"><option value="">選択</option>${cityOpts}</select></div>
                        <div class="bulk-field-wrap" style="flex:1;"><input type="text" data-shop-id="${shop.id}" data-bulk-sub="addressText" value="${shop.addressText || ''}" onblur="app.handleAddressBlur(this); app.updateBulkGMapLink(this);"></div>
                        <a href="${gmapUrl}" target="_blank" class="btn btn-sm" data-bulk-gmap-btn="${shop.id}">🗺️</a>
                    </div>`;
            } else if (fieldKey === 'lat_lng') {
                const latVal = shop.lat ?? 0, lngVal = shop.lng ?? 0;
                inputHtml = `
                    <div class="bulk-row-flex">
                        <div class="bulk-field-wrap" style="flex:1;"><input type="text" data-shop-id="${shop.id}" data-bulk-sub="lat" value="${latVal}" oninput="app.toHalfWidth(this); app.updateBulkMapLink(this)"></div>
                        <div class="bulk-field-wrap" style="flex:1;"><input type="text" data-shop-id="${shop.id}" data-bulk-sub="lng" value="${lngVal}" oninput="app.toHalfWidth(this); app.updateBulkMapLink(this)"></div>
                        <a href="https://www.google.com/maps?q=${latVal},${lngVal}" target="_blank" class="btn btn-sm" data-bulk-map-btn="${shop.id}">📍</a>
                    </div>`;
            } else if (fieldKey === 'dates') {
                inputHtml = `
                    <div class="bulk-row-flex">
                        <div class="bulk-field-wrap"><input type="text" data-shop-id="${shop.id}" data-bulk-sub="openedAt" value="${shop.openedAt || ''}" oninput="app.toHalfWidth(this)" onblur="this.value=app.normalizeDate(this.value)||''"></div>
                        <div class="bulk-field-wrap"><input type="text" data-shop-id="${shop.id}" data-bulk-sub="closedAt" value="${shop.closedAt || ''}" oninput="app.toHalfWidth(this)" onblur="this.value=app.normalizeDate(this.value)||''"></div>
                    </div>`;
            } else if (fieldKey === 'x_instagram') {
                const xVal = shop.x || '', iVal = shop.instagram || '';
                const xLink = xVal ? `https://x.com/${xVal}` : '#';
                const iLink = iVal ? `https://instagram.com/${iVal}` : '#';
                inputHtml = `
                    <div class="bulk-row-flex">
                        <div class="bulk-field-wrap" style="flex:1; flex-direction:row; gap:4px; align-items:center;">
                            <input type="text" data-shop-id="${shop.id}" data-bulk-sub="x" value="${xVal}" placeholder="𝕏 ID" oninput="app.toHalfWidth(this); app.updateBulkLinkDual(this, 'x')">
                            <a href="${xLink}" target="_blank" class="btn btn-sm" data-bulk-link-x="${shop.id}" style="${xVal?'':'display:none;'}">🔗</a>
                        </div>
                        <div class="bulk-field-wrap" style="flex:1; flex-direction:row; gap:4px; align-items:center;">
                            <input type="text" data-shop-id="${shop.id}" data-bulk-sub="instagram" value="${iVal}" placeholder="Instagram ID" oninput="app.toHalfWidth(this); app.updateBulkLinkDual(this, 'insta')">
                            <a href="${iLink}" target="_blank" class="btn btn-sm" data-bulk-link-insta="${shop.id}" style="${iVal?'':'display:none;'}">🔗</a>
                        </div>
                    </div>`;
            } else if (fieldKey === 'features') {
                inputHtml = `
                    <div class="bulk-row-flex">
                        <div class="bulk-field-wrap" style="flex:1;"><input type="text" data-shop-id="${shop.id}" data-bulk-sub="ticketTiming" value="${shop.ticketTiming || ''}" placeholder="食券"></div>
                        <div class="bulk-field-wrap" style="flex:1; flex-direction:row; gap:2px;">
                            <select onchange="if(this.value){ const inp=this.nextElementSibling; inp.value=this.value; }" style="width:58px; flex:none; padding:2px; font-size:0.75rem;">
                                <option value="">選択</option>
                                <option value="非乳化">非乳化</option>
                                <option value="微乳化">微乳化</option>
                                <option value="乳化">乳化</option>
                                <option value="ど乳化">ど乳化</option>
                            </select>
                            <input type="text" data-shop-id="${shop.id}" data-bulk-sub="soupType" value="${shop.soupType || ''}" placeholder="スープ" style="flex:1;">
                        </div>
                        <div class="bulk-field-wrap" style="flex:1; flex-direction:row; gap:2px;">
                            <select onchange="if(this.value){ const inp=this.nextElementSibling; inp.value=this.value; }" style="width:50px; flex:none; padding:2px; font-size:0.75rem;">
                                <option value="">選択</option>
                                <option value="あり">あり</option>
                                <option value="なし">なし</option>
                            </select>
                            <input type="text" data-shop-id="${shop.id}" data-bulk-sub="renge" value="${shop.renge || ''}" placeholder="レンゲ" style="flex:1;">
                        </div>
                        <div class="bulk-field-wrap" style="flex:1; flex-direction:row; gap:2px;">
                            <select onchange="if(this.value){ const inp=this.nextElementSibling; inp.value=this.value; }" style="width:50px; flex:none; padding:2px; font-size:0.75rem;">
                                <option value="">選択</option>
                                <option value="可">可</option>
                                <option value="不可">不可</option>
                            </select>
                            <input type="text" data-shop-id="${shop.id}" data-bulk-sub="takeout" value="${shop.takeout || ''}" placeholder="テイクアウト" style="flex:1;">
                        </div>
                    </div>`;
            } else if (fieldKey === 'notes') {
                inputHtml = `
                    <div class="bulk-row-flex">
                        <div class="bulk-field-wrap"><textarea data-shop-id="${shop.id}" data-bulk-sub="hoursNotes" rows="1">${shop.hoursNotes || ''}</textarea></div>
                        <div class="bulk-field-wrap"><textarea data-shop-id="${shop.id}" data-bulk-sub="remarks" rows="1">${shop.remarks || shop.notes || ''}</textarea></div>
                    </div>`;
            } else if (fieldKey === 'shifts_all') {
                const days = [{id:'1', l:'月'}, {id:'2', l:'火'}, {id:'3', l:'水'}, {id:'4', l:'木'}, {id:'5', l:'金'}, {id:'6', l:'土'}, {id:'0', l:'日'}];
                let itemsHtml = '';
                days.forEach(d => {
                    const val = this.formatShiftArray(shop.shiftsByDay ? shop.shiftsByDay[d.id] : []);
                    itemsHtml += `<div class="bulk-shift-item"><label>${d.l}</label><input type="text" data-shop-id="${shop.id}" data-bulk-shift-day="${d.id}" value="${val}" onblur="app.handleShiftBlur(this)"></div>`;
                });
                const isNull = shop.holidayShifts === null;
                const holVal = isNull ? '' : this.formatShiftArray(shop.holidayShifts);
                itemsHtml += `
                    <div class="bulk-shift-item" style="border-color:#ff8a80; background:#201616;">
                        <label style="color:#ff8a80;">祝</label>
                        <input type="text" data-shop-id="${shop.id}" data-bulk-shift-hol value="${holVal}" ${isNull ? 'disabled style="opacity:0.4;"' : ''} onblur="app.handleShiftBlur(this)">
                        <label class="checkbox-label" style="font-size:0.7rem; margin-left:2px;"><input type="checkbox" data-shop-id="${shop.id}" data-bulk-shift-hol-chk ${isNull?'checked':''} onchange="app.toggleBulkShiftHolCheckbox(this)"> 平日準拠</label>
                    </div>
                    <div class="bulk-shift-item" style="flex:1; min-width:100%; border-color:#666; background:#161616; display:flex; flex-direction:row; align-items:center; gap:8px; box-sizing:border-box;">
                        <label style="color:#ccc; width:auto; white-space:nowrap; margin:0;">補足</label>
                        <input type="text" data-shop-id="${shop.id}" data-bulk-shift-hours-notes value="${shop.hoursNotes || ''}" placeholder="例: 早仕舞いあり 等" style="flex:1;">
                    </div>`;
                inputHtml = `<div class="bulk-shifts-wrapper">${itemsHtml}</div>`;
            } else {
                let currentVal = '';
                if (fieldKey === 'urls.pc') currentVal = shop.urls?.pc || '';
                else if (fieldKey === 'urls.rdb') currentVal = shop.urls?.rdb || '';
                else if (fieldKey === 'urls.tabelog') currentVal = shop.urls?.tabelog || '';

                let linkUrl = currentVal ? (currentVal.startsWith('http') ? currentVal : `https://${currentVal}`) : '#';
                inputHtml = `
                    <div class="bulk-row-flex">
                        <div class="bulk-field-wrap" style="flex: 1;"><input type="text" data-shop-id="${shop.id}" data-bulk-single-field="${fieldKey}" value="${currentVal}" oninput="app.toHalfWidth(this); app.updateBulkLink(this, '${fieldKey}')"></div>
                        <a href="${linkUrl}" target="_blank" class="btn btn-sm" data-bulk-link-btn="${shop.id}" style="${currentVal ? '' : 'display:none;'}">🔗</a>
                    </div>`;
            }

            tr.innerHTML = `<td class="shop-name-col"><div class="shop-name-row-flex"><span>${shop.name || '(未設定)'}</span>${badgeHtml}</div><span class="shop-id-badge">${shop.id}</span></td><td>${inputHtml}</td>`;
            this.el.bulkTableBody.appendChild(tr);
        });
    }

    updateBulkMapLink(input) {
        const row = input.closest('tr');
        const latInput = row.querySelector('[data-bulk-sub="lat"]');
        const lngInput = row.querySelector('[data-bulk-sub="lng"]');
        const mapBtn = row.querySelector('[data-bulk-map-btn]');
        if (latInput && lngInput) {
            this.handleLatLngInput(latInput, lngInput);
            if (mapBtn) {
                const lat = latInput.value.trim(), lng = lngInput.value.trim();
                if (lat && lng && !isNaN(lat) && !isNaN(lng)) mapBtn.href = `https://www.google.com/maps?q=${lat},${lng}`;
            }
        }
    }

    handleBulkPrefChange(prefSelect) {
        const row = prefSelect.closest('tr');
        const citySelect = row.querySelector('[data-bulk-sub="cityCode"]');
        const prefCode = prefSelect.value;
        if (citySelect && typeof LG_CODES !== 'undefined') {
            let html = '<option value="">選択</option>';
            if (prefCode) {
                const cities = LG_CODES.getCitiesByPref(prefCode);
                for (const cCode in cities) {
                    html += `<option value="${cCode}">${cities[cCode]}</option>`;
                }
            }
            citySelect.innerHTML = html;
        }
        this.updateBulkGMapLink(prefSelect);
    }

    updateBulkGMapLink(element) {
        const row = element.closest('tr');
        const shopIdNode = row.querySelector('[data-shop-id]');
        const shop = shopIdNode ? this.shops.find(s => s.id === shopIdNode.getAttribute('data-shop-id')) : null;
        const prefInput = row.querySelector('[data-bulk-sub="prefCode"]');
        const cityInput = row.querySelector('[data-bulk-sub="cityCode"]');
        const addressInput = row.querySelector('[data-bulk-sub="addressText"]');
        const nameInput = row.querySelector('[data-bulk-sub="name"]');
        const gmapBtn = row.querySelector('[data-bulk-gmap-btn]');
        if (gmapBtn) {
            const cityCode = cityInput ? cityInput.value : (shop ? shop.cityCode : '');
            const prefCode = prefInput ? prefInput.value : (typeof LG_CODES !== 'undefined' ? LG_CODES.getPrefCodeByCityCode(cityCode) : '');
            const address = addressInput ? addressInput.value : (shop ? shop.addressText : '');
            const name = nameInput ? nameInput.value : (shop ? shop.name : '');
            gmapBtn.href = this.generateMapUrl(prefCode, cityCode, address, name);
        }
    }

    updateBulkLink(input, fieldKey) {
        const row = input.closest('tr');
        const linkBtn = row.querySelector('[data-bulk-link-btn]');
        if (!linkBtn) return;
        const val = input.value.trim();
        if (val) {
            linkBtn.href = val.startsWith('http') ? val : `https://${val}`;
            linkBtn.style.display = 'inline-flex';
        } else { linkBtn.style.display = 'none'; }
    }

    updateBulkLinkDual(input, type) {
        const row = input.closest('tr');
        const btn = row.querySelector(`[data-bulk-link-${type}]`);
        const val = this.normalizeAccountID(input.value);
        if (val) {
            btn.href = `https://${type === 'x' ? 'x.com' : 'instagram.com'}/${val}`;
            btn.style.display = 'inline-flex';
        } else { btn.style.display = 'none'; }
    }

    toggleBulkShiftHolCheckbox(chk) {
        const wrap = chk.closest('.bulk-shift-item');
        const input = wrap.querySelector('[data-bulk-shift-hol]');
        if (chk.checked) {
            input.value = ''; input.disabled = true; input.style.opacity = '0.4'; input.classList.remove('error');
        } else {
            input.disabled = false; input.style.opacity = '1';
        }
    }

    saveBulkData(silent = false) {
        const fieldKey = this.el.bulkTargetField.value;

        if (['id_pc', 'name_kana_short', 'name_kana', 'pref_city_address', 'pref_address', 'lat_lng', 'dates', 'x_instagram', 'features', 'notes'].includes(fieldKey)) {
            const rows = this.el.bulkTableBody.querySelectorAll('tr');
            rows.forEach(row => {
                const shopIdCheck = row.querySelector('[data-shop-id]');
                if (!shopIdCheck) return;
                const shop = this.shops.find(s => s.id === shopIdCheck.getAttribute('data-shop-id'));
                if (!shop) return;

                row.querySelectorAll('[data-bulk-sub]').forEach(input => {
                    const subKey = input.getAttribute('data-bulk-sub');
                    let val = input.value.trim();
                    if (subKey === 'id' && val && val !== shop.id) { shop.id = val; shopIdCheck.setAttribute('data-shop-id', val); }
                    else if (subKey === 'kana') shop.kana = this.normalizeFurigana(val);
                    else if (subKey === 'addressText') shop.addressText = this.cleanAddress(val);
                    else if (subKey === 'urls.pc') { if(!shop.urls) shop.urls={}; shop.urls.pc = val; }
                    else if (subKey === 'lat' || subKey === 'lng') shop[subKey] = val === '' ? 0 : parseFloat(val);
                    else if (subKey === 'openedAt' || subKey === 'closedAt') shop[subKey] = this.normalizeDate(val);
                    else if (subKey === 'x' || subKey === 'instagram') shop[subKey] = this.normalizeAccountID(val);
                    else shop[subKey] = val;
                });
            });
        } else if (fieldKey === 'shifts_all') {
            this.el.bulkTableBody.querySelectorAll('tr').forEach(row => {
                const shop = this.shops.find(s => s.id === row.querySelector('[data-shop-id]').getAttribute('data-shop-id'));
                if (!shop) return;
                if (!shop.shiftsByDay) shop.shiftsByDay = {};
                row.querySelectorAll('[data-bulk-shift-day]').forEach(inp => shop.shiftsByDay[inp.getAttribute('data-bulk-shift-day')] = this.parseShiftString(inp.value));
                const holChk = row.querySelector('[data-bulk-shift-hol-chk]');
                const holInput = row.querySelector('[data-bulk-shift-hol]');
                shop.holidayShifts = (holChk && holChk.checked) ? null : this.parseShiftString(holInput.value);
                const notesInput = row.querySelector('[data-bulk-shift-hours-notes]');
                if (notesInput) shop.hoursNotes = notesInput.value.trim();
            });
        } else {
            this.el.bulkTableBody.querySelectorAll('[data-bulk-single-field]').forEach(input => {
                const shop = this.shops.find(s => s.id === input.getAttribute('data-shop-id'));
                if (!shop) return;
                let val = input.value.trim();
                if (fieldKey === 'urls.pc') { if (!shop.urls) shop.urls = {}; shop.urls.pc = val; }
                else if (fieldKey === 'urls.rdb') { if (!shop.urls) shop.urls = {}; shop.urls.rdb = val; }
                else if (fieldKey === 'urls.tabelog') { if (!shop.urls) shop.urls = {}; shop.urls.tabelog = val; }
            });
        }
        this.sortShopsByOpenedAt();
        this.renderList();
        if (this.currentMode === 'bulk') this.renderBulkTable();
        if (!silent) alert('一括編集した内容を保存しました。');
    }

    addNewShop() {
        const newId = 'shop_' + Date.now().toString().slice(-4);
        const newShop = {
            id: newId, name: '新店舗名', kana: '', shortName: '', cityCode: '13103', addressText: '', lat: 35.681237, lng: 139.767125,
            urls: { pc: '', rdb: '', tabelog: '' }, x: '', instagram: '', ticketTiming: '', soupType: '', renge: '', takeout: '', hoursNotes: '', remarks: '',
            openedAt: null, closedAt: null, temporary: [], specialShifts: [], holidaySpecialShifts: [],
            shiftsByDay: { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] }, holidayShifts: null
        };
        this.shops.push(newShop);
        this.sortShopsByOpenedAt();
        this.selectShop(newId, true);
    }

    duplicateCurrentShop() {
        if (!this.selectedId) return;
        const current = this.shops.find(s => s.id === this.selectedId);
        const copy = JSON.parse(JSON.stringify(current));
        copy.id = current.id + '_copy'; copy.name = current.name + ' (コピー)';
        this.shops.push(copy);
        this.sortShopsByOpenedAt();
        this.selectShop(copy.id, true);
    }

    deleteCurrentShop() {
        if (!this.selectedId) return;
        if (!confirm('この店舗を削除してもよろしいですか？')) return;
        this.shops = this.shops.filter(s => s.id !== this.selectedId);
        this.selectedId = null;
        this.el.form.style.display = 'none';
        this.el.noSelection.style.display = 'block';
        this.renderList();
    }

    exportJSON() {
        this.shops.forEach(shop => { if (shop.temporary) shop.temporary = this.sortTemporaryDates(shop.temporary); });
        this.sortShopsByOpenedAt();
        const blob = new Blob([JSON.stringify(this.shops, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'shops.json'; a.click();
        URL.revokeObjectURL(url);
    }

    // ==========================================
    // AI学習・判定ルール管理 (AI Guidelines)
    // ==========================================
    async loadAiGuidelines() {
        try {
            const res = await fetch('data/ai_guidelines.json?t=' + Date.now());
            if (res.ok) {
                this.aiGuidelines = await res.json();
                localStorage.setItem('ai_guidelines', JSON.stringify(this.aiGuidelines));
                return;
            }
        } catch (e) {
            console.warn('Failed to fetch data/ai_guidelines.json directly, trying local storage...');
        }

        const local = localStorage.getItem('ai_guidelines');
        if (local) {
            try {
                this.aiGuidelines = JSON.parse(local);
                return;
            } catch (e) {}
        }

        // デフォルト初期値
        this.aiGuidelines = {
            version: "1.0",
            lastUpdated: new Date().toISOString(),
            generalRules: [
                {
                    id: "rule_shifts_definition",
                    title: "昼の部・夜の部の定義",
                    rule: "「昼の部」「昼」は店舗の2部営業のうち前半側のシフト（1部目）、「夜の部」「夜」は後半側のシフト（2部目）を指します。"
                },
                {
                    id: "rule_night_off",
                    title: "「夜の部お休み」の解釈",
                    rule: "「夜の部お休み」「夜はお休み」等は終日休業ではなく「昼の部は通常営業し、夜の部のみ休業」を意味します。hours には前半の通常営業シフト時間を設定してください。"
                },
                {
                    id: "rule_day_only",
                    title: "「昼のみ」「夜のみ」の解釈",
                    rule: "「昼のみ」は前半1部のみ営業（夜休業）、「夜のみ」は後半2部目のみ営業（昼休業）を意味します。"
                },
                {
                    id: "rule_realtime_closure",
                    title: "リアルタイム営業終了アナウンスの終了時刻反映",
                    rule: "「並びで終了」「麺切れ終了」等の当日終了アナウンスは除外せず、投稿時刻（または文中の時刻）を終了時刻として反映してください。昼営業終了時は夜営業を維持してください。"
                }
            ],
            shopSpecificRules: {},
            fewShotExamples: []
        };
    }

    openAiGuidelinesModal() {
        if (!this.el.aiRulesModal) return;
        this.renderAiRulesList();
        
        // キーワード入力欄への反映
        const kwInput = document.getElementById('ai-keywords-input');
        const periodInput = document.getElementById('ai-period-keywords-input');
        if (kwInput && this.aiGuidelines && this.aiGuidelines.scheduleKeywords) {
            kwInput.value = (this.aiGuidelines.scheduleKeywords.keywords || []).join(', ');
        }
        if (periodInput && this.aiGuidelines && this.aiGuidelines.scheduleKeywords) {
            periodInput.value = (this.aiGuidelines.scheduleKeywords.periodKeywords || []).join(', ');
        }

        if (this.el.aiRulesRawJson) {
            this.el.aiRulesRawJson.value = JSON.stringify(this.aiGuidelines, null, 2);
        }
        if (this.el.aiRulesSaveStatus) {
            this.el.aiRulesSaveStatus.textContent = '';
        }
        this.el.aiRulesModal.classList.add('active');
    }

    closeAiGuidelinesModal() {
        if (!this.el.aiRulesModal) return;
        this.el.aiRulesModal.classList.remove('active');
    }

    renderAiRulesList() {
        if (!this.el.aiRulesList || !this.aiGuidelines) return;
        this.el.aiRulesList.innerHTML = '';

        const rules = this.aiGuidelines.generalRules || [];
        rules.forEach((rule, idx) => {
            const row = document.createElement('div');
            row.style.cssText = 'background: #222; border: 1px solid #444; border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;';
            row.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                    <input type="text" class="ai-rule-title" value="${rule.title || ''}" placeholder="ルール見出し" style="background: #111; border: 1px solid #555; color: var(--jiro-yellow); padding: 3px 6px; border-radius: 4px; font-weight: bold; font-size: 0.82rem; flex: 1;">
                    <button type="button" class="btn btn-sm btn-danger" onclick="app.removeAiRule(${idx})" style="padding: 2px 6px; font-size: 0.75rem;">✕</button>
                </div>
                <textarea class="ai-rule-body" rows="2" placeholder="AIへの指示・解釈ルール" style="width: 100%; background: #181818; border: 1px solid #555; color: #fff; padding: 4px 6px; border-radius: 4px; font-size: 0.8rem; line-height: 1.3;">${rule.rule || ''}</textarea>
            `;
            this.el.aiRulesList.appendChild(row);
        });
    }

    addNewAiRule() {
        if (!this.aiGuidelines) return;
        if (!this.aiGuidelines.generalRules) this.aiGuidelines.generalRules = [];
        this.syncAiRulesFromUI();
        this.aiGuidelines.generalRules.push({
            id: 'rule_' + Date.now().toString(36),
            title: '新規判定ルール',
            rule: ''
        });
        this.renderAiRulesList();
        if (this.el.aiRulesRawJson) {
            this.el.aiRulesRawJson.value = JSON.stringify(this.aiGuidelines, null, 2);
        }
    }

    removeAiRule(idx) {
        if (!this.aiGuidelines || !this.aiGuidelines.generalRules) return;
        this.syncAiRulesFromUI();
        this.aiGuidelines.generalRules.splice(idx, 1);
        this.renderAiRulesList();
        if (this.el.aiRulesRawJson) {
            this.el.aiRulesRawJson.value = JSON.stringify(this.aiGuidelines, null, 2);
        }
    }

    syncAiRulesFromUI() {
        if (!this.aiGuidelines) return;

        // キーワード設定のUI同期
        if (!this.aiGuidelines.scheduleKeywords) {
            this.aiGuidelines.scheduleKeywords = { keywords: [], periodKeywords: [], patterns: [] };
        }
        const kwInput = document.getElementById('ai-keywords-input');
        if (kwInput && kwInput.value) {
            this.aiGuidelines.scheduleKeywords.keywords = kwInput.value.split(/[,、]/).map(s => s.trim()).filter(Boolean);
        }
        const periodInput = document.getElementById('ai-period-keywords-input');
        if (periodInput && periodInput.value) {
            this.aiGuidelines.scheduleKeywords.periodKeywords = periodInput.value.split(/[,、]/).map(s => s.trim()).filter(Boolean);
        }

        if (this.el.aiRulesList) {
            const titles = this.el.aiRulesList.querySelectorAll('.ai-rule-title');
            const bodies = this.el.aiRulesList.querySelectorAll('.ai-rule-body');
            const newRules = [];
            titles.forEach((tInput, i) => {
                const bInput = bodies[i];
                newRules.push({
                    id: (this.aiGuidelines.generalRules && this.aiGuidelines.generalRules[i] && this.aiGuidelines.generalRules[i].id) || ('rule_' + Date.now().toString(36) + '_' + i),
                    title: tInput.value.trim(),
                    rule: bInput ? bInput.value.trim() : ''
                });
            });
            this.aiGuidelines.generalRules = newRules;
        }
    }

    async saveAiGuidelines() {
        if (!this.aiGuidelines) return;

        // RAW JSON の入力があれば優先的に構文チェック
        if (this.el.aiRulesRawJson && this.el.aiRulesRawJson.value.trim()) {
            try {
                const parsed = JSON.parse(this.el.aiRulesRawJson.value.trim());
                this.aiGuidelines = parsed;
            } catch (e) {
                alert('JSONの書式にエラーがあります:\n' + e.message);
                return;
            }
        } else {
            this.syncAiRulesFromUI();
        }

        this.aiGuidelines.lastUpdated = new Date().toISOString();
        localStorage.setItem('ai_guidelines', JSON.stringify(this.aiGuidelines, null, 2));

        const statusElem = this.el.aiRulesSaveStatus;
        if (statusElem) statusElem.textContent = '保存中...';

        const cfg = this.loadGithubConfig();
        const hasGhConfig = cfg && cfg.token && cfg.owner && cfg.repo;

        if (hasGhConfig) {
            try {
                // GitHub上の data/ai_guidelines.json の sha を取得
                const targetPath = 'data/ai_guidelines.json';
                const getUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${targetPath}?ref=${cfg.branch}`;
                let fileSha = null;

                const getRes = await fetch(getUrl, {
                    headers: {
                        'Authorization': `Bearer ${cfg.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                if (getRes.ok) {
                    const fileData = await getRes.json();
                    fileSha = fileData.sha;
                }

                const jsonStr = JSON.stringify(this.aiGuidelines, null, 2);
                const contentBase64 = btoa(unescape(encodeURIComponent(jsonStr)));

                const putUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${targetPath}`;
                const putRes = await fetch(putUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${cfg.token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    body: JSON.stringify({
                        message: 'feat(ai): update AI guidelines and prompt rules from editor',
                        content: contentBase64,
                        branch: cfg.branch,
                        sha: fileSha || undefined
                    })
                });

                if (putRes.ok) {
                    if (statusElem) statusElem.textContent = '✅ GitHubに保存・コミット完了！';
                    alert('🧠 AI判定ルールをGitHub（data/ai_guidelines.json）に直接保存・プッシュしました！\n次回以降の自動巡回および手動解析に即時反映されます。');
                    this.closeAiGuidelinesModal();
                    return;
                } else {
                    const errData = await putRes.json();
                    console.warn('GitHub commit failed for ai_guidelines:', errData);
                }
            } catch (err) {
                console.error('GitHub save error for ai_guidelines:', err);
            }
        }

        if (statusElem) statusElem.textContent = '✅ ブラウザに保存完了';
        alert('🧠 AI判定ルールをブラウザに保存しました。\n（GitHub PATが設定されている場合はGitHubへも直接コミット可能です）');
        this.closeAiGuidelinesModal();
    }
}

let app;
window.addEventListener('DOMContentLoaded', () => {
    app = new EditorApp();
    window.app = app;
    app.renderList();
});

