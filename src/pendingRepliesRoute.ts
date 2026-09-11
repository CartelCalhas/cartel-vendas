import type { Request, Response } from "express";
import { config } from "./config.js";
import { listConversationsSince } from "./chatwootConversations.js";
import { findPendingConversations } from "./pendingReplies.js";
import { answerConversation } from "./replyEngine.js";
import {
  renderPendingListPage,
  renderPendingResultPage,
  renderWaitingPage,
  renderErrorPage,
} from "./report/render.js";
import { createJob, completeJob, failJob } from "./report/jobs.js";
import { logger } from "./logger.js";

const MAX_DAYS = 60;
const MAX_CONVERSATIONS = 200;

async function loadPending() {
  const cutoffSeconds = Math.floor(Date.now() / 1000) - MAX_DAYS * 24 * 60 * 60;
  const { conversations } = await listConversationsSince(cutoffSeconds, {
    inboxId: config.chatwootInboxId,
    maxConversations: MAX_CONVERSATIONS,
  });
  return findPendingConversations(conversations);
}

// Passo 1: lista as conversas sem resposta, sem mandar nada ainda.
export async function handlePendingList(req: Request, res: Response): Promise<void> {
  const jobId = createJob();
  res.status(200).send(
    renderWaitingPage({
      jobId,
      heading: "Procurando conversas sem resposta...",
      message: `Consultando o Chatwoot (ultimos ${MAX_DAYS} dias). Pode levar cerca de 1 minuto.`,
    }),
  );

  (async () => {
    const pending = await loadPending();
    completeJob(jobId, renderPendingListPage({ pending, confirmUrl: "/admin/pending-replies/start" }));
  })().catch((err) => {
    logger.error("Erro ao listar conversas pendentes", { error: err });
    failJob(jobId, (err as Error).message);
  });
}

// Passo 2: gera e manda a resposta da Claude para cada conversa pendente.
export async function handlePendingStart(req: Request, res: Response): Promise<void> {
  if (config.botPaused) {
    res.status(200).send(
      renderErrorPage(
        "O robo esta pausado (BOT_PAUSED=true no Render) -- nenhuma mensagem foi enviada. Remova essa variavel de ambiente pra religar antes de tentar de novo.",
      ),
    );
    return;
  }

  const jobId = createJob();
  res.status(200).send(
    renderWaitingPage({
      jobId,
      heading: "Respondendo conversas pendentes...",
      message: "Gerando e enviando uma resposta para cada conversa. Isso pode levar alguns minutos.",
    }),
  );

  (async () => {
    const pending = await loadPending();
    const answered: string[] = [];
    const skipped: { contactName: string; reason: string }[] = [];
    const errors: { contactName: string; error: string }[] = [];

    for (const conv of pending) {
      try {
        const result = await answerConversation(
          conv.conversationId,
          conv.lastMessageContent,
          conv.lastMessageId,
        );
        if (result.sent) {
          answered.push(conv.contactName);
        } else {
          skipped.push({ contactName: conv.contactName, reason: result.skippedReason ?? "motivo desconhecido" });
        }
      } catch (err) {
        errors.push({ contactName: conv.contactName, error: (err as Error).message });
      }
    }

    completeJob(jobId, renderPendingResultPage({ answered, skipped, errors }));
  })().catch((err) => {
    logger.error("Erro ao responder conversas pendentes", { error: err });
    failJob(jobId, (err as Error).message);
  });
}
