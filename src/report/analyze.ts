import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../config.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT =
  "Voce e um analista de dados para uma pequena empresa de vendas chamada Cartel. " +
  "Voce recebe transcricoes reais de conversas de WhatsApp com clientes (cada linha marcada " +
  "[cliente] ou [equipe]) e deve identificar padroes reais nelas. Baseie-se SOMENTE no que " +
  "esta escrito nas conversas -- nunca invente numeros, produtos, precos ou politicas que nao " +
  "aparecam no texto. Se uma informacao nao aparecer nas conversas, diga isso explicitamente " +
  "em vez de supor. Responda sempre em portugues do Brasil, em linguagem simples.";

function buildUserPrompt(corpus: string): string {
  return `Aqui estao as conversas dos ultimos meses entre clientes e a equipe da Cartel:\n\n${corpus}\n\nAnalise o perfil dos clientes e as perguntas e respostas mais frequentes.`;
}

export const ReportSchema = z.object({
  resumo_geral: z
    .string()
    .describe(
      "Paragrafo curto (3-5 frases) descrevendo o perfil geral dos clientes da Cartel com base nas conversas.",
    ),
  segmentos: z
    .array(
      z.object({
        nome: z.string(),
        descricao: z.string(),
        proporcao_estimada: z
          .string()
          .describe("Proporcao aproximada, ex: '30%' ou 'cerca de um terco'"),
      }),
    )
    .max(6),
  necessidades_comuns: z.array(z.string()).max(8),
  perguntas_frequentes: z
    .array(
      z.object({
        tema: z.string(),
        exemplo: z
          .string()
          .describe("Exemplo representativo, parafraseado, de como o cliente pergunta isso"),
        frequencia: z.enum(["muito alta", "alta", "media", "baixa"]),
        resposta_tipica: z
          .string()
          .describe("Como a equipe normalmente responde a isso hoje, com base no historico"),
      }),
    )
    .max(12),
  recomendacoes: z
    .array(z.string())
    .max(8)
    .describe(
      "Sugestoes praticas para o texto do robo de WhatsApp (prompt de vendas) ou para o processo de atendimento",
    ),
});

export type InsightsReport = z.infer<typeof ReportSchema>;

export async function estimateInputTokens(corpus: string): Promise<number> {
  const result = await client.messages.countTokens({
    model: "claude-opus-5",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(corpus) }],
  });
  return result.input_tokens;
}

export async function analyzeConversations(
  corpus: string,
): Promise<{ report: InsightsReport; usage: Anthropic.Usage }> {
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(corpus) }],
    output_config: { format: zodOutputFormat(ReportSchema), effort: "medium" },
  });

  if (!response.parsed_output) {
    throw new Error("Claude nao conseguiu estruturar o relatorio.");
  }

  return { report: response.parsed_output, usage: response.usage };
}
