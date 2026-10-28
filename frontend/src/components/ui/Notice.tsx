import type { ReactNode } from "react";
import styles from "./Notice.module.css";
export function Notice({ tom = "info", children }: { tom?: "info" | "alerta" | "erro"; children: ReactNode }) {
  return <div className={[styles.notice, styles[tom]].join(" ")}>{children}</div>;
}
