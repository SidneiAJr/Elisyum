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


# 🏛️ Elisium | Versão Alpha(0.0.1a)

> Middleware de segurança para APIs Express — criado no Brasil, feito pra aguentar porrada


---

## De onde surgiu a ideia?

Queria proteger minhas APIs além do básico — `helmet` e `rate-limit` resolvem parte do problema, mas não chegam nem perto do suficiente quando o negócio começa a tomar pancada de verdade.

O Elisium nasceu disso: um middleware único que reúne sete camadas de proteção sem precisar instalar e configurar pacotes separados pra cada ameaça.

> ⚠️ O Elisium atua na **camada L7 (aplicação)**. Ele não substitui proteções de rede ou firewall — ele soma a elas. Quanto mais camadas, melhor.

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

> ⚠️ **Importante:** sempre coloque o `elisiumGuard` **antes** das suas rotas. E sempre use `aplicarTimeoutConexao` junto com o server — sem isso a proteção contra Slowloris não funciona.

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

const token = gerarToken('user-123', requestHash, {
  expiresIn:   60 * 60 * 1000,
  fingerprint: req.elisiumFingerprint,
  claims: { role: 'admin' },
});

const result = validarToken(token, fingerprint);
if (result.valid) {
  console.log(result.payload.sub); // 'user-123'
}
```

Se alguém roubar o token e tentar usar em outro dispositivo, o fingerprint não bate e o acesso é negado.

---

## Sistema de pontuação (Inteligência)

O guardião Inteligência analisa o comportamento de cada IP e dá uma nota de 0 a 100. Se passar do limite configurado, o IP é banido automaticamente:

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

## Configuração completa

```typescript
elisiumGuard({
  cerberus: {
    whitelist:      ['10.0.0.1'],   // IPs que nunca são bloqueados
    blacklist:      ['1.2.3.4'],    // IPs sempre bloqueados
    banTime:        60 * 60 * 1000, // tempo de ban em ms (padrão: 1 hora)
    maxStrikes:     3,              // strikes antes do ban (padrão: 3)
    trustedProxies: ['10.0.0.2'],  // IPs de proxy confiável (nginx, load balancer)
  },

  caronte: {
    windowMs: 60_000,  // janela de tempo em ms (padrão: 1 minuto)
    max:      100,     // máximo de requisições na janela (padrão: 100)
  },

  nemesis: {
    xss:              true,
    sqlInjection:     true,
    commandInjection: true,
    headerInjection:  true,
  },

  hidra: {
    slowloris:         true,
    requestSmuggling:  true,
    connectionTimeout: 5000,
    maxHeaderSize:     8192,
  },

  atlas: {
    httpsOnly:    false,
    penalizeHttp: true,
  },

  inteligencia: {
    enabled:           true,
    banScoreThreshold: 80,
  },

  morfeu: {
    onBan: (ip, motivo, hash) => {
      console.log(`IP banido: ${ip} — ${motivo}`);
      // Telegram, Discord, webhook, etc.
    },
  },
})
```

---

## Logs

O Elisium registra tudo em `logs/elisium/YYYY-MM-DD.json` e no console:

```
📜 [2026-08-31 01:10:00] [MEFISTÓFELES] {hash} 192.168.0.1 — este viajante bate à porta do Elísio
✨ [2026-08-31 01:10:00] [MEFISTÓFELES] {hash} 192.168.0.1 — guiado ao Elísio
🚫 [2026-08-31 01:10:01] [NÉMESIS] {hash} 192.168.0.2 — XSS detectado em body/query
⚔️  [2026-08-31 01:10:02] [CARONTE] {hash} 192.168.0.3 — banido por rate limit
⚠️  [2026-08-31 01:10:03] [INTELIGÊNCIA] {hash} 192.168.0.4 — score 65/100
```

**Mefistófeles** é o logger interno — registra a chegada e saída de cada requisição, e delega os bloqueios para o guardião responsável.

---

## Limitações conhecidas

- **Armazenamento em memória** — IPs banidos e contadores vivem na memória do processo. Se reiniciar, tudo zera. Não funciona em múltiplas instâncias (cluster, kubernetes). Suporte a Redis está planejado.
- **Fingerprint pode ser agressivo** — em redes corporativas com proxy compartilhado, pode bloquear usuários legítimos. Use `bloquearTroca: false` nesses casos.
- **Score heurístico pode dar falso positivo** — ferramentas como Postman e alguns SDKs não enviam `User-Agent` padrão. Configure `banScoreThreshold` alto (90+) ou desative a Inteligência em rotas internas.
- **Sem suporte completo a IPv6** — alguns cenários com proxies e IPv6 podem retornar o IP errado.
- **Logs síncronos** — o `appendFileSync` pode ser gargalo em carga muito alta. Considere desativar logs em arquivo nesses casos.
- **Em desenvolvimento ativo** — API pode mudar entre versões. Pin na versão que usar.

---

## Avisos de segurança

> 🔐 O Elisium adiciona proteção mas não substitui boas práticas — valide e sanitize seus dados, implemente autenticação adequada e mantenha dependências atualizadas.

> 🌐 Se tiver nginx ou load balancer na frente, configure `trustedProxies` com o IP do proxy. Sem isso, o IP detectado será sempre o do proxy, não o do cliente real.

> 🧪 Rode `npm audit` periodicamente para verificar vulnerabilidades nas dependências.

---

Made with ❤️ by Albertão 🇧🇷
