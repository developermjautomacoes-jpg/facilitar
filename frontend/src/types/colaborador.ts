export interface Colaborador {
  id: string;
  nome: string;
  cargo?: string;
  setores?: string[];
  email?: string;
  telefone?: string;
  ativo?: boolean;
  criadoEm?: string;
  atualizadoEm?: string;
  atualizadoPor?: string;
}

export type ColaboradorEntrada = Omit<Colaborador, "id" | "criadoEm" | "atualizadoEm" | "atualizadoPor"> & { id?: string };
