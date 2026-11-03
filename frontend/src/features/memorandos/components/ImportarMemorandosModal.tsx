import { useMemo, useRef, useState } from "react";
import type { Memorando } from "@/types";
import { Badge, Button, DataTable, Modal, Notice, type Coluna } from "@/components/ui";
import { linhasDoDocx } from "@/lib/docx";
import { memorandosDoCsv, textoDoCsv } from "@/lib/importarAcessorias";
import { dataBr, digitos, hojeISO, numeroMemorando } from "@/lib/format";
import { completarComReceita, memorandoDeLinhas, type MemorandoImportado } from "@/lib/importarMemorando";
import { consultarCnpj, importarMemorando } from "@/services/memorandosService";
import styles from "./ImportarMemorandosModal.module.css";

type Situacao = "pronto" | "importando" | "importado" | "falhou";
interface Item {
  chave: string;
  dados: MemorandoImportado;
  marcado: boolean;
  /** Código do memorando (NN/AAAA), editável; vazio = numeração automática. */
  numero: string;
  /** Data de entrada do cliente, editável. */
  data: string;
  cnpjExistente?: Memorando;
  repetido?: boolean;
  situacao: Situacao;
  resultado?: string;
}

interface Props { aberto: boolean; memorandos: Memorando[]; onFechar: () => void; onConcluido: () => void }

