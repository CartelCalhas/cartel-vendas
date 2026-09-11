import type { Request, Response } from "express";
import { config } from "./config.js";
import { listConversationsSince } from "./chatwootConversations.js";
import {
  findFeedbackCandidates,
  sendFeedbackRequest,
  MAX_DAYS_SINCE_RESOLVED,
} from "./feedbackFollowup.js";
import {
  renderFeedbackListPage,
  renderFeedbackResultPage,
  renderWaitingPage,
  renderErrorPage,
} from "./report/render.js";
import { createJob, completeJob, failJob } from "./report/jobs.js";
import { logger } from "./logger.js";

const MAX_CONVERSATIONS = 200;

async function loadCandidates() {
  const cutoffSeconds = Math.floor(Date.now() / 1000) - MAX_DAYS_SINCE_RESOLVED * 24 * 60 * 60;
  const { conversations } = await listConversationsSince(cutoffSeconds, {
    inboxId: config.chatwootInboxId,
    maxConversations: MAX_CONVERSATIONS,
    status: "resolved",
  });
  return findFeedbackCandidates(conversations);
}

// Passo 1: lista quem esta elegivel pra receber o pedido de feedback, sem
// mandar nada ainda.
export async function handleFeedbackList(req: Request, res: Response): Promise<void> {
  const jobId = createJob();
  res.status(200).send(
    renderWaitingPage({
      jobId,
      heading: "Procurando conversas resolvidas...",
      message: `Consultando o Chatwoot (ultimos ${MAX_DAYS_SINCE_RESOLVED} dias). Pode levar cerca de 1 minuto.`,
    }),
  );

  (async () => {
    const candidates = await loadCandidates();
    completeJob(
      jobId,
      renderFeedbackListPage({ candidates, confirmUrl: "/admin/feedback-followup/start" }),
    );
  })().catch((err) => {
    logger.error("Erro ao listar candidatos a feedback", { error: err });
    failJob(jobId, (err as Error).message);
  });
}

// Passo 2: manda o pedido de feedback pra cada conversa elegivel.
export async function handleFeedbackStart(req: Request, res: Response): Promise<void> {
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
      heading: "Enviando pedidos de feedback...",
      message: "Mandando uma mensagem pra cada cliente elegivel. Isso pode levar alguns minutos.",
    }),
  );

  (async () => {
    const candidates = await loadCandidates();
    const sent: string[] = [];
    const errors: { contactName: string; error: string }[] = [];

    for (const candidate of candidates) {
      try {
        await sendFeedbackRequest(candidate);
        sent.push(candidate.contactName);
      } catch (err) {
        errors.push({ contactName: candidate.contactName, error: (err as Error).message });
      }
    }

    completeJob(jobId, renderFeedbackResultPage({ sent, errors }));
  })().catch((err) => {
    logger.error("Erro ao enviar pedidos de feedback", { error: err });
    failJob(jobId, (err as Error).message);
  });
}
