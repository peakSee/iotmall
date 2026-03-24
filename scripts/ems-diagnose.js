require('../utils/load-env');

const fs = require('fs');
const path = require('path');
const {
    checkReachability,
    extractAddressDetail,
    getEmsApiUrl,
    getEmsConfig,
    parseAddress,
    queryTrackItems,
} = require('../utils/ems');

function safeText(value, fallbackValue = '') {
    return String(value ?? fallbackValue).trim();
}

function parseArgs(argv = process.argv.slice(2)) {
    const result = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) continue;
        const key = token.slice(2);
        const nextValue = argv[index + 1];
        if (!nextValue || nextValue.startsWith('--')) {
            result[key] = 'true';
            continue;
        }
        result[key] = nextValue;
        index += 1;
    }
    return result;
}

function readJson(filePath, fallbackValue) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallbackValue;
    }
}

function maskValue(value, { start = 3, end = 3 } = {}) {
    const text = safeText(value);
    if (!text) return '';
    if (text.length <= start + end) return '*'.repeat(text.length);
    return `${text.slice(0, start)}***${text.slice(-end)}`;
}

function buildReceiverFromOrder(order = {}) {
    const wholeAddress = safeText(order.ems?.address_parse_source || order.shipping_address);
    const receiver = order.ems?.receiver || {};
    return {
        wholeAddress,
        name: safeText(receiver.name || order.customer_name),
        mobile: safeText(receiver.mobile || order.customer_phone),
        prov: safeText(receiver.prov),
        city: safeText(receiver.city),
        county: safeText(receiver.county),
        address: safeText(receiver.address),
        bizProductNo: safeText(order.ems?.biz_product_no || process.env.EMS_BIZ_PRODUCT_NO || '10'),
        bizProductId: safeText(order.ems?.biz_product_id || process.env.EMS_BIZ_PRODUCT_ID),
        contentsAttribute: safeText(order.ems?.contents_attribute || process.env.EMS_CONTENTS_ATTRIBUTE || '3'),
        weight: safeText(order.ems?.package_weight || process.env.EMS_DEFAULT_WEIGHT_GRAMS || '500'),
    };
}

async function resolveSenderAddress() {
    const config = getEmsConfig();
    const settingsPath = path.join(__dirname, '..', 'data', 'settings.json');
    const settings = readJson(settingsPath, {});
    const wholeAddress = safeText(config.senderAddress || settings.shop_receiving_address);
    const sender = {
        name: safeText(config.senderName || settings.shop_receiving_name),
        mobile: safeText(config.senderPhone || settings.shop_receiving_phone),
        prov: safeText(config.senderProv),
        city: safeText(config.senderCity),
        county: safeText(config.senderCounty),
        address: safeText(config.senderAddress),
    };

    if ((!sender.prov || !sender.city || !sender.county || !sender.address) && wholeAddress) {
        const candidates = await parseAddress(wholeAddress);
        const firstCandidate = candidates[0];
        if (firstCandidate) {
            sender.prov = sender.prov || firstCandidate.prov;
            sender.city = sender.city || firstCandidate.city;
            sender.county = sender.county || firstCandidate.county;
            sender.address = sender.address || extractAddressDetail(wholeAddress, firstCandidate);
        }
    }

    return { wholeAddress, sender };
}

function buildReachabilityPayload(sender, receiver) {
    return {
        baseProductNo: receiver.bizProductNo,
        bizProductId: receiver.bizProductId,
        contentsAttribute: receiver.contentsAttribute,
        receiverProv: receiver.prov,
        receiverCity: receiver.city,
        receiverCounty: receiver.county,
        receiverAddress: receiver.address,
        senderProv: sender.prov,
        senderCity: sender.city,
        senderCounty: sender.county,
        senderAddress: sender.address,
        weight: receiver.weight,
    };
}

