const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const { UPLOAD_DIR } = require('../utils/store');

const ALLOWED_IMAGE_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/gif': '.gif',
};

function imageFilter(req, file, cb) {
    if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
        const error = new Error('仅支持上传图片文件。');
        error.statusCode = 400;
        return cb(error);
    }
    cb(null, true);
}

function createStorage(prefix) {
    return multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOAD_DIR),
        filename: (req, file, cb) => {
            const extension = ALLOWED_IMAGE_TYPES[file.mimetype] || path.extname(file.originalname).toLowerCase() || '.jpg';
            const suffix = crypto.randomBytes(8).toString('hex');
            cb(null, `${prefix}${Date.now()}_${suffix}${extension}`);
        },
    });
}

const commonOptions = {
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: imageFilter,
};

const uploadEntityImage = multer({
    storage: createStorage('entity_'),
    ...commonOptions,
}).single('image');

const uploadPaymentProof = multer({
    storage: createStorage('payment_'),
    ...commonOptions,
}).single('payment_proof');

const uploadPaymentQrs = multer({
    storage: createStorage('payqr_'),
    ...commonOptions,
}).fields([
    { name: 'wechat_qr', maxCount: 1 },
    { name: 'alipay_qr', maxCount: 1 },
]);

module.exports = {
    uploadEntityImage,
    uploadPaymentProof,
    uploadPaymentQrs,
};
