import { timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";

// Compara duas strings em tempo constante (mesmo numero de operacoes
// independente de onde elas diferem), para nao vazar informacao por timing
// attack. Strings de tamanhos diferentes nunca sao iguais, mas ainda assim
// fazemos uma comparacao de tamanho fixo para nao vazar o tamanho certo via
// o tempo de resposta.
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Ainda gasta um tempo comparavel comparando o buffer contra si mesmo.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

const ADMIN_REALM = "Cartel Admin";

// Protege rotas administrativas (/reports/*, /admin/*) com HTTP Basic Auth.
// Ao contrario de um `?secret=` na URL, a credencial nunca aparece em
// historico do navegador, logs de acesso ou header Referer -- o navegador a
// guarda por origem e a reenvia sozinho nas chamadas seguintes (inclusive
// fetch() das paginas de espera).
export function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization ?? "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    const password = separatorIndex === -1 ? decoded : decoded.slice(separatorIndex + 1);
    if (safeEqual(password, config.adminSecret)) {
      next();
      return;
    }
  }

  res.set("WWW-Authenticate", `Basic realm="${ADMIN_REALM}"`);
  res.status(401).send("Acesso negado.");
}

// Defesa extra contra CSRF nas rotas administrativas que mudam estado
// (disparar relatorio, responder pendencias em massa, salvar prompt): HTTP
// Basic Auth nao tem conceito de sessao/cookie, entao o navegador reenviaria
// a credencial mesmo numa requisicao disparada por outro site. O header
// Sec-Fetch-Site (enviado por todo navegador moderno) diz se o pedido veio
// da mesma origem; bloqueamos POST que nao vieram de la. Navegadores muito
// antigos que nao mandam esse header ainda ficam protegidos pelo Basic Auth
// sozinho -- essa checagem e reforco, nao a unica linha de defesa.
export function requireSameOriginForStateChange(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") {
    res.status(403).send("Requisicao bloqueada (origem cruzada).");
    return;
  }
  next();
}
