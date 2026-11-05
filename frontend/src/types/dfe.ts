import type { AmbienteNfse, CertificadoNfse } from "./nfse";

export type ServicoDfe = "nfe" | "cte";
export type SituacaoDfe = "normal" | "cancelada" | "denegada";

export interface EstadoDfe { ultimoNsu: number; maxNsu: number; proximaEm: number; ultimaCaptura: string | null; ultimoErro: string | null; documentos: number; resumos: number; pendentes: number }
export interface EmpresaDfe { cnpj: string; razao: string; certificado: CertificadoNfse | null; cienciaAuto: boolean; capturaAuto: boolean; falhas: number; nfe: EstadoDfe; cte: EstadoDfe }

/** Valor em centavos, como devolvido pelo api.php. */
export interface DocumentoDfe {
  cnpj: string; servico: ServicoDfe; chave: string; nsu: number; conteudo: "resumo" | "completa"; modelo: string; papel: string; numero: string; serie: string; emissao: string; competencia: string;
  emit_doc: string; emit_nome: string; dest_doc: string; dest_nome: string; tp_nf: string; v_total: number; situacao: SituacaoDfe; ciencia: "" | "pendente" | "enviada" | "erro"; ciencia_em: string | null; ciencia_msg: string | null;
}
export interface FalhaDfe { servico: ServicoDfe; nsu: number; motivo: string; em: string }
export interface ListaDfe { competencias: { competencia: string; notas: number }[]; competencia: string; documentos: DocumentoDfe[]; falhas: FalhaDfe[] }

export interface EmissaoPropria { cnpj: string; modelo: string; serie: string; numero: string; emissao: string; chave: string; arquivo: string; importado_em: string }

export type PassoDfe =
  | { status: "lote" | "fim"; ultimoNsu: number; notas: number; repetidas?: number; eventos: number; ignorados: number; falhas: number }
  | { status: "aguardar"; segundos: number; mensagem: string }
  | { status: "erro"; mensagem: string };
export type PassoCiencia = { status: "ok"; enviadas: number; erros: number; restantes: number } | { status: "erro"; mensagem: string };
export type { AmbienteNfse };
