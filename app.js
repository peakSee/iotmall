const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { UPLOAD_DIR, bootstrapData } = require('./utils/store');

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const PLAN_MEDIA_DIR = decodeURIComponent('%E5%A5%97%E9%A4%90%E5%9B%BE%E7%89%87');
const DEVICE_MEDIA_DIR = decodeURIComponent('%E8%AE%BE%E5%A4%87%E5%9B%BE%E7%89%87');

function createServer() {
    const app = express();

    app.use(cors());
    app.use(express.json({ limit: '8mb' }));
    app.use(express.urlencoded({ extended: true }));
    app.use('/uploads', express.static(UPLOAD_DIR));
    app.use('/media/plans', express.static(path.join(__dirname, PLAN_MEDIA_DIR)));
    app.use('/media/devices', express.static(path.join(__dirname, DEVICE_MEDIA_DIR)));
    app.use(express.static(path.join(__dirname, 'public')));

    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/storefront', require('./routes/storefront'));
    app.use('/api/orders', require('./routes/orders'));
    app.use('/api/admin', require('./routes/admin'));

    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.get('/admin', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    });

    app.use((err, req, res, next) => {
        if (!err) {
            return next();
        }

        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: '上传图片不能超过 5MB。' });
            }
            return res.status(400).json({ error: err.message || '上传文件失败，请检查后重试。' });
        }

        if (err.statusCode) {
            return res.status(err.statusCode).json({ error: err.message });
        }

        console.error(err);
        return res.status(500).json({ error: err.message || '服务器繁忙，请稍后再试。' });
    });

    return app;
}

async function startServer({ port = DEFAULT_PORT } = {}) {
    await bootstrapData();

    const app = createServer();
    return await new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
            const address = server.address();
            const actualPort = typeof address === 'object' && address ? address.port : port;
            console.log(`Server running at http://localhost:${actualPort}`);
            resolve({ app, server, port: actualPort });
        });

        server.on('error', reject);
    });
}

if (require.main === module) {
    startServer().catch((error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}

module.exports = {
    createServer,
    startServer,
};
