import { moeda, numeroBr } from "@/lib/format";
import type { ResultadoPreco } from "../precificacaoCalc";
import styles from "./CardRegime.module.css";

interface Props { nome: string; r: ResultadoPreco; selecionado: boolean; melhorParaCliente: boolean; onSelecionar: () => void }

export function CardRegime({ nome, r, selecionado, melhorParaCliente, onSelecionar }: Props) {
  return (
    <button type="button" className={[styles.card, selecionado ? styles.ativo : ""].join(" ")} onClick={onSelecionar} aria-pressed={selecionado}>
      <span className={styles.nome}>{nome}{melhorParaCliente && <i className={styles.selo}>menor custo p/ cliente</i>}</span>
      {r.inviavel ? <b className={styles.preco}>—</b> : <b className={styles.preco}>{moeda(r.precoTotal)}</b>}
      <span className={styles.linha}>Preço sem CBS/IBS: {moeda(r.precoBase)}</span>
      <span className={styles.linha}>CBS + IBS na nota: {moeda(r.cbs + r.ibs)}</span>
      <span className={styles.linha}>Custo p/ cliente contribuinte: {moeda(r.custoLiquidoCliente)}</span>
      <span className={styles.linha}>Markup: {numeroBr(r.markup, 3)}</span>
    </button>
  );
}
