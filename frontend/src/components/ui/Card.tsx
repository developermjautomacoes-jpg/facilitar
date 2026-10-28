import type { ReactNode } from "react";
import styles from "./Card.module.css";

interface Props {
  titulo?: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  children?: ReactNode;
  className?: string;
  semPadding?: boolean;
}

export function Card({ titulo, descricao, acoes, children, className, semPadding }: Props) {
  return (
    <section className={[styles.card, semPadding ? styles.flush : "", className].filter(Boolean).join(" ")}>
      {(titulo || acoes) && (
        <header className={styles.head}>
          <div>
            {titulo && <h3 className={styles.titulo}>{titulo}</h3>}
            {descricao && <p className={styles.descricao}>{descricao}</p>}
          </div>
          {acoes && <div className={styles.acoes}>{acoes}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
