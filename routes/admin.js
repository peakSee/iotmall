const fs = require('fs');
const express = require('express');
const auth = require('../middleware/auth');
const { uploadEntityImage, uploadPaymentQrs } = require('../middleware/upload');
const { verifyPassword } = require('../utils/auth');
const {
    DEVICE_CATEGORIES,
    ORDER_STATUSES,
    buildOrderSummary,
    commitStoreChanges,
    deleteDevice,
    deletePlan,
    makeSlug,
    normalizeDevice,
    normalizePlan,
    publicPathToDisk,
    readDevices,
    readOrders,
    readPlans,
    readSettings,
    readUsers,
    saveDevice,
    savePlan,
    saveUser,
    toInteger,
    toNumber,
    toStringArray,
    writeSettings,
} = require('../utils/store');
const {
    assertPrintPreflight,
    checkReachability,
    createWaybillOrder,
    dispatchPrintJob,
    extractAddressDetail,
    formatTimestamp,
    getCloudPrintDownloadUrl,
    getEmsConfig,
    getPrintDiagnostics,
    getLabelDocument,
    normalizePartyAddress,
    parseAddress,
    queryTrackItems,
    summarizeLatestTrack,
    validatePartyAddress,
} = require('../utils/ems');
const {
    buildOrderNoticeSnapshot,
    syncOrderLogisticsUserNotices,
} = require('../utils/user-notices');

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

function safeText(value, fallbackValue = '') {
    return String(value ?? fallbackValue).trim();
}

function preferText(value, fallbackValue = '') {
    return safeText(value) || safeText(fallbackValue);
}

function toNullableBoolean(value) {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return null;
}

function compactAuditValue(value, depth = 0) {
    if (value == null) {
        return null;
    }
    if (depth > 4) {
        return '[depth-limit]';
    }
    if (typeof value === 'string') {
        return value.length > 800 ? `${value.slice(0, 800)}...[${value.length} chars]` : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.slice(0, 20).map((item) => compactAuditValue(item, depth + 1));
    }
    if (typeof value === 'object') {
        return Object.entries(value).reduce((result, [key, item]) => {
            if (key === 'rawText') {
                result[key] = compactAuditValue(item, depth + 1);
                return result;
            }
            result[key] = compactAuditValue(item, depth + 1);
            return result;
        }, {});
    }
    return safeText(value);
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
        printMode: preferText(logistics.preferred_print_mode, base.printMode).toLowerCase(),
        printerName: preferText(logistics.preferred_printer, base.printerName),
        sumatraPath: preferText(logistics.sumatra_path, base.sumatraPath),
        paperName: preferText(logistics.paper_name, base.paperName),
        paperWidthMm: preferText(logistics.paper_width_mm, base.paperWidthMm),
        paperHeightMm: preferText(logistics.paper_height_mm, base.paperHeightMm),
        logistics,
    };
}

function appendEmsAudit(
    order,
    {
        action = '',
        status = 'success',
        request = null,
        response = null,
        retCode = '',
        retMsg = '',
        serialNo = '',
    } = {},
) {
    order.ems = order.ems || {};
    order.ems.api_logs = Array.isArray(order.ems.api_logs) ? order.ems.api_logs : [];
    const entry = {
        action: safeText(action),
        status: safeText(status, 'success'),
        time: new Date().toISOString(),
        ret_code: safeText(retCode),
        ret_msg: safeText(retMsg),
        serial_no: safeText(serialNo),
        request: compactAuditValue(request),
        response: compactAuditValue(response),
    };

    order.ems.api_logs = [...order.ems.api_logs, entry].slice(-15);
    order.ems.last_action = entry.action;
    order.ems.last_action_at = entry.time;
    return entry;
}

function summarizeEmsIssue(order, staleHours = 24) {
    const ems = order?.ems || {};
    if (safeText(ems.last_error)) {
        return safeText(ems.last_error);
    }
    if (safeText(ems.waybill_no) && !safeText(ems.label_file)) {
        return '已建单但未取面单';
    }
    if (safeText(ems.label_file) && !ems.printed_at) {
        if (ems.print_attempted_at) {
            return ems.print_status === 'open' || ems.print_status === 'browser' ? '已打开面单待确认打印' : '已发起打印待确认';
        }
        return '面单已生成但尚未打印';
    }
    if (safeText(ems.waybill_no)) {
        const lastSyncAt = ems.last_track_sync_at ? new Date(ems.last_track_sync_at).getTime() : 0;
        const staleMs = Math.max(1, Number(staleHours || 24)) * 60 * 60 * 1000;
        if (!lastSyncAt || Date.now() - lastSyncAt > staleMs) {
            return '轨迹待同步';
        }
    }
    return '';
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
    };
}

function enrichOrder(order, users, settings = {}) {
    const user = users.find((item) => item.id === order.user_id);
    const runtimeConfig = buildRuntimeEmsConfig(settings);
    const emsIssueSummary = summarizeEmsIssue(order, settings?.logistics?.track_stale_hours || 24);
    return {
        ...order,
        ems: buildClientEmsPayload(order.ems),
        user_phone: user?.phone || '未知用户',
        summary_text: buildOrderSummary(order),
        total_amount: order.pricing.total_amount,
        tracking_number: order.ems?.waybill_no || order.merchant_tracking_number || '',
        cloud_print_default_printer: runtimeConfig.printerName,
        preferred_print_mode: runtimeConfig.printMode,
        cloud_print_download_url: getCloudPrintDownloadUrl(),
        ems_issue_summary: emsIssueSummary,
    };
}

function normalizeEmsCandidatePayload(rawCandidate = {}) {
    return {
        whole_address: safeText(rawCandidate.whole_address ?? rawCandidate.wholeAddress),
        prov: safeText(rawCandidate.prov ?? rawCandidate.provName),
        city: safeText(rawCandidate.city ?? rawCandidate.cityName),
        county: safeText(rawCandidate.county ?? rawCandidate.countyName),
        address: safeText(rawCandidate.address),
        pro_code: safeText(rawCandidate.pro_code ?? rawCandidate.proCode),
        city_code: safeText(rawCandidate.city_code ?? rawCandidate.cityCode),
        county_code: safeText(rawCandidate.county_code ?? rawCandidate.countyCode),
        district_code: safeText(rawCandidate.district_code ?? rawCandidate.districtCode),
    };
}

function normalizeEmsPartyPayload(rawParty = {}, fallbackValue = {}) {
    const source = rawParty && typeof rawParty === 'object' ? rawParty : {};
    return {
        name: safeText(source.name, fallbackValue.name),
        mobile: safeText(source.mobile, fallbackValue.mobile),
        phone: safeText(source.phone, fallbackValue.phone),
        post_code: safeText(source.post_code ?? source.postCode, fallbackValue.post_code),
        prov: safeText(source.prov, fallbackValue.prov),
        city: safeText(source.city, fallbackValue.city),
        county: safeText(source.county, fallbackValue.county),
        address: safeText(source.address, fallbackValue.address),
    };
}

function normalizeEmsTrackPayload(rawTrack = {}) {
    const source = rawTrack && typeof rawTrack === 'object' ? rawTrack : {};
    return {
        waybill_no: safeText(source.waybill_no ?? source.waybillNo),
        op_time: safeText(source.op_time ?? source.opTime),
        op_code: safeText(source.op_code ?? source.opCode),
        op_name: safeText(source.op_name ?? source.opName),
        op_desc: safeText(source.op_desc ?? source.opDesc),
        op_org_prov_name: safeText(source.op_org_prov_name ?? source.opOrgProvName),
        op_org_city: safeText(source.op_org_city ?? source.opOrgCity),
        op_org_code: safeText(source.op_org_code ?? source.opOrgCode),
        op_org_name: safeText(source.op_org_name ?? source.opOrgName),
        operator_no: safeText(source.operator_no ?? source.operatorNo),
        operator_name: safeText(source.operator_name ?? source.operatorName),
        deliver_code: safeText(source.deliver_code ?? source.deliverCode),
        attempt_delivery_code: safeText(source.attempt_delivery_code ?? source.attemptDeliveryCode),
        product_name: safeText(source.product_name ?? source.productName),
    };
}

const EMS_WORKFLOW_STEP_KEYS = ['parse', 'validate', 'create', 'label', 'print', 'track'];
const EMS_WORKFLOW_ACTIVE_STATUSES = ['queued', 'running'];
const EMS_TRACK_AUTO_SYNC_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const emsWorkflowQueue = [];
let emsWorkflowProcessing = false;
let emsTrackAutoSyncTimer = null;
let emsTrackAutoSyncRunning = false;

function buildDefaultWorkflowTaskSteps() {
    return {
        parse: { status: 'idle', message: '', updated_at: null },
        validate: { status: 'idle', message: '', updated_at: null },
        create: { status: 'idle', message: '', updated_at: null },
        label: { status: 'idle', message: '', updated_at: null },
        print: { status: 'idle', message: '', updated_at: null },
        track: { status: 'idle', message: '', updated_at: null },
    };
}

function resolveTrackAutoSyncIntervalHours(settings = {}) {
    return Math.max(1, toInteger(settings?.logistics?.track_auto_sync_interval_hours, 4));
}

function normalizeWorkflowTaskStepPayload(rawStep = {}, fallbackValue = {}) {
    const source = rawStep && typeof rawStep === 'object' ? rawStep : {};
    return {
        status: safeText(source.status, fallbackValue.status || 'idle'),
        message: safeText(source.message, fallbackValue.message),
        updated_at: source.updated_at || source.updatedAt || fallbackValue.updated_at || fallbackValue.updatedAt || null,
    };
}

function normalizeWorkflowTaskPayload(rawTask = {}, fallbackValue = null) {
    if (!rawTask && !fallbackValue) {
        return null;
    }

    const source = rawTask && typeof rawTask === 'object' ? rawTask : {};
    const fallbackSource = fallbackValue && typeof fallbackValue === 'object' ? fallbackValue : {};
    const defaultSteps = buildDefaultWorkflowTaskSteps();
    const rawSteps = source.steps && typeof source.steps === 'object' ? source.steps : {};
    const fallbackSteps = fallbackSource.steps && typeof fallbackSource.steps === 'object' ? fallbackSource.steps : {};

    return {
        id: safeText(source.id, fallbackSource.id),
        mode: safeText(source.mode, fallbackSource.mode || 'single'),
        status: safeText(source.status, fallbackSource.status || 'idle'),
        current_step: safeText(source.current_step ?? source.currentStep, fallbackSource.current_step),
        error: safeText(source.error, fallbackSource.error),
        include_track:
            toNullableBoolean(source.include_track ?? source.includeTrack) === null
                ? fallbackSource.include_track ?? true
                : toNullableBoolean(source.include_track ?? source.includeTrack),
        initiator_id: toInteger(source.initiator_id ?? source.initiatorId, fallbackSource.initiator_id || 0),
        initiator_role: safeText(source.initiator_role ?? source.initiatorRole, fallbackSource.initiator_role),
        enqueued_at: source.enqueued_at || source.enqueuedAt || fallbackSource.enqueued_at || null,
        started_at: source.started_at || source.startedAt || fallbackSource.started_at || null,
        finished_at: source.finished_at || source.finishedAt || fallbackSource.finished_at || null,
        updated_at: source.updated_at || source.updatedAt || fallbackSource.updated_at || null,
        steps: EMS_WORKFLOW_STEP_KEYS.reduce((result, key) => {
            result[key] = normalizeWorkflowTaskStepPayload(rawSteps[key], fallbackSteps[key] || defaultSteps[key]);
            return result;
        }, {}),
    };
}

