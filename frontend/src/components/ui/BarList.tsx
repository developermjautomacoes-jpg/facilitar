import styles from "./BarList.module.css";

/** Lista de barras horizontais (categoria × quantidade). */
export function BarList({ itens, vazio, tom = "navy", formatar = String }: { itens: [string, number][]; vazio: string; tom?: "navy" | "gold"; formatar?: (n: number) => string }) {
  if (!itens.length) return <p className={styles.vazio}>{vazio}</p>;
  const max = Math.max(...itens.map((i) => i[1]));
  return (
    <ul className={styles.lista}>
      {itens.map(([rotulo, n]) => (
        <li key={rotulo} className={styles.item} title={`${rotulo}: ${formatar(n)}`}>
          <span className={styles.rotulo}>{rotulo}</span>
          <span className={styles.trilho}><span className={[styles.barra, styles[tom]].join(" ")} style={{ width: `${Math.max(2, (100 * n) / max)}%` }} /></span>
          <span className={styles.valor}>{formatar(n)}</span>
        </li>
      ))}
    </ul>
  );
}
