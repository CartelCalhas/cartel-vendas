import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPayload } from "./chatwootConversations.js";

test("extractPayload: formato { payload: [...] }", () => {
  const raw = [{ id: 1 }, { id: 2 }];
  assert.deepEqual(extractPayload({ payload: raw }), raw);
});

test("extractPayload: formato { data: { payload: [...] } }", () => {
  const raw = [{ id: 1 }];
  assert.deepEqual(extractPayload({ data: { payload: raw } }), raw);
});

test("extractPayload: array puro na raiz", () => {
  const raw = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(extractPayload(raw), raw);
});

test("extractPayload: formato desconhecido retorna lista vazia em vez de lancar erro", () => {
  assert.deepEqual(extractPayload({ algumaCoisaInesperada: true }), []);
  assert.deepEqual(extractPayload(null), []);
  assert.deepEqual(extractPayload(undefined), []);
});
