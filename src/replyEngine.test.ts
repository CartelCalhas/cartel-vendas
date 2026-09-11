import { test } from "node:test";
import assert from "node:assert/strict";
import { toChatTurns } from "./replyEngine.js";
import type { ChatwootMessage } from "./chatwoot.js";

function msg(overrides: Partial<ChatwootMessage> & { id: number }): ChatwootMessage {
  return {
    content: "oi",
    message_type: "incoming",
    created_at: overrides.id,
    ...overrides,
  };
}

test("toChatTurns: converte incoming/outgoing para user/assistant, em ordem cronologica", () => {
  const messages: ChatwootMessage[] = [
    msg({ id: 2, message_type: "outgoing", content: "resposta", created_at: 200 }),
    msg({ id: 1, message_type: "incoming", content: "pergunta", created_at: 100 }),
  ];
  const turns = toChatTurns(messages, -1);
  assert.deepEqual(turns, [
    { role: "user", content: "pergunta" },
    { role: "assistant", content: "resposta" },
  ]);
});

test("toChatTurns: exclui a mensagem que disparou o webhook (ja vai como userMessage)", () => {
  const messages: ChatwootMessage[] = [
    msg({ id: 1, content: "historico", created_at: 100 }),
    msg({ id: 2, content: "mensagem atual", created_at: 200 }),
  ];
  const turns = toChatTurns(messages, 2);
  assert.deepEqual(turns, [{ role: "user", content: "historico" }]);
});

test("toChatTurns: ignora mensagens privadas (notas internas)", () => {
  const messages: ChatwootMessage[] = [
    msg({ id: 1, content: "nota interna", private: true, created_at: 100 }),
    msg({ id: 2, content: "publica", created_at: 200 }),
  ];
  const turns = toChatTurns(messages, -1);
  assert.deepEqual(turns, [{ role: "user", content: "publica" }]);
});

test("toChatTurns: ignora mensagens sem conteudo de texto (ex: so anexo)", () => {
  const messages: ChatwootMessage[] = [
    msg({ id: 1, content: null, created_at: 100 }),
    msg({ id: 2, content: "texto", content_type: "image", created_at: 200 }),
    msg({ id: 3, content: "texto normal", created_at: 300 }),
  ];
  const turns = toChatTurns(messages, -1);
  assert.deepEqual(turns, [{ role: "user", content: "texto normal" }]);
});

test("toChatTurns: respeita o limite de historico (config.historyLimit), mantendo as mais recentes", () => {
  const messages: ChatwootMessage[] = Array.from({ length: 30 }, (_, i) =>
    msg({ id: i, content: `msg-${i}`, created_at: i }),
  );
  const turns = toChatTurns(messages, -1);
  assert.equal(turns.length, 15); // default de HISTORY_LIMIT
  assert.equal(turns[turns.length - 1]?.content, "msg-29");
});
