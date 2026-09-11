import { test } from "node:test";
import assert from "node:assert/strict";
import { isIncoming, isOutgoing, lastPendingMessage, type ChatwootMessage } from "./chatwoot.js";

test("isIncoming/isOutgoing: aceitam tanto o formato numerico quanto o de string", () => {
  assert.equal(isIncoming(0), true);
  assert.equal(isIncoming("incoming"), true);
  assert.equal(isIncoming(1), false);
  assert.equal(isOutgoing(1), true);
  assert.equal(isOutgoing("outgoing"), true);
  assert.equal(isOutgoing(0), false);
});

function msg(overrides: Partial<ChatwootMessage> & { id: number; created_at: number }): ChatwootMessage {
  return { content: "oi", message_type: "incoming", ...overrides };
}

test("lastPendingMessage: retorna a mensagem quando a ultima e do cliente", () => {
  const messages = [
    msg({ id: 1, created_at: 100, message_type: "outgoing", content: "resposta antiga" }),
    msg({ id: 2, created_at: 200, message_type: "incoming", content: "cliente pergunta de novo" }),
  ];
  assert.equal(lastPendingMessage(messages)?.id, 2);
});

test("lastPendingMessage: retorna null quando a ultima e do time/robo (ja respondida)", () => {
  const messages = [
    msg({ id: 1, created_at: 100, message_type: "incoming", content: "pergunta" }),
    msg({ id: 2, created_at: 200, message_type: "outgoing", content: "resposta" }),
  ];
  assert.equal(lastPendingMessage(messages), null);
});

test("lastPendingMessage: ignora mensagens privadas e sem conteudo de texto", () => {
  const messages = [
    msg({ id: 1, created_at: 300, message_type: "incoming", private: true, content: "nota interna" }),
    msg({ id: 2, created_at: 200, message_type: "incoming", content_type: "image", content: "" }),
    msg({ id: 3, created_at: 100, message_type: "outgoing", content: "resposta anterior" }),
  ];
  assert.equal(lastPendingMessage(messages), null);
});

test("lastPendingMessage: lista vazia retorna null", () => {
  assert.equal(lastPendingMessage([]), null);
});
