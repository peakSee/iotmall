const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const LABEL_DIR = path.join(UPLOAD_DIR, 'ems-labels');
const DEFAULT_OPEN_URL = 'https://api.ems.com.cn/amp-prod-api/f/amp/api/open';
const DEFAULT_TEST_URL = 'https://api.ems.com.cn/amp-prod-api/f/amp/api/test';
const DEFAULT_LABEL_TYPE = '129';
const DEFAULT_BIZ_PRODUCT_NO = '10';
const DEFAULT_CONTENTS_ATTRIBUTE = '3';
const DEFAULT_WEIGHT_GRAMS = '500';
const CLOUD_PRINT_DOWNLOAD_URL =
    'https://api.ems.com.cn/amp-prod-api/f/back/filedownload/apifiles?url=amposs/ydykj.zip&fileName=云打印控件.zip';

function safeText(value, fallbackValue = '') {
    return String(value ?? fallbackValue).trim();
}

function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function uniqueArray(values = []) {
    return [...new Set(values.filter(Boolean))];
}

function tryParseJson(value, fallbackValue = value) {
    if (typeof value !== 'string') {
        return value;
    }

    const text = value.trim();
    if (!text || !['{', '['].includes(text[0])) {
        return fallbackValue;
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        return fallbackValue;
    }
}

function pickBusinessBody(value) {
    if (Array.isArray(value)) {
        return value;
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value.responseItems)) {
        return value.responseItems;
    }
    if (Array.isArray(value.retBody)) {
        return value.retBody;
    }
    return value.retBody ?? value;
}

function normalizeTrackItems(value) {
    const items = Array.isArray(value) ? value : [];
    return items
        .map((item) => {
            const source = safeObject(item);
            return {
                waybillNo: safeText(source.waybillNo),
                opTime: safeText(source.opTime),
                opCode: safeText(source.opCode),
                opName: safeText(source.opName),
                opDesc: safeText(source.opDesc),
                opOrgProvName: safeText(source.opOrgProvName),
                opOrgCity: safeText(source.opOrgCity),
                opOrgCode: safeText(source.opOrgCode),
                opOrgName: safeText(source.opOrgName),
                operatorNo: safeText(source.operatorNo),
                operatorName: safeText(source.operatorName),
                deliverCode: safeText(source.deliverCode),
                attemptDeliveryCode: safeText(source.attemptDeliveryCode),
                productName: safeText(source.productName),
            };
        })
        .filter((item) => item.opTime || item.opDesc || item.opName);
}

function toNullableBoolean(value) {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return null;
}

