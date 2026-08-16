import { gerarToken, validarToken } from './utils/jwt';
import { vault } from './core/vault';
import { fingerprintMiddleware, getFingerprintFromRequest } from './modules/fingerprint';
import { memoryStore } from './store/MemoryStore';

// ══════════════════════════════════════════════════════
// 🧪 HELPERS
// ══════════════════════════════════════════════════════

function mockReq(overrides: Record<string, any> = {}) {
    return {
        method:      'GET',
        originalUrl: '/test',
        headers: {
            'user-agent':      'Mozilla/5.0 TestAgent',
            'accept-language': 'pt-BR',
            'accept-encoding': 'gzip',
            'authorization':   '',
        },
        socket: { remoteAddress: '127.0.0.1' },
        body:   {},
        query:  {},
        params: {},
        ...overrides,
    } as any;
}

function mockRes() {
    const res: any = {};
    res.status = (code: number) => { res._status = code; return res; };
    res.json   = (body: any)    => { res._body   = body; return res; };
    return res;
}

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.log(`  ❌ ${label}`);
        failed++;
    }
}

async function main() {

// ══════════════════════════════════════════════════════
// 🔱 JWT
// ══════════════════════════════════════════════════════
console.log('\n🔱 ── JWT ───────────────────────────────────────────');

const token = gerarToken('user-123', 'hash-abc', { expiresIn: 5000 });
const r1 = validarToken(token);
assert('Token válido é aceito', r1.valid === true);

assert('Payload tem sub correto',  r1.valid && r1.payload.sub  === 'user-123');
assert('Payload tem hash correto', r1.valid && r1.payload.hash === 'hash-abc');
assert('Payload tem iat',          r1.valid && typeof r1.payload.iat === 'number');
assert('Payload tem exp',          r1.valid && typeof r1.payload.exp === 'number');

const tokenAdulterado = token.slice(0, -5) + 'XXXXX';
const r2 = validarToken(tokenAdulterado);
assert('Token adulterado é rejeitado', r2.valid === false);
assert('Motivo correto — adulterado',  !r2.valid && r2.motivo.includes('Assinatura inválida'));

const r3 = validarToken('apenas.duas');
assert('Token malformado rejeitado',  r3.valid === false);
assert('Motivo correto — malformado', !r3.valid && r3.motivo.includes('malformado'));

const tokenExpirado = gerarToken('user-exp', 'hash-exp', { expiresIn: -1000 });
const r4 = validarToken(tokenExpirado);
assert('Token expirado é rejeitado',  r4.valid === false);
assert('Motivo correto — expirado',   !r4.valid && r4.motivo.includes('expirado'));

const r5 = validarToken('');
assert('Token vazio rejeitado', r5.valid === false);

const partes = token.split('.');
const payloadCorrompido = Buffer.from('{invalido json!!!').toString('base64url');
const tokenCorrompido = `${partes[0]}.${payloadCorrompido}.${partes[2]}`;
const r6 = validarToken(tokenCorrompido);
assert('Payload corrompido rejeitado', r6.valid === false);

const fp = 'fingerprint-sha512-valido-abc123';
const tokenFp = gerarToken('user-fp', 'hash-fp', { expiresIn: 5000, fingerprint: fp });
const r7 = validarToken(tokenFp, fp);
assert('Token com fingerprint correto aceito', r7.valid === true);

const r8 = validarToken(tokenFp, 'fingerprint-errado');
assert('Token com fingerprint errado rejeitado', r8.valid === false);
assert('Motivo correto — fingerprint',           !r8.valid && r8.motivo.includes('Fingerprint'));

const tokenSemFp = gerarToken('user-nofp', 'hash-nofp', { expiresIn: 5000 });
const r9 = validarToken(tokenSemFp, 'qualquer-fp');
assert('Token sem fp ignora verificação de fp', r9.valid === true);

const tokenClaims = gerarToken('user-claims', 'hash-claims', {
    expiresIn: 5000,
    claims: { role: 'admin', plano: 'pro' },
});
const r10 = validarToken(tokenClaims);
assert('Claims extras preservados — role',  r10.valid && r10.payload.role  === 'admin');
assert('Claims extras preservados — plano', r10.valid && r10.payload.plano === 'pro');

// ══════════════════════════════════════════════════════
// 🔱 VAULT
// ══════════════════════════════════════════════════════
console.log('\n🔱 ── VAULT ─────────────────────────────────────────');

const assinatura = vault.assinar('dados-sensiveis');
assert('Assinatura gerada', typeof assinatura === 'string' && assinatura.length > 0);

const v1 = await vault.validar('dados-sensiveis', assinatura);
assert('Assinatura válida aceita', v1 === true);

const v2 = await vault.validar('dados-alterados', assinatura);
assert('Dados alterados rejeitados', v2 === false);

const v3 = await vault.validar('dados-sensiveis', 'assinatura-fake');
assert('Assinatura fake rejeitada', v3 === false);

const v4 = await vault.validar('', assinatura);
assert('Dados vazios rejeitados', v4 === false);

const m = vault.metricas;
assert('Métricas — assinaturas > 0', m.totalAssinaturas >= 1);
assert('Métricas — validações > 0',  m.totalValidacoes  >= 1);
assert('Métricas — falhas contadas', m.totalFalhas      >= 1);

const e = vault.estado;
assert('Estado — algoritmo definido',  e.algoritmo === 'sha512' || e.algoritmo === 'sha256');
assert('Estado — usos >= 1',           e.usosAtuais >= 1);
assert('Estado — uptime > 0',          e.uptime > 0);
assert('Estado — proximaRotacao > 0',  e.proximaRotacaoEm > 0);

vault.forcarRotacao();
const assinaturaApos = vault.assinar('pos-rotacao');
const v5 = await vault.validar('pos-rotacao', assinaturaApos);
assert('Assina e valida após rotação', v5 === true);

const v6 = await vault.validar('dados-sensiveis', assinatura);
assert('Assinatura antiga válida na reserva', v6 === true);

// ══════════════════════════════════════════════════════
// 🔱 FINGERPRINT
// ══════════════════════════════════════════════════════
console.log('\n🔱 ── FINGERPRINT ────────────────────────────────────');

memoryStore.reset('127.0.0.1');
memoryStore.reset('192.168.0.1');

const mw = fingerprintMiddleware({ metodos: ['GET', 'POST'] });

const req1 = mockReq();
const res1 = mockRes();
let next1Called = false;
mw(req1, res1, () => { next1Called = true; });
assert('IP novo — passa',            next1Called);
assert('Fingerprint anexado no req', !!getFingerprintFromRequest(req1));

const req2 = mockReq();
const res2 = mockRes();
let next2Called = false;
mw(req2, res2, () => { next2Called = true; });
assert('Mesmo contexto — passa', next2Called);

const req3 = mockReq({ headers: {
    'user-agent':      'curl/ATACANTE',
    'accept-language': 'en-US',
    'accept-encoding': 'gzip',
}});
const res3 = mockRes();
let next3Called = false;
mw(req3, res3, () => { next3Called = true; });
assert('UA diferente — bloqueado',       !next3Called);
assert('Status 403 — contexto alterado', res3._status === 403);

const req4 = mockReq({ method: 'DELETE' });
const res4 = mockRes();
let next4Called = false;
mw(req4, res4, () => { next4Called = true; });
assert('Método DELETE — bloqueado',    !next4Called);
assert('Status 405 — método inválido', res4._status === 405);

const mwPost = fingerprintMiddleware({ metodos: ['POST'] });
const req5 = mockReq({ method: 'POST', socket: { remoteAddress: '192.168.0.1' } });
const res5 = mockRes();
let next5Called = false;
mwPost(req5, res5, () => { next5Called = true; });
assert('POST explícito — passa', next5Called);

const mwSemTroca = fingerprintMiddleware({ bloquearTroca: false });
const req6 = mockReq({
    socket: { remoteAddress: '10.0.0.1' },
    headers: { 'user-agent': 'AgentA', 'accept-language': 'pt-BR', 'accept-encoding': 'gzip' },
});
mwSemTroca(req6, mockRes(), () => {});

const req7 = mockReq({
    socket: { remoteAddress: '10.0.0.1' },
    headers: { 'user-agent': 'AgentB-DIFERENTE', 'accept-language': 'en-US', 'accept-encoding': 'gzip' },
});
const res7 = mockRes();
let next7Called = false;
mwSemTroca(req7, res7, () => { next7Called = true; });
assert('bloquearTroca=false — UA diferente passa', next7Called);

// ══════════════════════════════════════════════════════
// 🔱 MEMORY STORE
// ══════════════════════════════════════════════════════
console.log('\n🔱 ── MEMORY STORE ───────────────────────────────────');

const testIp = '99.99.99.99';
memoryStore.reset(testIp);

const rec1 = memoryStore.get(testIp);
assert('Record inicial — requests 0', rec1.requests    === 0);
assert('Record inicial — strikes 0',  rec1.strikes     === 0);
assert('Record inicial — score 0',    rec1.score       === 0);
assert('Record inicial — não banido', rec1.bannedUntil === null);

memoryStore.increment(testIp);
memoryStore.increment(testIp);
assert('Increment — requests = 2', memoryStore.get(testIp).requests === 2);

memoryStore.addStrike(testIp);
memoryStore.addStrike(testIp);
assert('Strike — strikes = 2', memoryStore.get(testIp).strikes === 2);

memoryStore.updateScore(testIp, 75);
assert('Score atualizado = 75', memoryStore.get(testIp).score === 75);

memoryStore.ban(testIp, 60 * 1000);
assert('Banido após ban()', memoryStore.isBanned(testIp));

memoryStore.reset(testIp);
assert('Não banido após reset()',  !memoryStore.isBanned(testIp));
assert('Record zerado após reset', memoryStore.get(testIp).requests === 0 && memoryStore.get(testIp).strikes === 0);

memoryStore.ban(testIp, -1000);
assert('Ban expirado — não banido', !memoryStore.isBanned(testIp));

// ══════════════════════════════════════════════════════
// 🏁 RESULTADO FINAL
// ══════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(55)}`);
console.log(`🏁 RESULTADO: ${passed} passaram | ${failed} falharam | ${passed + failed} total`);
if (failed === 0) {
    console.log('✨ Mefistófeles aprova — todos os testes passaram!');
} else {
    console.log('⚠️  Alguns guardiões falharam — revise os logs acima.');
    process.exit(1);
}

} // fecha main

main();