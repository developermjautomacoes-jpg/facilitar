import type { Color, PDFFont, PDFPage } from "pdf-lib";
import type { SituacaoNfse } from "@/types";

/**
 * DANFSe v2.0 em PDF, gerado no navegador a partir do XML guardado.
 * Blocos, rótulos e regras seguem a NT SE/CGNFS-e 008/2026 (v1.02): A4 retrato, uma página, um campo por tag do XML,
 * traço nos campos vazios, QR Code da consulta pública e marca d'água de cancelada ou substituída.
 */
export interface NotaXml { chave: string; situacao: SituacaoNfse; xml: string }

const A4 = { l: 595.28, a: 841.89 };
const MARGEM = 5.5;
const PRETO = 0;
const CINZA_FUNDO = 0.95;

const CSTAT: Record<string, string> = { "100": "NFS-e Gerada", "101": "NFS-e de Substituição", "102": "NFS-e de Decisão Judicial ou Administrativa", "103": "NFS-e Avulsa" };
const TP_EMIT: Record<string, string> = { "1": "Prestador", "2": "Tomador", "3": "Intermediário" };
const OP_SIMPLES: Record<string, string> = { "1": "Não Optante", "2": "Optante - Microempreendedor Individual (MEI)", "3": "Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)" };
const REG_AP_SN: Record<string, string> = {
  "1": "Tributos federais e municipal pelo SN", "2": "Tributos federais pelo SN e ISSQN por fora do SN", "3": "Tributos federais e municipal por fora do SN",
};
const REG_ESP: Record<string, string> = { "0": "Nenhum", "1": "Ato Cooperado (Cooperativa)", "2": "Estimativa", "3": "Microempresa Municipal", "4": "Notário ou Registrador", "5": "Profissional Autônomo", "6": "Sociedade de Profissionais", "9": "Outros" };
const TRIB_ISS: Record<string, string> = { "1": "Operação Tributável", "2": "Imunidade", "3": "Exportação de Serviço", "4": "Não Incidência" };
const RET_ISS: Record<string, string> = { "1": "Não Retido", "2": "Retido pelo Tomador", "3": "Retido pelo Intermediário" };
const RET_PIS: Record<string, string> = {
  "0": "PIS/COFINS/CSLL Não Retidos", "1": "PIS/COFINS Retidos", "2": "PIS/COFINS Não Retidos", "3": "PIS/COFINS/CSLL Retidos", "4": "PIS/COFINS Retidos, CSLL Não Retido",
  "5": "PIS Retido, COFINS/CSLL Não Retido", "6": "COFINS Retido, PIS/CSLL Não Retido", "7": "PIS Não Retido, COFINS/CSLL Retidos", "8": "PIS/COFINS Não Retidos, CSLL Retido", "9": "COFINS Não Retido, PIS/CSLL Retidos",
};

/** Leitor do XML por nome local dos elementos, sem depender de namespace. */
function leitor(raiz: Element) {
  const filho = (el: Element | null, nome: string) => (el ? Array.from(el.children).find((c) => c.localName === nome) ?? null : null);
  const no = (caminho: string): Element | null => caminho.split("/").reduce<Element | null>((el, n) => filho(el, n), raiz);
  return { no, t: (caminho: string) => no(caminho)?.textContent?.trim() ?? "" };
}
const ou = (v: string) => v || "-";
const num = (v: string) => (v === "" ? 0 : Number(v));
const moeda = (v: string | number) => (v === "" ? "-" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v: string) => (v === "" ? "-" : `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
const data = (v: string) => { const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}:\d{2}))?/); return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}` : ""}` : ou(v); };
const documento = (v: string) => {
  if (/^[0-9A-Z]{12}\d{2}$/.test(v)) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
  if (/^\d{11}$/.test(v)) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
  return ou(v);
};
const cep = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(0, 2)}.${v.slice(2, 5)}-${v.slice(5)}` : v);
const juntar = (partes: string[], sep = ", ") => partes.filter(Boolean).join(sep);

