import { config } from "./config.js";
import type { IncomingImage } from "./claude.js";
import { logger } from "./logger.js";

export interface IncomingMessage {
  id: number;
  text: string;
  images: IncomingImage[];
}

export interface BatchedMessage {
  text: string;
  images: IncomingImage[];
  excludeMessageIds: number[];
}

interface PendingBatch {
  messages: IncomingMessage[];
  timer: NodeJS.Timeout;
}

const pending = new Map<number, PendingBatch>();

// Cliente no WhatsApp costuma mandar uma pergunta em varias mensagens curtas
// seguidas (ex: "Calhas em pvc?" e, logo depois, "1"), em vez de uma so. Sem
// agrupar, cada mensagem virava uma chamada separada a Claude e o cliente
// recebia duas respostas quase identicas de volta -- confuso pra ele e
// desperdicio de tokens. Aqui a gente espera um pouco de silencio na
// conversa antes de responder, juntando tudo que chegou nesse intervalo
// numa unica resposta.
export function enqueueMessage(
  conversationId: number,
  message: IncomingMessage,
  onFlush: (conversationId: number, batch: BatchedMessage) => void,
): void {
  const existing = pending.get(conversationId);
  const messages = existing ? [...existing.messages, message] : [message];
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    pending.delete(conversationId);
    const text = messages
      .map((m) => m.text)
      .filter(Boolean)
      .join("\n");
    const images = messages.flatMap((m) => m.images);
    const excludeMessageIds = messages.map((m) => m.id);

    if (messages.length > 1) {
      logger.info(`Agrupando ${messages.length} mensagens da conversa ${conversationId} numa resposta so`);
    }
    onFlush(conversationId, { text, images, excludeMessageIds });
  }, config.messageDebounceMs);

  pending.set(conversationId, { messages, timer });
}
