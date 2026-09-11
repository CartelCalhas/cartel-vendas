import type { CorpusResult } from "./corpus.js";
import type { InsightsReport } from "./analyze.js";
import type Anthropic from "@anthropic-ai/sdk";

const OPUS5_INPUT_PER_M = 5;
const OPUS5_OUTPUT_PER_M = 25;
const ASSUMED_OUTPUT_TOKENS_FOR_ESTIMATE = 4000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatUsd(value: number): string {
  return `US$ ${value.toFixed(2)}`;
}

const SHELL_HEAD = `
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Source+Sans+3:wght@400;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root {
    --paper: #f0f4f0;
    --surface: #ffffff;
    --surface-2: #e7ede7;
    --ink: #17231d;
    --muted: #5c6b62;
    --border: #d7e0d6;
    --accent: #2f7a57;
    --accent-ink: #143527;
    --accent-soft: #e2f0e7;
    --gold: #93641f;
    --gold-soft: #f6ecd8;
    --gold-border: #e3cd9d;
    --shadow: 0 1px 2px rgba(23, 35, 29, 0.06), 0 8px 24px rgba(23, 35, 29, 0.05);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: "Source Sans 3", -apple-system, "Segoe UI", sans-serif;
    line-height: 1.55;
  }
  h1, h2, h3 { font-family: "Fraunces", Georgia, serif; text-wrap: balance; margin: 0; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 40px 20px 80px; }
  .eyebrow {
    font-size: 12.5px; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--accent); font-weight: 600; margin: 0 0 10px;
  }
  h1 { font-size: clamp(26px, 4.5vw, 36px); font-weight: 600; margin-bottom: 10px; }
  p.lede { color: var(--muted); font-size: 16px; max-width: 60ch; margin: 0 0 8px; }
  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    padding: 20px 22px; box-shadow: var(--shadow); margin: 20px 0;
  }
  .stat-row { display: flex; flex-wrap: wrap; gap: 12px; margin: 20px 0; }
  .stat {
    flex: 1; min-width: 130px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 14px 16px; box-shadow: var(--shadow);
  }
  .stat .k { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
  .stat .v { font-family: "Fraunces", serif; font-size: 24px; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .callout {
    border: 1px solid var(--gold-border); border-left: 3px solid var(--gold); background: var(--gold-soft);
    border-radius: 8px; padding: 14px 16px; margin: 20px 0; font-size: 14.5px;
  }
  .btn {
    display: inline-block; background: var(--accent); color: #fff; text-decoration: none;
    font-weight: 600; padding: 12px 22px; border-radius: 8px; font-size: 15px; margin-top: 6px;
    border: none; cursor: pointer; font-family: inherit;
  }
  .btn:hover { background: var(--accent-ink); }
  textarea.editor {
    width: 100%; min-height: 360px; font-family: "IBM Plex Mono", monospace; font-size: 13px;
    padding: 14px; border: 1px solid var(--border); border-radius: 8px; box-sizing: border-box;
    background: var(--surface); color: var(--ink); resize: vertical;
  }
  section { margin-top: 40px; }
  section > h2 { font-size: 20px; font-weight: 600; margin-bottom: 14px; }
  ul.plain { margin: 0; padding-left: 20px; }
  ul.plain li { margin-bottom: 6px; }
  .segment { border-bottom: 1px solid var(--border); padding: 12px 0; }
  .segment:last-child { border-bottom: none; }
  .segment .name { font-weight: 700; }
  .segment .pct { color: var(--accent-ink); font-weight: 600; font-size: 13px; }
  .qa { border-bottom: 1px solid var(--border); padding: 16px 0; }
  .qa:last-child { border-bottom: none; }
  .qa .theme { font-weight: 700; font-size: 15.5px; }
  .qa .example { color: var(--muted); font-style: italic; margin: 4px 0 8px; }
  .qa .answer { font-size: 14.5px; }
  .qa .answer b { color: var(--accent-ink); }
  .pill {
    display: inline-block; font-size: 11.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.03em; padding: 3px 9px; border-radius: 999px; margin-left: 8px;
    background: var(--accent-soft); color: var(--accent-ink); vertical-align: middle;
  }
  .chart { display: flex; align-items: flex-end; gap: 8px; height: 160px; margin: 10px 0 6px; }
  .chart .col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
  .chart .bar { width: 100%; max-width: 44px; background: var(--accent); border-radius: 4px 4px 0 0; }
  .chart .val { font-size: 11.5px; color: var(--muted); margin-bottom: 4px; font-variant-numeric: tabular-nums; }
  .chart .lbl { font-size: 11px; color: var(--muted); margin-top: 6px; text-align: center; }
  footer { margin-top: 48px; padding-top: 18px; border-top: 1px solid var(--border); font-size: 13px; color: var(--muted); }
  code { font-family: "IBM Plex Mono", monospace; background: var(--surface-2); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
</style>
`;

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head><title>${escapeHtml(title)}</title>${SHELL_HEAD}</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}

