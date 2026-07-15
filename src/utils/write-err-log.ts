import fs from "node:fs";
import path from "node:path";

export function writeErrorLog(identifier: string, errorMessage?: unknown) {
  const err =
    errorMessage instanceof Error ? errorMessage.message : errorMessage;

  const pathFile = path.resolve(import.meta.dirname, "..", "logs", "error.txt");

  const log = `${identifier}: ${err ?? ""}\n=========================================================================================================\n\n`;

  fs.appendFile(pathFile, log, (err) => {
    if (err) console.log(err);
  });
}
