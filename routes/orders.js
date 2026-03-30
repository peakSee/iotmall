const fs = require('fs');
const express = require('express');
const auth = require('../middleware/auth');
const { uploadPaymentProof } = require('../middleware/upload');
const {
    FLOW_TYPES,
    buildOrderSummary,
    commitStoreChanges,
    makeOrderNo,
    publicPathToDisk,
    readDevices,
    readOrders,
    readPlans,
    readSettings,
    toInteger,
    toNumber,
} = require('../utils/store');
const { analyzeTrackQueryResult, getEmsConfig, queryTrackItems, summarizeLatestTrack } = require('../utils/ems');
const { buildStructuredOrderView, buildTrackingNumber, detectLogisticsStage } = require('../utils/order-helpers');
const { buildTenantLimitExceededMessage, buildTenantUsageCounts } = require('../utils/tenant-license');
const {
    buildOrderNoticeSnapshot,
    countUnreadOrderNotices,
    markOrderNoticesRead,
    syncOrderLogisticsUserNotices,
} = require('../utils/user-notices');

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

function canUserUpdateDeviceShipment(order) {
    return (
        order?.flow_type === 'ship_device' &&
        !['cancelled', 'completed'].includes(String(order?.status || '').trim())
    );
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

function safeText(value, fallbackValue = '') {
    return String(value ?? fallbackValue).trim();
}

function preferText(value, fallbackValue = '') {
    return safeText(value) || safeText(fallbackValue);
}

function buildRuntimeEmsConfig(settings = {}) {
    const base = getEmsConfig();
    const logistics = settings?.logistics || {};
    return {
        ...base,
        senderNo: preferText(logistics.sender_no, base.senderNo),
        authorization: preferText(logistics.authorization, base.authorization),
        signKey: preferText(logistics.sign_key, base.signKey),
        senderName: preferText(logistics.sender_name, base.senderName),
        senderPhone: preferText(logistics.sender_phone, base.senderPhone),
        senderPostCode: preferText(logistics.sender_post_code, base.senderPostCode),
        senderProv: preferText(logistics.sender_prov, base.senderProv),
        senderCity: preferText(logistics.sender_city, base.senderCity),
        senderCounty: preferText(logistics.sender_county, base.senderCounty),
        senderAddress: preferText(logistics.sender_address, base.senderAddress),
        bizProductNo: preferText(logistics.biz_product_no, base.bizProductNo),
        bizProductId: preferText(logistics.biz_product_id, base.bizProductId),
        contentsAttribute: preferText(logistics.contents_attribute, base.contentsAttribute),
        defaultWeightGrams: preferText(logistics.default_weight_grams, base.defaultWeightGrams),
        labelType: preferText(logistics.label_type, base.labelType),
        logistics,
    };
}

function buildClientEmsPayload(ems = {}) {
    const source = ems && typeof ems === 'object' ? ems : {};
    return {
        ...source,
        order_payload: null,
        order_response: null,
        label_payload: null,
        label_response: null,
        print_payload: null,
        print_response: null,
        track_payload: null,
        track_response: null,
        parse_payload: null,
        parse_response: null,
        validate_payload: null,
        validate_response: null,
        api_logs: [],
    };
}

function enrichOrder(order) {
    const structuredView = buildStructuredOrderView(order);
    const stage = detectLogisticsStage(order);
    return {
        ...order,
        ems: buildClientEmsPayload(order.ems),
        summary_text: buildOrderSummary(order),
        total_amount: order.pricing.total_amount,
        can_cancel: canUserCancel(order),
        can_confirm: order.status === 'shipped',
        can_update_device_shipment: canUserUpdateDeviceShipment(order),
        tracking_number: buildTrackingNumber(order),
        track_summary: order.ems?.track_summary || '',
        unread_notice_count: countUnreadOrderNotices(order),
        logistics_stage: stage,
        order_structure: structuredView,
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
        const outboundCompany = String(req.body.customer_device_outbound_company || '').trim();
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
            return res.status(400).json({ error: '当前支付方式尚未配置收款码。' });
        }

        const orderLimitMessage = buildTenantLimitExceededMessage(
            'orders',
            req.tenant,
            buildTenantUsageCounts({
                orders: orders.length,
            }),
        );
        if (orderLimitMessage) {
            removeTempFile(req.file);
            return res.status(403).json({ error: orderLimitMessage });
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
            return res.status(400).json({ error: '寄设备配卡至少要填写品牌或型号。' });
        }
        if (flowType === 'ship_device' && !['yes', 'no', 'unknown'].includes(canInsertCard)) {
            removeTempFile(req.file);
            return res.status(400).json({ error: '请选择设备是否可插卡。' });
        }
        if (flowType === 'ship_device' && !['yes', 'no', 'unknown'].includes(removeControl)) {
            removeTempFile(req.file);
            return res.status(400).json({ error: '请选择设备是否已去控。' });
        }

        const planDisplayAmount = Number(plan.setup_price.toFixed(2));
        const planAmount = 0;
        const planDiscountAmount = planDisplayAmount;
        const deviceAmount = flowType === 'buy_device' && device ? Number((device.price * quantity).toFixed(2)) : 0;
        const serviceAmount = flowType === 'ship_device' ? Number(settings.ship_service_fee.toFixed(2)) : 0;
        const totalAmount = Number((planAmount + deviceAmount + serviceAmount).toFixed(2));

        if (Math.abs(totalAmount - toNumber(req.body.total_amount, totalAmount)) > 0.01) {
            removeTempFile(req.file);
            return res.status(400).json({ error: '订单金额校验失败，请刷新后重试。' });
        }

        const order = {
            id: Date.now(),
            tenant_id: req.tenant?.id,
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
                plan_display_amount: planDisplayAmount,
                plan_discount_amount: planDiscountAmount,
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
                outbound_company: outboundCompany,
                outbound_tracking: outboundTracking,
            },
            admin_note: '',
            internal_tags: [],
            processing_logs: [],
            logistics_company: '',
            merchant_tracking_number: '',
            ems: {
                address_parse_source: shippingAddress,
                receiver: {
                    name: customerName,
                    mobile: customerPhone,
                },
            },
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

        await commitStoreChanges({
            devices: device
                ? [
                      {
                          ...device,
                          stock: device.stock - quantity,
                      },
                  ]
                : [],
            orders: [order],
        });

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
        const sourceOrders = (await readOrders()).filter((order) => order.user_id === req.userId);
        const changedOrders = [];

        sourceOrders.forEach((order) => {
            const previousSnapshot = buildOrderNoticeSnapshot({});
            const { createdNotices } = syncOrderLogisticsUserNotices(order, {
                previousSnapshot,
            });
            if (createdNotices.length) {
                changedOrders.push(order);
            }
        });

        if (changedOrders.length) {
            await commitStoreChanges({
                orders: changedOrders,
            });
        }

        const orders = sourceOrders
            .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
            .map(enrichOrder);

        res.json(orders);
    }),
);

