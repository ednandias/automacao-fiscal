import * as p from "@clack/prompts";
import chalk from "chalk";
import path from "node:path";
import fs from "node:fs/promises";
import { startBot } from "./functions/startBot.js";

async function start() {
  console.clear();

  const spinner = p.spinner();

  const pathFiles = path.resolve(import.meta.dirname, "assets");

  spinner.start("Buscando arquivos...");
  const files = await fs.readdir(pathFiles);
  spinner.stop();

  const c = chalk.bgHex("#09592a").hex("#fff");

  p.intro(c(" 🤖 — Automação Fiscal v0.0.1"));

  let options: p.Option<string>[] = [];

  if (files.length > 0) {
    options = files.map((filename) => ({
      label: filename,
      value: filename,
    }));
  }

  const config = await p.group(
    {
      filenames: () =>
        p.multiselect({
          message: "Quais arquivos serão usados?",
          required: true,
          options,
        }),
      batch: () =>
        p.text({
          message: "Quantas notas o bot deve tentar emitir?",
          validate: (v) => (!v ? "Obrigatório" : undefined),
          initialValue: "10",
        }),
      isHeadless: () =>
        p.select({
          message: "Selecione o modo de execução",
          initialValue: true,
          options: [
            {
              label: "Background",
              value: true,
              hint: "Executa todo o processo em segundo plano [terminal]",
            },
            {
              label: "Foregound",
              value: false,
              hint: "Executa todo o processo visualmente [navegador]",
            },
          ],
        }),
      cellNfeDev: () =>
        p.text({
          message: "Qual a coluna do campo NFE_DEV?",
          initialValue: "B",
          validate: (v) => (!v ? "Obrigatório" : undefined),
        }),
      onlyErrors: () =>
        p.select({
          message: "Selecione o modo de operação",
          initialValue: false,
          options: [
            {
              label: "Padrão",
              value: false,
              hint: "Executa todo o processo normalmente",
            },
            {
              label: "Modo de Recuperação",
              value: true,
              hint: "Apenas notas com erro serão executadas",
            },
          ],
        }),

      timeout: () =>
        p.text({
          message: "Qual será o tempo de espera padrão?",
          initialValue: "60000",
        }),
      longTimeout: () =>
        p.text({
          message: "Qual será o tempo de espera adicional?",
          initialValue: "120000",
        }),
    },
    {
      onCancel: () => {
        p.cancel("Operação cancelada.");
        process.exit(0);
      },
    },
  );

  const {
    filenames,
    batch,
    isHeadless,
    cellNfeDev,
    onlyErrors,
    timeout,
    longTimeout,
  } = config;

  startBot({
    filenames,
    batch: Number(batch),
    isHeadless,
    cellNfeDev,
    onlyErrors,
    timeout: Number(timeout),
    longTimeout: Number(longTimeout),
  });
}

start();
