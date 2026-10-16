import fs from "node:fs";
import path from "node:path";
import { LOGS_DIR } from "../config.js";

//? histórico local (append-only) de cada pedido de emissão. A planilha pode ser
//? sobrescrita (ex.: alguém salva o Excel aberto por cima), então este arquivo é
//? a segunda fonte da verdade para não emitir a mesma devolução duas vezes.
export type EmissionStatus = "solicitada" | "emitida" | "pendente" | "falhou";

export interface Emission {
  date: string;
  file: string;
  account: string;
  nfe: string;
  status: EmissionStatus;
  jobId?: string;
  nfeDev?: string;
}

const pathFile = path.join(LOGS_DIR, "emissoes.jsonl");

let cache: Map<string, Emission> | null = null;

const key = (account: string, nfe: string) => `${account}:${nfe}`;

function load() {
  if (cache) return cache;

  cache = new Map();

  if (!fs.existsSync(pathFile)) return cache;

  for (const line of fs.readFileSync(pathFile, "utf8").split("\n")) {
    if (!line.trim()) continue;

    try {
      const entry = JSON.parse(line) as Emission;
      cache.set(key(entry.account, entry.nfe), entry);
    } catch {
      //? linha corrompida (ex.: processo morto no meio da escrita)
    }
  }

  return cache;
}

//? último registro da nota nessa conta
export function getLastEmission(account: string, nfe: string) {
  return load().get(key(account, nfe));
}

export function recordEmission(data: Omit<Emission, "date">) {
  const entry: Emission = { date: new Date().toISOString(), ...data };

  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.appendFileSync(pathFile, JSON.stringify(entry) + "\n");

  load().set(key(entry.account, entry.nfe), entry);
}
