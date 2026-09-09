import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { SALES_SYSTEM_PROMPT } from "./prompts/salesPrompt.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GeneratedReply {
  text: string;
  sendRipadoCatalog: boolean;
}

// O prompt instrui a Claude a incluir essa marca (em linha propria) quando o
// cliente pedir pra ver o catalogo do ripado. Ela nunca deve chegar ao
// cliente nem ficar salva no historico -- por isso e removida aqui antes de
// qualquer coisa ser enviada ao Chatwoot.
const RIPADO_CATALOG_MARKER = "[[ENVIAR_CATALOGO_RIPADO]]";

export async function generateReply(
  history: ChatTurn[],
  userMessage: string,
): Promise<GeneratedReply> {
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    system: [
      { type: "text", text: SALES_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [...history, { role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const rawText = textBlock?.text?.trim() ?? "";

  const sendRipadoCatalog = rawText.includes(RIPADO_CATALOG_MARKER);
  const text = rawText.replaceAll(RIPADO_CATALOG_MARKER, "").trim();

  return { text, sendRipadoCatalog };
}
