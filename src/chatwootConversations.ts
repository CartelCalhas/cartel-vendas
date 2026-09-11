import { chatwootRequest, chatwootUrl, jsonHeaders } from "./chatwootClient.js";

export interface ConversationSummary {
  id: number;
  createdAt: number; // unix seconds
  lastActivityAt: number; // unix seconds
  contactName: string;
  contactHandle: string;
}

interface RawConversation {
  id: number;
  created_at?: number;
  last_activity_at?: number;
  inbox_id?: number;
  meta?: {
    sender?: {
      name?: string;
      phone_number?: string;
      email?: string;
      identifier?: string;
    };
  };
}

// A lista de conversas do Chatwoot varia de formato entre versoes:
// as vezes `{ data: { payload: [...] } }`, as vezes `{ payload: [...] }`.
// Exportado (so pra teste) porque e a parte mais facil de quebrar sem
// perceber se o Chatwoot mudar de formato de novo.
export function extractPayload(json: unknown): RawConversation[] {
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    const data = obj.data as Record<string, unknown> | undefined;
    if (data && Array.isArray(data.payload)) {
      return data.payload as RawConversation[];
    }
    if (Array.isArray(obj.payload)) {
      return obj.payload as RawConversation[];
    }
  }
  return Array.isArray(json) ? (json as RawConversation[]) : [];
}

export interface ListConversationsResult {
  conversations: ConversationSummary[];
  truncated: boolean;
}

// A lista vem ordenada por atividade mais recente primeiro. Como
// last_activity_at nunca e anterior a created_at, assim que uma pagina so
// tem conversas com atividade antes do corte, todas as paginas seguintes
// tambem estarao fora da janela -- e seguro parar ali.
export async function listConversationsSince(
  cutoffSeconds: number,
  opts: { inboxId?: string | null; maxConversations?: number; maxPages?: number } = {},
): Promise<ListConversationsResult> {
  const maxConversations = opts.maxConversations ?? 400;
  const maxPages = opts.maxPages ?? 60;
  const conversations: ConversationSummary[] = [];
  let truncated = false;

  outer: for (let page = 1; page <= maxPages; page++) {
    const url = chatwootUrl("/conversations");
    url.searchParams.set("status", "all");
    url.searchParams.set("page", String(page));
    if (opts.inboxId) url.searchParams.set("inbox_id", opts.inboxId);

    const res = await chatwootRequest(
      url,
      { headers: jsonHeaders() },
      `Listar conversas (pagina ${page})`,
    );

    const raw = extractPayload(await res.json());
    if (raw.length === 0) break;

    for (const c of raw) {
      const lastActivity = Number(c.last_activity_at ?? c.created_at ?? 0);
      if (lastActivity < cutoffSeconds) break outer;

      conversations.push({
        id: c.id,
        createdAt: Number(c.created_at ?? lastActivity),
        lastActivityAt: lastActivity,
        contactName: c.meta?.sender?.name?.trim() || "Cliente sem nome",
        contactHandle:
          c.meta?.sender?.phone_number ||
          c.meta?.sender?.email ||
          c.meta?.sender?.identifier ||
          "",
      });

      if (conversations.length >= maxConversations) {
        truncated = true;
        break outer;
      }
    }
  }

  return { conversations, truncated };
}
