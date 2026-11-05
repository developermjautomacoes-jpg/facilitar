import { useEffect, useState, type FormEvent } from "react";
import { Button, Input, Notice } from "@/components/ui";
import { entrar, primeiroAcesso, temUsuarios, trocarSenha } from "@/services/authService";
import { useAuth } from "./AuthContext";
import styles from "./LoginPage.module.css";

function Moldura({ sub, children, onSubmit }: { sub: string; children: React.ReactNode; onSubmit: (e: FormEvent) => void }) {
  return (
    <div className={styles.tela}>
      <form className={styles.cartao} onSubmit={onSubmit}>
        <img src="./logo-facilitar.png" alt="Facilitar Serviços Contábeis" className={styles.logo} />
        <div className={styles.regua} />
        <h1 className={styles.titulo}>Sistema de gestão</h1>
        <p className={styles.sub}>{sub}</p>
        {children}
        <p className={styles.rodape}>Facilitar Serviços Contábeis · Serra/ES<br />Produzido por <b>NEEKO</b> Automação Inteligente</p>
      </form>
    </div>
  );
}

export function LoginPage() {
  const { aplicar } = useAuth();
  const [primeiro, setPrimeiro] = useState(false);
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [sistema, setSistema] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { temUsuarios().then((t) => setPrimeiro(!t)).catch(() => undefined); }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!login.trim() || !senha) { setErro("Informe usuário e senha."); return; }
    setEnviando(true); setErro("");
    try { aplicar(primeiro ? await primeiroAcesso({ senhaSistema: sistema, nome: nome.trim(), login: login.trim(), senha }) : await entrar(login.trim(), senha)); }
    catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível entrar."); }
    finally { setEnviando(false); }
  }
  return (
    <Moldura sub={primeiro ? "Primeiro acesso: crie o usuário da sócia/diretora" : "Acesso restrito à equipe Facilitar"} onSubmit={enviar}>
      {primeiro && <>
        <Input rotulo="Senha atual do sistema" type="password" autoComplete="off" value={sistema} onChange={(e) => setSistema(e.target.value)} />
        <Input rotulo="Seu nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} />
      </>}
      <Input rotulo="Usuário" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus={!primeiro} />
      <Input rotulo={primeiro ? "Nova senha (mínimo 8 caracteres)" : "Senha"} type="password" autoComplete={primeiro ? "new-password" : "current-password"} value={senha} onChange={(e) => setSenha(e.target.value)} />
      {erro && <Notice tom="erro">{erro}</Notice>}
      <Button type="submit" variante="primary" carregando={enviando}>{primeiro ? "Criar acesso" : "Entrar"}</Button>
    </Moldura>
  );
}

/** Senha provisória: só libera o sistema depois da troca. */
export function TrocarSenhaPage() {
  const { aplicar, sair } = useAuth();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  async function enviar(e: FormEvent) {
    e.preventDefault(); setEnviando(true); setErro("");
    try { aplicar(await trocarSenha(atual, nova)); }
    catch (x) { setErro(x instanceof Error ? x.message : "Não foi possível trocar."); }
    finally { setEnviando(false); }
  }
  return (
    <Moldura sub="Crie sua senha pessoal para continuar" onSubmit={enviar}>
      <Input rotulo="Senha provisória" type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} autoFocus />
      <Input rotulo="Nova senha (mínimo 8 caracteres)" type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
      {erro && <Notice tom="erro">{erro}</Notice>}
      <Button type="submit" variante="primary" carregando={enviando}>Salvar senha</Button>
      <Button type="button" onClick={sair}>Sair</Button>
    </Moldura>
  );
}
