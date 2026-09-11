import { readFile } from "fs/promises";
import { basename, extname } from "path";
import { chatwootRequest, chatwootUrl, jsonHeaders, authHeaders } from "./chatwootClient.js";
import { logger } from "./logger.js";

export interface ChatwootMessage {
  id: number;
  content: string | null;
  message_type: number | string;
  content_type?: string;
  private?: boolean;
  created_at: number;
}

// message_type vem como inteiro (0 incoming, 1 outgoing) ou string dependendo
// da versao do Chatwoot; normalizamos os dois casos.
export function isIncoming(messageType: number | string): boolean {
  return messageType === 0 || messageType === "incoming";
}

export function isOutgoing(messageType: number | string): boolean {
  return messageType === 1 || messageType === "outgoing";
}

// Uma conversa esta "pendente" quando a ultima mensagem de texto (nao
// privada) e do cliente -- ou seja, ninguem (nem humano, nem robo) respondeu
// ainda depois dela. Retorna essa mensagem, ou null se a conversa nao esta
// pendente. Usado tanto pela varredura manual de pendencias quanto pelo
// fallback automatico de silencio (ver replyEngine.ts).
export function lastPendingMessage(messages: ChatwootMessage[]): ChatwootMessage | null {
  const textMessages = messages.filter(
    (m) => !m.private && (!m.content_type || m.content_type === "text") && m.content,
  );
  if (textMessages.length === 0) return null;
  const last = textMessages.reduce((a, b) => (a.created_at > b.created_at ? a : b));
  return isIncoming(last.message_type) ? last : null;
}

export async function fetchRecentMessages(
  conversationId: number,
): Promise<ChatwootMessage[]> {
  const res = await chatwootRequest(
    chatwootUrl(`/conversations/${conversationId}/messages`),
    { headers: jsonHeaders() },
    `Buscar mensagens da conversa ${conversationId}`,
  );
  const data = (await res.json()) as { payload?: ChatwootMessage[] };
  return data.payload ?? [];
}

export interface ConversationMeta {
  status: string;
  // Presente quando um atendente humano ja foi designado pra conversa.
  assigneeId: number | null;
}

// Usado para o handoff humano: se a conversa ja tem um atendente designado ou
// nao esta mais "open" (foi resolvida/deixada pendente manualmente por um
// humano), o robo nao deve responder por cima. O formato exato varia entre
// versoes do Chatwoot (assignee pode vir em `meta.assignee` ou em
// `assignee_id` no nivel raiz) -- checamos os dois.
export async function fetchConversationMeta(
  conversationId: number,
): Promise<ConversationMeta> {
  const res = await chatwootRequest(
    chatwootUrl(`/conversations/${conversationId}`),
    { headers: jsonHeaders() },
    `Buscar dados da conversa ${conversationId}`,
  );
  const data = (await res.json()) as {
    status?: string;
    assignee_id?: number | null;
    meta?: { assignee?: { id?: number } | null };
  };
  return {
    status: data.status ?? "open",
    assigneeId: data.meta?.assignee?.id ?? data.assignee_id ?? null,
  };
}

export async function sendReply(
  conversationId: number,
  content: string,
): Promise<void> {
  await chatwootRequest(
    chatwootUrl(`/conversations/${conversationId}/messages`),
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ content, message_type: "outgoing" }),
    },
    `Enviar resposta na conversa ${conversationId}`,
  );
}

export interface AttachmentFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export async function sendAttachments(
  conversationId: number,
  files: AttachmentFile[],
  content?: string,
): Promise<void> {
  const form = new FormData();
  form.append("message_type", "outgoing");
  if (content) form.append("content", content);
  for (const file of files) {
    form.append(
      "attachments[]",
      new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }),
      file.filename,
    );
  }

  await chatwootRequest(
    chatwootUrl(`/conversations/${conversationId}/messages`),
    { method: "POST", headers: authHeaders(), body: form },
    `Enviar anexo na conversa ${conversationId}`,
  );
}

const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export async function sendAttachment(
  conversationId: number,
  filePath: string,
  content?: string,
): Promise<void> {
  const buffer = await readFile(filePath);
  const ext = extname(filePath).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
  await sendAttachments(
    conversationId,
    [{ buffer, filename: basename(filePath), mimeType }],
    content,
  );
}

// Marca a conversa com uma label (sem apagar as labels que ja existem) para
// um humano encontrar depois -- usado quando o cliente manda algo que o robo
// nao consegue processar sozinho (audio, video, arquivo). Nao lanca em caso
// de falha: sinalizar a conversa e "nice to have", nao deve derrubar o fluxo
// principal de resposta.
export async function flagForHumanReview(
  conversationId: number,
  label: string,
): Promise<void> {
  try {
    const current = await chatwootRequest(
      chatwootUrl(`/conversations/${conversationId}/labels`),
      { headers: jsonHeaders() },
      `Buscar labels da conversa ${conversationId}`,
    );
    const data = (await current.json()) as { payload?: string[] };
    const labels = new Set(data.payload ?? []);
    labels.add(label);

    await chatwootRequest(
      chatwootUrl(`/conversations/${conversationId}/labels`),
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ labels: [...labels] }),
      },
      `Adicionar label na conversa ${conversationId}`,
    );
  } catch (err) {
    logger.warn(`Nao foi possivel sinalizar a conversa ${conversationId} para revisao humana`, {
      error: err,
      label,
    });
  }
}
