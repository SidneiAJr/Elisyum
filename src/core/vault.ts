import * as crypto from 'crypto';
import { EventEmitter } from 'events';

// ══════════════════════════════════════════════════════
// 🔱 TOKEN VAULT — Cofre Interno do Elísio
// Zero exposição. Zero confiança. Zero misericórdia.
// ══════════════════════════════════════════════════════

type HashAlgorithm = 'sha256' | 'sha512';

interface VaultState {
    readonly atual:     string;
    readonly reserva1:  string;
    readonly reserva2:  string;
    readonly proximo:   string;
    readonly geradoEm:  number;
    readonly usos:      number;
}

interface VaultMetrics {
    totalRotacoes:    number;
    totalAssinaturas: number;
    totalValidacoes:  number;
    totalFalhas:      number;
    ultimaRotacao:    number;
    boot:             number;
}

// ── Anti-debug ───────────────────────────────────────
function detectarDebug(): boolean {
    const args = process.execArgv.join(' ');
    return (
        args.includes('--inspect') ||
        args.includes('--inspect-brk') ||
        args.includes('--debug') ||
        typeof (process as any)['_debugProcess'] === 'function'
    );
}

// ── HKDF manual ──────────────────────────────────────
function hkdf(secret: Buffer, salt: Buffer, info: string, length: number): Buffer {
    const prk = crypto.createHmac('sha512', salt).update(secret).digest();
    const blocks: Buffer[] = [];
    let prev = Buffer.alloc(0);
    const infoBuffer = Buffer.from(info);
    let i = 1;
    while (blocks.reduce((a, b) => a + b.length, 0) < length) {
        const hmac = crypto.createHmac('sha512', prk);
        hmac.update(Buffer.concat([prev, infoBuffer, Buffer.from([i++])]));
        prev = hmac.digest();
        blocks.push(prev);
    }
    return Buffer.concat(blocks).slice(0, length);
}

// ── Geração monstruosa ───────────────────────────────
function gerarTokenBruto(semente?: string): string {
    const e1 = crypto.randomBytes(128);
    const e2 = Buffer.from(process.hrtime.bigint().toString());
    const e3 = crypto.randomBytes(64);
    const e4 = semente ? Buffer.from(semente) : crypto.randomBytes(64);

    const xored = Buffer.alloc(64);
    for (let i = 0; i < 64; i++) xored[i] = e1[i] ^ e3[i];

    const salt    = crypto.randomBytes(64);
    const info    = `elisium|vault|${Date.now()}`;
    const derivado = hkdf(Buffer.concat([e1, e2, e3, e4, xored]), salt, info, 128);

    const pbkdf2 = crypto.pbkdf2Sync(derivado, salt, 100_000, 64, 'sha512');

    const pass1 = crypto.createHash('sha512')
        .update(Buffer.concat([derivado, pbkdf2, e2])).digest('hex');
    const pass2 = crypto.createHash('sha512')
        .update(pass1 + xored.toString('hex')).digest('hex');

    return pass2;
}

// ── Comparação segura ─────────────────────────────────
function compararSeguro(a: string, b: string): boolean {
    const ba = Buffer.alloc(256, 0);
    const bb = Buffer.alloc(256, 0);
    Buffer.from(a).copy(ba);
    Buffer.from(b).copy(bb);
    return crypto.timingSafeEqual(ba, bb);
}

// ── Delay aleatório anti-timing ───────────────────────
async function delayAleatorio(): Promise<void> {
    const ms = crypto.randomInt(1, 5);
    return new Promise(r => setTimeout(r, ms));
}

// ══════════════════════════════════════════════════════
// 🔱 CLASSE PRINCIPAL
// ══════════════════════════════════════════════════════
class TokenVault extends EventEmitter {
    private static instancia: TokenVault | null = null;

    private state!:    VaultState;
    private metrics!:  VaultMetrics;
    private algorithm: HashAlgorithm;
    private interval:  NodeJS.Timeout | null = null;
    private rotacaoMs: number;
    private maxUsos:   number;
    private destruido: boolean = false;

    // ── Singleton ────────────────────────────────────
    static getInstance(rotacaoMs = 30 * 60 * 1000, maxUsos = 10_000): TokenVault {
        if (!TokenVault.instancia) {
            TokenVault.instancia = new TokenVault(rotacaoMs, maxUsos);
        }
        return TokenVault.instancia;
    }

    private constructor(rotacaoMs: number, maxUsos: number) {
        super();

        if (detectarDebug()) {
            process.stderr.write('⚠️  [VAULT] Modo debug detectado — operando em modo restrito\n');
        }

        // congela protótipos — anti-tamper
        Object.freeze(TokenVault.prototype);
        Object.freeze(EventEmitter.prototype);

        this.rotacaoMs = rotacaoMs;
        this.maxUsos   = maxUsos;
        this.algorithm = this.resolverAlgoritmo();
        this.metrics   = {
            totalRotacoes:    0,
            totalAssinaturas: 0,
            totalValidacoes:  0,
            totalFalhas:      0,
            ultimaRotacao:    0,
            boot:             Date.now(),
        };

        this.state = this.inicializar();
        this.iniciarRotacao();
        this.registrarShutdown();
    }

