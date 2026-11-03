import type { NotaNfse, PapelNfse, SituacaoNfse } from "@/types";
import { dataBr, digitos } from "@/lib/format";

export const ROTULO_SITUACAO: Record<SituacaoNfse, string> = {
  normal: "Normal", cancelada: "Cancelada", substituida: "Substituída", em_analise: "Cancelamento em análise", bloqueada: "Bloqueada",
};
export const ROTULO_RET_ISS: Record<string, string> = { "1": "Não retido", "2": "Retido pelo tomador", "3": "Retido pelo intermediário" };
export const valida = (n: NotaNfse): boolean => n.situacao !== "cancelada" && n.situacao !== "substituida";
export const issRetido = (n: NotaNfse): number => (n.tp_ret_iss === "2" || n.tp_ret_iss === "3" ? n.v_iss : 0);

type Tipo = "texto" | "moeda" | "aliq";
const COLUNAS: { titulo: string; largura: number; tipo: Tipo; valor: (n: NotaNfse) => string | number }[] = [
  { titulo: "Situação", largura: 16, tipo: "texto", valor: (n) => ROTULO_SITUACAO[n.situacao] ?? n.situacao },
  { titulo: "Número", largura: 11, tipo: "texto", valor: (n) => n.numero },
  { titulo: "Emissão", largura: 12, tipo: "texto", valor: (n) => dataBr(n.emissao) },
  { titulo: "Competência", largura: 12, tipo: "texto", valor: (n) => dataBr(n.data_competencia) },
  { titulo: "CNPJ/CPF prestador", largura: 19, tipo: "texto", valor: (n) => n.prest_doc },
  { titulo: "Prestador", largura: 34, tipo: "texto", valor: (n) => n.prest_nome },
  { titulo: "CNPJ/CPF tomador", largura: 19, tipo: "texto", valor: (n) => n.toma_doc },
  { titulo: "Tomador", largura: 34, tipo: "texto", valor: (n) => n.toma_nome },
  { titulo: "Cód. trib. nacional", largura: 13, tipo: "texto", valor: (n) => n.trib_nac },
  { titulo: "Cód. trib. municipal", largura: 13, tipo: "texto", valor: (n) => n.trib_mun },
  { titulo: "Descrição do serviço", largura: 44, tipo: "texto", valor: (n) => n.descricao },
  { titulo: "Município de incidência", largura: 20, tipo: "texto", valor: (n) => n.mun_incid },
  { titulo: "Valor do serviço", largura: 15, tipo: "moeda", valor: (n) => n.v_serv / 100 },
  { titulo: "Base ISS", largura: 15, tipo: "moeda", valor: (n) => n.v_bc / 100 },
  { titulo: "Alíquota ISS %", largura: 10, tipo: "aliq", valor: (n) => (n.aliq ? Number(n.aliq) : 0) },
  { titulo: "Valor ISS", largura: 14, tipo: "moeda", valor: (n) => n.v_iss / 100 },
  { titulo: "Retenção ISS", largura: 22, tipo: "texto", valor: (n) => ROTULO_RET_ISS[n.tp_ret_iss] ?? n.tp_ret_iss },
  { titulo: "IRRF retido", largura: 14, tipo: "moeda", valor: (n) => n.v_ret_irrf / 100 },
  { titulo: "CSLL retida", largura: 14, tipo: "moeda", valor: (n) => n.v_ret_csll / 100 },
  { titulo: "CP retida", largura: 14, tipo: "moeda", valor: (n) => n.v_ret_cp / 100 },
  { titulo: "PIS", largura: 13, tipo: "moeda", valor: (n) => n.v_pis / 100 },
  { titulo: "COFINS", largura: 13, tipo: "moeda", valor: (n) => n.v_cofins / 100 },
  { titulo: "Total retido (XML)", largura: 15, tipo: "moeda", valor: (n) => n.v_total_ret / 100 },
  { titulo: "Valor líquido", largura: 15, tipo: "moeda", valor: (n) => n.v_liq / 100 },
  { titulo: "IBS", largura: 13, tipo: "moeda", valor: (n) => n.v_ibs / 100 },
  { titulo: "CBS", largura: 13, tipo: "moeda", valor: (n) => n.v_cbs / 100 },
  { titulo: "Chave de acesso", largura: 54, tipo: "texto", valor: (n) => n.chave },
];
const MOEDA = '"R$" #,##0.00';
const ABAS: { nome: string; papel: PapelNfse }[] = [
  { nome: "Prestadas", papel: "prestador" }, { nome: "Tomadas", papel: "tomador" }, { nome: "Intermediadas", papel: "intermediario" }, { nome: "Outras", papel: "outro" },
];
const letra = (i: number): string => { let s = ""; for (let n = i; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** Planilha da competência: uma aba por papel da empresa e um resumo com fórmulas que ignoram canceladas e substituídas. */
export async function exportarExcel(razao: string, cnpj: string, competencia: string, notas: NotaNfse[]): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const resumo = wb.addWorksheet("Resumo");
  const abas = ABAS.filter((a) => notas.some((n) => n.papel === a.papel));
  for (const aba of abas) {
    const ws = wb.addWorksheet(aba.nome, { views: [{ state: "frozen", ySplit: 1 }] });
    const linhas = notas.filter((n) => n.papel === aba.papel);
    ws.columns = COLUNAS.map((c) => ({ header: c.titulo, width: c.largura, style: { numFmt: c.tipo === "moeda" ? MOEDA : c.tipo === "aliq" ? "0.00" : "@" } }));
    linhas.forEach((n) => ws.addRow(COLUNAS.map((c) => {
      const v = c.valor(n);
      return c.tipo === "texto" ? String(v) : v;
    })));
    const topo = ws.getRow(1);
    topo.font = { bold: true, color: { argb: "FFFFFFFF" } };
    topo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3A5C" } };
    topo.alignment = { wrapText: true, vertical: "middle" };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS.length } };
  }
  const cab = [["Empresa", razao], ["CNPJ", cnpj], ["Competência", competencia.split("-").reverse().join("/")]];
  cab.forEach((l) => { const r = resumo.addRow(l); r.getCell(1).font = { bold: true }; });
  resumo.addRow([]);
  const titulo = resumo.addRow(["Notas válidas (sem canceladas e substituídas)", ...abas.map((a) => a.nome)]);
  titulo.font = { bold: true, color: { argb: "FFFFFFFF" } };
  titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3A5C" } };
  titulo.alignment = { wrapText: true };
  const ultima = (a: { papel: PapelNfse }) => notas.filter((n) => n.papel === a.papel).length + 1;
  const crit = (nome: string, u: number) => `'${nome}'!$A$2:$A$${u},"<>Cancelada",'${nome}'!$A$2:$A$${u},"<>Substituída"`;
  const r = resumo.addRow(["Quantidade", ...abas.map((a) => ({
    formula: `COUNTIFS(${crit(a.nome, ultima(a))})`, result: notas.filter((n) => n.papel === a.papel && valida(n)).length,
  }))]);
  r.numFmt = "0";
  for (const titulo of ["Valor do serviço", "Valor ISS", "IRRF retido", "CSLL retida", "CP retida", "Total retido (XML)", "Valor líquido", "IBS", "CBS"]) {
    const i = COLUNAS.findIndex((c) => c.titulo === titulo);
    const col = COLUNAS[i];
    const l = resumo.addRow([titulo, ...abas.map((a) => {
      const u = ultima(a); const c = letra(i + 1);
      return { formula: `SUMIFS('${a.nome}'!$${c}$2:$${c}$${u},${crit(a.nome, u)})`, result: notas.filter((n) => n.papel === a.papel && valida(n)).reduce((s, n) => s + Number(col.valor(n)), 0) };
    })]);
    abas.forEach((_, k) => { l.getCell(k + 2).numFmt = MOEDA; });
  }
  resumo.addRow([]);
  resumo.addRow(["Fonte: XML das NFS-e no Ambiente de Dados Nacional. ISS retido indicado na nota (LC 116/2003, art. 6º). Valores conforme o documento, sem recálculo."]).getCell(1).font = { italic: true, size: 9 };
  resumo.getColumn(1).width = 46;
  abas.forEach((_, k) => { resumo.getColumn(k + 2).width = 18; });
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = `NFSe-${digitos(cnpj) || cnpj}-${competencia}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}
