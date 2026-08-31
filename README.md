# 🏛️ Elisium

> Middleware de segurança para APIs Express — criado no Brasil, feito pra aguentar porrada.

---

## Por que o Elisium existe?

Quando você sobe uma API Node.js com Express, ela fica nua na internet.

Qualquer pessoa pode tentar:
- Derrubar seu servidor mandando milhares de requisições por segundo
- Roubar dados do seu banco com SQL Injection
- Injetar scripts maliciosos com XSS
- Tentar descobrir senhas por força bruta
- Roubar sessões de usuários logados
- Travar sua conexão com ataques lentos (Slowloris)

Normalmente você precisaria instalar e configurar vários pacotes separados pra defender cada um desses pontos — `helmet`, `express-rate-limit`, `express-validator`, e por aí vai.

O Elisium nasceu pra resolver isso em **uma linha**. Um middleware, sete guardiões, proteção completa.

O nome vem do **Elísio** da mitologia grega — o paraíso dos heróis. A ideia é que sua API viva lá dentro, protegida, enquanto os guardiões barram tudo que vem de fora.

---

## O que ele faz?

O Elisium coloca **sete guardiões** na frente da sua API. Cada um cuida de uma ameaça diferente:

| Guardião | O que ele faz |
|---|---|
| ⚔️ **Cérbero** | O porteiro. Mantém listas de IPs permitidos, bloqueados, e bane temporariamente quem se comporta mal |
| 🌊 **Caronte** | O controlador de fluxo. Limita quantas requisições um IP pode fazer por minuto |
| 🛡️ **Némesis** | O detector de ataques. Analisa cada requisição procurando SQL Injection, XSS, injeção de comandos e manipulação de headers |
| 🐍 **Hidra** | O anti-DDoS. Detecta ataques lentos (Slowloris) e tentativas de Request Smuggling |
| 🌍 **Atlas** | O fiscal de protocolo. Pode obrigar o uso de HTTPS e penalizar conexões HTTP |
| 🧠 **Inteligência** | O analista comportamental. Dá uma pontuação pra cada IP baseado no comportamento — IPs suspeitos são banidos automaticamente |
| 🌙 **Morfeu** | O alertador. Te avisa quando alguém é banido, via callback, Telegram, Discord ou o que você quiser |

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

> ⚠️ **Importante:** sempre coloque o `elisiumGuard` **antes** das suas rotas. E sempre use `http.createServer(app)` junto com `aplicarTimeoutConexao` — sem isso a proteção contra Slowloris não funciona.

---

## Proteção por rota

Precisa de proteção extra em rotas sensíveis como login ou pagamento? Use o middleware de rota:

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

// Gera um token vinculado ao fingerprint do cliente
const token = gerarToken('user-123', requestHash, {
  expiresIn:   60 * 60 * 1000,        // expira em 1 hora
  fingerprint: req.elisiumFingerprint, // vincula ao cliente
  claims: { role: 'admin' },           // dados extras
});

// Valida o token — rejeita se fingerprint mudou
const result = validarToken(token, fingerprint);
if (result.valid) {
  console.log(result.payload.sub); // 'user-123'
}
```

Se alguém roubar o token e tentar usar em outro dispositivo, o fingerprint não bate e o acesso é negado.

---

## Vault de tokens

O Elisium tem um cofre interno de chaves HMAC que rotaciona automaticamente. Você não precisa configurar nada — ele já funciona no boot:

```typescript
import { vault } from 'elisium/core/vault';

// Assina um dado
const assinatura = vault.assinar('dado-sensivel');

// Valida — funciona mesmo após rotação de chave
const valido = await vault.validar('dado-sensivel', assinatura);

