import * as p from "@clack/prompts";
import path from "node:path";
import {
  SHEETS_DIR,
  STATUS,
  getAccountId,
  getAccountLabel,
} from "../config.js";
import { isNoResponse } from "../api/client.js";
import {
  JobFailedError,
  LockTimeoutError,
  getOrCreateDevolucao,
  isGenerationBlocked,
  parseJobResult,
  releaseGenerationLock,
  requestEmission,
  searchNfe,
  waitForJob,
  waitForUnlock,
} from "../api/nfe.js";
import {
  isOpenElsewhere,
  openSpreadsheet,
  type SheetRow,
  type Spreadsheet,
} from "../sheets/spreadsheet.js";
import { getLastEmission, recordEmission, type Emission } from "./history.js";
import { errorMessage, log, writeErrorLog } from "../utils/logger.js";
import { formatDate, formatDuration } from "../utils/format.js";
import { randomSleep } from "../utils/sleep.js";

export interface RunEmissionOptions {
  filenames: string[];
  //? quantas notas emitir por arquivo (0 = todas)
  batch?: number;
  //? modo de recuperação: só as linhas marcadas como Erro
  onlyErrors?: boolean;
}

type Outcome = "success" | "error" | "verify";

interface RunState {
  //? já houve um pedido de emissão nesta execução (para espaçar os próximos)
  hasRequested: boolean;
  report: Record<string, Record<Outcome | "total", number>>;
  issues: string[];
}

interface NoteContext {
  filename: string;
  account: string;
  sheet: Spreadsheet;
  nfe: SheetRow;
  state: RunState;
}

export async function runEmission({
  filenames,
  batch = 0,
  onlyErrors = false,
}: RunEmissionOptions) {
  const state: RunState = { hasRequested: false, report: {}, issues: [] };
  const start = performance.now();

  log("info", `🚀 Processo começou em ${formatDate(new Date())}`);

  try {
    for (const filename of filenames) {
      await processFile(filename, { batch, onlyErrors }, state);
    }
  } catch (err) {
    if (!(err instanceof LockTimeoutError)) throw err;

    log("error", `⛔ ${err.message} Processo interrompido.`);
    state.issues.push(`⛔ ${err.message} Processo interrompido antes de terminar.`);
  }

  printSummary(state, performance.now() - start);
}

async function processFile(
  filename: string,
  { batch, onlyErrors }: { batch: number; onlyErrors: boolean },
  state: RunState,
) {
  log("info", `📄 Arquivo: ${filename}`);

  const account = getAccountId(filename);

  if (!account) {
    log("error", `❌ Conta não identificada pelo nome "${filename}" (esperado ml1_..., ml2_...). Arquivo ignorado.`);
    return;
  }

  const pathFile = path.join(SHEETS_DIR, filename);

  //? salvar a planilha aberta depois do processo apagaria tudo que o bot gravou
  if (isOpenElsewhere(pathFile)) {
    log("error", `❌ ${filename} está aberto no Excel/LibreOffice. Feche o arquivo e rode novamente.`);
    return;
  }

  let sheet: Spreadsheet;

  try {
    sheet = openSpreadsheet(pathFile);
  } catch (err) {
    log("error", `❌ Não foi possível ler ${filename}: ${errorMessage(err)}`);
    return;
  }

  log("info", `Conta: ${getAccountLabel(account)} (${account})`);

  const selected = selectRows(sheet.rows, onlyErrors);
  const rows = batch > 0 ? selected.slice(0, batch) : selected;

  const report = (state.report[account] ??= { total: 0, success: 0, error: 0, verify: 0 });
  report.total += rows.length;

  for (const nfe of rows) {
    report[await processNote({ filename, account, sheet, nfe, state })]++;
  }
}

