import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../config.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT =
  "Voce e um especialista em Customer Experience (CX), tom de voz de marca e treinamento de IA " +
  "para atendimento ao cliente. Voce recebe transcricoes reais de conversas de WhatsApp entre " +
  "clientes e a equipe da Cartel (cada linha marcada [cliente] ou [equipe]) e deve analisar " +
  "detalhadamente a forma como a equipe responde, para gerar um manual de atendimento e estilo. " +
  "Baseie-se SOMENTE no que esta escrito nas conversas -- nunca invente informacao, preco, prazo " +
  "ou politica que nao apareca no texto. Se faltar informacao importante sobre o negocio/produto, " +
  "liste isso explicitamente em vez de supor. Responda sempre em portugues do Brasil.";

function buildUserPrompt(corpus: string): string {
  return `Aqui estao conversas reais entre clientes e a equipe da Cartel:\n\n${corpus}\n\nAnalise a forma como respondemos aos clientes e extraia:
1. DIRETRIZES DE TOM DE VOZ: como nos comunicamos (emojis, formalidade, girias, tamanho das respostas).
2. REGRAS DE NEGOCIO E RESPOSTAS CERTAS: um "Guia de Fatos Verdadeiros" com as respostas padrao que a equipe deu para as duvidas mais frequentes (precos, prazos, pagamento, como o produto funciona).
3. O QUE NAO FAZER: comportamentos ou termos que a equipe evitou ou corrigiu durante o atendimento.
Nao invente nenhuma informacao alem do que esta nas conversas. Se faltar informacao importante sobre o negocio, liste em "informacoes_faltantes".`;
}

export const StyleManualSchema = z.object({
  tom_de_voz: z.object({
    descricao_geral: z
      .string()
      .describe("Paragrafo curto descrevendo o tom de voz geral usado pela equipe"),
    uso_de_emojis: z.string().describe("Se e como emojis sao usados, com exemplos reais"),
    formalidade: z.string().describe("Formal, informal, ou um meio-termo -- com exemplos"),
    tamanho_das_respostas: z
      .string()
      .describe("Respostas curtas e diretas ou textos longos/explicativos, com exemplos"),
    observacoes: z.array(z.string()).max(8),
  }),
  guia_fatos_verdadeiros: z
    .array(
      z.object({
        pergunta: z.string().describe("Duvida ou pergunta frequente do cliente"),
        resposta_padrao: z
          .string()
          .describe("Como a equipe respondeu de fato a essa duvida, com base no historico"),
        categoria: z.enum([
          "preco",
          "prazo",
          "pagamento",
          "produto",
          "frete/entrega",
          "instalacao",
          "outro",
        ]),
      }),
    )
    .max(20),
  o_que_nao_fazer: z
    .array(
      z.object({
        comportamento: z.string().describe("O que nao dizer/fazer"),
        motivo: z
          .string()
          .describe("Por que, com base no que foi observado ou corrigido nas conversas"),
      }),
    )
    .max(15),
  informacoes_faltantes: z
    .array(z.string())
    .max(10)
    .describe(
      "Informacoes importantes sobre o negocio/produto que nao ficaram claras nas conversas analisadas",
    ),
});

export type StyleManual = z.infer<typeof StyleManualSchema>;

export async function estimateInputTokens(corpus: string): Promise<number> {
  const result = await client.messages.countTokens({
    model: "claude-opus-5",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(corpus) }],
  });
  return result.input_tokens;
}

export async function analyzeStyleManual(
  corpus: string,
): Promise<{ manual: StyleManual; usage: Anthropic.Usage }> {
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(corpus) }],
    output_config: { format: zodOutputFormat(StyleManualSchema), effort: "medium" },
  });

  if (!response.parsed_output) {
    throw new Error("Claude nao conseguiu estruturar o manual.");
  }

  return { manual: response.parsed_output, usage: response.usage };
}
