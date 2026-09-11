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
import { logger } from "./logger.js";

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

// Passo 1: busca as conversas no Chatwoot (pode ser lenta com o servico
// "dormindo" no plano Free) e monta a pagina de estimativa de custo, sem
// gastar credito da API ainda. Tambem roda em segundo plano com uma pagina
// de espera, pelo mesmo motivo do passo 2: evitar que o pedido HTTP fique
// aberto tempo demais e algum proxy no caminho derrube a conexao (502).
export async function handleReportEstimate(req: Request, res: Response): Promise<void> {
  const months = monthsFromQuery(req);
  const startUrl = `/reports/customers/start?months=${months}`;

  const jobId = createJob();
  res.status(200).send(
    renderWaitingPage({
      jobId,
      heading: "Buscando suas conversas...",
      message: "Consultando o Chatwoot. Se o robo estava parado, isso pode levar cerca de 1 minuto para acordar -- pode deixar esta aba aberta.",
    }),
  );

  (async () => {
    const loaded = await loadCorpus(months);
    if (!loaded) {
      completeJob(jobId, renderErrorPage(`Nenhuma conversa encontrada nos ultimos ${months} meses.`));
      return;
    }
    const { list, corpus } = loaded;
    if (!corpus.text) {
      completeJob(jobId, renderErrorPage("As conversas encontradas nao tinham mensagens de texto para analisar."));
      return;
    }
    const inputTokens = await estimateInputTokens(corpus.text);
    completeJob(
      jobId,
      renderEstimatePage({ corpus, truncated: list.truncated, months, inputTokens, confirmUrl: startUrl }),
    );
  })().catch((err) => {
    logger.error("Erro na estimativa do relatorio", { error: err });
    failJob(jobId, (err as Error).message);
  });
}

// Passo 2: dispara a analise (paga) em segundo plano e devolve uma pagina
// de espera que fica consultando o status sozinha -- evita que o pedido
// HTTP fique aberto por minutos e estoure algum timeout no caminho.
export async function handleReportStart(req: Request, res: Response): Promise<void> {
  const months = monthsFromQuery(req);

  try {
    const loaded = await loadCorpus(months);
    if (!loaded || !loaded.corpus.text) {
      res.status(200).send(renderErrorPage("Nao foi possivel montar os dados das conversas para analisar."));
      return;
    }
    const { list, corpus } = loaded;

    const jobId = createJob();
    res.status(200).send(
      renderWaitingPage({
        jobId,
        heading: "Gerando o relatorio...",
        message: `Analisando ${corpus.totalConversations} conversas com a Claude. Isso pode levar de 1 a 3 minutos -- pode deixar esta aba aberta, ela atualiza sozinha.`,
      }),
    );

    analyzeConversations(corpus.text)
      .then(({ report, usage }) => {
        const html = renderReportPage({ corpus, truncated: list.truncated, months, report, usage });
        completeJob(jobId, html);
      })
      .catch((err) => {
        logger.error("Erro na analise do relatorio", { error: err });
        failJob(jobId, (err as Error).message);
      });
  } catch (err) {
    logger.error("Erro ao iniciar o relatorio", { error: err });
    res.status(500).send(renderErrorPage(`Erro ao iniciar o relatorio: ${(err as Error).message}`));
  }
}

export function handleReportStatus(req: Request, res: Response): void {
  const job = getJob(String(req.params.jobId));
  if (!job) {
    res.status(404).json({ status: "error", error: "relatorio nao encontrado (pode ter expirado)" });
    return;
  }
  res.status(200).json({ status: job.status, error: job.error });
}

export function handleReportResult(req: Request, res: Response): void {
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
