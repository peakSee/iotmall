const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

test('frontend exposes password visibility toggles for admin secrets', async () => {
    const [appSource, templateSource, styleSource] = await Promise.all([
        fs.readFile(path.join(__dirname, '..', 'public', 'app.js'), 'utf8'),
        fs.readFile(path.join(__dirname, '..', 'public', 'js', 'app-templates.js'), 'utf8'),
        fs.readFile(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8'),
    ]);

    assert.match(appSource, /toggleSecretField/);
    assert.match(appSource, /secretInputType/);
    assert.match(templateSource, /admin_login_password/);
    assert.match(templateSource, /admin_account_current_password/);
    assert.match(templateSource, /logistics_authorization/);
    assert.match(styleSource, /\.password-field/);
    assert.match(styleSource, /\.password-toggle-btn/);
});
