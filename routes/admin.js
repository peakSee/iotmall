const fs = require('fs');
const dns = require('dns').promises;
const axios = require('axios');
const express = require('express');
const auth = require('../middleware/auth');
const { uploadEntityImage, uploadPaymentQrs } = require('../middleware/upload');
const {
    ROLE_DEFINITIONS,
    getPermissionDefinition,
    getRoleLabel,
    getRoleDescription,
    getRolePermissions,
    hasPermission,
    isBackofficeRole,
    isPlatformAdminRole,
    isTenantAdminRole,
    normalizePermissions,
    normalizeUserRole,
} = require('../utils/access-control');
const { buildStructuredOrderView, buildTrackingNumber: buildOrderTrackingNumber, detectLogisticsStage } = require('../utils/order-helpers');
const { verifyPassword } = require('../utils/auth');
const { safeRecordAdminAuditLog } = require('../utils/admin-audit');
const {
    DEVICE_CATEGORIES,
    ORDER_STATUSES,
    buildOrderSummary,
    commitStoreChanges,
    deleteDevice,
    deletePlan,
    makeBillingRecordNo,
    makeOrderNo,
    makeSlug,
    normalizeDevice,
    normalizePlan,
    normalizeTenantBillingRecord,
    publicPathToDisk,
    readAuditLogs,
    readDevices,
    readOrders,
    readPlans,
    readSettings,
    readTenantBillingRecords,
    readTenants,
    readUsers,
    saveDevice,
    saveOrder,
    savePlan,
    saveTenantBillingRecord,
    saveTenant,
    saveUser,
    toInteger,
    toNumber,
    toStringArray,
    writeSettings,
} = require('../utils/store');
const { DEFAULT_TENANT_CODE, getCurrentTenantCode, normalizeTenantCode, runWithTenantContext } = require('../utils/tenant-context');
const {
    buildTenantLimitExceededMessage,
    buildTenantLimitSummary,
    buildTenantUsageCounts,
    hasTenantFeature,
    normalizeTenantLicense,
    resolveTenantExpiryInfo,
} = require('../utils/tenant-license');
const {
    analyzeTrackQueryResult,
    assertPrintPreflight,
    checkReachability,
    createWaybillOrder,
    dispatchPrintJob,
    extractAddressDetail,
    formatTimestamp,
    getCloudPrintDownloadUrl,
    getEmsConfig,
    getPrintDiagnostics,
    getLabelDocument,
    normalizePartyAddress,
    isEmsManagedOrder,
    parseAddress,
    queryTrackItems,
    summarizeLatestTrack,
    validatePartyAddress,
} = require('../utils/ems');
const {
    buildOrderNoticeSnapshot,
    syncOrderLogisticsUserNotices,
} = require('../utils/user-notices');

const router = express.Router();

function asyncHandler(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const AUDIT_CATEGORY_LABELS = {
    auth: '账号安全',
    settings: '店铺设置',
    team: '团队权限',
    platform: '租户授权',
    billing: '计费授权',
    catalog: '商品维护',
    orders: '订单处理',
    logistics: '物流履约',
};

function isAdminRole(role = '') {
    return isBackofficeRole(role);
}

function ensureAdmin(req, res) {
    if (!isAdminRole(req.userRole)) {
        res.status(403).json({ error: '仅管理员可访问。' });
        return false;
    }
    return true;
}

function ensurePermission(req, res, permissionCode, message = '当前账号没有该操作权限。') {
    if (hasPermission(req.userPermissions || [], permissionCode)) {
        return true;
    }
    res.status(403).json({ error: message });
    return false;
}

function ensureAdminPermission(req, res, permissionCode, message = '当前账号没有该操作权限。') {
    if (!ensureAdmin(req, res)) {
        return false;
    }
    if (!permissionCode) {
        return true;
    }
    return ensurePermission(req, res, permissionCode, message);
}

function ensurePlatformAdmin(req, res) {
    if (!isPlatformAdminRole(req.userRole)) {
        res.status(403).json({ error: '仅平台管理员可访问。' });
        return false;
    }
    return true;
}

function removePublicFile(publicPath) {
    const filePath = publicPathToDisk(publicPath);
    if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

function removeTempFile(file) {
    if (file?.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
    }
}

function removeTempFilesMap(files = {}) {
    Object.values(files).forEach((fileList) => {
        (Array.isArray(fileList) ? fileList : []).forEach(removeTempFile);
    });
}

function toBooleanFlag(value, fallbackValue = false) {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return fallbackValue;
}

function arraysEqual(left = [], right = []) {
    if (left.length !== right.length) return false;
    return left.every((item, index) => item === right[index]);
}

function safeText(value, fallbackValue = '') {
    return String(value ?? fallbackValue).trim();
}

function preferText(value, fallbackValue = '') {
    return safeText(value) || safeText(fallbackValue);
}

function normalizeDomainHost(value, fallbackValue = '') {
    const text = safeText(value, fallbackValue).toLowerCase();
    if (!text) {
        return '';
    }
    return text
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/:\d+$/, '')
        .replace(/\.+$/g, '')
        .trim();
}

function normalizeDomainList(value, fallbackValue = []) {
    const fallbackList = Array.isArray(fallbackValue) ? fallbackValue : [];
    const source = toStringArray(value);
    const normalized = Array.from(new Set(source.map((item) => normalizeDomainHost(item)).filter(Boolean)));
    return normalized.length ? normalized : fallbackList.map((item) => normalizeDomainHost(item)).filter(Boolean);
}

function buildTenantStorefrontUrl(tenant = {}) {
    const primaryDomain = normalizeDomainHost(tenant.primary_domain);
    if (primaryDomain) {
        return `https://${primaryDomain}`;
    }
    return tenant.code === DEFAULT_TENANT_CODE ? '/' : `/t/${encodeURIComponent(tenant.code)}`;
}

function buildTenantAdminUrl(tenant = {}) {
    const primaryAdminDomain = normalizeDomainHost(tenant.primary_admin_domain);
    if (primaryAdminDomain) {
        return `https://${primaryAdminDomain}`;
    }

    const primaryDomain = normalizeDomainHost(tenant.primary_domain);
    if (primaryDomain) {
        return `https://${primaryDomain}/admin`;
    }

    return tenant.code === DEFAULT_TENANT_CODE ? '/admin' : `/admin/t/${encodeURIComponent(tenant.code)}`;
}

function collectTenantDomains(tenant = {}) {
    return {
        storefront: Array.from(
            new Set([normalizeDomainHost(tenant.primary_domain), ...normalizeDomainList(tenant.domain_bindings)].filter(Boolean)),
        ),
        admin: Array.from(
            new Set([normalizeDomainHost(tenant.primary_admin_domain), ...normalizeDomainList(tenant.admin_domain_bindings)].filter(Boolean)),
        ),
    };
}

function getRequestOrigin(req) {
    const forwardedProto = safeText(req?.headers?.['x-forwarded-proto']).split(',')[0];
    const protocol = safeText(forwardedProto || req?.protocol || 'http') || 'http';
    const forwardedHost = safeText(req?.headers?.['x-forwarded-host']).split(',')[0];
    const host = safeText(forwardedHost || req?.headers?.host || '127.0.0.1:3000');
    return `${protocol}://${host}`;
}

function buildTenantProxyTargets(tenant = {}, req = null) {
    const requestOrigin = getRequestOrigin(req);
    const baseOrigin = requestOrigin.replace(/\/+$/, '');
    const storefrontPath = tenant?.code === DEFAULT_TENANT_CODE ? '/' : `/t/${encodeURIComponent(tenant?.code || DEFAULT_TENANT_CODE)}/`;
    const adminPath = tenant?.code === DEFAULT_TENANT_CODE ? '/admin/' : `/admin/t/${encodeURIComponent(tenant?.code || DEFAULT_TENANT_CODE)}/`;
    return {
        base_origin: baseOrigin,
        storefront_target: new URL(storefrontPath, `${baseOrigin}/`).toString(),
        admin_target: new URL(adminPath, `${baseOrigin}/`).toString(),
    };
}

function buildNginxProxySnippet(domain = '', targetUrl = '') {
    const normalizedDomain = normalizeDomainHost(domain);
    const normalizedTarget = safeText(targetUrl);
    if (!normalizedDomain || !normalizedTarget) {
        return '';
    }

    return [
        'server {',
        '    listen 80;',
        `    server_name ${normalizedDomain};`,
        '',
        '    client_max_body_size 50m;',
        '',
        '    location / {',
        `        proxy_pass ${normalizedTarget};`,
        '        proxy_set_header Host $host;',
        '        proxy_set_header X-Real-IP $remote_addr;',
        '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
        '        proxy_set_header X-Forwarded-Proto $scheme;',
        '        proxy_http_version 1.1;',
        '        proxy_set_header Upgrade $http_upgrade;',
        "        proxy_set_header Connection 'upgrade';",
        '    }',
        '}',
    ].join('\n');
}

function buildBaotaGuide(domain = '', targetUrl = '', label = '前台') {
    const normalizedDomain = normalizeDomainHost(domain);
    if (!normalizedDomain) {
        return '';
    }
    return [
        `1. 在宝塔新建站点：${normalizedDomain}`,
        '2. 站点类型选纯静态，PHP 可关闭',
        '3. 在“反向代理”里新增目标',
        `4. 代理目标填：${targetUrl}`,
        '5. 保留 Host / X-Forwarded-For / X-Forwarded-Proto 请求头',
        `6. 如果这是 ${label} 域名，确认访问后页面已进入对应租户`,
        '7. 最后在 SSL 里申请并启用证书',
    ].join('\n');
}

function describeProbeError(error) {
    const code = safeText(error?.code);
    if (code === 'ECONNABORTED') return '连接超时';
    if (code === 'ENOTFOUND') return '域名未解析';
    if (code === 'ECONNREFUSED') return '连接被拒绝';
    if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT') return '检测到自签名证书';
    if (code === 'ERR_TLS_CERT_ALTNAME_INVALID') return '证书域名不匹配';
    if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') return '证书链不完整';
    return safeText(error?.message, code || '请求失败');
}

async function probeUrl(url = '') {
    const targetUrl = safeText(url);
    if (!targetUrl) {
        return {
            ok: false,
            status: 0,
            message: '未配置检测地址',
            code: 'EMPTY_URL',
        };
    }

    try {
        const response = await axios.get(targetUrl, {
            timeout: 4000,
            maxRedirects: 0,
            validateStatus: () => true,
            headers: {
                'User-Agent': 'iot-mall-domain-check/1.0',
            },
        });
        return {
            ok: response.status > 0,
            status: response.status,
            location: safeText(response.headers?.location),
            message: response.status ? `HTTP ${response.status}` : '已响应',
            code: '',
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            location: '',
            message: describeProbeError(error),
            code: safeText(error?.code),
        };
    }
}

async function resolveDomainRecords(domain = '') {
    const normalizedDomain = normalizeDomainHost(domain);
    if (!normalizedDomain) {
        return {
            a_records: [],
            aaaa_records: [],
            cname_records: [],
            dns_ok: false,
        };
    }

    const [aResult, aaaaResult, cnameResult] = await Promise.allSettled([
        dns.resolve4(normalizedDomain),
        dns.resolve6(normalizedDomain),
        dns.resolveCname(normalizedDomain),
    ]);

    const aRecords = aResult.status === 'fulfilled' ? aResult.value : [];
    const aaaaRecords = aaaaResult.status === 'fulfilled' ? aaaaResult.value : [];
    const cnameRecords = cnameResult.status === 'fulfilled' ? cnameResult.value : [];

    return {
        a_records: Array.isArray(aRecords) ? aRecords : [],
        aaaa_records: Array.isArray(aaaaRecords) ? aaaaRecords : [],
        cname_records: Array.isArray(cnameRecords) ? cnameRecords : [],
        dns_ok: Boolean((Array.isArray(aRecords) && aRecords.length) || (Array.isArray(aaaaRecords) && aaaaRecords.length) || (Array.isArray(cnameRecords) && cnameRecords.length)),
    };
}

function buildDomainCheckTone(check = {}) {
    if (!safeText(check.domain)) {
        return 'muted';
    }
    if (check.https_ok) {
        return 'success';
    }
    if (check.dns_ok || check.http_ok) {
        return 'warning';
    }
    return 'danger';
}

function buildDomainCheckSummary(check = {}) {
    if (!safeText(check.domain)) {
        return '未配置域名';
    }
    if (check.https_ok) {
        return 'HTTPS 可访问';
    }
    if (!check.dns_ok) {
        return '域名未解析';
    }
    if (check.http_ok && !check.https_ok) {
        return 'HTTP 可访问，建议补 HTTPS 证书';
    }
    return '已解析，待检查反代或证书';
}

function buildDomainCheckHints(check = {}) {
    const hints = [];
    if (!safeText(check.domain)) {
        hints.push('请先绑定独立域名，再执行域名自检。');
        return hints;
    }
    if (!check.dns_ok) {
        hints.push('请先在 DNS 服务商处为该域名添加 A 记录或 CNAME 记录。');
    }
    if (!check.http_ok) {
        hints.push('请确认站点或反向代理已创建，并且 80 端口可访问。');
    }
    if (!check.https_ok) {
        hints.push('请在宝塔或 Nginx 站点里申请并启用 SSL 证书。');
    }
    if (check.https_probe?.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
        hints.push('当前证书与域名不匹配，请重新申请正确域名的证书。');
    }
    if (!hints.length) {
        hints.push('当前域名检测通过，可以继续正常使用。');
    }
    return hints;
}

async function buildSingleDomainDiagnostic(domain = '', role = 'storefront', targetUrl = '') {
    const normalizedDomain = normalizeDomainHost(domain);
    const records = await resolveDomainRecords(normalizedDomain);
    const [httpProbe, httpsProbe] = normalizedDomain
        ? await Promise.all([probeUrl(`http://${normalizedDomain}`), probeUrl(`https://${normalizedDomain}`)])
        : [await probeUrl(''), await probeUrl('')];
    const result = {
        domain: normalizedDomain,
        role,
        dns_ok: records.dns_ok,
        a_records: records.a_records,
        aaaa_records: records.aaaa_records,
        cname_records: records.cname_records,
        http_ok: Boolean(httpProbe.ok),
        https_ok: Boolean(httpsProbe.ok),
        certificate_ok: Boolean(httpsProbe.ok),
        http_probe: httpProbe,
        https_probe: httpsProbe,
        target_url: safeText(targetUrl),
    };
    result.tone = buildDomainCheckTone(result);
    result.summary = buildDomainCheckSummary(result);
    result.hints = buildDomainCheckHints(result);
    return result;
}

async function buildTenantDomainDiagnostics(tenant = {}, req = null) {
    const domains = collectTenantDomains(tenant);
    const targets = buildTenantProxyTargets(tenant, req);
    const suggestedStorefrontDomain = domains.storefront[0] || `${safeText(tenant.code, 'tenant')}.example.com`;
    const suggestedAdminDomain = domains.admin[0] || `admin.${safeText(tenant.code, 'tenant')}.example.com`;
    const storefrontDiagnostics = await Promise.all(
        domains.storefront.map((domain) => buildSingleDomainDiagnostic(domain, 'storefront', targets.storefront_target)),
    );
    const adminDiagnostics = await Promise.all(domains.admin.map((domain) => buildSingleDomainDiagnostic(domain, 'admin', targets.admin_target)));
    const allDiagnostics = [...storefrontDiagnostics, ...adminDiagnostics];

    return {
        tenant_id: tenant.id,
        tenant_code: tenant.code,
        tenant_name: tenant.name,
        base_origin: targets.base_origin,
        storefront_target: targets.storefront_target,
        admin_target: targets.admin_target,
        storefront_domains: storefrontDiagnostics,
        admin_domains: adminDiagnostics,
        summary: {
            total_domains: allDiagnostics.length,
            success_count: allDiagnostics.filter((item) => item.tone === 'success').length,
            warning_count: allDiagnostics.filter((item) => item.tone === 'warning').length,
            danger_count: allDiagnostics.filter((item) => item.tone === 'danger').length,
            muted_count: allDiagnostics.filter((item) => item.tone === 'muted').length,
        },
        suggested_domains: {
            storefront: suggestedStorefrontDomain,
            admin: suggestedAdminDomain,
        },
        snippets: {
            storefront_nginx: buildNginxProxySnippet(suggestedStorefrontDomain, targets.storefront_target),
            admin_nginx: buildNginxProxySnippet(suggestedAdminDomain, targets.admin_target),
            storefront_baota: buildBaotaGuide(suggestedStorefrontDomain, targets.storefront_target, '前台'),
            admin_baota: buildBaotaGuide(suggestedAdminDomain, targets.admin_target, '后台'),
        },
        generated_at: new Date().toISOString(),
    };
}

function findTenantDomainConflicts(tenants = [], tenantPayload = {}, currentTenantId = 0) {
    const targetDomains = collectTenantDomains(tenantPayload);
    if (!targetDomains.storefront.length && !targetDomains.admin.length) {
        return [];
    }

    return tenants
        .filter((tenant) => tenant.id !== currentTenantId)
        .flatMap((tenant) => {
            const existingDomains = collectTenantDomains(tenant);
            return [...targetDomains.storefront, ...targetDomains.admin]
                .filter((domain) => [...existingDomains.storefront, ...existingDomains.admin].includes(domain))
                .map((domain) => ({
                    domain,
                    tenant_id: tenant.id,
                    tenant_code: tenant.code,
                    tenant_name: tenant.name,
                }));
        });
}

function isTenantExpired(tenant = {}, now = Date.now()) {
    return resolveTenantExpiryInfo(tenant?.expires_at ?? tenant?.expiresAt, now).is_expired;
}

function tenantUnavailableMessage(tenant = {}) {
    if (safeText(tenant.status) === 'suspended') {
        return '租户已暂停';
    }
    if (safeText(tenant.status) === 'inactive') {
        return '租户未启用';
    }
    if (isTenantExpired(tenant)) {
        return '租户授权已到期';
    }
    return '';
}

function buildCurrentTenantUsageCounts({ users = [], orders = [], plans = [], devices = [] } = {}) {
    return buildTenantUsageCounts({
        users: users.filter((item) => item.role === 'user').length,
        orders: orders.length,
        plans: plans.length,
        devices: devices.length,
    });
}

function isPrimaryAdminRole(role = '') {
    return isPlatformAdminRole(role) || isTenantAdminRole(role);
}

function listPrimaryAdmins(users = []) {
    return users.filter((item) => isPrimaryAdminRole(item.role));
}

function formatDateOnly(dateValue) {
    const source = dateValue ? new Date(dateValue) : new Date();
    const nextDate = Number.isNaN(source.getTime()) ? new Date() : source;
    return [
        nextDate.getFullYear(),
        String(nextDate.getMonth() + 1).padStart(2, '0'),
        String(nextDate.getDate()).padStart(2, '0'),
    ].join('-');
}

function parseDateAtEndOfDay(value) {
    const text = safeText(value);
    if (!text) {
        return null;
    }
    const normalizedText = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T23:59:59.999` : text;
    const parsedDate = new Date(normalizedText);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function resolveNextExpiryDate(baseValue, durationDays, now = new Date()) {
    const nextDays = toInteger(durationDays, 0);
    if (!nextDays) {
        return safeText(baseValue) || null;
    }

    const currentExpiry = parseDateAtEndOfDay(baseValue);
    const baseDate = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : new Date(now.getTime());
    const nextDate = new Date(baseDate.getTime());
    nextDate.setDate(nextDate.getDate() + nextDays);
    nextDate.setHours(23, 59, 59, 999);
    return formatDateOnly(nextDate);
}

function canManageBackofficeRole(actorRole = '', targetRole = '') {
    if (isPlatformAdminRole(actorRole)) {
        return true;
    }
    if (isTenantAdminRole(actorRole)) {
        return !isPlatformAdminRole(targetRole);
    }
    if (normalizeUserRole(actorRole) === 'staff_manager') {
        return !isPrimaryAdminRole(targetRole);
    }
    return false;
}

function buildAssignableRoleOptions(actorRole = '') {
    const actor = normalizeUserRole(actorRole, 'admin');
    const baseRoles = Object.keys(ROLE_DEFINITIONS).filter((roleCode) => roleCode !== 'user' && roleCode !== 'platform_admin');
    const visibleRoles = actor === 'platform_admin' ? baseRoles : baseRoles.filter((roleCode) => roleCode !== 'admin' || actor === 'admin');
    return visibleRoles
        .filter((roleCode) => canManageBackofficeRole(actor, roleCode))
        .map((roleCode) => ({
            code: roleCode,
            label: getRoleLabel(roleCode),
            description: getRoleDescription(roleCode),
            permissions: getRolePermissions(roleCode),
            permission_labels: getRolePermissions(roleCode).map((permissionCode) => getPermissionDefinition(permissionCode)),
        }));
}

function sanitizeTeamMember(user = {}) {
    const permissions = normalizePermissions(user.permissions, user.role);
    return {
        id: user.id,
        tenant_id: user.tenant_id,
        username: safeText(user.username),
        nickname: safeText(user.nickname),
        phone: safeText(user.phone),
        role: user.role,
        role_label: getRoleLabel(user.role),
        role_description: getRoleDescription(user.role),
        status: safeText(user.status, 'active'),
        permissions,
        permission_labels: permissions.map((permissionCode) => getPermissionDefinition(permissionCode)),
        created_at: user.created_at || null,
        updated_at: user.updated_at || null,
        last_login_at: user.last_login_at || null,
    };
}

function normalizeTeamMemberFormPayload(body = {}, existingUser = null) {
    const source = body && typeof body === 'object' ? body : {};
    const role = normalizeUserRole(source.role, existingUser?.role || 'staff_service');
    const rawPermissions = source.permissions_text ?? source.permissions;
    return {
        username: safeText(source.username, existingUser?.username),
        nickname: safeText(source.nickname, existingUser?.nickname),
        phone: safeText(source.phone, existingUser?.phone),
        password: safeText(source.password),
        role,
        status: ['active', 'disabled'].includes(source.status) ? source.status : existingUser?.status || 'active',
        permissions: normalizePermissions(rawPermissions == null || rawPermissions === '' ? getRolePermissions(role) : rawPermissions, role),
    };
}

function normalizeBillingRecordFormPayload(body = {}, existingRecord = null) {
    const source = body && typeof body === 'object' ? body : {};
    const payload = {
        ...(existingRecord?.payload || {}),
    };
    const hasFeatureOverride =
        source.features_text != null ||
        source.features != null ||
        source.feature_codes != null ||
        source.featureCodes != null;
    const hasAutoSuspendOverride = source.auto_suspend_on_expiry != null || source.autoSuspendOnExpiry != null;

    if (source.subscription_name != null || source.subscriptionName != null) {
        payload.subscription_name = safeText(source.subscription_name ?? source.subscriptionName);
    }
    if (source.max_user_count != null || source.maxUserCount != null) {
        payload.max_user_count = toInteger(source.max_user_count ?? source.maxUserCount, 0);
    }
    if (source.max_order_count != null || source.maxOrderCount != null) {
        payload.max_order_count = toInteger(source.max_order_count ?? source.maxOrderCount, 0);
    }
    if (source.max_plan_count != null || source.maxPlanCount != null) {
        payload.max_plan_count = toInteger(source.max_plan_count ?? source.maxPlanCount, 0);
    }
    if (source.max_device_count != null || source.maxDeviceCount != null) {
        payload.max_device_count = toInteger(source.max_device_count ?? source.maxDeviceCount, 0);
    }
    if (hasFeatureOverride) {
        payload.features = normalizeTenantLicense(source, existingRecord?.payload || {}).features;
    }
    if (hasAutoSuspendOverride) {
        payload.auto_suspend_on_expiry = toBooleanFlag(source.auto_suspend_on_expiry ?? source.autoSuspendOnExpiry, true);
    }

    return normalizeTenantBillingRecord({
        ...existingRecord,
        id: existingRecord?.id || toInteger(source.id, Date.now()),
        tenant_id: toInteger(source.tenant_id ?? source.tenantId, existingRecord?.tenant_id || 1),
        record_no: safeText(source.record_no ?? source.recordNo, existingRecord?.record_no || makeBillingRecordNo()),
        kind: safeText(source.kind, existingRecord?.kind || 'renewal'),
        subscription_name: safeText(source.subscription_name ?? source.subscriptionName, existingRecord?.subscription_name),
        amount: toNumber(source.amount ?? existingRecord?.amount, 0),
        duration_days: toInteger(source.duration_days ?? source.durationDays, existingRecord?.duration_days || 0),
        status: safeText(source.status, existingRecord?.status || 'pending'),
        note: safeText(source.note, existingRecord?.note),
        operator_id: toInteger(source.operator_id ?? source.operatorId, existingRecord?.operator_id || 0),
        operator_role: safeText(source.operator_role ?? source.operatorRole, existingRecord?.operator_role),
        payload: {
            ...(existingRecord?.payload || {}),
            ...payload,
        },
    });
}

function ensureTenantCapacity(res, tenant, counts, limitKey) {
    const errorMessage = buildTenantLimitExceededMessage(limitKey, tenant, counts);
    if (!errorMessage) {
        return true;
    }

    res.status(403).json({ error: errorMessage });
    return false;
}

function ensureTenantFeature(req, res, featureCode, fallbackMessage = '') {
    if (hasTenantFeature(req.tenant, featureCode)) {
        return true;
    }

    const message = safeText(fallbackMessage, '当前租户未开通该功能，请联系平台管理员升级授权。');
    res.status(403).json({ error: message });
    return false;
}

function normalizeTenantFormPayload(body = {}, existingTenant = null) {
    const source = body && typeof body === 'object' ? body : {};
    const normalizedCode = normalizeTenantCode(source.code, existingTenant?.code || '');
    const status = ['active', 'inactive', 'suspended'].includes(source.status) ? source.status : existingTenant?.status || 'active';
    const expiresAt = safeText(source.expires_at ?? source.expiresAt);
    const subscriptionType = ['trial', 'paid', 'manual'].includes(safeText(source.subscription_type ?? source.subscriptionType).toLowerCase())
        ? safeText(source.subscription_type ?? source.subscriptionType).toLowerCase()
        : safeText(existingTenant?.subscription_type, normalizedCode === DEFAULT_TENANT_CODE ? 'manual' : 'paid');
    const license = normalizeTenantLicense(source, {
        subscription_name: existingTenant?.subscription_name || (normalizedCode === DEFAULT_TENANT_CODE ? '平台旗舰版' : '标准版'),
        max_user_count: existingTenant?.max_user_count || 0,
        max_order_count: existingTenant?.max_order_count || 0,
        max_plan_count: existingTenant?.max_plan_count || 0,
        max_device_count: existingTenant?.max_device_count || 0,
        features: existingTenant?.features || ['storefront', 'orders', 'ems', 'printing', 'tracking', 'batch', 'analytics'],
    });
    const hasStoreDomainInput =
        Object.prototype.hasOwnProperty.call(source, 'domain_bindings_text') ||
        Object.prototype.hasOwnProperty.call(source, 'domain_bindings') ||
        Object.prototype.hasOwnProperty.call(source, 'domainBindings');
    const hasAdminDomainInput =
        Object.prototype.hasOwnProperty.call(source, 'admin_domain_bindings_text') ||
        Object.prototype.hasOwnProperty.call(source, 'admin_domain_bindings') ||
        Object.prototype.hasOwnProperty.call(source, 'adminDomainBindings');
    const hasPrimaryDomainInput =
        Object.prototype.hasOwnProperty.call(source, 'primary_domain') || Object.prototype.hasOwnProperty.call(source, 'primaryDomain');
    const hasPrimaryAdminDomainInput =
        Object.prototype.hasOwnProperty.call(source, 'primary_admin_domain') ||
        Object.prototype.hasOwnProperty.call(source, 'primaryAdminDomain');
    const domainBindings = hasStoreDomainInput
        ? normalizeDomainList(source.domain_bindings_text ?? source.domain_bindings ?? source.domainBindings, [])
        : normalizeDomainList(existingTenant?.domain_bindings, []);
    const adminDomainBindings = hasAdminDomainInput
        ? normalizeDomainList(source.admin_domain_bindings_text ?? source.admin_domain_bindings ?? source.adminDomainBindings, [])
        : normalizeDomainList(existingTenant?.admin_domain_bindings, []);
    const primaryDomain = normalizeDomainHost(
        hasPrimaryDomainInput ? source.primary_domain ?? source.primaryDomain : existingTenant?.primary_domain,
        (hasStoreDomainInput ? '' : existingTenant?.primary_domain) || domainBindings[0] || '',
    );
    const primaryAdminDomain = normalizeDomainHost(
        hasPrimaryAdminDomainInput ? source.primary_admin_domain ?? source.primaryAdminDomain : existingTenant?.primary_admin_domain,
        (hasAdminDomainInput ? '' : existingTenant?.primary_admin_domain) || adminDomainBindings[0] || '',
    );

    return {
        id: existingTenant?.id || toInteger(source.id, Date.now()),
        code: normalizedCode,
        name: safeText(source.name, existingTenant?.name || normalizedCode),
        status,
        expires_at: expiresAt || null,
        subscription_type: subscriptionType,
        trial_started_at:
            subscriptionType === 'trial'
                ? source.trial_started_at || source.trialStartedAt || existingTenant?.trial_started_at || new Date().toISOString()
                : null,
        auto_suspend_on_expiry: toBooleanFlag(
            source.auto_suspend_on_expiry ?? source.autoSuspendOnExpiry,
            existingTenant?.auto_suspend_on_expiry ?? true,
        ),
        ...license,
        primary_domain: primaryDomain,
        domain_bindings: Array.from(new Set([primaryDomain, ...domainBindings].filter(Boolean))),
        primary_admin_domain: primaryAdminDomain,
        admin_domain_bindings: Array.from(new Set([primaryAdminDomain, ...adminDomainBindings].filter(Boolean))),
        contact_name: safeText(source.contact_name ?? source.contactName, existingTenant?.contact_name),
        contact_phone: safeText(source.contact_phone ?? source.contactPhone, existingTenant?.contact_phone),
        note: safeText(source.note, existingTenant?.note),
    };
}

function normalizeTenantAdminFormPayload(body = {}, existingAdmin = null) {
    const source = body && typeof body === 'object' ? body : {};
    return {
        username: safeText(source.admin_username ?? source.adminUsername, existingAdmin?.username),
        nickname: safeText(source.admin_nickname ?? source.adminNickname, existingAdmin?.nickname),
        phone: safeText(source.admin_phone ?? source.adminPhone, existingAdmin?.phone),
        password: safeText(source.admin_password ?? source.adminPassword),
    };
}

async function buildTenantSummary(tenant) {
    return runWithTenantContext(
        {
            tenantId: tenant.id,
            tenantCode: tenant.code,
            tenant,
        },
        async () => {
            const [settings, users, plans, devices, orders] = await Promise.all([
                readSettings(),
                readUsers(),
                readPlans(),
                readDevices(),
                readOrders(),
            ]);
            const adminUser = users.find((item) => isPrimaryAdminRole(item.role));
            const usageCounts = buildCurrentTenantUsageCounts({ users, orders, plans, devices });
            const limitSummary = buildTenantLimitSummary(tenant, usageCounts);
            const expiryInfo = resolveTenantExpiryInfo(tenant.expires_at);
            const totalRevenue = orders
                .filter((order) => order.status !== 'cancelled')
                .reduce((sum, order) => sum + Number(order.pricing?.total_amount || 0), 0);
            const configHealth = buildTenantConfigHealth({ settings, tenant, adminUser });
            const statusCounts = buildOrderStatusCounts(orders);
            const recentSeries = buildRecentDailySeries(orders, { days: 7 });
            const lastOrderAt = orders.reduce((latestValue, order) => {
                const time = new Date(order.created_at || 0).getTime();
                if (!Number.isFinite(time)) return latestValue;
                return !latestValue || time > latestValue ? time : latestValue;
            }, 0);

            return {
                id: tenant.id,
                code: tenant.code,
                name: tenant.name,
                status: tenant.status,
                expires_at: tenant.expires_at || null,
                subscription_type: safeText(tenant.subscription_type, 'paid'),
                trial_started_at: tenant.trial_started_at || null,
                auto_suspend_on_expiry: Boolean(tenant.auto_suspend_on_expiry ?? true),
                is_expired: expiryInfo.is_expired,
                expiring_in_days: expiryInfo.days_remaining,
                unavailable_message: tenantUnavailableMessage(tenant),
                subscription_name: safeText(tenant.subscription_name, limitSummary.subscription_name),
                features: Array.isArray(tenant.features) ? tenant.features : limitSummary.features,
                max_user_count: toInteger(tenant.max_user_count, 0),
                max_order_count: toInteger(tenant.max_order_count, 0),
                max_plan_count: toInteger(tenant.max_plan_count, 0),
                max_device_count: toInteger(tenant.max_device_count, 0),
                primary_domain: safeText(tenant.primary_domain),
                domain_bindings: normalizeDomainList(tenant.domain_bindings),
                primary_admin_domain: safeText(tenant.primary_admin_domain),
                admin_domain_bindings: normalizeDomainList(tenant.admin_domain_bindings),
                contact_name: safeText(tenant.contact_name),
                contact_phone: safeText(tenant.contact_phone),
                note: safeText(tenant.note),
                store_name: safeText(settings.store_name),
                admin_username: safeText(adminUser?.username),
                admin_nickname: safeText(adminUser?.nickname),
                admin_phone: safeText(adminUser?.phone),
                sender_name: safeText(settings?.logistics?.sender_name),
                sender_phone: safeText(settings?.logistics?.sender_phone),
                sender_address: [settings?.logistics?.sender_prov, settings?.logistics?.sender_city, settings?.logistics?.sender_county, settings?.logistics?.sender_address]
                    .map((item) => safeText(item))
                    .filter(Boolean)
                    .join(''),
                user_count: users.filter((item) => item.role === 'user').length,
                admin_count: users.filter((item) => isAdminRole(item.role)).length,
                plan_count: plans.length,
                device_count: devices.length,
                order_count: orders.length,
                usage_counts: usageCounts,
                limit_summary: limitSummary.limits,
                limits_reached_count: limitSummary.reached_count,
                near_limit_keys: limitSummary.near_limit_keys,
                total_revenue: Number(totalRevenue.toFixed(2)),
                revenue_30d: Number(recentSeries.reduce((sum, item) => sum + Number(item.revenue || 0), 0).toFixed(2)),
                status_counts: statusCounts,
                recent_order_series: recentSeries,
                last_order_at: lastOrderAt ? new Date(lastOrderAt).toISOString() : null,
                config_health: configHealth,
                config_warning_count: configHealth.missing_count,
                config_warnings: configHealth.warnings,
                storefront_path: tenant.code === DEFAULT_TENANT_CODE ? '/' : `/t/${encodeURIComponent(tenant.code)}`,
                admin_path: tenant.code === DEFAULT_TENANT_CODE ? '/admin' : `/admin/t/${encodeURIComponent(tenant.code)}`,
                storefront_url: buildTenantStorefrontUrl(tenant),
                admin_url: buildTenantAdminUrl(tenant),
            };
        },
    );
}

function orderAmount(order = {}) {
    return Number(order?.pricing?.total_amount || order?.total_amount || 0);
}

function buildOrderStatusCounts(orders = []) {
    return ORDER_STATUSES.reduce((result, status) => {
        result[status] = orders.filter((order) => order.status === status).length;
        return result;
    }, {});
}

function startOfLocalDay(dateValue = new Date()) {
    const date = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);
    date.setHours(0, 0, 0, 0);
    return date;
}

function addDays(dateValue, amount) {
    const nextDate = new Date(dateValue.getTime());
    nextDate.setDate(nextDate.getDate() + amount);
    return nextDate;
}

function scheduleDetachedTask(callback, delayMs = 0) {
    const handle = setTimeout(() => {
        void callback();
    }, Math.max(0, Number(delayMs) || 0));

    if (typeof handle.unref === 'function') {
        handle.unref();
    }

    return handle;
}

function buildAuditCategoryLabel(category = '') {
    return AUDIT_CATEGORY_LABELS[safeText(category)] || safeText(category) || '其他';
}

function sanitizeAuditLogEntry(entry = {}) {
    return {
        ...entry,
        category_label: buildAuditCategoryLabel(entry.category),
    };
}

function filterAuditLogsForViewer(logs = [], req, { scope = 'current', q = '', category = '', status = '', dateFrom = '', dateTo = '' } = {}) {
    const currentTenantId = Math.max(1, toInteger(req?.tenant?.id, 1));
    const usePlatformScope = isPlatformAdminRole(req?.userRole) && safeText(scope) === 'all';
    const keyword = safeText(q).toLowerCase();
    let nextLogs = Array.isArray(logs) ? [...logs] : [];

    if (!usePlatformScope) {
        nextLogs = nextLogs.filter(
            (entry) =>
                Math.max(1, toInteger(entry.tenant_id, 1)) === currentTenantId ||
                Math.max(0, toInteger(entry.target_tenant_id, 0)) === currentTenantId,
        );
    }

    if (category && category !== 'all') {
        nextLogs = nextLogs.filter((entry) => safeText(entry.category) === safeText(category));
    }

    if (status && status !== 'all') {
        nextLogs = nextLogs.filter((entry) => safeText(entry.status) === safeText(status));
    }

    if (dateFrom) {
        const startAt = new Date(`${dateFrom}T00:00:00`);
        if (!Number.isNaN(startAt.getTime())) {
            nextLogs = nextLogs.filter((entry) => new Date(entry.created_at || 0) >= startAt);
        }
    }

    if (dateTo) {
        const endAt = new Date(`${dateTo}T23:59:59.999`);
        if (!Number.isNaN(endAt.getTime())) {
            nextLogs = nextLogs.filter((entry) => new Date(entry.created_at || 0) <= endAt);
        }
    }

    if (keyword) {
        nextLogs = nextLogs.filter((entry) => {
            const haystack = [
                entry.summary,
                entry.detail,
                entry.action,
                entry.category,
                entry.operator_username,
                entry.operator_nickname,
                entry.target_label,
                entry.target_key,
                entry.tenant_name,
                entry.tenant_code,
                entry.target_tenant_name,
                entry.target_tenant_code,
            ]
                .join(' ')
                .toLowerCase();
            return haystack.includes(keyword);
        });
    }

    return nextLogs.sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0) || right.id - left.id);
}

function buildAuditLogSummary(logs = []) {
    const todayStart = startOfLocalDay(new Date());
    const todayLogs = logs.filter((entry) => new Date(entry.created_at || 0) >= todayStart);
    const statusCounts = logs.reduce((result, entry) => {
        const key = safeText(entry.status, 'success');
        result[key] = (result[key] || 0) + 1;
        return result;
    }, {});
    const categoryBreakdown = logs.reduce((result, entry) => {
        const code = safeText(entry.category);
        if (!code) {
            return result;
        }
        const current = result[code] || {
            code,
            label: buildAuditCategoryLabel(code),
            count: 0,
        };
        current.count += 1;
        result[code] = current;
        return result;
    }, {});

    return {
        total_count: logs.length,
        today_count: todayLogs.length,
        today_error_count: todayLogs.filter((entry) => safeText(entry.status) === 'error').length,
        success_count: statusCounts.success || 0,
        error_count: statusCounts.error || 0,
        warning_count: statusCounts.warning || 0,
        info_count: statusCounts.info || 0,
        latest_created_at: logs[0]?.created_at || null,
        category_breakdown: Object.values(categoryBreakdown).sort(
            (left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'),
        ),
    };
}

function parsePositiveInteger(value, fallbackValue = 1, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
    const numericValue = toInteger(value, fallbackValue);
    if (!Number.isFinite(numericValue)) {
        return fallbackValue;
    }
    return Math.min(max, Math.max(min, numericValue));
}

function paginateItems(items = [], { page = 1, pageSize = 20 } = {}) {
    const totalCount = Array.isArray(items) ? items.length : 0;
    const safePageSize = parsePositiveInteger(pageSize, 20, { min: 1, max: 100 });
    const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
    const currentPage = Math.min(parsePositiveInteger(page, 1, { min: 1 }), totalPages);
    const offset = (currentPage - 1) * safePageSize;
    const slice = items.slice(offset, offset + safePageSize);
    const fromIndex = totalCount ? offset + 1 : 0;
    const toIndex = totalCount ? offset + slice.length : 0;

    return {
        page: currentPage,
        pageSize: safePageSize,
        totalCount,
        totalPages,
        hasPrev: currentPage > 1,
        hasNext: currentPage < totalPages,
        fromIndex,
        toIndex,
        items: slice,
    };
}

function stringifyAuditMetadata(value) {
    if (value == null) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    try {
        return JSON.stringify(value);
    } catch (error) {
        return '';
    }
}

function escapeCsvCell(value) {
    const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
    if (!/[",\r\n]/.test(text)) {
        return text;
    }
    return `"${text.replace(/"/g, '""')}"`;
}

