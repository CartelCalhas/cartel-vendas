import { test } from "node:test";
import assert from "node:assert/strict";
import { withConcurrency } from "./concurrency.js";

test("withConcurrency: processa todos os itens e preserva a ordem dos resultados", async () => {
  const items = [5, 1, 4, 2, 3];
  const results = await withConcurrency(items, 2, async (n) => {
    await new Promise((r) => setTimeout(r, n));
    return n * 10;
  });
  assert.deepEqual(results, [50, 10, 40, 20, 30]);
});

test("withConcurrency: nunca roda mais que `limit` tarefas ao mesmo tempo", async () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  let inFlight = 0;
  let maxInFlight = 0;
  await withConcurrency(items, 3, async (n) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return n;
  });
  assert.ok(maxInFlight <= 3, `esperado <= 3 em paralelo, teve ${maxInFlight}`);
});

test("withConcurrency: lista vazia retorna vazio sem erro", async () => {
  const results = await withConcurrency([], 4, async (n) => n);
  assert.deepEqual(results, []);
});
