import type { Request, Response } from "express";
import { config } from "./config.js";
import { isIncoming } from "./chatwoot.js";
import { answerConversation } from "./replyEngine.js";

// Formato (simplificado) do payload que o Chatwoot envia no evento
// "message_created" -- ver Settings -> Integrations -> Webhooks no Chatwoot.
interface ChatwootWebhookPayload {
  event?: string;
  id?: number;
  content?: string | null;
  message_type?: number | string;
  content_type?: string;
  private?: boolean;
  conversation?: { id?: number; inbox_id?: number };
  inbox?: { id?: number };
}

export async function handleChatwootWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  if (req.query.secret !== config.webhookSecret) {
    res.status(401).json({ error: "invalid secret" });
    return;
  }

  if (config.botPaused) {
    res.status(200).json({ ok: true, paused: true });
    return;
  }

  // Responde rapido -- o processamento (Claude + Chatwoot) roda em seguida,
  // sem deixar o Chatwoot esperando o round-trip todo.
  res.status(200).json({ ok: true });

  const payload = req.body as ChatwootWebhookPayload;

  if (payload.event !== "message_created") return;
  if (!isIncoming(payload.message_type ?? "")) return;
  if (payload.private) return;
  if (payload.content_type && payload.content_type !== "text") return;

  const conversationId = payload.conversation?.id;
  const userMessage = payload.content?.trim();
  if (!conversationId || !userMessage) return;

  const inboxId = payload.conversation?.inbox_id ?? payload.inbox?.id;
  if (
    config.chatwootInboxId &&
    String(inboxId ?? "") !== config.chatwootInboxId
  ) {
    return;
  }

  try {
    await answerConversation(conversationId, userMessage, payload.id ?? -1);
  } catch (err) {
    console.error(
      `[webhook] erro processando conversa ${conversationId}:`,
      err,
    );
  }
}
