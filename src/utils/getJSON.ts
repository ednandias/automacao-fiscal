import path from "node:path";

import type { NFeDev } from "../types/index.js";
import { xlsx } from "../config/xlsx.js";

export async function getJSON(filename: string) {
  const pathFile = path.resolve(import.meta.dirname, "..", "assets", filename);

  const workbook = xlsx.readFile(pathFile);

  const sheet = workbook.Sheets[workbook.SheetNames[0]!];

  const nfes = xlsx.utils.sheet_to_json<NFeDev>(sheet!, { defval: null }) ?? [];

  return { nfes, workbook, sheet, pathFile };
}
