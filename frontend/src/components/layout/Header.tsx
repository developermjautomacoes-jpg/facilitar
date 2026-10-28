import { useLocation } from "react-router-dom";
import { Icon } from "@/components/ui";
import { iniciais } from "@/lib/format";
import { MENU } from "./navegacao";
import styles from "./Header.module.css";

interface Props { usuario: string; onMenu: () => void; onSair: () => void }

export function Header({ usuario, onMenu, onSair }: Props) {
  const { pathname } = useLocation();
  const atual = [...MENU].sort((a, b) => b.rota.length - a.rota.length).find((m) => pathname.startsWith(m.rota));
  return (
    <header className={styles.header}>
      <button type="button" className={styles.menu} onClick={onMenu} aria-label="Abrir menu"><Icon nome="menu" tamanho={22} /></button>
      <div className={styles.contexto}>
        <span className={styles.secao}>{atual?.rotulo ?? "Facilitar"}</span>
        <span className={styles.sub}>{atual?.descricao}</span>
      </div>
      <div className={styles.perfil}>
        <span className={styles.avatar} aria-hidden>{iniciais(usuario)}</span>
        <span className={styles.nome}><b>{usuario}</b><small>Contabilidade · Facilitar</small></span>
        <button type="button" className={styles.sair} onClick={onSair} title="Sair" aria-label="Sair"><Icon nome="sair" /></button>
      </div>
    </header>
  );
}