function buildAuditLogsCsv(logs = []) {
    const header = [
        'created_at',
        'status',
        'category',
        'action',
        'summary',
        'detail',
        'operator_username',
        'operator_nickname',
        'operator_role',
        'tenant',
        'target_tenant',
        'target_type',
        'target_key',
        'target_label',
        'ip_address',
        'user_agent',
        'metadata',
    ];
    const rows = [header];

    logs.forEach((entry) => {
        rows.push([
            safeText(entry.created_at),
            safeText(entry.status, 'success'),
            buildAuditCategoryLabel(entry.category),
            safeText(entry.action),
            safeText(entry.summary),
            safeText(entry.detail),
            safeText(entry.operator_username),
            safeText(entry.operator_nickname),
            safeText(entry.operator_role),
            safeText(entry.tenant_name || entry.tenant_code),
            safeText(entry.target_tenant_name || entry.target_tenant_code),
            safeText(entry.target_type),
            safeText(entry.target_key),
            safeText(entry.target_label),
            safeText(entry.ip_address),
            safeText(entry.user_agent),
            stringifyAuditMetadata(entry.metadata),
        ]);
    });

    return `\uFEFF${rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\r\n')}`;
}

function formatSeriesLabel(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function buildRecentDailySeries(orders = [], { days = 7 } = {}) {
    const totalDays = Math.max(1, toInteger(days, 7));
    const today = startOfLocalDay(new Date());
    const startDate = addDays(today, -(totalDays - 1));
    const series = Array.from({ length: totalDays }, (_, index) => {
        const currentDate = addDays(startDate, index);
        const key = formatDateOnly(currentDate);
        return {
            date: key,
            label: formatSeriesLabel(currentDate),
            order_count: 0,
            revenue: 0,
        };
    });
    const indexMap = new Map(series.map((item, index) => [item.date, index]));

    orders.forEach((order) => {
        const createdAt = new Date(order.created_at || 0);
        if (Number.isNaN(createdAt.getTime()) || createdAt < startDate) {
            return;
        }
        const key = formatDateOnly(createdAt);
        if (!indexMap.has(key)) {
            return;
        }
        const item = series[indexMap.get(key)];
        item.order_count += 1;
        if (order.status !== 'cancelled') {
            item.revenue = Number((item.revenue + orderAmount(order)).toFixed(2));
        }
    });

    return series;
}

function buildTopNamedItems(orders = [], selector, limit = 5) {
    const bucket = new Map();
    orders.forEach((order) => {
        if (order.status === 'cancelled') {
            return;
        }
        const name = safeText(selector(order));
        if (!name) {
            return;
        }
        const current = bucket.get(name) || {
            name,
            order_count: 0,
            revenue: 0,
        };
        current.order_count += 1;
        current.revenue = Number((current.revenue + orderAmount(order)).toFixed(2));
        bucket.set(name, current);
    });

    return [...bucket.values()]
        .sort((left, right) => right.order_count - left.order_count || right.revenue - left.revenue || left.name.localeCompare(right.name, 'zh-CN'))
        .slice(0, Math.max(1, limit));
}

function buildTenantConfigHealth({ settings = {}, tenant = {}, adminUser = null } = {}) {
    const logistics = settings?.logistics || {};
    const items = [
        {
            key: 'storefront',
            label: '店铺资料',
            ok: Boolean(safeText(settings.store_name) && safeText(settings.hero_title)),
            hint: '店铺名、首页标题和基础文案。',
        },
        {
            key: 'payment',
            label: '支付收款码',
            ok: Boolean(settings?.payment_qrs?.wechat || settings?.payment_qrs?.alipay),
            hint: '至少配置一张微信或支付宝收款码。',
        },
        {
            key: 'ems_credentials',
            label: 'EMS 凭据',
            ok: Boolean(safeText(logistics.sender_no) && safeText(logistics.authorization) && safeText(logistics.sign_key)),
            hint: '协议客户号、授权码和签名钥匙。',
        },
        {
            key: 'sender_profile',
            label: '寄件信息',
            ok: Boolean(
                safeText(logistics.sender_name) &&
                    safeText(logistics.sender_phone) &&
                    safeText(logistics.sender_address) &&
                    safeText(logistics.sender_prov) &&
                    safeText(logistics.sender_city) &&
                    safeText(logistics.sender_county),
            ),
            hint: '寄件人姓名、电话、省市区和详细地址。',
        },
        {
            key: 'printing',
            label: '打印配置',
            ok: Boolean(safeText(logistics.preferred_printer) || safeText(logistics.sumatra_path)),
            hint: '至少配置默认打印机或 SumatraPDF 路径。',
        },
        {
            key: 'tracking',
            label: '轨迹同步',
            ok: Boolean(logistics.auto_sync_tracks),
            hint: '自动同步 EMS 轨迹开关。',
        },
        {
            key: 'domains',
            label: '独立域名',
            ok: Boolean(safeText(tenant.primary_domain) || safeText(tenant.primary_admin_domain)),
            hint: '前台或后台至少配置一个主域名。',
        },
        {
            key: 'admin',
            label: '主管理员',
            ok: Boolean(adminUser?.id && safeText(adminUser?.username) && safeText(adminUser?.status, 'active') === 'active'),
            hint: '租户后台需保留一个启用中的主管理员。',
        },
    ];
    const completedCount = items.filter((item) => item.ok).length;
    const totalCount = items.length;
    const missingItems = items.filter((item) => !item.ok);

    return {
        score: totalCount ? Math.round((completedCount / totalCount) * 100) : 100,
        completed_count: completedCount,
        total_count: totalCount,
        missing_count: missingItems.length,
        warnings: missingItems.map((item) => item.label),
        items,
    };
}

function buildAgingOrders(orders = [], filterFn, hours = 24, referenceSelector = (order) => order.created_at) {
    const thresholdHours = Math.max(1, Number(hours) || 24);
    const thresholdMs = thresholdHours * 60 * 60 * 1000;
    return orders
        .filter((order) => (typeof filterFn === 'function' ? filterFn(order) : true))
        .map((order) => {
            const referenceValue = referenceSelector(order) || order.created_at;
            const referenceTime = new Date(referenceValue || 0).getTime();
            const ageMs = Date.now() - referenceTime;
            return {
                ...order,
                aging_hours: Number((ageMs / (60 * 60 * 1000)).toFixed(1)),
            };
        })
        .filter((order) => Number.isFinite(order.aging_hours) && order.aging_hours * 60 * 60 * 1000 >= thresholdMs)
        .sort((left, right) => right.aging_hours - left.aging_hours);
}

function buildDashboardAlertItems({
    tenant,
    expiryInfo,
    configHealth,
    stalePaymentOrders,
    overdueReadyToShipOrders,
    emsAutoTrackSyncFailureOrders,
    emsConsecutivePrintFailureOrders,
    emsStaleTrackOrders,
    lowStockDevices,
}) {
    const alerts = [];

    if (tenantUnavailableMessage(tenant)) {
        alerts.push({
            key: 'tenant-unavailable',
            severity: 'danger',
            title: '当前租户不可用',
            message: tenantUnavailableMessage(tenant),
            count: 1,
        });
    } else if (expiryInfo.is_expired) {
        alerts.push({
            key: 'tenant-expired',
            severity: 'danger',
            title: '租户授权已到期',
            message: '请尽快续费或手动延长授权时间。',
            count: 1,
        });
    } else if (Number.isFinite(expiryInfo.days_remaining) && expiryInfo.days_remaining <= 7) {
        alerts.push({
            key: 'tenant-expiring',
            severity: 'warning',
            title: '租户授权即将到期',
            message: `${expiryInfo.days_remaining} 天内到期，请提前安排续费。`,
            count: 1,
        });
    }

    if (configHealth.missing_count) {
        alerts.push({
            key: 'tenant-config',
            severity: 'warning',
            title: '租户配置未完成',
            message: `当前还有 ${configHealth.missing_count} 项关键配置未完成：${configHealth.warnings.join('、')}`,
            count: configHealth.missing_count,
        });
    }

    if (stalePaymentOrders.length) {
        alerts.push({
            key: 'payment-review-stale',
            severity: 'warning',
            title: '待审核订单积压',
            message: `有 ${stalePaymentOrders.length} 单待审核订单超过阈值未处理。`,
            count: stalePaymentOrders.length,
        });
    }

    if (overdueReadyToShipOrders.length) {
        alerts.push({
            key: 'ready-to-ship-stale',
            severity: 'warning',
            title: '待发货订单超时',
            message: `有 ${overdueReadyToShipOrders.length} 单待发货订单超过阈值未发出。`,
            count: overdueReadyToShipOrders.length,
        });
    }

    if (emsAutoTrackSyncFailureOrders.length) {
        alerts.push({
            key: 'ems-auto-sync',
            severity: 'danger',
            title: 'EMS 自动同步连续失败',
            message: `有 ${emsAutoTrackSyncFailureOrders.length} 单自动同步连续失败，请优先检查 EMS 接口或网络。`,
            count: emsAutoTrackSyncFailureOrders.length,
        });
    }

    if (emsConsecutivePrintFailureOrders.length) {
        alerts.push({
            key: 'ems-print-fail',
            severity: 'danger',
            title: '面单打印连续失败',
            message: `有 ${emsConsecutivePrintFailureOrders.length} 单打印连续失败，请检查打印机、纸张和静默打印链路。`,
            count: emsConsecutivePrintFailureOrders.length,
        });
    }

    if (emsStaleTrackOrders.length) {
        alerts.push({
            key: 'ems-track-stale',
            severity: 'warning',
            title: '轨迹同步滞后',
            message: `有 ${emsStaleTrackOrders.length} 单 EMS 轨迹超过阈值未同步。`,
            count: emsStaleTrackOrders.length,
        });
    }

    if (lowStockDevices.length) {
        alerts.push({
            key: 'low-stock',
            severity: 'warning',
            title: '低库存提醒',
            message: `有 ${lowStockDevices.length} 个设备库存低于预警线。`,
            count: lowStockDevices.length,
        });
    }

    const severityRank = {
        danger: 3,
        warning: 2,
        info: 1,
    };

    return alerts.sort((left, right) => (severityRank[right.severity] || 0) - (severityRank[left.severity] || 0) || right.count - left.count);
}

function buildEmsNextAction(order = {}) {
    if (!order?.ems?.address_parsed_at || !safeText(order?.ems?.receiver?.prov) || !safeText(order?.ems?.receiver?.address)) {
        return {
            key: 'parse',
            label: '先解析地址',
            description: '先把收件地址拆成省市区和详细地址。',
        };
    }
    if (order?.ems?.reachable !== true) {
        return {
            key: 'validate',
            label: '做可达校验',
            description: '确认 EMS 可寄达当前收件地址。',
        };
    }
    if (!buildTrackingNumber(order)) {
        return {
            key: 'create',
            label: '生成单号',
            description: '创建 EMS 单号并写回订单。',
        };
    }
    if (!safeText(order?.ems?.label_file)) {
        return {
            key: 'label',
            label: '获取面单',
            description: '拉取官方面单 PDF 文件。',
        };
    }
    if (!order?.ems?.printed_at) {
        return {
            key: 'print',
            label: '打印面单',
            description: '执行静默打印或打开 PDF 手动打印。',
        };
    }
    if (!order?.ems?.last_track_sync_at) {
        return {
            key: 'track',
            label: '同步轨迹',
            description: '完成轨迹查询后用户端会同步显示。',
        };
    }
    return {
        key: 'done',
        label: '流程已闭环',
        description: '建单、打印和轨迹同步都已完成。',
    };
}

function buildEmsWorkflowOverview(orders = []) {
    return orders.reduce(
        (result, order) => {
            if (order?.ems?.address_parsed_at) result.address_parsed_count += 1;
            if (order?.ems?.reachable === true) result.reachable_count += 1;
            if (buildTrackingNumber(order)) result.waybill_created_count += 1;
            if (safeText(order?.ems?.label_file)) result.label_ready_count += 1;
            if (order?.ems?.printed_at) result.printed_count += 1;
            if (order?.ems?.last_track_sync_at) result.track_synced_count += 1;
            if (detectLogisticsStage(order).code === 'signed') result.signed_count += 1;
            return result;
        },
        {
            address_parsed_count: 0,
            reachable_count: 0,
            waybill_created_count: 0,
            label_ready_count: 0,
            printed_count: 0,
            track_synced_count: 0,
            signed_count: 0,
        },
    );
}

function toNullableBoolean(value) {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return null;
}

function compactAuditValue(value, depth = 0) {
    if (value == null) {
        return null;
    }
    if (depth > 4) {
        return '[depth-limit]';
    }
    if (typeof value === 'string') {
        return value.length > 800 ? `${value.slice(0, 800)}...[${value.length} chars]` : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.slice(0, 20).map((item) => compactAuditValue(item, depth + 1));
    }
    if (typeof value === 'object') {
        return Object.entries(value).reduce((result, [key, item]) => {
            if (key === 'rawText') {
                result[key] = compactAuditValue(item, depth + 1);
                return result;
            }
            result[key] = compactAuditValue(item, depth + 1);
            return result;
        }, {});
    }
    return safeText(value);
}

function buildRuntimeEmsConfig(settings = {}) {
    const base = getEmsConfig();
    const logistics = settings?.logistics || {};
    return {
        ...base,
        senderNo: preferText(logistics.sender_no, base.senderNo),
        authorization: preferText(logistics.authorization, base.authorization),
        signKey: preferText(logistics.sign_key, base.signKey),
        senderName: preferText(logistics.sender_name, base.senderName),
        senderPhone: preferText(logistics.sender_phone, base.senderPhone),
        senderPostCode: preferText(logistics.sender_post_code, base.senderPostCode),
        senderProv: preferText(logistics.sender_prov, base.senderProv),
        senderCity: preferText(logistics.sender_city, base.senderCity),
        senderCounty: preferText(logistics.sender_county, base.senderCounty),
        senderAddress: preferText(logistics.sender_address, base.senderAddress),
        bizProductNo: preferText(logistics.biz_product_no, base.bizProductNo),
        bizProductId: preferText(logistics.biz_product_id, base.bizProductId),
        contentsAttribute: preferText(logistics.contents_attribute, base.contentsAttribute),
        defaultWeightGrams: preferText(logistics.default_weight_grams, base.defaultWeightGrams),
        labelType: preferText(logistics.label_type, base.labelType),
        printMode: preferText(logistics.preferred_print_mode, base.printMode).toLowerCase(),
        printerName: preferText(logistics.preferred_printer, base.printerName),
        sumatraPath: preferText(logistics.sumatra_path, base.sumatraPath),
        paperName: preferText(logistics.paper_name, base.paperName),
        paperWidthMm: preferText(logistics.paper_width_mm, base.paperWidthMm),
        paperHeightMm: preferText(logistics.paper_height_mm, base.paperHeightMm),
        logistics,
    };
}

function appendEmsAudit(
    order,
    {
        action = '',
        status = 'success',
        request = null,
        response = null,
        retCode = '',
        retMsg = '',
        serialNo = '',
    } = {},
) {
    order.ems = order.ems || {};
    order.ems.api_logs = Array.isArray(order.ems.api_logs) ? order.ems.api_logs : [];
    const entry = {
        action: safeText(action),
        status: safeText(status, 'success'),
        time: new Date().toISOString(),
        ret_code: safeText(retCode),
        ret_msg: safeText(retMsg),
        serial_no: safeText(serialNo),
        request: compactAuditValue(request),
        response: compactAuditValue(response),
    };

    order.ems.api_logs = [...order.ems.api_logs, entry].slice(-15);
    order.ems.last_action = entry.action;
    order.ems.last_action_at = entry.time;
    return entry;
}

function summarizeEmsIssue(order, staleHours = 24) {
    if (!isEmsManagedOrder(order)) {
        return '';
    }
    const ems = order?.ems || {};
    if (safeText(ems.last_error)) {
        return safeText(ems.last_error);
    }
    if (safeText(ems.waybill_no) && !safeText(ems.label_file)) {
        return '已建单但未取面单';
    }
    if (safeText(ems.label_file) && !ems.printed_at) {
        if (ems.print_attempted_at) {
            return ems.print_status === 'open' || ems.print_status === 'browser' ? '已打开面单待确认打印' : '已发起打印待确认';
        }
        return '面单已生成但尚未打印';
    }
    if (safeText(ems.waybill_no)) {
        const lastSyncAt = ems.last_track_sync_at ? new Date(ems.last_track_sync_at).getTime() : 0;
        const staleMs = Math.max(1, Number(staleHours || 24)) * 60 * 60 * 1000;
        if (!lastSyncAt || Date.now() - lastSyncAt > staleMs) {
            return '轨迹待同步';
        }
    }
    return '';
}

function appendOrderLog(order, { operatorId = 0, operatorRole = '', action = '', content = '' } = {}) {
    order.processing_logs = Array.isArray(order.processing_logs) ? order.processing_logs : [];
    order.processing_logs.push({
        time: new Date().toISOString(),
        operator_id: operatorId,
        operator_role: String(operatorRole || '').trim(),
        action: String(action || '').trim(),
        content: String(content || '').trim(),
    });
}

function buildClientEmsPayload(ems = {}) {
    const source = ems && typeof ems === 'object' ? ems : {};
    return {
        ...source,
        order_payload: null,
        order_response: null,
        label_payload: null,
        label_response: null,
        print_payload: null,
        print_response: null,
        track_payload: null,
        track_response: null,
        parse_payload: null,
        parse_response: null,
        validate_payload: null,
        validate_response: null,
    };
}

function enrichOrder(order, users, settings = {}) {
    const user = users.find((item) => item.id === order.user_id);
    const runtimeConfig = buildRuntimeEmsConfig(settings);
    const emsIssueSummary = summarizeEmsIssue(order, settings?.logistics?.track_stale_hours || 24);
    const structuredView = buildStructuredOrderView(order);
    const logisticsStage = detectLogisticsStage(order);
    const nextAction = buildEmsNextAction(order);
    const latestAuditLog = Array.isArray(order?.ems?.api_logs) ? order.ems.api_logs[order.ems.api_logs.length - 1] || null : null;
    return {
        ...order,
        ems: buildClientEmsPayload(order.ems),
        user_phone: user?.phone || '未知用户',
        summary_text: buildOrderSummary(order),
        total_amount: order.pricing.total_amount,
        tracking_number: buildTrackingNumber(order) || '',
        cloud_print_default_printer: runtimeConfig.printerName,
        preferred_print_mode: runtimeConfig.printMode,
        cloud_print_download_url: getCloudPrintDownloadUrl(),
        ems_issue_summary: emsIssueSummary,
        logistics_stage: logisticsStage,
        order_structure: structuredView,
        ems_next_action: nextAction,
        ems_last_audit: latestAuditLog
            ? {
                  action: safeText(latestAuditLog.action),
                  status: safeText(latestAuditLog.status),
                  ret_code: safeText(latestAuditLog.ret_code),
                  ret_msg: safeText(latestAuditLog.ret_msg),
                  serial_no: safeText(latestAuditLog.serial_no),
                  time: latestAuditLog.time || null,
              }
            : null,
    };
}

function normalizeEmsCandidatePayload(rawCandidate = {}) {
    return {
        whole_address: safeText(rawCandidate.whole_address ?? rawCandidate.wholeAddress),
        prov: safeText(rawCandidate.prov ?? rawCandidate.provName),
        city: safeText(rawCandidate.city ?? rawCandidate.cityName),
        county: safeText(rawCandidate.county ?? rawCandidate.countyName),
        address: safeText(rawCandidate.address),
        pro_code: safeText(rawCandidate.pro_code ?? rawCandidate.proCode),
        city_code: safeText(rawCandidate.city_code ?? rawCandidate.cityCode),
        county_code: safeText(rawCandidate.county_code ?? rawCandidate.countyCode),
        district_code: safeText(rawCandidate.district_code ?? rawCandidate.districtCode),
    };
}

function normalizeEmsPartyPayload(rawParty = {}, fallbackValue = {}) {
    const source = rawParty && typeof rawParty === 'object' ? rawParty : {};
    return {
        name: safeText(source.name, fallbackValue.name),
        mobile: safeText(source.mobile, fallbackValue.mobile),
        phone: safeText(source.phone, fallbackValue.phone),
        post_code: safeText(source.post_code ?? source.postCode, fallbackValue.post_code),
        prov: safeText(source.prov, fallbackValue.prov),
        city: safeText(source.city, fallbackValue.city),
        county: safeText(source.county, fallbackValue.county),
        address: safeText(source.address, fallbackValue.address),
    };
}

function normalizeEmsTrackPayload(rawTrack = {}) {
    const source = rawTrack && typeof rawTrack === 'object' ? rawTrack : {};
    return {
        waybill_no: safeText(source.waybill_no ?? source.waybillNo),
        op_time: safeText(source.op_time ?? source.opTime),
        op_code: safeText(source.op_code ?? source.opCode),
        op_name: safeText(source.op_name ?? source.opName),
        op_desc: safeText(source.op_desc ?? source.opDesc),
        op_org_prov_name: safeText(source.op_org_prov_name ?? source.opOrgProvName),
        op_org_city: safeText(source.op_org_city ?? source.opOrgCity),
        op_org_code: safeText(source.op_org_code ?? source.opOrgCode),
        op_org_name: safeText(source.op_org_name ?? source.opOrgName),
        operator_no: safeText(source.operator_no ?? source.operatorNo),
        operator_name: safeText(source.operator_name ?? source.operatorName),
        deliver_code: safeText(source.deliver_code ?? source.deliverCode),
        attempt_delivery_code: safeText(source.attempt_delivery_code ?? source.attemptDeliveryCode),
        product_name: safeText(source.product_name ?? source.productName),
    };
}

const EMS_WORKFLOW_STEP_KEYS = ['parse', 'validate', 'create', 'label', 'print', 'track'];
const EMS_WORKFLOW_ACTIVE_STATUSES = ['queued', 'running'];
const EMS_TRACK_AUTO_SYNC_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const emsWorkflowQueue = [];
let emsWorkflowProcessing = false;
let emsTrackAutoSyncTimer = null;
let emsTrackAutoSyncRunning = false;

function buildDefaultWorkflowTaskSteps() {
    return {
        parse: { status: 'idle', message: '', updated_at: null },
        validate: { status: 'idle', message: '', updated_at: null },
        create: { status: 'idle', message: '', updated_at: null },
        label: { status: 'idle', message: '', updated_at: null },
        print: { status: 'idle', message: '', updated_at: null },
        track: { status: 'idle', message: '', updated_at: null },
    };
}

function resolveTrackAutoSyncIntervalHours(settings = {}) {
    return Math.max(1, toInteger(settings?.logistics?.track_auto_sync_interval_hours, 4));
}

function normalizeWorkflowTaskStepPayload(rawStep = {}, fallbackValue = {}) {
    const source = rawStep && typeof rawStep === 'object' ? rawStep : {};
    return {
        status: safeText(source.status, fallbackValue.status || 'idle'),
        message: safeText(source.message, fallbackValue.message),
        updated_at: source.updated_at || source.updatedAt || fallbackValue.updated_at || fallbackValue.updatedAt || null,
    };
}

function normalizeWorkflowTaskPayload(rawTask = {}, fallbackValue = null) {
    if (!rawTask && !fallbackValue) {
        return null;
    }

    const source = rawTask && typeof rawTask === 'object' ? rawTask : {};
    const fallbackSource = fallbackValue && typeof fallbackValue === 'object' ? fallbackValue : {};
    const defaultSteps = buildDefaultWorkflowTaskSteps();
    const rawSteps = source.steps && typeof source.steps === 'object' ? source.steps : {};
    const fallbackSteps = fallbackSource.steps && typeof fallbackSource.steps === 'object' ? fallbackSource.steps : {};

    return {
        id: safeText(source.id, fallbackSource.id),
        mode: safeText(source.mode, fallbackSource.mode || 'single'),
        status: safeText(source.status, fallbackSource.status || 'idle'),
        current_step: safeText(source.current_step ?? source.currentStep, fallbackSource.current_step),
        error: safeText(source.error, fallbackSource.error),
        include_track:
            toNullableBoolean(source.include_track ?? source.includeTrack) === null
                ? fallbackSource.include_track ?? true
                : toNullableBoolean(source.include_track ?? source.includeTrack),
        initiator_id: toInteger(source.initiator_id ?? source.initiatorId, fallbackSource.initiator_id || 0),
        initiator_role: safeText(source.initiator_role ?? source.initiatorRole, fallbackSource.initiator_role),
        enqueued_at: source.enqueued_at || source.enqueuedAt || fallbackSource.enqueued_at || null,
        started_at: source.started_at || source.startedAt || fallbackSource.started_at || null,
        finished_at: source.finished_at || source.finishedAt || fallbackSource.finished_at || null,
        updated_at: source.updated_at || source.updatedAt || fallbackSource.updated_at || null,
        steps: EMS_WORKFLOW_STEP_KEYS.reduce((result, key) => {
            result[key] = normalizeWorkflowTaskStepPayload(rawSteps[key], fallbackSteps[key] || defaultSteps[key]);
            return result;
        }, {}),
    };
}

function normalizeAdminEmsPayload(rawEms = {}, fallbackValue = {}) {
    const source = rawEms && typeof rawEms === 'object' ? rawEms : {};
    return {
        ...fallbackValue,
        address_parse_source: safeText(source.address_parse_source ?? source.addressParseSource, fallbackValue.address_parse_source),
        address_parse_candidates: Array.isArray(source.address_parse_candidates ?? source.addressParseCandidates)
            ? (source.address_parse_candidates ?? source.addressParseCandidates).map(normalizeEmsCandidatePayload)
            : Array.isArray(fallbackValue.address_parse_candidates)
              ? fallbackValue.address_parse_candidates
              : [],
        receiver: normalizeEmsPartyPayload(source.receiver, fallbackValue.receiver),
        sender: normalizeEmsPartyPayload(source.sender, fallbackValue.sender),
        ecommerce_user_id: safeText(source.ecommerce_user_id ?? source.ecommerceUserId, fallbackValue.ecommerce_user_id),
        logistics_order_no: safeText(source.logistics_order_no ?? source.logisticsOrderNo, fallbackValue.logistics_order_no),
        waybill_no: safeText(source.waybill_no ?? source.waybillNo, fallbackValue.waybill_no),
        route_code: safeText(source.route_code ?? source.routeCode, fallbackValue.route_code),
        package_code: safeText(source.package_code ?? source.packageCode, fallbackValue.package_code),
        package_code_name: safeText(source.package_code_name ?? source.packageCodeName, fallbackValue.package_code_name),
        mark_destination_code: safeText(
            source.mark_destination_code ?? source.markDestinationCode,
            fallbackValue.mark_destination_code,
        ),
        mark_destination_name: safeText(
            source.mark_destination_name ?? source.markDestinationName,
            fallbackValue.mark_destination_name,
        ),
        biz_product_no: safeText(source.biz_product_no ?? source.bizProductNo, fallbackValue.biz_product_no),
        biz_product_id: safeText(source.biz_product_id ?? source.bizProductId, fallbackValue.biz_product_id),
        contents_attribute: safeText(source.contents_attribute ?? source.contentsAttribute, fallbackValue.contents_attribute),
        package_weight: safeText(source.package_weight ?? source.packageWeight, fallbackValue.package_weight),
        label_type: safeText(source.label_type ?? source.labelType, fallbackValue.label_type),
        label_url: safeText(source.label_url ?? source.labelUrl, fallbackValue.label_url),
        label_file: safeText(source.label_file ?? source.labelFile, fallbackValue.label_file),
        label_generated_at: source.label_generated_at || source.labelGeneratedAt || fallbackValue.label_generated_at || null,
        address_parsed_at: fallbackValue.address_parsed_at || null,
        waybill_created_at: fallbackValue.waybill_created_at || null,
        label_requested_at: fallbackValue.label_requested_at || null,
        print_status: safeText(source.print_status ?? source.printStatus, fallbackValue.print_status),
        print_mode: safeText(fallbackValue.print_mode),
        print_message: safeText(source.print_message ?? source.printMessage, fallbackValue.print_message),
        print_attempted_at: fallbackValue.print_attempted_at || null,
        printed_at: source.printed_at || source.printedAt || fallbackValue.printed_at || null,
        last_serial_no: safeText(source.last_serial_no ?? source.lastSerialNo, fallbackValue.last_serial_no),
        last_error: safeText(source.last_error ?? source.lastError, fallbackValue.last_error),
        last_action: safeText(fallbackValue.last_action),
        last_action_at: fallbackValue.last_action_at || null,
        reachable:
            toNullableBoolean(source.reachable) === null ? fallbackValue.reachable ?? null : toNullableBoolean(source.reachable),
        reachable_message: safeText(source.reachable_message ?? source.reachableMessage, fallbackValue.reachable_message),
        reachable_checked_at:
            source.reachable_checked_at || source.reachableCheckedAt || fallbackValue.reachable_checked_at || null,
        tracking_direction: safeText(source.tracking_direction ?? source.trackingDirection, fallbackValue.tracking_direction || '0'),
        track_summary: safeText(source.track_summary ?? source.trackSummary, fallbackValue.track_summary),
        track_items: Array.isArray(source.track_items ?? source.trackItems)
            ? (source.track_items ?? source.trackItems).map(normalizeEmsTrackPayload)
            : Array.isArray(fallbackValue.track_items)
              ? fallbackValue.track_items
              : [],
        last_track_sync_at: source.last_track_sync_at || source.lastTrackSyncAt || fallbackValue.last_track_sync_at || null,
        auto_track_sync_failure_streak: Math.max(
            0,
            toInteger(
                source.auto_track_sync_failure_streak ?? source.autoTrackSyncFailureStreak,
                fallbackValue.auto_track_sync_failure_streak || 0,
            ),
        ),
        auto_track_sync_last_failed_at:
            source.auto_track_sync_last_failed_at ||
            source.autoTrackSyncLastFailedAt ||
            fallbackValue.auto_track_sync_last_failed_at ||
            null,
        auto_track_sync_last_success_at:
            source.auto_track_sync_last_success_at ||
            source.autoTrackSyncLastSuccessAt ||
            fallbackValue.auto_track_sync_last_success_at ||
            null,
        auto_track_sync_last_error: safeText(
            source.auto_track_sync_last_error ?? source.autoTrackSyncLastError,
            fallbackValue.auto_track_sync_last_error,
        ),
        api_logs: Array.isArray(fallbackValue.api_logs) ? fallbackValue.api_logs : [],
        workflow_task: normalizeWorkflowTaskPayload(source.workflow_task ?? source.workflowTask, fallbackValue.workflow_task),
        order_payload: fallbackValue.order_payload ?? null,
        order_response: fallbackValue.order_response ?? null,
        label_payload: fallbackValue.label_payload ?? null,
        label_response: fallbackValue.label_response ?? null,
        print_payload: fallbackValue.print_payload ?? null,
        print_response: fallbackValue.print_response ?? null,
        track_payload: fallbackValue.track_payload ?? null,
        track_response: fallbackValue.track_response ?? null,
        parse_payload: fallbackValue.parse_payload ?? null,
        parse_response: fallbackValue.parse_response ?? null,
        validate_payload: fallbackValue.validate_payload ?? null,
        validate_response: fallbackValue.validate_response ?? null,
    };
}

function truncateText(value, maxLength) {
    const text = safeText(value);
    if (!maxLength || text.length <= maxLength) return text;
    return text.slice(0, maxLength);
}

function buildTrackingNumber(order) {
    return buildOrderTrackingNumber(order);
}

function resetOrderTrackSyncState(order) {
    order.ems = {
        ...order.ems,
        track_summary: '',
        track_items: [],
        last_track_sync_at: null,
        last_error: '',
        track_payload: null,
        track_response: null,
        auto_track_sync_failure_streak: 0,
        auto_track_sync_last_error: '',
        auto_track_sync_last_failed_at: null,
        auto_track_sync_last_success_at: null,
    };
}

function syncManualTrackingNumberToEms(order, previousTrackingNumber = '') {
    const merchantTrackingNumber = safeText(order?.merchant_tracking_number);
    const emsWaybillNo = safeText(order?.ems?.waybill_no);
    const hasEmsContext = isEmsManagedOrder(order);

    if (!hasEmsContext) {
        return false;
    }

    const resolvedTrackingNumber = safeText(merchantTrackingNumber || emsWaybillNo);
    if (!resolvedTrackingNumber) {
        return false;
    }

    const changed = resolvedTrackingNumber !== emsWaybillNo || resolvedTrackingNumber !== safeText(previousTrackingNumber);
    order.ems = {
        ...order.ems,
        waybill_no: resolvedTrackingNumber,
    };
    order.merchant_tracking_number = resolvedTrackingNumber;

    if (safeText(previousTrackingNumber) && safeText(previousTrackingNumber) !== resolvedTrackingNumber) {
        resetOrderTrackSyncState(order);
    }

    return changed;
}

function planOrderDeletion(order, deviceMap = new Map()) {
    let updatedDevice = null;

    if (order?.flow_type === 'buy_device' && order?.device_id && order?.status !== 'cancelled') {
        const currentDevice = deviceMap.get(order.device_id);
        if (currentDevice) {
            updatedDevice = {
                ...currentDevice,
                stock: Number(currentDevice.stock || 0) + Math.max(1, Number(order.quantity || 1)),
            };
            deviceMap.set(updatedDevice.id, updatedDevice);
        }
    }

    return {
        updatedDevice,
        paymentProof: safeText(order?.payment_proof),
        labelFile: safeText(order?.ems?.label_file),
    };
}

async function recordOrderDeletionAudit(req, order, metadata = {}) {
    await safeRecordAdminAuditLog({
        req,
        category: 'orders',
        action: '删除订单',
        summary: `已删除订单 ${order.order_no}`,
        detail: `客户：${order.customer_name || '未填写'}；状态：${order.status}；EMS：${order.merchant_tracking_number || order?.ems?.waybill_no || '未出单'}`,
        targetType: 'order',
        targetId: order.id,
        targetKey: order.order_no,
        targetLabel: order.customer_name || order.order_no,
        metadata,
    });
}

function buildCargoName(order) {
    if (order.flow_type === 'ship_device') {
        const modelText = [order.device_submission?.brand, order.device_submission?.model].filter(Boolean).join(' ');
        return truncateText(modelText || '用户寄送设备配卡回寄', 50);
    }
    return truncateText(order.device_snapshot?.name || order.plan_snapshot?.name || '设备配卡商品', 50);
}

function buildCargoList(order, config = getEmsConfig()) {
    return [
        {
            cargoName: buildCargoName(order),
            cargoCategory: truncateText(order.plan_snapshot?.name || '设备配卡', 50),
            cargoQuantity: Math.max(1, toInteger(order.quantity, 1)),
            cargoValue: Number(order.pricing?.total_amount || 0),
            cargoWeight: Number(order.ems?.package_weight || config.defaultWeightGrams || '500'),
        },
    ];
}

function buildEmsRemark(order) {
    const parts = [
        `订单:${order.order_no}`,
        `商品:${buildOrderSummary(order)}`,
        order.remark ? `备注:${order.remark}` : '',
    ].filter(Boolean);
    return truncateText(parts.join('；'), 200);
}

function applyParsedAddressToOrder(order, wholeAddress, candidates = []) {
    const firstCandidate = candidates[0] || null;
    order.ems = {
        ...order.ems,
        address_parse_source: safeText(wholeAddress, order.shipping_address),
        address_parse_candidates: candidates.map(normalizeEmsCandidatePayload),
        receiver: {
            ...order.ems.receiver,
            name: safeText(order.ems.receiver?.name, order.customer_name),
            mobile: safeText(order.ems.receiver?.mobile, order.customer_phone),
            prov: safeText(firstCandidate?.prov, order.ems.receiver?.prov),
            city: safeText(firstCandidate?.city, order.ems.receiver?.city),
            county: safeText(firstCandidate?.county, order.ems.receiver?.county),
            address: safeText(
                firstCandidate ? extractAddressDetail(wholeAddress, firstCandidate) : order.ems.receiver?.address,
                order.ems.receiver?.address,
            ),
            post_code: safeText(order.ems.receiver?.post_code),
            phone: safeText(order.ems.receiver?.phone),
        },
        last_error: firstCandidate ? '' : safeText(order.ems.last_error),
    };
    return firstCandidate;
}

function receiverHasFullAddress(order) {
    return Boolean(order.ems?.receiver?.prov && order.ems?.receiver?.city && order.ems?.receiver?.county && order.ems?.receiver?.address);
}

function buildReachabilityPayload(order, sender, receiver, config = getEmsConfig()) {
    return {
        baseProductNo: preferText(order.ems?.biz_product_no, config.bizProductNo),
        bizProductId: safeText(order.ems?.biz_product_id, config.bizProductId),
        contentsAttribute: preferText(order.ems?.contents_attribute, config.contentsAttribute),
        receiverProv: receiver.prov,
        receiverCity: receiver.city,
        receiverCounty: receiver.county,
        receiverAddress: receiver.address,
        senderProv: sender.prov,
        senderCity: sender.city,
        senderCounty: sender.county,
        senderAddress: sender.address,
        weight: preferText(order.ems?.package_weight, config.defaultWeightGrams),
    };
}

async function resolveSenderFromSettings(settings, existingSender = {}, config = buildRuntimeEmsConfig(settings)) {
    const sender = {
        name: preferText(existingSender.name, config.senderName || settings.shop_receiving_name),
        mobile: preferText(existingSender.mobile, config.senderPhone || settings.shop_receiving_phone),
        phone: safeText(existingSender.phone),
        postCode: preferText(existingSender.post_code, config.senderPostCode),
        prov: preferText(existingSender.prov, config.senderProv),
        city: preferText(existingSender.city, config.senderCity),
        county: preferText(existingSender.county, config.senderCounty),
        address: preferText(existingSender.address, config.senderAddress),
    };

    const sourceAddress = safeText(config.senderAddress || settings.shop_receiving_address || existingSender.address);
    if ((!sender.prov || !sender.city || !sender.county || !sender.address) && sourceAddress) {
        const candidates = await parseAddress(sourceAddress, { config });
        const firstCandidate = candidates[0];
        if (firstCandidate) {
            sender.prov = sender.prov || firstCandidate.prov;
            sender.city = sender.city || firstCandidate.city;
            sender.county = sender.county || firstCandidate.county;
            sender.address = sender.address || extractAddressDetail(sourceAddress, firstCandidate);
        }
    }

    return normalizePartyAddress(sender);
}

function persistEmsFailure(order, error, { action = '', request = null, response = null } = {}) {
    const baseMessage = safeText(error?.response?.retMsg || error?.message || 'EMS 操作失败');
    const retCode = safeText(error?.response?.retCode || error?.code);
    const serialNo = safeText(error?.response?.serialNo);
    const diagnostics = [
        retCode ? `代码:${retCode}` : '',
        serialNo ? `流水号:${serialNo}` : '',
    ].filter(Boolean);
    const errorMessage = diagnostics.length ? `${baseMessage}（${diagnostics.join(' / ')}）` : baseMessage;
    order.ems = {
        ...order.ems,
        last_error: errorMessage,
        last_serial_no: safeText(error?.response?.serialNo, order.ems?.last_serial_no),
    };
    appendEmsAudit(order, {
        action,
        status: 'error',
        request,
        response: response || error?.response || { message: safeText(error?.message) },
        retCode,
        retMsg: baseMessage,
        serialNo,
    });
    return errorMessage;
}

function countConsecutiveAuditFailures(order, actions = []) {
    const actionSet = new Set((Array.isArray(actions) ? actions : [actions]).map((item) => safeText(item)).filter(Boolean));
    const logs = Array.isArray(order?.ems?.api_logs) ? order.ems.api_logs : [];
    const matchedLogs = logs.filter((log) => actionSet.has(safeText(log.action)));
    let failureCount = 0;

    for (let index = matchedLogs.length - 1; index >= 0; index -= 1) {
        const status = safeText(matchedLogs[index].status, 'success');
        if (status === 'error') {
            failureCount += 1;
            continue;
        }
        break;
    }

    return failureCount;
}

function buildConsecutiveFailureOrders(orders, actions = [], threshold = 2) {
    return orders
        .map((order) => {
            const failureCount = countConsecutiveAuditFailures(order, actions);
            if (failureCount < threshold) {
                return null;
            }

            const logs = Array.isArray(order?.ems?.api_logs) ? order.ems.api_logs : [];
            const actionSet = new Set((Array.isArray(actions) ? actions : [actions]).map((item) => safeText(item)).filter(Boolean));
            const lastMatchedLog = [...logs].reverse().find((log) => actionSet.has(safeText(log.action))) || null;

            return {
                id: order.id,
                order_no: order.order_no,
                customer_name: order.customer_name,
                waybill_no: buildTrackingNumber(order),
                failure_count: failureCount,
                last_action: safeText(lastMatchedLog?.action || order.ems?.last_action),
                last_action_at: lastMatchedLog?.time || order.ems?.last_action_at || null,
                last_message: safeText(lastMatchedLog?.ret_msg || order.ems?.last_error),
            };
        })
        .filter(Boolean)
        .sort((left, right) => right.failure_count - left.failure_count || new Date(right.last_action_at || 0) - new Date(left.last_action_at || 0));
}

function buildAutoTrackSyncFailureOrders(orders, threshold = 2) {
    return orders
        .map((order) => {
            const streak = Math.max(0, toInteger(order?.ems?.auto_track_sync_failure_streak, 0));
            if (streak < threshold) {
                return null;
            }

            return {
                id: order.id,
                order_no: order.order_no,
                customer_name: order.customer_name,
                waybill_no: buildTrackingNumber(order),
                failure_count: streak,
                last_action_at: order.ems?.auto_track_sync_last_failed_at || order.ems?.last_action_at || null,
                last_message: safeText(order.ems?.auto_track_sync_last_error || order.ems?.last_error),
            };
        })
        .filter(Boolean)
        .sort((left, right) => right.failure_count - left.failure_count || new Date(right.last_action_at || 0) - new Date(left.last_action_at || 0));
}

function createRequestError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

async function saveTenantAdminUser(savedTenant, adminForm = {}) {
    const adminRole = savedTenant.id === 1 ? 'platform_admin' : 'admin';

    return runWithTenantContext(
        {
            tenantId: savedTenant.id,
            tenantCode: savedTenant.code,
            tenant: savedTenant,
        },
        async () => {
            const users = await readUsers();
            const existingAdmin = users.find((item) => isPrimaryAdminRole(item.role));
            const username = safeText(adminForm.username, existingAdmin?.username);
            const password = safeText(adminForm.password, existingAdmin?.password);

            if (!username) {
                throw createRequestError('请填写租户管理员账号。');
            }
            if (!password) {
                throw createRequestError('请填写租户管理员密码。');
            }
            if (safeText(adminForm.password) && safeText(adminForm.password).length < 6) {
                throw createRequestError('租户管理员密码长度至少 6 位。');
            }

            const duplicateAdmin = users.find((item) => item.id !== existingAdmin?.id && safeText(item.username) === username);
            if (duplicateAdmin) {
                throw createRequestError('该租户管理员账号已被占用。');
            }

            return saveUser({
                ...existingAdmin,
                id: existingAdmin?.id || Date.now() + Math.floor(Math.random() * 1000),
                tenant_id: savedTenant.id,
                username,
                nickname: safeText(adminForm.nickname, existingAdmin?.nickname || `${savedTenant.name}管理员`),
                phone: safeText(adminForm.phone, existingAdmin?.phone),
                password,
                role: adminRole,
                status: existingAdmin?.status || 'active',
                permissions: getRolePermissions(adminRole),
            });
        },
    );
}

async function applyBillingRecord(record, operator = {}) {
    const tenants = await readTenants();
    const tenant = tenants.find((item) => item.id === toInteger(record.tenant_id, 0));
    if (!tenant) {
        throw createRequestError('计费记录对应的租户不存在。', 404);
    }

    const now = new Date();
    const nextExpiry = resolveNextExpiryDate(tenant.expires_at, record.duration_days, now);
    const payload = record.payload && typeof record.payload === 'object' ? record.payload : {};
    const normalizedFeatures = Array.isArray(payload.features) ? payload.features : normalizeTenantLicense(payload, tenant).features;
    const nextSubscriptionType =
        record.kind === 'trial'
            ? 'trial'
            : safeText(payload.subscription_type, record.kind === 'manual_adjustment' ? tenant.subscription_type : 'paid') || 'paid';
    const nextTenant = await saveTenant({
        ...tenant,
        subscription_name: safeText(record.subscription_name, payload.subscription_name || tenant.subscription_name),
        subscription_type: nextSubscriptionType,
        trial_started_at: record.kind === 'trial' ? now.toISOString() : nextSubscriptionType === 'trial' ? tenant.trial_started_at : null,
        expires_at: nextExpiry,
        max_user_count: toInteger(payload.max_user_count, tenant.max_user_count || 0),
        max_order_count: toInteger(payload.max_order_count, tenant.max_order_count || 0),
        max_plan_count: toInteger(payload.max_plan_count, tenant.max_plan_count || 0),
        max_device_count: toInteger(payload.max_device_count, tenant.max_device_count || 0),
        features: normalizedFeatures,
        auto_suspend_on_expiry: toBooleanFlag(payload.auto_suspend_on_expiry, tenant.auto_suspend_on_expiry ?? true),
        status: 'active',
        updated_at: now.toISOString(),
    });

    const savedRecord = await saveTenantBillingRecord({
        ...record,
        before_expires_at: tenant.expires_at || null,
        after_expires_at: nextTenant.expires_at || null,
        status: 'applied',
        applied_at: now.toISOString(),
        paid_at: record.paid_at || now.toISOString(),
        operator_id: toInteger(operator.userId ?? record.operator_id, 0),
        operator_role: safeText(operator.userRole ?? record.operator_role),
        updated_at: now.toISOString(),
    });

    return {
        tenant: nextTenant,
        record: savedRecord,
    };
}

let tenantLicenseSweepTimer = null;

async function sweepTenantLicenseStatuses(reason = 'manual') {
    const tenants = await readTenants();
    const now = Date.now();
    const updatedTenants = [];

    for (const tenant of tenants) {
        if (!tenant.auto_suspend_on_expiry) {
            continue;
        }
        if (tenant.status !== 'active') {
            continue;
        }
        if (!resolveTenantExpiryInfo(tenant.expires_at, now).is_expired) {
            continue;
        }

        updatedTenants.push(
            await saveTenant({
                ...tenant,
                status: 'suspended',
                updated_at: new Date(now).toISOString(),
            }),
        );
    }

    if (updatedTenants.length) {
        console.warn(`[tenant-license-sweep] reason=${reason}, suspended=${updatedTenants.length}`);
    }

    return {
        reason,
        suspended_count: updatedTenants.length,
        tenants: updatedTenants,
    };
}

async function recoverTenantLicenseStatesOnStartup() {
    return sweepTenantLicenseStatuses('startup');
}

function startTenantLicenseSweepScheduler() {
    if (tenantLicenseSweepTimer) {
        return tenantLicenseSweepTimer;
    }

    const intervalMs = 60 * 60 * 1000;
    const runSweep = () =>
        sweepTenantLicenseStatuses('scheduler').catch((error) => {
            console.error('[tenant-license-sweep] failed', error);
        });

    runSweep();
    tenantLicenseSweepTimer = setInterval(runSweep, intervalMs);
    if (typeof tenantLicenseSweepTimer.unref === 'function') {
        tenantLicenseSweepTimer.unref();
    }
    return tenantLicenseSweepTimer;
}

function resolveWorkflowActor(actor = {}) {
    return {
        userId: toInteger(actor.userId ?? actor.id ?? actor.operatorId, 0),
        userRole: safeText(actor.userRole ?? actor.role ?? actor.operatorRole, 'system'),
    };
}

async function loadAdminOrderContext(orderId, rawEms = undefined) {
    const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
    const order = orders.find((item) => item.id === toInteger(orderId, 0));

    if (!order) {
        throw createRequestError('订单不存在。', 404);
    }

    order.ems = normalizeAdminEmsPayload(rawEms, order.ems);
    return {
        orders,
        settings,
        order,
        runtimeConfig: buildRuntimeEmsConfig(settings),
    };
}

async function runEmsParseAddressStepById(orderId, { rawEms = undefined, wholeAddress = '', actor = {} } = {}) {
    const { order, runtimeConfig } = await loadAdminOrderContext(orderId, rawEms);
    const normalizedActor = resolveWorkflowActor(actor);
    const targetAddress = safeText(wholeAddress, order.shipping_address);

    if (!targetAddress) {
        throw createRequestError('请先填写收件地址后再解析。');
    }

    try {
        const candidates = await parseAddress(targetAddress, { config: runtimeConfig });

        if (!candidates.length) {
            order.ems = {
                ...order.ems,
                address_parse_source: targetAddress,
                address_parse_candidates: [],
                address_parsed_at: new Date().toISOString(),
                parse_payload: { wholeAddress: targetAddress },
                parse_response: { candidates: [] },
                last_error: 'EMS 地址解析未命中，请手工补全省市区。',
            };
            appendEmsAudit(order, {
                action: 'parse-address',
                status: 'error',
                request: { wholeAddress: targetAddress },
                response: { candidates: [] },
                retMsg: order.ems.last_error,
            });
            await commitStoreChanges({ orders: [order] });
            throw createRequestError('EMS 地址解析未命中，请手工补全省市区。');
        }

        const firstCandidate = applyParsedAddressToOrder(order, targetAddress, candidates);
        order.ems = {
            ...order.ems,
            address_parsed_at: new Date().toISOString(),
            parse_payload: { wholeAddress: targetAddress },
            parse_response: { candidates },
            last_error: '',
        };
        appendEmsAudit(order, {
            action: 'parse-address',
            request: { wholeAddress: targetAddress },
            response: { candidates },
            retMsg: '地址解析成功',
        });
        appendOrderLog(order, {
            operatorId: normalizedActor.userId,
            operatorRole: normalizedActor.userRole,
            action: 'EMS地址解析',
            content: `已解析为 ${firstCandidate.prov}${firstCandidate.city}${firstCandidate.county}`,
        });

        await commitStoreChanges({ orders: [order] });
        return {
            order,
            receiver: order.ems.receiver,
            candidates: order.ems.address_parse_candidates,
            message: `已解析为 ${firstCandidate.prov}${firstCandidate.city}${firstCandidate.county}`,
        };
    } catch (error) {
        if (error.statusCode) {
            throw error;
        }

        const errorMessage = persistEmsFailure(order, error, {
            action: 'parse-address',
            request: { wholeAddress: targetAddress },
        });
        order.ems = {
            ...order.ems,
            address_parse_source: targetAddress,
            address_parse_candidates: [],
            parse_payload: { wholeAddress: targetAddress },
            parse_response: compactAuditValue(error?.response || { message: safeText(error?.message) }),
        };
        await commitStoreChanges({ orders: [order] });
        throw createRequestError(errorMessage);
    }
}

async function runEmsValidateStepById(orderId, { rawEms = undefined, actor = {} } = {}) {
    const { order, settings, runtimeConfig } = await loadAdminOrderContext(orderId, rawEms);
    const normalizedActor = resolveWorkflowActor(actor);

    try {
        if (!receiverHasFullAddress(order)) {
            const candidates = await parseAddress(order.ems?.address_parse_source || order.shipping_address, {
                config: runtimeConfig,
            });
            if (!candidates.length) {
                throw new Error('收件地址还没有解析成功，请先解析或手工补全。');
            }
            applyParsedAddressToOrder(order, order.ems?.address_parse_source || order.shipping_address, candidates);
        }

        const receiver = validatePartyAddress(
            {
                ...order.ems.receiver,
                name: order.ems.receiver?.name || order.customer_name,
                mobile: order.ems.receiver?.mobile || order.customer_phone,
                postCode: order.ems.receiver?.post_code,
            },
            '收件地址',
        );
        const sender = validatePartyAddress(
            await resolveSenderFromSettings(settings, order.ems?.sender || {}, runtimeConfig),
            '寄件地址',
        );
        const validatePayload = buildReachabilityPayload(order, sender, receiver, runtimeConfig);

        const response = await checkReachability(validatePayload, { config: runtimeConfig });
        order.ems = {
            ...order.ems,
            sender: normalizeEmsPartyPayload({ ...sender, post_code: sender.postCode }, order.ems.sender),
            receiver: normalizeEmsPartyPayload({ ...receiver, post_code: receiver.postCode }, order.ems.receiver),
            reachable: true,
            reachable_message: safeText(response.retMsg, '该地址信息可达！'),
            reachable_checked_at: new Date().toISOString(),
            last_serial_no: safeText(response.serialNo, order.ems.last_serial_no),
            last_error: '',
            validate_payload: validatePayload,
            validate_response: compactAuditValue(response),
        };
        appendEmsAudit(order, {
            action: 'validate',
            request: validatePayload,
            response,
            retCode: response.retCode,
            retMsg: response.retMsg,
            serialNo: response.serialNo,
        });

        appendOrderLog(order, {
            operatorId: normalizedActor.userId,
            operatorRole: normalizedActor.userRole,
            action: 'EMS可达校验',
            content: order.ems.reachable_message || 'EMS 收寄地址校验通过',
        });

        await commitStoreChanges({ orders: [order] });
        return {
            order,
            reachable: order.ems.reachable,
            reachable_message: order.ems.reachable_message,
            receiver: order.ems.receiver,
            sender: order.ems.sender,
            message: order.ems.reachable_message || 'EMS 收寄地址校验通过',
        };
    } catch (error) {
        order.ems = {
            ...order.ems,
            reachable: false,
            reachable_message: persistEmsFailure(order, error, {
                action: 'validate',
                request: order.ems?.validate_payload || null,
            }),
            reachable_checked_at: new Date().toISOString(),
            validate_response: compactAuditValue(error?.response || { message: safeText(error?.message) }),
        };
        await commitStoreChanges({ orders: [order] });
        throw createRequestError(order.ems.reachable_message);
    }
}

async function runEmsCreateStepById(orderId, { rawEms = undefined, actor = {} } = {}) {
    const { order, settings, runtimeConfig } = await loadAdminOrderContext(orderId, rawEms);
    const normalizedActor = resolveWorkflowActor(actor);
    const previousNoticeSnapshot = buildOrderNoticeSnapshot(order);

    if (order.status === 'cancelled') {
        throw createRequestError('已取消订单不能创建 EMS 运单。');
    }
    if (safeText(order.ems?.waybill_no)) {
        throw createRequestError('当前订单已经生成 EMS 运单号。');
    }

    try {
        if (!receiverHasFullAddress(order)) {
            const candidates = await parseAddress(order.ems?.address_parse_source || order.shipping_address, {
                config: runtimeConfig,
            });
            if (!candidates.length) {
                throw new Error('收件地址还没有解析成功，请先解析或手工补全。');
            }
            applyParsedAddressToOrder(order, order.ems?.address_parse_source || order.shipping_address, candidates);
        }

        const receiver = validatePartyAddress(
            {
                ...order.ems.receiver,
                name: order.ems.receiver?.name || order.customer_name,
                mobile: order.ems.receiver?.mobile || order.customer_phone,
                postCode: order.ems.receiver?.post_code,
            },
            '收件地址',
        );
        const sender = validatePartyAddress(
            await resolveSenderFromSettings(settings, order.ems?.sender || {}, runtimeConfig),
            '寄件地址',
        );

        const reachablePayload = buildReachabilityPayload(order, sender, receiver, runtimeConfig);
        const reachableResponse = await checkReachability(reachablePayload, { config: runtimeConfig });
        const logisticsOrderNo = order.order_no;
        const orderPayload = {
            ecommerceUserId: preferText(order.ems?.ecommerce_user_id, `${order.order_no}-${order.id}`),
            logisticsOrderNo,
            createdTime: formatTimestamp(),
            senderNo: runtimeConfig.senderNo,
            contentsAttribute: preferText(order.ems?.contents_attribute, runtimeConfig.contentsAttribute),
            bizProductNo: preferText(order.ems?.biz_product_no, runtimeConfig.bizProductNo),
            bizProductId: safeText(order.ems?.biz_product_id, runtimeConfig.bizProductId),
            weight: Number(preferText(order.ems?.package_weight, runtimeConfig.defaultWeightGrams)),
            remarks: buildEmsRemark(order),
            sender,
            receiver,
            cargos: buildCargoList(order, runtimeConfig),
        };

        const { response, body } = await createWaybillOrder(orderPayload, { config: runtimeConfig });
        const waybillNo = safeText(body.waybillNo);
        if (!waybillNo) {
            throw new Error('EMS 建单成功但未返回运单号。');
        }

        order.ems = {
            ...order.ems,
            sender: normalizeEmsPartyPayload({ ...sender, post_code: sender.postCode }, order.ems.sender),
            receiver: normalizeEmsPartyPayload({ ...receiver, post_code: receiver.postCode }, order.ems.receiver),
            reachable: true,
            reachable_message: safeText(reachableResponse.retMsg, '该地址信息可达！'),
            reachable_checked_at: new Date().toISOString(),
            ecommerce_user_id: orderPayload.ecommerceUserId,
            logistics_order_no: preferText(body.logisticsOrderNo, logisticsOrderNo),
            waybill_no: waybillNo,
            route_code: safeText(body.routeCode),
            package_code: safeText(body.packageCode),
            package_code_name: safeText(body.packageCodeName),
            mark_destination_code: safeText(body.markDestinationCode),
            mark_destination_name: safeText(body.markDestinationName),
            biz_product_no: preferText(orderPayload.bizProductNo, runtimeConfig.bizProductNo),
            biz_product_id: safeText(orderPayload.bizProductId),
            contents_attribute: preferText(orderPayload.contentsAttribute, runtimeConfig.contentsAttribute),
            package_weight: preferText(orderPayload.weight, runtimeConfig.defaultWeightGrams),
            last_serial_no: safeText(response.serialNo, order.ems.last_serial_no),
            last_error: '',
            waybill_created_at: new Date().toISOString(),
            validate_payload: reachablePayload,
            validate_response: compactAuditValue(reachableResponse),
            order_payload: orderPayload,
            order_response: compactAuditValue(response),
        };
        order.logistics_company = 'EMS';
        order.merchant_tracking_number = waybillNo;
        appendEmsAudit(order, {
            action: 'create',
            request: orderPayload,
            response,
            retCode: response.retCode,
            retMsg: response.retMsg,
            serialNo: response.serialNo,
        });

        appendOrderLog(order, {
            operatorId: normalizedActor.userId,
            operatorRole: normalizedActor.userRole,
            action: 'EMS建单成功',
            content: `已获取 EMS 运单号 ${waybillNo}`,
        });
        syncOrderLogisticsUserNotices(order, {
            previousSnapshot: previousNoticeSnapshot,
        });

        await commitStoreChanges({ orders: [order] });
        return {
            order,
            tracking_number: order.merchant_tracking_number,
            waybill_no: order.ems.waybill_no,
            message: `EMS 单号已生成：${waybillNo}`,
        };
    } catch (error) {
        const errorMessage = persistEmsFailure(order, error, {
            action: 'create',
            request: order.ems?.order_payload || null,
        });
        await commitStoreChanges({ orders: [order] });
        throw createRequestError(errorMessage);
    }
}

async function runEmsLabelStepById(orderId, { rawEms = undefined, actor = {} } = {}) {
    const { order, runtimeConfig } = await loadAdminOrderContext(orderId, rawEms);
    const normalizedActor = resolveWorkflowActor(actor);
    const waybillNo = buildTrackingNumber(order);

    if (!waybillNo) {
        throw createRequestError('请先创建 EMS 运单后再获取面单。');
    }

    try {
        const labelPayload = {
            orderNo: order.order_no,
            waybillNo,
            type: preferText(order.ems?.label_type, runtimeConfig.labelType),
        };
        const label = await getLabelDocument(
            {
                orderNo: labelPayload.orderNo,
                waybillNo: labelPayload.waybillNo,
                type: labelPayload.type,
            },
            { config: runtimeConfig },
        );

        order.ems = {
            ...order.ems,
            waybill_no: waybillNo,
            label_type: label.labelType,
            label_url: safeText(label.labelUrl),
            label_file: safeText(label.labelFile),
            label_generated_at: new Date().toISOString(),
            label_requested_at: new Date().toISOString(),
            last_serial_no: safeText(label.response.serialNo, order.ems.last_serial_no),
            last_error: '',
            label_payload: labelPayload,
            label_response: compactAuditValue(label.response),
        };
        appendEmsAudit(order, {
            action: 'label',
            request: labelPayload,
            response: label.response,
            retCode: label.response.retCode,
            retMsg: label.response.retMsg,
            serialNo: label.response.serialNo,
        });

        appendOrderLog(order, {
            operatorId: normalizedActor.userId,
            operatorRole: normalizedActor.userRole,
            action: '获取EMS面单',
            content: `已生成面单文件 ${order.ems.label_file}`,
        });

        await commitStoreChanges({ orders: [order] });
        return {
            order,
            label_file: order.ems.label_file,
            label_url: order.ems.label_url,
            cloud_print_download_url: getCloudPrintDownloadUrl(),
            message: order.ems.label_file ? 'EMS 面单已生成' : 'EMS 面单已返回',
        };
    } catch (error) {
        const errorMessage = persistEmsFailure(order, error, {
            action: 'label',
            request: order.ems?.label_payload || {
                orderNo: order.order_no,
                waybillNo,
                type: preferText(order.ems?.label_type, runtimeConfig.labelType),
            },
        });
        await commitStoreChanges({ orders: [order] });
        throw createRequestError(errorMessage);
    }
}

async function runEmsPrintStepById(orderId, { rawEms = undefined, actor = {} } = {}) {
    const { order, runtimeConfig } = await loadAdminOrderContext(orderId, rawEms);
    const normalizedActor = resolveWorkflowActor(actor);
    const previousNoticeSnapshot = buildOrderNoticeSnapshot(order);

    try {
        if (!safeText(order.ems?.label_file)) {
            const waybillNo = buildTrackingNumber(order);
            if (!waybillNo) {
                throw new Error('请先创建 EMS 运单并生成面单。');
            }

            const label = await getLabelDocument(
                {
                    orderNo: order.order_no,
                    waybillNo,
                    type: preferText(order.ems?.label_type, runtimeConfig.labelType),
                },
                { config: runtimeConfig },
            );

            order.ems = {
                ...order.ems,
                label_type: label.labelType,
                label_url: safeText(label.labelUrl),
                label_file: safeText(label.labelFile),
                label_generated_at: new Date().toISOString(),
                label_requested_at: new Date().toISOString(),
                last_serial_no: safeText(label.response.serialNo, order.ems.last_serial_no),
                last_error: '',
                label_payload: {
                    orderNo: order.order_no,
                    waybillNo,
                    type: preferText(order.ems?.label_type, runtimeConfig.labelType),
                },
                label_response: compactAuditValue(label.response),
            };
            appendEmsAudit(order, {
                action: 'label',
                request: order.ems.label_payload,
                response: label.response,
                retCode: label.response.retCode,
                retMsg: label.response.retMsg,
                serialNo: label.response.serialNo,
            });
        }

        const printPayload = {
            labelFile: order.ems.label_file,
            printerName: runtimeConfig.printerName,
            mode: runtimeConfig.printMode,
            paperName: runtimeConfig.paperName,
            paperWidthMm: runtimeConfig.paperWidthMm,
            paperHeightMm: runtimeConfig.paperHeightMm,
            labelType: preferText(order.ems?.label_type, runtimeConfig.labelType),
        };
        const printDiagnostics = await assertPrintPreflight({ config: runtimeConfig });
        appendEmsAudit(order, {
            action: 'print-preflight',
            request: printPayload,
            response: printDiagnostics,
            retMsg: '打印前自检通过',
        });

        const printResult = await dispatchPrintJob(order.ems.label_file, { config: runtimeConfig });
        order.ems = {
            ...order.ems,
            print_status: printResult.dispatched ? 'queued' : printResult.mode || 'browser',
            print_mode: safeText(printResult.mode, runtimeConfig.printMode),
            print_message: safeText(printResult.message),
            print_attempted_at: new Date().toISOString(),
            printed_at: printResult.dispatched ? new Date().toISOString() : order.ems.printed_at,
            last_error: '',
            print_payload: printPayload,
            print_response: compactAuditValue({
                ...printResult,
                preflight: printDiagnostics.preflight,
            }),
        };
        appendEmsAudit(order, {
            action: 'print',
            request: printPayload,
            response: {
                ...printResult,
                preflight: printDiagnostics.preflight,
            },
            retMsg: printResult.message,
        });

        appendOrderLog(order, {
            operatorId: normalizedActor.userId,
            operatorRole: normalizedActor.userRole,
            action: '打印EMS面单',
            content: order.ems.print_message || '已触发 EMS 面单打印',
        });
        syncOrderLogisticsUserNotices(order, {
            previousSnapshot: previousNoticeSnapshot,
        });

        await commitStoreChanges({ orders: [order] });
        return {
            order,
            ...printResult,
            label_file: order.ems.label_file,
            cloud_print_download_url: getCloudPrintDownloadUrl(),
            message: printResult.message || '打印任务已发送',
        };
    } catch (error) {
        const errorMessage = persistEmsFailure(order, error, {
            action: error?.code === 'PRINT_PREFLIGHT' ? 'print-preflight' : 'print',
            request: order.ems?.print_payload || {
                labelFile: order.ems?.label_file,
                printerName: runtimeConfig.printerName,
                mode: runtimeConfig.printMode,
                paperName: runtimeConfig.paperName,
                paperWidthMm: runtimeConfig.paperWidthMm,
                paperHeightMm: runtimeConfig.paperHeightMm,
                labelType: preferText(order.ems?.label_type, runtimeConfig.labelType),
            },
        });
        await commitStoreChanges({ orders: [order] });
        throw createRequestError(errorMessage);
    }
}

async function runEmsTrackSyncStepById(orderId, { rawEms = undefined, actor = {} } = {}) {
    const { order, runtimeConfig } = await loadAdminOrderContext(orderId, rawEms);
    const normalizedActor = resolveWorkflowActor(actor);
    const waybillNo = buildTrackingNumber(order);
    const previousNoticeSnapshot = buildOrderNoticeSnapshot(order);

    if (!waybillNo) {
        throw createRequestError('当前订单还没有 EMS 运单号。');
    }

    try {
        const trackPayload = {
            waybillNo,
            direction: order.ems?.tracking_direction || '0',
        };
        const { response, items } = await queryTrackItems(waybillNo, trackPayload.direction, { config: runtimeConfig });
        const trackResult = analyzeTrackQueryResult(response, items);
        if (trackResult.suspiciousEmpty) {
            const error = new Error(trackResult.message);
            error.code = 'EMS_TRACK_EMPTY';
            error.response = response;
            throw error;
        }
        order.ems = {
            ...order.ems,
            waybill_no: waybillNo,
            track_items: trackResult.items.map(normalizeEmsTrackPayload),
            track_summary: summarizeLatestTrack(trackResult.items),
            last_track_sync_at: new Date().toISOString(),
            last_serial_no: safeText(response.serialNo, order.ems.last_serial_no),
            last_error: '',
            track_payload: trackPayload,
            track_response: compactAuditValue(response),
        };
        order.ems.auto_track_sync_failure_streak = 0;
        order.ems.auto_track_sync_last_error = '';
        order.ems.auto_track_sync_last_success_at = new Date().toISOString();
        order.logistics_company = order.logistics_company || 'EMS';
        order.merchant_tracking_number = order.merchant_tracking_number || waybillNo;
        appendEmsAudit(order, {
            action: 'track-sync',
            request: trackPayload,
            response,
            retCode: response.retCode,
            retMsg: response.retMsg,
            serialNo: response.serialNo,
        });

        appendOrderLog(order, {
            operatorId: normalizedActor.userId,
            operatorRole: normalizedActor.userRole,
            action: '同步EMS轨迹',
            content: trackResult.items.length ? `已同步 ${trackResult.items.length} 条 EMS 轨迹` : '当前暂无 EMS 轨迹',
        });
        syncOrderLogisticsUserNotices(order, {
            previousSnapshot: previousNoticeSnapshot,
            markAsRead: normalizedActor.userRole === 'user',
        });

        await commitStoreChanges({ orders: [order] });
        return {
            order,
            tracks: order.ems.track_items,
            track_summary: order.ems.track_summary,
            last_track_sync_at: order.ems.last_track_sync_at,
            message:
                order.ems.track_summary || (trackResult.items.length ? `已同步 ${trackResult.items.length} 条 EMS 轨迹` : '当前暂无 EMS 轨迹'),
        };
    } catch (error) {
        const errorMessage = persistEmsFailure(order, error, {
            action: 'track-sync',
            request: order.ems?.track_payload || {
                waybillNo,
                direction: order.ems?.tracking_direction || '0',
            },
        });
        if (normalizedActor.userRole === 'system-auto') {
            order.ems = {
                ...order.ems,
                auto_track_sync_failure_streak: Math.max(0, toInteger(order.ems?.auto_track_sync_failure_streak, 0)) + 1,
                auto_track_sync_last_failed_at: new Date().toISOString(),
                auto_track_sync_last_error: errorMessage,
            };
        }
        await commitStoreChanges({ orders: [order] });
        throw createRequestError(errorMessage);
    }
}

function isWorkflowTaskActive(task = null) {
    return Boolean(task && EMS_WORKFLOW_ACTIVE_STATUSES.includes(safeText(task.status)));
}

function createWorkflowTask({ mode = 'single', includeTrack = true, initiatorId = 0, initiatorRole = 'system' } = {}) {
    const now = new Date().toISOString();
    return {
        id: `emswf-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        mode: safeText(mode, 'single'),
        status: 'queued',
        current_step: '',
        error: '',
        include_track: includeTrack !== false,
        initiator_id: toInteger(initiatorId, 0),
        initiator_role: safeText(initiatorRole, 'system'),
        enqueued_at: now,
        started_at: null,
        finished_at: null,
        updated_at: now,
        steps: buildDefaultWorkflowTaskSteps(),
    };
}

async function loadOrderForWorkflow(orderId) {
    const orders = await readOrders();
    const order = orders.find((item) => item.id === toInteger(orderId, 0));
    if (!order) {
        throw createRequestError('订单不存在。', 404);
    }
    order.ems = normalizeAdminEmsPayload(order.ems, order.ems);
    return order;
}

async function updateWorkflowTaskByOrderId(orderId, taskId, updater) {
    const orders = await readOrders();
    const order = orders.find((item) => item.id === toInteger(orderId, 0));

    if (!order) {
        return null;
    }

    order.ems = normalizeAdminEmsPayload(order.ems, order.ems);
    const currentTask = normalizeWorkflowTaskPayload(order.ems.workflow_task, order.ems.workflow_task);

    if (!currentTask || safeText(currentTask.id) !== safeText(taskId)) {
        return null;
    }

    const nextTask = normalizeWorkflowTaskPayload(updater(currentTask, order), currentTask);
    order.ems = {
        ...order.ems,
        workflow_task: nextTask,
    };
    await commitStoreChanges({ orders: [order] });
    return order;
}

async function updateWorkflowTaskStep(orderId, taskId, stepKey, status, message = '', overallPatch = {}) {
    return updateWorkflowTaskByOrderId(orderId, taskId, (task) => ({
        ...task,
        ...overallPatch,
        updated_at: new Date().toISOString(),
        steps: {
            ...(task.steps || buildDefaultWorkflowTaskSteps()),
            [stepKey]: {
                ...((task.steps || buildDefaultWorkflowTaskSteps())[stepKey] || {}),
                status: safeText(status, 'idle'),
                message: safeText(message),
                updated_at: new Date().toISOString(),
            },
        },
    }));
}

function buildQueuedWorkflowStepDefinitions(task = {}) {
    const actor = {
        userId: task.initiator_id,
        userRole: task.initiator_role || 'system',
    };

    return [
        {
            key: 'parse',
            shouldSkip: (order) => Boolean(order.ems?.address_parsed_at && receiverHasFullAddress(order)),
            skipMessage: '已有解析结果，本步已跳过',
            run: (orderId) => runEmsParseAddressStepById(orderId, { actor }),
            getMessage: (result) => result.message || '地址解析成功',
        },
        {
            key: 'validate',
            shouldSkip: () => false,
            run: (orderId) => runEmsValidateStepById(orderId, { actor }),
            getMessage: (result) => result.message || '可达校验通过',
        },
        {
            key: 'create',
            shouldSkip: (order) => Boolean(buildTrackingNumber(order)),
            skipMessage: (order) => `已存在单号 ${buildTrackingNumber(order)}，已跳过建单`,
            run: (orderId) => runEmsCreateStepById(orderId, { actor }),
            getMessage: (result) => result.message || 'EMS 单号已生成',
        },
        {
            key: 'label',
            shouldSkip: (order) => Boolean(order.ems?.label_file),
            skipMessage: () => '已有面单文件，已跳过获取',
            run: (orderId) => runEmsLabelStepById(orderId, { actor }),
            getMessage: (result) => result.message || 'EMS 面单已生成',
        },
        {
            key: 'print',
            shouldSkip: () => false,
            run: (orderId) => runEmsPrintStepById(orderId, { actor }),
            getMessage: (result) => result.message || '打印任务已发送',
            getStatus: (result) => (['browser', 'open'].includes(safeText(result.mode).toLowerCase()) ? 'pending' : 'success'),
        },
        {
            key: 'track',
            shouldSkip: (order, currentTask) => currentTask.include_track === false || !buildTrackingNumber(order),
            skipMessage: (order, currentTask) =>
                currentTask.include_track === false ? '本次未执行轨迹同步' : '暂无运单号，已跳过轨迹同步',
            run: (orderId) => runEmsTrackSyncStepById(orderId, { actor }),
            getMessage: (result) => result.message || '轨迹已同步',
        },
    ];
}

async function processEmsWorkflowTask(job = {}) {
    const orderId = toInteger(job.orderId, 0);
    const taskId = safeText(job.taskId);

    if (!orderId || !taskId) {
        return;
    }

    let order = await updateWorkflowTaskByOrderId(orderId, taskId, (task) => ({
        ...task,
        status: 'running',
        started_at: task.started_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_step: '',
        error: '',
    }));

    if (!order) {
        return;
    }

    const currentTask = normalizeWorkflowTaskPayload(order.ems.workflow_task, order.ems.workflow_task);
    const stepDefinitions = buildQueuedWorkflowStepDefinitions(currentTask);

    for (const step of stepDefinitions) {
        order = await loadOrderForWorkflow(orderId);
        const latestTask = normalizeWorkflowTaskPayload(order.ems.workflow_task, order.ems.workflow_task);

        if (!latestTask || safeText(latestTask.id) !== taskId || latestTask.status !== 'running') {
            return;
        }

        if (step.shouldSkip(order, latestTask)) {
            const skipMessage = typeof step.skipMessage === 'function' ? step.skipMessage(order, latestTask) : step.skipMessage;
            await updateWorkflowTaskStep(orderId, taskId, step.key, 'skipped', skipMessage, {
                current_step: '',
            });
            continue;
        }

        await updateWorkflowTaskStep(orderId, taskId, step.key, 'running', '执行中', {
            current_step: step.key,
            status: 'running',
            error: '',
        });

        try {
            const result = await step.run(orderId);
            const nextStatus = typeof step.getStatus === 'function' ? step.getStatus(result, order) : 'success';
            const nextMessage = typeof step.getMessage === 'function' ? step.getMessage(result, order) : step.label || '已完成';
            await updateWorkflowTaskStep(orderId, taskId, step.key, nextStatus, nextMessage, {
                current_step: '',
                status: 'running',
            });
        } catch (error) {
            const errorMessage = safeText(error?.message, '后台任务执行失败');
            await updateWorkflowTaskStep(orderId, taskId, step.key, 'error', errorMessage, {
                current_step: '',
                status: 'failed',
                error: errorMessage,
                finished_at: new Date().toISOString(),
            });
            return;
        }
    }

    await updateWorkflowTaskByOrderId(orderId, taskId, (task) => ({
        ...task,
        status: 'completed',
        current_step: '',
        error: '',
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }));
}

async function flushEmsWorkflowQueue() {
    if (emsWorkflowProcessing) {
        return;
    }

    emsWorkflowProcessing = true;
    try {
        while (emsWorkflowQueue.length) {
            const job = emsWorkflowQueue.shift();
            try {
                await runWithTenantContext(
                    {
                        tenantId: job.tenantId || job.tenant_id,
                        tenantCode: job.tenantCode || job.tenant_code,
                    },
                    () => processEmsWorkflowTask(job),
                );
            } catch (error) {
                console.error('[ems-workflow-queue] task failed', error);
            }
        }
    } finally {
        emsWorkflowProcessing = false;
    }
}

async function enqueueWorkflowForOrder(orderId, { includeTrack = true, initiatorId = 0, initiatorRole = 'system', mode = 'single' } = {}) {
    const orders = await readOrders();
    const order = orders.find((item) => item.id === toInteger(orderId, 0));

    if (!order) {
        throw createRequestError('订单不存在。', 404);
    }

    order.ems = normalizeAdminEmsPayload(order.ems, order.ems);
    const existingTask = normalizeWorkflowTaskPayload(order.ems.workflow_task, order.ems.workflow_task);
    if (isWorkflowTaskActive(existingTask)) {
        return {
            task: existingTask,
            alreadyQueued: true,
        };
    }

    const task = createWorkflowTask({
        mode,
        includeTrack,
        initiatorId,
        initiatorRole,
    });
    order.ems = {
        ...order.ems,
        workflow_task: task,
    };
    await commitStoreChanges({ orders: [order] });

    emsWorkflowQueue.push({
        orderId: order.id,
        taskId: task.id,
        tenantId: order.tenant_id,
        tenantCode: getCurrentTenantCode(),
    });
    scheduleDetachedTask(flushEmsWorkflowQueue, 0);

    return {
        task,
        alreadyQueued: false,
    };
}

async function recoverEmsWorkflowQueueForCurrentTenant() {
    const orders = await readOrders();
    const interruptedOrders = [];
    let requeuedCount = 0;
    let interruptedCount = 0;

    for (const order of orders) {
        order.ems = normalizeAdminEmsPayload(order.ems, order.ems);
        const task = normalizeWorkflowTaskPayload(order.ems.workflow_task, order.ems.workflow_task);

        if (!isWorkflowTaskActive(task)) {
            continue;
        }

        if (task.status === 'queued') {
            const exists = emsWorkflowQueue.some(
                (job) => job.orderId === order.id && safeText(job.taskId) === safeText(task.id) && Number(job.tenantId || 0) === Number(order.tenant_id || 0),
            );
            if (!exists) {
                emsWorkflowQueue.push({
                    orderId: order.id,
                    taskId: task.id,
                    tenantId: order.tenant_id,
                    tenantCode: getCurrentTenantCode(),
                });
                requeuedCount += 1;
            }
            continue;
        }

        const now = new Date().toISOString();
        const nextSteps = {
            ...(task.steps || buildDefaultWorkflowTaskSteps()),
        };

        if (task.current_step && nextSteps[task.current_step]?.status === 'running') {
            nextSteps[task.current_step] = {
                ...nextSteps[task.current_step],
                status: 'error',
                message: '服务重启导致任务中断，请点击重试',
                updated_at: now,
            };
        }

        order.ems = {
            ...order.ems,
            workflow_task: {
                ...task,
                status: 'failed',
                current_step: '',
                error: '服务重启导致后台任务中断，请点击重试',
                finished_at: now,
                updated_at: now,
                steps: nextSteps,
            },
        };
        interruptedOrders.push(order);
        interruptedCount += 1;
    }

    if (interruptedOrders.length) {
        await commitStoreChanges({ orders: interruptedOrders });
    }

    return {
        requeuedCount,
        interruptedCount,
    };
}

async function recoverEmsWorkflowQueueOnStartup() {
    const tenants = await readTenants();
    let requeuedCount = 0;
    let interruptedCount = 0;

    for (const tenant of tenants) {
        const result = await runWithTenantContext(
            {
                tenantId: tenant.id,
                tenantCode: tenant.code,
                tenant,
            },
            () => recoverEmsWorkflowQueueForCurrentTenant(),
        );
        requeuedCount += Number(result?.requeuedCount || 0);
        interruptedCount += Number(result?.interruptedCount || 0);
    }

    if (emsWorkflowQueue.length) {
        scheduleDetachedTask(flushEmsWorkflowQueue, 0);
    }

    if (requeuedCount || interruptedCount) {
        console.log(`[ems-workflow-queue] startup recovery completed: requeued=${requeuedCount}, interrupted=${interruptedCount}`);
    }

    return {
        requeuedCount,
        interruptedCount,
    };
}

function shouldAutoSyncTrackForOrder(order, settings = {}, now = Date.now()) {
    if (!settings?.logistics?.auto_sync_tracks) {
        return false;
    }

    if (!order || ['cancelled', 'completed'].includes(order.status)) {
        return false;
    }

    if (!isEmsManagedOrder(order)) {
        return false;
    }

    order.ems = normalizeAdminEmsPayload(order.ems, order.ems);
    const workflowTask = normalizeWorkflowTaskPayload(order.ems.workflow_task, order.ems.workflow_task);
    if (isWorkflowTaskActive(workflowTask)) {
        return false;
    }

    const trackingNumber = buildTrackingNumber(order);
    if (!trackingNumber) {
        return false;
    }

    const intervalMs = resolveTrackAutoSyncIntervalHours(settings) * 60 * 60 * 1000;
    const lastSyncAt = order.ems?.last_track_sync_at ? new Date(order.ems.last_track_sync_at).getTime() : 0;
    const lastFailedAt = order.ems?.auto_track_sync_last_failed_at ? new Date(order.ems.auto_track_sync_last_failed_at).getTime() : 0;
    const lastAttemptAt = Math.max(lastSyncAt, lastFailedAt);

    return !lastAttemptAt || now - lastAttemptAt >= intervalMs;
}

async function runEmsTrackAutoSyncSweepForCurrentTenant({ reason = 'interval', tenant = null } = {}) {
    if (tenant && !hasTenantFeature(tenant, 'ems')) {
        return {
            reason,
            tenantCode: tenant.code || '',
            disabled: true,
            message: '租户未开通 EMS 功能',
        };
    }

    const settings = await readSettings();
    if (!settings?.logistics?.auto_sync_tracks) {
        return {
            reason,
            tenantCode: tenant?.code || '',
            disabled: true,
            message: 'EMS 轨迹自动同步未开启',
        };
    }

    const orders = await readOrders();
    const now = Date.now();
    const candidates = orders.filter((order) => shouldAutoSyncTrackForOrder(order, settings, now));
    let successCount = 0;
    let failedCount = 0;

    for (const order of candidates) {
        try {
            await runEmsTrackSyncStepById(order.id, {
                actor: {
                    userId: 0,
                    userRole: 'system-auto',
                },
            });
            successCount += 1;
        } catch (error) {
            failedCount += 1;
            console.error(`[ems-track-auto-sync] tenant=${tenant?.code || 'default'} order ${order.order_no || order.id} failed`, error);
        }
    }

    if (candidates.length || failedCount) {
        console.log(
            `[ems-track-auto-sync] sweep completed: tenant=${tenant?.code || 'default'}, reason=${reason}, interval_hours=${resolveTrackAutoSyncIntervalHours(settings)}, candidates=${candidates.length}, success=${successCount}, failed=${failedCount}`,
        );
    }

    return {
        reason,
        tenantCode: tenant?.code || '',
        candidates: candidates.length,
        successCount,
        failedCount,
        intervalHours: resolveTrackAutoSyncIntervalHours(settings),
    };
}

async function runEmsTrackAutoSyncSweep({ reason = 'interval' } = {}) {
    if (emsTrackAutoSyncRunning) {
        return {
            reason,
            skipped: true,
            message: '上一轮 EMS 轨迹自动同步仍在执行',
        };
    }

    emsTrackAutoSyncRunning = true;
    try {
        const tenants = await readTenants();
        const results = [];

        for (const tenant of tenants) {
            const result = await runWithTenantContext(
                {
                    tenantId: tenant.id,
                    tenantCode: tenant.code,
                    tenant,
                },
                () => runEmsTrackAutoSyncSweepForCurrentTenant({ reason, tenant }),
            );
            results.push(result);
        }

        return {
            reason,
            tenants: results.length,
            candidates: results.reduce((sum, item) => sum + Number(item?.candidates || 0), 0),
            successCount: results.reduce((sum, item) => sum + Number(item?.successCount || 0), 0),
            failedCount: results.reduce((sum, item) => sum + Number(item?.failedCount || 0), 0),
            results,
        };
    } finally {
        emsTrackAutoSyncRunning = false;
    }
}

function startEmsTrackAutoSyncScheduler({ checkIntervalMs = EMS_TRACK_AUTO_SYNC_CHECK_INTERVAL_MS } = {}) {
    if (emsTrackAutoSyncTimer) {
        return false;
    }

    const scheduleHandle = setInterval(() => {
        void runEmsTrackAutoSyncSweep({ reason: 'interval' });
    }, Math.max(60 * 1000, Number(checkIntervalMs) || EMS_TRACK_AUTO_SYNC_CHECK_INTERVAL_MS));

    if (typeof scheduleHandle.unref === 'function') {
        scheduleHandle.unref();
    }

    const startupHandle = setTimeout(() => {
        void runEmsTrackAutoSyncSweep({ reason: 'startup' });
    }, 15 * 1000);

    if (typeof startupHandle.unref === 'function') {
        startupHandle.unref();
    }

    emsTrackAutoSyncTimer = scheduleHandle;
    console.log('[ems-track-auto-sync] scheduler started');
    return true;
}

function filterOrders(orders, users, settings = {}, { q = '', status = '', flowType = '', dateFrom = '', dateTo = '' } = {}) {
    let nextOrders = orders
        .map((order) => enrichOrder(order, users, settings))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (status && status !== 'all') {
        nextOrders = nextOrders.filter((order) => order.status === status);
    }

    if (flowType && flowType !== 'all') {
        nextOrders = nextOrders.filter((order) => order.flow_type === flowType);
    }

    if (dateFrom) {
        const startAt = new Date(`${dateFrom}T00:00:00`);
        if (!Number.isNaN(startAt.getTime())) {
            nextOrders = nextOrders.filter((order) => new Date(order.created_at) >= startAt);
        }
    }

    if (dateTo) {
        const endAt = new Date(`${dateTo}T23:59:59.999`);
        if (!Number.isNaN(endAt.getTime())) {
            nextOrders = nextOrders.filter((order) => new Date(order.created_at) <= endAt);
        }
    }

    const keyword = String(q || '')
        .trim()
        .toLowerCase();
    if (!keyword) {
        return nextOrders;
    }

    return nextOrders.filter((order) =>
        [
            order.order_no,
            order.user_phone,
            order.customer_name,
            order.customer_phone,
            order.plan_snapshot?.name,
            order.device_snapshot?.name,
            order.device_submission?.brand,
            order.device_submission?.model,
            order.device_submission?.outbound_company,
            order.device_submission?.outbound_tracking,
            order.merchant_tracking_number,
            order.admin_note,
            order.dropship?.target_tenant_name,
            order.dropship?.target_order_no,
            ...(order.internal_tags || []),
        ]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(keyword)),
    );
}

function buildDropshipTargetOrder(sourceOrder, targetTenant, actor = {}) {
    const now = new Date().toISOString();
    const sourceTenantName = safeText(actor.tenantName, '当前后台');
    const extraNotes = [
        safeText(sourceOrder.admin_note),
        `代发来源：${sourceTenantName} / ${sourceOrder.order_no}`,
        safeText(sourceOrder.remark) ? `客户备注：${safeText(sourceOrder.remark)}` : '',
    ]
        .filter(Boolean)
        .join('\n');

    return {
        tenant_id: targetTenant.id,
        id: Date.now() + Math.floor(Math.random() * 1000),
        order_no: makeOrderNo(),
        user_id: 0,
        flow_type: sourceOrder.flow_type,
        status: 'ready_to_ship',
        plan_id: 0,
        device_id: null,
        quantity: Math.max(1, Number(sourceOrder.quantity || 1)),
        plan_snapshot: { ...(sourceOrder.plan_snapshot || {}) },
        device_snapshot: sourceOrder.device_snapshot ? { ...sourceOrder.device_snapshot } : null,
        pricing: { ...(sourceOrder.pricing || {}) },
        payment_method: sourceOrder.payment_method || 'wechat',
        payment_proof: safeText(sourceOrder.payment_proof),
        customer_name: safeText(sourceOrder.customer_name),
        customer_phone: safeText(sourceOrder.customer_phone),
        shipping_address: safeText(sourceOrder.shipping_address),
        remark: safeText(sourceOrder.remark),
        device_submission: {
            ...(sourceOrder.device_submission || {}),
        },
        admin_note: extraNotes,
        internal_tags: Array.from(new Set(['代发订单', ...(Array.isArray(sourceOrder.internal_tags) ? sourceOrder.internal_tags : [])])),
        logistics_company: '',
        merchant_tracking_number: '',
        ems: {
            address_parse_source: safeText(sourceOrder.shipping_address),
            receiver: {
                name: safeText(sourceOrder.customer_name),
                mobile: safeText(sourceOrder.customer_phone),
            },
        },
        dropship: {
            status: 'received',
            source_order_no: safeText(sourceOrder.order_no),
            source_tenant_id: toInteger(actor.tenantId, 0),
            source_tenant_code: safeText(actor.tenantCode),
            source_tenant_name: sourceTenantName,
            copied_at: now,
            copied_by_role: safeText(actor.userRole),
        },
        processing_logs: [
            {
                time: now,
                operator_id: toInteger(actor.userId, 0),
                operator_role: safeText(actor.userRole, 'system'),
                action: '接收代发订单',
                content: `来源后台：${sourceTenantName}；来源订单：${sourceOrder.order_no}`,
            },
        ],
        created_at: now,
        reviewed_at: now,
        shipped_at: null,
        completed_at: null,
        cancelled_at: null,
    };
}

function applyPlanPayload(existing = {}, body = {}, imagePath) {
    return normalizePlan({
        ...existing,
        id: existing.id || Date.now(),
        slug: makeSlug(body.slug || body.name || existing.name || existing.slug || `plan-${Date.now()}`),
        name: body.name ?? existing.name,
        carrier: body.carrier ?? existing.carrier,
        network_type: body.network_type ?? existing.network_type,
        monthly_data: body.monthly_data ?? existing.monthly_data,
        monthly_price: body.monthly_price ?? existing.monthly_price,
        setup_price: body.setup_price ?? existing.setup_price,
        badge: body.badge ?? existing.badge,
        best_for: body.best_for ?? existing.best_for,
        coverage: body.coverage ?? existing.coverage,
        purchase_note: body.purchase_note ?? existing.purchase_note,
        description: body.description ?? existing.description,
        features: body.features ?? existing.features,
        tags: body.tags ?? existing.tags,
        cover_image: imagePath || existing.cover_image || null,
        featured: body.featured ?? existing.featured,
        status: body.status ?? existing.status,
        hot_rank: body.hot_rank ?? existing.hot_rank,
        sort_order: body.sort_order ?? existing.sort_order,
    });
}

function applyDevicePayload(existing = {}, body = {}, imagePath) {
    return normalizeDevice({
        ...existing,
        id: existing.id || Date.now(),
        slug: makeSlug(body.slug || body.name || existing.name || existing.slug || `device-${Date.now()}`),
        name: body.name ?? existing.name,
        model: body.model ?? existing.model,
        category: body.category ?? existing.category,
        network_type: body.network_type ?? existing.network_type,
        price: body.price ?? existing.price,
        original_price: body.original_price ?? existing.original_price,
        stock: body.stock ?? existing.stock,
        badge: body.badge ?? existing.badge,
        short_description: body.short_description ?? existing.short_description,
        description: body.description ?? existing.description,
        features: body.features ?? existing.features,
        tags: body.tags ?? existing.tags,
        compatible_plan_ids: body.compatible_plan_ids ?? existing.compatible_plan_ids,
        cover_image: imagePath || existing.cover_image || null,
        featured: body.featured ?? existing.featured,
        status: body.status ?? existing.status,
        hot_rank: body.hot_rank ?? existing.hot_rank,
        sort_order: body.sort_order ?? existing.sort_order,
    });
}

function validatePlan(plan) {
    if (!plan.name) return '请填写套餐名称';
    if (!plan.monthly_data) return '请填写套餐流量说明，或填写“以图片为准”';
    if (plan.monthly_price < 0) return '月费参考价不能小于 0';
    if (plan.setup_price < 0) return '配卡服务费不能小于 0。';
    return null;
}

function validateDevice(device) {
    if (!device.name) return '请填写设备名称';
    if (!DEVICE_CATEGORIES.includes(device.category)) return '设备分类无效';
    if (device.price <= 0) return '设备售价必须大于 0';
    return null;
}

router.get(
    '/dashboard',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'dashboard.view')) return;

        const [plans, devices, orders, users, settings, auditLogs] = await Promise.all([
            readPlans(),
            readDevices(),
            readOrders(),
            readUsers(),
            readSettings(),
            readAuditLogs(),
        ]);

        const activePlans = plans.filter((item) => item.status === 'active');
        const activeDevices = devices.filter((item) => item.status === 'active');
        const customerUsers = users.filter((item) => item.role === 'user');
        const staffMembers = users.filter((item) => isBackofficeRole(item.role));
        const adminUser = users.find((item) => isPrimaryAdminRole(item.role));
        const usageCounts = buildCurrentTenantUsageCounts({ users, orders, plans, devices });
        const limitSummary = buildTenantLimitSummary(req.tenant, usageCounts);
        const expiryInfo = resolveTenantExpiryInfo(req.tenant?.expires_at);
        const paidOrders = orders.filter((order) => order.status !== 'cancelled');
        const totalRevenue = paidOrders.reduce((sum, order) => sum + orderAmount(order), 0);
        const staleHours = Math.max(1, Number(settings?.logistics?.track_stale_hours || 24));
        const paymentReviewAlertHours = Math.max(1, Number(settings?.logistics?.payment_review_alert_hours || 12));
        const readyToShipAlertHours = Math.max(1, Number(settings?.logistics?.ready_to_ship_alert_hours || 24));
        const autoTrackSyncFailAlertThreshold = Math.max(1, Number(settings?.logistics?.auto_track_sync_fail_alert_threshold || 2));
        const printFailureAlertThreshold = Math.max(1, Number(settings?.logistics?.print_failure_alert_threshold || 2));
        const emsManagedOrders = orders.filter((order) => isEmsManagedOrder(order));
        const emsErrorOrders = emsManagedOrders.filter((order) => safeText(order.ems?.last_error));
        const emsPendingLabelOrders = emsManagedOrders.filter((order) => safeText(order.ems?.waybill_no) && !safeText(order.ems?.label_file));
        const emsPendingPrintOrders = emsManagedOrders.filter((order) => safeText(order.ems?.label_file) && !order.ems?.printed_at);
        const emsStaleTrackOrders = emsManagedOrders.filter((order) => {
            if (!safeText(order.ems?.waybill_no)) return false;
            const syncedAt = order.ems?.last_track_sync_at ? new Date(order.ems.last_track_sync_at).getTime() : 0;
            return !syncedAt || Date.now() - syncedAt > staleHours * 60 * 60 * 1000;
        });
        const emsConsecutiveCreateFailureOrders = buildConsecutiveFailureOrders(emsManagedOrders, ['create']);
        const emsConsecutivePrintFailureOrders = buildConsecutiveFailureOrders(
            emsManagedOrders,
            ['print', 'print-preflight'],
            printFailureAlertThreshold,
        );
        const emsConsecutiveTrackFailureOrders = buildConsecutiveFailureOrders(emsManagedOrders, ['track-sync']);
        const emsAutoTrackSyncFailureOrders = buildAutoTrackSyncFailureOrders(emsManagedOrders, autoTrackSyncFailAlertThreshold);
        const emsConsecutiveCreateFailures = emsConsecutiveCreateFailureOrders.slice(0, 5);
        const emsConsecutivePrintFailures = emsConsecutivePrintFailureOrders.slice(0, 5);
        const emsConsecutiveTrackFailures = emsConsecutiveTrackFailureOrders.slice(0, 5);
        const emsAutoTrackSyncFailures = emsAutoTrackSyncFailureOrders.slice(0, 5);
        const statusCounts = buildOrderStatusCounts(orders);
        const configHealth = buildTenantConfigHealth({ settings, tenant: req.tenant, adminUser });
        const recentDailySeries = buildRecentDailySeries(orders, { days: 7 });
        const todayStart = startOfLocalDay(new Date());
        const sevenDayStart = addDays(todayStart, -6);
        const thirtyDayStart = addDays(todayStart, -29);
        const recentOrdersToday = orders.filter((order) => new Date(order.created_at || 0) >= todayStart);
        const recentOrders7d = orders.filter((order) => new Date(order.created_at || 0) >= sevenDayStart);
        const recentOrders30d = orders.filter((order) => new Date(order.created_at || 0) >= thirtyDayStart);
        const lowStockDevices = activeDevices
            .filter((device) => device.stock <= 5)
            .sort((a, b) => a.stock - b.stock || a.sort_order - b.sort_order || b.id - a.id);
        const stalePaymentOrders = buildAgingOrders(orders, (order) => order.status === 'pending_payment_review', paymentReviewAlertHours);
        const overdueReadyToShipOrders = buildAgingOrders(
            orders,
            (order) => order.status === 'ready_to_ship',
            readyToShipAlertHours,
            (order) => order.reviewed_at || order.created_at,
        );
        const emsProblemOrders = emsManagedOrders
            .map((order) => ({
                order,
                issue: summarizeEmsIssue(order, staleHours),
            }))
            .filter((item) => item.issue)
            .slice(0, 6)
            .map(({ order, issue }) => ({
                id: order.id,
                order_no: order.order_no,
                customer_name: order.customer_name,
                customer_phone: order.customer_phone,
                waybill_no: buildTrackingNumber(order),
                last_action: safeText(order.ems?.last_action),
                last_action_at: order.ems?.last_action_at || null,
                issue,
            }));
        const alerts = buildDashboardAlertItems({
            tenant: req.tenant,
            expiryInfo,
            configHealth,
            stalePaymentOrders,
            overdueReadyToShipOrders,
            emsAutoTrackSyncFailureOrders,
            emsConsecutivePrintFailureOrders,
            emsStaleTrackOrders,
            lowStockDevices,
        });
        const emsWorkflowOverview = buildEmsWorkflowOverview(emsManagedOrders);
        const tenantAuditLogs = filterAuditLogsForViewer(auditLogs, req, {
            scope: 'current',
        });
        const recentAuditLogs = tenantAuditLogs.slice(0, 8).map(sanitizeAuditLogEntry);
        const auditSummary = buildAuditLogSummary(tenantAuditLogs);

        res.json({
            tenant: {
                id: req.tenant?.id || 1,
                code: req.tenant?.code || DEFAULT_TENANT_CODE,
                name: safeText(req.tenant?.name),
                status: safeText(req.tenant?.status, 'active'),
                expires_at: req.tenant?.expires_at || null,
                is_expired: expiryInfo.is_expired,
                expiring_in_days: expiryInfo.days_remaining,
                unavailable_message: req.tenantUnavailableMessage || tenantUnavailableMessage(req.tenant),
                subscription_name: safeText(req.tenant?.subscription_name, limitSummary.subscription_name),
                features: Array.isArray(req.tenant?.features) ? req.tenant.features : limitSummary.features,
                primary_domain: safeText(req.tenant?.primary_domain),
                domain_bindings: normalizeDomainList(req.tenant?.domain_bindings),
                primary_admin_domain: safeText(req.tenant?.primary_admin_domain),
                admin_domain_bindings: normalizeDomainList(req.tenant?.admin_domain_bindings),
                admin_username: safeText(adminUser?.username),
                storefront_url: buildTenantStorefrontUrl(req.tenant),
                admin_url: buildTenantAdminUrl(req.tenant),
                sender_name: safeText(settings?.logistics?.sender_name),
                sender_phone: safeText(settings?.logistics?.sender_phone),
                sender_address: [settings?.logistics?.sender_prov, settings?.logistics?.sender_city, settings?.logistics?.sender_county, settings?.logistics?.sender_address]
                    .map((item) => safeText(item))
                    .filter(Boolean)
                    .join(''),
                max_user_count: toInteger(req.tenant?.max_user_count, 0),
                max_order_count: toInteger(req.tenant?.max_order_count, 0),
                max_plan_count: toInteger(req.tenant?.max_plan_count, 0),
                max_device_count: toInteger(req.tenant?.max_device_count, 0),
                limit_summary: limitSummary.limits,
                limits_reached_count: limitSummary.reached_count,
                near_limit_keys: limitSummary.near_limit_keys,
                config_health: configHealth,
            },
            plan_count: activePlans.length,
            device_count: activeDevices.length,
            order_count: orders.length,
            user_count: customerUsers.length,
            staff_count: staffMembers.length,
            total_revenue: Number(totalRevenue.toFixed(2)),
            revenue_today: Number(recentOrdersToday.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + orderAmount(order), 0).toFixed(2)),
            revenue_7d: Number(recentOrders7d.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + orderAmount(order), 0).toFixed(2)),
            revenue_30d: Number(recentOrders30d.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + orderAmount(order), 0).toFixed(2)),
            avg_order_amount: Number((paidOrders.length ? totalRevenue / paidOrders.length : 0).toFixed(2)),
            order_count_today: recentOrdersToday.length,
            order_count_7d: recentOrders7d.length,
            order_count_30d: recentOrders30d.length,
            pending_count: orders.filter((order) => order.status === 'pending_payment_review').length,
            ship_device_count: orders.filter((order) => order.flow_type === 'ship_device').length,
            buy_device_count: orders.filter((order) => order.flow_type === 'buy_device').length,
            status_counts: statusCounts,
            configuring_count: statusCounts.configuring || 0,
            ready_to_ship_count: statusCounts.ready_to_ship || 0,
            shipped_count: statusCounts.shipped || 0,
            completed_count: statusCounts.completed || 0,
            cancelled_count: statusCounts.cancelled || 0,
            ems_error_count: emsErrorOrders.length,
            ems_pending_label_count: emsPendingLabelOrders.length,
            ems_pending_print_count: emsPendingPrintOrders.length,
            ems_stale_track_count: emsStaleTrackOrders.length,
            ems_consecutive_create_fail_count: emsConsecutiveCreateFailureOrders.length,
            ems_consecutive_print_fail_count: emsConsecutivePrintFailureOrders.length,
            ems_consecutive_track_fail_count: emsConsecutiveTrackFailureOrders.length,
            ems_consecutive_create_fail_orders: emsConsecutiveCreateFailures,
            ems_consecutive_print_fail_orders: emsConsecutivePrintFailures,
            ems_consecutive_track_fail_orders: emsConsecutiveTrackFailures,
            ems_auto_track_sync_fail_count: emsAutoTrackSyncFailureOrders.length,
            ems_auto_track_sync_fail_orders: emsAutoTrackSyncFailures,
            ems_problem_orders: emsProblemOrders,
            ems_workflow_overview: emsWorkflowOverview,
            low_stock_devices: lowStockDevices,
            daily_order_series: recentDailySeries.map((item) => ({
                date: item.date,
                label: item.label,
                value: item.order_count,
            })),
            daily_revenue_series: recentDailySeries.map((item) => ({
                date: item.date,
                label: item.label,
                value: item.revenue,
            })),
            top_plan_orders: buildTopNamedItems(orders, (order) => order.plan_snapshot?.name || order.plan_name, 5),
            top_device_orders: buildTopNamedItems(
                orders,
                (order) =>
                    order.flow_type === 'ship_device'
                        ? [order.device_submission?.brand, order.device_submission?.model].filter(Boolean).join(' ') || '用户寄送设备'
                        : order.device_snapshot?.name || order.device_name,
                5,
            ),
            stale_payment_review_count: stalePaymentOrders.length,
            stale_payment_review_orders: stalePaymentOrders.slice(0, 6).map((order) => ({
                id: order.id,
                order_no: order.order_no,
                customer_name: order.customer_name,
                aging_hours: order.aging_hours,
            })),
            ready_to_ship_overdue_count: overdueReadyToShipOrders.length,
            ready_to_ship_overdue_orders: overdueReadyToShipOrders.slice(0, 6).map((order) => ({
                id: order.id,
                order_no: order.order_no,
                customer_name: order.customer_name,
                aging_hours: order.aging_hours,
                tracking_number: buildTrackingNumber(order),
            })),
            alerts,
            audit_count_today: auditSummary.today_count,
            audit_error_count_today: auditSummary.today_error_count,
            recent_audit_logs: recentAuditLogs,
        });
    }),
);

router.get(
    '/domain-diagnostics',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'dashboard.view')) return;

        res.json(await buildTenantDomainDiagnostics(req.tenant || {}, req));
    }),
);

router.get(
    '/audit-logs',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'dashboard.view')) return;

        const scope = safeText(req.query.scope, 'current');
        const exportFormat = safeText(req.query.export).toLowerCase();
        const logs = filterAuditLogsForViewer(await readAuditLogs(), req, {
            scope,
            q: req.query.q,
            category: req.query.category,
            status: req.query.status,
            dateFrom: req.query.date_from,
            dateTo: req.query.date_to,
        });
        const sanitizedLogs = logs.map(sanitizeAuditLogEntry);

        if (exportFormat === 'csv') {
            const stamp = formatDateOnly(new Date()).replace(/-/g, '');
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${stamp}.csv"`);
            return res.send(buildAuditLogsCsv(sanitizedLogs.slice(0, 5000)));
        }

        const pagination = paginateItems(sanitizedLogs, {
            page: req.query.page,
            pageSize: req.query.page_size,
        });

        res.json({
            summary: buildAuditLogSummary(logs),
            scope,
            logs: pagination.items,
            pagination: {
                page: pagination.page,
                page_size: pagination.pageSize,
                total_count: pagination.totalCount,
                total_pages: pagination.totalPages,
                has_prev: pagination.hasPrev,
                has_next: pagination.hasNext,
                from_index: pagination.fromIndex,
                to_index: pagination.toIndex,
            },
            category_options: Object.entries(AUDIT_CATEGORY_LABELS).map(([code, label]) => ({
                code,
                label,
            })),
            scope_options: isPlatformAdminRole(req.userRole)
                ? [
                      { code: 'current', label: '当前租户' },
                      { code: 'all', label: '全部租户' },
                  ]
                : [{ code: 'current', label: '当前租户' }],
        });
    }),
);

