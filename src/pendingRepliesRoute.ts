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

const MAX_DAYS = 60;
const MAX_CONVERSATIONS = 200;

function checkSecret(req: Request, res: Response): boolean {
  if (req.query.secret !== config.webhookSecret) {
    res.status(401).send("Acesso negado.");
    return false;
  }
  return true;
}

function relativeUrlWithParams(
  req: Request,
  path: string,
  extra: Record<string, string>,
): string {
  const url = new URL(path, "http://internal");
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") url.searchParams.set(key, value);
  }
  for (const [key, value] of Object.entries(extra)) {
    url.searchParams.set(key, value);
  }
  return url.pathname + url.search;
}

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
  if (!checkSecret(req, res)) return;

  const jobId = createJob();
  res.status(200).send(
    renderWaitingPage({
      jobId,
      secret: String(req.query.secret),
      heading: "Procurando conversas sem resposta...",
      message: `Consultando o Chatwoot (ultimos ${MAX_DAYS} dias). Pode levar cerca de 1 minuto.`,
    }),
  );

  (async () => {
    const pending = await loadPending();
    const confirmUrl = relativeUrlWithParams(req, "/admin/pending-replies/start", {});
    completeJob(jobId, renderPendingListPage({ pending, confirmUrl }));
  })().catch((err) => {
    console.error("[pending-replies] erro ao listar:", err);
    failJob(jobId, (err as Error).message);
  });
}

// Passo 2: gera e manda a resposta da Claude para cada conversa pendente.
export async function handlePendingStart(req: Request, res: Response): Promise<void> {
  if (!checkSecret(req, res)) return;
  const secret = String(req.query.secret);

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
      secret,
      heading: "Respondendo conversas pendentes...",
      message: "Gerando e enviando uma resposta para cada conversa. Isso pode levar alguns minutos.",
    }),
  );

  (async () => {
    const pending = await loadPending();
    const answered: string[] = [];
    const errors: { contactName: string; error: string }[] = [];

    for (const conv of pending) {
      try {
        await answerConversation(
          conv.conversationId,
          conv.lastMessageContent,
          conv.lastMessageId,
        );
        answered.push(conv.contactName);
      } catch (err) {
        errors.push({ contactName: conv.contactName, error: (err as Error).message });
      }
    }

    completeJob(jobId, renderPendingResultPage({ answered, errors }));
  })().catch((err) => {
    console.error("[pending-replies] erro ao responder:", err);
    failJob(jobId, (err as Error).message);
  });
}
