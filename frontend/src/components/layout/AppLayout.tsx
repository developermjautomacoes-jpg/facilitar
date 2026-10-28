import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import styles from "./AppLayout.module.css";

export function AppLayout() {
  const { usuario, sair } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  return (
    <div className={styles.app}>
      <Sidebar aberta={menuAberto} onNavegar={() => setMenuAberto(false)} />
      {menuAberto && <div className={styles.veu} onClick={() => setMenuAberto(false)} aria-hidden />}
      <div className={styles.area}>
        <Header usuario={usuario ?? ""} onMenu={() => setMenuAberto(true)} onSair={sair} />
        <main className={styles.main}><Outlet /></main>
        <Footer />
      </div>
    </div>
  );
}
