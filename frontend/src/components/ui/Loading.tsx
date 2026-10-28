import styles from "./Loading.module.css";
export function Loading({ texto = "Carregando…" }: { texto?: string }) {
  return <div className={styles.loading} role="status"><span className={styles.giro} aria-hidden />{texto}</div>;
}
