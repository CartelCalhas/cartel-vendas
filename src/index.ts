import express from "express";
import { config } from "./config.js";
import { handleChatwootWebhook } from "./webhook.js";

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

app.listen(config.port, () => {
  console.log(`Cartel WhatsApp bot rodando na porta ${config.port}`);
});
