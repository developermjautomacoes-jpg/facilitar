export type TipoCompromisso = "reuniao" | "tarefa" | "evento";

/** Compromisso da agenda do escritório, como o api.php devolve a partir do Google Agenda. */
export interface Compromisso {
  id: string;
  titulo: string;
  descricao: string;
  local: string;
  /** "AAAA-MM-DD" (dia inteiro) ou data e hora com fuso ("2026-10-29T14:00:00-03:00") */
  inicio: string;
  /** No dia inteiro o fim é exclusivo (dia seguinte ao último), como no Google. */
  fim: string;
  diaInteiro: boolean;
  tipo: TipoCompromisso;
  concluida: boolean;
  responsavelId: string;
  responsavel: string;
  criadoPor: string;
  link: string;
  doSistema: boolean;
  atualizado: string;
  /** Link da sala do Google Meet (vazio se não houver) */
  meet: string;
  participantes: Participante[];
}

export interface Participante {
  email: string;
  nome: string;
  /** needsAction | accepted | declined | tentative */
  resposta: string;
}

/** Dados enviados para gravar: no dia inteiro, inicio/fim são datas (fim inclusivo); com horário, "AAAA-MM-DDTHH:MM". */
export interface CompromissoEntrada {
  id?: string;
  titulo: string;
  descricao: string;
  local: string;
  inicio: string;
  fim: string;
  diaInteiro: boolean;
  tipo: TipoCompromisso;
  concluida: boolean;
  responsavelId: string;
  responsavel: string;
  criadoPor?: string;
  /** Só com login Google: e-mails convidados, criar sala do Meet e enviar convite por e-mail */
  participantes?: string[];
  meet?: boolean;
  enviarConvites?: boolean;
}

export interface ConfigAgenda {
  configurado: boolean;
  /** "oauth" = login com a conta Google (Meet e convites); "conta" = conta de serviço */
  modo?: "oauth" | "conta";
  conta?: string;
  agenda?: string;
  contaServico?: string;
  nomeAgenda?: string;
  atualizadoPor?: string;
  atualizadoEm?: string;
}
