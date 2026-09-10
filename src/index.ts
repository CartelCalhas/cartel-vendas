import express from "express";
import { config } from "./config.js";
import { handleChatwootWebhook } from "./webhook.js";
import {
  handleReportEstimate,
  handleReportStart,
  handleReportStatus,
  handleReportResult,
} from "./reportRoute.js";
import {
  handlePendingList,
  handlePendingStart,
} from "./pendingRepliesRoute.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/webhooks/chatwoot", (req, res) => {
  handleChatwootWebhook(req, res).catch((err) => {
    console.error("[webhook] erro inesperado:", err);
  });
});

// Usa o mesmo WEBHOOK_SECRET como chave de acesso administrativo.
app.get("/reports/customers", (req, res) => {
  handleReportEstimate(req, res).catch((err) => {
    console.error("[report] erro inesperado:", err);
    if (!res.headersSent) res.status(500).send("Erro inesperado.");
  });
});

app.get("/reports/customers/start", (req, res) => {
  handleReportStart(req, res).catch((err) => {
    console.error("[report] erro inesperado:", err);
    if (!res.headersSent) res.status(500).send("Erro inesperado.");
  });
});

app.get("/reports/customers/status/:jobId", handleReportStatus);
app.get("/reports/customers/result/:jobId", handleReportResult);

app.get("/admin/pending-replies", (req, res) => {
  handlePendingList(req, res).catch((err) => {
    console.error("[pending-replies] erro inesperado:", err);
    if (!res.headersSent) res.status(500).send("Erro inesperado.");
  });
});

app.get("/admin/pending-replies/start", (req, res) => {
  handlePendingStart(req, res).catch((err) => {
    console.error("[pending-replies] erro inesperado:", err);
    if (!res.headersSent) res.status(500).send("Erro inesperado.");
  });
});
// A pagina de espera (renderWaitingPage) sempre consulta o status/resultado
// em /reports/customers/... -- e o mesmo job store generico, entao a rotina
// de pendencias reaproveita esses dois endpoints ja registrados acima.

app.listen(config.port, () => {
  console.log(`Cartel WhatsApp bot rodando na porta ${config.port}`);
});
