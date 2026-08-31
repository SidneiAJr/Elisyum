# 🏛️ Elisium

> WAF middleware for Express — rate limit, SQLi, XSS, brute force, fingerprint & JWT protection in one line.

---

## Instalação

```bash
npm install elisium
```

Requisito: Node.js 18+ e Express 4+.

---

## Uso básico

Três linhas e sua API já tá protegida:

```typescript
import express from 'express';
import { elisiumGuard, aplicarTimeoutConexao } from 'elisium';

const app = express();
app.use(express.json());

// Coloca o Elisium logo no início, antes de qualquer rota
app.use(elisiumGuard({
  cerberus:     { maxStrikes: 3, banTime: 60_000 },
  caronte:      { windowMs: 60_000, max: 100 },
  nemesis:      { xss: true, sqlInjection: true, commandInjection: true },
  hidra:        { slowloris: true, requestSmuggling: true },
  atlas:        { httpsOnly: false },
  inteligencia: { enabled: true, banScoreThreshold: 80 },
}));

app.get('/', (req, res) => {
  res.json({ message: 'Você chegou ao Elísio!' });
});

const server = app.listen(3000);

// Proteção contra Slowloris — precisa do server, não do app
aplicarTimeoutConexao(server, 5000);
```

---

## Architecture

Elisyum is structured as a layered defense system — each guardian handles a specific threat:

| Guardian | Role |
|---|---|
| ⚔️ **Cérbero** | Whitelist / Blacklist / Temporary ban |
| 🌊 **Caronte** | Rate limiting per IP |
| 🛡️ **Némesis** | WAF — XSS, SQLi, Command injection, Header injection |
| 🐍 **Hidra** | Slowloris & Request Smuggling detection |
| 🌍 **Atlas** | HTTP/HTTPS enforcement |
| 🧠 **Inteligência** | Heuristic scoring — bans suspicious behavior automatically |
| 🌙 **Morfeu** | Callbacks & alerts on ban events |

---

## Route-level Protection

Add fingerprint + method validation to specific routes:

```typescript
import { elisium, authMiddleware } from 'elisium';

// Só aceita POST nessa rota, vincula fingerprint e valida JWT
app.post('/pagamento',
  elisium({ metodos: ['POST'], ttl: 15 * 60 * 1000 }),
  authMiddleware(),
  (req, res) => {
    const user = (req as any).elisiumUser;
    res.json({ ok: true, user });
  }
);
```

O **fingerprint** é uma impressão digital do cliente — IP, navegador, idioma, encoding. Se essa impressão mudar no meio da sessão, o Elisium bloqueia. Isso impede roubo de token JWT.

---

## JWT próprio

O Elisium tem seu próprio sistema de JWT, mais seguro que os padrões comuns porque vincula o token ao fingerprint do cliente:

```typescript
import { gerarToken, validarToken } from 'elisium/utils/jwt';

// Generate
const token = gerarToken('user-123', requestHash, {
  expiresIn:   60 * 60 * 1000,        // expira em 1 hora
  fingerprint: req.elisiumFingerprint, // vincula ao cliente
  claims: { role: 'admin' },           // dados extras
});

// Validate
const result = validarToken(token, fingerprint);
if (result.valid) {
  console.log(result.payload.sub); // 'user-123'
}
```

Se alguém roubar o token e tentar usar em outro dispositivo, o fingerprint não bate e o acesso é negado.

---

## Token Vault

Internal rotating HMAC key store — zero configuration, zero exposure:

```typescript
import { vault } from 'elisyum/core/vault';

const signature = vault.assinar('sensitive-data');
const valid     = await vault.validar('sensitive-data', signature);

console.log(vault.estado);
console.log(vault.metricas);
```

**Features:**
- HKDF + PBKDF2 key derivation on boot
- 3-layer key rotation (current + 2 reserves)
- Timing-safe comparison with random delay
- Auto-rotation by time (30min) or usage (10k signatures)
- Anti-debug detection
- Secure destruction on shutdown

---

## Configuration

### `elisiumGuard(options)`

```typescript
elisiumGuard({
  cerberus: {
    whitelist:  string[];
    blacklist:  string[];
    banTime:    number;
    maxStrikes: number;
  },

  caronte: {
    windowMs: 60_000,  // janela de tempo em ms (padrão: 1 minuto)
    max:      100,     // máximo de requisições na janela (padrão: 100)
  },

  nemesis: {
    xss:              boolean;
    sqlInjection:     boolean;
    commandInjection: boolean;
    headerInjection:  boolean;
  },

  hidra: {
    slowloris:         boolean;
    requestSmuggling:  boolean;
    connectionTimeout: number;
    maxHeaderSize:     number;
  },

  atlas: {
    httpsOnly:    boolean;
    penalizeHttp: boolean;
  },

  inteligencia: {
    enabled:           boolean;
    banScoreThreshold: number;
  },

  morfeu: {
    onBan?: (ip: string, motivo: string, hash: string) => void;
  }
}
```

### `elisium(options)` — route middleware

```typescript
{
  metodos?:       ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')[];
  ttl?:           number;
  maxUsos?:       number;
  bloquearTroca?: boolean;
}
```

---

## Scoring

| Signal | Score |
|---|---|
| Missing User-Agent | +20 |
| Bot User-Agent | +15 |
| Missing Accept-Language | +15 |
| Payload > 1MB | +25 |
| Payload > 100KB | +10 |
| Requests < 100ms apart | +25 |
| Requests < 500ms apart | +10 |
| Suspicious hours + high volume | +20 |
| HTTP instead of HTTPS | +5 |

Score >= threshold → automatic ban.

---

## Logging

```
✨ [2026-08-16 17:45:28] [MEFISTÓFELES] {hash} 127.0.0.1 — guided to Elísio
🚫 [2026-08-16 17:45:28] [NÉMESIS] {hash} 192.168.0.1 — XSS detected
⚔️  [2026-08-16 17:45:28] [CARONTE] {hash} 10.0.0.1 — banned
```

---

## Security Design

- Zero configuration secrets — keys derived on boot via HKDF + PBKDF2
- Timing-safe comparisons everywhere
- Fingerprint binding — JWTs tied to client context
- Prototype freezing — anti-tamper on core classes
- Anti-debug mode — detects --inspect
- Secure destruction — keys overwritten before zeroing on shutdown

---

## License

MIT