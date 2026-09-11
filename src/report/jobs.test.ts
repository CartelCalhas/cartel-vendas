import { test } from "node:test";
import assert from "node:assert/strict";
import { createJob, getJob, completeJob, failJob } from "./jobs.js";

test("jobs: comeca como 'processing' e getJob encontra pelo id", () => {
  const id = createJob();
  const job = getJob(id);
  assert.equal(job?.status, "processing");
});

test("jobs: completeJob guarda o html e muda o status pra 'done'", () => {
  const id = createJob();
  completeJob(id, "<html>relatorio</html>");
  const job = getJob(id);
  assert.equal(job?.status, "done");
  assert.equal(job?.html, "<html>relatorio</html>");
});

test("jobs: failJob guarda a mensagem de erro e muda o status pra 'error'", () => {
  const id = createJob();
  failJob(id, "falha ao chamar a API");
  const job = getJob(id);
  assert.equal(job?.status, "error");
  assert.equal(job?.error, "falha ao chamar a API");
});

test("jobs: id desconhecido retorna undefined", () => {
  assert.equal(getJob("id-que-nao-existe"), undefined);
});
