export type NivelAcesso = "auxiliar" | "assistente" | "analista" | "encarregado" | "gerente" | "socia";

/** Sessão no navegador: "senha" guarda o token enviado no cabeçalho X-Senha, também usado pelo módulo legado. */
export interface Credencial {
  nome: string;
  senha: string;
  nivel?: NivelAcesso;
  facilitar?: boolean;
  trocarSenha?: boolean;
}

export interface UsuarioSistema { id: number; login: string; nome: string; nivel: NivelAcesso; ativo: boolean; facilitar: boolean; trocarSenha: boolean; ultimoAcesso: string | null }
export interface EmpresaRestrita { raiz: string; nome: string }
