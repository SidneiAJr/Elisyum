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

# 🔐 Segurança — Decisões e Design

Esse documento explica o **porquê** de cada decisão de segurança no Elisium. Não é só "o que faz" — é "por que foi feito assim".

---

## Por que não usar `jsonwebtoken` (a lib famosa)?

A lib `jsonwebtoken` é ótima e amplamente usada. O problema é que ela assina o token, mas não **vincula** ele ao cliente que o gerou.

Isso significa que se alguém roubar o token de um usuário — via XSS, man-in-the-middle, ou vazamento de localStorage — esse token funciona em qualquer lugar, em qualquer dispositivo, até expirar.

O JWT do Elisium resolve isso com **fingerprint binding**. O token é gerado com uma impressão digital do cliente (IP + User-Agent + Accept-Language + Accept-Encoding). Se o token for usado em outro dispositivo ou contexto, o fingerprint não bate e o acesso é negado.

```
Token normal:    qualquer um que tiver o token entra
Token Elisium:   só quem gerou o token consegue usar
```

---

## Por que HKDF + PBKDF2 pra gerar as chaves?

### O que é 

HKDF (HMAC-based Key Derivation Function)
É uma função padrão criptográfico pra derivar chaves a partir de um material de entropia. Usado no TLS 1.3. Basicamente pega uma "semente" aleatória e transforma num material de chave seguro e bem distribuído.

PBKDF2 (Password-Based Key Derivation Function 2)
Função de derivação de chave projetada pra ser lenta de propósito. Ela repete o processo de hash N vezes (no Elisium: 100.000 iterações). Isso torna força bruta computacionalmente inviável — mesmo que o atacante descubra o input, recalcular leva tempo demais.


As chaves do Vault nunca são hardcoded no código ou no `.env`. Elas são **derivadas no boot** a partir de entropia aleatória.

O processo:

1. `crypto.randomBytes(128)` — 128 bytes de entropia pura do sistema operacional
2. `process.hrtime.bigint()` — timestamp de alta resolução em nanosegundos (único por boot)
3. Mais `randomBytes` pra misturar
4. Tudo isso passa pelo **HKDF** (Key Derivation Function baseada em HMAC) — padrão criptográfico usado no TLS 1.3
5. O resultado passa pelo **PBKDF2** com 100.000 iterações — torna força bruta computacionalmente inviável

Por que isso importa? Porque mesmo que alguém acesse o servidor e leia a memória, as chaves geradas são diferentes a cada boot. Não tem como reproduzir ou prever.

---

## Por que timing-safe comparison em todo lugar?

Comparações normais em JavaScript (`===`) são vulneráveis a **timing attacks**.

O problema: quando você compara `"abc" === "xyz"`, o JavaScript para na primeira letra diferente. Isso significa que a comparação de `"abc"` com `"abc"` demora microscopicamente mais que a comparação de `"abc"` com `"xyz"`.

Um atacante pode medir esse tempo e descobrir caractere por caractere qual é o token, senha ou assinatura correta.

O Elisium usa `crypto.timingSafeEqual` em todas as comparações sensíveis — ela sempre compara os dois valores inteiros, independente de onde está a diferença. O tempo de execução é sempre o mesmo.

```typescript
// ❌ Vulnerável a timing attack
if (token === tokenEsperado) { ... }

// ✅ Seguro
if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(tokenEsperado))) { ... }
```

---

## Por que delay aleatório na validação do Vault?

Além do timing-safe comparison, o Vault adiciona um delay aleatório de 1 a 5ms antes de retornar o resultado da validação.

Isso existe pra eliminar qualquer vazamento de tempo que possa existir nas operações de hash antes da comparação final. Mesmo que haja alguma variação de tempo nas operações internas, o delay aleatório torna impossível medir qualquer padrão útil.

```typescript
async function delayAleatorio(): Promise<void> {
    const ms = crypto.randomInt(1, 5);
    return new Promise(r => setTimeout(r, ms));
}
```

---

## Por que 3 camadas de chave no Vault?

O Vault mantém sempre três chaves ativas: `atual`, `reserva1` e `reserva2`.

O motivo é evitar invalidação de tokens legítimos durante a rotação.

Imagine que um usuário faz login às 14h29 e recebe um token assinado com a chave atual. Às 14h30 o Vault rotaciona. Se só existisse uma chave, o token desse usuário seria inválido imediatamente — ele teria que fazer login de novo sem ter feito nada errado.

