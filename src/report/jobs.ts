import { randomUUID } from "crypto";

export interface ReportJob {
  status: "processing" | "done" | "error";
  html?: string;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, ReportJob>();
const JOB_TTL_MS = 30 * 60 * 1000;

function cleanup(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

export function createJob(): string {
  cleanup();
  const id = randomUUID();
  jobs.set(id, { status: "processing", createdAt: Date.now() });
  return id;
}

export function getJob(id: string): ReportJob | undefined {
  return jobs.get(id);
}

export function completeJob(id: string, html: string): void {
  jobs.set(id, { status: "done", html, createdAt: Date.now() });
}

export function failJob(id: string, error: string): void {
  jobs.set(id, { status: "error", error, createdAt: Date.now() });
}
