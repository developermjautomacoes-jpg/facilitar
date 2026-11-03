import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AmbienteNfse, Certificado, EmpresaNfse, FalhaNfse, NotaNfse, PapelNfse, SituacaoNfse } from "@/types";
import { Badge, Button, Card, ConfirmDialog, DataTable, Input, KpiCard, Loading, Modal, Notice, PageHeader, Select, useToast } from "@/components/ui";
import { dataBr, dataHora, formatarCnpj } from "@/lib/format";
import { baixarXmls, buscarXmls, capturarLote, diagnosticar, excluirEmpresa, listarEmpresas, listarNotas, reiniciarCaptura, salvarEmpresa, verificarEventos } from "@/services/nfseService";
import { listarCertificados } from "@/services/certificadosService";
import { ROTULO_RET_ISS, ROTULO_SITUACAO, exportarExcel, issRetido, valida } from "./nfseExcel";
import { gerarDanfsePdf, mostrarPdf } from "./nfseDanfse";
import styles from "./NfsePage.module.css";

const PAUSA_LOTES_MS = 2500;   // entre lotes: o ADN bloqueia consultas em sequência rápida (HTTP 429)
const PAUSA_NOTAS_MS = 1500;   // entre consultas de eventos por nota
const ESPERA_MAXIMA_S = 180;   // pausas maiores passam para a próxima empresa; a captura dela continua depois
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const moeda = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hoje = () => new Date().toISOString().slice(0, 10);
const tomSituacao: Record<SituacaoNfse, "sucesso" | "perigo" | "alerta"> = { normal: "sucesso", cancelada: "perigo", substituida: "perigo", em_analise: "alerta", bloqueada: "alerta" };
const ROTULO_PAPEL: Record<PapelNfse, string> = { prestador: "Prestada", tomador: "Tomada", intermediario: "Intermediada", outro: "Outra" };

interface Progresso { empresa: string; indice: number; total: number; notas: number; eventos: number; texto: string }