function formatTimestamp(date = new Date()) {
    const nextDate = date instanceof Date ? date : new Date(date);
    const year = nextDate.getFullYear();
    const month = String(nextDate.getMonth() + 1).padStart(2, '0');
    const day = String(nextDate.getDate()).padStart(2, '0');
    const hours = String(nextDate.getHours()).padStart(2, '0');
    const minutes = String(nextDate.getMinutes()).padStart(2, '0');
    const seconds = String(nextDate.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function sanitizeFilePart(value, fallbackValue = 'ems') {
    const text = safeText(value, fallbackValue).replace(/[<>:"/\\|?*\s]+/g, '-');
    return text.replace(/-+/g, '-').replace(/^-+|-+$/g, '') || fallbackValue;
}

function getEmsConfig() {
    const environment = safeText(process.env.EMS_API_ENV, 'prod').toLowerCase() === 'sandbox' ? 'sandbox' : 'prod';
    return {
        environment,
        openUrl: safeText(process.env.EMS_OPEN_URL, DEFAULT_OPEN_URL),
        testUrl: safeText(process.env.EMS_TEST_URL, DEFAULT_TEST_URL),
        senderNo: safeText(process.env.EMS_SENDER_NO),
        authorization: safeText(process.env.EMS_AUTHORIZATION),
        signKey: safeText(process.env.EMS_SIGN_KEY || process.env.EMS_SIGN_KEY_BASE64),
        userCode: safeText(process.env.EMS_USER_CODE),
        msgType: safeText(process.env.EMS_MSG_TYPE, '0'),
        version: safeText(process.env.EMS_VERSION, 'V1.0.0'),
        bizProductNo: safeText(process.env.EMS_BIZ_PRODUCT_NO, DEFAULT_BIZ_PRODUCT_NO),
        bizProductId: safeText(process.env.EMS_BIZ_PRODUCT_ID),
        labelType: safeText(process.env.EMS_LABEL_TYPE, DEFAULT_LABEL_TYPE),
        contentsAttribute: safeText(process.env.EMS_CONTENTS_ATTRIBUTE, DEFAULT_CONTENTS_ATTRIBUTE),
        defaultWeightGrams: safeText(process.env.EMS_DEFAULT_WEIGHT_GRAMS, DEFAULT_WEIGHT_GRAMS),
        senderName: safeText(process.env.EMS_SENDER_NAME),
        senderPhone: safeText(process.env.EMS_SENDER_PHONE),
        senderPostCode: safeText(process.env.EMS_SENDER_POST_CODE),
        senderProv: safeText(process.env.EMS_SENDER_PROV),
        senderCity: safeText(process.env.EMS_SENDER_CITY),
        senderCounty: safeText(process.env.EMS_SENDER_COUNTY),
        senderAddress: safeText(process.env.EMS_SENDER_ADDRESS),
        printMode: safeText(process.env.EMS_PRINT_MODE, process.platform === 'win32' ? 'auto' : 'browser').toLowerCase(),
        printerName: safeText(process.env.EMS_PRINTER_NAME),
        printCommand: safeText(process.env.EMS_PRINT_COMMAND),
        sumatraPath: safeText(process.env.EMS_SUMATRA_PATH),
        paperName: safeText(process.env.EMS_PAPER_NAME, '100x180mm'),
        paperWidthMm: safeText(process.env.EMS_PAPER_WIDTH_MM, '100'),
        paperHeightMm: safeText(process.env.EMS_PAPER_HEIGHT_MM, '180'),
    };
}

function getEmsApiUrl(config = getEmsConfig()) {
    return config.environment === 'sandbox' ? config.testUrl : config.openUrl;
}

function getDefaultLabelType() {
    return getEmsConfig().labelType || DEFAULT_LABEL_TYPE;
}

function getCloudPrintDownloadUrl() {
    return CLOUD_PRINT_DOWNLOAD_URL;
}

function ensureEmsConfigured(config = getEmsConfig()) {
    if (!config.senderNo) {
        throw new Error('请先配置 EMS_SENDER_NO 客户号。');
    }
    if (!config.authorization) {
        throw new Error('请先配置 EMS_AUTHORIZATION 授权码。');
    }
    return config;
}

function encryptLogisticsInterface(payload, authorization, signKey = '') {
    const payloadText = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const authText = safeText(authorization);
    const signKeyText = safeText(signKey) || authText;
    const plainText = payloadText + signKeyText;
    const keyBuffer = Buffer.from(signKeyText, 'base64');

    if (keyBuffer.length !== 16) {
        throw new Error('EMS_SIGN_KEY 或 EMS_AUTHORIZATION 不是有效的 16 字节 Base64 密钥。');
    }

    const cipher = crypto.createCipheriv('sm4-ecb', keyBuffer, null);
    cipher.setAutoPadding(true);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    return `|$4|${encrypted.toString('base64')}`;
}

async function callEmsApi(apiCode, payload, options = {}) {
    const config = ensureEmsConfigured(options.config || getEmsConfig());
    const endpoint = safeText(options.endpoint || getEmsApiUrl(config));
    const params = new URLSearchParams();

    params.set('apiCode', safeText(apiCode));
    params.set('senderNo', config.senderNo);
    params.set('authorization', config.authorization);
    params.set('msgType', safeText(options.msgType, config.msgType || '0'));
    params.set('timeStamp', safeText(options.timeStamp, formatTimestamp()));
    params.set('version', safeText(options.version, config.version || 'V1.0.0'));
    params.set('logitcsInterface', encryptLogisticsInterface(payload, config.authorization, config.signKey));

    const userCode = safeText(options.userCode, config.userCode);
    if (userCode) {
        params.set('userCode', userCode);
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: params.toString(),
        signal: options.signal,
    });

    const rawText = await response.text();
    const rawData = tryParseJson(rawText);

    if (!response.ok) {
        const error = new Error(`EMS 接口调用失败（HTTP ${response.status}）`);
        error.statusCode = response.status >= 500 ? 502 : 400;
        error.response = {
            rawText,
            status: response.status,
        };
        throw error;
    }

    const responseData = safeObject(rawData);
    const retCode = safeText(responseData.retCode || responseData.code);
    const retMsg = safeText(responseData.retMsg || responseData.codeMessage);
    const retBody = tryParseJson(responseData.retBody);
    const normalized = {
        ...responseData,
        retCode,
        retMsg,
        retBody,
        rawText,
    };

    if (retCode && retCode !== '00000') {
        const error = new Error(retMsg || `EMS 接口返回失败：${retCode}`);
        error.code = retCode;
        error.statusCode = 400;
        error.response = normalized;
        throw error;
    }

    return normalized;
}

function normalizeAddressCandidate(candidate = {}) {
    const source = safeObject(candidate);
    return {
        wholeAddress: safeText(source.wholeAddress || source.whole_address),
        prov: safeText(source.prov || source.provName),
        city: safeText(source.city || source.cityName),
        county: safeText(source.county || source.countyName),
        address: safeText(source.address),
        proCode: safeText(source.proCode || source.pro_code),
        cityCode: safeText(source.cityCode || source.city_code),
        countyCode: safeText(source.countyCode || source.county_code),
        districtCode: safeText(source.districtCode || source.district_code),
    };
}

async function parseAddress(wholeAddress, options = {}) {
    const response = await callEmsApi('060001', [{ wholeAddress: safeText(wholeAddress) }], options);
    const businessBody = pickBusinessBody(response.retBody);
    const items = Array.isArray(businessBody) ? businessBody : Array.isArray(response.retBody) ? response.retBody : [];
    return items.map(normalizeAddressCandidate).filter((item) => item.prov || item.city || item.county);
}

function extractAddressDetail(wholeAddress, parsedAddress = {}) {
    let detail = safeText(wholeAddress).replace(/\s+/g, '');
    const tokens = uniqueArray([parsedAddress.prov, parsedAddress.city, parsedAddress.county].map((item) => safeText(item)));

    tokens.forEach((token) => {
        while (token && detail.startsWith(token)) {
            detail = detail.slice(token.length);
        }
    });

    detail = detail.replace(/^[,\uff0c\uff1b\u3002\s]+/, '').trim();
    return detail || safeText(wholeAddress);
}

async function checkReachability(payload, options = {}) {
    return callEmsApi('060002', payload, options);
}

async function createWaybillOrder(payload, options = {}) {
    const response = await callEmsApi('020003', [payload], options);
    const businessBody = pickBusinessBody(response.retBody);
    const item = Array.isArray(businessBody) ? safeObject(businessBody[0]) : safeObject(businessBody);
    return {
        response,
        body: item,
    };
}

function saveLabelPdf(orderNo, waybillNo, pdfBuffer) {
    ensureDir(LABEL_DIR);
    const fileName = `${sanitizeFilePart(orderNo, 'order')}-${sanitizeFilePart(waybillNo, 'waybill')}.pdf`;
    const diskPath = path.join(LABEL_DIR, fileName);
    fs.writeFileSync(diskPath, pdfBuffer);
    return `/uploads/ems-labels/${fileName}`;
}

async function getLabelDocument({ orderNo, waybillNo, type, isReturn = false, preferUrl = true } = {}, options = {}) {
    const payload = {
        waybillNo: safeText(waybillNo),
        type: safeText(type, getDefaultLabelType()),
    };

    if (preferUrl) {
        payload.getURL = '1';
    }
    if (isReturn) {
        payload.isReturn = '1';
    }

    const response = await callEmsApi('010004', payload, options);
    const body = response.retBody;
    let pdfBuffer = null;
    let remoteUrl = '';

    if (typeof body === 'string' && /^https?:\/\//i.test(body)) {
        remoteUrl = body.trim();
        const fileResponse = await fetch(remoteUrl);
        if (!fileResponse.ok) {
            throw new Error(`EMS 面单下载失败（HTTP ${fileResponse.status}）`);
        }
        pdfBuffer = Buffer.from(await fileResponse.arrayBuffer());
    } else if (typeof body === 'string' && body.trim()) {
        pdfBuffer = Buffer.from(body.trim(), 'base64');
    }

    if (!pdfBuffer || !pdfBuffer.length) {
        throw new Error('EMS 面单内容为空。');
    }

    const publicPath = saveLabelPdf(orderNo, waybillNo, pdfBuffer);
    return {
        response,
        labelType: payload.type,
        labelUrl: remoteUrl,
        labelFile: publicPath,
        pdfSize: pdfBuffer.length,
    };
}

async function queryTrackItems(waybillNo, direction = '0', options = {}) {
    const response = await callEmsApi(
        '040001',
        {
            waybillNo: safeText(waybillNo),
            direction: safeText(direction, '0'),
        },
        options,
    );

    const businessBody = pickBusinessBody(response.retBody);
    const items = normalizeTrackItems(Array.isArray(businessBody) ? businessBody : []);
    return {
        response,
        items,
    };
}

function runExec(command) {
    return new Promise((resolve, reject) => {
        exec(command, { windowsHide: true }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr?.trim() || error.message));
                return;
            }
            resolve({ stdout: stdout?.trim() || '', stderr: stderr?.trim() || '' });
        });
    });
}

