// Evita responder duas vezes a mesma mensagem quando o Chatwoot reentrega o
// mesmo webhook (acontece se a primeira entrega demorar/cair antes do 200
// OK). Guarda em memoria por um tempo curto -- suficiente pra cobrir
// reentregas, que normalmente ocorrem em segundos, sem precisar de disco.
const TTL_MS = 10 * 60 * 1000;
const seen = new Map<string, number>();

function cleanup(now: number): void {
  for (const [key, expiresAt] of seen) {
    if (expiresAt <= now) seen.delete(key);
  }
}

// Retorna true na primeira vez que ve essa chave (e passa a lembrar dela);
// retorna false se a mesma chave ja foi vista dentro do TTL.
export function markSeenOnce(key: string): boolean {
  const now = Date.now();
  cleanup(now);
  if (seen.has(key)) return false;
  seen.set(key, now + TTL_MS);
  return true;
}
