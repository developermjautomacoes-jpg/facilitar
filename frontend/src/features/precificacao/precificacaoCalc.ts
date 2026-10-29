import { cbsDoAno, fatorIcmsIss, ibsDoAno, temPisCofins, type ParametrosReforma } from "@/lib/reforma";

export type TipoOperacao = "produto" | "servico";
export type RegimePreco = "SN_PURO" | "SN_HIBRIDO" | "LP" | "LR";

export const REGIMES_PRECO: { id: RegimePreco; nome: string }[] = [
  { id: "SN_PURO", nome: "Simples puro" },
  { id: "SN_HIBRIDO", nome: "Simples híbrido" },
  { id: "LP", nome: "Lucro Presumido" },
  { id: "LR", nome: "Lucro Real" },
];

export interface EntradaPreco {
  tipo: TipoOperacao;
  ano: number;
  custo: number; // valor pago ao fornecedor por unidade (com os tributos destacados)
  icmsCompra: number; // R$ de ICMS destacado na compra (crédito no regime normal)
  pCredCbs: number; // % das compras com crédito de CBS/IBS (fornecedor do regime regular)
  aliqIcms: number; // % ICMS na venda (produto)
  aliqIss: number; // % ISS (serviço)
  aliqSimples: number; // % alíquota efetiva do Simples (DAS)
  parcelaCbsDas: number; // % do DAS que é PIS/COFINS (vira CBS) — sai do DAS no híbrido
  presIrpj: number; // % presunção IRPJ (Presumido)
  presCsll: number; // % presunção CSLL (Presumido)
  despFixas: number; // % da receita
  despVariaveis: number; // % da receita (comissão, cartão, frete)
  margem: number; // % de lucro líquido desejado sobre o preço
  reducao: number; // % de redução da CBS/IBS do item (regimes diferenciados)
}

export interface LinhaComposicao { rotulo: string; valor: number; percentual: number; tipo: "custo" | "tributo" | "despesa" | "lucro" | "fora" }

export interface ResultadoPreco {
  regime: RegimePreco;
  precoBase: number; // preço sem CBS/IBS por fora (o que entra na receita)
  cbs: number;
  ibs: number;
  precoTotal: number; // valor total da nota (base + CBS/IBS por fora)
  creditoCliente: number; // CBS/IBS que o cliente contribuinte pode creditar
  custoLiquidoCliente: number; // preço total − crédito do cliente
  custoLiquido: number; // custo − créditos aproveitados
  lucro: number;
  markup: number; // preço base ÷ custo pago
  composicao: LinhaComposicao[];
  inviavel: boolean;
}

const pct = (v: number) => v / 100;

/** Crédito de CBS/IBS embutido no valor pago: custo × %crédito × t/(1+t), com t = CBS + IBS do ano (tributo por fora). */
export function creditoCbsIbsCompra(e: EntradaPreco, p: ParametrosReforma): { cbs: number; ibs: number } {
  const c = cbsDoAno(e.ano, p) * (1 - pct(e.reducao)), i = ibsDoAno(e.ano, p) * (1 - pct(e.reducao));
  const t = pct(c + i);
  if (!t) return { cbs: 0, ibs: 0 };
  const total = e.custo * pct(e.pCredCbs) * (t / (1 + t));
  return { cbs: total * (c / (c + i)), ibs: total * (i / (c + i)) };
}

/**
 * Preço de venda pelo método do divisor (markup): preço = custo líquido ÷ (1 − tributos por dentro − despesas − margem).
 * CBS/IBS (a partir de 2027) são calculados por fora sobre o preço sem ICMS/ISS (LC 214, art. 12, V) e somados ao valor da nota.
 */
