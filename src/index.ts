import * as p from "@clack/prompts";
import chalk from "chalk";
import path from "node:path";
import fs from "node:fs/promises";
import { startTerminal } from "./functions/start-terminal.js";
import { useSpinner } from "./utils/spinner.js";
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
          initialValue: "0",
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

  let onlyErrors = false;

  if (additionalInformation) {
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

  const { filenames, batch, cellNfeDev } = config;

  await startTerminal({
    filenames,
    batch: Number(batch),
    cellNfeDev,
    onlyErrors,
  });
}

start();
