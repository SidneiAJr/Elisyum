// 🔱 Mefistófeles — o guia que nada esconde, tudo registra

export type LogLevel = 'info' | 'warn' | 'block' | 'ban' | 'pass';

interface LogEntry {
    hash:    string;
    level:   LogLevel;
    module:  string;
    ip:      string;
    message: string;
    ts:      string;
}

const ICONS: Record<LogLevel, string> = {
    info:  '📜',
    warn:  '⚠️ ',
    block: '🚫',
    ban:   '⚔️ ',
    pass:  '✨',
};

function timestamp(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function format(entry: LogEntry): string {
    const icon = ICONS[entry.level];
    return `${icon} [${entry.ts}] [${entry.module}] {${entry.hash}} ${entry.ip} — ${entry.message}`;
}

export const mefistofeles = {
    chegada(hash: string, ip: string): void {
        console.log(format({
            hash, ip, level: 'info', ts: timestamp(),
            module: 'MEFISTÓFELES',
            message: 'este viajante bate à porta do Elísio',
        }));
    },

    guiado(hash: string, ip: string): void {
        console.log(format({
            hash, ip, level: 'pass', ts: timestamp(),
            module: 'MEFISTÓFELES',
            message: 'Mefistófeles guia este viajante ao seu caminho ✨',
        }));
    },

    bloqueado(hash: string, ip: string, modulo: string, motivo: string): void {
        console.log(format({
            hash, ip, level: 'block', ts: timestamp(),
            module: modulo,
            message: motivo,
        }));
    },

    banido(hash: string, ip: string, modulo: string, motivo: string): void {
        console.log(format({
            hash, ip, level: 'ban', ts: timestamp(),
            module: modulo,
            message: `🔥 banido — ${motivo}`,
        }));
    },

    aviso(hash: string, ip: string, modulo: string, motivo: string): void {
        console.log(format({
            hash, ip, level: 'warn', ts: timestamp(),
            module: modulo,
            message: motivo,
        }));
    },
};