export function precificar(e: EntradaPreco, regime: RegimePreco, p: ParametrosReforma): ResultadoPreco {
  const F = fatorIcmsIss(e.ano);
  const simples = regime === "SN_PURO" || regime === "SN_HIBRIDO";
  const regularCbs = !simples || regime === "SN_HIBRIDO";
  const cbsAl = cbsDoAno(e.ano, p) * (1 - pct(e.reducao)), ibsAl = ibsDoAno(e.ano, p) * (1 - pct(e.reducao));
  const reforma = cbsAl + ibsAl > 0;

  // custo líquido: tira os créditos que o vendedor aproveita
  const credIcms = !simples && e.tipo === "produto" ? e.icmsCompra * F : 0;
  const credPisCofins = regime === "LR" && temPisCofins(e.ano) ? e.custo * 0.0925 : 0;
  const credCbs = regularCbs && reforma ? creditoCbsIbsCompra(e, p) : { cbs: 0, ibs: 0 };
  const custoLiquido = Math.max(e.custo - credIcms - credPisCofins - credCbs.cbs - credCbs.ibs, 0);

  // tributos por dentro (% do preço base)
  const linhas: { rotulo: string; aliq: number; tipo: LinhaComposicao["tipo"] }[] = [];
  if (simples) {
    const das = e.aliqSimples * (regime === "SN_HIBRIDO" && reforma ? 1 - pct(e.parcelaCbsDas) : 1);
    linhas.push({ rotulo: regime === "SN_HIBRIDO" && reforma ? "DAS (sem a parcela de CBS/IBS)" : "DAS (Simples Nacional)", aliq: das, tipo: "tributo" });
  } else {
    if (e.tipo === "produto" && F > 0) linhas.push({ rotulo: `ICMS${F < 1 ? ` (${Math.round(F * 100)}% na transição)` : ""}`, aliq: e.aliqIcms * F, tipo: "tributo" });
    if (e.tipo === "servico" && F > 0) linhas.push({ rotulo: `ISS${F < 1 ? ` (${Math.round(F * 100)}% na transição)` : ""}`, aliq: e.aliqIss * F, tipo: "tributo" });
    if (temPisCofins(e.ano)) linhas.push({ rotulo: regime === "LP" ? "PIS/COFINS cumulativos (3,65%)" : "PIS/COFINS não cumulativos (9,25%)", aliq: regime === "LP" ? 3.65 : 9.25, tipo: "tributo" });
    if (regime === "LP") linhas.push({ rotulo: "IRPJ e CSLL (presunção)", aliq: e.presIrpj * 0.15 + e.presCsll * 0.09, tipo: "tributo" });
  }
  linhas.push({ rotulo: "Despesas fixas", aliq: e.despFixas, tipo: "despesa" });
  linhas.push({ rotulo: "Despesas variáveis", aliq: e.despVariaveis, tipo: "despesa" });
  // no Lucro Real o IRPJ/CSLL (34%) incide sobre o lucro: a margem antes do IR precisa cobrir a margem líquida desejada
  const margemAntesIr = regime === "LR" ? e.margem / (1 - 0.34) : e.margem;
  if (regime === "LR") linhas.push({ rotulo: "IRPJ e CSLL sobre o lucro (34%)", aliq: margemAntesIr - e.margem, tipo: "tributo" });
  const soma = linhas.reduce((s, l) => s + l.aliq, 0) + e.margem;
  const inviavel = soma >= 100;
  const precoBase = inviavel ? 0 : custoLiquido / (1 - pct(soma));

  // CBS/IBS por fora, sobre o preço sem ICMS/ISS
  const icmsIssValor = !simples ? precoBase * pct((e.tipo === "produto" ? e.aliqIcms : e.aliqIss) * F) : 0;
  const baseCbs = Math.max(precoBase - icmsIssValor, 0);
  const cbs = regularCbs && reforma ? baseCbs * pct(cbsAl) : 0;
  const ibs = regularCbs && reforma ? baseCbs * pct(ibsAl) : 0;
  const precoTotal = precoBase + cbs + ibs;
  // Simples puro: o cliente credita só a CBS/IBS paga dentro do DAS (LC 214, art. 47, § 9º)
  const creditoCliente = regime === "SN_PURO" ? (reforma ? precoBase * pct(e.aliqSimples) * pct(e.parcelaCbsDas) : 0) : cbs + ibs;

  const composicao: LinhaComposicao[] = [
    { rotulo: "Custo líquido (custo − créditos)", valor: custoLiquido, percentual: precoBase ? (100 * custoLiquido) / precoBase : 0, tipo: "custo" },
    ...linhas.map((l) => ({ rotulo: l.rotulo, valor: precoBase * pct(l.aliq), percentual: l.aliq, tipo: l.tipo })),
    { rotulo: "Lucro líquido", valor: precoBase * pct(e.margem), percentual: e.margem, tipo: "lucro" as const },
  ];
  if (cbs) composicao.push({ rotulo: `CBS por fora (${cbsAl.toFixed(2).replace(".", ",")}%)`, valor: cbs, percentual: precoBase ? (100 * cbs) / precoBase : 0, tipo: "fora" });
  if (ibs) composicao.push({ rotulo: `IBS por fora (${ibsAl.toFixed(2).replace(".", ",")}%)`, valor: ibs, percentual: precoBase ? (100 * ibs) / precoBase : 0, tipo: "fora" });

  return {
    regime, precoBase, cbs, ibs, precoTotal, creditoCliente, custoLiquidoCliente: precoTotal - creditoCliente,
    custoLiquido, lucro: precoBase * pct(e.margem), markup: e.custo ? precoBase / e.custo : 0, composicao, inviavel,
  };
}
