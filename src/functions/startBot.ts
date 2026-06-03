import path from "node:path";
import { chromium, type Page } from "playwright";

import chalk from "chalk";
import { getJSON } from "../utils/getJSON.js";
import { sleep } from "../utils/sleep.js";
import { writeErrorLog } from "../utils/writeErrorLog.js";
import { formatDate, formatDuration } from "../utils/format.js";
import { insertOnCell } from "../utils/sheet.js";

interface StartBotProps {
  filenames: string[];
  batch?: number;
  isHeadless?: boolean;
  cellNfeDev?: string;
  onlyErrors?: boolean;
  timeout?: number;
  longTimeout?: number;
}

//? onde fica armazenado a sessão do site (login)
const SESSION_DIR = path.resolve("./src/temp/playwright-session");

export async function startBot({
  filenames,
  batch = 10,
  isHeadless = true,
  cellNfeDev = "B",
  onlyErrors = false,
  timeout = 60000,
  longTimeout = 120000,
}: StartBotProps) {
  //! IMPORTANTE: CONFIGURAR
  // const FILENAME = "ml1_sac.xlsx"; //? nome do arquivo
  // const ACCOUNT: string = "ML1"; //? apelido da conta
  // const BATCH = 1; //? máximo de notas que vai fazer
  // const HEADLESS = false; //? true = background, false = foreground
  // const CELL_NFE_DEV = "B"; //? localização da coluna NFE_DEV
  // const ONLY_ERRORS = false; //? apenas notas com erro
  // const timeout = 60000; //? 1 minuto
  // const longTimeout = 120000; //? 2 minutos

  console.log(chalk.cyan(`🚀 Processo começou em ${formatDate(new Date())}`));

  const start = performance.now();

  for (const filename of filenames) {
    //? busca arquivo
    const result = await getJSON(filename);

    //? se não existir variaveis, quebra a aplicação para não continuar
    if (
      !result?.nfes ||
      !result?.worksheet ||
      !result?.workbook ||
      !result?.pathFile
    )
      throw Error("Não foi possível continuar, variaáveis faltando.");

    const { nfes, worksheet, workbook, pathFile } = result;

    //? roda o navegador com a sessão salva
    const context = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: isHeadless,
      ignoreHTTPSErrors: true,
      timeout,
      args: [
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--force-device-scale-factor=1",
        "--high-dpi-support=1",
      ],
    });

    //? inicia nova página
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);

    let devolutionPage: Page | null = null;

    //? vai para página e espera o conteúdo carregar
    await page.goto("https://ziphub.com.br/listagem/nfe", {
      waitUntil: "domcontentloaded",
      timeout,
    });

    const account = filename.replace(/_\D+/gm, "").toUpperCase();

    //? seleciona uma das contas no select
    switch (account) {
      case "ML1": {
        await page.getByRole("combobox").first().selectOption("514066249");
        break;
      }

      case "ML2": {
        await page.getByRole("combobox").first().selectOption("699017946");
        break;
      }

      case "ML3": {
        await page.getByRole("combobox").first().selectOption("751371366");
        break;
      }

      case "ML4": {
        await page.getByRole("combobox").first().selectOption("1105949144");
        break;
      }

      case "ML5": {
        await page.getByRole("combobox").first().selectOption("1468767285");
        break;
      }
    }

    //? clica no input "Data Inicial"
    await page.getByRole("textbox").first().click();

    //? aperta End para ir para o final da data
    await page.getByRole("textbox").first().press("End");

    //? aperta Shift + Home para selecionar o texto e ir para o começo
    await page.getByRole("textbox").first().press("Shift+Home");

    //? prenche a data
    await page.getByRole("textbox").first().fill("01/01/2024");

    //? dispara uma promise que espera AMBOS: o botão do clique acontecer e a resposta da api der sucesso
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/nfe/lista-nfe") && res.status() === 200,
      ),
      page.getByRole("button", { name: "Buscar" }).click(),
    ]);

    //? filtrando apenas as linhas que não estiverem preenchidas
    const nfesFiltered = nfes.filter((n) =>
      onlyErrors ? n.NFE_DEV == "Erro" : !n.NFE_DEV,
    );

    //? faz um batch para pegar apenas uma certa quantidade de notas
    const nfesBatch = nfesFiltered.slice(0, batch);

    //? percorre nota por nota
    for (const nfe of nfesBatch) {
      devolutionPage = null;
      //? acha o índice no array original (não no filtrado)
      const originalIndex = nfes.findIndex((n) => n.NFE === nfe.NFE);

      try {
        //? pesquisa o número da nota no input
        await page
          .getByRole("textbox", { name: "Pesquisar..." })
          .fill(String(nfe.NFE));

        await sleep();

        let found = false;
        let currentPage = 1;

        //? enquanto a nota não tiver sido encontrada
        while (!found) {
          //? busca o número da EXATO da nota
          const targetRow = page.locator("#table-nfe tbody tr").filter({
            has: page.locator("td strong.numero-nota", {
              hasText: new RegExp(`^${nfe.NFE}$`),
            }),
          });

          //? se encontrar, continua
          if ((await targetRow.count()) > 0) {
            found = true;

            //? aguarda o processo da página terminar
            const devolutionPagePromise = page.waitForEvent("popup");

            //? localizao botão de gerar devolução
            await targetRow.locator(".btn.btn-outline-warning").first().click();

            //? dispara uma promise que espera AMBOS: o botão do clique acontecer e a resposta da api der sucesso
            await Promise.all([
              page.waitForResponse(
                (res) =>
                  res.url().includes("/nfe/devolucao") && res.status() === 201,
              ),
              await page
                .getByRole("button", { name: "Confirmar e Gerar Devolução" })
                .click(),
            ]);

            //? aguarda abrir a nova aba
            devolutionPage = await devolutionPagePromise;

            //? seta um tempo de espera maior para essa página
            devolutionPage.setDefaultTimeout(longTimeout);

            //? Aguarda a nova aba carregar
            await devolutionPage.waitForLoadState("domcontentloaded");

            //? dispara uma promise que espera AMBOS: o botão do clique acontecer e a resposta da api der sucesso
            await Promise.all([
              devolutionPage.waitForResponse(
                (res) =>
                  res.url().includes("/nfe/status") && res.status() === 200,
              ),
              await devolutionPage
                .getByRole("button", { name: "Emitir NF-e" })
                .click(),
            ]);

            //? busca o elemento dentro do contexto do browser (Buscar número da nota de devolução)
            const element = await devolutionPage.waitForSelector("#nfe-result");

            //? aguarda elemento aparecer
            const textResult = await element.textContent();

            if (textResult) {
              //? se exisitr, extrair apenas número
              const nfeDev = textResult.replace(/(\D)/gm, "").trim();

              insertOnCell({
                originalIndex,
                pathFile,
                worksheet,
                value: nfeDev,
                workbook,
                cellNfeDev,
              });

              console.log(
                chalk.green(
                  `Nota Fiscal: ${nfe.NFE} -> Nota Fiscal Devolução: ${nfeDev}`,
                ),
              );

              await sleep();

              await devolutionPage.close();
            } else {
              //? se não tiver elemento presente, passa pro próximo e fecha aba
              writeErrorLog(nfe.NFE, "Erro na hora de emitir a nota");

              insertOnCell({
                originalIndex,
                pathFile,
                worksheet,
                value: "Erro",
                workbook,
                cellNfeDev,
              });

              await devolutionPage.close();

              found = true;
              break;
            }
          } else {
            currentPage++;

            //? próxima página — inspeciona o markup e ajusta o seletor
            const nextBtn = page.locator(
              `div#navigator-pages button.button-page:nth-child(${currentPage})`,
            );

            if ((await nextBtn.count()) === 0) {
              writeErrorLog(nfe.NFE, "Nota não encontrada em nenhuma página.");

              insertOnCell({
                originalIndex,
                pathFile,
                worksheet,
                value: "Erro",
                workbook,
                cellNfeDev,
              });

              found = true; //? força saída
              break;
            }

            await nextBtn.click();
            await sleep(); //? ← necessário
          }
        }
      } catch (err) {
        console.log(err);

        writeErrorLog(nfe.NFE, err);
        insertOnCell({
          originalIndex,
          pathFile,
          worksheet,
          value: "Erro",
          workbook,
          cellNfeDev,
        });

        await devolutionPage?.close();

        continue;
      }
    }

    await page.close();
    await context.close();
    console.log(
      chalk.cyan(
        `☑️ Processo finalizado em ${formatDate(new Date())} e foi concluído em ${formatDuration(performance.now() - start)}`,
      ),
    );
  }
}