interface Campo { r: string; v: string; col?: number }
type Linha = Campo[];
interface Parte { doc: string; im: string; fone: string; nome: string; mun: string; ibgeCep: string; end: string; email: string }

function pessoa(t: (c: string) => string, g: string, municipio = ""): Parte | null {
  const doc = t(`${g}/CNPJ`) || t(`${g}/CPF`) || t(`${g}/NIF`);
  const nome = t(`${g}/xNome`);
  if (!doc && !nome) return null;
  const ext = t(`${g}/end/endExt/xCidade`);
  const cMun = t(`${g}/end/endNac/cMun`);
  return {
    doc: documento(doc), im: t(`${g}/IM`), fone: t(`${g}/fone`), nome, email: t(`${g}/email`),
    mun: ext || municipio || "",
    ibgeCep: ext ? ou(t(`${g}/end/endExt/cEndPost`)) : juntar([cMun, cep(t(`${g}/end/endNac/CEP`))], " / "),
    end: juntar([t(`${g}/end/xLgr`), t(`${g}/end/nro`), t(`${g}/end/xCpl`), t(`${g}/end/xBairro`)]),
  };
}

function linhasPessoa(p: Parte, comIm = true): Linha[] {
  return [
    [{ r: "CNPJ / CPF / NIF", v: p.doc }, ...(comIm ? [{ r: "Indicador Municipal", v: ou(p.im) }] : []), { r: "Telefone", v: ou(p.fone) }, { r: "E-mail", v: ou(p.email), col: comIm ? 1 : 2 }],
    [{ r: "Nome / Nome Empresarial", v: ou(p.nome), col: 2 }, { r: "Município / Sigla UF", v: ou(p.mun) }, { r: "Código IBGE / CEP", v: ou(p.ibgeCep) }],
    [{ r: "Endereço", v: ou(p.end), col: 4 }],
  ];
}

function complementares(t: (c: string) => string): { texto: string; totais: string } {
  const d = "DPS/infDPS";
  const partes = [
    t(`${d}/serv/infoCompl/xInfComp`) && `Inf. Cont.: ${t(`${d}/serv/infoCompl/xInfComp`)}`,
    t(`${d}/subst/chSubstda`) && `NFS-e Subst.: ${t(`${d}/subst/chSubstda`)}`,
    t(`${d}/serv/obra/cObra`) && `Cod. Obra: ${t(`${d}/serv/obra/cObra`)}`,
    t(`${d}/serv/obra/inscImobFisc`) && `Insc. Imob.: ${t(`${d}/serv/obra/inscImobFisc`)}`,
    t(`${d}/serv/atvEvento/idAtvEvt`) && `Cod. Evt.: ${t(`${d}/serv/atvEvento/idAtvEvt`)}`,
    t(`${d}/serv/infoCompl/idDocTec`) && `Doc. Tec.: ${t(`${d}/serv/infoCompl/idDocTec`)}`,
    t(`${d}/serv/infoCompl/gItemPed/xItemPed`) && `Item Ped.: ${t(`${d}/serv/infoCompl/gItemPed/xItemPed`)}`,
    t("xOutInf") && `Inf. A. T. Mun.: ${t("xOutInf")}`,
  ];
  const tt = `${d}/valores/trib/totTrib`;
  let totais = "Totais Aproximados dos Tributos: -";
  if (t(`${tt}/vTotTrib/vTotTribFed`)) totais = `Totais Aproximados dos Tributos: Federais ${moeda(t(`${tt}/vTotTrib/vTotTribFed`))} / Estaduais ${moeda(t(`${tt}/vTotTrib/vTotTribEst`))} / Municipais ${moeda(t(`${tt}/vTotTrib/vTotTribMun`))}`;
  else if (t(`${tt}/pTotTrib/pTotTribFed`)) totais = `Totais Aproximados dos Tributos: Federais ${pct(t(`${tt}/pTotTrib/pTotTribFed`))} / Estaduais ${pct(t(`${tt}/pTotTrib/pTotTribEst`))} / Municipais ${pct(t(`${tt}/pTotTrib/pTotTribMun`))}`;
  else if (t(`${tt}/pTotTribSN`)) totais = `Totais Aproximados dos Tributos: Simples Nacional ${pct(t(`${tt}/pTotTribSN`))}`;
  return { texto: juntar(partes.filter(Boolean) as string[], " | "), totais };
}