async function processNote(ctx: NoteContext): Promise<Outcome> {
  const { nfe, account, state } = ctx;
  const spinner = p.spinner();

  log("info", `Nota atual: ${nfe.NFE} (linha ${nfe.row})`);

  //? 1. histórico local: impede emitir de novo o que já foi (ou pode ter sido) emitido
  const last = isForced(nfe) ? undefined : getLastEmission(account, nfe.NFE);

  if (last?.status === "emitida" && last.nfeDev) {
    log("warn", `⚠️ Nota ${nfe.NFE} já foi emitida em ${formatDate(new Date(last.date))} (devolução ${last.nfeDev}). Gravando sem emitir de novo.`);
    write(ctx, last.nfeDev);
    return "success";
  }

  if (last?.status === "solicitada" || last?.status === "pendente") {
    return verify(ctx, `EMISSÃO ANTERIOR SEM CONFIRMAÇÃO ${nfe.NFE} (job ${last.jobId ?? "desconhecido"})`);
  }

  //? 2. busca a nota original
  spinner.start("Buscando nota...");

  let original: Awaited<ReturnType<typeof searchNfe>>;

  try {
    original = await searchNfe(account, nfe.NFE);
  } catch (err) {
    spinner.error(`Erro ao buscar nota ${nfe.NFE}.`);
    return fail(ctx, `ERRO AO BUSCAR NOTA ${nfe.NFE}`, err);
  }

  if (!original) {
    spinner.error(`Nota ${nfe.NFE} não encontrada.`);
    return fail(ctx, `NOTA NÃO ENCONTRADA ${nfe.NFE}`);
  }

  spinner.stop(`Nota ${original.numnfe} encontrada.`);

  //? 3. espaça as emissões e espera a trava de geração liberar
  if (state.hasRequested) {
    spinner.start("Aguardando delay...");
    const delay = await randomSleep();
    spinner.stop(`Delay concluído: ${delay / 1000}s`);
  }

  try {
    if (await isGenerationBlocked()) {
      spinner.start("Aguardando liberação da geração...");

      try {
        await waitForUnlock();
        spinner.stop("Geração liberada.");
      } catch (err) {
        spinner.error("A geração não foi liberada.");
        throw err;
      }
    }
  } catch (err) {
    if (err instanceof LockTimeoutError) throw err;
    return fail(ctx, `ERRO AO CONSULTAR TRAVA DE GERAÇÃO ${nfe.NFE}`, err);
  }

  //? 4. cria (ou reaproveita) o rascunho da devolução
  spinner.start("Preparando nota de devolução...");

  let devolucao: Awaited<ReturnType<typeof getOrCreateDevolucao>>;

  try {
    devolucao = await getOrCreateDevolucao(original, account);
    spinner.stop(devolucao.created ? "Nota de devolução criada." : "Nota de devolução já existia, reaproveitando.");
  } catch (err) {
    spinner.error("Erro ao preparar a nota de devolução.");
    return fail(ctx, `ERRO AO CRIAR NOTA DE DEVOLUÇÃO ${nfe.NFE}`, err);
  }

  //? 5. solicita a emissão. Daqui em diante um erro pode significar que a nota FOI emitida
  state.hasRequested = true;
  spinner.start("Solicitando emissão...");

  let jobId: string | undefined;

  try {
    jobId = await requestEmission(devolucao.id, account);
  } catch (err) {
    //? sem resposta (timeout/rede): o servidor pode ter recebido o pedido
    if (isNoResponse(err)) {
      spinner.error("Sem resposta ao solicitar emissão.");
      record(ctx, { status: "pendente" });
      return verify(ctx, `SEM RESPOSTA AO SOLICITAR EMISSÃO ${nfe.NFE}`, err);
    }

    spinner.error("Erro ao solicitar emissão.");
    await releaseGenerationLock();
    record(ctx, { status: "falhou" });
    return fail(ctx, `ERRO AO GERAR NOTA DE DEVOLUÇÃO ${nfe.NFE}`, err);
  }

  if (!jobId) {
    spinner.error("A API não retornou o job da emissão.");
    record(ctx, { status: "pendente" });
    return verify(ctx, `EMISSÃO SEM JOB ${nfe.NFE}`);
  }

  record(ctx, { status: "solicitada", jobId });

  //? 6. aguarda o resultado da SEFAZ
  spinner.message("Aguardando resposta...");

  let nfeDev: string;

  try {
    nfeDev = parseJobResult(await waitForJob(jobId));
  } catch (err) {
    if (err instanceof JobFailedError) {
      spinner.error("Emissão não autorizada.");
      await releaseGenerationLock();
      record(ctx, { status: "falhou", jobId });
      return fail(ctx, `ERRO AO GERAR NOTA DE DEVOLUÇÃO ${nfe.NFE}`, err);
    }

    spinner.error("Não foi possível confirmar a emissão.");
    record(ctx, { status: "pendente", jobId });
    return verify(ctx, `EMISSÃO NÃO CONFIRMADA ${nfe.NFE} (job ${jobId})`, err);
  }

  spinner.stop("Emissão confirmada.");

  //? 7. grava primeiro no histórico, depois na planilha
  record(ctx, { status: "emitida", jobId, nfeDev });
  write(ctx, nfeDev);

  log("success", `Nota Fiscal: ${nfe.NFE} -> Nota Fiscal Devolução: ${nfeDev}`);

  return "success";
}

