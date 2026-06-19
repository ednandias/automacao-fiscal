export interface NfeDev {
  CONTA: string;
  NFE: string;
  DATA: string;
  NFE_DEV: string;
}

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

export interface NfeDevPost {
  message: string;
  idnfe_devolucao: number;
  numero_nfe: number;
}

export interface NfeStatusResponse {
  status: string;
  jobId: string;
  message: string;
  result: string;
}
