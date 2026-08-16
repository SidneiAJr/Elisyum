import { Request } from 'express';

export type HidraAttack = 'slowloris' | 'smuggling' | null;

// ── Request Smuggling ────────────────────────────────
// Detecta headers conflitantes Content-Length + Transfer-Encoding
function detectSmuggling(req: Request): boolean {
    const hasContentLength    = 'content-length' in req.headers;
    const hasTransferEncoding = 'transfer-encoding' in req.headers;

    // os dois juntos = sinal clássico de smuggling
    if (hasContentLength && hasTransferEncoding) return true;

    // Transfer-Encoding com valor estranho
    const te = req.headers['transfer-encoding'];
    if (te && te !== 'chunked') return true;

    return false;
}

// ── Header Size ──────────────────────────────────────
function detectOversizedHeaders(req: Request, maxHeaderSize: number): boolean {
    const headerStr = JSON.stringify(req.headers);
    return Buffer.byteLength(headerStr) > maxHeaderSize;
}

export interface HidraResult {
    attack: HidraAttack;
    motivo: string;
}

export function hidraScan(
    req: Request,
    opts: {
        slowloris:         boolean;
        requestSmuggling:  boolean;
        maxHeaderSize:     number;
    }
): HidraResult {
    if (opts.requestSmuggling && detectSmuggling(req)) {
        return {
            attack: 'smuggling',
            motivo: 'Headers conflitantes Content-Length + Transfer-Encoding',
        };
    }

    if (opts.slowloris && detectOversizedHeaders(req, opts.maxHeaderSize)) {
        return {
            attack: 'slowloris',
            motivo: `Headers acima do limite: ${opts.maxHeaderSize} bytes`,
        };
    }

    return { attack: null, motivo: '' };
}

// ── Timeout de conexão (Slowloris) ───────────────────
// Chama no nível do servidor, fora do middleware
export function aplicarTimeoutConexao(server: any, timeoutMs: number): void {
    server.setTimeout(timeoutMs, (socket: any) => {
        socket.destroy();
    });

    server.headersTimeout  = timeoutMs;
    server.requestTimeout  = timeoutMs;
}