import type { Credencial, EmpresaRestrita, NivelAcesso, UsuarioSistema } from "@/types";
import { chamarApi, definirCredencial, obterCredencial } from "./http";
import { CHAVES, gravarLocal, lerJson, removerLocal } from "@/lib/storage";

/** Sessão individual: o token fica no localStorage com a mesma chave do módulo legado, para os dois funcionarem juntos. */
type Sessao = { token: string; usuario: UsuarioSistema };

function guardar(s: Sessao): Credencial {
  const c: Credencial = { nome: s.usuario.nome, senha: s.token, nivel: s.usuario.nivel, facilitar: s.usuario.facilitar, trocarSenha: s.usuario.trocarSenha };
  gravarLocal(CHAVES.credencial, JSON.stringify(c));
  definirCredencial(c);
  return c;
}
export async function entrar(login: string, senha: string): Promise<Credencial> {
  return guardar(await chamarApi<Sessao>("authlogin", { corpo: { login, senha }, publica: true }));
}
export async function primeiroAcesso(d: { senhaSistema: string; nome: string; login: string; senha: string }): Promise<Credencial> {
  return guardar(await chamarApi<Sessao>("authprimeiro", { corpo: d, publica: true }));
}
export async function temUsuarios(): Promise<boolean> {
  return (await chamarApi<{ temUsuarios: boolean }>("authstatus", { publica: true })).temUsuarios;
}
export function credencialSalva(): Credencial | null {
  const c = lerJson<Credencial>(CHAVES.credencial);
  if (c && c.senha && c.nivel) { definirCredencial(c); return c; } // sem nível: credencial antiga, da senha única
  return null;
}
export async function trocarSenha(atual: string, nova: string): Promise<Credencial | null> {
  await chamarApi("authsenha", { corpo: { atual, nova } });
  const c = obterCredencial();
  if (!c) return null;
  const n = { ...c, trocarSenha: false };
  gravarLocal(CHAVES.credencial, JSON.stringify(n)); definirCredencial(n);
  return n;
}
export function sair(): void {
  if (obterCredencial()) void chamarApi("authsair").catch(() => undefined);
  removerLocal(CHAVES.credencial);
  definirCredencial(null);
}

type Lista = { usuarios: UsuarioSistema[] };
export async function listarUsuarios(): Promise<UsuarioSistema[]> { return (await chamarApi<Lista>("authusuarios")).usuarios ?? []; }
export async function salvarUsuario(u: { id?: number; nome: string; login: string; nivel: NivelAcesso; facilitar: boolean; ativo: boolean; senha?: string; cargo: string; setores: string[]; email: string; telefone: string }): Promise<UsuarioSistema[]> {
  return (await chamarApi<Lista>("authusuariosalvar", { corpo: u })).usuarios ?? [];
}
export async function redefinirSenha(id: number, senha: string): Promise<UsuarioSistema[]> {
  return (await chamarApi<Lista>("authusuariosenha", { corpo: { id, senha } })).usuarios ?? [];
}
export async function listarRestritas(): Promise<EmpresaRestrita[]> { return (await chamarApi<{ restritas: EmpresaRestrita[] }>("authrestritas")).restritas ?? []; }
export function salvarRestritas(restritas: EmpresaRestrita[]): Promise<unknown> { return chamarApi("authrestritassalvar", { corpo: { restritas } }); }
