const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { createTemporaryPassword, normalizeStoredPassword } = require('./auth');
const { normalizeUserNoticeCenter } = require('./user-notices');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PLANS_FILE = path.join(DATA_DIR, 'plans.json');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const MYSQL_HOST = safeText(process.env.MYSQL_HOST);
const MYSQL_PORT = Number(process.env.MYSQL_PORT) || 3306;
const MYSQL_DATABASE = safeText(process.env.MYSQL_DATABASE);
const MYSQL_USER = safeText(process.env.MYSQL_USER);
const MYSQL_PASSWORD = safeText(process.env.MYSQL_PASSWORD);

const ADMIN_PHONE = process.env.ADMIN_PHONE || '17724888898';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = safeText(process.env.ADMIN_PASSWORD);

const SUPPORTED_STORAGE_DRIVERS = ['json', 'mysql'];
const MYSQL_CONFIGURED = Boolean(MYSQL_HOST && MYSQL_DATABASE && MYSQL_USER && MYSQL_PASSWORD);
const STORAGE_DRIVER = SUPPORTED_STORAGE_DRIVERS.includes(process.env.STORAGE_DRIVER)
    ? process.env.STORAGE_DRIVER
    : MYSQL_CONFIGURED
      ? 'mysql'
      : 'json';

const FLOW_TYPES = ['buy_device', 'ship_device'];
const ORDER_STATUSES = [
    'pending_payment_review',
    'awaiting_device_delivery',
    'configuring',
    'ready_to_ship',
    'shipped',
    'completed',
    'cancelled',
];
const DEVICE_CATEGORIES = ['portable_wifi', 'cpe', 'vehicle_router', 'industrial_gateway'];

let mysqlPool = null;

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function readJson(filePath, fallbackValue) {
    try {
        if (!fs.existsSync(filePath)) {
            return fallbackValue;
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        return fallbackValue;
    }
}

function loadTemplateJson(filePath, fallbackValue) {
    return readJson(filePath, fallbackValue);
}

function toNumber(value, fallbackValue = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallbackValue;
}

function toInteger(value, fallbackValue = 0) {
    return Math.trunc(toNumber(value, fallbackValue));
}

function toBoolean(value, fallbackValue = false) {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1) return true;
    if (value === 'false' || value === '0' || value === 0) return false;
    return fallbackValue;
}

function toStringArray(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        try {
            return toStringArray(JSON.parse(trimmed));
        } catch (error) {
            return trimmed
                .split(/\r?\n|,|，|；|;/)
                .map((item) => item.trim())
                .filter(Boolean);
        }
    }
    return [];
}

function safeText(value, fallbackValue = '') {
    return String(value ?? fallbackValue).trim();
}

function safeHtml(value) {
    return safeText(value);
}

function makeSlug(input) {
    return safeText(input)
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
        .replace(/^-+|-+$/g, '');
}

function makeOrderNo() {
    const now = new Date();
    const datePart = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('');
    const randomPart = String(Math.floor(Math.random() * 9000) + 1000);
    return `IOT${datePart}${randomPart}`;
}

let hasLoggedGeneratedAdminPassword = false;

function buildAdminPassword(existingPassword = '') {
    if (ADMIN_PASSWORD) {
        return normalizeStoredPassword(ADMIN_PASSWORD);
    }

    const normalizedExistingPassword = normalizeStoredPassword(existingPassword);
    if (normalizedExistingPassword) {
        return normalizedExistingPassword;
    }

    const temporaryPassword = createTemporaryPassword();
    if (!hasLoggedGeneratedAdminPassword) {
        hasLoggedGeneratedAdminPassword = true;
        console.warn(`[store] ADMIN_PASSWORD 未设置，已为初始管理员生成一次性密码: ${temporaryPassword}`);
    }
    return normalizeStoredPassword(temporaryPassword);
}

function buildDefaultAdmin(existingAdmin = {}) {
    return normalizeUser({
        ...existingAdmin,
        id: toInteger(existingAdmin.id, Number(ADMIN_PHONE) || Date.now()),
        phone: ADMIN_PHONE,
        username: ADMIN_USERNAME,
        password: buildAdminPassword(existingAdmin.password),
        nickname: existingAdmin.nickname || 'Admin',
        role: 'admin',
    });
}

const DEFAULT_LOGISTICS_SETTINGS = {
    sender_no: process.env.EMS_SENDER_NO || '',
    authorization: process.env.EMS_AUTHORIZATION || '',
    sign_key: process.env.EMS_SIGN_KEY || process.env.EMS_SIGN_KEY_BASE64 || '',
    sender_name: '',
    sender_phone: '',
    sender_post_code: '',
    sender_prov: '',
    sender_city: '',
    sender_county: '',
    sender_address: '',
    biz_product_no: process.env.EMS_BIZ_PRODUCT_NO || '10',
    biz_product_id: process.env.EMS_BIZ_PRODUCT_ID || '',
    contents_attribute: process.env.EMS_CONTENTS_ATTRIBUTE || '3',
    default_weight_grams: process.env.EMS_DEFAULT_WEIGHT_GRAMS || '500',
    label_type: process.env.EMS_LABEL_TYPE || '129',
    preferred_print_mode: process.platform === 'win32' ? 'auto' : 'browser',
    preferred_printer: process.env.EMS_PRINTER_NAME || '',
    sumatra_path: process.env.EMS_SUMATRA_PATH || '',
    paper_name: '100x180mm',
    paper_width_mm: '100',
    paper_height_mm: '180',
    auto_sync_tracks: true,
    track_auto_sync_interval_hours: 4,
    track_stale_hours: 24,
};

const DEFAULT_SETTINGS = loadTemplateJson(SETTINGS_FILE, {
    store_name: '物联卡设备配卡商城',
    hero_badge: '先看套餐资费，再选购买设备配卡或寄设备配卡',
    hero_title: '只做设备配卡方案，不单独卖卡',
    hero_subtitle: '用户先看套餐图片，再决定购买设备配卡还是寄设备来配卡。支付采用微信或支付宝收款码，付款后上传截图，人工审核后安排处理。',
    service_phone: '400-8822-668',
    service_wechat: 'jinglian-iot',
    business_hours: '周一到周日 09:00 - 22:00',
    shop_receiving_name: '配卡仓',
    shop_receiving_phone: '17724888898',
    shop_receiving_address: '请在后台设置寄设备收件地址',
    announcement: '全站采用人工审核收款。下单后请先扫码付款，再上传付款截图。',
    payment_notice: '暂不接官方支付接口，请按页面展示的收款码付款并上传清晰截图。',
    shipping_notice: '寄设备配卡请填写设备品牌、型号、情况说明、寄出单号和回寄地址。',
    aftersales_notice: '设备到件后会安排配卡、测试与发货或回寄。',
    delivery_notice: '付款审核通过后会尽快安排处理，实际时效以订单状态为准。',
    region_notice: '不同地区、设备和网络环境会影响实际体验，套餐细则以图片说明为准。',
    ship_service_title: '寄设备配卡服务费',
    ship_service_fee: 49,
    buy_flow_steps: ['先看套餐资费图', '选择设备和套餐', '扫码付款并上传截图', '审核后发货'],
    ship_flow_steps: ['先看套餐资费图', '填写寄送设备信息', '扫码付款并上传截图', '到件后配卡并回寄'],
    ship_checklist: ['确认设备可开机', '设备卡槽由我们到件后统一打胶处理', '寄出后填写快递单号', '特殊配件请一并寄出'],
    purchase_rules: [
        '物联卡不单独出售，只提供设备配卡服务',
        '套餐资费与地区限制以图片内容为准',
        '付款后必须上传截图才会进入人工审核',
        '如遇兼容性问题会由客服联系确认',
    ],
    faq_items: [
        '套餐是单独卖卡吗？|不是，只做设备配卡和寄设备配卡服务。',
        '可以自己寄设备过来配卡吗？|可以，选择寄设备配卡后按要求填写信息即可。',
        '为什么需要上传付款截图？|当前未接官方支付接口，需要人工核对收款。',
    ],
    admin_note_templates: [
        '已审核通过，等待后续处理',
        '已安排配卡测试，请耐心等待',
        '请补充更清晰的付款截图',
        '设备已到件，正在处理',
        '已发货，请留意快递信息',
    ],
    share_title: '物联卡设备配卡商城',
    share_description: '先看套餐资费图，再选择购买设备配卡或寄设备配卡，付款后上传截图等待人工审核。',
    payment_qrs: { wechat: null, alipay: null },
    logistics: DEFAULT_LOGISTICS_SETTINGS,
});