function renderChart(monthly: CorpusResult["monthly"]): string {
  const max = Math.max(1, ...monthly.map((m) => m.count));
  const cols = monthly
    .map(
      (m) => `
      <div class="col">
        <div class="val">${m.count}</div>
        <div class="bar" style="height:${Math.max(4, (m.count / max) * 100)}%"></div>
        <div class="lbl">${escapeHtml(m.label)}</div>
      </div>`,
    )
    .join("");
  return `<div class="chart">${cols}</div>`;
}

export function renderWaitingPage(args: {
  jobId: string;
  heading: string;
  message: string;
}): string {
  // Sem `secret` na URL: a autenticacao agora e HTTP Basic Auth, que o
  // navegador reenvia sozinho (por origem) em toda chamada seguinte a este
  // dominio, inclusive nesses fetch() de polling.
  const statusUrl = `/reports/customers/status/${args.jobId}`;
  const body = `
    <p class="eyebrow">Robo WhatsApp Cartel</p>
    <h1>${escapeHtml(args.heading)}</h1>
    <p class="lede">${escapeHtml(args.message)}</p>
    <div class="card" style="text-align:center;padding:36px 22px">
      <div id="spinner" style="width:34px;height:34px;margin:0 auto 14px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.9s linear infinite"></div>
      <div id="statusText" style="color:var(--muted);font-size:14.5px">Processando...</div>
    </div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    <script>
      const statusUrl = ${JSON.stringify(statusUrl)};
      const resultUrl = ${JSON.stringify(`/reports/customers/result/${args.jobId}`)};
      async function poll() {
        try {
          const res = await fetch(statusUrl);
          const data = await res.json();
          if (data.status === "done") {
            window.location.href = resultUrl;
            return;
          }
          if (data.status === "error") {
            document.getElementById("spinner").style.display = "none";
            document.getElementById("statusText").textContent = "Erro: " + data.error;
            return;
          }
        } catch (e) {
          // rede instavel -- so tenta de novo no proximo ciclo
        }
        setTimeout(poll, 3000);
      }
      poll();
    </script>
  `;
  return pageShell(args.heading, body);
}

export function renderErrorPage(message: string): string {
  return pageShell(
    "Erro no relatorio",
    `<p class="eyebrow">Robo WhatsApp Cartel</p><h1>Nao foi possivel gerar o relatorio</h1><div class="callout">${escapeHtml(message)}</div>`,
  );
}

