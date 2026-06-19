import * as p from "@clack/prompts";
import chalk from "chalk";
import { getJSON } from "../utils/getJSON.js";
import path from "node:path";
import fs from "node:fs/promises";
import { log } from "../utils/log.js";
import { api } from "../services/api.js";
import type { Nfe } from "../types/index.js";
import { getIdInfeDevolucao } from "../utils/getIdNfeDevolucao.js";
import { useSpinner } from "../utils/useSpinner.js";

async function start() {
  const isNfeFetching = useSpinner();

  p.intro(chalk.bgGreen.white(" 📄 — Buscador de notas de devolução v0.0.1"));

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

    isNfeFetching.start("Buscando notas...");

    const response = await api.get<Nfe[]>(
      `/nfe/lista-nfe/${account}/514066249?dataIn=2023-12-31T23:59:59.000Z&dataFn=2026-06-05T10:08:44.641Z`,
    );

    isNfeFetching.stop("Notas buscadas.");

    for (const nfe of nfes) {
      const nfeFound = response.data.find((n) => String(n.numnfe) == nfe.NFE);

      if (nfeFound) {
        const { id, numnfe } = await getIdInfeDevolucao(
          String(nfeFound.id),
          account,
        );

        console.log({
          nfe: {
            numnfe: Number(nfeFound.numnfe),
            id: Number(nfeFound.id),
          },
          nfeDev: {
            numnfe: Number(numnfe),
            id: Number(id),
          },
        });
      }
    }
  }
}

start();
