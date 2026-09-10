import sharp from "sharp";

export interface PieceSpec {
  titulo: string;
  segmentosMm: number[];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Desenha um "padrao plano" da peca: uma tira dimensionada mostrando cada
// dobra/segmento em sequencia, do jeito que aparece nos desenhos a mao da
// equipe (medida por medida). Nao tenta representar os angulos/direcoes reais
// das dobras -- so confirma que a soma dos segmentos bate com o que o
// cliente pediu, que e o que interessa para aprovar antes de cortar.
function buildPieceSvg({ titulo, segmentosMm }: PieceSpec): string {
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
  const height = stripBottom + 70;

  let x = marginX;
  const ticks: string[] = [];
  const labels: string[] = [];
  const boundaries = [x];

  for (const seg of segmentosMm) {
    const segWidth = seg * scale;
    const nx = x + segWidth;
    labels.push(
      `<text x="${(x + nx) / 2}" y="${stripBottom + 26}" font-size="16" text-anchor="middle" font-family="monospace">${seg}mm</text>`,
    );
    x = nx;
    boundaries.push(x);
  }

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

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="white"/>
  <text x="${width / 2}" y="40" font-size="24" text-anchor="middle" font-family="sans-serif" font-weight="bold">${escapeXml(titulo)}</text>
  <text x="${width / 2}" y="66" font-size="15" text-anchor="middle" font-family="sans-serif" fill="#555">Desenvolvimento (soma das dobras) -- confira antes de aprovar</text>
  ${dimension}
  <rect x="${marginX}" y="${stripTop}" width="${usableWidth}" height="${stripHeight}" fill="#f2f2f2" stroke="black" stroke-width="1.5"/>
  ${ticks.join("\n")}
  ${labels.join("\n")}
</svg>`;
}

export async function renderPiecePng(spec: PieceSpec): Promise<Buffer> {
  const svg = buildPieceSvg(spec);
  return sharp(Buffer.from(svg)).png().toBuffer();
}
