import { dataPath, readFileIfExists, writeFileAtomic, deleteFileIfExists } from "../fileStore.js";
import { SALES_SYSTEM_PROMPT } from "./salesPrompt.js";

const OVERRIDE_PATH = dataPath("sales-prompt-override.txt");

// Preco/frete/regras de negocio vivem dentro do prompt de vendas. Sem isso,
// qualquer ajuste de tabela exige mexer em codigo e fazer deploy -- o que
// tira o time comercial (nao-tecnico) do processo. Este override, editavel
// pela pagina /admin/prompt (autenticada), deixa o texto efetivo trocavel na
// hora, sem deploy, sempre com o texto do codigo como padrao de fallback.
export function getEffectiveSalesPrompt(): string {
  return readFileIfExists(OVERRIDE_PATH) ?? SALES_SYSTEM_PROMPT;
}

export function isUsingPromptOverride(): boolean {
  return readFileIfExists(OVERRIDE_PATH) !== null;
}

export function setSalesPromptOverride(text: string): void {
  writeFileAtomic(OVERRIDE_PATH, text);
}

export function resetSalesPromptOverride(): void {
  deleteFileIfExists(OVERRIDE_PATH);
}

export function getDefaultSalesPrompt(): string {
  return SALES_SYSTEM_PROMPT;
}
