import axios, { isAxiosError, type InternalAxiosRequestConfig } from "axios";
import { API_URL } from "../config.js";
import { sleep } from "../utils/sleep.js";

export const api = axios.create({
  baseURL: API_URL,
  timeout: 60000,
});

const MAX_RETRIES = 3;

//? repete só GET em falha de rede/5xx/429. Nunca repetir POST/PATCH aqui:
//? repetir /nfe/gerar pode emitir a mesma nota duas vezes
api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!isAxiosError(error)) throw error;

  const config = error.config as
    | (InternalAxiosRequestConfig & { retries?: number })
    | undefined;

  const status = error.response?.status ?? 0;
  const retryable = !error.response || status >= 500 || status === 429;
  const retries = config?.retries ?? 0;

  if (!config || config.method !== "get" || !retryable || retries >= MAX_RETRIES) {
    throw error;
  }

  config.retries = retries + 1;

  await sleep(2000 * config.retries);

  return api(config);
});

//? a requisição saiu mas não houve resposta: o servidor pode ter processado
export function isNoResponse(err: unknown) {
  return isAxiosError(err) && !err.response;
}

export function isNotFound(err: unknown) {
  return isAxiosError(err) && err.response?.status === 404;
}
