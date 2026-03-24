const assert = require('node:assert/strict');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const store = require('../utils/store');

Object.assign(store, {
    bootstrapData: async () => {},
    readPlans: async () => [
        {
            id: 1,
            name: 'test-plan',
            status: 'active',
            featured: true,
            hot_rank: 10,
            sort_order: 1,
        },
    ],
    readDevices: async () => [
        {
            id: 1,
            name: 'test-device',
            status: 'active',
            stock: 8,
            featured: true,
            hot_rank: 10,
            sort_order: 1,
        },
    ],
    readSettings: async () => ({
        store_name: 'test-store',
        hero_title: 'test title',
        hero_subtitle: 'test subtitle',
        payment_qrs: {},
        buy_flow_steps: [],
        ship_flow_steps: [],
        ship_checklist: [],
        purchase_rules: [],
        faq_items: [],
        admin_note_templates: [],
        logistics: {},
    }),
});

const { createServer } = require('../app');

let serverInfo;

async function request(pathname, options) {
    return fetch(`http://127.0.0.1:${serverInfo.port}${pathname}`, options);
}

test.before(async () => {
    const app = createServer();
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, () => resolve(instance));
    });
    serverInfo = {
        app,
        server,
        port: server.address().port,
    };
});

test.after(async () => {
    if (!serverInfo?.server) return;
    await new Promise((resolve) => serverInfo.server.close(resolve));
});

test('storefront page loads split assets', async () => {
    const response = await request('/');
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /\/js\/app-tools\.js\?v=20260325-reminder-center-alerts/);
    assert.match(html, /\/js\/app-state\.js\?v=20260325-reminder-center-alerts/);
    assert.match(html, /\/js\/app-templates\.js\?v=20260325-reminder-center-alerts/);
    assert.match(html, /\/app\.js\?v=20260325-reminder-center-alerts/);
});

test('admin page loads split assets and admin mode marker', async () => {
    const response = await request('/admin');
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /data-page-mode="admin"/);
    assert.match(html, /\/app\.js\?v=20260325-reminder-center-alerts/);
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

test('split frontend assets expose logistics and batch helpers', async () => {
    const [mainResponse, templateResponse] = await Promise.all([
        request('/app.js?v=20260325-reminder-center-alerts'),
        request('/js/app-templates.js?v=20260325-reminder-center-alerts'),
    ]);

    const [mainSource, templateSource] = await Promise.all([mainResponse.text(), templateResponse.text()]);

    assert.equal(mainResponse.status, 200);
    assert.equal(templateResponse.status, 200);
    assert.match(mainSource, /savingStates/);
    assert.match(mainSource, /setAdminTab/);
    assert.match(mainSource, /printAdminOrderLabel/);
    assert.match(mainSource, /runBatchAdminAction/);
    assert.match(mainSource, /queueAdminOrderWorkflow/);
    assert.match(mainSource, /\/admin\/orders\/ems\/workflow\/batch/);
    assert.match(mainSource, /runEmsDiagnostics/);
    assert.match(templateSource, /EMS 物流面单/);
    assert.match(templateSource, /物流设置/);
    assert.match(templateSource, /批量解析/);
    assert.match(templateSource, /下载官方云打印控件/);
    assert.match(templateSource, /我的订单/);
});
