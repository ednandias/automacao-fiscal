import fs from "node:fs";
import path from "node:path";

export function writeErrorLog(nfe: string, error: unknown) {
  const err = error instanceof Error ? error.message : error;

  const pathFile = path.resolve(import.meta.dirname, "..", "logs", "error.txt");
  const content = `NOTA FISCAL ${nfe}: ${err}\n=========================================================================================================\n\n`;

  fs.appendFile(pathFile, content, (err) => {
    if (err) console.log(err);
  });
}
