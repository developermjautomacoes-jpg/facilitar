import type { Credencial } from "@/types";
import { chamarApi, definirCredencial } from "./http";
import { CHAVES, gravarLocal, lerJson, removerLocal } from "@/lib/storage";

/**
 * Autenticação do api.php: senha única da equipe (variável SENHA_ACESSO) + nome do usuário.
 * A credencial fica no localStorage com a mesma chave do módulo legado, para os dois funcionarem juntos.
 */
export async function entrar(c: Credencial): Promise<void> {
  await chamarApi("listar", { credencialAvulsa: c }); // valida a senha
  gravarLocal(CHAVES.credencial, JSON.stringify(c));
  definirCredencial(c);
}

export function credencialSalva(): Credencial | null {
  const c = lerJson<Credencial>(CHAVES.credencial);
  if (c && c.senha) { definirCredencial(c); return c; }
  return null;
}

export function sair(): void {
  removerLocal(CHAVES.credencial);
  definirCredencial(null);
}
