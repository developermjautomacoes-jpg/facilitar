import type { Compromisso, CompromissoEntrada, ConfigAgenda } from "@/types";
import { chamarApi, usuarioAtual } from "./http";

/** Agenda do escritório: o api.php lê e grava direto no Google Agenda (conta de serviço). */
export async function configAgenda(): Promise<ConfigAgenda> {
  return chamarApi<ConfigAgenda>("agendacfg");
}

export async function salvarConfigAgenda(chave: string | null, agenda: string): Promise<ConfigAgenda> {
  return chamarApi<ConfigAgenda>("agendacfgsalvar", { corpo: { chave, agenda, usuario: usuarioAtual() } });
}

export async function desconectarAgenda(): Promise<void> {
  await chamarApi("agendacfgremover", { corpo: {} });
}

export async function listarCompromissos(de: string, ate: string): Promise<Compromisso[]> {
  const r = await chamarApi<{ eventos: Compromisso[] }>("agendaeventos", { query: { de, ate } });
  return r.eventos ?? [];
}

export async function salvarCompromisso(evento: CompromissoEntrada): Promise<Compromisso> {
  const r = await chamarApi<{ evento: Compromisso }>("agendasalvar", { corpo: { evento, usuario: usuarioAtual() } });
  return r.evento;
}

export async function excluirCompromisso(id: string): Promise<void> {
  await chamarApi("agendaexcluir", { corpo: { id, usuario: usuarioAtual() } });
}
