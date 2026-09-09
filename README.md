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

## Customizar o comportamento do bot

Edite `src/prompts/salesPrompt.ts` -- e o "system prompt" enviado em toda
chamada a Claude. Descreva ali: produtos/servicos da Cartel, tom de voz,
politica de precos, quando chamar um humano, etc.

## Limitacoes desta primeira versao (MVP)

- Nao distingue se a conversa ja foi assumida por um atendente humano --
  o bot responde toda mensagem recebida na inbox configurada. Se um humano
  ja esta atendendo, ele tambem vai receber a resposta automatica do bot.
  Uma melhoria futura e checar `conversation.status` / o agente atribuido
  antes de responder.
- So processa mensagens de texto (imagens, audios, etc. sao ignorados).
- Nao ha fila/retry: se a chamada a Claude ou ao Chatwoot falhar, o erro so
  vai pro log (`console.error`) e a mensagem fica sem resposta.

## Producao

```bash
npm run build
npm start
```

Isso compila `src/` para `dist/` e roda com Node puro (sem precisar do
`tsx`).
