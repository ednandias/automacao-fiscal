import * as p from "@clack/prompts";
import chalk from "chalk";
import fs from "node:fs/promises";
import { SHEETS_DIR } from "./config.js";
import { runEmission } from "./emission/runEmission.js";
import { isSpreadsheetFile } from "./sheets/spreadsheet.js";

async function main() {
  // eslint-disable-next-line no-console
  console.clear();

  p.intro(chalk.bgHex("#09592a").hex("#fff")(" 🤖 — Automação Fiscal v1.0.0 "));

  await fs.mkdir(SHEETS_DIR, { recursive: true });
  const files = (await fs.readdir(SHEETS_DIR)).filter(isSpreadsheetFile);

  if (files.length === 0) {
    p.cancel(`Nenhuma planilha .xlsx encontrada em ${SHEETS_DIR}`);
    process.exit(1);
  }

  const config = await p.group(
    {
      filenames: () =>
        p.multiselect({
          message: "Quais arquivos serão usados?",
          required: true,
          options: files.map((filename) => ({ label: filename, value: filename })),
        }),

      batch: () =>
        p.text({
          message: "Quantas notas o bot deve tentar emitir por arquivo?",
          placeholder: "0 para emitir todas",
          initialValue: "0",
          validate: (v) =>
            !v || !/^\d+$/.test(v.trim()) ? "Digite um número inteiro (0 = todas)" : undefined,
        }),

      onlyErrors: () =>
        p.select({
          message: "Modo de operação",
          initialValue: false,
          options: [
            { label: "Padrão", value: false, hint: "Emite as notas ainda não processadas" },
            { label: "Recuperação", value: true, hint: "Tenta de novo apenas as notas com Erro" },
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

  await runEmission({
    filenames: config.filenames,
    batch: Number(config.batch.trim()),
    onlyErrors: config.onlyErrors,
  });
}

main();
