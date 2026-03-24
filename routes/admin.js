const fs = require('fs');
const express = require('express');
const auth = require('../middleware/auth');
const { uploadEntityImage, uploadPaymentQrs } = require('../middleware/upload');
const {
    DEVICE_CATEGORIES,
    ORDER_STATUSES,
    buildOrderSummary,
    makeSlug,
    normalizeDevice,
    normalizePlan,
    publicPathToDisk,
    readDevices,
    readOrders,
    readPlans,
    readSettings,
    readUsers,
    toInteger,
    toNumber,
    toStringArray,
    writeDevices,
    writeOrders,
    writePlans,
    writeSettings,
    writeUsers,
} = require('../utils/store');

const router = express.Router();

function asyncHandler(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function ensureAdmin(req, res) {
    if (req.userRole !== 'admin') {
        res.status(403).json({ error: '仅管理员可访问。' });
        return false;
    }
    return true;
}

function removePublicFile(publicPath) {
    const filePath = publicPathToDisk(publicPath);
    if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

function removeTempFile(file) {
    if (file?.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
    }
}

function removeTempFilesMap(files = {}) {
    Object.values(files).forEach((fileList) => {
        (Array.isArray(fileList) ? fileList : []).forEach(removeTempFile);
    });
}

function arraysEqual(left = [], right = []) {
    if (left.length !== right.length) return false;
    return left.every((item, index) => item === right[index]);
}

function appendOrderLog(order, { operatorId = 0, operatorRole = '', action = '', content = '' } = {}) {
    order.processing_logs = Array.isArray(order.processing_logs) ? order.processing_logs : [];
    order.processing_logs.push({
        time: new Date().toISOString(),
        operator_id: operatorId,
        operator_role: String(operatorRole || '').trim(),
        action: String(action || '').trim(),
        content: String(content || '').trim(),
    });
}

function enrichOrder(order, users) {
    const user = users.find((item) => item.id === order.user_id);
    return {
        ...order,
        user_phone: user?.phone || '未知用户',
        summary_text: buildOrderSummary(order),
        total_amount: order.pricing.total_amount,
    };
}

function filterOrders(orders, users, { q = '', status = '', flowType = '', dateFrom = '', dateTo = '' } = {}) {
    let nextOrders = orders.map((order) => enrichOrder(order, users)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (status && status !== 'all') {
        nextOrders = nextOrders.filter((order) => order.status === status);
    }

    if (flowType && flowType !== 'all') {
        nextOrders = nextOrders.filter((order) => order.flow_type === flowType);
    }

    if (dateFrom) {
        const startAt = new Date(`${dateFrom}T00:00:00`);
        if (!Number.isNaN(startAt.getTime())) {
            nextOrders = nextOrders.filter((order) => new Date(order.created_at) >= startAt);
        }
    }

    if (dateTo) {
        const endAt = new Date(`${dateTo}T23:59:59.999`);
        if (!Number.isNaN(endAt.getTime())) {
            nextOrders = nextOrders.filter((order) => new Date(order.created_at) <= endAt);
        }
    }

    const keyword = String(q || '')
        .trim()
        .toLowerCase();
    if (!keyword) {
        return nextOrders;
    }

    return nextOrders.filter((order) =>
        [
            order.order_no,
            order.user_phone,
            order.customer_name,
            order.customer_phone,
            order.plan_snapshot?.name,
            order.device_snapshot?.name,
            order.device_submission?.brand,
            order.device_submission?.model,
            order.device_submission?.outbound_tracking,
            order.merchant_tracking_number,
            order.admin_note,
            ...(order.internal_tags || []),
        ]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(keyword)),
    );
}

function applyPlanPayload(existing = {}, body = {}, imagePath) {
    return normalizePlan({
        ...existing,
        id: existing.id || Date.now(),
        slug: makeSlug(body.slug || body.name || existing.name || existing.slug || `plan-${Date.now()}`),
        name: body.name ?? existing.name,
        carrier: body.carrier ?? existing.carrier,
        network_type: body.network_type ?? existing.network_type,
        monthly_data: body.monthly_data ?? existing.monthly_data,
        monthly_price: body.monthly_price ?? existing.monthly_price,
        setup_price: body.setup_price ?? existing.setup_price,
        badge: body.badge ?? existing.badge,
        best_for: body.best_for ?? existing.best_for,
        coverage: body.coverage ?? existing.coverage,
        purchase_note: body.purchase_note ?? existing.purchase_note,
        description: body.description ?? existing.description,
        features: body.features ?? existing.features,
        tags: body.tags ?? existing.tags,
        cover_image: imagePath || existing.cover_image || null,
        featured: body.featured ?? existing.featured,
        status: body.status ?? existing.status,
        hot_rank: body.hot_rank ?? existing.hot_rank,
        sort_order: body.sort_order ?? existing.sort_order,
    });
}

function applyDevicePayload(existing = {}, body = {}, imagePath) {
    return normalizeDevice({
        ...existing,
        id: existing.id || Date.now(),
        slug: makeSlug(body.slug || body.name || existing.name || existing.slug || `device-${Date.now()}`),
        name: body.name ?? existing.name,
        model: body.model ?? existing.model,
        category: body.category ?? existing.category,
        network_type: body.network_type ?? existing.network_type,
        price: body.price ?? existing.price,
        original_price: body.original_price ?? existing.original_price,
        stock: body.stock ?? existing.stock,
        badge: body.badge ?? existing.badge,
        short_description: body.short_description ?? existing.short_description,
        description: body.description ?? existing.description,
        features: body.features ?? existing.features,
        tags: body.tags ?? existing.tags,
        compatible_plan_ids: body.compatible_plan_ids ?? existing.compatible_plan_ids,
        cover_image: imagePath || existing.cover_image || null,
        featured: body.featured ?? existing.featured,
        status: body.status ?? existing.status,
        hot_rank: body.hot_rank ?? existing.hot_rank,
        sort_order: body.sort_order ?? existing.sort_order,
    });
}

function validatePlan(plan) {
    if (!plan.name) return '请填写套餐名称。';
    if (!plan.monthly_data) return '请填写套餐流量说明，或填写“以图片为准”。';
    if (plan.monthly_price < 0) return '月费参考价不能小于 0。';
    if (plan.setup_price < 0) return '配卡服务费不能小于 0。';
    return null;
}

function validateDevice(device) {
    if (!device.name) return '请填写设备名称。';
    if (!DEVICE_CATEGORIES.includes(device.category)) return '设备分类无效。';
    if (device.price <= 0) return '设备售价必须大于 0。';
    return null;
}

router.get(
    '/dashboard',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const [plans, devices, orders, users] = await Promise.all([readPlans(), readDevices(), readOrders(), readUsers()]);

        const activePlans = plans.filter((item) => item.status === 'active');
        const activeDevices = devices.filter((item) => item.status === 'active');
        const totalRevenue = orders
            .filter((order) => order.status !== 'cancelled')
            .reduce((sum, order) => sum + Number(order.pricing?.total_amount || 0), 0);

        res.json({
            plan_count: activePlans.length,
            device_count: activeDevices.length,
            order_count: orders.length,
            user_count: users.length,
            total_revenue: Number(totalRevenue.toFixed(2)),
            pending_count: orders.filter((order) => order.status === 'pending_payment_review').length,
            ship_device_count: orders.filter((order) => order.flow_type === 'ship_device').length,
            buy_device_count: orders.filter((order) => order.flow_type === 'buy_device').length,
            low_stock_devices: activeDevices
                .filter((device) => device.stock <= 5)
                .sort((a, b) => a.stock - b.stock || a.sort_order - b.sort_order || b.id - a.id),
        });
    }),
);

