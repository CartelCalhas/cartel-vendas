import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { SALES_SYSTEM_PROMPT } from "./prompts/salesPrompt.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function generateReply(
  history: ChatTurn[],
  userMessage: string,
): Promise<string> {
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    system: [
      { type: "text", text: SALES_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [...history, { role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text?.trim() ?? "";
}
