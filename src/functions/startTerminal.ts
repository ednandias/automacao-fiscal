import { getJSON } from "../utils/getJSON.js";
import { writeErrorLog } from "../utils/writeErrorLog.js";
import { formatDate, formatDuration } from "../utils/format.js";
import { insertOnCell } from "../utils/sheet.js";
import { api } from "../services/api.js";
import { useSpinner } from "../utils/useSpinner.js";
import type { Nfe } from "../types/index.js";
import { log } from "../utils/log.js";
import { pollJob } from "./pollJob.js";
import { getIdInfeDevolucao } from "../utils/getIdNfeDevolucao.js";

interface StartTerminalProps {
  filenames: string[];
  batch?: number;
  cellNfeDev?: string;
  onlyErrors?: boolean;
}

export async function startTerminal({
  filenames,
  batch = 0,
  cellNfeDev = "B",
  onlyErrors = false,
}: StartTerminalProps) {
  const notes = useSpinner();
  const generatingNote = useSpinner();
  const waitingResponse = useSpinner();

  for (const filename of filenames) {
    log("info", `🚀 Processo começou em ${formatDate(new Date())}`);

    const start = performance.now();

    const result = await getJSON(filename);

    if (
      !result?.nfes ||
      !result?.worksheet ||
      !result?.workbook ||
      !result?.pathFile
    )
      throw Error("Não foi possível continuar, variáveis faltando.");

    const { nfes, worksheet, workbook, pathFile } = result;

    let account = filename.replace(/_\D+/gm, "").toUpperCase();

    log("info", `Conta: ${account}`);

    switch (account) {
      case "ML1": {
        account = "514066249";
        break;
      }

      case "ML2": {
        account = "699017946";
        break;
      }

      case "ML3": {
        account = "751371366";
        break;
      }

      case "ML4": {
        account = "1105949144";
        break;
      }

      case "ML5": {
        account = "1468767285";
        break;
      }
    }

    let report = {
      total: 0,
      success: 0,
      error: 0,
    };

    function addReport(type: "success" | "error") {
      report = {
        ...report,
        [type]: report[type] + 1,
      };
    }

    try {
      notes.start("Buscando notas...");

      const response = await api.get<Nfe[]>(
        `/nfe/lista-nfe/${account}/514066249?dataIn=2023-12-31T23:59:59.000Z&dataFn=2026-06-05T10:08:44.641Z`,
      );

      notes.stop(`✅ ${response.data.length} notas encontradas!`);

      const nfesFiltered = nfes.filter((n) =>
        onlyErrors ? n.NFE_DEV == "Erro" : !n.NFE_DEV,
      );

      const nfesBatch = nfesFiltered.slice(
        0,
        batch === 0 ? nfesFiltered.length : batch,
      );

      report = {
        ...report,
        total: nfesBatch.length,
      };

      for (const nfe of nfesBatch) {
        log("info", `Nota atual: ${nfe.NFE}`);

        const originalIndex = nfes.findIndex((n) => n.NFE === nfe.NFE);

        const nfeFound = response.data.find((n) => String(n.numnfe) == nfe.NFE);

        if (nfeFound?.id) {
          try {
            const { id } = await getIdInfeDevolucao(
              String(nfeFound.id),
              account,
            );

            try {
              generatingNote.start("Gerando nota de devolução...");

              const res = await api.post<{ jobId: string }>(
                `/nfe/gerar/${id}/${account}/514066249/EDNAN%20T.I`,
              );

              generatingNote.stop("✅ Nota gerada com sucesso!");

              waitingResponse.start("Aguardando resposta...");

              const result = await pollJob(res.data.jobId);

              waitingResponse.stop(
                "✅ Resposta obtida com sucesso, prosseguindo...",
              );

              if (result) {
                const parsed = JSON.parse(result) as {
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

                addReport("success");

                log(
                  "success",
                  `Nota Fiscal: ${nfe.NFE} -> Nota Fiscal Devolução: ${nfeDev}`,
                );
              } else {
                addReport("error");

                writeErrorLog(`SEM RESPOSTA NOTA DE DEVOLUÇÃO ${nfe.NFE}`);

                insertOnCell({
                  originalIndex,
                  pathFile,
                  worksheet,
                  value: "Erro",
                  workbook,
                  cellNfeDev,
                });

                continue;
              }
            } catch (err) {
              addReport("error");

              log("error", err);

              generatingNote.stop("Erro ao gerar nota!");
              waitingResponse.stop("Erro ao obter a resposta!");

              writeErrorLog(`ERRO AO GERAR NOTA DE DEVOLUÇÃO ${nfe.NFE}`, err);

              insertOnCell({
                originalIndex,
                pathFile,
                worksheet,
                value: "Erro",
                workbook,
                cellNfeDev,
              });

              continue;
            }
          } catch (err) {
            addReport("error");

            log("error", err);

            writeErrorLog(`ERRO AO CRIAR NOTA DE DEVOLUÇÃO ${nfe.NFE}`, err);

            insertOnCell({
              originalIndex,
              pathFile,
              worksheet,
              value: "Erro",
              workbook,
              cellNfeDev,
            });

            continue;
          }
        } else {
          addReport("error");

          writeErrorLog(`NOTA NÃO ENCONTRADA ${nfe.NFE}`);

          insertOnCell({
            originalIndex,
            pathFile,
            worksheet,
            value: "Erro",
            workbook,
            cellNfeDev,
          });

          continue;
        }
      }
    } catch (err) {
      log("error", err);

      writeErrorLog("ERRO AO BUSCAR NOTAS", err);
      notes.stop("Falha ao encontrar notas, tente novamente mais tarde!");
    }

    log(
      "info",
      `Total de ${report.total} notas concluídas, com ${report.success} bem sucedidas e ${report.error} com erro, verifique os logs!`,
    );

    log("info", `☑️  Processo finalizado em ${formatDate(new Date())}`);
    log(
      "info",
      `⏱️  Tempo de conclusão: ${formatDuration(performance.now() - start)}`,
    );
  }
}