    // ── Inicialização ─────────────────────────────────
    private inicializar(): VaultState {
        const atual    = gerarTokenBruto();
        const reserva1 = gerarTokenBruto(atual);
        const reserva2 = gerarTokenBruto(reserva1);
        const proximo  = gerarTokenBruto(reserva2);

        return Object.freeze({ atual, reserva1, reserva2, proximo, geradoEm: Date.now(), usos: 0 });
    }

    // ── Rotação ───────────────────────────────────────
    private iniciarRotacao(): void {
        this.interval = setInterval(() => this.rotacionar(), this.rotacaoMs);
        this.interval.unref();
    }

    private rotacionar(): void {
        if (this.destruido) return;

        const novoProximo  = gerarTokenBruto(this.state.proximo);
        const estadoAntigo = { ...this.state };

        this.state = Object.freeze({
            reserva2: estadoAntigo.reserva1,
            reserva1: estadoAntigo.atual,
            atual:    estadoAntigo.proximo,
            proximo:  novoProximo,
            geradoEm: Date.now(),
            usos:     0,
        });

        // zera referências antigas
        Object.keys(estadoAntigo).forEach(k => { (estadoAntigo as any)[k] = ''; });

        this.metrics.totalRotacoes++;
        this.metrics.ultimaRotacao = Date.now();

        this.emit('rotacao', {
            rotacao:          this.metrics.totalRotacoes,
            proximaRotacaoEm: this.rotacaoMs,
        });
    }

    private verificarRotacaoPorUso(): void {
        if (this.state.usos >= this.maxUsos) this.rotacionar();
    }

    private resolverAlgoritmo(): HashAlgorithm {
        return process.env.ELISIUM_HASH === '256' ? 'sha256' : 'sha512';
    }

    private registrarShutdown(): void {
        const limpar = () => this.destruir();
        process.once('SIGTERM', limpar);
        process.once('SIGINT',  limpar);
        process.once('exit',    limpar);
    }

    // ══════════════════════════════════════════════════
    // API PÚBLICA
    // ══════════════════════════════════════════════════

    assinar(dados: string): string {
        if (this.destruido) throw new Error('🔱 [VAULT] Cofre destruído');
        this.verificarRotacaoPorUso();

        const hmac = crypto
            .createHmac(this.algorithm, this.state.atual)
            .update(dados)
            .digest('hex');

        this.state = Object.freeze({ ...this.state, usos: this.state.usos + 1 });
        this.metrics.totalAssinaturas++;
        return hmac;
    }

    async validar(dados: string, assinatura: string): Promise<boolean> {
        if (this.destruido) throw new Error('🔱 [VAULT] Cofre destruído');
        this.metrics.totalValidacoes++;

        // calcula os 3 sempre — sem short-circuit
        const hmac1 = crypto.createHmac(this.algorithm, this.state.atual)
            .update(dados).digest('hex');
        const hmac2 = crypto.createHmac(this.algorithm, this.state.reserva1)
            .update(dados).digest('hex');
        const hmac3 = crypto.createHmac(this.algorithm, this.state.reserva2)
            .update(dados).digest('hex');

        await delayAleatorio();

        // compara todos — sempre — sem parar no primeiro
        const v1 = compararSeguro(hmac1, assinatura);
        const v2 = compararSeguro(hmac2, assinatura);
        const v3 = compararSeguro(hmac3, assinatura);

        const valido = v1 || v2 || v3;
        if (!valido) this.metrics.totalFalhas++;
        return valido;
    }

    get estado() {
        return Object.freeze({
            algoritmo:        this.algorithm,
            proximaRotacaoEm: this.rotacaoMs - (Date.now() - this.state.geradoEm),
            usosAtuais:       this.state.usos,
            maxUsos:          this.maxUsos,
            uptime:           Date.now() - this.metrics.boot,
        });
    }

    get metricas(): Readonly<VaultMetrics> {
        return Object.freeze({ ...this.metrics });
    }

    get algo(): HashAlgorithm { return this.algorithm; }

    forcarRotacao(): void { this.rotacionar(); }

    destruir(): void {
        if (this.destruido) return;
        this.destruido = true;

        if (this.interval) { clearInterval(this.interval); this.interval = null; }

        // sobrescreve com lixo antes de zerar
        this.state = Object.freeze({
            atual:    crypto.randomBytes(128).toString('hex'),
            reserva1: crypto.randomBytes(128).toString('hex'),
            reserva2: crypto.randomBytes(128).toString('hex'),
            proximo:  crypto.randomBytes(128).toString('hex'),
            geradoEm: 0, usos: 0,
        });

        this.state = Object.freeze({
            atual: '', reserva1: '', reserva2: '',
            proximo: '', geradoEm: 0, usos: 0,
        });

        this.removeAllListeners();
        TokenVault.instancia = null;
    }
}

// ── Singleton exportado ───────────────────────────────
export const vault = TokenVault.getInstance();
export type { HashAlgorithm };