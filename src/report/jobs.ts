import { randomUUID } from "crypto";
import { dataPath, readJsonIfExists, writeJsonAtomic } from "../fileStore.js";

export interface ReportJob {
  status: "processing" | "done" | "error";
  html?: string;
  error?: string;
  createdAt: number;
}

const STORE_PATH = dataPath("jobs.json");
const JOB_TTL_MS = 30 * 60 * 1000;

// Jobs de relatorio/pendencias rodam em segundo plano e um usuario fica
// consultando o status pela pagina de espera; persistir em disco (em vez de
// um Map puro em memoria) evita perder o resultado se o processo reiniciar
// no meio disso (comum em hosts free que dormem/reciclam a instancia).
let jobs: Record<string, ReportJob> = readJsonIfExists<Record<string, ReportJob>>(STORE_PATH) ?? {};

function persist(): void {
  writeJsonAtomic(STORE_PATH, jobs);
}

function cleanup(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  let changed = false;
  for (const [id, job] of Object.entries(jobs)) {
    if (job.createdAt < cutoff) {
      delete jobs[id];
      changed = true;
    }
  }
  if (changed) persist();
}

export function createJob(): string {
  cleanup();
  const id = randomUUID();
  jobs[id] = { status: "processing", createdAt: Date.now() };
  persist();
  return id;
}

export function getJob(id: string): ReportJob | undefined {
  return jobs[id];
}

export function completeJob(id: string, html: string): void {
  jobs[id] = { status: "done", html, createdAt: Date.now() };
  persist();
}

export function failJob(id: string, error: string): void {
  jobs[id] = { status: "error", error, createdAt: Date.now() };
  persist();
}
