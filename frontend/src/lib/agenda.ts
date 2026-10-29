import type { Compromisso, TipoCompromisso } from "@/types";
import { pad } from "./format";

export const TIPOS: { valor: TipoCompromisso; rotulo: string; plural: string }[] = [
  { valor: "reuniao", rotulo: "Reunião", plural: "Reuniões" },
  { valor: "tarefa", rotulo: "Tarefa", plural: "Tarefas" },
  { valor: "evento", rotulo: "Evento", plural: "Eventos" },
];
export const rotuloTipo = (t: TipoCompromisso): string => TIPOS.find((x) => x.valor === t)?.rotulo ?? "Evento";
export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function isoDe(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`; }
export function somarDias(iso: string, n: number): string { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDe(d); }

/** 6 semanas (42 dias) a partir do domingo anterior ao dia 1 do mês. */
export function gradeDoMes(ano: number, mes: number): string[] {
  const primeiro = new Date(ano, mes - 1, 1, 12);
  const inicio = new Date(primeiro); inicio.setDate(1 - primeiro.getDay());
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(inicio); d.setDate(inicio.getDate() + i); return isoDe(d); });
}

/** Dias em que o compromisso aparece (dia inteiro de vários dias aparece em todos; com horário, só no dia de início). */
export function diasDoCompromisso(c: Compromisso): string[] {
  const ini = c.inicio.slice(0, 10);
  if (!c.diaInteiro) return [ini];
  const fimExcl = (c.fim || "").slice(0, 10);
  const dias: string[] = [];
  for (let d = ini; d < fimExcl && dias.length < 62; d = somarDias(d, 1)) dias.push(d);
  return dias.length ? dias : [ini];
}

export const horaDe = (c: Compromisso): string => (c.diaInteiro ? "" : c.inicio.slice(11, 16));
export const horaFim = (c: Compromisso): string => (c.diaInteiro ? "" : c.fim.slice(11, 16));

export function ordenar(a: Compromisso, b: Compromisso): number {
  if (a.diaInteiro !== b.diaInteiro) return a.diaInteiro ? -1 : 1;
  return a.inicio.localeCompare(b.inicio) || a.titulo.localeCompare(b.titulo);
}
