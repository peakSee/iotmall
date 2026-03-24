window.AppTools = (() => {
    const api = axios.create({ baseURL: '/api' });
    const CLOUD_PRINT_SCRIPT_URLS = ['http://localhost:8000/CLodopfuncs.js?priority=1', 'http://127.0.0.1:8000/CLodopfuncs.js?priority=1'];
    let cloudPrintLoader = null;

    api.interceptors.request.use((config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    });

    const money = (value) => `\u00A5${Number(value || 0).toFixed(2)}`;
    const linesToText = (value) => (Array.isArray(value) ? value.join('\n') : '');
    const textToLines = (value) =>
        String(value || '')
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean);
    const encodePath = (value) => {
        const text = String(value || '').trim();
        if (!text) return '';
        if (/^(data:|https?:\/\/)/i.test(text)) return text;

        const normalizedText = (() => {
            try {
                return decodeURI(text);
            } catch {
                return text;
            }
        })();

        const [pathPart, query = ''] = normalizedText.split('?');
        const encoded = pathPart
            .split('/')
            .map((segment, index) => {
                if (!segment) return index === 0 ? '' : segment;
                return encodeURIComponent(segment);
            })
            .join('/');

        return query ? `${encoded}?${query}` : encoded;
    };
    const absoluteUrl = (value) => {
        const text = encodePath(value);
        if (!text) return '';
        if (/^https?:\/\//i.test(text)) return text;
        return new URL(text, window.location.origin).toString();
    };
    const loadCloudPrintScript = async () => {
        if (typeof window.getCLodop === 'function') {
            return window.getCLodop();
        }

        if (!cloudPrintLoader) {
            cloudPrintLoader = new Promise((resolve, reject) => {
                let settled = false;

                const finish = () => {
                    if (settled || typeof window.getCLodop !== 'function') return;
                    settled = true;
                    resolve(window.getCLodop());
                };

                const fail = (message) => {
                    if (settled) return;
                    settled = true;
                    cloudPrintLoader = null;
                    reject(new Error(message));
                };

                CLOUD_PRINT_SCRIPT_URLS.forEach((scriptUrl) => {
                    const script = document.createElement('script');
                    script.src = scriptUrl;
                    script.async = true;
                    script.onload = finish;
                    script.onerror = () => {};
                    document.head.appendChild(script);
                });

                window.setTimeout(finish, 1500);
                window.setTimeout(() => {
                    fail('未连接到本机 C-Lodop 服务，请先安装并启动 EMS 云打印控件。');
                }, 4000);
            });
        }

        return cloudPrintLoader;
    };
    const getCloudPrinterNames = (lodop) => {
        const printerCount = Number(lodop?.GET_PRINTER_COUNT?.() || 0);
        return Array.from({ length: printerCount }, (_, index) => String(lodop.GET_PRINTER_NAME(index) || '').trim()).filter(Boolean);
    };
    const inspectCloudPrint = async () => {
        const lodop = await loadCloudPrintScript();
        return {
            reachable: true,
            printers: getCloudPrinterNames(lodop),
        };
    };
    const printPdfViaCloud = async ({ pdfUrl, printerName = '', taskName = 'EMS面单打印' } = {}) => {
        const nextUrl = absoluteUrl(pdfUrl);
        const state = await inspectCloudPrint();
        const detectedPrinter = state.printers.find((name) => name === printerName) || state.printers[0] || '';
        throw new Error(
            `当前免费 C-Lodop 方案不支持直接打印 PDF 面单，请改用后台本地打印。检测到打印机：${detectedPrinter || '未找到'}，任务：${taskName}，文件：${nextUrl || '未提供'}`,
        );
    };

    const placeholder = (label, colorA = '#0E6D68', colorB = '#F28C28') =>
        `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 720">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${colorA}" />
      <stop offset="1" stop-color="${colorB}" />
    </linearGradient>
  </defs>
  <rect width="960" height="720" rx="36" fill="#f7f2ea" />
  <rect x="36" y="36" width="888" height="648" rx="28" fill="url(#bg)" />
  <circle cx="136" cy="132" r="72" fill="rgba(255,255,255,0.15)" />
  <circle cx="816" cy="162" r="96" fill="rgba(255,255,255,0.1)" />
  <rect x="100" y="188" width="760" height="360" rx="28" fill="rgba(255,255,255,0.12)" />
  <text x="480" y="360" text-anchor="middle" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="56" font-weight="700" fill="#ffffff">${label}</text>
  <text x="480" y="432" text-anchor="middle" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="28" fill="rgba(255,255,255,0.88)">上传图片后这里会自动展示成品图</text>
</svg>
`)}`;

    return {
        absoluteUrl,
        api,
        encodePath,
        getCloudPrinterNames,
        inspectCloudPrint,
        linesToText,
        loadCloudPrintScript,
        money,
        placeholder,
        printPdfViaCloud,
        textToLines,
    };
})();
