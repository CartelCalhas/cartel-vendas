import sharp from "sharp";

export interface PieceSpec {
  titulo: string;
  segmentosMm: number[];
  // Campos opcionais que viram a ficha de confirmacao abaixo do desenho --
  // so aparecem os que forem informados. O objetivo e o cliente conseguir
  // conferir tudo numa unica imagem antes de responder "APROVADO".
  modelo?: string;
  comprimentoM?: number;
  quantidade?: number;
  bocais?: string;
  tampas?: number;
  suporte?: string;
  observacoes?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface InfoRow {
  label: string;
  value: string;
}

function buildInfoRows(spec: PieceSpec, totalMm: number): InfoRow[] {
  const rows: InfoRow[] = [
    { label: "Desenvolvimento", value: `${totalMm}mm (${(totalMm / 10).toFixed(1)}cm)` },
  ];
  if (spec.modelo) rows.push({ label: "Modelo", value: spec.modelo });
  if (spec.comprimentoM !== undefined) {
    rows.push({ label: "Comprimento solicitado", value: `${spec.comprimentoM}m` });
  }
  if (spec.quantidade !== undefined) {
    rows.push({ label: "Quantidade", value: `${spec.quantidade} peca(s)` });
  }
  if (spec.bocais) rows.push({ label: "Bocais", value: spec.bocais });
  if (spec.tampas !== undefined) rows.push({ label: "Tampas", value: `${spec.tampas}` });
  if (spec.suporte) rows.push({ label: "Suporte", value: spec.suporte });
  if (spec.observacoes) rows.push({ label: "Observacoes", value: spec.observacoes });
  return rows;
}

const FOOTER_TEXT = 'Confira os dados acima e responda "APROVADO" para seguirmos com a fabricacao.';

// Desenha uma ficha visual de confirmacao da peca: um "padrao plano" (tira
// dimensionada mostrando cada dobra/segmento em sequencia, do jeito que
// aparece nos desenhos a mao da equipe) seguido de um cartao com os dados do
// pedido (modelo, comprimento, quantidade, bocais, tampas, suporte). Nao
// tenta representar os angulos/direcoes reais das dobras -- so confirma que
// a soma dos segmentos bate com o que o cliente pediu, que e o que importa
// para aprovar antes de cortar.
export function buildPieceSvg(spec: PieceSpec): string {
  const { titulo, segmentosMm } = spec;
  const width = 900;
  const marginX = 60;
  const marginTop = 110;
  const stripHeight = 70;
  const dimGap = 30;
  const usableWidth = width - marginX * 2;
  const total = segmentosMm.reduce((a, b) => a + b, 0) || 1;
  const scale = usableWidth / total;
  const stripTop = marginTop + dimGap;
  const stripBottom = stripTop + stripHeight;

  let x = marginX;
  const ticks: string[] = [];
  const labels: string[] = [];
  const boundaries = [x];

  segmentosMm.forEach((seg, i) => {
    const segWidth = seg * scale;
    const nx = x + segWidth;
    // Dobras pequenas (ex: 15mm nas pontas de uma calha) ficam com pouco
    // espaco pro rotulo -- alterna a altura do texto pra nao sobrepor o
    // vizinho quando os segmentos sao estreitos.
    const labelY = stripBottom + 26 + (i % 2) * 20;
    labels.push(
      `<text x="${(x + nx) / 2}" y="${labelY}" font-size="16" text-anchor="middle" font-family="monospace">${seg}mm</text>`,
    );
    x = nx;
    boundaries.push(x);
  });

  for (const bx of boundaries) {
    ticks.push(
      `<line x1="${bx}" y1="${stripTop}" x2="${bx}" y2="${stripBottom}" stroke="black" stroke-width="1.5"/>`,
    );
  }

  const dimY = marginTop;
  const dimension = `
    <line x1="${marginX}" y1="${dimY}" x2="${marginX + usableWidth}" y2="${dimY}" stroke="black" stroke-width="1"/>
    <line x1="${marginX}" y1="${dimY - 6}" x2="${marginX}" y2="${dimY + 6}" stroke="black" stroke-width="1"/>
    <line x1="${marginX + usableWidth}" y1="${dimY - 6}" x2="${marginX + usableWidth}" y2="${dimY + 6}" stroke="black" stroke-width="1"/>
    <text x="${marginX + usableWidth / 2}" y="${dimY - 10}" font-size="16" text-anchor="middle" font-family="monospace">total ${total}mm</text>
  `;

  const rows = buildInfoRows(spec, total);
  const rowHeight = 26;
  const cardPaddingTop = 42;
  const cardPaddingBottom = 18;
  const cardTop = stripBottom + 70;
  const cardHeight = cardPaddingTop + rows.length * rowHeight + cardPaddingBottom;
  const cardRows = rows
    .map(
      (row, i) => `
    <text x="${marginX + 20}" y="${cardTop + cardPaddingTop + i * rowHeight}" font-size="15" font-family="sans-serif">
      <tspan font-weight="bold">${escapeXml(row.label)}:</tspan> ${escapeXml(row.value)}
    </text>`,
    )
    .join("\n");

  const footerY = cardTop + cardHeight + 30;
  const height = footerY + 20;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="white"/>
  <text x="${width / 2}" y="40" font-size="24" text-anchor="middle" font-family="sans-serif" font-weight="bold">${escapeXml(titulo)}</text>
  <text x="${width / 2}" y="66" font-size="15" text-anchor="middle" font-family="sans-serif" fill="#555">Desenvolvimento (soma das dobras) -- confira antes de aprovar</text>
  ${dimension}
  <rect x="${marginX}" y="${stripTop}" width="${usableWidth}" height="${stripHeight}" fill="#f2f2f2" stroke="black" stroke-width="1.5"/>
  ${ticks.join("\n")}
  ${labels.join("\n")}
  <rect x="${marginX}" y="${cardTop}" width="${usableWidth}" height="${cardHeight}" fill="#fafafa" stroke="black" stroke-width="1"/>
  <text x="${marginX + 20}" y="${cardTop + 20}" font-size="13" font-family="sans-serif" fill="#555">FICHA DE CONFIRMACAO</text>
  ${cardRows}
  <text x="${width / 2}" y="${footerY}" font-size="14" text-anchor="middle" font-family="sans-serif" font-weight="bold">${escapeXml(FOOTER_TEXT)}</text>
</svg>`;
}

export async function renderPiecePng(spec: PieceSpec): Promise<Buffer> {
  const svg = buildPieceSvg(spec);
  return sharp(Buffer.from(svg)).png().toBuffer();
}
