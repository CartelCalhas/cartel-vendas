import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

export const config = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  chatwootBaseUrl: required("CHATWOOT_BASE_URL").replace(/\/+$/, ""),
  chatwootAccountId: required("CHATWOOT_ACCOUNT_ID"),
  chatwootApiToken: required("CHATWOOT_API_TOKEN"),
  webhookSecret: required("WEBHOOK_SECRET"),
  chatwootInboxId: process.env.CHATWOOT_INBOX_ID?.trim() || null,
  port: Number(process.env.PORT ?? 3000),
  historyLimit: Number(process.env.HISTORY_LIMIT ?? 15),
  // Pausa manual do robo -- ver BOT_PAUSED no .env.example. Fica salvo como
  // variavel de ambiente (nao em arquivo) para nao se perder se o servico
  // reiniciar sozinho.
  botPaused: (process.env.BOT_PAUSED ?? "").trim().toLowerCase() === "true",
};
