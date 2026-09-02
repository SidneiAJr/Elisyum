// 🛡️ Némesis — pune o comportamento malicioso

const SQL_PATTERNS = [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
    /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
    /(DROP|SELECT|INSERT|UPDATE|DELETE|UNION|ALTER|EXEC|CAST|CONVERT)\s/i,
];

const XSS_PATTERNS = [
    /<script\b[^>]*>[\s\S]*?<\/\s*script\b[^>]*>/gi,  // único padrão robusto
    /javascript\s*:/gi,
    /on\w+\s*=/gi,
    /<\s*iframe/gi,
    /data\s*:\s*text\/html/gi,
    /vbscript\s*:/gi,
];

const CMD_PATTERNS = [
    /[;&|`$](\s*)(ls|cat|rm|wget|curl|bash|sh|python|perl|nc|netcat|chmod|chown)/i,
    /\.\.\//,                           // path traversal
    /%2e%2e%2f/i,                       // path traversal encoded
    /(\/etc\/passwd|\/etc\/shadow)/i,
    /(\||>|>>|<)\s*\/\w+/,             // redirecionamento de shell
];

const HEADER_PATTERNS = [
    /\r\n|\r|\n/,   // CRLF injection
    /%0d%0a/i,      // CRLF encoded
    /%0a/i,
    /%0d/i,
];

export type NemesisAttack = 'sql' | 'xss' | 'cmd' | 'header' | null;

function detectSQL(v: string): boolean {
    return SQL_PATTERNS.some(p => p.test(v));
}
function detectXSS(v: string): boolean {
    return XSS_PATTERNS.some(p => p.test(v));
}
function detectCMD(v: string): boolean {
    return CMD_PATTERNS.some(p => p.test(v));
}
function detectHeader(v: string): boolean {
    return HEADER_PATTERNS.some(p => p.test(v));
}

function scanObject(obj: any, depth = 0): NemesisAttack {
    if (!obj || depth > 5) return null;
    for (const v of Object.values(obj)) {
        if (typeof v === 'string') {
            if (detectSQL(v))    return 'sql';
            if (detectXSS(v))    return 'xss';
            if (detectCMD(v))    return 'cmd';
        }
        if (typeof v === 'object') {
            const result = scanObject(v, depth + 1);
            if (result) return result;
        }
    }
    return null;
}

export interface NemesisResult {
    attack: NemesisAttack;
    origem: string;
}

export function nemesisScan(
    req: any,
    opts: { xss: boolean; sqlInjection: boolean; commandInjection: boolean; headerInjection: boolean }
): NemesisResult {
    // ── Headers ─────────────────────────────────────
    if (opts.headerInjection) {
        for (const [key, val] of Object.entries(req.headers)) {
            const v = Array.isArray(val) ? val.join('') : String(val);
            if (detectHeader(v)) {
                return { attack: 'header', origem: `header:${key}` };
            }
        }
    }

    // ── Body / Query / Params ────────────────────────
    const payload = { ...req.body, ...req.query, ...req.params };
    const attack = scanObject(payload);

    if (attack === 'sql' && !opts.sqlInjection)    return { attack: null, origem: '' };
    if (attack === 'xss' && !opts.xss)             return { attack: null, origem: '' };
    if (attack === 'cmd' && !opts.commandInjection) return { attack: null, origem: '' };

    return { attack, origem: 'body/query/params' };
}