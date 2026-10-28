import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type Tom = "neutro" | "navy" | "gold" | "sucesso" | "alerta" | "perigo";
export function Badge({ tom = "neutro", children }: { tom?: Tom; children: ReactNode }) {
  return <span className={[styles.badge, styles[tom]].join(" ")}>{children}</span>;
}
