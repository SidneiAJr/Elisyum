// src/modules/fingerprint.ts
import * as crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getIP } from '../utils/ip';
import { mefistofeles } from '../core/logger';
import { generateRequestHash } from '../core/hasher';

// ══════════════════════════════════════════════════════
// 🧬 FINGERPRINT — Identidade do Cliente
// Se o contexto mudou, o acesso é negado.
// ══════════════════════════════════════════════════════

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface FingerprintRecord {
    hash:        string;
    ip:          string;
    geradoEm:    number;
    usos:        number;
    ultimoAcesso: number;
}

interface FingerprintOptions {
    metodos?:       HttpMethod[];           // métodos permitidos — default todos
    ttl?:           number;                 // ms — tempo de vida do fingerprint
    maxUsos?:       number;                 // usos máximos antes de renegerar
    bloquearTroca?: boolean;                // bloqueia se IP/UA mudar — default true
}

// ── Store interno ─────────────────────────────────────
const fingerprintStore = new Map<string, FingerprintRecord>();

// limpeza periódica
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of fingerprintStore.entries()) {
        if (now - record.geradoEm > 60 * 60 * 1000) {
            fingerprintStore.delete(key);
        }
    }
}, 30 * 60 * 1000);

// ── Geração do fingerprint ────────────────────────────
function gerarFingerprint(req: Request): string {
    const ip  = getIP(req);
    const ua  = req.headers['user-agent']      ?? 'unknown';
    const al  = req.headers['accept-language'] ?? 'unknown';
    const enc = req.headers['accept-encoding'] ?? 'unknown';

    return crypto
        .createHash('sha512')
        .update(`${ip}|${ua}|${al}|${enc}`)
        .digest('hex');
}

// ── Middleware factory ────────────────────────────────
export function fingerprintMiddleware(options: FingerprintOptions = {}) {
    const {
        metodos       = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        ttl           = 30 * 60 * 1000,
        maxUsos       = 1000,
        bloquearTroca = true,
    } = options;

    return (req: Request, res: Response, next: NextFunction): void => {
        const ip        = getIP(req);
        const hash      = generateRequestHash(req);
        const method    = req.method as HttpMethod;

        // ── Verifica método permitido ─────────────────
        if (!metodos.includes(method)) {
            mefistofeles.bloqueado(hash, ip, 'FINGERPRINT', `Método ${method} não permitido nessa rota`);
            res.status(405).json({ error: '🧬 Método não autorizado nessa rota' });
            return;
        }

        const fingerprint = gerarFingerprint(req);
        const now         = Date.now();
        const existing    = fingerprintStore.get(ip);

        // ── IP novo — registra e segue ─────────────────
        if (!existing) {
            fingerprintStore.set(ip, {
                hash:         fingerprint,
                ip,
                geradoEm:     now,
                usos:         1,
                ultimoAcesso: now,
            });

            mefistofeles.chegada(hash, ip);

            // anexa fingerprint na requisição pra o JWT usar
            (req as any).elisiumFingerprint = fingerprint;
            return next();
        }

        // ── TTL expirado — renova ─────────────────────
        if (now - existing.geradoEm > ttl) {
            fingerprintStore.set(ip, {
                hash:         fingerprint,
                ip,
                geradoEm:     now,
                usos:         1,
                ultimoAcesso: now,
            });

            (req as any).elisiumFingerprint = fingerprint;
            return next();
        }

        // ── Fingerprint mudou — possível roubo ───────
        if (bloquearTroca && existing.hash !== fingerprint) {
            mefistofeles.bloqueado(hash, ip, 'FINGERPRINT', 'Contexto do cliente mudou — possível roubo de sessão');
            res.status(403).json({ error: '🧬 Fingerprint inválido — contexto alterado' });
            return;
        }

        // ── Usos esgotados — renova ───────────────────
        if (existing.usos >= maxUsos) {
            fingerprintStore.set(ip, {
                hash:         fingerprint,
                ip,
                geradoEm:     now,
                usos:         1,
                ultimoAcesso: now,
            });

            (req as any).elisiumFingerprint = fingerprint;
            return next();
        }

        // ── Tudo ok — atualiza e segue ────────────────
        existing.usos++;
        existing.ultimoAcesso = now;
        fingerprintStore.set(ip, existing);

        (req as any).elisiumFingerprint = fingerprint;
        next();
    };
}

// ── Exporta o fingerprint pra o JWT vincular ──────────
export function getFingerprintFromRequest(req: Request): string | null {
    return (req as any).elisiumFingerprint ?? null;
}