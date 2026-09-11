import path from "path";
import { config } from "./config.js";
import {
  fetchRecentMessages,
  fetchConversationMeta,
  isIncoming,
  isOutgoing,
  lastPendingMessage,
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
  excludeMessageIds: number | number[],
): ChatTurn[] {
  const excluded = new Set(
    Array.isArray(excludeMessageIds) ? excludeMessageIds : [excludeMessageIds],
  );
  return messages
    .filter((m) => !excluded.has(m.id))
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

interface AnswerOptions {
  // So usado internamente pelo fallback de silencio (ver mais abaixo): pula
  // a checagem de handoff humano desta vez, porque ja passou
  // config.humanSilenceTimeoutMs sem nenhuma resposta (nem humana, nem do
  // robo) depois da ultima mensagem do cliente.
  bypassHandoffCheck?: boolean;
}

// Quando um atendente humano ja assumiu a conversa, o robo fica quieto --
// mas se ninguem responder ao cliente dentro de config.humanSilenceTimeoutMs,
// o robo volta a responder pra nao deixar o cliente esperando indefinidamente.
// Um timer por conversa; cada mensagem nova do cliente reinicia a contagem.
const handoffWatchers = new Map<number, NodeJS.Timeout>();

function clearHandoffWatcher(conversationId: number): void {
  const timer = handoffWatchers.get(conversationId);
  if (timer) {
    clearTimeout(timer);
    handoffWatchers.delete(conversationId);
  }
}

function scheduleHandoffFallback(
  conversationId: number,
  userMessage: string,
  excludeMessageIds: number | number[],
  images: IncomingImage[],
): void {
  clearHandoffWatcher(conversationId);

  const timer = setTimeout(() => {
    handoffWatchers.delete(conversationId);
    checkStillUnanswered(conversationId, userMessage, excludeMessageIds, images).catch((err) => {
      logger.error(`Erro no fallback de silencio da conversa ${conversationId}`, { error: err });
    });
  }, config.humanSilenceTimeoutMs);

  // Nao deve impedir o processo de encerrar sozinho (ex.: em testes) so por
  // causa de um timer de 15 minutos pendente.
  timer.unref();
  handoffWatchers.set(conversationId, timer);
}

async function checkStillUnanswered(
  conversationId: number,
  userMessage: string,
  excludeMessageIds: number | number[],
  images: IncomingImage[],
): Promise<void> {
  if (config.botPaused) return;

  const recent = await fetchRecentMessages(conversationId);
  if (!lastPendingMessage(recent)) {
    // Alguem (humano ou robo) ja respondeu depois da ultima mensagem do
    // cliente -- nada a fazer.
    return;
  }

  logger.info(
    `Conversa ${conversationId}: cliente sem nenhuma resposta ha ${Math.round(config.humanSilenceTimeoutMs / 60000)}min mesmo com atendimento humano -- robo vai responder`,
  );
  await answerConversation(conversationId, userMessage, excludeMessageIds, images, {
    bypassHandoffCheck: true,
  });
}

// Gera a resposta da Claude para uma conversa e manda de volta pro Chatwoot
// (texto + catalogo do ripado + desenhos de peca, quando aplicavel). Usado
// tanto pelo webhook em tempo real quanto pela rotina de responder pendencias.
export async function answerConversation(
  conversationId: number,
  userMessage: string,
  excludeMessageIds: number | number[],
  images: IncomingImage[] = [],
  options: AnswerOptions = {},
): Promise<AnswerResult> {
  if (!options.bypassHandoffCheck) {
    // Handoff humano: se um atendente ja foi designado pra conversa, ou ela
    // nao esta mais "open" (foi resolvida/deixada pendente manualmente), o
    // robo fica quieto -- mas agenda uma checagem em humanSilenceTimeoutMs
    // (ver scheduleHandoffFallback) pra nao deixar o cliente sem resposta
    // nenhuma indefinidamente, caso o humano tambem nao responda. Se nem der
    // pra confirmar isso agora (erro na API do Chatwoot), tambem preferimos
    // esperar a arriscar um atendimento duplicado/conflitante com um humano.
    const meta = await fetchConversationMeta(conversationId).catch((err) => {
      logger.error(`Nao foi possivel checar quem esta atendendo a conversa ${conversationId}`, {
        error: err,
      });
      return null;
    });
    if (meta === null) {
      scheduleHandoffFallback(conversationId, userMessage, excludeMessageIds, images);
      return { sent: false, skippedReason: "nao foi possivel confirmar se ja tem atendente humano" };
    }
    if (meta.assigneeId !== null || meta.status !== "open") {
      logger.info(`Conversa ${conversationId} ja esta com atendimento humano, robo fica quieto por ora`, {
        status: meta.status,
        assigneeId: meta.assigneeId,
      });
      scheduleHandoffFallback(conversationId, userMessage, excludeMessageIds, images);
      return {
        sent: false,
        skippedReason: `conversa ja esta com atendimento humano (robo so responde se ninguem responder em ${Math.round(config.humanSilenceTimeoutMs / 60000)}min)`,
      };
    }
    // Vamos responder agora -- cancela qualquer fallback pendente dessa conversa.
    clearHandoffWatcher(conversationId);
  }

  const recent = await fetchRecentMessages(conversationId);
  const history = toChatTurns(recent, excludeMessageIds);

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
