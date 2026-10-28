import type { Memorando, SaidaCliente, StatusMemorando } from "@/types";
import { chamarApi, usuarioAtual } from "./http";

/** Ações de memorandos do api.php: listar, status, cliente e excluir. O cadastro em si fica no módulo legado (ação salvar). */
export async function listarMemorandos(): Promise<Memorando[]> {
  const r = await chamarApi<{ memorandos: Memorando[] }>("listar");
  return r.memorandos ?? [];
}

export async function alterarStatus(id: string, status: StatusMemorando): Promise<void> {
  await chamarApi("status", { corpo: { id, status, usuario: usuarioAtual() } });
}

export async function registrarSaida(id: string, saida: SaidaCliente): Promise<void> {
  await chamarApi("cliente", { corpo: { id, situacaoCliente: "inativa", ...saida, usuario: usuarioAtual() } });
}

export async function reativarCliente(id: string): Promise<void> {
  await chamarApi("cliente", { corpo: { id, situacaoCliente: "ativa", usuario: usuarioAtual() } });
}

export async function excluirMemorando(id: string): Promise<void> {
  await chamarApi("excluir", { corpo: { id, usuario: usuarioAtual() } });
}
