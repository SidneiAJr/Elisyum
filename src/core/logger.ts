// 🔱 Mefistófeles — o guia que nada esconde, tudo registra
import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = path.resolve(process.cwd(), 'logs', 'elisium');

// cria a pasta se não existir
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

function writeLog(entry: LogEntry): void {
    const filename = new Date().toISOString().slice(0, 10); // 2026-08-29.json
    const filepath = path.join(LOG_DIR, `${filename}.json`);
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(filepath, line);
}

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
        const entry: LogEntry = { hash, ip, level: 'info', ts: timestamp(), module: 'MEFISTÓFELES', message: 'este viajante bate à porta do Elísio' };
        console.log(format(entry));
        writeLog(entry);
    },

    guiado(hash: string, ip: string): void {
        const entry: LogEntry = { hash, ip, level: 'pass', ts: timestamp(), module: 'MEFISTÓFELES', message: 'Mefistófeles guia este viajante ao seu caminho ✨' };
        console.log(format(entry));
        writeLog(entry);
    },

    bloqueado(hash: string, ip: string, modulo: string, motivo: string): void {
        const entry: LogEntry = { hash, ip, level: 'block', ts: timestamp(), module: modulo, message: motivo };
        console.log(format(entry));
        writeLog(entry);
    },

    banido(hash: string, ip: string, modulo: string, motivo: string): void {
        const entry: LogEntry = { hash, ip, level: 'ban', ts: timestamp(), module: modulo, message: `🔥 banido — ${motivo}` };
        console.log(format(entry));
        writeLog(entry);
    },

    aviso(hash: string, ip: string, modulo: string, motivo: string): void {
        const entry: LogEntry = { hash, ip, level: 'warn', ts: timestamp(), module: modulo, message: motivo };
        console.log(format(entry));
        writeLog(entry);
    },
};