router.put(
    '/:id/cancel',
    auth,
    asyncHandler(async (req, res) => {
        const orderId = toInteger(req.params.id, 0);
        const order = (await readOrders()).find((item) => item.id === orderId && item.user_id === req.userId);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }
        if (!canUserCancel(order)) {
            return res.status(400).json({ error: '当前订单状态不支持取消。' });
        }

        order.status = 'cancelled';
        order.cancelled_at = new Date().toISOString();
        appendOrderLog(order, {
            operatorId: req.userId,
            operatorRole: 'user',
            action: '用户取消订单',
            content: '用户主动取消了当前订单',
        });

        let updatedDevice = null;
        if (order.flow_type === 'buy_device' && order.device_id) {
            const device = (await readDevices()).find((item) => item.id === order.device_id);
            if (device) {
                updatedDevice = {
                    ...device,
                    stock: device.stock + order.quantity,
                };
            }
        }

        await commitStoreChanges({
            devices: updatedDevice ? [updatedDevice] : [],
            orders: [order],
        });

        res.json({ success: true });
    }),
);

router.put(
    '/:id/confirm',
    auth,
    asyncHandler(async (req, res) => {
        const orderId = toInteger(req.params.id, 0);
        const order = (await readOrders()).find((item) => item.id === orderId && item.user_id === req.userId);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }
        if (order.status !== 'shipped') {
            return res.status(400).json({ error: '只有已发货订单才可以确认收货。' });
        }

        order.status = 'completed';
        order.completed_at = new Date().toISOString();
        appendOrderLog(order, {
            operatorId: req.userId,
            operatorRole: 'user',
            action: '用户确认收货',
            content: '用户已确认收到设备',
        });

        await commitStoreChanges({
            orders: [order],
        });

        res.json({ success: true });
    }),
);

router.put(
    '/:id/device-shipment',
    auth,
    asyncHandler(async (req, res) => {
        const orderId = toInteger(req.params.id, 0);
        const order = (await readOrders()).find((item) => item.id === orderId && item.user_id === req.userId);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }
        if (!canUserUpdateDeviceShipment(order)) {
            return res.status(400).json({ error: '当前订单状态不支持修改寄出快递信息。' });
        }

        const outboundCompany = String(req.body.outbound_company ?? req.body.customer_device_outbound_company ?? '').trim();
        const outboundTracking = String(req.body.outbound_tracking ?? req.body.customer_device_tracking ?? '').trim();

        order.device_submission = {
            ...(order.device_submission || {}),
            outbound_company: outboundCompany,
            outbound_tracking: outboundTracking,
        };

        appendOrderLog(order, {
            operatorId: req.userId,
            operatorRole: 'user',
            action: '补充寄出快递信息',
            content: `快递公司：${outboundCompany || '未填'}；单号：${outboundTracking || '未填'}`,
        });

        await commitStoreChanges({
            orders: [order],
        });

        res.json({
            success: true,
            device_submission: order.device_submission,
        });
    }),
);

