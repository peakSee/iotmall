const assert = require('node:assert/strict');
const test = require('node:test');

process.env.EMS_AUTHORIZATION = 'TvaBgrhE46sft3nZlfe7xw==';
process.env.EMS_SIGN_KEY = '';

const {
    analyzeTrackQueryResult,
    encryptLogisticsInterface,
    evaluatePaperMatch,
    evaluatePrintPreflight,
    extractAddressDetail,
    getCloudPrintDownloadUrl,
    getEmsApiUrl,
    isEmsManagedOrder,
} = require('../utils/ems');

test('encryptLogisticsInterface matches EMS official SM4 sample', () => {
    const payload = {
        language: 'zh-CN',
        orderId: 'QIAO-20200618-004',
    };

    const encrypted = encryptLogisticsInterface(payload, process.env.EMS_AUTHORIZATION);

    assert.equal(
        encrypted,
        '|$4|efB6PnjDpgHG4xfrvYlXonyBuMJoGTynkfasopHvbl2u3nmNeP+rznA3DyRwb/2GeZL7I3rL6HKD5+Tv3Uy6x8jIDISbYG8Bg14caH2flYE=',
    );
});

test('encryptLogisticsInterface accepts a separate base64 sign key', () => {
    const encrypted = encryptLogisticsInterface(
        { language: 'zh-CN', orderId: 'QIAO-20200618-004' },
        'plain-authorization-code',
        'WjNoNmhXWE12SFZJdk0zWQ==',
    );

    assert.match(encrypted, /^\|\$4\|/);
});

test('encryptLogisticsInterface matches official sign tool when auth code and sign key are separate', () => {
    const encrypted = encryptLogisticsInterface(
        [{ wholeAddress: 'ABC123' }],
        'S1KmaVlAoD4TGj3h',
        'WjNoNmhXWE12SFZJdk0zWQ==',
    );

    assert.equal(
        encrypted,
        '|$4|slRLUixzb1DplJxnGKMG5tcXh0zH5Ry1qZAIemYxDc7VfSxow31WUmgLbzbJt996Ud/vpaVOMcwyqsLvQRXPaA==',
    );
});

test('extractAddressDetail strips parsed province city county prefix', () => {
    const detail = extractAddressDetail('北京市北京市西城区永安路173号', {
        prov: '北京市',
        city: '北京市',
        county: '西城区',
    });

    assert.equal(detail, '永安路173号');
});

test('extractAddressDetail strips contact prefix before parsed region', () => {
    const detail = extractAddressDetail('林永安 13652938833 广东省肇庆市鼎湖区 振兴路美的碧桂园·天合菜鸟驿站', {
        prov: '广东省',
        city: '肇庆市',
        county: '鼎湖区',
    });

    assert.equal(detail, '振兴路美的碧桂园·天合菜鸟驿站');
});

test('official EMS URLs stay on official host', () => {
    assert.equal(getEmsApiUrl(), 'https://api.ems.com.cn/amp-prod-api/f/amp/api/open');
    assert.match(getCloudPrintDownloadUrl(), /^https:\/\/api\.ems\.com\.cn\//);
});

test('evaluatePaperMatch recognises HPRT label paper size', () => {
    const result = evaluatePaperMatch(
        {
            paperName: '100x180mm',
            paperWidthMm: '100',
            paperHeightMm: '180',
        },
        {
            paperSize: '100x180mm',
        },
    );

    assert.equal(result.match, true);
    assert.equal(result.actualName, '100x180mm');
});

test('evaluatePrintPreflight blocks auto print when paper size mismatches', () => {
    const result = evaluatePrintPreflight(
        {
            printMode: 'auto',
            matchedPrinter: {
                name: 'HPRT N31BT',
                printerStatus: 'Normal',
                workOffline: false,
            },
            printerConfiguration: {
                paperSize: 'A4',
            },
            paper: {
                match: false,
                reason: '当前打印机纸张为 A4，期望 100x180mm',
            },
        },
        {
            config: {
                printMode: 'auto',
                paperName: '100x180mm',
            },
        },
    );

    assert.equal(result.ok, false);
    assert.match(result.blockingReasons[0], /A4/);
});

test('evaluatePrintPreflight allows label printers when driver does not expose paper size', () => {
    const result = evaluatePrintPreflight(
        {
            printMode: 'auto',
            matchedPrinter: {
                name: 'HPRT N31BT',
                driverName: 'HPRT N31BT',
                printerStatus: 'Normal',
                workOffline: false,
            },
            printerConfiguration: null,
            paper: {
                match: null,
                reason: '未读取到打印机纸张配置',
            },
        },
        {
            config: {
                printMode: 'auto',
                paperName: '100x180mm',
                paperWidthMm: '100',
                paperHeightMm: '180',
            },
        },
    );

    assert.equal(result.ok, true);
    assert.equal(result.paperCheckRelaxed, true);
    assert.equal(result.blockingReasons.length, 0);
});

test('analyzeTrackQueryResult flags suspicious empty EMS track responses', () => {
    const result = analyzeTrackQueryResult(
        {
            retMsg: '当前邮件无客户信息！',
        },
        [],
    );

    assert.equal(result.hasItems, false);
    assert.equal(result.suspiciousEmpty, true);
    assert.match(result.message, /无客户信息/);
});

test('analyzeTrackQueryResult keeps normal EMS track results as success', () => {
    const result = analyzeTrackQueryResult(
        {
            retMsg: '查询结果正常返回！',
        },
        [
            {
                waybillNo: '9430684408206',
                opTime: '2026-03-25 18:00:32',
                opDesc: '快件离开【青岛市邮区中心快件处理中心】，正在发往下一站',
            },
        ],
    );

    assert.equal(result.hasItems, true);
    assert.equal(result.suspiciousEmpty, false);
    assert.equal(result.items.length, 1);
});

test('isEmsManagedOrder ignores manual tracking-only orders', () => {
    const order = {
        merchant_tracking_number: 'sssssss',
        ems: {
            waybill_no: 'sssssss',
            track_payload: {
                waybillNo: 'sssssss',
                direction: '0',
            },
            track_response: {
                retMsg: '当前邮件无客户信息！',
            },
            api_logs: [
                {
                    action: 'track-sync',
                },
            ],
        },
    };

    assert.equal(isEmsManagedOrder(order), false);
});

test('isEmsManagedOrder recognises official EMS workflow orders', () => {
    const order = {
        ems: {
            ecommerce_user_id: 'IOT202603249145-1774288122819',
            logistics_order_no: 'IOT202603249145',
            waybill_created_at: '2026-03-25T10:14:49.953Z',
            order_response: {
                retCode: '00000',
            },
        },
    };

    assert.equal(isEmsManagedOrder(order), true);
});
