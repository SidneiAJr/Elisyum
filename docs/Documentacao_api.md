> [!WARNING]
> ## ⚠️ ATENÇÃO — VERSÃO EM FASE DE TESTES (`0.0.1a`)
>
> O **Elisium** ainda **não está pronto para produção**.
>
> Esta versão passou por testes iniciais de unidade, integração e carga, mas ainda precisa de validação mais aprofundada antes de ser considerada segura para ambientes reais.
>
> **O que ainda precisa ser testado e resolvido:**
>
> - 🔴 Sem suporte a múltiplas instâncias — estado em memória não sincroniza entre processos
> - 🔴 Sem persistência de banimentos — reiniciou, zerou
> - 🔴 Suporte a IPv6 incompleto em cenários com proxy
> - 🟡 Fingerprint pode bloquear usuários legítimos em redes com proxy compartilhado
> - 🟡 Sistema de scoring heurístico — falsos positivos possíveis
> - 🟡 Logs síncronos — pode ser gargalo sob carga alta
> - 🟡 Testes de ban por strikes consecutivos não automatizados
> - 🟡 Vault não testado sob alta carga de assinaturas
> - 🟡 API pode mudar sem aviso entre versões — sempre pin na versão que usar
>
> **Use apenas para estudo, testes e desenvolvimento local.**
> Aguarde uma versão estável antes de considerar qualquer uso em produção.

---

# 📡 Elisium | API Reference

> Versão `0.0.1a` — em desenvolvimento ativo. A API pode mudar entre versões.

---

## Imports disponíveis

```typescript
import { elisiumGuard }          from 'elisium';              // Proteção global
import { elisium }               from 'elisium';              // Proteção por rota
import { authMiddleware }        from 'elisium';              // Validação de JWT por rota
import { aplicarTimeoutConexao } from 'elisium';              // Proteção Slowloris
import { memoryStore }           from 'elisium';              // Store de IPs em memória
import { mefistofeles }          from 'elisium';              // Logger interno
import { gerarToken }            from 'elisium/utils/jwt';    // Gerar JWT
import { validarToken }          from 'elisium/utils/jwt';    // Validar JWT
import { vault }                 from 'elisium/core/vault';   // Vault de chaves
```

---

## `elisiumGuard(config)`

Middleware principal. Aplica todos os guardiões em sequência antes de qualquer rota.

**Onde usar:** logo após `app.use(express.json())`, antes de qualquer rota.

```typescript
app.use(elisiumGuard({ ...config }));
```

### Configuração completa

```typescript
elisiumGuard({
  cerberus: {
    whitelist:      string[],   // IPs que nunca são bloqueados
    blacklist:      string[],   // IPs sempre bloqueados (403)
    banTime:        number,     // duração do ban em ms         — padrão: 3_600_000 (1h)
    maxStrikes:     number,     // strikes antes do ban         — padrão: 3
    trustedProxies: string[],   // IPs de proxy/nginx confiável
  },

  caronte: {
    windowMs: number,  // janela de tempo em ms   — padrão: 60_000 (1 min)
    max:      number,  // requisições por janela  — padrão: 100
  },

  nemesis: {
    xss:              boolean,  // detecta Cross-Site Scripting
    sqlInjection:     boolean,  // detecta SQL Injection
    commandInjection: boolean,  // detecta injeção de comandos
    headerInjection:  boolean,  // detecta manipulação de headers
  },

  hidra: {
    slowloris:         boolean,  // detecta conexões lentas maliciosas
    requestSmuggling:  boolean,  // detecta headers conflitantes (TE/CL)
    connectionTimeout: number,   // timeout em ms  — padrão: 5000
    maxHeaderSize:     number,   // tamanho máximo de header em bytes — padrão: 8192
  },

  atlas: {
    httpsOnly:    boolean,  // bloqueia HTTP (403) quando true
    penalizeHttp: boolean,  // adiciona score negativo em conexões HTTP
  },

  inteligencia: {
    enabled:           boolean,  // ativa/desativa o guardião
    banScoreThreshold: number,   // score para ban automático — padrão: 80
  },

  morfeu: {
    onBan: (ip: string, motivo: string, hash: string) => void,
    // callback disparado quando um IP é banido
    // use para Telegram, Discord, webhook, etc.
  },
})
```

### Sinais de pontuação da Inteligência

| Sinal detectado | Pontuação |
|---|---|
| Sem `User-Agent` | +20 |
| `User-Agent` de bot conhecido | +15 |
| Sem `Accept-Language` | +15 |
| Payload > 1MB | +25 |
| Payload > 100KB | +10 |
| Intervalo entre requisições < 100ms | +25 |
| Intervalo entre requisições < 500ms | +10 |
| Horário suspeito (0h–5h) com alto volume | +20 |
| Conexão HTTP em vez de HTTPS | +5 |

> IPs locais (`127.0.0.1`, `::1`) nunca recebem pontuação.

---

## `elisium(config)`

Middleware de rota. Aplica proteção individual em endpoints específicos.

```typescript
app.post('/pagamento',
  elisium({ metodos: ['POST'], ttl: 15 * 60 * 1000 }),
  authMiddleware(),
  handler
);
```

