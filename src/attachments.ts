import { logger } from "./logger.js";

const DOWNLOAD_TIMEOUT_MS = 10000;
// Limite de seguranca por imagem antes de virar base64 (fotos de celular
// raramente passam disso; evita gastar tokens/memoria com um arquivo gigante).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const SUPPORTED_IMAGE_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
export type SupportedImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

export interface DownloadedImage {
  buffer: Buffer;
  mediaType: SupportedImageMediaType;
}

// Baixa um anexo (foto que o cliente mandou no WhatsApp, ja hospedada pelo
// Chatwoot) para repassar a Claude como imagem. Falha graciosamente: se o
// download falhar, exceder o limite de tamanho ou vier num formato que a API
// da Claude nao aceita, retorna null e quem chamou decide o que fazer
// (tipicamente: seguir so com o texto, se houver, e sinalizar pra um humano).
export async function downloadImageAttachment(url: string): Promise<DownloadedImage | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok) {
      logger.warn("Falha ao baixar anexo de imagem", { url, status: res.status });
      return null;
    }

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      logger.warn("Anexo de imagem excede o limite de tamanho", { url, contentLength });
      return null;
    }

    const mediaType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!SUPPORTED_IMAGE_MEDIA_TYPES.has(mediaType)) {
      logger.warn("Formato de imagem nao suportado pela API da Claude", { url, mediaType });
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      logger.warn("Anexo de imagem excede o limite de tamanho", { url, size: buffer.byteLength });
      return null;
    }

    return { buffer, mediaType: mediaType as SupportedImageMediaType };
  } catch (err) {
    logger.warn("Erro baixando anexo de imagem", { url, error: err });
    return null;
  }
}
