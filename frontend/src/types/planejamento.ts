export interface PlanejamentoResumo {
  id: string;
  cliente: string;
  resumo: string;
  criadoEm: string;
  criadoPor: string;
  atualizadoEm: string;
  atualizadoPor: string;
}

export interface Planejamento extends PlanejamentoResumo {
  estado: Record<string, unknown>;
}
