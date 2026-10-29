import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Compromisso, CompromissoEntrada, TipoCompromisso } from "@/types";
import { Button, ConfirmDialog, EmptyState, Icon, Loading, Notice, PageHeader, useToast } from "@/components/ui";
import { useColaboradores } from "@/features/colaboradores/useColaboradores";
import { DIAS_SEMANA, diasDoCompromisso, gradeDoMes, horaDe, horaFim, ordenar, rotuloTipo, somarDias, TIPOS } from "@/lib/agenda";
import { MESES } from "@/lib/constantes";
import { dataBr, hojeISO } from "@/lib/format";
import { ApiError } from "@/services/http";
import { excluirCompromisso, listarCompromissos, salvarCompromisso } from "@/services/agendaService";
import { CompromissoModal } from "./components/CompromissoModal";
import styles from "./AgendaPage.module.css";

type Visao = "mes" | "lista";
const LER_VISAO = (): Visao => { try { return localStorage.getItem("agenda-visao") === "lista" ? "lista" : "mes"; } catch { return "mes"; } };

export function AgendaPage() {
  const avisar = useToast();
  const { colaboradores } = useColaboradores();
  const hoje = hojeISO();
  const [ref, setRef] = useState(() => ({ ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) }));
  const [visao, setVisao] = useState<Visao>(LER_VISAO);
  const [itens, setItens] = useState<Compromisso[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [naoConfigurado, setNaoConfigurado] = useState(false);
  const [tipos, setTipos] = useState<Set<TipoCompromisso>>(new Set(["reuniao", "tarefa", "evento"]));
  const [resp, setResp] = useState("");
  const [modal, setModal] = useState<{ c: Compromisso | null; dia: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<Compromisso | null>(null);

  const grade = useMemo(() => gradeDoMes(ref.ano, ref.mes), [ref]);
  const faixa = useMemo(() => visao === "mes" ? { de: grade[0], ate: grade[41] } : { de: hoje, ate: somarDias(hoje, 60) }, [visao, grade, hoje]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setItens(await listarCompromissos(faixa.de, faixa.ate)); setErro(""); setNaoConfigurado(false); }
    catch (e) {
      if (e instanceof ApiError && e.status === 409) setNaoConfigurado(true);
      else setErro(e instanceof Error ? e.message : "Erro ao carregar a agenda.");
    } finally { setCarregando(false); }
  }, [faixa]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { try { localStorage.setItem("agenda-visao", visao); } catch { /* sem armazenamento */ } }, [visao]);

  const visiveis = useMemo(() => itens.filter((c) => tipos.has(c.tipo) && (!resp || c.responsavelId === resp)).sort(ordenar), [itens, tipos, resp]);
  const porDia = useMemo(() => {
    const m = new Map<string, Compromisso[]>();
    visiveis.forEach((c) => diasDoCompromisso(c).forEach((d) => { if (!m.has(d)) m.set(d, []); m.get(d)!.push(c); }));
    return m;
  }, [visiveis]);

  function mover(n: number) {
    setRef((r) => { const d = new Date(r.ano, r.mes - 1 + n, 1); return { ano: d.getFullYear(), mes: d.getMonth() + 1 }; });
  }
  function irHoje() { setRef({ ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) }); }
  function alternarTipo(t: TipoCompromisso) {
    setTipos((s) => { const n = new Set(s); if (n.has(t)) { if (n.size > 1) n.delete(t); } else n.add(t); return n; });
  }

  async function salvar(e: CompromissoEntrada) {
    setSalvando(true);
    try {
      const salvo = await salvarCompromisso(e);
      setItens((l) => [...l.filter((x) => x.id !== salvo.id), salvo]);
      setModal(null);
      avisar(e.id ? "Compromisso atualizado no Google Agenda." : "Compromisso criado no Google Agenda.", "sucesso");
    } catch (err) { avisar(err instanceof Error ? err.message : "Não foi possível salvar.", "erro"); }
    finally { setSalvando(false); }
  }
  async function concluir(c: Compromisso, v: boolean) {
    setItens((l) => l.map((x) => (x.id === c.id ? { ...x, concluida: v } : x)));
    try {
      const salvo = await salvarCompromisso({ id: c.id, tipo: c.tipo, titulo: c.titulo, descricao: c.descricao, local: c.local, diaInteiro: c.diaInteiro,
        inicio: c.diaInteiro ? c.inicio.slice(0, 10) : c.inicio.slice(0, 16), fim: c.diaInteiro ? somarDias(c.fim.slice(0, 10), -1) : c.fim.slice(0, 16),
        concluida: v, responsavelId: c.responsavelId, responsavel: c.responsavel, criadoPor: c.criadoPor });
      setItens((l) => l.map((x) => (x.id === salvo.id ? salvo : x)));
    } catch (err) {
      setItens((l) => l.map((x) => (x.id === c.id ? { ...x, concluida: !v } : x)));
      avisar(err instanceof Error ? err.message : "Não foi possível atualizar.", "erro");
    }
  }
  async function excluir() {
    if (!excluindo) return;
    try { await excluirCompromisso(excluindo.id); setItens((l) => l.filter((x) => x.id !== excluindo.id)); setModal(null); avisar("Compromisso excluído.", "sucesso"); }
    catch (err) { avisar(err instanceof Error ? err.message : "Não foi possível excluir.", "erro"); }
    finally { setExcluindo(null); }
  }

  const chip = (c: Compromisso, compacto: boolean) => (
    <button key={c.id} type="button" className={[styles.chip, styles[c.tipo], c.concluida ? styles.feito : "", compacto ? "" : styles.chipLongo].join(" ")}
      title={`${rotuloTipo(c.tipo)}: ${c.titulo}${c.responsavel ? ` · ${c.responsavel}` : ""}`} onClick={(ev) => { ev.stopPropagation(); setModal({ c, dia: c.inicio.slice(0, 10) }); }}>
      {horaDe(c) && <span className={styles.hora}>{horaDe(c)}</span>}<span className={styles.tit}>{c.titulo}</span>
    </button>
  );

  const titulo = `${MESES[ref.mes - 1]} de ${ref.ano}`;
  if (naoConfigurado) {
    return (
      <>
        <PageHeader titulo="Agenda do escritório" descricao="Reuniões, tarefas e eventos sincronizados com o Google Agenda." />
        <EmptyState titulo="Google Agenda ainda não conectado" acao={<Link to="/configuracoes"><Button variante="primary" icone={<Icon nome="google" />}>Conectar em Configurações</Button></Link>}>
          Para usar a agenda, conecte a agenda do escritório em Configurações → Google Agenda. Depois disso, o que for marcado aqui aparece no Google Agenda (celular e computador) e vice-versa.
        </EmptyState>
      </>
    );
  }

  const diasLista = visao === "lista" ? [...porDia.keys()].filter((d) => d >= faixa.de && d <= faixa.ate).sort() : [];
  return (
    <>
      <PageHeader titulo="Agenda do escritório" descricao="Reuniões, tarefas e eventos sincronizados com o Google Agenda."
        acoes={<Button variante="primary" icone={<Icon nome="mais" />} onClick={() => setModal({ c: null, dia: visao === "mes" && !(ref.ano === Number(hoje.slice(0, 4)) && ref.mes === Number(hoje.slice(5, 7))) ? `${ref.ano}-${String(ref.mes).padStart(2, "0")}-01` : hoje })}>Novo compromisso</Button>} />
      {erro && <Notice tom="erro">{erro}</Notice>}
      <div className={styles.barra}>
        {visao === "mes" ? (
          <div className={styles.nav}>
            <Button tamanho="sm" aria-label="Mês anterior" onClick={() => mover(-1)}>‹</Button>
            <Button tamanho="sm" onClick={irHoje}>Hoje</Button>
            <Button tamanho="sm" aria-label="Próximo mês" onClick={() => mover(1)}>›</Button>
            <h2 className={styles.mes}>{titulo}</h2>
          </div>
        ) : <h2 className={styles.mes}>Próximos 60 dias</h2>}
        <div className={styles.filtros}>
          {TIPOS.map((t) => (
            <button key={t.valor} type="button" aria-pressed={tipos.has(t.valor)} className={[styles.filtro, styles[t.valor], tipos.has(t.valor) ? styles.on : ""].join(" ")} onClick={() => alternarTipo(t.valor)}>
              <i aria-hidden />{t.plural}
            </button>
          ))}
          <select className={styles.select} value={resp} onChange={(e) => setResp(e.target.value)} aria-label="Responsável">
            <option value="">Todos os responsáveis</option>
            {colaboradores.filter((c) => c.ativo !== false).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <div className={styles.visoes} role="tablist">
            <button type="button" role="tab" aria-selected={visao === "mes"} className={visao === "mes" ? styles.ativa : ""} onClick={() => setVisao("mes")}>Mês</button>
            <button type="button" role="tab" aria-selected={visao === "lista"} className={visao === "lista" ? styles.ativa : ""} onClick={() => setVisao("lista")}>Lista</button>
          </div>
        </div>
      </div>

      {carregando && !itens.length ? <Loading /> : visao === "mes" ? (
        <div className={styles.calendario} aria-busy={carregando}>
          {DIAS_SEMANA.map((d) => <div key={d} className={styles.cab}>{d}</div>)}
          {grade.map((d) => {
            const lista = porDia.get(d) ?? [];
            const fora = Number(d.slice(5, 7)) !== ref.mes;
            return (
              <div key={d} className={[styles.dia, fora ? styles.fora : "", d === hoje ? styles.hoje : ""].join(" ")} onClick={() => setModal({ c: null, dia: d })}
                role="button" tabIndex={0} aria-label={`${dataBr(d)}: ${lista.length} compromisso(s). Criar novo`} onKeyDown={(e) => { if (e.key === "Enter") setModal({ c: null, dia: d }); }}>
                <span className={styles.num}>{Number(d.slice(8))}</span>
                {lista.slice(0, 3).map((c) => chip(c, true))}
                {lista.length > 3 && <button type="button" className={styles.mais} onClick={(e) => { e.stopPropagation(); setVisao("lista"); }}>+{lista.length - 3} mais</button>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.lista}>
          {!diasLista.length && <EmptyState titulo="Nada marcado para os próximos 60 dias">Use “Novo compromisso” para marcar uma reunião, tarefa ou evento.</EmptyState>}
          {diasLista.map((d) => {
            const dt = new Date(`${d}T12:00:00`);
            return (
              <section key={d} className={styles.grupo}>
                <h3 className={styles.data}><b>{d === hoje ? "Hoje" : d === somarDias(hoje, 1) ? "Amanhã" : DIAS_SEMANA[dt.getDay()]}</b> {dataBr(d)}</h3>
                {porDia.get(d)!.map((c) => (
                  <div key={c.id} className={[styles.linha, styles[c.tipo], c.concluida ? styles.feito : ""].join(" ")}>
                    {c.tipo === "tarefa"
                      ? <input type="checkbox" className={styles.ok} checked={c.concluida} onChange={(e) => concluir(c, e.target.checked)} aria-label={`Concluir ${c.titulo}`} />
                      : <i className={styles.ponto} aria-hidden />}
                    <span className={styles.quando}>{c.diaInteiro ? "Dia inteiro" : `${horaDe(c)}–${horaFim(c)}`}</span>
                    <button type="button" className={styles.nome} onClick={() => setModal({ c, dia: d })}>
                      <b>{c.titulo}</b>
                      <small>{[rotuloTipo(c.tipo), c.responsavel, c.local].filter(Boolean).join(" · ")}</small>
                    </button>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}

      <CompromissoModal aberto={!!modal} compromisso={modal?.c ?? null} diaInicial={modal?.dia ?? hoje} colaboradores={colaboradores}
        salvando={salvando} onSalvar={salvar} onExcluir={(c) => setExcluindo(c)} onFechar={() => setModal(null)} />
      <ConfirmDialog aberto={!!excluindo} titulo="Excluir compromisso" confirmar="Excluir" perigo onConfirmar={excluir} onCancelar={() => setExcluindo(null)}>
        <p>Excluir <b>{excluindo?.titulo}</b>? Ele também sai do Google Agenda.</p>
      </ConfirmDialog>
    </>
  );
}
