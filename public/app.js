const { api, money, linesToText, textToLines, encodePath, placeholder } = window.AppTools;
const { defaultBuilder, defaultPlanEditor, defaultDeviceEditor, buildSettingsForm } = window.AppState;
const { storefrontTemplate, adminTemplate, modalTemplate } = window.AppTemplates;

const App = {
    template: `<div>${storefrontTemplate}${adminTemplate}${modalTemplate}</div>`,
    data() {
        return {
            settings: {
                payment_qrs: {},
                buy_flow_steps: [],
                ship_flow_steps: [],
                ship_checklist: [],
                purchase_rules: [],
                faq_items: [],
                admin_note_templates: [],
            },
            plans: [],
            devices: [],
            currentUser: null,
            loginPhone: '',
            adminUsername: '',
            adminPassword: '',
            showLoginModal: false,
            showBuilder: false,
            showOrdersModal: false,
            myOrders: [],
            orderProofFiles: {},
            builderForm: defaultBuilder(),
            paymentProofFile: null,
            paymentProofPreview: null,
            previewImageUrl: null,
            toast: { show: false, message: '' },
            toastTimer: null,
            savingStates: {
                login: false,
                submitOrder: false,
                adminOrders: false,
                exportOrders: false,
                settings: false,
                account: false,
                plan: false,
                device: false,
                uploadPaymentQrs: false,
            },
            savingOrderIds: [],
            isAdminEntry: document.body?.dataset?.pageMode === 'admin' || window.location.pathname.startsWith('/admin'),
            isAdminView: false,
            adminTabs: [
                { value: 'dashboard', label: '数据概览' },
                { value: 'plans', label: '套餐管理' },
                { value: 'devices', label: '设备管理' },
                { value: 'orders', label: '订单管理' },
                { value: 'settings', label: '店铺设置' },
            ],
            adminTab: 'dashboard',
            orderStatuses: [
                'pending_payment_review',
                'awaiting_device_delivery',
                'configuring',
                'ready_to_ship',
                'shipped',
                'completed',
                'cancelled',
            ],
            adminDashboard: {
                plan_count: 0,
                device_count: 0,
                order_count: 0,
                user_count: 0,
                total_revenue: 0,
                pending_count: 0,
                buy_device_count: 0,
                ship_device_count: 0,
                low_stock_devices: [],
            },
            adminPlans: [],
            adminDevices: [],
            adminOrders: [],
            adminOrderFilters: { q: '', status: 'pending_payment_review', flow_type: 'all', date_from: '', date_to: '' },
            adminSettingsForm: buildSettingsForm({
                payment_qrs: {},
                buy_flow_steps: [],
                ship_flow_steps: [],
                ship_checklist: [],
                purchase_rules: [],
                faq_items: [],
                admin_note_templates: [],
            }),
            adminAccountForm: { username: '', current_password: '', new_password: '', confirm_password: '' },
            settingsSnapshot: JSON.stringify(
                buildSettingsForm({
                    payment_qrs: {},
                    buy_flow_steps: [],
                    ship_flow_steps: [],
                    ship_checklist: [],
                    purchase_rules: [],
                    faq_items: [],
                    admin_note_templates: [],
                }),
            ),
            accountSnapshot: JSON.stringify({ username: '', current_password: '', new_password: '', confirm_password: '' }),
            planSnapshot: JSON.stringify({ ...defaultPlanEditor(), hasImageFile: false }),
            deviceSnapshot: JSON.stringify({ ...defaultDeviceEditor(), compatible_plan_ids: [], hasImageFile: false }),
            qrFiles: { wechat: null, alipay: null },
            showPlanEditor: false,
            planEditorForm: defaultPlanEditor(),
            planImageFile: null,
            planEditorPreview: '',
            showDeviceEditor: false,
            deviceEditorForm: defaultDeviceEditor(),
            deviceImageFile: null,
            deviceEditorPreview: '',
            lastQuickPlanTouch: { planId: null, time: 0 },
            beforeUnloadHandler: null,
        };
    },
    computed: {
        isAdmin() {
            return this.currentUser?.role === 'admin';
        },
        selectedPlan() {
            return this.plans.find((item) => item.id === this.builderForm.plan_id) || null;
        },
        selectedDevice() {
            return this.devices.find((item) => item.id === this.builderForm.device_id) || null;
        },
        availablePlansForBuilder() {
            if (this.builderForm.flow_type !== 'buy_device' || !this.selectedDevice) {
                return this.plans;
            }
            const compatibleIds = Array.isArray(this.selectedDevice.compatible_plan_ids) ? this.selectedDevice.compatible_plan_ids : [];
            if (!compatibleIds.length) {
                return this.plans;
            }
            return this.plans.filter((plan) => compatibleIds.includes(plan.id));
        },
        activePaymentQr() {
            return this.builderForm.payment_method === 'alipay' ? this.settings.payment_qrs?.alipay : this.settings.payment_qrs?.wechat;
        },
        orderTotal() {
            const planAmount = this.selectedPlan ? Number(this.selectedPlan.setup_price || 0) : 0;
            const deviceAmount =
                this.builderForm.flow_type === 'buy_device' && this.selectedDevice
                    ? Number(this.selectedDevice.price || 0) * Number(this.builderForm.quantity || 1)
                    : 0;
            const serviceAmount = this.builderForm.flow_type === 'ship_device' ? Number(this.settings.ship_service_fee || 0) : 0;
            return Number((planAmount + deviceAmount + serviceAmount).toFixed(2));
        },
        featuredBundles() {
            const hotDevices = [...this.devices]
                .filter((device) => device.stock > 0)
                .sort((a, b) => Number(b.featured) - Number(a.featured) || b.hot_rank - a.hot_rank || a.sort_order - b.sort_order)
                .slice(0, 4);

            return hotDevices
                .map((device) => {
                    const compatibleIds = this.getCompatiblePlanIds(device);
                    const candidatePlans = compatibleIds.length ? this.plans.filter((plan) => compatibleIds.includes(plan.id)) : this.plans;
                    const plan = [...candidatePlans].sort(
                        (a, b) => Number(b.featured) - Number(a.featured) || b.hot_rank - a.hot_rank || a.sort_order - b.sort_order,
                    )[0];
                    if (!plan) return null;
                    return {
                        key: `${device.id}-${plan.id}`,
                        device,
                        plan,
                        description: device.name + ' 常被搭配 ' + plan.name + ' 下单，适合想直接一步买好设备和套餐的用户。',
                    };
                })
                .filter(Boolean);
        },
        faqEntries() {
            return (this.settings.faq_items || [])
                .map((item) => {
                    const [question, answer] = String(item || '').split('|');
                    return {
                        question: String(question || '').trim(),
                        answer: String(answer || '').trim(),
                    };
                })
                .filter((item) => item.question && item.answer);
        },
        shopReceivingText() {
            return [this.settings.shop_receiving_name, this.settings.shop_receiving_phone, this.settings.shop_receiving_address]
                .filter(Boolean)
                .join(' / ');
        },
        adminNoteTemplates() {
            return (this.settings.admin_note_templates || []).filter(Boolean);
        },
        isPlanEditorDirty() {
            return this.showPlanEditor && this.serializeSnapshot(this.buildPlanComparable()) !== this.planSnapshot;
        },
        isDeviceEditorDirty() {
            return this.showDeviceEditor && this.serializeSnapshot(this.buildDeviceComparable()) !== this.deviceSnapshot;
        },
        isAdminSettingsDirty() {
            return (
                this.serializeSnapshot(this.buildSettingsComparable()) !== this.settingsSnapshot ||
                Boolean(this.qrFiles.wechat || this.qrFiles.alipay)
            );
        },
        isAdminAccountDirty() {
            return this.serializeSnapshot(this.buildAccountComparable()) !== this.accountSnapshot;
        },
        hasUnsavedChanges() {
            return this.isPlanEditorDirty || this.isDeviceEditorDirty || this.isAdminSettingsDirty || this.isAdminAccountDirty;
        },
    },
    mounted() {
        this.registerImageFallbacks();
        this.beforeUnloadHandler = (event) => this.handleBeforeUnload(event);
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
        this.initialize();
    },
    beforeUnmount() {
        if (this.handleDocumentImageError) {
            document.removeEventListener('error', this.handleDocumentImageError, true);
        }
        if (this.beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this.beforeUnloadHandler);
        }
    },
    methods: {
        currency: money,
        placeholder,
        registerImageFallbacks() {
            this.handleDocumentImageError = (event) => {
                const target = event.target;
                if (!(target instanceof HTMLImageElement) || target.dataset.fallbackApplied === '1') {
                    return;
                }

                const figure = target.closest('.plan-visual, .choice-media, .device-cover, .admin-cover, .editor-image, .qr-preview');
                const altText = target.getAttribute('alt') || '图片';
                const fallbackText = figure?.classList.contains('plan-visual')
                    ? '套餐图片暂不可用'
                    : figure?.classList.contains('qr-preview')
                      ? '收款码图片暂不可用'
                      : '设备图片暂不可用';

                target.dataset.fallbackApplied = '1';
                target.src = placeholder(altText || fallbackText);
            };

            document.addEventListener('error', this.handleDocumentImageError, true);
        },
        encodedImage(value) {
            return encodePath(value);
        },
        assetFileName(value, fallback = '未选择文件') {
            const text = String(value || '').trim();
            if (!text) return fallback;
            const [pathPart] = text.split('?');
            const segments = pathPart.split('/').filter(Boolean);
            const rawName = segments[segments.length - 1] || text;
            try {
                return decodeURIComponent(rawName);
            } catch (error) {
                return rawName;
            }
        },
        serializeSnapshot(value) {
            return JSON.stringify(value ?? null);
        },
        buildSettingsComparable() {
            return {
                ...this.adminSettingsForm,
                payment_qrs: { ...(this.adminSettingsForm.payment_qrs || {}) },
            };
        },
        buildAccountComparable() {
            return { ...this.adminAccountForm };
        },
        buildPlanComparable() {
            return {
                ...this.planEditorForm,
                hasImageFile: Boolean(this.planImageFile),
            };
        },
        buildDeviceComparable() {
            return {
                ...this.deviceEditorForm,
                compatible_plan_ids: [...(this.deviceEditorForm.compatible_plan_ids || [])],
                hasImageFile: Boolean(this.deviceImageFile),
            };
        },
        rememberSettingsSnapshot() {
            this.settingsSnapshot = this.serializeSnapshot(this.buildSettingsComparable());
        },
        rememberAccountSnapshot() {
            this.accountSnapshot = this.serializeSnapshot(this.buildAccountComparable());
        },
        rememberPlanSnapshot() {
            this.planSnapshot = this.serializeSnapshot(this.buildPlanComparable());
        },
        rememberDeviceSnapshot() {
            this.deviceSnapshot = this.serializeSnapshot(this.buildDeviceComparable());
        },
        setSavingState(key, active) {
            this.savingStates[key] = Boolean(active);
        },
        isOrderSaving(orderId) {
            return this.savingOrderIds.includes(orderId);
        },
        setOrderSaving(orderId, active) {
            if (active) {
                if (!this.savingOrderIds.includes(orderId)) {
                    this.savingOrderIds = [...this.savingOrderIds, orderId];
                }
                return;
            }
            this.savingOrderIds = this.savingOrderIds.filter((id) => id !== orderId);
        },
        normalizeAdminOrderFilters() {
            const nextFilters = { ...this.adminOrderFilters };
            if (nextFilters.date_from && nextFilters.date_to && nextFilters.date_from > nextFilters.date_to) {
                [nextFilters.date_from, nextFilters.date_to] = [nextFilters.date_to, nextFilters.date_from];
                this.adminOrderFilters.date_from = nextFilters.date_from;
                this.adminOrderFilters.date_to = nextFilters.date_to;
            }
            return nextFilters;
        },
        handleBeforeUnload(event) {
            if (!this.hasUnsavedChanges) {
                return undefined;
            }
            event.preventDefault();
            event.returnValue = '';
            return '';
        },
        confirmDiscardChanges(message = '当前有未保存的内容，确认要离开吗？') {
            return !this.hasUnsavedChanges || window.confirm(message);
        },
        confirmDiscardSection(isDirty, message) {
            return !isDirty || window.confirm(message);
        },
        setAdminTab(nextTab) {
            if (nextTab === this.adminTab) return;
            if (
                this.adminTab === 'settings' &&
                !this.confirmDiscardSection(
                    this.isAdminSettingsDirty || this.isAdminAccountDirty,
                    '店铺设置或账号安全有未保存的修改，确认切换标签吗？',
                )
            ) {
                return;
            }
            this.adminTab = nextTab;
        },
        revokeObjectUrl(url) {
            if (typeof url === 'string' && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        },
        validateImageFile(file, label = '图片') {
            if (!(file instanceof File)) return null;
            if (!file.type.startsWith('image/')) {
                this.toastMessage(label + '仅支持图片文件。');
                return null;
            }
            if (file.size > 5 * 1024 * 1024) {
                this.toastMessage(label + '不能超过 5MB。');
                return null;
            }
            return file;
        },
        pickValidatedImage(event, label = '图片') {
            const file = event?.target?.files?.[0] || null;
            if (!file) return null;
            const validFile = this.validateImageFile(file, label);
            if (!validFile && event?.target) {
                event.target.value = '';
            }
            return validFile;
        },
        async readFileDataUrl(file) {
            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        },
        async compressImageIfNeeded(file, options = {}) {
            if (!(file instanceof File) || !file.type.startsWith('image/')) {
                return file;
            }

            const { maxWidth = 1600, maxHeight = 1600, quality = 0.86, minSize = 220 * 1024 } = options;

            if (file.size <= minSize) {
                return file;
            }

            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const image = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = dataUrl;
            });

            const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.width * ratio));
            canvas.height = Math.max(1, Math.round(image.height * ratio));
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0, canvas.width, canvas.height);

            const blob = await new Promise((resolve) =>
                canvas.toBlob(resolve, file.type === 'image/png' ? 'image/png' : 'image/jpeg', quality),
            );
            if (!blob || blob.size >= file.size) {
                return file;
            }

            return new File([blob], file.name.replace(/\.(png|jpg|jpeg|webp|avif)$/i, '') + '.jpg', {
                type: blob.type || 'image/jpeg',
                lastModified: Date.now(),
            });
        },
        async loadImageFromFile(file) {
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            return await new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = reject;
                image.src = dataUrl;
            });
        },
        buildCenteredSquareRect(width, height, scale = 0.86) {
            const size = Math.max(1, Math.round(Math.min(width, height) * scale));
            return {
                x: Math.max(0, Math.round((width - size) / 2)),
                y: Math.max(0, Math.round((height - size) / 2)),
                width: size,
                height: size,
            };
        },
        normalizeCropRect(rect, imageWidth, imageHeight) {
            const left = Math.max(0, Math.floor(rect.x || 0));
            const top = Math.max(0, Math.floor(rect.y || 0));
            const right = Math.min(imageWidth, Math.ceil((rect.x || 0) + (rect.width || 0)));
            const bottom = Math.min(imageHeight, Math.ceil((rect.y || 0) + (rect.height || 0)));
            const width = Math.max(1, right - left);
            const height = Math.max(1, bottom - top);
            const size = Math.min(Math.max(width, height), imageWidth, imageHeight);
            const centerX = left + width / 2;
            const centerY = top + height / 2;
            const x = Math.max(0, Math.min(imageWidth - size, Math.round(centerX - size / 2)));
            const y = Math.max(0, Math.min(imageHeight - size, Math.round(centerY - size / 2)));

            return {
                x,
                y,
                width: size,
                height: size,
            };
        },
        createAnalysisCanvas(image, maxSide = 960) {
            const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            return { canvas, context, scale };
        },
        smoothCounts(values, radius = 3) {
            return values.map((_, index) => {
                let total = 0;
                let count = 0;
                for (let offset = -radius; offset <= radius; offset += 1) {
                    const targetIndex = index + offset;
                    if (targetIndex < 0 || targetIndex >= values.length) continue;
                    total += values[targetIndex];
                    count += 1;
                }
                return count ? total / count : 0;
            });
        },
        findPrimaryDenseRange(counts, minimumLength = 12) {
            if (!counts.length) return null;

            const smoothValues = this.smoothCounts(counts);
            const maxValue = Math.max(...smoothValues);
            if (!Number.isFinite(maxValue) || maxValue <= 0) {
                return null;
            }

            const threshold = Math.max(6, maxValue * 0.2);
            const ranges = [];
            let start = -1;
            let total = 0;

            for (let index = 0; index < smoothValues.length; index += 1) {
                const value = smoothValues[index];
                if (value >= threshold) {
                    if (start === -1) {
                        start = index;
                        total = 0;
                    }
                    total += value;
                } else if (start !== -1) {
                    ranges.push({ start, end: index - 1, total });
                    start = -1;
                    total = 0;
                }
            }

            if (start !== -1) {
                ranges.push({ start, end: smoothValues.length - 1, total });
            }

            const validRanges = ranges.filter((range) => range.end - range.start + 1 >= minimumLength);
            if (!validRanges.length) {
                return null;
            }

            validRanges.sort((a, b) => {
                const lengthDiff = b.end - b.start - (a.end - a.start);
                if (lengthDiff !== 0) return lengthDiff;
                return b.total - a.total;
            });

            return validRanges[0];
        },
        detectQrBoundsByDensity(image) {
            const { canvas, context, scale } = this.createAnalysisCanvas(image);
            const width = canvas.width;
            const height = canvas.height;
            const imageData = context.getImageData(0, 0, width, height).data;
            const rowCounts = new Array(height).fill(0);

            for (let y = 0; y < height; y += 1) {
                let darkCount = 0;
                for (let x = 0; x < width; x += 1) {
                    const offset = (y * width + x) * 4;
                    const red = imageData[offset];
                    const green = imageData[offset + 1];
                    const blue = imageData[offset + 2];
                    const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
                    const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
                    const isDark = luminance < 118 && (spread < 105 || luminance < 88);
                    if (isDark) {
                        darkCount += 1;
                    }
                }
                rowCounts[y] = darkCount;
            }

            const rowRange = this.findPrimaryDenseRange(rowCounts, Math.max(18, Math.round(height * 0.12)));
            if (!rowRange) {
                return null;
            }

            const columnCounts = new Array(width).fill(0);
            for (let x = 0; x < width; x += 1) {
                let darkCount = 0;
                for (let y = rowRange.start; y <= rowRange.end; y += 1) {
                    const offset = (y * width + x) * 4;
                    const red = imageData[offset];
                    const green = imageData[offset + 1];
                    const blue = imageData[offset + 2];
                    const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
                    const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
                    const isDark = luminance < 118 && (spread < 105 || luminance < 88);
                    if (isDark) {
                        darkCount += 1;
                    }
                }
                columnCounts[x] = darkCount;
            }

            const columnRange = this.findPrimaryDenseRange(columnCounts, Math.max(18, Math.round(width * 0.12)));
            if (!columnRange) {
                return null;
            }

            const refinedRowCounts = new Array(height).fill(0);
            for (let y = 0; y < height; y += 1) {
                let darkCount = 0;
                for (let x = columnRange.start; x <= columnRange.end; x += 1) {
                    const offset = (y * width + x) * 4;
                    const red = imageData[offset];
                    const green = imageData[offset + 1];
                    const blue = imageData[offset + 2];
                    const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
                    const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
                    const isDark = luminance < 118 && (spread < 105 || luminance < 88);
                    if (isDark) {
                        darkCount += 1;
                    }
                }
                refinedRowCounts[y] = darkCount;
            }

            const refinedRowRange = this.findPrimaryDenseRange(refinedRowCounts, Math.max(18, Math.round(height * 0.12))) || rowRange;
            const baseRect = {
                x: columnRange.start,
                y: refinedRowRange.start,
                width: columnRange.end - columnRange.start + 1,
                height: refinedRowRange.end - refinedRowRange.start + 1,
            };

            const normalizedRect = this.normalizeCropRect(baseRect, width, height);
            const padding = Math.max(6, Math.round(normalizedRect.width * 0.045));
            const paddedRect = this.normalizeCropRect(
                {
                    x: normalizedRect.x - padding,
                    y: normalizedRect.y - padding,
                    width: normalizedRect.width + padding * 2,
                    height: normalizedRect.height + padding * 2,
                },
                width,
                height,
            );

            return {
                x: Math.round(paddedRect.x / scale),
                y: Math.round(paddedRect.y / scale),
                width: Math.round(paddedRect.width / scale),
                height: Math.round(paddedRect.height / scale),
            };
        },
        async detectQrCropRect(image) {
            const fallbackRect = this.buildCenteredSquareRect(image.width, image.height);

            const densityRect = this.detectQrBoundsByDensity(image);
            if (densityRect) {
                return this.normalizeCropRect(densityRect, image.width, image.height);
            }

            if (typeof BarcodeDetector === 'undefined') {
                return fallbackRect;
            }

            try {
                const detector = new BarcodeDetector({ formats: ['qr_code'] });
                const results = await detector.detect(image);
                const target = results.find((item) => item?.boundingBox) || results[0];
                if (!target?.boundingBox) {
                    return fallbackRect;
                }

                const padding = Math.round(Math.max(target.boundingBox.width, target.boundingBox.height) * 0.18);
                return this.normalizeCropRect(
                    {
                        x: target.boundingBox.x - padding,
                        y: target.boundingBox.y - padding,
                        width: target.boundingBox.width + padding * 2,
                        height: target.boundingBox.height + padding * 2,
                    },
                    image.width,
                    image.height,
                );
            } catch (error) {
                return fallbackRect;
            }
        },
        async cropPaymentQrImage(file) {
            if (!(file instanceof File) || !file.type.startsWith('image/')) {
                return file;
            }

            try {
                const image = await this.loadImageFromFile(file);
                const cropRect = await this.detectQrCropRect(image);
                const outputSize = Math.min(1280, Math.max(720, cropRect.width));
                const canvas = document.createElement('canvas');
                canvas.width = outputSize;
                canvas.height = outputSize;

                const context = canvas.getContext('2d');
                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, outputSize, outputSize);
                context.drawImage(image, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, outputSize, outputSize);

                const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
                if (!blob) {
                    return file;
                }

                return new File([blob], file.name.replace(/\.(png|jpg|jpeg|webp|avif)$/i, '') + '-qr.png', {
                    type: 'image/png',
                    lastModified: Date.now(),
                });
            } catch (error) {
                return file;
            }
        },
        updatePageMeta() {
            if (this.isAdminEntry) return;
            document.title = this.settings.share_title || this.settings.store_name || '物联卡配卡商城';
            const description = this.settings.share_description || this.settings.hero_subtitle || '';
            const selectors = [
                'meta[name="description"]',
                'meta[property="og:title"]',
                'meta[property="og:description"]',
                'meta[name="twitter:title"]',
                'meta[name="twitter:description"]',
            ];
            selectors.forEach((selector) => {
                const element = document.querySelector(selector);
                if (!element) return;
                if (selector.includes('title')) {
                    element.setAttribute('content', this.settings.share_title || this.settings.store_name || '');
                } else {
                    element.setAttribute('content', description);
                }
            });
        },
        formatDateTime(value) {
            if (!value) return '暂无时间';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return value;
            return date.toLocaleString('zh-CN', { hour12: false });
        },
        scrollToSection(id) {
            const el = document.getElementById(id);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },
        deviceCategoryText(value) {
            return (
                {
                    portable_wifi: '随身 WiFi',
                    cpe: 'CPE 设备',
                    vehicle_router: '车载路由',
                    industrial_gateway: '工业网关',
                }[value] || '设备'
            );
        },
        flowTypeText(value) {
            return value === 'ship_device' ? '寄设备配卡' : '购买设备配卡';
        },
        paymentText(value) {
            return value === 'alipay' ? '支付宝付款' : '微信付款';
        },
        insertCardText(value) {
            return (
                {
                    yes: '可以插卡',
                    no: '不可插卡',
                    unknown: '不清楚',
                }[value] || '未填写'
            );
        },
        removeControlText(value) {
            return (
                {
                    yes: '已去控',
                    no: '未去控',
                    need: '已去控',
                    no_need: '未去控',
                    unknown: '不清楚',
                }[value] || '未填写'
            );
        },
        compatiblePlanCount(device) {
            const compatibleIds = this.getCompatiblePlanIds(device);
            return compatibleIds.length || this.plans.length;
        },
        isHotPlan(plan, index = -1) {
            return Number(plan?.hot_rank || 0) > 0 || Boolean(plan?.featured) || (index > -1 && index < 2);
        },
        isHotDevice(device, index = -1) {
            return Number(device?.hot_rank || 0) > 0 || Boolean(device?.featured) || (index > -1 && index < 2);
        },
        planSalesText(plan, index = -1) {
            if (plan?.featured) return '近期咨询和下单都比较多，适合优先锁定后再选设备。';
            if (index === 0) return '很多用户会先从这款套餐开始对比，适合新客快速了解资费。';
            if ((plan?.features || []).length) return '常被用来搭配随身 WiFi 或寄设备来配卡，成交路径更顺。';
            return '适合先看图确认资费，再按设备型号选择配卡方案。';
        },
        deviceSalesText(device, index = -1) {
            if (device?.stock <= 0) return '当前缺货，可先看图选其他设备或联系客服登记。';
            if (device?.featured) return '热门设备之一，很多用户会直接选这台搭配套餐下单。';
            if (index === 0) return '适合想省心一步到位的用户，选好设备后直接继续配卡即可。';
            if (device?.original_price > device?.price) return '当前有价格展示，更容易让用户直接完成设备配卡下单。';
            return '适合看完套餐后直接下单，减少来回咨询和选择成本。';
        },
        orderTimeline(order) {
            const map = {
                pending_payment_review: 1,
                awaiting_device_delivery: 2,
                configuring: 3,
                ready_to_ship: 4,
                shipped: 5,
                completed: 6,
                cancelled: 0,
            };
            const currentStep = map[order.status] ?? 0;
            const steps = [
                { key: 'created', label: '已下单', activeAt: 1 },
                { key: 'review', label: '待审核', activeAt: 1 },
                { key: 'config', label: order.flow_type === 'ship_device' ? '收件配卡' : '配卡测试', activeAt: 3 },
                { key: 'ship', label: '待发/已发', activeAt: 4 },
                { key: 'done', label: '已完成', activeAt: 6 },
            ];
            if (order.status === 'cancelled') {
                return steps.map((step, index) => ({
                    ...step,
                    state: index === 0 ? 'done' : 'muted',
                }));
            }
            return steps.map((step) => ({
                ...step,
                state: currentStep >= step.activeAt ? 'done' : currentStep + 1 === step.activeAt ? 'active' : 'muted',
            }));
        },
        allowPaymentProofRefresh(order) {
            return !['cancelled', 'completed'].includes(order.status);
        },
        isUrgentOrder(order) {
            return ['pending_payment_review', 'awaiting_device_delivery'].includes(order.status);
        },
        orderStatusText(value) {
            return (
                {
                    pending_payment_review: '待付款审核',
                    awaiting_device_delivery: '待设备寄达',
                    configuring: '配卡测试中',
                    ready_to_ship: '待发货',
                    shipped: '已发货',
                    completed: '已完成',
                    cancelled: '已取消',
                }[value] || value
            );
        },
        planImage(plan) {
            return encodePath(plan?.cover_image || placeholder('套餐资费图', '#0E6D68', '#57B8A8'));
        },
        deviceImage(device) {
            return encodePath(device?.cover_image || placeholder('设备介绍图', '#173B67', '#E39A2D'));
        },
        getCompatiblePlanIds(device = null) {
            if (!device || !Array.isArray(device.compatible_plan_ids)) {
                return [];
            }
            return device.compatible_plan_ids.map((item) => Number(item)).filter(Boolean);
        },
        syncBuilderSelections() {
            if (this.builderForm.flow_type !== 'buy_device') {
                if (!this.builderForm.plan_id) {
                    this.builderForm.plan_id = this.plans[0]?.id || null;
                }
                return;
            }
            const compatiblePlans = this.availablePlansForBuilder;
            if (!compatiblePlans.length) {
                this.builderForm.plan_id = null;
                return;
            }
            if (!compatiblePlans.find((item) => item.id === this.builderForm.plan_id)) {
                this.builderForm.plan_id = compatiblePlans[0]?.id || null;
            }
        },
        chooseDevice(deviceId) {
            this.builderForm.device_id = deviceId;
            this.syncBuilderSelections();
        },
        handleQuickPlanTouch(plan) {
            const now = Date.now();
            const isDoubleTap = this.lastQuickPlanTouch.planId === plan.id && now - this.lastQuickPlanTouch.time < 320;
            this.builderForm.plan_id = plan.id;
            if (isDoubleTap) {
                this.previewImage(this.planImage(plan));
                this.lastQuickPlanTouch = { planId: null, time: 0 };
                return;
            }
            this.lastQuickPlanTouch = { planId: plan.id, time: now };
        },
        deviceCompatibilityText(device) {
            const compatibleIds = this.getCompatiblePlanIds(device);
            if (!compatibleIds.length) {
                return '支持全部上架套餐配卡。';
            }
            const names = this.plans
                .filter((plan) => compatibleIds.includes(plan.id))
                .slice(0, 3)
                .map((plan) => plan.name);
            const suffix = compatibleIds.length > names.length ? ' 等' + compatibleIds.length + '个套餐' : '';
            return '可配套餐：' + names.join('、') + suffix;
        },
        previewImage(url) {
            if (!url) return;
            this.previewImageUrl = encodePath(url);
        },
        handlePreviewImageError(event) {
            if (event?.target) {
                event.target.onerror = null;
            }
            this.previewImageUrl = null;
            this.toastMessage('原图预览失败，请稍后再试。');
        },
        toastMessage(message) {
            this.toast.message = message;
            this.toast.show = true;
            clearTimeout(this.toastTimer);
            this.toastTimer = setTimeout(() => {
                this.toast.show = false;
            }, 2400);
        },
        errorMessage(error) {
            return error?.response?.data?.error || error?.message || '操作失败，请稍后再试。';
        },
        async copyText(value, successMessage = '已复制') {
            const text = String(value || '').trim();
            if (!text) {
                this.toastMessage('暂无可复制内容。');
                return;
            }
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const input = document.createElement('textarea');
                    input.value = text;
                    input.setAttribute('readonly', 'readonly');
                    input.style.position = 'fixed';
                    input.style.opacity = '0';
                    document.body.appendChild(input);
                    input.select();
                    document.execCommand('copy');
                    document.body.removeChild(input);
                }
                this.toastMessage(successMessage);
            } catch (error) {
                this.toastMessage('复制失败，请手动长按复制。');
            }
        },
        splitTagsText(value) {
            return String(value || '')
                .split(/[\n,，、;；/]+/)
                .map((item) => item.trim())
                .filter(Boolean);
        },
        reversedProcessingLogs(order) {
            return [...(order?.processing_logs || [])].reverse();
        },
        applyAdminNoteTemplate(order, template) {
            const nextTemplate = String(template || '').trim();
            if (!nextTemplate) return;
            order.admin_note = order.admin_note ? order.admin_note + '\n' + nextTemplate : nextTemplate;
        },
        resetBuilder() {
            const next = defaultBuilder();
            next.plan_id = this.plans[0]?.id || null;
            next.device_id = this.devices[0]?.id || null;
            if (this.currentUser) {
                next.customer_name = this.currentUser.nickname || '';
                next.customer_phone = this.currentUser.phone || '';
            }
            this.revokeObjectUrl(this.paymentProofPreview);
            this.builderForm = next;
            this.paymentProofFile = null;
            this.paymentProofPreview = null;
        },
        async initialize() {
            try {
                await Promise.all([this.fetchStorefront(), this.checkLogin()]);
                this.resetBuilder();
                if (this.isAdminEntry) {
                    if (this.isAdmin) {
                        await this.openAdmin();
                    } else {
                        this.showLoginModal = true;
                    }
                }
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
        },
        async fetchStorefront() {
            const { data } = await api.get('/storefront');
            this.settings = data.settings;
            this.plans = data.plans || [];
            this.devices = data.devices || [];
            this.updatePageMeta();
            if (!this.plans.find((item) => item.id === this.builderForm.plan_id)) {
                this.builderForm.plan_id = this.plans[0]?.id || null;
            }
            if (!this.devices.find((item) => item.id === this.builderForm.device_id)) {
                this.builderForm.device_id = this.devices[0]?.id || null;
            }
            this.syncBuilderSelections();
        },
        async checkLogin() {
            const token = localStorage.getItem('token');
            if (!token) return;
            try {
                const { data } = await api.get('/auth/me');
                this.currentUser = data;
            } catch (error) {
                localStorage.removeItem('token');
                this.currentUser = null;
            }
        },
        prefillContact() {
            if (!this.currentUser) return;
            this.builderForm.customer_name = this.builderForm.customer_name || this.currentUser.nickname;
            this.builderForm.customer_phone = this.builderForm.customer_phone || this.currentUser.phone;
        },
        async login() {
            if (this.savingStates.login) return;
            this.setSavingState('login', true);
            try {
                let data;
                if (this.isAdminEntry) {
                    if (!this.adminUsername) {
                        this.toastMessage('请输入管理员账号。');
                        return;
                    }
                    if (!this.adminPassword) {
                        this.toastMessage('请输入管理员密码。');
                        return;
                    }
                    ({ data } = await api.post('/auth/admin-login', {
                        username: this.adminUsername,
                        password: this.adminPassword,
                    }));
                } else {
                    if (!/^1[3-9]\d{9}$/.test(this.loginPhone)) {
                        this.toastMessage('请输入正确的 11 位手机号。');
                        return;
                    }
                    ({ data } = await api.post('/auth/login', { phone: this.loginPhone }));
                }
                localStorage.setItem('token', data.token);
                this.currentUser = data.user;
                this.loginPhone = '';
                this.adminUsername = '';
                this.adminPassword = '';
                this.showLoginModal = false;
                this.prefillContact();
                if (this.isAdminEntry) {
                    if (!this.isAdmin) {
                        this.toastMessage('当前账号没有后台权限。');
                        return;
                    }
                    await this.openAdmin();
                } else {
                    this.toastMessage('登录成功。');
                }
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
        },
        logout() {
            localStorage.removeItem('token');
            this.currentUser = null;
            this.adminUsername = '';
            this.adminPassword = '';
            this.loginPhone = '';
            this.isAdminView = false;
            this.showOrdersModal = false;
            this.showLoginModal = this.isAdminEntry;
            this.toastMessage('已退出登录。');
            this.resetBuilder();
        },
        openBuilder(flowType, options = {}) {
            this.showBuilder = true;
            this.builderForm.flow_type = flowType;
            if (flowType === 'buy_device') {
                this.builderForm.device_id = options.deviceId || this.builderForm.device_id || this.devices[0]?.id || null;
                this.builderForm.plan_id = options.planId || this.builderForm.plan_id || this.plans[0]?.id || null;
                this.syncBuilderSelections();
            } else {
                this.builderForm.device_id = null;
                this.builderForm.plan_id = options.planId || this.builderForm.plan_id || this.plans[0]?.id || null;
            }
            this.prefillContact();
        },
        setBuilderFlow(flowType) {
            this.builderForm.flow_type = flowType;
            if (flowType === 'buy_device' && !this.builderForm.device_id) {
                this.builderForm.device_id = this.devices[0]?.id || null;
                this.syncBuilderSelections();
            }
            if (flowType === 'ship_device') {
                this.builderForm.device_id = null;
                if (!this.builderForm.plan_id) {
                    this.builderForm.plan_id = this.plans[0]?.id || null;
                }
            }
        },
        closeBuilder() {
            this.showBuilder = false;
            this.revokeObjectUrl(this.paymentProofPreview);
            this.paymentProofFile = null;
            this.paymentProofPreview = null;
        },
        changeQuantity(step) {
            this.builderForm.quantity = Math.max(1, Number(this.builderForm.quantity || 1) + step);
        },
        onPaymentProofChange(event) {
            const selectedFile = event?.target?.files?.[0] || null;
            if (!selectedFile) {
                this.revokeObjectUrl(this.paymentProofPreview);
                this.paymentProofFile = null;
                this.paymentProofPreview = null;
                return;
            }
            const file = this.pickValidatedImage(event, '付款截图');
            if (!file) return;
            this.revokeObjectUrl(this.paymentProofPreview);
            this.paymentProofFile = file;
            this.readFileDataUrl(file)
                .then((result) => {
                    this.paymentProofPreview = result;
                })
                .catch(() => {
                    this.paymentProofPreview = null;
                });
        },
        async ensureLogin(actionText) {
            if (this.currentUser) return true;
            this.showLoginModal = true;
            this.toastMessage('请先登录后再' + actionText + '。');
            return false;
        },
        async submitOrder() {
            if (!(await this.ensureLogin('提交订单'))) return;
            if (this.savingStates.submitOrder) return;
            if (!this.builderForm.plan_id) return this.toastMessage('请先选择套餐。');
            if (this.builderForm.flow_type === 'buy_device' && !this.builderForm.device_id)
                return this.toastMessage('请选择要配卡的设备。');
            if (
                this.builderForm.flow_type === 'buy_device' &&
                this.selectedDevice &&
                this.availablePlansForBuilder.length &&
                !this.availablePlansForBuilder.find((plan) => plan.id === this.builderForm.plan_id)
            ) {
                return this.toastMessage('当前设备不能搭配这个套餐，请重新选择。');
            }
            if (!this.builderForm.customer_name) return this.toastMessage('请填写联系人姓名。');
            if (!/^1[3-9]\d{9}$/.test(this.builderForm.customer_phone)) return this.toastMessage('请填写正确的手机号。');
            if (!this.builderForm.shipping_address)
                return this.toastMessage(this.builderForm.flow_type === 'buy_device' ? '请填写收货地址。' : '请填写回寄地址。');
            if (
                this.builderForm.flow_type === 'ship_device' &&
                !this.builderForm.customer_device_brand &&
                !this.builderForm.customer_device_model
            )
                return this.toastMessage('寄设备配卡请至少填写设备品牌或型号。');
            if (!this.activePaymentQr) return this.toastMessage('当前支付方式还没有配置收款码，请联系客服处理。');
            if (!this.paymentProofFile) return this.toastMessage('请上传付款截图。');

            this.setSavingState('submitOrder', true);
            try {
                const fd = new FormData();
                Object.entries(this.builderForm).forEach(([key, value]) => fd.append(key, value ?? ''));
                fd.append('total_amount', this.orderTotal);
                const paymentProof = await this.compressImageIfNeeded(this.paymentProofFile, {
                    maxWidth: 1800,
                    maxHeight: 1800,
                    quality: 0.88,
                    minSize: 240 * 1024,
                });
                fd.append('payment_proof', paymentProof);
                await api.post('/orders', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                this.closeBuilder();
                this.resetBuilder();
                await Promise.all([
                    this.fetchStorefront(),
                    this.fetchMyOrders(false),
                    this.isAdmin ? this.refreshAdminData() : Promise.resolve(),
                ]);
                this.showOrdersModal = true;
                this.toastMessage('订单已提交，等待人工审核。');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('submitOrder', false);
            }
        },
        async fetchMyOrders(showModal = false) {
            if (!(await this.ensureLogin('查看订单'))) return;
            const { data } = await api.get('/orders');
            this.myOrders = data;
            if (showModal) this.showOrdersModal = true;
        },
        async openOrders() {
            await this.fetchMyOrders(true);
        },
        async cancelOrder(order) {
            if (!window.confirm('确认取消订单 ' + order.order_no + ' 吗？')) return;
            try {
                await api.put('/orders/' + order.id + '/cancel');
                await Promise.all([
                    this.fetchMyOrders(true),
                    this.fetchStorefront(),
                    this.isAdmin ? this.refreshAdminData() : Promise.resolve(),
                ]);
                this.toastMessage('订单已取消。');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
        },
        async confirmOrder(order) {
            if (!window.confirm('确认收到订单 ' + order.order_no + ' 吗？')) return;
            try {
                await api.put('/orders/' + order.id + '/confirm');
                await this.fetchMyOrders(true);
                this.toastMessage('已确认收货。');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
        },
        onOrderProofChange(event, orderId) {
            const selectedFile = event?.target?.files?.[0] || null;
            if (!selectedFile) {
                delete this.orderProofFiles[orderId];
                return;
            }
            const file = this.pickValidatedImage(event, '付款截图');
            if (!file) return;
            this.orderProofFiles = {
                ...this.orderProofFiles,
                [orderId]: file,
            };
        },
        async reuploadOrderPaymentProof(order) {
            const file = this.orderProofFiles[order.id];
            if (!file) return this.toastMessage('请先选择新的付款截图。');
            const fd = new FormData();
            const nextFile = await this.compressImageIfNeeded(file, {
                maxWidth: 1800,
                maxHeight: 1800,
                quality: 0.88,
                minSize: 240 * 1024,
            });
            fd.append('payment_proof', nextFile);
            try {
                await api.put('/orders/' + order.id + '/payment-proof', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                const nextProofFiles = { ...this.orderProofFiles };
                delete nextProofFiles[order.id];
                this.orderProofFiles = nextProofFiles;
                await this.fetchMyOrders(true);
                this.toastMessage('新的付款截图已提交。');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
        },
        async openAdmin() {
            if (!this.isAdmin) return this.toastMessage('请使用管理员账号登录。');
            this.isAdminView = true;
            try {
                await this.refreshAdminData();
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
        },
        goStorefront() {
            if (!this.confirmDiscardChanges()) return;
            window.location.href = '/';
        },
        async refreshAdminData() {
            await Promise.all([
                this.fetchAdminDashboard(),
                this.fetchAdminPlans(),
                this.fetchAdminDevices(),
                this.fetchAdminOrders(),
                this.fetchAdminSettings(),
            ]);
        },
        async fetchAdminDashboard() {
            const { data } = await api.get('/admin/dashboard');
            this.adminDashboard = data;
        },
        async fetchAdminPlans() {
            const { data } = await api.get('/admin/plans');
            this.adminPlans = data;
        },
        async fetchAdminDevices() {
            const { data } = await api.get('/admin/devices');
            this.adminDevices = data;
        },
        async fetchAdminOrders() {
            if (this.savingStates.adminOrders) return;
            this.setSavingState('adminOrders', true);
            try {
                const { data } = await api.get('/admin/orders', { params: this.normalizeAdminOrderFilters() });
                this.adminOrders = (data || []).map((order) => ({
                    ...order,
                    internal_tags_text: (order.internal_tags || []).join('，'),
                }));
            } finally {
                this.setSavingState('adminOrders', false);
            }
        },
        async exportAdminOrders() {
            if (this.savingStates.exportOrders) return;
            this.setSavingState('exportOrders', true);
            try {
                const response = await api.get('/admin/orders/export', {
                    params: this.normalizeAdminOrderFilters(),
                    responseType: 'blob',
                });
                const blobUrl = URL.createObjectURL(response.data);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = 'orders-' + new Date().toISOString().slice(0, 10) + '.csv';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(blobUrl);
                this.toastMessage('订单导出已开始。');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('exportOrders', false);
            }
        },
        async fetchAdminSettings() {
            const { data } = await api.get('/admin/settings');
            this.settings = data;
            this.adminSettingsForm = buildSettingsForm(data);
            this.rememberSettingsSnapshot();
            this.adminAccountForm = {
                username: this.currentUser?.username || '',
                current_password: '',
                new_password: '',
                confirm_password: '',
            };
            this.rememberAccountSnapshot();
        },
        openPlanEditor(plan = null) {
            this.revokeObjectUrl(this.planEditorPreview);
            if (plan) {
                this.planEditorForm = {
                    id: plan.id,
                    name: plan.name,
                    badge: plan.badge,
                    carrier: plan.carrier,
                    network_type: plan.network_type,
                    monthly_data: plan.monthly_data,
                    monthly_price: plan.monthly_price,
                    setup_price: plan.setup_price,
                    best_for: plan.best_for,
                    coverage: plan.coverage,
                    purchase_note: plan.purchase_note,
                    description: plan.description,
                    features_text: linesToText(plan.features),
                    tags_text: (plan.tags || []).join(','),
                    hot_rank: plan.hot_rank,
                    sort_order: plan.sort_order,
                    featured: plan.featured,
                    status: plan.status,
                };
                this.planEditorPreview = encodePath(plan.cover_image || '');
            } else {
                this.planEditorForm = defaultPlanEditor();
                this.planEditorPreview = '';
            }
            this.planImageFile = null;
            this.showPlanEditor = true;
            this.rememberPlanSnapshot();
        },
        closePlanEditor(force = false) {
            if (!force && !this.confirmDiscardSection(this.isPlanEditorDirty, '套餐编辑内容还没有保存，确认关闭吗？')) {
                return;
            }
            this.showPlanEditor = false;
            this.planEditorForm = defaultPlanEditor();
            this.planImageFile = null;
            this.revokeObjectUrl(this.planEditorPreview);
            this.planEditorPreview = '';
            this.rememberPlanSnapshot();
        },
        onPlanImageChange(event) {
            const selectedFile = event?.target?.files?.[0] || null;
            if (!selectedFile) {
                this.revokeObjectUrl(this.planEditorPreview);
                this.planImageFile = null;
                this.planEditorPreview = '';
                return;
            }
            const file = this.pickValidatedImage(event, '套餐图片');
            if (!file) return;
            this.revokeObjectUrl(this.planEditorPreview);
            this.planImageFile = file;
            this.planEditorPreview = URL.createObjectURL(file);
        },
        async savePlan() {
            if (this.savingStates.plan) return;
            this.setSavingState('plan', true);
            const fd = new FormData();
            Object.entries(this.planEditorForm).forEach(([key, value]) => {
                if (!key.endsWith('_text')) fd.append(key, value ?? '');
            });
            fd.append('features', this.planEditorForm.features_text);
            fd.append('tags', this.planEditorForm.tags_text);
            if (this.planImageFile) {
                const imageFile = await this.compressImageIfNeeded(this.planImageFile, {
                    maxWidth: 1800,
                    maxHeight: 1800,
                    quality: 0.88,
                    minSize: 260 * 1024,
                });
                fd.append('image', imageFile);
            }
            try {
                if (this.planEditorForm.id) {
                    await api.put('/admin/plans/' + this.planEditorForm.id, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                } else {
                    await api.post('/admin/plans', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                }
                this.closePlanEditor(true);
                await Promise.all([this.fetchAdminPlans(), this.fetchStorefront(), this.fetchAdminDashboard()]);
                this.toastMessage('套餐已保存。');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('plan', false);
            }
        },
        async deletePlan(plan) {
            if (!window.confirm('确认删除套餐 ' + plan.name + ' 吗？')) return;
            try {
                await api.delete('/admin/plans/' + plan.id);
                await Promise.all([this.fetchAdminPlans(), this.fetchStorefront(), this.fetchAdminDashboard()]);
                this.toastMessage('套餐已删除。');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
        },
        openDeviceEditor(device = null) {
            this.revokeObjectUrl(this.deviceEditorPreview);
            if (device) {
                this.deviceEditorForm = {
                    id: device.id,
                    name: device.name,
                    model: device.model,
                    category: device.category,
                    network_type: device.network_type,
                    price: device.price,
                    original_price: device.original_price,
                    stock: device.stock,
                    badge: device.badge,
                    short_description: device.short_description,
                    description: device.description,
                    features_text: linesToText(device.features),
                    tags_text: (device.tags || []).join(','),
                    compatible_plan_ids: [...(device.compatible_plan_ids || [])],
                    hot_rank: device.hot_rank,
                    sort_order: device.sort_order,
                    featured: device.featured,
                    status: device.status,
                };
                this.deviceEditorPreview = encodePath(device.cover_image || '');
            } else {
                this.deviceEditorForm = defaultDeviceEditor();
                this.deviceEditorPreview = '';
            }
            this.deviceImageFile = null;
            this.showDeviceEditor = true;
            this.rememberDeviceSnapshot();
        },
        closeDeviceEditor(force = false) {
            if (!force && !this.confirmDiscardSection(this.isDeviceEditorDirty, '设备编辑内容还没有保存，确认关闭吗？')) {
                return;
            }
            this.showDeviceEditor = false;
            this.deviceEditorForm = defaultDeviceEditor();
            this.deviceImageFile = null;
            this.revokeObjectUrl(this.deviceEditorPreview);
            this.deviceEditorPreview = '';
            this.rememberDeviceSnapshot();
        },
        onDeviceImageChange(event) {
            const selectedFile = event?.target?.files?.[0] || null;
            if (!selectedFile) {
                this.revokeObjectUrl(this.deviceEditorPreview);
                this.deviceImageFile = null;
                this.deviceEditorPreview = '';
                return;
            }
            const file = this.pickValidatedImage(event, '设备图片');
            if (!file) return;
            this.revokeObjectUrl(this.deviceEditorPreview);
            this.deviceImageFile = file;
            this.deviceEditorPreview = URL.createObjectURL(file);
        },
        async saveDevice() {
            if (this.savingStates.device) return;
            this.setSavingState('device', true);
            const fd = new FormData();
            Object.entries(this.deviceEditorForm).forEach(([key, value]) => {
                if (key === 'compatible_plan_ids') return;
                if (!key.endsWith('_text')) fd.append(key, value ?? '');
            });
            fd.append('features', this.deviceEditorForm.features_text);
            fd.append('tags', this.deviceEditorForm.tags_text);
            fd.append('compatible_plan_ids', (this.deviceEditorForm.compatible_plan_ids || []).join(','));
            if (this.deviceImageFile) {
                const imageFile = await this.compressImageIfNeeded(this.deviceImageFile, {
                    maxWidth: 1800,
                    maxHeight: 1800,
                    quality: 0.88,
                    minSize: 260 * 1024,
                });
                fd.append('image', imageFile);
            }
            try {
                if (this.deviceEditorForm.id) {
                    await api.put('/admin/devices/' + this.deviceEditorForm.id, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                } else {
                    await api.post('/admin/devices', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                }
                this.closeDeviceEditor(true);
                await Promise.all([this.fetchAdminDevices(), this.fetchStorefront(), this.fetchAdminDashboard()]);
                this.toastMessage('设备已保存。');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('device', false);
            }
        },
        async deleteDevice(device) {
            if (!window.confirm('确认删除设备 ' + device.name + ' 吗？')) return;
            try {
                await api.delete('/admin/devices/' + device.id);
                await Promise.all([this.fetchAdminDevices(), this.fetchStorefront(), this.fetchAdminDashboard()]);
                this.toastMessage('设备已删除。');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
        },
        async saveAdminOrder(order) {
            if (this.isOrderSaving(order.id)) return;
            this.setOrderSaving(order.id, true);
            try {
                await api.put('/admin/orders/' + order.id, {
                    status: order.status,
                    logistics_company: order.logistics_company,
                    merchant_tracking_number: order.merchant_tracking_number,
                    admin_note: order.admin_note,
                    internal_tags: this.splitTagsText(order.internal_tags_text),
                });
                await Promise.all([this.fetchAdminOrders(), this.fetchAdminDashboard(), this.fetchStorefront()]);
                this.toastMessage('订单处理结果已保存。');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setOrderSaving(order.id, false);
            }
        },
        setOrderStatus(order, status) {
            order.status = status;
        },
        onQrFileChange(event, type) {
            const selectedFile = event?.target?.files?.[0] || null;
            if (!selectedFile) {
                this.qrFiles[type] = null;
                return;
            }
            const file = this.pickValidatedImage(event, type === 'wechat' ? '微信收款码' : '支付宝收款码');
            if (!file) return;
            this.qrFiles[type] = file;
        },
        async uploadPaymentQrs() {
            if (!this.qrFiles.wechat && !this.qrFiles.alipay) return this.toastMessage('请至少选择一张收款码图片。');
            if (this.savingStates.uploadPaymentQrs) return;
            this.setSavingState('uploadPaymentQrs', true);
            const fd = new FormData();
            if (this.qrFiles.wechat) {
                const wechatSource = await this.cropPaymentQrImage(this.qrFiles.wechat);
                const wechatQr = await this.compressImageIfNeeded(wechatSource, {
                    maxWidth: 1200,
                    maxHeight: 1200,
                    quality: 0.92,
                    minSize: 120 * 1024,
                });
                fd.append('wechat_qr', wechatQr);
            }
            if (this.qrFiles.alipay) {
                const alipaySource = await this.cropPaymentQrImage(this.qrFiles.alipay);
                const alipayQr = await this.compressImageIfNeeded(alipaySource, {
                    maxWidth: 1200,
                    maxHeight: 1200,
                    quality: 0.92,
                    minSize: 120 * 1024,
                });
                fd.append('alipay_qr', alipayQr);
            }
            try {
                await api.post('/admin/settings/payment-qrs', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                this.qrFiles = { wechat: null, alipay: null };
                await Promise.all([this.fetchAdminSettings(), this.fetchStorefront()]);
                this.toastMessage('收款码上传成功。');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('uploadPaymentQrs', false);
            }
        },
        async saveSettings() {
            if (this.savingStates.settings) return;
            this.setSavingState('settings', true);
            try {
                const payload = {
                    ...this.adminSettingsForm,
                    buy_flow_steps: textToLines(this.adminSettingsForm.buy_flow_steps_text),
                    ship_flow_steps: textToLines(this.adminSettingsForm.ship_flow_steps_text),
                    ship_checklist: textToLines(this.adminSettingsForm.ship_checklist_text),
                    purchase_rules: textToLines(this.adminSettingsForm.purchase_rules_text),
                    faq_items: textToLines(this.adminSettingsForm.faq_items_text),
                    admin_note_templates: textToLines(this.adminSettingsForm.admin_note_templates_text),
                };
                await api.put('/admin/settings', payload);
                await Promise.all([this.fetchAdminSettings(), this.fetchStorefront()]);
                this.toastMessage('店铺设置已保存。');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('settings', false);
            }
        },
        async saveAdminAccount() {
            if (!this.adminAccountForm.username) {
                return this.toastMessage('请输入管理员账号。');
            }
            if (!this.adminAccountForm.current_password) {
                return this.toastMessage('请输入当前密码。');
            }
            if (this.adminAccountForm.new_password && this.adminAccountForm.new_password !== this.adminAccountForm.confirm_password) {
                return this.toastMessage('两次输入的新密码不一致。');
            }
            if (this.savingStates.account) return;
            this.setSavingState('account', true);
            try {
                const { data } = await api.put('/admin/account', {
                    username: this.adminAccountForm.username,
                    current_password: this.adminAccountForm.current_password,
                    new_password: this.adminAccountForm.new_password,
                });
                this.currentUser = data.user;
                this.adminAccountForm = {
                    username: data.user?.username || '',
                    current_password: '',
                    new_password: '',
                    confirm_password: '',
                };
                this.rememberAccountSnapshot();
                this.toastMessage('管理员账号设置已保存。');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('account', false);
            }
        },
    },
};

Vue.createApp(App).mount('#app');
