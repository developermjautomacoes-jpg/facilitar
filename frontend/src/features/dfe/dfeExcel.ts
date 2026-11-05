import type { DocumentoDfe, ServicoDfe } from "@/types";
import { dataBr, formatarCnpj } from "@/lib/format";

export const ROTULO_PAPEL: Record<string, string> = { emitente: "Emitente", destinatario: "Destinatário", transportador: "Transportador", tomador: "Tomador", remetente: "Remetente", expedidor: "Expedidor", recebedor: "Recebedor", terceiro: "Terceiro" };
export const ROTULO_SITUACAO: Record<string, string> = { normal: "Normal", cancelada: "Cancelada", denegada: "Denegada" };
export const valido = (d: DocumentoDfe): boolean => d.situacao === "normal";

/** Planilha: documentos válidos e, em aba própria e fora do total, cancelados e denegados. */
export async function exportarExcelDfe(razao: string, cnpj: string, servico: ServicoDfe, competencia: string, docs: DocumentoDfe[]): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const colunas: { titulo: string; largura: number; valor: (d: DocumentoDfe) => string | number; moeda?: boolean }[] = [
    { titulo: "Número", largura: 11, valor: (d) => d.numero }, { titulo: "Série", largura: 7, valor: (d) => d.serie }, { titulo: "Emissão", largura: 12, valor: (d) => dataBr(d.emissao) },
    { titulo: "Papel da empresa", largura: 16, valor: (d) => ROTULO_PAPEL[d.papel] ?? d.papel }, { titulo: "Emitente", largura: 36, valor: (d) => d.emit_nome }, { titulo: "CNPJ/CPF emitente", largura: 20, valor: (d) => formatarCnpj(d.emit_doc) },
    { titulo: servico === "cte" ? "Tomador" : "Destinatário", largura: 20, valor: (d) => formatarCnpj(d.dest_doc) }, { titulo: "Valor", largura: 15, valor: (d) => d.v_total / 100, moeda: true },
    { titulo: "XML", largura: 10, valor: (d) => (d.conteudo === "completa" ? "Completo" : "Só resumo") }, { titulo: "Situação", largura: 12, valor: (d) => ROTULO_SITUACAO[d.situacao] ?? d.situacao }, { titulo: "Chave de acesso", largura: 48, valor: (d) => d.chave },
  ];
  const abas = [{ nome: servico === "cte" ? "CT-e" : "NF-e", linhas: docs.filter(valido) }, { nome: "Canceladas e denegadas", linhas: docs.filter((d) => !valido(d)) }].filter((a) => a.linhas.length);
  for (const aba of abas) {
    const ws = wb.addWorksheet(aba.nome, { views: [{ state: "frozen", ySplit: 3 }] });
    ws.addRow([`${razao} · ${cnpj} · ${competencia.split("-").reverse().join("/")}`]).font = { bold: true };
    ws.addRow([]);
    ws.addRow(colunas.map((c) => c.titulo));
    const topo = ws.getRow(3);
    topo.font = { bold: true, color: { argb: "FFFFFFFF" } };
    topo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3A5C" } };
    colunas.forEach((c, i) => { const col = ws.getColumn(i + 1); col.width = c.largura; if (c.moeda) col.numFmt = '"R$" #,##0.00'; });
    aba.linhas.forEach((d) => ws.addRow(colunas.map((c) => c.valor(d))));
    const ic = colunas.findIndex((c) => c.moeda) + 1, letra = String.fromCharCode(64 + ic), u = aba.linhas.length + 3;
    const total = ws.addRow([]);
    total.getCell(1).value = "TOTAL";
    total.getCell(ic).value = { formula: `SUM(${letra}4:${letra}${u})`, result: aba.linhas.reduce((s, d) => s + d.v_total / 100, 0) };
    total.font = { bold: true };
  }
  const blob = new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `${servico.toUpperCase()}-${cnpj.replace(/\D/g, "")}-${competencia}.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
