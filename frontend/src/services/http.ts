import type { Credencial } from "@/types";

/**
 * Cliente HTTP do api.php. Todas as ações exigem o cabeçalho X-Senha.
 * Endpoints e formatos são os já existentes no api.php (nenhum endpoint novo é criado aqui).
 */
const API_URL = "api.php";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

let credencial: Credencial | null = null;
let aoNaoAutorizado: (() => void) | null = null;

export function definirCredencial(c: Credencial | null): void { credencial = c; }
export function obterCredencial(): Credencial | null { return credencial; }
export function aoPerderAcesso(fn: (() => void) | null): void { aoNaoAutorizado = fn; }

interface Opcoes {
  corpo?: unknown;
  query?: Record<string, string>;
  credencialAvulsa?: Credencial; // usada só no login, antes de guardar a credencial
}

export async function chamarApi<T>(acao: string, opcoes: Opcoes = {}): Promise<T> {
  const cred = opcoes.credencialAvulsa ?? credencial;
  if (!cred) throw new ApiError("Entre com a senha de acesso.", 401);
  const params = new URLSearchParams({ acao, ...(opcoes.query ?? {}) });
  let resposta: Response;
  try {
    resposta = await fetch(`${API_URL}?${params.toString()}`, {
      method: opcoes.corpo !== undefined ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-Senha": cred.senha },
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Sem conexão com o servidor.", 0);
  }
  let json: (T & { erro?: string }) | null = null;
  try { json = (await resposta.json()) as T & { erro?: string }; } catch { /* resposta sem JSON */ }
  if (resposta.status === 401) {
    if (!opcoes.credencialAvulsa && aoNaoAutorizado) aoNaoAutorizado();
    throw new ApiError(json?.erro ?? "Senha inválida.", 401);
  }
  if (!resposta.ok || (json && json.erro)) {
    throw new ApiError(json?.erro ?? `Erro no servidor (${resposta.status}).`, resposta.status);
  }
  return json as T;
}

/** Nome de quem está usando o sistema, gravado no histórico pelo api.php. */
export const usuarioAtual = (): string => credencial?.nome ?? "";
