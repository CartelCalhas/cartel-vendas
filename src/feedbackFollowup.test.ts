import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFeedbackMessage,
  isWithinFeedbackWindow,
  MIN_DAYS_SINCE_RESOLVED,
  MAX_DAYS_SINCE_RESOLVED,
} from "./feedbackFollowup.js";

const DAY = 24 * 60 * 60;

test("buildFeedbackMessage: usa o primeiro nome quando disponivel", () => {
  const msg = buildFeedbackMessage("Maria Silva");
  assert.match(msg, /^Oi, Maria!/);
});

test('buildFeedbackMessage: cai pro "Oi!" generico sem nome de contato', () => {
  const msg = buildFeedbackMessage("Cliente sem nome");
  assert.match(msg, /^Oi! /);
});

test("buildFeedbackMessage: sempre pergunta como foi e o que pode melhorar", () => {
  const msg = buildFeedbackMessage("Joao");
  assert.match(msg, /experiencia/);
  assert.match(msg, /melhorar/);
});

test(`isWithinFeedbackWindow: false pra conversa resolvida ha menos de ${MIN_DAYS_SINCE_RESOLVED} dias`, () => {
  const now = 1_000_000;
  const resolvedOntem = now - 1 * DAY;
  assert.equal(isWithinFeedbackWindow(resolvedOntem, now), false);
});

test(`isWithinFeedbackWindow: true pra conversa resolvida ha ${MIN_DAYS_SINCE_RESOLVED} dias exatos`, () => {
  const now = 1_000_000;
  const resolved = now - MIN_DAYS_SINCE_RESOLVED * DAY;
  assert.equal(isWithinFeedbackWindow(resolved, now), true);
});

test(`isWithinFeedbackWindow: false pra conversa resolvida ha mais de ${MAX_DAYS_SINCE_RESOLVED} dias`, () => {
  const now = 1_000_000;
  const resolvedFaz90Dias = now - 90 * DAY;
  assert.equal(isWithinFeedbackWindow(resolvedFaz90Dias, now), false);
});

test("isWithinFeedbackWindow: true no meio da janela (ex: 10 dias)", () => {
  const now = 1_000_000;
  const resolvedFaz10Dias = now - 10 * DAY;
  assert.equal(isWithinFeedbackWindow(resolvedFaz10Dias, now), true);
});
