const fs = require('fs');
const express = require('express');
const auth = require('../middleware/auth');
const { uploadPaymentProof } = require('../middleware/upload');
const {
    FLOW_TYPES,
    buildOrderSummary,
    makeOrderNo,
    publicPathToDisk,
    readDevices,
    readOrders,
    readPlans,
    readSettings,
    toInteger,
    toNumber,
    writeDevices,
    writeOrders,
} = require('../utils/store');

const router = express.Router();

function asyncHandler(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function removeTempFile(file) {
    if (file?.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
    }
}

function removePublicFile(publicPath) {
    const filePath = publicPathToDisk(publicPath);
    if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

function canUserCancel(order) {
    return ['pending_payment_review', 'awaiting_device_delivery'].includes(order.status);
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

function enrichOrder(order) {
    return {
        ...order,
        summary_text: buildOrderSummary(order),
        total_amount: order.pricing.total_amount,
        can_cancel: canUserCancel(order),
        can_confirm: order.status === 'shipped',
    };
}

router.post(
    '/',
    auth,
    uploadPaymentProof,
    asyncHandler(async (req, res) => {
        const flowType = String(req.body.flow_type || '').trim();
        const planId = toInteger(req.body.plan_id, 0);
        const deviceId = toInteger(req.body.device_id, 0);
        const quantity = Math.max(1, toInteger(req.body.quantity, 1));
        const paymentMethod = String(req.body.payment_method || '').trim();
        const customerName = String(req.body.customer_name || '').trim();
        const customerPhone = String(req.body.customer_phone || '').trim();
        const shippingAddress = String(req.body.shipping_address || '').trim();
        const remark = String(req.body.remark || '').trim();
        const deviceBrand = String(req.body.customer_device_brand || '').trim();
        const deviceModel = String(req.body.customer_device_model || '').trim();
        const canInsertCard = String(req.body.customer_device_can_insert_card || '').trim();
        const removeControl = String(req.body.customer_device_remove_control || '').trim();
        const deviceCondition = String(req.body.customer_device_condition || '').trim();
        const deviceNotes = String(req.body.customer_device_notes || '').trim();
        const outboundTracking = String(req.body.customer_device_tracking || '').trim();

        if (!req.file) {
            return res.status(400).json({ error: '请先上传付款截图。' });
        }
        if (!FLOW_TYPES.includes(flowType)) {
            removeTempFile(req.file);
            return res.status(400).json({ error: '下单方式无效。' });
        }
        if (!['wechat', 'alipay'].includes(paymentMethod)) {
            removeTempFile(req.file);
            return res.status(400).json({ error: '支付方式无效。' });
        }
        if (!customerName) {
            removeTempFile(req.file);
            return res.status(400).json({ error: '请填写联系人姓名。' });
        }
        if (!/^1[3-9]\d{9}$/.test(customerPhone)) {
            removeTempFile(req.file);
            return res.status(400).json({ error: '请填写正确的手机号。' });
        }
        if (!shippingAddress) {
            removeTempFile(req.file);
            return res.status(400).json({ error: '请填写收货地址或回寄地址。' });
        }

        const [settings, plans, devices, orders] = await Promise.all([readSettings(), readPlans(), readDevices(), readOrders()]);

        if (!settings.payment_qrs[paymentMethod]) {
            removeTempFile(req.file);
            return res.status(400).json({ error: '当前支付方式暂未配置收款码。' });
        }

        const plan = plans.find((item) => item.id === planId && item.status === 'active');
        if (!plan) {
            removeTempFile(req.file);
            return res.status(404).json({ error: '所选套餐不存在或已下架。' });
        }

        let device = null;
        if (flowType === 'buy_device') {
            device = devices.find((item) => item.id === deviceId && item.status === 'active');
            if (!device) {
                removeTempFile(req.file);
                return res.status(404).json({ error: '所选设备不存在或已下架。' });
            }
            if (
                Array.isArray(device.compatible_plan_ids) &&
                device.compatible_plan_ids.length &&
                !device.compatible_plan_ids.includes(plan.id)
            ) {
                removeTempFile(req.file);
                return res.status(400).json({ error: '该设备暂不支持当前套餐。' });
            }
            if (device.stock < quantity) {
                removeTempFile(req.file);
                return res.status(400).json({ error: `库存不足，当前仅剩 ${device.stock} 台。` });
            }
        }

        if (flowType === 'ship_device' && !deviceBrand && !deviceModel) {
            removeTempFile(req.file);
            return res.status(400).json({ error: '寄设备配卡请至少填写设备品牌或型号。' });
        }
        if (flowType === 'ship_device' && !['yes', 'no', 'unknown'].includes(canInsertCard)) {
            removeTempFile(req.file);
            return res.status(400).json({ error: '请选择设备是否可插卡。' });
        }
        if (flowType === 'ship_device' && !['yes', 'no', 'unknown'].includes(removeControl)) {
            removeTempFile(req.file);
            return res.status(400).json({ error: '请选择设备是否已去控。' });
        }

        const planAmount = Number(plan.setup_price.toFixed(2));
        const deviceAmount = flowType === 'buy_device' && device ? Number((device.price * quantity).toFixed(2)) : 0;
        const serviceAmount = flowType === 'ship_device' ? Number(settings.ship_service_fee.toFixed(2)) : 0;
        const totalAmount = Number((planAmount + deviceAmount + serviceAmount).toFixed(2));

        if (Math.abs(totalAmount - toNumber(req.body.total_amount, totalAmount)) > 0.01) {
            removeTempFile(req.file);
            return res.status(400).json({ error: '订单金额校验失败，请刷新页面后重试。' });
        }

        if (device) {
            device.stock -= quantity;
            await writeDevices(devices);
        }

        const order = {
            id: Date.now(),
            order_no: makeOrderNo(),
            user_id: req.userId,
            flow_type: flowType,
            status: 'pending_payment_review',
            plan_id: plan.id,
            device_id: device ? device.id : null,
            quantity,
            plan_snapshot: {
                name: plan.name,
                monthly_data: plan.monthly_data,
                monthly_price: plan.monthly_price,
                setup_price: plan.setup_price,
                carrier: plan.carrier,
                network_type: plan.network_type,
            },
            device_snapshot: device
                ? {
                      name: device.name,
                      model: device.model,
                      category: device.category,
                      price: device.price,
                      network_type: device.network_type,
                  }
                : null,
            pricing: {
                plan_amount: planAmount,
                device_amount: deviceAmount,
                service_amount: serviceAmount,
                total_amount: totalAmount,
            },
            payment_method: paymentMethod,
            payment_proof: `/uploads/${req.file.filename}`,
            customer_name: customerName,
            customer_phone: customerPhone,
            shipping_address: shippingAddress,
            remark,
            device_submission: {
                brand: deviceBrand,
                model: deviceModel,
                can_insert_card: canInsertCard,
                remove_control: removeControl,
                condition: deviceCondition,
                notes: deviceNotes,
                outbound_tracking: outboundTracking,
            },
            admin_note: '',
            internal_tags: [],
            processing_logs: [],
            logistics_company: '',
            merchant_tracking_number: '',
            created_at: new Date().toISOString(),
            reviewed_at: null,
            shipped_at: null,
            completed_at: null,
            cancelled_at: null,
        };

        appendOrderLog(order, {
            operatorId: req.userId,
            operatorRole: 'user',
            action: '用户提交订单',
            content: `${buildOrderSummary(order)}，已上传付款截图，等待人工审核`,
        });

        orders.push(order);
        await writeOrders(orders);

        res.json({
            success: true,
            order_id: order.id,
            order_no: order.order_no,
            total_amount: totalAmount,
        });
    }),
);

router.get(
    '/',
    auth,
    asyncHandler(async (req, res) => {
        const orders = (await readOrders())
            .filter((order) => order.user_id === req.userId)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map(enrichOrder);

        res.json(orders);
    }),
);

router.put(
    '/:id/cancel',
    auth,
    asyncHandler(async (req, res) => {
        const orderId = toInteger(req.params.id, 0);
        const orders = await readOrders();
        const order = orders.find((item) => item.id === orderId && item.user_id === req.userId);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }
        if (!canUserCancel(order)) {
            return res.status(400).json({ error: '当前订单状态不支持取消。' });
        }

        if (order.flow_type === 'buy_device' && order.device_id) {
            const devices = await readDevices();
            const device = devices.find((item) => item.id === order.device_id);
            if (device) {
                device.stock += order.quantity;
                await writeDevices(devices);
            }
        }

        order.status = 'cancelled';
        order.cancelled_at = new Date().toISOString();
        appendOrderLog(order, {
            operatorId: req.userId,
            operatorRole: 'user',
            action: '用户取消订单',
            content: '用户已主动取消当前订单',
        });
        await writeOrders(orders);

        res.json({ success: true });
    }),
);

router.put(
    '/:id/confirm',
    auth,
    asyncHandler(async (req, res) => {
        const orderId = toInteger(req.params.id, 0);
        const orders = await readOrders();
        const order = orders.find((item) => item.id === orderId && item.user_id === req.userId);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }
        if (order.status !== 'shipped') {
            return res.status(400).json({ error: '只有已发货订单才能确认收货。' });
        }

        order.status = 'completed';
        order.completed_at = new Date().toISOString();
        appendOrderLog(order, {
            operatorId: req.userId,
            operatorRole: 'user',
            action: '用户确认收货',
            content: '用户已确认收到设备',
        });
        await writeOrders(orders);

        res.json({ success: true });
    }),
);

router.put(
    '/:id/payment-proof',
    auth,
    uploadPaymentProof,
    asyncHandler(async (req, res) => {
        const orderId = toInteger(req.params.id, 0);
        const orders = await readOrders();
        const order = orders.find((item) => item.id === orderId && item.user_id === req.userId);

        if (!order) {
            removeTempFile(req.file);
            return res.status(404).json({ error: '订单不存在。' });
        }
        if (!req.file) {
            return res.status(400).json({ error: '请先上传新的付款截图。' });
        }
        if (['cancelled', 'completed'].includes(order.status)) {
            removeTempFile(req.file);
            return res.status(400).json({ error: '当前订单状态不支持重新上传付款截图。' });
        }

        if (order.payment_proof) {
            removePublicFile(order.payment_proof);
        }

        order.payment_proof = `/uploads/${req.file.filename}`;
        if (order.status === 'pending_payment_review') {
            order.reviewed_at = null;
        }
        appendOrderLog(order, {
            operatorId: req.userId,
            operatorRole: 'user',
            action: '补传付款截图',
            content: '用户已重新上传新的付款截图',
        });
        await writeOrders(orders);

        res.json({ success: true, payment_proof: order.payment_proof });
    }),
);

module.exports = router;
