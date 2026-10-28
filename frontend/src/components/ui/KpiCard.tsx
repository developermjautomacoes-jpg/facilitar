import type { ReactNode } from "react";
import styles from "./KpiCard.module.css";

interface Props { rotulo: ReactNode; valor: ReactNode; detalhe?: ReactNode; destaque?: boolean; marcador?: string }

/** Indicador numérico. "marcador" é o nome de um token de cor (ex.: "--chart-in"). */
export function KpiCard({ rotulo, valor, detalhe, destaque, marcador }: Props) {
  return (
    <div className={[styles.kpi, destaque ? styles.destaque : ""].join(" ")}>
      <span className={styles.rotulo}>
        {marcador && <i className={styles.marcador} style={{ background: `var(${marcador})` }} />}
        {rotulo}
      </span>
      <span className={styles.valor}>{valor}</span>
      {detalhe && <span className={styles.detalhe}>{detalhe}</span>}
    </div>
  );
}