router.get(
    '/platform/tenants/:id/domain-diagnostics',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensurePlatformAdmin(req, res) || !ensurePermission(req, res, 'platform.manage')) return;

        const tenantId = toInteger(req.params.id, 0);
        const tenants = await readTenants();
        const tenant = tenants.find((item) => item.id === tenantId);

        if (!tenant) {
            return res.status(404).json({ error: '租户不存在。' });
        }

        res.json(await buildTenantDomainDiagnostics(tenant, req));
    }),
);

router.get(
    '/platform/tenants',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensurePlatformAdmin(req, res) || !ensurePermission(req, res, 'platform.manage')) return;

        const tenants = await readTenants();
        const summaries = await Promise.all(tenants.map((tenant) => buildTenantSummary(tenant)));
        const now = Date.now();
        const expiringSoonCount = summaries.filter((tenant) => {
            if (tenant.is_expired || !tenant.expires_at) return false;
            const expiresAt = new Date(`${String(tenant.expires_at).slice(0, 10)}T23:59:59.999`).getTime();
            return Number.isFinite(expiresAt) && expiresAt - now <= 7 * 24 * 60 * 60 * 1000;
        }).length;

        summaries.sort((left, right) => {
            if (left.id === 1) return -1;
            if (right.id === 1) return 1;
            return String(left.code).localeCompare(String(right.code), 'zh-CN');
        });

        res.json({
            stats: {
                total_count: summaries.length,
                active_count: summaries.filter((tenant) => tenant.status === 'active' && !tenant.is_expired).length,
                expiring_soon_count: expiringSoonCount,
                expired_count: summaries.filter((tenant) => tenant.is_expired).length,
                suspended_count: summaries.filter((tenant) => tenant.status === 'suspended').length,
                config_warning_count: summaries.filter((tenant) => Number(tenant.config_warning_count || 0) > 0).length,
                healthy_count: summaries.filter((tenant) => Number(tenant.config_warning_count || 0) === 0).length,
            },
            tenants: summaries,
        });
    }),
);