function normalizeAdminEmsPayload(rawEms = {}, fallbackValue = {}) {
    const source = rawEms && typeof rawEms === 'object' ? rawEms : {};
    return {
        ...fallbackValue,
        address_parse_source: safeText(source.address_parse_source ?? source.addressParseSource, fallbackValue.address_parse_source),
        address_parse_candidates: Array.isArray(source.address_parse_candidates ?? source.addressParseCandidates)
            ? (source.address_parse_candidates ?? source.addressParseCandidates).map(normalizeEmsCandidatePayload)
            : Array.isArray(fallbackValue.address_parse_candidates)
              ? fallbackValue.address_parse_candidates
              : [],
        receiver: normalizeEmsPartyPayload(source.receiver, fallbackValue.receiver),
        sender: normalizeEmsPartyPayload(source.sender, fallbackValue.sender),
        ecommerce_user_id: safeText(source.ecommerce_user_id ?? source.ecommerceUserId, fallbackValue.ecommerce_user_id),
        logistics_order_no: safeText(source.logistics_order_no ?? source.logisticsOrderNo, fallbackValue.logistics_order_no),
        waybill_no: safeText(source.waybill_no ?? source.waybillNo, fallbackValue.waybill_no),
        route_code: safeText(source.route_code ?? source.routeCode, fallbackValue.route_code),
        package_code: safeText(source.package_code ?? source.packageCode, fallbackValue.package_code),
        package_code_name: safeText(source.package_code_name ?? source.packageCodeName, fallbackValue.package_code_name),
        mark_destination_code: safeText(
            source.mark_destination_code ?? source.markDestinationCode,
            fallbackValue.mark_destination_code,
        ),
        mark_destination_name: safeText(
            source.mark_destination_name ?? source.markDestinationName,
            fallbackValue.mark_destination_name,
        ),
        biz_product_no: safeText(source.biz_product_no ?? source.bizProductNo, fallbackValue.biz_product_no),
        biz_product_id: safeText(source.biz_product_id ?? source.bizProductId, fallbackValue.biz_product_id),
        contents_attribute: safeText(source.contents_attribute ?? source.contentsAttribute, fallbackValue.contents_attribute),
        package_weight: safeText(source.package_weight ?? source.packageWeight, fallbackValue.package_weight),
        label_type: safeText(source.label_type ?? source.labelType, fallbackValue.label_type),
        label_url: safeText(source.label_url ?? source.labelUrl, fallbackValue.label_url),
        label_file: safeText(source.label_file ?? source.labelFile, fallbackValue.label_file),
        label_generated_at: source.label_generated_at || source.labelGeneratedAt || fallbackValue.label_generated_at || null,
        address_parsed_at: fallbackValue.address_parsed_at || null,
        waybill_created_at: fallbackValue.waybill_created_at || null,
        label_requested_at: fallbackValue.label_requested_at || null,
        print_status: safeText(source.print_status ?? source.printStatus, fallbackValue.print_status),
        print_mode: safeText(fallbackValue.print_mode),
        print_message: safeText(source.print_message ?? source.printMessage, fallbackValue.print_message),
        print_attempted_at: fallbackValue.print_attempted_at || null,
        printed_at: source.printed_at || source.printedAt || fallbackValue.printed_at || null,
        last_serial_no: safeText(source.last_serial_no ?? source.lastSerialNo, fallbackValue.last_serial_no),
        last_error: safeText(source.last_error ?? source.lastError, fallbackValue.last_error),
        last_action: safeText(fallbackValue.last_action),
        last_action_at: fallbackValue.last_action_at || null,
        reachable:
            toNullableBoolean(source.reachable) === null ? fallbackValue.reachable ?? null : toNullableBoolean(source.reachable),
        reachable_message: safeText(source.reachable_message ?? source.reachableMessage, fallbackValue.reachable_message),
        reachable_checked_at:
            source.reachable_checked_at || source.reachableCheckedAt || fallbackValue.reachable_checked_at || null,
        tracking_direction: safeText(source.tracking_direction ?? source.trackingDirection, fallbackValue.tracking_direction || '0'),
        track_summary: safeText(source.track_summary ?? source.trackSummary, fallbackValue.track_summary),
        track_items: Array.isArray(source.track_items ?? source.trackItems)
            ? (source.track_items ?? source.trackItems).map(normalizeEmsTrackPayload)
            : Array.isArray(fallbackValue.track_items)
              ? fallbackValue.track_items
              : [],
        last_track_sync_at: source.last_track_sync_at || source.lastTrackSyncAt || fallbackValue.last_track_sync_at || null,
        auto_track_sync_failure_streak: Math.max(
            0,
            toInteger(
                source.auto_track_sync_failure_streak ?? source.autoTrackSyncFailureStreak,
                fallbackValue.auto_track_sync_failure_streak || 0,
            ),
        ),
        auto_track_sync_last_failed_at:
            source.auto_track_sync_last_failed_at ||
            source.autoTrackSyncLastFailedAt ||
            fallbackValue.auto_track_sync_last_failed_at ||
            null,
        auto_track_sync_last_success_at:
            source.auto_track_sync_last_success_at ||
            source.autoTrackSyncLastSuccessAt ||
            fallbackValue.auto_track_sync_last_success_at ||
            null,
        auto_track_sync_last_error: safeText(
            source.auto_track_sync_last_error ?? source.autoTrackSyncLastError,
            fallbackValue.auto_track_sync_last_error,
        ),
        api_logs: Array.isArray(fallbackValue.api_logs) ? fallbackValue.api_logs : [],
        workflow_task: normalizeWorkflowTaskPayload(source.workflow_task ?? source.workflowTask, fallbackValue.workflow_task),
        order_payload: fallbackValue.order_payload ?? null,
        order_response: fallbackValue.order_response ?? null,
        label_payload: fallbackValue.label_payload ?? null,
        label_response: fallbackValue.label_response ?? null,
        print_payload: fallbackValue.print_payload ?? null,
        print_response: fallbackValue.print_response ?? null,
        track_payload: fallbackValue.track_payload ?? null,
        track_response: fallbackValue.track_response ?? null,
        parse_payload: fallbackValue.parse_payload ?? null,
        parse_response: fallbackValue.parse_response ?? null,
        validate_payload: fallbackValue.validate_payload ?? null,
        validate_response: fallbackValue.validate_response ?? null,
    };
}

function truncateText(value, maxLength) {
    const text = safeText(value);
    if (!maxLength || text.length <= maxLength) return text;
    return text.slice(0, maxLength);
}

function buildTrackingNumber(order) {
    return safeText(order.ems?.waybill_no || order.merchant_tracking_number);
}

function buildCargoName(order) {
    if (order.flow_type === 'ship_device') {
        const modelText = [order.device_submission?.brand, order.device_submission?.model].filter(Boolean).join(' ');
        return truncateText(modelText || '用户寄送设备配卡回寄', 50);
    }
    return truncateText(order.device_snapshot?.name || order.plan_snapshot?.name || '设备配卡商品', 50);
}

function buildCargoList(order, config = getEmsConfig()) {
    return [
        {
            cargoName: buildCargoName(order),
            cargoCategory: truncateText(order.plan_snapshot?.name || '设备配卡', 50),
            cargoQuantity: Math.max(1, toInteger(order.quantity, 1)),
            cargoValue: Number(order.pricing?.total_amount || 0),
            cargoWeight: Number(order.ems?.package_weight || config.defaultWeightGrams || '500'),
        },
    ];
}

function buildEmsRemark(order) {
    const parts = [
        `订单:${order.order_no}`,
        `商品:${buildOrderSummary(order)}`,
        order.remark ? `备注:${order.remark}` : '',
    ].filter(Boolean);
    return truncateText(parts.join('；'), 200);
}

function applyParsedAddressToOrder(order, wholeAddress, candidates = []) {
    const firstCandidate = candidates[0] || null;
    order.ems = {
        ...order.ems,
        address_parse_source: safeText(wholeAddress, order.shipping_address),
        address_parse_candidates: candidates.map(normalizeEmsCandidatePayload),
        receiver: {
            ...order.ems.receiver,
            name: safeText(order.ems.receiver?.name, order.customer_name),
            mobile: safeText(order.ems.receiver?.mobile, order.customer_phone),
            prov: safeText(firstCandidate?.prov, order.ems.receiver?.prov),
            city: safeText(firstCandidate?.city, order.ems.receiver?.city),
            county: safeText(firstCandidate?.county, order.ems.receiver?.county),
            address: safeText(
                firstCandidate ? extractAddressDetail(wholeAddress, firstCandidate) : order.ems.receiver?.address,
                order.ems.receiver?.address,
            ),
            post_code: safeText(order.ems.receiver?.post_code),
            phone: safeText(order.ems.receiver?.phone),
        },
        last_error: firstCandidate ? '' : safeText(order.ems.last_error),
    };
    return firstCandidate;
}

function receiverHasFullAddress(order) {
    return Boolean(order.ems?.receiver?.prov && order.ems?.receiver?.city && order.ems?.receiver?.county && order.ems?.receiver?.address);
}

function buildReachabilityPayload(order, sender, receiver, config = getEmsConfig()) {
    return {
        baseProductNo: preferText(order.ems?.biz_product_no, config.bizProductNo),
        bizProductId: safeText(order.ems?.biz_product_id, config.bizProductId),
        contentsAttribute: preferText(order.ems?.contents_attribute, config.contentsAttribute),
        receiverProv: receiver.prov,
        receiverCity: receiver.city,
        receiverCounty: receiver.county,
        receiverAddress: receiver.address,
        senderProv: sender.prov,
        senderCity: sender.city,
        senderCounty: sender.county,
        senderAddress: sender.address,
        weight: preferText(order.ems?.package_weight, config.defaultWeightGrams),
    };
}

async function resolveSenderFromSettings(settings, existingSender = {}, config = buildRuntimeEmsConfig(settings)) {
    const sender = {
        name: preferText(existingSender.name, config.senderName || settings.shop_receiving_name),
        mobile: preferText(existingSender.mobile, config.senderPhone || settings.shop_receiving_phone),
        phone: safeText(existingSender.phone),
        postCode: preferText(existingSender.post_code, config.senderPostCode),
        prov: preferText(existingSender.prov, config.senderProv),
        city: preferText(existingSender.city, config.senderCity),
        county: preferText(existingSender.county, config.senderCounty),
        address: preferText(existingSender.address, config.senderAddress),
    };

    const sourceAddress = safeText(config.senderAddress || settings.shop_receiving_address || existingSender.address);
    if ((!sender.prov || !sender.city || !sender.county || !sender.address) && sourceAddress) {
        const candidates = await parseAddress(sourceAddress, { config });
        const firstCandidate = candidates[0];
        if (firstCandidate) {
            sender.prov = sender.prov || firstCandidate.prov;
            sender.city = sender.city || firstCandidate.city;
            sender.county = sender.county || firstCandidate.county;
            sender.address = sender.address || extractAddressDetail(sourceAddress, firstCandidate);
        }
    }

    return normalizePartyAddress(sender);
}

function persistEmsFailure(order, error, { action = '', request = null, response = null } = {}) {
    const baseMessage = safeText(error?.response?.retMsg || error?.message || 'EMS 操作失败');
    const retCode = safeText(error?.response?.retCode || error?.code);
    const serialNo = safeText(error?.response?.serialNo);
    const diagnostics = [
        retCode ? `代码:${retCode}` : '',
        serialNo ? `流水号:${serialNo}` : '',
    ].filter(Boolean);
    const errorMessage = diagnostics.length ? `${baseMessage}（${diagnostics.join(' / ')}）` : baseMessage;
    order.ems = {
        ...order.ems,
        last_error: errorMessage,
        last_serial_no: safeText(error?.response?.serialNo, order.ems?.last_serial_no),
    };
    appendEmsAudit(order, {
        action,
        status: 'error',
        request,
        response: response || error?.response || { message: safeText(error?.message) },
        retCode,
        retMsg: baseMessage,
        serialNo,
    });
    return errorMessage;
}