Com três camadas, quando a chave rotaciona, as antigas viram reservas. O token de 14h29 ainda é válido porque a chave que o assinou está na `reserva1`. Quando rotacionar de novo, vai pra `reserva2`. Só na terceira rotação o token fica definitivamente inválido.

```
Rotação 1:  atual=B   reserva1=A   reserva2=—
Rotação 2:  atual=C   reserva1=B   reserva2=A  ← token de A ainda válido
Rotação 3:  atual=D   reserva1=C   reserva2=B  ← token de A expirou
```

---

## Por que congelar os protótipos das classes?

```typescript
Object.freeze(TokenVault.prototype);
Object.freeze(EventEmitter.prototype);
```

Isso é proteção contra **prototype pollution** — um tipo de ataque onde o invasor modifica o protótipo de uma classe em tempo de execução pra alterar o comportamento do código.

Se alguém conseguir executar código malicioso no contexto da aplicação e tentar sobrescrever métodos do Vault como `assinar` ou `validar`, o `Object.freeze` impede isso. Qualquer tentativa de modificar os métodos lança um erro silencioso (ou um erro explícito em strict mode).

---

## Por que detectar o modo `--inspect`?

O flag `--inspect` do Node.js abre uma porta de debug que permite inspecionar variáveis em tempo real, incluindo as chaves do Vault na memória.

O Elisium detecta isso no boot:

```typescript
function detectarDebug(): boolean {
    const args = process.execArgv.join(' ');
    return (
        args.includes('--inspect') ||
        args.includes('--inspect-brk') ||
        args.includes('--debug') ||
        typeof (process as any)['_debugProcess'] === 'function'
    );
}
```

Quando detectado, emite um aviso no stderr. Em versões futuras, o modo debug pode ser usado pra operar em modo restrito com chaves de menor privilégio.

---

## Por que sobrescrever as chaves antes de zerar na shutdown?

Quando o processo encerra, o Vault não simplesmente limpa as variáveis — ele sobrescreve com bytes aleatórios primeiro:

```typescript
// Passo 1 — sobrescreve com lixo
this.state = Object.freeze({
    atual:    crypto.randomBytes(128).toString('hex'),
    reserva1: crypto.randomBytes(128).toString('hex'),
    ...
});

// Passo 2 — zera
this.state = Object.freeze({
    atual: '', reserva1: '', ...
});
```

O motivo: em alguns sistemas, simplesmente atribuir `''` a uma variável não apaga o valor anterior da memória imediatamente — ele pode persistir até o garbage collector rodar. Se alguém fizer um dump de memória após o processo encerrar, o valor original poderia ainda estar lá.

Sobrescrever com lixo antes de zerar garante que o valor original não seja recuperável.

---

## Por que o fingerprint usa SHA-512 e não MD5 ou SHA-1?

MD5 e SHA-1 são considerados criptograficamente quebrados — existem ataques de colisão conhecidos. Isso significa que dois inputs diferentes podem gerar o mesmo hash.

No contexto do fingerprint, uma colisão poderia permitir que um atacante construa um contexto diferente que gera o mesmo fingerprint do usuário legítimo, burlando a proteção.

SHA-512 não tem colisões conhecidas e é o padrão atual recomendado para uso em segurança.

---

## Limitações que você precisa conhecer

> Transparência total sobre o que o Elisium **não** protege:

**Não substitui HTTPS.** O Elisium opera na camada de aplicação (L7). Sem HTTPS, qualquer dado trafega em texto puro na rede — incluindo tokens e senhas. Use HTTPS em produção, sempre.

**Não protege contra vulnerabilidades no seu código.** Se sua query SQL tem concatenação de string sem parametrização, o Némesis pode não detectar todos os casos. Sempre use queries parametrizadas.

**Não é um firewall de rede.** Ataques volumétricos de DDoS em camadas mais baixas (L3/L4) não são barrados pelo Elisium. Para isso você precisa de soluções de rede como Cloudflare, AWS Shield ou firewall dedicado.

**Armazenamento em memória.** Na versão atual, banimentos são perdidos ao reiniciar. Um atacante que sabe disso pode simplesmente esperar o restart. Redis está planejado.

**Falsos positivos são possíveis.** O sistema de scoring é heurístico — ele pontua comportamento suspeito, não comportamento malicioso com certeza. Calibre o `banScoreThreshold` conforme seu contexto.

---

*Made with ❤️ by Albertão 🇧🇷*