function buildSummary(config) {
    return {
        environment: config.environment,
        endpoint: getEmsApiUrl(config),
        senderNo: maskValue(config.senderNo),
        authorizationConfigured: Boolean(safeText(config.authorization)),
        signKeyConfigured: Boolean(safeText(config.signKey)),
        printerMode: safeText(config.printMode),
        printerName: safeText(config.printerName),
    };
}

async function main() {
    const args = parseArgs();
    const config = getEmsConfig();
    const ordersPath = path.join(__dirname, '..', 'data', 'orders.json');
    const orders = readJson(ordersPath, []);
    const order = args.order ? orders.find((item) => String(item.id) === String(args.order)) : null;

    if (args.order && !order) {
        throw new Error(`未找到订单 ${args.order}`);
    }

    const receiver = order
        ? buildReceiverFromOrder(order)
        : {
              wholeAddress: safeText(args.address),
              name: safeText(args.name),
              mobile: safeText(args.mobile),
              prov: safeText(args.prov),
              city: safeText(args.city),
              county: safeText(args.county),
              address: safeText(args.detail),
              bizProductNo: safeText(args.bizProductNo || config.bizProductNo || '10'),
              bizProductId: safeText(args.bizProductId || config.bizProductId),
              contentsAttribute: safeText(args.contentsAttribute || config.contentsAttribute || '3'),
              weight: safeText(args.weight || config.defaultWeightGrams || '500'),
          };

    if (!receiver.wholeAddress && (!receiver.prov || !receiver.city || !receiver.county || !receiver.address)) {
        throw new Error('请提供 --order 订单号，或提供 --address 完整地址，或完整的 --prov --city --county --detail 参数。');
    }

    const output = {
        summary: buildSummary(config),
        target: {
            orderId: order?.id || '',
            orderNo: order?.order_no || '',
            waybillNo: safeText(args.waybill || order?.ems?.waybill_no || order?.merchant_tracking_number),
        },
    };

    if (receiver.wholeAddress) {
        const parseCandidates = await parseAddress(receiver.wholeAddress);
        output.parse = {
            wholeAddress: receiver.wholeAddress,
            candidates: parseCandidates,
        };
        if ((!receiver.prov || !receiver.city || !receiver.county || !receiver.address) && parseCandidates[0]) {
            receiver.prov = receiver.prov || parseCandidates[0].prov;
            receiver.city = receiver.city || parseCandidates[0].city;
            receiver.county = receiver.county || parseCandidates[0].county;
            receiver.address = receiver.address || extractAddressDetail(receiver.wholeAddress, parseCandidates[0]);
        }
    }

    const { wholeAddress: senderWholeAddress, sender } = await resolveSenderAddress();
    output.sender = {
        wholeAddress: senderWholeAddress,
        ...sender,
    };
    output.receiver = {
        name: receiver.name,
        mobile: receiver.mobile,
        prov: receiver.prov,
        city: receiver.city,
        county: receiver.county,
        address: receiver.address,
        bizProductNo: receiver.bizProductNo,
        bizProductId: receiver.bizProductId,
        contentsAttribute: receiver.contentsAttribute,
        weight: receiver.weight,
    };

    if (receiver.prov && receiver.city && receiver.county && receiver.address && sender.prov && sender.city && sender.county && sender.address) {
        output.reachability = await checkReachability(buildReachabilityPayload(sender, receiver));
    }

    const waybillNo = safeText(args.waybill || order?.ems?.waybill_no || order?.merchant_tracking_number);
    if (waybillNo) {
        const tracks = await queryTrackItems(waybillNo, safeText(args.direction, order?.ems?.tracking_direction || '0'));
        output.tracks = {
            waybillNo,
            total: Array.isArray(tracks.items) ? tracks.items.length : 0,
            items: tracks.items,
            response: tracks.response,
        };
    }

    console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
    console.error(
        JSON.stringify(
            {
                message: safeText(error?.message, 'EMS 诊断失败'),
                code: safeText(error?.code),
                statusCode: error?.statusCode || 0,
                response: error?.response || null,
            },
            null,
            2,
        ),
    );
    process.exit(1);
});
