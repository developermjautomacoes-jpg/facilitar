import type { Credencial } from "@/types";

/**
 * Cliente HTTP do api.php. Todas as ações exigem o cabeçalho X-Senha.
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
  publica?: boolean; // login e primeiro acesso: ainda não há sessão
}

export async function chamarApi<T>(acao: string, opcoes: Opcoes = {}): Promise<T> {
  const cred = credencial;
  if (!cred && !opcoes.publica) throw new ApiError("Entre com seu usuário e senha.", 401);
  const params = new URLSearchParams({ acao, ...(opcoes.query ?? {}) });
  let resposta: Response;
  try {
    resposta = await fetch(`${API_URL}?${params.toString()}`, {
      method: opcoes.corpo !== undefined ? "POST" : "GET",
      headers: { "Content-Type": "application/json", ...(cred ? { "X-Senha": cred.senha } : {}) },
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Sem conexão com o servidor.", 0);
  }
  let json: (T & { erro?: string }) | null = null;
  try { json = (await resposta.json()) as T & { erro?: string }; } catch { /* resposta sem JSON */ }
  if (resposta.status === 401) {
    if (!opcoes.publica && aoNaoAutorizado) aoNaoAutorizado();
    throw new ApiError(json?.erro ?? "Sessão encerrada.", 401);
  }
  if (!resposta.ok || (json && json.erro)) {
    throw new ApiError(json?.erro ?? `Erro no servidor (${resposta.status}).`, resposta.status);
  }
  return json as T;
}

/** Baixa um arquivo do api.php (a autenticação vai no cabeçalho, por isso não dá para usar um link comum). */
export async function baixarArquivo(acao: string, query: Record<string, string>, nome: string, corpo?: unknown): Promise<void> {
  if (!credencial) throw new ApiError("Entre com a senha de acesso.", 401);
  const params = new URLSearchParams({ acao, ...query });
  const resposta = await fetch(`${API_URL}?${params.toString()}`, {
    method: corpo !== undefined ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-Senha": credencial.senha },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    cache: "no-store",
  });
  if (!resposta.ok) {
    const json = (await resposta.json().catch(() => null)) as { erro?: string } | null;
    throw new ApiError(json?.erro ?? `Erro no servidor (${resposta.status}).`, resposta.status);
  }
  const url = URL.createObjectURL(await resposta.blob());
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}

/** Nome de quem está usando o sistema, gravado no histórico pelo api.php. */
export const usuarioAtual = (): string => credencial?.nome ?? "";