router.post(
    '/platform/tenants',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensurePlatformAdmin(req, res) || !ensurePermission(req, res, 'platform.manage')) return;

        const tenants = await readTenants();
        const tenantPayload = normalizeTenantFormPayload(req.body);
        const adminForm = normalizeTenantAdminFormPayload(req.body);

        if (!tenantPayload.code) {
            return res.status(400).json({ error: '请填写租户编码。' });
        }
        if (!tenantPayload.name) {
            return res.status(400).json({ error: '请填写租户名称。' });
        }
        if (!adminForm.username) {
            return res.status(400).json({ error: '请填写租户管理员账号。' });
        }
        if (!adminForm.password) {
            return res.status(400).json({ error: '新建租户时请填写管理员密码。' });
        }
        if (tenants.some((tenant) => tenant.code === tenantPayload.code)) {
            return res.status(400).json({ error: '该租户编码已存在。' });
        }
        const createDomainConflicts = findTenantDomainConflicts(tenants, tenantPayload);
        if (createDomainConflicts.length) {
            return res.status(400).json({ error: `域名 ${createDomainConflicts[0].domain} 已绑定到租户 ${createDomainConflicts[0].tenant_code}` });
        }

        const savedTenant = await saveTenant(tenantPayload);
        await saveTenantAdminUser(savedTenant, adminForm);
        const summary = await buildTenantSummary(savedTenant);
        await safeRecordAdminAuditLog({
            req,
            category: 'platform',
            action: '新建租户',
            summary: `已新建租户 ${savedTenant.name} (${savedTenant.code})`,
            detail: `授权套餐：${savedTenant.subscription_name || '标准版'}；状态：${savedTenant.status}`,
            targetType: 'tenant',
            targetId: savedTenant.id,
            targetKey: savedTenant.code,
            targetLabel: savedTenant.name,
            targetTenantId: savedTenant.id,
            targetTenantCode: savedTenant.code,
            targetTenantName: savedTenant.name,
            metadata: {
                status: savedTenant.status,
                subscription_name: savedTenant.subscription_name,
            },
        });

        res.json({
            success: true,
            tenant: summary,
        });
    }),
);

