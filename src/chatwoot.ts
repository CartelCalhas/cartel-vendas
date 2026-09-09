import { readFile } from "fs/promises";
import { basename } from "path";
import { config } from "./config.js";

const apiRoot = `${config.chatwootBaseUrl}/api/v1/accounts/${config.chatwootAccountId}`;

function headers(): HeadersInit {
  return {
    "Content-Type": "application/json",
    api_access_token: config.chatwootApiToken,
  };
}

// Sem Content-Type aqui de proposito: o fetch define o boundary do
// multipart/form-data sozinho a partir do FormData.
function authHeaders(): HeadersInit {
  return { api_access_token: config.chatwootApiToken };
}

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

export async function fetchRecentMessages(
  conversationId: number,
): Promise<ChatwootMessage[]> {
  const res = await fetch(
    `${apiRoot}/conversations/${conversationId}/messages`,
    { headers: headers() },
  );

  if (!res.ok) {
    throw new Error(
      `Falha ao buscar mensagens da conversa ${conversationId}: ${res.status} ${await res.text()}`,
    );
  }

  const data = (await res.json()) as { payload?: ChatwootMessage[] };
  return data.payload ?? [];
}

export async function sendReply(
  conversationId: number,
  content: string,
): Promise<void> {
  const res = await fetch(
    `${apiRoot}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        content,
        message_type: "outgoing",
      }),
    },
  );

  if (!res.ok) {
    throw new Error(
      `Falha ao enviar resposta na conversa ${conversationId}: ${res.status} ${await res.text()}`,
    );
  }
}

export async function sendAttachment(
  conversationId: number,
  filePath: string,
  content?: string,
): Promise<void> {
  const fileBuffer = await readFile(filePath);
  const form = new FormData();
  form.append("message_type", "outgoing");
  if (content) form.append("content", content);
  form.append(
    "attachments[]",
    new Blob([fileBuffer], { type: "application/pdf" }),
    basename(filePath),
  );

  const res = await fetch(
    `${apiRoot}/conversations/${conversationId}/messages`,
    { method: "POST", headers: authHeaders(), body: form },
  );

  if (!res.ok) {
    throw new Error(
      `Falha ao enviar anexo na conversa ${conversationId}: ${res.status} ${await res.text()}`,
    );
  }
}
