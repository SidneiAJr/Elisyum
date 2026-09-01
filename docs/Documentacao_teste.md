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

# 🧪 Ambiente de Testes — Elisium

Documentação dos testes realizados na versão `0.0.1a`.

---

## Visão Geral

O Elisium foi testado com dois tipos de teste:

| Tipo | Ferramenta | O que cobre |
|---|---|---|
| **Unitário / Integração** | `ts-node` (test.ts interno) | JWT, Vault, Fingerprint, MemoryStore |
| **Carga e Ataque** | k6 + Docker | Rate limit, SQL Injection, carga normal |

---

## Teste 1 — Unitário/Integração (`test.ts`)

Roda diretamente no Node via `npm test`. Cobre os módulos internos do Elisium sem dependência externa.

### Como rodar

```bash
npm test
```

### O que é testado

#### 🔱 JWT
- Token válido é aceito
- Token adulterado é rejeitado
- Token malformado é rejeitado
- Token expirado é rejeitado
- Token vazio é rejeitado
- Payload corrompido é rejeitado
- Token com fingerprint correto é aceito
- Token com fingerprint errado é rejeitado
- Token sem fingerprint ignora verificação de fingerprint
- Claims extras são preservados no payload

#### 🔱 Vault
- Assinatura é gerada corretamente
- Assinatura válida é aceita
- Dados alterados são rejeitados
- Assinatura fake é rejeitada
- Dados vazios são rejeitados
- Métricas são contabilizadas corretamente
- Estado do vault é retornado corretamente
- Assina e valida após rotação forçada
- Assinatura antiga ainda é válida na camada de reserva

#### 🔱 Fingerprint
- IP novo passa sem bloqueio
- Fingerprint é anexado na requisição
- Mesmo contexto passa normalmente
- User-Agent diferente é bloqueado (403)
- Método não permitido é bloqueado (405)
- POST explícito passa quando configurado
- `bloquearTroca: false` permite mudança de contexto

#### 🔱 MemoryStore
- Record inicial com valores zerados
- Increment funciona corretamente
- Strike é contabilizado corretamente
- Score é atualizado corretamente
- Ban é aplicado corretamente
- Reset limpa todos os dados
- Ban expirado não bloqueia

### Resultado esperado

```
🔱 ── JWT ───────────────────────────────────────────
  ✅ Token válido é aceito
  ✅ Payload tem sub correto
  ✅ Payload tem hash correto
  ... (todos passando)

🔱 ── VAULT ─────────────────────────────────────────
  ✅ Assinatura gerada
  ✅ Assinatura válida aceita
  ... (todos passando)

🔱 ── FINGERPRINT ────────────────────────────────────
  ✅ IP novo — passa
  ✅ Fingerprint anexado no req
  ... (todos passando)

🔱 ── MEMORY STORE ───────────────────────────────────
  ✅ Record inicial — requests 0
  ... (todos passando)

───────────────────────────────────────────────────────
🏁 RESULTADO: 36 passaram | 0 falharam | 36 total
✨ Mefistófeles aprova — todos os testes passaram!
```

---

## Teste 2 — Carga e Ataque (k6)

Teste de carga e simulação de ataques usando [k6](https://k6.io/) rodando via Docker contra o servidor Express real com o Elisium ativo.

### Pré-requisitos

- Docker instalado
- Servidor rodando em `localhost:3000` com o Elisium configurado

### Script de teste

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    carga_normal: {
      executor: 'constant-vus',
      vus: 10,
      duration: '15s',
    },
    rate_limit: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s',  target: 50  },
        { duration: '10s', target: 200 },
      ],
      startTime: '15s',
    },
    sqli: {
      executor: 'constant-vus',
      vus: 5,
      duration: '10s',
      startTime: '30s',
    },
  },
};

const BASE = 'http://host.docker.internal:3000';

export default function () {
  const cenario = __VU <= 5 ? 'sqli' : 'normal';

  if (cenario === 'sqli') {
    const res = http.get(`${BASE}/rios?id=1' OR '1'='1`);
    check(res, { 'sqli bloqueado (400)': r => r.status === 400 });
    return;
  }

  const res = http.get(`${BASE}/health`);
  check(res, {
    'passou (200)':      r => r.status === 200,
    'rate limit (429)':  r => r.status === 429,
  });
  sleep(0.1);
}
```

### Como rodar

```bash
docker run --rm -i grafana/k6 run - < teste-k6.js
```

### O que cada cenário faz

**`carga_normal`** — 10 usuários simultâneos por 15 segundos acessando `/health`. Verifica se o servidor aguenta carga normal sem engasgar.

**`rate_limit`** — Sobe de 0 para 200 usuários em 15 segundos. Verifica se o Caronte entra em ação e começa a retornar 429 quando o limite é ultrapassado.

**`sqli`** — 5 usuários tentando SQL Injection em `/rios?id=1' OR '1'='1`. Verifica se o Némesis detecta e retorna 400.

### Resultado observado

```
✓ passou (200)
✓ rate limit (429)
✓ sqli bloqueado (400)
```

Todos os cenários responderam conforme esperado:
- Carga normal fluiu sem bloqueio
- Rate limit ativou corretamente ao ultrapassar o limite configurado
- SQL Injection foi detectado e bloqueado pelo Némesis com 400

---

## Logs gerados durante os testes

Exemplo de log real capturado durante os testes (`logs/elisium/2026-08-29.json`):

```json
{"hash":"a6d2a4...","ip":"::ffff:127.0.0.1","level":"info","module":"MEFISTÓFELES","message":"este viajante bate à porta do Elísio"}
{"hash":"a6d2a4...","ip":"::ffff:127.0.0.1","level":"warn","module":"INTELIGÊNCIA","message":"score 40/100 — User-Agent ausente (+20) | Accept-Language ausente (+15) | Conexão HTTP não criptografada (+5)"}
{"hash":"a6d2a4...","ip":"::ffff:127.0.0.1","level":"pass","module":"MEFISTÓFELES","message":"Mefistófeles guia este viajante ao seu caminho ✨"}
```

> O score 40/100 nas requisições locais era esperado nesta versão — o whitelist automático de `localhost` foi adicionado na correção `0.0.1b` para eliminar esses falsos positivos em desenvolvimento.

---

## Limitações dos testes nesta versão

- Testes de carga rodam contra instância única — sem teste de múltiplas instâncias
- Não há teste automatizado de ban por strikes consecutivos
- Fingerprint não foi testado em cenário de proxy compartilhado
- Não há teste de performance do Vault sob alta carga de assinaturas

---

*Made with ❤️ by Albertão 🇧🇷*