const DEFAULT_PLANS = loadTemplateJson(PLANS_FILE, [
    {
        id: 2001,
        slug: 'default-plan-1',
        name: '全国通用套餐方案',
        carrier: '中国移动',
        network_type: '4G/5G',
        monthly_data: '以图片为准',
        monthly_price: 0,
        setup_price: 39,
        badge: '热销套餐',
        best_for: '适合随身 WiFi 与 CPE 设备配卡',
        coverage: '套餐细则与适用范围以图片为准',
        purchase_note: '物联卡不单独售卖，仅提供设备配卡服务',
        description: '<p>首页重点展示套餐图，文字仅作补充说明。</p>',
        features: ['先看套餐图', '再选设备或寄设备配卡', '支持人工审核收款'],
        tags: ['全国', '热销'],
        cover_image: null,
        featured: true,
        status: 'active',
        hot_rank: 10,
        sort_order: 1,
    },
]);

const DEFAULT_DEVICES = loadTemplateJson(DEVICES_FILE, [
    {
        id: 3001,
        slug: 'default-device-1',
        name: '4G 随身 WiFi 标准版',
        model: 'JL-MIFI-4',
        category: 'portable_wifi',
        network_type: '4G',
        price: 199,
        original_price: 269,
        stock: 10,
        badge: '主推设备',
        short_description: '适合移动办公和日常热点使用。',
        description: '<p>设备与套餐绑定销售，不单独卖卡。</p>',
        features: ['便携小巧', '适合日常热点', '支持配卡销售'],
        tags: ['随身 WiFi', '4G'],
        cover_image: null,
        featured: true,
        status: 'active',
        hot_rank: 10,
        sort_order: 1,
    },
]);

function normalizePlan(rawPlan = {}) {
    return {
        id: toInteger(rawPlan.id, Date.now()),
        slug: makeSlug(rawPlan.slug || rawPlan.name || `plan-${Date.now()}`),
        name: safeText(rawPlan.name),
        carrier: safeText(rawPlan.carrier),
        network_type: safeText(rawPlan.network_type),
        monthly_data: safeText(rawPlan.monthly_data),
        monthly_price: Math.max(0, toNumber(rawPlan.monthly_price, 0)),
        setup_price: Math.max(0, toNumber(rawPlan.setup_price, 0)),
        badge: safeText(rawPlan.badge),
        best_for: safeText(rawPlan.best_for),
        coverage: safeText(rawPlan.coverage),
        purchase_note: safeText(rawPlan.purchase_note),
        description: safeHtml(rawPlan.description),
        features: toStringArray(rawPlan.features),
        tags: toStringArray(rawPlan.tags),
        cover_image: rawPlan.cover_image ? safeText(rawPlan.cover_image) : null,
        featured: toBoolean(rawPlan.featured),
        status: rawPlan.status === 'inactive' ? 'inactive' : 'active',
        hot_rank: Math.max(0, toInteger(rawPlan.hot_rank, rawPlan.featured ? 10 : 0)),
        sort_order: toInteger(rawPlan.sort_order, 999),
    };
}

function normalizeDevice(rawDevice = {}) {
    const category = DEVICE_CATEGORIES.includes(rawDevice.category) ? rawDevice.category : 'portable_wifi';
    return {
        id: toInteger(rawDevice.id, Date.now()),
        slug: makeSlug(rawDevice.slug || rawDevice.name || `device-${Date.now()}`),
        name: safeText(rawDevice.name),
        model: safeText(rawDevice.model),
        category,
        network_type: safeText(rawDevice.network_type),
        price: Math.max(0, toNumber(rawDevice.price, 0)),
        original_price: Math.max(0, toNumber(rawDevice.original_price, 0)),
        stock: Math.max(0, toInteger(rawDevice.stock, 0)),
        badge: safeText(rawDevice.badge),
        short_description: safeText(rawDevice.short_description),
        description: safeHtml(rawDevice.description),
        features: toStringArray(rawDevice.features),
        tags: toStringArray(rawDevice.tags),
        compatible_plan_ids: Array.from(
            new Set(
                (Array.isArray(rawDevice.compatible_plan_ids)
                    ? rawDevice.compatible_plan_ids
                    : toStringArray(rawDevice.compatible_plan_ids)
                )
                    .map((item) => toInteger(item, 0))
                    .filter((item) => item > 0),
            ),
        ),
        cover_image: rawDevice.cover_image ? safeText(rawDevice.cover_image) : null,
        featured: toBoolean(rawDevice.featured),
        status: rawDevice.status === 'inactive' ? 'inactive' : 'active',
        hot_rank: Math.max(0, toInteger(rawDevice.hot_rank, rawDevice.featured ? 10 : 0)),
        sort_order: toInteger(rawDevice.sort_order, 999),
    };
}

