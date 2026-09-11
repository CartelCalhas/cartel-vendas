import { config } from "./config.js";
import { withRetry, RetryableHttpError, NonRetryableHttpError } from "./retry.js";

const API_ROOT = `${config.chatwootBaseUrl}/api/v1/accounts/${config.chatwootAccountId}`;
const REQUEST_TIMEOUT_MS = 15000;

export function chatwootUrl(path: string): URL {
  return new URL(`${API_ROOT}${path}`);
}

export function jsonHeaders(): HeadersInit {
  return { "Content-Type": "application/json", api_access_token: config.chatwootApiToken };
}

// Sem Content-Type aqui de proposito: o fetch define o boundary do
// multipart/form-data sozinho a partir do FormData.
export function authHeaders(): HeadersInit {
  return { api_access_token: config.chatwootApiToken };
}

// Faz a chamada com timeout e classifica a falha para o withRetry: erro de
// rede/timeout e 5xx sao transitorios (vale tentar de novo); 4xx normalmente
// e erro permanente de configuracao/permissao (nao adianta repetir).
export async function chatwootRequest(
  url: string | URL,
  init: RequestInit,
  label: string,
): Promise<Response> {
  return withRetry(
    async () => {
      let res: Response;
      try {
        res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      } catch (err) {
        throw new RetryableHttpError(`${label}: falha de rede -- ${(err as Error).message}`);
      }
      if (!res.ok) {
        const body = await res.text();
        const message = `${label}: ${res.status} ${body}`;
        throw res.status >= 500
          ? new RetryableHttpError(message)
          : new NonRetryableHttpError(message);
      }
      return res;
    },
    { label },
  );
}
