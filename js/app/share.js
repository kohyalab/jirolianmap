/**
 * JiroAppShare - 画像生成・SNS共有モジュール
 * 依存: html2canvas, js/common/utils.js, js/common/business-hours.js
 */
(function (global) {
    'use strict';

    let currentShareTarget = {
        container: null,
        shop: null,
        layoutType: 'calendar',
        fileName: '',
        shareText: '',
        btnElement: null
    };

    function getTimestampStr(date = new Date()) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const mi = String(date.getMinutes()).padStart(2, '0');
        const ss = String(date.getSeconds()).padStart(2, '0');
        return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
    }

    function getGlobalShops() {
        if (Array.isArray(global.shops) && global.shops.length > 0) return global.shops;
        if (typeof window !== 'undefined' && Array.isArray(window.shops) && window.shops.length > 0) return window.shops;
        if (typeof shops !== 'undefined' && Array.isArray(shops) && shops.length > 0) return shops;
        return [];
    }

    async function captureElementWithPadding(targetElement, padding = 16) {
        const hideElements = targetElement.querySelectorAll('.sns-share-btn, .export-img-btn, .modal-close-btn');
        hideElements.forEach(el => el.style.visibility = 'hidden');

        try {
            const rect = targetElement.getBoundingClientRect();
            const targetW = Math.ceil(targetElement.offsetWidth || rect.width || targetElement.scrollWidth || 360);
            const targetH = Math.ceil(targetElement.offsetHeight || rect.height || targetElement.scrollHeight || 100);
            // 横幅が1200pxを超える巨大テーブル（一覧スケジュール等）はメモリ負荷とタイムアウト軽減のため scale: 1.5
            const renderScale = targetW > 1200 ? 1.5 : 2;

            const origCanvas = await html2canvas(targetElement, {
                backgroundColor: '#141414',
                scale: renderScale,
                useCORS: true,
                logging: false,
                scrollX: 0,
                scrollY: 0,
                width: targetW,
                height: targetH,
                windowWidth: Math.max(targetW + 60, 600),
                windowHeight: Math.max(targetH + 60, 600),
                onclone: (clonedDoc) => {
                    const clonedBody = clonedDoc.body;
                    if (clonedBody) {
                        clonedBody.style.setProperty('--jiro-yellow', '#ffcc00');
                        clonedBody.style.setProperty('--jiro-red', '#ff3333');
                        clonedBody.style.setProperty('--jiro-dark', '#121212');
                        clonedBody.style.setProperty('--card-bg', '#1e1e1e');
                        clonedBody.style.setProperty('--text-color', '#f5f5f5');
                        clonedBody.style.setProperty('--border-color', '#333333');
                        clonedBody.style.width = (targetW + 40) + 'px';
                        clonedBody.style.overflow = 'visible';
                    }

                    // クローンされた対象要素とその親要素の幅・overflow制約を解除
                    const clonedTarget = (targetElement.id ? clonedDoc.getElementById(targetElement.id) : null) || clonedDoc.querySelector(`.${targetElement.className.split(' ')[0]}`);
                    if (clonedTarget) {
                        if (targetElement.style.width && targetElement.style.width !== '100%') {
                            clonedTarget.style.width = targetElement.style.width;
                        } else {
                            clonedTarget.style.width = 'max-content';
                        }
                        clonedTarget.style.maxWidth = 'none';
                        clonedTarget.style.overflow = 'visible';
                        clonedTarget.style.height = 'auto';
                        clonedTarget.style.minHeight = 'auto';

                        let parent = clonedTarget.parentElement;
                        while (parent && parent !== clonedDoc.body) {
                            parent.style.width = 'max-content';
                            parent.style.maxWidth = 'none';
                            parent.style.overflow = 'visible';
                            parent = parent.parentElement;
                        }
                    }
                }
            });

            hideElements.forEach(el => el.style.visibility = '');

            if (!origCanvas || origCanvas.width === 0 || origCanvas.height === 0) {
                console.error('[CAPTURE] html2canvas returned zero-size canvas');
                return null;
            }

            const paddedCanvas = document.createElement('canvas');
            const p = padding * 2;
            const pTop = Math.round(padding * 2.5); // 上部余白を少しゆったり確保
            paddedCanvas.width = origCanvas.width + (p * 2);
            paddedCanvas.height = origCanvas.height + pTop + (p * 2);

            const ctx = paddedCanvas.getContext('2d');
            ctx.fillStyle = '#1e1e1e';
            ctx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
            ctx.drawImage(origCanvas, p, pTop);

            // フッター注記テキスト追加（上部余白とバランスよく調整）
            const noticeText = '※記載内容は変更となる場合がありますので、ご自身でもご確認ください';
            let fontSize = 20;
            ctx.font = `${fontSize}px 'Noto Sans JP', -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif`;
            const textWidth = ctx.measureText(noticeText).width;
            const maxAvailableWidth = paddedCanvas.width - 24;
            if (textWidth > maxAvailableWidth) {
                fontSize = Math.floor(fontSize * (maxAvailableWidth / textWidth));
                ctx.font = `${fontSize}px 'Noto Sans JP', -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif`;
            }
            ctx.fillStyle = '#999999';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(noticeText, paddedCanvas.width / 2, origCanvas.height + pTop + p);

            return paddedCanvas;
        } catch (err) {
            hideElements.forEach(el => el.style.visibility = '');
            throw err;
        }
    }

    function fallbackDownloadFile(fileOrBlob, fileName) {
        try {
            const blob = fileOrBlob instanceof Blob ? fileOrBlob : new Blob([fileOrBlob], { type: 'image/png' });
            const name = fileOrBlob.name || (fileName ? (fileName.endsWith('.png') ? fileName : `${fileName}.png`) : 'image.png');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            console.error('Download error:', e);
        }
    }

    function fallbackShareImage(blob, fileName, text) {
        try {
            if (navigator.clipboard && window.ClipboardItem) {
                const item = new ClipboardItem({ 'image/png': blob });
                navigator.clipboard.write([item]);
            }
        } catch (e) {}

        const link = document.createElement('a');
        link.download = `${fileName}.png`;
        link.href = URL.createObjectURL(blob);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        const tweetText = encodeURIComponent(`${text}\n(※画像を保存しました。貼り付けて投稿できます)`);
        const tweetUrl = `https://x.com/intent/post?text=${tweetText}`;
        window.open(tweetUrl, '_blank', 'noopener,noreferrer');
    }

    function openShareOptionsModal(container, shop, layoutType, fileName, shareText, btnElement = null) {
        currentShareTarget = { container, shop, layoutType, fileName, shareText, btnElement };

        const modal = document.getElementById('share-options-modal');
        if (!modal) return;

        const daysSection = document.getElementById('share-opt-days-section');
        const conquestSection = document.getElementById('share-opt-conquest-section');
        const statusSection = document.getElementById('share-opt-status-section');
        const metaSection = document.getElementById('share-opt-meta-section');
        const splitSection = document.getElementById('share-opt-split-section');

        if (daysSection) daysSection.style.display = (layoutType === 'matrix') ? 'block' : 'none';
        // 制覇状態が表示されるレイアウト（店舗情報-コンパクト: minimal、店舗情報-詳細: popup_detail）で「制覇状況の表示」を表示
        const isConquestApplicable = (layoutType === 'minimal' || layoutType === 'popup_detail');
        if (conquestSection) conquestSection.style.display = isConquestApplicable ? 'block' : 'none';
        // 現在の営業状況（リアルタイム判定）が表示されるレイアウト（店舗情報-コンパクト: minimal、店舗詳細: popup_detail）のみ表示
        const isStatusApplicable = (layoutType === 'minimal') || (layoutType === 'popup_detail' && (!shop || !shop.closedAt));
        if (statusSection) statusSection.style.display = isStatusApplicable ? 'block' : 'none';
        if (metaSection) {
            metaSection.style.display = (layoutType === 'calendar' || layoutType === 'popup_detail') ? 'block' : 'none';
            metaSection.style.borderTop = 'none';
            metaSection.style.paddingTop = '0';
        }

        const daysInput = document.getElementById('share-opt-days-input');
        if (daysInput && layoutType === 'matrix') {
            const currentPeriod = (getCurrentViewSettings && getCurrentViewSettings().period) || '28';
            const currentVal = parseInt(currentPeriod, 10);
            daysInput.value = (Number.isFinite(currentVal) && currentVal >= 1 && currentVal <= 28) ? currentVal : 28;
        }

        const isMinimal = (layoutType === 'minimal');
        const conquestCb = document.getElementById('share-opt-conquest');
        if (conquestCb) conquestCb.checked = true;

        const usernameWrap = document.getElementById('share-opt-username-wrap');
        if (usernameWrap) {
            const updateUsernameDisplay = () => {
                usernameWrap.style.display = (isMinimal && conquestCb && conquestCb.checked) ? 'block' : 'none';
            };
            updateUsernameDisplay();
            if (conquestCb) {
                conquestCb.onchange = updateUsernameDisplay;
            }
        }

        const statusCb = document.getElementById('share-opt-status');
        if (statusCb) statusCb.checked = true;

        const addressRadio = document.getElementById('share-opt-meta-address');
        const openedRadio = document.getElementById('share-opt-meta-opened');
        const addressWrap = document.getElementById('share-opt-meta-address-wrap');
        const openedWrap = document.getElementById('share-opt-meta-opened-wrap');

        const isCalendar = (layoutType === 'calendar');
        if (addressRadio) addressRadio.disabled = !isCalendar;
        if (openedRadio) openedRadio.disabled = !isCalendar;
        if (addressWrap) addressWrap.style.display = isCalendar ? 'flex' : 'none';
        if (openedWrap) openedWrap.style.display = isCalendar ? 'flex' : 'none';

        // デフォルトのメタ情報選択肢は「表示しない」
        const radios = document.querySelectorAll('input[name="share-opt-meta"]');
        radios.forEach(r => {
            r.checked = (r.value === 'none');
        });

        // 複数店舗の情報を出力する「店舗情報-コンパクト」「営業情報-日別」「営業情報-一覧」において分割オプションを選択可能に
        const isMultiShopLayout = (layoutType === 'minimal' || layoutType === 'today' || layoutType === 'matrix' || layoutType === 'calendar_all');
        if (splitSection) {
            if (isMultiShopLayout && container) {
                splitSection.style.display = 'block';

                const updateSplitOptionState = () => {
                    let w = container.scrollWidth || container.getBoundingClientRect().width || 600;
                    let h = container.scrollHeight || container.getBoundingClientRect().height || 800;

                    if (layoutType === 'matrix') {
                        const rawDays = parseInt(document.getElementById('share-opt-days-input')?.value || '28', 10);
                        const daysVal = Math.min(28, Math.max(1, Number.isFinite(rawDays) ? rawDays : 28));
                        const rowCount = container.querySelectorAll('tbody tr').length || 44;
                        h = 120 + rowCount * 30;
                        w = 70 + (daysVal * 42);
                    } else if (layoutType === 'today' || layoutType === 'calendar_all') {
                        const shopCards = container.querySelectorAll('.shop-item');
                        const rowCount = Math.ceil((shopCards.length || 44) / 6);
                        h = 120 + rowCount * 60;
                        w = 527;
                    } else if (layoutType === 'minimal') {
                        const shopCards = container.querySelectorAll('.shop-item');
                        const rowCount = Math.ceil((shopCards.length || 44) / 6);
                        h = 120 + rowCount * 56;
                        w = 527;
                    }

                    const ratio = h / w;
                    const splitCb = document.getElementById('share-opt-split');
                    const splitNote = document.getElementById('share-opt-split-note');
                    const targetVal = document.querySelector('input[name="share-opt-split-target"]:checked')?.value || 'x';

                    // ユーザーが自由に分割するかどうか選択できるように disabled は解除
                    if (splitCb) {
                        splitCb.disabled = false;
                    }

                    let estimatedParts = 1;
                    if (targetVal === 'x') {
                        if (ratio > 4 / 3) {
                            estimatedParts = Math.min(4, Math.max(2, Math.ceil(ratio / (4 / 3))));
                        }
                    } else {
                        if (ratio > 1.0) {
                            estimatedParts = Math.max(2, Math.ceil(ratio / 1.0));
                        }
                    }

                    const isOverRatio = (targetVal === 'x' && ratio > 4 / 3) || (targetVal === 'instagram' && ratio > 1.0);

                    // ユーザーが明示的に操作していない場合は、アスペクト比基準に応じて推奨設定
                    if (splitCb && !splitCb.dataset.userTouched) {
                        splitCb.checked = isOverRatio;
                    }

                    const isChecked = splitCb ? splitCb.checked : false;
                    if (splitNote) {
                        if (isChecked) {
                            if (targetVal === 'x') {
                                splitNote.textContent = `※X向け基準(縦/横 ≦ 4/3)に合わせて、各画像の店舗数が均等になるよう自動分割(約${estimatedParts}枚)して出力します。`;
                            } else {
                                splitNote.textContent = `※Instagram向け基準(縦/横 ≦ 1/1)に合わせて、各画像の店舗数が均等になるよう自動分割(約${estimatedParts}枚)して出力します。`;
                            }
                        } else {
                            splitNote.textContent = `※分割せず、全店舗を1枚の画像として出力します。`;
                        }
                    }
                };

                const splitCb = document.getElementById('share-opt-split');
                if (splitCb) {
                    delete splitCb.dataset.userTouched;
                    splitCb.onchange = () => {
                        splitCb.dataset.userTouched = 'true';
                        updateSplitOptionState();
                    };
                }

                updateSplitOptionState();
                const splitTargetRadios = document.querySelectorAll('input[name="share-opt-split-target"]');
                splitTargetRadios.forEach(radio => {
                    radio.onchange = () => {
                        if (splitCb) delete splitCb.dataset.userTouched;
                        updateSplitOptionState();
                    };
                });
                if (daysInput) {
                    daysInput.oninput = updateSplitOptionState;
                    daysInput.onchange = updateSplitOptionState;
                }
            } else {
                splitSection.style.display = 'none';
            }
        }

        if (typeof modal.showModal === 'function') {
            modal.showModal();
        } else {
            modal.style.display = 'block';
        }
    }

    function closeShareOptionsModal() {
        const modal = document.getElementById('share-options-modal');
        if (!modal) return;
        if (typeof modal.close === 'function') {
            modal.close();
        } else {
            modal.style.display = 'none';
        }
    }

    function getCurrentViewSettings() {
        let mainView = typeof global.currentMainViewMode !== 'undefined' ? global.currentMainViewMode : null;
        if (!mainView) {
            const optToday = document.getElementById('opt-today');
            mainView = (optToday && optToday.classList.contains('active')) ? 'today' : 'realtime';
        }

        let period = typeof global.currentPeriodMode !== 'undefined' ? global.currentPeriodMode : null;
        if (!period) {
            const periodSelect = document.getElementById('period-select');
            period = periodSelect && periodSelect.value ? periodSelect.value : '1';
        }

        let density = typeof global.currentDensityMode !== 'undefined' ? global.currentDensityMode : null;
        if (!density) {
            const optMinimal = document.getElementById('opt-minimal');
            const optCompact = document.getElementById('opt-compact');
            if (optMinimal && optMinimal.classList.contains('active')) density = 'minimal';
            else if (optCompact && optCompact.classList.contains('active')) density = 'compact';
            else density = 'detailed';
        }

        return { mainView, period, density };
    }

    function shareFullGridImage(event) {
        if (event) event.stopPropagation();
        const grid = document.getElementById('shop-grid');
        if (!grid) return;

        const viewSettings = getCurrentViewSettings();
        const currentMainView = viewSettings.mainView;
        const currentPeriod = viewSettings.period;
        const isMatrixMode = (currentMainView === 'today' && ['7', '14', '21', '28'].includes(currentPeriod));
        const activeDate = typeof global.getEffectiveDisplayDate === 'function' ? global.getEffectiveDisplayDate() : new Date();
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        const dateFormatted = `${activeDate.getMonth() + 1}/${activeDate.getDate()}(${dayNames[activeDate.getDay()]})`;

        const yyyy = activeDate.getFullYear();
        const mm = String(activeDate.getMonth() + 1).padStart(2, '0');
        const dd = String(activeDate.getDate()).padStart(2, '0');
        const dateYmd = `${yyyy}${mm}${dd}`;

        let fileName = '';
        let shareText = '';

        if (isMatrixMode) {
            fileName = `営業スケジュール（${currentPeriod}日間_${dateYmd}）_${getTimestampStr()}`;
            shareText = `【ラーメン二郎 ${currentPeriod}日間営業スケジュール】\nhttps://app.jirolianmap.com/\n#ラーメン二郎 #二郎 #営業情報 #ジロリアンマップ`;
            openShareOptionsModal(grid, null, 'matrix', fileName, shareText, event ? event.currentTarget : null);
        } else if (currentMainView === 'today' && currentPeriod === '28shop') {
            fileName = `全店舗営業カレンダー_${getTimestampStr()}`;
            shareText = `【ラーメン二郎 全店舗営業カレンダー】\nhttps://app.jirolianmap.com/\n#ラーメン二郎 #二郎 #営業情報 #ジロリアンマップ`;
            openShareOptionsModal(grid, null, 'calendar_all', fileName, shareText, event ? event.currentTarget : null);
        } else if (currentMainView === 'today') {
            fileName = `営業状況（${dateYmd}）_${getTimestampStr()}`;
            shareText = `【${dateFormatted}のラーメン二郎営業情報】\nhttps://app.jirolianmap.com/\n#ラーメン二郎 #二郎 #営業情報 #ジロリアンマップ`;
            openShareOptionsModal(grid, null, 'today', fileName, shareText, event ? event.currentTarget : null);
        } else {
            fileName = `現在の営業状況_${getTimestampStr()}`;
            shareText = `【現在のラーメン二郎営業状況】\nhttps://app.jirolianmap.com/\n#ラーメン二郎 #二郎 #営業情報 #ジロリアンマップ`;
            openShareOptionsModal(grid, null, 'minimal', fileName, shareText, event ? event.currentTarget : null);
        }
    }

    async function executeImageShare(isDownloadOnly = false) {
        const confirmBtn = document.getElementById('share-confirm-btn');
        const downloadBtn = document.getElementById('share-download-btn');
        const activeBtn = isDownloadOnly ? downloadBtn : confirmBtn;
        const origConfirmText = confirmBtn ? confirmBtn.innerHTML : '📤 画像を共有する';
        const origDownloadText = downloadBtn ? downloadBtn.innerHTML : '💾 画像をダウンロード';

        if (activeBtn) {
            activeBtn.innerHTML = '⏳ 画像を生成中...';
        }
        if (confirmBtn) confirmBtn.disabled = true;
        if (downloadBtn) downloadBtn.disabled = true;

        if (typeof global.showLoadingOverlay === 'function') {
            global.showLoadingOverlay('画像を生成中...\n少々お待ちください');
        }

        await new Promise(resolve => setTimeout(resolve, 50));

        const { container, shop, layoutType, fileName, shareText, btnElement } = currentShareTarget;
        let finalShareText = shareText;
        let finalFileName = fileName;

        if (!container) {
            if (confirmBtn) {
                confirmBtn.innerHTML = origConfirmText;
                confirmBtn.disabled = false;
            }
            closeShareOptionsModal();
            return;
        }

        const showConquest = (layoutType === 'calendar') ? true : (document.getElementById('share-opt-conquest')?.checked ?? true);
        const showStatus = (layoutType === 'popup_detail' || layoutType === 'minimal') ? (document.getElementById('share-opt-status')?.checked ?? true) : true;
        const selectedMeta = document.querySelector('input[name="share-opt-meta"]:checked')?.value || 'none';

        const modifiedElements = [];
        const origContainerStyle = {
            display: container.style.display,
            flexDirection: container.style.flexDirection,
            width: container.style.width,
            maxWidth: container.style.maxWidth,
            minWidth: container.style.minWidth,
            boxSizing: container.style.boxSizing,
            gridTemplateColumns: container.style.gridTemplateColumns,
            gridAutoRows: container.style.gridAutoRows,
            paddingTop: container.style.paddingTop,
            justifyContent: container.style.justifyContent,
            margin: container.style.margin
        };

        try {
            // 1. 標準幅およびレイアウト位置の調整
            if (layoutType === 'popup_detail' || (layoutType === 'calendar' && shop)) {
                container.style.width = '380px';
                container.style.boxSizing = 'border-box';

                if (layoutType === 'popup_detail') {
                    const targetCard = container.closest('.shop-item') || container;
                    const cardEls = [targetCard, container, targetCard.querySelector('.detailed-content')].filter((el, idx, arr) => el && arr.indexOf(el) === idx);
                    cardEls.forEach(el => {
                        modifiedElements.push({
                            el: el,
                            origHeight: el.style.height,
                            origMinHeight: el.style.minHeight,
                            origAlignSelf: el.style.alignSelf
                        });
                        el.style.height = 'auto';
                        el.style.minHeight = 'auto';
                        el.style.alignSelf = 'flex-start';
                    });
                }
            } else if (layoutType === 'minimal' || layoutType === 'today' || layoutType === 'calendar_all') {
                container.style.width = '527px';
                container.style.boxSizing = 'border-box';
                container.style.gridTemplateColumns = 'repeat(6, 82px)';
                container.style.gridAutoRows = 'auto';
                container.style.paddingTop = '6px';
                container.style.justifyContent = 'center';
                container.style.margin = '0 auto';
            } else if (layoutType === 'matrix') {
                const daysInput = document.getElementById('share-opt-days-input');
                const daysVal = daysInput ? Math.min(28, Math.max(1, parseInt(daysInput.value, 10) || 28)) : 28;

                const shopList = getGlobalShops();
                const shopIdsInMatrix = Array.from(container.querySelectorAll('tbody tr')).map(row => {
                    const el = row.querySelector('[onclick*="handleShopSelect"]');
                    if (!el) return null;
                    const match = el.getAttribute('onclick').match(/handleShopSelect\('([^']+)'\)/);
                    return match ? match[1] : null;
                }).filter(Boolean);
                const matrixShops = shopIdsInMatrix.map(id => shopList.find(s => s.id === id)).filter(Boolean);
                const displayShops = matrixShops.length > 0 ? matrixShops : shopList;

                modifiedElements.push({
                    el: container,
                    origHtml: container.innerHTML
                });

                const activeDate = typeof global.getEffectiveDisplayDate === 'function' ? global.getEffectiveDisplayDate() : (typeof getEffectiveDisplayDate === 'function' ? getEffectiveDisplayDate() : new Date());
                const renderMatrixFn = (typeof global.renderMatrixScheduleTable === 'function') ? global.renderMatrixScheduleTable : (typeof renderMatrixScheduleTable === 'function' ? renderMatrixScheduleTable : null);
                if (renderMatrixFn) {
                    container.innerHTML = renderMatrixFn(displayShops, activeDate, daysVal);
                }

                // 親要素（.container）の幅とoverflow制約を解除
                const parentEl = container.parentElement;
                if (parentEl) {
                    modifiedElements.push({
                        el: parentEl,
                        origWidth: parentEl.style.width,
                        origMaxWidth: parentEl.style.maxWidth,
                        origOverflow: parentEl.style.overflow
                    });
                    parentEl.style.width = 'max-content';
                    parentEl.style.maxWidth = 'none';
                    parentEl.style.overflow = 'visible';
                }

                const wrapperEl = container.querySelector('.matrix-schedule-wrapper');
                if (wrapperEl) {
                    modifiedElements.push({
                        el: wrapperEl,
                        origHeight: wrapperEl.style.height,
                        origMaxHeight: wrapperEl.style.maxHeight,
                        origOverflow: wrapperEl.style.overflow,
                        origOverflowX: wrapperEl.style.overflowX,
                        origOverflowY: wrapperEl.style.overflowY,
                        origWidth: wrapperEl.style.width,
                        origScrollTop: wrapperEl.scrollTop,
                        origScrollLeft: wrapperEl.scrollLeft
                    });
                    wrapperEl.scrollTop = 0;
                    wrapperEl.scrollLeft = 0;
                    wrapperEl.style.height = 'auto';
                    wrapperEl.style.maxHeight = 'none';
                    wrapperEl.style.overflow = 'visible';
                    wrapperEl.style.overflowX = 'visible';
                    wrapperEl.style.overflowY = 'visible';
                    wrapperEl.style.width = '100%';
                }

                modifiedElements.push({
                    el: container,
                    origDisplay: container.style.display,
                    origFlexDir: container.style.flexDirection,
                    origHeight: container.style.height,
                    origMaxHeight: container.style.maxHeight,
                    origOverflow: container.style.overflow,
                    origWidth: container.style.width,
                    origPadding: container.style.padding,
                    origScrollTop: container.scrollTop,
                    origScrollLeft: container.scrollLeft
                });
                container.scrollTop = 0;
                container.scrollLeft = 0;
                container.style.display = 'flex';
                container.style.flexDirection = 'column';
                container.style.height = 'auto';
                container.style.maxHeight = 'none';
                container.style.overflow = 'visible';
                container.style.width = 'max-content';
                container.style.padding = '8px';

                const tableEl = container.querySelector('table');
                if (tableEl) {
                    modifiedElements.push({
                        el: tableEl,
                        origWidth: tableEl.style.width,
                        origMinWidth: tableEl.style.minWidth
                    });
                    tableEl.style.width = 'max-content';
                    tableEl.style.minWidth = 'max-content';
                }

                const dateCells = container.querySelectorAll('th:not(:first-child), td:not(:first-child)');
                dateCells.forEach(cell => {
                    modifiedElements.push({
                        el: cell,
                        origWidth: cell.style.width,
                        origMinWidth: cell.style.minWidth,
                        origMaxWidth: cell.style.maxWidth
                    });
                    cell.style.width = '52px';
                    cell.style.minWidth = '52px';
                    cell.style.maxWidth = '52px';
                });

                const shopCells = container.querySelectorAll('th:first-child, td:first-child');
                shopCells.forEach(cell => {
                    modifiedElements.push({
                        el: cell,
                        origWidth: cell.style.width,
                        origMinWidth: cell.style.minWidth,
                        origMaxWidth: cell.style.maxWidth
                    });
                    cell.style.width = '72px';
                    cell.style.minWidth = '72px';
                    cell.style.maxWidth = '72px';
                });

                const stickyEls = container.querySelectorAll('[style*="position: sticky"]');
                stickyEls.forEach(sticky => {
                    modifiedElements.push({ el: sticky, origPosition: sticky.style.position });
                    sticky.style.position = 'static';
                });
            }

            if (layoutType === 'minimal' || layoutType === 'today' || layoutType === 'calendar_all') {
                const gridEl = container.querySelector('.shop-grid');
                if (gridEl) {
                    modifiedElements.push({
                        el: gridEl,
                        origGridAutoRows: gridEl.style.gridAutoRows,
                        origAlignItems: gridEl.style.alignItems
                    });
                    gridEl.style.gridAutoRows = '1fr';
                    gridEl.style.alignItems = 'stretch';
                }
                const minimalCards = container.querySelectorAll('.shop-item');
                minimalCards.forEach(card => {
                    modifiedElements.push({
                        el: card,
                        origDisplay: card.style.display,
                        origFlexDir: card.style.flexDirection,
                        origJustify: card.style.justifyContent,
                        origAlignItems: card.style.alignItems,
                        origPadding: card.style.padding,
                        origMinHeight: card.style.minHeight,
                        origHeight: card.style.height,
                        origMinWidth: card.style.minWidth,
                        origWidth: card.style.width
                    });
                    card.style.display = 'flex';
                    card.style.flexDirection = 'column';
                    card.style.justifyContent = 'center';
                    card.style.alignItems = 'center';
                    card.style.padding = '4px 2px';
                    card.style.minHeight = '54px';
                    card.style.height = '100%';
                    card.style.minWidth = '0';
                    card.style.width = '100%';

                    if (!showStatus) {
                        modifiedElements.push({
                            el: card,
                            origBg: card.style.backgroundColor,
                            origBorderColor: card.style.borderColor,
                            origClass: card.className
                        });
                        card.style.backgroundColor = 'var(--card-bg)';
                        card.style.borderColor = 'var(--border-color)';
                        card.classList.remove('current-open', 'current-closed', 'current-closing-soon', 'current-scheduled', 'current-preopen', 'today-open', 'today-closed');

                        const nameEl = card.querySelector('.today-summary-name');
                        if (nameEl) {
                            modifiedElements.push({ el: nameEl, origColor: nameEl.style.color });
                            nameEl.style.color = 'var(--jiro-yellow)';
                        }
                    }

                    const summaryCard = card.querySelector('.today-summary-card');
                    if (summaryCard) {
                        modifiedElements.push({
                            el: summaryCard,
                            origDisplay: summaryCard.style.display,
                            origFlexDir: summaryCard.style.flexDirection,
                            origJustify: summaryCard.style.justifyContent,
                            origAlignItems: summaryCard.style.alignItems,
                            origGap: summaryCard.style.gap,
                            origPadding: summaryCard.style.padding
                        });
                        summaryCard.style.display = 'flex';
                        summaryCard.style.flexDirection = 'column';
                        summaryCard.style.justifyContent = 'center';
                        summaryCard.style.alignItems = 'center';
                        summaryCard.style.gap = (showConquest && showStatus) ? '2px' : '4px';
                        summaryCard.style.padding = '0';
                    }
                });

                if (!showStatus) {
                    const hoursEls = container.querySelectorAll('.today-hours-text');
                    hoursEls.forEach(el => {
                        modifiedElements.push({ el, origDisplay: el.style.display });
                        el.style.display = 'none';
                    });
                }
            }

            // 2. 制覇状態の表示制御
            if (!showConquest) {
                const conquestEls = container.querySelectorAll('.visit-toggle-btn, .visit-toggle-btn-minimal, .visit-border-sample, .conquest-badge');
                conquestEls.forEach(el => {
                    modifiedElements.push({ el, origDisplay: el.style.display });
                    el.style.display = 'none';
                });
            }

            // 3. メタ情報および凡例ヘッダーの制御
            if (layoutType === 'calendar') {
                const headerWrapper = container.querySelector('.shop-header-row .shop-title-wrapper') || container.querySelector('.shop-header-row') || container;
                if (headerWrapper) {
                    let newMetaHtml = '';
                    const uCoords = global.userCoords;
                    const leafMap = global.map;
                    const calcDist = (global.JiroUtils && global.JiroUtils.calculateDistance) || global.calculateDistance;
                    const fmtDist = (global.JiroUtils && global.JiroUtils.formatDistance) || global.formatDistance;
                    const fmtOpened = (global.JiroUtils && global.JiroUtils.formatOpenedDateText) || global.formatOpenedDateText;

                    if (selectedMeta === 'distance_user') {
                        const userDist = (shop && shop.userDistance !== undefined) ? shop.userDistance : (uCoords && shop && calcDist ? calcDist(uCoords.lat, uCoords.lng, shop.lat, shop.lng) : null);
                        const distStr = userDist !== null && fmtDist ? `📍 現在地から ${fmtDist(userDist)}` : '📍 現在地から -';
                        newMetaHtml = `<span class="distance-tag" style="font-size:0.75rem; white-space:nowrap; text-align:right; margin-left:auto;" title="${distStr}">${distStr}</span>`;
                    } else if (selectedMeta === 'distance_center') {
                        const centerDist = (shop && shop.centerDistance !== undefined) ? shop.centerDistance : (leafMap && shop && calcDist ? calcDist(leafMap.getCenter().lat, leafMap.getCenter().lng, shop.lat, shop.lng) : null);
                        const distStr = centerDist !== null && fmtDist ? `📍 中心から ${fmtDist(centerDist)}` : '📍 中心から -';
                        newMetaHtml = `<span class="distance-tag" style="font-size:0.75rem; white-space:nowrap; text-align:right; margin-left:auto;" title="${distStr}">${distStr}</span>`;
                    } else if (selectedMeta === 'address' && shop) {
                        const fullAddress = (typeof global.LG_CODES !== 'undefined' ? global.LG_CODES.getShopFullAddress(shop) : `${shop.addressText || ''}`).trim();
                        const gmapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('ラーメン二郎 ' + shop.name + ' ' + fullAddress)}`;
                        newMetaHtml = `<a href="${gmapUrl}" target="_blank" rel="noopener noreferrer" class="gmap-link" style="font-size:0.75rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; flex:1 1 auto; text-align:right; margin-left:auto; font-weight:normal;" title="📍 ${fullAddress || '住所不明'} ↗">📍 ${fullAddress || '住所不明'} ↗</a>`;
                    } else if (selectedMeta === 'opened' && shop) {
                        const openedStr = fmtOpened ? fmtOpened(shop.openedAt) : (shop.openedAt + '開店');
                        if (openedStr) {
                            newMetaHtml = `<span style="font-size:0.75rem; color:#aaa; white-space:nowrap; flex-shrink:0; text-align:right; margin-left:auto;" title="${openedStr}">${openedStr}</span>`;
                        }
                    } else if (selectedMeta === 'none') {
                        newMetaHtml = '';
                    }

                    const existingMeta = headerWrapper.querySelector('.distance-tag, .gmap-link, span[style*="text-align:right"]');
                    if (existingMeta) {
                        modifiedElements.push({ el: existingMeta, origDisplay: existingMeta.style.display });
                        if (selectedMeta === 'none') {
                            existingMeta.style.display = 'none';
                        } else {
                            const tempWrapper = document.createElement('div');
                            tempWrapper.innerHTML = newMetaHtml;
                            const newEl = tempWrapper.firstElementChild;
                            if (newEl) {
                                existingMeta.replaceWith(newEl);
                                modifiedElements.push({ el: newEl, isNew: true, oldEl: existingMeta });
                            }
                        }
                    } else if (selectedMeta !== 'none' && newMetaHtml) {
                        const tempWrapper = document.createElement('div');
                        tempWrapper.innerHTML = newMetaHtml;
                        const newEl = tempWrapper.firstElementChild;
                        if (newEl) {
                            headerWrapper.appendChild(newEl);
                            modifiedElements.push({ el: newEl, isNew: true, appended: true });
                        }
                    }
                }

                if (shop) {
                    const getWeeklyTemp = (global.JiroBusinessHours && global.JiroBusinessHours.getWeeklyTemporaryText)
                        ? global.JiroBusinessHours.getWeeklyTemporaryText.bind(global.JiroBusinessHours)
                        : global.getWeeklyTemporaryText;
                    const tempInfo = getWeeklyTemp ? getWeeklyTemp(shop, new Date()) : null;
                    if (tempInfo && tempInfo.text) {
                        const tempLegend = document.createElement('div');
                        tempLegend.style.cssText = 'font-size: 0.72rem; color: #ff9f43; font-weight: normal; margin-top: 4px; text-align: right; width: 100%;';
                        tempLegend.textContent = '臨時営業/休業';
                        container.appendChild(tempLegend);
                        modifiedElements.push({ el: tempLegend, isNew: true, appended: true });
                    }
                }
            } else if (layoutType === 'popup_detail') {
                if (!showStatus) {
                    const statusEls = container.querySelectorAll('.status-badge, .next-schedule');
                    statusEls.forEach(el => {
                        modifiedElements.push({ el, origDisplay: el.style.display });
                        el.style.display = 'none';
                    });

                    const todayHighlights = container.querySelectorAll('.hours-table .today-highlight');
                    todayHighlights.forEach(el => {
                        modifiedElements.push({ el, origClass: el.className });
                        el.classList.remove('today-highlight');
                    });
                }

                const uCoords = global.userCoords;
                const leafMap = global.map;
                const calcDist = (global.JiroUtils && global.JiroUtils.calculateDistance) || global.calculateDistance;
                const fmtDist = (global.JiroUtils && global.JiroUtils.formatDistance) || global.formatDistance;

                const distTag = container.querySelector('.distance-tag');
                if (distTag) {
                    modifiedElements.push({ el: distTag, origDisplay: distTag.style.display, origHtml: distTag.innerHTML, origMarginLeft: distTag.style.marginLeft, origTextAlign: distTag.style.textAlign });
                    distTag.style.marginLeft = 'auto';
                    distTag.style.textAlign = 'right';
                    if (selectedMeta === 'none') {
                        distTag.style.display = 'none';
                    } else if (selectedMeta === 'distance_user') {
                        const userDist = (shop && shop.userDistance !== undefined) ? shop.userDistance : (uCoords && shop && calcDist ? calcDist(uCoords.lat, uCoords.lng, shop.lat, shop.lng) : null);
                        const distStr = userDist !== null && fmtDist ? `📍 現在地から ${fmtDist(userDist)}` : '📍 現在地から -';
                        distTag.innerHTML = distStr;
                        distTag.style.display = '';
                    } else if (selectedMeta === 'distance_center') {
                        const centerDist = (shop && shop.centerDistance !== undefined) ? shop.centerDistance : (leafMap && shop && calcDist ? calcDist(leafMap.getCenter().lat, leafMap.getCenter().lng, shop.lat, shop.lng) : null);
                        const distStr = centerDist !== null && fmtDist ? `📍 中心から ${fmtDist(centerDist)}` : '📍 中心から -';
                        distTag.innerHTML = distStr;
                        distTag.style.display = '';
                    }
                } else if (selectedMeta !== 'none') {
                    const subRow = container.querySelector('.shop-sub-row');
                    if (subRow) {
                        let distStr = '';
                        if (selectedMeta === 'distance_user') {
                            const userDist = (shop && shop.userDistance !== undefined) ? shop.userDistance : (uCoords && shop && calcDist ? calcDist(uCoords.lat, uCoords.lng, shop.lat, shop.lng) : null);
                            distStr = userDist !== null && fmtDist ? `📍 現在地から ${fmtDist(userDist)}` : '📍 現在地から -';
                        } else if (selectedMeta === 'distance_center') {
                            const centerDist = (shop && shop.centerDistance !== undefined) ? shop.centerDistance : (leafMap && shop && calcDist ? calcDist(leafMap.getCenter().lat, leafMap.getCenter().lng, shop.lat, shop.lng) : null);
                            distStr = centerDist !== null && fmtDist ? `📍 中心から ${fmtDist(centerDist)}` : '📍 中心から -';
                        }
                        if (distStr) {
                            const tempSpan = document.createElement('span');
                            tempSpan.className = 'distance-tag';
                            tempSpan.style.marginLeft = 'auto';
                            tempSpan.style.textAlign = 'right';
                            tempSpan.innerHTML = distStr;
                            subRow.appendChild(tempSpan);
                            modifiedElements.push({ el: tempSpan, isNew: true, appended: true });
                        }
                    }
                }
            } else if (layoutType === 'minimal' || layoutType === 'today' || layoutType === 'calendar_all' || layoutType === 'matrix') {
                const activeDate = typeof global.getEffectiveDisplayDate === 'function' ? global.getEffectiveDisplayDate() : new Date();
                const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
                const dateFormatted = `${activeDate.getMonth() + 1}/${activeDate.getDate()}(${dayNames[activeDate.getDay()]})`;

                const now = new Date();
                const mi = String(now.getMinutes()).padStart(2, '0');

                const shopList = getGlobalShops();
                const getWeeklyTemp = (global.JiroBusinessHours && global.JiroBusinessHours.getWeeklyTemporaryText)
                    ? global.JiroBusinessHours.getWeeklyTemporaryText.bind(global.JiroBusinessHours)
                    : global.getWeeklyTemporaryText;
                let hasTempSchedule = false;
                if (getWeeklyTemp) {
                    shopList.forEach(s => {
                        const tInfo = getWeeklyTemp(s, activeDate);
                        if (tInfo && tInfo.text) hasTempSchedule = true;
                    });
                }

                const headerBlock = document.createElement('div');
                headerBlock.className = 'capture-header-legend';
                headerBlock.style.cssText = 'background: #141414; border: 1px solid #333; border-radius: 6px; padding: 7px 10px; margin: 8px 0 4px 0; width: 100%; box-sizing: border-box; grid-column: 1 / -1; display: flex; flex-direction: column; gap: 4px; font-size: 0.72rem; color: #ddd;';

                if (layoutType === 'minimal') {
                    const usernameInput = document.getElementById('share-opt-username');
                    const rawUsername = usernameInput ? usernameInput.value.trim() : '';
                    const userPrefix = rawUsername ? `${rawUsername}の` : '';
                    const timeStr = `（${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${mi} 現在）`;

                    let titleText = '';
                    let commentTitle = '';
                    if (showConquest && showStatus) {
                        titleText = `${userPrefix}ラーメン二郎制覇状況/営業状況${timeStr}`;
                        commentTitle = `${userPrefix}ラーメン二郎制覇状況/営業状況`;
                    } else if (showConquest) {
                        titleText = `${userPrefix}ラーメン二郎制覇状況`;
                        commentTitle = `${userPrefix}ラーメン二郎制覇状況`;
                    } else if (showStatus) {
                        titleText = `ラーメン二郎 営業状況${timeStr}`;
                        commentTitle = `ラーメン二郎 営業状況`;
                    } else {
                        titleText = `ラーメン二郎店舗一覧`;
                        commentTitle = `ラーメン二郎店舗一覧`;
                    }

                    finalShareText = `【${commentTitle}】\nhttps://app.jirolianmap.com/\n#ラーメン二郎 #二郎 #営業情報 #ジロリアンマップ`;

                    let conquestHtml = '';
                    if (showConquest) {
                        const totalCount = shopList.length;
                        const vState = global.visitedState || {};
                        const visitedCount = shopList.filter(s => vState[s.id]).length;
                        const percent = totalCount > 0 ? Math.round((visitedCount / totalCount) * 100) : 0;
                        conquestHtml = `
                            <div style="display:inline-flex; align-items:center; justify-content:flex-end; gap:8px; background:#1a1a1a; border:1px solid #333; border-radius:4px; padding:3px 6px; font-size:0.75rem; color:#ddd; width:fit-content; margin-left:auto; box-sizing:border-box; flex-shrink:0;">
                                <div>制覇: <span style="color:#fff;">${visitedCount}</span> / ${totalCount} 店舗</div>
                                <div style="background:#333; width:50px; height:7px; border-radius:4px; overflow:hidden; flex-shrink:0;">
                                    <div style="width:${percent}%; background:var(--jiro-yellow); height:100%;"></div>
                                </div>
                                <span style="color:var(--jiro-yellow); flex-shrink:0;">${percent}%</span>
                            </div>
                        `;
                    }

                    let statusHtml = '';
                    if (showStatus) {
                        statusHtml = `
                            <div style="display:flex; flex-wrap:wrap; gap:6px 10px; align-items:center;">
                                <span style="display:inline-flex; align-items:center; gap:4px;"><span class="color-dot bg-open"></span> 営業中</span>
                                <span style="display:inline-flex; align-items:center; gap:4px;"><span class="color-dot bg-closing-soon"></span> まもなく終了</span>
                                <span style="display:inline-flex; align-items:center; gap:4px;"><span class="color-dot bg-scheduled"></span> 営業開始前</span>
                                <span style="display:inline-flex; align-items:center; gap:4px;"><span class="color-dot bg-closed"></span> 営業時間外</span>
                                ${hasTempSchedule ? '<span style="color:#ff9f43; font-weight:normal; margin-left:auto; text-align:right;">臨時営業/休業</span>' : ''}
                            </div>
                        `;
                    }

                    if (showConquest && !showStatus) {
                        headerBlock.innerHTML = `
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px 8px; width:100%;">
                                <span class="capture-header-title" style="font-weight:bold; color:var(--jiro-yellow); flex:1 1 auto; min-width:0;">${titleText}</span>
                                ${conquestHtml}
                            </div>
                        `;
                    } else {
                        const hasBorder = showConquest || showStatus;
                        headerBlock.innerHTML = `
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px 8px; ${hasBorder ? 'border-bottom:1px solid #2a2a2a; padding-bottom:3px; margin-bottom:2px;' : ''}">
                                <span class="capture-header-title" style="font-weight:bold; color:var(--jiro-yellow); flex:1 1 auto; min-width:0;">${titleText}</span>
                            </div>
                            ${statusHtml}
                            ${conquestHtml}
                        `;
                    }
                } else if (layoutType === 'today' || layoutType === 'calendar_all') {
                    headerBlock.style.cssText = 'background: #141414; border: 1px solid #333; border-radius: 6px; padding: 7px 10px; margin: 8px 0 4px 0; width: 100%; box-sizing: border-box; grid-column: 1 / -1; display: flex; flex-direction: row; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px 10px; font-size: 0.72rem; color: #ddd;';
                    headerBlock.innerHTML = `
                        <span class="capture-header-title" style="font-weight:bold; color:var(--jiro-yellow); flex:1 1 auto; min-width:0;">ラーメン二郎 営業状況（${dateFormatted}）</span>
                        <div style="display:flex; flex-wrap:wrap; gap:6px 10px; align-items:center; margin-left:auto;">
                            <span style="display:inline-flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; border-radius:2px; background:rgba(46,125,50,0.8); border:1px solid #4caf50;"></span> 営業日</span>
                            <span style="display:inline-flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; border-radius:2px; background:rgba(97,97,97,0.8); border:1px solid #9e9e9e;"></span> 休業日</span>
                            ${hasTempSchedule ? '<span style="color:#ff9f43; font-weight:normal;">臨時営業/休業</span>' : ''}
                        </div>
                    `;
                } else if (layoutType === 'matrix') {
                    const daysInput = document.getElementById('share-opt-days-input');
                    const daysVal = daysInput ? Math.min(28, Math.max(1, parseInt(daysInput.value, 10) || 28)) : 28;
                    const yyyy = activeDate.getFullYear();
                    const mm = String(activeDate.getMonth() + 1).padStart(2, '0');
                    const dd = String(activeDate.getDate()).padStart(2, '0');
                    const dateYmd = `${yyyy}${mm}${dd}`;

                    finalFileName = `営業スケジュール（${daysVal}日間_${dateYmd}）_${getTimestampStr()}`;
                    finalShareText = `【ラーメン二郎 ${daysVal}日間営業スケジュール】\nhttps://app.jirolianmap.com/\n#ラーメン二郎 #二郎 #営業情報 #ジロリアンマップ`;

                    headerBlock.style.cssText = 'background: #141414; border: 1px solid #333; border-radius: 6px; padding: 7px 10px; margin: 8px 0 4px 0; width: 100%; box-sizing: border-box; grid-column: 1 / -1; display: flex; flex-direction: row; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px 10px; font-size: 0.72rem; color: #ddd;';
                    headerBlock.innerHTML = `
                        <span class="capture-header-title" style="font-weight:bold; color:var(--jiro-yellow); flex:1 1 auto; min-width:0;">ラーメン二郎 営業スケジュール</span>
                        <div style="display:flex; flex-wrap:wrap; gap:6px 10px; align-items:center; margin-left:auto;">
                            <span style="display:inline-flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; border-radius:2px; background:rgba(46,125,50,0.8); border:1px solid #4caf50;"></span> 営業日</span>
                            <span style="display:inline-flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; border-radius:2px; background:rgba(97,97,97,0.8); border:1px solid #9e9e9e;"></span> 休業日</span>
                            ${hasTempSchedule ? '<span style="color:#ff9f43; font-weight:normal;">臨時営業/休業</span>' : ''}
                        </div>
                    `;
                    const tableEl = container.querySelector('table');
                    if (tableEl) {
                        const tableW = Math.max(tableEl.scrollWidth || 0, tableEl.getBoundingClientRect().width || 0, 360);
                        headerBlock.style.width = '100%';
                        headerBlock.style.boxSizing = 'border-box';
                        container.style.minWidth = tableW + 'px';
                    }
                }

                container.prepend(headerBlock);
                modifiedElements.push({ el: headerBlock, isNew: true, appended: false });
            }

            closeShareOptionsModal();

            const shouldSplit = document.getElementById('share-opt-split')?.checked && !document.getElementById('share-opt-split')?.disabled;
            const splitTarget = document.querySelector('input[name="share-opt-split-target"]:checked')?.value || 'x';
            const canvases = [];

            if (shouldSplit && (layoutType === 'matrix' || layoutType === 'today' || layoutType === 'minimal' || layoutType === 'calendar_all')) {
                if (layoutType === 'matrix') {
                    const allRows = Array.from(container.querySelectorAll('tbody tr'));
                    const totalRows = allRows.length;
                    const w = Math.max(container.scrollWidth || 0, container.getBoundingClientRect().width || 0, 550);
                    const rowHeight = 42;

                    let numParts = 1;

                    if (splitTarget === 'x') {
                        const maxRows_98 = Math.max(1, Math.floor((w * (9 / 8) - 120) / rowHeight));
                        const count_98 = Math.ceil(totalRows / maxRows_98);

                        if (count_98 <= 2) {
                            numParts = Math.max(1, count_98);
                        } else {
                            const maxRows_916 = Math.max(1, Math.floor((w * (9 / 16) - 120) / rowHeight));
                            const count_916 = Math.ceil(totalRows / maxRows_916);
                            if (count_916 >= 5) {
                                numParts = 4;
                            } else {
                                numParts = Math.max(1, count_916);
                            }
                        }
                    } else {
                        const maxRows_11 = Math.max(1, Math.floor((w * 1.0 - 120) / rowHeight));
                        numParts = Math.max(1, Math.ceil(totalRows / maxRows_11));
                    }

                    const maxRowsPerPart = Math.ceil(totalRows / numParts);
                    let partIndex = 1;

                    for (let i = 0; i < allRows.length; i += maxRowsPerPart) {
                        const currentGroupRows = allRows.slice(i, i + maxRowsPerPart);
                        allRows.forEach(row => {
                            row.style.display = currentGroupRows.includes(row) ? '' : 'none';
                        });

                        if (numParts > 1 && container) {
                            const titleEl = container.querySelector('.capture-header-title');
                            if (titleEl) {
                                if (!titleEl.dataset.origTitle) titleEl.dataset.origTitle = titleEl.textContent;
                                titleEl.textContent = `${titleEl.dataset.origTitle} (${partIndex}/${numParts})`;
                            }
                        }
                        partIndex++;

                        const c = await captureElementWithPadding(container, 16);
                        if (c) canvases.push(c);
                    }
                    allRows.forEach(row => { row.style.display = ''; });
                } else if (layoutType === 'today' || layoutType === 'minimal' || layoutType === 'calendar_all') {
                    const allCards = Array.from(container.querySelectorAll('.shop-item'));
                    const totalCards = allCards.length;
                    const totalCardRows = Math.ceil(totalCards / 6);
                    const w = 527;
                    const cardRowHeight = (layoutType === 'minimal') ? 56 : 60;

                    let numParts = 1;

                    if (splitTarget === 'x') {
                        const maxCardRows_98 = Math.max(1, Math.floor((w * (9 / 8) - 120) / cardRowHeight));
                        const maxCards_98 = maxCardRows_98 * 6;
                        const count_98 = Math.ceil(totalCards / maxCards_98);

                        if (count_98 <= 2) {
                            numParts = Math.max(1, count_98);
                        } else {
                            const maxCardRows_916 = Math.max(1, Math.floor((w * (9 / 16) - 120) / cardRowHeight));
                            const count_916 = Math.ceil(totalCards / maxCardRows_916);
                            if (count_916 >= 5) {
                                numParts = 4;
                            } else {
                                numParts = Math.max(1, count_916);
                            }
                        }
                    } else {
                        const maxCardRows_11 = Math.max(1, Math.floor((w * 1.0 - 120) / cardRowHeight));
                        const maxCards_11 = maxCardRows_11 * 6;
                        numParts = Math.max(1, Math.ceil(totalCards / maxCards_11));
                    }

                    const rowsPerPart = Math.ceil(totalCardRows / numParts);
                    const maxCardsPerPart = rowsPerPart * 6;
                    let partIndex = 1;

                    for (let i = 0; i < allCards.length; i += maxCardsPerPart) {
                        const currentGroupCards = allCards.slice(i, i + maxCardsPerPart);
                        allCards.forEach(card => {
                            card.style.display = currentGroupCards.includes(card) ? '' : 'none';
                        });

                        if (numParts > 1 && container) {
                            const titleEl = container.querySelector('.capture-header-title');
                            if (titleEl) {
                                if (!titleEl.dataset.origTitle) titleEl.dataset.origTitle = titleEl.textContent;
                                titleEl.textContent = `${titleEl.dataset.origTitle} (${partIndex}/${numParts})`;
                            }
                        }
                        partIndex++;

                        const c = await captureElementWithPadding(container, 16);
                        if (c) canvases.push(c);
                    }
                    allCards.forEach(card => { card.style.display = ''; });
                }
            } else {
                const c = await captureElementWithPadding(container, 16);
                if (c) canvases.push(c);
            }

            // 復元処理
            container.style.width = origContainerStyle.width;
            container.style.maxWidth = origContainerStyle.maxWidth;
            container.style.minWidth = origContainerStyle.minWidth;
            container.style.boxSizing = origContainerStyle.boxSizing;
            container.style.gridTemplateColumns = origContainerStyle.gridTemplateColumns;
            container.style.gridAutoRows = origContainerStyle.gridAutoRows;
            container.style.paddingTop = origContainerStyle.paddingTop;
            container.style.justifyContent = origContainerStyle.justifyContent;
            container.style.margin = origContainerStyle.margin;

            modifiedElements.forEach(item => {
                if (item.isNew && item.oldEl) {
                    item.el.replaceWith(item.oldEl);
                    item.oldEl.style.display = item.origDisplay || '';
                } else if (item.isNew && item.appended === false) {
                    item.el.remove();
                } else if (item.isNew && item.appended) {
                    item.el.remove();
                } else if (item.el) {
                    if (item.origDisplay !== undefined) item.el.style.display = item.origDisplay;
                    if (item.origHtml !== undefined) item.el.innerHTML = item.origHtml;
                    if (item.origFlexDir !== undefined) item.el.style.flexDirection = item.origFlexDir;
                    if (item.origJustify !== undefined) item.el.style.justifyContent = item.origJustify;
                    if (item.origGap !== undefined) item.el.style.gap = item.origGap;
                    if (item.origClass !== undefined) item.el.className = item.origClass;
                    if (item.origMarginLeft !== undefined) item.el.style.marginLeft = item.origMarginLeft;
                    if (item.origTextAlign !== undefined) item.el.style.textAlign = item.origTextAlign;
                    if (item.origBg !== undefined) item.el.style.backgroundColor = item.origBg;
                    if (item.origBorderColor !== undefined) item.el.style.borderColor = item.origBorderColor;
                    if (item.origColor !== undefined) item.el.style.color = item.origColor;
                    if (item.origHeight !== undefined) item.el.style.height = item.origHeight;
                    if (item.origMinHeight !== undefined) item.el.style.minHeight = item.origMinHeight;
                    if (item.origMaxHeight !== undefined) item.el.style.maxHeight = item.origMaxHeight;
                    if (item.origOverflow !== undefined) item.el.style.overflow = item.origOverflow;
                    if (item.origWidth !== undefined) item.el.style.width = item.origWidth;
                    if (item.origMinWidth !== undefined) item.el.style.minWidth = item.origMinWidth;
                    if (item.origMaxWidth !== undefined) item.el.style.maxWidth = item.origMaxWidth;
                    if (item.origPadding !== undefined) item.el.style.padding = item.origPadding;
                    if (item.origPosition !== undefined) item.el.style.position = item.origPosition;
                    if (item.origAlignSelf !== undefined) item.el.style.alignSelf = item.origAlignSelf;
                }
            });

            if (canvases.length === 0) {
                alert('画像の生成に失敗しました。');
                return;
            }

            // Fileオブジェクトへの変換
            const files = [];
            for (let i = 0; i < canvases.length; i++) {
                const canvas = canvases[i];
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                if (blob) {
                    const fullName = canvases.length > 1 ? `${finalFileName}_(${i + 1}_of_${canvases.length}).png` : `${finalFileName}.png`;
                    files.push(new File([blob], fullName, { type: 'image/png' }));
                }
            }

            if (files.length === 0) {
                alert('画像の生成に失敗しました。');
                return;
            }

            if (isDownloadOnly) {
                for (let i = 0; i < files.length; i++) {
                    fallbackDownloadFile(files[i]);
                    await new Promise(r => setTimeout(r, 200));
                }
                if (files.length > 1) {
                    alert(`${files.length}枚の画像をダウンロードしました。`);
                }
            } else if (navigator.canShare && navigator.canShare({ files })) {
                try {
                    await navigator.share({ files, title: finalFileName, text: finalShareText });
                } catch (shareErr) {
                    if (shareErr.name !== 'AbortError') {
                        for (let i = 0; i < files.length; i++) {
                            fallbackDownloadFile(files[i]);
                            await new Promise(r => setTimeout(r, 200));
                        }
                    }
                }
            } else {
                for (let i = 0; i < files.length; i++) {
                    fallbackDownloadFile(files[i]);
                    await new Promise(r => setTimeout(r, 200));
                }
                if (files.length > 1) {
                    alert(`${files.length}枚の画像をダウンロードしました。`);
                }
            }

        } catch (err) {
            console.error('Image share execution error:', err);
            alert('画像の生成に失敗しました。');
            container.style.width = origContainerStyle.width;
            container.style.maxWidth = origContainerStyle.maxWidth;
            container.style.minWidth = origContainerStyle.minWidth;
            container.style.boxSizing = origContainerStyle.boxSizing;
            container.style.gridTemplateColumns = origContainerStyle.gridTemplateColumns;
            container.style.gridAutoRows = origContainerStyle.gridAutoRows;
            container.style.paddingTop = origContainerStyle.paddingTop;
            container.style.justifyContent = origContainerStyle.justifyContent;
            container.style.margin = origContainerStyle.margin;

            modifiedElements.forEach(item => {
                if (item.isNew && item.oldEl) {
                    item.el.replaceWith(item.oldEl);
                } else if (item.isNew && item.appended === false) {
                    item.el.remove();
                } else if (item.isNew && item.appended) {
                    item.el.remove();
                } else if (item.el) {
                    if (item.origDisplay !== undefined) item.el.style.display = item.origDisplay;
                    if (item.origHtml !== undefined) item.el.innerHTML = item.origHtml;
                    if (item.origFlexDir !== undefined) item.el.style.flexDirection = item.origFlexDir;
                    if (item.origJustify !== undefined) item.el.style.justifyContent = item.origJustify;
                    if (item.origGap !== undefined) item.el.style.gap = item.origGap;
                    if (item.origClass !== undefined) item.el.className = item.origClass;
                    if (item.origMarginLeft !== undefined) item.el.style.marginLeft = item.origMarginLeft;
                    if (item.origTextAlign !== undefined) item.el.style.textAlign = item.origTextAlign;
                    if (item.origBg !== undefined) item.el.style.backgroundColor = item.origBg;
                    if (item.origBorderColor !== undefined) item.el.style.borderColor = item.origBorderColor;
                    if (item.origColor !== undefined) item.el.style.color = item.origColor;
                    if (item.origHeight !== undefined) item.el.style.height = item.origHeight;
                    if (item.origMinHeight !== undefined) item.el.style.minHeight = item.origMinHeight;
                    if (item.origMaxHeight !== undefined) item.el.style.maxHeight = item.origMaxHeight;
                    if (item.origOverflow !== undefined) item.el.style.overflow = item.origOverflow;
                    if (item.origWidth !== undefined) item.el.style.width = item.origWidth;
                    if (item.origPadding !== undefined) item.el.style.padding = item.origPadding;
                    if (item.origPosition !== undefined) item.el.style.position = item.origPosition;
                    if (item.origAlignSelf !== undefined) item.el.style.alignSelf = item.origAlignSelf;
                }
            });
        } finally {
            if (typeof global.hideLoadingOverlay === 'function') {
                global.hideLoadingOverlay();
            }
            if (confirmBtn) {
                confirmBtn.innerHTML = origConfirmText;
                confirmBtn.disabled = false;
            }
            if (downloadBtn) {
                downloadBtn.innerHTML = origDownloadText;
                downloadBtn.disabled = false;
            }
        }
    }

    function shareShopCardImage(shopId, event) {
        if (event) event.stopPropagation();
        const shopList = getGlobalShops();
        const shop = shopList.find(s => s.id === shopId);
        const shopName = shop ? shop.name : '店舗';
        const container = (event && event.target)
            ? (event.target.closest('.shop-info') || event.target.closest('.leaflet-popup-content'))
            : document.querySelector(`.shop-grid:not(.view-mode-calendar) .shop-info[data-shop-id="${shopId}"]`);
        if (container) {
            const fileName = `営業情報_${shopName}_${getTimestampStr()}`;
            const shareText = `【ラーメン二郎 ${shopName}の営業情報】\nhttps://app.jirolianmap.com/\n#ラーメン二郎 #二郎 #営業情報 #ジロリアンマップ`;
            openShareOptionsModal(container, shop, 'popup_detail', fileName, shareText, event ? event.currentTarget : null);
        }
    }

    function shareCalendarCardImage(shopId, event) {
        if (event) event.stopPropagation();
        const shopList = getGlobalShops();
        const shop = shopList.find(s => s.id === shopId);
        const shopName = shop ? shop.name : '店舗';
        const container = (event && event.target)
            ? (event.target.closest('.shop-item') || event.target.closest('.shop-info'))
            : document.querySelector(`.view-mode-calendar .shop-info[data-shop-id="${shopId}"]`);
        if (container) {
            const fileName = `営業カレンダー_${shopName}_${getTimestampStr()}`;
            const shareText = `【ラーメン二郎 ${shopName}の営業カレンダー】\nhttps://app.jirolianmap.com/\n#ラーメン二郎 #二郎 #営業情報 #ジロリアンマップ`;
            openShareOptionsModal(container, shop, 'calendar', fileName, shareText, event ? event.currentTarget : null);
        }
    }

    function shareCalendarModalImage(event) {
        if (event) event.stopPropagation();
        const modalTitle = document.getElementById('calendar-modal-title');
        const shopName = modalTitle ? modalTitle.textContent.trim() : '店舗';
        const container = document.getElementById('calendar-modal-body') || document.getElementById('calendar-modal');
        if (container) {
            const fileName = `営業カレンダー_${shopName}_${getTimestampStr()}`;
            const shareText = `【ラーメン二郎 ${shopName}の営業カレンダー】\nhttps://app.jirolianmap.com/\n#ラーメン二郎 #二郎 #営業情報 #ジロリアンマップ`;
            openShareOptionsModal(container, global.currentCalendarModalShop, 'calendar', fileName, shareText, event ? event.currentTarget : null);
        }
    }

    // グローバル公開（bot.jsやHTML onclickからの呼び出し互換性を保証）
    global.getTimestampStr = getTimestampStr;
    global.captureElementWithPadding = captureElementWithPadding;
    global.fallbackDownloadFile = fallbackDownloadFile;
    global.fallbackShareImage = fallbackShareImage;
    global.openShareOptionsModal = openShareOptionsModal;
    global.closeShareOptionsModal = closeShareOptionsModal;
    global.shareFullGridImage = shareFullGridImage;
    global.executeImageShare = executeImageShare;
    global.shareShopCardImage = shareShopCardImage;
    global.shareCalendarCardImage = shareCalendarCardImage;
    global.shareCalendarModalImage = shareCalendarModalImage;

    Object.defineProperty(global, 'currentShareTarget', {
        get() { return currentShareTarget; },
        set(val) { currentShareTarget = val; },
        configurable: true
    });

})(typeof window !== 'undefined' ? window : globalThis);

