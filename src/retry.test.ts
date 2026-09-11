import { test } from "node:test";
import assert from "node:assert/strict";
import { withRetry, RetryableHttpError, NonRetryableHttpError } from "./retry.js";

test("withRetry: retorna o resultado direto se a primeira tentativa funciona", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      return "ok";
    },
    { label: "teste", attempts: 3, baseDelayMs: 1 },
  );
  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("withRetry: tenta de novo em erro retryable e eventualmente funciona", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw new RetryableHttpError("falha transitoria");
      return "ok";
    },
    { label: "teste", attempts: 5, baseDelayMs: 1 },
  );
  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("withRetry: desiste apos esgotar as tentativas", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw new RetryableHttpError("sempre falha");
      },
      { label: "teste", attempts: 3, baseDelayMs: 1 },
    ),
  );
  assert.equal(calls, 3);
});

test("withRetry: nao tenta de novo em erro nao-retryable (ex: 4xx)", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw new NonRetryableHttpError("erro permanente (401)");
      },
      { label: "teste", attempts: 5, baseDelayMs: 1 },
    ),
  );
  assert.equal(calls, 1);
});