const lerNumero = (v: string) => { const m = v.trim().match(/^(\d{1,4})\/(\d{4})$/); return m ? { seq: Number(m[1]), ano: Number(m[2]) } : null; };
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ImportarMemorandosModal({ aberto, memorandos, onFechar, onConcluido }: Props) {
  const [itens, setItens] = useState<Item[]>([]);
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [completar, setCompletar] = useState(true);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const concluiu = itens.length > 0 && itens.every((i) => i.situacao !== "pronto" || !i.marcado || !!i.dados.erro) && itens.some((i) => i.situacao === "importado" || i.situacao === "falhou");
  const bloqueado = (i: Item) => !!i.dados.erro || !!i.cnpjExistente || !!i.repetido;
  const selecionados = itens.filter((i) => i.marcado && !bloqueado(i) && i.situacao === "pronto");
  const usados = useMemo(() => new Set(memorandos.map((m) => `${m.ano}-${m.seq}`)), [memorandos]);

  /** Mensagem de erro do código digitado; vazio é aceito e vira numeração automática. */
  function erroNumero(i: Item): string {
    if (!i.numero.trim()) return "";
    const n = lerNumero(i.numero);
    if (!n || n.seq < 1 || n.ano < 2000 || n.ano > 2100) return "Use o formato 12/2025.";
    if (usados.has(`${n.ano}-${n.seq}`)) return "Número já usado no sistema.";
    const igual = selecionados.some((o) => o !== i && (() => { const x = lerNumero(o.numero); return x && x.seq === n.seq && x.ano === n.ano; })());
    return igual ? "Número repetido nesta importação." : "";
  }
  const comErro = selecionados.filter((i) => erroNumero(i)).length;

  function fechar() {
    if (importando) return;
    if (itens.some((i) => i.situacao === "importado")) onConcluido();
    setItens([]); onFechar();
  }

  async function lerArquivos(lista: FileList | File[]) {
    const arquivos = [...lista].filter((f) => /\.(docx?|csv)$/i.test(f.name));
    if (!arquivos.length) return;
    setLendo(true);
    const novos: Item[] = [];
    const adiciona = (chave: string, dados: MemorandoImportado) => novos.push({ chave, dados, marcado: !dados.erro, numero: dados.seq && dados.ano ? numeroMemorando(dados.seq, dados.ano) : "", data: String(dados.memo.e_desde ?? ""), situacao: "pronto" });
    for (const f of arquivos) {
      const chave = `${f.name}-${f.size}-${f.lastModified}`;
      try {
        if (/\.csv$/i.test(f.name)) memorandosDoCsv(await textoDoCsv(f), f.name).forEach((d, i) => adiciona(`${chave}-${i}`, d));
        else adiciona(chave, memorandoDeLinhas(await linhasDoDocx(f), f.name));
      } catch (e) { adiciona(chave, { arquivo: f.name, memo: {}, seq: null, ano: null, avisos: [], erro: e instanceof Error ? e.message : "Não foi possível ler o arquivo." }); }
    }
    setItens((atuais) => revisar([...atuais.filter((a) => !novos.some((n) => n.chave === a.chave)), ...novos]));
    setLendo(false);
  }

  /** Empresa já cadastrada ou repetida na mesma leitura nunca é importada. */
  function revisar(lista: Item[]): Item[] {
    return lista.map((i, k) => {
      if (i.situacao !== "pronto") return i;
      const cnpj = digitos(i.dados.memo.e_cnpj);
      const cnpjExistente = cnpj ? memorandos.find((m) => digitos(m.e_cnpj) === cnpj && m.status !== "cancelado") : undefined;
      const repetido = !!cnpj && lista.slice(0, k).some((o) => digitos(o.dados.memo.e_cnpj) === cnpj);
      return { ...i, cnpjExistente, repetido, marcado: i.marcado && !i.dados.erro && !cnpjExistente && !repetido };
    });
  }

  async function importar() {
    setImportando(true);
    // quem tem código digitado vai primeiro, para a numeração automática não ocupar esses números
    const fila = [...selecionados].sort((a, b) => Number(!a.numero.trim()) - Number(!b.numero.trim()));
    for (const alvo of fila) {
      setItens((l) => l.map((i) => (i.chave === alvo.chave ? { ...i, situacao: "importando" } : i)));
      const memo = structuredClone(alvo.dados.memo);
      memo.e_desde = alvo.data;
      if (alvo.dados.origem && alvo.data) memo.m_data = alvo.data; // o relatório não tem data de memorando
      const notas: string[] = [];
      if (completar) {
        try { const feito = completarComReceita(memo, await consultarCnpj(digitos(memo.e_cnpj))); if (feito.length) notas.push("Receita: " + feito.join(", ")); }
        catch { notas.push("Receita indisponível: importado só com os dados do arquivo"); }
        await espera(1000); // as bases públicas limitam consultas em sequência
      }
      const numero = lerNumero(alvo.numero);
      const acao = alvo.dados.origem ?? `Importou do memorando antigo (${alvo.dados.arquivo})`;
      const anoAuto = numero?.ano ?? Number(String(memo.m_data || memo.e_desde || hojeISO()).slice(0, 4));
      try {
        const salvo = await importarMemorando(memo, numero, anoAuto, acao);
        setItens((l) => l.map((i) => (i.chave === alvo.chave ? { ...i, situacao: "importado", resultado: `Nº ${numeroMemorando(salvo.seq, salvo.ano)}${notas.length ? " · " + notas.join(" · ") : ""}` } : i)));
      } catch (e) {
        setItens((l) => l.map((i) => (i.chave === alvo.chave ? { ...i, situacao: "falhou", resultado: e instanceof Error ? e.message : "Erro ao salvar." } : i)));
      }
    }
    setImportando(false);
  }

  const altera = (chave: string, dados: Partial<Item>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...dados } : i)));
  const todos = itens.filter((i) => !bloqueado(i) && i.situacao === "pronto");
  const jaCadastradas = itens.filter((i) => i.situacao === "pronto" && (i.cnpjExistente || i.repetido)).length;
  const totalImportados = itens.filter((i) => i.situacao === "importado").length;

  const colunas: Coluna<Item>[] = useMemo(() => [
    { chave: "sel", titulo: "", largura: "36px", render: (i) => i.situacao === "pronto" && !bloqueado(i)
      ? <input type="checkbox" aria-label={`Importar ${i.dados.memo.e_razao || i.dados.arquivo}`} checked={i.marcado} disabled={importando} onChange={(e) => altera(i.chave, { marcado: e.target.checked })} /> : null },
    { chave: "num", titulo: "Código", largura: "112px", render: (i) => {
      if (i.situacao !== "pronto" || bloqueado(i)) return <span className={styles.muted}>—</span>;
      const erro = i.marcado ? erroNumero(i) : "";
      return <div className={styles.campo}>
        <input className={[styles.entrada, erro ? styles.invalido : ""].join(" ")} aria-label={`Código do memorando de ${i.dados.memo.e_razao}`} placeholder="Automático" value={i.numero} disabled={importando || !i.marcado} onChange={(e) => altera(i.chave, { numero: e.target.value })} />
        {erro && <small className={styles.erro}>{erro}</small>}
      </div>;
    } },
    { chave: "data", titulo: "Data de entrada", largura: "150px", render: (i) => i.situacao !== "pronto" || bloqueado(i) ? <span className={styles.muted}>—</span>
      : <input className={styles.entrada} type="date" aria-label={`Data de entrada de ${i.dados.memo.e_razao}`} value={i.data} disabled={importando || !i.marcado} onChange={(e) => altera(i.chave, { data: e.target.value })} /> },
    { chave: "emp", titulo: "Empresa", render: (i) => <div className={styles.emp}><b>{i.dados.memo.e_razao || "—"}</b><span>{i.dados.memo.e_cnpj || ""}{i.dados.memo.m_data ? ` · ${dataBr(i.dados.memo.m_data)}` : ""}</span><small>{i.dados.origem ? "Acessórias" : i.dados.arquivo}</small></div> },
    { chave: "reg", titulo: "Regime", render: (i) => i.dados.memo.t_regime || <span className={styles.muted}>a informar</span> },
    { chave: "sit", titulo: "Situação", render: (i) => (
      <div className={styles.sit}>
        {i.situacao === "importado" && <Badge tom="sucesso">Importado</Badge>}
        {i.situacao === "importando" && <Badge tom="navy">Importando…</Badge>}
        {i.situacao === "falhou" && <Badge tom="perigo">Falhou</Badge>}
        {i.dados.erro && <Badge tom="perigo">Não importável</Badge>}
        {i.situacao === "pronto" && !i.dados.erro && (i.cnpjExistente
          ? <Badge tom="alerta">Já cadastrada (Nº {numeroMemorando(i.cnpjExistente.seq, i.cnpjExistente.ano)}): não será importada</Badge>
          : i.repetido ? <Badge tom="alerta">Repetida nesta importação: não será importada</Badge>
          : <Badge tom="neutro">Pronto</Badge>)}
        {(i.resultado || i.dados.erro) && <small>{i.resultado || i.dados.erro}</small>}
        {i.situacao === "pronto" && !bloqueado(i) && i.dados.avisos.map((a) => <small key={a} className={styles.aviso}>{a}</small>)}
      </div>
    ) },
  ], [importando, itens, usados]);

  return (
    <Modal aberto={aberto} onFechar={fechar} largura="lg" titulo="Importar memorandos"
      rodape={concluiu ? <Button variante="primary" onClick={fechar}>Concluir ({totalImportados} importado{totalImportados === 1 ? "" : "s"})</Button> : <>
        <Button onClick={fechar} disabled={importando}>Cancelar</Button>
        <Button variante="primary" carregando={importando} disabled={!selecionados.length || lendo || comErro > 0} onClick={() => void importar()}>
          {selecionados.length ? `Importar ${selecionados.length} memorando${selecionados.length === 1 ? "" : "s"}` : "Importar memorandos"}
        </Button>
      </>}>
      <div className={styles.corpo}>
        <div className={[styles.zona, arrastando ? styles.zonaAtiva : ""].join(" ")}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); void lerArquivos(e.dataTransfer.files); }}>
          <p><b>Arraste os arquivos .docx ou .csv aqui</b> ou</p>
          <Button variante="primary" disabled={importando || lendo} onClick={() => entrada.current?.click()}>{lendo ? "Lendo arquivos…" : "Escolher arquivos"}</Button>
          <input ref={entrada} type="file" accept=".docx,.csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv" multiple hidden
            onChange={(e) => { if (e.target.files) void lerArquivos(e.target.files); e.target.value = ""; }} />
          <small>Memorandos do Word (.docx) ou relatório de empresas do Acessórias (.csv). Pode selecionar vários de uma vez.</small>
        </div>

        {itens.length > 0 && <>
          <div className={styles.opcoes}>
            <label><input type="checkbox" checked={completar} disabled={importando} onChange={(e) => setCompletar(e.target.checked)} /> Completar com a Receita (CNAEs secundários, sócios, situação)</label>
            <span className={styles.muted}>{todos.length} a importar · {selecionados.length} marcada{selecionados.length === 1 ? "" : "s"}{jaCadastradas ? ` · ${jaCadastradas} já cadastrada${jaCadastradas === 1 ? "" : "s"}` : ""}</span>
          </div>
          <Notice tom="info">Confira o código do memorando e a data de entrada de cada empresa antes de importar. Código em branco recebe a numeração automática.</Notice>
          {jaCadastradas > 0 && <Notice tom="alerta">{jaCadastradas} empresa{jaCadastradas === 1 ? "" : "s"} já cadastrada{jaCadastradas === 1 ? "" : "s"} ou repetida{jaCadastradas === 1 ? "" : "s"} no arquivo: não {jaCadastradas === 1 ? "será importada" : "serão importadas"} de novo.</Notice>}
          {comErro > 0 && <Notice tom="erro">Corrija {comErro} código{comErro === 1 ? "" : "s"} para importar.</Notice>}
          <DataTable colunas={colunas} linhas={itens} chaveLinha={(i) => i.chave} />
          <p className={styles.muted}>Depois de importar, abra cada memorando para completar o que faltou: responsáveis dos setores, Puro/Híbrido no Simples, anexos e IE na SEFAZ. O histórico registra a origem da importação.</p>
        </>}
      </div>
    </Modal>
  );
}
