/** Formatadores compartilhados (datas, documentos e números). */

export const digitos = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

export const pad = (n: number | string, tamanho: number): string => String(n).padStart(tamanho, "0");

export function formatarCnpj(v: unknown): string {
  const d = digitos(v);
  if (d.length !== 14) return String(v ?? "");
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** "2026-10-28" → "28/10/2026" */
export function dataBr(iso?: string | null): string {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

/** ISO com hora → "28/10/2026 20:15" */
export function dataHora(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

export function fimDoMes(ano: number, mes: number): string {
  const d = new Date(ano, mes, 0);
  return `${ano}-${pad(mes, 2)}-${pad(d.getDate(), 2)}`;
}

export function diaAnterior(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

/** Número do memorando no padrão do sistema: 05/2026 */
export const numeroMemorando = (seq: number, ano: number): string => `${pad(seq, 2)}/${ano}`;

export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export const plural = (n: number, singular: string, pluralTxt: string): string => `${n} ${n === 1 ? singular : pluralTxt}`;

export function percentual(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v}%`;
}

/** "MARIA DA SILVA" → "Maria da Silva" (mesma regra do módulo legado). */
export function nomeProprio(v: unknown): string {
  const minusculas = new Set(["da", "de", "do", "das", "dos", "e"]);
  return String(v ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p[0].toUpperCase() + p.slice(1))).join(" ");
}
