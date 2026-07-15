import type { AxiosError } from "axios";
import { api } from "../services/api.js";
import type { NfeDevPost } from "../types/index.js";
import { getErrMessage } from "./get-err-message.js";
import { useSpinner } from "./spinner.js";

type GetIdNfeDevolucao = {
  id: string;
  nfe: string;
  account: string;
};

export async function getIdNfeDevolucao({
  id,
  nfe,
  account,
}: GetIdNfeDevolucao) {
  const isVerifyingNote = useSpinner();
  const isGeneratingNote = useSpinner();

  try {
    isVerifyingNote.start("Consultando nota de devolução...");

    const response = await api.get<{ id: string; numnfe: string }>(
      `/nfe/check/514066249?id=${id}&nfe=${nfe}&account=${account}`,
    );

    isVerifyingNote.stop("✅ Nota consultada com sucesso!");

    if (response.data?.id && response.data?.numnfe) {
      return {
        id: String(response.data.id),
        numnfe: response.data.numnfe,
      };
    }
  } catch (err) {
    const error = err as AxiosError;

    isVerifyingNote.stop(`❌ ${getErrMessage(err, "Erro ao consultar nota!")}`);

    if (error?.response?.status === 404) {
      try {
        isGeneratingNote.start("Criando nota de devolução...");

        const res = await api.post<NfeDevPost>(
          `/nfe/devolucao/${id}/514066249`,
        );

        isGeneratingNote.stop("✅ Nota criada com sucesso!");

        return {
          id: String(res.data.idnfe_devolucao),
          numnfe: res.data.numero_nfe,
        };
      } catch (err) {
        isGeneratingNote.stop(
          `❌ ${getErrMessage(err, "Erro ao criar a nota!")}`,
        );
      }
    }
  }
}