router.get(
    '/plans',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;
        const plans = await readPlans();
        res.json(plans.sort((a, b) => a.sort_order - b.sort_order || b.id - a.id));
    }),
);

router.post(
    '/plans',
    auth,
    uploadEntityImage,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) {
            removeTempFile(req.file);
            return;
        }

        const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
        const plans = await readPlans();
        const plan = applyPlanPayload({}, req.body, imagePath);
        const error = validatePlan(plan);

        if (error) {
            removeTempFile(req.file);
            return res.status(400).json({ error });
        }

        plans.push(plan);
        await writePlans(plans);

        res.json({ success: true, id: plan.id });
    }),
);

router.put(
    '/plans/:id',
    auth,
    uploadEntityImage,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) {
            removeTempFile(req.file);
            return;
        }

        const planId = toInteger(req.params.id, 0);
        const plans = await readPlans();
        const index = plans.findIndex((item) => item.id === planId);

        if (index === -1) {
            removeTempFile(req.file);
            return res.status(404).json({ error: '套餐不存在。' });
        }

        const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
        const nextPlan = applyPlanPayload(plans[index], req.body, imagePath);
        const error = validatePlan(nextPlan);

        if (error) {
            removeTempFile(req.file);
            return res.status(400).json({ error });
        }

        if (imagePath && plans[index].cover_image) {
            removePublicFile(plans[index].cover_image);
        }

        plans[index] = nextPlan;
        await writePlans(plans);

        res.json({ success: true });
    }),
);

