import type { Planejamento, PlanejamentoResumo } from "@/types";
import { chamarApi, usuarioAtual } from "./http";

/** Página do simulador (entregue só a quem tem a senha). */
export async function obterSimulador(): Promise<string> {
  return (await chamarApi<{ html: string }>("planejamento")).html;
}
export async function listarPlanejamentos(): Promise<PlanejamentoResumo[]> {
  return (await chamarApi<{ planejamentos: PlanejamentoResumo[] }>("planlistar")).planejamentos ?? [];
}
export async function lerPlanejamento(id: string): Promise<Planejamento> {
  return (await chamarApi<{ planejamento: Planejamento }>("planler", { query: { id } })).planejamento;
}
export async function salvarPlanejamento(dados: { id: string | null; cliente: string; resumo: string; estado: Record<string, unknown> }): Promise<PlanejamentoResumo> {
  return (await chamarApi<{ planejamento: PlanejamentoResumo }>("plansalvar", { corpo: { ...dados, usuario: usuarioAtual() } })).planejamento;
}
export async function excluirPlanejamento(id: string): Promise<void> {
  await chamarApi("planexcluir", { corpo: { id, usuario: usuarioAtual() } });
}
