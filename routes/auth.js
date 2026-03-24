const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../utils/auth');
const { readUsers, writeUsers } = require('../utils/store');

const router = express.Router();

function asyncHandler(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function buildAuthResponse(user) {
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    return {
        token,
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
            users.push(user);
            await writeUsers(users);
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
        const user = users.find((item) => item.role === 'admin' && item.username === username && item.password === password);
        if (!user) {
            return res.status(401).json({ error: '管理员账号或密码错误。' });
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
            const decoded = jwt.verify(token, JWT_SECRET);
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