router.delete(
    '/plans/:id',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const planId = toInteger(req.params.id, 0);
        const [orders, plans] = await Promise.all([readOrders(), readPlans()]);
        const activeOrderUsingPlan = orders.find((order) => order.plan_id === planId && order.status !== 'cancelled');

        if (activeOrderUsingPlan) {
            return res.status(400).json({ error: '当前还有订单正在使用这个套餐，暂时不能删除。' });
        }

        const index = plans.findIndex((item) => item.id === planId);
        if (index === -1) {
            return res.status(404).json({ error: '套餐不存在。' });
        }

        if (plans[index].cover_image) {
            removePublicFile(plans[index].cover_image);
        }

        plans.splice(index, 1);
        await writePlans(plans);

        res.json({ success: true });
    }),
);

router.get(
    '/devices',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;
        const devices = await readDevices();
        res.json(devices.sort((a, b) => a.sort_order - b.sort_order || b.id - a.id));
    }),
);

router.post(
    '/devices',
    auth,
    uploadEntityImage,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) {
            removeTempFile(req.file);
            return;
        }

        const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
        const devices = await readDevices();
        const device = applyDevicePayload({}, req.body, imagePath);
        const error = validateDevice(device);

        if (error) {
            removeTempFile(req.file);
            return res.status(400).json({ error });
        }

        devices.push(device);
        await writeDevices(devices);

        res.json({ success: true, id: device.id });
    }),
);

router.put(
    '/devices/:id',
    auth,
    uploadEntityImage,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) {
            removeTempFile(req.file);
            return;
        }

        const deviceId = toInteger(req.params.id, 0);
        const devices = await readDevices();
        const index = devices.findIndex((item) => item.id === deviceId);

        if (index === -1) {
            removeTempFile(req.file);
            return res.status(404).json({ error: '设备不存在。' });
        }

        const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
        const nextDevice = applyDevicePayload(devices[index], req.body, imagePath);
        const error = validateDevice(nextDevice);

        if (error) {
            removeTempFile(req.file);
            return res.status(400).json({ error });
        }

        if (imagePath && devices[index].cover_image) {
            removePublicFile(devices[index].cover_image);
        }

        devices[index] = nextDevice;
        await writeDevices(devices);

        res.json({ success: true });
    }),
);

router.delete(
    '/devices/:id',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const deviceId = toInteger(req.params.id, 0);
        const [orders, devices] = await Promise.all([readOrders(), readDevices()]);
        const activeOrderUsingDevice = orders.find((order) => order.device_id === deviceId && order.status !== 'cancelled');

        if (activeOrderUsingDevice) {
            return res.status(400).json({ error: '当前还有订单正在使用这台设备，暂时不能删除。' });
        }

        const index = devices.findIndex((item) => item.id === deviceId);
        if (index === -1) {
            return res.status(404).json({ error: '设备不存在。' });
        }

        if (devices[index].cover_image) {
            removePublicFile(devices[index].cover_image);
        }

        devices.splice(index, 1);
        await writeDevices(devices);

        res.json({ success: true });
    }),
);

router.get(
    '/orders',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const [orders, users] = await Promise.all([readOrders(), readUsers()]);
        const filteredOrders = filterOrders(orders, users, {
            q: req.query.q,
            status: req.query.status,
            flowType: req.query.flow_type,
            dateFrom: req.query.date_from,
            dateTo: req.query.date_to,
        });

        res.json(filteredOrders);
    }),
);

router.get(
    '/orders/export',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const [orders, users] = await Promise.all([readOrders(), readUsers()]);
        const filteredOrders = filterOrders(orders, users, {
            q: req.query.q,
            status: req.query.status,
            flowType: req.query.flow_type,
            dateFrom: req.query.date_from,
            dateTo: req.query.date_to,
        });

        const rows = [
            [
                '订单号',
                '订单状态',
                '下单方式',
                '客户姓名',
                '客户手机号',
                '套餐名称',
                '设备名称',
                '数量',
                '付款方式',
                '订单金额',
                '收货/回寄地址',
                '客户寄出单号',
                '商家回寄单号',
                '内部标签',
                '创建时间',
                '后台备注',
            ],
            ...filteredOrders.map((order) => [
                order.order_no,
                order.status,
                order.flow_type,
                order.customer_name,
                order.customer_phone,
                order.plan_snapshot?.name || '',
                order.device_snapshot?.name || [order.device_submission?.brand, order.device_submission?.model].filter(Boolean).join(' '),
                order.quantity,
                order.payment_method,
                order.total_amount,
                order.shipping_address,
                order.device_submission?.outbound_tracking || '',
                order.merchant_tracking_number || '',
                (order.internal_tags || []).join(' / '),
                order.created_at,
                order.admin_note || '',
            ]),
        ];

        const csv = '\uFEFF' + rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send(csv);
    }),
);

