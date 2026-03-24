const assert = require('node:assert/strict');
const test = require('node:test');

const store = require('../utils/store');

Object.assign(store, {
    bootstrapData: async () => {},
    readPlans: async () => [
        {
            id: 1,
            name: '测试套餐',
            status: 'active',
            featured: true,
            hot_rank: 10,
            sort_order: 1
        }
    ],
    readDevices: async () => [
        {
            id: 1,
            name: '测试设备',
            status: 'active',
            stock: 8,
            featured: true,
            hot_rank: 10,
            sort_order: 1
        }
    ],
    readSettings: async () => ({
        store_name: '物联卡设备配卡商城',
        hero_title: '只做设备配卡方案，不单独卖卡',
        hero_subtitle: '测试环境专用 storefront 数据。',
        payment_qrs: {},
        buy_flow_steps: [],
        ship_flow_steps: [],
        ship_checklist: [],
        purchase_rules: [],
        faq_items: [],
        admin_note_templates: []
    })
});

const { createServer } = require('../app');

let serverInfo;

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
        app,
        server,
        port: server.address().port
    };
});

test.after(async () => {
    if (!serverInfo?.server) return;
    await new Promise((resolve) => serverInfo.server.close(resolve));
});

test('storefront page loads split assets and clean title', async () => {
    const response = await request('/');
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<title>物联卡设备配卡商城<\/title>/);
    assert.match(html, /\/js\/app-tools\.js\?v=20260324-admin-ux/);
    assert.match(html, /\/js\/app-state\.js\?v=20260324-admin-ux/);
    assert.match(html, /\/js\/app-templates\.js\?v=20260324-admin-ux/);
});

test('admin page loads clean metadata and split assets', async () => {
    const response = await request('/admin');
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<title>物联卡设备配卡商城后台<\/title>/);
    assert.match(html, /data-page-mode="admin"/);
    assert.match(html, /\/app\.js\?v=20260324-admin-ux/);
});

test('storefront api returns settings, plans and devices', async () => {
    const response = await request('/api/storefront');
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.ok(payload.settings);
    assert.ok(Array.isArray(payload.plans));
    assert.ok(Array.isArray(payload.devices));
    assert.ok(payload.stats);
});

test('split frontend assets expose admin ux helpers', async () => {
    const [mainResponse, templateResponse] = await Promise.all([
        request('/app.js?v=20260324-admin-ux'),
        request('/js/app-templates.js?v=20260324-admin-ux'),
    ]);

    const [mainSource, templateSource] = await Promise.all([mainResponse.text(), templateResponse.text()]);

    assert.equal(mainResponse.status, 200);
    assert.equal(templateResponse.status, 200);
    assert.match(mainSource, /savingStates/);
    assert.match(mainSource, /setAdminTab/);
    assert.match(mainSource, /订单管理/);
    assert.match(templateSource, /我的订单/);
});
