import { test } from "node:test";
import assert from "node:assert/strict";
import { markSeenOnce } from "./dedupe.js";

test("markSeenOnce: primeira vez retorna true, segunda vez (mesma chave) retorna false", () => {
  const key = `teste-${Date.now()}-${Math.random()}`;
  assert.equal(markSeenOnce(key), true);
  assert.equal(markSeenOnce(key), false);
  assert.equal(markSeenOnce(key), false);
});

test("markSeenOnce: chaves diferentes nao interferem entre si", () => {
  const a = `a-${Date.now()}-${Math.random()}`;
  const b = `b-${Date.now()}-${Math.random()}`;
  assert.equal(markSeenOnce(a), true);
  assert.equal(markSeenOnce(b), true);
});
