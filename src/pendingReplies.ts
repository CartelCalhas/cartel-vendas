import { fetchRecentMessages, lastPendingMessage } from "./chatwoot.js";
import type { ConversationSummary } from "./chatwootConversations.js";
import { withConcurrency } from "./concurrency.js";

export interface PendingConversation {
  conversationId: number;
  contactName: string;
  contactHandle: string;
  lastMessageContent: string;
  lastMessageId: number;
  ageHours: number;
}

export async function findPendingConversations(
  conversations: ConversationSummary[],
): Promise<PendingConversation[]> {
  const results = await withConcurrency(conversations, 6, async (conv) => {
    let messages;
    try {
      messages = await fetchRecentMessages(conv.id);
    } catch {
      return null;
    }

    const last = lastPendingMessage(messages);
    if (!last) return null;

    const pending: PendingConversation = {
      conversationId: conv.id,
      contactName: conv.contactName,
      contactHandle: conv.contactHandle,
      lastMessageContent: last.content as string,
      lastMessageId: last.id,
      ageHours: (Date.now() / 1000 - last.created_at) / 3600,
    };
    return pending;
  });

  return results.filter((r): r is PendingConversation => r !== null);
}
