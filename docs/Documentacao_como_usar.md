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


# 📖 Como usar o Elisium

> ⚠️ **AVISO — Versão em testes (`0.0.1a`)**
>
> Esta lib ainda está em desenvolvimento ativo. A API pode mudar sem aviso entre versões. Algumas funcionalidades ainda estão sendo ajustadas e podem apresentar comportamentos inesperados. **Não use em produção ainda.**

---

## Por que o Elisium foi criado?

O Node.js com Express é incrível pra subir uma API rápido — mas ele vem praticamente sem proteção nenhuma por padrão.

Pra fechar as lacunas básicas de segurança você precisaria instalar e configurar vários pacotes separados: `helmet`, `express-rate-limit`, `express-validator`, e por aí vai. Cada um com sua documentação, sua configuração, seu jeito de funcionar.

O Elisium nasceu pra fechar essas lacunas em uma linha só. Um middleware, sete camadas de proteção, zero configuração obrigatória.

---

## Instalação

```bash
npm install elisium
```

**Requisitos:**
- Node.js 18 ou superior
- Express 4 ou superior
- TypeScript (recomendado, mas funciona com JS também)

---

## Imports disponíveis

```typescript
// Middleware principal — proteção global da API
import { elisiumGuard } from 'elisium';

// Middleware de rota — proteção por endpoint
import { elisium } from 'elisium';

// Autenticação JWT
import { authMiddleware } from 'elisium';

// Timeout de conexão (proteção Slowloris)
import { aplicarTimeoutConexao } from 'elisium';

// JWT próprio
import { gerarToken, validarToken } from 'elisium/utils/jwt';

// Vault de chaves
import { vault } from 'elisium/core/vault';

// Store de IPs em memória
import { memoryStore } from 'elisium';

// Logger interno
import { mefistofeles } from 'elisium';
```

---

## Uso básico — protege a API inteira

Coloca o `elisiumGuard` logo no início, antes de qualquer rota:

```typescript
import express from 'express';
import http from 'http';
import { elisiumGuard, aplicarTimeoutConexao } from 'elisium';

const app = express();
const server = http.createServer(app);

app.use(express.json());

// ✅ Coloca aqui — antes de qualquer rota
app.use(elisiumGuard({
  cerberus:     { maxStrikes: 3, banTime: 60 * 60 * 1000 },
  caronte:      { windowMs: 60_000, max: 100 },
  nemesis:      { xss: true, sqlInjection: true, commandInjection: true, headerInjection: true },
  hidra:        { slowloris: true, requestSmuggling: true },
  inteligencia: { enabled: true, banScoreThreshold: 80 },
  morfeu: {
    onBan: (ip, motivo, hash) => {
      console.log(`🔥 IP banido: ${ip} | motivo: ${motivo}`);
    }
  }
}));

app.get('/', (req, res) => {
  res.json({ message: 'Você chegou ao Elísio!' });
});

server.listen(3000, () => {
  console.log('🚀 Servidor rodando na porta 3000');
});

// ⚠️ Obrigatório — usa o server, não o app
aplicarTimeoutConexao(server, 5000);
```

> ⚠️ **Atenção:** use sempre `http.createServer(app)` junto com `aplicarTimeoutConexao`. Se chamar só `app.listen()`, a proteção contra Slowloris não vai funcionar.

---

## Proteção por rota

Para rotas sensíveis como login, pagamento ou dados do usuário:

```typescript
import { elisium, authMiddleware } from 'elisium';

// Só aceita POST, vincula fingerprint do cliente e exige JWT válido
app.post('/pagamento',
  elisium({ metodos: ['POST'], ttl: 15 * 60 * 1000 }),
  authMiddleware(),
  (req, res) => {
    const user = (req as any).elisiumUser;
    res.json({ ok: true, user });
  }
);

// Rota pública — só controla método
app.get('/publico',
  elisium({ metodos: ['GET'] }),
  (req, res) => {
    res.json({ ok: true });
  }
);
```

---

## Gerando e validando JWT

O Elisium tem seu próprio sistema de JWT vinculado ao fingerprint do cliente:

```typescript
import { gerarToken, validarToken } from 'elisium/utils/jwt';

// No login — gera o token
app.post('/login', (req, res) => {
  const fingerprint = (req as any).elisiumFingerprint;

  const token = gerarToken('user-123', 'request-hash', {
    expiresIn:   60 * 60 * 1000,  // 1 hora
    fingerprint,                   // vincula ao cliente
    claims: { role: 'admin' },    // dados extras
  });

  res.json({ token });
});

// Em qualquer rota protegida — valida o token
app.get('/perfil', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const fingerprint = (req as any).elisiumFingerprint;

  const resultado = validarToken(token!, fingerprint);

  if (!resultado.valid) {
    return res.status(401).json({ error: resultado.motivo });
  }

  res.json({ user: resultado.payload });
});
```

---

## Configuração com nginx ou proxy

Se tiver nginx, load balancer ou qualquer proxy na frente, configure o IP confiável:

```typescript
app.use(elisiumGuard({
  cerberus: {
    maxStrikes:     3,
    banTime:        60 * 60 * 1000,
    trustedProxies: ['10.0.0.1'], // ← IP do seu proxy/nginx
  },
  // ... resto da config
}));
```

> ⚠️ Sem isso, o IP detectado será sempre o do proxy, não o do cliente real. Todos os usuários vão compartilhar o mesmo contador de rate limit e podem ser banidos juntos.

---

## Aviso sobre desenvolvimento local

Em desenvolvimento, requisições feitas por ferramentas como Postman, Insomnia ou curl podem ativar o sistema de pontuação da Inteligência porque não enviam `User-Agent` e `Accept-Language` padrão.

Para evitar falsos positivos em dev, aumente o threshold ou desative temporariamente:

```typescript
inteligencia: {
  enabled:           true,
  banScoreThreshold: 95, // bem alto em dev
}

// ou desativa completamente em dev
inteligencia: {
  enabled: process.env.NODE_ENV !== 'development',
  banScoreThreshold: 80,
}
```

> ✅ IPs locais (`127.0.0.1`, `::1`) nunca recebem pontuação — você não vai se banir em desenvolvimento.

---

## O que ainda está sendo ajustado

> ⚠️ Itens em aberto nesta versão de testes:

- [ ] Suporte a Redis para persistência de banimentos entre reinicializações
- [ ] Suporte completo a múltiplas instâncias (cluster, Kubernetes)
- [ ] Logs assíncronos para melhor performance sob alta carga
- [ ] Suporte completo a IPv6 em cenários com proxy
- [ ] Testes automatizados de ban por strikes consecutivos
- [ ] Dashboard de monitoramento em tempo real

---

*Made with ❤️ by Albertão 🇧🇷*