router.put(
    '/orders/:id',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const orderId = toInteger(req.params.id, 0);
        const orders = await readOrders();
        const order = orders.find((item) => item.id === orderId);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        const previousStatus = order.status;
        const previousLogisticsCompany = String(order.logistics_company || '').trim();
        const previousTrackingNumber = String(order.merchant_tracking_number || '').trim();
        const previousAdminNote = String(order.admin_note || '').trim();
        const previousInternalTags = Array.isArray(order.internal_tags) ? [...order.internal_tags] : [];
        const nextStatus = String(req.body.status || order.status).trim();

        if (!ORDER_STATUSES.includes(nextStatus)) {
            return res.status(400).json({ error: '订单状态无效。' });
        }

        if (previousStatus === 'cancelled' && nextStatus !== 'cancelled') {
            return res.status(400).json({ error: '已取消订单不能恢复，请重新创建新订单。' });
        }

        order.status = nextStatus;
        order.logistics_company = String(req.body.logistics_company ?? order.logistics_company ?? '').trim();
        order.merchant_tracking_number = String(req.body.merchant_tracking_number ?? order.merchant_tracking_number ?? '').trim();
        order.admin_note = String(req.body.admin_note ?? order.admin_note ?? '').trim();
        order.internal_tags = toStringArray(req.body.internal_tags ?? order.internal_tags);

        if (!order.reviewed_at && nextStatus !== 'pending_payment_review' && nextStatus !== 'cancelled') {
            order.reviewed_at = new Date().toISOString();
        }

        if (nextStatus === 'shipped') {
            if (!order.merchant_tracking_number) {
                return res.status(400).json({ error: '发货前请先填写商家回寄单号。' });
            }
            if (!order.shipped_at) {
                order.shipped_at = new Date().toISOString();
            }
        }

        if (nextStatus === 'completed' && !order.completed_at) {
            order.completed_at = new Date().toISOString();
        }

        if (nextStatus === 'cancelled' && previousStatus !== 'cancelled') {
            if (order.flow_type === 'buy_device' && order.device_id) {
                const devices = await readDevices();
                const device = devices.find((item) => item.id === order.device_id);
                if (device) {
                    device.stock += order.quantity;
                    await writeDevices(devices);
                }
            }
            order.cancelled_at = new Date().toISOString();
        }

        if (previousStatus !== nextStatus) {
            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '状态更新',
                content: `订单状态由 ${previousStatus} 更新为 ${nextStatus}`,
            });
        }

        if (previousLogisticsCompany !== order.logistics_company || previousTrackingNumber !== order.merchant_tracking_number) {
            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '物流更新',
                content: `物流公司：${order.logistics_company || '未填写'}；回寄单号：${order.merchant_tracking_number || '未填写'}`,
            });
        }

        if (previousAdminNote !== order.admin_note) {
            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '后台备注更新',
                content: order.admin_note || '后台备注已清空',
            });
        }

        if (!arraysEqual(previousInternalTags, order.internal_tags)) {
            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '内部标签更新',
                content: order.internal_tags.length ? `当前标签：${order.internal_tags.join(' / ')}` : '内部标签已清空',
            });
        }

        await writeOrders(orders);
        res.json({ success: true });
    }),
);

router.get(
    '/settings',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;
        res.json(await readSettings());
    }),
);

