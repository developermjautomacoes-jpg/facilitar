import type { NotaNfse, SituacaoNfse } from "@/types";
import { dataBr, digitos, formatarCnpj } from "@/lib/format";

export const ROTULO_SITUACAO: Record<SituacaoNfse, string> = {
  normal: "Normal", cancelada: "Cancelada", substituida: "Substituída", em_analise: "Cancelamento em análise", bloqueada: "Bloqueada",
};
export const ROTULO_RET_ISS: Record<string, string> = { "1": "Não retido", "2": "Retido pelo tomador", "3": "Retido pelo intermediário" };
export const valida = (n: NotaNfse): boolean => n.situacao !== "cancelada" && n.situacao !== "substituida";
export const issRetido = (n: NotaNfse): number => (n.tp_ret_iss === "2" || n.tp_ret_iss === "3" ? n.v_iss : 0);

type Tipo = "texto" | "moeda" | "aliq";
const COLUNAS: { titulo: string; largura: number; tipo: Tipo; valor: (n: NotaNfse) => string | number }[] = [
  { titulo: "No NFS-e", largura: 11, tipo: "texto", valor: (n) => n.numero },
  { titulo: "Dt Emissao", largura: 12, tipo: "texto", valor: (n) => dataBr(n.emissao) },
  { titulo: "Competencia", largura: 12, tipo: "texto", valor: (n) => n.competencia.split("-").reverse().join("/") },
  { titulo: "Prestador", largura: 34, tipo: "texto", valor: (n) => n.prest_nome },
  { titulo: "CNPJ Prestador", largura: 20, tipo: "texto", valor: (n) => formatarCnpj(n.prest_doc) },
  { titulo: "Tomador", largura: 34, tipo: "texto", valor: (n) => n.toma_nome },
  { titulo: "CNPJ Tomador", largura: 20, tipo: "texto", valor: (n) => formatarCnpj(n.toma_doc) },
  { titulo: "Descricao Servico", largura: 44, tipo: "texto", valor: (n) => n.descricao },
  { titulo: "Cod NBS", largura: 12, tipo: "texto", valor: (n) => n.c_nbs },
  { titulo: "Desc NBS", largura: 34, tipo: "texto", valor: (n) => n.x_nbs },
  { titulo: "Cod Trib", largura: 10, tipo: "texto", valor: (n) => n.trib_nac },
  { titulo: "Tributacao Nacional", largura: 34, tipo: "texto", valor: (n) => n.desc_nac },
  { titulo: "Local Incidencia", largura: 20, tipo: "texto", valor: (n) => n.mun_incid },
  { titulo: "Cod IBGE", largura: 10, tipo: "texto", valor: (n) => n.c_loc_incid },
  { titulo: "CNO Obra", largura: 15, tipo: "texto", valor: (n) => n.cno_obra },
  { titulo: "Vl Servico", largura: 15, tipo: "moeda", valor: (n) => n.v_serv / 100 },
  { titulo: "Base ISS", largura: 15, tipo: "moeda", valor: (n) => n.v_bc / 100 },
  { titulo: "Aliq ISS", largura: 9, tipo: "aliq", valor: (n) => (n.aliq ? Number(n.aliq) : 0) },
  { titulo: "Vl ISS", largura: 14, tipo: "moeda", valor: (n) => n.v_iss / 100 },
  { titulo: "Situacao ISS", largura: 22, tipo: "texto", valor: (n) => ROTULO_RET_ISS[n.tp_ret_iss] ?? n.tp_ret_iss },
  { titulo: "INSS/CP", largura: 14, tipo: "moeda", valor: (n) => n.v_ret_cp / 100 },
  { titulo: "IRRF", largura: 14, tipo: "moeda", valor: (n) => n.v_ret_irrf / 100 },
  { titulo: "CSLL", largura: 14, tipo: "moeda", valor: (n) => n.v_ret_csll / 100 },
  { titulo: "PIS", largura: 13, tipo: "moeda", valor: (n) => n.v_pis / 100 },
  { titulo: "COFINS", largura: 13, tipo: "moeda", valor: (n) => n.v_cofins / 100 },
  { titulo: "PIS+COF", largura: 13, tipo: "moeda", valor: (n) => (n.v_pis + n.v_cofins) / 100 },
  { titulo: "Tot Ret", largura: 14, tipo: "moeda", valor: (n) => n.v_total_ret / 100 },
  { titulo: "Vl Liquido", largura: 15, tipo: "moeda", valor: (n) => n.v_liq / 100 },
];
const MOEDA = '"R$" #,##0.00';
const AZUL = "FF1B3A5C";
const ABAS: { nome: string; filtro: (n: NotaNfse) => boolean }[] = [
  { nome: "Prestadas", filtro: (n) => n.papel === "prestador" && valida(n) },
  { nome: "Tomadas", filtro: (n) => n.papel === "tomador" && valida(n) },
  { nome: "Intermediadas", filtro: (n) => n.papel === "intermediario" && valida(n) },
  { nome: "Outras", filtro: (n) => n.papel === "outro" && valida(n) },
  { nome: "Canceladas", filtro: (n) => !valida(n) },
];
const letra = (i: number): string => { let s = ""; for (let n = i; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** Planilha: uma aba por tipo de nota, com linha de total; canceladas e substituídas ficam em aba própria e fora do resumo. */
export async function exportarExcel(razao: string, cnpj: string, competencia: string, notas: NotaNfse[], parcial = false): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const resumo = wb.addWorksheet("Resumo");
  const abas = ABAS.filter((a) => notas.some(a.filtro));
  const moedas = COLUNAS.map((c, i) => ({ ...c, i })).filter((c) => c.tipo === "moeda");
  for (const aba of abas) {
    const ws = wb.addWorksheet(aba.nome, { views: [{ state: "frozen", ySplit: 1 }] });
    const linhas = notas.filter(aba.filtro);
    ws.columns = COLUNAS.map((c) => ({ header: c.titulo, width: c.largura, style: { numFmt: c.tipo === "moeda" ? MOEDA : c.tipo === "aliq" ? "0.00" : "@" } }));
    linhas.forEach((n) => ws.addRow(COLUNAS.map((c) => (c.tipo === "texto" ? String(c.valor(n)) : c.valor(n)))));
    const topo = ws.getRow(1);
    topo.font = { bold: true, color: { argb: "FFFFFFFF" } };
    topo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    topo.alignment = { wrapText: true, vertical: "middle" };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS.length } };
    const u = linhas.length + 1;
    const total = ws.addRow(COLUNAS.map((c, i) => {
      if (i === 0) return "TOTAL";
      if (c.tipo !== "moeda") return "";
      const col = letra(i + 1);
      return { formula: `SUM(${col}2:${col}${u})`, result: linhas.reduce((s, n) => s + Number(c.valor(n)), 0) };
    }));
    total.font = { bold: true };
    total.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6EDF5" } };
  }
  const contam = abas.filter((a) => a.nome !== "Canceladas");
  [["Empresa", razao], ["CNPJ", cnpj], ["Competência", competencia.split("-").reverse().join("/")]].forEach((l) => { const r = resumo.addRow(l); r.getCell(1).font = { bold: true }; });
  if (parcial) resumo.addRow(["Abrangência", `Somente as ${notas.length} notas selecionadas`]).getCell(1).font = { bold: true };
  resumo.addRow([]);
  const titulo = resumo.addRow(["Totais sem canceladas e substituídas", ...contam.map((a) => a.nome)]);
  titulo.font = { bold: true, color: { argb: "FFFFFFFF" } };
  titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  titulo.alignment = { wrapText: true };
  const qtd = resumo.addRow(["Quantidade de notas", ...contam.map((a) => notas.filter(a.filtro).length)]);
  qtd.numFmt = "0";
  for (const c of moedas) {
    const l = resumo.addRow([c.titulo, ...contam.map((a) => {
      const linhas = notas.filter(a.filtro);
      return { formula: `'${a.nome}'!${letra(c.i + 1)}${linhas.length + 2}`, result: linhas.reduce((s, n) => s + Number(c.valor(n)), 0) };
    })]);
    contam.forEach((_, k) => { l.getCell(k + 2).numFmt = MOEDA; });
  }
  resumo.addRow([]);
  resumo.addRow(["Fonte: XML das NFS-e no Ambiente de Dados Nacional, sem recálculo. Situacao ISS conforme tpRetISSQN (LC 116/2003, art. 6º). PIS e COFINS como informados na nota: só entram em Tot Ret quando retidos."]).getCell(1).font = { italic: true, size: 9 };
  resumo.getColumn(1).width = 40;
  contam.forEach((_, k) => { resumo.getColumn(k + 2).width = 18; });
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = `NFSe-${digitos(cnpj) || cnpj}-${competencia}${parcial ? "-selecionadas" : ""}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}
