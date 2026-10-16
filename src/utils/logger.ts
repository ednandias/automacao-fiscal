import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import { LOGS_DIR } from "../config.js";
import { formatDate } from "./format.js";

const COLORS = {
  info: chalk.cyan,
  success: chalk.green,
  warn: chalk.magenta,
  error: chalk.red,
};

export function log(type: keyof typeof COLORS, ...data: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(COLORS[type](...data));
}

//? mensagem mais útil de um erro: a da API, se houver, senão a do próprio erro
export function errorMessage(err: unknown) {
  const apiMessage = (err as { response?: { data?: { message?: string } } })
    ?.response?.data?.message;

  return apiMessage || (err instanceof Error ? err.message : String(err));
}

export function writeErrorLog(identifier: string, err?: unknown) {
  const detail = err === undefined ? "" : errorMessage(err);

  const entry = `[${formatDate(new Date())}] ${identifier}: ${detail}\n${"=".repeat(105)}\n\n`;

  fs.mkdirSync(LOGS_DIR, { recursive: true });

  fs.appendFile(path.join(LOGS_DIR, "error.txt"), entry, (err) => {
    if (err) log("error", "Não foi possível gravar o log de erro:", err.message);
  });
}
