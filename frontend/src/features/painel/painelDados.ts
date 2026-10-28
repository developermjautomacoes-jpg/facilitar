import type { Colaborador, Memorando } from "@/types";
import { MESES } from "@/lib/constantes";
import { diaAnterior, fimDoMes, hojeISO, nomeProprio, pad } from "@/lib/format";
import { anexosDoMemorando, ativosEm, clienteInativo, contar, ehSimples, eventosCarteira, type EventoCarteira } from "@/lib/memorando";

export interface DadosMes { entradas: number; saidas: number; ativosNoFim: number | null }

export interface DadosPainel {
  periodo: string;
  referencia: string;
  anosDisponiveis: number[];
  ativos: number;
  entradas: EventoCarteira[];
  saidas: EventoCarteira[];
  saldo: number;
  variacao: number | null;
  ativosInicio: number;
  inativosTotal: number;
  meses: DadosMes[];
  porRegime: [string, number][];
  porSetor: [string, number][];
  porAnexo: [string, number][];
  porResponsavel: [string, number][];
  porFerramenta: [string, number][];
  porMotivo: [string, number][];
}

/** Indicadores da carteira (mesmas regras do painel do módulo legado). */
export function calcularPainel(lista: Memorando[], colaboradores: Colaborador[], ano: number, mes: number): DadosPainel {
  const ev = eventosCarteira(lista);
  const hoje = hojeISO();
  const anoHoje = Number(hoje.slice(0, 4));
  const anos = [...new Set([anoHoje, ...ev.map((e) => +e.entrada.slice(0, 4)), ...ev.filter((e) => e.saida).map((e) => +e.saida.slice(0, 4))])]
    .filter((a) => a > 2000).sort((a, b) => b - a);
  const ini = mes ? `${ano}-${pad(mes, 2)}-01` : `${ano}-01-01`;
  const fim = mes ? fimDoMes(ano, mes) : `${ano}-12-31`;
  const ref = fim < hoje ? fim : hoje;
  const entradas = ev.filter((e) => e.entrada >= ini && e.entrada <= fim);
  const saidas = ev.filter((e) => e.saida && e.saida >= ini && e.saida <= fim);
  const atFim = ativosEm(ev, ref);
  const atIni = ativosEm(ev, diaAnterior(ini));
  const meses: DadosMes[] = MESES.map((_, i) => {
    const a = `${ano}-${pad(i + 1, 2)}-01`, b = fimDoMes(ano, i + 1);
    return {
      entradas: ev.filter((e) => e.entrada >= a && e.entrada <= b).length,
      saidas: ev.filter((e) => e.saida && e.saida >= a && e.saida <= b).length,
      ativosNoFim: a > hoje ? null : ativosEm(ev, b < hoje ? b : hoje).length,
    };
  });
  const at = atFim.map((e) => e.memorando);
  const nomeResp = (resp?: string, respId?: string) => colaboradores.find((c) => c.id === respId)?.nome ?? nomeProprio(resp);
  return {
    periodo: mes ? `${MESES[mes - 1]} de ${ano}` : `ano de ${ano}`,
    referencia: ref,
    anosDisponiveis: anos,
    ativos: atFim.length,
    entradas,
    saidas,
    saldo: entradas.length - saidas.length,
    variacao: atIni.length ? Math.round((100 * (atFim.length - atIni.length)) / atIni.length) : null,
    ativosInicio: atIni.length,
    inativosTotal: lista.filter(clienteInativo).length,
    meses,
    porRegime: contar(at.map((d) => (d.t_regime || "Não informado") + (d.t_regime === "Simples Nacional" && d.t_modalidade ? ` – ${d.t_modalidade}` : ""))),
    porSetor: contar(at.flatMap((d) => (d.deps ?? []).filter((x) => x.on).map((x) => x.nome))),
    porAnexo: contar(at.filter((d) => ehSimples(d.t_regime)).flatMap((d) => { const a = anexosDoMemorando(d); return a.length ? a.map((x) => `Anexo ${x}`) : ["Sem anexo"]; })),
    porResponsavel: contar(at.flatMap((d) => [...new Set((d.deps ?? []).filter((x) => x.on && String(x.resp ?? "").trim()).map((x) => nomeResp(x.resp, x.respId)))])),
    porFerramenta: contar(at.flatMap((d) => (d.ferramentas?.length ? d.ferramentas : ["Nenhuma marcada"]))),
    porMotivo: contar(saidas.map((e) => e.memorando.motivoSaida || "Não informado")),
  };
}