router.put(
    '/settings',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const currentSettings = await readSettings();
        const nextSettings = {
            ...currentSettings,
            store_name: String(req.body.store_name ?? currentSettings.store_name).trim(),
            hero_badge: String(req.body.hero_badge ?? currentSettings.hero_badge).trim(),
            hero_title: String(req.body.hero_title ?? currentSettings.hero_title).trim(),
            hero_subtitle: String(req.body.hero_subtitle ?? currentSettings.hero_subtitle).trim(),
            service_phone: String(req.body.service_phone ?? currentSettings.service_phone).trim(),
            service_wechat: String(req.body.service_wechat ?? currentSettings.service_wechat).trim(),
            business_hours: String(req.body.business_hours ?? currentSettings.business_hours).trim(),
            shop_receiving_name: String(req.body.shop_receiving_name ?? currentSettings.shop_receiving_name).trim(),
            shop_receiving_phone: String(req.body.shop_receiving_phone ?? currentSettings.shop_receiving_phone).trim(),
            shop_receiving_address: String(req.body.shop_receiving_address ?? currentSettings.shop_receiving_address).trim(),
            announcement: String(req.body.announcement ?? currentSettings.announcement).trim(),
            payment_notice: String(req.body.payment_notice ?? currentSettings.payment_notice).trim(),
            shipping_notice: String(req.body.shipping_notice ?? currentSettings.shipping_notice).trim(),
            aftersales_notice: String(req.body.aftersales_notice ?? currentSettings.aftersales_notice).trim(),
            delivery_notice: String(req.body.delivery_notice ?? currentSettings.delivery_notice).trim(),
            region_notice: String(req.body.region_notice ?? currentSettings.region_notice).trim(),
            ship_service_title: String(req.body.ship_service_title ?? currentSettings.ship_service_title).trim(),
            ship_service_fee: Math.max(0, toNumber(req.body.ship_service_fee ?? currentSettings.ship_service_fee, 0)),
            buy_flow_steps: toStringArray(req.body.buy_flow_steps ?? currentSettings.buy_flow_steps),
            ship_flow_steps: toStringArray(req.body.ship_flow_steps ?? currentSettings.ship_flow_steps),
            ship_checklist: toStringArray(req.body.ship_checklist ?? currentSettings.ship_checklist),
            purchase_rules: toStringArray(req.body.purchase_rules ?? currentSettings.purchase_rules),
            faq_items: toStringArray(req.body.faq_items ?? currentSettings.faq_items),
            admin_note_templates: toStringArray(req.body.admin_note_templates ?? currentSettings.admin_note_templates),
            share_title: String(req.body.share_title ?? currentSettings.share_title).trim(),
            share_description: String(req.body.share_description ?? currentSettings.share_description).trim(),
            payment_qrs: { ...currentSettings.payment_qrs },
        };

        const savedSettings = await writeSettings(nextSettings);
        res.json({ success: true, settings: savedSettings });
    }),
);

router.put(
    '/account',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const users = await readUsers();
        const adminIndex = users.findIndex((item) => item.id === req.userId && item.role === 'admin');

        if (adminIndex === -1) {
            return res.status(404).json({ error: '管理员账号不存在。' });
        }

        const username = String(req.body.username || '').trim();
        const currentPassword = String(req.body.current_password || '').trim();
        const newPassword = String(req.body.new_password || '').trim();

        if (!username) {
            return res.status(400).json({ error: '请输入新的管理员账号。' });
        }

        if (!currentPassword) {
            return res.status(400).json({ error: '请输入当前管理员密码。' });
        }

        if (users[adminIndex].password !== currentPassword) {
            return res.status(400).json({ error: '当前密码输入错误。' });
        }

        if (newPassword && newPassword.length < 6) {
            return res.status(400).json({ error: '新密码长度至少 6 位。' });
        }

        const duplicateUser = users.find((item) => item.id !== users[adminIndex].id && item.role === 'admin' && item.username === username);

        if (duplicateUser) {
            return res.status(400).json({ error: '该管理员账号已被占用。' });
        }

        users[adminIndex].username = username;
        if (newPassword) {
            users[adminIndex].password = newPassword;
        }

        await writeUsers(users);

        res.json({
            success: true,
            user: {
                id: users[adminIndex].id,
                phone: users[adminIndex].phone,
                username: users[adminIndex].username || '',
                nickname: users[adminIndex].nickname,
                role: users[adminIndex].role,
            },
        });
    }),
);

router.post(
    '/settings/payment-qrs',
    auth,
    uploadPaymentQrs,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) {
            removeTempFilesMap(req.files);
            return;
        }

        const files = req.files || {};
        const hasWechatQr = Boolean(files.wechat_qr?.[0]);
        const hasAlipayQr = Boolean(files.alipay_qr?.[0]);

        if (!hasWechatQr && !hasAlipayQr) {
            return res.status(400).json({ error: '请至少上传一张收款码图片。' });
        }

        const settings = await readSettings();

        if (hasWechatQr) {
            if (settings.payment_qrs.wechat) {
                removePublicFile(settings.payment_qrs.wechat);
            }
            settings.payment_qrs.wechat = `/uploads/${files.wechat_qr[0].filename}`;
        }

        if (hasAlipayQr) {
            if (settings.payment_qrs.alipay) {
                removePublicFile(settings.payment_qrs.alipay);
            }
            settings.payment_qrs.alipay = `/uploads/${files.alipay_qr[0].filename}`;
        }

        const savedSettings = await writeSettings(settings);
        res.json({ success: true, settings: savedSettings });
    }),
);

module.exports = router;
