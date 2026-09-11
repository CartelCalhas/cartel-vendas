import type { Request, Response } from "express";
import { z } from "zod";
import { config } from "./config.js";
import { isIncoming, sendReply, flagForHumanReview } from "./chatwoot.js";
import { answerConversation } from "./replyEngine.js";
import { downloadImageAttachment } from "./attachments.js";
import { markSeenOnce } from "./dedupe.js";
import { logger } from "./logger.js";
import { safeEqual } from "./security.js";

// Formato (simplificado) do payload que o Chatwoot envia no evento
// "message_created" -- ver Settings -> Integrations -> Webhooks no Chatwoot.
// Validado com Zod: um payload em formato inesperado e logado e descartado
// em vez de derrubar o processamento com um erro obscuro mais adiante.
const AttachmentSchema = z.object({
  data_url: z.string().optional(),
  file_type: z.string().optional(),
});

export const WebhookPayloadSchema = z.object({
  event: z.string().optional(),
  id: z.number().optional(),
  content: z.string().nullable().optional(),
  message_type: z.union([z.number(), z.string()]).optional(),
  content_type: z.string().optional(),
  private: z.boolean().optional(),
  conversation: z.object({ id: z.number().optional(), inbox_id: z.number().optional() }).optional(),
  inbox: z.object({ id: z.number().optional() }).optional(),
  attachments: z.array(AttachmentSchema).optional(),
});

const MAX_IMAGES_PER_MESSAGE = 3;

const MEDIA_ACK_MESSAGE =
  "Recebemos seu arquivo! No momento eu so consigo analisar fotos -- se for foto, me " +
  "conta em texto o que voce precisa que ja te ajudo. Se for audio ou video, alguem da " +
  "equipe vai ouvir/ver e te responder em breve.";

export async function handleChatwootWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  if (!safeEqual(String(req.query.secret ?? ""), config.webhookSecret)) {
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

  const parsed = WebhookPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn("Payload de webhook em formato inesperado, ignorando", {
      issues: parsed.error.issues,
    });
    return;
  }
  const payload = parsed.data;

  if (payload.event !== "message_created") return;
  if (!isIncoming(payload.message_type ?? "")) return;
  if (payload.private) return;

  const conversationId = payload.conversation?.id;
  if (!conversationId) return;

  const inboxId = payload.conversation?.inbox_id ?? payload.inbox?.id;
  if (config.chatwootInboxId && String(inboxId ?? "") !== config.chatwootInboxId) {
    return;
  }

  // Evita responder duas vezes se o Chatwoot reentregar o mesmo webhook
  // (acontece se a primeira entrega nao completar antes de algum timeout).
  if (payload.id !== undefined && !markSeenOnce(`webhook-msg:${payload.id}`)) {
    logger.info(`Mensagem ${payload.id} ja foi processada, ignorando reentrega do webhook`);
    return;
  }

  const userMessage = payload.content?.trim() ?? "";
  const attachments = payload.attachments ?? [];
  const imageAttachments = attachments.filter((a) => a.file_type === "image" && a.data_url);
  const otherAttachments = attachments.filter((a) => a.file_type && a.file_type !== "image");

  // Antes, qualquer anexo que nao fosse texto puro era simplesmente
  // ignorado (nem cliente nem equipe ficavam sabendo). Agora sinalizamos a
  // conversa pra um humano conferir e, se nao sobrar nada que o robo consiga
  // processar sozinho, ao menos confirmamos o recebimento pro cliente.
  if (otherAttachments.length > 0) {
    flagForHumanReview(conversationId, "revisar-anexo").catch(() => {});
  }

  if (!userMessage && imageAttachments.length === 0) {
    if (otherAttachments.length > 0) {
      try {
        await sendReply(conversationId, MEDIA_ACK_MESSAGE);
      } catch (err) {
        logger.error(`Falha ao confirmar recebimento de midia na conversa ${conversationId}`, {
          error: err,
        });
      }
    }
    return;
  }

  const downloaded = await Promise.all(
    imageAttachments
      .slice(0, MAX_IMAGES_PER_MESSAGE)
      .map((a) => downloadImageAttachment(a.data_url as string)),
  );
  const images = downloaded.filter((img): img is NonNullable<typeof img> => img !== null);

  try {
    await answerConversation(conversationId, userMessage, payload.id ?? -1, images);
  } catch (err) {
    logger.error(`Erro processando conversa ${conversationId}`, { error: err });
  }
}
