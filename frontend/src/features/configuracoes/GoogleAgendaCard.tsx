import { useCallback, useEffect, useState } from "react";
import type { ConfigAgenda } from "@/types";
import { Badge, Button, Card, ConfirmDialog, Icon, Input, Loading } from "@/components/ui";
import { dataHora } from "@/lib/format";
import { configAgenda, desconectarAgenda, enderecoRetornoGoogle, iniciarLoginGoogle, salvarConfigAgenda } from "@/services/agendaService";
import styles from "./CertificadosPage.module.css";

/** Agenda padrão do escritório (a agenda principal de uma conta Gmail tem como ID o próprio e-mail). */
const AGENDA_PADRAO = "moniquefacilitar@gmail.com";
type Forma = "oauth" | "conta";

export function GoogleAgendaCard({ avisar }: { avisar: (m: string, t?: "sucesso" | "erro") => void }) {
  const [cfg, setCfg] = useState<ConfigAgenda | null>(null);
  const [forma, setForma] = useState<Forma>("oauth");
  const [agenda, setAgenda] = useState(AGENDA_PADRAO);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [desconectar, setDesconectar] = useState(false);
  const retorno = enderecoRetornoGoogle();

  const recarregar = useCallback(() => configAgenda().then((c) => { setCfg(c); if (c.agenda && c.modo === "conta") setAgenda(c.agenda); return c; }).catch(() => { setCfg({ configurado: false }); return null; }), []);
  useEffect(() => { void recarregar(); }, [recarregar]);

  // a janela do Google avisa quando terminou (google-retorno.php → postMessage)
  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || (e.data as { tipo?: string })?.tipo !== "agenda-oauth") return;
      void recarregar().then((c) => {
        if ((e.data as { ok?: boolean }).ok && c?.modo === "oauth") { setEditando(false); setArquivo(null); setInputKey((k) => k + 1); avisar(`Google Agenda conectado: ${c.conta}`, "sucesso"); }
      });
    };
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, [recarregar, avisar]);

  async function entrarComGoogle() {
    const jaTemCliente = cfg?.configurado && cfg.modo === "oauth";
    if (!arquivo && !jaTemCliente) { avisar("Escolha o arquivo JSON do cliente OAuth baixado do Google Cloud.", "erro"); return; }
    // abre a janela já no clique (senão o navegador bloqueia o pop-up) e depois manda para o Google
    const janela = window.open("", "google-agenda", "width=520,height=680");
    setSalvando(true);
    try {
      const url = await iniciarLoginGoogle(arquivo ? await arquivo.text() : null);
      if (janela) janela.location.href = url; else window.location.href = url;
    } catch (e) {
      janela?.close();
      avisar(e instanceof Error ? e.message : "Não foi possível iniciar o login.", "erro");
    } finally { setSalvando(false); }
  }

  async function salvarConta() {
    const jaTemChave = cfg?.configurado && cfg.modo === "conta";
    if (!jaTemChave && !arquivo) { avisar("Escolha o arquivo JSON da chave da conta de serviço.", "erro"); return; }
    if (!agenda.trim()) { avisar("Informe o ID da agenda.", "erro"); return; }
    setSalvando(true);
    try {
      const c = await salvarConfigAgenda(arquivo ? await arquivo.text() : null, agenda.trim());
      setCfg(c); setArquivo(null); setInputKey((k) => k + 1); setEditando(false);
      avisar("Google Agenda conectado.", "sucesso");
    } catch (e) { avisar(e instanceof Error ? e.message : "Não foi possível conectar.", "erro"); }
    finally { setSalvando(false); }
  }
  async function remover() {
    try { await desconectarAgenda(); setCfg({ configurado: false }); avisar("Google Agenda desconectado.", "sucesso"); }
    catch (e) { avisar(e instanceof Error ? e.message : "Erro.", "erro"); }
    finally { setDesconectar(false); }
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(retorno); avisar("Endereço copiado.", "sucesso"); } catch { avisar("Selecione e copie o endereço.", "erro"); }
  }

  if (!cfg) return <Card titulo="Google Agenda"><Loading /></Card>;
  const formulario = !cfg.configurado || editando;
  const oauth = cfg.configurado && cfg.modo === "oauth";
  return (
    <Card titulo="Google Agenda" descricao="Agenda do escritório usada na página Agenda. O que é marcado no sistema aparece no Google Agenda e vice-versa.">
      <div className={styles.form}>
        {cfg.configurado && (
          <div className={styles.info}>
            <div><Badge tom="sucesso">conectado</Badge> <b>{cfg.nomeAgenda || cfg.conta || cfg.agenda}</b></div>
            {oauth
              ? <><small>Login Google: {cfg.conta}</small><small>Link do Meet e convites por e-mail: <b>disponíveis</b></small></>
              : <><small>Agenda: {cfg.agenda}</small><small>Conta de serviço: <code>{cfg.contaServico}</code></small><small>Link do Meet e convites: indisponíveis nesta forma de conexão. Use “Entrar com Google”.</small></>}
            {cfg.atualizadoEm && <small>Configurado em {dataHora(cfg.atualizadoEm)}{cfg.atualizadoPor ? ` por ${cfg.atualizadoPor}` : ""}</small>}
          </div>
        )}
        {formulario ? (
          <>
            <div className={styles.formas} role="tablist">
              <button type="button" role="tab" aria-selected={forma === "oauth"} className={forma === "oauth" ? styles.formaOn : ""} onClick={() => setForma("oauth")}>Entrar com Google (recomendado)</button>
              <button type="button" role="tab" aria-selected={forma === "conta"} className={forma === "conta" ? styles.formaOn : ""} onClick={() => setForma("conta")}>Conta de serviço</button>
            </div>
            {forma === "oauth" ? (
              <>
                <p className={styles.texto}>Cria o link do Google Meet e envia convites aos participantes. Entre com a conta dona da agenda (ex.: {AGENDA_PADRAO}).</p>
                <div className={styles.copiar}>
                  <Input rotulo="URI de redirecionamento (cadastre no cliente OAuth)" value={retorno} readOnly onFocus={(e) => e.target.select()} />
                  <Button tamanho="sm" onClick={copiar}>Copiar</Button>
                </div>
                <Input key={inputKey} rotulo={oauth ? "Novo cliente OAuth .json (opcional)" : "Cliente OAuth (.json)"} type="file" accept=".json,application/json"
                  dica="Google Cloud → Credenciais → ID do cliente OAuth (Aplicativo da Web) → Fazer download do JSON." onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                <div className={styles.acoes}>
                  {editando && <Button onClick={() => setEditando(false)}>Cancelar</Button>}
                  <Button variante="primary" icone={<Icon nome="google" />} carregando={salvando} onClick={entrarComGoogle}>Entrar com Google</Button>
                </div>
              </>
            ) : (
              <>
                <Input key={inputKey} rotulo={cfg.configurado && cfg.modo === "conta" ? "Nova chave JSON (opcional)" : "Chave da conta de serviço (.json)"} type="file" accept=".json,application/json"
                  dica="Google Cloud → conta de serviço → Chaves → Adicionar chave → JSON." onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                <Input rotulo="ID da agenda" value={agenda} onChange={(e) => setAgenda(e.target.value)}
                  dica="Compartilhe a agenda com o e-mail da conta de serviço, com a permissão “Fazer alterações nos eventos”." />
                <div className={styles.acoes}>
                  {editando && <Button onClick={() => setEditando(false)}>Cancelar</Button>}
                  <Button variante="primary" carregando={salvando} onClick={salvarConta}>{cfg.configurado && cfg.modo === "conta" ? "Salvar" : "Conectar agenda"}</Button>
                </div>
              </>
            )}
          </>
        ) : (
          <div className={styles.acoes}>
            {!oauth && <Button variante="primary" icone={<Icon nome="google" />} onClick={() => { setForma("oauth"); setEditando(true); }}>Ativar Meet e convites</Button>}
            <Button onClick={() => { setForma(oauth ? "oauth" : "conta"); setEditando(true); }}>Alterar</Button>
            <Button variante="danger" onClick={() => setDesconectar(true)}>Desconectar</Button>
          </div>
        )}
      </div>
      <ConfirmDialog aberto={desconectar} titulo="Desconectar Google Agenda" confirmar="Desconectar" perigo onConfirmar={remover} onCancelar={() => setDesconectar(false)}>
        <p>A página Agenda deixa de funcionar até conectar de novo. Nenhum compromisso é apagado do Google Agenda.</p>
      </ConfirmDialog>
    </Card>
  );
}
