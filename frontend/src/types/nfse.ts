export type AmbienteNfse = "producao" | "restrita";
export type PapelNfse = "prestador" | "tomador" | "intermediario" | "outro";
export type SituacaoNfse = "normal" | "cancelada" | "substituida" | "em_analise" | "bloqueada";

export interface EmpresaNfse {
  cnpj: string;
  razao: string;
  certId: string;
  manual: boolean;
  certificado: { id: string; nome: string; documento: string; validade: string } | null;
  ultimoNsu: number;
  ultimaCaptura: string | null;
  ultimoErro: string | null;
  notas: number;
  falhas: number;
}

/** Valores em centavos, como devolvidos pelo api.php. */
export interface NotaNfse {
  cnpj: string; chave: string; nsu: number; papel: PapelNfse; competencia: string; data_competencia: string; emissao: string;
  numero: string; serie: string; n_dps: string; cstat: string; prest_doc: string; prest_nome: string; toma_doc: string; toma_nome: string;
  interm_doc: string; op_simples: string; trib_nac: string; trib_mun: string; desc_nac: string; descricao: string; mun_incid: string;
  trib_issqn: string; tp_ret_iss: string; aliq: string; tp_ret_pis: string;
  v_serv: number; v_bc: number; v_iss: number; v_ret_cp: number; v_ret_irrf: number; v_ret_csll: number; v_pis: number; v_cofins: number;
  v_total_ret: number; v_liq: number; v_ibs: number; v_cbs: number; situacao: SituacaoNfse; eventos_em: string | null;
}

export interface FalhaNfse { nsu: number; chave: string; motivo: string; em: string }

export interface ListaNotasNfse {
  competencias: { competencia: string; notas: number }[];
  competencia: string;
  notas: NotaNfse[];
  falhas: FalhaNfse[];
}

export type PassoCaptura =
  | { status: "lote" | "fim"; ultimoNsu: number; notas: number; repetidas?: number; eventos: number; ignorados: number; falhas: number }
  | { status: "aguardar"; segundos: number; mensagem: string }
  | { status: "erro"; mensagem: string };

export type PassoVerificacao =
  | { status: "ok"; eventos: number; situacao: SituacaoNfse }
  | { status: "aguardar"; segundos: number; mensagem: string }
  | { status: "erro"; mensagem: string };