function runExecFile(file, args = []) {
    return new Promise((resolve, reject) => {
        execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr?.trim() || error.message));
                return;
            }
            resolve({ stdout: stdout?.trim() || '', stderr: stderr?.trim() || '' });
        });
    });
}

function buildPowerShellArgs(command) {
    const utf8Prefix =
        '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ' +
        '$OutputEncoding = [System.Text.UTF8Encoding]::new($false); ';
    return ['-NoProfile', '-NonInteractive', '-Command', `${utf8Prefix}${command}`];
}

async function openFileWithDefaultApp(filePath) {
    const escapedFile = filePath.replace(/'/g, "''");
    await runExecFile('powershell.exe', buildPowerShellArgs(`Start-Process -FilePath '${escapedFile}'`));
}

function getConfiguredSumatraPath(config = getEmsConfig()) {
    const candidates = uniqueArray([
        safeText(config.sumatraPath),
        safeText(process.env.EMS_SUMATRA_PATH),
        process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'SumatraPDF', 'SumatraPDF.exe') : '',
        process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'SumatraPDF', 'SumatraPDF.exe') : '',
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'SumatraPDF', 'SumatraPDF.exe') : '',
    ]);

    return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || '';
}

function normalizePrinterRecord(rawPrinter = {}) {
    const source = safeObject(rawPrinter);
    return {
        name: safeText(source.Name ?? source.name),
        printerStatus: safeText(source.PrinterStatus ?? source.printerStatus),
        driverName: safeText(source.DriverName ?? source.driverName),
        portName: safeText(source.PortName ?? source.portName),
        workOffline: Boolean(source.WorkOffline ?? source.workOffline),
    };
}

