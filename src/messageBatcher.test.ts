import { test } from "node:test";
import assert from "node:assert/strict";
import { enqueueMessage } from "./messageBatcher.js";

test("enqueueMessage: mensagem isolada dispara sozinha apos o debounce", async () => {
  const conversationId = 9001;
  const flushed = await new Promise<{ text: string; excludeMessageIds: number[] }>((resolve) => {
    enqueueMessage(conversationId, { id: 1, text: "oi", images: [] }, (_id, batch) => resolve(batch));
  });
  assert.equal(flushed.text, "oi");
  assert.deepEqual(flushed.excludeMessageIds, [1]);
});

test("enqueueMessage: mensagens em rajada (mesma conversa) sao juntadas numa unica chamada", async () => {
  const conversationId = 9002;
  let flushCount = 0;
  const flushed = await new Promise<{ text: string; excludeMessageIds: number[] }>((resolve) => {
    const onFlush = (_id: number, batch: { text: string; excludeMessageIds: number[] }) => {
      flushCount++;
      resolve(batch);
    };
    enqueueMessage(conversationId, { id: 1, text: "Calhas em pvc vcs trabalham?", images: [] }, onFlush);
    setTimeout(() => {
      enqueueMessage(conversationId, { id: 2, text: "1", images: [] }, onFlush);
    }, 20);
  });
  assert.equal(flushCount, 1, "deveria disparar so uma vez pra rajada inteira");
  assert.equal(flushed.text, "Calhas em pvc vcs trabalham?\n1");
  assert.deepEqual(flushed.excludeMessageIds, [1, 2]);
});

test("enqueueMessage: conversas diferentes nao se misturam", async () => {
  const results: Record<number, string> = {};
  await Promise.all([
    new Promise<void>((resolve) => {
      enqueueMessage(9003, { id: 1, text: "conversa A", images: [] }, (id, batch) => {
        results[id] = batch.text;
        resolve();
      });
    }),
    new Promise<void>((resolve) => {
      enqueueMessage(9004, { id: 2, text: "conversa B", images: [] }, (id, batch) => {
        results[id] = batch.text;
        resolve();
      });
    }),
  ]);
  assert.equal(results[9003], "conversa A");
  assert.equal(results[9004], "conversa B");
});
