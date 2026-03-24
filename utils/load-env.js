const fs = require('fs');
const path = require('path');

const ENV_FILES = ['.env', '.env.local'];

function stripWrappingQuotes(value) {
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
        return value
            .slice(1, -1)
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"');
    }

    if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
        return value.slice(1, -1);
    }

    return value;
}

function parseEnvFile(content) {
    const entries = {};

    content.split(/\r?\n/).forEach((line) => {
        const text = String(line || '').trim();
        if (!text || text.startsWith('#')) {
            return;
        }

        const separatorIndex = text.indexOf('=');
        if (separatorIndex <= 0) {
            return;
        }

        const key = text.slice(0, separatorIndex).trim();
        const rawValue = text.slice(separatorIndex + 1).trim();
        if (!key) {
            return;
        }

        entries[key] = stripWrappingQuotes(rawValue);
    });

    return entries;
}

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const entries = parseEnvFile(content);

    Object.entries(entries).forEach(([key, value]) => {
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    });
}

function loadLocalEnv(rootDir = path.join(__dirname, '..')) {
    ENV_FILES.forEach((fileName) => {
        loadEnvFile(path.join(rootDir, fileName));
    });
}

loadLocalEnv();

module.exports = {
    loadLocalEnv,
    parseEnvFile,
};
