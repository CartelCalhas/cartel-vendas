import type { Request, Response } from "express";
import { config } from "./config.js";
import {
  listConversationsSince,
  type ListConversationsResult,
} from "./chatwootConversations.js";
import { buildCorpus, type CorpusResult } from "./report/corpus.js";
import { analyzeConversations, estimateInputTokens } from "./report/analyze.js";
import {
  renderEstimatePage,
  renderReportPage,
  renderWaitingPage,
  renderErrorPage,
} from "./report/render.js";
import { createJob, getJob, completeJob, failJob } from "./report/jobs.js";

function checkSecret(req: Request, res: Response): boolean {
  if (req.query.secret !== config.webhookSecret) {
    res.status(401).send("Acesso negado.");
    return false;
  }
  return true;
}

function monthsFromQuery(req: Request): number {
  return Math.max(1, Math.min(24, Number(req.query.months ?? 6)));
}

async function loadCorpus(
  months: number,
): Promise<{ list: ListConversationsResult; corpus: CorpusResult } | null> {
  const cutoffSeconds = Math.floor(Date.now() / 1000) - months * 30 * 24 * 60 * 60;
  const list = await listConversationsSince(cutoffSeconds, {
    inboxId: config.chatwootInboxId,
  });
  if (list.conversations.length === 0) return null;
  const corpus = await buildCorpus(list.conversations);
  return { list, corpus };
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

// Passo 1: mostra quantas conversas foram encontradas e uma estimativa de
// custo, sem gastar credito da API ainda.
export async function handleReportEstimate(req: Request, res: Response): Promise<void> {
  if (!checkSecret(req, res)) return;
  const months = monthsFromQuery(req);

  try {
    const loaded = await loadCorpus(months);
    if (!loaded) {
      res.status(200).send(renderErrorPage(`Nenhuma conversa encontrada nos ultimos ${months} meses.`));
      return;
    }
    const { list, corpus } = loaded;
    if (!corpus.text) {
      res.status(200).send(renderErrorPage("As conversas encontradas nao tinham mensagens de texto para analisar."));
      return;
    }

    const inputTokens = await estimateInputTokens(corpus.text);
    const startUrl = relativeUrlWithParams(req, "/reports/customers/start", {});
    res.status(200).send(
      renderEstimatePage({ corpus, truncated: list.truncated, months, inputTokens, confirmUrl: startUrl }),
    );
  } catch (err) {
    console.error("[report] erro na estimativa:", err);
    res.status(500).send(renderErrorPage(`Erro ao consultar as conversas: ${(err as Error).message}`));
  }
}

// Passo 2: dispara a analise (paga) em segundo plano e devolve uma pagina
// de espera que fica consultando o status sozinha -- evita que o pedido
// HTTP fique aberto por minutos e estoure algum timeout no caminho.
export async function handleReportStart(req: Request, res: Response): Promise<void> {
  if (!checkSecret(req, res)) return;
  const months = monthsFromQuery(req);
  const secret = String(req.query.secret);

  try {
    const loaded = await loadCorpus(months);
    if (!loaded || !loaded.corpus.text) {
      res.status(200).send(renderErrorPage("Nao foi possivel montar os dados das conversas para analisar."));
      return;
    }
    const { list, corpus } = loaded;

    const jobId = createJob();
    res.status(200).send(
      renderWaitingPage({ jobId, secret, totalConversations: corpus.totalConversations }),
    );

    analyzeConversations(corpus.text)
      .then(({ report, usage }) => {
        const html = renderReportPage({ corpus, truncated: list.truncated, months, report, usage });
        completeJob(jobId, html);
      })
      .catch((err) => {
        console.error("[report] erro na analise:", err);
        failJob(jobId, (err as Error).message);
      });
  } catch (err) {
    console.error("[report] erro ao iniciar:", err);
    res.status(500).send(renderErrorPage(`Erro ao iniciar o relatorio: ${(err as Error).message}`));
  }
}

export function handleReportStatus(req: Request, res: Response): void {
  if (req.query.secret !== config.webhookSecret) {
    res.status(401).json({ status: "error", error: "acesso negado" });
    return;
  }
  const job = getJob(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ status: "error", error: "relatorio nao encontrado (pode ter expirado)" });
    return;
  }
  res.status(200).json({ status: job.status, error: job.error });
}

export function handleReportResult(req: Request, res: Response): void {
  if (!checkSecret(req, res)) return;
  const job = getJob(String(req.params.jobId));
  if (!job || job.status === "processing") {
    res.status(200).send(renderErrorPage("Esse relatorio ainda esta processando ou expirou. Gere um novo."));
    return;
  }
  if (job.status === "error" || !job.html) {
    res.status(200).send(renderErrorPage(`Erro ao gerar relatorio: ${job.error ?? "erro desconhecido"}`));
    return;
  }
  res.status(200).send(job.html);
}
