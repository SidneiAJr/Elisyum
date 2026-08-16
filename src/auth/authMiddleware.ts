// src/auth/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { validarToken } from '../utils/jwt';
import { getFingerprintFromRequest } from '../modules/fingerprint';
import { mefistofeles } from '../core/logger';
import { generateRequestHash } from '../core/hasher';
import { getIP } from '../utils/ip';

// ══════════════════════════════════════════════════════
// 🔐 AUTH MIDDLEWARE — Guardião do JWT
// Sem token válido, sem fingerprint, sem passagem.
// ══════════════════════════════════════════════════════

interface AuthOptions {
    ignorarFingerprint?: boolean;  // default false
}

export function authMiddleware(options: AuthOptions = {}) {
    const { ignorarFingerprint = false } = options;

    return (req: Request, res: Response, next: NextFunction): void => {
        const ip   = getIP(req);
        const hash = generateRequestHash(req);

        // ── Extrai token do header ────────────────────
        const authHeader = req.headers['authorization'];

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            mefistofeles.bloqueado(hash, ip, 'AUTH', 'Token ausente ou malformado no header');
            res.status(401).json({ error: '🔐 Token não fornecido' });
            return;
        }

        const token = authHeader.split(' ')[1];

        // ── Pega fingerprint do req ───────────────────
        const fingerprint = ignorarFingerprint
            ? undefined
            : getFingerprintFromRequest(req) ?? undefined;

        // ── Valida JWT + fingerprint ──────────────────
        const resultado = validarToken(token, fingerprint);

        if (!resultado.valid) {
            mefistofeles.bloqueado(hash, ip, 'AUTH', resultado.motivo);
            res.status(401).json({ error: `🔐 ${resultado.motivo}` });
            return;
        }

        // ── Injeta payload no req pra rota usar ───────
        (req as any).elisiumUser = resultado.payload;

        mefistofeles.guiado(hash, ip);
        next();
    };
}