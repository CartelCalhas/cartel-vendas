import { fetchRecentMessages, isIncoming, isOutgoing } from "../chatwoot.js";
import type { ConversationSummary } from "../chatwootConversations.js";

export interface MonthlyBucket {
  label: string;
  count: number;
}

export interface CorpusResult {
  text: string;
  totalConversations: number;
  totalCustomerMessages: number;
  uniqueContacts: number;
  monthly: MonthlyBucket[];
}

async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function monthLabel(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
  });
}

function monthlyBuckets(conversations: ConversationSummary[]): MonthlyBucket[] {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const c of [...conversations].sort((a, b) => a.createdAt - b.createdAt)) {
    const label = monthLabel(c.createdAt);
    if (!counts.has(label)) order.push(label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return order.map((label) => ({ label, count: counts.get(label) ?? 0 }));
}

export async function buildCorpus(
  conversations: ConversationSummary[],
): Promise<CorpusResult> {
  const contacts = new Set<string>();
  let totalCustomerMessages = 0;

  const blocks = await withConcurrency(conversations, 6, async (conv) => {
    contacts.add(conv.contactHandle || conv.contactName);

    let messages;
    try {
      messages = await fetchRecentMessages(conv.id);
    } catch {
      return "";
    }

    const lines: string[] = [];
    for (const m of messages) {
      if (m.private) continue;
      if (m.content_type && m.content_type !== "text") continue;
      if (!m.content) continue;

      if (isIncoming(m.message_type)) {
        totalCustomerMessages++;
        lines.push(`[cliente] ${m.content}`);
      } else if (isOutgoing(m.message_type)) {
        lines.push(`[equipe] ${m.content}`);
      }
    }
    if (lines.length === 0) return "";

    return [
      `### Conversa #${conv.id} - cliente: ${conv.contactName}${
        conv.contactHandle ? ` (${conv.contactHandle})` : ""
      }`,
      ...lines,
      "",
    ].join("\n");
  });

  return {
    text: blocks.filter(Boolean).join("\n"),
    totalConversations: conversations.length,
    totalCustomerMessages,
    uniqueContacts: contacts.size,
    monthly: monthlyBuckets(conversations),
  };
}