function normalizeSettings(rawSettings = {}) {
    return {
        store_name: safeText(rawSettings.store_name, DEFAULT_SETTINGS.store_name),
        hero_badge: safeText(rawSettings.hero_badge, DEFAULT_SETTINGS.hero_badge),
        hero_title: safeText(rawSettings.hero_title, DEFAULT_SETTINGS.hero_title),
        hero_subtitle: safeText(rawSettings.hero_subtitle, DEFAULT_SETTINGS.hero_subtitle),
        service_phone: safeText(rawSettings.service_phone, DEFAULT_SETTINGS.service_phone),
        service_wechat: safeText(rawSettings.service_wechat, DEFAULT_SETTINGS.service_wechat),
        business_hours: safeText(rawSettings.business_hours, DEFAULT_SETTINGS.business_hours),
        shop_receiving_name: safeText(rawSettings.shop_receiving_name, DEFAULT_SETTINGS.shop_receiving_name),
        shop_receiving_phone: safeText(rawSettings.shop_receiving_phone, DEFAULT_SETTINGS.shop_receiving_phone),
        shop_receiving_address: safeText(rawSettings.shop_receiving_address, DEFAULT_SETTINGS.shop_receiving_address),
        announcement: safeText(rawSettings.announcement, DEFAULT_SETTINGS.announcement),
        payment_notice: safeText(rawSettings.payment_notice, DEFAULT_SETTINGS.payment_notice),
        shipping_notice: safeText(rawSettings.shipping_notice, DEFAULT_SETTINGS.shipping_notice),
        aftersales_notice: safeText(rawSettings.aftersales_notice, DEFAULT_SETTINGS.aftersales_notice),
        delivery_notice: safeText(rawSettings.delivery_notice, DEFAULT_SETTINGS.delivery_notice),
        region_notice: safeText(rawSettings.region_notice, DEFAULT_SETTINGS.region_notice),
        ship_service_title: safeText(rawSettings.ship_service_title, DEFAULT_SETTINGS.ship_service_title),
        ship_service_fee: Math.max(0, toNumber(rawSettings.ship_service_fee, DEFAULT_SETTINGS.ship_service_fee)),
        buy_flow_steps: toStringArray(rawSettings.buy_flow_steps).length
            ? toStringArray(rawSettings.buy_flow_steps)
            : DEFAULT_SETTINGS.buy_flow_steps,
        ship_flow_steps: toStringArray(rawSettings.ship_flow_steps).length
            ? toStringArray(rawSettings.ship_flow_steps)
            : DEFAULT_SETTINGS.ship_flow_steps,
        ship_checklist: toStringArray(rawSettings.ship_checklist).length
            ? toStringArray(rawSettings.ship_checklist)
            : DEFAULT_SETTINGS.ship_checklist,
        purchase_rules: toStringArray(rawSettings.purchase_rules).length
            ? toStringArray(rawSettings.purchase_rules)
            : DEFAULT_SETTINGS.purchase_rules,
        faq_items: toStringArray(rawSettings.faq_items).length ? toStringArray(rawSettings.faq_items) : DEFAULT_SETTINGS.faq_items,
        admin_note_templates: toStringArray(rawSettings.admin_note_templates).length
            ? toStringArray(rawSettings.admin_note_templates)
            : DEFAULT_SETTINGS.admin_note_templates,
        share_title: safeText(rawSettings.share_title, DEFAULT_SETTINGS.share_title),
        share_description: safeText(rawSettings.share_description, DEFAULT_SETTINGS.share_description),
        payment_qrs: {
            wechat: rawSettings.payment_qrs?.wechat ? safeText(rawSettings.payment_qrs.wechat) : null,
            alipay: rawSettings.payment_qrs?.alipay ? safeText(rawSettings.payment_qrs.alipay) : null,
        },
        logistics: normalizeLogisticsSettings(rawSettings.logistics),
    };
}

function normalizeUser(rawUser = {}) {
    const role = rawUser.role === 'admin' ? 'admin' : 'user';
    return {
        id: toInteger(rawUser.id, Date.now()),
        phone: safeText(rawUser.phone),
        username: safeText(rawUser.username),
        password: normalizeStoredPassword(rawUser.password),
        nickname: safeText(rawUser.nickname || `用户${safeText(rawUser.phone).slice(-4)}`),
        role,
    };
}

