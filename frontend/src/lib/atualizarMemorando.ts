/**
 * Compara um memorando com a consulta do CNPJ e aplica as diferenças escolhidas.
 * Mesma regra do quadro "Buscar atualização pelo CNPJ" do formulário (legado/index.html).
 */
import type { Memorando } from "@/types";
import { dataBr, digitos, formatarCnpj, pad } from "./format";

interface Socio { nome?: string; cpf?: string; cpfReceita?: string; qualificacao?: string; entrada?: string }
interface Cnae { cod: string; desc: string; tipo: string; on?: boolean }
export interface DadosReceita {
  razao: string; fantasia: string; situacao: string; natureza: string; capital: string; abertura: string; endereco: string;
  tel: string; email: string; simples: string; regime?: string; socios: Socio[]; cnaes: Cnae[];
}
export interface Diferenca { chave: string; rotulo: string; atual: string; novo: string; valor: unknown }

const moeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const isoDeBr = (v?: string) => { const s = String(v ?? "").trim(); const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : s; };
const cep = (v: unknown) => { const d = digitos(v); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : String(v ?? ""); };
const fone = (v: unknown) => { const d = digitos(v); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : String(v ?? ""); };
const cnaeFmt = (c: unknown) => { const d = pad(digitos(c), 7); return `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}`; };
const juntaEndereco = (log: string, j: Record<string, any>) => [log + (j.numero ? `, ${j.numero}` : ""), j.complemento, j.bairro, (j.municipio || "") + (j.uf ? `/${j.uf}` : ""), j.cep ? `CEP ${cep(j.cep)}` : ""].filter((x) => x && String(x).trim()).join(" – ");

