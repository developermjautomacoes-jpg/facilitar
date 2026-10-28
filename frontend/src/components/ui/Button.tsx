import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type Variante = "primary" | "secondary" | "ghost" | "danger" | "gold";
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: "sm" | "md";
  icone?: ReactNode;
  carregando?: boolean;
}

export function Button({ variante = "secondary", tamanho = "md", icone, carregando, children, className, disabled, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || carregando}
      className={[styles.btn, styles[variante], styles[tamanho], className].filter(Boolean).join(" ")}
    >
      {icone && <span className={styles.icone} aria-hidden>{icone}</span>}
      {carregando ? "Aguarde…" : children}
    </button>
  );
}
