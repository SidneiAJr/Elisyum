import { Request, Response, NextFunction } from 'express';
import { EliasiumOptions } from './types';
import { memoryStore } from './store/MemoryStore';
import { generateRequestHash } from './core/hasher';
import { mefistofeles } from './core/logger';
import { nemesisScan } from './modules/nemesis';
import { hidraScan } from './modules/hidra';
import { calcularScore } from './modules/inteligencia';
import { getIP } from './utils/ip';

export function elisiumGuard(options: EliasiumOptions = {}) {
    const {
        cerberus     = {},
        caronte      = {},
        nemesis      = {},
        hidra        = {},
        atlas        = {},
        inteligencia = {},
        morfeu       = {},
    } = options;

    // ── defaults ──────────────────────────────────────
    const { whitelist = [], blacklist = [], banTime = 60 * 60 * 1000, maxStrikes = 3 } = cerberus;
    const { windowMs = 60 * 1000, max = 100 } = caronte;
    const { xss = true, sqlInjection = true, commandInjection = true, headerInjection = true } = nemesis;
    const { slowloris = true, requestSmuggling = true, connectionTimeout = 5000, maxHeaderSize = 8192 } = hidra;
    const { httpsOnly = false, penalizeHttp = true } = atlas;
    const { enabled: intelEnabled = true, banScoreThreshold = 80 } = inteligencia;

    // ── rate limit tracker ────────────────────────────
    const windowTracker = new Map<string, { count: number; start: number }>();
    // limpeza periódica do tracker
    setInterval(() => {
        const now = Date.now();
        for (const [ip, w] of windowTracker.entries()) {
            if (now - w.start > windowMs * 2) windowTracker.delete(ip);
        }
    }, windowMs * 2);

    return (req: Request, res: Response, next: NextFunction): void => {
        const ip   = getIP(req);
        const hash = generateRequestHash(req);

        mefistofeles.chegada(hash, ip);

        // ══════════════════════════════════════════════
        // ⚔️  CÉRBERO — Whitelist / Blacklist / Ban
        // ══════════════════════════════════════════════
        if (whitelist.includes(ip)) {
            mefistofeles.guiado(hash, ip);
            return next();
        }

        if (blacklist.includes(ip)) {
            mefistofeles.bloqueado(hash, ip, 'CÉRBERO', 'IP na blacklist permanente');
            res.status(403).json({ error: '⚔️ Cérbero late — você foi banido do Elísio' });
            return;
        }

        if (memoryStore.isBanned(ip)) {
            mefistofeles.bloqueado(hash, ip, 'CÉRBERO', 'IP banido temporariamente');
            res.status(403).json({ error: '⚔️ Cérbero late — você foi banido do Elísio' });
            return;
        }

        // ══════════════════════════════════════════════
        // 🌍 ATLAS — HTTP / HTTPS
        // ══════════════════════════════════════════════
        if (httpsOnly && req.protocol === 'http') {
            mefistofeles.bloqueado(hash, ip, 'ATLAS', 'Conexão HTTP rejeitada — HTTPS obrigatório');
            res.status(403).json({ error: '🌍 Atlas exige conexão segura — use HTTPS' });
            return;
        }

        // ══════════════════════════════════════════════
        // 🐍 HIDRA — Slowloris / Request Smuggling
        // ══════════════════════════════════════════════
        const hidraResult = hidraScan(req, { slowloris, requestSmuggling, maxHeaderSize });
        if (hidraResult.attack) {
            const strikes = memoryStore.addStrike(ip);
            mefistofeles.bloqueado(hash, ip, 'HIDRA', hidraResult.motivo);

            if (strikes >= maxStrikes) {
                memoryStore.ban(ip, banTime);
                mefistofeles.banido(hash, ip, 'HIDRA', hidraResult.motivo);
                morfeu.onBan?.(ip, hidraResult.motivo, hash);
            }

            res.status(400).json({ error: '🐍 A Hidra envolve sua conexão — acesso negado' });
            return;
        }

        // ══════════════════════════════════════════════
        // 🌊 CARONTE — Rate Limit
        // ══════════════════════════════════════════════
        const now    = Date.now();
        const window = windowTracker.get(ip) ?? { count: 0, start: now };

        if (now - window.start > windowMs) {
            window.count = 0;
            window.start = now;
        }
        window.count++;
        windowTracker.set(ip, window);
        memoryStore.increment(ip);

        if (window.count > max) {
            const strikes = memoryStore.addStrike(ip);
            mefistofeles.aviso(hash, ip, 'CARONTE', `rate limit atingido — strike ${strikes}/${maxStrikes}`);

            if (strikes >= maxStrikes) {
                memoryStore.ban(ip, banTime);
                mefistofeles.banido(hash, ip, 'CARONTE', 'Rate limit excedido repetidamente');
                morfeu.onBan?.(ip, 'Rate limit excedido', hash);
            }

            res.status(429).json({ error: '🌊 Caronte barra sua passagem — tente mais tarde' });
            return;
        }

        // ══════════════════════════════════════════════
        // 🛡️ NÉMESIS — XSS / SQLi / CMD / Header
        // ══════════════════════════════════════════════
        const nemesisResult = nemesisScan(req, { xss, sqlInjection, commandInjection, headerInjection });
        if (nemesisResult.attack) {
            const strikes = memoryStore.addStrike(ip);
            const msg = `ataque ${nemesisResult.attack.toUpperCase()} detectado em ${nemesisResult.origem}`;
            mefistofeles.bloqueado(hash, ip, 'NÉMESIS', msg);

            if (strikes >= maxStrikes) {
                memoryStore.ban(ip, banTime);
                mefistofeles.banido(hash, ip, 'NÉMESIS', msg);
                morfeu.onBan?.(ip, msg, hash);
            }

            res.status(400).json({ error: '🛡️ Némesis te pune — comportamento malicioso detectado' });
            return;
        }

        // ══════════════════════════════════════════════
        // 🧠 INTELIGÊNCIA — Score Heurístico
        // ══════════════════════════════════════════════
        if (intelEnabled) {
            const record = memoryStore.get(ip);
            const { score, motivos } = calcularScore(req, record);
            memoryStore.updateScore(ip, score);

            if (motivos.length > 0) {
                mefistofeles.aviso(hash, ip, 'INTELIGÊNCIA', `score ${score}/100 — ${motivos.join(' | ')}`);
            }

            if (score >= banScoreThreshold) {
                memoryStore.ban(ip, banTime);
                const msg = `Score heurístico crítico: ${score}/100`;
                mefistofeles.banido(hash, ip, 'INTELIGÊNCIA', msg);
                morfeu.onBan?.(ip, msg, hash);
                res.status(403).json({ error: '🧠 A Inteligência te vê — comportamento suspeito detectado' });
                return;
            }
        }

        // ══════════════════════════════════════════════
        // ✨ ELÍSIO — Passou em tudo!
        // ══════════════════════════════════════════════
        mefistofeles.guiado(hash, ip);
        next();
    };
}