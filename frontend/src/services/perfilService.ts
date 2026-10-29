import type { Perfil } from "@/types";
import { chamarApi, usuarioAtual } from "./http";

export async function obterPerfil(): Promise<Perfil | null> {
  return (await chamarApi<{ perfil: Perfil | null }>("perfil", { query: { usuario: usuarioAtual() } })).perfil;
}

export async function salvarPerfil(p: Omit<Perfil, "usuario" | "criadoEm" | "atualizadoEm">): Promise<Perfil> {
  return (await chamarApi<{ perfil: Perfil }>("perfilsalvar", { corpo: { ...p, usuario: usuarioAtual() } })).perfil;
}
