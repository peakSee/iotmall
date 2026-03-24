const assert = require('node:assert/strict');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const {
    hashPassword,
    needsPasswordMigration,
    normalizeStoredPassword,
    signAuthToken,
    verifyAuthToken,
    verifyPassword,
} = require('../utils/auth');

test('hashPassword and verifyPassword support hashed secrets', () => {
    const password = 'Admin#123456';
    const hash = hashPassword(password);

    assert.ok(hash.startsWith('scrypt$'));
    assert.equal(verifyPassword(password, hash), true);
    assert.equal(verifyPassword('wrong-password', hash), false);
});

test('verifyPassword still accepts legacy plaintext and marks it for migration', () => {
    const legacyPassword = 'admin123456';

    assert.equal(verifyPassword(legacyPassword, legacyPassword), true);
    assert.equal(needsPasswordMigration(legacyPassword), true);
    assert.equal(needsPasswordMigration(normalizeStoredPassword(legacyPassword)), false);
});

test('signAuthToken and verifyAuthToken round-trip auth payload', () => {
    const token = signAuthToken({
        id: 1001,
        role: 'admin',
    });

    const payload = verifyAuthToken(token);
    assert.equal(payload.userId, 1001);
    assert.equal(payload.role, 'admin');
});
