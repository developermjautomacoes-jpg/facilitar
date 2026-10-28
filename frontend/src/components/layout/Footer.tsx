import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <span>© {new Date().getFullYear()} Facilitar Serviços Contábeis · Serra/ES</span>
      <span>Produzido por <b>NEEKO</b> Automação Inteligente</span>
    </footer>
  );
}