function countConsecutiveAuditFailures(order, actions = []) {
    const actionSet = new Set((Array.isArray(actions) ? actions : [actions]).map((item) => safeText(item)).filter(Boolean));
    const logs = Array.isArray(order?.ems?.api_logs) ? order.ems.api_logs : [];
    const matchedLogs = logs.filter((log) => actionSet.has(safeText(log.action)));
    let failureCount = 0;

    for (let index = matchedLogs.length - 1; index >= 0; index -= 1) {
        const status = safeText(matchedLogs[index].status, 'success');
        if (status === 'error') {
            failureCount += 1;
            continue;
        }
        break;
    }

    return failureCount;
}

function buildConsecutiveFailureOrders(orders, actions = [], threshold = 2) {
    return orders
        .map((order) => {
            const failureCount = countConsecutiveAuditFailures(order, actions);
            if (failureCount < threshold) {
                return null;
            }

            const logs = Array.isArray(order?.ems?.api_logs) ? order.ems.api_logs : [];
            const actionSet = new Set((Array.isArray(actions) ? actions : [actions]).map((item) => safeText(item)).filter(Boolean));
            const lastMatchedLog = [...logs].reverse().find((log) => actionSet.has(safeText(log.action))) || null;

            return {
                id: order.id,
                order_no: order.order_no,
                customer_name: order.customer_name,
                waybill_no: safeText(order.ems?.waybill_no || order.merchant_tracking_number),
                failure_count: failureCount,
                last_action: safeText(lastMatchedLog?.action || order.ems?.last_action),
                last_action_at: lastMatchedLog?.time || order.ems?.last_action_at || null,
                last_message: safeText(lastMatchedLog?.ret_msg || order.ems?.last_error),
            };
        })
        .filter(Boolean)
        .sort((left, right) => right.failure_count - left.failure_count || new Date(right.last_action_at || 0) - new Date(left.last_action_at || 0));
}

function buildAutoTrackSyncFailureOrders(orders, threshold = 2) {
    return orders
        .map((order) => {
            const streak = Math.max(0, toInteger(order?.ems?.auto_track_sync_failure_streak, 0));
            if (streak < threshold) {
                return null;
            }

            return {
                id: order.id,
                order_no: order.order_no,
                customer_name: order.customer_name,
                waybill_no: safeText(order.ems?.waybill_no || order.merchant_tracking_number),
                failure_count: streak,
                last_action_at: order.ems?.auto_track_sync_last_failed_at || order.ems?.last_action_at || null,
                last_message: safeText(order.ems?.auto_track_sync_last_error || order.ems?.last_error),
            };
        })
        .filter(Boolean)
        .sort((left, right) => right.failure_count - left.failure_count || new Date(right.last_action_at || 0) - new Date(left.last_action_at || 0));
}

function createRequestError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function resolveWorkflowActor(actor = {}) {
    return {
        userId: toInteger(actor.userId ?? actor.id ?? actor.operatorId, 0),
        userRole: safeText(actor.userRole ?? actor.role ?? actor.operatorRole, 'system'),
    };
}

async function loadAdminOrderContext(orderId, rawEms = undefined) {
    const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
    const order = orders.find((item) => item.id === toInteger(orderId, 0));

    if (!order) {
        throw createRequestError('订单不存在。', 404);
    }

    order.ems = normalizeAdminEmsPayload(rawEms, order.ems);
    return {
        orders,
        settings,
        order,
        runtimeConfig: buildRuntimeEmsConfig(settings),
    };
}

async function runEmsParseAddressStepById(orderId, { rawEms = undefined, wholeAddress = '', actor = {} } = {}) {
    const { order, runtimeConfig } = await loadAdminOrderContext(orderId, rawEms);
    const normalizedActor = resolveWorkflowActor(actor);
    const targetAddress = safeText(wholeAddress, order.shipping_address);

    if (!targetAddress) {
        throw createRequestError('请先填写收件地址后再解析。');
    }

    try {
        const candidates = await parseAddress(targetAddress, { config: runtimeConfig });

        if (!candidates.length) {
            order.ems = {
                ...order.ems,
                address_parse_source: targetAddress,
                address_parse_candidates: [],
                address_parsed_at: new Date().toISOString(),
                parse_payload: { wholeAddress: targetAddress },
                parse_response: { candidates: [] },
                last_error: 'EMS 地址解析未命中，请手工补全省市区。',
            };
            appendEmsAudit(order, {
                action: 'parse-address',
                status: 'error',
                request: { wholeAddress: targetAddress },
                response: { candidates: [] },
                retMsg: order.ems.last_error,
            });
            await commitStoreChanges({ orders: [order] });
            throw createRequestError('EMS 地址解析未命中，请手工补全省市区。');
        }

        const firstCandidate = applyParsedAddressToOrder(order, targetAddress, candidates);
        order.ems = {
            ...order.ems,
            address_parsed_at: new Date().toISOString(),
            parse_payload: { wholeAddress: targetAddress },
            parse_response: { candidates },
            last_error: '',
        };
        appendEmsAudit(order, {
            action: 'parse-address',
            request: { wholeAddress: targetAddress },
            response: { candidates },
            retMsg: '地址解析成功',
        });
        appendOrderLog(order, {
            operatorId: normalizedActor.userId,
            operatorRole: normalizedActor.userRole,
            action: 'EMS地址解析',
            content: `已解析为 ${firstCandidate.prov}${firstCandidate.city}${firstCandidate.county}`,
        });

        await commitStoreChanges({ orders: [order] });
        return {
            order,
            receiver: order.ems.receiver,
            candidates: order.ems.address_parse_candidates,
            message: `已解析为 ${firstCandidate.prov}${firstCandidate.city}${firstCandidate.county}`,
        };
    } catch (error) {
        if (error.statusCode) {
            throw error;
        }

        const errorMessage = persistEmsFailure(order, error, {
            action: 'parse-address',
            request: { wholeAddress: targetAddress },
        });
        order.ems = {
            ...order.ems,
            address_parse_source: targetAddress,
            address_parse_candidates: [],
            parse_payload: { wholeAddress: targetAddress },
            parse_response: compactAuditValue(error?.response || { message: safeText(error?.message) }),
        };
        await commitStoreChanges({ orders: [order] });
        throw createRequestError(errorMessage);
    }
}

async function runEmsValidateStepById(orderId, { rawEms = undefined, actor = {} } = {}) {
    const { order, settings, runtimeConfig } = await loadAdminOrderContext(orderId, rawEms);
    const normalizedActor = resolveWorkflowActor(actor);

    try {
        if (!receiverHasFullAddress(order)) {
            const candidates = await parseAddress(order.ems?.address_parse_source || order.shipping_address, {
                config: runtimeConfig,
            });
            if (!candidates.length) {
                throw new Error('收件地址还没有解析成功，请先解析或手工补全。');
            }
            applyParsedAddressToOrder(order, order.ems?.address_parse_source || order.shipping_address, candidates);
        }

        const receiver = validatePartyAddress(
            {
                ...order.ems.receiver,
                name: order.ems.receiver?.name || order.customer_name,
                mobile: order.ems.receiver?.mobile || order.customer_phone,
                postCode: order.ems.receiver?.post_code,
            },
            '收件地址',
        );
        const sender = validatePartyAddress(
            await resolveSenderFromSettings(settings, order.ems?.sender || {}, runtimeConfig),
            '寄件地址',
        );
        const validatePayload = buildReachabilityPayload(order, sender, receiver, runtimeConfig);

        const response = await checkReachability(validatePayload, { config: runtimeConfig });
        order.ems = {
            ...order.ems,
            sender: normalizeEmsPartyPayload({ ...sender, post_code: sender.postCode }, order.ems.sender),
            receiver: normalizeEmsPartyPayload({ ...receiver, post_code: receiver.postCode }, order.ems.receiver),
            reachable: true,
            reachable_message: safeText(response.retMsg, '该地址信息可达！'),
            reachable_checked_at: new Date().toISOString(),
            last_serial_no: safeText(response.serialNo, order.ems.last_serial_no),
            last_error: '',
            validate_payload: validatePayload,
            validate_response: compactAuditValue(response),
        };
        appendEmsAudit(order, {
            action: 'validate',
            request: validatePayload,
            response,
            retCode: response.retCode,
            retMsg: response.retMsg,
            serialNo: response.serialNo,
        });

        appendOrderLog(order, {
            operatorId: normalizedActor.userId,
            operatorRole: normalizedActor.userRole,
            action: 'EMS可达校验',
            content: order.ems.reachable_message || 'EMS 收寄地址校验通过',
        });

        await commitStoreChanges({ orders: [order] });
        return {
            order,
            reachable: order.ems.reachable,
            reachable_message: order.ems.reachable_message,
            receiver: order.ems.receiver,
            sender: order.ems.sender,
            message: order.ems.reachable_message || 'EMS 收寄地址校验通过',
        };
    } catch (error) {
        order.ems = {
            ...order.ems,
            reachable: false,
            reachable_message: persistEmsFailure(order, error, {
                action: 'validate',
                request: order.ems?.validate_payload || null,
            }),
            reachable_checked_at: new Date().toISOString(),
            validate_response: compactAuditValue(error?.response || { message: safeText(error?.message) }),
        };
        await commitStoreChanges({ orders: [order] });
        throw createRequestError(order.ems.reachable_message);
    }
}

async function runEmsCreateStepById(orderId, { rawEms = undefined, actor = {} } = {}) {
    const { order, settings, runtimeConfig } = await loadAdminOrderContext(orderId, rawEms);
    const normalizedActor = resolveWorkflowActor(actor);
    const previousNoticeSnapshot = buildOrderNoticeSnapshot(order);

    if (order.status === 'cancelled') {
        throw createRequestError('已取消订单不能创建 EMS 运单。');
    }
    if (safeText(order.ems?.waybill_no)) {
        throw createRequestError('当前订单已经生成 EMS 运单号。');
    }

    try {
        if (!receiverHasFullAddress(order)) {
            const candidates = await parseAddress(order.ems?.address_parse_source || order.shipping_address, {
                config: runtimeConfig,
            });
            if (!candidates.length) {
                throw new Error('收件地址还没有解析成功，请先解析或手工补全。');
            }
            applyParsedAddressToOrder(order, order.ems?.address_parse_source || order.shipping_address, candidates);
        }

        const receiver = validatePartyAddress(
            {
                ...order.ems.receiver,
                name: order.ems.receiver?.name || order.customer_name,
                mobile: order.ems.receiver?.mobile || order.customer_phone,
                postCode: order.ems.receiver?.post_code,
            },
            '收件地址',
        );
        const sender = validatePartyAddress(
            await resolveSenderFromSettings(settings, order.ems?.sender || {}, runtimeConfig),
            '寄件地址',
        );

        const reachablePayload = buildReachabilityPayload(order, sender, receiver, runtimeConfig);
        const reachableResponse = await checkReachability(reachablePayload, { config: runtimeConfig });
        const logisticsOrderNo = order.order_no;
        const orderPayload = {
            ecommerceUserId: preferText(order.ems?.ecommerce_user_id, `${order.order_no}-${order.id}`),
            logisticsOrderNo,
            createdTime: formatTimestamp(),
            senderNo: runtimeConfig.senderNo,
            contentsAttribute: preferText(order.ems?.contents_attribute, runtimeConfig.contentsAttribute),
            bizProductNo: preferText(order.ems?.biz_product_no, runtimeConfig.bizProductNo),
            bizProductId: safeText(order.ems?.biz_product_id, runtimeConfig.bizProductId),
            weight: Number(preferText(order.ems?.package_weight, runtimeConfig.defaultWeightGrams)),
            remarks: buildEmsRemark(order),
            sender,
            receiver,
            cargos: buildCargoList(order, runtimeConfig),
        };

        const { response, body } = await createWaybillOrder(orderPayload, { config: runtimeConfig });
        const waybillNo = safeText(body.waybillNo);
        if (!waybillNo) {
            throw new Error('EMS 建单成功但未返回运单号。');
        }

        order.ems = {
            ...order.ems,
            sender: normalizeEmsPartyPayload({ ...sender, post_code: sender.postCode }, order.ems.sender),
            receiver: normalizeEmsPartyPayload({ ...receiver, post_code: receiver.postCode }, order.ems.receiver),
            reachable: true,
            reachable_message: safeText(reachableResponse.retMsg, '该地址信息可达！'),
            reachable_checked_at: new Date().toISOString(),
            ecommerce_user_id: orderPayload.ecommerceUserId,
            logistics_order_no: preferText(body.logisticsOrderNo, logisticsOrderNo),
            waybill_no: waybillNo,
            route_code: safeText(body.routeCode),
            package_code: safeText(body.packageCode),
            package_code_name: safeText(body.packageCodeName),
            mark_destination_code: safeText(body.markDestinationCode),
            mark_destination_name: safeText(body.markDestinationName),
            biz_product_no: preferText(orderPayload.bizProductNo, runtimeConfig.bizProductNo),
            biz_product_id: safeText(orderPayload.bizProductId),
            contents_attribute: preferText(orderPayload.contentsAttribute, runtimeConfig.contentsAttribute),
            package_weight: preferText(orderPayload.weight, runtimeConfig.defaultWeightGrams),
            last_serial_no: safeText(response.serialNo, order.ems.last_serial_no),
            last_error: '',
            waybill_created_at: new Date().toISOString(),
            validate_payload: reachablePayload,
            validate_response: compactAuditValue(reachableResponse),
            order_payload: orderPayload,
            order_response: compactAuditValue(response),
        };
        order.logistics_company = 'EMS';
        order.merchant_tracking_number = waybillNo;
        appendEmsAudit(order, {
            action: 'create',
            request: orderPayload,
            response,
            retCode: response.retCode,
            retMsg: response.retMsg,
            serialNo: response.serialNo,
        });

        appendOrderLog(order, {
            operatorId: normalizedActor.userId,
            operatorRole: normalizedActor.userRole,
            action: 'EMS建单成功',
            content: `已获取 EMS 运单号 ${waybillNo}`,
        });
        syncOrderLogisticsUserNotices(order, {
            previousSnapshot: previousNoticeSnapshot,
        });

        await commitStoreChanges({ orders: [order] });
        return {
            order,
            tracking_number: order.merchant_tracking_number,
            waybill_no: order.ems.waybill_no,
            message: `EMS 单号已生成：${waybillNo}`,
        };
    } catch (error) {
        const errorMessage = persistEmsFailure(order, error, {
            action: 'create',
            request: order.ems?.order_payload || null,
        });
        await commitStoreChanges({ orders: [order] });
        throw createRequestError(errorMessage);
    }
}

