import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Memorando, SaidaCliente } from "@/types";
import { Button, ConfirmDialog, EmptyState, Icon, Input, Loading, Notice, PageHeader, Select, useToast } from "@/components/ui";
import { dataBr, digitos, numeroMemorando } from "@/lib/format";
import { clienteInativo, memorandoAtivo, textoBusca } from "@/lib/memorando";
import { alterarStatus, excluirMemorando, reativarCliente, registrarSaida } from "@/services/memorandosService";
import { MemorandoItem, type AcaoMemorando } from "./components/MemorandoItem";
import { SaidaClienteModal } from "./components/SaidaClienteModal";
import { useMemorandos } from "./MemorandosContext";
import styles from "./ArquivoPage.module.css";

type Filtro = "ativos" | "inativos" | "cancelado" | "";
type Confirmacao = { tipo: "excluir" | "cancelar" | "reativar" | "voltou"; d: Memorando } | null;

export function ArquivoPage() {
  const { memorandos, carregando, erro, recarregar } = useMemorandos();
  const avisar = useToast();
  const navegar = useNavigate();
  const [busca, setBusca] = useState("");
  const [ano, setAno] = useState("");
  const [situacao, setSituacao] = useState<Filtro>("ativos");
  const [confirmacao, setConfirmacao] = useState<Confirmacao>(null);
  const [saida, setSaida] = useState<Memorando | null>(null);
  const [salvando, setSalvando] = useState(false);

  const anos = useMemo(() => [...new Set(memorandos.map((d) => d.ano))].sort((a, b) => b - a), [memorandos]);
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase(), qd = digitos(q);
    return memorandos.filter((d) => {
      if (ano && String(d.ano) !== ano) return false;
      if (situacao === "ativos" && !memorandoAtivo(d)) return false;
      if (situacao === "inativos" && !clienteInativo(d)) return false;
      if (situacao === "cancelado" && d.status !== "cancelado") return false;
      if (!q) return true;
      const t = textoBusca(d);
      return q.split(/\s+/).every((w) => t.includes(w)) || (qd.length >= 4 && t.includes(qd));
    });
  }, [memorandos, busca, ano, situacao]);

  async function executar(fn: () => Promise<void>, ok: string) {
    setSalvando(true);
    try { await fn(); avisar(ok, "sucesso"); await recarregar(); }
    catch (e) { avisar(e instanceof Error ? e.message : "Não foi possível concluir.", "erro"); }
    finally { setSalvando(false); setConfirmacao(null); setSaida(null); }
  }

  function aoAcionar(acao: AcaoMemorando, d: Memorando) {
    if (acao === "ver" || acao === "editar" || acao === "pdf" || acao === "docx") { navegar(`/memorandos/${d._id}/${acao}`); return; }
    if (acao === "saida") { setSaida(d); return; }
    setConfirmacao({ tipo: acao, d });
  }

  function confirmar() {
    if (!confirmacao) return;
    const { tipo, d } = confirmacao, n = numeroMemorando(d.seq, d.ano);
    if (tipo === "excluir") void executar(() => excluirMemorando(d._id), `Memorando Nº ${n} excluído.`);
    if (tipo === "cancelar") void executar(() => alterarStatus(d._id, "cancelado"), "Memorando cancelado. O número continua reservado.");
    if (tipo === "reativar") void executar(() => alterarStatus(d._id, "ativo"), "Memorando reativado.");
    if (tipo === "voltou") void executar(() => reativarCliente(d._id), "Cliente reativado.");
  }
  const registrar = (s: SaidaCliente) => saida && void executar(() => registrarSaida(saida._id, s), `Saída registrada em ${dataBr(s.dataSaida)}. O cliente passa a contar como inativo.`);

  const textos = confirmacao && {
    excluir: { t: "Excluir memorando", b: "Excluir", c: "O número fica livre para outro memorando. Uma cópia vai para a lixeira do servidor." },
    cancelar: { t: "Cancelar memorando", b: "Cancelar memorando", c: "O memorando deixa de contar no painel, mas o número continua reservado." },
    reativar: { t: "Reativar memorando", b: "Reativar", c: "O memorando volta a contar como ativo." },
    voltou: { t: "Cliente voltou", b: "Reativar cliente", c: "A saída registrada é apagada e o cliente volta a contar como ativo." },
  }[confirmacao.tipo];

  return (
    <>
      <PageHeader titulo="Arquivo de memorandos" descricao="Pesquise, visualize, edite e acompanhe a situação de cada cliente."
        acoes={<Button variante="primary" icone={<Icon nome="mais" />} onClick={() => navegar("/memorandos/novo")}>Novo memorando</Button>} />
      <div className={styles.filtros}>
        <Input rotulo="Pesquisar" type="search" placeholder="Número, empresa, fantasia, CNPJ, regime ou responsável" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select rotulo="Ano" value={ano} onChange={(e) => setAno(e.target.value)}>
          <option value="">Todos</option>
          {anos.map((a) => <option key={a}>{a}</option>)}
        </Select>
        <Select rotulo="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value as Filtro)}>
          <option value="ativos">Clientes ativos</option>
          <option value="inativos">Clientes que saíram</option>
          <option value="cancelado">Memorandos cancelados</option>
          <option value="">Todos</option>
        </Select>
      </div>
      {erro && <Notice tom="erro">Não foi possível carregar o arquivo: {erro}</Notice>}
      {carregando ? <Loading /> : !memorandos.length ? (
        <EmptyState titulo="Nenhum memorando salvo ainda" acao={<Button variante="primary" onClick={() => navegar("/memorandos/novo")}>Criar o primeiro memorando</Button>}>
          O primeiro memorando salvo recebe o número 01 do ano e aparece aqui.
        </EmptyState>
      ) : !lista.length ? (
        <EmptyState titulo="Nada encontrado">Nenhum memorando para essa pesquisa ou filtro.</EmptyState>
      ) : (
        <>
          <p className={styles.contagem}>{lista.length} de {memorandos.length} memorandos</p>
          <div className={styles.lista}>{lista.map((d) => <MemorandoItem key={d._id} memorando={d} onAcao={aoAcionar} />)}</div>
        </>
      )}
      <ConfirmDialog aberto={!!confirmacao} titulo={textos ? `${textos.t} · Nº ${numeroMemorando(confirmacao!.d.seq, confirmacao!.d.ano)}` : ""}
        confirmar={textos?.b ?? ""} perigo={confirmacao?.tipo === "excluir" || confirmacao?.tipo === "cancelar"} carregando={salvando}
        onConfirmar={confirmar} onCancelar={() => setConfirmacao(null)}>
        <p><b>{confirmacao?.d.e_razao}</b></p><p>{textos?.c}</p>
      </ConfirmDialog>
      <SaidaClienteModal memorando={saida} salvando={salvando} onCancelar={() => setSaida(null)} onConfirmar={registrar} />
    </>
  );
}
