import path from "path";
import type { Request, Response } from "express";
import { config } from "./config.js";
import {
  fetchRecentMessages,
  isIncoming,
  isOutgoing,
  sendReply,
  sendAttachment,
  sendAttachments,
  type ChatwootMessage,
} from "./chatwoot.js";
import { generateReply, type ChatTurn } from "./claude.js";

// Resolvido a partir do diretorio de onde o processo roda (`npm start` /
// `npm run dev` a partir da raiz do projeto) -- ver assets/README se o
// arquivo for movido.
const RIPADO_CATALOG_PATH = path.join(
  process.cwd(),
  "assets",
  "catalogo-ripado.pdf",
);

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

function toChatTurns(
  messages: ChatwootMessage[],
  excludeMessageId: number,
): ChatTurn[] {
  return messages
    .filter((m) => m.id !== excludeMessageId)
    .filter((m) => !m.private)
    .filter((m) => !m.content_type || m.content_type === "text")
    .filter((m) => m.content)
    .filter((m) => isIncoming(m.message_type) || isOutgoing(m.message_type))
    .sort((a, b) => a.created_at - b.created_at)
    .slice(-config.historyLimit)
    .map((m) => ({
      role: isIncoming(m.message_type) ? "user" : "assistant",
      content: m.content as string,
    }));
}

export async function handleChatwootWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  if (req.query.secret !== config.webhookSecret) {
    res.status(401).json({ error: "invalid secret" });
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
    const recent = await fetchRecentMessages(conversationId);
    const history = toChatTurns(recent, payload.id ?? -1);

    const reply = await generateReply(history, userMessage);
    if (reply.text) {
      await sendReply(conversationId, reply.text);
    }
    if (reply.sendRipadoCatalog) {
      await sendAttachment(conversationId, RIPADO_CATALOG_PATH);
    }
    if (reply.drawings.length > 0) {
      await sendAttachments(
        conversationId,
        reply.drawings.map((d) => ({
          buffer: d.buffer,
          filename: d.filename,
          mimeType: "image/png",
        })),
      );
    }
  } catch (err) {
    console.error(
      `[webhook] erro processando conversa ${conversationId}:`,
      err,
    );
  }
}
