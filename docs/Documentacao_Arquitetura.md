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

# 🏛️ Elisium | Arquitetura

---

## A ideia original — e por que mudou

O Elisium foi originalmente pensado para operar na **camada L1** — a camada física da rede, o nível mais baixo possível. A ideia era interceptar o tráfego antes mesmo de chegar ao sistema operacional.

O problema: operar na L1 exige acesso direto ao hardware de rede, como roteadores e switches configuráveis. Isso está fora do alcance de um middleware Node.js — precisaria de firmware dedicado ou soluções de rede proprietárias.

A solução foi subir para a **camada L7** — a camada de aplicação, onde o Express vive. É onde o Elisium consegue operar com total controle, sem precisar de hardware especial, instalável com um simples `npm install`.

> ⚠️ Por isso o Elisium não substitui proteções de rede. Ele complementa. Quanto mais camadas de proteção você tiver — firewall, CDN, proxy reverso, e o Elisium na aplicação — melhor.

---

## A inspiração na mitologia grega

Cada guardião do Elisium tem nome e papel inspirado na mitologia grega — não foi escolha aleatória. A mitologia grega tem uma hierarquia clara de guardiões, porteiros e punidores que mapeia perfeitamente para as camadas de segurança de uma API.

| Guardião | Origem mitológica | Papel no Elisium |
|---|---|---|
| ⚔️ **Cérbero** | O cão de três cabeças que guarda a entrada do submundo | Controla quem entra — whitelist, blacklist, ban |
| 🌊 **Caronte** | O barqueiro que controla a travessia do rio Estige | Controla o fluxo — rate limiting |
| 🛡️ **Némesis** | A deusa da retribuição e punição | Detecta e pune comportamento malicioso — WAF |
| 🐍 **Hidra** | A serpente de múltiplas cabeças impossível de matar | Detecta ataques persistentes e lentos |
| 🌍 **Atlas** | O titã que carrega o mundo nas costas | Fiscaliza o protocolo — HTTP vs HTTPS |
| 🧠 **Inteligência** | — | Analisa comportamento e pontua suspeitos |
| 🌙 **Morfeu** | O deus dos sonhos e mensagens | Envia alertas quando algo acontece |
| 📜 **Mefistófeles** | O guia entre mundos | Logger — registra tudo que entra e sai |

---

## Como uma requisição passa pelos guardiões

Toda requisição que chega na sua API percorre esse caminho em ordem:

```
Requisição recebida
        │
        ▼
┌───────────────┐
│   ⚔️ CÉRBERO  │ ── IP na whitelist? → passa direto
│               │ ── IP na blacklist? → 403 bloqueado
│               │ ── IP banido?       → 403 bloqueado
└──────┬────────┘
       │ passou
       ▼
┌───────────────┐
│   🌍 ATLAS    │ ── HTTPS obrigatório e conexão é HTTP? → 403
└──────┬────────┘
       │ passou
       ▼
┌───────────────┐
│   🐍 HIDRA    │ ── Headers conflitantes (smuggling)?  → 400 + strike
│               │ ── Headers gigantes (slowloris)?      → 400 + strike
└──────┬────────┘
       │ passou
       ▼
┌───────────────┐
│  🌊 CARONTE   │ ── Passou do limite de requisições?   → 429 + strike
└──────┬────────┘
       │ passou
       ▼
┌───────────────┐
│  🛡️ NÉMESIS   │ ── SQL Injection detectado?           → 400 + strike
│               │ ── XSS detectado?                     → 400 + strike
│               │ ── Command injection detectado?        → 400 + strike
│               │ ── Header injection detectado?         → 400 + strike
└──────┬────────┘
       │ passou
       ▼
┌───────────────┐
│  🧠 INTELIG.  │ ── Score >= threshold?                → 403 + ban
│               │ ── Score alto mas abaixo?             → aviso no log
└──────┬────────┘
       │ passou
       ▼
┌───────────────┐
│  ✨ ELÍSIO    │ ── Passou em tudo → next()
└──────┬────────┘
       │
       ▼
   Sua API 🏛️
```

Se em qualquer ponto da cadeia o IP acumular strikes suficientes, o **Cérbero** bane o IP automaticamente nas próximas requisições.

---

## A visão futura — 6 camadas até o controller

A ideia original é que uma requisição passe por **6 camadas independentes** antes de chegar ao controller. Hoje o Elisium cobre as camadas externas. O objetivo é expandir para cobrir também as camadas internas:

```
Requisição
    │
    ▼
[ Camada 1 ] — Elisium (hoje)
    Cérbero + Caronte + Némesis + Hidra + Atlas + Inteligência
    │
    ▼
[ Camada 2 ] — Fingerprint + Auth (hoje, por rota)
    Impressão digital do cliente + validação de JWT
    │
    ▼
[ Camada 3 ] — Sanitização (planejado)
    Limpeza e normalização dos dados de entrada
    │
    ▼
[ Camada 4 ] — Validação (planejado)
    Validação de schema e tipos dos dados
    │
    ▼
[ Camada 5 ] — Autorização (planejado)
    Verificação de permissões e roles do usuário
    │
    ▼
[ Camada 6 ] — Auditoria (planejado)
    Log de quem fez o quê antes de executar
    │
    ▼
  Controller → lógica de negócio
```

> ⚠️ Mais camadas = mais segurança, mas também mais tempo de processamento por requisição. Esse é um trade-off consciente — segurança primeiro. As camadas serão otimizadas progressivamente.

---

## Por que colocar o Elisium antes do rate limit da rota?

Uma dúvida comum: o Express já tem `express-rate-limit`, por que usar o Caronte do Elisium também?

A diferença é onde cada um opera:

```
Sem Elisium:
  Requisição → rate limit da rota → lógica → resposta
  (o rate limit só funciona se a requisição chegar até a rota)

Com Elisium:
  Requisição → Elisium (bloqueia antes) → rate limit da rota → lógica
  (ataques são barrados antes de chegar em qualquer rota)
```

Colocar o Elisium antes do rate limit da rota significa que um ataque de força bruta contra `/login` nunca chega ao `express-rate-limit` da rota — já é barrado pelo Caronte na entrada da aplicação.

---

## Onde o Elisium se encaixa na stack

```
Internet
    │
    ▼
[ Cloudflare / CDN ]     ← camada de rede (L3/L4)
    │
    ▼
[ Nginx / Load Balancer ] ← proxy reverso
    │
    ▼
[ Elisium ]              ← camada de aplicação (L7) — aqui
    │
    ▼
[ Sua API Express ]
    │
    ▼
[ Banco de dados ]
```

Cada camada barra uma categoria diferente de ataque. O Elisium cobre a camada de aplicação — o que o Nginx e o Cloudflare não conseguem ver.

---

## Limitações arquiteturais conhecidas

- **Single instance** — o estado (IPs banidos, contadores) vive na memória do processo. Não sincroniza entre instâncias. Redis está planejado para resolver isso.
- **L7 only** — ataques volumétricos em L3/L4 não são barrados. Precisa de solução de rede complementar.
- **Síncrono** — os guardiões rodam em sequência, não em paralelo. O custo por requisição é proporcional ao número de guardiões ativos.

---

*Made with ❤️ by Albertão 🇧🇷*