router.put(
    '/platform/tenants/:id',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensurePlatformAdmin(req, res) || !ensurePermission(req, res, 'platform.manage')) return;

        const tenantId = toInteger(req.params.id, 0);
        const tenants = await readTenants();
        const existingTenant = tenants.find((tenant) => tenant.id === tenantId);

        if (!existingTenant) {
            return res.status(404).json({ error: '租户不存在。' });
        }

        const tenantPayload = normalizeTenantFormPayload(req.body, existingTenant);
        const adminForm = normalizeTenantAdminFormPayload(req.body);

        if (!tenantPayload.name) {
            return res.status(400).json({ error: '请填写租户名称。' });
        }
        if (existingTenant.id === 1) {
            tenantPayload.code = DEFAULT_TENANT_CODE;
            if (tenantPayload.status !== 'active') {
                return res.status(400).json({ error: '默认平台租户不可停用。' });
            }
        }
        if (tenants.some((tenant) => tenant.id !== existingTenant.id && tenant.code === tenantPayload.code)) {
            return res.status(400).json({ error: '该租户编码已存在。' });
        }
        const updateDomainConflicts = findTenantDomainConflicts(tenants, tenantPayload, existingTenant.id);
        if (updateDomainConflicts.length) {
            return res.status(400).json({ error: `域名 ${updateDomainConflicts[0].domain} 已绑定到租户 ${updateDomainConflicts[0].tenant_code}` });
        }

        const savedTenant = await saveTenant({
            ...existingTenant,
            ...tenantPayload,
            id: existingTenant.id,
        });
        await saveTenantAdminUser(savedTenant, adminForm);
        const summary = await buildTenantSummary(savedTenant);
        await safeRecordAdminAuditLog({
            req,
            category: 'platform',
            action: '更新租户',
            summary: `已更新租户 ${savedTenant.name} (${savedTenant.code})`,
            detail: `状态：${savedTenant.status}；到期时间：${savedTenant.expires_at || '未设置'}`,
            targetType: 'tenant',
            targetId: savedTenant.id,
            targetKey: savedTenant.code,
            targetLabel: savedTenant.name,
            targetTenantId: savedTenant.id,
            targetTenantCode: savedTenant.code,
            targetTenantName: savedTenant.name,
            metadata: {
                status: savedTenant.status,
                expires_at: savedTenant.expires_at,
            },
        });

        res.json({
            success: true,
            tenant: summary,
        });
    }),
);

