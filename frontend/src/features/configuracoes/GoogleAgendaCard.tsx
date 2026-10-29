import { useEffect, useState } from "react";
import type { ConfigAgenda } from "@/types";
import { Badge, Button, Card, ConfirmDialog, Input, Loading } from "@/components/ui";
import { dataHora } from "@/lib/format";
import { configAgenda, desconectarAgenda, salvarConfigAgenda } from "@/services/agendaService";
import styles from "./CertificadosPage.module.css";

/** Agenda padrão do escritório (a agenda principal de uma conta Gmail tem como ID o próprio e-mail). */
const AGENDA_PADRAO = "moniquefacilitar@gmail.com";

export function GoogleAgendaCard({ avisar }: { avisar: (m: string, t?: "sucesso" | "erro") => void }) {
  const [cfg, setCfg] = useState<ConfigAgenda | null>(null);
  const [agenda, setAgenda] = useState(AGENDA_PADRAO);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [desconectar, setDesconectar] = useState(false);

  useEffect(() => {
    configAgenda().then((c) => { setCfg(c); if (c.agenda) setAgenda(c.agenda); }).catch(() => setCfg({ configurado: false }));
  }, []);

  async function salvar() {
    if (!cfg?.configurado && !arquivo) { avisar("Escolha o arquivo JSON da chave da conta de serviço.", "erro"); return; }
    if (!agenda.trim()) { avisar("Informe o ID da agenda.", "erro"); return; }
    setSalvando(true);
    try {
      const chave = arquivo ? await arquivo.text() : null;
      const c = await salvarConfigAgenda(chave, agenda.trim());
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

  if (!cfg) return <Card titulo="Google Agenda"><Loading /></Card>;
  const formulario = !cfg.configurado || editando;
  return (
    <Card titulo="Google Agenda" descricao="Agenda do escritório usada na página Agenda. O que é marcado no sistema aparece no Google Agenda e vice-versa.">
      <div className={styles.form}>
        {cfg.configurado && (
          <div className={styles.info}>
            <div><Badge tom="sucesso">conectado</Badge> <b>{cfg.nomeAgenda || cfg.agenda}</b></div>
            <small>Agenda: {cfg.agenda}</small>
            <small>Conta de serviço: <code>{cfg.contaServico}</code></small>
            {cfg.atualizadoEm && <small>Configurado em {dataHora(cfg.atualizadoEm)}{cfg.atualizadoPor ? ` por ${cfg.atualizadoPor}` : ""}</small>}
          </div>
        )}
        {formulario ? (
          <>
            <Input key={inputKey} rotulo={cfg.configurado ? "Nova chave JSON (opcional)" : "Chave da conta de serviço (.json)"} type="file" accept=".json,application/json"
              dica="Criada no Google Cloud (conta de serviço → Chaves → Adicionar chave → JSON)." onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            <Input rotulo="ID da agenda" value={agenda} onChange={(e) => setAgenda(e.target.value)}
              dica="Na agenda principal de um Gmail, é o próprio e-mail. Compartilhe essa agenda com o e-mail da conta de serviço, com a permissão “Fazer alterações nos eventos”." />
            <div className={styles.acoes}>
              {editando && <Button onClick={() => setEditando(false)}>Cancelar</Button>}
              <Button variante="primary" carregando={salvando} onClick={salvar}>{cfg.configurado ? "Salvar" : "Conectar agenda"}</Button>
            </div>
          </>
        ) : (
          <div className={styles.acoes}>
            <Button onClick={() => setEditando(true)}>Alterar</Button>
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