function resolvePrinterRecord(printers = [], preferredName = '') {
    const list = Array.isArray(printers) ? printers : [];
    const target = safeText(preferredName);

    if (!target) {
        return list[0] || null;
    }

    const lowerTarget = target.toLowerCase();
    return (
        list.find((printer) => printer.name === target) ||
        list.find((printer) => printer.name.toLowerCase() === lowerTarget) ||
        list.find((printer) => printer.name.includes(target) || target.includes(printer.name)) ||
        null
    );
}

async function listWindowsPrinters() {
    if (process.platform !== 'win32') {
        return [];
    }

    try {
        const { stdout } = await runExecFile(
            'powershell.exe',
            buildPowerShellArgs(
                '$items = Get-Printer | Select-Object Name,PrinterStatus,DriverName,PortName,WorkOffline; $items | ConvertTo-Json -Depth 4',
            ),
        );
        const parsed = tryParseJson(stdout, []);
        const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
        return items.map(normalizePrinterRecord).filter((printer) => printer.name);
    } catch (error) {
        return [];
    }
}

async function getPrinterConfiguration(printerName = '') {
    if (process.platform !== 'win32' || !safeText(printerName)) {
        return null;
    }

    try {
        const escapedName = printerName.replace(/'/g, "''");
        const { stdout } = await runExecFile(
            'powershell.exe',
            buildPowerShellArgs(
                `Get-PrintConfiguration -PrinterName '${escapedName}' | Select-Object PaperSize,Color,DuplexingMode | ConvertTo-Json -Depth 4`,
            ),
        );
        const parsed = tryParseJson(stdout, null);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        return {
            paperSize: safeText(parsed.PaperSize ?? parsed.paperSize),
            color: safeText(parsed.Color ?? parsed.color),
            duplexingMode: safeText(parsed.DuplexingMode ?? parsed.duplexingMode),
        };
    } catch (error) {
        return null;
    }
}

function toPositiveNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

function parsePaperDimensions(value = '') {
    const text = safeText(value)
        .toLowerCase()
        .replace(/毫米/g, 'mm')
        .replace(/×/g, 'x');
    const matches = [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map((item) => Number(item[1]));

    if (matches.length < 2) {
        return { widthMm: 0, heightMm: 0 };
    }

    return {
        widthMm: toPositiveNumber(matches[0]),
        heightMm: toPositiveNumber(matches[1]),
    };
}

function normalizePaperIdentity(value = '') {
    return safeText(value)
        .toLowerCase()
        .replace(/毫米|mm/g, '')
        .replace(/×/g, 'x')
        .replace(/[^a-z0-9x]+/g, '');
}

function isPaperDimensionMatch(expectedWidth, expectedHeight, actualWidth, actualHeight) {
    const leftWidth = toPositiveNumber(expectedWidth);
    const leftHeight = toPositiveNumber(expectedHeight);
    const rightWidth = toPositiveNumber(actualWidth);
    const rightHeight = toPositiveNumber(actualHeight);

    if (!leftWidth || !leftHeight || !rightWidth || !rightHeight) {
        return null;
    }

    const tolerance = 1;
    const directMatch = Math.abs(leftWidth - rightWidth) <= tolerance && Math.abs(leftHeight - rightHeight) <= tolerance;
    const rotatedMatch = Math.abs(leftWidth - rightHeight) <= tolerance && Math.abs(leftHeight - rightWidth) <= tolerance;
    return directMatch || rotatedMatch;
}

function evaluatePaperMatch(config = getEmsConfig(), printerConfiguration = null) {
    const expectedName = safeText(config.paperName);
    const expectedWidthMm = toPositiveNumber(config.paperWidthMm);
    const expectedHeightMm = toPositiveNumber(config.paperHeightMm);
    const actualName = safeText(printerConfiguration?.paperSize);
    const actualDimensions = parsePaperDimensions(actualName);
    const expectedDimensions =
        expectedWidthMm && expectedHeightMm
            ? { widthMm: expectedWidthMm, heightMm: expectedHeightMm }
            : parsePaperDimensions(expectedName);
    const normalizedExpectedName = normalizePaperIdentity(expectedName);
    const normalizedActualName = normalizePaperIdentity(actualName);
    const nameMatch = normalizedExpectedName
        ? normalizedActualName
            ? normalizedActualName.includes(normalizedExpectedName) || normalizedExpectedName.includes(normalizedActualName)
            : null
        : null;
    const sizeMatch = isPaperDimensionMatch(
        expectedDimensions.widthMm,
        expectedDimensions.heightMm,
        actualDimensions.widthMm,
        actualDimensions.heightMm,
    );

    let match = null;
    if (sizeMatch === true || nameMatch === true) {
        match = true;
    } else if (actualName && (sizeMatch === false || nameMatch === false)) {
        match = false;
    }

    const expectedDisplay =
        expectedName ||
        (expectedDimensions.widthMm && expectedDimensions.heightMm
            ? `${expectedDimensions.widthMm}x${expectedDimensions.heightMm}mm`
            : '');
    const actualDisplay =
        actualName ||
        (actualDimensions.widthMm && actualDimensions.heightMm
            ? `${actualDimensions.widthMm}x${actualDimensions.heightMm}mm`
            : '');

    let reason = '';
    if (!actualName) {
        reason = '未读取到打印机纸张配置';
    } else if (match === false) {
        reason = `当前打印机纸张为 ${actualDisplay || actualName}，期望 ${expectedDisplay || '已配置纸张'}`;
    } else if (match === null && expectedDisplay) {
        reason = `未能确认打印机纸张是否匹配 ${expectedDisplay}`;
    }

    return {
        expectedName,
        expectedWidthMm: expectedDimensions.widthMm,
        expectedHeightMm: expectedDimensions.heightMm,
        expectedDisplay,
        actualName,
        actualWidthMm: actualDimensions.widthMm,
        actualHeightMm: actualDimensions.heightMm,
        actualDisplay,
        nameMatch,
        sizeMatch,
        match,
        reason,
    };
}

function printModeRequiresPrinter(mode = '') {
    const normalizedMode = safeText(mode).toLowerCase();
    return process.platform === 'win32' && !['browser', 'open'].includes(normalizedMode);
}

function printerLooksOffline(printer = {}) {
    const printerStatus = safeText(printer?.printerStatus).toLowerCase();
    return Boolean(printer?.workOffline) || /offline|脱机|error|错误|不可用/.test(printerStatus);
}

function evaluatePrintPreflight(diagnostics = {}, options = {}) {
    const config = options.config || getEmsConfig();
    const mode = safeText(options.mode, diagnostics.printMode || config.printMode).toLowerCase();
    const requiresPrinter = printModeRequiresPrinter(mode);
    const blockingReasons = [];
    const matchedPrinter = diagnostics.matchedPrinter || null;
    const paper = diagnostics.paper || null;

    if (requiresPrinter && !matchedPrinter) {
        blockingReasons.push('未匹配到默认打印机，请先在物流设置中确认打印机名称。');
    }
    if (requiresPrinter && matchedPrinter && printerLooksOffline(matchedPrinter)) {
        blockingReasons.push(`打印机 ${matchedPrinter.name} 当前离线或不可用，请先检查打印机连接状态。`);
    }
    if (requiresPrinter && matchedPrinter && !diagnostics.printerConfiguration?.paperSize) {
        blockingReasons.push('未读取到打印机纸张配置，请先在打印机驱动中确认纸张尺寸。');
    }
    if (requiresPrinter && paper?.match === false) {
        blockingReasons.push(`${paper.reason}，请调整为 ${paper.expectedDisplay || config.paperName} 后再打印。`);
    }
    if (requiresPrinter && paper?.match === null && paper?.reason) {
        blockingReasons.push(`${paper.reason}，请先完成打印机纸张自检。`);
    }

    return {
        ok: blockingReasons.length === 0,
        mode,
        requiresPrinter,
        printerOnline: matchedPrinter ? !printerLooksOffline(matchedPrinter) : false,
        blockingReasons,
    };
}

async function assertPrintPreflight(options = {}) {
    const diagnostics = await getPrintDiagnostics(options);
    if (diagnostics.preflight?.ok) {
        return diagnostics;
    }

    const errorMessage = diagnostics.preflight?.blockingReasons?.join('；') || '打印前自检未通过';
    const error = new Error(errorMessage);
    error.code = 'PRINT_PREFLIGHT';
    error.statusCode = 400;
    error.response = {
        retCode: 'PRINT_PREFLIGHT',
        retMsg: errorMessage,
        diagnostics,
    };
    throw error;
}

async function pingCloudPrintService() {
    const urls = ['http://127.0.0.1:8000/CLodopfuncs.js?health=1', 'http://localhost:8000/CLodopfuncs.js?health=1'];

    for (const url of urls) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1800);

        try {
            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (response.ok) {
                return {
                    reachable: true,
                    url,
                    status: response.status,
                };
            }
        } catch (error) {
            clearTimeout(timer);
        }
    }

    return {
        reachable: false,
        url: '',
        status: 0,
    };
}

