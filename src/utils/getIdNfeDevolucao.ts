import { api } from "../services/api.js";
import type { NfeDevPost } from "../types/index.js";
import { useSpinner } from "./useSpinner.js";

export async function getIdInfeDevolucao(idNfe: string, account: string) {
  const isVerifyingNote = useSpinner();
  const isGeneratingNote = useSpinner();

  isVerifyingNote.start("Verificando nota de devolução no banco...");

  const response = await api.get<{ id: string; numnfe: string }>(
    `/nfe/check/514066249?id=${idNfe}&account=${account}`,
  );

  isVerifyingNote.stop("✅ Nota verificada com sucesso!");

  if (response.data?.id && response.data?.numnfe) {
    return {
      id: String(response.data.id),
      numnfe: response.data.numnfe,
    };
  } else {
    isGeneratingNote.start("Criando nota de devolução...");

    const res = await api.post<NfeDevPost>(`/nfe/devolucao/${idNfe}/514066249`);

    isGeneratingNote.stop("✅ Nota criada com sucesso!");

    return {
      id: String(res.data.idnfe_devolucao),
      numnfe: res.data.numero_nfe,
    };
  }
}
