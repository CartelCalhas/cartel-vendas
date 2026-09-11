import { test } from "node:test";
import assert from "node:assert/strict";
import { safeEqual } from "./security.js";

test("safeEqual: strings iguais retornam true", () => {
  assert.equal(safeEqual("segredo123", "segredo123"), true);
});

test("safeEqual: strings diferentes (mesmo tamanho) retornam false", () => {
  assert.equal(safeEqual("segredo123", "segredo456"), false);
});

test("safeEqual: strings de tamanhos diferentes retornam false", () => {
  assert.equal(safeEqual("curto", "muito-mais-longo-que-curto"), false);
});

test("safeEqual: strings vazias sao iguais entre si", () => {
  assert.equal(safeEqual("", ""), true);
});
