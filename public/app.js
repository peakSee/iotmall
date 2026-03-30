const assertBootDependency = (value, message) => {
    if (!value) {
        throw new Error(message);
    }
    return value;
};

assertBootDependency(window.Vue, 'Vue dependency failed to load. Please refresh and try again.');
assertBootDependency(window.axios, 'Axios dependency failed to load. Please refresh and try again.');
const appTools = assertBootDependency(window.AppTools, 'App tools failed to initialize. Please refresh and try again.');
const appState = assertBootDependency(window.AppState, 'App state failed to initialize. Please refresh and try again.');
const appTemplates = assertBootDependency(window.AppTemplates, 'App templates failed to initialize. Please refresh and try again.');

const {
    api,
    money,
    linesToText,
    textToLines,
    encodePath,
    placeholder,
    resolveTenantCode,
    getTenantToken,
    setTenantToken,
    clearTenantToken,
} = appTools;
const { defaultBuilder, defaultPlanEditor, defaultDeviceEditor, buildSettingsForm } = appState;
const { storefrontTemplate, adminTemplate, modalTemplate } = appTemplates;

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
                logistics: {},
            },
            plans: [],
            devices: [],
            currentTenant: {
                id: 1,
                code: resolveTenantCode(),
                name: '',
                status: 'active',
                expires_at: null,
                subscription_type: 'paid',
                subscription_name: '标准版',
                features: [],
                max_user_count: 0,
                max_order_count: 0,
                max_plan_count: 0,
                max_device_count: 0,
                primary_domain: '',
                domain_bindings: [],
                primary_admin_domain: '',
                admin_domain_bindings: [],
                limit_summary: null,
                unavailable_message: '',
            },
            currentUser: null,
            loginPhone: '',
            adminUsername: '',
            adminPassword: '',
            showLoginModal: false,
            showBuilder: false,
            showOrdersModal: false,
            showShipAddressPrompt: false,
            shipAddressPromptOrderNo: '',
            showTrackModal: false,
            activeTrackOrderId: null,
            showAdminTrackModal: false,
            activeAdminTrackOrderId: null,
            showAdminDeleteModal: false,
            adminDeleteOrderIds: [],
            adminBatchStatus: '',
            myOrders: [],
            myOrdersPollTimer: null,
            myOrderNoticeSnapshots: {},
            secretFieldVisibility: {
                admin_login_password: false,
                admin_account_current_password: false,
                admin_account_new_password: false,
                admin_account_confirm_password: false,
                tenant_admin_password: false,
                tenant_admin_password_confirm: false,
                team_member_password: false,
                team_member_password_confirm: false,
                logistics_authorization: false,
                logistics_sign_key: false,
            },
            orderProofFiles: {},
            builderForm: defaultBuilder(),
            builderPlanCarrierFilter: 'all',
            builderMobileStep: 1,
            storefrontPlanCarrierFilter: 'all',
            storefrontSelectedPlanId: null,
            isCompactMobile: false,
            compactViewportMediaQuery: null,
            showAllStorefrontBundles: false,
            showAllStorefrontDevices: false,
            paymentProofFile: null,
            paymentProofPreview: null,
            previewImageUrl: null,
            toast: { show: false, message: '' },
            toastTimer: null,
            savingStates: {
                login: false,
                submitOrder: false,
                adminRefresh: false,
                adminOrders: false,
                exportOrders: false,
                auditExport: false,
                settings: false,
                account: false,
                tenants: false,
                team: false,
                billing: false,
                plan: false,
                device: false,
                uploadPaymentQrs: false,
                batchOrders: false,
                deleteOrders: false,
                domainDiagnostics: false,
                diagnostics: false,
            },
            savingOrderIds: [],
            isAdminEntry: document.body?.dataset?.pageMode === 'admin' || window.location.pathname.startsWith('/admin'),
            isAdminView: false,
            adminTabs: [
                { value: 'dashboard', label: '数据概览' },
                { value: 'platform', label: '租户管理', platform_only: true },
                { value: 'plans', label: '套餐管理' },
                { value: 'devices', label: '设备管理' },
                { value: 'orders', label: '订单管理' },
                { value: 'logistics', label: '物流设置', required_feature: 'ems' },
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
                tenant: null,
                plan_count: 0,
                device_count: 0,
                order_count: 0,
                user_count: 0,
                total_revenue: 0,
                revenue_today: 0,
                revenue_7d: 0,
                revenue_30d: 0,
                avg_order_amount: 0,
                order_count_today: 0,
                order_count_7d: 0,
                order_count_30d: 0,
                pending_count: 0,
                buy_device_count: 0,
                ship_device_count: 0,
                status_counts: {},
                configuring_count: 0,
                ready_to_ship_count: 0,
                shipped_count: 0,
                completed_count: 0,
                cancelled_count: 0,
                low_stock_devices: [],
                ems_error_count: 0,
                ems_pending_label_count: 0,
                ems_pending_print_count: 0,
                ems_stale_track_count: 0,
                ems_consecutive_create_fail_count: 0,
                ems_consecutive_print_fail_count: 0,
                ems_consecutive_track_fail_count: 0,
                ems_consecutive_create_fail_orders: [],
                ems_consecutive_print_fail_orders: [],
                ems_consecutive_track_fail_orders: [],
                ems_auto_track_sync_fail_count: 0,
                ems_auto_track_sync_fail_orders: [],
                ems_problem_orders: [],
                ems_workflow_overview: {},
                daily_order_series: [],
                daily_revenue_series: [],
                top_plan_orders: [],
                top_device_orders: [],
                stale_payment_review_count: 0,
                stale_payment_review_orders: [],
                ready_to_ship_overdue_count: 0,
                ready_to_ship_overdue_orders: [],
                alerts: [],
                audit_count_today: 0,
                audit_error_count_today: 0,
                recent_audit_logs: [],
            },
            adminPlans: [],
            adminDevices: [],
            adminOrders: [],
            adminAuditLogs: [],
            adminAuditSummary: {
                total_count: 0,
                today_count: 0,
                success_count: 0,
                error_count: 0,
                warning_count: 0,
                info_count: 0,
                latest_created_at: null,
                category_breakdown: [],
            },
            auditScopeOptions: [{ code: 'current', label: '当前租户' }],
            auditPagination: {
                page: 1,
                page_size: 20,
                total_count: 0,
                total_pages: 1,
                has_prev: false,
                has_next: false,
                from_index: 0,
                to_index: 0,
            },
            auditPageSizeOptions: [10, 20, 50, 100],
            auditCategoryOptions: [],
            auditLogFilters: {
                q: '',
                category: 'all',
                status: 'all',
                scope: 'current',
                date_from: '',
                date_to: '',
            },
            adminLastRefreshedAt: null,
            adminOrdersLastFetchedAt: null,
            adminAuditLastFetchedAt: null,
            currentTenantDomainDiagnostics: null,
            tenantDomainDiagnosticsMap: {},
            tenantDomainDiagnosticsLoadingIds: [],
            platformTenants: [],
            adminTeamMembers: [],
            teamRoleOptions: [],
            teamSummary: {
                total_count: 0,
                active_count: 0,
                disabled_count: 0,
                role_breakdown: [],
            },
            showTeamEditor: false,
            teamEditorForm: {
                id: null,
                username: '',
                nickname: '',
                phone: '',
                role: 'staff_service',
                status: 'active',
                permissions: [],
                password: '',
                password_confirm: '',
            },
            teamSnapshot: JSON.stringify({
                id: null,
                username: '',
                nickname: '',
                phone: '',
                role: 'staff_service',
                status: 'active',
                permissions: [],
                password: '',
                password_confirm: '',
            }),
            platformBillingRecords: [],
            platformBillingTenants: [],
            showBillingEditor: false,
            billingEditorForm: {
                tenant_id: '',
                kind: 'renewal',
                subscription_name: '',
                amount: 0,
                duration_days: 30,
                max_user_count: '',
                max_order_count: '',
                max_plan_count: '',
                max_device_count: '',
                features: [],
                auto_suspend_on_expiry: true,
                note: '',
                apply_now: true,
            },
            billingSnapshot: JSON.stringify({
                tenant_id: '',
                kind: 'renewal',
                subscription_name: '',
                amount: 0,
                duration_days: 30,
                max_user_count: '',
                max_order_count: '',
                max_plan_count: '',
                max_device_count: '',
                features: [],
                auto_suspend_on_expiry: true,
                note: '',
                apply_now: true,
            }),
            platformTenantStats: {
                total_count: 0,
                active_count: 0,
                expiring_soon_count: 0,
                expired_count: 0,
                suspended_count: 0,
                config_warning_count: 0,
                healthy_count: 0,
            },
            showTenantEditor: false,
            tenantEditorForm: {
                id: null,
                code: '',
                name: '',
                status: 'active',
                expires_at: '',
                subscription_name: '标准版',
                max_user_count: 0,
                max_order_count: 0,
                max_plan_count: 0,
                max_device_count: 0,
                subscription_type: 'paid',
                auto_suspend_on_expiry: true,
                primary_domain: '',
                domain_bindings_text: '',
                primary_admin_domain: '',
                admin_domain_bindings_text: '',
                features: ['storefront', 'orders', 'ems', 'printing', 'tracking', 'batch', 'analytics'],
                contact_name: '',
                contact_phone: '',
                note: '',
                admin_username: '',
                admin_nickname: '',
                admin_phone: '',
                admin_password: '',
                admin_password_confirm: '',
            },
            tenantSnapshot: JSON.stringify({
                id: null,
                code: '',
                name: '',
                status: 'active',
                expires_at: '',
                subscription_name: '标准版',
                max_user_count: 0,
                max_order_count: 0,
                max_plan_count: 0,
                max_device_count: 0,
                subscription_type: 'paid',
                auto_suspend_on_expiry: true,
                primary_domain: '',
                domain_bindings_text: '',
                primary_admin_domain: '',
                admin_domain_bindings_text: '',
                features: ['storefront', 'orders', 'ems', 'printing', 'tracking', 'batch', 'analytics'],
                contact_name: '',
                contact_phone: '',
                note: '',
                admin_username: '',
                admin_nickname: '',
                admin_phone: '',
                admin_password: '',
                admin_password_confirm: '',
            }),
            selectedAdminOrderIds: [],
            adminOrderExecutionStates: {},
            adminWorkflowPollTimer: null,
            adminEmsDiagnostics: null,
            adminOrderFilters: { q: '', status: 'pending_payment_review', flow_type: 'all', date_from: '', date_to: '' },
            adminSettingsForm: buildSettingsForm({
                payment_qrs: {},
                buy_flow_steps: [],
                ship_flow_steps: [],
                ship_checklist: [],
                purchase_rules: [],
                faq_items: [],
                admin_note_templates: [],
                logistics: {},
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
                    logistics: {},
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
            return Boolean(this.currentUser && this.currentUser.role && this.currentUser.role !== 'user');
        },
        isPlatformAdmin() {
            return this.currentUser?.role === 'platform_admin';
        },
        allAdminTabs() {
            return [
                { value: 'dashboard', label: '数据概览', required_permission: 'dashboard.view' },
                { value: 'site', label: '站点与授权', required_permission: 'dashboard.view' },
                { value: 'platform', label: '租户管理', platform_only: true, required_permission: 'platform.manage' },
                { value: 'billing', label: '计费授权', platform_only: true, required_permission: 'billing.manage' },
                { value: 'plans', label: '套餐管理', required_permission: 'catalog.manage' },
                { value: 'devices', label: '设备管理', required_permission: 'catalog.manage' },
                { value: 'orders', label: '订单管理', required_permission: 'orders.manage' },
                { value: 'logistics', label: '物流设置', required_feature: 'ems', required_permission: 'logistics.manage' },
                { value: 'audit', label: '操作日志', required_permission: 'dashboard.view' },
                { value: 'team', label: '团队管理', required_permission: 'team.manage' },
                { value: 'settings', label: '店铺设置', required_permission: 'tenant.settings' },
                { value: 'account', label: '账号安全', required_permission: 'account.manage' },
            ];
        },
        visibleAdminTabs() {
            return this.allAdminTabs.filter(
                (tab) =>
                    (!tab.platform_only || this.isPlatformAdmin) &&
                    (!tab.required_feature || this.tenantFeatureEnabled(tab.required_feature)) &&
                    (!tab.required_permission || this.adminPermissionEnabled(tab.required_permission)),
            );
        },
        currentAdminTabLabel() {
            return this.visibleAdminTabs.find((tab) => tab.value === this.adminTab)?.label || '后台';
        },
        adminOrderActiveFilterCount() {
            const filters = this.normalizeAdminOrderFilters();
            return [filters.q, filters.status !== 'all', filters.flow_type !== 'all', filters.date_from, filters.date_to].filter(Boolean).length;
        },
        auditLogActiveFilterCount() {
            const filters = this.normalizeAuditLogFilters();
            return [
                filters.q,
                filters.category !== 'all',
                filters.status !== 'all',
                filters.scope && filters.scope !== 'current',
                filters.date_from,
                filters.date_to,
            ].filter(Boolean).length;
        },
        selectedPlan() {
            return this.plans.find((item) => item.id === this.builderForm.plan_id) || null;
        },
        selectedDevice() {
            return this.devices.find((item) => item.id === this.builderForm.device_id) || null;
        },
        storefrontPlanCarrierOptions() {
            const carrierOrder = ['移动', '联通', '电信', '广电'];
            const counts = this.plans.reduce(
                (result, plan) => {
                    const carrier = this.normalizePlanCarrier(plan?.carrier);
                    if (carrier && result[carrier] !== undefined) {
                        result[carrier] += 1;
                    }
                    return result;
                },
                {
                    移动: 0,
                    联通: 0,
                    电信: 0,
                    广电: 0,
                },
            );
            return [
                {
                    code: 'all',
                    label: '全部',
                    count: this.plans.length,
                    disabled: !this.plans.length,
                },
                ...carrierOrder.map((carrier) => ({
                    code: carrier,
                    label: carrier,
                    count: counts[carrier] || 0,
                    disabled: !counts[carrier],
                })),
            ];
        },
        filteredStorefrontPlans() {
            if (this.storefrontPlanCarrierFilter === 'all') {
                return this.plans;
            }
            return this.plans.filter((plan) => this.normalizePlanCarrier(plan?.carrier) === this.storefrontPlanCarrierFilter);
        },
        storefrontSelectedPlan() {
            return this.filteredStorefrontPlans.find((item) => item.id === this.storefrontSelectedPlanId) || this.filteredStorefrontPlans[0] || null;
        },
        availablePlansForBuilder() {
            if (this.builderForm.flow_type !== 'buy_device' || !this.selectedDevice) {
                return this.plans;
            }
            const compatibleIds = Array.isArray(this.selectedDevice.compatible_plan_ids) ? this.selectedDevice.compatible_plan_ids : [];
            return this.plans.filter((plan) => compatibleIds.includes(plan.id));
        },
        builderPlanCarrierOptions() {
            const carrierOrder = ['移动', '联通', '电信', '广电'];
            const counts = this.availablePlansForBuilder.reduce(
                (result, plan) => {
                    const carrier = this.normalizePlanCarrier(plan?.carrier);
                    if (carrier && result[carrier] !== undefined) {
                        result[carrier] += 1;
                    }
                    return result;
                },
                {
                    移动: 0,
                    联通: 0,
                    电信: 0,
                    广电: 0,
                },
            );
            return [
                {
                    code: 'all',
                    label: '全部',
                    count: this.availablePlansForBuilder.length,
                    disabled: !this.availablePlansForBuilder.length,
                },
                ...carrierOrder.map((carrier) => ({
                    code: carrier,
                    label: carrier,
                    count: counts[carrier] || 0,
                    disabled: !counts[carrier],
                })),
            ];
        },
        filteredAvailablePlansForBuilder() {
            if (this.builderPlanCarrierFilter === 'all') {
                return this.availablePlansForBuilder;
            }
            return this.availablePlansForBuilder.filter(
                (plan) => this.normalizePlanCarrier(plan?.carrier) === this.builderPlanCarrierFilter,
            );
        },
        activePaymentQr() {
            return this.builderForm.payment_method === 'alipay' ? this.settings.payment_qrs?.alipay : this.settings.payment_qrs?.wechat;
        },
        orderTotal() {
            const deviceAmount =
                this.builderForm.flow_type === 'buy_device' && this.selectedDevice
                    ? Number(this.selectedDevice.price || 0) * Number(this.builderForm.quantity || 1)
                    : 0;
            const serviceAmount = this.builderForm.flow_type === 'ship_device' ? Number(this.settings.ship_service_fee || 0) : 0;
            return Number((deviceAmount + serviceAmount).toFixed(2));
        },
        builderStepItems() {
            const definitions = this.builderStepDefinitions();
            const currentStep = Math.min(Math.max(1, Number(this.builderMobileStep || 1)), definitions.length || 1);

            return definitions.map((item, index) => {
                const stepNumber = index + 1;
                const complete = this.builderStepCompleted(item.key);
                let state = 'muted';
                if (stepNumber === currentStep) {
                    state = 'active';
                } else if (stepNumber < currentStep || complete) {
                    state = 'done';
                }
                return {
                    ...item,
                    index: stepNumber,
                    complete,
                    state,
                };
            });
        },
        builderStepCount() {
            return this.builderStepItems.length || 1;
        },
        builderCurrentStepKey() {
            return this.builderStepItems[this.builderMobileStep - 1]?.key || this.builderStepItems[0]?.key || 'contact';
        },
        builderCurrentStepLabel() {
            return this.builderStepItems[this.builderMobileStep - 1]?.label || this.builderStepItems[0]?.label || '填写信息';
        },
        builderMobilePrimaryActionText() {
            if (this.builderMobileStep >= this.builderStepCount) {
                return this.savingStates.submitOrder ? '提交中...' : '提交订单';
            }
            const nextStep = this.builderStepItems[this.builderMobileStep];
            return nextStep ? `下一步：${nextStep.label}` : '下一步';
        },
        builderMobileBackActionText() {
            return this.builderMobileStep > 1 ? '上一步' : '关闭';
        },
        featuredBundles() {
            const hotDevices = [...this.devices]
                .filter((device) => device.stock > 0)
                .sort((a, b) => Number(b.featured) - Number(a.featured) || b.hot_rank - a.hot_rank || a.sort_order - b.sort_order)
                .slice(0, 4);

            return hotDevices
                .map((device) => {
                    const compatibleIds = this.getCompatiblePlanIds(device);
                    const candidatePlans = this.plans.filter((plan) => compatibleIds.includes(plan.id));
                    const plan = [...candidatePlans].sort(
                        (a, b) => Number(b.featured) - Number(a.featured) || b.hot_rank - a.hot_rank || a.sort_order - b.sort_order,
                    )[0];
                    if (!plan) return null;
                    return {
                        key: `${device.id}-${plan.id}`,
                        device,
                        plan,
                        description: device.name + ' 常被搭配 ' + plan.name + ' 下单，适合想直接一步买好设备和套餐的用户',
                    };
                })
                .filter(Boolean);
        },
        visibleStorefrontBundles() {
            if (!this.isCompactMobile || this.showAllStorefrontBundles) {
                return this.featuredBundles;
            }
            return this.featuredBundles.slice(0, 2);
        },
        hasMoreStorefrontBundles() {
            return this.isCompactMobile && this.featuredBundles.length > this.visibleStorefrontBundles.length;
        },
        visibleStorefrontDevices() {
            if (!this.isCompactMobile || this.showAllStorefrontDevices) {
                return this.devices;
            }
            return this.devices.slice(0, 3);
        },
        hasMoreStorefrontDevices() {
            return this.isCompactMobile && this.devices.length > this.visibleStorefrontDevices.length;
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
        myOrdersUnreadNoticeCount() {
            return this.myOrders.reduce((total, order) => total + this.userOrderUnreadNoticeCount(order), 0);
        },
        myOrderReminderCenterItems() {
            return this.myOrders
                .flatMap((order) =>
                    this.userOrderNoticeHistory(order).map((notice) => ({
                        ...notice,
                        order_id: order.id,
                        order_no: order.order_no,
                    })),
                )
                .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())
                .slice(0, 12);
        },
        myOrderReminderSummary() {
            const latestNotice = this.myOrderReminderCenterItems[0];

            return {
                orderCount: this.myOrders.filter((order) => this.userOrderUnreadNoticeCount(order) > 0).length,
                noticeCount: this.myOrdersUnreadNoticeCount,
                latestTime: latestNotice?.created_at || null,
            };
        },
        activeTrackModalOrder() {
            return this.myOrders.find((order) => order.id === this.activeTrackOrderId) || null;
        },
        activeAdminTrackModalOrder() {
            return this.adminOrders.find((order) => order.id === this.activeAdminTrackOrderId) || null;
        },
        adminDeleteOrders() {
            return this.adminDeleteOrderIds
                .map((orderId) => this.adminOrders.find((order) => order.id === orderId) || null)
                .filter(Boolean);
        },
        adminDeleteSummary() {
            return this.adminDeleteOrders.reduce(
                (summary, order) => {
                    summary.total += 1;
                    if (order.payment_proof) summary.paymentProofs += 1;
                    if (order?.ems?.label_file) summary.labels += 1;
                    if (order.flow_type === 'buy_device' && order.device_id && order.status !== 'cancelled') {
                        summary.stockRestoreCount += Number(order.quantity || 1);
                    }
                    return summary;
                },
                {
                    total: 0,
                    paymentProofs: 0,
                    labels: 0,
                    stockRestoreCount: 0,
                },
            );
        },
        adminNoteTemplates() {
            return (this.settings.admin_note_templates || []).filter(Boolean);
        },
        teamPermissionOptions() {
            const fallbackCodes = [
                'dashboard.view',
                'catalog.manage',
                'orders.manage',
                'logistics.manage',
                'tenant.settings',
                'account.manage',
                'team.manage',
            ];
            const orderMap = new Map(fallbackCodes.map((code, index) => [code, index]));
            const options = new Map();
            const rolePermissionCodes = this.teamRoleOptions.flatMap((role) => (Array.isArray(role.permissions) ? role.permissions : []));
            const seedCodes = rolePermissionCodes.length ? rolePermissionCodes : fallbackCodes;

            seedCodes.forEach((code) => {
                if (!code) return;
                options.set(code, {
                    code,
                    label: this.permissionLabel(code),
                    description: this.permissionDescription(code),
                });
            });

            this.teamRoleOptions.forEach((role) => {
                (role.permission_labels || []).forEach((permission) => {
                    const code = permission?.code || '';
                    if (!code) return;
                    options.set(code, {
                        code,
                        label: this.permissionLabel(permission),
                        description: this.permissionDescription(permission),
                    });
                });
            });

            return Array.from(options.values()).sort((left, right) => {
                const leftOrder = orderMap.has(left.code) ? orderMap.get(left.code) : Number.MAX_SAFE_INTEGER;
                const rightOrder = orderMap.has(right.code) ? orderMap.get(right.code) : Number.MAX_SAFE_INTEGER;
                return leftOrder - rightOrder || left.code.localeCompare(right.code, 'zh-CN');
            });
        },
        tenantFeatureOptions() {
            return this.buildTenantFeatureOptions(this.tenantEditorForm.features);
        },
        billingFeatureOptions() {
            return this.buildTenantFeatureOptions(this.billingEditorForm.features);
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
        isTenantEditorDirty() {
            return this.serializeSnapshot(this.buildTenantComparable()) !== this.tenantSnapshot;
        },
        isTeamEditorDirty() {
            return this.showTeamEditor && this.serializeSnapshot(this.buildTeamComparable()) !== this.teamSnapshot;
        },
        isBillingEditorDirty() {
            return this.showBillingEditor && this.serializeSnapshot(this.buildBillingComparable()) !== this.billingSnapshot;
        },
        hasUnsavedChanges() {
            return (
                this.isPlanEditorDirty ||
                this.isDeviceEditorDirty ||
                this.isAdminSettingsDirty ||
                this.isAdminAccountDirty ||
                this.isTenantEditorDirty ||
                this.isTeamEditorDirty ||
                this.isBillingEditorDirty
            );
        },
    },
    watch: {
        showOrdersModal() {
            if (!this.showOrdersModal) {
                this.showTrackModal = false;
                this.activeTrackOrderId = null;
            }
            this.syncMyOrdersPolling();
        },
        currentUser(value) {
            if (!value) {
                this.myOrderNoticeSnapshots = {};
            }
            this.syncMyOrdersPolling();
        },
        adminTab() {
            this.persistAdminUiState();
        },
        adminOrderFilters: {
            deep: true,
            handler() {
                this.persistAdminUiState();
            },
        },
        auditLogFilters: {
            deep: true,
            handler() {
                this.persistAdminUiState();
            },
        },
        'auditPagination.page_size'() {
            this.persistAdminUiState();
        },
    },
    mounted() {
        this.registerImageFallbacks();
        this.registerViewportMode();
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
        if (this.compactViewportMediaQuery && this.handleCompactViewportChange) {
            const mediaQuery = this.compactViewportMediaQuery;
            if (typeof mediaQuery.removeEventListener === 'function') {
                mediaQuery.removeEventListener('change', this.handleCompactViewportChange);
            } else if (typeof mediaQuery.removeListener === 'function') {
                mediaQuery.removeListener(this.handleCompactViewportChange);
            }
        }
        if (this.adminWorkflowPollTimer) {
            clearInterval(this.adminWorkflowPollTimer);
            this.adminWorkflowPollTimer = null;
        }
        if (this.myOrdersPollTimer) {
            clearInterval(this.myOrdersPollTimer);
            this.myOrdersPollTimer = null;
        }
    },
    methods: {
        currency: money,
        placeholder,
        registerViewportMode() {
            if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
                return;
            }

            const mediaQuery = window.matchMedia('(max-width: 720px)');
            this.compactViewportMediaQuery = mediaQuery;
            this.handleCompactViewportChange = (event) => {
                this.syncViewportMode(Boolean(event?.matches));
            };
            this.syncViewportMode(mediaQuery.matches);

            if (typeof mediaQuery.addEventListener === 'function') {
                mediaQuery.addEventListener('change', this.handleCompactViewportChange);
            } else if (typeof mediaQuery.addListener === 'function') {
                mediaQuery.addListener(this.handleCompactViewportChange);
            }
        },
        syncViewportMode(isCompact = false) {
            const nextCompact = Boolean(isCompact);
            if (this.isCompactMobile === nextCompact) {
                return;
            }
            this.isCompactMobile = nextCompact;
            if (!nextCompact) {
                this.showAllStorefrontBundles = false;
                this.showAllStorefrontDevices = false;
                this.builderMobileStep = 1;
                return;
            }
            this.syncBuilderMobileStep();
        },
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
        secretFieldDefaults() {
            return {
                admin_login_password: false,
                admin_account_current_password: false,
                admin_account_new_password: false,
                admin_account_confirm_password: false,
                tenant_admin_password: false,
                tenant_admin_password_confirm: false,
                team_member_password: false,
                team_member_password_confirm: false,
                logistics_authorization: false,
                logistics_sign_key: false,
            };
        },
        isSecretFieldVisible(key) {
            return Boolean(this.secretFieldVisibility?.[key]);
        },
        secretInputType(key) {
            return this.isSecretFieldVisible(key) ? 'text' : 'password';
        },
        toggleSecretField(key) {
            this.secretFieldVisibility = {
                ...this.secretFieldVisibility,
                [key]: !this.isSecretFieldVisible(key),
            };
        },
        resetSecretFieldVisibility(keys = []) {
            const defaults = this.secretFieldDefaults();
            if (!Array.isArray(keys) || !keys.length) {
                this.secretFieldVisibility = defaults;
                return;
            }
            const nextState = { ...this.secretFieldVisibility };
            keys.forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(defaults, key)) {
                    nextState[key] = defaults[key];
                }
            });
            this.secretFieldVisibility = nextState;
        },
        adminPermissionEnabled(permissionCode, permissions = null) {
            const target = String(permissionCode || '').trim().toLowerCase();
            if (!target) return true;
            const source = Array.isArray(permissions) ? permissions : Array.isArray(this.currentUser?.permissions) ? this.currentUser.permissions : [];
            const list = source.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
            if (!list.length) return false;
            if (list.includes(target) || list.includes('*')) return true;
            const [namespace] = target.split('.');
            if (namespace && list.includes(namespace + '.*')) return true;
            if (target.endsWith('.view') && list.includes(target.replace(/\.view$/, '.manage'))) return true;
            return false;
        },
        tenantFeatureEnabled(featureCode, tenant = null) {
            const target = String(featureCode || '').trim().toLowerCase();
            if (!target) return true;
            const featureList = Array.isArray(tenant?.features)
                ? tenant.features
                : Array.isArray(this.currentTenant?.features)
                  ? this.currentTenant.features
                  : [];
            if (!featureList.length) {
                return true;
            }
            return featureList.map((item) => String(item || '').trim().toLowerCase()).includes(target);
        },
        tenantFeatureLabels(features = []) {
            const labels = {
                storefront: '前台下单',
                orders: '订单管理',
                ems: 'EMS面单',
                printing: '自动打印',
                tracking: '轨迹同步',
                batch: '批量处理',
                analytics: '经营分析',
            };
            const list = Array.isArray(features) ? features : [];
            if (!list.length) {
                return ['全部功能'];
            }
            return list.map((item) => labels[item] || item);
        },
        tenantFeatureCatalog() {
            return {
                storefront: {
                    code: 'storefront',
                    icon: '[S]',
                    label: '前台下单',
                    description: '支持用户在前台浏览套餐、选择设备并直接提交订单。',
                },
                orders: {
                    code: 'orders',
                    icon: '[O]',
                    label: '订单管理',
                    description: '支持后台查看订单、改状态、写备注并跟进发货流程。',
                },
                ems: {
                    code: 'ems',
                    icon: '[E]',
                    label: 'EMS 面单',
                    description: '支持对接 EMS 协议客户接口，自动建单并获取电子面单。',
                },
                printing: {
                    code: 'printing',
                    icon: '[P]',
                    label: '自动打印',
                    description: '支持本地打印链路，拿到面单后可直接自动打印。',
                },
                tracking: {
                    code: 'tracking',
                    icon: '[T]',
                    label: '轨迹同步',
                    description: '支持查询物流轨迹，并按计划自动同步最新状态。',
                },
                batch: {
                    code: 'batch',
                    icon: '[B]',
                    label: '批量处理',
                    description: '支持批量建单、批量取面单、批量打印和批量同步轨迹。',
                },
                analytics: {
                    code: 'analytics',
                    icon: '[A]',
                    label: '经营分析',
                    description: '支持查看订单、收入、告警和经营概览等数据。',
                },
            };
        },
        tenantFeatureItems(features = []) {
            const catalog = this.tenantFeatureCatalog();
            const list = Array.isArray(features) ? features : [];
            if (!list.length) {
                return [
                    {
                        code: 'all',
                        icon: '[ALL]',
                        label: '全部功能',
                        description: '当前租户未单独限制授权功能，默认可使用完整的前台和后台能力。',
                    },
                ];
            }
            return list.map((item) => {
                const code = String(item || '').trim();
                return (
                    catalog[code] || {
                        code,
                        icon: '[+]',
                        label: code || '自定义功能',
                        description: '已开通该自定义授权功能。',
                    }
                );
            });
        },
        tenantFeatureTooltip(feature = null) {
            if (!feature) return '';
            return [feature.label, feature.description].filter(Boolean).join(' - ');
        },
        buildTenantFeatureOptions(extraFeatures = []) {
            const catalog = this.tenantFeatureCatalog();
            const knownCodes = Object.keys(catalog);
            const extraCodes = Array.from(new Set((Array.isArray(extraFeatures) ? extraFeatures : []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))).filter(
                (code) => !knownCodes.includes(code),
            );
            return [...knownCodes, ...extraCodes].map(
                (code) =>
                    catalog[code] || {
                        code,
                        icon: '[+]',
                        label: code || '自定义功能',
                        description: '已开通该自定义授权功能。',
                    },
            );
        },
        normalizeTenantFeatureSelection(features = [], fallbackValue = []) {
            const source = Array.isArray(features) && features.length ? features : Array.isArray(fallbackValue) ? fallbackValue : [];
            const orderMap = new Map(this.buildTenantFeatureOptions(source).map((item, index) => [item.code, index]));
            return Array.from(new Set(source.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))).sort((left, right) => {
                const leftOrder = orderMap.has(left) ? orderMap.get(left) : Number.MAX_SAFE_INTEGER;
                const rightOrder = orderMap.has(right) ? orderMap.get(right) : Number.MAX_SAFE_INTEGER;
                return leftOrder - rightOrder || left.localeCompare(right, 'zh-CN');
            });
        },
        resetTenantFeaturesToDefault() {
            this.tenantEditorForm.features = this.normalizeTenantFeatureSelection(Object.keys(this.tenantFeatureCatalog()));
        },
        resetBillingFeaturesToDefault() {
            this.billingEditorForm.features = this.normalizeTenantFeatureSelection(Object.keys(this.tenantFeatureCatalog()));
        },
        clearBillingFeatureOverride() {
            this.billingEditorForm.features = [];
        },
        billingKindLabel(kind = '') {
            const labels = {
                renewal: '续费',
                trial: '试用',
                manual_adjustment: '手工调整',
                license_order: '授权订单',
            };
            return labels[String(kind || '').trim()] || kind || '未命名';
        },
        billingStatusLabel(status = '') {
            const labels = {
                pending: '待应用',
                applied: '已应用',
                cancelled: '已取消',
                failed: '失败',
            };
            return labels[String(status || '').trim()] || status || '未命名';
        },
        tenantDomainCollections(tenant = null) {
            const target = tenant || {};
            const storefront = Array.from(
                new Set([target?.primary_domain, ...(Array.isArray(target?.domain_bindings) ? target.domain_bindings : [])].filter(Boolean)),
            );
            const admin = Array.from(
                new Set([target?.primary_admin_domain, ...(Array.isArray(target?.admin_domain_bindings) ? target.admin_domain_bindings : [])].filter(Boolean)),
            );
            return {
                storefront,
                admin,
                all: Array.from(new Set([...storefront, ...admin])),
            };
        },
        tenantDomainSummaryText(tenant = null) {
            const domains = this.tenantDomainCollections(tenant);
            if (!domains.all.length) {
                return '当前还没有绑定独立域名，默认使用系统路径访问。';
            }
            const parts = [];
            if (domains.storefront.length) {
                parts.push(`前台 ${domains.storefront.join(' / ')}`);
            }
            if (domains.admin.length) {
                parts.push(`后台 ${domains.admin.join(' / ')}`);
            }
            return parts.join(' / ');
        },
        tenantSenderSummaryText(tenant = null) {
            const target = tenant || {};
            const parts = [target?.sender_name, target?.sender_phone].filter(Boolean);
            if (!parts.length) {
                return '当前还没有补齐寄件人姓名和电话。';
            }
            return parts.join(' / ');
        },
        tenantConfigHealthItems(tenant = null) {
            const list = Array.isArray(tenant?.config_health?.items) ? tenant.config_health.items : [];
            return list.map((item) => ({
                ...item,
                status_label: item?.ok ? '已完成' : '待完善',
                value_text: this.tenantConfigHealthValueText(item, tenant),
            }));
        },
        tenantConfigMissingItems(tenant = null) {
            return this.tenantConfigHealthItems(tenant).filter((item) => !item.ok);
        },
        tenantConfigHealthValueText(item = {}, tenant = null) {
            const key = String(item?.key || '').trim();
            const target = tenant || {};
            if (key === 'domains') {
                return this.tenantDomainSummaryText(target) || item?.hint || '可为租户绑定前台或后台独立域名。';
            }
            if (key === 'sender_profile') {
                const senderSummary = this.tenantSenderSummaryText(target);
                if (target?.sender_address) {
                    return `${senderSummary} / ${target.sender_address}`;
                }
                return senderSummary || item?.hint || '请先配置寄件人姓名、电话和地址。';
            }
            if (key === 'admin') {
                return target?.admin_username ? `主管理员：${target.admin_username}` : item?.hint || '建议至少保留一个启用中的主管理员账号。';
            }
            if (item?.ok) {
                return item?.hint || '已完成该项配置。';
            }
            return item?.hint || '请尽快补齐该项配置。';
        },
        isTenantDomainDiagnosticsLoading(tenantId = 0) {
            return this.tenantDomainDiagnosticsLoadingIds.includes(Number(tenantId) || 0);
        },
        setTenantDomainDiagnosticsLoading(tenantId = 0, active = false) {
            const id = Number(tenantId) || 0;
            if (!id) return;
            if (active) {
                if (!this.tenantDomainDiagnosticsLoadingIds.includes(id)) {
                    this.tenantDomainDiagnosticsLoadingIds = [...this.tenantDomainDiagnosticsLoadingIds, id];
                }
                return;
            }
            this.tenantDomainDiagnosticsLoadingIds = this.tenantDomainDiagnosticsLoadingIds.filter((item) => item !== id);
        },
        tenantDomainDiagnosticsFor(tenant = null) {
            const tenantId = Number(tenant?.id || 0);
            if (!tenantId) return null;
            return this.tenantDomainDiagnosticsMap[tenantId] || null;
        },
        domainDiagnosticTone(check = {}) {
            const tone = String(check?.tone || '').trim();
            if (['success', 'warning', 'danger', 'muted'].includes(tone)) {
                return tone;
            }
            return 'muted';
        },
        domainDiagnosticStatusText(check = {}) {
            const tone = this.domainDiagnosticTone(check);
            if (tone === 'success') return '正常';
            if (tone === 'warning') return '待处理';
            if (tone === 'danger') return '异常';
            return '未配置';
        },
        async fetchCurrentTenantDomainDiagnostics() {
            if (!this.adminPermissionEnabled('dashboard.view') || this.savingStates.domainDiagnostics) return;
            this.setSavingState('domainDiagnostics', true);
            try {
                const { data } = await api.get('/admin/domain-diagnostics');
                this.currentTenantDomainDiagnostics = data;
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('domainDiagnostics', false);
            }
        },
        async fetchTenantDomainDiagnostics(tenant = null) {
            const tenantId = Number(tenant?.id || 0);
            if (!tenantId || !this.isPlatformAdmin || !this.adminPermissionEnabled('platform.manage')) return;
            if (this.isTenantDomainDiagnosticsLoading(tenantId)) return;
            this.setTenantDomainDiagnosticsLoading(tenantId, true);
            try {
                const { data } = await api.get(`/admin/platform/tenants/${tenantId}/domain-diagnostics`);
                this.tenantDomainDiagnosticsMap = {
                    ...this.tenantDomainDiagnosticsMap,
                    [tenantId]: data,
                };
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setTenantDomainDiagnosticsLoading(tenantId, false);
            }
        },
        tenantLimitText(item) {
            if (!item) return '未设置';
            if (item.unlimited) return `${item.used} / 不限`;
            return `${item.used} / ${item.limit}`;
        },
        tenantExpiryText(tenant = null) {
            const target = tenant || this.currentTenant || {};
            if (!target?.expires_at) {
                return '长期有效';
            }
            const days = Number(target.expiring_in_days);
            if (!Number.isFinite(days)) {
                return `到期 ${target.expires_at}`;
            }
            if (days < 0) {
                return `已到期 ${Math.abs(days)} 天`;
            }
            if (days === 0) {
                return '今天到期';
            }
            return `${days} 天后到期`;
        },
        permissionLabel(permission) {
            const code = typeof permission === 'string' ? permission : permission?.code || '';
            const labels = {
                'dashboard.view': '查看概览',
                'catalog.manage': '管理商品',
                'orders.manage': '管理订单',
                'logistics.manage': '管理物流',
                'tenant.settings': '店铺设置',
                'account.manage': '账号安全',
                'team.manage': '团队权限',
                'platform.manage': '平台租户',
                'billing.manage': '授权计费',
            };
            return typeof permission === 'object' && permission?.label ? permission.label : labels[code] || code || '未命名权限';
        },
        permissionDescription(permission) {
            if (typeof permission === 'object' && permission?.description) {
                return permission.description;
            }
            const descriptions = {
                'dashboard.view': '查看经营概览、告警和报表。',
                'catalog.manage': '维护套餐、设备和库存。',
                'orders.manage': '处理订单状态与付款审核。',
                'logistics.manage': '执行 EMS 建单、打印和轨迹同步。',
                'tenant.settings': '编辑当前租户的店铺配置。',
                'account.manage': '修改管理员账号与密码。',
                'team.manage': '创建团队成员并分配角色。',
                'platform.manage': '管理平台租户与域名绑定。',
                'billing.manage': '处理试用、续费和授权记录。',
            };
            const code = typeof permission === 'string' ? permission : permission?.code || '';
            return descriptions[code] || '';
        },
        normalizeTeamPermissionSelection(permissions = []) {
            const orderMap = new Map(this.teamPermissionOptions.map((item, index) => [item.code, index]));
            return Array.from(new Set((Array.isArray(permissions) ? permissions : []).map((item) => String(item || '').trim()).filter(Boolean))).sort((left, right) => {
                const leftOrder = orderMap.has(left) ? orderMap.get(left) : Number.MAX_SAFE_INTEGER;
                const rightOrder = orderMap.has(right) ? orderMap.get(right) : Number.MAX_SAFE_INTEGER;
                return leftOrder - rightOrder || left.localeCompare(right, 'zh-CN');
            });
        },
        resetTeamPermissionsToRole() {
            const matchedRole = this.teamRoleOptions.find((item) => item.code === this.teamEditorForm.role);
            this.teamEditorForm.permissions = this.normalizeTeamPermissionSelection(matchedRole?.permissions || []);
        },
        tenantConfigHealth(tenant = null) {
            return tenant?.config_health || this.adminDashboard?.tenant?.config_health || null;
        },
        tenantConfigHealthText(tenant = null) {
            const health = this.tenantConfigHealth(tenant);
            if (!health) return '未检测';
            return `${health.score || 0} 分 / ${health.completed_count || 0}/${health.total_count || 0}`;
        },
        tenantConfigHealthTone(tenant = null) {
            const health = this.tenantConfigHealth(tenant);
            if (!health) return 'muted';
            if ((health.missing_count || 0) >= 3) return 'danger';
            if ((health.missing_count || 0) > 0) return 'warning';
            return 'success';
        },
        dashboardSeriesMax(series = []) {
            const values = (Array.isArray(series) ? series : []).map((item) => Number(item?.value || 0));
            const maxValue = Math.max(...values, 0);
            return maxValue > 0 ? maxValue : 1;
        },
        dashboardBarStyle(item, maxValue) {
            const currentValue = Number(item?.value || 0);
            const percent = Math.max(6, Math.round((currentValue / Math.max(1, Number(maxValue) || 1)) * 100));
            return {
                width: `${Math.min(100, percent)}%`,
            };
        },
        orderLogisticsStage(order) {
            const stage = order?.logistics_stage || order?.order_structure?.logistics?.stage;
            if (stage?.label) {
                return stage;
            }
            if (!this.trackingNumber(order)) {
                return { code: 'pending_waybill', label: '待出单', tone: 'muted', description: '商家还未生成物流单号。' };
            }
            if (order?.ems?.printed_at) {
                return { code: 'printed', label: '已打印', tone: 'accent', description: '面单已打印，等待揽收或更新轨迹。' };
            }
            return { code: 'waybill_created', label: '已出单', tone: 'info', description: '物流单号已生成。' };
        },
        orderEmsSummaryItems(order) {
            const trackingNumber = this.trackingNumber(order);
            const stage = this.orderLogisticsStage(order);
            const nextAction = order?.ems_next_action || {};
            const printLabel = order?.ems?.printed_at ? '已打印' : order?.ems?.print_attempted_at ? '待确认' : '未打印';
            const printTone = order?.ems?.printed_at ? 'success' : order?.ems?.print_attempted_at ? 'warning' : 'muted';

            return [
                { key: 'stage', label: '阶段', value: stage?.label || '待处理', tone: stage?.tone || 'muted' },
                { key: 'waybill', label: '单号', value: trackingNumber || '未生成', tone: trackingNumber ? 'success' : 'muted' },
                { key: 'print', label: '打印', value: printLabel, tone: printTone },
                {
                    key: 'track',
                    label: '轨迹',
                    value: this.formatTrackSyncAge(order?.ems?.last_track_sync_at),
                    tone: order?.ems?.last_track_sync_at ? 'info' : 'muted',
                },
                {
                    key: 'next',
                    label: '下一步',
                    value: nextAction?.label || (order?.ems?.last_error ? '处理异常' : '待处理'),
                    tone: order?.ems?.last_error ? 'danger' : nextAction?.label ? 'accent' : 'muted',
                },
            ];
        },
        orderNeedsPrintConfirmation(order) {
            return Boolean(order?.ems?.print_attempted_at && !order?.ems?.printed_at);
        },
        orderPrintConfirmationHint(order) {
            if (!order) return '面单发起打印后，请核对打印结果。';
            const printMessage = String(order?.ems?.print_message || '').trim();
            if (printMessage) {
                return printMessage;
            }
            if (order?.ems?.label_file) {
                return '当前订单已发起打印，但后台还未确认成功。你可以重新打开 PDF 面单核对，确认无误后点“确认已打印”。';
            }
            return '当前订单已发起打印，但后台还未确认成功，请核对打印机状态后再确认。';
        },
        trackQueryUrl(order) {
            const trackingNumber = this.trackingNumber(order);
            const template = String(this.settings?.logistics?.track_query_url_template || '').trim();
            if (!trackingNumber || !template) return '';
            return template
                .replace(/\{\{\s*tracking_number\s*\}\}/gi, encodeURIComponent(trackingNumber))
                .replace(/\{\s*tracking_number\s*\}/gi, encodeURIComponent(trackingNumber))
                .replace(/%tracking_number%/gi, encodeURIComponent(trackingNumber));
        },
        openTrackingQuery(order) {
            const url = this.trackQueryUrl(order);
            if (!url) {
                this.toastMessage('当前未配置官网查询地址模板');
                return;
            }
            window.open(url, '_blank', 'noopener');
        },
        alertSeverityText(alert = {}) {
            const severity = String(alert?.severity || '').trim();
            if (severity === 'danger') return '高优先级';
            if (severity === 'warning') return '需关注';
            return '提示';
        },
        auditStatusText(status = '') {
            const value = String(status || '').trim();
            if (value === 'error') return '失败';
            if (value === 'warning') return '告警';
            if (value === 'info') return '提示';
            return '成功';
        },
        auditCategoryText(log = {}) {
            return log?.category_label || log?.category || '其他';
        },
        auditTargetText(log = {}) {
            return log?.target_label || log?.target_key || log?.action || '未指定对象';
        },
        auditTenantText(log = {}) {
            return log?.target_tenant_name || log?.tenant_name || log?.target_tenant_code || log?.tenant_code || '当前租户';
        },
        async openAuditLogTarget(log = {}) {
            const targetType = String(log?.target_type || '').trim();
            if (targetType === 'order' && this.adminPermissionEnabled('orders.manage')) {
                this.adminOrderFilters.q = log?.target_key || '';
                this.adminOrderFilters.status = 'all';
                this.adminOrderFilters.flow_type = 'all';
                this.setAdminTab('orders');
                await this.fetchAdminOrders();
                return;
            }
            if (targetType === 'tenant' && this.isPlatformAdmin && this.adminPermissionEnabled('platform.manage')) {
                this.setAdminTab('platform');
                await this.fetchPlatformTenants();
                return;
            }
            if (targetType === 'billing_record' && this.isPlatformAdmin && this.adminPermissionEnabled('billing.manage')) {
                this.setAdminTab('billing');
                await this.fetchPlatformBillingRecords();
                return;
            }
            if (targetType === 'team_member' && this.adminPermissionEnabled('team.manage')) {
                this.setAdminTab('team');
                await this.fetchTeamMembers();
                return;
            }
            if (['store_settings', 'payment_qr'].includes(targetType) && this.adminPermissionEnabled('tenant.settings')) {
                this.setAdminTab('settings');
                return;
            }
            if (targetType === 'logistics_settings' && this.adminPermissionEnabled('logistics.manage')) {
                this.setAdminTab('logistics');
                return;
            }
            this.toastMessage('当前日志没有可直接跳转的目标页');
        },
        async openAdminOrderFromDashboard(problem = {}) {
            if (!this.adminPermissionEnabled('orders.manage')) {
                this.toastMessage('当前账号没有订单权限');
                return;
            }
            this.adminOrderFilters.q = String(problem?.order_no || problem?.waybill_no || problem?.customer_phone || '').trim();
            this.adminOrderFilters.status = 'all';
            this.adminOrderFilters.flow_type = 'all';
            this.setAdminTab('orders');
            await this.fetchAdminOrders();
        },
        topItemCaption(item = {}) {
            return `${item.order_count || 0} 单 / ${this.currency(item.revenue || 0)}`;
        },
        userTrackHeadline(order) {
            if (!this.trackingNumber(order)) return this.orderLogisticsStage(order).label || '待出单';
            const latest = this.latestTrackItem(order);
            return latest?.op_name || latest?.op_desc || this.orderLogisticsStage(order).label || '物流轨迹已更新';
        },
        userTrackDescription(order) {
            const stage = this.orderLogisticsStage(order);
            if (!this.trackingNumber(order)) return stage.description || '商家出单后会在这里展示 EMS 单号和最新轨迹。';
            if (order?.ems?.track_summary) return order.ems.track_summary;
            if (stage?.description) return stage.description;
            if (this.settings?.logistics?.auto_sync_tracks) return '后台会自动同步 EMS 轨迹，你也可以手动刷新。';
            return '可以复制单号、打开官网查询或手动刷新轨迹。';
        },
        buildSettingsComparable() {
            return {
                ...this.adminSettingsForm,
                payment_qrs: { ...(this.adminSettingsForm.payment_qrs || {}) },
                logistics: { ...(this.adminSettingsForm.logistics || {}) },
            };
        },
        buildAccountComparable() {
            return { ...this.adminAccountForm };
        },
        buildTenantComparable() {
            return {
                ...this.tenantEditorForm,
                features: this.normalizeTenantFeatureSelection(this.tenantEditorForm.features),
            };
        },
        buildTeamComparable() {
            return {
                ...this.teamEditorForm,
                permissions: this.normalizeTeamPermissionSelection(this.teamEditorForm.permissions),
            };
        },
        buildBillingComparable() {
            return {
                ...this.billingEditorForm,
                features: this.normalizeTenantFeatureSelection(this.billingEditorForm.features),
            };
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
        rememberTenantSnapshot() {
            this.tenantSnapshot = this.serializeSnapshot(this.buildTenantComparable());
        },
        rememberTeamSnapshot() {
            this.teamSnapshot = this.serializeSnapshot(this.buildTeamComparable());
        },
        rememberBillingSnapshot() {
            this.billingSnapshot = this.serializeSnapshot(this.buildBillingComparable());
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
        defaultAdminOrderFilters() {
            return { q: '', status: 'pending_payment_review', flow_type: 'all', date_from: '', date_to: '' };
        },
        safeLocalStorageGet(key) {
            if (!key || typeof window === 'undefined' || !window.localStorage) return null;
            try {
                return window.localStorage.getItem(key);
            } catch (error) {
                return null;
            }
        },
        safeLocalStorageSet(key, value) {
            if (!key || typeof window === 'undefined' || !window.localStorage) return;
            try {
                window.localStorage.setItem(key, value);
            } catch (error) {
                // Ignore quota and privacy-mode failures.
            }
        },
        storefrontLoginPhoneStorageKey() {
            const tenantCode = this.currentTenant?.code || resolveTenantCode() || 'default';
            return `iot-mall:storefront-login-phone:${tenantCode}`;
        },
        rememberStorefrontLoginPhone(phone = this.currentUser?.phone || this.loginPhone) {
            const normalizedPhone = String(phone || '').trim();
            if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) return '';
            this.safeLocalStorageSet(this.storefrontLoginPhoneStorageKey(), normalizedPhone);
            return normalizedPhone;
        },
        restoreStorefrontLoginPhone() {
            const currentPhone = String(this.currentUser?.phone || '').trim();
            if (/^1[3-9]\d{9}$/.test(currentPhone)) {
                this.loginPhone = currentPhone;
                this.rememberStorefrontLoginPhone(currentPhone);
                return currentPhone;
            }

            const savedPhone = String(this.safeLocalStorageGet(this.storefrontLoginPhoneStorageKey()) || '').trim();
            if (/^1[3-9]\d{9}$/.test(savedPhone)) {
                this.loginPhone = this.loginPhone || savedPhone;
                return savedPhone;
            }

            return '';
        },
        adminUiStateStorageKey() {
            const tenantCode = this.currentTenant?.code || resolveTenantCode() || 'default';
            const userId = this.currentUser?.id || this.currentUser?.username || 'guest';
            return `iot-mall:admin-ui:${tenantCode}:${userId}`;
        },
        persistAdminUiState() {
            if (!this.currentUser || !this.isAdmin) return;
            const payload = {
                adminTab: this.adminTab,
                adminOrderFilters: this.normalizeAdminOrderFilters(),
                auditLogFilters: this.normalizeAuditLogFilters(),
                auditPageSize: Number(this.auditPagination.page_size || 20),
            };
            this.safeLocalStorageSet(this.adminUiStateStorageKey(), JSON.stringify(payload));
        },
        restoreAdminUiState() {
            if (!this.currentUser || !this.isAdmin) return;
            const raw = this.safeLocalStorageGet(this.adminUiStateStorageKey());
            if (!raw) return;
            try {
                const payload = JSON.parse(raw) || {};
                if (typeof payload.adminTab === 'string' && payload.adminTab.trim()) {
                    this.adminTab = payload.adminTab.trim();
                }
                if (payload.adminOrderFilters && typeof payload.adminOrderFilters === 'object') {
                    this.adminOrderFilters = {
                        ...this.defaultAdminOrderFilters(),
                        ...payload.adminOrderFilters,
                    };
                }
                if (payload.auditLogFilters && typeof payload.auditLogFilters === 'object') {
                    this.auditLogFilters = {
                        ...this.auditLogFilters,
                        ...payload.auditLogFilters,
                    };
                }
                const nextPageSize = Number(payload.auditPageSize || this.auditPagination.page_size || 20);
                this.auditPagination.page_size = Number.isFinite(nextPageSize) && nextPageSize > 0 ? nextPageSize : 20;
            } catch (error) {
                // Ignore malformed saved UI state.
            }
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
        normalizeAuditLogFilters() {
            const nextFilters = { ...this.auditLogFilters };
            if (nextFilters.date_from && nextFilters.date_to && nextFilters.date_from > nextFilters.date_to) {
                [nextFilters.date_from, nextFilters.date_to] = [nextFilters.date_to, nextFilters.date_from];
                this.auditLogFilters.date_from = nextFilters.date_from;
                this.auditLogFilters.date_to = nextFilters.date_to;
            }
            return nextFilters;
        },
        queryAdminAuditLogs() {
            this.auditPagination.page = 1;
            return this.fetchAdminAuditLogs({ page: 1 });
        },
        resetAdminOrderFilters() {
            this.adminOrderFilters = this.defaultAdminOrderFilters();
            return this.fetchAdminOrders();
        },
        resetAuditLogFilters() {
            this.auditLogFilters = {
                q: '',
                category: 'all',
                status: 'all',
                scope: this.auditScopeOptions.some((item) => item.code === 'current')
                    ? 'current'
                    : this.auditScopeOptions[0]?.code || 'current',
                date_from: '',
                date_to: '',
            };
            this.auditPagination.page = 1;
            return this.fetchAdminAuditLogs({ page: 1 });
        },
        changeAuditLogPage(page) {
            const nextPage = Math.max(1, Number(page) || 1);
            if (nextPage === this.auditPagination.page) {
                return Promise.resolve();
            }
            this.auditPagination.page = nextPage;
            return this.fetchAdminAuditLogs({ page: nextPage });
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
            const targetTab = this.allAdminTabs.find((tab) => tab.value === nextTab);
            if (targetTab?.required_feature && !this.tenantFeatureEnabled(targetTab.required_feature)) {
                this.toastMessage('当前租户未开通该功能');
                return;
            }
            if (targetTab?.required_permission && !this.adminPermissionEnabled(targetTab.required_permission)) {
                this.toastMessage('当前账号没有该页面权限');
                return;
            }
            if (
                ['settings', 'logistics', 'account'].includes(this.adminTab) &&
                !this.confirmDiscardSection(
                    this.isAdminSettingsDirty || this.isAdminAccountDirty,
                    '店铺设置或账号安全有未保存的修改，确认切换标签吗',
                )
            ) {
                return;
            }
            if (this.adminTab === 'platform' && !this.confirmDiscardSection(this.isTenantEditorDirty, '租户编辑内容还没有保存，确认切换标签吗？')) {
                return;
            }
            if (this.adminTab === 'team' && !this.confirmDiscardSection(this.isTeamEditorDirty, '团队成员编辑内容还没有保存，确认切换标签吗？')) {
                return;
            }
            if (this.adminTab === 'billing' && !this.confirmDiscardSection(this.isBillingEditorDirty, '计费记录表单还没有保存，确认切换标签吗？')) {
                return;
            }
            this.adminTab = nextTab;
            if (nextTab === 'site' && this.adminPermissionEnabled('dashboard.view')) {
                this.fetchCurrentTenantDomainDiagnostics();
            }
            if (nextTab === 'logistics' && this.tenantFeatureEnabled('ems') && !this.adminEmsDiagnostics) {
                this.runEmsDiagnostics();
            }
            if (nextTab === 'platform' && this.isPlatformAdmin) {
                this.fetchPlatformTenants();
            }
            if (nextTab === 'team') {
                this.fetchTeamMembers();
            }
            if (nextTab === 'billing' && this.isPlatformAdmin) {
                this.fetchPlatformBillingRecords();
            }
            if (nextTab === 'audit') {
                this.fetchAdminAuditLogs();
            }
            if (nextTab === 'account') {
                this.prepareAdminAccountForm();
            }
        },
        revokeObjectUrl(url) {
            if (typeof url === 'string' && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        },
        validateImageFile(file, label = '图片') {
            if (!(file instanceof File)) return null;
            if (!file.type.startsWith('image/')) {
                this.toastMessage(label + '仅支持图片文件');
                return null;
            }
            if (file.size > 5 * 1024 * 1024) {
                this.toastMessage(label + '不能超过 5MB');
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
            document.title = this.settings.share_title || this.settings.store_name || '物联卡配卡商';
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
        planDisplayAmount(plan = null) {
            return Math.max(0, Number(plan?.setup_price || 0));
        },
        planSettlementDiscount(plan = null) {
            return this.planDisplayAmount(plan);
        },
        orderPlanDisplayAmount(order = null) {
            return Math.max(
                0,
                Number(order?.pricing?.plan_display_amount ?? order?.plan_snapshot?.setup_price ?? order?.pricing?.plan_amount ?? 0),
            );
        },
        orderPlanDiscountAmount(order = null) {
            return Math.max(
                0,
                Number(
                    order?.pricing?.plan_discount_amount ??
                        Math.max(0, this.orderPlanDisplayAmount(order) - Number(order?.pricing?.plan_amount || 0)),
                ),
            );
        },
        insertCardText(value) {
            return (
                {
                    yes: '可以插卡',
                    no: '不可插卡',
                    unknown: '不清',
                }[value] || '未填写'
            );
        },
        removeControlText(value) {
            return (
                {
                    yes: '已去',
                    no: '未去',
                    need: '已去',
                    no_need: '未去',
                    unknown: '不清',
                }[value] || '未填写'
            );
        },
        compatiblePlanCount(device) {
            const compatibleIds = this.getCompatiblePlanIds(device);
            return compatibleIds.length;
        },
        isHotPlan(plan, index = -1) {
            return Number(plan?.hot_rank || 0) > 0 || Boolean(plan?.featured) || (index > -1 && index < 2);
        },
        isHotDevice(device, index = -1) {
            return Number(device?.hot_rank || 0) > 0 || Boolean(device?.featured) || (index > -1 && index < 2);
        },
        planSalesText(plan, index = -1) {
            if (plan?.featured) return '近期咨询和下单都比较多，适合优先锁定后再选设备';
            if (index === 0) return '很多用户会先从这款套餐开始对比，适合新客快速了解资费';
            if ((plan?.features || []).length) return '常被用来搭配随身 WiFi 或寄设备来配卡，成交路径更顺';
            return '适合先看图确认资费，再按设备型号选择配卡方案';
        },
        deviceSalesText(device, index = -1) {
            if (device?.stock <= 0) return '当前缺货，可先看图选其他设备或联系客服登记';
            if (device?.featured) return '热门设备之一，很多用户会直接选这台搭配套餐下单';
            if (index === 0) return '适合想省心一步到位的用户，选好设备后直接继续配卡即可';
            if (device?.original_price > device?.price) return '当前有价格展示，更容易让用户直接完成设备配卡下单';
            return '适合看完套餐后直接下单，减少来回咨询和选择成本';
        },
        builderStepDefinitions(flowType = this.builderForm.flow_type) {
            if (flowType === 'ship_device') {
                return [
                    { key: 'plan', label: '选择套餐' },
                    { key: 'contact', label: '填写地址' },
                    { key: 'ship_device', label: '设备信息' },
                    { key: 'payment', label: '上传付款截图' },
                ];
            }
            return [
                { key: 'device', label: '选择设备' },
                { key: 'plan', label: '选择套餐' },
                { key: 'contact', label: '填写地址' },
                { key: 'payment', label: '上传付款截图' },
            ];
        },
        builderStepCompleted(stepKey = '') {
            switch (String(stepKey || '').trim()) {
                case 'device':
                    return Boolean(this.builderForm.device_id);
                case 'plan':
                    return Boolean(this.builderForm.plan_id);
                case 'contact':
                    return Boolean(
                        this.builderForm.customer_name &&
                            /^1[3-9]\d{9}$/.test(this.builderForm.customer_phone) &&
                            this.builderForm.shipping_address,
                    );
                case 'ship_device':
                    return Boolean(this.builderForm.customer_device_brand || this.builderForm.customer_device_model);
                case 'payment':
                    return Boolean(this.paymentProofFile);
                default:
                    return false;
            }
        },
        validateBuilderStep(stepKey = '', options = {}) {
            const silent = Boolean(options.silent);
            const fail = (message) => {
                if (!silent) {
                    this.toastMessage(message);
                }
                return false;
            };

            if (stepKey === 'device' && !this.builderForm.device_id) {
                return fail('请先选择要配卡的设备');
            }
            if (stepKey === 'plan') {
                if (!this.builderForm.plan_id) {
                    return fail('请先选择套餐');
                }
                if (
                    this.builderForm.flow_type === 'buy_device' &&
                    this.selectedDevice &&
                    this.availablePlansForBuilder.length &&
                    !this.availablePlansForBuilder.find((plan) => plan.id === this.builderForm.plan_id)
                ) {
                    return fail('当前设备不能搭配这个套餐，请重新选择');
                }
            }
            if (stepKey === 'contact') {
                if (!this.builderForm.customer_name) return fail('请填写联系人姓名');
                if (!/^1[3-9]\d{9}$/.test(this.builderForm.customer_phone)) return fail('请填写正确的手机号');
                if (!this.builderForm.shipping_address) {
                    return fail(this.builderForm.flow_type === 'buy_device' ? '请填写收货地址' : '请填写回寄地址');
                }
            }
            if (stepKey === 'ship_device' && !this.builderForm.customer_device_brand && !this.builderForm.customer_device_model) {
                return fail('寄设备配卡请至少填写设备品牌或型号');
            }
            if (stepKey === 'payment') {
                if (!this.activePaymentQr) return fail('当前支付方式还没有配置收款码，请联系客服处理');
                if (!this.paymentProofFile) return fail('请上传付款截图');
            }
            return true;
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
                { key: 'created', label: '已下', activeAt: 1 },
                { key: 'review', label: '待审', activeAt: 1 },
                { key: 'config', label: order.flow_type === 'ship_device' ? '收件配卡' : '配卡测试', activeAt: 3 },
                { key: 'ship', label: '待发/已发', activeAt: 4 },
                { key: 'done', label: '已完', activeAt: 6 },
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
                    pending_payment_review: '待付款审',
                    awaiting_device_delivery: '待设备寄',
                    configuring: '配卡测试',
                    ready_to_ship: '待发',
                    shipped: '已发',
                    completed: '已完',
                    cancelled: '已取',
                }[value] || value
            );
        },
        planImage(plan) {
            return encodePath(plan?.cover_image || placeholder('套餐资费', '#0E6D68', '#57B8A8'));
        },
        deviceImage(device) {
            return encodePath(device?.cover_image || placeholder('设备介绍', '#173B67', '#E39A2D'));
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
                this.syncBuilderPlanCarrierFilter();
                const filteredPlans = this.filteredAvailablePlansForBuilder;
                if (filteredPlans.length && !filteredPlans.find((item) => item.id === this.builderForm.plan_id)) {
                    this.builderForm.plan_id = filteredPlans[0]?.id || null;
                }
                return;
            }
            const compatiblePlans = this.availablePlansForBuilder;
            if (!compatiblePlans.length) {
                this.builderForm.plan_id = null;
                this.builderPlanCarrierFilter = 'all';
                return;
            }
            if (!compatiblePlans.find((item) => item.id === this.builderForm.plan_id)) {
                this.builderForm.plan_id = compatiblePlans[0]?.id || null;
            }
            this.syncBuilderPlanCarrierFilter();
            const filteredPlans = this.filteredAvailablePlansForBuilder;
            if (filteredPlans.length && !filteredPlans.find((item) => item.id === this.builderForm.plan_id)) {
                this.builderForm.plan_id = filteredPlans[0]?.id || null;
            }
        },
        syncStorefrontPlanSelections() {
            const availableOptions = this.storefrontPlanCarrierOptions.filter((item) => !item.disabled);
            if (!availableOptions.length) {
                this.storefrontPlanCarrierFilter = 'all';
                this.storefrontSelectedPlanId = null;
                return;
            }

            const currentOption = this.storefrontPlanCarrierOptions.find((item) => item.code === this.storefrontPlanCarrierFilter);
            if (!currentOption || currentOption.disabled) {
                const preferredPlan =
                    this.plans.find((item) => item.id === this.storefrontSelectedPlanId) ||
                    this.plans.find((item) => item.id === this.builderForm.plan_id) ||
                    this.plans[0] ||
                    null;
                const selectedCarrier = this.normalizePlanCarrier(preferredPlan?.carrier);
                const preferredOption = availableOptions.find((item) => item.code === selectedCarrier && item.code !== 'all');
                this.storefrontPlanCarrierFilter = preferredOption?.code || 'all';
            }

            const filteredPlans = this.filteredStorefrontPlans;
            if (!filteredPlans.length) {
                this.storefrontSelectedPlanId = null;
                return;
            }
            if (!filteredPlans.find((item) => item.id === this.storefrontSelectedPlanId)) {
                const preferredPlan = filteredPlans.find((item) => item.id === this.builderForm.plan_id) || filteredPlans[0] || null;
                this.storefrontSelectedPlanId = preferredPlan?.id || null;
            }
        },
        setStorefrontPlanCarrierFilter(carrierCode = 'all') {
            const nextCode = String(carrierCode || 'all');
            const nextOption = this.storefrontPlanCarrierOptions.find((item) => item.code === nextCode);
            if (!nextOption || nextOption.disabled) {
                return;
            }

            this.storefrontPlanCarrierFilter = nextCode;
            const filteredPlans = this.filteredStorefrontPlans;
            if (filteredPlans.length && !filteredPlans.find((item) => item.id === this.storefrontSelectedPlanId)) {
                this.storefrontSelectedPlanId = filteredPlans[0]?.id || null;
            }
        },
        selectStorefrontPlan(plan = null) {
            if (!plan?.id) return;
            this.storefrontSelectedPlanId = plan.id;
        },
        toggleStorefrontBundleExpansion() {
            this.showAllStorefrontBundles = !this.showAllStorefrontBundles;
        },
        toggleStorefrontDeviceExpansion() {
            this.showAllStorefrontDevices = !this.showAllStorefrontDevices;
        },
        chooseDevice(deviceId) {
            this.builderForm.device_id = deviceId;
            this.syncBuilderSelections();
        },
        syncBuilderMobileStep(preferredStep = null) {
            const maxStep = this.builderStepDefinitions().length || 1;
            const nextStep = Number(preferredStep ?? this.builderMobileStep ?? 1);
            if (!Number.isFinite(nextStep)) {
                this.builderMobileStep = 1;
                return;
            }
            this.builderMobileStep = Math.min(maxStep, Math.max(1, Math.trunc(nextStep)));
        },
        isBuilderStepVisible(stepKey = '') {
            return !this.isCompactMobile || this.builderCurrentStepKey === stepKey;
        },
        goBuilderMobileStep(stepNumber) {
            const nextStep = Math.min(this.builderStepCount, Math.max(1, Number(stepNumber || 1)));
            if (nextStep === this.builderMobileStep) return;
            if (nextStep < this.builderMobileStep) {
                this.builderMobileStep = nextStep;
                return;
            }
            for (let index = this.builderMobileStep; index < nextStep; index += 1) {
                const currentItem = this.builderStepItems[index - 1];
                if (!currentItem || !this.validateBuilderStep(currentItem.key)) {
                    return;
                }
            }
            this.builderMobileStep = nextStep;
        },
        goBuilderPrevStep() {
            if (!this.isCompactMobile) {
                this.closeBuilder();
                return;
            }
            if (this.builderMobileStep <= 1) {
                this.closeBuilder();
                return;
            }
            this.builderMobileStep -= 1;
        },
        async handleBuilderPrimaryAction() {
            if (!this.isCompactMobile) {
                await this.submitOrder();
                return;
            }
            if (this.builderMobileStep >= this.builderStepCount) {
                await this.submitOrder();
                return;
            }
            if (!this.validateBuilderStep(this.builderCurrentStepKey)) {
                return;
            }
            this.syncBuilderMobileStep(this.builderMobileStep + 1);
        },
        normalizePlanCarrier(carrier = '') {
            const text = String(carrier || '').trim();
            if (!text) return '其他';
            if (text.includes('广电')) return '广电';
            if (text.includes('联通')) return '联通';
            if (text.includes('电信')) return '电信';
            if (text.includes('移动')) return '移动';
            return '其他';
        },
        syncBuilderPlanCarrierFilter() {
            const availableOptions = this.builderPlanCarrierOptions.filter((item) => !item.disabled);
            if (!availableOptions.length) {
                this.builderPlanCarrierFilter = 'all';
                return;
            }
            const currentOption = this.builderPlanCarrierOptions.find((item) => item.code === this.builderPlanCarrierFilter);
            if (currentOption && !currentOption.disabled) {
                return;
            }

            const selectedPlan = this.availablePlansForBuilder.find((item) => item.id === this.builderForm.plan_id) || null;
            const selectedCarrier = this.normalizePlanCarrier(selectedPlan?.carrier);
            const preferredOption = availableOptions.find((item) => item.code === selectedCarrier && item.code !== 'all');
            this.builderPlanCarrierFilter = preferredOption?.code || 'all';
        },
        setBuilderPlanCarrierFilter(carrierCode = 'all') {
            const nextCode = String(carrierCode || 'all');
            const nextOption = this.builderPlanCarrierOptions.find((item) => item.code === nextCode);
            if (!nextOption || nextOption.disabled) {
                return;
            }

            this.builderPlanCarrierFilter = nextCode;
            const filteredPlans = this.filteredAvailablePlansForBuilder;
            if (filteredPlans.length && !filteredPlans.find((item) => item.id === this.builderForm.plan_id)) {
                this.builderForm.plan_id = filteredPlans[0]?.id || null;
            }
        },
        handleQuickPlanTouch(plan) {
            const now = Date.now();
            const isDoubleTap = this.lastQuickPlanTouch.planId === plan.id && now - this.lastQuickPlanTouch.time < 320;
            this.storefrontSelectedPlanId = plan.id;
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
                return '未勾选可配套餐，当前设备不会在前台展示可配套餐';
            }
            const names = this.plans
                .filter((plan) => compatibleIds.includes(plan.id))
                .slice(0, 3)
                .map((plan) => plan.name);
            const suffix = compatibleIds.length > names.length ? ` 等 ${compatibleIds.length} 个套餐` : '';
            return '可配套餐：' + names.join(' / ') + suffix;
        },
        allowOrderDeviceShipmentUpdate(order) {
            return Boolean(order?.can_update_device_shipment && order?.flow_type === 'ship_device');
        },
        availableDropshipTargets(_order) {
            const currentTenantId = Number(this.currentTenant?.id || 0);
            return (this.platformTenants || []).filter((tenant) => Number(tenant.id || 0) !== currentTenantId);
        },
        buildAdminOrderDispatchInfo(order) {
            const deviceText = order?.device_snapshot
                ? `${order.device_snapshot.name || ''}${order.quantity > 1 ? ` x${order.quantity}` : ''}`
                : [order?.device_submission?.brand, order?.device_submission?.model].filter(Boolean).join(' / ') || '用户寄设备';
            const outboundInfo = [order?.device_submission?.outbound_company, order?.device_submission?.outbound_tracking]
                .filter(Boolean)
                .join(' / ');
            return [
                `订单号：${order?.order_no || ''}`,
                `下单方式：${this.flowTypeText(order?.flow_type)}`,
                `客户：${order?.customer_name || ''}`,
                `电话：${order?.customer_phone || ''}`,
                `套餐：${order?.plan_snapshot?.name || ''}`,
                `设备：${deviceText}`,
                `地址：${order?.shipping_address || ''}`,
                `客户寄出：${outboundInfo || '未填写'}`,
                `备注：${order?.remark || order?.admin_note || '无'}`,
            ].join('\n');
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
            this.toastMessage('原图预览失败，请稍后再试');
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
            return error?.response?.data?.error || error?.message || '操作失败，请稍后再试';
        },
        async copyText(value, successMessage = '已复') {
            const text = String(value || '').trim();
            if (!text) {
                this.toastMessage('暂无可复制内容');
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
                this.toastMessage('复制失败，请手动长按复制');
            }
        },
        async copyJson(value, successMessage = 'JSON 已复制') {
            try {
                await this.copyText(JSON.stringify(value ?? null, null, 2), successMessage);
            } catch (error) {
                this.toastMessage('复制 JSON 失败');
            }
        },
        splitTagsText(value) {
            return String(value || '')
                .split(/[\n,，、]+/)
                .map((item) => item.trim())
                .filter(Boolean);
        },
        isAdminOrderSelected(orderId) {
            return this.selectedAdminOrderIds.includes(orderId);
        },
        toggleAdminOrderSelection(orderId) {
            if (this.isAdminOrderSelected(orderId)) {
                this.selectedAdminOrderIds = this.selectedAdminOrderIds.filter((id) => id !== orderId);
                return;
            }
            this.selectedAdminOrderIds = [...this.selectedAdminOrderIds, orderId];
        },
        toggleAllAdminOrders() {
            if (!this.adminOrders.length) {
                this.selectedAdminOrderIds = [];
                return;
            }
            if (this.selectedAdminOrderIds.length === this.adminOrders.length) {
                this.selectedAdminOrderIds = [];
                return;
            }
            this.selectedAdminOrderIds = this.adminOrders.map((order) => order.id);
        },
        clearAdminOrderSelection() {
            this.selectedAdminOrderIds = [];
            this.adminBatchStatus = '';
        },
        selectedAdminOrders() {
            return this.adminOrders.filter((order) => this.selectedAdminOrderIds.includes(order.id));
        },
        openAdminDeleteModal(target) {
            const orderIds = (Array.isArray(target) ? target : [target])
                .map((item) => (typeof item === 'object' && item ? Number(item.id || 0) : Number(item || 0)))
                .filter((item) => Number.isFinite(item) && item > 0);
            const uniqueIds = Array.from(new Set(orderIds));
            if (!uniqueIds.length) {
                this.toastMessage('请先选择要删除的订单');
                return;
            }
            this.adminDeleteOrderIds = uniqueIds;
            this.showAdminDeleteModal = true;
        },
        closeAdminDeleteModal(force = false) {
            if (!force && this.savingStates.deleteOrders) return;
            this.showAdminDeleteModal = false;
            this.adminDeleteOrderIds = [];
        },
        openBatchDeleteAdminOrders() {
            this.openAdminDeleteModal(this.selectedAdminOrders());
        },
        getAdminOrderById(orderId) {
            return this.adminOrders.find((order) => order.id === orderId) || null;
        },
        workflowTaskForOrder(order) {
            return order?.ems?.workflow_task || null;
        },
        workflowTaskIsActive(order) {
            const status = String(this.workflowTaskForOrder(order)?.status || '').trim();
            return status === 'queued' || status === 'running';
        },
        trackingNumber(order) {
            return order?.tracking_number || order?.ems?.waybill_no || order?.merchant_tracking_number || '';
        },
        trackingCompany(order) {
            return order?.logistics_company || (this.trackingNumber(order) ? 'EMS' : '待填写');
        },
        emsExecutionStepDefinitions() {
            return [
                { key: 'parse', label: '解析地址' },
                { key: 'validate', label: '可达校验' },
                { key: 'create', label: '创建单号' },
                { key: 'label', label: '获取面单' },
                { key: 'print', label: '打印面单' },
                { key: 'track', label: '同步轨迹' },
            ];
        },
        buildAdminOrderExecutionSteps() {
            return this.emsExecutionStepDefinitions().reduce((result, step) => {
                result[step.key] = {
                    status: 'idle',
                    message: '',
                    updated_at: '',
                };
                return result;
            }, {});
        },
        getAdminOrderExecutionState(orderId) {
            return (
                this.adminOrderExecutionStates[orderId] || {
                    active: false,
                    mode: '',
                    currentStep: '',
                    updated_at: '',
                    steps: this.buildAdminOrderExecutionSteps(),
                }
            );
        },
        syncAdminWorkflowPolling() {
            const hasActiveWorkflow = this.adminOrders.some((order) => this.workflowTaskIsActive(order));
            if (hasActiveWorkflow && !this.adminWorkflowPollTimer) {
                this.adminWorkflowPollTimer = setInterval(() => {
                    void this.refreshAdminWorkflowQueueTick();
                }, 3000);
            }
            if (!hasActiveWorkflow && this.adminWorkflowPollTimer) {
                clearInterval(this.adminWorkflowPollTimer);
                this.adminWorkflowPollTimer = null;
            }
        },
        async refreshAdminWorkflowQueueTick() {
            if (this.savingStates.adminOrders || !this.adminOrders.some((order) => this.workflowTaskIsActive(order))) {
                return;
            }
            await Promise.all([this.fetchAdminOrders(), this.fetchAdminDashboard()]);
        },
        setAdminOrderExecutionState(orderId, patch = {}) {
            const current = this.getAdminOrderExecutionState(orderId);
            this.adminOrderExecutionStates = {
                ...this.adminOrderExecutionStates,
                [orderId]: {
                    ...current,
                    ...patch,
                    steps: {
                        ...(current.steps || this.buildAdminOrderExecutionSteps()),
                        ...(patch.steps || {}),
                    },
                },
            };
        },
        startAdminOrderExecution(orderId, mode = 'workflow') {
            this.adminOrderExecutionStates = {
                ...this.adminOrderExecutionStates,
                [orderId]: {
                    active: true,
                    mode,
                    currentStep: '',
                    updated_at: new Date().toISOString(),
                    steps: this.buildAdminOrderExecutionSteps(),
                },
            };
        },
        finishAdminOrderExecution(orderId) {
            this.setAdminOrderExecutionState(orderId, {
                active: false,
                currentStep: '',
                updated_at: new Date().toISOString(),
            });
        },
        setAdminOrderExecutionStep(orderId, stepKey, status, message = '') {
            const current = this.getAdminOrderExecutionState(orderId);
            this.setAdminOrderExecutionState(orderId, {
                currentStep: status === 'running' ? stepKey : current.currentStep === stepKey ? '' : current.currentStep,
                updated_at: new Date().toISOString(),
                steps: {
                    [stepKey]: {
                        ...(current.steps?.[stepKey] || {}),
                        status,
                        message: String(message || '').trim(),
                        updated_at: new Date().toISOString(),
                    },
                },
            });
        },
        receiverAddressReady(order) {
            const receiver = order?.ems?.receiver || {};
            return Boolean(receiver.prov && receiver.city && receiver.county && receiver.address);
        },
        emsExecutionStatusText(status) {
            const textMap = {
                idle: '待执行',
                queued: '排队中',
                running: '执行中',
                success: '已完成',
                error: '失败',
                skipped: '已跳过',
                pending: '待确认',
            };
            return textMap[status] || '待执行';
        },
        emsExecutionBaseStep(order, stepKey) {
            const ems = order?.ems || {};
            switch (stepKey) {
                case 'parse':
                    if (ems.address_parsed_at) {
                        return {
                            status: 'success',
                            message: [ems.receiver?.prov, ems.receiver?.city, ems.receiver?.county].filter(Boolean).join(' / ') || '地址已解析',
                        };
                    }
                    if (ems.last_action === 'parse-address' && ems.last_error) {
                        return { status: 'error', message: ems.last_error };
                    }
                    return { status: 'idle', message: '待解析' };
                case 'validate':
                    if (ems.reachable === true) {
                        return { status: 'success', message: ems.reachable_message || '可达校验通过' };
                    }
                    if (ems.reachable === false) {
                        return { status: 'error', message: ems.reachable_message || ems.last_error || '可达校验未通过' };
                    }
                    return { status: 'idle', message: '待校验' };
                case 'create':
                    if (this.trackingNumber(order)) {
                        return { status: 'success', message: this.trackingNumber(order) };
                    }
                    if (ems.last_action === 'create' && ems.last_error) {
                        return { status: 'error', message: ems.last_error };
                    }
                    return { status: 'idle', message: '待生成单号' };
                case 'label':
                    if (ems.label_file) {
                        return { status: 'success', message: this.assetFileName(ems.label_file, '已生成面单') };
                    }
                    if (ems.last_action === 'label' && ems.last_error) {
                        return { status: 'error', message: ems.last_error };
                    }
                    return { status: 'idle', message: '待获取面单' };
                case 'print':
                    if (ems.printed_at) {
                        return { status: 'success', message: ems.print_message || '已打印完成' };
                    }
                    if (ems.print_attempted_at) {
                        return { status: 'pending', message: ems.print_message || '已发起打印，待确认' };
                    }
                    if (['print', 'print-preflight'].includes(ems.last_action) && ems.last_error) {
                        return { status: 'error', message: ems.last_error };
                    }
                    return { status: 'idle', message: '待打印' };
                case 'track':
                    if (ems.last_track_sync_at) {
                        return { status: 'success', message: ems.track_summary || '轨迹已同步' };
                    }
                    if (ems.last_action === 'track-sync' && ems.last_error) {
                        return { status: 'error', message: ems.last_error };
                    }
                    return { status: 'idle', message: '待同步轨迹' };
                default:
                    return { status: 'idle', message: '' };
            }
        },
        emsExecutionSteps(order) {
            const workflowTask = this.workflowTaskForOrder(order);
            if (workflowTask?.steps) {
                return this.emsExecutionStepDefinitions().map((step) => {
                    const taskStep = workflowTask.steps?.[step.key] || {};
                    const fallbackStep = this.emsExecutionBaseStep(order, step.key);
                    const status = taskStep.status && taskStep.status !== 'idle' ? taskStep.status : fallbackStep.status;
                    const message = taskStep.message || fallbackStep.message || '';
                    return {
                        ...step,
                        status,
                        status_text: this.emsExecutionStatusText(
                            workflowTask.status === 'queued' && taskStep.status === 'idle' ? 'queued' : status,
                        ),
                        message:
                            workflowTask.status === 'queued' && taskStep.status === 'idle' && !message
                                ? '已加入后台队列，等待执行'
                                : message,
                    };
                });
            }

            const executionState = this.getAdminOrderExecutionState(order.id);
            return this.emsExecutionStepDefinitions().map((step) => {
                const base = this.emsExecutionBaseStep(order, step.key);
                const override = executionState.steps?.[step.key];
                const useOverride = Boolean(override?.status && override.status !== 'idle');
                const status = useOverride ? override.status : base.status;
                const message = (useOverride ? override.message : base.message) || '';
                return {
                    ...step,
                    status,
                    status_text: this.emsExecutionStatusText(status),
                    message,
                };
            });
        },
        currentAdminOrderExecutionLabel(order) {
            const workflowTask = this.workflowTaskForOrder(order);
            if (this.workflowTaskIsActive(order)) {
                const currentStep = this.emsExecutionStepDefinitions().find((item) => item.key === workflowTask.current_step);
                if (workflowTask.status === 'queued') {
                    return '后台排队中';
                }
                return currentStep?.label || '后台处理中';
            }
            const state = this.getAdminOrderExecutionState(order.id);
            if (!state.active || !state.currentStep) return '';
            const currentStep = this.emsExecutionStepDefinitions().find((item) => item.key === state.currentStep);
            return currentStep?.label || '';
        },
        emsWorkflowButtonText(order) {
            const currentLabel = this.currentAdminOrderExecutionLabel(order);
            if (this.workflowTaskIsActive(order) && currentLabel) {
                return currentLabel;
            }
            if (this.isOrderSaving(order.id) && currentLabel) {
                return '执行中：' + currentLabel;
            }
            return order.ems?.printed_at ? '一键重打并同步' : '一键处理并打印';
        },
        async queueAdminOrderWorkflow(order, options = {}) {
            if (!order || this.workflowTaskIsActive(order)) {
                if (order && this.workflowTaskIsActive(order)) {
                    this.toastMessage('该订单已经在后台队列中执行');
                }
                return;
            }
            await this.runAdminOrderAction(order, async () => {
                const { data } = await api.post('/admin/orders/' + order.id + '/ems/workflow', {
                    include_track: options.includeTrack !== false,
                });
                await Promise.all([this.fetchAdminOrders(), this.fetchAdminDashboard()]);
                this.toastMessage(data.message || '已加入后台一键处理队列');
            }).catch((error) => {
                this.toastMessage(this.errorMessage(error));
            });
        },
        buildAdminOrderEmsPayload(order, stepKey, useOrderPayload = true) {
            const payload = {};
            if (stepKey === 'parse') {
                payload.whole_address = order.ems.address_parse_source || order.shipping_address;
            }
            if (useOrderPayload) {
                payload.ems = order.ems;
            }
            return payload;
        },
        async requestAdminOrderEmsStep(order, stepKey, options = {}) {
            const useOrderPayload = options.useOrderPayload !== false;
            const endpointMap = {
                parse: '/admin/orders/' + order.id + '/ems/parse-address',
                validate: '/admin/orders/' + order.id + '/ems/validate',
                create: '/admin/orders/' + order.id + '/ems/create',
                label: '/admin/orders/' + order.id + '/ems/label',
                print: '/admin/orders/' + order.id + '/ems/print',
                track: '/admin/orders/' + order.id + '/ems/tracks/sync',
            };
            return await api.post(endpointMap[stepKey], this.buildAdminOrderEmsPayload(order, stepKey, useOrderPayload));
        },
        async refreshAdminOrderContext(orderId, { refreshDashboard = false } = {}) {
            if (refreshDashboard) {
                await Promise.all([this.fetchAdminOrders(), this.fetchAdminDashboard()]);
            } else {
                await this.fetchAdminOrders();
            }
            return this.getAdminOrderById(orderId);
        },
        emsProcessTimeline(order) {
            return this.emsExecutionSteps(order).map((step) => ({
                key: step.key,
                label:
                    step.key === 'parse'
                        ? '解析'
                        : step.key === 'validate'
                          ? '校验'
                          : step.key === 'create'
                            ? '建单'
                            : step.key === 'label'
                              ? '面单'
                              : step.key === 'print'
                                ? '打印'
                                : '轨迹',
                state: step.status === 'success' ? 'done' : ['running', 'pending', 'error'].includes(step.status) ? 'active' : 'muted',
            }));
        },
        emsAuditLogs(order) {
            return [...(order?.ems?.api_logs || [])].reverse();
        },
        formatTrackSyncAge(value) {
            if (!value) return '未同步';
            const diffMs = Date.now() - new Date(value).getTime();
            if (!Number.isFinite(diffMs) || diffMs < 0) return this.formatDateTime(value);
            const minutes = Math.floor(diffMs / 60000);
            if (minutes < 1) return '刚刚同步';
            if (minutes < 60) return `${minutes} 分钟前同步`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return `${hours} 小时前同步`;
            const days = Math.floor(hours / 24);
            return `${days} 天前同步`;
        },
        syncMyOrdersPolling() {
            const shouldPoll = Boolean(this.showOrdersModal && this.currentUser);
            if (shouldPoll && !this.myOrdersPollTimer) {
                this.myOrdersPollTimer = setInterval(() => {
                    void this.refreshMyOrdersPollTick();
                }, 60000);
            }
            if (!shouldPoll && this.myOrdersPollTimer) {
                clearInterval(this.myOrdersPollTimer);
                this.myOrdersPollTimer = null;
            }
        },
        async refreshMyOrdersPollTick() {
            if (!this.showOrdersModal || !this.currentUser) {
                return;
            }
            await this.fetchMyOrders(false, {
                suppressNoticeToast: false,
            });
        },
        latestTrackItem(order) {
            const list = [...(order?.ems?.track_items || [])].sort((left, right) =>
                String(right.op_time || '').localeCompare(String(left.op_time || '')),
            );
            return list[0] || null;
        },
        openMyOrderTrackModal(order) {
            if (!order || !this.trackingNumber(order)) {
                this.toastMessage('当前订单还没有物流单号');
                return;
            }
            this.activeTrackOrderId = order.id;
            this.showTrackModal = true;
        },
        closeMyOrderTrackModal() {
            this.showTrackModal = false;
            this.activeTrackOrderId = null;
        },
        openAdminOrderTrackModal(order) {
            if (!order || !this.trackingNumber(order)) {
                this.toastMessage('当前订单还没有物流单号');
                return;
            }
            this.activeAdminTrackOrderId = order.id;
            this.showAdminTrackModal = true;
        },
        closeAdminTrackModal() {
            this.showAdminTrackModal = false;
            this.activeAdminTrackOrderId = null;
        },
        userNoticeCenter(order) {
            const center = order?.user_notice_center;
            return center && typeof center === 'object'
                ? {
                      last_read_at: center.last_read_at || null,
                      notices: Array.isArray(center.notices) ? center.notices : [],
                  }
                : { last_read_at: null, notices: [] };
        },
        userOrderNoticeHistory(order) {
            return [...this.userNoticeCenter(order).notices].sort(
                (left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime(),
            );
        },
        userOrderUnreadNoticeCount(order) {
            return this.userOrderNoticeHistory(order).filter((notice) => !notice.read_at).length;
        },
        userOrderLastReadAt(order) {
            return this.userNoticeCenter(order).last_read_at || null;
        },
        userOrderNoticeItems(order) {
            return this.userOrderNoticeHistory(order)
                .slice(0, 3)
                .map((notice) => ({
                    ...notice,
                    key: notice.id,
                    time: notice.created_at,
                }));
        },
        buildMyOrderNoticeSnapshot(order) {
            return {
                tracking_number: this.trackingNumber(order),
                waybill_created_at: order?.ems?.waybill_created_at || '',
                printed_at: order?.ems?.printed_at || '',
                last_track_sync_at: order?.ems?.last_track_sync_at || '',
                track_summary: order?.ems?.track_summary || '',
            };
        },
        collectMyOrderNoticeMessages(previousOrder, nextOrder) {
            if (!previousOrder || !nextOrder) {
                return [];
            }

            const messages = [];
            const previousTrackingNumber = this.trackingNumber(previousOrder);
            const nextTrackingNumber = this.trackingNumber(nextOrder);

            if (!previousTrackingNumber && nextTrackingNumber) {
                messages.push(`${nextOrder.order_no} 已生成 EMS 单号`);
            }
            if (!previousOrder?.ems?.printed_at && nextOrder?.ems?.printed_at) {
                messages.push(`${nextOrder.order_no} 面单已打印完成`);
            }
            if (
                nextOrder?.ems?.last_track_sync_at &&
                nextOrder.ems.last_track_sync_at !== previousOrder?.ems?.last_track_sync_at &&
                (nextOrder?.ems?.track_summary || this.latestTrackItem(nextOrder))
            ) {
                messages.push(`${nextOrder.order_no} 轨迹已更新`);
            }

            return messages;
        },
        handleMyOrderNoticeUpdates(previousOrders = [], nextOrders = [], { suppressToast = false } = {}) {
            const previousMap = new Map((previousOrders || []).map((order) => [order.id, order]));
            const messages = [];

            nextOrders.forEach((order) => {
                const previousOrder = previousMap.get(order.id);
                messages.push(...this.collectMyOrderNoticeMessages(previousOrder, order));
            });

            this.myOrderNoticeSnapshots = nextOrders.reduce((result, order) => {
                result[order.id] = this.buildMyOrderNoticeSnapshot(order);
                return result;
            }, {});

            if (!suppressToast && messages.length) {
                const summary =
                    messages.length > 2 ? `${messages.slice(0, 2).join('；')} 等 ${messages.length} 条订单提醒` : messages.join('；');
                this.toastMessage(summary);
            }
        },
        async markMyOrderNoticesRead(order, options = {}) {
            if (!order || !this.userOrderUnreadNoticeCount(order)) {
                return;
            }
            try {
                await api.post('/orders/' + order.id + '/notices/read', {
                    read_all: options.readAll !== false,
                });
                await this.fetchMyOrders(this.showOrdersModal, { suppressNoticeToast: true });
                this.toastMessage('本单提醒已标记为已读');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
        },
        async markAllMyOrdersNoticesRead() {
            if (!this.myOrdersUnreadNoticeCount) {
                this.toastMessage('当前没有未读提醒');
                return;
            }
            try {
                await api.post('/orders/notices/read-all');
                await this.fetchMyOrders(this.showOrdersModal, { suppressNoticeToast: true });
                this.toastMessage('所有订单提醒都已标记为已读');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
        },
        userTrackPanelTitle(order) {
            if (!this.trackingNumber(order)) return '商家回寄信息待生成';
            const latest = this.latestTrackItem(order);
            return latest?.op_name || latest?.op_desc || '物流轨迹已更新';
        },
        userTrackPanelHint(order) {
            if (!this.trackingNumber(order)) return '商家出单后会在这里展示 EMS 单号和最新轨迹。';
            if (order?.ems?.track_summary) return order.ems.track_summary;
            if (this.settings?.logistics?.auto_sync_tracks) return '后台会自动同步 EMS 轨迹，你也可以手动刷新。';
            return '可复制单号或手动刷新轨迹。';
        },
        reversedTrackItems(order) {
            return [...(order?.ems?.track_items || [])].reverse();
        },
        reversedProcessingLogs(order) {
            return [...(order?.processing_logs || [])].reverse();
        },
        applyAdminNoteTemplate(order, template) {
            const nextTemplate = String(template || '').trim();
            if (!nextTemplate) return;
            order.admin_note = order.admin_note ? order.admin_note + '\n' + nextTemplate : nextTemplate;
        },
        openLabelFile(labelFile) {
            const nextUrl = encodePath(labelFile);
            if (!nextUrl) return;
            window.open(nextUrl, '_blank', 'noopener');
        },
        async runAdminOrderAction(order, worker) {
            if (this.isOrderSaving(order.id)) return;
            this.setOrderSaving(order.id, true);
            try {
                await worker();
            } finally {
                this.setOrderSaving(order.id, false);
            }
        },
        openLabelForManualPrint(order) {
            if (!order?.ems?.label_file) {
                this.toastMessage('当前订单还没有可打印的面单 PDF');
                return;
            }
            this.openLabelFile(order.ems.label_file);
            this.setAdminOrderExecutionStep(order.id, 'print', 'pending', '已打开 PDF，请在系统打印窗口中确认打印');
            this.toastMessage('面单 PDF 已打开，请在本地打印窗口中确认打印');
        },
        async runAdminOrderWorkflow(order, options = {}) {
            const { silent = false, refreshDashboard = true, includeTrack = true, throwError = false } = options;
            const orderId = order.id;

            try {
                return await this.runAdminOrderAction(order, async () => {
                    this.startAdminOrderExecution(orderId, 'workflow');
                    let currentOrder = order;

                    const runStep = async (stepKey, { shouldRun = () => true, skipMessage = '', successMessage, successStatus } = {}) => {
                        const targetOrder = currentOrder || this.getAdminOrderById(orderId) || order;
                        if (!shouldRun(targetOrder)) {
                            const skipText = typeof skipMessage === 'function' ? skipMessage(targetOrder) : skipMessage;
                            this.setAdminOrderExecutionStep(orderId, stepKey, 'skipped', skipText || '本步已跳过');
                            return { skipped: true, order: targetOrder };
                        }

                        this.setAdminOrderExecutionStep(orderId, stepKey, 'running', this.emsExecutionStatusText('running'));
                        try {
                            const { data } = await this.requestAdminOrderEmsStep(targetOrder, stepKey);
                            currentOrder = (await this.refreshAdminOrderContext(orderId)) || targetOrder;

                            const nextStatus =
                                typeof successStatus === 'function'
                                    ? successStatus(data, currentOrder)
                                    : successStatus || 'success';
                            const nextMessage =
                                typeof successMessage === 'function'
                                    ? successMessage(data, currentOrder)
                                    : successMessage || this.emsExecutionStepDefinitions().find((item) => item.key === stepKey)?.label || '已完成';

                            this.setAdminOrderExecutionStep(orderId, stepKey, nextStatus, nextMessage);

                            if (stepKey === 'print' && ['browser', 'open'].includes(String(data?.mode || '').toLowerCase()) && data?.label_file) {
                                this.openLabelFile(data.label_file);
                            }

                            return { data, order: currentOrder };
                        } catch (error) {
                            this.setAdminOrderExecutionStep(orderId, stepKey, 'error', this.errorMessage(error));
                            throw error;
                        }
                    };

                    try {
                        await runStep('parse', {
                            shouldRun: (targetOrder) => !targetOrder.ems?.address_parsed_at || !this.receiverAddressReady(targetOrder),
                            skipMessage: '已有解析结果，本步已跳过',
                            successMessage: (data, targetOrder) =>
                                [targetOrder.ems?.receiver?.prov, targetOrder.ems?.receiver?.city, targetOrder.ems?.receiver?.county]
                                    .filter(Boolean)
                                    .join(' / ') || '地址解析完成',
                        });
                        await runStep('validate', {
                            successMessage: (data) => data.reachable_message || '可达校验通过',
                        });
                        await runStep('create', {
                            shouldRun: (targetOrder) => !this.trackingNumber(targetOrder),
                            skipMessage: (targetOrder) => '已存在单号 ' + this.trackingNumber(targetOrder) + '，已跳过建单',
                            successMessage: (data, targetOrder) => 'EMS 单号 ' + (data.waybill_no || data.tracking_number || this.trackingNumber(targetOrder) || ''),
                        });
                        await runStep('label', {
                            shouldRun: (targetOrder) => !targetOrder.ems?.label_file,
                            skipMessage: () => '已有面单文件，已跳过获取',
                            successMessage: (data, targetOrder) =>
                                targetOrder.ems?.label_file
                                    ? '面单已就绪 ' + this.assetFileName(targetOrder.ems.label_file, '已生成面单')
                                    : data.label_file
                                      ? '面单已生成'
                                      : '面单已返回',
                        });
                        await runStep('print', {
                            successStatus: (data) => (['browser', 'open'].includes(String(data?.mode || '').toLowerCase()) ? 'pending' : 'success'),
                            successMessage: (data) => data.message || '打印任务已发送',
                        });

                        if (includeTrack) {
                            await runStep('track', {
                                shouldRun: (targetOrder) => Boolean(this.trackingNumber(targetOrder)),
                                skipMessage: '暂无运单号，已跳过轨迹同步',
                                successMessage: (data) => data.track_summary || '轨迹已同步',
                            });
                        } else {
                            this.setAdminOrderExecutionStep(orderId, 'track', 'skipped', '本次未执行轨迹同步');
                        }

                        if (refreshDashboard) {
                            await this.fetchAdminDashboard();
                        }
                        this.finishAdminOrderExecution(orderId);
                        const latestOrder = this.getAdminOrderById(orderId) || currentOrder || order;
                        const finalPrintStep = this.emsExecutionSteps(latestOrder).find((step) => step.key === 'print');
                        if (!silent) {
                            this.toastMessage(
                                finalPrintStep?.status === 'pending' ? '一键处理已完成，PDF 已打开，请确认打印' : '一键处理并打印已完成',
                            );
                        }
                        return latestOrder;
                    } catch (error) {
                        if (refreshDashboard) {
                            await this.fetchAdminDashboard();
                        }
                        this.finishAdminOrderExecution(orderId);
                        throw error;
                    }
                });
            } catch (error) {
                if (!silent) {
                    this.toastMessage(this.errorMessage(error));
                }
                if (throwError) {
                    throw error;
                }
                return null;
            }
        },
        async parseAdminOrderAddress(order) {
            await this.runAdminOrderAction(order, async () => {
                await api.post('/admin/orders/' + order.id + '/ems/parse-address', {
                    whole_address: order.ems.address_parse_source || order.shipping_address,
                    ems: order.ems,
                });
                await this.fetchAdminOrders();
                this.toastMessage('EMS 收件地址已解析');
            }).catch((error) => {
                this.toastMessage(this.errorMessage(error));
            });
        },
        async validateAdminOrderReachability(order) {
            await this.runAdminOrderAction(order, async () => {
                const { data } = await api.post('/admin/orders/' + order.id + '/ems/validate', {
                    ems: order.ems,
                });
                await this.fetchAdminOrders();
                this.toastMessage(data.reachable_message || 'EMS 收寄地址校验通过');
            }).catch((error) => {
                this.toastMessage(this.errorMessage(error));
            });
        },
        async createAdminOrderWaybill(order) {
            await this.runAdminOrderAction(order, async () => {
                const { data } = await api.post('/admin/orders/' + order.id + '/ems/create', {
                    ems: order.ems,
                });
                await this.fetchAdminOrders();
                this.toastMessage('EMS 单号已生成：' + (data.waybill_no || data.tracking_number || ''));
            }).catch((error) => {
                this.toastMessage(this.errorMessage(error));
            });
        },
        async fetchAdminOrderLabel(order) {
            await this.runAdminOrderAction(order, async () => {
                const { data } = await api.post('/admin/orders/' + order.id + '/ems/label', {
                    ems: order.ems,
                });
                await this.fetchAdminOrders();
                this.toastMessage(data.label_file ? 'EMS 面单已生成' : 'EMS 面单已返回');
            }).catch((error) => {
                this.toastMessage(this.errorMessage(error));
            });
        },
        async printAdminOrderLabel(order) {
            await this.runAdminOrderAction(order, async () => {
                const { data } = await api.post('/admin/orders/' + order.id + '/ems/print', {
                    ems: order.ems,
                });
                await this.fetchAdminOrders();
                if ((data.mode === 'browser' || data.mode === 'open') && data.label_file) {
                    this.openLabelFile(data.label_file);
                    this.toastMessage(data.message || '已打开面单，请在浏览器中确认打印');
                    return;
                }
                this.toastMessage(data.message || '打印任务已发送');
            }).catch((error) => {
                this.toastMessage(this.errorMessage(error));
            });
        },
        async syncAdminOrderTracks(order) {
            await this.runAdminOrderAction(order, async () => {
                await api.post('/admin/orders/' + order.id + '/ems/tracks/sync', {
                    ems: order.ems,
                });
                await this.fetchAdminOrders();
                this.toastMessage('EMS 轨迹已同步');
            }).catch((error) => {
                this.toastMessage(this.errorMessage(error));
            });
        },
        async confirmAdminOrderPrinted(order) {
            await this.runAdminOrderAction(order, async () => {
                order.ems.printed_at = new Date().toISOString();
                order.ems.print_status = 'confirmed';
                order.ems.print_message = '已人工确认打印完成';
                await this.saveAdminOrder(order);
                await this.fetchAdminDashboard();
                this.toastMessage('已标记为打印完成');
            }).catch((error) => {
                this.toastMessage(this.errorMessage(error));
            });
        },
        async runBatchAdminAction(actionKey) {
            const selectedOrders = this.selectedAdminOrders();
            if (!selectedOrders.length) {
                this.toastMessage('请先勾选要批量处理的订单');
                return;
            }
            if (this.savingStates.batchOrders) return;

            if (actionKey === 'workflow') {
                this.setSavingState('batchOrders', true);
                try {
                    const { data } = await api.post('/admin/orders/ems/workflow/batch', {
                        order_ids: selectedOrders.map((order) => order.id),
                        include_track: true,
                    });
                    await Promise.all([this.fetchAdminOrders(), this.fetchAdminDashboard()]);

                    const failedOrderNos = (data.results || [])
                        .filter((item) => !item.success)
                        .map((item) => selectedOrders.find((order) => order.id === item.order_id)?.order_no || String(item.order_id))
                        .slice(0, 3);
                    const failedText = failedOrderNos.length ? `，失败订单：${failedOrderNos.join('、')}` : '';

                    this.toastMessage(
                        `批量一键处理已加入后台队列：新增 ${data.queued_count || 0}，已在队列 ${data.already_queued_count || 0}，失败 ${data.failed_count || 0}${failedText}`,
                    );
                } catch (error) {
                    this.toastMessage(this.errorMessage(error));
                } finally {
                    this.setSavingState('batchOrders', false);
                }
                return;
            }

            const actionMap = {
                parse: {
                    label: '批量解析地址',
                    run: (order) =>
                        api.post('/admin/orders/' + order.id + '/ems/parse-address', {
                            whole_address: order.ems.address_parse_source || order.shipping_address,
                            ems: order.ems,
                        }),
                },
                validate: {
                    label: '批量可达校验',
                    run: (order) =>
                        api.post('/admin/orders/' + order.id + '/ems/validate', {
                            ems: order.ems,
                        }),
                },
                create: {
                    label: '批量建单',
                    run: (order) =>
                        api.post('/admin/orders/' + order.id + '/ems/create', {
                            ems: order.ems,
                        }),
                },
                label: {
                    label: '批量获取面单',
                    run: (order) =>
                        api.post('/admin/orders/' + order.id + '/ems/label', {
                            ems: order.ems,
                        }),
                },
                print: {
                    label: '批量打印面单',
                    run: (order) =>
                        api.post('/admin/orders/' + order.id + '/ems/print', {
                            ems: order.ems,
                        }),
                },
                track: {
                    label: '批量同步轨迹',
                    run: (order) =>
                        api.post('/admin/orders/' + order.id + '/ems/tracks/sync', {
                            ems: order.ems,
                        }),
                },
            };

            const action = actionMap[actionKey];
            if (!action) return;

            this.setSavingState('batchOrders', true);
            let successCount = 0;
            let failedCount = 0;
            const failedOrders = [];

            try {
                for (const order of selectedOrders) {
                    try {
                        await action.run(order);
                        successCount += 1;
                    } catch (error) {
                        failedCount += 1;
                        failedOrders.push(order.order_no);
                    }
                }
                await Promise.all([this.fetchAdminOrders(), this.fetchAdminDashboard()]);
                const failedText = failedOrders.length ? `，失败订单：${failedOrders.slice(0, 3).join('、')}` : '';
                this.toastMessage(`${action.label}完成：成功 ${successCount}，失败 ${failedCount}${failedText}`);
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('batchOrders', false);
            }
        },
        async runEmsDiagnostics() {
            if (this.savingStates.diagnostics) return;
            this.setSavingState('diagnostics', true);
            try {
                const { data } = await api.get('/admin/ems/diagnostics');
                this.adminEmsDiagnostics = data;
                this.toastMessage('EMS 打印自检已完成');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('diagnostics', false);
            }
        },
        async refreshMyOrderTracks(order) {
            try {
                await api.post('/orders/' + order.id + '/ems/tracks/sync');
                await this.fetchMyOrders(true, { suppressNoticeToast: true });
                this.toastMessage('物流轨迹已更新');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
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
            this.builderPlanCarrierFilter = 'all';
            this.builderMobileStep = 1;
            this.paymentProofFile = null;
            this.paymentProofPreview = null;
            this.syncBuilderSelections();
        },
        async initialize() {
            try {
                await Promise.all([this.fetchStorefront(), this.checkLogin()]);
                this.restoreStorefrontLoginPhone();
                this.restoreAdminUiState();
                this.resetBuilder();
                if (this.isAdminEntry) {
                    if (this.isAdmin) {
                        await this.openAdmin();
                    } else {
                        this.showLoginModal = true;
                    }
                } else if (!this.currentUser && !this.loginPhone) {
                    this.showLoginModal = true;
                }
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
        },
        async fetchStorefront() {
            const { data } = await api.get('/storefront');
            this.currentTenant = {
                ...(this.currentTenant || {}),
                ...(data.tenant || {}),
            };
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
            this.syncStorefrontPlanSelections();
        },
        async checkLogin() {
            const token = getTenantToken(resolveTenantCode());
            if (!token) return;
            try {
                const { data } = await api.get('/auth/me');
                this.currentUser = data;
                this.rememberStorefrontLoginPhone(data?.phone);
            } catch (error) {
                clearTenantToken(resolveTenantCode());
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
                        this.toastMessage('请输入管理员账号');
                        return;
                    }
                    if (!this.adminPassword) {
                        this.toastMessage('请输入管理员密码');
                        return;
                    }
                    ({ data } = await api.post('/auth/admin-login', {
                        username: this.adminUsername,
                        password: this.adminPassword,
                    }));
                } else {
                    if (!/^1[3-9]\d{9}$/.test(this.loginPhone)) {
                        this.toastMessage('请输入正确的 11 位手机号');
                        return;
                    }
                    ({ data } = await api.post('/auth/login', { phone: this.loginPhone }));
                }
                setTenantToken(data.token, data.user?.tenant_code || resolveTenantCode());
                this.currentUser = data.user;
                this.rememberStorefrontLoginPhone(data.user?.phone || this.loginPhone);
                this.loginPhone = '';
                this.adminUsername = '';
                this.adminPassword = '';
                this.resetSecretFieldVisibility(['admin_login_password']);
                this.showLoginModal = false;
                this.prefillContact();
                if (this.isAdminEntry) {
                    if (!this.isAdmin) {
                        this.toastMessage('当前账号没有后台权限');
                        return;
                    }
                    this.restoreAdminUiState();
                    await this.openAdmin();
                } else {
                    this.toastMessage('登录成功');
                }
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
        },
        logout() {
            clearTenantToken(resolveTenantCode());
            this.currentUser = null;
            this.adminUsername = '';
            this.adminPassword = '';
            this.loginPhone = '';
            this.currentTenantDomainDiagnostics = null;
            this.tenantDomainDiagnosticsMap = {};
            this.tenantDomainDiagnosticsLoadingIds = [];
            this.adminLastRefreshedAt = null;
            this.adminOrdersLastFetchedAt = null;
            this.adminAuditLastFetchedAt = null;
            this.resetSecretFieldVisibility();
            this.isAdminView = false;
            this.showOrdersModal = false;
            this.showShipAddressPrompt = false;
            this.shipAddressPromptOrderNo = '';
            this.showLoginModal = this.isAdminEntry;
            this.restoreStorefrontLoginPhone();
            this.toastMessage('已退出登录');
            this.resetBuilder();
        },
        openBuilder(flowType, options = {}) {
            this.showBuilder = true;
            this.builderForm.flow_type = flowType;
            this.builderMobileStep = 1;
            if (flowType === 'buy_device') {
                this.builderForm.device_id = options.deviceId || this.builderForm.device_id || this.devices[0]?.id || null;
                this.builderForm.plan_id = options.planId || this.builderForm.plan_id || this.plans[0]?.id || null;
                this.syncBuilderSelections();
            } else {
                this.builderForm.device_id = null;
                this.builderForm.plan_id = options.planId || this.builderForm.plan_id || this.plans[0]?.id || null;
                this.syncBuilderSelections();
            }
            this.prefillContact();
            this.syncBuilderMobileStep();
        },
        setBuilderFlow(flowType) {
            this.builderForm.flow_type = flowType;
            this.builderMobileStep = 1;
            if (flowType === 'buy_device' && !this.builderForm.device_id) {
                this.builderForm.device_id = this.devices[0]?.id || null;
                this.syncBuilderSelections();
            }
            if (flowType === 'ship_device') {
                this.builderForm.device_id = null;
                if (!this.builderForm.plan_id) {
                    this.builderForm.plan_id = this.plans[0]?.id || null;
                }
                this.syncBuilderSelections();
            }
            this.syncBuilderMobileStep();
        },
        closeBuilder() {
            this.showBuilder = false;
            this.revokeObjectUrl(this.paymentProofPreview);
            this.paymentProofFile = null;
            this.paymentProofPreview = null;
            this.builderMobileStep = 1;
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
            this.toastMessage('请先登录后再' + actionText + '');
            return false;
        },
        async submitOrder() {
            if (!(await this.ensureLogin('提交订单'))) return;
            if (this.savingStates.submitOrder) return;
            if (!this.builderForm.plan_id) return this.toastMessage('请先选择套餐');
            if (this.builderForm.flow_type === 'buy_device' && !this.builderForm.device_id)
                return this.toastMessage('请选择要配卡的设备');
            if (
                this.builderForm.flow_type === 'buy_device' &&
                !this.availablePlansForBuilder.length
            ) {
                return this.toastMessage('这台设备当前没有勾选可配套餐，请联系商家处理');
            }
            if (
                this.builderForm.flow_type === 'buy_device' &&
                this.selectedDevice &&
                this.availablePlansForBuilder.length &&
                !this.availablePlansForBuilder.find((plan) => plan.id === this.builderForm.plan_id)
            ) {
                return this.toastMessage('当前设备不能搭配这个套餐，请重新选择');
            }
            if (!this.builderForm.customer_name) return this.toastMessage('请填写联系人姓名');
            if (!/^1[3-9]\d{9}$/.test(this.builderForm.customer_phone)) return this.toastMessage('请填写正确的手机号');
            if (!this.builderForm.shipping_address)
                return this.toastMessage(this.builderForm.flow_type === 'buy_device' ? '请填写收货地址' : '请填写回寄地址');
            if (
                this.builderForm.flow_type === 'ship_device' &&
                !this.builderForm.customer_device_brand &&
                !this.builderForm.customer_device_model
            )
                return this.toastMessage('寄设备配卡请至少填写设备品牌或型号');
            if (!this.activePaymentQr) return this.toastMessage('当前支付方式还没有配置收款码，请联系客服处理');
            if (!this.paymentProofFile) return this.toastMessage('请上传付款截图');

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
                const flowType = this.builderForm.flow_type;
                const { data } = await api.post('/orders', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                this.closeBuilder();
                this.resetBuilder();
                await Promise.all([
                    this.fetchStorefront(),
                    this.fetchMyOrders(false),
                    this.isAdmin ? this.refreshAdminData() : Promise.resolve(),
                ]);
                if (flowType === 'ship_device') {
                    this.shipAddressPromptOrderNo = data?.order_no || '';
                    this.showShipAddressPrompt = true;
                    this.toastMessage('订单已提交，请按弹窗地址把设备寄给商家');
                } else {
                    this.showOrdersModal = true;
                    this.toastMessage('订单已提交，等待人工审核');
                }
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('submitOrder', false);
            }
        },
        async fetchMyOrders(showModal = false, options = {}) {
            if (!(await this.ensureLogin('查看订单'))) return;
            const previousOrders = [...this.myOrders];
            const { data } = await api.get('/orders');
            this.myOrders = (data || []).map((order) => ({
                ...order,
                device_submission: {
                    ...(order.device_submission || {}),
                    outbound_company: order?.device_submission?.outbound_company || '',
                    outbound_tracking: order?.device_submission?.outbound_tracking || '',
                },
            }));
            if (showModal) this.showOrdersModal = true;
            this.handleMyOrderNoticeUpdates(previousOrders, this.myOrders, {
                suppressToast: Boolean(options.suppressNoticeToast) || !previousOrders.length,
            });
            this.syncMyOrdersPolling();
        },
        async openOrders() {
            await this.fetchMyOrders(true);
        },
        closeShipAddressPrompt() {
            this.showShipAddressPrompt = false;
            this.shipAddressPromptOrderNo = '';
        },
        async openShipAddressPromptOrders() {
            this.closeShipAddressPrompt();
            await this.openOrders();
        },
        async saveMyOrderDeviceShipment(order) {
            if (!order?.id || !this.allowOrderDeviceShipmentUpdate(order)) {
                return;
            }
            await this.runAdminOrderAction({ id: order.id }, async () => {
                await api.put('/orders/' + order.id + '/device-shipment', {
                    outbound_company: order.device_submission?.outbound_company || '',
                    outbound_tracking: order.device_submission?.outbound_tracking || '',
                });
                await this.fetchMyOrders(true, { suppressNoticeToast: true });
                this.toastMessage('寄出快递信息已保存');
            }).catch((error) => {
                this.toastMessage(this.errorMessage(error));
            });
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
                this.toastMessage('订单已取消');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
        },
        async confirmOrder(order) {
            if (!window.confirm('确认收到订单 ' + order.order_no + ' 吗？')) return;
            try {
                await api.put('/orders/' + order.id + '/confirm');
                await this.fetchMyOrders(true);
                this.toastMessage('已确认收货');
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
            if (!file) return this.toastMessage('请先选择新的付款截图');
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
                this.toastMessage('新的付款截图已提交');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
        },
        async openAdmin() {
            if (!this.isAdmin) return this.toastMessage('请使用管理员账号登录');
            this.isAdminView = true;
            try {
                await this.refreshAdminData();
                if (!this.visibleAdminTabs.find((tab) => tab.value === this.adminTab)) {
                    this.adminTab = this.visibleAdminTabs[0]?.value || 'dashboard';
                }
                this.persistAdminUiState();
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            }
        },
        goStorefront() {
            if (!this.confirmDiscardChanges()) return;
            window.location.href = this.tenantStorefrontUrl(this.currentTenant);
        },
        async refreshAdminData() {
            if (this.savingStates.adminRefresh) return;
            this.setSavingState('adminRefresh', true);
            const tasks = [];
            try {
                if (this.adminPermissionEnabled('dashboard.view')) {
                    tasks.push(this.fetchAdminDashboard());
                    tasks.push(this.fetchAdminAuditLogs());
                }
                if (this.adminPermissionEnabled('catalog.manage')) {
                    tasks.push(this.fetchAdminPlans(), this.fetchAdminDevices());
                }
                if (this.adminPermissionEnabled('orders.manage')) {
                    tasks.push(this.fetchAdminOrders());
                }
                if (this.adminPermissionEnabled('tenant.settings') || this.adminPermissionEnabled('logistics.manage')) {
                    tasks.push(this.fetchAdminSettings());
                } else {
                    this.prepareAdminAccountForm();
                }
                if (this.adminPermissionEnabled('team.manage')) {
                    tasks.push(this.fetchTeamMembers());
                }
                if (this.isPlatformAdmin && this.adminPermissionEnabled('platform.manage')) {
                    tasks.push(this.fetchPlatformTenants());
                }
                if (this.isPlatformAdmin && this.adminPermissionEnabled('billing.manage')) {
                    tasks.push(this.fetchPlatformBillingRecords());
                }
                await Promise.all(tasks);
                if (this.adminTab === 'site' && this.adminPermissionEnabled('dashboard.view')) {
                    await this.fetchCurrentTenantDomainDiagnostics();
                }
                if (this.adminTab === 'logistics' && this.tenantFeatureEnabled('ems') && this.adminPermissionEnabled('logistics.manage')) {
                    await this.runEmsDiagnostics();
                }
                this.adminLastRefreshedAt = new Date().toISOString();
            } finally {
                this.setSavingState('adminRefresh', false);
            }
        },
        defaultTenantEditorForm() {
            return {
                id: null,
                code: '',
                name: '',
                status: 'active',
                expires_at: '',
                subscription_name: '标准版',
                max_user_count: 0,
                max_order_count: 0,
                max_plan_count: 0,
                max_device_count: 0,
                subscription_type: 'paid',
                auto_suspend_on_expiry: true,
                primary_domain: '',
                domain_bindings_text: '',
                primary_admin_domain: '',
                admin_domain_bindings_text: '',
                features: this.normalizeTenantFeatureSelection(Object.keys(this.tenantFeatureCatalog())),
                contact_name: '',
                contact_phone: '',
                note: '',
                admin_username: '',
                admin_nickname: '',
                admin_phone: '',
                admin_password: '',
                admin_password_confirm: '',
            };
        },
        defaultTeamEditorForm() {
            return {
                id: null,
                username: '',
                nickname: '',
                phone: '',
                role: this.teamRoleOptions[0]?.code || 'staff_service',
                status: 'active',
                permissions: this.normalizeTeamPermissionSelection(this.teamRoleOptions[0]?.permissions || []),
                password: '',
                password_confirm: '',
            };
        },
        defaultBillingEditorForm() {
            const defaultTenantId = String(this.platformBillingTenants[0]?.id || this.platformTenants[0]?.id || '');
            return {
                tenant_id: defaultTenantId,
                kind: 'renewal',
                subscription_name: '',
                amount: 0,
                duration_days: 30,
                max_user_count: '',
                max_order_count: '',
                max_plan_count: '',
                max_device_count: '',
                features: [],
                auto_suspend_on_expiry: true,
                note: '',
                apply_now: true,
            };
        },
        tenantStorefrontUrl(tenant) {
            const customUrl = String(tenant?.storefront_url || '').trim();
            if (customUrl) {
                return customUrl;
            }
            const primaryDomain = String(tenant?.primary_domain || '').trim();
            if (primaryDomain) {
                return `https://${primaryDomain}`;
            }
            const code = String(tenant?.code || '').trim();
            if (!code || code === 'default') {
                return '/';
            }
            return `/t/${encodeURIComponent(code)}`;
        },
        tenantAbsoluteUrl(path) {
            try {
                return new URL(path, window.location.origin).toString();
            } catch (error) {
                return path;
            }
        },
        tenantStorefrontLink(tenant) {
            return this.tenantAbsoluteUrl(this.tenantStorefrontUrl(tenant));
        },
        tenantAdminUrl(tenant) {
            const customUrl = String(tenant?.admin_url || '').trim();
            if (customUrl) {
                return customUrl;
            }
            const primaryAdminDomain = String(tenant?.primary_admin_domain || '').trim();
            if (primaryAdminDomain) {
                return `https://${primaryAdminDomain}`;
            }
            const primaryDomain = String(tenant?.primary_domain || '').trim();
            if (primaryDomain) {
                return `https://${primaryDomain}/admin`;
            }
            const code = String(tenant?.code || '').trim();
            if (!code || code === 'default') {
                return '/admin';
            }
            return `/admin/t/${encodeURIComponent(code)}`;
        },
        tenantAdminLink(tenant) {
            return this.tenantAbsoluteUrl(this.tenantAdminUrl(tenant));
        },
        async fetchPlatformTenants() {
            if (!this.isPlatformAdmin) return;
            const { data } = await api.get('/admin/platform/tenants');
            this.platformTenants = data.tenants || [];
            this.platformBillingTenants = this.platformTenants.map((tenant) => ({
                id: tenant.id,
                code: tenant.code,
                name: tenant.name,
                status: tenant.status,
            }));
            if (!this.showBillingEditor && !this.platformBillingRecords.length) {
                this.billingEditorForm = this.defaultBillingEditorForm();
                this.rememberBillingSnapshot();
            }
            this.platformTenantStats = data.stats || {
                total_count: 0,
                active_count: 0,
                healthy_count: 0,
                config_warning_count: 0,
                expiring_soon_count: 0,
                expired_count: 0,
                suspended_count: 0,
            };
        },
        async fetchAdminAuditLogs(options = {}) {
            if (!this.adminPermissionEnabled('dashboard.view')) return;
            const requestedPage = Math.max(1, Number(options.page || this.auditPagination.page || 1));
            const requestedPageSize = Math.max(1, Number(options.page_size || this.auditPagination.page_size || 20));
            const { data } = await api.get('/admin/audit-logs', {
                params: {
                    ...this.normalizeAuditLogFilters(),
                    page: requestedPage,
                    page_size: requestedPageSize,
                },
            });
            this.adminAuditLogs = data.logs || [];
            this.adminAuditSummary = {
                total_count: data.summary?.total_count || 0,
                today_count: data.summary?.today_count || 0,
                success_count: data.summary?.success_count || 0,
                error_count: data.summary?.error_count || 0,
                warning_count: data.summary?.warning_count || 0,
                info_count: data.summary?.info_count || 0,
                latest_created_at: data.summary?.latest_created_at || null,
                category_breakdown: data.summary?.category_breakdown || [],
            };
            this.auditPagination = {
                page: Number(data.pagination?.page || requestedPage),
                page_size: Number(data.pagination?.page_size || requestedPageSize),
                total_count: Number(data.pagination?.total_count || data.summary?.total_count || 0),
                total_pages: Number(data.pagination?.total_pages || 1),
                has_prev: Boolean(data.pagination?.has_prev),
                has_next: Boolean(data.pagination?.has_next),
                from_index: Number(data.pagination?.from_index || 0),
                to_index: Number(data.pagination?.to_index || 0),
            };
            this.auditScopeOptions = data.scope_options || [{ code: 'current', label: '当前租户' }];
            this.auditCategoryOptions = data.category_options || [];
            if (!this.auditScopeOptions.some((item) => item.code === this.auditLogFilters.scope)) {
                this.auditLogFilters.scope = this.auditScopeOptions[0]?.code || 'current';
            }
            this.adminAuditLastFetchedAt = new Date().toISOString();
            this.persistAdminUiState();
        },
        async exportAdminAuditLogs() {
            if (!this.adminPermissionEnabled('dashboard.view') || this.savingStates.auditExport) return;
            this.setSavingState('auditExport', true);
            try {
                const response = await api.get('/admin/audit-logs', {
                    params: {
                        ...this.normalizeAuditLogFilters(),
                        export: 'csv',
                    },
                    responseType: 'blob',
                });
                const blobUrl = URL.createObjectURL(response.data);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = 'audit-logs-' + new Date().toISOString().slice(0, 10) + '.csv';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(blobUrl);
                this.toastMessage('操作日志导出已开始');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('auditExport', false);
            }
        },
        openTenantEditor(tenant = null) {
            this.showTenantEditor = true;
            this.tenantEditorForm = tenant
                ? {
                      id: tenant.id,
                      code: tenant.code || '',
                      name: tenant.name || '',
                      status: tenant.status || 'active',
                      expires_at: tenant.expires_at ? String(tenant.expires_at).slice(0, 10) : '',
                      subscription_name: tenant.subscription_name || '标准版',
                      max_user_count: Number(tenant.max_user_count || 0),
                      max_order_count: Number(tenant.max_order_count || 0),
                      max_plan_count: Number(tenant.max_plan_count || 0),
                      max_device_count: Number(tenant.max_device_count || 0),
                      subscription_type: tenant.subscription_type || 'paid',
                      auto_suspend_on_expiry: tenant.auto_suspend_on_expiry !== false,
                      primary_domain: tenant.primary_domain || '',
                      domain_bindings_text: Array.isArray(tenant.domain_bindings) ? tenant.domain_bindings.join('\n') : '',
                      primary_admin_domain: tenant.primary_admin_domain || '',
                      admin_domain_bindings_text: Array.isArray(tenant.admin_domain_bindings) ? tenant.admin_domain_bindings.join('\n') : '',
                      features: this.normalizeTenantFeatureSelection(
                          tenant.features,
                          Object.keys(this.tenantFeatureCatalog()),
                      ),
                      contact_name: tenant.contact_name || '',
                      contact_phone: tenant.contact_phone || '',
                      note: tenant.note || '',
                      admin_username: tenant.admin_username || '',
                      admin_nickname: tenant.admin_nickname || '',
                      admin_phone: tenant.admin_phone || '',
                      admin_password: '',
                      admin_password_confirm: '',
                  }
                : this.defaultTenantEditorForm();
            this.resetSecretFieldVisibility(['tenant_admin_password', 'tenant_admin_password_confirm']);
            this.rememberTenantSnapshot();
        },
        closeTenantEditor(force = false) {
            if (!force && !this.confirmDiscardSection(this.isTenantEditorDirty, '租户编辑内容还没有保存，确认关闭吗？')) {
                return;
            }
            this.showTenantEditor = false;
            this.tenantEditorForm = this.defaultTenantEditorForm();
            this.resetSecretFieldVisibility(['tenant_admin_password', 'tenant_admin_password_confirm']);
            this.rememberTenantSnapshot();
        },
        async saveTenantEditor() {
            if (!this.isPlatformAdmin) return this.toastMessage('仅平台管理员可操作');
            if (!this.tenantEditorForm.code) return this.toastMessage('请输入租户编码');
            if (!this.tenantEditorForm.name) return this.toastMessage('请输入租户名称');
            if (!this.tenantEditorForm.admin_username) return this.toastMessage('请输入租户管理员账号');
            if (this.tenantEditorForm.admin_password !== this.tenantEditorForm.admin_password_confirm) {
                return this.toastMessage('两次输入的租户管理员密码不一致');
            }
            if (!this.tenantEditorForm.id && !this.tenantEditorForm.admin_password) {
                return this.toastMessage('新建租户时请设置管理员密码');
            }
            if (this.savingStates.tenants) return;
            this.setSavingState('tenants', true);
            try {
                const payload = {
                    ...this.tenantEditorForm,
                    features: this.normalizeTenantFeatureSelection(this.tenantEditorForm.features, Object.keys(this.tenantFeatureCatalog())),
                };
                if (payload.id) {
                    await api.put(`/admin/platform/tenants/${payload.id}`, payload);
                } else {
                    await api.post('/admin/platform/tenants', payload);
                }
                await Promise.all([
                    this.fetchPlatformTenants(),
                    this.fetchStorefront(),
                    this.adminPermissionEnabled('dashboard.view') ? this.fetchAdminDashboard() : Promise.resolve(),
                ]);
                this.closeTenantEditor(true);
                this.toastMessage('租户信息已保存');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('tenants', false);
            }
        },
        async fetchAdminDashboard() {
            const { data } = await api.get('/admin/dashboard');
            this.adminDashboard = data;
            if (data?.tenant) {
                this.currentTenant = {
                    ...(this.currentTenant || {}),
                    ...(data.tenant || {}),
                };
            }
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
                this.adminOrders = this.adminOrders.map((order) => ({
                    ...order,
                    device_submission: {
                        ...(order.device_submission || {}),
                        outbound_company: order?.device_submission?.outbound_company || '',
                        outbound_tracking: order?.device_submission?.outbound_tracking || '',
                    },
                    _dropship_target_tenant_id: String(order?.dropship?.target_tenant_id || ''),
                }));
                const visibleIds = new Set(this.adminOrders.map((order) => order.id));
                this.selectedAdminOrderIds = this.selectedAdminOrderIds.filter((id) => visibleIds.has(id));
                if (this.activeAdminTrackOrderId && !visibleIds.has(this.activeAdminTrackOrderId)) {
                    this.closeAdminTrackModal();
                }
                this.adminOrdersLastFetchedAt = new Date().toISOString();
                this.persistAdminUiState();
                this.syncAdminWorkflowPolling();
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
                this.toastMessage('订单导出已开始');
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
            this.prepareAdminAccountForm();
            this.resetSecretFieldVisibility([
                'admin_account_current_password',
                'admin_account_new_password',
                'admin_account_confirm_password',
                'logistics_authorization',
                'logistics_sign_key',
            ]);
        },
        prepareAdminAccountForm() {
            this.adminAccountForm = {
                username: this.currentUser?.username || '',
                current_password: '',
                new_password: '',
                confirm_password: '',
            };
            this.resetSecretFieldVisibility(['admin_account_current_password', 'admin_account_new_password', 'admin_account_confirm_password']);
            this.rememberAccountSnapshot();
        },
        async fetchTeamMembers() {
            if (!this.adminPermissionEnabled('team.manage')) return;
            const { data } = await api.get('/admin/team/members');
            this.adminTeamMembers = data.members || [];
            this.teamRoleOptions = data.role_options || [];
            this.teamSummary = {
                total_count: data.summary?.total_count || 0,
                active_count: data.summary?.active_count || 0,
                disabled_count: data.summary?.disabled_count || 0,
                role_breakdown: data.summary?.role_breakdown || [],
            };
            if (!this.showTeamEditor) {
                this.teamEditorForm = this.defaultTeamEditorForm();
                this.rememberTeamSnapshot();
            }
        },
        openTeamEditor(member = null) {
            this.showTeamEditor = true;
            this.teamEditorForm = member
                ? {
                      id: member.id,
                      username: member.username || '',
                      nickname: member.nickname || '',
                      phone: member.phone || '',
                      role: member.role || 'staff_service',
                      status: member.status || 'active',
                      permissions: this.normalizeTeamPermissionSelection(member.permissions || []),
                      password: '',
                      password_confirm: '',
                  }
                : this.defaultTeamEditorForm();
            this.resetSecretFieldVisibility(['team_member_password', 'team_member_password_confirm']);
            this.rememberTeamSnapshot();
        },
        closeTeamEditor(force = false) {
            if (!force && !this.confirmDiscardSection(this.isTeamEditorDirty, '团队成员编辑内容还没有保存，确认关闭吗？')) {
                return;
            }
            this.showTeamEditor = false;
            this.teamEditorForm = this.defaultTeamEditorForm();
            this.resetSecretFieldVisibility(['team_member_password', 'team_member_password_confirm']);
            this.rememberTeamSnapshot();
        },
        onTeamRoleChange() {
            this.resetTeamPermissionsToRole();
        },
        async saveTeamMember() {
            if (!this.teamEditorForm.username) return this.toastMessage('请输入员工账号');
            if (this.teamEditorForm.password !== this.teamEditorForm.password_confirm) {
                return this.toastMessage('两次输入的员工密码不一致');
            }
            if (!this.teamEditorForm.id && !this.teamEditorForm.password) {
                return this.toastMessage('新建员工时请填写密码');
            }
            if (this.savingStates.team) return;
            this.setSavingState('team', true);
            try {
                const payload = {
                    ...this.teamEditorForm,
                    permissions: this.normalizeTeamPermissionSelection(this.teamEditorForm.permissions),
                };
                if (payload.id) {
                    await api.put(`/admin/team/members/${payload.id}`, payload);
                } else {
                    await api.post('/admin/team/members', payload);
                }
                await this.fetchTeamMembers();
                this.closeTeamEditor(true);
                this.toastMessage('团队成员已保存');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('team', false);
            }
        },
        async toggleTeamMemberStatus(member) {
            if (!member?.id) return;
            if (this.savingStates.team) return;
            this.setSavingState('team', true);
            try {
                await api.put(`/admin/team/members/${member.id}`, {
                    ...member,
                    status: member.status === 'active' ? 'disabled' : 'active',
                    permissions: this.normalizeTeamPermissionSelection(member.permissions || []),
                });
                await this.fetchTeamMembers();
                this.toastMessage(member.status === 'active' ? '员工已停用' : '员工已启用');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('team', false);
            }
        },
        async fetchPlatformBillingRecords() {
            if (!this.isPlatformAdmin || !this.adminPermissionEnabled('billing.manage')) return;
            const { data } = await api.get('/admin/platform/billing-records');
            this.platformBillingRecords = data.records || [];
            this.platformBillingTenants = data.tenants || [];
            if (!this.showBillingEditor) {
                this.billingEditorForm = this.defaultBillingEditorForm();
                this.rememberBillingSnapshot();
            }
        },
        openBillingEditor(seed = null) {
            this.showBillingEditor = true;
            this.billingEditorForm = seed
                ? {
                      ...this.defaultBillingEditorForm(),
                      ...seed,
                  }
                : this.defaultBillingEditorForm();
            this.rememberBillingSnapshot();
        },
        buildTenantBillingSeed(tenant) {
            const name = tenant?.name || tenant?.code || '';
            return {
                tenant_id: String(tenant?.id || ''),
                subscription_name: tenant?.subscription_name || '',
                duration_days: 30,
                max_user_count: tenant?.max_user_count,
                max_order_count: tenant?.max_order_count,
                max_plan_count: tenant?.max_plan_count,
                max_device_count: tenant?.max_device_count,
                features: this.normalizeTenantFeatureSelection(tenant?.features || []),
                auto_suspend_on_expiry: tenant?.auto_suspend_on_expiry !== false,
                note: name ? `续费 ${name}` : '',
            };
        },
        buildBillingRecordSeed(record) {
            return {
                tenant_id: String(record?.tenant_id || ''),
                kind: record?.kind || 'renewal',
                subscription_name: record?.subscription_name || '',
                amount: record?.amount || 0,
                duration_days: record?.duration_days || 0,
                max_user_count: record?.payload?.max_user_count ?? '',
                max_order_count: record?.payload?.max_order_count ?? '',
                max_plan_count: record?.payload?.max_plan_count ?? '',
                max_device_count: record?.payload?.max_device_count ?? '',
                features: this.normalizeTenantFeatureSelection(record?.payload?.features || []),
                auto_suspend_on_expiry: record?.payload?.auto_suspend_on_expiry !== false,
                note: record?.note || '',
                apply_now: true,
            };
        },
        closeBillingEditor(force = false) {
            if (!force && !this.confirmDiscardSection(this.isBillingEditorDirty, '计费记录表单还没有保存，确认关闭吗？')) {
                return;
            }
            this.showBillingEditor = false;
            this.billingEditorForm = this.defaultBillingEditorForm();
            this.rememberBillingSnapshot();
        },
        async saveBillingRecord() {
            if (!this.billingEditorForm.tenant_id) return this.toastMessage('请选择目标租户');
            if (this.savingStates.billing) return;
            this.setSavingState('billing', true);
            try {
                const payload = {
                    ...this.billingEditorForm,
                };
                const normalizedFeatures = this.normalizeTenantFeatureSelection(this.billingEditorForm.features);
                if (normalizedFeatures.length) {
                    payload.features = normalizedFeatures;
                } else {
                    delete payload.features;
                }
                await api.post('/admin/platform/billing-records', payload);
                await Promise.all([this.fetchPlatformBillingRecords(), this.fetchPlatformTenants()]);
                this.closeBillingEditor(true);
                this.toastMessage('计费记录已创建');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('billing', false);
            }
        },
        async applyBillingRecord(record) {
            if (!record?.id) return;
            if (this.savingStates.billing) return;
            this.setSavingState('billing', true);
            try {
                await api.post(`/admin/platform/billing-records/${record.id}/apply`);
                await Promise.all([this.fetchPlatformBillingRecords(), this.fetchPlatformTenants(), this.fetchAdminDashboard(), this.fetchStorefront()]);
                this.toastMessage('授权已应用到租户');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('billing', false);
            }
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
                this.toastMessage('套餐已保存');
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
                this.toastMessage('套餐已删除');
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
                this.toastMessage('设备已保存');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('device', false);
            }
        },
        async copyAdminOrderDispatchInfo(order) {
            await this.copyText(this.buildAdminOrderDispatchInfo(order), '代发信息已复制');
        },
        async dispatchAdminOrder(order) {
            if (!order?.id) return;
            if (!order?._dropship_target_tenant_id) {
                return this.toastMessage('请先选择代发目标后台');
            }
            const targetTenant = this.availableDropshipTargets(order).find(
                (tenant) => String(tenant.id) === String(order._dropship_target_tenant_id),
            );
            if (!targetTenant) {
                return this.toastMessage('代发目标后台不存在或不可用');
            }
            await this.runAdminOrderAction(order, async () => {
                const { data } = await api.post('/admin/orders/' + order.id + '/dropship', {
                    target_tenant_id: order._dropship_target_tenant_id,
                });
                await Promise.all([this.fetchAdminOrders(), this.fetchAdminDashboard()]);
                this.toastMessage(`已代发到 ${data?.target_tenant?.name || targetTenant.name}，目标订单号 ${data?.target_order?.order_no || ''}`);
            }).catch((error) => {
                this.toastMessage(this.errorMessage(error));
            });
        },
        async deleteDevice(device) {
            if (!window.confirm('确认删除设备 ' + device.name + ' 吗？')) return;
            try {
                await api.delete('/admin/devices/' + device.id);
                await Promise.all([this.fetchAdminDevices(), this.fetchStorefront(), this.fetchAdminDashboard()]);
                this.toastMessage('设备已删除');
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
                    ems: order.ems,
                });
                await Promise.all([this.fetchAdminOrders(), this.fetchAdminDashboard(), this.fetchStorefront()]);
                this.toastMessage('订单处理结果已保存');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setOrderSaving(order.id, false);
            }
        },
        async deleteAdminOrder(order) {
            if (!order?.id) return;
            this.openAdminDeleteModal(order);
        },
        async confirmDeleteAdminOrders() {
            const orderIds = Array.from(
                new Set(this.adminDeleteOrderIds.map((item) => Number(item || 0)).filter((item) => Number.isFinite(item) && item > 0)),
            );
            if (!orderIds.length) {
                this.toastMessage('请先选择要删除的订单');
                return;
            }
            if (this.savingStates.deleteOrders) return;

            this.setSavingState('deleteOrders', true);
            orderIds.forEach((orderId) => this.setOrderSaving(orderId, true));

            try {
                let deletedCount = 0;
                if (orderIds.length === 1) {
                    await api.delete('/admin/orders/' + orderIds[0]);
                    deletedCount = 1;
                } else {
                    const { data } = await api.post('/admin/orders/batch-delete', {
                        order_ids: orderIds,
                    });
                    deletedCount = Number(data?.deleted_count || orderIds.length);
                }

                if (orderIds.includes(this.activeAdminTrackOrderId)) {
                    this.closeAdminTrackModal();
                }
                this.selectedAdminOrderIds = this.selectedAdminOrderIds.filter((id) => !orderIds.includes(id));
                this.closeAdminDeleteModal(true);
                await Promise.all([this.fetchAdminOrders(), this.fetchAdminDashboard()]);
                this.toastMessage(deletedCount > 1 ? `已删除 ${deletedCount} 单订单` : '订单已删除');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                orderIds.forEach((orderId) => this.setOrderSaving(orderId, false));
                this.setSavingState('deleteOrders', false);
            }
        },
        async applyBatchOrderStatus() {
            const selectedOrders = this.selectedAdminOrders();
            if (!selectedOrders.length) {
                this.toastMessage('请先选择要处理的订单');
                return;
            }
            if (!this.adminBatchStatus) {
                this.toastMessage('请先选择要批量设置的状态');
                return;
            }
            if (this.savingStates.batchOrders) return;

            this.setSavingState('batchOrders', true);
            let successCount = 0;
            let failedCount = 0;
            const failedOrders = [];

            try {
                for (const order of selectedOrders) {
                    this.setOrderSaving(order.id, true);
                    try {
                        await api.put('/admin/orders/' + order.id, {
                            status: this.adminBatchStatus,
                        });
                        successCount += 1;
                    } catch (error) {
                        failedCount += 1;
                        failedOrders.push(order.order_no);
                    } finally {
                        this.setOrderSaving(order.id, false);
                    }
                }
                await Promise.all([this.fetchAdminOrders(), this.fetchAdminDashboard()]);
                const failedText = failedOrders.length ? `，失败订单：${failedOrders.slice(0, 3).join('、')}` : '';
                this.toastMessage(`批量状态更新完成：成功 ${successCount}，失败 ${failedCount}${failedText}`);
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('batchOrders', false);
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
            if (!this.qrFiles.wechat && !this.qrFiles.alipay) return this.toastMessage('请至少选择一张收款码图片');
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
                this.toastMessage('收款码上传成功');
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
                this.toastMessage('店铺设置已保存');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('settings', false);
            }
        },
        async saveLogisticsSettings() {
            if (this.savingStates.settings) return;
            this.setSavingState('settings', true);
            try {
                await api.put('/admin/settings', {
                    logistics: {
                        ...(this.adminSettingsForm.logistics || {}),
                    },
                });
                await Promise.all([this.fetchAdminSettings(), this.fetchStorefront()]);
                this.toastMessage('物流设置已保存');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('settings', false);
            }
        },
        async saveAdminAccount() {
            if (!this.adminAccountForm.username) {
                return this.toastMessage('请输入管理员账号');
            }
            if (!this.adminAccountForm.current_password) {
                return this.toastMessage('请输入当前密码');
            }
            if (this.adminAccountForm.new_password && this.adminAccountForm.new_password !== this.adminAccountForm.confirm_password) {
                return this.toastMessage('两次输入的新密码不一致');
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
                this.resetSecretFieldVisibility([
                    'admin_account_current_password',
                    'admin_account_new_password',
                    'admin_account_confirm_password',
                ]);
                this.rememberAccountSnapshot();
                this.toastMessage('管理员账号设置已保存');
            } catch (error) {
                this.toastMessage(this.errorMessage(error));
            } finally {
                this.setSavingState('account', false);
            }
        },
    },
};

const appRoot = document.getElementById('app');

try {
    Vue.createApp(App).mount('#app');
    if (appRoot) {
        appRoot.dataset.appMounted = 'true';
    }
} catch (error) {
    console.error('Failed to mount app:', error);
    if (typeof window.__renderAppBootMessage === 'function') {
        window.__renderAppBootMessage({
            title: '页面加载失败',
            message: error?.message || '应用初始化失败，请刷新后重试。',
            error: true,
        });
    }
    throw error;
}
