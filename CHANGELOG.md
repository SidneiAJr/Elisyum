# Histórico de Versão — Elisium

---

## [0.0.1a] — 2026-08-31 · Versão de Teste | AVISO VERSÃO EM TESTES

> Versão inicial de testes. API instável — pode mudar sem aviso entre releases.

### Adicionado
- Middleware principal `elisiumGuard` com suporte a sete guardiões de segurança
- **Cérbero** — controle de whitelist, blacklist e ban temporário por IP
- **Caronte** — rate limiting por janela de tempo configurável
- **Némesis** — detecção de SQL Injection, XSS, injeção de comandos e header injection
- **Hidra** — proteção contra Slowloris e Request Smuggling
- **Atlas** — fiscalização de protocolo com suporte a modo `httpsOnly`
- **Inteligência** — sistema de pontuação comportamental por IP com ban automático
- **Morfeu** — sistema de alertas com suporte a callback customizável
- Middleware de rota `elisium` com controle de métodos HTTP e TTL de sessão
- Vinculação de fingerprint do cliente para proteção contra roubo de JWT
- Sistema próprio de JWT (`gerarToken` / `validarToken`) com fingerprint binding
- Helper `aplicarTimeoutConexao` para proteção contra Slowloris no nível do server
- Logger interno **Mefistófeles** com output no console e em arquivo JSON diário (`logs/elisium/YYYY-MM-DD.json`)

### Limitações conhecidas (nesta versão)
- Armazenamento em memória — banimentos e contadores são perdidos ao reiniciar o processo
- Sem suporte a múltiplas instâncias (cluster, Kubernetes) — Redis planejado para versão futura
- Fingerprint pode bloquear usuários legítimos em redes com proxy compartilhado
- Score heurístico pode gerar falsos positivos com ferramentas como Postman
- Suporte a IPv6 incompleto em alguns cenários com proxy
- Logs síncronos (`appendFileSync`) podem ser gargalo sob carga muito alta

---

*Made with ❤️ by Albertão 🇧🇷*