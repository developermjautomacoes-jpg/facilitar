import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export function EmptyState({ titulo, children, acao }: { titulo: ReactNode; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className={styles.vazio}>
      <strong className={styles.titulo}>{titulo}</strong>
      {children && <p className={styles.texto}>{children}</p>}
      {acao}
    </div>
  );
}
