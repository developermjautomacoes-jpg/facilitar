import { useState, type FormEvent } from "react";
import { Button, Input, Notice } from "@/components/ui";
import { useAuth } from "./AuthContext";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  const { entrar } = useAuth();
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !senha) { setErro("Informe seu nome e a senha de acesso."); return; }
    setEnviando(true); setErro("");
    try { await entrar(nome, senha); }
    catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível entrar."); }
    finally { setEnviando(false); }
  }

  return (
    <div className={styles.tela}>
      <form className={styles.cartao} onSubmit={enviar}>
        <img src="./logo-facilitar.png" alt="Facilitar Serviços Contábeis" className={styles.logo} />
        <div className={styles.regua} />
        <h1 className={styles.titulo}>Sistema de gestão</h1>
        <p className={styles.sub}>Acesso restrito à equipe Facilitar</p>
        <Input rotulo="Seu nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        <Input rotulo="Senha de acesso" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        {erro && <Notice tom="erro">{erro}</Notice>}
        <Button type="submit" variante="primary" carregando={enviando}>Entrar</Button>
        <p className={styles.rodape}>Facilitar Serviços Contábeis · Serra/ES<br />Produzido por <b>NEEKO</b> Automação Inteligente</p>
      </form>
    </div>
  );
}
