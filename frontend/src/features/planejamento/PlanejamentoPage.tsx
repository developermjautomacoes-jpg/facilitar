import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanejamentoResumo } from "@/types";
import { Button, ConfirmDialog, Input, Loading, Notice, PageHeader, useToast } from "@/components/ui";
import { dataHora } from "@/lib/format";
import { CHAVES, gravarLocal, lerJson, removerLocal } from "@/lib/storage";
import { excluirPlanejamento, lerPlanejamento, listarPlanejamentos, obterSimulador, salvarPlanejamento } from "@/services/planejamentoService";
import { PlanejamentosSalvosModal } from "./components/PlanejamentosSalvosModal";
import styles from "./PlanejamentoPage.module.css";

/**
 * Planejamento tributário: o simulador (página entregue pelo api.php) roda num iframe da mesma origem
 * e guarda o estado no localStorage; esta tela salva, abre e exclui esse estado no servidor.
 */
export function PlanejamentoPage() {
  const avisar = useToast();
  const quadro = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState("");
  const [versao, setVersao] = useState(0); // força recarregar o simulador
  const [erro, setErro] = useState("");
  const [cliente, setCliente] = useState("");
  const [atual, setAtual] = useState<PlanejamentoResumo | null>(null);
  const [sujo, setSujo] = useState(false);
  const [lista, setLista] = useState<PlanejamentoResumo[]>([]);
  const [listaAberta, setListaAberta] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState<{ tipo: "novo" | "abrir" | "excluir"; id?: string; p?: PlanejamentoResumo } | null>(null);

  const carregarLista = useCallback(async () => {
    try { setLista(await listarPlanejamentos()); } catch (e) { avisar(e instanceof Error ? e.message : "Erro ao listar.", "erro"); }
  }, [avisar]);

  useEffect(() => {
    obterSimulador().then(setHtml).catch((e: Error) => setErro(e.message));
    void carregarLista();
  }, [carregarLista]);

  // o simulador grava no localStorage a cada alteração; o evento chega aqui por ser outro documento da mesma origem
  useEffect(() => {
    const ouvir = (e: StorageEvent) => { if (e.key === CHAVES.planejamento) setSujo(true); };
    window.addEventListener("storage", ouvir);
    return () => window.removeEventListener("storage", ouvir);
  }, []);

  function resumoAtual(): string {
    try {
      const doc = quadro.current?.contentWindow?.document;
      const ey = doc?.querySelector("#ptRes .eyebrow")?.textContent ?? "";
      const h = doc?.querySelector("#ptRes h3")?.textContent ?? "";
      return `${ey ? `${ey}: ` : ""}${h}`.slice(0, 400);
    } catch { return ""; }
  }

  async function salvar(comoNovo: boolean) {
    if (!cliente.trim()) { avisar("Informe o cliente / nome do planejamento.", "erro"); return; }
    const estado = lerJson<Record<string, unknown>>(CHAVES.planejamento);
    if (!estado) { avisar("Preencha o planejamento antes de salvar.", "erro"); return; }
    setSalvando(true);
    try {
      const p = await salvarPlanejamento({ id: comoNovo || !atual ? null : atual.id, cliente: cliente.trim(), resumo: resumoAtual(), estado });
      setAtual(p); setSujo(false); avisar("Planejamento salvo.", "sucesso"); void carregarLista();
    } catch (e) { avisar(e instanceof Error ? e.message : "Não foi possível salvar.", "erro"); }
    finally { setSalvando(false); }
  }

  async function abrir(id: string) {
    try {
      const p = await lerPlanejamento(id);
      gravarLocal(CHAVES.planejamento, JSON.stringify(p.estado));
      setAtual(p); setCliente(p.cliente); setSujo(false); setListaAberta(false); setVersao((v) => v + 1);
    } catch (e) { avisar(e instanceof Error ? e.message : "Não foi possível abrir.", "erro"); }
  }

  function novo() {
    removerLocal(CHAVES.planejamento);
    setAtual(null); setCliente(""); setSujo(false); setVersao((v) => v + 1);
  }

  async function excluir(p: PlanejamentoResumo) {
    try {
      await excluirPlanejamento(p.id);
      if (atual?.id === p.id) setAtual(null);
      avisar("Planejamento excluído.", "sucesso"); void carregarLista();
    } catch (e) { avisar(e instanceof Error ? e.message : "Não foi possível excluir.", "erro"); }
  }

  function executarConfirmado() {
    if (!confirmar) return;
    if (confirmar.tipo === "novo") novo();
    if (confirmar.tipo === "abrir" && confirmar.id) void abrir(confirmar.id);
    if (confirmar.tipo === "excluir" && confirmar.p) void excluir(confirmar.p);
    setConfirmar(null);
  }

  const status = atual
    ? `${sujo ? "Alterações não salvas · " : ""}Editando "${atual.cliente}" · salvo em ${dataHora(atual.atualizadoEm)}${atual.atualizadoPor ? ` por ${atual.atualizadoPor}` : ""}`
    : "Planejamento novo, ainda não salvo.";

  return (
    <div className={styles.pagina}>
      <PageHeader titulo="Planejamento tributário" descricao="Simples Nacional × Lucro Presumido × Lucro Real, com a transição da reforma tributária (CBS e IBS). Salve cada planejamento no servidor para abrir e editar depois." />
      <div className={styles.barra}>
        <Input rotulo="Cliente / nome do planejamento" placeholder="Ex.: Empresa X — abertura de 3ª empresa" value={cliente}
          onChange={(e) => { setCliente(e.target.value); if (atual) setSujo(true); }} className={styles.nome} maxLength={120} />
        <div className={styles.acoes}>
          <Button variante="primary" carregando={salvando} onClick={() => salvar(false)}>Salvar</Button>
          <Button onClick={() => salvar(true)}>Salvar como novo</Button>
          <Button onClick={() => (sujo ? setConfirmar({ tipo: "novo" }) : novo())}>Novo</Button>
          <Button variante="gold" onClick={() => { setListaAberta(true); void carregarLista(); }}>Planejamentos salvos ({lista.length})</Button>
        </div>
        <p className={[styles.status, sujo ? styles.sujo : ""].join(" ")}>{status}</p>
      </div>
      {erro ? <Notice tom="erro">Não foi possível abrir o simulador: {erro}</Notice> : !html ? <Loading texto="Carregando o simulador…" /> : (
        <iframe key={versao} ref={quadro} className={styles.quadro} srcDoc={html} title="Simulador de planejamento tributário" />
      )}
      <PlanejamentosSalvosModal aberto={listaAberta} lista={lista} atualId={atual?.id ?? null} onFechar={() => setListaAberta(false)}
        onAbrir={(id) => (sujo ? setConfirmar({ tipo: "abrir", id }) : void abrir(id))} onExcluir={(p) => setConfirmar({ tipo: "excluir", p })} />
      <ConfirmDialog aberto={!!confirmar} perigo={confirmar?.tipo === "excluir"}
        titulo={confirmar?.tipo === "excluir" ? "Excluir planejamento" : "Alterações não salvas"}
        confirmar={confirmar?.tipo === "excluir" ? "Excluir" : "Continuar sem salvar"}
        onConfirmar={executarConfirmado} onCancelar={() => setConfirmar(null)}>
        <p>{confirmar?.tipo === "excluir" ? `Excluir o planejamento "${confirmar.p?.cliente}"? Essa ação não pode ser desfeita.` : "Há alterações não salvas no planejamento aberto. Deseja continuar mesmo assim?"}</p>
      </ConfirmDialog>
    </div>
  );
}
