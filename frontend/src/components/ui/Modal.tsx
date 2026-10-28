import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./Modal.module.css";

interface Props { aberto: boolean; titulo: ReactNode; onFechar: () => void; children: ReactNode; rodape?: ReactNode; largura?: "sm" | "md" | "lg" }

export function Modal({ aberto, titulo, onFechar, children, rodape, largura = "md" }: Props) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aberto, onFechar]);
  if (!aberto) return null;
  return createPortal(
    <div className={styles.fundo} onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className={[styles.caixa, styles[largura]].join(" ")} role="dialog" aria-modal="true" aria-label={typeof titulo === "string" ? titulo : undefined}>
        <header className={styles.head}>
          <h3>{titulo}</h3>
          <button type="button" className={styles.fechar} onClick={onFechar} aria-label="Fechar">×</button>
        </header>
        <div className={styles.corpo}>{children}</div>
        {rodape && <footer className={styles.rodape}>{rodape}</footer>}
      </div>
    </div>,
    document.body,
  );
}
