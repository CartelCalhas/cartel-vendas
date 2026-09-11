import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPieceSvg, renderPiecePng } from "./drawing.js";

test("buildPieceSvg: mostra o total correto (soma dos segmentos)", () => {
  const svg = buildPieceSvg({ titulo: "peca teste", segmentosMm: [25, 30, 30, 25] });
  assert.match(svg, /total 110mm/);
});

test("buildPieceSvg: escapa caracteres especiais no titulo (evita XML invalido)", () => {
  const svg = buildPieceSvg({ titulo: 'Peça <5> & "L"', segmentosMm: [10, 10] });
  assert.ok(!svg.includes("<5>"));
  assert.match(svg, /&lt;5&gt;/);
  assert.match(svg, /&amp;/);
  assert.match(svg, /&quot;L&quot;/);
});

test("buildPieceSvg: um segmento de 0mm nao quebra o calculo de escala", () => {
  const svg = buildPieceSvg({ titulo: "vazio", segmentosMm: [] });
  assert.match(svg, /total 1mm/); // soma de [] cai no fallback `|| 1`
});

test("renderPiecePng: gera um PNG valido (assinatura de arquivo correta)", async () => {
  const buffer = await renderPiecePng({ titulo: "58 pcs 4.400mm", segmentosMm: [25, 30, 30, 30, 25] });
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(buffer.subarray(0, 8).equals(pngSignature));
});

test("buildPieceSvg: sem campos extras, so mostra desenvolvimento e o rodape de aprovacao", () => {
  const svg = buildPieceSvg({ titulo: "peca simples", segmentosMm: [30, 30] });
  assert.match(svg, /Desenvolvimento:<\/tspan> 60mm \(6\.0cm\)/);
  assert.match(svg, /APROVADO/);
  assert.ok(!svg.includes("Modelo:"));
  assert.ok(!svg.includes("Bocais:"));
});

test("buildPieceSvg: ficha de confirmacao mostra so os campos informados", () => {
  const svg = buildPieceSvg({
    titulo: "Calha de Beiral Tradicional",
    segmentosMm: [15, 13, 9, 1.5, 1.5],
    modelo: "Calha de Beiral Tradicional",
    comprimentoM: 8,
    quantidade: 2,
    bocais: "1 bocal lateral",
    tampas: 2,
    suporte: "Colonial",
  });
  assert.match(svg, /Modelo:<\/tspan> Calha de Beiral Tradicional/);
  assert.match(svg, /Comprimento solicitado:<\/tspan> 8m/);
  assert.match(svg, /Quantidade:<\/tspan> 2 peca\(s\)/);
  assert.match(svg, /Bocais:<\/tspan> 1 bocal lateral/);
  assert.match(svg, /Tampas:<\/tspan> 2/);
  assert.match(svg, /Suporte:<\/tspan> Colonial/);
  assert.ok(!svg.includes("Observacoes:"));
});

test("buildPieceSvg: escapa valores dos campos extras da ficha", () => {
  const svg = buildPieceSvg({
    titulo: "peca",
    segmentosMm: [10],
    observacoes: 'nao cortar <sem> "aprovacao"',
  });
  assert.ok(!svg.includes("<sem>"));
  assert.match(svg, /&lt;sem&gt;/);
});
