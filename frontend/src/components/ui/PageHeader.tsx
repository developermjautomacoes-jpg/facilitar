import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

export function PageHeader({ titulo, descricao, acoes }: { titulo: ReactNode; descricao?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className={styles.head}>
      <div className={styles.texto}>
        <h1 className={styles.titulo}>{titulo}</h1>
        {descricao && <p className={styles.descricao}>{descricao}</p>}
      </div>
      {acoes && <div className={styles.acoes}>{acoes}</div>}
    </div>
  );
}
