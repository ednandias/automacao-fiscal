import * as p from "@clack/prompts";
import chalk from "chalk";
import path from "node:path";
import { ACCOUNT_IDS, SHEETS_DIR } from "../config.js";
import { appendNotes } from "../sheets/spreadsheet.js";

//? um arquivo por conta: ml1_sac.xlsx, ml2_sac.xlsx...
const FILENAMES = Object.keys(ACCOUNT_IDS).map((acc) => `${acc.toLowerCase()}_sac.xlsx`);

async function main() {
  p.intro(chalk.bgGreen.white(" 📄 — Gerador de planilhas "));

  while (true) {
    const config = await p.group(
      {
        notes: () =>
          p.text({
            message: "Digite as notas separadas por vírgula",
            placeholder: "Ex.: 123,456,789",
            validate: (v) => (!v?.trim() ? "Obrigatório" : undefined),
          }),
        filename: () =>
          p.select({
            message: "Em qual arquivo?",
            initialValue: FILENAMES[0],
            options: FILENAMES.map((f) => ({ label: f, value: f })),
          }),
      },
      {
        onCancel: () => {
          p.cancel("Operação cancelada.");
          process.exit(0);
        },
      },
    );

    const notes = config.notes
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    const added = appendNotes(path.join(SHEETS_DIR, config.filename!), notes);

    p.log.success(
      `${added} nota(s) adicionada(s) em ${config.filename}` +
        (added < notes.length ? ` (${notes.length - added} já existiam)` : ""),
    );

    const shouldContinue = await p.confirm({
      message: "Adicionar mais notas?",
      initialValue: true,
    });

    if (p.isCancel(shouldContinue) || !shouldContinue) break;
  }

  p.outro(chalk.green("✅ Pronto"));
}

main();
