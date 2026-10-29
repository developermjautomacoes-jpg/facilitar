/**
 * Converte o texto de um memorando antigo (.docx no modelo "N 01 - MEMORANDO EMPRESA ...")
 * nos campos do memorando do sistema (os mesmos ids do formulário do módulo legado).
 */
import type { Memorando } from "@/types";
import { DEPARTAMENTOS_PADRAO } from "./constantes";
import { digitos, formatarCnpj, pad } from "./format";

export interface MemorandoImportado {
  arquivo: string;
  memo: Partial<Memorando>;
  seq: number | null;
  ano: number | null;
  avisos: string[];
  erro?: string;
}

const MESES: Record<string, number> = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

/** Minúsculas e sem acento, mantendo o mesmo comprimento do texto original. */
function norm(s: string): string {
  return [...s].map((ch) => (ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "")[0] ?? ch)).join("").toLowerCase();
}

/** Rótulos do modelo antigo → campo. A ordem importa ("Nome Fantasia" antes de "Nome", "E-mail Contato" antes de "Contato"). */
const ROTULOS: [string, RegExp][] = [
  ["e_fantasia", /^nome fantasia/],
  ["e_razao", /^(nome|razao social)\b/],
  ["e_abertura", /^(data de )?abertura/],
  ["t_regime", /^(opcao tributaria|regime tributario|regime)/],
  ["cnae", /^cnae( principal)?/],
  ["e_cnpj", /^cnpj/],
  ["e_nire", /^nire/],
  ["e_capital", /^capital( social)?/],
  ["e_ie", /^(inscricao estadual|insc\.? estadual)/],
  ["e_im", /^(inscricao municipal|insc\.? municipal)/],
  ["e_endereco", /^endereco/],
  ["r_prolabore", /^pro.?labore( de r\$)?/],
  ["r_folha", /^folha( de pagamento)?/],
  ["r_cert", /^certificado( digital)?/],
  ["r_dominio", /^dominio/],
  ["r_sintegra", /^sintegra/],
  ["r_spedc", /^sped contabil/],
  ["r_spedf", /^sped fiscal/],
  ["emissao", /^fara a emissao( de)?/],
  ["r_loginNfse", /^login nfs-?e/],
  ["r_senhaNfse", /^senha nfs-?e/],
  ["r_codSimples", /^codigo de acesso( do simples( nacional)?)?/],
  ["r_sefaz", /^senha sefaz[^:]*/],
  ["email", /^e-?mail( de)?( contato)?/],
  ["contato", /^contato/],
  ["r_cpfAdm", /^cpf (adm|do administrador)/],
  ["r_pis", /^pis\b/],
  ["telefone", /^(telefones?|fones?)(\s*\/\s*whatsapp)?|^whatsapp/],
  ["r_docs", /^os documentos da empresa se encontram digitalizados em/],
  ["m_assunto", /^assunto/],
];

function limpar(v: string): string {
  return v.replace(/^[\s:\-–[\]]+/, "").replace(/[\s[\]]+$/, "").trim();
}

function regimeDe(v: string): { regime: string; aviso?: string } {
  const n = norm(v);
  if (!n.trim()) return { regime: "", aviso: "Opção tributária não informada no memorando." };
  if (/mei|simei/.test(n)) return { regime: "MEI (SIMEI)" };
  if (/simples/.test(n)) return { regime: "Simples Nacional", aviso: "Simples Nacional: informe depois se é Puro ou Híbrido." };
  if (/presumido/.test(n)) return { regime: "Lucro Presumido" };
  if (/real/.test(n) && /trimes/.test(n)) return { regime: "Lucro Real Trimestral" };
  if (/real/.test(n) && /anual/.test(n)) return { regime: "Lucro Real Anual" };
  if (/real/.test(n)) return { regime: "", aviso: "Lucro Real sem período: informe depois se é anual ou trimestral." };
  if (/arbitrado/.test(n)) return { regime: "Lucro Arbitrado" };
  if (/imune|isent/.test(n)) return { regime: "Imune / Isenta" };
  return { regime: "", aviso: `Opção tributária "${v}" não reconhecida.` };
}

