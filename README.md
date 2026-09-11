# Cartel WhatsApp Bot

Middleware que conecta o WhatsApp da Cartel (atendido via Chatwoot/BranorAI) a
Claude para responder automaticamente e qualificar leads de venda.

```
WhatsApp -> Chatwoot (BranorAI) -> webhook -> este servidor -> Claude API
                                       ^                            |
                                       +---- resposta enviada -----+
```

## Como funciona

1. Uma mensagem chega no WhatsApp da Cartel e cai na inbox do Chatwoot.
2. O Chatwoot dispara um webhook (`message_created`) para este servidor.
3. O servidor busca o historico recente da conversa, manda para a Claude API
   junto com o prompt de vendas (`src/prompts/salesPrompt.ts`) e recebe a
   resposta.
4. O servidor posta a resposta de volta na conversa via API do Chatwoot, que
   entrega no WhatsApp do cliente.

## Configuracao

### 1. Instalar dependencias

```bash
npm install
```

### 2. Variaveis de ambiente

```bash
cp .env.example .env
```

Preencha no `.env`:

- `ANTHROPIC_API_KEY`: crie em [console.anthropic.com](https://console.anthropic.com) -> API Keys.
- `CHATWOOT_BASE_URL`: `https://chat.branorai.com`.
- `CHATWOOT_ACCOUNT_ID`: o numero que aparece na URL do painel
  (`/app/accounts/<ID>/dashboard`).
- `CHATWOOT_API_TOKEN`: no Chatwoot, clique no seu avatar -> **Profile
  Settings** -> role ate **Access Token** -> copie.
- `WEBHOOK_SECRET`: invente uma string aleatoria longa (ex: `openssl rand
  -hex 20`). Serve para o servidor saber que a chamada realmente veio do seu
  Chatwoot.
- `ADMIN_SECRET`: outra string aleatoria, **diferente** do `WEBHOOK_SECRET`.
  E a senha das paginas administrativas (relatorio, pendencias, editor de
  prompt, log de erros) -- veja "Paineis administrativos" abaixo. Se nao
  definir, cai para o `WEBHOOK_SECRET`, mas o recomendado e ter uma senha
  propria: assim vazar uma nao da acesso a outra.
- `CHATWOOT_INBOX_ID` (opcional): se voce tiver mais de uma inbox no Chatwoot
  (ex: WhatsApp + Instagram) e quiser que o bot responda so no WhatsApp,
  coloque o ID dessa inbox aqui. Veja em Settings -> Inboxes -> abra a inbox,
  o ID aparece na URL.

### 3. Rodar localmente

```bash
npm run dev
```

O servidor sobe em `http://localhost:3000`. Confirme com:

```bash
curl http://localhost:3000/health
```

### 4. Expor o servidor para a internet (para testar)

O Chatwoot precisa alcançar seu servidor publicamente. Para testar local,
use algo como [ngrok](https://ngrok.com):

```bash
ngrok http 3000
```

Isso da uma URL tipo `https://abcd1234.ngrok.app`.

Para producao, faca deploy em qualquer host que rode Node (Railway, Render,
Fly.io, um VPS com PM2/Docker, etc).

### 5. Cadastrar o webhook no Chatwoot

No Chatwoot (`chat.branorai.com`):

1. **Settings -> Integrations -> Webhooks -> Add new webhook**.
2. URL: `https://SEU-DOMINIO/webhooks/chatwoot?secret=SEU_WEBHOOK_SECRET`
   (o mesmo valor de `WEBHOOK_SECRET` do `.env`).
3. Marque o evento **Message Created**.
4. Salve.

Pronto: toda mensagem recebida na inbox do WhatsApp vai passar pelo bot.

## Paineis administrativos

Todas as rotas abaixo pedem usuario/senha (HTTP Basic Auth -- o navegador
mostra um popup de login na primeira visita). O usuario pode ser qualquer
coisa, a senha e o `ADMIN_SECRET`. Diferente de um `?secret=` na URL, isso
nunca fica salvo no historico do navegador nem em log de acesso.

- `/reports/customers` -- gera um relatorio de insights (perfil de clientes,
  perguntas frequentes) a partir do historico de conversas dos ultimos N
  meses (`?months=6`, por exemplo).
- `/admin/pending-replies` -- lista conversas cuja ultima mensagem e do
  cliente e ninguem respondeu ainda, com opcao de responder todas de uma vez.
- `/admin/prompt` -- mostra e permite editar o texto do prompt de vendas
  (precos, frete, regras de negocio) **sem precisar de deploy**. A edicao
  fica salva em `DATA_DIR/sales-prompt-override.txt` e vale na hora; "Restaurar
  padrao" volta a usar o texto de `src/prompts/salesPrompt.ts`.
- `/admin/errors` -- mostra os ultimos erros registrados pelo servidor, para
  diagnostico rapido sem precisar abrir o log do host.

## Customizar o comportamento do bot

O texto padrao fica em `src/prompts/salesPrompt.ts` (exige deploy pra
mudar) -- mas no dia a dia, use `/admin/prompt` pra ajustar preco/frete/regras
sem deploy. `src/prompts/salesPrompt.ts` continua sendo o padrao de
fallback caso o override seja apagado.

## Como o robo se protege de erros e de responder em cima de um humano

- **Handoff humano**: antes de responder, o robo confere no Chatwoot se a
  conversa ja tem um atendente designado ou nao esta mais "aberta". Se tiver,
  ele fica quieto -- nao responde por cima de quem ja esta atendendo. Mas se
  o cliente ficar `HUMAN_SILENCE_TIMEOUT_MS` (padrao 15min) sem NENHUMA
  resposta -- nem do humano, nem do robo -- o robo volta a responder, pra
  ninguem ficar esperando indefinidamente. Cada mensagem nova do cliente
  reinicia essa contagem. Se nem der pra confirmar quem esta atendendo (erro
  na API do Chatwoot), o robo tambem espera antes de responder.
- **Imagens**: fotos que o cliente manda sao baixadas e enviadas pra Claude
  junto com o texto (o modelo "ve" a foto). Audio, video e outros arquivos o
  robo ainda nao consegue processar sozinho -- nesses casos ele confirma o
  recebimento pro cliente e marca a conversa com a label `revisar-anexo` no
  Chatwoot, pra um humano ver.
- **Falha transitoria**: chamadas ao Chatwoot e a Anthropic tentam de novo
  automaticamente (com espera crescente) em caso de erro de rede ou 5xx.
  Erros permanentes (4xx) nao sao repetidos.
- **Reentrega de webhook**: se o Chatwoot reenviar o mesmo evento (acontece
  quando a primeira entrega demora), o robo detecta e nao responde duas
  vezes.
- **Rajada de mensagens**: se o cliente mandar varias mensagens curtas
  seguidas (comum no WhatsApp), o robo espera `MESSAGE_DEBOUNCE_MS` (padrao
  6s) de silencio e junta tudo numa unica resposta, em vez de responder cada
  mensagem separadamente com respostas repetidas.
- **Observabilidade**: todo erro vira uma linha de log estruturado (JSON) e
  fica guardado em memoria pra consulta rapida em `/admin/errors`.

## Testes e CI

```bash
npm test        # roda os testes (node:test) que cobrem a logica critica
npm run typecheck
npm run build
```

O GitHub Actions (`.github/workflows/ci.yml`) roda os tres em todo push/PR.

## Limitacoes conhecidas

- Audio, video e arquivos (que nao sejam foto) ainda nao sao processados
  pelo robo -- ele confirma o recebimento e sinaliza a conversa pra um
  humano, mas nao "ouve" nem "le" o anexo.
- O estado local (jobs de relatorio em andamento, override do prompt) e
  salvo em `DATA_DIR` no disco do host -- em hosts sem disco persistente
  (ex: Render free sem volume) isso some se o servico for reciclado/movido
  de maquina. O override do prompt continua ativo enquanto o mesmo container
  estiver de pe; para nao depender disso, guarde uma copia do texto atual em
  outro lugar depois de editar.

## Producao

```bash
npm run build
npm start
```

Isso compila `src/` para `dist/` e roda com Node puro (sem precisar do
`tsx`).
