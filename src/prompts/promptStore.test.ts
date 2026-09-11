import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getEffectiveSalesPrompt,
  getDefaultSalesPrompt,
  isUsingPromptOverride,
  setSalesPromptOverride,
  resetSalesPromptOverride,
} from "./promptStore.js";

test.after(() => {
  resetSalesPromptOverride();
});

test("promptStore: sem override, retorna o prompt padrao do codigo", () => {
  resetSalesPromptOverride();
  assert.equal(isUsingPromptOverride(), false);
  assert.equal(getEffectiveSalesPrompt(), getDefaultSalesPrompt());
});

test("promptStore: setSalesPromptOverride troca o texto efetivo", () => {
  setSalesPromptOverride("prompt de teste, precos atualizados");
  assert.equal(isUsingPromptOverride(), true);
  assert.equal(getEffectiveSalesPrompt(), "prompt de teste, precos atualizados");
});

test("promptStore: resetSalesPromptOverride volta pro padrao do codigo", () => {
  setSalesPromptOverride("qualquer coisa");
  resetSalesPromptOverride();
  assert.equal(isUsingPromptOverride(), false);
  assert.equal(getEffectiveSalesPrompt(), getDefaultSalesPrompt());
});
