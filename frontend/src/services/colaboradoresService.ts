import type { Colaborador, ColaboradorEntrada } from "@/types";
import { chamarApi, usuarioAtual } from "./http";

export async function listarColaboradores(): Promise<Colaborador[]> {
  const r = await chamarApi<{ colaboradores: Colaborador[] }>("colabs");
  return r.colaboradores ?? [];
}

export async function salvarColaborador(colab: ColaboradorEntrada): Promise<{ id: string; colaboradores: Colaborador[] }> {
  return chamarApi("colabsalvar", { corpo: { colab, usuario: usuarioAtual() } });
}

export async function excluirColaborador(id: string): Promise<Colaborador[]> {
  const r = await chamarApi<{ colaboradores: Colaborador[] }>("colabexcluir", { corpo: { id } });
  return r.colaboradores ?? [];
}