export function renderPendingListPage(args: {
  pending: { contactName: string; contactHandle: string; lastMessageContent: string; ageHours: number }[];
  confirmUrl: string;
}): string {
  const rows = args.pending
    .map((p) => {
      const ageLabel =
        p.ageHours < 24
          ? `${Math.round(p.ageHours)}h atras`
          : `${Math.round(p.ageHours / 24)}d atras`;
      const snippet =
        p.lastMessageContent.length > 140
          ? `${p.lastMessageContent.slice(0, 140)}...`
          : p.lastMessageContent;
      return `
      <div class="qa">
        <div class="theme">${escapeHtml(p.contactName)}${p.contactHandle ? ` <span style="font-weight:400;color:var(--muted)">(${escapeHtml(p.contactHandle)})</span>` : ""}<span class="pill">${ageLabel}</span></div>
        <div class="example">"${escapeHtml(snippet)}"</div>
      </div>`;
    })
    .join("");

  const body = `
    <p class="eyebrow">Robo WhatsApp Cartel</p>
    <h1>Conversas sem resposta</h1>
    <p class="lede">Estas conversas tem a ultima mensagem do cliente sem nenhuma resposta depois (nem humano, nem robo). Confira a lista antes de mandar -- isso vai gerar e enviar uma resposta pra cada uma.</p>

    <div class="stat-row">
      <div class="stat"><div class="k">Conversas pendentes</div><div class="v">${args.pending.length}</div></div>
    </div>

    ${
      args.pending.length === 0
        ? `<div class="callout">Nenhuma conversa pendente encontrada -- tudo em dia.</div>`
        : `<div class="card">${rows}</div>
           <form method="POST" action="${escapeHtml(args.confirmUrl)}">
             <button class="btn" type="submit">Responder todas (${args.pending.length}) →</button>
           </form>`
    }
  `;
  return pageShell("Conversas sem resposta", body);
}

