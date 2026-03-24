const { verifyAuthToken } = require('../utils/auth');

module.exports = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: '请先登录后再继续。' });
    }

    try {
        const decoded = verifyAuthToken(token);
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        next();
    } catch (error) {
        res.status(401).json({ error: '登录状态已失效，请重新登录。' });
    }
};
