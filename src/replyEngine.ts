import path from "path";
import { config } from "./config.js";
import {
  fetchRecentMessages,
  fetchConversationMeta,
  isIncoming,
  isOutgoing,
  sendReply,
  sendAttachment,
  sendAttachments,
  type ChatwootMessage,
} from "./chatwoot.js";
import { generateReply, type ChatTurn, type IncomingImage } from "./claude.js";
import { logger } from "./logger.js";

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

export interface AnswerResult {
  sent: boolean;
  // Preenchido quando `sent` e false: motivo legivel pra mostrar num painel
  // administrativo (ex.: varredura de pendencias).
  skippedReason?: string;
}

// Gera a resposta da Claude para uma conversa e manda de volta pro Chatwoot
// (texto + catalogo do ripado + desenhos de peca, quando aplicavel). Usado
// tanto pelo webhook em tempo real quanto pela rotina de responder pendencias.
export async function answerConversation(
  conversationId: number,
  userMessage: string,
  excludeMessageId: number,
  images: IncomingImage[] = [],
): Promise<AnswerResult> {
  // Handoff humano: se um atendente ja foi designado pra conversa, ou ela
  // nao esta mais "open" (foi resolvida/deixada pendente manualmente), o
  // robo nao deve responder por cima. Se nem der pra confirmar isso (erro na
  // API do Chatwoot), tambem preferimos nao responder -- e mais seguro
  // deixar a mensagem sem resposta automatica do que arriscar um
  // atendimento duplicado/conflitante com um humano.
  const meta = await fetchConversationMeta(conversationId).catch((err) => {
    logger.error(`Nao foi possivel checar quem esta atendendo a conversa ${conversationId}`, {
      error: err,
    });
    return null;
  });
  if (meta === null) {
    return { sent: false, skippedReason: "nao foi possivel confirmar se ja tem atendente humano" };
  }
  if (meta.assigneeId !== null || meta.status !== "open") {
    logger.info(`Conversa ${conversationId} ja esta com atendimento humano, robo nao vai responder`, {
      status: meta.status,
      assigneeId: meta.assigneeId,
    });
    return { sent: false, skippedReason: "conversa ja esta com atendimento humano" };
  }

  const recent = await fetchRecentMessages(conversationId);
  const history = toChatTurns(recent, excludeMessageId);

  const reply = await generateReply(history, userMessage, images);
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
  return { sent: true };
}
