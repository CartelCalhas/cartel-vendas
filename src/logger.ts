// Logger estruturado minimo (sem dependencia externa): grava uma linha JSON
// por evento em stdout/stderr (o que o Render e a maioria dos hosts Node ja
// coletam) e mantem os ultimos erros em memoria para inspecao rapida via
// GET /admin/errors, sem precisar abrir o log do host.

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  time: string;
  context?: Record<string, unknown>;
}

const MAX_RECENT_ERRORS = 50;
const recentErrors: LogEntry[] = [];

function serializeContext(
  context?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = value instanceof Error ? { message: value.message, stack: value.stack } : value;
  }
  return out;
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    message,
    time: new Date().toISOString(),
    context: serializeContext(context),
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    recentErrors.push(entry);
    if (recentErrors.length > MAX_RECENT_ERRORS) recentErrors.shift();
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};

export function getRecentErrors(): LogEntry[] {
  return [...recentErrors].reverse();
}
