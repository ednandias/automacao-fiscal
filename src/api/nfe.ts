import { api, isNotFound } from "./client.js";
import { MAIN_ACCOUNT, TIMING, USER_NAME } from "../config.js";
import type { CreateDevolucaoResponse, JobStatusResponse, Nfe } from "../types.js";
import { errorMessage, log } from "../utils/logger.js";
import { sleep } from "../utils/sleep.js";

//? a emissão terminou e NÃO foi autorizada (pode tentar de novo)
export class JobFailedError extends Error {}

//? a trava de geração não liberou dentro do tempo limite
export class LockTimeoutError extends Error {}

const FAILED_STATUSES = ["failed", "error"];

//? nota original; undefined se não existir
export async function searchNfe(account: string, numnfe: string) {
  try {
    const { data } = await api.get<Nfe>(`/nfe/search/${MAIN_ACCOUNT}`, {
      params: { account, numnfe },
    });

    return data?.id ? data : undefined;
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw err;
  }
}

//? reaproveita o rascunho da devolução se já existir, senão cria um novo
export async function getOrCreateDevolucao(nfe: Nfe, account: string) {
  try {
    const { data } = await api.get<{ id: string; numnfe: string }>(
      `/nfe/check/${MAIN_ACCOUNT}`,
      { params: { id: nfe.id, nfe: nfe.numnfe, account } },
    );

    if (!data?.id || !data?.numnfe) {
      throw new Error("Resposta inesperada ao consultar nota de devolução");
    }

    return { id: String(data.id), created: false };
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  const { data } = await api.post<CreateDevolucaoResponse>(
    `/nfe/devolucao/${nfe.id}/${MAIN_ACCOUNT}`,
  );

  return { id: String(data.idnfe_devolucao), created: true };
}

//? pede a emissão e devolve o id do job que acompanha o resultado
export async function requestEmission(devolucaoId: string, account: string) {
  const { data } = await api.post<{ jobId?: string }>(
    `/nfe/gerar/${devolucaoId}/${account}/${MAIN_ACCOUNT}/${encodeURIComponent(USER_NAME)}`,
  );

  return data?.jobId;
}

export async function waitForJob(jobId: string): Promise<unknown> {
  for (let attempt = 1; attempt <= TIMING.jobAttempts; attempt++) {
    try {
      const { data } = await api.get<JobStatusResponse>(`/nfe/status/${jobId}`);

      if (data.status === "success") return data.result;

      if (FAILED_STATUSES.includes(data.status)) {
        throw new JobFailedError(data.message || `Job ${jobId}: ${data.status}`);
      }
    } catch (err) {
      if (err instanceof JobFailedError) throw err;
      //? erro de rede: tenta de novo na próxima volta
    }

    await sleep(TIMING.jobInterval);
  }

  throw new Error(
    `Job ${jobId} não terminou após ${TIMING.jobAttempts} tentativas`,
  );
}

//? extrai o número da devolução do resultado do job
export function parseJobResult(result: unknown): string {
  const parsed = (typeof result === "string" ? JSON.parse(result) : result) as {
    status?: boolean;
    message?: string;
  } | null;

  if (parsed?.status === false) {
    throw new JobFailedError(parsed.message || "Emissão rejeitada");
  }

  const nfeDev = String(parsed?.message ?? "").replace(/\D/g, "");

  //? número de NF-e tem no máximo 9 dígitos; mais que isso é mensagem em formato inesperado
  if (!nfeDev || nfeDev.length > 9) {
    throw new Error(`Resposta inesperada do job: ${JSON.stringify(result)}`);
  }

  return nfeDev;
}

//? a API só emite uma nota por vez na conta principal
export async function isGenerationBlocked() {
  const { data } = await api.get<{ blocked: boolean }>(
    `/status-geracao/${MAIN_ACCOUNT}`,
  );

  return data.blocked;
}

export async function waitForUnlock() {
  const deadline = Date.now() + TIMING.lockMaxWait;

  while (await isGenerationBlocked()) {
    if (Date.now() > deadline) {
      throw new LockTimeoutError("A geração continua bloqueada após o tempo limite.");
    }

    await sleep(TIMING.lockInterval);
  }
}

//? libera a trava após uma falha; um erro aqui não pode derrubar o processo
export async function releaseGenerationLock() {
  try {
    await api.patch(`/status-geracao/${MAIN_ACCOUNT}`, {});
  } catch (err) {
    log("warn", `Não foi possível liberar a trava de geração: ${errorMessage(err)}`);
  }
}