router.get(
    '/plans',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'catalog.manage')) return;
        const plans = await readPlans();
        res.json(plans.sort((a, b) => a.sort_order - b.sort_order || b.id - a.id));
    }),
);

router.post(
    '/plans',
    auth,
    uploadEntityImage,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'catalog.manage')) {
            removeTempFile(req.file);
            return;
        }
        const plans = await readPlans();
        if (!ensureTenantCapacity(res, req.tenant, buildCurrentTenantUsageCounts({ plans }), 'plans')) {
            removeTempFile(req.file);
            return;
        }

        const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
        const plan = applyPlanPayload({}, req.body, imagePath);
        const error = validatePlan(plan);

        if (error) {
            removeTempFile(req.file);
            return res.status(400).json({ error });
        }

        await savePlan(plan);
        await safeRecordAdminAuditLog({
            req,
            category: 'catalog',
            action: '创建套餐',
            summary: `已创建套餐 ${plan.name}`,
            detail: `运营商：${plan.carrier || '未设置'}；状态：${plan.status}`,
            targetType: 'plan',
            targetId: plan.id,
            targetKey: plan.slug,
            targetLabel: plan.name,
        });

        res.json({ success: true, id: plan.id });
    }),
);

router.put(
    '/plans/:id',
    auth,
    uploadEntityImage,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'catalog.manage')) {
            removeTempFile(req.file);
            return;
        }

        const planId = toInteger(req.params.id, 0);
        const plans = await readPlans();
        const index = plans.findIndex((item) => item.id === planId);

        if (index === -1) {
            removeTempFile(req.file);
            return res.status(404).json({ error: '套餐不存在。' });
        }

        const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
        const nextPlan = applyPlanPayload(plans[index], req.body, imagePath);
        const error = validatePlan(nextPlan);

        if (error) {
            removeTempFile(req.file);
            return res.status(400).json({ error });
        }

        if (imagePath && plans[index].cover_image) {
            removePublicFile(plans[index].cover_image);
        }

        await savePlan(nextPlan);
        await safeRecordAdminAuditLog({
            req,
            category: 'catalog',
            action: '更新套餐',
            summary: `已更新套餐 ${nextPlan.name}`,
            detail: `运营商：${nextPlan.carrier || '未设置'}；状态：${nextPlan.status}`,
            targetType: 'plan',
            targetId: nextPlan.id,
            targetKey: nextPlan.slug,
            targetLabel: nextPlan.name,
        });

        res.json({ success: true });
    }),
);

router.delete(
    '/plans/:id',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'catalog.manage')) return;

        const planId = toInteger(req.params.id, 0);
        const [orders, plans] = await Promise.all([readOrders(), readPlans()]);
        const activeOrderUsingPlan = orders.find((order) => order.plan_id === planId && order.status !== 'cancelled');

        if (activeOrderUsingPlan) {
            return res.status(400).json({ error: '当前还有订单正在使用这个套餐，暂时不能删除。' });
        }

        const index = plans.findIndex((item) => item.id === planId);
        if (index === -1) {
            return res.status(404).json({ error: '套餐不存在。' });
        }

        if (plans[index].cover_image) {
            removePublicFile(plans[index].cover_image);
        }

        await deletePlan(planId);
        await safeRecordAdminAuditLog({
            req,
            category: 'catalog',
            action: '删除套餐',
            summary: `已删除套餐 ${plans[index].name}`,
            detail: `套餐编号：${plans[index].id}`,
            targetType: 'plan',
            targetId: plans[index].id,
            targetKey: plans[index].slug,
            targetLabel: plans[index].name,
        });

        res.json({ success: true });
    }),
);

router.get(
    '/devices',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'catalog.manage')) return;
        const devices = await readDevices();
        res.json(devices.sort((a, b) => a.sort_order - b.sort_order || b.id - a.id));
    }),
);

router.post(
    '/devices',
    auth,
    uploadEntityImage,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'catalog.manage')) {
            removeTempFile(req.file);
            return;
        }
        const devices = await readDevices();
        if (!ensureTenantCapacity(res, req.tenant, buildCurrentTenantUsageCounts({ devices }), 'devices')) {
            removeTempFile(req.file);
            return;
        }

        const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
        const device = applyDevicePayload({}, req.body, imagePath);
        const error = validateDevice(device);

        if (error) {
            removeTempFile(req.file);
            return res.status(400).json({ error });
        }

        await saveDevice(device);
        await safeRecordAdminAuditLog({
            req,
            category: 'catalog',
            action: '创建设备',
            summary: `已创建设备 ${device.name}`,
            detail: `型号：${device.model || '未设置'}；库存：${device.stock}`,
            targetType: 'device',
            targetId: device.id,
            targetKey: device.slug,
            targetLabel: device.name,
        });

        res.json({ success: true, id: device.id });
    }),
);

router.put(
    '/devices/:id',
    auth,
    uploadEntityImage,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'catalog.manage')) {
            removeTempFile(req.file);
            return;
        }

        const deviceId = toInteger(req.params.id, 0);
        const devices = await readDevices();
        const index = devices.findIndex((item) => item.id === deviceId);

        if (index === -1) {
            removeTempFile(req.file);
            return res.status(404).json({ error: '设备不存在。' });
        }

        const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
        const nextDevice = applyDevicePayload(devices[index], req.body, imagePath);
        const error = validateDevice(nextDevice);

        if (error) {
            removeTempFile(req.file);
            return res.status(400).json({ error });
        }

        if (imagePath && devices[index].cover_image) {
            removePublicFile(devices[index].cover_image);
        }

        await saveDevice(nextDevice);
        await safeRecordAdminAuditLog({
            req,
            category: 'catalog',
            action: '更新设备',
            summary: `已更新设备 ${nextDevice.name}`,
            detail: `型号：${nextDevice.model || '未设置'}；库存：${nextDevice.stock}`,
            targetType: 'device',
            targetId: nextDevice.id,
            targetKey: nextDevice.slug,
            targetLabel: nextDevice.name,
        });

        res.json({ success: true });
    }),
);

router.delete(
    '/devices/:id',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'catalog.manage')) return;

        const deviceId = toInteger(req.params.id, 0);
        const [orders, devices] = await Promise.all([readOrders(), readDevices()]);
        const activeOrderUsingDevice = orders.find((order) => order.device_id === deviceId && order.status !== 'cancelled');

        if (activeOrderUsingDevice) {
            return res.status(400).json({ error: '当前还有订单正在使用这台设备，暂时不能删除。' });
        }

        const index = devices.findIndex((item) => item.id === deviceId);
        if (index === -1) {
            return res.status(404).json({ error: '设备不存在。' });
        }

        if (devices[index].cover_image) {
            removePublicFile(devices[index].cover_image);
        }

        await deleteDevice(deviceId);
        await safeRecordAdminAuditLog({
            req,
            category: 'catalog',
            action: '删除设备',
            summary: `已删除设备 ${devices[index].name}`,
            detail: `设备编号：${devices[index].id}`,
            targetType: 'device',
            targetId: devices[index].id,
            targetKey: devices[index].slug,
            targetLabel: devices[index].name,
        });

        res.json({ success: true });
    }),
);

router.get(
    '/orders',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'orders.manage')) return;

        const [orders, users, settings] = await Promise.all([readOrders(), readUsers(), readSettings()]);
        const filteredOrders = filterOrders(orders, users, settings, {
            q: req.query.q,
            status: req.query.status,
            flowType: req.query.flow_type,
            dateFrom: req.query.date_from,
            dateTo: req.query.date_to,
        });

        res.json(filteredOrders);
    }),
);

router.get(
    '/orders/export',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'orders.manage')) return;

        const [orders, users, settings] = await Promise.all([readOrders(), readUsers(), readSettings()]);
        const filteredOrders = filterOrders(orders, users, settings, {
            q: req.query.q,
            status: req.query.status,
            flowType: req.query.flow_type,
            dateFrom: req.query.date_from,
            dateTo: req.query.date_to,
        });

        const rows = [
            [
                '订单',
                '订单状',
                '下单方式',
                '瀹㈡埛濮撳悕',
                '客户手机',
                '套餐名称',
                '设备名称',
                '数量',
                '付款方式',
                '订单金额',
                '收货/回寄地址',
                '客户寄出快递公司',
                '客户寄出单号',
                '商家回寄单号',
                '内部标签',
                '创建时间',
                '后台备注',
            ],
            ...filteredOrders.map((order) => [
                order.order_no,
                order.status,
                order.flow_type,
                order.customer_name,
                order.customer_phone,
                order.plan_snapshot?.name || '',
                order.device_snapshot?.name || [order.device_submission?.brand, order.device_submission?.model].filter(Boolean).join(' '),
                order.quantity,
                order.payment_method,
                order.total_amount,
                order.shipping_address,
                order.device_submission?.outbound_company || '',
                order.device_submission?.outbound_tracking || '',
                order.merchant_tracking_number || '',
                (order.internal_tags || []).join(' / '),
                order.created_at,
                order.admin_note || '',
            ]),
        ];

        const csv = '\uFEFF' + rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send(csv);
    }),
);

router.post(
    '/orders/batch-delete',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'orders.manage')) return;

        const orderIds = Array.from(
            new Set((Array.isArray(req.body?.order_ids) ? req.body.order_ids : []).map((item) => toInteger(item, 0)).filter((item) => item > 0)),
        );
        if (!orderIds.length) {
            return res.status(400).json({ error: '请先选择要删除的订单。' });
        }

        const [orders, devices] = await Promise.all([readOrders(), readDevices()]);
        const targetOrders = orders.filter((order) => orderIds.includes(order.id));
        if (!targetOrders.length) {
            return res.status(404).json({ error: '未找到可删除的订单。' });
        }

        const deviceMap = new Map(devices.map((device) => [device.id, device]));
        const updatedDevices = [];
        const removedFiles = [];

        targetOrders.forEach((order) => {
            const plan = planOrderDeletion(order, deviceMap);
            if (plan.updatedDevice) {
                updatedDevices.push(plan.updatedDevice);
            }
            if (plan.paymentProof) {
                removedFiles.push(plan.paymentProof);
            }
            if (plan.labelFile) {
                removedFiles.push(plan.labelFile);
            }
        });

        await commitStoreChanges({
            devices: updatedDevices,
            deleteOrderIds: targetOrders.map((order) => order.id),
        });

        removedFiles.forEach((filePath) => removePublicFile(filePath));

        await safeRecordAdminAuditLog({
            req,
            category: 'orders',
            action: '批量删除订单',
            summary: `已批量删除 ${targetOrders.length} 单订单`,
            detail: `订单号：${targetOrders
                .slice(0, 5)
                .map((order) => order.order_no)
                .join('、')}${targetOrders.length > 5 ? ' 等' : ''}`,
            targetType: 'order_batch',
            targetKey: `batch-${Date.now()}`,
            targetLabel: `${targetOrders.length} 单订单`,
            metadata: {
                order_ids: targetOrders.map((order) => order.id),
                order_nos: targetOrders.map((order) => order.order_no),
            },
        });

        res.json({
            success: true,
            deleted_count: targetOrders.length,
            deleted_order_ids: targetOrders.map((order) => order.id),
        });
    }),
);