/** Só caracteres que a fonte do PDF consegue escrever. */
const limpo = (s: string) => s.replace(/\s+/g, " ").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

export async function gerarDanfsePdf(notas: NotaXml[]): Promise<Uint8Array> {
  const [{ PDFDocument, StandardFonts, degrees, grayscale, rgb }, QR] = await Promise.all([import("pdf-lib"), import("qrcode")]);
  const pdf = await PDFDocument.create();
  pdf.setTitle(notas.length === 1 ? `DANFSe ${notas[0].chave}` : `DANFSe - ${notas.length} notas`);
  const fN = await pdf.embedFont(StandardFonts.Helvetica);
  const fB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const preto = grayscale(PRETO);

  for (const nota of notas) {
    const dom = new DOMParser().parseFromString(nota.xml, "application/xml");
    const inf = Array.from(dom.documentElement.children).find((c) => c.localName === "infNFSe");
    if (!inf || dom.querySelector("parsererror")) throw new Error(`XML ilegível na nota ${nota.chave}.`);
    const { t } = leitor(inf);
    const p: PDFPage = pdf.addPage([A4.l, A4.a]);
    const X = MARGEM; const L = A4.l - 2 * MARGEM;
    let y = A4.a - MARGEM;
    p.drawRectangle({ x: X, y: MARGEM, width: L, height: A4.a - 2 * MARGEM, borderWidth: 1, borderColor: preto });

    const escreve = (s: string, x: number, yy: number, size: number, font: PDFFont, cor: Color = preto) => p.drawText(s, { x, y: yy, size, font, color: cor });
    const corta = (texto: string, font: PDFFont, size: number, largura: number) => {
      let s = limpo(texto);
      if (font.widthOfTextAtSize(s, size) <= largura) return s;
      while (s && font.widthOfTextAtSize(`${s}...`, size) > largura) s = s.slice(0, -1);
      return `${s}...`;
    };
    const quebra = (texto: string, size: number, largura: number, maxLinhas: number) => {
      const linhas: string[] = []; let atual = "";
      for (const pal of limpo(texto).split(" ")) {
        const prova = atual ? `${atual} ${pal}` : pal;
        if (fN.widthOfTextAtSize(prova, size) <= largura) atual = prova;
        else { linhas.push(atual); atual = pal; }
      }
      if (atual) linhas.push(atual);
      if (linhas.length > maxLinhas) { const r = linhas.slice(0, maxLinhas); r[maxLinhas - 1] = corta(`${r[maxLinhas - 1]} ${linhas[maxLinhas]}`, fN, size, largura - 10); return r; }
      return linhas;
    };
    const divisoria = (yy: number) => p.drawLine({ start: { x: X, y: yy }, end: { x: X + L, y: yy }, thickness: 0.5, color: preto });
    const titulo = (s: string) => {
      p.drawRectangle({ x: X, y: y - 9, width: L, height: 9, color: grayscale(CINZA_FUNDO) });
      escreve(limpo(s.toUpperCase()), X + 3, y - 7, 7, fB);
      y -= 9; divisoria(y);
    };
    const ALTURA = 16.5;
    const linha = (campos: Linha, opcoes: { fundo?: number } = {}) => {
      const total = campos.reduce((s, c) => s + (c.col ?? 1), 0);
      let x = X;
      campos.forEach((c, i) => {
        const w = (L * (c.col ?? 1)) / total;
        if (opcoes.fundo === i) p.drawRectangle({ x, y: y - ALTURA, width: w, height: ALTURA, color: grayscale(CINZA_FUNDO) });
        escreve(corta(c.r, fB, 6, w - 5), x + 3, y - 6.5, 6, fB);
        escreve(corta(c.v, fN, 7, w - 5), x + 3, y - 14, 7, fN);
        x += w;
      });
      y -= ALTURA;
    };
    const aviso = (s: string) => { escreve(limpo(s), X + 3, y - 8, 6.5, fN); y -= 11; divisoria(y); };

    const dps = "DPS/infDPS";
    const v = `${dps}/valores`;
    const homolog = t(`${dps}/tpAmb`) === "2";

    // cabeçalho (a área do QR Code fica à direita)
    const H = 56;
    p.drawRectangle({ x: X, y: y - H, width: L, height: H, color: grayscale(CINZA_FUNDO) });
    escreve("NFS-e", X + 8, y - 34, 22, fB);
    const cx = X + 120;
    escreve("DANFSe v2.0", cx, y - 14, 9, fB);
    escreve("Documento Auxiliar da NFS-e", cx, y - 25, 9, fB);
    if (homolog) escreve("NFS-e SEM VALIDADE JURÍDICA", cx, y - 36, 9, fB, rgb(1, 0, 0));
    escreve(corta(t("xLocEmi") || "-", fN, 8, 190), cx + 190, y - 14, 8, fN);
    escreve(t("ambGer") === "1" ? "Ambiente gerador: Sistema próprio do município" : "Ambiente gerador: Sefin Nacional NFS-e", cx, y - 47, 6, fN);
    escreve(`Tipo de ambiente: ${homolog ? "Homologação" : "Produção"}`, cx + 190, y - 47, 6, fN);
    const url = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${nota.chave}`;
    const qr = QR.create(url, { errorCorrectionLevel: "M" });
    const lado = 43.1; // 1,52 cm
    const m = lado / qr.modules.size; const qx = X + L - lado - 6; const qy = y - lado - 3;
    p.drawRectangle({ x: qx - 2, y: qy - 2, width: lado + 4, height: lado + 4, color: grayscale(1) });
    for (let l = 0; l < qr.modules.size; l++) for (let c = 0; c < qr.modules.size; c++)
      if (qr.modules.get(l, c)) p.drawRectangle({ x: qx + c * m, y: qy + lado - (l + 1) * m, width: m + 0.05, height: m + 0.05, color: preto });
    ["A autenticidade desta NFS-e pode ser", "verificada pelo QR Code ou pela chave", "de acesso no Portal Nacional da NFS-e"].forEach((s, i) =>
      escreve(s, qx - 112, y - 40 + (2 - i) * 7 - 7, 5, fN));
    y -= H; divisoria(y);

    // dados da NFS-e
    linha([{ r: "CHAVE DE ACESSO DA NFS-E", v: nota.chave, col: 2 }, { r: "NÚMERO DA NFS-E", v: ou(t("nNFSe")) }, { r: "COMPETÊNCIA DA NFS-E", v: data(t(`${dps}/dCompet`)) }]); divisoria(y);
    linha([{ r: "DATA E HORA DA EMISSÃO DA NFS-E", v: data(t("dhProc")) }, { r: "NÚMERO DA DPS", v: ou(t(`${dps}/nDPS`)) }, { r: "SÉRIE DA DPS", v: ou(t(`${dps}/serie`)) }, { r: "DATA E HORA DA EMISSÃO DA DPS", v: data(t(`${dps}/dhEmi`)) }]); divisoria(y);
    linha([{ r: "EMITENTE DA NFS-E", v: TP_EMIT[t(`${dps}/tpEmit`)] ?? "-" }, { r: "SITUAÇÃO DA NFS-E", v: CSTAT[t("cStat")] ?? ou(t("cStat")), col: 2 }, { r: "FINALIDADE", v: t(`${dps}/IBSCBS/finNFSe`) === "0" ? "NFS-e regular" : ou(t(`${dps}/IBSCBS/finNFSe`)) }], { fundo: 0 }); divisoria(y);

    // partes
    const emiteTomador = t(`${dps}/tpEmit`) === "2";
    const prest = pessoa(t, `${dps}/prest`, t("xLocEmi"));
    const emit = !emiteTomador ? { nome: t("emit/xNome"), end: juntar([t("emit/enderNac/xLgr"), t("emit/enderNac/nro"), t("emit/enderNac/xBairro")]), uf: t("emit/enderNac/UF"), cep: t("emit/enderNac/CEP"), mun: t("emit/enderNac/cMun"), fone: t("emit/fone"), email: t("emit/email") } : null;
    titulo("Prestador / Fornecedor");
    if (prest) {
      if (emit) {
        prest.nome = prest.nome || emit.nome; prest.end = prest.end || emit.end; prest.fone = prest.fone || emit.fone; prest.email = prest.email || emit.email;
        prest.mun = juntar([prest.mun, emit.uf], " / "); prest.ibgeCep = prest.ibgeCep || juntar([emit.mun, cep(emit.cep)], " / ");
      }
      linhasPessoa(prest).forEach((l) => { linha(l); });
      linha([{ r: "Simples Nacional na Data de Competência", v: OP_SIMPLES[t(`${dps}/prest/regTrib/opSimpNac`)] ?? "-" }, { r: "Regime de Apuração Tributária pelo SN", v: REG_AP_SN[t(`${dps}/prest/regTrib/regApTribSN`)] ?? "-" }]);
    }
    divisoria(y);
    const toma = pessoa(t, `${dps}/toma`);
    if (toma) {
      if (emiteTomador) { toma.nome = toma.nome || t("emit/xNome"); }
      titulo("Tomador / Adquirente"); linhasPessoa(toma).forEach((l) => { linha(l); }); divisoria(y);
    } else aviso("TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e");
    const dest = pessoa(t, `${dps}/IBSCBS/dest`);
    if (dest) { titulo("Destinatário da Operação"); linhasPessoa(dest, false).forEach((l) => { linha(l); }); divisoria(y); }
    else if (toma) aviso("O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO");
    else aviso("DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e");
    const interm = pessoa(t, `${dps}/interm`);
    if (interm) { titulo("Intermediário da Operação"); linhasPessoa(interm).forEach((l) => { linha(l); }); divisoria(y); }
    else aviso("INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e");

    // reserva o que vem abaixo para distribuir o espaço entre descrição e informações complementares
    const temIbs = !!t("IBSCBS/totCIBS/vTotNF");
    const abaixo = (9 + ALTURA * 3) + (9 + ALTURA * 2) + (temIbs ? 9 + ALTURA * 3 : 0) + (9 + ALTURA * 2) + 9 + 12 + 8;
    const livre = y - MARGEM - abaixo - (9 + ALTURA);
    const { texto: infoTexto, totais } = complementares(t);
    const linhasInfo = quebra(infoTexto, 7, L - 6, Math.max(1, Math.floor((livre * 0.35) / 8.4)));
    const alturaInfo = (infoTexto ? linhasInfo.length * 8.4 : 0) + 12;
    const maxDesc = Math.max(2, Math.floor((livre - alturaInfo + 12 - 12) / 8.4));

    // serviço
    titulo("Serviço Prestado");
    const cn = t(`${dps}/serv/cServ/cTribNac`); const cm = t(`${dps}/serv/cServ/cTribMun`); const nbs = t(`${dps}/serv/cServ/cNBS`);
    linha([
      { r: "Código de Tributação Nacional / Municipal", v: ou(juntar([cn.length === 6 ? `${cn.slice(0, 2)}.${cn.slice(2, 4)}.${cn.slice(4)}` : cn, cm], " / ")) },
      { r: "Código da NBS", v: nbs.length === 9 ? `${nbs[0]}.${nbs.slice(1, 5)}.${nbs.slice(5, 7)}.${nbs.slice(7)}` : ou(nbs) },
      { r: "Local da Prestação / Sigla UF / País", v: ou(juntar([t("xLocPrestacao"), t(`${dps}/serv/locPrest/cPaisPrestacao`)], " / ")) },
    ]);
    escreve(corta(t("xTribMun") || t("xTribNac") || "-", fN, 7, L - 6), X + 3, y - 8, 7, fN); y -= 11;
    escreve("Descrição do Serviço", X + 3, y - 6.5, 6, fB); y -= 8;
    quebra(t(`${dps}/serv/cServ/xDescServ`) || "-", 7, L - 6, maxDesc).forEach((l) => { escreve(l, X + 3, y - 7, 7, fN); y -= 8.4; });
    y -= 2; divisoria(y);

    // ISSQN
    const tm = `${v}/trib/tribMun`;
    titulo("Tributação Municipal (ISSQN)");
    linha([{ r: "Tipo de Tributação do ISSQN", v: TRIB_ISS[t(`${tm}/tribISSQN`)] ?? "-" }, { r: "Município / Sigla UF / País de Incidência", v: ou(juntar([t("xLocIncid"), t(`${tm}/cPaisResult`)], " / ")) }, { r: "Regime Especial de Tributação do ISSQN", v: REG_ESP[t(`${dps}/prest/regTrib/regEspTrib`)] ?? "-" }, { r: "Número Processo Suspensão", v: ou(t(`${tm}/exigSusp/nProcesso`)) }]);
    linha([{ r: "Benefício Municipal", v: ou(t("valores/tpBM")) }, { r: "Cálculo do BM", v: moeda(t("valores/vCalcBM") || t(`${tm}/BM/vRedBCBM`)) }, { r: "Total Deduções/Reduções", v: moeda(t(`${v}/vDedRed/vDR`) || t("valores/vCalcDR")) }, { r: "Desconto Incondicionado", v: moeda(t(`${v}/vDescCondIncond/vDescIncond`)) }]);
    linha([{ r: "BC ISSQN", v: moeda(t("valores/vBC")) }, { r: "Alíquota Aplicada", v: pct(t("valores/pAliqAplic")) }, { r: "Retenção do ISSQN", v: RET_ISS[t(`${tm}/tpRetISSQN`)] ?? "-" }, { r: "ISSQN Apurado", v: moeda(t("valores/vISSQN")) }]);
    divisoria(y);

    // federais: com tpRetPisCofins = 1, PIS e COFINS entram nas contribuições retidas e o débito próprio fica zerado (NT 008, nota 6)
    const pc = `${v}/trib/tribFed/piscofins`;
    const tpRet = t(`${pc}/tpRetPisCofins`);
    const retido = tpRet === "1";
    const csll = t(`${v}/trib/tribFed/vRetCSLL`);
    titulo("Tributação Federal (exceto CBS)");
    linha([{ r: "IRRF", v: moeda(t(`${v}/trib/tribFed/vRetIRRF`)) }, { r: "Contribuição Previdenciária - Retida", v: moeda(t(`${v}/trib/tribFed/vRetCP`)) }, { r: "Contribuições Sociais - Retidas", v: retido ? moeda(num(csll) + num(t(`${pc}/vPis`)) + num(t(`${pc}/vCofins`))) : moeda(csll) }]);
    linha([{ r: "PIS - Débito Apuração Própria", v: retido ? moeda(0) : moeda(t(`${pc}/vPis`)) }, { r: "COFINS - Débito Apuração Própria", v: retido ? moeda(0) : moeda(t(`${pc}/vCofins`)) }, { r: "Descrição Contrib. Sociais - Retidas", v: RET_PIS[tpRet] ?? "-" }]);
    divisoria(y);

    // IBS/CBS
    if (temIbs) {
      const iv = "IBSCBS/valores"; const tc = "IBSCBS/totCIBS";
      titulo("Tributação IBS / CBS");
      linha([{ r: "CST / cClassTrib", v: ou(juntar([t(`${dps}/IBSCBS/valores/trib/gIBSCBS/CST`), t(`${dps}/IBSCBS/valores/trib/gIBSCBS/cClassTrib`)], " / ")) }, { r: "Indicador de Operação / IBGE / Município Incidência", v: ou(juntar([t(`${dps}/IBSCBS/cIndOp`), t("IBSCBS/cLocalidadeIncid"), t("IBSCBS/xLocalidadeIncid")], " / ")), col: 2 }, { r: "Base de Cálculo Após Exclusões e Reduções", v: moeda(t(`${iv}/vBC`)) }]);
      linha([{ r: "Alíquota - IBS UF / IBS Mun", v: `${pct(t(`${iv}/uf/pIBSUF`))} / ${pct(t(`${iv}/mun/pIBSMun`))}` }, { r: "Valor Apurado Estadual - IBS", v: moeda(t(`${tc}/gIBS/gIBSUFTot/vIBSUF`)) }, { r: "Valor Apurado Municipal - IBS", v: moeda(t(`${tc}/gIBS/gIBSMunTot/vIBSMun`)) }, { r: "Valor Total Apurado - IBS", v: moeda(t(`${tc}/gIBS/vIBSTot`)) }]);
      linha([{ r: "Alíquota - CBS", v: pct(t(`${iv}/fed/pCBS`)) }, { r: "Alíquota Efetiva - CBS", v: pct(t(`${iv}/fed/pAliqEfetCBS`)) }, { r: "Valor Total Apurado - CBS", v: moeda(t(`${tc}/gCBS/vCBS`)) }]);
      divisoria(y);
    }

    // valor total
    const ibsCbs = num(t("IBSCBS/totCIBS/gIBS/vIBSTot")) + num(t("IBSCBS/totCIBS/gCBS/vCBS"));
    titulo("Valor Total da NFS-e");
    linha([{ r: "Valor da Operação / Serviço", v: moeda(t(`${v}/vServPrest/vServ`)) }, { r: "Desconto Incondicionado", v: moeda(t(`${v}/vDescCondIncond/vDescIncond`)) }, { r: "Desconto Condicionado", v: moeda(t(`${v}/vDescCondIncond/vDescCond`)) }, { r: "Total das Retenções (ISSQN / Federais)", v: moeda(t("valores/vTotalRet")) }]);
    linha([{ r: "Valor Líquido da NFS-e", v: moeda(t("valores/vLiq")) }, { r: "Total do IBS/CBS", v: temIbs ? moeda(ibsCbs) : "-" }, { r: "Valor Líquido da NFS-e + IBS/CBS", v: moeda(t("IBSCBS/totCIBS/vTotNF")) }], { fundo: 2 });
    divisoria(y);

    // informações complementares
    titulo("Informações Complementares");
    if (infoTexto) linhasInfo.forEach((l) => { escreve(l, X + 3, y - 7, 7, fN); y -= 8.4; });
    escreve(corta(totais, fN, 7, L - 6), X + 3, y - 8, 7, fN);

    if (nota.situacao === "cancelada" || nota.situacao === "substituida") {
      const marca = nota.situacao === "cancelada" ? "CANCELADA" : "SUBSTITUÍDA";
      const tam = 72; const larg = fB.widthOfTextAtSize(marca, tam); const ang = 45; const r = (ang * Math.PI) / 180;
      p.drawText(marca, { x: A4.l / 2 - (larg / 2) * Math.cos(r), y: A4.a / 2 - (larg / 2) * Math.sin(r), size: tam, font: fB, color: grayscale(0.65), rotate: degrees(ang), opacity: 0.55 });
    }
  }
  return pdf.save();
}

/** Abre o PDF numa aba já aberta (precisa ser aberta no clique, antes de buscar os dados, para o navegador não bloquear). */
export function mostrarPdf(bytes: Uint8Array, aba: Window | null, nome: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  if (aba) { aba.location.href = url; return; }
  const a = document.createElement("a"); a.href = url; a.download = nome; a.click();
}
