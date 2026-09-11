import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

const webhookSecret = required("WEBHOOK_SECRET");

export const config = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  chatwootBaseUrl: required("CHATWOOT_BASE_URL").replace(/\/+$/, ""),
  chatwootAccountId: required("CHATWOOT_ACCOUNT_ID"),
  chatwootApiToken: required("CHATWOOT_API_TOKEN"),
  // Segredo que valida chamadas de webhook vindas do Chatwoot (vai na URL do
  // webhook, publica pro Chatwoot). Propositalmente separado de adminSecret:
  // um nunca deve dar acesso ao outro.
  webhookSecret,
  // Senha das rotas administrativas (/reports/*, /admin/*), usada via HTTP
  // Basic Auth -- nunca aparece em URL, log de acesso ou historico do
  // navegador. Se nao for definida, cai para webhookSecret por compatibilidade,
  // mas o recomendado e configurar um valor proprio.
  adminSecret: process.env.ADMIN_SECRET?.trim() || webhookSecret,
  chatwootInboxId: process.env.CHATWOOT_INBOX_ID?.trim() || null,
  port: Number(process.env.PORT ?? 3000),
  historyLimit: Number(process.env.HISTORY_LIMIT ?? 15),
  // Quanto tempo esperar em silencio antes de responder, pra juntar
  // mensagens que o cliente manda em rajada (varias mensagens curtas
  // seguidas) numa unica resposta em vez de uma resposta repetida pra cada
  // uma. Aumentar deixa a resposta mais "inteligente" mas mais lenta;
  // diminuir deixa mais rapida mas volta a responder rajadas em duplicidade.
  messageDebounceMs: Number(process.env.MESSAGE_DEBOUNCE_MS ?? 6000),
  // Pausa manual do robo -- ver BOT_PAUSED no .env.example. Fica salvo como
  // variavel de ambiente (nao em arquivo) para nao se perder se o servico
  // reiniciar sozinho.
  botPaused: (process.env.BOT_PAUSED ?? "").trim().toLowerCase() === "true",
  // Modelo usado em todas as chamadas a Claude (atendimento e relatorios) --
  // centralizado aqui para nunca ficar dessincronizado entre arquivos.
  claudeModel: process.env.CLAUDE_MODEL?.trim() || "claude-opus-5",
  // Diretorio onde o servidor persiste estado local (jobs de relatorio,
  // dedupe de mensagens, override do prompt de vendas, log de erros).
  dataDir: process.env.DATA_DIR?.trim() || "data",
};