router.put(
    '/orders/:id',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'orders.manage')) return;

        const orderId = toInteger(req.params.id, 0);
        const orders = await readOrders();
        const order = orders.find((item) => item.id === orderId);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        const previousStatus = order.status;
        const previousLogisticsCompany = String(order.logistics_company || '').trim();
        const previousTrackingNumber = String(order.merchant_tracking_number || '').trim();
        const previousAdminNote = String(order.admin_note || '').trim();
        const previousInternalTags = Array.isArray(order.internal_tags) ? [...order.internal_tags] : [];
        const previousEmsSnapshot = JSON.stringify(order.ems || {});
        const previousNoticeSnapshot = buildOrderNoticeSnapshot(order);
        const nextStatus = String(req.body.status || order.status).trim();
        let updatedDevice = null;

        if (!ORDER_STATUSES.includes(nextStatus)) {
            return res.status(400).json({ error: '订单状态无效。' });
        }

        if (previousStatus === 'cancelled' && nextStatus !== 'cancelled') {
            return res.status(400).json({ error: '已取消订单不能恢复，请重新创建新订单。' });
        }

        order.status = nextStatus;
        order.logistics_company = String(req.body.logistics_company ?? order.logistics_company ?? '').trim();
        order.merchant_tracking_number = String(req.body.merchant_tracking_number ?? order.merchant_tracking_number ?? '').trim();
        order.admin_note = String(req.body.admin_note ?? order.admin_note ?? '').trim();
        order.internal_tags = toStringArray(req.body.internal_tags ?? order.internal_tags);
        order.ems = normalizeAdminEmsPayload(req.body.ems, order.ems);
        syncManualTrackingNumberToEms(order, previousTrackingNumber);

        if (!order.reviewed_at && nextStatus !== 'pending_payment_review' && nextStatus !== 'cancelled') {
            order.reviewed_at = new Date().toISOString();
        }

        if (nextStatus === 'shipped') {
            if (!order.merchant_tracking_number) {
                return res.status(400).json({ error: '发货前请先填写商家回寄单号。' });
            }
            if (!order.shipped_at) {
                order.shipped_at = new Date().toISOString();
            }
        }

        if (nextStatus === 'completed' && !order.completed_at) {
            order.completed_at = new Date().toISOString();
        }

        if (nextStatus === 'cancelled' && previousStatus !== 'cancelled') {
            if (order.flow_type === 'buy_device' && order.device_id) {
                const devices = await readDevices();
                const device = devices.find((item) => item.id === order.device_id);
                if (device) {
                    updatedDevice = {
                        ...device,
                        stock: device.stock + order.quantity,
                    };
                }
            }
            order.cancelled_at = new Date().toISOString();
        }

        if (previousStatus !== nextStatus) {
            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '状态更',
                content: `订单状态由 ${previousStatus} 更新为 ${nextStatus}`,
            });
        }

        if (previousLogisticsCompany !== order.logistics_company || previousTrackingNumber !== order.merchant_tracking_number) {
            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '物流更新',
                content: `物流公司：${order.logistics_company || '未填'}；回寄单号：${order.merchant_tracking_number || '未填'}`,
            });
        }

        if (previousAdminNote !== order.admin_note) {
            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '后台备注更新',
                content: order.admin_note || '后台备注已清',
            });
        }

        if (!arraysEqual(previousInternalTags, order.internal_tags)) {
            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '内部标签更新',
                content: order.internal_tags.length ? `当前标签：${order.internal_tags.join(' / ')}` : '内部标签已清空',
            });
        }

        if (previousEmsSnapshot !== JSON.stringify(order.ems || {})) {
            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: 'EMS信息更新',
                content: '已更新 EMS 收件地址、面单参数或轨迹相关信息',
            });
        }

        syncOrderLogisticsUserNotices(order, {
            previousSnapshot: previousNoticeSnapshot,
        });

        await commitStoreChanges({
            devices: updatedDevice ? [updatedDevice] : [],
            orders: [order],
        });
        await safeRecordAdminAuditLog({
            req,
            category: 'orders',
            action: '更新订单',
            summary: `已更新订单 ${order.order_no}`,
            detail: `状态：${previousStatus} -> ${order.status}；单号：${order.merchant_tracking_number || '未填写'}`,
            targetType: 'order',
            targetId: order.id,
            targetKey: order.order_no,
            targetLabel: order.customer_name || order.order_no,
            metadata: {
                status: order.status,
                logistics_company: order.logistics_company,
                merchant_tracking_number: order.merchant_tracking_number,
            },
        });
        res.json({ success: true });
    }),
);

router.post(
    '/orders/:id/dropship',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'orders.manage')) return;

        const orderId = toInteger(req.params.id, 0);
        const targetTenantId = toInteger(req.body.target_tenant_id ?? req.body.targetTenantId, 0);
        if (!targetTenantId) {
            return res.status(400).json({ error: '请选择代发目标后台。' });
        }

        const [orders, tenants] = await Promise.all([readOrders(), readTenants()]);
        const order = orders.find((item) => item.id === orderId);
        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        const targetTenant = tenants.find((item) => item.id === targetTenantId);
        if (!targetTenant) {
            return res.status(404).json({ error: '代发目标后台不存在。' });
        }
        if (targetTenant.status !== 'active') {
            return res.status(400).json({ error: '代发目标后台未启用。' });
        }
        if (targetTenant.id === toInteger(req.tenant?.id, 0)) {
            return res.status(400).json({ error: '当前后台不能代发给自己。' });
        }
        if (!isPlatformAdminRole(req.userRole)) {
            return res.status(403).json({ error: '只有平台管理员才可以代发到其他后台。' });
        }

        const actor = {
            userId: req.userId,
            userRole: req.userRole,
            tenantId: req.tenant?.id,
            tenantCode: req.tenant?.code,
            tenantName: req.tenant?.name,
        };
        const targetOrder = await runWithTenantContext(
            {
                tenantId: targetTenant.id,
                tenantCode: targetTenant.code,
                tenant: targetTenant,
            },
            async () => saveOrder(buildDropshipTargetOrder(order, targetTenant, actor)),
        );

        order.dropship = {
            ...(order.dropship || {}),
            status: 'dispatched',
            target_tenant_id: targetTenant.id,
            target_tenant_code: safeText(targetTenant.code),
            target_tenant_name: safeText(targetTenant.name),
            target_order_id: targetOrder.id,
            target_order_no: safeText(targetOrder.order_no),
            dispatched_at: new Date().toISOString(),
            copied_at: new Date().toISOString(),
            copied_by_role: safeText(req.userRole),
        };
        appendOrderLog(order, {
            operatorId: req.userId,
            operatorRole: req.userRole,
            action: '一键代发',
            content: `已代发到 ${targetTenant.name}，目标订单号 ${targetOrder.order_no}`,
        });

        await commitStoreChanges({
            orders: [order],
        });
        await safeRecordAdminAuditLog({
            req,
            category: 'orders',
            action: '一键代发订单',
            summary: `订单 ${order.order_no} 已代发到 ${targetTenant.name}`,
            detail: `目标订单号：${targetOrder.order_no}`,
            targetType: 'order',
            targetId: order.id,
            targetKey: order.order_no,
            targetLabel: order.customer_name || order.order_no,
            metadata: {
                target_tenant_id: targetTenant.id,
                target_tenant_code: targetTenant.code,
                target_order_id: targetOrder.id,
                target_order_no: targetOrder.order_no,
            },
        });

        res.json({
            success: true,
            target_tenant: {
                id: targetTenant.id,
                code: targetTenant.code,
                name: targetTenant.name,
            },
            target_order: {
                id: targetOrder.id,
                order_no: targetOrder.order_no,
            },
            dropship: order.dropship,
        });
    }),
);

router.delete(
    '/orders/:id',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'orders.manage')) return;

        const orderId = toInteger(req.params.id, 0);
        const [orders, devices] = await Promise.all([readOrders(), readDevices()]);
        const order = orders.find((item) => item.id === orderId);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        const deviceMap = new Map(devices.map((device) => [device.id, device]));
        const deletionPlan = planOrderDeletion(order, deviceMap);

        await commitStoreChanges({
            devices: deletionPlan.updatedDevice ? [deletionPlan.updatedDevice] : [],
            deleteOrderIds: [order.id],
        });

        if (deletionPlan.paymentProof) {
            removePublicFile(deletionPlan.paymentProof);
        }
        if (deletionPlan.labelFile) {
            removePublicFile(deletionPlan.labelFile);
        }

        await recordOrderDeletionAudit(req, order, {
            flow_type: order.flow_type,
            status: order.status,
            payment_proof: deletionPlan.paymentProof,
            label_file: deletionPlan.labelFile,
            restored_device_stock: deletionPlan.updatedDevice ? deletionPlan.updatedDevice.stock : null,
        });

        res.json({ success: true });
    }),
);

router.post(
    '/orders/:id/ems/parse-address',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'logistics.manage')) return;
        if (!ensureTenantFeature(req, res, 'ems', '当前租户未开通 EMS 电子面单功能，请联系平台管理员升级授权。')) return;

        const orderId = toInteger(req.params.id, 0);
        const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
        const order = orders.find((item) => item.id === orderId);
        const runtimeConfig = buildRuntimeEmsConfig(settings);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        order.ems = normalizeAdminEmsPayload(req.body.ems, order.ems);
        const wholeAddress = safeText(req.body.whole_address ?? req.body.wholeAddress, order.shipping_address);
        if (!wholeAddress) {
            return res.status(400).json({ error: '请先填写收件地址后再解析。' });
        }

        try {
            const candidates = await parseAddress(wholeAddress, { config: runtimeConfig });

            if (!candidates.length) {
                order.ems = {
                    ...order.ems,
                    address_parse_source: wholeAddress,
                    address_parse_candidates: [],
                    address_parsed_at: new Date().toISOString(),
                    parse_payload: { wholeAddress },
                    parse_response: { candidates: [] },
                    last_error: 'EMS 地址解析未命中，请手工补全省市区。',
                };
                appendEmsAudit(order, {
                    action: 'parse-address',
                    status: 'error',
                    request: { wholeAddress },
                    response: { candidates: [] },
                    retMsg: order.ems.last_error,
                });
                await commitStoreChanges({ orders: [order] });
                return res.status(400).json({ error: 'EMS 地址解析未命中，请手工补全省市区。' });
            }

            const firstCandidate = applyParsedAddressToOrder(order, wholeAddress, candidates);
            order.ems = {
                ...order.ems,
                address_parsed_at: new Date().toISOString(),
                parse_payload: { wholeAddress },
                parse_response: { candidates },
                last_error: '',
            };
            appendEmsAudit(order, {
                action: 'parse-address',
                request: { wholeAddress },
                response: { candidates },
                retMsg: '地址解析成功',
            });
            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: 'EMS地址解析',
                content: `已解析为 ${firstCandidate.prov}${firstCandidate.city}${firstCandidate.county}`,
            });

            await commitStoreChanges({
                orders: [order],
            });
            await safeRecordAdminAuditLog({
                req,
                category: 'logistics',
                action: 'EMS解析地址',
                summary: `已解析订单 ${order.order_no} 的收件地址`,
                detail: `${firstCandidate.prov}${firstCandidate.city}${firstCandidate.county}`,
                targetType: 'order',
                targetId: order.id,
                targetKey: order.order_no,
                targetLabel: order.customer_name || order.order_no,
            });

            res.json({
                success: true,
                receiver: order.ems.receiver,
                candidates: order.ems.address_parse_candidates,
            });
        } catch (error) {
            const errorMessage = persistEmsFailure(order, error, {
                action: 'parse-address',
                request: { wholeAddress },
            });
            order.ems = {
                ...order.ems,
                address_parse_source: wholeAddress,
                address_parse_candidates: [],
                parse_payload: { wholeAddress },
                parse_response: compactAuditValue(error?.response || { message: safeText(error?.message) }),
            };
            await commitStoreChanges({ orders: [order] });
            return res.status(400).json({ error: errorMessage });
        }
    }),
);

router.post(
    '/orders/:id/ems/validate',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'logistics.manage')) return;
        if (!ensureTenantFeature(req, res, 'ems', '当前租户未开通 EMS 电子面单功能，请联系平台管理员升级授权。')) return;

        const orderId = toInteger(req.params.id, 0);
        const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
        const order = orders.find((item) => item.id === orderId);
        const runtimeConfig = buildRuntimeEmsConfig(settings);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        order.ems = normalizeAdminEmsPayload(req.body.ems, order.ems);
        try {
            if (!receiverHasFullAddress(order)) {
                const candidates = await parseAddress(order.ems?.address_parse_source || order.shipping_address, {
                    config: runtimeConfig,
                });
                if (!candidates.length) {
                    throw new Error('收件地址还没有解析成功，请先解析或手工补全。');
                }
                applyParsedAddressToOrder(order, order.ems?.address_parse_source || order.shipping_address, candidates);
            }

            const receiver = validatePartyAddress(
                {
                    ...order.ems.receiver,
                    name: order.ems.receiver?.name || order.customer_name,
                    mobile: order.ems.receiver?.mobile || order.customer_phone,
                    postCode: order.ems.receiver?.post_code,
                },
                '收件地址',
            );
            const sender = validatePartyAddress(
                await resolveSenderFromSettings(settings, order.ems?.sender || {}, runtimeConfig),
                '寄件地址',
            );
            const validatePayload = buildReachabilityPayload(order, sender, receiver, runtimeConfig);

            const response = await checkReachability(validatePayload, { config: runtimeConfig });
            order.ems = {
                ...order.ems,
                sender: normalizeEmsPartyPayload({ ...sender, post_code: sender.postCode }, order.ems.sender),
                receiver: normalizeEmsPartyPayload({ ...receiver, post_code: receiver.postCode }, order.ems.receiver),
                reachable: true,
                reachable_message: safeText(response.retMsg, '该地址信息可达！'),
                reachable_checked_at: new Date().toISOString(),
                last_serial_no: safeText(response.serialNo, order.ems.last_serial_no),
                last_error: '',
                validate_payload: validatePayload,
                validate_response: compactAuditValue(response),
            };
            appendEmsAudit(order, {
                action: 'validate',
                request: validatePayload,
                response,
                retCode: response.retCode,
                retMsg: response.retMsg,
                serialNo: response.serialNo,
            });

            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: 'EMS可达校验',
                content: order.ems.reachable_message || 'EMS 收寄地址校验通过',
            });

            await commitStoreChanges({
                orders: [order],
            });
            await safeRecordAdminAuditLog({
                req,
                category: 'logistics',
                action: 'EMS可达校验',
                summary: `已完成订单 ${order.order_no} 的 EMS 可达校验`,
                detail: order.ems.reachable_message || 'EMS 收寄地址校验通过',
                targetType: 'order',
                targetId: order.id,
                targetKey: order.order_no,
                targetLabel: order.customer_name || order.order_no,
            });

            res.json({
                success: true,
                reachable: order.ems.reachable,
                reachable_message: order.ems.reachable_message,
                receiver: order.ems.receiver,
                sender: order.ems.sender,
            });
        } catch (error) {
            order.ems = {
                ...order.ems,
                reachable: false,
                reachable_message: persistEmsFailure(order, error, {
                    action: 'validate',
                    request: order.ems?.validate_payload || null,
                }),
                reachable_checked_at: new Date().toISOString(),
                validate_response: compactAuditValue(error?.response || { message: safeText(error?.message) }),
            };
            await commitStoreChanges({ orders: [order] });
            return res.status(400).json({ error: order.ems.reachable_message });
        }
    }),
);

router.post(
    '/orders/:id/ems/create',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'logistics.manage')) return;
        if (!ensureTenantFeature(req, res, 'ems', '当前租户未开通 EMS 电子面单功能，请联系平台管理员升级授权。')) return;

        const orderId = toInteger(req.params.id, 0);
        const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
        const order = orders.find((item) => item.id === orderId);
        const runtimeConfig = buildRuntimeEmsConfig(settings);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }
        if (order.status === 'cancelled') {
            return res.status(400).json({ error: '已取消订单不能创建 EMS 运单。' });
        }
        if (safeText(order.ems?.waybill_no)) {
            return res.status(400).json({ error: '当前订单已经生成 EMS 运单号。' });
        }

        order.ems = normalizeAdminEmsPayload(req.body.ems, order.ems);
        const previousNoticeSnapshot = buildOrderNoticeSnapshot(order);
        try {
            if (!receiverHasFullAddress(order)) {
                const candidates = await parseAddress(order.ems?.address_parse_source || order.shipping_address, {
                    config: runtimeConfig,
                });
                if (!candidates.length) {
                    throw new Error('收件地址还没有解析成功，请先解析或手工补全。');
                }
                applyParsedAddressToOrder(order, order.ems?.address_parse_source || order.shipping_address, candidates);
            }

            const receiver = validatePartyAddress(
                {
                    ...order.ems.receiver,
                    name: order.ems.receiver?.name || order.customer_name,
                    mobile: order.ems.receiver?.mobile || order.customer_phone,
                    postCode: order.ems.receiver?.post_code,
                },
                '收件地址',
            );
            const sender = validatePartyAddress(
                await resolveSenderFromSettings(settings, order.ems?.sender || {}, runtimeConfig),
                '寄件地址',
            );

            const reachablePayload = buildReachabilityPayload(order, sender, receiver, runtimeConfig);
            const reachableResponse = await checkReachability(reachablePayload, { config: runtimeConfig });
            const config = runtimeConfig;
            const logisticsOrderNo = order.order_no;
            const orderPayload = {
                ecommerceUserId: preferText(order.ems?.ecommerce_user_id, `${order.order_no}-${order.id}`),
                logisticsOrderNo,
                createdTime: formatTimestamp(),
                senderNo: config.senderNo,
                contentsAttribute: preferText(order.ems?.contents_attribute, config.contentsAttribute),
                bizProductNo: preferText(order.ems?.biz_product_no, config.bizProductNo),
                bizProductId: safeText(order.ems?.biz_product_id, config.bizProductId),
                weight: Number(preferText(order.ems?.package_weight, config.defaultWeightGrams)),
                remarks: buildEmsRemark(order),
                sender,
                receiver,
                cargos: buildCargoList(order, config),
            };

            const { response, body } = await createWaybillOrder(orderPayload, { config });
            const waybillNo = safeText(body.waybillNo);
            if (!waybillNo) {
                throw new Error('EMS 建单成功但未返回运单号。');
            }

            order.ems = {
                ...order.ems,
                sender: normalizeEmsPartyPayload({ ...sender, post_code: sender.postCode }, order.ems.sender),
                receiver: normalizeEmsPartyPayload({ ...receiver, post_code: receiver.postCode }, order.ems.receiver),
                reachable: true,
                reachable_message: safeText(reachableResponse.retMsg, '该地址信息可达！'),
                reachable_checked_at: new Date().toISOString(),
                ecommerce_user_id: orderPayload.ecommerceUserId,
                logistics_order_no: preferText(body.logisticsOrderNo, logisticsOrderNo),
                waybill_no: waybillNo,
                route_code: safeText(body.routeCode),
                package_code: safeText(body.packageCode),
                package_code_name: safeText(body.packageCodeName),
                mark_destination_code: safeText(body.markDestinationCode),
                mark_destination_name: safeText(body.markDestinationName),
                biz_product_no: preferText(orderPayload.bizProductNo, config.bizProductNo),
                biz_product_id: safeText(orderPayload.bizProductId),
                contents_attribute: preferText(orderPayload.contentsAttribute, config.contentsAttribute),
                package_weight: preferText(orderPayload.weight, config.defaultWeightGrams),
                last_serial_no: safeText(response.serialNo, order.ems.last_serial_no),
                last_error: '',
                waybill_created_at: new Date().toISOString(),
                validate_payload: reachablePayload,
                validate_response: compactAuditValue(reachableResponse),
                order_payload: orderPayload,
                order_response: compactAuditValue(response),
            };
            order.logistics_company = 'EMS';
            order.merchant_tracking_number = waybillNo;
            appendEmsAudit(order, {
                action: 'create',
                request: orderPayload,
                response,
                retCode: response.retCode,
                retMsg: response.retMsg,
                serialNo: response.serialNo,
            });

            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: 'EMS建单成功',
                content: `已获取 EMS 运单号 ${waybillNo}`,
            });
            syncOrderLogisticsUserNotices(order, {
                previousSnapshot: previousNoticeSnapshot,
            });

            await commitStoreChanges({
                orders: [order],
            });
            await safeRecordAdminAuditLog({
                req,
                category: 'logistics',
                action: 'EMS建单',
                summary: `已为订单 ${order.order_no} 创建 EMS 单号`,
                detail: order.ems.waybill_no || order.merchant_tracking_number || '',
                targetType: 'order',
                targetId: order.id,
                targetKey: order.order_no,
                targetLabel: order.customer_name || order.order_no,
                metadata: {
                    waybill_no: order.ems.waybill_no || order.merchant_tracking_number,
                },
            });

            res.json({
                success: true,
                tracking_number: order.merchant_tracking_number,
                waybill_no: order.ems.waybill_no,
                order,
            });
        } catch (error) {
            const errorMessage = persistEmsFailure(order, error, {
                action: 'create',
                request: order.ems?.order_payload || null,
            });
            await commitStoreChanges({ orders: [order] });
            return res.status(400).json({ error: errorMessage });
        }
    }),
);

router.post(
    '/orders/:id/ems/label',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'logistics.manage')) return;
        if (!ensureTenantFeature(req, res, 'ems', '当前租户未开通 EMS 电子面单功能，请联系平台管理员升级授权。')) return;

        const orderId = toInteger(req.params.id, 0);
        const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
        const order = orders.find((item) => item.id === orderId);
        const runtimeConfig = buildRuntimeEmsConfig(settings);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        order.ems = normalizeAdminEmsPayload(req.body.ems, order.ems);
        const waybillNo = buildTrackingNumber(order);
        if (!waybillNo) {
            return res.status(400).json({ error: '请先创建 EMS 运单后再获取面单。' });
        }

        try {
            const labelPayload = {
                orderNo: order.order_no,
                waybillNo,
                type: preferText(order.ems?.label_type, runtimeConfig.labelType),
            };
            const label = await getLabelDocument({
                orderNo: labelPayload.orderNo,
                waybillNo: labelPayload.waybillNo,
                type: labelPayload.type,
            }, { config: runtimeConfig });

            order.ems = {
                ...order.ems,
                waybill_no: waybillNo,
                label_type: label.labelType,
                label_url: safeText(label.labelUrl),
                label_file: safeText(label.labelFile),
                label_generated_at: new Date().toISOString(),
                label_requested_at: new Date().toISOString(),
                last_serial_no: safeText(label.response.serialNo, order.ems.last_serial_no),
                last_error: '',
                label_payload: labelPayload,
                label_response: compactAuditValue(label.response),
            };
            appendEmsAudit(order, {
                action: 'label',
                request: labelPayload,
                response: label.response,
                retCode: label.response.retCode,
                retMsg: label.response.retMsg,
                serialNo: label.response.serialNo,
            });

            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '获取EMS面单',
                content: `已生成面单文件 ${order.ems.label_file}`,
            });

            await commitStoreChanges({
                orders: [order],
            });
            await safeRecordAdminAuditLog({
                req,
                category: 'logistics',
                action: 'EMS获取面单',
                summary: `已为订单 ${order.order_no} 获取 EMS 面单`,
                detail: order.ems.label_file || order.ems.label_url || '已生成 EMS 面单',
                targetType: 'order',
                targetId: order.id,
                targetKey: order.order_no,
                targetLabel: order.customer_name || order.order_no,
            });

            res.json({
                success: true,
                label_file: order.ems.label_file,
                label_url: order.ems.label_url,
                cloud_print_download_url: getCloudPrintDownloadUrl(),
            });
        } catch (error) {
            const errorMessage = persistEmsFailure(order, error, {
                action: 'label',
                request: order.ems?.label_payload || {
                    orderNo: order.order_no,
                    waybillNo,
                    type: preferText(order.ems?.label_type, runtimeConfig.labelType),
                },
            });
            await commitStoreChanges({ orders: [order] });
            return res.status(400).json({ error: errorMessage });
        }
    }),
);

router.post(
    '/orders/:id/ems/print',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'logistics.manage')) return;
        if (!ensureTenantFeature(req, res, 'ems', '当前租户未开通 EMS 电子面单功能，请联系平台管理员升级授权。')) return;

        const orderId = toInteger(req.params.id, 0);
        const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
        const order = orders.find((item) => item.id === orderId);
        const runtimeConfig = buildRuntimeEmsConfig(settings);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        order.ems = normalizeAdminEmsPayload(req.body.ems, order.ems);
        const previousNoticeSnapshot = buildOrderNoticeSnapshot(order);
        try {
            if (!safeText(order.ems?.label_file)) {
                const waybillNo = buildTrackingNumber(order);
                if (!waybillNo) {
                    throw new Error('请先创建 EMS 运单并生成面单。');
                }

                const label = await getLabelDocument({
                    orderNo: order.order_no,
                    waybillNo,
                    type: preferText(order.ems?.label_type, runtimeConfig.labelType),
                }, { config: runtimeConfig });

                order.ems = {
                    ...order.ems,
                    label_type: label.labelType,
                    label_url: safeText(label.labelUrl),
                    label_file: safeText(label.labelFile),
                    label_generated_at: new Date().toISOString(),
                    label_requested_at: new Date().toISOString(),
                    last_serial_no: safeText(label.response.serialNo, order.ems.last_serial_no),
                    last_error: '',
                    label_payload: {
                        orderNo: order.order_no,
                        waybillNo,
                        type: preferText(order.ems?.label_type, runtimeConfig.labelType),
                    },
                    label_response: compactAuditValue(label.response),
                };
                appendEmsAudit(order, {
                    action: 'label',
                    request: order.ems.label_payload,
                    response: label.response,
                    retCode: label.response.retCode,
                    retMsg: label.response.retMsg,
                    serialNo: label.response.serialNo,
                });
            }

            const printPayload = {
                labelFile: order.ems.label_file,
                printerName: runtimeConfig.printerName,
                mode: runtimeConfig.printMode,
                paperName: runtimeConfig.paperName,
                paperWidthMm: runtimeConfig.paperWidthMm,
                paperHeightMm: runtimeConfig.paperHeightMm,
                labelType: preferText(order.ems?.label_type, runtimeConfig.labelType),
            };
            const printDiagnostics = await assertPrintPreflight({ config: runtimeConfig });
            appendEmsAudit(order, {
                action: 'print-preflight',
                request: printPayload,
                response: printDiagnostics,
                retMsg: '打印前自检通过',
            });

            const printResult = await dispatchPrintJob(order.ems.label_file, { config: runtimeConfig });
            order.ems = {
                ...order.ems,
                print_status: printResult.dispatched ? 'queued' : printResult.mode || 'browser',
                print_mode: safeText(printResult.mode, runtimeConfig.printMode),
                print_message: safeText(printResult.message),
                print_attempted_at: new Date().toISOString(),
                printed_at: printResult.dispatched ? new Date().toISOString() : order.ems.printed_at,
                last_error: '',
                print_payload: printPayload,
                print_response: compactAuditValue({
                    ...printResult,
                    preflight: printDiagnostics.preflight,
                }),
            };
            appendEmsAudit(order, {
                action: 'print',
                request: printPayload,
                response: {
                    ...printResult,
                    preflight: printDiagnostics.preflight,
                },
                retMsg: printResult.message,
            });

            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '打印EMS面单',
                content: order.ems.print_message || '已触发 EMS 面单打印',
            });
            syncOrderLogisticsUserNotices(order, {
                previousSnapshot: previousNoticeSnapshot,
            });

            await commitStoreChanges({
                orders: [order],
            });
            await safeRecordAdminAuditLog({
                req,
                category: 'logistics',
                action: 'EMS打印面单',
                summary: `已为订单 ${order.order_no} 发起 EMS 打印`,
                detail: order.ems.print_message || printResult.message || '已触发打印任务',
                targetType: 'order',
                targetId: order.id,
                targetKey: order.order_no,
                targetLabel: order.customer_name || order.order_no,
                metadata: {
                    mode: printResult.mode,
                    printer: runtimeConfig.printerName,
                },
            });

            res.json({
                success: true,
                ...printResult,
                label_file: order.ems.label_file,
                cloud_print_download_url: getCloudPrintDownloadUrl(),
            });
        } catch (error) {
            const errorMessage = persistEmsFailure(order, error, {
                action: error?.code === 'PRINT_PREFLIGHT' ? 'print-preflight' : 'print',
                request: order.ems?.print_payload || {
                    labelFile: order.ems?.label_file,
                    printerName: runtimeConfig.printerName,
                    mode: runtimeConfig.printMode,
                    paperName: runtimeConfig.paperName,
                    paperWidthMm: runtimeConfig.paperWidthMm,
                    paperHeightMm: runtimeConfig.paperHeightMm,
                    labelType: preferText(order.ems?.label_type, runtimeConfig.labelType),
                },
            });
            await commitStoreChanges({ orders: [order] });
            return res.status(400).json({ error: errorMessage });
        }
    }),
);

