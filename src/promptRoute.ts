import type { Request, Response } from "express";
import {
  getEffectiveSalesPrompt,
  isUsingPromptOverride,
  setSalesPromptOverride,
  resetSalesPromptOverride,
} from "./prompts/promptStore.js";
import { renderPromptEditorPage } from "./report/render.js";

export function handlePromptShow(req: Request, res: Response): void {
  res.status(200).send(
    renderPromptEditorPage({
      prompt: getEffectiveSalesPrompt(),
      isOverride: isUsingPromptOverride(),
      saveUrl: "/admin/prompt",
      resetUrl: "/admin/prompt/reset",
    }),
  );
}

export function handlePromptSave(req: Request, res: Response): void {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
  if (!prompt.trim()) {
    res.status(400).send(renderPromptEditorPage({
      prompt: getEffectiveSalesPrompt(),
      isOverride: isUsingPromptOverride(),
      saveUrl: "/admin/prompt",
      resetUrl: "/admin/prompt/reset",
    }));
    return;
  }
  setSalesPromptOverride(prompt);
  res.status(200).send(
    renderPromptEditorPage({
      prompt,
      isOverride: true,
      saveUrl: "/admin/prompt",
      resetUrl: "/admin/prompt/reset",
      saved: true,
    }),
  );
}

export function handlePromptReset(req: Request, res: Response): void {
  resetSalesPromptOverride();
  res.status(200).send(
    renderPromptEditorPage({
      prompt: getEffectiveSalesPrompt(),
      isOverride: false,
      saveUrl: "/admin/prompt",
      resetUrl: "/admin/prompt/reset",
      saved: true,
    }),
  );
}
