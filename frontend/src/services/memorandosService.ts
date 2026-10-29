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

/** Cadastra um memorando importado de arquivo antigo (ação "salvar" do api.php, criando um novo). */
export async function importarMemorando(memo: Partial<Memorando>, numero: { seq: number; ano: number } | null, anoAuto: number, arquivo: string): Promise<Memorando> {
  const r = await chamarApi<{ memo: Memorando }>("salvar", {
    corpo: { id: null, numero, anoAuto, usuario: usuarioAtual(), acaoCriou: `Importou do memorando antigo (${arquivo})`, alteracoes: [], memo },
  });
  return r.memo;
}

/** Consulta o CNPJ pelo servidor (BrasilAPI, com ReceitaWS de alternativa); devolve o JSON da fonte. */
export async function consultarCnpj(cnpj: string): Promise<Record<string, unknown>> {
  return chamarApi<Record<string, unknown>>("cnpj", { query: { cnpj } });
}