### Parâmetros

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `metodos` | `string[]` | Métodos HTTP aceitos. Outros retornam 405. |
| `ttl` | `number` | Tempo de vida do fingerprint em ms. |
| `bloquearTroca` | `boolean` | Bloqueia se o fingerprint mudar na sessão. Padrão: `true`. Use `false` em redes com proxy compartilhado. |

---

## `authMiddleware()`

Valida o JWT do Elisium e injeta os dados do usuário na requisição.

```typescript
app.get('/perfil', authMiddleware(), (req, res) => {
  const user = (req as any).elisiumUser;
  res.json({ user });
});
```

Retorna `401` se o token estiver ausente, inválido, expirado ou com fingerprint errado.

---

## `aplicarTimeoutConexao(server, ms)`

Aplica timeout nas conexões TCP abertas. Necessário para a proteção contra Slowloris funcionar.

```typescript
const server = http.createServer(app);
aplicarTimeoutConexao(server, 5000); // 5 segundos
```

> ⚠️ Usa o `server` (de `http.createServer`), não o `app`. Sem isso a proteção Slowloris não funciona.

---

## `gerarToken(sub, hash, opcoes)`

Gera um JWT vinculado ao fingerprint do cliente.

```typescript
const token = gerarToken('user-123', requestHash, {
  expiresIn:   60 * 60 * 1000,       // expiração em ms
  fingerprint: req.elisiumFingerprint, // vincula ao cliente
  claims:      { role: 'admin' },     // dados extras no payload
});
```

### Parâmetros

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `sub` | `string` | Identificador do usuário (subject do JWT). |
| `hash` | `string` | Hash da requisição de origem. |
| `opcoes.expiresIn` | `number` | Expiração em ms. |
| `opcoes.fingerprint` | `string` | Impressão digital do cliente. |
| `opcoes.claims` | `object` | Dados adicionais no payload. |

---

## `validarToken(token, fingerprint)`

Valida um JWT e retorna o payload se válido.

```typescript
const resultado = validarToken(token, fingerprint);

if (resultado.valid) {
  console.log(resultado.payload.sub);    // ID do usuário
  console.log(resultado.payload.claims); // dados extras
} else {
  console.log(resultado.motivo); // motivo da rejeição
}
```

### Retorno

```typescript
// Válido
{ valid: true, payload: { sub, hash, claims, iat, exp } }

// Inválido
{ valid: false, motivo: string }
```

---

## Dados injetados na requisição

O Elisium injeta dados acessíveis nos handlers:

```typescript
(req as any).elisiumFingerprint  // string — impressão digital do cliente
(req as any).elisiumUser         // object — payload do JWT (após authMiddleware)
```

---

## Códigos de resposta

| Código | Guardião | Situação |
|---|---|---|
| `400` | Némesis / Hidra | Ataque detectado (SQLi, XSS, smuggling, etc.) |
| `401` | authMiddleware | Token ausente, inválido ou expirado |
| `403` | Cérbero / Atlas / Inteligência | IP banido, bloqueado, ou HTTPS obrigatório |
| `405` | elisium (rota) | Método HTTP não permitido |
| `429` | Caronte | Rate limit atingido |

---

## Logs gerados

Todos os eventos são registrados em `logs/elisium/YYYY-MM-DD.json` e no console:

```
📜 [MEFISTÓFELES]  {hash} 192.168.0.1 — este viajante bate à porta do Elísio
✨ [MEFISTÓFELES]  {hash} 192.168.0.1 — guiado ao Elísio
🚫 [NÉMESIS]       {hash} 192.168.0.2 — XSS detectado em body/query
⚔️  [CARONTE]       {hash} 192.168.0.3 — banido por rate limit
⚠️  [INTELIGÊNCIA]  {hash} 192.168.0.4 — score 65/100
```

---

## Exemplo completo

```typescript
import express from 'express';
import http from 'http';
import {
  elisiumGuard,
  elisium,
  authMiddleware,
  aplicarTimeoutConexao,
} from 'elisium';
import { gerarToken, validarToken } from 'elisium/utils/jwt';

const app = express();
const server = http.createServer(app);

app.use(express.json());

app.use(elisiumGuard({
  cerberus:     { maxStrikes: 3, banTime: 60 * 60 * 1000 },
  caronte:      { windowMs: 60_000, max: 100 },
  nemesis:      { xss: true, sqlInjection: true, commandInjection: true, headerInjection: true },
  hidra:        { slowloris: true, requestSmuggling: true },
  atlas:        { httpsOnly: false },
  inteligencia: { enabled: true, banScoreThreshold: 80 },
  morfeu: {
    onBan: (ip, motivo, hash) => {
      console.log(`🔥 IP banido: ${ip} | motivo: ${motivo}`);
    },
  },
}));

app.post('/login', (req, res) => {
  const fingerprint = (req as any).elisiumFingerprint;
  const token = gerarToken('user-123', 'hash-da-req', {
    expiresIn: 60 * 60 * 1000,
    fingerprint,
    claims: { role: 'admin' },
  });
  res.json({ token });
});

app.get('/perfil',
  elisium({ metodos: ['GET'] }),
  authMiddleware(),
  (req, res) => {
    const user = (req as any).elisiumUser;
    res.json({ user });
  }
);

server.listen(3000, () => console.log('🚀 Porta 3000'));
aplicarTimeoutConexao(server, 5000);
```

---

*Made with ❤️ by Albertão 🇧🇷*