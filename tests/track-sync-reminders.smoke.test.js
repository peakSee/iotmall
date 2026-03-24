const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

test('frontend exposes user logistics reminder cards and polling hooks', async () => {
    const [appSource, templateSource, styleSource] = await Promise.all([
        fs.readFile(path.join(__dirname, '..', 'public', 'app.js'), 'utf8'),
        fs.readFile(path.join(__dirname, '..', 'public', 'js', 'app-templates.js'), 'utf8'),
        fs.readFile(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8'),
    ]);

    assert.match(appSource, /syncMyOrdersPolling/);
    assert.match(appSource, /userOrderNoticeItems/);
    assert.match(appSource, /markMyOrderNoticesRead/);
    assert.match(appSource, /markAllMyOrdersNoticesRead/);
    assert.match(appSource, /collectMyOrderNoticeMessages/);
    assert.match(templateSource, /user-notice-banner/);
    assert.match(templateSource, /提醒中心/);
    assert.match(templateSource, /notice-pill unread/);
    assert.match(templateSource, /user-order-notice-grid/);
    assert.match(templateSource, /全部标记已读/);
    assert.match(styleSource, /\.user-notice-banner/);
    assert.match(styleSource, /\.user-reminder-center/);
    assert.match(styleSource, /\.notice-pill/);
    assert.match(styleSource, /\.user-order-notice/);
});

test('server includes EMS auto track sync scheduler and interval setting', async () => {
    const [appSource, adminSource, orderSource, storeSource, stateSource, noticeSource] = await Promise.all([
        fs.readFile(path.join(__dirname, '..', 'app.js'), 'utf8'),
        fs.readFile(path.join(__dirname, '..', 'routes', 'admin.js'), 'utf8'),
        fs.readFile(path.join(__dirname, '..', 'routes', 'orders.js'), 'utf8'),
        fs.readFile(path.join(__dirname, '..', 'utils', 'store.js'), 'utf8'),
        fs.readFile(path.join(__dirname, '..', 'public', 'js', 'app-state.js'), 'utf8'),
        fs.readFile(path.join(__dirname, '..', 'utils', 'user-notices.js'), 'utf8'),
    ]);

    assert.match(appSource, /startEmsTrackAutoSyncScheduler/);
    assert.match(adminSource, /runEmsTrackAutoSyncSweep/);
    assert.match(adminSource, /track_auto_sync_interval_hours/);
    assert.match(adminSource, /ems_auto_track_sync_fail_count/);
    assert.match(orderSource, /\/notices\/read-all/);
    assert.match(orderSource, /markOrderNoticesRead/);
    assert.match(storeSource, /track_auto_sync_interval_hours/);
    assert.match(stateSource, /track_auto_sync_interval_hours/);
    assert.match(noticeSource, /syncOrderLogisticsUserNotices/);
});