async function runEmsLabelStepById(orderId, { rawEms = undefined, actor = {} } = {}) {
    const { order, runtimeConfig } = await loadAdminOrderContext(orderId, rawEms);
    const normalizedActor = resolveWorkflowActor(actor);
    const waybillNo = buildTrackingNumber(order);

    if (!waybillNo) {
        throw createRequestError('请先创建 EMS 运单后再获取面单。');
    }

    try {
        const labelPayload = {
            orderNo: order.order_no,
            waybillNo,
            type: preferText(order.ems?.label_type, runtimeConfig.labelType),
        };
        const label = await getLabelDocument(
            {
                orderNo: labelPayload.orderNo,
                waybillNo: labelPayload.waybillNo,
                type: labelPayload.type,
            },
            { config: runtimeConfig },
        );

        order.ems = {
            ...order.ems,
            waybill_no: waybillNo,
            label_type: label.labelType,
            label_url: safeText(label.labelUrl),
            label_file: safeText(label.labelFile),
            label_generated_at: new Date().toISOString(),
            label_requested_at: new Date().toISOString(),
            last_serial_no: safeText(label.response.serialNo, order.ems.last_serial_no),
            last_error: '',
            label_payload: labelPayload,
            label_response: compactAuditValue(label.response),
        };
        appendEmsAudit(order, {
            action: 'label',
            request: labelPayload,
            response: label.response,
            retCode: label.response.retCode,
            retMsg: label.response.retMsg,
            serialNo: label.response.serialNo,
        });

        appendOrderLog(order, {
            operatorId: normalizedActor.userId,
            operatorRole: normalizedActor.userRole,
            action: '获取EMS面单',
            content: `已生成面单文件 ${order.ems.label_file}`,
        });

        await commitStoreChanges({ orders: [order] });
        return {
            order,
            label_file: order.ems.label_file,
            label_url: order.ems.label_url,
            cloud_print_download_url: getCloudPrintDownloadUrl(),
            message: order.ems.label_file ? 'EMS 面单已生成' : 'EMS 面单已返回',
        };
    } catch (error) {
        const errorMessage = persistEmsFailure(order, error, {
            action: 'label',
            request: order.ems?.label_payload || {
                orderNo: order.order_no,
                waybillNo,
                type: preferText(order.ems?.label_type, runtimeConfig.labelType),
            },
        });
        await commitStoreChanges({ orders: [order] });
        throw createRequestError(errorMessage);
    }
}

async function runEmsPrintStepById(orderId, { rawEms = undefined, actor = {} } = {}) {
    const { order, runtimeConfig } = await loadAdminOrderContext(orderId, rawEms);
    const normalizedActor = resolveWorkflowActor(actor);
    const previousNoticeSnapshot = buildOrderNoticeSnapshot(order);

    try {
        if (!safeText(order.ems?.label_file)) {
            const waybillNo = buildTrackingNumber(order);
            if (!waybillNo) {
                throw new Error('请先创建 EMS 运单并生成面单。');
            }

            const label = await getLabelDocument(
                {
                    orderNo: order.order_no,
                    waybillNo,
                    type: preferText(order.ems?.label_type, runtimeConfig.labelType),
                },
                { config: runtimeConfig },
            );

            order.ems = {
                ...order.ems,
                label_type: label.labelType,
                label_url: safeText(label.labelUrl),
                label_file: safeText(label.labelFile),
                label_generated_at: new Date().toISOString(),
                label_requested_at: new Date().toISOString(),
                last_serial_no: safeText(label.response.serialNo, order.ems.last_serial_no),
                last_error: '',
                label_payload: {
                    orderNo: order.order_no,
                    waybillNo,
                    type: preferText(order.ems?.label_type, runtimeConfig.labelType),
                },
                label_response: compactAuditValue(label.response),
            };
            appendEmsAudit(order, {
                action: 'label',
                request: order.ems.label_payload,
                response: label.response,
                retCode: label.response.retCode,
                retMsg: label.response.retMsg,
                serialNo: label.response.serialNo,
            });
        }

        const printPayload = {
            labelFile: order.ems.label_file,
            printerName: runtimeConfig.printerName,
            mode: runtimeConfig.printMode,
            paperName: runtimeConfig.paperName,
            paperWidthMm: runtimeConfig.paperWidthMm,
            paperHeightMm: runtimeConfig.paperHeightMm,
            labelType: preferText(order.ems?.label_type, runtimeConfig.labelType),
        };
        const printDiagnostics = await assertPrintPreflight({ config: runtimeConfig });
        appendEmsAudit(order, {
            action: 'print-preflight',
            request: printPayload,
            response: printDiagnostics,
            retMsg: '打印前自检通过',
        });

        const printResult = await dispatchPrintJob(order.ems.label_file, { config: runtimeConfig });
        order.ems = {
            ...order.ems,
            print_status: printResult.dispatched ? 'queued' : printResult.mode || 'browser',
            print_mode: safeText(printResult.mode, runtimeConfig.printMode),
            print_message: safeText(printResult.message),
            print_attempted_at: new Date().toISOString(),
            printed_at: printResult.dispatched ? new Date().toISOString() : order.ems.printed_at,
            last_error: '',
            print_payload: printPayload,
            print_response: compactAuditValue({
                ...printResult,
                preflight: printDiagnostics.preflight,
            }),
        };
        appendEmsAudit(order, {
            action: 'print',
            request: printPayload,
            response: {
                ...printResult,
                preflight: printDiagnostics.preflight,
            },
            retMsg: printResult.message,
        });

        appendOrderLog(order, {
            operatorId: normalizedActor.userId,
            operatorRole: normalizedActor.userRole,
            action: '打印EMS面单',
            content: order.ems.print_message || '已触发 EMS 面单打印',
        });
        syncOrderLogisticsUserNotices(order, {
            previousSnapshot: previousNoticeSnapshot,
        });

        await commitStoreChanges({ orders: [order] });
        return {
            order,
            ...printResult,
            label_file: order.ems.label_file,
            cloud_print_download_url: getCloudPrintDownloadUrl(),
            message: printResult.message || '打印任务已发送',
        };
    } catch (error) {
        const errorMessage = persistEmsFailure(order, error, {
            action: error?.code === 'PRINT_PREFLIGHT' ? 'print-preflight' : 'print',
            request: order.ems?.print_payload || {
                labelFile: order.ems?.label_file,
                printerName: runtimeConfig.printerName,
                mode: runtimeConfig.printMode,
                paperName: runtimeConfig.paperName,
                paperWidthMm: runtimeConfig.paperWidthMm,
                paperHeightMm: runtimeConfig.paperHeightMm,
                labelType: preferText(order.ems?.label_type, runtimeConfig.labelType),
            },
        });
        await commitStoreChanges({ orders: [order] });
        throw createRequestError(errorMessage);
    }
}

async function runEmsTrackSyncStepById(orderId, { rawEms = undefined, actor = {} } = {}) {
    const { order, runtimeConfig } = await loadAdminOrderContext(orderId, rawEms);
    const normalizedActor = resolveWorkflowActor(actor);
    const waybillNo = buildTrackingNumber(order);
    const previousNoticeSnapshot = buildOrderNoticeSnapshot(order);

    if (!waybillNo) {
        throw createRequestError('当前订单还没有 EMS 运单号。');
    }

    try {
        const trackPayload = {
            waybillNo,
            direction: order.ems?.tracking_direction || '0',
        };
        const { response, items } = await queryTrackItems(waybillNo, trackPayload.direction, { config: runtimeConfig });
        order.ems = {
            ...order.ems,
            waybill_no: waybillNo,
            track_items: items.map(normalizeEmsTrackPayload),
            track_summary: summarizeLatestTrack(items),
            last_track_sync_at: new Date().toISOString(),
            last_serial_no: safeText(response.serialNo, order.ems.last_serial_no),
            last_error: '',
            track_payload: trackPayload,
            track_response: compactAuditValue(response),
        };
        order.ems.auto_track_sync_failure_streak = 0;
        order.ems.auto_track_sync_last_error = '';
        order.ems.auto_track_sync_last_success_at = new Date().toISOString();
        order.logistics_company = order.logistics_company || 'EMS';
        order.merchant_tracking_number = order.merchant_tracking_number || waybillNo;
        appendEmsAudit(order, {
            action: 'track-sync',
            request: trackPayload,
            response,
            retCode: response.retCode,
            retMsg: response.retMsg,
            serialNo: response.serialNo,
        });

        appendOrderLog(order, {
            operatorId: normalizedActor.userId,
            operatorRole: normalizedActor.userRole,
            action: '同步EMS轨迹',
            content: items.length ? `已同步 ${items.length} 条 EMS 轨迹` : '当前暂无 EMS 轨迹',
        });
        syncOrderLogisticsUserNotices(order, {
            previousSnapshot: previousNoticeSnapshot,
            markAsRead: normalizedActor.userRole === 'user',
        });

        await commitStoreChanges({ orders: [order] });
        return {
            order,
            tracks: order.ems.track_items,
            track_summary: order.ems.track_summary,
            last_track_sync_at: order.ems.last_track_sync_at,
            message: order.ems.track_summary || (items.length ? `已同步 ${items.length} 条 EMS 轨迹` : '当前暂无 EMS 轨迹'),
        };
    } catch (error) {
        const errorMessage = persistEmsFailure(order, error, {
            action: 'track-sync',
            request: order.ems?.track_payload || {
                waybillNo,
                direction: order.ems?.tracking_direction || '0',
            },
        });
        if (normalizedActor.userRole === 'system-auto') {
            order.ems = {
                ...order.ems,
                auto_track_sync_failure_streak: Math.max(0, toInteger(order.ems?.auto_track_sync_failure_streak, 0)) + 1,
                auto_track_sync_last_failed_at: new Date().toISOString(),
                auto_track_sync_last_error: errorMessage,
            };
        }
        await commitStoreChanges({ orders: [order] });
        throw createRequestError(errorMessage);
    }
}

