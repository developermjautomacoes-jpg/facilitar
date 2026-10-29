/**
 * Leitura de .docx no navegador, sem bibliotecas: abre o ZIP (diretório central),
 * descompacta word/document.xml com DecompressionStream e devolve as linhas de texto
 * de cada parágrafo (quebras de linha <w:br/> viram linhas separadas).
 */

function u16(b: Uint8Array, o: number): number { return b[o] | (b[o + 1] << 8); }
function u32(b: Uint8Array, o: number): number { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

async function inflarRaw(dados: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("Este navegador não consegue abrir arquivos .docx. Use o Chrome ou o Edge atualizados.");
  const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

/** Extrai um arquivo de dentro do ZIP pelo nome. */
async function lerDoZip(zip: Uint8Array, nome: string): Promise<Uint8Array | null> {
  let fim = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (u32(zip, i) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error("Arquivo não é um .docx válido.");
  const total = u16(zip, fim + 10);
  let p = u32(zip, fim + 16);
  const dec = new TextDecoder();
  for (let k = 0; k < total; k++) {
    if (u32(zip, p) !== 0x02014b50) break;
    const metodo = u16(zip, p + 10), comp = u32(zip, p + 20), nLen = u16(zip, p + 28), eLen = u16(zip, p + 30), cLen = u16(zip, p + 32), local = u32(zip, p + 42);
    const n = dec.decode(zip.subarray(p + 46, p + 46 + nLen));
    if (n === nome) {
      const ini = local + 30 + u16(zip, local + 26) + u16(zip, local + 28);
      const bruto = zip.subarray(ini, ini + comp);
      if (metodo === 0) return bruto;
      if (metodo === 8) return inflarRaw(bruto);
      throw new Error("Compactação do .docx não suportada.");
    }
    p += 46 + nLen + eLen + cLen;
  }
  return null;
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Linhas de texto do documento, na ordem, já sem linhas vazias nas pontas. */
export async function linhasDoDocx(arquivo: File): Promise<string[]> {
  if (/\.doc$/i.test(arquivo.name)) throw new Error("Arquivo .doc antigo: abra no Word e salve como .docx.");
  const zip = new Uint8Array(await arquivo.arrayBuffer());
  const xml = await lerDoZip(zip, "word/document.xml");
  if (!xml) throw new Error("O arquivo não tem o conteúdo de um documento do Word.");
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(xml), "application/xml");
  const linhas: string[] = [];
  const paragrafos = doc.getElementsByTagNameNS(W, "p");
  for (let i = 0; i < paragrafos.length; i++) {
    let texto = "";
    const andar = (n: Node) => {
      n.childNodes.forEach((c) => {
        if (c.nodeType !== 1) return;
        const el = c as Element;
        if (el.namespaceURI === W && el.localName === "t") texto += el.textContent ?? "";
        else if (el.namespaceURI === W && (el.localName === "tab")) texto += " ";
        else if (el.namespaceURI === W && (el.localName === "br" || el.localName === "cr")) texto += "\n";
        else if (el.namespaceURI === W && el.localName === "p") return; // parágrafos aninhados (caixas de texto) são lidos à parte
        else andar(el);
      });
    };
    andar(paragrafos[i]);
    texto.split("\n").forEach((l) => linhas.push(l.replace(/ /g, " ").replace(/[ \t]+/g, " ").trim()));
  }
  return linhas.filter((l, i, a) => l || (i > 0 && a[i - 1]));
}
