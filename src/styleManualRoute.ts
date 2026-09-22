import type { Request, Response } from "express";
import { config } from "./config.js";
import {
  listConversationsSince,
  type ListConversationsResult,
} from "./chatwootConversations.js";
import { buildCorpus, type CorpusResult } from "./report/corpus.js";
import {
  analyzeStyleManual,
  estimateInputTokens,
} from "./report/styleManualAnalyze.js";
import {
  renderEstimatePage,
  renderStyleManualPage,
  renderWaitingPage,
  renderErrorPage,
} from "./report/render.js";
import { createJob, completeJob, failJob } from "./report/jobs.js";

// Cobre os ~6 meses do relatorio original mais o que se passou desde entao,
// com folga -- assim o manual sempre inclui as conversas mais recentes junto
// com o periodo ja coberto antes, sem deixar um buraco no meio.
const DEFAULT_MONTHS = 7;

function checkSecret(req: Request, res: Response): boolean {
  if (req.query.secret !== config.webhookSecret) {
    res.status(401).send("Acesso negado.");
    return false;
  }
  return true;
}

function monthsFromQuery(req: Request): number {
  return Math.max(1, Math.min(24, Number(req.query.months ?? DEFAULT_MONTHS)));
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

// Passo 1: estimativa de custo, mesma logica do relatorio de clientes --
// so muda o texto e o endpoint de confirmacao.
export async function handleStyleManualEstimate(req: Request, res: Response): Promise<void> {
  if (!checkSecret(req, res)) return;
  const months = monthsFromQuery(req);
  const secret = String(req.query.secret);
  const startUrl = relativeUrlWithParams(req, "/reports/style-manual/start", {});

  const jobId = createJob();
  res.status(200).send(
    renderWaitingPage({
      jobId,
      secret,
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
      renderEstimatePage({
        corpus,
        truncated: list.truncated,
        months,
        inputTokens,
        confirmUrl: startUrl,
        heading: `Manual de Atendimento e Estilo -- ultimos ${months} meses`,
        lede: "Antes de gerar o manual final (que usa credito da conta Claude), confira o tamanho dos dados encontrados e o custo estimado.",
        confirmLabel: "Gerar manual completo →",
        pageTitle: "Estimativa do manual",
      }),
    );
  })().catch((err) => {
    console.error("[style-manual] erro na estimativa:", err);
    failJob(jobId, (err as Error).message);
  });
}

// Passo 2: dispara a analise (paga) em segundo plano.
export async function handleStyleManualStart(req: Request, res: Response): Promise<void> {
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
      renderWaitingPage({
        jobId,
        secret,
        heading: "Gerando o manual...",
        message: `Analisando ${corpus.totalConversations} conversas com a Claude. Isso pode levar de 1 a 3 minutos -- pode deixar esta aba aberta, ela atualiza sozinha.`,
      }),
    );

    analyzeStyleManual(corpus.text)
      .then(({ manual, usage }) => {
        const html = renderStyleManualPage({ corpus, truncated: list.truncated, months, manual, usage });
        completeJob(jobId, html);
      })
      .catch((err) => {
        console.error("[style-manual] erro na analise:", err);
        failJob(jobId, (err as Error).message);
      });
  } catch (err) {
    console.error("[style-manual] erro ao iniciar:", err);
    res.status(500).send(renderErrorPage(`Erro ao iniciar o manual: ${(err as Error).message}`));
  }
}
// A pagina de espera (renderWaitingPage) sempre consulta o status/resultado
// em /reports/customers/... -- e o mesmo job store generico usado pelo
// relatorio de clientes, entao este fluxo reaproveita aqueles dois endpoints
// ja registrados em index.ts em vez de duplicar status/result aqui.
