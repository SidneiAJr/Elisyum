import * as crypto from 'crypto';
import { Request } from 'express';
import { ElisiumConfig } from './config';

export function generateRequestHash(req: Request): string {
    const ip     = req.socket.remoteAddress ?? '0.0.0.0';
    const method = req.method;
    const path   = req.originalUrl;
    const ua     = req.headers['user-agent'] ?? '';
    const ts     = Date.now().toString();
    const salt   = crypto.randomBytes(64).toString('hex');

    const raw = `${ip}|${method}|${path}|${ua}|${ts}|${salt}|${ElisiumConfig.token}`;

    return crypto
        .createHash(ElisiumConfig.algorithm)
        .update(raw)
        .digest('hex')
        .slice(0, 32); // 16 chars — legível nos logs
}