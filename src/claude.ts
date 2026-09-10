import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { SALES_SYSTEM_PROMPT } from "./prompts/salesPrompt.js";
import { renderPiecePng } from "./drawing.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface PieceDrawing {
  buffer: Buffer;
  filename: string;
  caption: string;
}

export interface GeneratedReply {
  text: string;
  sendRipadoCatalog: boolean;
  drawings: PieceDrawing[];
}

// O prompt instrui a Claude a incluir essa marca (em linha propria) quando o
// cliente pedir pra ver o catalogo do ripado. Ela nunca deve chegar ao
// cliente nem ficar salva no historico -- por isso e removida aqui antes de
// qualquer coisa ser enviada ao Chatwoot.
const RIPADO_CATALOG_MARKER = "[[ENVIAR_CATALOGO_RIPADO]]";

const DRAW_PIECE_TOOL: Anthropic.Tool = {
  name: "desenhar_peca",
  description:
    "Gera um desenho tecnico simples (tira dimensionada) do desenvolvimento de " +
    "uma peca de calha/rufo/chapa/peca em L, a partir das medidas de cada dobra " +
    "que o cliente informou. Use isso sempre que tiver reunido as medidas de uma " +
    "peca sob medida, antes de pedir para o cliente aprovar. Se o pedido tiver " +
    "mais de um formato de peca, chame esta ferramenta uma vez para cada formato.",
  input_schema: {
    type: "object",
    properties: {
      titulo: {
        type: "string",
        description:
          "Identificacao curta da peca, ex: '58 pcs 4.400mm' ou '02 pcs em L 3.950mm'",
      },
      segmentos_mm: {
        type: "array",
        items: { type: "number" },
        description:
          "Medida de cada dobra/segmento em milimetros, na ordem informada pelo " +
          "cliente, ex: [25, 30, 30, 30, 25]",
      },
    },
    required: ["titulo", "segmentos_mm"],
    additionalProperties: false,
  },
};

function extractText(response: Anthropic.Message): string {
  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text?.trim() ?? "";
}

export async function generateReply(
  history: ChatTurn[],
  userMessage: string,
): Promise<GeneratedReply> {
  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: userMessage },
  ];
  const drawings: PieceDrawing[] = [];

  let response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    system: [
      { type: "text", text: SALES_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    tools: [DRAW_PIECE_TOOL],
    messages,
  });

  // No maximo 3 idas e voltas -- so existe uma ferramenta e ela nao deveria
  // precisar de mais chamadas que o numero de pecas distintas de um pedido.
  for (let round = 0; round < 3 && response.stop_reason === "tool_use"; round++) {
    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      if (toolUse.name !== "desenhar_peca") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: "Ferramenta desconhecida.",
          is_error: true,
        });
        continue;
      }
      try {
        const input = toolUse.input as { titulo: string; segmentos_mm: number[] };
        const buffer = await renderPiecePng({
          titulo: input.titulo,
          segmentosMm: input.segmentos_mm,
        });
        drawings.push({
          buffer,
          filename: `${input.titulo.replace(/[^a-zA-Z0-9]+/g, "-")}.png`,
          caption: input.titulo,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content:
            "Desenho gerado com sucesso. Ele sera enviado ao cliente junto com " +
            "sua proxima mensagem de texto -- peca a aprovacao do cliente.",
        });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Falha ao gerar o desenho: ${(err as Error).message}`,
          is_error: true,
        });
      }
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      system: [
        { type: "text", text: SALES_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      tools: [DRAW_PIECE_TOOL],
      messages,
    });
  }

  const rawText = extractText(response);
  const sendRipadoCatalog = rawText.includes(RIPADO_CATALOG_MARKER);
  const text = rawText.replaceAll(RIPADO_CATALOG_MARKER, "").trim();

  return { text, sendRipadoCatalog, drawings };
}
