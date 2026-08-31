import * as crypto from 'crypto';
import { ElisiumConfig } from '../core/config';

// ── Estrutura do JWT ─────────────────────────────────
export interface JWTPayload {
    sub:  string;
    iat:  number;
    exp:  number;
    hash: string;
    fp?:  string;          // ← fingerprint vinculado
    [key: string]: any;
}

export interface JWTOptions {
    expiresIn?:   number;
    claims?:      Record<string, any>;
    fingerprint?: string;              // ← novo
}

// ── Helpers ──────────────────────────────────────────
function base64url(input: string | Buffer): string {
    const buf = typeof input === 'string' ? Buffer.from(input) : input;
    return buf.toString('base64')
        .replace(/=/g,  '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function sign(data: string): string {
    return base64url(
        crypto
            .createHmac(ElisiumConfig.algorithm, ElisiumConfig.token)
            .update(data)
            .digest()
    );
}

// ── Gerar Token ──────────────────────────────────────
export function gerarToken(
    subject:     string,
    requestHash: string,
    options:     JWTOptions = {}
): string {
    const { expiresIn = 60 * 60 * 1000, claims = {}, fingerprint } = options;

    const header = base64url(JSON.stringify({
        alg: ElisiumConfig.algorithm === 'sha512' ? 'HS512' : 'HS256',
        typ: 'JWT',
    }));

    const payload = base64url(JSON.stringify({
        sub:  subject,
        iat:  Date.now(),
        exp:  Date.now() + expiresIn,
        hash: requestHash,
        ...(fingerprint ? { fp: fingerprint } : {}),  // ← só inclui se tiver
        ...claims,
    }));

    const signature = sign(`${header}.${payload}`);

    return `${header}.${payload}.${signature}`;
}

// ── Validar Token ────────────────────────────────────
export type ValidationResult =
    | { valid: true;  payload: JWTPayload }
    | { valid: false; motivo: string };

export function validarToken(token: string, fingerprint?: string): ValidationResult {
    const parts = token.split('.');

    if (parts.length !== 3) {
        return { valid: false, motivo: 'Token malformado — estrutura inválida' };
    }

    const [header, payload, signature] = parts;

    // ── verifica assinatura ──────────────────────────
    const expectedSig = sign(`${header}.${payload}`);
    // depois
const sigBuf = Buffer.from(signature);
const expBuf = Buffer.from(expectedSig);

if (sigBuf.length !== expBuf.length) {
    return { valid: false, motivo: 'Assinatura inválida — token adulterado' };
}

const validSig = crypto.timingSafeEqual(sigBuf, expBuf);
    if (!validSig) {
        return { valid: false, motivo: 'Assinatura inválida — token adulterado' };
    }

    // ── decodifica payload ───────────────────────────
    let decoded: JWTPayload;
    try {
        decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    } catch {
        return { valid: false, motivo: 'Payload corrompido — não foi possível decodificar' };
    }

    // ── verifica expiração ───────────────────────────
    if (Date.now() > decoded.exp) {
        return { valid: false, motivo: `Token expirado em ${new Date(decoded.exp).toISOString()}` };
    }

    // ── verifica fingerprint ─────────────────────────
    if (fingerprint && decoded.fp && decoded.fp !== fingerprint) {
        return { valid: false, motivo: 'Fingerprint não bate — possível roubo de token' };
    }

    return { valid: true, payload: decoded };
}