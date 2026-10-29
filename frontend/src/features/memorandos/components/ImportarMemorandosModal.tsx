import { useMemo, useRef, useState } from "react";
import type { Memorando } from "@/types";
import { Badge, Button, DataTable, Modal, Notice, type Coluna } from "@/components/ui";
import { linhasDoDocx } from "@/lib/docx";
import { dataBr, digitos, hojeISO, numeroMemorando } from "@/lib/format";
import { completarComReceita, memorandoDeLinhas, type MemorandoImportado } from "@/lib/importarMemorando";
import { ApiError } from "@/services/http";
import { consultarCnpj, importarMemorando } from "@/services/memorandosService";
import styles from "./ImportarMemorandosModal.module.css";

type Situacao = "pronto" | "importando" | "importado" | "falhou";
interface Item {
  chave: string;
  dados: MemorandoImportado;
  marcado: boolean;
  numeroLivre: boolean;
  cnpjExistente?: Memorando;
  repetido?: boolean;
  situacao: Situacao;
  resultado?: string;
}

interface Props { aberto: boolean; memorandos: Memorando[]; onFechar: () => void; onConcluido: () => void }

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ImportarMemorandosModal({ aberto, memorandos, onFechar, onConcluido }: Props) {
  const [itens, setItens] = useState<Item[]>([]);
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [manterNumero, setManterNumero] = useState(true);
  const [completar, setCompletar] = useState(true);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const concluiu = itens.length > 0 && itens.every((i) => i.situacao !== "pronto" || !i.marcado || !!i.dados.erro) && itens.some((i) => i.situacao === "importado" || i.situacao === "falhou");
  const selecionados = itens.filter((i) => i.marcado && !i.dados.erro && i.situacao === "pronto");

  function fechar() {
    if (importando) return;
    if (itens.some((i) => i.situacao === "importado")) onConcluido();
    setItens([]); onFechar();
  }

  async function lerArquivos(lista: FileList | File[]) {
    const arquivos = [...lista].filter((f) => /\.docx?$/i.test(f.name));
    if (!arquivos.length) return;
    setLendo(true);
    const novos: Item[] = [];
    for (const f of arquivos) {
      let dados: MemorandoImportado;
      try { dados = memorandoDeLinhas(await linhasDoDocx(f), f.name); }
      catch (e) { dados = { arquivo: f.name, memo: {}, seq: null, ano: null, avisos: [], erro: e instanceof Error ? e.message : "Não foi possível ler o arquivo." }; }
      novos.push({ chave: `${f.name}-${f.size}-${f.lastModified}`, dados, marcado: !dados.erro, numeroLivre: true, situacao: "pronto" });
    }
    setItens((atuais) => revisar([...atuais.filter((a) => !novos.some((n) => n.chave === a.chave)), ...novos]));
    setLendo(false);
  }

  /** Marca conflitos de número (com o arquivo do sistema ou entre os próprios arquivos) e CNPJs já cadastrados. */
  function revisar(lista: Item[]): Item[] {
    const usados = new Set(memorandos.map((m) => `${m.ano}-${m.seq}`));
    return lista.map((i) => {
      if (i.situacao !== "pronto") return i;
      const { seq, ano, memo } = i.dados;
      let numeroLivre = !!seq && !!ano && !usados.has(`${ano}-${seq}`);
      if (numeroLivre) usados.add(`${ano}-${seq}`);
      else numeroLivre = false;
      const cnpj = digitos(memo.e_cnpj);
      const cnpjExistente = cnpj ? memorandos.find((m) => digitos(m.e_cnpj) === cnpj && m.status !== "cancelado") : undefined;
      const repetidoNoLote = cnpj && lista.some((o) => o !== i && digitos(o.dados.memo.e_cnpj) === cnpj && lista.indexOf(o) < lista.indexOf(i));
      return { ...i, numeroLivre, cnpjExistente, repetido: !!repetidoNoLote, marcado: i.marcado && !i.dados.erro && !(cnpjExistente && !i.cnpjExistente) && !repetidoNoLote };
    });
  }

  async function importar() {
    setImportando(true);
    for (const alvo of selecionados) {
      setItens((l) => l.map((i) => (i.chave === alvo.chave ? { ...i, situacao: "importando" } : i)));
      const memo = structuredClone(alvo.dados.memo);
      const notas: string[] = [];
      if (completar) {
        try { const feito = completarComReceita(memo, await consultarCnpj(digitos(memo.e_cnpj))); if (feito.length) notas.push("Receita: " + feito.join(", ")); }
        catch { notas.push("Receita indisponível: importado só com os dados do arquivo"); }
        await espera(350);
      }
      const { seq, ano } = alvo.dados;
      const numero = manterNumero && alvo.numeroLivre && seq && ano ? { seq, ano } : null;
      const anoAuto = ano || Number(String(memo.m_data || hojeISO()).slice(0, 4));
      try {
        let salvo: Memorando;
        try { salvo = await importarMemorando(memo, numero, anoAuto, alvo.dados.arquivo); }
        catch (e) {
          if (numero && e instanceof ApiError && e.status === 409) { salvo = await importarMemorando(memo, null, anoAuto, alvo.dados.arquivo); notas.unshift("número já usado: renumerado"); }
          else throw e;
        }
        setItens((l) => l.map((i) => (i.chave === alvo.chave ? { ...i, situacao: "importado", resultado: `Nº ${numeroMemorando(salvo.seq, salvo.ano)}${notas.length ? " · " + notas.join(" · ") : ""}` } : i)));
      } catch (e) {
        setItens((l) => l.map((i) => (i.chave === alvo.chave ? { ...i, situacao: "falhou", resultado: e instanceof Error ? e.message : "Erro ao salvar." } : i)));
      }
    }
    setImportando(false);
  }

  const marcar = (chave: string, v: boolean) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, marcado: v } : i)));
  const todos = itens.filter((i) => !i.dados.erro && i.situacao === "pronto");
  const totalImportados = itens.filter((i) => i.situacao === "importado").length;

  const colunas: Coluna<Item>[] = useMemo(() => [
    { chave: "sel", titulo: "", largura: "36px", render: (i) => i.situacao === "pronto" && !i.dados.erro
      ? <input type="checkbox" aria-label={`Importar ${i.dados.arquivo}`} checked={i.marcado} disabled={importando} onChange={(e) => marcar(i.chave, e.target.checked)} /> : null },
    { chave: "num", titulo: "Nº", largura: "92px", render: (i) => {
      const { seq, ano } = i.dados;
      if (!seq || !ano) return <span className={styles.muted}>automático</span>;
      return <span className={!i.numeroLivre || !manterNumero ? styles.riscado : undefined} title={!i.numeroLivre ? "Número já usado: será renumerado" : undefined}>{numeroMemorando(seq, ano)}</span>;
    } },
    { chave: "emp", titulo: "Empresa", render: (i) => <div className={styles.emp}><b>{i.dados.memo.e_razao || "—"}</b><span>{i.dados.memo.e_cnpj || ""}{i.dados.memo.m_data ? ` · ${dataBr(i.dados.memo.m_data)}` : ""}</span><small>{i.dados.arquivo}</small></div> },
    { chave: "reg", titulo: "Regime", render: (i) => i.dados.memo.t_regime || <span className={styles.muted}>a informar</span> },
    { chave: "sit", titulo: "Situação", render: (i) => (
      <div className={styles.sit}>
        {i.situacao === "importado" && <Badge tom="sucesso">Importado</Badge>}
        {i.situacao === "importando" && <Badge tom="navy">Importando…</Badge>}
        {i.situacao === "falhou" && <Badge tom="perigo">Falhou</Badge>}
        {i.dados.erro && <Badge tom="perigo">Não importável</Badge>}
        {i.situacao === "pronto" && !i.dados.erro && (i.cnpjExistente
          ? <Badge tom="alerta">CNPJ já no sistema (Nº {numeroMemorando(i.cnpjExistente.seq, i.cnpjExistente.ano)})</Badge>
          : i.repetido ? <Badge tom="alerta">CNPJ repetido nesta importação</Badge>
          : <Badge tom="neutro">Pronto</Badge>)}
        {i.situacao === "pronto" && !i.dados.erro && i.dados.seq && i.dados.ano && !i.numeroLivre && <Badge tom="alerta">Nº já usado: será renumerado</Badge>}
        {(i.resultado || i.dados.erro) && <small>{i.resultado || i.dados.erro}</small>}
        {i.situacao === "pronto" && !i.dados.erro && i.dados.avisos.map((a) => <small key={a} className={styles.aviso}>{a}</small>)}
      </div>
    ) },
  ], [importando, manterNumero]);

  return (
    <Modal aberto={aberto} onFechar={fechar} largura="lg" titulo="Importar memorandos antigos"
      rodape={concluiu ? <Button variante="primary" onClick={fechar}>Concluir ({totalImportados} importado{totalImportados === 1 ? "" : "s"})</Button> : <>
        <Button onClick={fechar} disabled={importando}>Cancelar</Button>
        <Button variante="primary" carregando={importando} disabled={!selecionados.length || lendo} onClick={() => void importar()}>
          {selecionados.length ? `Importar ${selecionados.length} memorando${selecionados.length === 1 ? "" : "s"}` : "Importar memorandos"}
        </Button>
      </>}>
      <div className={styles.corpo}>
        <div className={[styles.zona, arrastando ? styles.zonaAtiva : ""].join(" ")}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); void lerArquivos(e.dataTransfer.files); }}>
          <p><b>Arraste os arquivos .docx aqui</b> ou</p>
          <Button variante="primary" disabled={importando || lendo} onClick={() => entrada.current?.click()}>{lendo ? "Lendo arquivos…" : "Escolher arquivos"}</Button>
          <input ref={entrada} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple hidden
            onChange={(e) => { if (e.target.files) void lerArquivos(e.target.files); e.target.value = ""; }} />
          <small>Memorandos no modelo antigo do Word (Nome, Nome Fantasia, CNPJ, Opção Tributária…). Pode selecionar vários de uma vez.</small>
        </div>

        {itens.length > 0 && <>
          <div className={styles.opcoes}>
            <label><input type="checkbox" checked={manterNumero} disabled={importando} onChange={(e) => setManterNumero(e.target.checked)} /> Manter o número do arquivo (quando estiver livre)</label>
            <label><input type="checkbox" checked={completar} disabled={importando} onChange={(e) => setCompletar(e.target.checked)} /> Completar com a Receita (CNAEs secundários, sócios, situação)</label>
            <span className={styles.muted}>{todos.length} arquivo{todos.length === 1 ? "" : "s"} lido{todos.length === 1 ? "" : "s"} · {selecionados.length} marcado{selecionados.length === 1 ? "" : "s"}</span>
          </div>
          {itens.some((i) => i.cnpjExistente && i.situacao === "pronto") && <Notice tom="alerta">Empresas que já têm memorando no sistema ficam desmarcadas. Marque só se quiser cadastrar outro memorando para a mesma empresa.</Notice>}
          <DataTable colunas={colunas} linhas={itens} chaveLinha={(i) => i.chave} />
          <p className={styles.muted}>Depois de importar, abra cada memorando para completar o que o modelo antigo não tinha: responsáveis dos setores, Puro/Híbrido no Simples, anexos e IE na SEFAZ. O histórico registra "Importou do memorando antigo" com o nome do arquivo.</p>
        </>}
      </div>
    </Modal>
  );
}
