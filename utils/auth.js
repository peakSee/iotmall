const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const HASH_PREFIX = 'scrypt';
const HASH_SEPARATOR = '$';
const HASH_KEY_LENGTH = 64;
const TEST_JWT_SECRET = 'test-jwt-secret';
const IS_NODE_TEST = process.argv.includes('--test');

let runtimeJwtSecret = null;

function safeText(value) {
    return String(value || '').trim();
}

function createTemporaryPassword(length = 18) {
    return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

function getJwtSecret() {
    const explicitSecret = safeText(process.env.JWT_SECRET);
    if (explicitSecret) {
        return explicitSecret;
    }

    if (process.env.NODE_ENV === 'test' || IS_NODE_TEST) {
        return TEST_JWT_SECRET;
    }

    if (!runtimeJwtSecret) {
        runtimeJwtSecret = crypto.randomBytes(48).toString('hex');
        console.warn('[auth] JWT_SECRET 未设置，当前进程已生成临时密钥。重启后登录态会失效，请尽快配置环境变量。');
    }

    return runtimeJwtSecret;
}

function isPasswordHash(value) {
    return safeText(value).startsWith(`${HASH_PREFIX}${HASH_SEPARATOR}`);
}

function hashPassword(password) {
    const plainPassword = safeText(password);
    if (!plainPassword) {
        return '';
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(plainPassword, salt, HASH_KEY_LENGTH).toString('hex');
    return [HASH_PREFIX, salt, derivedKey].join(HASH_SEPARATOR);
}

function safeCompare(left, right) {
    const leftBuffer = Buffer.from(String(left), 'utf8');
    const rightBuffer = Buffer.from(String(right), 'utf8');
    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyPassword(password, storedPassword) {
    const plainPassword = safeText(password);
    const secret = safeText(storedPassword);

    if (!plainPassword || !secret) {
        return false;
    }

    if (!isPasswordHash(secret)) {
        return safeCompare(plainPassword, secret);
    }

    const parts = secret.split(HASH_SEPARATOR);
    if (parts.length !== 3) {
        return false;
    }

    const [, salt, expectedHash] = parts;
    const derivedKey = crypto.scryptSync(plainPassword, salt, HASH_KEY_LENGTH).toString('hex');
    return safeCompare(derivedKey, expectedHash);
}

function normalizeStoredPassword(storedPassword) {
    const secret = safeText(storedPassword);
    if (!secret) {
        return '';
    }

    return isPasswordHash(secret) ? secret : hashPassword(secret);
}

function needsPasswordMigration(storedPassword) {
    const secret = safeText(storedPassword);
    return Boolean(secret) && !isPasswordHash(secret);
}

function signAuthToken(user) {
    return jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), { expiresIn: '7d' });
}

function verifyAuthToken(token) {
    return jwt.verify(token, getJwtSecret());
}

module.exports = {
    createTemporaryPassword,
    getJwtSecret,
    hashPassword,
    isPasswordHash,
    needsPasswordMigration,
    normalizeStoredPassword,
    signAuthToken,
    verifyAuthToken,
    verifyPassword,
};