function normalizeEmsAddressCandidate(rawCandidate = {}) {
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

function normalizeEmsParty(rawParty = {}) {
    return {
        name: safeText(rawParty.name),
        mobile: safeText(rawParty.mobile),
        phone: safeText(rawParty.phone),
        post_code: safeText(rawParty.post_code ?? rawParty.postCode),
        prov: safeText(rawParty.prov),
        city: safeText(rawParty.city),
        county: safeText(rawParty.county),
        address: safeText(rawParty.address),
    };
}

function normalizeEmsTrackItem(rawTrack = {}) {
    return {
        waybill_no: safeText(rawTrack.waybill_no ?? rawTrack.waybillNo),
        op_time: safeText(rawTrack.op_time ?? rawTrack.opTime),
        op_code: safeText(rawTrack.op_code ?? rawTrack.opCode),
        op_name: safeText(rawTrack.op_name ?? rawTrack.opName),
        op_desc: safeText(rawTrack.op_desc ?? rawTrack.opDesc),
        op_org_prov_name: safeText(rawTrack.op_org_prov_name ?? rawTrack.opOrgProvName),
        op_org_city: safeText(rawTrack.op_org_city ?? rawTrack.opOrgCity),
        op_org_code: safeText(rawTrack.op_org_code ?? rawTrack.opOrgCode),
        op_org_name: safeText(rawTrack.op_org_name ?? rawTrack.opOrgName),
        operator_no: safeText(rawTrack.operator_no ?? rawTrack.operatorNo),
        operator_name: safeText(rawTrack.operator_name ?? rawTrack.operatorName),
        deliver_code: safeText(rawTrack.deliver_code ?? rawTrack.deliverCode),
        attempt_delivery_code: safeText(rawTrack.attempt_delivery_code ?? rawTrack.attemptDeliveryCode),
        product_name: safeText(rawTrack.product_name ?? rawTrack.productName),
    };
}

function normalizeLogisticsSettings(rawLogistics = {}) {
    return {
        sender_no: safeText(rawLogistics.sender_no ?? rawLogistics.senderNo, DEFAULT_LOGISTICS_SETTINGS.sender_no),
        authorization: safeText(rawLogistics.authorization, DEFAULT_LOGISTICS_SETTINGS.authorization),
        sign_key: safeText(rawLogistics.sign_key ?? rawLogistics.signKey, DEFAULT_LOGISTICS_SETTINGS.sign_key),
        sender_name: safeText(rawLogistics.sender_name ?? rawLogistics.senderName, DEFAULT_LOGISTICS_SETTINGS.sender_name),
        sender_phone: safeText(rawLogistics.sender_phone ?? rawLogistics.senderPhone, DEFAULT_LOGISTICS_SETTINGS.sender_phone),
        sender_post_code: safeText(
            rawLogistics.sender_post_code ?? rawLogistics.senderPostCode,
            DEFAULT_LOGISTICS_SETTINGS.sender_post_code,
        ),
        sender_prov: safeText(rawLogistics.sender_prov ?? rawLogistics.senderProv, DEFAULT_LOGISTICS_SETTINGS.sender_prov),
        sender_city: safeText(rawLogistics.sender_city ?? rawLogistics.senderCity, DEFAULT_LOGISTICS_SETTINGS.sender_city),
        sender_county: safeText(rawLogistics.sender_county ?? rawLogistics.senderCounty, DEFAULT_LOGISTICS_SETTINGS.sender_county),
        sender_address: safeText(
            rawLogistics.sender_address ?? rawLogistics.senderAddress,
            DEFAULT_LOGISTICS_SETTINGS.sender_address,
        ),
        biz_product_no: safeText(
            rawLogistics.biz_product_no ?? rawLogistics.bizProductNo,
            DEFAULT_LOGISTICS_SETTINGS.biz_product_no,
        ),
        biz_product_id: safeText(
            rawLogistics.biz_product_id ?? rawLogistics.bizProductId,
            DEFAULT_LOGISTICS_SETTINGS.biz_product_id,
        ),
        contents_attribute: safeText(
            rawLogistics.contents_attribute ?? rawLogistics.contentsAttribute,
            DEFAULT_LOGISTICS_SETTINGS.contents_attribute,
        ),
        default_weight_grams: safeText(
            rawLogistics.default_weight_grams ?? rawLogistics.defaultWeightGrams,
            DEFAULT_LOGISTICS_SETTINGS.default_weight_grams,
        ),
        label_type: safeText(rawLogistics.label_type ?? rawLogistics.labelType, DEFAULT_LOGISTICS_SETTINGS.label_type),
        preferred_print_mode: safeText(
            rawLogistics.preferred_print_mode ?? rawLogistics.preferredPrintMode,
            DEFAULT_LOGISTICS_SETTINGS.preferred_print_mode,
        ).toLowerCase(),
        preferred_printer: safeText(
            rawLogistics.preferred_printer ?? rawLogistics.preferredPrinter,
            DEFAULT_LOGISTICS_SETTINGS.preferred_printer,
        ),
        sumatra_path: safeText(rawLogistics.sumatra_path ?? rawLogistics.sumatraPath, DEFAULT_LOGISTICS_SETTINGS.sumatra_path),
        paper_name: safeText(rawLogistics.paper_name ?? rawLogistics.paperName, DEFAULT_LOGISTICS_SETTINGS.paper_name),
        paper_width_mm: safeText(
            rawLogistics.paper_width_mm ?? rawLogistics.paperWidthMm,
            DEFAULT_LOGISTICS_SETTINGS.paper_width_mm,
        ),
        paper_height_mm: safeText(
            rawLogistics.paper_height_mm ?? rawLogistics.paperHeightMm,
            DEFAULT_LOGISTICS_SETTINGS.paper_height_mm,
        ),
        auto_sync_tracks: toBoolean(
            rawLogistics.auto_sync_tracks ?? rawLogistics.autoSyncTracks,
            DEFAULT_LOGISTICS_SETTINGS.auto_sync_tracks,
        ),
        track_auto_sync_interval_hours: Math.max(
            1,
            toInteger(
                rawLogistics.track_auto_sync_interval_hours ?? rawLogistics.trackAutoSyncIntervalHours,
                DEFAULT_LOGISTICS_SETTINGS.track_auto_sync_interval_hours,
            ),
        ),
        track_stale_hours: Math.max(
            1,
            toInteger(rawLogistics.track_stale_hours ?? rawLogistics.trackStaleHours, DEFAULT_LOGISTICS_SETTINGS.track_stale_hours),
        ),
    };
}

function normalizeEmsApiLog(rawLog = {}) {
    return {
        action: safeText(rawLog.action),
        status: safeText(rawLog.status, 'success'),
        time: rawLog.time || new Date().toISOString(),
        ret_code: safeText(rawLog.ret_code ?? rawLog.retCode),
        ret_msg: safeText(rawLog.ret_msg ?? rawLog.retMsg),
        serial_no: safeText(rawLog.serial_no ?? rawLog.serialNo),
        request: rawLog.request && typeof rawLog.request === 'object' ? rawLog.request : null,
        response: rawLog.response && typeof rawLog.response === 'object' ? rawLog.response : null,
    };
}

function buildDefaultEmsWorkflowTaskSteps() {
    return {
        parse: { status: 'idle', message: '', updated_at: null },
        validate: { status: 'idle', message: '', updated_at: null },
        create: { status: 'idle', message: '', updated_at: null },
        label: { status: 'idle', message: '', updated_at: null },
        print: { status: 'idle', message: '', updated_at: null },
        track: { status: 'idle', message: '', updated_at: null },
    };
}

function normalizeEmsWorkflowTaskStep(rawStep = {}, fallbackValue = {}) {
    const source = rawStep && typeof rawStep === 'object' ? rawStep : {};
    return {
        status: safeText(source.status, fallbackValue.status || 'idle'),
        message: safeText(source.message, fallbackValue.message),
        updated_at: source.updated_at || source.updatedAt || fallbackValue.updated_at || fallbackValue.updatedAt || null,
    };
}

function normalizeEmsWorkflowTask(rawTask = {}) {
    const source = rawTask && typeof rawTask === 'object' ? rawTask : {};
    const fallbackSteps = buildDefaultEmsWorkflowTaskSteps();
    const rawSteps = source.steps && typeof source.steps === 'object' ? source.steps : {};

    return {
        id: safeText(source.id),
        mode: safeText(source.mode, 'single'),
        status: safeText(source.status, 'idle'),
        current_step: safeText(source.current_step ?? source.currentStep),
        error: safeText(source.error),
        include_track: toBoolean(source.include_track ?? source.includeTrack, true),
        initiator_id: toInteger(source.initiator_id ?? source.initiatorId, 0),
        initiator_role: safeText(source.initiator_role ?? source.initiatorRole),
        enqueued_at: source.enqueued_at || source.enqueuedAt || null,
        started_at: source.started_at || source.startedAt || null,
        finished_at: source.finished_at || source.finishedAt || null,
        updated_at: source.updated_at || source.updatedAt || null,
        steps: Object.keys(fallbackSteps).reduce((result, key) => {
            result[key] = normalizeEmsWorkflowTaskStep(rawSteps[key], fallbackSteps[key]);
            return result;
        }, {}),
    };
}

function normalizeEmsState(rawEms = {}) {
    const reachable =
        rawEms.reachable === true || rawEms.reachable === false
            ? rawEms.reachable
            : rawEms.reachable === 'true'
              ? true
              : rawEms.reachable === 'false'
                ? false
                : null;

    return {
        address_parse_source: safeText(rawEms.address_parse_source ?? rawEms.addressParseSource),
        address_parse_candidates: Array.isArray(rawEms.address_parse_candidates ?? rawEms.addressParseCandidates)
            ? (rawEms.address_parse_candidates ?? rawEms.addressParseCandidates).map(normalizeEmsAddressCandidate)
            : [],
        receiver: normalizeEmsParty(rawEms.receiver),
        sender: normalizeEmsParty(rawEms.sender),
        ecommerce_user_id: safeText(rawEms.ecommerce_user_id ?? rawEms.ecommerceUserId),
        logistics_order_no: safeText(rawEms.logistics_order_no ?? rawEms.logisticsOrderNo),
        waybill_no: safeText(rawEms.waybill_no ?? rawEms.waybillNo),
        route_code: safeText(rawEms.route_code ?? rawEms.routeCode),
        package_code: safeText(rawEms.package_code ?? rawEms.packageCode),
        package_code_name: safeText(rawEms.package_code_name ?? rawEms.packageCodeName),
        mark_destination_code: safeText(rawEms.mark_destination_code ?? rawEms.markDestinationCode),
        mark_destination_name: safeText(rawEms.mark_destination_name ?? rawEms.markDestinationName),
        biz_product_no: safeText(rawEms.biz_product_no ?? rawEms.bizProductNo, process.env.EMS_BIZ_PRODUCT_NO || '10'),
        biz_product_id: safeText(rawEms.biz_product_id ?? rawEms.bizProductId),
        contents_attribute: safeText(
            rawEms.contents_attribute ?? rawEms.contentsAttribute,
            process.env.EMS_CONTENTS_ATTRIBUTE || '3',
        ),
        package_weight: safeText(rawEms.package_weight ?? rawEms.packageWeight, process.env.EMS_DEFAULT_WEIGHT_GRAMS || '500'),
        label_type: safeText(rawEms.label_type ?? rawEms.labelType, process.env.EMS_LABEL_TYPE || '129'),
        label_url: safeText(rawEms.label_url ?? rawEms.labelUrl),
        label_file: safeText(rawEms.label_file ?? rawEms.labelFile),
        label_generated_at: rawEms.label_generated_at || rawEms.labelGeneratedAt || null,
        address_parsed_at: rawEms.address_parsed_at || rawEms.addressParsedAt || null,
        waybill_created_at: rawEms.waybill_created_at || rawEms.waybillCreatedAt || null,
        label_requested_at: rawEms.label_requested_at || rawEms.labelRequestedAt || null,
        print_status: safeText(rawEms.print_status ?? rawEms.printStatus),
        print_mode: safeText(rawEms.print_mode ?? rawEms.printMode),
        print_message: safeText(rawEms.print_message ?? rawEms.printMessage),
        print_attempted_at: rawEms.print_attempted_at || rawEms.printAttemptedAt || null,
        printed_at: rawEms.printed_at || rawEms.printedAt || null,
        last_serial_no: safeText(rawEms.last_serial_no ?? rawEms.lastSerialNo),
        last_error: safeText(rawEms.last_error ?? rawEms.lastError),
        last_action: safeText(rawEms.last_action ?? rawEms.lastAction),
        last_action_at: rawEms.last_action_at || rawEms.lastActionAt || null,
        reachable,
        reachable_message: safeText(rawEms.reachable_message ?? rawEms.reachableMessage),
        reachable_checked_at: rawEms.reachable_checked_at || rawEms.reachableCheckedAt || null,
        tracking_direction: safeText(rawEms.tracking_direction ?? rawEms.trackingDirection, '0'),
        track_summary: safeText(rawEms.track_summary ?? rawEms.trackSummary),
        track_items: Array.isArray(rawEms.track_items ?? rawEms.trackItems)
            ? (rawEms.track_items ?? rawEms.trackItems).map(normalizeEmsTrackItem)
            : [],
        last_track_sync_at: rawEms.last_track_sync_at || rawEms.lastTrackSyncAt || null,
        auto_track_sync_failure_streak: Math.max(
            0,
            toInteger(rawEms.auto_track_sync_failure_streak ?? rawEms.autoTrackSyncFailureStreak, 0),
        ),
        auto_track_sync_last_failed_at:
            rawEms.auto_track_sync_last_failed_at || rawEms.autoTrackSyncLastFailedAt || null,
        auto_track_sync_last_success_at:
            rawEms.auto_track_sync_last_success_at || rawEms.autoTrackSyncLastSuccessAt || null,
        auto_track_sync_last_error: safeText(rawEms.auto_track_sync_last_error ?? rawEms.autoTrackSyncLastError),
        api_logs: Array.isArray(rawEms.api_logs ?? rawEms.apiLogs)
            ? (rawEms.api_logs ?? rawEms.apiLogs).map(normalizeEmsApiLog)
            : [],
        workflow_task:
            rawEms.workflow_task || rawEms.workflowTask ? normalizeEmsWorkflowTask(rawEms.workflow_task ?? rawEms.workflowTask) : null,
        order_payload: rawEms.order_payload && typeof rawEms.order_payload === 'object' ? rawEms.order_payload : rawEms.orderPayload || null,
        order_response:
            rawEms.order_response && typeof rawEms.order_response === 'object' ? rawEms.order_response : rawEms.orderResponse || null,
        label_payload: rawEms.label_payload && typeof rawEms.label_payload === 'object' ? rawEms.label_payload : rawEms.labelPayload || null,
        label_response:
            rawEms.label_response && typeof rawEms.label_response === 'object' ? rawEms.label_response : rawEms.labelResponse || null,
        print_payload: rawEms.print_payload && typeof rawEms.print_payload === 'object' ? rawEms.print_payload : rawEms.printPayload || null,
        print_response:
            rawEms.print_response && typeof rawEms.print_response === 'object' ? rawEms.print_response : rawEms.printResponse || null,
        track_payload: rawEms.track_payload && typeof rawEms.track_payload === 'object' ? rawEms.track_payload : rawEms.trackPayload || null,
        track_response:
            rawEms.track_response && typeof rawEms.track_response === 'object' ? rawEms.track_response : rawEms.trackResponse || null,
        parse_payload: rawEms.parse_payload && typeof rawEms.parse_payload === 'object' ? rawEms.parse_payload : rawEms.parsePayload || null,
        parse_response:
            rawEms.parse_response && typeof rawEms.parse_response === 'object' ? rawEms.parse_response : rawEms.parseResponse || null,
        validate_payload:
            rawEms.validate_payload && typeof rawEms.validate_payload === 'object'
                ? rawEms.validate_payload
                : rawEms.validatePayload || null,
        validate_response:
            rawEms.validate_response && typeof rawEms.validate_response === 'object'
                ? rawEms.validate_response
                : rawEms.validateResponse || null,
    };
}

function normalizeOrder(rawOrder = {}) {
    const flowType = FLOW_TYPES.includes(rawOrder.flow_type) ? rawOrder.flow_type : 'buy_device';
    const status = ORDER_STATUSES.includes(rawOrder.status) ? rawOrder.status : 'pending_payment_review';
    return {
        id: toInteger(rawOrder.id, Date.now()),
        order_no: safeText(rawOrder.order_no, makeOrderNo()),
        user_id: toInteger(rawOrder.user_id, 0),
        flow_type: flowType,
        status,
        plan_id: toInteger(rawOrder.plan_id, 0),
        device_id: rawOrder.device_id ? toInteger(rawOrder.device_id, 0) : null,
        quantity: Math.max(1, toInteger(rawOrder.quantity, 1)),
        plan_snapshot: {
            name: safeText(rawOrder.plan_snapshot?.name),
            monthly_data: safeText(rawOrder.plan_snapshot?.monthly_data),
            monthly_price: Math.max(0, toNumber(rawOrder.plan_snapshot?.monthly_price, 0)),
            setup_price: Math.max(0, toNumber(rawOrder.plan_snapshot?.setup_price, 0)),
            carrier: safeText(rawOrder.plan_snapshot?.carrier),
            network_type: safeText(rawOrder.plan_snapshot?.network_type),
        },
        device_snapshot: rawOrder.device_snapshot
            ? {
                  name: safeText(rawOrder.device_snapshot?.name),
                  model: safeText(rawOrder.device_snapshot?.model),
                  category: safeText(rawOrder.device_snapshot?.category),
                  price: Math.max(0, toNumber(rawOrder.device_snapshot?.price, 0)),
                  network_type: safeText(rawOrder.device_snapshot?.network_type),
              }
            : null,
        pricing: {
            plan_amount: Math.max(0, toNumber(rawOrder.pricing?.plan_amount, 0)),
            device_amount: Math.max(0, toNumber(rawOrder.pricing?.device_amount, 0)),
            service_amount: Math.max(0, toNumber(rawOrder.pricing?.service_amount, 0)),
            total_amount: Math.max(0, toNumber(rawOrder.pricing?.total_amount ?? rawOrder.total_amount, 0)),
        },
        payment_method: rawOrder.payment_method === 'alipay' ? 'alipay' : 'wechat',
        payment_proof: rawOrder.payment_proof ? safeText(rawOrder.payment_proof) : null,
        customer_name: safeText(rawOrder.customer_name),
        customer_phone: safeText(rawOrder.customer_phone),
        shipping_address: safeText(rawOrder.shipping_address),
        remark: safeText(rawOrder.remark),
        device_submission: {
            brand: safeText(rawOrder.device_submission?.brand),
            model: safeText(rawOrder.device_submission?.model),
            can_insert_card: safeText(rawOrder.device_submission?.can_insert_card),
            remove_control: safeText(rawOrder.device_submission?.remove_control),
            condition: safeText(rawOrder.device_submission?.condition),
            notes: safeText(rawOrder.device_submission?.notes),
            outbound_tracking: safeText(rawOrder.device_submission?.outbound_tracking),
        },
        admin_note: safeText(rawOrder.admin_note),
        internal_tags: toStringArray(rawOrder.internal_tags),
        user_notice_center: normalizeUserNoticeCenter(rawOrder.user_notice_center ?? rawOrder.userNoticeCenter),
        processing_logs: Array.isArray(rawOrder.processing_logs)
            ? rawOrder.processing_logs.map((item) => ({
                  time: item?.time || new Date().toISOString(),
                  operator_id: toInteger(item?.operator_id, 0),
                  operator_role: safeText(item?.operator_role),
                  action: safeText(item?.action),
                  content: safeText(item?.content),
              }))
            : [],
        logistics_company: safeText(rawOrder.logistics_company),
        merchant_tracking_number: safeText(rawOrder.merchant_tracking_number),
        ems: normalizeEmsState(rawOrder.ems),
        created_at: rawOrder.created_at || new Date().toISOString(),
        reviewed_at: rawOrder.reviewed_at || null,
        shipped_at: rawOrder.shipped_at || null,
        completed_at: rawOrder.completed_at || null,
        cancelled_at: rawOrder.cancelled_at || null,
    };
}

function buildOrderSummary(order) {
    const planName = order.plan_snapshot?.name || '未选择套餐';
    if (order.flow_type === 'ship_device') {
        const modelText = [order.device_submission?.brand, order.device_submission?.model].filter(Boolean).join(' ');
        return `${planName} / 寄设备配卡${modelText ? ` / ${modelText}` : ''}`;
    }
    const deviceName = order.device_snapshot?.name || '未选择设备';
    return `${deviceName} x${order.quantity} / ${planName}`;
}

function publicPathToDisk(publicPath) {
    if (!publicPath) return null;
    return path.join(
        ROOT_DIR,
        String(publicPath)
            .replace(/^[/\\]+/, '')
            .replace(/\//g, path.sep),
    );
}

function serializePayload(value) {
    return JSON.stringify(value);
}

function parsePayload(payload, fallbackValue) {
    try {
        return JSON.parse(payload);
    } catch (error) {
        return fallbackValue;
    }
}

function formatSqlDateTime(dateValue) {
    const source = dateValue ? new Date(dateValue) : new Date();
    const nextDate = Number.isNaN(source.getTime()) ? new Date() : source;
    const year = nextDate.getFullYear();
    const month = String(nextDate.getMonth() + 1).padStart(2, '0');
    const day = String(nextDate.getDate()).padStart(2, '0');
    const hours = String(nextDate.getHours()).padStart(2, '0');
    const minutes = String(nextDate.getMinutes()).padStart(2, '0');
    const seconds = String(nextDate.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function sqlBoolean(value) {
    return value ? 1 : 0;
}

const COLLECTION_CONFIG = {
    users: {
        tableName: 'users',
        filePath: USERS_FILE,
        defaultValue: () => [buildDefaultAdmin()],
        normalize: normalizeUser,
        orderBy: 'id ASC',
        sort: (left, right) => left.id - right.id,
        columns: ['id', 'phone', 'username', 'password', 'nickname', 'role', 'payload'],
        toRow: (user) => [
            user.id,
            user.phone || null,
            user.username || null,
            user.password || '',
            user.nickname || '',
            user.role,
            serializePayload(user),
        ],
    },
    plans: {
        tableName: 'plans',
        filePath: PLANS_FILE,
        defaultValue: () => DEFAULT_PLANS,
        normalize: normalizePlan,
        orderBy: 'sort_order ASC, id DESC',
        sort: (left, right) => left.sort_order - right.sort_order || right.id - left.id,
        columns: ['id', 'slug', 'name', 'status', 'featured', 'hot_rank', 'sort_order', 'payload'],
        toRow: (plan) => [
            plan.id,
            plan.slug || null,
            plan.name,
            plan.status,
            sqlBoolean(plan.featured),
            plan.hot_rank,
            plan.sort_order,
            serializePayload(plan),
        ],
    },
    devices: {
        tableName: 'devices',
        filePath: DEVICES_FILE,
        defaultValue: () => DEFAULT_DEVICES,
        normalize: normalizeDevice,
        orderBy: 'sort_order ASC, id DESC',
        sort: (left, right) => left.sort_order - right.sort_order || right.id - left.id,
        columns: ['id', 'slug', 'name', 'status', 'featured', 'hot_rank', 'sort_order', 'stock', 'payload'],
        toRow: (device) => [
            device.id,
            device.slug || null,
            device.name,
            device.status,
            sqlBoolean(device.featured),
            device.hot_rank,
            device.sort_order,
            device.stock,
            serializePayload(device),
        ],
    },
    orders: {
        tableName: 'orders',
        filePath: ORDERS_FILE,
        defaultValue: () => [],
        normalize: normalizeOrder,
        orderBy: 'created_at ASC, id ASC',
        sort: (left, right) => new Date(left.created_at) - new Date(right.created_at) || left.id - right.id,
        columns: ['id', 'order_no', 'user_id', 'status', 'flow_type', 'created_at', 'payload'],
        toRow: (order) => [
            order.id,
            order.order_no,
            order.user_id,
            order.status,
            order.flow_type,
            formatSqlDateTime(order.created_at),
            serializePayload(order),
        ],
    },
};

function writeJson(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function normalizeCollection(config, records = []) {
    return [...records].map(config.normalize).sort(config.sort);
}

function readJsonCollection(config) {
    const fallbackValue = fs.existsSync(config.filePath) ? [] : config.defaultValue();
    const source = readJson(config.filePath, fallbackValue);
    return normalizeCollection(config, Array.isArray(source) ? source : fallbackValue);
}

function replaceJsonCollection(config, records = []) {
    const nextRecords = normalizeCollection(config, records);
    writeJson(config.filePath, nextRecords);
    return nextRecords;
}

function upsertJsonCollection(config, records = []) {
    const nextRecords = normalizeCollection(config, records);
    if (!nextRecords.length) {
        return readJsonCollection(config);
    }

    const mergedRecords = new Map(readJsonCollection(config).map((item) => [item.id, item]));
    nextRecords.forEach((item) => {
        mergedRecords.set(item.id, item);
    });

    const sortedRecords = [...mergedRecords.values()].sort(config.sort);
    writeJson(config.filePath, sortedRecords);
    return sortedRecords;
}

function deleteJsonCollection(config, ids = []) {
    const deleteIds = new Set(ids.map((item) => toInteger(item, 0)).filter((item) => item > 0));
    if (!deleteIds.size) {
        return readJsonCollection(config);
    }

    const nextRecords = readJsonCollection(config).filter((item) => !deleteIds.has(item.id));
    writeJson(config.filePath, nextRecords);
    return nextRecords;
}

async function connectDatabase() {
    if (STORAGE_DRIVER !== 'mysql') {
        throw new Error('当前存储模式不是 mysql，无法创建数据库连接。');
    }

    if (!MYSQL_CONFIGURED) {
        throw new Error('MYSQL_HOST / MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD 未完整配置。');
    }

    if (!mysqlPool) {
        mysqlPool = mysql.createPool({
            host: MYSQL_HOST,
            port: MYSQL_PORT,
            user: MYSQL_USER,
            password: MYSQL_PASSWORD,
            database: MYSQL_DATABASE,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            charset: 'utf8mb4',
            timezone: 'local',
        });
    }

    await mysqlPool.query('SELECT 1');
    return mysqlPool;
}

async function withTransaction(callback) {
    const pool = await connectDatabase();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function ensureTables() {
    const pool = await connectDatabase();

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT PRIMARY KEY,
            phone VARCHAR(32) NULL,
            username VARCHAR(64) NULL,
            password VARCHAR(255) NULL,
            nickname VARCHAR(255) NULL,
            role VARCHAR(16) NOT NULL DEFAULT 'user',
            payload LONGTEXT NOT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_users_phone (phone),
            UNIQUE KEY uniq_users_username (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS plans (
            id BIGINT PRIMARY KEY,
            slug VARCHAR(191) NULL,
            name VARCHAR(255) NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'active',
            featured TINYINT(1) NOT NULL DEFAULT 0,
            hot_rank INT NOT NULL DEFAULT 0,
            sort_order INT NOT NULL DEFAULT 999,
            payload LONGTEXT NOT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_plans_status (status),
            KEY idx_plans_sort (sort_order, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS devices (
            id BIGINT PRIMARY KEY,
            slug VARCHAR(191) NULL,
            name VARCHAR(255) NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'active',
            featured TINYINT(1) NOT NULL DEFAULT 0,
            hot_rank INT NOT NULL DEFAULT 0,
            sort_order INT NOT NULL DEFAULT 999,
            stock INT NOT NULL DEFAULT 0,
            payload LONGTEXT NOT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_devices_status (status),
            KEY idx_devices_sort (sort_order, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS orders (
            id BIGINT PRIMARY KEY,
            order_no VARCHAR(64) NOT NULL,
            user_id BIGINT NOT NULL DEFAULT 0,
            status VARCHAR(32) NOT NULL DEFAULT 'pending_payment_review',
            flow_type VARCHAR(32) NOT NULL DEFAULT 'buy_device',
            created_at DATETIME NOT NULL,
            payload LONGTEXT NOT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_orders_order_no (order_no),
            KEY idx_orders_user_id (user_id),
            KEY idx_orders_status (status),
            KEY idx_orders_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS settings (
            setting_key VARCHAR(64) PRIMARY KEY,
            payload LONGTEXT NOT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

async function readCollection(config) {
    if (STORAGE_DRIVER === 'json') {
        return readJsonCollection(config);
    }

    const pool = await connectDatabase();
    const [rows] = await pool.query(`SELECT payload FROM ${config.tableName} ORDER BY ${config.orderBy}`);
    return rows.map((row) => config.normalize(parsePayload(row.payload, {})));
}

async function upsertCollection(config, records = [], connection = null) {
    const nextRecords = normalizeCollection(config, records);
    if (!nextRecords.length) {
        return nextRecords;
    }

    if (STORAGE_DRIVER === 'json') {
        upsertJsonCollection(config, nextRecords);
        return nextRecords;
    }

    const executor = connection || (await connectDatabase());
    const updates = config.columns
        .filter((column) => column !== 'id')
        .map((column) => `${column} = VALUES(${column})`)
        .join(', ');

    await executor.query(
        `INSERT INTO ${config.tableName} (${config.columns.join(', ')}) VALUES ? ON DUPLICATE KEY UPDATE ${updates}`,
        [nextRecords.map(config.toRow)],
    );

    return nextRecords;
}

async function deleteCollectionByIds(config, ids = [], connection = null) {
    const deleteIds = ids.map((item) => toInteger(item, 0)).filter((item) => item > 0);
    if (!deleteIds.length) {
        return;
    }

    if (STORAGE_DRIVER === 'json') {
        deleteJsonCollection(config, deleteIds);
        return;
    }

    const executor = connection || (await connectDatabase());
    await executor.query(`DELETE FROM ${config.tableName} WHERE id IN (?)`, [deleteIds]);
}

async function replaceCollection(config, records = []) {
    const nextRecords = normalizeCollection(config, records);

    if (STORAGE_DRIVER === 'json') {
        replaceJsonCollection(config, nextRecords);
        return nextRecords;
    }

    await withTransaction(async (connection) => {
        if (!nextRecords.length) {
            await connection.query(`DELETE FROM ${config.tableName}`);
            return;
        }

        const ids = nextRecords.map((item) => item.id);
        await connection.query(`DELETE FROM ${config.tableName} WHERE id NOT IN (?)`, [ids]);
        await upsertCollection(config, nextRecords, connection);
    });

    return nextRecords;
}

async function readUsers() {
    return readCollection(COLLECTION_CONFIG.users);
}

async function writeUsers(users) {
    return replaceCollection(COLLECTION_CONFIG.users, users);
}

async function saveUser(user) {
    const [savedUser] = await upsertCollection(COLLECTION_CONFIG.users, [user]);
    return savedUser;
}

async function readPlans() {
    return readCollection(COLLECTION_CONFIG.plans);
}

async function writePlans(plans) {
    return replaceCollection(COLLECTION_CONFIG.plans, plans);
}

async function savePlan(plan) {
    const [savedPlan] = await upsertCollection(COLLECTION_CONFIG.plans, [plan]);
    return savedPlan;
}

async function deletePlan(planId) {
    await deleteCollectionByIds(COLLECTION_CONFIG.plans, [planId]);
}

async function readDevices() {
    return readCollection(COLLECTION_CONFIG.devices);
}

async function writeDevices(devices) {
    return replaceCollection(COLLECTION_CONFIG.devices, devices);
}

async function saveDevice(device) {
    const [savedDevice] = await upsertCollection(COLLECTION_CONFIG.devices, [device]);
    return savedDevice;
}

async function deleteDevice(deviceId) {
    await deleteCollectionByIds(COLLECTION_CONFIG.devices, [deviceId]);
}

async function readOrders() {
    return readCollection(COLLECTION_CONFIG.orders);
}

async function writeOrders(orders) {
    return replaceCollection(COLLECTION_CONFIG.orders, orders);
}

async function saveOrder(order) {
    const [savedOrder] = await upsertCollection(COLLECTION_CONFIG.orders, [order]);
    return savedOrder;
}

async function writeSettingsToStorage(settings, executor = null) {
    const normalizedSettings = normalizeSettings(settings);

    if (STORAGE_DRIVER === 'json') {
        writeJson(SETTINGS_FILE, normalizedSettings);
        return normalizedSettings;
    }

    const target = executor || (await connectDatabase());
    await target.query('REPLACE INTO settings (setting_key, payload) VALUES (?, ?)', [
        'store_settings',
        serializePayload(normalizedSettings),
    ]);
    return normalizedSettings;
}

async function readSettings() {
    if (STORAGE_DRIVER === 'json') {
        return normalizeSettings(readJson(SETTINGS_FILE, DEFAULT_SETTINGS));
    }

    const pool = await connectDatabase();
    const [rows] = await pool.query('SELECT payload FROM settings WHERE setting_key = ?', ['store_settings']);
    if (!rows.length) {
        return normalizeSettings(DEFAULT_SETTINGS);
    }
    return normalizeSettings(parsePayload(rows[0].payload, DEFAULT_SETTINGS));
}

async function writeSettings(settings) {
    return writeSettingsToStorage(settings);
}

async function commitStoreChanges({
    users = [],
    plans = [],
    devices = [],
    orders = [],
    deleteUserIds = [],
    deletePlanIds = [],
    deleteDeviceIds = [],
    deleteOrderIds = [],
    settings,
} = {}) {
    if (STORAGE_DRIVER === 'json') {
        if (users.length) upsertJsonCollection(COLLECTION_CONFIG.users, users);
        if (plans.length) upsertJsonCollection(COLLECTION_CONFIG.plans, plans);
        if (devices.length) upsertJsonCollection(COLLECTION_CONFIG.devices, devices);
        if (orders.length) upsertJsonCollection(COLLECTION_CONFIG.orders, orders);
        if (deleteUserIds.length) deleteJsonCollection(COLLECTION_CONFIG.users, deleteUserIds);
        if (deletePlanIds.length) deleteJsonCollection(COLLECTION_CONFIG.plans, deletePlanIds);
        if (deleteDeviceIds.length) deleteJsonCollection(COLLECTION_CONFIG.devices, deleteDeviceIds);
        if (deleteOrderIds.length) deleteJsonCollection(COLLECTION_CONFIG.orders, deleteOrderIds);
        if (settings !== undefined) {
            await writeSettingsToStorage(settings);
        }
        return;
    }

    await withTransaction(async (connection) => {
        await upsertCollection(COLLECTION_CONFIG.users, users, connection);
        await upsertCollection(COLLECTION_CONFIG.plans, plans, connection);
        await upsertCollection(COLLECTION_CONFIG.devices, devices, connection);
        await upsertCollection(COLLECTION_CONFIG.orders, orders, connection);
        await deleteCollectionByIds(COLLECTION_CONFIG.users, deleteUserIds, connection);
        await deleteCollectionByIds(COLLECTION_CONFIG.plans, deletePlanIds, connection);
        await deleteCollectionByIds(COLLECTION_CONFIG.devices, deleteDeviceIds, connection);
        await deleteCollectionByIds(COLLECTION_CONFIG.orders, deleteOrderIds, connection);
        if (settings !== undefined) {
            await writeSettingsToStorage(settings, connection);
        }
    });
}

async function countRows(tableName) {
    if (tableName === 'settings') {
        if (STORAGE_DRIVER === 'json') {
            return fs.existsSync(SETTINGS_FILE) ? 1 : 0;
        }

        const pool = await connectDatabase();
        const [rows] = await pool.query('SELECT COUNT(*) AS total FROM settings WHERE setting_key = ?', ['store_settings']);
        return Number(rows[0]?.total || 0);
    }

    const config = COLLECTION_CONFIG[tableName];
    if (!config) {
        throw new Error(`不支持的表名: ${tableName}`);
    }

    if (STORAGE_DRIVER === 'json') {
        return readJsonCollection(config).length;
    }

    const pool = await connectDatabase();
    const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM ${config.tableName}`);
    return Number(rows[0]?.total || 0);
}

async function seedUsersIfEmpty() {
    if (await countRows('users')) return;

    const source = readJson(USERS_FILE, [buildDefaultAdmin()]);
    const users = Array.isArray(source) && source.length ? source.map(normalizeUser) : [buildDefaultAdmin()];
    if (!users.some((item) => item.role === 'admin')) {
        users.unshift(buildDefaultAdmin());
    }

    await writeUsers(users);
}

async function seedPlansIfEmpty() {
    if (await countRows('plans')) return;
    const source = readJson(PLANS_FILE, DEFAULT_PLANS);
    const plans = Array.isArray(source) && source.length ? source : DEFAULT_PLANS;
    await writePlans(plans);
}

async function seedDevicesIfEmpty() {
    if (await countRows('devices')) return;
    const source = readJson(DEVICES_FILE, DEFAULT_DEVICES);
    const devices = Array.isArray(source) && source.length ? source : DEFAULT_DEVICES;
    await writeDevices(devices);
}

async function seedOrdersIfEmpty() {
    if (await countRows('orders')) return;
    const source = readJson(ORDERS_FILE, []);
    const orders = Array.isArray(source) ? source : [];
    await writeOrders(orders);
}

async function seedSettingsIfEmpty() {
    if (await countRows('settings')) return;
    const source = readJson(SETTINGS_FILE, DEFAULT_SETTINGS);
    await writeSettings(source);
}

async function bootstrapData() {
    ensureDir(DATA_DIR);
    ensureDir(UPLOAD_DIR);

    if (STORAGE_DRIVER === 'mysql') {
        await connectDatabase();
        await ensureTables();
    }

    await seedUsersIfEmpty();
    await seedPlansIfEmpty();
    await seedDevicesIfEmpty();
    await seedOrdersIfEmpty();
    await seedSettingsIfEmpty();

    const users = await readUsers();
    const existingAdmin =
        users.find((item) => item.role === 'admin' && item.phone === ADMIN_PHONE) ||
        users.find((item) => item.role === 'admin' && item.username === ADMIN_USERNAME) ||
        users.find((item) => item.role === 'admin');
    const normalizedAdmin = buildDefaultAdmin(existingAdmin || {});
    await saveUser(normalizedAdmin);

    const currentSettings = await readSettings();
    const normalizedSettings = normalizeSettings(currentSettings);
    if (serializePayload(currentSettings) !== serializePayload(normalizedSettings)) {
        await writeSettings(normalizedSettings);
    }
}

module.exports = {
    ADMIN_PHONE,
    ADMIN_USERNAME,
    DATA_DIR,
    DEVICE_CATEGORIES,
    DEVICES_FILE,
    FLOW_TYPES,
    MYSQL_CONFIGURED,
    MYSQL_DATABASE,
    MYSQL_HOST,
    MYSQL_PORT,
    MYSQL_USER,
    ORDER_STATUSES,
    ORDERS_FILE,
    PLANS_FILE,
    ROOT_DIR,
    SETTINGS_FILE,
    STORAGE_DRIVER,
    UPLOAD_DIR,
    USERS_FILE,
    bootstrapData,
    buildOrderSummary,
    commitStoreChanges,
    connectDatabase,
    deleteDevice,
    deletePlan,
    makeOrderNo,
    makeSlug,
    normalizeDevice,
    normalizeOrder,
    normalizePlan,
    normalizeSettings,
    normalizeUser,
    publicPathToDisk,
    readDevices,
    readOrders,
    readPlans,
    readSettings,
    readUsers,
    saveDevice,
    saveOrder,
    savePlan,
    saveUser,
    toBoolean,
    toInteger,
    toNumber,
    toStringArray,
    writeDevices,
    writeOrders,
    writePlans,
    writeSettings,
    writeUsers,
};
