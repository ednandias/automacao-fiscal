import path from "node:path";
import { chromium, type Page } from "playwright";
import { getJSON } from "./utils/getJSON.js";
import { sleep } from "./utils/sleep.js";
import { writeErrorLog } from "./utils/writeErrorLog.js";
import { xlsx } from "./config/xlsx.js";
import type { NFeDev } from "./types/index.js";

const SESSION_DIR = path.resolve("./src/temp/playwright-session");

//! IMPORTANTE: CONFIGURAR
const FILENAME = "ml5.xlsx"; //? nome do arquivo
const ACCOUNT: string = "ML5"; //? apelido da conta
const MAX_BATCH = 1; //? máximo que vai fazer por dia
const HEADLESS = false; //? true = background, false = foreground
const timeout = 60000; //? 1 minuto
const longTimeout = 120000; //? 2 minutos

async function main() {
  console.log("PROCESSO INICIOU");

  const result = await getJSON(FILENAME);

  if (!result?.nfes || !result?.sheet || !result?.workbook || !result?.pathFile)
    throw Error("Unable to continue, missing variables.");

  const { nfes, sheet, workbook, pathFile } = result;

  function insertOnCell(
    numNfe: string,
    sheet: xlsx.WorkSheet,
    value: string,
    workbook: xlsx.WorkBook,
    pathFile: string,
  ) {
    //? acha o índice no array original (não no filtrado)
    const originalIndex = nfes.findIndex((n) => n.NFE === numNfe);

    //? linha no excel = índice + 2 (1 do header, 1 do 0-based do array)
    const row = originalIndex + 2;

    //? escreve direto na célula E{row} (coluna NFE_DEV)
    sheet[`E${row}`] = { v: value, t: "s" };

    //? salva preservando tudo que já estava
    xlsx.writeFile(workbook, pathFile);
  }

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: HEADLESS,
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

  const page = await context.newPage();
  let page1: Page | null = null;

  page.setDefaultTimeout(timeout);

  await page.goto("https://ziphub.com.br/listagem/nfe", {
    waitUntil: "domcontentloaded",
    timeout,
  });

  //? seleciona uma das contas no select
  switch (ACCOUNT) {
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

  //? clica no input Data Inicial
  await page.getByRole("textbox").first().click();

  //? aperta End para ir para o final da data
  await page.getByRole("textbox").first().press("End");

  //? aperta Shift + Home para selecionar o texto e ir para o começo
  await page.getByRole("textbox").first().press("Shift+Home");

  //? prenche a data
  await page.getByRole("textbox").first().fill("01/01/2024");

  //? filtrando apenas as linhas que não estiverem preenchidas
  const nfesFiltered = nfes.filter((n) => !n.NFE_DEV);

  //? percorre nota por nota
  const batch = nfesFiltered.slice(0, MAX_BATCH);

  for (const nfe of batch) {
    page1 = null;

    console.log("NFE", nfe.NFE);

    try {
      //? clica no botão buscar
      await page
        .getByRole("button", { name: "Buscar" })
        .click({ timeout: longTimeout });

      //? pesquisa o número da nota no input
      await page
        .getByRole("textbox", { name: "Pesquisar..." })
        .fill(String(nfe.NFE));

      await sleep();

      let found = false;
      let currentPage = 1;

      //? enquanto a nota não tiver sido encontrada
      while (!found) {
        try {
          //? aguarda a tabela ser montada
          await page.waitForSelector("#table-nfe tbody tr");
        } catch (err) {}

        //? busca o número da nota EXATO
        const targetRow = page.locator("#table-nfe tbody tr").filter({
          has: page.locator("td strong.numero-nota", {
            hasText: new RegExp(`^${nfe.NFE}$`),
          }),
        });

        //? se a contagem for maior que 0, deu certo
        if ((await targetRow.count()) > 0) {
          found = true;

          //? aguarda processo da página terminar
          const page1Promise = page.waitForEvent("popup");

          await targetRow.locator(".btn.btn-outline-warning").first().click();

          //? confirma a geração da nota
          await page
            .getByRole("button", { name: "Confirmar e Gerar Devolução" })
            .click();

          //? aguarda abrir a nova aba
          page1 = await page1Promise;

          page1.setDefaultTimeout(longTimeout);

          //? Aguarda a nova aba carregar
          await page1.waitForLoadState("domcontentloaded");

          //? clica em gerar nota
          await page1.getByRole("button", { name: "Emitir NF-e" }).click();

          //? busca o elemento dentro do contexto do browser (Buscar número da nota de devolução)
          const element = await page1.waitForSelector("#nfe-result", {
            timeout: longTimeout,
          });

          const textResult = await element.textContent();

          if (textResult) {
            //? se exisitr, extrair apenas número
            const nfeDev = textResult.replace(/(\D)/gm, "").trim();

            insertOnCell(nfe.NFE, sheet, nfeDev, workbook, pathFile);

            console.log({ nfeDev });

            await sleep();

            await page1.close();
          } else {
            //? se não tiver elemento presente, passa pro próximo e fecha aba
            writeErrorLog(
              nfe.NFE,
              "Não encontrou o elemento #nfe-result na tela.",
            );

            insertOnCell(nfe.NFE, sheet, "Erro", workbook, pathFile);

            await page1.close();

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
            insertOnCell(nfe.NFE, sheet, "Erro", workbook, pathFile);

            found = true; //? força saída
            break;
          }

          await nextBtn.click();
          await sleep(); // ← necessário
        }
      }
    } catch (err) {
      console.log(err);

      writeErrorLog(nfe.NFE, err);
      insertOnCell(nfe.NFE, sheet, "Erro", workbook, pathFile);

      await page1?.close();

      continue;
    }
  }

  console.log("PROCESSO TERMINOU");
}

main();