async function printViaSumatra(diskPath, printerName = '', config = getEmsConfig()) {
    const sumatraPath = getConfiguredSumatraPath(config);
    if (!sumatraPath) {
        throw new Error('未检测到 SumatraPDF，可在后台物流设置里填写 SumatraPDF.exe 路径。');
    }

    const args = ['-silent'];
    if (printerName) {
        args.push('-print-to', printerName);
    } else {
        args.push('-print-to-default');
    }
    args.push('-print-settings', 'fit', diskPath);

    await runExecFile(sumatraPath, args);
    return {
        mode: 'sumatra',
        dispatched: true,
        message: printerName ? `已通过 SumatraPDF 发送到打印机 ${printerName}` : '已通过 SumatraPDF 发送到默认打印机',
        printerName,
        sumatraPath,
    };
}

async function printViaPowerShell(diskPath, printerName = '') {
    const escapedFile = diskPath.replace(/'/g, "''");
    const escapedPrinter = printerName.replace(/'/g, "''");
    const script = printerName
        ? `Start-Process -FilePath '${escapedFile}' -Verb PrintTo -ArgumentList '${escapedPrinter}'`
        : `Start-Process -FilePath '${escapedFile}' -Verb Print`;

    await runExecFile('powershell.exe', buildPowerShellArgs(script));
    return {
        mode: 'powershell',
        dispatched: true,
        message: printerName ? `已发送到打印机 ${printerName}` : '已发送到默认打印机',
        printerName,
    };
}

async function getPrintDiagnostics(options = {}) {
    const config = options.config || getEmsConfig();
    const preferredPrinter = safeText(options.printerName, config.printerName);
    const printers = await listWindowsPrinters();
    const matchedPrinter = resolvePrinterRecord(printers, preferredPrinter);
    const printerConfiguration = matchedPrinter ? await getPrinterConfiguration(matchedPrinter.name) : null;
    const cloudPrint = await pingCloudPrintService();
    const sumatraPath = getConfiguredSumatraPath(config);
    const paperMatch = evaluatePaperMatch(config, printerConfiguration);
    const warnings = [];

    if (process.platform === 'win32' && !printers.length) {
        warnings.push('未检测到本机打印机，请先安装打印机驱动。');
    }
    if (preferredPrinter && !matchedPrinter) {
        warnings.push(`后台配置的默认打印机“${preferredPrinter}”未在系统中检测到。`);
    }
    if ((config.printMode === 'auto' || config.printMode === 'sumatra') && !sumatraPath) {
        warnings.push('未检测到 SumatraPDF，自动静默打印会退回到其他方式。');
    }
    if (matchedPrinter && !printerConfiguration?.paperSize) {
        warnings.push('已找到打印机，但未读取到纸张配置，请确认驱动中纸张大小是否正确。');
    }
    if (matchedPrinter && printerConfiguration?.paperSize && safeText(config.paperName)) {
        const actualPaper = printerConfiguration.paperSize.toLowerCase();
        const expectedPaper = safeText(config.paperName).toLowerCase();
        if (actualPaper && !actualPaper.includes(expectedPaper) && !expectedPaper.includes(actualPaper)) {
            warnings.push(`当前打印机纸张为 ${printerConfiguration.paperSize}，建议确认是否已切换到 ${config.paperName}。`);
        }
    }

    if (matchedPrinter && paperMatch.match === false && paperMatch.reason) {
        warnings.push(`${paperMatch.reason}，自动打印前请先修正纸张配置。`);
    }
    if (matchedPrinter && paperMatch.match === null && paperMatch.reason) {
        warnings.push(`${paperMatch.reason}，建议先运行打印自检。`);
    }

    const diagnostics = {
        platform: process.platform,
        printMode: safeText(config.printMode),
        preferredPrinter,
        printers,
        matchedPrinter,
        printerConfiguration,
        sumatra: {
            available: Boolean(sumatraPath),
            path: sumatraPath,
        },
        cloudPrint,
        paper: {
            name: paperMatch.expectedName,
            widthMm: String(paperMatch.expectedWidthMm || ''),
            heightMm: String(paperMatch.expectedHeightMm || ''),
            actualName: paperMatch.actualName,
            actualWidthMm: String(paperMatch.actualWidthMm || ''),
            actualHeightMm: String(paperMatch.actualHeightMm || ''),
            match: paperMatch.match,
            reason: paperMatch.reason,
            expectedDisplay: paperMatch.expectedDisplay,
            actualDisplay: paperMatch.actualDisplay,
        },
        warnings,
    };

    diagnostics.preflight = evaluatePrintPreflight(diagnostics, { config });
    return diagnostics;

}

async function dispatchPrintJob(publicPath, options = {}) {
    const config = options.config || getEmsConfig();
    const diskPath = path.join(ROOT_DIR, safeText(publicPath).replace(/^[/\\]+/, '').replace(/\//g, path.sep));

    if (!fs.existsSync(diskPath)) {
        throw new Error('待打印的面单文件不存在。');
    }

    const printerName = safeText(options.printerName, config.printerName);
    const mode = safeText(options.mode, config.printMode || 'browser').toLowerCase();
    const errors = [];

    if (config.printCommand) {
        const command = config.printCommand
            .replace(/\{file\}/g, `"${diskPath}"`)
            .replace(/\{printer\}/g, printerName ? `"${printerName}"` : '""');

        await runExec(command);
        return {
            mode: 'command',
            dispatched: true,
            message: '已执行自定义打印命令。',
            printerName,
        };
    }

    if (process.platform === 'win32' && ['auto', 'sumatra'].includes(mode)) {
        try {
            return await printViaSumatra(diskPath, printerName, config);
        } catch (error) {
            errors.push(`sumatra:${safeText(error?.message)}`);
            if (mode === 'sumatra') {
                await openFileWithDefaultApp(diskPath);
                return {
                    mode: 'open',
                    dispatched: false,
                    message: '未能通过 SumatraPDF 静默打印，已打开面单文件，请手动打印。',
                    labelFile: publicPath,
                    fallbackReason: errors.join(' | '),
                };
            }
        }
    }

    if (process.platform === 'win32' && ['auto', 'powershell'].includes(mode)) {
        try {
            return await printViaPowerShell(diskPath, printerName);
        } catch (error) {
            errors.push(`powershell:${safeText(error?.message)}`);
        }
    }

    if (process.platform === 'win32' && mode === 'open') {
        await openFileWithDefaultApp(diskPath);
        return {
            mode: 'open',
            dispatched: false,
            message: '已打开面单文件，请在本机打印窗口里确认打印。',
            labelFile: publicPath,
            fallbackReason: errors.join(' | '),
        };
    }

    if (process.platform === 'win32') {
        await openFileWithDefaultApp(diskPath);
        return {
            mode: 'open',
            dispatched: false,
            message: '未能直接静默打印，已打开面单文件，请手动打印。',
            labelFile: publicPath,
            fallbackReason: errors.join(' | '),
        };
    }

    return {
        mode: 'browser',
        dispatched: false,
        message: '当前环境未配置静默打印，请在浏览器中打开面单后打印。',
        labelFile: publicPath,
        fallbackReason: errors.join(' | '),
    };

}

function normalizePartyAddress(raw = {}) {
    const source = safeObject(raw);
    return {
        name: safeText(source.name),
        mobile: safeText(source.mobile),
        phone: safeText(source.phone),
        postCode: safeText(source.postCode || source.post_code),
        prov: safeText(source.prov),
        city: safeText(source.city),
        county: safeText(source.county),
        address: safeText(source.address),
    };
}

function validatePartyAddress(party = {}, roleLabel = '地址') {
    const normalized = normalizePartyAddress(party);
    if (!normalized.name) {
        throw new Error(`${roleLabel}联系人不能为空。`);
    }
    if (!normalized.mobile) {
        throw new Error(`${roleLabel}手机号不能为空。`);
    }
    if (!normalized.prov || !normalized.city || !normalized.county || !normalized.address) {
        throw new Error(`${roleLabel}的省、市、区县和详细地址必须完整。`);
    }
    return normalized;
}

function summarizeLatestTrack(items = []) {
    const list = normalizeTrackItems(items);
    if (!list.length) return '';
    const latest = [...list].sort((left, right) => String(right.opTime).localeCompare(String(left.opTime)))[0];
    return [latest.opTime, latest.opDesc || latest.opName, latest.opOrgName].filter(Boolean).join(' / ');
}

module.exports = {
    DEFAULT_BIZ_PRODUCT_NO,
    DEFAULT_CONTENTS_ATTRIBUTE,
    DEFAULT_LABEL_TYPE,
    DEFAULT_WEIGHT_GRAMS,
    assertPrintPreflight,
    callEmsApi,
    checkReachability,
    createWaybillOrder,
    dispatchPrintJob,
    encryptLogisticsInterface,
    ensureEmsConfigured,
    evaluatePaperMatch,
    evaluatePrintPreflight,
    extractAddressDetail,
    formatTimestamp,
    getCloudPrintDownloadUrl,
    getConfiguredSumatraPath,
    getDefaultLabelType,
    getEmsApiUrl,
    getEmsConfig,
    getLabelDocument,
    getPrintDiagnostics,
    normalizePartyAddress,
    parseAddress,
    queryTrackItems,
    summarizeLatestTrack,
    toNullableBoolean,
    validatePartyAddress,
};
