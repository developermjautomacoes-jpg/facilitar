/**
 * Converte o relatório de empresas do Acessórias (.csv separado por ";") em memorandos.
 * As colunas são lidas pelo nome do cabeçalho, então a ordem pode mudar.
 */
import { DEPARTAMENTOS_PADRAO } from "./constantes";
import { digitos, formatarCnpj } from "./format";
import { dataIso, regimeDe, type MemorandoImportado } from "./importarMemorando";

/** Coluna do relatório → departamento do memorando. */
const SETORES: [string, string][] = [["Contábil", "Contábil"], ["Fiscal", "Fiscal"], ["Pessoal", "Departamento Pessoal (RH)"], ["Legalização", "Societário / Legalização"], ["Financeiro", "Financeiro"]];

/** CSV com ";" e aspas (o campo pode ter ";" ou quebra de linha dentro das aspas). */
export function lerLinhasCsv(texto: string): string[][] {
  const linhas: string[][] = []; let linha: string[] = [], campo = "", aspas = false;
  const s = texto.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) {
      if (c === '"' && s[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ";") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((v) => v.trim())) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((v) => v.trim())) linhas.push(linha);
  return linhas;
}

/** O relatório vem em UTF-8; versões salvas pelo Excel podem vir em Windows-1252. */
export async function textoDoCsv(arquivo: File): Promise<string> {
  const bytes = await arquivo.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}

/** "Simples Nacional - Comércio e ou Serviço - Com Pró-labore - Sem Funcionários" traz regime, pró-labore e folha no mesmo texto. */
function lerRegime(v: string) {
  const texto = v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const base = v.split(/\s+-\s+|_/)[0].replace(/\s+/g, " ").trim();
  const temPro = /(com|somente|e) pro-?labore/.test(texto), semPro = /sem pro-?labore/.test(texto);
  const temFunc = /(com|somente) funcionarios?|funcionarios e pro-?labore/.test(texto), semFunc = /sem funcionarios?/.test(texto);
  const semFolha = /sem folha/.test(texto), soPro = /somente pro-?labore/.test(texto), soFunc = /somente funcionarios/.test(texto);
  const sn = (sim: boolean, nao: boolean) => (sim ? "Sim" : nao ? "Não" : "");
  return {
    base, terceiros: /contabilidade terceiros/.test(texto),
    prolabore: sn(temPro, semPro || semFolha || soFunc),
    folha: sn(temFunc, semFunc || semFolha || soPro),
  };
}

export function memorandosDoCsv(texto: string, arquivo: string): MemorandoImportado[] {
  const [cabecalho, ...linhas] = lerLinhasCsv(texto);
  const coluna = new Map((cabecalho ?? []).map((c, i) => [c.trim(), i]));
  if (!coluna.has("Razão social") || !coluna.has("CNPJ")) throw new Error("Este .csv não é o relatório de empresas do Acessórias.");
  return linhas.map((l) => {
    const v = (nome: string) => (l[coluna.get(nome) ?? -1] ?? "").trim();
    const avisos: string[] = [], obs: string[] = [];
    const cnpj = digitos(v("CNPJ"));
    const razao = v("Razão social");

    const r = lerRegime(v("Regime"));
    const { regime, aviso } = regimeDe(r.base);
    if (aviso) avisos.push(aviso);
    if (!regime && v("Regime")) obs.push(`Regime no Acessórias: ${v("Regime")}`);
    if (r.terceiros) obs.push("Contabilidade de terceiros");

    const cadastro = dataIso(v("Cadastro")), desde = dataIso(v("Cli. desde"));
    if (!desde) avisos.push(`Sem "Cli. desde" no relatório: a data de entrada veio do Cadastro (${v("Cadastro") || "não informada"}). Ajuste se precisar.`);

    const cep = digitos(v("CEP"));
    const endereco = [
      [v("Endereço"), v("Número")].filter(Boolean).join(", "), v("Complemento"), v("Bairro"),
      [v("Cidade"), v("UF")].filter(Boolean).join("/"), cep.length === 8 ? `CEP ${cep.slice(0, 5)}-${cep.slice(5)}` : "",
    ].filter(Boolean).join(" – ");

    const ies = [...v("Inscrições Estaduais").matchAll(/UF:\s*([A-Z]{2})\s*-\s*IE:\s*([^,;|]+)/g)].map((m) => ({ uf: m[1], ie: m[2].trim() }));
    if (ies.length > 1) obs.push(`Inscrições estaduais: ${ies.map((i) => `${i.uf} ${i.ie}`).join(", ")}`);

    const extras: [string, string][] = [["Análise Tributária", v("Análise Tributária")], ["Contabilidade Terceiros (responsável)", v("Contabilidade Terceiros")], ["Empresa isenta", v("Empresa Isenta") === "Sim" ? "Sim" : ""],
      ["Outros identificadores", v("Outros identificadores")], ["Inscrição municipal desde", v("Dt.Insc. Municipal")], ["Tags", v("Tags")], ["Apelido no Acessórias", v("Apelido e-contínuo")], ["ID no Acessórias", v("ID")]];
    extras.forEach(([k, x]) => { if (x) obs.push(`${k}: ${x}`); });
    if (v("Comentários e anotações gerais")) obs.push(v("Comentários e anotações gerais"));

    const resp = new Map(SETORES.map(([col, dep]) => [dep, v(col)]));
    const inativa = !!v("Ativa?") && v("Ativa?") !== "Ativa";
    if (inativa) avisos.push(`Empresa inativa no Acessórias${v("Cli. até") ? ` desde ${v("Cli. até")}` : ""}.`);

    const memo: MemorandoImportado["memo"] = {
      m_data: cadastro, m_assunto: "ENTRADA DE EMPRESA EM NOSSO ESCRITÓRIO", layout: "1",
      e_razao: razao, e_fantasia: v("Nome fantasia") === razao ? "" : v("Nome fantasia"),
      e_cnpj: cnpj.length === 14 ? formatarCnpj(cnpj) : v("CNPJ"),
      e_abertura: dataIso(v("Data de abertura")), e_desde: desde || cadastro,
      e_nire: v("NIRE"), e_capital: "", e_ie: ies[0]?.ie ?? "", e_im: v("Insc. Municipal"), e_endereco: endereco, e_tel: v("Fone"),
      t_regime: regime, t_modalidade: "", atividades: [],
      deps: DEPARTAMENTOS_PADRAO.map((nome) => ({ nome, on: !!resp.get(nome), resp: resp.get(nome) ?? "" })),
      contatos: [], socios: [], r_prolabore: r.prolabore, r_folha: r.folha, r_cert: "", r_dominio: "", r_sintegra: "", r_spedc: "", r_spedf: "",
      emissao: [], ferramentas: ["Acessórias"], r_loginNfse: "", r_senhaNfse: "", r_codSimples: "", r_sefaz: "", r_cpfAdm: "", r_pis: "", r_docs: "",
      obs: obs.join("\n"), anexosManual: null, svOff: {}, svExtra: [],
      ...(inativa ? { situacaoCliente: "inativa" as const, dataSaida: dataIso(v("Cli. até")), motivoSaida: v("Motivo de cancelamento") } : {}),
    };

    let erro: string | undefined;
    if (!razao) erro = "Sem razão social.";
    else if (cnpj.length !== 14 || /^0+$/.test(cnpj)) erro = `CNPJ inválido (${v("CNPJ") || "vazio"}).`;
    return { arquivo, memo, seq: null, ano: null, avisos, erro, origem: `Importou do relatório do Acessórias (${arquivo})` };
  });
}