export function renderPendingResultPage(args: {
  answered: string[];
  skipped: { contactName: string; reason: string }[];
  errors: { contactName: string; error: string }[];
}): string {
  const body = `
    <p class="eyebrow">Robo WhatsApp Cartel</p>
    <h1>Respostas enviadas</h1>
    <div class="stat-row">
      <div class="stat"><div class="k">Respondidas com sucesso</div><div class="v">${args.answered.length}</div></div>
      <div class="stat"><div class="k">Puladas (atendimento humano)</div><div class="v">${args.skipped.length}</div></div>
      <div class="stat"><div class="k">Com erro</div><div class="v">${args.errors.length}</div></div>
    </div>
    ${
      args.answered.length > 0
        ? `<div class="card"><ul class="plain">${args.answered.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul></div>`
        : ""
    }
    ${
      args.skipped.length > 0
        ? `<div class="callout">${args.skipped.map((s) => `${escapeHtml(s.contactName)}: ${escapeHtml(s.reason)}`).join("<br>")}</div>`
        : ""
    }
    ${
      args.errors.length > 0
        ? `<div class="callout">${args.errors.map((e) => `${escapeHtml(e.contactName)}: ${escapeHtml(e.error)}`).join("<br>")}</div>`
        : ""
    }
  `;
  return pageShell("Respostas enviadas", body);
}

export function renderFeedbackListPage(args: {
  candidates: { contactName: string; contactHandle: string; daysSinceResolved: number }[];
  confirmUrl: string;
}): string {
  const rows = args.candidates
    .map(
      (c) => `
      <div class="qa">
        <div class="theme">${escapeHtml(c.contactName)}${c.contactHandle ? ` <span style="font-weight:400;color:var(--muted)">(${escapeHtml(c.contactHandle)})</span>` : ""}<span class="pill">ha ${c.daysSinceResolved}d</span></div>
      </div>`,
    )
    .join("");

  const body = `
    <p class="eyebrow">Robo WhatsApp Cartel</p>
    <h1>Pedir feedback pos-atendimento</h1>
    <p class="lede">Conversas resolvidas ha pelo menos 2 dias que ainda nao receberam o pedido de
    feedback. Confira a lista antes de mandar -- isso vai enviar uma mensagem pra cada uma
    perguntando como foi o atendimento e o que pode melhorar.</p>

    <div class="stat-row">
      <div class="stat"><div class="k">Clientes pra pedir feedback</div><div class="v">${args.candidates.length}</div></div>
    </div>

    ${
      args.candidates.length === 0
        ? `<div class="callout">Nenhum cliente novo pra pedir feedback agora -- tudo em dia.</div>`
        : `<div class="card">${rows}</div>
           <form method="POST" action="${escapeHtml(args.confirmUrl)}">
             <button class="btn" type="submit">Enviar pedido de feedback (${args.candidates.length}) →</button>
           </form>`
    }
  `;
  return pageShell("Pedir feedback pos-atendimento", body);
}

export function renderFeedbackResultPage(args: {
  sent: string[];
  errors: { contactName: string; error: string }[];
}): string {
  const body = `
    <p class="eyebrow">Robo WhatsApp Cartel</p>
    <h1>Pedidos de feedback enviados</h1>
    <div class="stat-row">
      <div class="stat"><div class="k">Enviados com sucesso</div><div class="v">${args.sent.length}</div></div>
      <div class="stat"><div class="k">Com erro</div><div class="v">${args.errors.length}</div></div>
    </div>
    ${
      args.sent.length > 0
        ? `<div class="card"><ul class="plain">${args.sent.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul></div>`
        : ""
    }
    ${
      args.errors.length > 0
        ? `<div class="callout">${args.errors.map((e) => `${escapeHtml(e.contactName)}: ${escapeHtml(e.error)}`).join("<br>")}</div>`
        : ""
    }
  `;
  return pageShell("Pedidos de feedback enviados", body);
}

export function renderEstimatePage(args: {
  corpus: CorpusResult;
  truncated: boolean;
  months: number;
  inputTokens: number;
  confirmUrl: string;
}): string {
  const { corpus, truncated, months, inputTokens, confirmUrl } = args;
  const estimatedCost =
    (inputTokens / 1_000_000) * OPUS5_INPUT_PER_M +
    (ASSUMED_OUTPUT_TOKENS_FOR_ESTIMATE / 1_000_000) * OPUS5_OUTPUT_PER_M;

  const body = `
    <p class="eyebrow">Robo WhatsApp Cartel</p>
    <h1>Relatorio de conversas dos ultimos ${months} meses</h1>
    <p class="lede">Antes de gerar o relatorio final (que usa credito da conta Claude), confira o tamanho dos dados encontrados e o custo estimado.</p>

    <div class="stat-row">
      <div class="stat"><div class="k">Conversas encontradas</div><div class="v">${corpus.totalConversations}</div></div>
      <div class="stat"><div class="k">Clientes diferentes</div><div class="v">${corpus.uniqueContacts}</div></div>
      <div class="stat"><div class="k">Mensagens de clientes</div><div class="v">${corpus.totalCustomerMessages}</div></div>
    </div>

    ${truncated ? `<div class="callout">Foi encontrada mais conversa do que o limite de seguranca desta primeira versao. O relatorio vai usar apenas as ${corpus.totalConversations} conversas mais recentes dentro do periodo.</div>` : ""}

    <div class="card">
      <h2 style="font-size:16px;margin-bottom:8px">Custo estimado</h2>
      <p class="lede" style="margin-bottom:10px">Baseado em ${inputTokens.toLocaleString("pt-BR")} tokens de entrada (o texto das conversas). O valor real pode variar um pouco.</p>
      <div class="v" style="font-family:'Fraunces',serif;font-size:28px">${formatUsd(estimatedCost)}</div>
    </div>

    <form method="POST" action="${escapeHtml(confirmUrl)}">
      <button class="btn" type="submit">Gerar relatorio completo →</button>
    </form>
  `;
  return pageShell("Estimativa do relatorio", body);
}

export function renderReportPage(args: {
  corpus: CorpusResult;
  truncated: boolean;
  months: number;
  report: InsightsReport;
  usage: Anthropic.Usage;
}): string {
  const { corpus, truncated, months, report, usage } = args;
  const realCost =
    (usage.input_tokens / 1_000_000) * OPUS5_INPUT_PER_M +
    (usage.output_tokens / 1_000_000) * OPUS5_OUTPUT_PER_M;

  const body = `
    <p class="eyebrow">Robo WhatsApp Cartel · ultimos ${months} meses</p>
    <h1>Perfil dos clientes e perguntas frequentes</h1>
    <p class="lede">Gerado a partir de ${corpus.totalConversations} conversas reais do WhatsApp da Cartel (${corpus.uniqueContacts} clientes, ${corpus.totalCustomerMessages} mensagens de clientes).</p>
    ${truncated ? `<div class="callout">Este relatorio usou as ${corpus.totalConversations} conversas mais recentes do periodo (havia mais do que o limite de seguranca desta versao).</div>` : ""}

    <section>
      <h2>Conversas por mes</h2>
      ${renderChart(corpus.monthly)}
    </section>

    <section>
      <h2>Quem sao os clientes</h2>
      <div class="card">
        <p style="margin:0 0 16px">${escapeHtml(report.resumo_geral)}</p>
        ${report.segmentos
          .map(
            (s) => `
          <div class="segment">
            <span class="name">${escapeHtml(s.nome)}</span>
            <span class="pct">${escapeHtml(s.proporcao_estimada)}</span>
            <p style="margin:4px 0 0;color:var(--muted);font-size:14.5px">${escapeHtml(s.descricao)}</p>
          </div>`,
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>Necessidades mais comuns</h2>
      <div class="card">
        <ul class="plain">
          ${report.necessidades_comuns.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}
        </ul>
      </div>
    </section>

    <section>
      <h2>Perguntas mais frequentes</h2>
      <div class="card">
        ${report.perguntas_frequentes
          .map(
            (q) => `
          <div class="qa">
            <div class="theme">${escapeHtml(q.tema)}<span class="pill">${escapeHtml(q.frequencia)}</span></div>
            <div class="example">"${escapeHtml(q.exemplo)}"</div>
            <div class="answer"><b>Como a equipe costuma responder:</b> ${escapeHtml(q.resposta_tipica)}</div>
          </div>`,
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2>Recomendacoes</h2>
      <div class="card">
        <ul class="plain">
          ${report.recomendacoes.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}
        </ul>
      </div>
    </section>

    <footer>
      Custo real desta analise: ${formatUsd(realCost)} (${usage.input_tokens.toLocaleString("pt-BR")} tokens de entrada, ${usage.output_tokens.toLocaleString("pt-BR")} de saida) &middot; gerado pelo robo da Cartel com Claude.
    </footer>
  `;
  return pageShell("Perfil dos clientes - Cartel", body);
}

export function renderPromptEditorPage(args: {
  prompt: string;
  isOverride: boolean;
  saveUrl: string;
  resetUrl: string;
  saved?: boolean;
}): string {
  const body = `
    <p class="eyebrow">Robo WhatsApp Cartel</p>
    <h1>Prompt de vendas</h1>
    <p class="lede">Texto que o robo usa pra responder no WhatsApp (precos, frete, regras de
    negocio). Editar aqui vale na hora, sem precisar de deploy.</p>

    ${args.saved ? `<div class="callout">Salvo. O robo ja esta usando o texto novo.</div>` : ""}

    ${
      args.isOverride
        ? `<div class="callout">Este texto foi editado por aqui e esta sobrepondo o padrao do
           codigo-fonte.</div>`
        : `<div class="callout">Nenhuma edicao feita ainda -- este e o texto padrao do codigo-fonte.</div>`
    }

    <form method="POST" action="${escapeHtml(args.saveUrl)}">
      <textarea class="editor" name="prompt" spellcheck="false">${escapeHtml(args.prompt)}</textarea>
      <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" type="submit">Salvar</button>
      </div>
    </form>
    <form method="POST" action="${escapeHtml(args.resetUrl)}" style="margin-top:10px">
      <button class="btn" type="submit" style="background:var(--surface-2);color:var(--ink)">
        Restaurar padrao do codigo
      </button>
    </form>
  `;
  return pageShell("Prompt de vendas", body);
}

export function renderErrorsPage(
  errors: { level: string; message: string; time: string; context?: unknown }[],
): string {
  const rows = errors
    .map(
      (e) => `
      <div class="qa">
        <div class="theme">${escapeHtml(e.time)}</div>
        <div class="answer">${escapeHtml(e.message)}</div>
        ${e.context ? `<div class="example"><code>${escapeHtml(JSON.stringify(e.context))}</code></div>` : ""}
      </div>`,
    )
    .join("");

  const body = `
    <p class="eyebrow">Robo WhatsApp Cartel</p>
    <h1>Erros recentes</h1>
    <p class="lede">Ultimos ${errors.length} erros registrados pelo servidor (mais recente primeiro).</p>
    ${
      errors.length === 0
        ? `<div class="callout">Nenhum erro registrado desde que o servidor subiu.</div>`
        : `<div class="card">${rows}</div>`
    }
  `;
  return pageShell("Erros recentes", body);
}
