//? nota fiscal original, retornada por /nfe/search
export interface Nfe {
  id: number;
  totalpedido: number;
  usuario_geracao: string;
  link_nfe: string;
  chave: string;
  link_xml: string;
  numnfe: number;
  emp_conta: string;
  erro: null;
  datasaida: Date;
  numero_venda: number;
  status: string;
  datavenda: Date;
  serie: string;
  pes_razao: string;
  pes_cnpj_cpf: string;
}

//? retorno de /nfe/devolucao (criação do rascunho da devolução)
export interface CreateDevolucaoResponse {
  message: string;
  idnfe_devolucao: number;
  numero_nfe: number;
}

//? retorno de /nfe/status/:jobId
export interface JobStatusResponse {
  status: string;
  jobId: string;
  message: string;
  result: unknown;
}