export function NfsePage() {
  const avisar = useToast();
  const [ambiente, setAmbiente] = useState<AmbienteNfse>("producao");
  const [empresas, setEmpresas] = useState<EmpresaNfse[]>([]);
  const [certs, setCerts] = useState<Certificado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [relatorio, setRelatorio] = useState<string[]>([]);
  const parar = useRef(false);
  const [cnpjVista, setCnpjVista] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [competencias, setCompetencias] = useState<{ competencia: string; notas: number }[]>([]);
  const [notas, setNotas] = useState<NotaNfse[]>([]);
  const [falhas, setFalhas] = useState<FalhaNfse[]>([]);
  const [papel, setPapel] = useState<PapelNfse | "">("");
  const [busca, setBusca] = useState("");
  const [baixando, setBaixando] = useState("");
  const [verificando, setVerificando] = useState("");
  const [nova, setNova] = useState<{ cnpj: string; razao: string; certId: string } | null>(null);
  const [recomecar, setRecomecar] = useState<EmpresaNfse | null>(null);
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [diagnostico, setDiagnostico] = useState<string[] | null>(null);
  const [diagnosticando, setDiagnosticando] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [e, c] = await Promise.all([listarEmpresas(ambiente), listarCertificados()]);
      setEmpresas(e); setCerts(c); setErro("");
    } catch (x) { setErro(x instanceof Error ? x.message : "Não foi possível carregar."); }
    finally { setCarregando(false); }
  }, [ambiente]);
  useEffect(() => { void carregar(); }, [carregar]);

  const carregarNotas = useCallback(async (cnpj: string, comp?: string) => {
    if (!cnpj) { setNotas([]); setCompetencias([]); setFalhas([]); setCompetencia(""); return; }
    try {
      const r = await listarNotas(ambiente, cnpj, comp);
      setSelecao(new Set());
      setNotas(r.notas); setCompetencias(r.competencias); setCompetencia(r.competencia); setFalhas(r.falhas);
    } catch (x) { avisar(x instanceof Error ? x.message : "Não foi possível listar as notas.", "erro"); }
  }, [ambiente, avisar]);
  useEffect(() => { void carregarNotas(cnpjVista); }, [cnpjVista, carregarNotas]);

  const certVencido = (e: EmpresaNfse) => !!e.certificado?.validade && e.certificado.validade < hoje();
  const aptas = useMemo(() => empresas.filter((e) => e.certificado && !certVencido(e)), [empresas]);

  function marcar(cnpj: string) {
    setMarcadas((m) => { const n = new Set(m); if (n.has(cnpj)) n.delete(cnpj); else n.add(cnpj); return n; });
  }

  async function capturar() {
    const fila = aptas.filter((e) => marcadas.has(e.cnpj));
    if (!fila.length) { avisar("Marque ao menos uma empresa com certificado válido.", "erro"); return; }
    parar.current = false; setRelatorio([]);
    const saida: string[] = [];
    for (let i = 0; i < fila.length && !parar.current; i++) {
      const e = fila[i];
      let tot = { notas: 0, eventos: 0, falhas: 0 };
      const mostrar = (texto: string) => setProgresso({ empresa: e.razao || formatarCnpj(e.cnpj), indice: i + 1, total: fila.length, notas: tot.notas, eventos: tot.eventos, texto });
      mostrar("Consultando o Ambiente Nacional…");
      let linha = "";
      while (!parar.current) {
        try {
          const p = await capturarLote(ambiente, e.cnpj);
          if (p.status === "lote" || p.status === "fim") {
            tot = { notas: tot.notas + p.notas, eventos: tot.eventos + p.eventos, falhas: tot.falhas + p.falhas };
            if (p.status === "fim") { linha = `${e.razao}: ${tot.notas} nota(s) nova(s), ${tot.eventos} evento(s)${tot.falhas ? `, ${tot.falhas} com falha` : ""}.`; break; }
            mostrar(`Lote recebido (NSU ${p.ultimoNsu}).`);
            await dormir(PAUSA_LOTES_MS);
          } else if (p.status === "aguardar") {
            if (p.segundos > ESPERA_MAXIMA_S) { linha = `${e.razao}: pausada por ${Math.ceil(p.segundos / 60)} min pelo ADN. Capture de novo depois; continua de onde parou.`; break; }
            for (let s = p.segundos; s > 0 && !parar.current; s--) { mostrar(`${p.mensagem} Nova tentativa em ${s}s.`); await dormir(1000); }
          } else if (p.status === "erro") { linha = `${e.razao}: ${p.mensagem}`; break; }
        } catch (x) { linha = `${e.razao}: ${x instanceof Error ? x.message : "erro na captura."}`; break; }
      }
      if (parar.current && !linha) linha = `${e.razao}: interrompida; continua de onde parou.`;
      saida.push(linha); setRelatorio([...saida]);
      if (i < fila.length - 1) await dormir(PAUSA_LOTES_MS);
    }
    setProgresso(null);
    await carregar();
    if (cnpjVista) await carregarNotas(cnpjVista, competencia || undefined);
  }

  /** Consulta os eventos nota a nota: garante cancelamentos mesmo que o evento não tenha vindo na fila por NSU. */
  async function verificar() {
    parar.current = false;
    const alvo = notas.filter(valida);
    let achados = 0;
    for (let i = 0; i < alvo.length && !parar.current; i++) {
      setVerificando(`${i + 1} de ${alvo.length}`);
      try {
        const r = await verificarEventos(ambiente, cnpjVista, alvo[i].chave);
        if (r.status === "erro") { avisar(r.mensagem, "erro"); break; }
        if (r.status === "aguardar") { if (r.segundos > ESPERA_MAXIMA_S) { avisar("O ADN pediu uma pausa longa. Tente mais tarde.", "erro"); break; } await dormir(r.segundos * 1000); i--; continue; }
        if (r.situacao !== "normal") achados++;
      } catch (x) { avisar(x instanceof Error ? x.message : "Erro ao verificar.", "erro"); break; }
      await dormir(PAUSA_NOTAS_MS);
    }
    setVerificando("");
    avisar(`Verificação concluída: ${achados} nota(s) com alteração de situação.`, "sucesso");
    await carregarNotas(cnpjVista, competencia);
  }

  async function rodarDiagnostico(cnpj: string) {
    setDiagnosticando(cnpj);
    try { setDiagnostico(await diagnosticar(ambiente, cnpj)); }
    catch (x) { avisar(x instanceof Error ? x.message : "Não foi possível diagnosticar.", "erro"); }
    finally { setDiagnosticando(""); }
  }

  async function salvarNova() {
    if (!nova) return;
    try { setEmpresas(await salvarEmpresa(ambiente, nova)); setNova(null); avisar("Empresa incluída.", "sucesso"); }
    catch (x) { avisar(x instanceof Error ? x.message : "Não foi possível salvar.", "erro"); }
  }
  async function confirmarRecomeco() {
    if (!recomecar) return;
    try { setEmpresas(await reiniciarCaptura(ambiente, recomecar.cnpj)); avisar("A próxima captura começa do início.", "sucesso"); }
    catch (x) { avisar(x instanceof Error ? x.message : "Erro.", "erro"); }
    finally { setRecomecar(null); }
  }
  async function baixar(tipo: "xml" | "excel") {
    const empresa = empresas.find((e) => e.cnpj === cnpjVista);
    setBaixando(tipo);
    try {
      if (tipo === "xml") await baixarXmls(ambiente, cnpjVista, competencia, selecao.size ? [...selecao] : undefined);
      else await exportarExcel(empresa?.razao ?? "", formatarCnpj(cnpjVista), competencia, selecao.size ? notas.filter((n) => selecao.has(n.chave)) : notas, selecao.size > 0);
    } catch (x) { avisar(x instanceof Error ? x.message : "Não foi possível gerar o arquivo.", "erro"); }
    finally { setBaixando(""); }
  }
  async function abrirDanfse(chaves: string[]) {
    const aba = window.open("", "_blank");
    setBaixando("danfse");
    try {
      const bytes = await gerarDanfsePdf(await buscarXmls(ambiente, cnpjVista, chaves));
      mostrarPdf(bytes, aba, `DANFSe-${cnpjVista}-${competencia}.pdf`);
    } catch (x) { aba?.close(); avisar(x instanceof Error ? x.message : "Não foi possível gerar o DANFSe.", "erro"); }
    finally { setBaixando(""); }
  }
  function alternarNota(chave: string) {
    setSelecao((m) => { const n = new Set(m); if (n.has(chave)) n.delete(chave); else n.add(chave); return n; });
  }

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return notas.filter((n) => (!papel || n.papel === papel) && (!q || `${n.numero} ${n.prest_nome} ${n.toma_nome} ${n.prest_doc} ${n.toma_doc} ${n.chave}`.toLowerCase().includes(q)));
  }, [notas, papel, busca]);
  const soma = (l: NotaNfse[], f: (n: NotaNfse) => number) => l.filter(valida).reduce((s, n) => s + f(n), 0);
  const prestadas = notas.filter((n) => n.papel === "prestador");
  const tomadas = notas.filter((n) => n.papel === "tomador");
  const naoValidas = notas.filter((n) => !valida(n)).length;
  const ocupado = !!progresso || !!verificando;
  const todasVisiveis = visiveis.length > 0 && visiveis.every((n) => selecao.has(n.chave));
  function alternarTodas() {
    setSelecao((m) => { const n = new Set(m); visiveis.forEach((v) => { if (todasVisiveis) n.delete(v.chave); else n.add(v.chave); }); return n; });
  }
  const alvo = selecao.size ? `${selecao.size} selecionada(s)` : "todas";

  return (
    <>
      <PageHeader titulo="Captura de NFS-e" descricao="Baixa do Ambiente de Dados Nacional as notas prestadas e tomadas de cada empresa, usando o certificado cadastrado em Configurações."
        acoes={<Select rotulo="Ambiente" value={ambiente} disabled={ocupado} onChange={(e) => { setAmbiente(e.target.value as AmbienteNfse); setCnpjVista(""); setMarcadas(new Set()); }}>
          <option value="producao">Produção</option><option value="restrita">Produção restrita (testes)</option></Select>} />
      {erro && <Notice tom="erro">{erro}</Notice>}
      {ambiente === "restrita" && <Notice tom="alerta">Produção restrita: as notas deste ambiente não têm validade fiscal e ficam separadas das de produção.</Notice>}

      <Card titulo="Empresas" descricao="Vêm dos memorandos ativos e dos certificados. Cada empresa precisa de um e-CNPJ com a mesma raiz; assim, matriz e filiais usam o mesmo certificado." semPadding>
        <div className={styles.barra}>
          <Button tamanho="sm" onClick={() => setMarcadas(new Set(aptas.map((e) => e.cnpj)))} disabled={ocupado || !aptas.length}>Marcar todas aptas</Button>
          <Button tamanho="sm" onClick={() => setMarcadas(new Set())} disabled={ocupado}>Limpar</Button>
          <Button tamanho="sm" onClick={() => setNova({ cnpj: "", razao: "", certId: "" })} disabled={ocupado}>Incluir CNPJ</Button>
          <span className={styles.espaco} />
          {progresso
            ? <Button variante="danger" onClick={() => { parar.current = true; }}>Interromper</Button>
            : <Button variante="primary" onClick={capturar} disabled={!marcadas.size || !!verificando}>Capturar selecionadas ({marcadas.size})</Button>}
        </div>
        {progresso && (
          <div className={styles.progresso} role="status">
            <b>{progresso.empresa}</b> · empresa {progresso.indice} de {progresso.total} · {progresso.notas} nota(s) e {progresso.eventos} evento(s) nesta captura
            <small>{progresso.texto} Pode continuar usando o sistema em outra aba; mantenha esta aberta.</small>
          </div>
        )}
        {relatorio.length > 0 && <ul className={styles.relatorio}>{relatorio.map((l) => <li key={l}>{l}</li>)}</ul>}
        {carregando ? <Loading /> : (
          <DataTable linhas={empresas} chaveLinha={(e) => e.cnpj} vazio="Nenhuma empresa. Importe um certificado em Configurações ou inclua um CNPJ."
            colunas={[
              { chave: "sel", titulo: "", largura: "36px", render: (e) => <input type="checkbox" aria-label={`Selecionar ${e.razao}`} checked={marcadas.has(e.cnpj)} disabled={ocupado || !e.certificado || certVencido(e)} onChange={() => marcar(e.cnpj)} /> },
              { chave: "emp", titulo: "Empresa", render: (e) => <><b>{e.razao || "(sem nome)"}</b><br /><small>{formatarCnpj(e.cnpj)}</small></> },
              { chave: "cert", titulo: "Certificado", render: (e) => !e.certificado ? <Badge tom="alerta">sem certificado</Badge> : certVencido(e) ? <Badge tom="perigo">vencido em {dataBr(e.certificado.validade)}</Badge> : <>{e.certificado.nome}<br /><small>até {dataBr(e.certificado.validade)}</small></> },
              { chave: "cap", titulo: "Última captura", render: (e) => e.ultimoErro ? <span className={styles.erro}>{e.ultimoErro}</span> : e.ultimaCaptura ? <>{dataHora(e.ultimaCaptura)}<br /><small>NSU {e.ultimoNsu}</small></> : "Nunca" },
              { chave: "not", titulo: "Notas", alinhar: "direita", render: (e) => <>{e.notas}{e.falhas > 0 && <><br /><Badge tom="perigo">{e.falhas} com falha</Badge></>}</> },
              { chave: "ac", titulo: "", alinhar: "direita", render: (e) => (
                <div className={styles.acoes}>
                  <Button tamanho="sm" disabled={!e.notas} onClick={() => setCnpjVista(e.cnpj)}>Ver notas</Button>
                  <Button tamanho="sm" disabled={ocupado || !e.certificado} carregando={diagnosticando === e.cnpj} onClick={() => rodarDiagnostico(e.cnpj)}>Diagnosticar</Button>
                  <Button tamanho="sm" disabled={ocupado || e.ultimoNsu === 0} onClick={() => setRecomecar(e)}>Recomeçar</Button>
                  {e.manual && <Button tamanho="sm" variante="danger" disabled={ocupado} onClick={() => { void excluirEmpresa(ambiente, e.cnpj).then(setEmpresas); }}>Tirar</Button>}
                </div>
              ) },
            ]} />
        )}
      </Card>

      <div className={styles.notas}>
        <Card titulo="Notas capturadas" descricao="Totais sem canceladas e substituídas.">
          <div className={styles.filtros}>
            <Select rotulo="Empresa" value={cnpjVista} onChange={(e) => setCnpjVista(e.target.value)}>
              <option value="">Escolha…</option>
              {empresas.filter((e) => e.notas > 0).map((e) => <option key={e.cnpj} value={e.cnpj}>{e.razao || formatarCnpj(e.cnpj)}</option>)}
            </Select>
            <Select rotulo="Competência" value={competencia} disabled={!competencias.length} onChange={(e) => void carregarNotas(cnpjVista, e.target.value)}>
              {competencias.map((c) => <option key={c.competencia} value={c.competencia}>{c.competencia.split("-").reverse().join("/")} ({c.notas})</option>)}
            </Select>
            <Select rotulo="Tipo" value={papel} onChange={(e) => setPapel(e.target.value as PapelNfse | "")}>
              <option value="">Todas</option><option value="prestador">Prestadas</option><option value="tomador">Tomadas</option><option value="intermediario">Intermediadas</option>
            </Select>
            <Input rotulo="Buscar" placeholder="Número, nome ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          {falhas.length > 0 && <Notice tom="erro">{falhas.length} documento(s) não puderam ser lidos: {falhas.slice(0, 3).map((f) => `NSU ${f.nsu} (${f.motivo})`).join("; ")}{falhas.length > 3 ? "…" : ""} Use “Recomeçar” para tentar de novo.</Notice>}
          {notas.length > 0 && <>
            <div className={styles.kpis}>
              <KpiCard rotulo="Prestadas" valor={moeda(soma(prestadas, (n) => n.v_serv))} detalhe={`${prestadas.filter(valida).length} nota(s)`} />
              <KpiCard rotulo="Tomadas" valor={moeda(soma(tomadas, (n) => n.v_serv))} detalhe={`${tomadas.filter(valida).length} nota(s)`} />
              <KpiCard rotulo="ISS retido nas tomadas" valor={moeda(soma(tomadas, issRetido))} detalhe="tpRetISSQN 2 ou 3" />
              <KpiCard rotulo="Fora dos totais" valor={naoValidas} detalhe="canceladas e substituídas" />
            </div>
            <div className={styles.barra}>
              <Button tamanho="sm" variante="primary" carregando={baixando === "excel"} onClick={() => baixar("excel")}>Baixar Excel ({alvo})</Button>
              <Button tamanho="sm" carregando={baixando === "xml"} onClick={() => baixar("xml")}>Baixar XML ({alvo})</Button>
              <Button tamanho="sm" carregando={baixando === "danfse"} onClick={() => abrirDanfse(selecao.size ? [...selecao] : notas.map((n) => n.chave))}>DANFSe em PDF ({alvo})</Button>
              <Button tamanho="sm" disabled={ocupado} onClick={verificar}>{verificando ? `Verificando ${verificando}` : "Verificar cancelamentos"}</Button>
            </div>
          </>}
          {cnpjVista && (
            <DataTable linhas={visiveis} chaveLinha={(n) => n.chave} vazio="Nenhuma nota com esses filtros."
              colunas={[
                { chave: "sel", titulo: <input type="checkbox" aria-label="Selecionar todas" checked={todasVisiveis} onChange={alternarTodas} />, largura: "36px", render: (n) => <input type="checkbox" aria-label={`Selecionar nota ${n.numero}`} checked={selecao.has(n.chave)} onChange={() => alternarNota(n.chave)} /> },
                { chave: "n", titulo: "Número", render: (n) => <><b>{n.numero}</b><br /><small>{dataBr(n.emissao)}</small></> },
                { chave: "t", titulo: "Tipo", render: (n) => ROTULO_PAPEL[n.papel] },
                { chave: "c", titulo: "Contraparte", render: (n) => { const p = n.papel === "prestador"; return <>{(p ? n.toma_nome : n.prest_nome) || "(sem nome)"}<br /><small>{formatarCnpj(p ? n.toma_doc : n.prest_doc)}</small></>; } },
                { chave: "s", titulo: "Serviço", render: (n) => <span title={n.desc_nac}>{n.trib_nac}</span> },
                { chave: "v", titulo: "Valor", alinhar: "direita", render: (n) => moeda(n.v_serv) },
                { chave: "i", titulo: "ISS", alinhar: "direita", render: (n) => <>{moeda(n.v_iss)}<br /><small>{ROTULO_RET_ISS[n.tp_ret_iss] ?? ""}</small></> },
                { chave: "r", titulo: "Retenções", alinhar: "direita", render: (n) => moeda(n.v_total_ret) },
                { chave: "x", titulo: "Situação", render: (n) => <Badge tom={tomSituacao[n.situacao]}>{ROTULO_SITUACAO[n.situacao]}</Badge> },
                { chave: "d", titulo: "", alinhar: "direita", render: (n) => <Button tamanho="sm" disabled={baixando === "danfse"} onClick={() => abrirDanfse([n.chave])}>DANFSe</Button> },
              ]} />
          )}
        </Card>
      </div>

      <Modal aberto={!!nova} titulo="Incluir CNPJ" onFechar={() => setNova(null)}>
        {nova && <div className={styles.form}>
          <Input rotulo="CNPJ" value={nova.cnpj} onChange={(e) => setNova({ ...nova, cnpj: e.target.value })} dica="Use para filiais que ainda não têm memorando." />
          <Input rotulo="Razão social" value={nova.razao} onChange={(e) => setNova({ ...nova, razao: e.target.value })} />
          <Select rotulo="Certificado" value={nova.certId} onChange={(e) => setNova({ ...nova, certId: e.target.value })}>
            <option value="">Automático (mesma raiz do CNPJ)</option>
            {certs.filter((c) => c.tipo === "e-CNPJ").map((c) => <option key={c.id} value={c.id}>{c.apelido || c.titular}</option>)}
          </Select>
          <Button variante="primary" onClick={salvarNova}>Salvar</Button>
        </div>}
      </Modal>
      <Modal aberto={!!diagnostico} titulo="Diagnóstico da conexão" largura="lg" onFechar={() => setDiagnostico(null)}
        rodape={<Button onClick={() => { void navigator.clipboard.writeText((diagnostico ?? []).join("\n")); avisar("Diagnóstico copiado.", "sucesso"); }}>Copiar</Button>}>
        <pre className={styles.diagnostico}>{(diagnostico ?? []).join("\n")}</pre>
      </Modal>
      <ConfirmDialog aberto={!!recomecar} titulo="Recomeçar captura" confirmar="Recomeçar" onConfirmar={confirmarRecomeco} onCancelar={() => setRecomecar(null)}>
        <p>A próxima captura de <b>{recomecar?.razao}</b> relê todos os documentos desde o início. As notas guardadas não duplicam, mas a leitura pode demorar.</p>
      </ConfirmDialog>
    </>
  );
}
