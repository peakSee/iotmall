const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

test('frontend one-click EMS workflow uses backend queue endpoints', async () => {
    const [appSource, templateSource] = await Promise.all([
        fs.readFile(path.join(__dirname, '..', 'public', 'app.js'), 'utf8'),
        fs.readFile(path.join(__dirname, '..', 'public', 'js', 'app-templates.js'), 'utf8'),
    ]);

    assert.match(appSource, /queueAdminOrderWorkflow/);
    assert.match(appSource, /\/admin\/orders\/ems\/workflow\/batch/);
    assert.match(templateSource, /queueAdminOrderWorkflow\(order\)/);
});

test('server startup includes EMS workflow recovery hook', async () => {
    const [appSource, adminRouteSource] = await Promise.all([
        fs.readFile(path.join(__dirname, '..', 'app.js'), 'utf8'),
        fs.readFile(path.join(__dirname, '..', 'routes', 'admin.js'), 'utf8'),
    ]);

    assert.match(appSource, /recoverEmsWorkflowQueueOnStartup/);
    assert.match(adminRouteSource, /startup recovery completed/);
});
