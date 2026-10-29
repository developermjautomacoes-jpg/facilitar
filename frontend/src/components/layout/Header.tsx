import { Link, useLocation } from "react-router-dom";
import { Avatar, Icon } from "@/components/ui";
import { PAGINAS } from "./navegacao";
import styles from "./Header.module.css";

interface Props { usuario: string; cargo?: string; foto?: string; onMenu: () => void; onSair: () => void }

export function Header({ usuario, cargo, foto, onMenu, onSair }: Props) {
  const { pathname } = useLocation();
  const atual = [...PAGINAS].sort((a, b) => b.rota.length - a.rota.length).find((m) => pathname.startsWith(m.rota));
  return (
    <header className={styles.header}>
      <button type="button" className={styles.menu} onClick={onMenu} aria-label="Abrir menu"><Icon nome="menu" tamanho={22} /></button>
      <div className={styles.contexto}>
        <span className={styles.secao}>{atual?.rotulo ?? "Facilitar"}</span>
        <span className={styles.sub}>{atual?.descricao}</span>
      </div>
      <div className={styles.perfil}>
        <Link to="/perfil" className={styles.conta} title="Meu perfil">
          <Avatar nome={usuario} foto={foto} />
          <span className={styles.nome}><b>{usuario}</b><small>{cargo || "Contabilidade · Facilitar"}</small></span>
        </Link>
        <button type="button" className={styles.sair} onClick={onSair} title="Sair" aria-label="Sair"><Icon nome="sair" /></button>
      </div>
    </header>
  );
}
