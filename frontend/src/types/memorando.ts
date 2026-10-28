/** Entrada do histórico gravada pelo api.php. */
export interface HistoricoItem {
  acao: string;
  por?: string;
  em: string;
  campos?: string[];
}

export interface DepartamentoMemo {
  nome: string;
  on: boolean;
  resp?: string;
  respId?: string;
}

export interface AtividadeMemo {
  cod: string;
  desc?: string;
  tipo?: string;
  on: boolean;
}

export type StatusMemorando = "ativo" | "cancelado";
export type SituacaoCliente = "ativa" | "inativa" | "";

/**
 * Memorando como o api.php devolve na ação "listar".
 * Só os campos usados nas telas novas estão tipados; o formulário completo continua no módulo legado.
 */
export interface Memorando {
  _id: string;
  seq: number;
  ano: number;
  m_numero?: string;
  m_data?: string;
  e_razao?: string;
  e_fantasia?: string;
  e_cnpj?: string;
  e_desde?: string;
  t_regime?: string;
  t_modalidade?: string;
  status?: StatusMemorando;
  situacaoCliente?: SituacaoCliente;
  dataSaida?: string;
  motivoSaida?: string;
  obsSaida?: string;
  deps?: DepartamentoMemo[];
  ferramentas?: string[];
  atividades?: AtividadeMemo[];
  anexosManual?: string[] | null;
  historico?: HistoricoItem[];
  criadoEm?: string;
  criadoPorNome?: string;
  atualizadoEm?: string;
  atualizadoPorNome?: string;
  [campo: string]: unknown;
}

export interface SaidaCliente {
  dataSaida: string;
  motivoSaida: string;
  obsSaida: string;
}
