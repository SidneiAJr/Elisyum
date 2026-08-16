import { IPRecord } from '../types';

export class MemoryStore {
    private store = new Map<string, IPRecord>();

    // ─── limpeza automática de IPs inativos (30min) ───
    constructor() {
        setInterval(() => this.cleanup(), 30 * 60 * 1000);
    }

    private cleanup(): void {
        const now = Date.now();
        for (const [ip, record] of this.store.entries()) {
            const inativo = now - record.lastRequest > 30 * 60 * 1000;
            const banExpirado = record.bannedUntil && now > record.bannedUntil;
            if (inativo || banExpirado) {
                this.store.delete(ip);
            }
        }
    }

    get(ip: string): IPRecord {
        if (!this.store.has(ip)) {
            const now = Date.now();
            this.store.set(ip, {
                requests:     0,
                strikes:      0,
                bannedUntil:  null,
                firstRequest: now,
                lastRequest:  now,
                score:        0,
            });
        }
        return this.store.get(ip)!;
    }

    set(ip: string, record: IPRecord): void {
        this.store.set(ip, record);
    }

    isBanned(ip: string): boolean {
        const record = this.get(ip);
        if (!record.bannedUntil) return false;
        if (Date.now() > record.bannedUntil) {
            record.bannedUntil = null;
            record.strikes     = 0;
            record.requests    = 0;
            record.score       = 0;
            this.set(ip, record);
            return false;
        }
        return true;
    }

    ban(ip: string, banTime: number): void {
        const record = this.get(ip);
        record.bannedUntil = Date.now() + banTime;
        this.set(ip, record);
    }

    addStrike(ip: string): number {
        const record = this.get(ip);
        record.strikes     += 1;
        record.lastRequest  = Date.now();
        this.set(ip, record);
        return record.strikes;
    }

    increment(ip: string): number {
        const record = this.get(ip);
        record.requests    += 1;
        record.lastRequest  = Date.now();
        this.set(ip, record);
        return record.requests;
    }

    updateScore(ip: string, score: number): void {
        const record = this.get(ip);
        record.score = score;
        this.set(ip, record);
    }

    reset(ip: string): void {
        this.store.delete(ip);
    }
}

export const memoryStore = new MemoryStore();