function isWorkflowTaskActive(task = null) {
    return Boolean(task && EMS_WORKFLOW_ACTIVE_STATUSES.includes(safeText(task.status)));
}

function createWorkflowTask({ mode = 'single', includeTrack = true, initiatorId = 0, initiatorRole = 'system' } = {}) {
    const now = new Date().toISOString();
    return {
        id: `emswf-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        mode: safeText(mode, 'single'),
        status: 'queued',
        current_step: '',
        error: '',
        include_track: includeTrack !== false,
        initiator_id: toInteger(initiatorId, 0),
        initiator_role: safeText(initiatorRole, 'system'),
        enqueued_at: now,
        started_at: null,
        finished_at: null,
        updated_at: now,
        steps: buildDefaultWorkflowTaskSteps(),
    };
}

async function loadOrderForWorkflow(orderId) {
    const orders = await readOrders();
    const order = orders.find((item) => item.id === toInteger(orderId, 0));
    if (!order) {
        throw createRequestError('订单不存在。', 404);
    }
    order.ems = normalizeAdminEmsPayload(order.ems, order.ems);
    return order;
}

async function updateWorkflowTaskByOrderId(orderId, taskId, updater) {
    const orders = await readOrders();
    const order = orders.find((item) => item.id === toInteger(orderId, 0));

    if (!order) {
        return null;
    }

    order.ems = normalizeAdminEmsPayload(order.ems, order.ems);
    const currentTask = normalizeWorkflowTaskPayload(order.ems.workflow_task, order.ems.workflow_task);

    if (!currentTask || safeText(currentTask.id) !== safeText(taskId)) {
        return null;
    }

    const nextTask = normalizeWorkflowTaskPayload(updater(currentTask, order), currentTask);
    order.ems = {
        ...order.ems,
        workflow_task: nextTask,
    };
    await commitStoreChanges({ orders: [order] });
    return order;
}

async function updateWorkflowTaskStep(orderId, taskId, stepKey, status, message = '', overallPatch = {}) {
    return updateWorkflowTaskByOrderId(orderId, taskId, (task) => ({
        ...task,
        ...overallPatch,
        updated_at: new Date().toISOString(),
        steps: {
            ...(task.steps || buildDefaultWorkflowTaskSteps()),
            [stepKey]: {
                ...((task.steps || buildDefaultWorkflowTaskSteps())[stepKey] || {}),
                status: safeText(status, 'idle'),
                message: safeText(message),
                updated_at: new Date().toISOString(),
            },
        },
    }));
}

function buildQueuedWorkflowStepDefinitions(task = {}) {
    const actor = {
        userId: task.initiator_id,
        userRole: task.initiator_role || 'system',
    };

    return [
        {
            key: 'parse',
            shouldSkip: (order) => Boolean(order.ems?.address_parsed_at && receiverHasFullAddress(order)),
            skipMessage: '已有解析结果，本步已跳过',
            run: (orderId) => runEmsParseAddressStepById(orderId, { actor }),
            getMessage: (result) => result.message || '地址解析成功',
        },
        {
            key: 'validate',
            shouldSkip: () => false,
            run: (orderId) => runEmsValidateStepById(orderId, { actor }),
            getMessage: (result) => result.message || '可达校验通过',
        },
        {
            key: 'create',
            shouldSkip: (order) => Boolean(buildTrackingNumber(order)),
            skipMessage: (order) => `已存在单号 ${buildTrackingNumber(order)}，已跳过建单`,
            run: (orderId) => runEmsCreateStepById(orderId, { actor }),
            getMessage: (result) => result.message || 'EMS 单号已生成',
        },
        {
            key: 'label',
            shouldSkip: (order) => Boolean(order.ems?.label_file),
            skipMessage: () => '已有面单文件，已跳过获取',
            run: (orderId) => runEmsLabelStepById(orderId, { actor }),
            getMessage: (result) => result.message || 'EMS 面单已生成',
        },
        {
            key: 'print',
            shouldSkip: () => false,
            run: (orderId) => runEmsPrintStepById(orderId, { actor }),
            getMessage: (result) => result.message || '打印任务已发送',
            getStatus: (result) => (['browser', 'open'].includes(safeText(result.mode).toLowerCase()) ? 'pending' : 'success'),
        },
        {
            key: 'track',
            shouldSkip: (order, currentTask) => currentTask.include_track === false || !buildTrackingNumber(order),
            skipMessage: (order, currentTask) =>
                currentTask.include_track === false ? '本次未执行轨迹同步' : '暂无运单号，已跳过轨迹同步',
            run: (orderId) => runEmsTrackSyncStepById(orderId, { actor }),
            getMessage: (result) => result.message || '轨迹已同步',
        },
    ];
}

async function processEmsWorkflowTask(job = {}) {
    const orderId = toInteger(job.orderId, 0);
    const taskId = safeText(job.taskId);

    if (!orderId || !taskId) {
        return;
    }

    let order = await updateWorkflowTaskByOrderId(orderId, taskId, (task) => ({
        ...task,
        status: 'running',
        started_at: task.started_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        current_step: '',
        error: '',
    }));

    if (!order) {
        return;
    }

    const currentTask = normalizeWorkflowTaskPayload(order.ems.workflow_task, order.ems.workflow_task);
    const stepDefinitions = buildQueuedWorkflowStepDefinitions(currentTask);

    for (const step of stepDefinitions) {
        order = await loadOrderForWorkflow(orderId);
        const latestTask = normalizeWorkflowTaskPayload(order.ems.workflow_task, order.ems.workflow_task);

        if (!latestTask || safeText(latestTask.id) !== taskId || latestTask.status !== 'running') {
            return;
        }

        if (step.shouldSkip(order, latestTask)) {
            const skipMessage = typeof step.skipMessage === 'function' ? step.skipMessage(order, latestTask) : step.skipMessage;
            await updateWorkflowTaskStep(orderId, taskId, step.key, 'skipped', skipMessage, {
                current_step: '',
            });
            continue;
        }

        await updateWorkflowTaskStep(orderId, taskId, step.key, 'running', '执行中', {
            current_step: step.key,
            status: 'running',
            error: '',
        });

        try {
            const result = await step.run(orderId);
            const nextStatus = typeof step.getStatus === 'function' ? step.getStatus(result, order) : 'success';
            const nextMessage = typeof step.getMessage === 'function' ? step.getMessage(result, order) : step.label || '已完成';
            await updateWorkflowTaskStep(orderId, taskId, step.key, nextStatus, nextMessage, {
                current_step: '',
                status: 'running',
            });
        } catch (error) {
            const errorMessage = safeText(error?.message, '后台任务执行失败');
            await updateWorkflowTaskStep(orderId, taskId, step.key, 'error', errorMessage, {
                current_step: '',
                status: 'failed',
                error: errorMessage,
                finished_at: new Date().toISOString(),
            });
            return;
        }
    }

    await updateWorkflowTaskByOrderId(orderId, taskId, (task) => ({
        ...task,
        status: 'completed',
        current_step: '',
        error: '',
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }));
}

async function flushEmsWorkflowQueue() {
    if (emsWorkflowProcessing) {
        return;
    }

    emsWorkflowProcessing = true;
    try {
        while (emsWorkflowQueue.length) {
            const job = emsWorkflowQueue.shift();
            try {
                await processEmsWorkflowTask(job);
            } catch (error) {
                console.error('[ems-workflow-queue] task failed', error);
            }
        }
    } finally {
        emsWorkflowProcessing = false;
    }
}

async function enqueueWorkflowForOrder(orderId, { includeTrack = true, initiatorId = 0, initiatorRole = 'system', mode = 'single' } = {}) {
    const orders = await readOrders();
    const order = orders.find((item) => item.id === toInteger(orderId, 0));

    if (!order) {
        throw createRequestError('订单不存在。', 404);
    }

    order.ems = normalizeAdminEmsPayload(order.ems, order.ems);
    const existingTask = normalizeWorkflowTaskPayload(order.ems.workflow_task, order.ems.workflow_task);
    if (isWorkflowTaskActive(existingTask)) {
        return {
            task: existingTask,
            alreadyQueued: true,
        };
    }

    const task = createWorkflowTask({
        mode,
        includeTrack,
        initiatorId,
        initiatorRole,
    });
    order.ems = {
        ...order.ems,
        workflow_task: task,
    };
    await commitStoreChanges({ orders: [order] });

    emsWorkflowQueue.push({
        orderId: order.id,
        taskId: task.id,
    });
    setTimeout(() => {
        void flushEmsWorkflowQueue();
    }, 0);

    return {
        task,
        alreadyQueued: false,
    };
}

async function recoverEmsWorkflowQueueOnStartup() {
    const orders = await readOrders();
    const interruptedOrders = [];
    let requeuedCount = 0;
    let interruptedCount = 0;

    for (const order of orders) {
        order.ems = normalizeAdminEmsPayload(order.ems, order.ems);
        const task = normalizeWorkflowTaskPayload(order.ems.workflow_task, order.ems.workflow_task);

        if (!isWorkflowTaskActive(task)) {
            continue;
        }

        if (task.status === 'queued') {
            const exists = emsWorkflowQueue.some((job) => job.orderId === order.id && safeText(job.taskId) === safeText(task.id));
            if (!exists) {
                emsWorkflowQueue.push({
                    orderId: order.id,
                    taskId: task.id,
                });
                requeuedCount += 1;
            }
            continue;
        }

        const now = new Date().toISOString();
        const nextSteps = {
            ...(task.steps || buildDefaultWorkflowTaskSteps()),
        };

        if (task.current_step && nextSteps[task.current_step]?.status === 'running') {
            nextSteps[task.current_step] = {
                ...nextSteps[task.current_step],
                status: 'error',
                message: '服务重启导致任务中断，请点击重试',
                updated_at: now,
            };
        }

        order.ems = {
            ...order.ems,
            workflow_task: {
                ...task,
                status: 'failed',
                current_step: '',
                error: '服务重启导致后台任务中断，请点击重试',
                finished_at: now,
                updated_at: now,
                steps: nextSteps,
            },
        };
        interruptedOrders.push(order);
        interruptedCount += 1;
    }

    if (interruptedOrders.length) {
        await commitStoreChanges({ orders: interruptedOrders });
    }

    if (emsWorkflowQueue.length) {
        setTimeout(() => {
            void flushEmsWorkflowQueue();
        }, 0);
    }

    if (requeuedCount || interruptedCount) {
        console.log(
            `[ems-workflow-queue] startup recovery completed: requeued=${requeuedCount}, interrupted=${interruptedCount}`,
        );
    }

    return {
        requeuedCount,
        interruptedCount,
    };
}

function shouldAutoSyncTrackForOrder(order, settings = {}, now = Date.now()) {
    if (!settings?.logistics?.auto_sync_tracks) {
        return false;
    }

    if (!order || ['cancelled', 'completed'].includes(order.status)) {
        return false;
    }

    order.ems = normalizeAdminEmsPayload(order.ems, order.ems);
    const workflowTask = normalizeWorkflowTaskPayload(order.ems.workflow_task, order.ems.workflow_task);
    if (isWorkflowTaskActive(workflowTask)) {
        return false;
    }

    const trackingNumber = buildTrackingNumber(order);
    if (!trackingNumber) {
        return false;
    }

    const intervalMs = resolveTrackAutoSyncIntervalHours(settings) * 60 * 60 * 1000;
    const lastSyncAt = order.ems?.last_track_sync_at ? new Date(order.ems.last_track_sync_at).getTime() : 0;
    const lastFailedAt = order.ems?.auto_track_sync_last_failed_at ? new Date(order.ems.auto_track_sync_last_failed_at).getTime() : 0;
    const lastAttemptAt = Math.max(lastSyncAt, lastFailedAt);

    return !lastAttemptAt || now - lastAttemptAt >= intervalMs;
}

async function runEmsTrackAutoSyncSweep({ reason = 'interval' } = {}) {
    if (emsTrackAutoSyncRunning) {
        return {
            reason,
            skipped: true,
            message: '上一轮 EMS 轨迹自动同步仍在执行',
        };
    }

    emsTrackAutoSyncRunning = true;
    try {
        const settings = await readSettings();
        if (!settings?.logistics?.auto_sync_tracks) {
            return {
                reason,
                disabled: true,
                message: 'EMS 轨迹自动同步未开启',
            };
        }

        const orders = await readOrders();
        const now = Date.now();
        const candidates = orders.filter((order) => shouldAutoSyncTrackForOrder(order, settings, now));
        let successCount = 0;
        let failedCount = 0;

        for (const order of candidates) {
            try {
                await runEmsTrackSyncStepById(order.id, {
                    actor: {
                        userId: 0,
                        userRole: 'system-auto',
                    },
                });
                successCount += 1;
            } catch (error) {
                failedCount += 1;
                console.error(`[ems-track-auto-sync] order ${order.order_no || order.id} failed`, error);
            }
        }

        if (candidates.length || failedCount) {
            console.log(
                `[ems-track-auto-sync] sweep completed: reason=${reason}, interval_hours=${resolveTrackAutoSyncIntervalHours(settings)}, candidates=${candidates.length}, success=${successCount}, failed=${failedCount}`,
            );
        }

        return {
            reason,
            candidates: candidates.length,
            successCount,
            failedCount,
            intervalHours: resolveTrackAutoSyncIntervalHours(settings),
        };
    } finally {
        emsTrackAutoSyncRunning = false;
    }
}

function startEmsTrackAutoSyncScheduler({ checkIntervalMs = EMS_TRACK_AUTO_SYNC_CHECK_INTERVAL_MS } = {}) {
    if (emsTrackAutoSyncTimer) {
        return false;
    }

    const scheduleHandle = setInterval(() => {
        void runEmsTrackAutoSyncSweep({ reason: 'interval' });
    }, Math.max(60 * 1000, Number(checkIntervalMs) || EMS_TRACK_AUTO_SYNC_CHECK_INTERVAL_MS));

    if (typeof scheduleHandle.unref === 'function') {
        scheduleHandle.unref();
    }

    const startupHandle = setTimeout(() => {
        void runEmsTrackAutoSyncSweep({ reason: 'startup' });
    }, 15 * 1000);

    if (typeof startupHandle.unref === 'function') {
        startupHandle.unref();
    }

    emsTrackAutoSyncTimer = scheduleHandle;
    console.log('[ems-track-auto-sync] scheduler started');
    return true;
}

function filterOrders(orders, users, settings = {}, { q = '', status = '', flowType = '', dateFrom = '', dateTo = '' } = {}) {
    let nextOrders = orders
        .map((order) => enrichOrder(order, users, settings))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

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
    if (!plan.name) return '请填写套餐名称';
    if (!plan.monthly_data) return '请填写套餐流量说明，或填写“以图片为准”';
    if (plan.monthly_price < 0) return '月费参考价不能小于 0';
    if (plan.setup_price < 0) return '配卡服务费不能小于 0。';
    return null;
}

function validateDevice(device) {
    if (!device.name) return '请填写设备名称';
    if (!DEVICE_CATEGORIES.includes(device.category)) return '设备分类无效';
    if (device.price <= 0) return '设备售价必须大于 0';
    return null;
}

router.get(
    '/dashboard',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const [plans, devices, orders, users, settings] = await Promise.all([
            readPlans(),
            readDevices(),
            readOrders(),
            readUsers(),
            readSettings(),
        ]);

        const activePlans = plans.filter((item) => item.status === 'active');
        const activeDevices = devices.filter((item) => item.status === 'active');
        const totalRevenue = orders
            .filter((order) => order.status !== 'cancelled')
            .reduce((sum, order) => sum + Number(order.pricing?.total_amount || 0), 0);
        const staleHours = Math.max(1, Number(settings?.logistics?.track_stale_hours || 24));
        const emsErrorOrders = orders.filter((order) => safeText(order.ems?.last_error));
        const emsPendingLabelOrders = orders.filter((order) => safeText(order.ems?.waybill_no) && !safeText(order.ems?.label_file));
        const emsPendingPrintOrders = orders.filter((order) => safeText(order.ems?.label_file) && !order.ems?.printed_at);
        const emsStaleTrackOrders = orders.filter((order) => {
            if (!safeText(order.ems?.waybill_no)) return false;
            const syncedAt = order.ems?.last_track_sync_at ? new Date(order.ems.last_track_sync_at).getTime() : 0;
            return !syncedAt || Date.now() - syncedAt > staleHours * 60 * 60 * 1000;
        });
        const emsConsecutiveCreateFailureOrders = buildConsecutiveFailureOrders(orders, ['create']);
        const emsConsecutivePrintFailureOrders = buildConsecutiveFailureOrders(orders, ['print', 'print-preflight']);
        const emsConsecutiveTrackFailureOrders = buildConsecutiveFailureOrders(orders, ['track-sync']);
        const emsAutoTrackSyncFailureOrders = buildAutoTrackSyncFailureOrders(orders, 2);
        const emsConsecutiveCreateFailures = emsConsecutiveCreateFailureOrders.slice(0, 5);
        const emsConsecutivePrintFailures = emsConsecutivePrintFailureOrders.slice(0, 5);
        const emsConsecutiveTrackFailures = emsConsecutiveTrackFailureOrders.slice(0, 5);
        const emsAutoTrackSyncFailures = emsAutoTrackSyncFailureOrders.slice(0, 5);
        const emsProblemOrders = orders
            .map((order) => ({
                order,
                issue: summarizeEmsIssue(order, staleHours),
            }))
            .filter((item) => item.issue)
            .slice(0, 6)
            .map(({ order, issue }) => ({
                id: order.id,
                order_no: order.order_no,
                customer_name: order.customer_name,
                customer_phone: order.customer_phone,
                waybill_no: safeText(order.ems?.waybill_no || order.merchant_tracking_number),
                last_action: safeText(order.ems?.last_action),
                last_action_at: order.ems?.last_action_at || null,
                issue,
            }));

        res.json({
            plan_count: activePlans.length,
            device_count: activeDevices.length,
            order_count: orders.length,
            user_count: users.length,
            total_revenue: Number(totalRevenue.toFixed(2)),
            pending_count: orders.filter((order) => order.status === 'pending_payment_review').length,
            ship_device_count: orders.filter((order) => order.flow_type === 'ship_device').length,
            buy_device_count: orders.filter((order) => order.flow_type === 'buy_device').length,
            ems_error_count: emsErrorOrders.length,
            ems_pending_label_count: emsPendingLabelOrders.length,
            ems_pending_print_count: emsPendingPrintOrders.length,
            ems_stale_track_count: emsStaleTrackOrders.length,
            ems_consecutive_create_fail_count: emsConsecutiveCreateFailureOrders.length,
            ems_consecutive_print_fail_count: emsConsecutivePrintFailureOrders.length,
            ems_consecutive_track_fail_count: emsConsecutiveTrackFailureOrders.length,
            ems_consecutive_create_fail_orders: emsConsecutiveCreateFailures,
            ems_consecutive_print_fail_orders: emsConsecutivePrintFailures,
            ems_consecutive_track_fail_orders: emsConsecutiveTrackFailures,
            ems_auto_track_sync_fail_count: emsAutoTrackSyncFailureOrders.length,
            ems_auto_track_sync_fail_orders: emsAutoTrackSyncFailures,
            ems_problem_orders: emsProblemOrders,
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
        const plan = applyPlanPayload({}, req.body, imagePath);
        const error = validatePlan(plan);

        if (error) {
            removeTempFile(req.file);
            return res.status(400).json({ error });
        }

        await savePlan(plan);

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

        await savePlan(nextPlan);

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

        await deletePlan(planId);

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
        const device = applyDevicePayload({}, req.body, imagePath);
        const error = validateDevice(device);

        if (error) {
            removeTempFile(req.file);
            return res.status(400).json({ error });
        }

        await saveDevice(device);

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

        await saveDevice(nextDevice);

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

        await deleteDevice(deviceId);

        res.json({ success: true });
    }),
);

router.get(
    '/orders',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const [orders, users, settings] = await Promise.all([readOrders(), readUsers(), readSettings()]);
        const filteredOrders = filterOrders(orders, users, settings, {
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

        const [orders, users, settings] = await Promise.all([readOrders(), readUsers(), readSettings()]);
        const filteredOrders = filterOrders(orders, users, settings, {
            q: req.query.q,
            status: req.query.status,
            flowType: req.query.flow_type,
            dateFrom: req.query.date_from,
            dateTo: req.query.date_to,
        });

        const rows = [
            [
                '订单',
                '订单状',
                '下单方式',
                '瀹㈡埛濮撳悕',
                '客户手机',
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
        const previousEmsSnapshot = JSON.stringify(order.ems || {});
        const previousNoticeSnapshot = buildOrderNoticeSnapshot(order);
        const nextStatus = String(req.body.status || order.status).trim();
        let updatedDevice = null;

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
        order.ems = normalizeAdminEmsPayload(req.body.ems, order.ems);

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
                    updatedDevice = {
                        ...device,
                        stock: device.stock + order.quantity,
                    };
                }
            }
            order.cancelled_at = new Date().toISOString();
        }

        if (previousStatus !== nextStatus) {
            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '状态更',
                content: `订单状态由 ${previousStatus} 更新为 ${nextStatus}`,
            });
        }

        if (previousLogisticsCompany !== order.logistics_company || previousTrackingNumber !== order.merchant_tracking_number) {
            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '物流更新',
                content: `物流公司：${order.logistics_company || '未填'}；回寄单号：${order.merchant_tracking_number || '未填'}`,
            });
        }

        if (previousAdminNote !== order.admin_note) {
            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '后台备注更新',
                content: order.admin_note || '后台备注已清',
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

        if (previousEmsSnapshot !== JSON.stringify(order.ems || {})) {
            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: 'EMS信息更新',
                content: '已更新 EMS 收件地址、面单参数或轨迹相关信息',
            });
        }

        syncOrderLogisticsUserNotices(order, {
            previousSnapshot: previousNoticeSnapshot,
        });

        await commitStoreChanges({
            devices: updatedDevice ? [updatedDevice] : [],
            orders: [order],
        });
        res.json({ success: true });
    }),
);

router.post(
    '/orders/:id/ems/parse-address',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const orderId = toInteger(req.params.id, 0);
        const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
        const order = orders.find((item) => item.id === orderId);
        const runtimeConfig = buildRuntimeEmsConfig(settings);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        order.ems = normalizeAdminEmsPayload(req.body.ems, order.ems);
        const wholeAddress = safeText(req.body.whole_address ?? req.body.wholeAddress, order.shipping_address);
        if (!wholeAddress) {
            return res.status(400).json({ error: '请先填写收件地址后再解析。' });
        }

        try {
            const candidates = await parseAddress(wholeAddress, { config: runtimeConfig });

            if (!candidates.length) {
                order.ems = {
                    ...order.ems,
                    address_parse_source: wholeAddress,
                    address_parse_candidates: [],
                    address_parsed_at: new Date().toISOString(),
                    parse_payload: { wholeAddress },
                    parse_response: { candidates: [] },
                    last_error: 'EMS 地址解析未命中，请手工补全省市区。',
                };
                appendEmsAudit(order, {
                    action: 'parse-address',
                    status: 'error',
                    request: { wholeAddress },
                    response: { candidates: [] },
                    retMsg: order.ems.last_error,
                });
                await commitStoreChanges({ orders: [order] });
                return res.status(400).json({ error: 'EMS 地址解析未命中，请手工补全省市区。' });
            }

            const firstCandidate = applyParsedAddressToOrder(order, wholeAddress, candidates);
            order.ems = {
                ...order.ems,
                address_parsed_at: new Date().toISOString(),
                parse_payload: { wholeAddress },
                parse_response: { candidates },
                last_error: '',
            };
            appendEmsAudit(order, {
                action: 'parse-address',
                request: { wholeAddress },
                response: { candidates },
                retMsg: '地址解析成功',
            });
            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: 'EMS地址解析',
                content: `已解析为 ${firstCandidate.prov}${firstCandidate.city}${firstCandidate.county}`,
            });

            await commitStoreChanges({
                orders: [order],
            });

            res.json({
                success: true,
                receiver: order.ems.receiver,
                candidates: order.ems.address_parse_candidates,
            });
        } catch (error) {
            const errorMessage = persistEmsFailure(order, error, {
                action: 'parse-address',
                request: { wholeAddress },
            });
            order.ems = {
                ...order.ems,
                address_parse_source: wholeAddress,
                address_parse_candidates: [],
                parse_payload: { wholeAddress },
                parse_response: compactAuditValue(error?.response || { message: safeText(error?.message) }),
            };
            await commitStoreChanges({ orders: [order] });
            return res.status(400).json({ error: errorMessage });
        }
    }),
);

router.post(
    '/orders/:id/ems/validate',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const orderId = toInteger(req.params.id, 0);
        const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
        const order = orders.find((item) => item.id === orderId);
        const runtimeConfig = buildRuntimeEmsConfig(settings);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        order.ems = normalizeAdminEmsPayload(req.body.ems, order.ems);
        try {
            if (!receiverHasFullAddress(order)) {
                const candidates = await parseAddress(order.ems?.address_parse_source || order.shipping_address, {
                    config: runtimeConfig,
                });
                if (!candidates.length) {
                    throw new Error('收件地址还没有解析成功，请先解析或手工补全。');
                }
                applyParsedAddressToOrder(order, order.ems?.address_parse_source || order.shipping_address, candidates);
            }

            const receiver = validatePartyAddress(
                {
                    ...order.ems.receiver,
                    name: order.ems.receiver?.name || order.customer_name,
                    mobile: order.ems.receiver?.mobile || order.customer_phone,
                    postCode: order.ems.receiver?.post_code,
                },
                '收件地址',
            );
            const sender = validatePartyAddress(
                await resolveSenderFromSettings(settings, order.ems?.sender || {}, runtimeConfig),
                '寄件地址',
            );
            const validatePayload = buildReachabilityPayload(order, sender, receiver, runtimeConfig);

            const response = await checkReachability(validatePayload, { config: runtimeConfig });
            order.ems = {
                ...order.ems,
                sender: normalizeEmsPartyPayload({ ...sender, post_code: sender.postCode }, order.ems.sender),
                receiver: normalizeEmsPartyPayload({ ...receiver, post_code: receiver.postCode }, order.ems.receiver),
                reachable: true,
                reachable_message: safeText(response.retMsg, '该地址信息可达！'),
                reachable_checked_at: new Date().toISOString(),
                last_serial_no: safeText(response.serialNo, order.ems.last_serial_no),
                last_error: '',
                validate_payload: validatePayload,
                validate_response: compactAuditValue(response),
            };
            appendEmsAudit(order, {
                action: 'validate',
                request: validatePayload,
                response,
                retCode: response.retCode,
                retMsg: response.retMsg,
                serialNo: response.serialNo,
            });

            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: 'EMS可达校验',
                content: order.ems.reachable_message || 'EMS 收寄地址校验通过',
            });

            await commitStoreChanges({
                orders: [order],
            });

            res.json({
                success: true,
                reachable: order.ems.reachable,
                reachable_message: order.ems.reachable_message,
                receiver: order.ems.receiver,
                sender: order.ems.sender,
            });
        } catch (error) {
            order.ems = {
                ...order.ems,
                reachable: false,
                reachable_message: persistEmsFailure(order, error, {
                    action: 'validate',
                    request: order.ems?.validate_payload || null,
                }),
                reachable_checked_at: new Date().toISOString(),
                validate_response: compactAuditValue(error?.response || { message: safeText(error?.message) }),
            };
            await commitStoreChanges({ orders: [order] });
            return res.status(400).json({ error: order.ems.reachable_message });
        }
    }),
);

router.post(
    '/orders/:id/ems/create',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const orderId = toInteger(req.params.id, 0);
        const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
        const order = orders.find((item) => item.id === orderId);
        const runtimeConfig = buildRuntimeEmsConfig(settings);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }
        if (order.status === 'cancelled') {
            return res.status(400).json({ error: '已取消订单不能创建 EMS 运单。' });
        }
        if (safeText(order.ems?.waybill_no)) {
            return res.status(400).json({ error: '当前订单已经生成 EMS 运单号。' });
        }

        order.ems = normalizeAdminEmsPayload(req.body.ems, order.ems);
        const previousNoticeSnapshot = buildOrderNoticeSnapshot(order);
        try {
            if (!receiverHasFullAddress(order)) {
                const candidates = await parseAddress(order.ems?.address_parse_source || order.shipping_address, {
                    config: runtimeConfig,
                });
                if (!candidates.length) {
                    throw new Error('收件地址还没有解析成功，请先解析或手工补全。');
                }
                applyParsedAddressToOrder(order, order.ems?.address_parse_source || order.shipping_address, candidates);
            }

            const receiver = validatePartyAddress(
                {
                    ...order.ems.receiver,
                    name: order.ems.receiver?.name || order.customer_name,
                    mobile: order.ems.receiver?.mobile || order.customer_phone,
                    postCode: order.ems.receiver?.post_code,
                },
                '收件地址',
            );
            const sender = validatePartyAddress(
                await resolveSenderFromSettings(settings, order.ems?.sender || {}, runtimeConfig),
                '寄件地址',
            );

            const reachablePayload = buildReachabilityPayload(order, sender, receiver, runtimeConfig);
            const reachableResponse = await checkReachability(reachablePayload, { config: runtimeConfig });
            const config = runtimeConfig;
            const logisticsOrderNo = order.order_no;
            const orderPayload = {
                ecommerceUserId: preferText(order.ems?.ecommerce_user_id, `${order.order_no}-${order.id}`),
                logisticsOrderNo,
                createdTime: formatTimestamp(),
                senderNo: config.senderNo,
                contentsAttribute: preferText(order.ems?.contents_attribute, config.contentsAttribute),
                bizProductNo: preferText(order.ems?.biz_product_no, config.bizProductNo),
                bizProductId: safeText(order.ems?.biz_product_id, config.bizProductId),
                weight: Number(preferText(order.ems?.package_weight, config.defaultWeightGrams)),
                remarks: buildEmsRemark(order),
                sender,
                receiver,
                cargos: buildCargoList(order, config),
            };

            const { response, body } = await createWaybillOrder(orderPayload, { config });
            const waybillNo = safeText(body.waybillNo);
            if (!waybillNo) {
                throw new Error('EMS 建单成功但未返回运单号。');
            }

            order.ems = {
                ...order.ems,
                sender: normalizeEmsPartyPayload({ ...sender, post_code: sender.postCode }, order.ems.sender),
                receiver: normalizeEmsPartyPayload({ ...receiver, post_code: receiver.postCode }, order.ems.receiver),
                reachable: true,
                reachable_message: safeText(reachableResponse.retMsg, '该地址信息可达！'),
                reachable_checked_at: new Date().toISOString(),
                ecommerce_user_id: orderPayload.ecommerceUserId,
                logistics_order_no: preferText(body.logisticsOrderNo, logisticsOrderNo),
                waybill_no: waybillNo,
                route_code: safeText(body.routeCode),
                package_code: safeText(body.packageCode),
                package_code_name: safeText(body.packageCodeName),
                mark_destination_code: safeText(body.markDestinationCode),
                mark_destination_name: safeText(body.markDestinationName),
                biz_product_no: preferText(orderPayload.bizProductNo, config.bizProductNo),
                biz_product_id: safeText(orderPayload.bizProductId),
                contents_attribute: preferText(orderPayload.contentsAttribute, config.contentsAttribute),
                package_weight: preferText(orderPayload.weight, config.defaultWeightGrams),
                last_serial_no: safeText(response.serialNo, order.ems.last_serial_no),
                last_error: '',
                waybill_created_at: new Date().toISOString(),
                validate_payload: reachablePayload,
                validate_response: compactAuditValue(reachableResponse),
                order_payload: orderPayload,
                order_response: compactAuditValue(response),
            };
            order.logistics_company = 'EMS';
            order.merchant_tracking_number = waybillNo;
            appendEmsAudit(order, {
                action: 'create',
                request: orderPayload,
                response,
                retCode: response.retCode,
                retMsg: response.retMsg,
                serialNo: response.serialNo,
            });

            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: 'EMS建单成功',
                content: `已获取 EMS 运单号 ${waybillNo}`,
            });
            syncOrderLogisticsUserNotices(order, {
                previousSnapshot: previousNoticeSnapshot,
            });

            await commitStoreChanges({
                orders: [order],
            });

            res.json({
                success: true,
                tracking_number: order.merchant_tracking_number,
                waybill_no: order.ems.waybill_no,
                order,
            });
        } catch (error) {
            const errorMessage = persistEmsFailure(order, error, {
                action: 'create',
                request: order.ems?.order_payload || null,
            });
            await commitStoreChanges({ orders: [order] });
            return res.status(400).json({ error: errorMessage });
        }
    }),
);

router.post(
    '/orders/:id/ems/label',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const orderId = toInteger(req.params.id, 0);
        const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
        const order = orders.find((item) => item.id === orderId);
        const runtimeConfig = buildRuntimeEmsConfig(settings);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        order.ems = normalizeAdminEmsPayload(req.body.ems, order.ems);
        const waybillNo = buildTrackingNumber(order);
        if (!waybillNo) {
            return res.status(400).json({ error: '请先创建 EMS 运单后再获取面单。' });
        }

        try {
            const labelPayload = {
                orderNo: order.order_no,
                waybillNo,
                type: preferText(order.ems?.label_type, runtimeConfig.labelType),
            };
            const label = await getLabelDocument({
                orderNo: labelPayload.orderNo,
                waybillNo: labelPayload.waybillNo,
                type: labelPayload.type,
            }, { config: runtimeConfig });

            order.ems = {
                ...order.ems,
                waybill_no: waybillNo,
                label_type: label.labelType,
                label_url: safeText(label.labelUrl),
                label_file: safeText(label.labelFile),
                label_generated_at: new Date().toISOString(),
                label_requested_at: new Date().toISOString(),
                last_serial_no: safeText(label.response.serialNo, order.ems.last_serial_no),
                last_error: '',
                label_payload: labelPayload,
                label_response: compactAuditValue(label.response),
            };
            appendEmsAudit(order, {
                action: 'label',
                request: labelPayload,
                response: label.response,
                retCode: label.response.retCode,
                retMsg: label.response.retMsg,
                serialNo: label.response.serialNo,
            });

            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '获取EMS面单',
                content: `已生成面单文件 ${order.ems.label_file}`,
            });

            await commitStoreChanges({
                orders: [order],
            });

            res.json({
                success: true,
                label_file: order.ems.label_file,
                label_url: order.ems.label_url,
                cloud_print_download_url: getCloudPrintDownloadUrl(),
            });
        } catch (error) {
            const errorMessage = persistEmsFailure(order, error, {
                action: 'label',
                request: order.ems?.label_payload || {
                    orderNo: order.order_no,
                    waybillNo,
                    type: preferText(order.ems?.label_type, runtimeConfig.labelType),
                },
            });
            await commitStoreChanges({ orders: [order] });
            return res.status(400).json({ error: errorMessage });
        }
    }),
);

router.post(
    '/orders/:id/ems/print',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const orderId = toInteger(req.params.id, 0);
        const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
        const order = orders.find((item) => item.id === orderId);
        const runtimeConfig = buildRuntimeEmsConfig(settings);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        order.ems = normalizeAdminEmsPayload(req.body.ems, order.ems);
        const previousNoticeSnapshot = buildOrderNoticeSnapshot(order);
        try {
            if (!safeText(order.ems?.label_file)) {
                const waybillNo = buildTrackingNumber(order);
                if (!waybillNo) {
                    throw new Error('请先创建 EMS 运单并生成面单。');
                }

                const label = await getLabelDocument({
                    orderNo: order.order_no,
                    waybillNo,
                    type: preferText(order.ems?.label_type, runtimeConfig.labelType),
                }, { config: runtimeConfig });

                order.ems = {
                    ...order.ems,
                    label_type: label.labelType,
                    label_url: safeText(label.labelUrl),
                    label_file: safeText(label.labelFile),
                    label_generated_at: new Date().toISOString(),
                    label_requested_at: new Date().toISOString(),
                    last_serial_no: safeText(label.response.serialNo, order.ems.last_serial_no),
                    last_error: '',
                    label_payload: {
                        orderNo: order.order_no,
                        waybillNo,
                        type: preferText(order.ems?.label_type, runtimeConfig.labelType),
                    },
                    label_response: compactAuditValue(label.response),
                };
                appendEmsAudit(order, {
                    action: 'label',
                    request: order.ems.label_payload,
                    response: label.response,
                    retCode: label.response.retCode,
                    retMsg: label.response.retMsg,
                    serialNo: label.response.serialNo,
                });
            }

            const printPayload = {
                labelFile: order.ems.label_file,
                printerName: runtimeConfig.printerName,
                mode: runtimeConfig.printMode,
                paperName: runtimeConfig.paperName,
                paperWidthMm: runtimeConfig.paperWidthMm,
                paperHeightMm: runtimeConfig.paperHeightMm,
                labelType: preferText(order.ems?.label_type, runtimeConfig.labelType),
            };
            const printDiagnostics = await assertPrintPreflight({ config: runtimeConfig });
            appendEmsAudit(order, {
                action: 'print-preflight',
                request: printPayload,
                response: printDiagnostics,
                retMsg: '打印前自检通过',
            });

            const printResult = await dispatchPrintJob(order.ems.label_file, { config: runtimeConfig });
            order.ems = {
                ...order.ems,
                print_status: printResult.dispatched ? 'queued' : printResult.mode || 'browser',
                print_mode: safeText(printResult.mode, runtimeConfig.printMode),
                print_message: safeText(printResult.message),
                print_attempted_at: new Date().toISOString(),
                printed_at: printResult.dispatched ? new Date().toISOString() : order.ems.printed_at,
                last_error: '',
                print_payload: printPayload,
                print_response: compactAuditValue({
                    ...printResult,
                    preflight: printDiagnostics.preflight,
                }),
            };
            appendEmsAudit(order, {
                action: 'print',
                request: printPayload,
                response: {
                    ...printResult,
                    preflight: printDiagnostics.preflight,
                },
                retMsg: printResult.message,
            });

            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '打印EMS面单',
                content: order.ems.print_message || '已触发 EMS 面单打印',
            });
            syncOrderLogisticsUserNotices(order, {
                previousSnapshot: previousNoticeSnapshot,
            });

            await commitStoreChanges({
                orders: [order],
            });

            res.json({
                success: true,
                ...printResult,
                label_file: order.ems.label_file,
                cloud_print_download_url: getCloudPrintDownloadUrl(),
            });
        } catch (error) {
            const errorMessage = persistEmsFailure(order, error, {
                action: error?.code === 'PRINT_PREFLIGHT' ? 'print-preflight' : 'print',
                request: order.ems?.print_payload || {
                    labelFile: order.ems?.label_file,
                    printerName: runtimeConfig.printerName,
                    mode: runtimeConfig.printMode,
                    paperName: runtimeConfig.paperName,
                    paperWidthMm: runtimeConfig.paperWidthMm,
                    paperHeightMm: runtimeConfig.paperHeightMm,
                    labelType: preferText(order.ems?.label_type, runtimeConfig.labelType),
                },
            });
            await commitStoreChanges({ orders: [order] });
            return res.status(400).json({ error: errorMessage });
        }
    }),
);

router.post(
    '/orders/:id/ems/tracks/sync',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const orderId = toInteger(req.params.id, 0);
        const [orders, settings] = await Promise.all([readOrders(), readSettings()]);
        const order = orders.find((item) => item.id === orderId);
        const runtimeConfig = buildRuntimeEmsConfig(settings);

        if (!order) {
            return res.status(404).json({ error: '订单不存在。' });
        }

        const waybillNo = buildTrackingNumber(order);
        if (!waybillNo) {
            return res.status(400).json({ error: '当前订单还没有 EMS 运单号。' });
        }

        order.ems = normalizeAdminEmsPayload(req.body.ems, order.ems);
        const previousNoticeSnapshot = buildOrderNoticeSnapshot(order);
        try {
            const trackPayload = {
                waybillNo,
                direction: order.ems?.tracking_direction || '0',
            };
            const { response, items } = await queryTrackItems(waybillNo, trackPayload.direction, { config: runtimeConfig });
            order.ems = {
                ...order.ems,
                waybill_no: waybillNo,
                track_items: items.map(normalizeEmsTrackPayload),
                track_summary: summarizeLatestTrack(items),
                last_track_sync_at: new Date().toISOString(),
                last_serial_no: safeText(response.serialNo, order.ems.last_serial_no),
                last_error: '',
                track_payload: trackPayload,
                track_response: compactAuditValue(response),
            };
            order.ems.auto_track_sync_failure_streak = 0;
            order.ems.auto_track_sync_last_error = '';
            order.ems.auto_track_sync_last_success_at = new Date().toISOString();
            order.logistics_company = order.logistics_company || 'EMS';
            order.merchant_tracking_number = order.merchant_tracking_number || waybillNo;
            appendEmsAudit(order, {
                action: 'track-sync',
                request: trackPayload,
                response,
                retCode: response.retCode,
                retMsg: response.retMsg,
                serialNo: response.serialNo,
            });

            appendOrderLog(order, {
                operatorId: req.userId,
                operatorRole: req.userRole,
                action: '同步EMS轨迹',
                content: items.length ? `已同步 ${items.length} 条 EMS 轨迹` : '当前暂无 EMS 轨迹',
            });
            syncOrderLogisticsUserNotices(order, {
                previousSnapshot: previousNoticeSnapshot,
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
            const errorMessage = persistEmsFailure(order, error, {
                action: 'track-sync',
                request: order.ems?.track_payload || {
                    waybillNo,
                    direction: order.ems?.tracking_direction || '0',
                },
            });
            await commitStoreChanges({ orders: [order] });
            return res.status(400).json({ error: errorMessage });
        }
    }),
);

router.post(
    '/orders/:id/ems/workflow',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const orderId = toInteger(req.params.id, 0);
        const includeTrack =
            toNullableBoolean(req.body.include_track ?? req.body.includeTrack) === null
                ? true
                : toNullableBoolean(req.body.include_track ?? req.body.includeTrack);

        const { task, alreadyQueued } = await enqueueWorkflowForOrder(orderId, {
            includeTrack,
            initiatorId: req.userId,
            initiatorRole: req.userRole,
            mode: 'single',
        });

        res.json({
            success: true,
            queued: !alreadyQueued,
            already_queued: alreadyQueued,
            workflow_task: task,
            message: alreadyQueued ? '该订单已经在后台队列中执行。' : '已加入后台一键处理队列。',
        });
    }),
);

router.post(
    '/orders/ems/workflow/batch',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const includeTrack =
            toNullableBoolean(req.body.include_track ?? req.body.includeTrack) === null
                ? true
                : toNullableBoolean(req.body.include_track ?? req.body.includeTrack);
        const orderIds = Array.from(
            new Set(
                (Array.isArray(req.body.order_ids) ? req.body.order_ids : toStringArray(req.body.order_ids))
                    .map((item) => toInteger(item, 0))
                    .filter((item) => item > 0),
            ),
        );

        if (!orderIds.length) {
            return res.status(400).json({ error: '请先选择要加入后台队列的订单。' });
        }

        const results = [];
        for (const orderId of orderIds) {
            try {
                const result = await enqueueWorkflowForOrder(orderId, {
                    includeTrack,
                    initiatorId: req.userId,
                    initiatorRole: req.userRole,
                    mode: 'batch',
                });
                results.push({
                    order_id: orderId,
                    success: true,
                    already_queued: result.alreadyQueued,
                    workflow_task: result.task,
                });
            } catch (error) {
                results.push({
                    order_id: orderId,
                    success: false,
                    error: safeText(error?.message, '加入后台队列失败'),
                });
            }
        }

        res.json({
            success: true,
            queued_count: results.filter((item) => item.success && !item.already_queued).length,
            already_queued_count: results.filter((item) => item.success && item.already_queued).length,
            failed_count: results.filter((item) => !item.success).length,
            results,
        });
    }),
);

router.get(
    '/ems/diagnostics',
    auth,
    asyncHandler(async (req, res) => {
        if (!ensureAdmin(req, res)) return;

        const settings = await readSettings();
        const runtimeConfig = buildRuntimeEmsConfig(settings);
        const diagnostics = await getPrintDiagnostics({ config: runtimeConfig });

        res.json({
            diagnostics,
            cloud_print_download_url: getCloudPrintDownloadUrl(),
            runtime: {
                print_mode: runtimeConfig.printMode,
                printer_name: runtimeConfig.printerName,
                sumatra_path: runtimeConfig.sumatraPath,
                label_type: runtimeConfig.labelType,
                paper_name: runtimeConfig.paperName,
                paper_width_mm: runtimeConfig.paperWidthMm,
                paper_height_mm: runtimeConfig.paperHeightMm,
                auto_sync_tracks: Boolean(settings?.logistics?.auto_sync_tracks),
                track_auto_sync_interval_hours: resolveTrackAutoSyncIntervalHours(settings),
                sender_name: runtimeConfig.senderName,
                sender_phone: runtimeConfig.senderPhone,
                sender_address: runtimeConfig.senderAddress,
            },
            credentials: {
                sender_no_configured: Boolean(runtimeConfig.senderNo),
                authorization_configured: Boolean(runtimeConfig.authorization),
                sign_key_configured: Boolean(runtimeConfig.signKey),
            },
        });
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
            logistics: {
                ...(currentSettings.logistics || {}),
                ...(req.body.logistics && typeof req.body.logistics === 'object' ? req.body.logistics : {}),
            },
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

        if (!verifyPassword(currentPassword, users[adminIndex].password)) {
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
        users[adminIndex].password = newPassword || users[adminIndex].password;

        const savedAdmin = await saveUser(users[adminIndex]);

        res.json({
            success: true,
            user: {
                id: savedAdmin.id,
                phone: savedAdmin.phone,
                username: savedAdmin.username || '',
                nickname: savedAdmin.nickname,
                role: savedAdmin.role,
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

router.recoverEmsWorkflowQueueOnStartup = recoverEmsWorkflowQueueOnStartup;
router.startEmsTrackAutoSyncScheduler = startEmsTrackAutoSyncScheduler;

module.exports = router;
