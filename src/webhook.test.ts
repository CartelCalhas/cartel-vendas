import { test } from "node:test";
import assert from "node:assert/strict";
import { WebhookPayloadSchema } from "./webhook.js";

test("WebhookPayloadSchema: aceita um payload tipico de mensagem de texto", () => {
  const result = WebhookPayloadSchema.safeParse({
    event: "message_created",
    id: 123,
    content: "oi, quanto custa o forro de PVC?",
    message_type: "incoming",
    conversation: { id: 45, inbox_id: 1 },
  });
  assert.equal(result.success, true);
});

test("WebhookPayloadSchema: aceita anexos de imagem", () => {
  const result = WebhookPayloadSchema.safeParse({
    event: "message_created",
    id: 124,
    content: "",
    message_type: 0,
    conversation: { id: 45 },
    attachments: [{ data_url: "https://chat.branorai.com/files/foto.jpg", file_type: "image" }],
  });
  assert.equal(result.success, true);
});

test("WebhookPayloadSchema: rejeita payload em formato claramente invalido", () => {
  const result = WebhookPayloadSchema.safeParse({
    conversation: "isso deveria ser um objeto, nao string",
  });
  assert.equal(result.success, false);
});

test("WebhookPayloadSchema: aceita payload minimo (so os campos opcionais presentes)", () => {
  const result = WebhookPayloadSchema.safeParse({});
  assert.equal(result.success, true);
});
