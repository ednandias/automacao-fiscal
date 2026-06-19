import * as p from "@clack/prompts";
import chalk from "chalk";
import path from "node:path";
import fs from "node:fs/promises";
import { startBot } from "./functions/startBot.js";
import { startTerminal } from "./functions/startTerminal.js";
import { useSpinner } from "./utils/useSpinner.js";
import { isCancel } from "axios";

async function start() {
  const searchingFiles = useSpinner();

  // eslint-disable-next-line no-console
  console.clear();

  const pathFiles = path.resolve(import.meta.dirname, "assets");

  searchingFiles.start("Buscando arquivos...");
  const files = await fs.readdir(pathFiles);
  searchingFiles.stop();

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
      mode: () =>
        p.select({
          message: "Qual o modo de execução?",
          options: [
            {
              value: "t",
              label: "Terminal",
              hint: "Modo de execução 100% em background",
            },
            {
              value: "b",
              label: "Bot",
              hint: "Modo de execução com Playwright",
            },
          ],
        }),
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
          placeholder: "0 para gerar todas",
        }),

      cellNfeDev: () =>
        p.text({
          message: "Qual a coluna do campo NFE_DEV?",
          initialValue: "B",
          validate: (v) => (!v ? "Obrigatório" : undefined),
        }),
    },
    {
      onCancel: () => {
        p.cancel("Operação cancelada.");
        process.exit(0);
      },
    },
  );

  const additionalInformation = await p.select({
    message: "Fornecer informações adicionais?",
    initialValue: false,
    options: [
      {
        label: "Sim",
        value: true,
      },
      {
        label: "Não",
        value: false,
      },
    ],
  });

  if (isCancel(additionalInformation)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  let isHeadless = true;
  let onlyErrors = false;
  let timeout = "60000";
  let longTimeout = "120000";

  if (additionalInformation) {
    if (config.mode === "b") {
      isHeadless = (await p.select({
        message: "Selecione o modo de execução (apenas modo bot)",
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
      })) as boolean;

      if (isCancel(isHeadless)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }

      timeout = (await p.text({
        message: "Qual será o tempo de espera padrão?",
        initialValue: "60000",
      })) as string;

      if (isCancel(timeout)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }

      longTimeout = (await p.text({
        message: "Qual será o tempo de espera adicional?",
        initialValue: "120000",
      })) as string;

      if (isCancel(longTimeout)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }
    }

    onlyErrors = (await p.select({
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
    })) as boolean;

    if (isCancel(onlyErrors)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }
  }

  const { mode, filenames, batch, cellNfeDev } = config;

  if (mode === "t") {
    await startTerminal({
      filenames,
      batch: Number(batch),
      cellNfeDev,
      onlyErrors,
    });
  } else {
    await startBot({
      filenames,
      batch: Number(batch),
      isHeadless,
      cellNfeDev,
      onlyErrors,
      timeout: Number(timeout),
      longTimeout: Number(longTimeout),
    });
  }
}

start();