const isError = (r: SheetRow) =>
  r.NFE_DEV.toUpperCase().includes(STATUS.ERROR.toUpperCase());

const isForced = (r: SheetRow) => r.NFE_DEV.toUpperCase() === STATUS.FORCE;

//? escolhe as linhas a processar sem repetir NF: se a mesma nota aparece em
//? mais de uma linha, só a primeira é emitida
function selectRows(rows: SheetRow[], onlyErrors: boolean) {
  const resolved = new Set(
    rows.filter((r) => r.NFE_DEV && !isError(r) && !isForced(r)).map((r) => r.NFE),
  );

  const selected = new Map<string, SheetRow>();

  for (const r of rows) {
    const wanted = isForced(r) || (onlyErrors ? isError(r) : !r.NFE_DEV);
    if (!wanted) continue;

    const first = selected.get(r.NFE);

    if (first) {
      log("warn", `⚠️ Nota ${r.NFE} repetida na linha ${r.row} (já na linha ${first.row}), ignorada.`);
      continue;
    }

    if (!isForced(r) && resolved.has(r.NFE)) {
      log("warn", `⚠️ Nota ${r.NFE} da linha ${r.row} já tem devolução em outra linha, ignorada.`);
      continue;
    }

    selected.set(r.NFE, r);
  }

  return [...selected.values()];
}

function write(ctx: NoteContext, value: string) {
  try {
    ctx.sheet.write(ctx.nfe.row, value);
  } catch (err) {
    const message = `FALHA AO GRAVAR "${value}" NA LINHA ${ctx.nfe.row} DE ${ctx.filename}`;

    log("error", `❌ ${message}: ${errorMessage(err)}`);
    writeErrorLog(message, err);
  }
}

function record(ctx: NoteContext, data: Pick<Emission, "status" | "jobId" | "nfeDev">) {
  recordEmission({ file: ctx.filename, account: ctx.account, nfe: ctx.nfe.NFE, ...data });
}

function fail(ctx: NoteContext, message: string, err?: unknown): Outcome {
  log("error", err ? `${message}: ${errorMessage(err)}` : message);
  writeErrorLog(message, err);
  write(ctx, STATUS.ERROR);
  ctx.state.issues.push(`❌ ${ctx.filename} linha ${ctx.nfe.row}: ${message}`);

  return "error";
}

//? não sabemos se a nota foi emitida: marca para conferência manual, nunca reenvia sozinho
function verify(ctx: NoteContext, message: string, err?: unknown): Outcome {
  log("warn", err ? `⚠️ ${message}: ${errorMessage(err)}` : `⚠️ ${message}`);
  writeErrorLog(message, err);
  write(ctx, STATUS.VERIFY);
  ctx.state.issues.push(`⚠️ ${ctx.filename} linha ${ctx.nfe.row}: ${message}`);

  return "verify";
}

function printSummary(state: RunState, elapsed: number) {
  // eslint-disable-next-line no-console
  console.clear();

  log("info", `✅ Processo finalizado em ${formatDate(new Date())}`);
  log("info", `⏱️  Tempo de conclusão: ${formatDuration(elapsed)}`);

  for (const [account, r] of Object.entries(state.report)) {
    log(
      "info",
      `📊 ${getAccountLabel(account)}: ${r.success}/${r.total} emitidas · ${r.error} com erro · ${r.verify} a verificar`,
    );
  }

  if (state.issues.length > 0) {
    log("warn", "\nNotas que precisam de atenção:");
    for (const issue of state.issues) log("warn", issue);
  }
}
