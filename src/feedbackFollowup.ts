import { fetchConversationLabels, addConversationLabel, sendReply } from "./chatwoot.js";
import type { ConversationSummary } from "./chatwootConversations.js";
import { withConcurrency } from "./concurrency.js";

// Marca a conversa depois de mandar o pedido de feedback, pra essa mesma
// conversa nao aparecer de novo numa proxima varredura.
export const FEEDBACK_LABEL = "feedback-solicitado";

export const MIN_DAYS_SINCE_RESOLVED = 2;
export const MAX_DAYS_SINCE_RESOLVED = 30;

export interface FeedbackCandidate {
  conversationId: number;
  contactName: string;
  contactHandle: string;
  daysSinceResolved: number;
}

export function buildFeedbackMessage(contactName: string): string {
  const name = contactName && contactName !== "Cliente sem nome" ? contactName.split(" ")[0] : "";
  const greeting = name ? `Oi, ${name}!` : "Oi!";
  return (
    `${greeting} Faz alguns dias que finalizamos seu atendimento aqui na Cartel. ` +
    "Poderia nos contar como foi sua experiencia com o atendimento e o produto? " +
    "Tem algo que a gente pode melhorar? Sua opiniao e muito importante pra gente! 🙏"
  );
}

// Nem cedo demais (o cliente pode ainda nem ter usado o produto) nem velho
// demais (nao faz sentido reabrir algo de meses atras do nada).
export function isWithinFeedbackWindow(lastActivityAt: number, nowSeconds: number): boolean {
  const age = nowSeconds - lastActivityAt;
  const minAgeSeconds = MIN_DAYS_SINCE_RESOLVED * 24 * 60 * 60;
  const maxAgeSeconds = MAX_DAYS_SINCE_RESOLVED * 24 * 60 * 60;
  return age >= minAgeSeconds && age <= maxAgeSeconds;
}

// Filtra, dentre conversas ja resolvidas, as que estao dentro da janela de
// idade certa e que ainda nao receberam um pedido de feedback (label
// FEEDBACK_LABEL).
export async function findFeedbackCandidates(
  conversations: ConversationSummary[],
): Promise<FeedbackCandidate[]> {
  const now = Date.now() / 1000;
  const withinWindow = conversations.filter((c) => isWithinFeedbackWindow(c.lastActivityAt, now));

  const results = await withConcurrency(withinWindow, 6, async (conv) => {
    let labels: string[];
    try {
      labels = await fetchConversationLabels(conv.id);
    } catch {
      return null;
    }
    if (labels.includes(FEEDBACK_LABEL)) return null;

    const candidate: FeedbackCandidate = {
      conversationId: conv.id,
      contactName: conv.contactName,
      contactHandle: conv.contactHandle,
      daysSinceResolved: Math.floor((now - conv.lastActivityAt) / (24 * 60 * 60)),
    };
    return candidate;
  });

  return results.filter((r): r is FeedbackCandidate => r !== null);
}

// Manda a mensagem de feedback e marca a conversa, nessa ordem -- se marcar
// falhar depois de mandar com sucesso, o pior caso e o cliente eventualmente
// receber a pergunta de novo numa proxima varredura, nunca duas vezes na
// mesma sem querer por causa de uma falha de rede que impediu o envio.
export async function sendFeedbackRequest(candidate: FeedbackCandidate): Promise<void> {
  await sendReply(candidate.conversationId, buildFeedbackMessage(candidate.contactName));
  await addConversationLabel(candidate.conversationId, FEEDBACK_LABEL);
}