router.post(
    '/orders/:id/ems/tracks/sync',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'logistics.manage')) return;
        if (!ensureTenantFeature(req, res, 'ems', '当前租户未开通 EMS 电子面单功能，请联系平台管理员升级授权。')) return;

        const orderId = toInteger(req.params.id, 0);
        const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
        const order = orders.find((item) => item.id === orderId);
        const runtimeConfig = buildRuntimeEmsConfig(settings);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        const waybillNo = buildTrackingNumber(order);
        if (!waybillNo) {
            return res.status(400).json({ error: '当前订单还没有 EMS 运单号。' });
        }

        order.ems = normalizeAdminEmsPayload(req.body.ems, order.ems);
        const previousNoticeSnapshot = buildOrderNoticeSnapshot(order);
        try {
            const trackPayload = {
                waybillNo,
                direction: order.ems?.tracking_direction || '0',
            };
            const { response, items } = await queryTrackItems(waybillNo, trackPayload.direction, { config: runtimeConfig });
            const trackResult = analyzeTrackQueryResult(response, items);
            if (trackResult.suspiciousEmpty) {
                const error = new Error(trackResult.message);
                error.code = 'EMS_TRACK_EMPTY';
                error.response = response;
                throw error;
            }
            order.ems = {
                ...order.ems,
                waybill_no: waybillNo,
                track_items: trackResult.items.map(normalizeEmsTrackPayload),
                track_summary: summarizeLatestTrack(trackResult.items),
                last_track_sync_at: new Date().toISOString(),
                last_serial_no: safeText(response.serialNo, order.ems.last_serial_no),
                last_error: '',
                track_payload: trackPayload,
                track_response: compactAuditValue(response),
            };
            order.ems.auto_track_sync_failure_streak = 0;
            order.ems.auto_track_sync_last_error = '';
            order.ems.auto_track_sync_last_success_at = new Date().toISOString();
            order.logistics_company = order.logistics_company || 'EMS';
            order.merchant_tracking_number = order.merchant_tracking_number || waybillNo;
            appendEmsAudit(order, {
                action: 'track-sync',
                request: trackPayload,
                response,
                retCode: response.retCode,
                retMsg: response.retMsg,
                serialNo: response.serialNo,
            });

            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '同步EMS轨迹',
                content: trackResult.items.length ? `已同步 ${trackResult.items.length} 条 EMS 轨迹` : '当前暂无 EMS 轨迹',
            });
            syncOrderLogisticsUserNotices(order, {
                previousSnapshot: previousNoticeSnapshot,
            });

            await commitStoreChanges({
                orders: [order],
            });
            await safeRecordAdminAuditLog({
                req,
                category: 'logistics',
                action: 'EMS同步轨迹',
                summary: `已同步订单 ${order.order_no} 的 EMS 轨迹`,
                detail: order.ems.track_summary || `已同步 ${order.ems.track_items.length} 条轨迹`,
                targetType: 'order',
                targetId: order.id,
                targetKey: order.order_no,
                targetLabel: order.customer_name || order.order_no,
                metadata: {
                    track_count: order.ems.track_items.length,
                },
            });

            res.json({
                success: true,
                tracks: order.ems.track_items,
                track_summary: order.ems.track_summary,
                last_track_sync_at: order.ems.last_track_sync_at,
            });
        } catch (error) {
            const errorMessage = persistEmsFailure(order, error, {
                action: 'track-sync',
                request: order.ems?.track_payload || {
                    waybillNo,
                    direction: order.ems?.tracking_direction || '0',
                },
            });
            await commitStoreChanges({ orders: [order] });
            return res.status(400).json({ error: errorMessage });
        }
    }),
);

router.post(
    '/orders/:id/ems/workflow',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'logistics.manage')) return;
        if (!ensureTenantFeature(req, res, 'ems', '当前租户未开通 EMS 电子面单功能，请联系平台管理员升级授权。')) return;

        const orderId = toInteger(req.params.id, 0);
        const includeTrack =
            toNullableBoolean(req.body.include_track ?? req.body.includeTrack) === null
                ? true
                : toNullableBoolean(req.body.include_track ?? req.body.includeTrack);

        const { task, alreadyQueued } = await enqueueWorkflowForOrder(orderId, {
            includeTrack,
            initiatorId: req.userId,
            initiatorRole: req.userRole,
            mode: 'single',
        });
        const order = await loadOrderForWorkflow(orderId);
        await safeRecordAdminAuditLog({
            req,
            category: 'logistics',
            action: '加入EMS一键队列',
            summary: alreadyQueued ? `订单 ${order.order_no} 已在 EMS 队列中` : `订单 ${order.order_no} 已加入 EMS 一键处理队列`,
            detail: includeTrack ? '本次任务会包含轨迹同步' : '本次任务不包含轨迹同步',
            targetType: 'order',
            targetId: order.id,
            targetKey: order.order_no,
            targetLabel: order.customer_name || order.order_no,
            metadata: {
                include_track: includeTrack,
                workflow_id: task.id,
                already_queued: alreadyQueued,
            },
        });

        res.json({
            success: true,
            queued: !alreadyQueued,
            already_queued: alreadyQueued,
            workflow_task: task,
            message: alreadyQueued ? '该订单已经在后台队列中执行。' : '已加入后台一键处理队列。',
        });
    }),
);

router.post(
    '/orders/ems/workflow/batch',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'logistics.manage')) return;
        if (!ensureTenantFeature(req, res, 'ems', '当前租户未开通 EMS 电子面单功能，请联系平台管理员升级授权。')) return;

        const includeTrack =
            toNullableBoolean(req.body.include_track ?? req.body.includeTrack) === null
                ? true
                : toNullableBoolean(req.body.include_track ?? req.body.includeTrack);
        const orderIds = Array.from(
            new Set(
                (Array.isArray(req.body.order_ids) ? req.body.order_ids : toStringArray(req.body.order_ids))
                    .map((item) => toInteger(item, 0))
                    .filter((item) => item > 0),
            ),
        );

        if (!orderIds.length) {
            return res.status(400).json({ error: '请先选择要加入后台队列的订单。' });
        }

        const results = [];
        for (const orderId of orderIds) {
            try {
                const result = await enqueueWorkflowForOrder(orderId, {
                    includeTrack,
                    initiatorId: req.userId,
                    initiatorRole: req.userRole,
                    mode: 'batch',
                });
                results.push({
                    order_id: orderId,
                    success: true,
                    already_queued: result.alreadyQueued,
                    workflow_task: result.task,
                });
            } catch (error) {
                results.push({
                    order_id: orderId,
                    success: false,
                    error: safeText(error?.message, '加入后台队列失败'),
                });
            }
        }
        await safeRecordAdminAuditLog({
            req,
            category: 'logistics',
            action: '批量加入EMS队列',
            summary: `已提交 ${orderIds.length} 个订单到 EMS 后台队列`,
            detail: `新加入 ${results.filter((item) => item.success && !item.already_queued).length} 单；已在队列 ${results.filter((item) => item.success && item.already_queued).length} 单；失败 ${results.filter((item) => !item.success).length} 单`,
            targetType: 'batch_order',
            targetKey: orderIds.join(','),
            metadata: {
                order_ids: orderIds,
                include_track: includeTrack,
                queued_count: results.filter((item) => item.success && !item.already_queued).length,
                already_queued_count: results.filter((item) => item.success && item.already_queued).length,
                failed_count: results.filter((item) => !item.success).length,
            },
        });

        res.json({
            success: true,
            queued_count: results.filter((item) => item.success && !item.already_queued).length,
            already_queued_count: results.filter((item) => item.success && item.already_queued).length,
            failed_count: results.filter((item) => !item.success).length,
            results,
        });
    }),
);

router.get(
    '/ems/diagnostics',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'logistics.manage')) return;
        if (!ensureTenantFeature(req, res, 'ems', '当前租户未开通 EMS 电子面单功能，请联系平台管理员升级授权。')) return;

        const settings = await readSettings();
        const runtimeConfig = buildRuntimeEmsConfig(settings);
        const diagnostics = await getPrintDiagnostics({ config: runtimeConfig });

        res.json({
            diagnostics,
            cloud_print_download_url: getCloudPrintDownloadUrl(),
            runtime: {
                print_mode: runtimeConfig.printMode,
                printer_name: runtimeConfig.printerName,
                sumatra_path: runtimeConfig.sumatraPath,
                label_type: runtimeConfig.labelType,
                paper_name: runtimeConfig.paperName,
                paper_width_mm: runtimeConfig.paperWidthMm,
                paper_height_mm: runtimeConfig.paperHeightMm,
                auto_sync_tracks: Boolean(settings?.logistics?.auto_sync_tracks),
                track_auto_sync_interval_hours: resolveTrackAutoSyncIntervalHours(settings),
                sender_name: runtimeConfig.senderName,
                sender_phone: runtimeConfig.senderPhone,
                sender_address: runtimeConfig.senderAddress,
            },
            credentials: {
                sender_no_configured: Boolean(runtimeConfig.senderNo),
                authorization_configured: Boolean(runtimeConfig.authorization),
                sign_key_configured: Boolean(runtimeConfig.signKey),
            },
        });
    }),
);

router.get(
    '/settings',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;
        if (!hasPermission(req.userPermissions || [], 'tenant.settings') && !hasPermission(req.userPermissions || [], 'logistics.manage')) {
            return res.status(403).json({ error: '当前账号没有该操作权限。' });
        }
        res.json(await readSettings());
    }),
);

router.get(
    '/team/members',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'team.manage')) return;

        const users = await readUsers();
        const members = users
            .filter((item) => isBackofficeRole(item.role))
            .sort((left, right) => {
                const leftRank = isPrimaryAdminRole(left.role) ? 0 : 1;
                const rightRank = isPrimaryAdminRole(right.role) ? 0 : 1;
                return leftRank - rightRank || String(left.username || '').localeCompare(String(right.username || ''), 'zh-CN');
            })
            .map(sanitizeTeamMember);
        const activeMembers = members.filter((item) => item.status === 'active');
        const roleBreakdown = members.reduce((result, member) => {
            const current = result[member.role] || {
                code: member.role,
                label: member.role_label,
                count: 0,
            };
            current.count += 1;
            result[member.role] = current;
            return result;
        }, {});

        res.json({
            role_options: buildAssignableRoleOptions(req.userRole),
            members,
            summary: {
                total_count: members.length,
                active_count: activeMembers.length,
                disabled_count: members.length - activeMembers.length,
                role_breakdown: Object.values(roleBreakdown).sort(
                    (left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'),
                ),
            },
        });
    }),
);

router.post(
    '/team/members',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'team.manage')) return;

        const users = await readUsers();
        const form = normalizeTeamMemberFormPayload(req.body);

        if (!form.username) {
            return res.status(400).json({ error: '请填写员工账号。' });
        }
        if (!isBackofficeRole(form.role) || form.role === 'platform_admin') {
            return res.status(400).json({ error: '请选择有效的员工角色。' });
        }
        if (!canManageBackofficeRole(req.userRole, form.role)) {
            return res.status(403).json({ error: '当前账号不能创建该角色。' });
        }
        if (!form.password || form.password.length < 6) {
            return res.status(400).json({ error: '员工密码至少 6 位。' });
        }
        if (users.some((item) => safeText(item.username) === form.username)) {
            return res.status(400).json({ error: '该员工账号已存在。' });
        }
        if (form.phone && users.some((item) => item.phone && item.phone === form.phone)) {
            return res.status(400).json({ error: '该手机号已被使用。' });
        }

        const savedMember = await saveUser({
            id: Date.now() + Math.floor(Math.random() * 1000),
            tenant_id: req.tenant?.id,
            username: form.username,
            nickname: form.nickname || `${getRoleLabel(form.role)}${String(form.username).slice(-4)}`,
            phone: form.phone,
            password: form.password,
            role: form.role,
            status: form.status,
            permissions: form.permissions,
        });
        await safeRecordAdminAuditLog({
            req,
            category: 'team',
            action: '创建员工账号',
            summary: `已创建员工 ${savedMember.nickname || savedMember.username}`,
            detail: `账号：${savedMember.username}；角色：${getRoleLabel(savedMember.role)}`,
            targetType: 'team_member',
            targetId: savedMember.id,
            targetKey: savedMember.username,
            targetLabel: savedMember.nickname || savedMember.username,
            metadata: {
                role: savedMember.role,
                status: savedMember.status,
            },
        });

        res.json({
            success: true,
            member: sanitizeTeamMember(savedMember),
        });
    }),
);

router.put(
    '/team/members/:id',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'team.manage')) return;

        const memberId = toInteger(req.params.id, 0);
        const users = await readUsers();
        const existingMember = users.find((item) => item.id === memberId && isBackofficeRole(item.role));

        if (!existingMember) {
            return res.status(404).json({ error: '员工账号不存在。' });
        }
        if (existingMember.id === req.userId) {
            return res.status(400).json({ error: '请在账号安全页修改自己的账号。' });
        }
        if (!canManageBackofficeRole(req.userRole, existingMember.role)) {
            return res.status(403).json({ error: '当前账号不能修改该员工。' });
        }

        const form = normalizeTeamMemberFormPayload(req.body, existingMember);
        if (!form.username) {
            return res.status(400).json({ error: '请填写员工账号。' });
        }
        if (!isBackofficeRole(form.role) || form.role === 'platform_admin') {
            return res.status(400).json({ error: '请选择有效的员工角色。' });
        }
        if (!canManageBackofficeRole(req.userRole, form.role)) {
            return res.status(403).json({ error: '当前账号不能设置该角色。' });
        }
        if (form.password && form.password.length < 6) {
            return res.status(400).json({ error: '员工密码至少 6 位。' });
        }
        if (users.some((item) => item.id !== existingMember.id && safeText(item.username) === form.username)) {
            return res.status(400).json({ error: '该员工账号已存在。' });
        }
        if (form.phone && users.some((item) => item.id !== existingMember.id && item.phone && item.phone === form.phone)) {
            return res.status(400).json({ error: '该手机号已被使用。' });
        }

        const primaryAdmins = listPrimaryAdmins(users);
        if (
            isPrimaryAdminRole(existingMember.role) &&
            primaryAdmins.length <= 1 &&
            (form.status !== 'active' || !isPrimaryAdminRole(form.role))
        ) {
            return res.status(400).json({ error: '当前租户至少需要保留一个启用中的主管理员。' });
        }

        const savedMember = await saveUser({
            ...existingMember,
            username: form.username,
            nickname: form.nickname || existingMember.nickname,
            phone: form.phone,
            password: form.password || existingMember.password,
            role: form.role,
            status: form.status,
            permissions: form.permissions,
        });
        await safeRecordAdminAuditLog({
            req,
            category: 'team',
            action: '更新员工账号',
            summary: `已更新员工 ${savedMember.nickname || savedMember.username}`,
            detail: `账号：${savedMember.username}；角色：${getRoleLabel(savedMember.role)}；状态：${savedMember.status}`,
            targetType: 'team_member',
            targetId: savedMember.id,
            targetKey: savedMember.username,
            targetLabel: savedMember.nickname || savedMember.username,
            metadata: {
                role: savedMember.role,
                status: savedMember.status,
            },
        });

        res.json({
            success: true,
            member: sanitizeTeamMember(savedMember),
        });
    }),
);

router.get(
    '/platform/billing-records',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensurePlatformAdmin(req, res) || !ensurePermission(req, res, 'billing.manage')) return;

        const tenantId = toInteger(req.query.tenant_id ?? req.query.tenantId, 0);
        const [records, tenants] = await Promise.all([readTenantBillingRecords(), readTenants()]);
        const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));
        const filteredRecords = records.filter((record) => !tenantId || record.tenant_id === tenantId);

        res.json({
            tenants: tenants.map((tenant) => ({
                id: tenant.id,
                code: tenant.code,
                name: tenant.name,
                status: tenant.status,
            })),
            records: filteredRecords.map((record) => ({
                ...record,
                tenant_code: tenantMap.get(record.tenant_id)?.code || '',
                tenant_name: tenantMap.get(record.tenant_id)?.name || '',
            })),
        });
    }),
);

router.post(
    '/platform/billing-records',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensurePlatformAdmin(req, res) || !ensurePermission(req, res, 'billing.manage')) return;

        const tenants = await readTenants();
        const record = normalizeBillingRecordFormPayload(req.body);
        const tenant = tenants.find((item) => item.id === record.tenant_id);

        if (!tenant) {
            return res.status(404).json({ error: '租户不存在。' });
        }
        if (!record.subscription_name && !safeText(tenant.subscription_name)) {
            return res.status(400).json({ error: '请填写授权套餐名称。' });
        }

        const savedRecord = await saveTenantBillingRecord({
            ...record,
            operator_id: req.userId,
            operator_role: req.userRole,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        await safeRecordAdminAuditLog({
            req,
            category: 'billing',
            action: '创建授权记录',
            summary: `已创建租户 ${tenant.name} 的授权记录`,
            detail: `记录号：${savedRecord.record_no}；类型：${savedRecord.kind}；金额：${savedRecord.amount}`,
            targetType: 'billing_record',
            targetId: savedRecord.id,
            targetKey: savedRecord.record_no,
            targetLabel: savedRecord.subscription_name || tenant.subscription_name || tenant.name,
            targetTenantId: tenant.id,
            targetTenantCode: tenant.code,
            targetTenantName: tenant.name,
            metadata: {
                kind: savedRecord.kind,
                amount: savedRecord.amount,
                duration_days: savedRecord.duration_days,
            },
        });

        if (toBooleanFlag(req.body.apply_now ?? req.body.applyNow, false)) {
            const applied = await applyBillingRecord(savedRecord, {
                userId: req.userId,
                userRole: req.userRole,
            });
            await safeRecordAdminAuditLog({
                req,
                category: 'billing',
                action: '应用授权记录',
                summary: `已将授权记录应用到租户 ${tenant.name}`,
                detail: `记录号：${applied.record.record_no}；新到期时间：${applied.tenant.expires_at || '未设置'}`,
                targetType: 'billing_record',
                targetId: applied.record.id,
                targetKey: applied.record.record_no,
                targetLabel: applied.record.subscription_name || tenant.subscription_name || tenant.name,
                targetTenantId: tenant.id,
                targetTenantCode: tenant.code,
                targetTenantName: tenant.name,
                metadata: {
                    after_expires_at: applied.tenant.expires_at,
                },
            });
            return res.json({
                success: true,
                applied: true,
                record: applied.record,
                tenant: applied.tenant,
            });
        }

        res.json({
            success: true,
            applied: false,
            record: savedRecord,
        });
    }),
);

router.post(
    '/platform/billing-records/:id/apply',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensurePlatformAdmin(req, res) || !ensurePermission(req, res, 'billing.manage')) return;

        const recordId = toInteger(req.params.id, 0);
        const records = await readTenantBillingRecords();
        const record = records.find((item) => item.id === recordId);

        if (!record) {
            return res.status(404).json({ error: '计费记录不存在。' });
        }
        if (record.status === 'cancelled') {
            return res.status(400).json({ error: '已取消的计费记录不能再应用。' });
        }

        const applied = await applyBillingRecord(record, {
            userId: req.userId,
            userRole: req.userRole,
        });
        await safeRecordAdminAuditLog({
            req,
            category: 'billing',
            action: '应用授权记录',
            summary: `已应用授权记录 ${applied.record.record_no}`,
            detail: `租户：${applied.tenant.name}；新到期时间：${applied.tenant.expires_at || '未设置'}`,
            targetType: 'billing_record',
            targetId: applied.record.id,
            targetKey: applied.record.record_no,
            targetLabel: applied.record.subscription_name || applied.tenant.subscription_name || applied.tenant.name,
            targetTenantId: applied.tenant.id,
            targetTenantCode: applied.tenant.code,
            targetTenantName: applied.tenant.name,
            metadata: {
                after_expires_at: applied.tenant.expires_at,
            },
        });

        res.json({
            success: true,
            record: applied.record,
            tenant: applied.tenant,
        });
    }),
);

router.put(
    '/settings',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const bodyKeys = Object.keys(req.body || {});
        const logisticsOnly = bodyKeys.length > 0 && bodyKeys.every((key) => key === 'logistics');
        if (!hasPermission(req.userPermissions || [], 'tenant.settings')) {
            if (!logisticsOnly || !hasPermission(req.userPermissions || [], 'logistics.manage')) {
                return res.status(403).json({ error: '当前账号没有该操作权限。' });
            }
        }

        const currentSettings = await readSettings();
        const nextSettings = {
            ...currentSettings,
            store_name: String(req.body.store_name ?? currentSettings.store_name).trim(),
            hero_badge: String(req.body.hero_badge ?? currentSettings.hero_badge).trim(),
            hero_title: String(req.body.hero_title ?? currentSettings.hero_title).trim(),
            hero_subtitle: String(req.body.hero_subtitle ?? currentSettings.hero_subtitle).trim(),
            service_phone: String(req.body.service_phone ?? currentSettings.service_phone).trim(),
            service_wechat: String(req.body.service_wechat ?? currentSettings.service_wechat).trim(),
            business_hours: String(req.body.business_hours ?? currentSettings.business_hours).trim(),
            shop_receiving_name: String(req.body.shop_receiving_name ?? currentSettings.shop_receiving_name).trim(),
            shop_receiving_phone: String(req.body.shop_receiving_phone ?? currentSettings.shop_receiving_phone).trim(),
            shop_receiving_address: String(req.body.shop_receiving_address ?? currentSettings.shop_receiving_address).trim(),
            announcement: String(req.body.announcement ?? currentSettings.announcement).trim(),
            payment_notice: String(req.body.payment_notice ?? currentSettings.payment_notice).trim(),
            shipping_notice: String(req.body.shipping_notice ?? currentSettings.shipping_notice).trim(),
            aftersales_notice: String(req.body.aftersales_notice ?? currentSettings.aftersales_notice).trim(),
            delivery_notice: String(req.body.delivery_notice ?? currentSettings.delivery_notice).trim(),
            region_notice: String(req.body.region_notice ?? currentSettings.region_notice).trim(),
            ship_service_title: String(req.body.ship_service_title ?? currentSettings.ship_service_title).trim(),
            ship_service_fee: Math.max(0, toNumber(req.body.ship_service_fee ?? currentSettings.ship_service_fee, 0)),
            buy_flow_steps: toStringArray(req.body.buy_flow_steps ?? currentSettings.buy_flow_steps),
            ship_flow_steps: toStringArray(req.body.ship_flow_steps ?? currentSettings.ship_flow_steps),
            ship_checklist: toStringArray(req.body.ship_checklist ?? currentSettings.ship_checklist),
            purchase_rules: toStringArray(req.body.purchase_rules ?? currentSettings.purchase_rules),
            faq_items: toStringArray(req.body.faq_items ?? currentSettings.faq_items),
            admin_note_templates: toStringArray(req.body.admin_note_templates ?? currentSettings.admin_note_templates),
            share_title: String(req.body.share_title ?? currentSettings.share_title).trim(),
            share_description: String(req.body.share_description ?? currentSettings.share_description).trim(),
            payment_qrs: { ...currentSettings.payment_qrs },
            logistics: {
                ...(currentSettings.logistics || {}),
                ...(req.body.logistics && typeof req.body.logistics === 'object' ? req.body.logistics : {}),
            },
        };

        const savedSettings = await writeSettings(nextSettings);
        await safeRecordAdminAuditLog({
            req,
            category: logisticsOnly ? 'logistics' : 'settings',
            action: logisticsOnly ? '更新物流设置' : '更新店铺设置',
            summary: logisticsOnly ? '已保存当前租户物流配置' : '已保存当前租户店铺配置',
            detail: logisticsOnly
                ? `打印模式：${savedSettings.logistics?.preferred_print_mode || '未设置'}；默认打印机：${savedSettings.logistics?.preferred_printer || '未设置'}`
                : `店铺名：${savedSettings.store_name || '未设置'}；客服手机：${savedSettings.service_phone || '未设置'}`,
            targetType: logisticsOnly ? 'logistics_settings' : 'store_settings',
            targetKey: req.tenant?.code || DEFAULT_TENANT_CODE,
            targetLabel: savedSettings.store_name || req.tenant?.name || req.tenant?.code || '',
        });
        res.json({ success: true, settings: savedSettings });
    }),
);

router.put(
    '/account',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'account.manage')) return;

        const users = await readUsers();
        const adminIndex = users.findIndex((item) => item.id === req.userId && isAdminRole(item.role));

        if (adminIndex === -1) {
            return res.status(404).json({ error: '管理员账号不存在。' });
        }

        const username = String(req.body.username || '').trim();
        const currentPassword = String(req.body.current_password || '').trim();
        const newPassword = String(req.body.new_password || '').trim();

        if (!username) {
            return res.status(400).json({ error: '请输入新的管理员账号。' });
        }

        if (!currentPassword) {
            return res.status(400).json({ error: '请输入当前管理员密码。' });
        }

        if (!verifyPassword(currentPassword, users[adminIndex].password)) {
            return res.status(400).json({ error: '当前密码输入错误。' });
        }

        if (newPassword && newPassword.length < 6) {
            return res.status(400).json({ error: '新密码长度至少 6 位。' });
        }

        const duplicateUser = users.find((item) => item.id !== users[adminIndex].id && isAdminRole(item.role) && item.username === username);

        if (duplicateUser) {
            return res.status(400).json({ error: '该管理员账号已被占用。' });
        }

        users[adminIndex].username = username;
        users[adminIndex].password = newPassword || users[adminIndex].password;

        const savedAdmin = await saveUser(users[adminIndex]);
        await safeRecordAdminAuditLog({
            req,
            category: 'auth',
            action: '更新后台账号',
            summary: `已更新后台账号 ${savedAdmin.username || savedAdmin.nickname || savedAdmin.id}`,
            detail: newPassword ? '已同时更新登录密码' : '仅更新了登录账号',
            targetType: 'team_member',
            targetId: savedAdmin.id,
            targetKey: savedAdmin.username,
            targetLabel: savedAdmin.nickname || savedAdmin.username,
            metadata: {
                changed_password: Boolean(newPassword),
            },
        });

        res.json({
            success: true,
            user: {
                id: savedAdmin.id,
                phone: savedAdmin.phone,
                username: savedAdmin.username || '',
                nickname: savedAdmin.nickname,
                role: savedAdmin.role,
            },
        });
    }),
);

router.post(
    '/settings/payment-qrs',
    auth,
    uploadPaymentQrs,
    asyncHandler(async (req, res) => {
        if (!ensureAdminPermission(req, res, 'tenant.settings')) {
            removeTempFilesMap(req.files);
            return;
        }

        const files = req.files || {};
        const hasWechatQr = Boolean(files.wechat_qr?.[0]);
        const hasAlipayQr = Boolean(files.alipay_qr?.[0]);

        if (!hasWechatQr && !hasAlipayQr) {
            return res.status(400).json({ error: '请至少上传一张收款码图片。' });
        }

        const settings = await readSettings();

        if (hasWechatQr) {
            if (settings.payment_qrs.wechat) {
                removePublicFile(settings.payment_qrs.wechat);
            }
            settings.payment_qrs.wechat = `/uploads/${files.wechat_qr[0].filename}`;
        }

        if (hasAlipayQr) {
            if (settings.payment_qrs.alipay) {
                removePublicFile(settings.payment_qrs.alipay);
            }
            settings.payment_qrs.alipay = `/uploads/${files.alipay_qr[0].filename}`;
        }

        const savedSettings = await writeSettings(settings);
        await safeRecordAdminAuditLog({
            req,
            category: 'settings',
            action: '上传收款码',
            summary: '已更新收款二维码',
            detail: [
                hasWechatQr ? '微信收款码已更新' : '',
                hasAlipayQr ? '支付宝收款码已更新' : '',
            ]
                .filter(Boolean)
                .join('；'),
            targetType: 'payment_qr',
            targetKey: req.tenant?.code || DEFAULT_TENANT_CODE,
            targetLabel: settings.store_name || req.tenant?.name || req.tenant?.code || '',
            metadata: {
                has_wechat: hasWechatQr,
                has_alipay: hasAlipayQr,
            },
        });
        res.json({ success: true, settings: savedSettings });
    }),
);

router.recoverEmsWorkflowQueueOnStartup = recoverEmsWorkflowQueueOnStartup;
router.recoverTenantLicenseStatesOnStartup = recoverTenantLicenseStatesOnStartup;
router.startEmsTrackAutoSyncScheduler = startEmsTrackAutoSyncScheduler;
router.startTenantLicenseSweepScheduler = startTenantLicenseSweepScheduler;

module.exports = router;
