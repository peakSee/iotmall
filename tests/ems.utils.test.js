const assert = require('node:assert/strict');
const test = require('node:test');

process.env.EMS_AUTHORIZATION = 'TvaBgrhE46sft3nZlfe7xw==';
process.env.EMS_SIGN_KEY = '';

const {
    encryptLogisticsInterface,
    evaluatePaperMatch,
    evaluatePrintPreflight,
    extractAddressDetail,
    getCloudPrintDownloadUrl,
    getEmsApiUrl,
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
