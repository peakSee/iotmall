const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PLANS_FILE = path.join(DATA_DIR, 'plans.json');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const MYSQL_HOST = process.env.MYSQL_HOST || '149.88.95.34';
const MYSQL_PORT = Number(process.env.MYSQL_PORT) || 3306;
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'iotmall';
const MYSQL_USER = process.env.MYSQL_USER || 'iotmall';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'MPDENDB2A4J86TrK';

const ADMIN_PHONE = process.env.ADMIN_PHONE || '17724888898';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123456';

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

const DEFAULT_ADMIN = {
    id: Number(ADMIN_PHONE),
    phone: ADMIN_PHONE,
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
    nickname: '管理员',
    role: 'admin',
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
    };
}

function normalizeUser(rawUser = {}) {
    return {
        id: toInteger(rawUser.id, Date.now()),
        phone: safeText(rawUser.phone),
        username: safeText(rawUser.username),
        password: safeText(rawUser.password),
        nickname: safeText(rawUser.nickname || `用户${safeText(rawUser.phone).slice(-4)}`),
        role: rawUser.role === 'admin' ? 'admin' : 'user',
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

async function connectDatabase() {
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

async function readUsers() {
    const pool = await connectDatabase();
    const [rows] = await pool.query('SELECT payload FROM users ORDER BY id ASC');
    return rows.map((row) => normalizeUser(parsePayload(row.payload, {})));
}

async function writeUsers(users) {
    const nextUsers = users.map(normalizeUser);
    await withTransaction(async (connection) => {
        await connection.query('DELETE FROM users');
        if (!nextUsers.length) return;
        const values = nextUsers.map((user) => [
            user.id,
            user.phone || null,
            user.username || null,
            user.password || '',
            user.nickname || '',
            user.role,
            serializePayload(user),
        ]);
        await connection.query('INSERT INTO users (id, phone, username, password, nickname, role, payload) VALUES ?', [values]);
    });
    return nextUsers;
}

async function readPlans() {
    const pool = await connectDatabase();
    const [rows] = await pool.query('SELECT payload FROM plans ORDER BY sort_order ASC, id DESC');
    return rows.map((row) => normalizePlan(parsePayload(row.payload, {})));
}

async function writePlans(plans) {
    const nextPlans = plans.map(normalizePlan);
    await withTransaction(async (connection) => {
        await connection.query('DELETE FROM plans');
        if (!nextPlans.length) return;
        const values = nextPlans.map((plan) => [
            plan.id,
            plan.slug || null,
            plan.name,
            plan.status,
            sqlBoolean(plan.featured),
            plan.hot_rank,
            plan.sort_order,
            serializePayload(plan),
        ]);
        await connection.query('INSERT INTO plans (id, slug, name, status, featured, hot_rank, sort_order, payload) VALUES ?', [values]);
    });
    return nextPlans;
}

async function readDevices() {
    const pool = await connectDatabase();
    const [rows] = await pool.query('SELECT payload FROM devices ORDER BY sort_order ASC, id DESC');
    return rows.map((row) => normalizeDevice(parsePayload(row.payload, {})));
}

async function writeDevices(devices) {
    const nextDevices = devices.map(normalizeDevice);
    await withTransaction(async (connection) => {
        await connection.query('DELETE FROM devices');
        if (!nextDevices.length) return;
        const values = nextDevices.map((device) => [
            device.id,
            device.slug || null,
            device.name,
            device.status,
            sqlBoolean(device.featured),
            device.hot_rank,
            device.sort_order,
            device.stock,
            serializePayload(device),
        ]);
        await connection.query('INSERT INTO devices (id, slug, name, status, featured, hot_rank, sort_order, stock, payload) VALUES ?', [
            values,
        ]);
    });
    return nextDevices;
}

async function readOrders() {
    const pool = await connectDatabase();
    const [rows] = await pool.query('SELECT payload FROM orders ORDER BY created_at ASC, id ASC');
    return rows.map((row) => normalizeOrder(parsePayload(row.payload, {})));
}

async function writeOrders(orders) {
    const nextOrders = orders.map(normalizeOrder);
    await withTransaction(async (connection) => {
        await connection.query('DELETE FROM orders');
        if (!nextOrders.length) return;
        const values = nextOrders.map((order) => [
            order.id,
            order.order_no,
            order.user_id,
            order.status,
            order.flow_type,
            formatSqlDateTime(order.created_at),
            serializePayload(order),
        ]);
        await connection.query('INSERT INTO orders (id, order_no, user_id, status, flow_type, created_at, payload) VALUES ?', [values]);
    });
    return nextOrders;
}

async function readSettings() {
    const pool = await connectDatabase();
    const [rows] = await pool.query('SELECT payload FROM settings WHERE setting_key = ?', ['store_settings']);
    if (!rows.length) {
        return normalizeSettings(DEFAULT_SETTINGS);
    }
    return normalizeSettings(parsePayload(rows[0].payload, DEFAULT_SETTINGS));
}

async function writeSettings(settings) {
    const normalizedSettings = normalizeSettings(settings);
    const pool = await connectDatabase();
    await pool.query('REPLACE INTO settings (setting_key, payload) VALUES (?, ?)', [
        'store_settings',
        serializePayload(normalizedSettings),
    ]);
    return normalizedSettings;
}

async function countRows(tableName) {
    const pool = await connectDatabase();
    const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM ${tableName}`);
    return Number(rows[0]?.total || 0);
}

async function seedUsersIfEmpty() {
    if (await countRows('users')) return;
    const source = readJson(USERS_FILE, [DEFAULT_ADMIN]);
    const users = Array.isArray(source) && source.length ? source : [DEFAULT_ADMIN];
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
    const pool = await connectDatabase();
    const [rows] = await pool.query('SELECT setting_key FROM settings WHERE setting_key = ?', ['store_settings']);
    if (rows.length) return;
    const source = readJson(SETTINGS_FILE, DEFAULT_SETTINGS);
    await writeSettings(source);
}

async function bootstrapData() {
    ensureDir(DATA_DIR);
    ensureDir(UPLOAD_DIR);

    await connectDatabase();
    await ensureTables();

    await seedUsersIfEmpty();
    await seedPlansIfEmpty();
    await seedDevicesIfEmpty();
    await seedOrdersIfEmpty();
    await seedSettingsIfEmpty();

    const users = await readUsers();
    const adminIndex = users.findIndex((user) => user.phone === ADMIN_PHONE);

    if (adminIndex === -1) {
        users.push(DEFAULT_ADMIN);
    } else {
        users[adminIndex] = normalizeUser({
            ...DEFAULT_ADMIN,
            ...users[adminIndex],
            id: DEFAULT_ADMIN.id,
            phone: DEFAULT_ADMIN.phone,
            role: 'admin',
        });
    }

    await writeUsers(users);
    await writePlans(await readPlans());
    await writeDevices(await readDevices());
    await writeOrders(await readOrders());
    await writeSettings(await readSettings());
}

module.exports = {
    ADMIN_PHONE,
    ADMIN_USERNAME,
    ADMIN_PASSWORD,
    DATA_DIR,
    DEVICE_CATEGORIES,
    DEVICES_FILE,
    FLOW_TYPES,
    MYSQL_DATABASE,
    MYSQL_HOST,
    MYSQL_PASSWORD,
    MYSQL_PORT,
    MYSQL_USER,
    ORDER_STATUSES,
    ORDERS_FILE,
    PLANS_FILE,
    ROOT_DIR,
    SETTINGS_FILE,
    UPLOAD_DIR,
    USERS_FILE,
    bootstrapData,
    buildOrderSummary,
    connectDatabase,
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
