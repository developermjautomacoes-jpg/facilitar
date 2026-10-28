// Gera src/lib/cnaeAnexos.json a partir da tabela CNAE do módulo legado (mesma lógica de infoCnae).
// Uso: node scripts/gerar-anexos-cnae.mjs   (rode de novo se a tabela do legado mudar)
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../../legado/index.html", import.meta.url), "utf8");
const pega = (nome) => {
  const i = html.indexOf(`const ${nome} = `) >= 0 ? html.indexOf(`const ${nome} = `) : html.indexOf(`const ${nome}=`);
  if (i < 0) throw new Error(`${nome} não encontrado`);
  const fim = html.indexOf(";\n", i);
  return html.slice(i, fim + 1);
};
const fn = (nome) => {
  const i = html.indexOf(`function ${nome}(`);
  let d = 0, j = html.indexOf("{", i);
  for (let k = j; k < html.length; k++) { if (html[k] === "{") d++; else if (html[k] === "}") { d--; if (d === 0) return html.slice(i, k + 1); } }
  throw new Error(nome);
};
const codigo = [
  "function dig(s){return String(s||'').replace(/\\D/g,'')}",
  "function pad(n,l){return String(n).padStart(l,'0')}",
  pega("CNAE"), pega("ITEM_ANEXO"), fn("infoCnae"),
  "out={}; for(const c of Object.keys(CNAE)){ const a=infoCnae(c).anexos; if(a.length) out[c]=a.join(','); }",
].join("\n");
const ctx = { out: null };
vm.runInNewContext(codigo, ctx);
writeFileSync(new URL("../src/lib/cnaeAnexos.json", import.meta.url), JSON.stringify(ctx.out));
console.log(Object.keys(ctx.out).length, "CNAEs");
