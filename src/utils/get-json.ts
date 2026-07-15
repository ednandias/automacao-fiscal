import path from "node:path";

import type { NfeDev } from "../types/index.js";
import { xlsx } from "../services/xlsx.js";

export async function getJSON(filename: string) {
  const pathFile = path.resolve(import.meta.dirname, "..", "assets", filename);

  const workbook = xlsx.readFile(pathFile);

  const worksheet = workbook.Sheets[workbook.SheetNames[0]!];

  const nfes =
    xlsx.utils.sheet_to_json<NfeDev>(worksheet!, { defval: null }) ?? [];

  return { nfes, workbook, worksheet, pathFile };
}
