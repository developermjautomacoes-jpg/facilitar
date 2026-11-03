import { useEffect, useRef, useState } from "react";
import type { Memorando } from "@/types";
import { Badge, Button, Modal, Notice } from "@/components/ui";
import { aplicarDiferencas, diferencasMemorando, normalizarReceita, type Diferenca } from "@/lib/atualizarMemorando";
import { digitos, formatarCnpj, numeroMemorando } from "@/lib/format";
import { consultarCnpj, gravarAtualizacaoReceita, listarMemorandos } from "@/services/memorandosService";
import styles from "./AtualizarCnpjModal.module.css";

const PAUSA_MS = 1500; // as bases públicas limitam consultas em sequência
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Situacao = "aguardando" | "consultando" | "igual" | "diferente" | "erro" | "salvando" | "salvo";
interface Item { memo: Memorando; situacao: Situacao; difs: Diferenca[]; marcadas: Set<string>; mensagem?: string }

interface Props { memorandos: Memorando[]; onFechar: () => void; onConcluido: () => void }

/** Consulta os memorandos escolhidos, mostra o que mudou e grava só o que continuar marcado. */
export function AtualizarCnpjModal({ memorandos, onFechar, onConcluido }: Props) {
  const [itens, setItens] = useState<Item[]>([]);
  const [fase, setFase] = useState<"consulta" | "revisao" | "gravando" | "fim">("consulta");
  const parar = useRef(false);
  const aberto = memorandos.length > 0;

  const muda = (id: string, f: (i: Item) => Item) => setItens((l) => l.map((i) => (i.memo._id === id ? f(i) : i)));

  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    parar.current = false;
    setFase("consulta");
    setItens(memorandos.map((memo) => ({ memo, situacao: "aguardando", difs: [], marcadas: new Set() })));
    (async () => {
      for (let i = 0; i < memorandos.length && !cancelado && !parar.current; i++) {
        const memo = memorandos[i]; const cnpj = digitos(memo.e_cnpj);
        if (cnpj.length !== 14) { muda(memo._id, (x) => ({ ...x, situacao: "erro", mensagem: "Memorando sem CNPJ válido." })); continue; }
        muda(memo._id, (x) => ({ ...x, situacao: "consultando" }));
        try {
          const difs = diferencasMemorando(memo, normalizarReceita(await consultarCnpj(cnpj)));
          muda(memo._id, (x) => ({ ...x, situacao: difs.length ? "diferente" : "igual", difs, marcadas: new Set(difs.map((d) => d.chave)) }));
        } catch (e) { muda(memo._id, (x) => ({ ...x, situacao: "erro", mensagem: e instanceof Error ? e.message : "Não foi possível consultar." })); }
        if (i < memorandos.length - 1) await espera(PAUSA_MS);
      }
      if (!cancelado) setFase("revisao");
    })();
    return () => { cancelado = true; };
  }, [aberto, memorandos]);

  const paraGravar = itens.filter((i) => i.situacao === "diferente" && i.marcadas.size > 0);
  const totalCampos = paraGravar.reduce((s, i) => s + i.marcadas.size, 0);
  const consultados = itens.filter((i) => !["aguardando", "consultando"].includes(i.situacao)).length;

  function alternar(id: string, chave: string) {
    muda(id, (x) => { const n = new Set(x.marcadas); if (n.has(chave)) n.delete(chave); else n.add(chave); return { ...x, marcadas: n }; });
  }

  async function gravar() {
    setFase("gravando");
    let atuais: Memorando[] = [];
    try { atuais = await listarMemorandos(); } // relê para não desfazer alteração feita por outra pessoa durante a revisão
    catch (e) { paraGravar.forEach((i) => muda(i.memo._id, (x) => ({ ...x, situacao: "erro", mensagem: e instanceof Error ? e.message : "Sem conexão." }))); setFase("fim"); return; }
    for (const item of paraGravar) {
      const atual = atuais.find((m) => m._id === item.memo._id);
      if (!atual) { muda(item.memo._id, (x) => ({ ...x, situacao: "erro", mensagem: "O memorando não existe mais no arquivo." })); continue; }
      const escolhidas = item.difs.filter((d) => item.marcadas.has(d.chave));
      muda(item.memo._id, (x) => ({ ...x, situacao: "salvando" }));
      try {
        await gravarAtualizacaoReceita(aplicarDiferencas(atual, escolhidas), escolhidas.map((d) => d.rotulo));
        muda(item.memo._id, (x) => ({ ...x, situacao: "salvo", mensagem: `${escolhidas.length} campo(s) atualizado(s).` }));
      } catch (e) { muda(item.memo._id, (x) => ({ ...x, situacao: "erro", mensagem: e instanceof Error ? e.message : "Erro ao salvar." })); }
    }
    setFase("fim");
    onConcluido();
  }

  function fechar() {
    if (fase === "gravando") return;
    parar.current = true;
    onFechar();
  }

  return (
    <Modal aberto={aberto} largura="lg" titulo="Atualizar memorandos pelo CNPJ" onFechar={fechar}
      rodape={fase === "fim" ? <Button variante="primary" onClick={fechar}>Concluir</Button> : <>
        {fase === "consulta" && <Button onClick={() => { parar.current = true; }}>Parar consulta</Button>}
        <Button onClick={fechar} disabled={fase === "gravando"}>Cancelar</Button>
        <Button variante="primary" carregando={fase === "gravando"} disabled={fase !== "revisao" || !totalCampos} onClick={() => void gravar()}>
          {totalCampos ? `Salvar ${totalCampos} alteração(ões) em ${paraGravar.length} memorando(s)` : "Salvar alterações"}
        </Button>
      </>}>
      <div className={styles.corpo}>
        <Notice tom="info">{fase === "consulta" ? `Consultando ${consultados} de ${itens.length}…` : "Dados das bases públicas da Receita (BrasilAPI e ReceitaWS). Desmarque o que não deve mudar; nada é gravado antes de salvar."}</Notice>
        {itens.map((i) => (
          <section key={i.memo._id} className={styles.item}>
            <header className={styles.topo}>
              <div><b>Nº {numeroMemorando(i.memo.seq, i.memo.ano)} · {i.memo.e_razao || "—"}</b><small>{formatarCnpj(i.memo.e_cnpj)}</small></div>
              {i.situacao === "aguardando" && <Badge>Na fila</Badge>}
              {i.situacao === "consultando" && <Badge tom="navy">Consultando…</Badge>}
              {i.situacao === "igual" && <Badge tom="sucesso">Sem diferenças</Badge>}
              {i.situacao === "diferente" && <Badge tom="gold">{i.difs.length} diferença(s)</Badge>}
              {i.situacao === "salvando" && <Badge tom="navy">Salvando…</Badge>}
              {i.situacao === "salvo" && <Badge tom="sucesso">Atualizado</Badge>}
              {i.situacao === "erro" && <Badge tom="perigo">Não atualizado</Badge>}
            </header>
            {i.mensagem && <p className={styles.mensagem}>{i.mensagem}</p>}
            {i.situacao === "diferente" && (
              <div className={styles.tabela}><table>
                <thead><tr><th /><th>Campo</th><th>No memorando</th><th>Na consulta</th></tr></thead>
                <tbody>{i.difs.map((d) => (
                  <tr key={d.chave}>
                    <td><input type="checkbox" aria-label={`Atualizar ${d.rotulo} de ${i.memo.e_razao}`} checked={i.marcadas.has(d.chave)} disabled={fase !== "revisao"} onChange={() => alternar(i.memo._id, d.chave)} /></td>
                    <td><b>{d.rotulo}</b></td><td className={styles.antigo}>{d.atual || "—"}</td><td>{d.novo}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        ))}
      </div>
    </Modal>
  );
}
