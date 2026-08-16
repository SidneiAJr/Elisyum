import { Request } from 'express';
import { IPRecord } from '../types';

interface ScoreResult {
    score:   number;
    motivos: string[];
}

const BOT_UA_PATTERNS = [
    /curl/i, /wget/i, /python/i, /go-http/i,
    /java/i, /ruby/i, /scrapy/i, /axios/i,
];

export function calcularScore(req: Request, record: IPRecord): ScoreResult {
    let score   = 0;
    const motivos: string[] = [];
    const now   = Date.now();
    const hora  = new Date().getHours();

    // ── User-Agent ──────────────────────────────────
    const ua = req.headers['user-agent'];
    if (!ua) {
        score += 20;
        motivos.push('User-Agent ausente (+20)');
    } else if (BOT_UA_PATTERNS.some(p => p.test(ua))) {
        score += 15;
        motivos.push(`User-Agent de bot detectado: ${ua} (+15)`);
    }

    // ── Accept-Language ─────────────────────────────
    if (!req.headers['accept-language']) {
        score += 15;
        motivos.push('Accept-Language ausente (+15)');
    }

    // ── Tamanho do payload ──────────────────────────
    const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
    if (contentLength > 1_000_000) {       // > 1MB
        score += 25;
        motivos.push(`Payload gigante: ${contentLength} bytes (+25)`);
    } else if (contentLength > 100_000) {  // > 100KB
        score += 10;
        motivos.push(`Payload grande: ${contentLength} bytes (+10)`);
    }

    // ── Frequência entre requisições ────────────────
    const intervalo = now - record.lastRequest;
    if (record.requests > 5 && intervalo < 100) {
        score += 25;
        motivos.push(`Requisições muito rápidas: ${intervalo}ms entre requests (+25)`);
    } else if (record.requests > 5 && intervalo < 500) {
        score += 10;
        motivos.push(`Requisições rápidas: ${intervalo}ms entre requests (+10)`);
    }

    // ── Horário suspeito ────────────────────────────
    if (hora >= 0 && hora <= 5 && record.requests > 50) {
        score += 20;
        motivos.push(`Horário suspeito: ${hora}h com ${record.requests} requisições (+20)`);
    }

    // ── HTTP em vez de HTTPS ────────────────────────
    if (req.protocol === 'http') {
        score += 5;
        motivos.push('Conexão HTTP não criptografada (+5)');
    }

    return { score: Math.min(score, 100), motivos };
}