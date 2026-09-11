import express from "express";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { logger, getRecentErrors } from "./logger.js";
import { requireAdminAuth, requireSameOriginForStateChange } from "./security.js";
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
import { handlePromptShow, handlePromptSave, handlePromptReset } from "./promptRoute.js";
import { renderErrorsPage } from "./report/render.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

// Limites generosos o bastante pro uso normal (Chatwoot + um punhado de
// admins), mas que freiam flood/brute-force: o webhook e publico (protegido
// so pelo secret), as rotas admin tem Basic Auth mas ainda vale nao deixar
// tentativa de senha sem limite.
const webhookLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
const adminLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

function asyncRoute(handler: (req: express.Request, res: express.Response) => Promise<void>) {
  return (req: express.Request, res: express.Response) => {
    handler(req, res).catch((err) => {
      logger.error("Erro inesperado na rota", { path: req.path, error: err });
      if (!res.headersSent) res.status(500).send("Erro inesperado.");
    });
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/webhooks/chatwoot", webhookLimiter, (req, res) => {
  handleChatwootWebhook(req, res).catch((err) => {
    logger.error("Erro inesperado no webhook", { error: err });
  });
});

// Todas as rotas abaixo sao administrativas: autenticadas com HTTP Basic
// Auth (ADMIN_SECRET) em vez de um `?secret=` na URL, e limitadas em taxa
// para dificultar tentativa de adivinhar a senha.
const admin = express.Router();
admin.use(adminLimiter, requireAdminAuth);

admin.get("/reports/customers", asyncRoute(handleReportEstimate));
admin.post("/reports/customers/start", requireSameOriginForStateChange, asyncRoute(handleReportStart));
admin.get("/reports/customers/status/:jobId", handleReportStatus);
admin.get("/reports/customers/result/:jobId", handleReportResult);

admin.get("/admin/pending-replies", asyncRoute(handlePendingList));
admin.post("/admin/pending-replies/start", requireSameOriginForStateChange, asyncRoute(handlePendingStart));

admin.get("/admin/prompt", handlePromptShow);
admin.post("/admin/prompt", requireSameOriginForStateChange, handlePromptSave);
admin.post("/admin/prompt/reset", requireSameOriginForStateChange, handlePromptReset);

admin.get("/admin/errors", (_req, res) => {
  res.status(200).send(renderErrorsPage(getRecentErrors()));
});

app.use(admin);

app.listen(config.port, () => {
  logger.info(`Cartel WhatsApp bot rodando na porta ${config.port}`);
});
