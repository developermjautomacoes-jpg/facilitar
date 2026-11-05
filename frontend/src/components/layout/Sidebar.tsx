import { NavLink } from "react-router-dom";
import { Icon } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { MENU } from "./navegacao";
import styles from "./Sidebar.module.css";

export function Sidebar({ aberta, onNavegar }: { aberta: boolean; onNavegar: () => void }) {
  const { rank } = useAuth();
  return (
    <aside className={[styles.sidebar, aberta ? styles.aberta : ""].join(" ")} aria-label="Menu principal">
      <div className={styles.marca}>
        <img src="./logo-facilitar.png" alt="Facilitar Serviços Contábeis" className={styles.logo} />
      </div>
      <nav className={styles.nav}>
        {MENU.filter((m) => rank >= (m.nivel ?? 1)).map((m) => (
          <NavLink key={m.rota} to={m.rota} end={m.rota === "/memorandos"} onClick={onNavegar}
            className={({ isActive }) => [styles.link, isActive ? styles.ativo : ""].join(" ")}>
            <Icon nome={m.icone} />
            <span>{m.rotulo}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
