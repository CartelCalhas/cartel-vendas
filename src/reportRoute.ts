import type { Request, Response } from "express";
import { config } from "./config.js";
import { listConversationsSince } from "./chatwootConversations.js";
import { buildCorpus } from "./report/corpus.js";
import { analyzeConversations, estimateInputTokens } from "./report/analyze.js";
import {
  renderEstimatePage,
  renderReportPage,
  renderErrorPage,
} from "./report/render.js";

function relativeUrlWithParams(
  req: Request,
  extra: Record<string, string>,
): string {
  const url = new URL(req.originalUrl, "http://internal");
  for (const [key, value] of Object.entries(extra)) {
    url.searchParams.set(key, value);
  }
  return url.pathname + url.search;
}

export async function handleCustomerReport(
  req: Request,
  res: Response,
): Promise<void> {
  if (req.query.secret !== config.webhookSecret) {
    res.status(401).send("Acesso negado.");
    return;
  }

  const months = Math.max(1, Math.min(24, Number(req.query.months ?? 6)));
  const confirmed = req.query.confirm === "1";
  const cutoffSeconds =
    Math.floor(Date.now() / 1000) - months * 30 * 24 * 60 * 60;

  try {
    const { conversations, truncated } = await listConversationsSince(
      cutoffSeconds,
      { inboxId: config.chatwootInboxId },
    );

    if (conversations.length === 0) {
      res
        .status(200)
        .send(
          renderErrorPage(
            `Nenhuma conversa encontrada nos ultimos ${months} meses.`,
          ),
        );
      return;
    }

    const corpus = await buildCorpus(conversations);

    if (!corpus.text) {
      res
        .status(200)
        .send(
          renderErrorPage(
            "As conversas encontradas nao tinham mensagens de texto para analisar.",
          ),
        );
      return;
    }

    if (!confirmed) {
      const inputTokens = await estimateInputTokens(corpus.text);
      const confirmUrl = relativeUrlWithParams(req, { confirm: "1" });
      res
        .status(200)
        .send(
          renderEstimatePage({ corpus, truncated, months, inputTokens, confirmUrl }),
        );
      return;
    }

    const { report, usage } = await analyzeConversations(corpus.text);
    res.status(200).send(renderReportPage({ corpus, truncated, months, report, usage }));
  } catch (err) {
    console.error("[report] erro:", err);
    res
      .status(500)
      .send(renderErrorPage(`Erro ao gerar relatorio: ${(err as Error).message}`));
  }
}
