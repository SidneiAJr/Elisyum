# 🤝 Contribuindo com o Elisium

Obrigado pelo interesse em contribuir! Antes de começar, leia este documento.

---

> [!WARNING]
> ## ⚠️ Estado atual do projeto
>
> O Elisium está na versão `0.0.1a` — em desenvolvimento ativo. A API pode mudar entre versões. Contribuições são bem-vindas, mas esteja ciente de que o projeto ainda está sendo estabilizado.

---

## Como contribuir

### 1. Abre uma issue primeiro

Antes de codar qualquer coisa, abre uma issue descrevendo o que você quer fazer — seja um bug, uma melhoria ou uma feature nova. Isso evita trabalho duplicado e garante que a mudança faz sentido pro projeto.

### 2. Faz um fork e cria uma branch

```bash
git clone https://github.com/SidneiAJr/Elisyum.git
cd Elisyum
git checkout -b feat/nome-da-sua-feature
```

Padrão de nomes de branch:

| Prefixo | Uso |
|---|---|
| `feat/` | Nova funcionalidade |
| `fix/` | Correção de bug |
| `docs/` | Documentação |
| `refactor/` | Refatoração sem mudança de comportamento |
| `test/` | Testes |

### 3. Instala as dependências

```bash
npm install
```

### 4. Faz as alterações e testa

Antes de abrir o PR, rode os testes:

```bash
npm test
```

Todos os 36 testes precisam passar. Se sua mudança quebrar algum, corrija antes de abrir o PR.

### 5. Padrão de commits

Use commits descritivos no formato:

```
feat: adiciona suporte a Redis no MemoryStore
fix: corrige falso positivo no score de IPv6
docs: atualiza exemplos da API Reference
refactor: simplifica lógica do Vault de chaves
test: adiciona teste de ban por strikes consecutivos
```

### 6. Abre o Pull Request

- Base: `main`
- Descreve o que foi feito e por quê
- Referencia a issue relacionada (`Closes #123`)
- Aguarda revisão — **ao menos 1 aprovação é obrigatória antes do merge**

---

## O que não é aceito

- PRs sem issue relacionada
- Mudanças que quebrem os testes existentes sem justificativa
- Dependências novas sem discussão prévia — o Elisium tem zero dependências externas intencionalmente
- Código sem tipagem TypeScript
- Alterações nos arquivos do Vault ou JWT sem revisão cuidadosa — são partes críticas de segurança

---

## Áreas que precisam de contribuição

- [ ] Suporte a Redis para persistência de banimentos
- [ ] Suporte a múltiplas instâncias (cluster, Kubernetes)
- [ ] Logs assíncronos para melhor performance sob carga alta
- [ ] Suporte completo a IPv6 em cenários com proxy
- [ ] Testes automatizados de ban por strikes consecutivos
- [ ] Dashboard de monitoramento em tempo real

---

## Rodando localmente

```bash
# Instala dependências
npm install

# Roda os testes
npm test

# Roda o servidor de exemplo
node bin/cli.js
```

---

## Dúvidas?

Abre uma issue com a tag `question` ou reporte uma vulnerabilidade de forma privada via **Security → Report a vulnerability** no GitHub.

---

*Made with ❤️ by Albertão 🇧🇷*