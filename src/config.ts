import path from "node:path";

const ROOT_DIR = path.resolve(import.meta.dirname, "..");

//? onde ficam as planilhas de entrada e os logs (fora do src, ignorados pelo git)
export const SHEETS_DIR = path.join(ROOT_DIR, "planilhas");
export const LOGS_DIR = path.join(ROOT_DIR, "logs");

export const API_URL = "https://node.ziphub.com.br";

//? conta principal (emissora) usada em todas as chamadas da API
export const MAIN_ACCOUNT = "514066249";

//? nome que aparece como responsável pela emissão no ZipHub
export const USER_NAME = "EDNAN T.I";

//? o prefixo do nome do arquivo define a conta: ml1_sac.xlsx -> ML1
export const ACCOUNT_IDS: Record<string, string> = {
  ML1: "514066249",
  ML2: "699017946",
  ML3: "751371366",
  ML4: "1105949144",
  ML5: "1468767285",
};

export const TIMING = {
  //? tempo máximo esperando a trava de geração liberar antes de interromper tudo
  lockMaxWait: 10 * 60 * 1000,
  lockInterval: 5000,
  //? 45 x 4s = 3 min esperando a SEFAZ responder antes de marcar VERIFICAR
  jobAttempts: 45,
  jobInterval: 4000,
};

//? valores da coluna NFE_DEV:
//?   (vazio)    -> ainda não processada (modo padrão)
//?   número     -> devolução emitida
//?   Erro       -> falhou e NÃO foi emitida (modo de recuperação tenta de novo)
//?   VERIFICAR  -> resultado incerto (ex.: timeout). Confira no ZipHub antes de qualquer ação
//?   REEMITIR   -> digitado à mão: força nova emissão, ignorando o histórico
export const STATUS = {
  ERROR: "Erro",
  VERIFY: "VERIFICAR",
  FORCE: "REEMITIR",
} as const;

export function getAccountId(filename: string) {
  const prefix = /^(ml\d+)/i.exec(filename)?.[1]?.toUpperCase();

  return prefix ? ACCOUNT_IDS[prefix] : undefined;
}

export function getAccountLabel(accountId: string) {
  return (
    Object.keys(ACCOUNT_IDS).find((key) => ACCOUNT_IDS[key] === accountId) ??
    accountId
  );
}
