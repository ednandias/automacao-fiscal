import * as p from "@clack/prompts";
import chalk from "chalk";
import { getJSON } from "../utils/get-json.js";
import path from "node:path";
import fs from "node:fs/promises";
import { log } from "../utils/log.js";
import { api } from "../services/api.js";
import { getIdNfeDevolucao } from "../utils/get-id-nfe-devolucao.js";
import { useSpinner } from "../utils/spinner.js";

async function start() {
  const note = useSpinner();

  p.intro(chalk.bgGreen.white("📄 — Buscador de notas de devolução v0.0.1"));

  const pathFiles = path.resolve(import.meta.dirname, "..", "assets");

  const files = await fs.readdir(pathFiles);

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
    },
    {
      onCancel: () => {
        p.cancel("Operação cancelada.");
        process.exit(0);
      },
    },
  );

  for (const filename of config.filenames) {
    let account = filename.replace(/_\D+/gm, "").toUpperCase();

    log("info", account);

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

    const data = await getJSON(filename);

    const nfes =
      data?.nfes.filter((n) => n.NFE_DEV == "Erro" || n.NFE_DEV == null) ?? [];

    if (nfes.length === 0) {
      log("error", `${filename} sem dados.`);

      continue;
    }

    for (const nfe of nfes) {
      note.start("Buscando nota...");

      const response = await api.get(
        `/nfe/search/514066249?account=${account}&numnfe=${nfe.NFE}`,
      );

      const nfeFound = response.data;

      if (nfeFound?.id) {
        note.stop(`✅ Nota ${nfeFound.numnfe} encontrada.`);

        const nfeDev = await getIdNfeDevolucao({
          id: String(nfeFound.id),
          nfe: String(nfeFound.numnfe),
          account,
        });

        log(
          "info",
          `NOTA: NÚMERO -> ${nfeFound.numnfe} | ID -> ${nfeFound.id}`,
        );

        log(
          "info",
          `DEVOLUÇÃO: NÚMERO -> ${nfeDev?.numnfe} | ID -> ${nfeDev?.id}`,
        );
      } else {
        note.stop(`❌ Nota ${nfeFound.numnfe} não encontrada.`);
      }
    }
  }
}

start();
