const assert = require('node:assert/strict');
const test = require('node:test');

process.env.JWT_SECRET = 'test-jwt-secret';

const store = require('../utils/store');
const ems = require('../utils/ems');
const { signAuthToken } = require('../utils/auth');

let capturedCreatePayload = null;

function buildOrder() {
    return {
        id: 1774321543737,
        order_no: 'IOT202603247844',
        user_id: 17724888898,
        flow_type: 'buy_device',
        status: 'pending_payment_review',
        quantity: 1,
        customer_name: '一起山顶见',
        customer_phone: '17724888898',
        shipping_address: '河南省新乡市原阳县福宁集镇张打夫寨村',
        remark: '加急',
        plan_snapshot: {
            name: '移动 5G 全国套餐图',
        },
        device_snapshot: {
            name: '中兴 F50 5G 随身 WiFi',
        },
        pricing: {
            total_amount: 438,
        },
        processing_logs: [],
        logistics_company: '',
        merchant_tracking_number: '',
        ems: {
            address_parse_source: '河南省新乡市原阳县福宁集镇张打夫寨村',
            receiver: {
                name: '一起山顶见',
                mobile: '17724888898',
                phone: '',
                post_code: '',
                prov: '河南省',
                city: '新乡市',
                county: '原阳县',
                address: '福宁集镇张打夫寨村',
            },
            sender: {
                name: '',
                mobile: '',
                phone: '',
                post_code: '',
                prov: '',
                city: '',
                county: '',
                address: '',
            },
            ecommerce_user_id: '',
            logistics_order_no: '',
            waybill_no: '',
            biz_product_no: '10',
            biz_product_id: '',
            contents_attribute: '3',
            package_weight: '500',
            label_type: '129',
            track_items: [],
        },
    };
}

Object.assign(store, {
    bootstrapData: async () => {},
    readOrders: async () => [buildOrder()],
    readSettings: async () => ({
        shop_receiving_name: '一起山顶见',
        shop_receiving_phone: '17724888898',
        shop_receiving_address: '河南省新乡市原阳县福宁集镇张大夫寨村',
        payment_qrs: {},
        buy_flow_steps: [],
        ship_flow_steps: [],
        ship_checklist: [],
        purchase_rules: [],
        faq_items: [],
        admin_note_templates: [],
    }),
    commitStoreChanges: async () => {},
});

Object.assign(ems, {
    checkReachability: async () => ({
        serialNo: 'reachability-serial',
        retCode: '00000',
        retMsg: '该地址信息可达！',
    }),
    createWaybillOrder: async (payload) => {
        capturedCreatePayload = payload;
        return {
            response: {
                serialNo: 'create-serial',
            },
            body: {
                waybillNo: '1295838760599',
                logisticsOrderNo: payload.logisticsOrderNo,
            },
        };
    },
    getEmsConfig: () => ({
        senderNo: '1100217822419',
        bizProductNo: '10',
        bizProductId: '',
        contentsAttribute: '3',
        defaultWeightGrams: '500',
        labelType: '129',
        senderName: '一起山顶见',
        senderPhone: '17724888898',
        senderPostCode: '',
        senderProv: '河南省',
        senderCity: '新乡市',
        senderCounty: '原阳县',
        senderAddress: '福宁集镇张大夫寨村',
    }),
    parseAddress: async () => [],
    validatePartyAddress: (party) => party,
});

delete require.cache[require.resolve('../routes/admin')];
delete require.cache[require.resolve('../app')];

const { createServer } = require('../app');

let serverInfo = null;

async function request(pathname, options) {
    const response = await fetch(`http://127.0.0.1:${serverInfo.port}${pathname}`, options);
    return response;
}

test.before(async () => {
    const app = createServer();
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, () => resolve(instance));
    });
    serverInfo = {
        server,
        port: server.address().port,
    };
});

test.after(async () => {
    if (!serverInfo?.server) return;
    await new Promise((resolve) => serverInfo.server.close(resolve));
});

test('ems create falls back to generated ecommerceUserId when the incoming value is blank', async () => {
    capturedCreatePayload = null;
    const token = signAuthToken({ id: 17724888898, role: 'admin' });

    const response = await request('/api/admin/orders/1774321543737/ems/create', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            ems: {
                ecommerce_user_id: '',
            },
        }),
    });

    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(capturedCreatePayload.ecommerceUserId, 'IOT202603247844-1774321543737');
    assert.equal(payload.waybill_no, '1295838760599');
});
