import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { config } from "./config.js";

mkdirSync(config.dataDir, { recursive: true });

export function dataPath(filename: string): string {
  return join(config.dataDir, filename);
}

// Escrita atomica (grava num arquivo temporario e renomeia por cima do
// definitivo) para nunca deixar um arquivo pela metade se o processo cair no
// meio da escrita.
export function writeFileAtomic(path: string, content: string): void {
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, content, "utf8");
  renameSync(tmpPath, path);
}

export function readFileIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

export function deleteFileIfExists(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

export function readJsonIfExists<T>(path: string): T | null {
  const raw = readFileIfExists(path);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJsonAtomic(path: string, value: unknown): void {
  writeFileAtomic(path, JSON.stringify(value));
}