// Ver estado atual do cofre
console.log(vault.estado);
console.log(vault.metricas);
```

Como funciona por dentro:
- A chave é gerada no boot via **HKDF + PBKDF2** — nunca é hardcoded
- Mantém **3 camadas** de chave: atual, reserva 1 e reserva 2
- Rotaciona automaticamente a cada 30 minutos ou 10.000 usos
- Comparações sempre em **tempo constante** (anti timing attack)
- Detecta modo `--inspect` e opera em modo restrito
- Na shutdown, sobrescreve as chaves com lixo antes de zerar

---

## Sistema de pontuação (Inteligência)

O guardião Inteligência analisa o comportamento de cada IP e dá uma nota de 0 a 100. Se passar do limite que você configurou, o IP é banido automaticamente:

| Sinal detectado | Pontuação |
|---|---|
| Sem User-Agent | +20 |
| User-Agent de bot conhecido | +15 |
| Sem Accept-Language | +15 |
| Payload maior que 1MB | +25 |
| Payload maior que 100KB | +10 |
| Requisições com menos de 100ms entre si | +25 |
| Requisições com menos de 500ms entre si | +10 |
| Horário suspeito (0h–5h) com alto volume | +20 |
| Conexão HTTP em vez de HTTPS | +5 |

> IPs locais (`127.0.0.1`, `::1`) nunca recebem pontuação — você não vai se banir em desenvolvimento.

---

## Logs

O Elisium gera logs em `logs/elisium/YYYY-MM-DD.json` e também no console:

```
✨ [2026-08-31 01:10:00] [MEFISTÓFELES] {hash} 192.168.0.1 — guiado ao Elísio
🚫 [2026-08-31 01:10:01] [NÉMESIS] {hash} 192.168.0.2 — XSS detectado em body/query
⚔️  [2026-08-31 01:10:02] [CARONTE] {hash} 192.168.0.3 — banido por rate limit
⚠️  [2026-08-31 01:10:03] [INTELIGÊNCIA] {hash} 192.168.0.4 — score 65/100
```

Cada entrada tem: hash da requisição, IP, guardião responsável, motivo e timestamp.

---

## Configuração completa

```typescript
elisiumGuard({
  cerberus: {
    whitelist:  ['10.0.0.1'],   // IPs que nunca são bloqueados
    blacklist:  ['1.2.3.4'],    // IPs sempre bloqueados
    banTime:    60 * 60 * 1000, // tempo de ban em ms (padrão: 1 hora)
    maxStrikes: 3,              // strikes antes do ban (padrão: 3)
  },

  caronte: {
    windowMs: 60_000,  // janela de tempo em ms (padrão: 1 minuto)
    max:      100,     // máximo de requisições na janela (padrão: 100)
  },

  nemesis: {
    xss:              true, // detecta XSS
    sqlInjection:     true, // detecta SQL Injection
    commandInjection: true, // detecta injeção de comandos shell
    headerInjection:  true, // detecta CRLF injection nos headers
  },

  hidra: {
    slowloris:         true, // detecta ataques lentos
    requestSmuggling:  true, // detecta request smuggling
    connectionTimeout: 5000, // timeout de conexão em ms
    maxHeaderSize:     8192, // tamanho máximo dos headers em bytes
  },

  atlas: {
    httpsOnly:    false, // rejeita HTTP (cuidado em dev)
    penalizeHttp: true,  // adiciona pontuação pra conexões HTTP
  },

  inteligencia: {
    enabled:           true, // ativa o sistema de score
    banScoreThreshold: 80,   // score mínimo pra ban automático (0-100)
  },

  morfeu: {
    // chamado sempre que um IP é banido
    onBan: (ip, motivo, hash) => {
      console.log(`IP banido: ${ip} — ${motivo}`);
      // aqui você pode mandar pro Telegram, Discord, webhook, etc.
    },
  },
})
```

---

## Bugs conhecidos e limitações

Sendo honesto sobre o estado atual da lib:

- **Armazenamento em memória** — os IPs banidos e os contadores vivem na memória do processo. Se o servidor reiniciar, tudo é zerado. Não funciona em múltiplas instâncias (cluster, kubernetes). Suporte a Redis está planejado.

- **Fingerprint pode ser agressivo** — em redes corporativas onde vários usuários compartilham o mesmo IP e proxy, o fingerprint pode bloquear usuários legítimos. Use `bloquearTroca: false` nesses casos.

- **Score heurístico pode dar falso positivo** — ferramentas legítimas como Postman, Insomnia e alguns SDKs não enviam `User-Agent` ou `Accept-Language` padrão. Configure `banScoreThreshold` alto (90+) ou desative a Inteligência em rotas de API interna.

- **Sem suporte a IPv6 completo** — a detecção de IP funciona mas alguns cenários com proxies e IPv6 podem retornar o IP errado.

- **Logs em arquivo síncrono** — o `appendFileSync` pode ser um gargalo em altíssima carga. Em produção com muito volume, considere desativar os logs em arquivo.

- **Em desenvolvimento ativo** — esta é a versão `0.1.0`. A API pode mudar entre versões menores. Pin na versão que você usar.

---

## Segurança por design

- Chaves nunca são hardcoded — geradas no boot via HKDF + PBKDF2
- Comparações sempre em tempo constante — sem timing attacks
- Tokens JWT vinculados ao fingerprint do cliente
- Protótipos das classes core congelados — anti-tamper
- Detecção de modo debug (`--inspect`)
- Destruição segura — chaves sobrescritas com lixo antes de zerar no shutdown

---

## Licença

MIT — feito no Brasil 🇧🇷 