import { getJSON } from "../utils/get-json.js";
import { writeErrorLog } from "../utils/write-err-log.js";
import { formatDate, formatDuration } from "../utils/format.js";
import { insertOnCell } from "../utils/sheet.js";
import { api } from "../services/api.js";
import { useSpinner } from "../utils/spinner.js";
import { log } from "../utils/log.js";
import { pollJob } from "./poll-job.js";
import { getIdNfeDevolucao } from "../utils/get-id-nfe-devolucao.js";
import { sleep, randomSleep } from "../utils/sleep.js";

interface StartTerminalProps {
  filenames: string[];
  batch?: number;
  cellNfeDev?: string;
  onlyErrors?: boolean;
}

const MAIN_ACCOUNT = "514066249";

export async function startTerminal({
  filenames,
  batch = 0,
  cellNfeDev = "B",
  onlyErrors = false,
}: StartTerminalProps) {
  const note = useSpinner();
  const generatingNote = useSpinner();
  const waitingResponse = useSpinner();
  const delayTime = useSpinner();

  const report: Record<
    string,
    { total: number; success: number; error: number }
  > = {};

  function getAccountReport(account: string) {
    return (report[account] ??= { total: 0, success: 0, error: 0 });
  }

  function addReport(account: string, type: "success" | "error") {
    getAccountReport(account)[type]++;
  }

  function addTotal(account: string, value: number) {
    getAccountReport(account).total = value;
  }

  const ACCOUNT_IDS: Record<string, string> = {
    ML1: "514066249",
    ML2: "699017946",
    ML3: "751371366",
    ML4: "1105949144",
    ML5: "1468767285",
  };

  function getAccountLabel(account: string) {
    const arr = Object.values(ACCOUNT_IDS);

    const index = arr.findIndex((acc) => acc == account);

    return Object.keys(ACCOUNT_IDS)[index];
  }

  const start = performance.now();

  for (const filename of filenames) {
    log("info", `🚀 Processo começou em ${formatDate(new Date())}`);

    const fileData = await getJSON(filename);

    if (
      !fileData?.nfes ||
      !fileData?.worksheet ||
      !fileData?.workbook ||
      !fileData?.pathFile
    )
      throw Error("Não foi possível continuar, variáveis faltando.");

    const { nfes, worksheet, workbook, pathFile } = fileData;

    const account =
      ACCOUNT_IDS[filename.replace(/_\D+/gm, "").toUpperCase()] ??
      filename.replace(/_\D+/gm, "").toUpperCase();

    let originalIndex: number | undefined = undefined;

    log("info", `Conta: ${account}`);

    function registerError(
      account: string,
      originalIndex: number,
      message: string,
      err?: unknown,
    ) {
      addReport(account, "error");

      log("error", err ?? message);

      writeErrorLog(message, err);

      insertOnCell({
        originalIndex,
        pathFile,
        worksheet,
        value: "Erro",
        workbook,
        cellNfeDev,
      });
    }

    async function checkStatus(): Promise<boolean> {
      const response = await api.get<{ blocked: boolean }>(
        `/status-geracao/${MAIN_ACCOUNT}`,
      );

      return response.data.blocked;
    }

    async function freeStatus() {
      await api.patch(`/status-geracao/${MAIN_ACCOUNT}`, {});
    }

    try {
      const nfesFiltered = nfes.filter((n) =>
        onlyErrors ? n.NFE_DEV.includes("Erro") : !n.NFE_DEV,
      );

      const nfesBatch = nfesFiltered.slice(
        0,
        batch === 0 ? nfesFiltered.length : batch,
      );

      addTotal(account, nfesBatch.length);

      for (const [index, nfe] of nfesBatch.entries()) {
        log("info", `Nota atual: ${nfe.NFE}`);

        originalIndex = nfes.findIndex((n) => n.NFE === nfe.NFE);

        note.start("Buscando nota...");

        const response = await api.get(
          `/nfe/search/${MAIN_ACCOUNT}?account=${account}&numnfe=${nfe.NFE}`,
        );

        const nfeFound = response.data;

        let blocked = true;

        if (nfeFound?.id) {
          note.stop(`✅ Nota ${nfeFound.numnfe} encontrada.`);

          try {
            while (blocked) {
              blocked = await checkStatus();

              await sleep(5000);
            }

            const notaDevolucao = await getIdNfeDevolucao({
              account,
              id: String(nfeFound.id),
              nfe: String(nfeFound.numnfe),
            });

            if (!notaDevolucao) {
              continue;
            }

            try {
              generatingNote.start("Gerando nota de devolução...");

              const res = await api.post<{ jobId: string }>(
                `/nfe/gerar/${notaDevolucao?.id}/${account}/${MAIN_ACCOUNT}/EDNAN%20T.I`,
              );

              generatingNote.stop("✅ Nota gerada com sucesso!");

              waitingResponse.start("Aguardando resposta...");

              const jobResult = await pollJob(res.data.jobId);

              waitingResponse.stop(
                "✅ Resposta obtida com sucesso, prosseguindo...",
              );

              if (jobResult) {
                const parsed = JSON.parse(jobResult) as {
                  status: boolean;
                  message: string;
                };

                const nfeDev = parsed.message.replace(/(\D)/gm, "").trim();

                insertOnCell({
                  originalIndex,
                  pathFile,
                  worksheet,
                  value: nfeDev,
                  workbook,
                  cellNfeDev,
                });

                addReport(account, "success");

                log(
                  "success",
                  `Nota Fiscal: ${nfe.NFE} -> Nota Fiscal Devolução: ${nfeDev}`,
                );
              } else {
                registerError(
                  account,
                  originalIndex,
                  `SEM RESPOSTA NOTA DE DEVOLUÇÃO ${nfe.NFE}`,
                );

                continue;
              }
            } catch (err) {
              await freeStatus();

              const error = err instanceof Error ? err : new Error(String(err));

              generatingNote.stop("Erro ao gerar nota!");
              waitingResponse.stop("Erro ao obter a resposta!");

              registerError(
                account,
                originalIndex,
                `ERRO AO GERAR NOTA DE DEVOLUÇÃO ${nfe.NFE}`,
                error,
              );

              continue;
            }
          } catch (err) {
            await freeStatus();

            const error = err instanceof Error ? err : new Error(String(err));

            registerError(
              account,
              originalIndex,
              `ERRO AO CRIAR NOTA DE DEVOLUÇÃO ${nfe.NFE}`,
              error,
            );

            continue;
          }
        } else {
          note.stop(`❌ Nota ${nfeFound.numnfe} não encontrada.`);

          registerError(
            account,
            originalIndex,
            `NOTA NÃO ENCONTRADA ${nfe.NFE}`,
          );

          continue;
        }

        if (nfesBatch.length > index + 1) {
          delayTime.start("Aguardando delay...");
          const delay = await randomSleep();
          delayTime.stop(`✅ Delay concluído: ${delay / 1000}s`);
        }
      }
    } catch (err) {
      await freeStatus();

      const error = err instanceof Error ? err : new Error(String(err));

      registerError(account, originalIndex!, `ERRO AO BUSCAR NOTA`, error);

      note.stop("Falha ao encontrar nota, tente novamente mais tarde!");
    }
  }

  console.clear();

  log("info", `✅ Processo finalizado em ${formatDate(new Date())}`);
  log(
    "info",
    `⏱️  Tempo de conclusão: ${formatDuration(performance.now() - start)}`,
  );

  for (const [key, value] of Object.entries(report)) {
    log("info", `📊 ${getAccountLabel(key)}: ${value.success}/${value.total}`);
  }
}
