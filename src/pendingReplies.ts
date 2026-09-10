import { fetchRecentMessages, isIncoming } from "./chatwoot.js";
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

// Uma conversa esta "pendente" quando a ultima mensagem de texto (nao
// privada) e do cliente -- ou seja, ninguem (nem humano, nem robo) respondeu
// ainda depois dela.
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

    const textMessages = messages.filter(
      (m) => !m.private && (!m.content_type || m.content_type === "text") && m.content,
    );
    if (textMessages.length === 0) return null;

    const last = textMessages.reduce((a, b) =>
      a.created_at > b.created_at ? a : b,
    );
    if (!isIncoming(last.message_type)) return null;

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