function capitalDe(v: string): string {
  const d = digitos(v);
  if (!d) return v;
  // "800,000,00" / "800.000,00" / "R$ 800000" → centavos se terminar com ,dd
  const centavos = /[.,]\d{2}\s*$/.test(v) ? Number(d) / 100 : Number(d);
  return Number.isFinite(centavos) ? centavos.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : v;
}

function dataIso(v: string): string {
  const m = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${pad(m[2], 2)}-${pad(m[1], 2)}` : "";
}

function simNao(v: string): string {
  const n = norm(v).trim();
  if (/^s(im)?\b/.test(n)) return "Sim";
  if (/^n(ao|ão)?\b/.test(n)) return "Não";
  return "";
}

function emissaoDe(v: string): string[] {
  const n = norm(v).replace(/\s+/g, "");
  if (!n) return [];
  const out = new Set<string>();
  if (/nfc-?e/.test(n)) out.add("NFC-e");
  if (/nfs-?e/.test(n)) out.add("NFS-e");
  if (/nf-?e(?![a-z])/.test(n.replace(/nfc-?e|nfs-?e/g, ""))) out.add("NF-e");
  if (/ct-?e/.test(n)) out.add("CT-e");
  if (/mdf-?e/.test(n)) out.add("MDF-e");
  if (!out.size && /^nao|^n$/.test(n)) out.add("Não emite");
  return [...out];
}

function setorDe(v: string): string | null {
  const n = norm(v);
  if (/\brh\b|pessoal|\bdp\b/.test(n)) return "Departamento Pessoal (RH)";
  if (/fiscal/.test(n)) return "Fiscal";
  if (/contab/.test(n)) return "Contábil";
  if (/societ|legaliz/.test(n)) return "Societário / Legalização";
  if (/financ/.test(n)) return "Financeiro";
  return null;
}

export function memorandoDeLinhas(linhas: string[], arquivo: string): MemorandoImportado {
  const avisos: string[] = [];
  const campos: Record<string, string> = {};
  let seq: number | null = null, ano: number | null = null, dataMemo = "", setores = new Set<string>();
  const obs: string[] = [];
  let lendoObs = false;

  for (const linha of linhas) {
    if (!linha) continue;
    const n = norm(linha);
    if (lendoObs) {
      if (/eldes scherrer|^tel\.?:|^\(27\)/.test(n)) { lendoObs = false; continue; }
      obs.push(linha);
      continue;
    }
    const mNum = n.match(/memorando\s*n[o°º.]*\s*(\d{1,4})\s*\/\s*(\d{4})/);
    if (mNum && seq === null) { seq = Number(mNum[1]); ano = Number(mNum[2]); continue; }
    const mData = n.match(/^em\s+(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/);
    if (mData && MESES[mData[2]]) { dataMemo = `${mData[3]}-${pad(MESES[mData[2]], 2)}-${pad(mData[1], 2)}`; continue; }
    const mSet = n.match(/setores de (.*)$/);
    if (mSet && /^aos /.test(n)) {
      linha.slice(n.indexOf(mSet[1])).split(/,|\s+e\s+/).forEach((p) => { const s = setorDe(p); if (s) setores.add(s); });
      continue;
    }
    if (/^obs\b/.test(n)) { lendoObs = true; const resto = limpar(linha.slice(3)); if (resto) obs.push(resto); continue; }
    for (const [campo, re] of ROTULOS) {
      const m = n.match(re);
      if (m && !(campo in campos)) { campos[campo] = limpar(linha.slice(m[0].length)); break; }
      if (m) break;
    }
  }

  // número: do texto ou do nome do arquivo ("N 01 - MEMORANDO..."), ano pela data do memorando
  if (seq === null) {
    const mf = arquivo.match(/^\s*n[º°o_\s.-]*(\d{1,4})\b/i);
    if (mf) seq = Number(mf[1]);
  }
  if (!ano && dataMemo) ano = Number(dataMemo.slice(0, 4));
  if (seq === null || !ano) avisos.push("Número do memorando não encontrado: será numerado automaticamente.");

  const { regime, aviso } = regimeDe(campos.t_regime ?? "");
  if (aviso) avisos.push(aviso);

  const atividades: Memorando["atividades"] = [];
  if (campos.cnae) {
    const m = campos.cnae.match(/^([\d.\-/\s]{7,14})\s*[-–:]?\s*(.*)$/);
    const cod = digitos(m ? m[1] : campos.cnae).slice(0, 7);
    if (cod.length === 7) atividades.push({ cod, desc: m ? m[2].trim() : "", tipo: "Principal", on: true });
  }

  const cnpj = digitos(campos.e_cnpj);
  const contato = { nome: campos.contato ?? "", cargo: "", telefone: campos.telefone ?? "", email: (campos.email ?? "").toLowerCase(), setores: [] as string[] };

  const memo: Partial<Memorando> = {
    m_data: dataMemo,
    m_assunto: campos.m_assunto || "ENTRADA DE EMPRESA EM NOSSO ESCRITÓRIO",
    layout: "1",
    e_razao: campos.e_razao ?? "",
    e_fantasia: campos.e_fantasia ?? "",
    e_cnpj: cnpj.length === 14 ? formatarCnpj(cnpj) : campos.e_cnpj ?? "",
    e_abertura: dataIso(campos.e_abertura ?? ""),
    e_desde: dataMemo,
    e_nire: campos.e_nire ?? "",
    e_capital: campos.e_capital ? capitalDe(campos.e_capital) : "",
    e_ie: campos.e_ie ?? "",
    e_im: campos.e_im ?? "",
    e_endereco: campos.e_endereco ?? "",
    t_regime: regime,
    t_modalidade: "",
    atividades,
    deps: DEPARTAMENTOS_PADRAO.map((nome) => ({ nome, on: setores.has(nome), resp: "" })),
    contatos: contato.nome || contato.telefone || contato.email ? [contato] : [],
    socios: [],
    r_prolabore: campos.r_prolabore ?? "",
    r_folha: campos.r_folha ?? "",
    r_cert: campos.r_cert ?? "",
    r_dominio: campos.r_dominio ?? "",
    r_sintegra: campos.r_sintegra ?? "",
    r_spedc: simNao(campos.r_spedc ?? ""),
    r_spedf: simNao(campos.r_spedf ?? ""),
    emissao: emissaoDe(campos.emissao ?? ""),
    ferramentas: [],
    r_loginNfse: campos.r_loginNfse ?? "",
    r_senhaNfse: campos.r_senhaNfse ?? "",
    r_codSimples: campos.r_codSimples ?? "",
    r_sefaz: campos.r_sefaz ?? "",
    r_cpfAdm: campos.r_cpfAdm ?? "",
    r_pis: campos.r_pis ?? "",
    r_docs: campos.r_docs ?? "",
    obs: obs.join("\n\n"),
    anexosManual: null,
    svOff: {},
    svExtra: [],
  };

  let erro: string | undefined;
  if (!memo.e_razao) erro = "Razão social (campo Nome) não encontrada.";
  else if (cnpj.length !== 14) erro = "CNPJ não encontrado ou incompleto.";
  if (!dataMemo) avisos.push("Data do memorando não encontrada: \"Cliente desde\" fica em branco.");
  if (!setores.size) avisos.push("Nenhum setor reconhecido na abertura do memorando.");

  return { arquivo, memo, seq, ano, avisos, erro };
}

/** Completa o memorando importado com a consulta do CNPJ (BrasilAPI ou ReceitaWS), sem apagar o que veio do arquivo. */
export function completarComReceita(memo: Partial<Memorando>, j: Record<string, any>): string[] {
  const feito: string[] = [];
  const vazio = (k: string) => !String(memo[k] ?? "").trim();
  const por = (k: string, v: unknown, rotulo: string) => { if (v && vazio(k)) { memo[k] = v; feito.push(rotulo); } };
  const brasil = j.razao_social !== undefined || j.cnae_fiscal !== undefined;
  if (brasil) {
    por("e_fantasia", j.nome_fantasia, "fantasia");
    por("e_situacao", j.descricao_situacao_cadastral, "situação");
    por("e_natureza", j.natureza_juridica, "natureza jurídica");
    const log = [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(" ");
    por("e_endereco", [log + (j.numero ? ", " + j.numero : ""), j.complemento, j.bairro, (j.municipio || "") + (j.uf ? "/" + j.uf : ""), j.cep ? "CEP " + j.cep : ""].filter((x: string) => x && String(x).trim()).join(" – "), "endereço");
    por("e_email", String(j.email || "").toLowerCase(), "e-mail");
    if (j.opcao_pelo_simples === true) por("t_simples", "Optante desde " + String(j.data_opcao_pelo_simples || "").split("-").reverse().join("/"), "situação no Simples");
    else if (j.opcao_pelo_simples === false) por("t_simples", "Não optante", "situação no Simples");
    const cnaes: { cod: string; desc: string; tipo: string; on: boolean }[] = [];
    if (j.cnae_fiscal) cnaes.push({ cod: pad(digitos(j.cnae_fiscal), 7), desc: j.cnae_fiscal_descricao || "", tipo: "Principal", on: true });
    (j.cnaes_secundarios || []).forEach((c: { codigo: unknown; descricao?: string }) => { if (Number(digitos(c.codigo)) > 0) cnaes.push({ cod: pad(digitos(c.codigo), 7), desc: c.descricao || "", tipo: "Secundária", on: true }); });
    if (cnaes.length > (memo.atividades?.length ?? 0)) { memo.atividades = cnaes; feito.push(`${cnaes.length} CNAEs`); }
    const socios = (j.qsa || []).map((x: Record<string, string>) => ({ nome: x.nome_socio || "", cpf: "", qualificacao: x.qualificacao_socio || "", entrada: x.data_entrada_sociedade || "" })).filter((x: { nome: string }) => x.nome);
    if (socios.length && !(memo.socios as unknown[] | undefined)?.length) { memo.socios = socios; feito.push(`${socios.length} sócio(s)`); }
  } else if (j.nome !== undefined) {
    por("e_fantasia", j.fantasia, "fantasia");
    por("e_situacao", j.situacao, "situação");
    por("e_natureza", j.natureza_juridica, "natureza jurídica");
    const cnaes: { cod: string; desc: string; tipo: string; on: boolean }[] = [];
    (j.atividade_principal || []).forEach((c: { code: string; text: string }) => cnaes.push({ cod: pad(digitos(c.code), 7), desc: c.text, tipo: "Principal", on: true }));
    (j.atividades_secundarias || []).forEach((c: { code: string; text: string }) => { if (Number(digitos(c.code)) > 0) cnaes.push({ cod: pad(digitos(c.code), 7), desc: c.text, tipo: "Secundária", on: true }); });
    if (cnaes.length > (memo.atividades?.length ?? 0)) { memo.atividades = cnaes; feito.push(`${cnaes.length} CNAEs`); }
    const socios = (j.qsa || []).map((x: Record<string, string>) => ({ nome: x.nome || "", cpf: "", qualificacao: String(x.qual || "").replace(/^\d+-/, ""), entrada: "" })).filter((x: { nome: string }) => x.nome);
    if (socios.length && !(memo.socios as unknown[] | undefined)?.length) { memo.socios = socios; feito.push(`${socios.length} sócio(s)`); }
  }
  return feito;
}
