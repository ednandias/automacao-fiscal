import * as p from "@clack/prompts";
import chalk from "chalk";
import { xlsx } from "../services/xlsx.js";
import path from "node:path";
import fs from "node:fs/promises";
import { useSpinner } from "../utils/useSpinner.js";

async function start() {
  const spinner = useSpinner();

  p.intro(chalk.bgGreen.white(" 📄 — Gerador de planilhas v0.0.1"));

  while (true) {
    const config = await p.group(
      {
        notes: () =>
          p.text({
            message: "Digite as notas separadas por (,)",
            placeholder: "Ex:...123,456,789",
            validate: (v) => (!v ? "Obrigatório" : undefined),
          }),
        filename: () =>
          p.select({
            message: "Qual vai ser o nome do arquivo?",
            initialValue: "ml1_sac.xlsx",
            options: [
              {
                label: "ml1_sac.xlsx",
                value: "ml1_sac.xlsx",
              },
              {
                label: "ml2_sac.xlsx",
                value: "ml2_sac.xlsx",
              },
              {
                label: "ml3_sac.xlsx",
                value: "ml3_sac.xlsx",
              },
              {
                label: "ml4_sac.xlsx",
                value: "ml4_sac.xlsx",
              },
              {
                label: "ml5_sac.xlsx",
                value: "ml5_sac.xlsx",
              },
            ],
          }),
      },
      {
        onCancel: () => {
          p.cancel("Operação cancelada.");
          process.exit(0);
        },
      },
    );

    spinner.start("Gerando arquivos...");

    const FILE_PATH = path.resolve(
      import.meta.dirname,
      "..",
      "assets",
      `${config.filename}`,
    );

    let workbook: xlsx.WorkBook;

    try {
      await fs.readFile(FILE_PATH);

      workbook = xlsx.readFile(FILE_PATH);
    } catch {
      workbook = xlsx.utils.book_new();
    }

    const SHEET_NAME = "Sheet1";
    let worksheet: xlsx.WorkSheet;

    const notes = config.notes
      .split(",")
      .filter((n) => n)
      .map((n) => ({
        NFE: n,
        NFE_DEV: "",
      }));

    if (workbook.Sheets[SHEET_NAME]) {
      const existingNotes = xlsx.utils.sheet_to_json(
        workbook.Sheets[SHEET_NAME],
      );

      const mergedNotes = [...existingNotes, ...notes];

      worksheet = xlsx.utils.json_to_sheet(mergedNotes);
    } else {
      worksheet = xlsx.utils.json_to_sheet(notes);
    }

    workbook.Sheets[SHEET_NAME] = worksheet;

    if (!workbook.SheetNames.includes(SHEET_NAME)) {
      workbook.SheetNames.push(SHEET_NAME);
    }

    xlsx.writeFile(workbook, FILE_PATH);

    spinner.stop("Arquivos gerados!");

    p.outro(chalk.green("✅ A planilha foi criada com sucesso"));

    const shouldContinue = await p.confirm({
      message: "Repetir?",
      initialValue: true,
    });

    if (p.isCancel(shouldContinue) || !shouldContinue) break;
  }
}

start();
