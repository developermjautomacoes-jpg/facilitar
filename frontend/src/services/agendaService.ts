import type { Compromisso, CompromissoEntrada, ConfigAgenda } from "@/types";
import { chamarApi, usuarioAtual } from "./http";

/** Agenda do escritório: o api.php lê e grava direto no Google Agenda (conta de serviço). */
export async function configAgenda(): Promise<ConfigAgenda> {
  return chamarApi<ConfigAgenda>("agendacfg");
}

export async function salvarConfigAgenda(chave: string | null, agenda: string): Promise<ConfigAgenda> {
  return chamarApi<ConfigAgenda>("agendacfgsalvar", { corpo: { chave, agenda, usuario: usuarioAtual() } });
}

/** Endereço que o Google chama depois do login (cadastrar no Google Cloud como URI de redirecionamento). */
export function enderecoRetornoGoogle(): string {
  return `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}google-retorno.php`;
}

/** Gera o endereço da tela de login do Google; cliente = conteúdo do JSON do cliente OAuth (ou null para manter o atual). */
export async function iniciarLoginGoogle(cliente: string | null): Promise<string> {
  const r = await chamarApi<{ url: string }>("agendaoauthiniciar", { corpo: { cliente, retorno: enderecoRetornoGoogle(), usuario: usuarioAtual() } });
  return r.url;
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

export async function excluirCompromisso(id: string, avisar = false): Promise<void> {
  await chamarApi("agendaexcluir", { corpo: { id, avisar, usuario: usuarioAtual() } });
}
