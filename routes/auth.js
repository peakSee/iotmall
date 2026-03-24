const express = require('express');
const { needsPasswordMigration, signAuthToken, verifyAuthToken, verifyPassword } = require('../utils/auth');
const { readUsers, saveUser } = require('../utils/store');

const router = express.Router();

function asyncHandler(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function buildAuthResponse(user) {
    return {
        token: signAuthToken(user),
        user: {
            id: user.id,
            phone: user.phone,
            username: user.username || '',
            nickname: user.nickname,
            role: user.role,
        },
    };
}

router.post(
    '/login',
    asyncHandler(async (req, res) => {
        const phone = String(req.body.phone || '').trim();
        if (!/^1[3-9]\d{9}$/.test(phone)) {
            return res.status(400).json({ error: '请输入正确的 11 位手机号。' });
        }

        const users = await readUsers();
        let user = users.find((item) => item.phone === phone);

        if (!user) {
            user = {
                id: Date.now(),
                phone,
                nickname: `用户${phone.slice(-4)}`,
                role: 'user',
            };
            await saveUser(user);
        }

        res.json(buildAuthResponse(user));
    }),
);

router.post(
    '/admin-login',
    asyncHandler(async (req, res) => {
        const username = String(req.body.username || '').trim();
        const password = String(req.body.password || '').trim();

        if (!username) {
            return res.status(400).json({ error: '请输入管理员账号。' });
        }
        if (!password) {
            return res.status(400).json({ error: '请输入管理员密码。' });
        }

        const users = await readUsers();
        const user = users.find((item) => item.role === 'admin' && item.username === username);
        if (!user || !verifyPassword(password, user.password)) {
            return res.status(401).json({ error: '管理员账号或密码错误。' });
        }

        if (needsPasswordMigration(user.password)) {
            await saveUser({
                ...user,
                password,
            });
        }

        res.json(buildAuthResponse(user));
    }),
);

router.get(
    '/me',
    asyncHandler(async (req, res) => {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: '请先登录。' });
        }

        try {
            const decoded = verifyAuthToken(token);
            const users = await readUsers();
            const user = users.find((item) => item.id === decoded.userId);
            if (!user) {
                return res.status(404).json({ error: '用户不存在。' });
            }

            res.json({
                id: user.id,
                phone: user.phone,
                username: user.username || '',
                nickname: user.nickname,
                role: user.role,
            });
        } catch (error) {
            res.status(401).json({ error: '登录状态已失效，请重新登录。' });
        }
    }),
);

module.exports = router;