export function normalizarReceita(j: Record<string, any>): DadosReceita {
  if (j.status === "ERROR" || (j.message && !j.razao_social && !j.nome)) throw new Error(j.message || "CNPJ não encontrado.");
  const o: DadosReceita = { razao: "", fantasia: "", situacao: "", natureza: "", capital: "", abertura: "", endereco: "", tel: "", email: "", simples: "", socios: [], cnaes: [] };
  if (j.razao_social !== undefined || j.cnae_fiscal !== undefined) { // BrasilAPI
    o.razao = j.razao_social || ""; o.fantasia = j.nome_fantasia || ""; o.abertura = isoDeBr(j.data_inicio_atividade); o.situacao = j.descricao_situacao_cadastral || "";
    o.natureza = j.natureza_juridica || ""; o.capital = j.capital_social != null ? moeda(Number(j.capital_social)) : "";
    o.endereco = juntaEndereco([j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(" "), j);
    o.tel = [j.ddd_telefone_1, j.ddd_telefone_2].filter((x) => digitos(x).length >= 10).map(fone).join(" / ");
    o.email = String(j.email || "").toLowerCase();
    o.socios = (j.qsa || []).map((x: Record<string, any>) => {
      const doc = String(x.cnpj_cpf_do_socio || ""); const cheio = digitos(doc).length === 14 && !doc.includes("*");
      return { nome: x.nome_socio || "", cpf: cheio ? formatarCnpj(doc) : "", cpfReceita: cheio ? "" : doc, qualificacao: x.qualificacao_socio || "", entrada: isoDeBr(x.data_entrada_sociedade || "") };
    }).filter((x: Socio) => x.nome);
    if (j.cnae_fiscal) o.cnaes.push({ cod: pad(digitos(j.cnae_fiscal), 7), desc: j.cnae_fiscal_descricao || "", tipo: "Principal" });
    (j.cnaes_secundarios || []).forEach((c: Record<string, any>) => { if (Number(digitos(c.codigo)) > 0) o.cnaes.push({ cod: pad(digitos(c.codigo), 7), desc: c.descricao || "", tipo: "Secundária" }); });
    if (j.opcao_pelo_mei === true) { o.simples = `Optante pelo SIMEI${j.data_opcao_pelo_mei ? ` desde ${dataBr(j.data_opcao_pelo_mei)}` : ""}`; o.regime = "MEI (SIMEI)"; }
    else if (j.opcao_pelo_simples === true) { o.simples = `Optante desde ${dataBr(j.data_opcao_pelo_simples)}`; o.regime = "Simples Nacional"; }
    else if (j.opcao_pelo_simples == null && j._rws_simei?.optante) { o.simples = "Optante pelo SIMEI (ReceitaWS)"; o.regime = "MEI (SIMEI)"; }
    else if (j.opcao_pelo_simples == null && j._rws_simples?.optante) { o.simples = `Optante${j._rws_simples.data_opcao ? ` desde ${dataBr(isoDeBr(j._rws_simples.data_opcao))}` : ""} (ReceitaWS)`; o.regime = "Simples Nacional"; }
    else if (j.opcao_pelo_simples === false) o.simples = `Não optante${j.data_exclusao_do_simples ? ` (excluída em ${dataBr(j.data_exclusao_do_simples)})` : ""}`;
    if (!o.regime && Array.isArray(j.regime_tributario) && j.regime_tributario.length) {
      const ult = [...j.regime_tributario].sort((a, b) => (Number(b.ano) || 0) - (Number(a.ano) || 0))[0]; const f = String(ult.forma_de_tributacao || "").toUpperCase();
      if (f.includes("PRESUMIDO")) o.regime = "Lucro Presumido"; else if (f.includes("ARBITRADO")) o.regime = "Lucro Arbitrado"; else if (f.includes("IMUNE") || f.includes("ISENT")) o.regime = "Imune / Isenta";
    }
  } else if (j.nome !== undefined) { // ReceitaWS
    o.razao = j.nome || ""; o.fantasia = j.fantasia || ""; o.abertura = isoDeBr(j.abertura); o.situacao = j.situacao || ""; o.natureza = j.natureza_juridica || "";
    o.capital = j.capital_social ? moeda(parseFloat(j.capital_social)) : "";
    o.endereco = juntaEndereco(j.logradouro || "", j); o.tel = j.telefone || ""; o.email = String(j.email || "").toLowerCase();
    o.socios = (j.qsa || []).map((x: Record<string, any>) => ({ nome: x.nome || "", cpf: "", qualificacao: String(x.qual || "").replace(/^\d+-/, ""), entrada: "" })).filter((x: Socio) => x.nome);
    (j.atividade_principal || []).forEach((c: Record<string, any>) => { if (Number(digitos(c.code)) > 0) o.cnaes.push({ cod: pad(digitos(c.code), 7), desc: c.text || "", tipo: "Principal" }); });
    (j.atividades_secundarias || []).forEach((c: Record<string, any>) => { if (Number(digitos(c.code)) > 0) o.cnaes.push({ cod: pad(digitos(c.code), 7), desc: c.text || "", tipo: "Secundária" }); });
    if (j.simei?.optante) { o.simples = "Optante pelo SIMEI"; o.regime = "MEI (SIMEI)"; }
    else if (j.simples?.optante) { o.simples = `Optante${j.simples.data_opcao ? ` desde ${dataBr(isoDeBr(j.simples.data_opcao))}` : ""}`; o.regime = "Simples Nacional"; }
    else if (j.simples) o.simples = "Não optante";
  } else throw new Error("Formato de resposta não reconhecido.");
  return o;
}

const nomesSocios = (a?: Socio[]) => (a ?? []).map((x) => String(x.nome ?? "").trim().toUpperCase()).filter(Boolean).sort().join(" | ");
const codigos = (a?: { cod: string }[]) => (a ?? []).map((x) => pad(digitos(x.cod), 7)).sort().join(",");

export function diferencasMemorando(d: Memorando, o: DadosReceita): Diferenca[] {
  const L: Diferenca[] = [];
  const texto = (chave: string, rotulo: string, novoBruto: string, fmt?: (v: string) => string) => {
    const novo = String(novoBruto ?? "").trim(); const atual = String(d[chave] ?? "").trim();
    if (novo && novo !== atual) L.push({ chave, rotulo, atual: fmt ? fmt(atual) : atual, novo: fmt ? fmt(novo) : novo, valor: novo });
  };
  texto("e_razao", "Razão social", o.razao); texto("e_fantasia", "Nome fantasia", o.fantasia); texto("e_situacao", "Situação cadastral", o.situacao);
  texto("e_natureza", "Natureza jurídica", o.natureza);
  if (o.capital && digitos(o.capital) !== digitos(d.e_capital)) L.push({ chave: "e_capital", rotulo: "Capital social", atual: String(d.e_capital ?? ""), novo: o.capital, valor: o.capital });
  texto("e_abertura", "Data de abertura", o.abertura, dataBr); texto("e_endereco", "Endereço", o.endereco); texto("e_tel", "Telefone da empresa", o.tel);
  texto("e_email", "E-mail da empresa", o.email); texto("t_simples", "Situação no Simples", o.simples);
  if (o.regime && o.regime !== d.t_regime) L.push({ chave: "t_regime", rotulo: "Opção tributária", atual: String(d.t_regime ?? ""), novo: o.regime, valor: o.regime });
  const socios = d.socios as Socio[] | undefined;
  if (o.socios.length && nomesSocios(o.socios) !== nomesSocios(socios)) L.push({ chave: "socios", rotulo: "Quadro societário", atual: (socios ?? []).map((x) => x.nome).join(", "), novo: o.socios.map((x) => x.nome).join(", "), valor: o.socios });
  if (o.cnaes.length && codigos(o.cnaes) !== codigos(d.atividades)) {
    const antes = new Set((d.atividades ?? []).map((x) => pad(digitos(x.cod), 7))); const depois = new Set(o.cnaes.map((x) => x.cod));
    const entra = o.cnaes.filter((x) => !antes.has(x.cod)).map((x) => cnaeFmt(x.cod)); const sai = (d.atividades ?? []).filter((x) => !depois.has(pad(digitos(x.cod), 7))).map((x) => cnaeFmt(x.cod));
    L.push({ chave: "atividades", rotulo: "Atividades (CNAEs)", atual: sai.length ? `Sai: ${sai.join(", ")}` : "—", novo: entra.length ? `Entra: ${entra.join(", ")}` : "—", valor: o.cnaes });
  }
  return L;
}

/** Aplica as diferenças sobre uma cópia, preservando CPF já informado dos sócios e as atividades desmarcadas. */
export function aplicarDiferencas(d: Memorando, lista: Diferenca[]): Memorando {
  const m = structuredClone(d);
  for (const x of lista) {
    if (x.chave === "socios") {
      const antigos = new Map(((d.socios as Socio[] | undefined) ?? []).map((a) => [String(a.nome ?? "").trim().toUpperCase(), a]));
      m.socios = (x.valor as Socio[]).map((n) => ({ ...n, cpf: antigos.get(String(n.nome ?? "").trim().toUpperCase())?.cpf || n.cpf || "" }));
    } else if (x.chave === "atividades") {
      const antes = new Map((d.atividades ?? []).map((a) => [pad(digitos(a.cod), 7), a]));
      m.atividades = (x.valor as Cnae[]).map((c) => ({ ...c, on: antes.get(c.cod)?.on ?? true }));
      m.anexosManual = null;
    } else m[x.chave] = x.valor;
  }
  return m;
}
