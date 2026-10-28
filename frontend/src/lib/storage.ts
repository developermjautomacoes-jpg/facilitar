/** Acesso seguro ao localStorage (pode falhar em navegação privada). */
export function lerLocal(chave: string): string | null {
  try { return localStorage.getItem(chave); } catch { return null; }
}
export function gravarLocal(chave: string, valor: string): void {
  try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento local */ }
}
export function removerLocal(chave: string): void {
  try { localStorage.removeItem(chave); } catch { /* sem armazenamento local */ }
}
export function lerJson<T>(chave: string): T | null {
  const v = lerLocal(chave);
  if (!v) return null;
  try { return JSON.parse(v) as T; } catch { return null; }
}

/** Chaves compartilhadas com o módulo legado (mesma origem). */
export const CHAVES = {
  credencial: "memo-cred",
  rascunhoMemorando: "memo-draft",
  planejamento: "facilitar-planej-trib-v2",
} as const;
