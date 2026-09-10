import path from "path";
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
// `npm run dev` a partir da raiz do projeto).
const RIPADO_CATALOG_PATH = path.join(
  process.cwd(),
  "assets",
  "catalogo-ripado.pdf",
);
const ACABAMENTOS_PHOTO_PATH = path.join(
  process.cwd(),
  "assets",
  "acabamentos-moldura.jpg",
);

export function toChatTurns(
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

// Gera a resposta da Claude para uma conversa e manda de volta pro Chatwoot
// (texto + catalogo do ripado + desenhos de peca, quando aplicavel). Usado
// tanto pelo webhook em tempo real quanto pela rotina de responder pendencias.
export async function answerConversation(
  conversationId: number,
  userMessage: string,
  excludeMessageId: number,
): Promise<void> {
  const recent = await fetchRecentMessages(conversationId);
  const history = toChatTurns(recent, excludeMessageId);

  const reply = await generateReply(history, userMessage);
  if (reply.text) {
    await sendReply(conversationId, reply.text);
  }
  if (reply.sendRipadoCatalog) {
    await sendAttachment(conversationId, RIPADO_CATALOG_PATH);
  }
  if (reply.sendAcabamentosPhoto) {
    await sendAttachment(conversationId, ACABAMENTOS_PHOTO_PATH);
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
}
