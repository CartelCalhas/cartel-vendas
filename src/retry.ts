import { logger } from "./logger.js";

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  label: string;
  // Decide se vale tentar de novo. Por padrao so re-tenta erros de rede
  // (fetch rejeitado) -- respostas HTTP com erro precisam declarar isso
  // explicitamente via `shouldRetry`, porque um 4xx normalmente e permanente.
  shouldRetry?: (err: unknown) => boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableHttpError(err: unknown): boolean {
  if (err instanceof RetryableHttpError) return true;
  // Falhas de rede (fetch rejeita a Promise): timeout, conexao recusada, DNS.
  return err instanceof Error && !(err instanceof NonRetryableHttpError);
}

// Lancem estas a partir do `.ok === false` de uma resposta HTTP para dizer
// ao withRetry se vale a pena tentar de novo (5xx/timeout) ou nao (4xx).
export class RetryableHttpError extends Error {}
export class NonRetryableHttpError extends Error {}

// Executa `fn` com ate `attempts` tentativas e backoff exponencial + jitter
// entre elas. Usado nas chamadas ao Chatwoot e a Anthropic para tolerar
// falhas transitorias (instabilidade de rede, 5xx, timeout) sem perder a
// mensagem do cliente.
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 500, label, shouldRetry = isRetryableHttpError }: RetryOptions,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLastAttempt = attempt === attempts;
      if (isLastAttempt || !shouldRetry(err)) throw err;

      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.random() * backoff * 0.25;
      logger.warn(`${label}: tentativa ${attempt}/${attempts} falhou, tentando de novo`, {
        error: err,
        delayMs: Math.round(backoff + jitter),
      });
      await delay(backoff + jitter);
    }
  }
  throw lastErr;
}