router.put(
    '/:id/payment-proof',
    auth,
    uploadPaymentProof,
    asyncHandler(async (req, res) => {
        const orderId = toInteger(req.params.id, 0);
        const order = (await readOrders()).find((item) => item.id === orderId && item.user_id === req.userId);

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
            content: '用户重新上传了新的付款截图',
        });

        await commitStoreChanges({
            orders: [order],
        });

        res.json({ success: true, payment_proof: order.payment_proof });
    }),
);

router.post(
    '/:id/ems/tracks/sync',
    auth,
    asyncHandler(async (req, res) => {
        const orderId = toInteger(req.params.id, 0);
        const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
        const order = orders.find((item) => item.id === orderId && item.user_id === req.userId);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        const trackingNumber = order.merchant_tracking_number || order.ems?.waybill_no;
        if (!trackingNumber) {
            return res.status(400).json({ error: '当前订单还没有快递单号。' });
        }

        try {
            const previousNoticeSnapshot = buildOrderNoticeSnapshot(order);
            const runtimeConfig = buildRuntimeEmsConfig(settings);
            const { response, items } = await queryTrackItems(trackingNumber, order.ems?.tracking_direction || '0', {
                config: runtimeConfig,
            });
            const trackResult = analyzeTrackQueryResult(response, items);
            if (trackResult.suspiciousEmpty) {
                const error = new Error(trackResult.message);
                error.response = response;
                throw error;
            }
            order.ems = {
                ...order.ems,
                last_serial_no: response.serialNo || order.ems?.last_serial_no || '',
                last_error: '',
                track_items: trackResult.items,
                track_summary: summarizeLatestTrack(trackResult.items),
                last_track_sync_at: new Date().toISOString(),
                auto_track_sync_failure_streak: 0,
                auto_track_sync_last_error: '',
                auto_track_sync_last_success_at: new Date().toISOString(),
            };
            syncOrderLogisticsUserNotices(order, {
                previousSnapshot: previousNoticeSnapshot,
                markAsRead: true,
            });

            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: 'user',
                action: '刷新物流轨迹',
                content: items.length ? `已同步 ${items.length} 条 EMS 轨迹` : '当前暂无新的 EMS 轨迹',
            });

            await commitStoreChanges({
                orders: [order],
            });

            res.json({
                success: true,
                tracks: order.ems.track_items,
                track_summary: order.ems.track_summary,
                last_track_sync_at: order.ems.last_track_sync_at,
            });
        } catch (error) {
            order.ems = {
                ...order.ems,
                last_error: error?.response?.retMsg || error?.message || 'EMS 轨迹同步失败',
                last_serial_no: error?.response?.serialNo || order.ems?.last_serial_no || '',
            };
            await commitStoreChanges({
                orders: [order],
            });
            return res.status(400).json({ error: order.ems.last_error });
        }
    }),
);

router.post(
    '/:id/notices/read',
    auth,
    asyncHandler(async (req, res) => {
        const orderId = toInteger(req.params.id, 0);
        const orders = await readOrders();
        const order = orders.find((item) => item.id === orderId && item.user_id === req.userId);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        const noticeIds = Array.isArray(req.body.notice_ids) ? req.body.notice_ids : [];
        const { changed, center, unreadCount } = markOrderNoticesRead(order, {
            noticeIds,
            readAll: req.body.read_all !== false,
        });

        if (changed) {
            await commitStoreChanges({
                orders: [order],
            });
        }

        res.json({
            success: true,
            changed,
            unread_notice_count: unreadCount,
            user_notice_center: center,
        });
    }),
);

router.post(
    '/notices/read-all',
    auth,
    asyncHandler(async (req, res) => {
        const orders = (await readOrders()).filter((item) => item.user_id === req.userId);
        const changedOrders = [];
        let unreadCount = 0;

        orders.forEach((order) => {
            const result = markOrderNoticesRead(order, {
                readAll: true,
            });
            unreadCount += result.unreadCount;
            if (result.changed) {
                changedOrders.push(order);
            }
        });

        if (changedOrders.length) {
            await commitStoreChanges({
                orders: changedOrders,
            });
        }

        res.json({
            success: true,
            changed_order_count: changedOrders.length,
            unread_notice_count: unreadCount,
        });
    }),
);

module.exports = router;
