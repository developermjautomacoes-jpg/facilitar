import type { Memorando, HistoricoItem } from "@/types";
import { digitos } from "./format";
import tabelaAnexos from "./cnaeAnexos.json";

/** Regras de situação, idênticas às do módulo legado. */
export const memorandoAtivo = (d: Memorando): boolean => d.status !== "cancelado" && d.situacaoCliente !== "inativa";
export const clienteInativo = (d: Memorando): boolean => d.status !== "cancelado" && d.situacaoCliente === "inativa";
export const memorandoCancelado = (d: Memorando): boolean => d.status === "cancelado";

export function historicoDe(d: Memorando): HistoricoItem[] {
  const h = Array.isArray(d.historico) ? d.historico : [];
  if (h.length) return h;
  return d.criadoEm ? [{ acao: "Criou o memorando", por: d.criadoPorNome, em: d.criadoEm }] : [];
}

export function textoBusca(d: Memorando): string {
  const deps = (d.deps ?? []).filter((x) => x.on).map((x) => `${x.nome} ${x.resp ?? ""}`).join(" ");
  return [d.m_numero, d.e_razao, d.e_fantasia, d.e_cnpj, digitos(d.e_cnpj), d.t_regime, d.t_modalidade, deps, d.criadoPorNome]
    .join(" ")
    .toLowerCase();
}

/** Evento de carteira: entrada pelo "Cliente desde" (ou data do memorando) e saída registrada. */
export interface EventoCarteira {
  memorando: Memorando;
  chave: string;
  entrada: string;
  saida: string;
}

export function eventosCarteira(lista: Memorando[]): EventoCarteira[] {
  return lista
    .filter((d) => d.status !== "cancelado")
    .map((d) => ({
      memorando: d,
      chave: digitos(d.e_cnpj) || d._id,
      entrada: String(d.e_desde || d.m_data || "").slice(0, 10),
      saida: d.situacaoCliente === "inativa" ? String(d.dataSaida || "").slice(0, 10) : "",
    }))
    .filter((e) => e.entrada);
}

export function ativosEm(eventos: EventoCarteira[], dia: string): EventoCarteira[] {
  const porEmpresa = new Map<string, EventoCarteira>();
  eventos.forEach((e) => { if (e.entrada <= dia && (!e.saida || e.saida > dia)) porEmpresa.set(e.chave, e); });
  return [...porEmpresa.values()];
}

/** Anexos do Simples do memorando: manuais ou pelos CNAEs ativos (tabela gerada do legado + regra geral da LC 123, art. 18). */
const ANEXOS = tabelaAnexos as Record<string, string>;
function anexosDoCnae(cod: string): string[] {
  const c = digitos(cod).padStart(7, "0");
  if (ANEXOS[c]) return ANEXOS[c].split(",");
  if (c === "6920601" || c === "6920602") return ["III"];
  const div = Number(c.slice(0, 2));
  if (div >= 10 && div <= 33) return ["II"];
  if (div >= 45 && div <= 47) return ["I"];
  if (div >= 41 && div <= 43) return ["IV"];
  if (div >= 49 && div <= 53) return ["III"];
  return [];
}
export function anexosDoMemorando(d: Memorando): string[] {
  if (Array.isArray(d.anexosManual) && d.anexosManual.length) return d.anexosManual;
  const set = new Set<string>();
  (d.atividades ?? []).filter((a) => a.on).forEach((a) => anexosDoCnae(a.cod).forEach((x) => set.add(x)));
  return ["I", "II", "III", "IV", "V"].filter((x) => set.has(x));
}

export const ehSimples = (regime?: string): boolean => /simples|mei/i.test(regime ?? "");

/** Conta ocorrências e devolve pares ordenados do maior para o menor. */
export function contar(valores: string[]): [string, number][] {
  const c = new Map<string, number>();
  valores.forEach((v) => { if (v) c.set(v, (c.get(v) ?? 0) + 1); });
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
}

/** Empresas em que o colaborador é responsável por algum setor (vínculo por id ou, nos antigos, pelo nome). */
export function empresasDoColaborador(lista: Memorando[], colab: { id: string; nome: string }): { memorando: Memorando; setores: string[] }[] {
  const nome = colab.nome.trim().toLowerCase();
  return lista
    .filter((d) => d.status !== "cancelado")
    .map((d) => ({
      memorando: d,
      setores: (d.deps ?? []).filter((x) => x.on && (x.respId === colab.id || (!x.respId && String(x.resp ?? "").trim().toLowerCase() === nome))).map((x) => x.nome),
    }))
    .filter((x) => x.setores.length)
    .sort((a, b) => Number(clienteInativo(a.memorando)) - Number(clienteInativo(b.memorando)) || String(a.memorando.e_razao ?? "").localeCompare(String(b.memorando.e_razao ?? "")));
}
