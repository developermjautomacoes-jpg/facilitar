import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AmbienteNfse, DocumentoDfe, EmissaoPropria, EmpresaDfe, FalhaDfe, ServicoDfe, SituacaoDfe } from "@/types";
import { Badge, Button, Card, ConfirmDialog, DataTable, Input, KpiCard, Loading, Notice, PageHeader, Select, useToast } from "@/components/ui";
import { dataBr, dataHora, formatarCnpj } from "@/lib/format";
import { baixarXmlsDfe, capturarDfe, definirCapturaAuto, definirCiencia, enviarCiencias, excluirEmissao, importarEmissao, listarDocumentos, listarEmissao, listarEmpresasDfe, marcarCiencia, reiniciarDfe } from "@/services/dfeService";
import { ROTULO_PAPEL, ROTULO_SITUACAO, exportarExcelDfe, valido } from "./dfeExcel";
import styles from "@/features/nfse/NfsePage.module.css";

const PAUSA_LOTES_MS = 2500;
const ESPERA_MAXIMA_S = 180;   // a SEFAZ exige 1 hora sem novidade: a empresa fica para depois, sem insistir
const SERVICOS: { id: ServicoDfe; nome: string }[] = [{ id: "nfe", nome: "NF-e" }, { id: "cte", nome: "CT-e" }];
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const moeda = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hoje = () => new Date().toISOString().slice(0, 10);
const hora = (t: number) => new Date(t * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const ROTULO_MODELO: Record<string, string> = { "55": "NF-e", "65": "NFC-e", "57": "CT-e", "67": "CT-e OS" };
const tomSituacao: Record<SituacaoDfe, "sucesso" | "perigo" | "alerta"> = { normal: "sucesso", cancelada: "perigo", denegada: "alerta" };

interface Progresso { empresa: string; indice: number; total: number; texto: string }

export function DfePage() {
  const avisar = useToast();
  const [ambiente, setAmbiente] = useState<AmbienteNfse>("producao");
  const [empresas, setEmpresas] = useState<EmpresaDfe[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [relatorio, setRelatorio] = useState<string[]>([]);
  const parar = useRef(false);
  const [cnpjVista, setCnpjVista] = useState("");
  const [servico, setServico] = useState<ServicoDfe>("nfe");
  const [competencia, setCompetencia] = useState("");
  const [competencias, setCompetencias] = useState<{ competencia: string; notas: number }[]>([]);
  const [docs, setDocs] = useState<DocumentoDfe[]>([]);
  const [falhas, setFalhas] = useState<FalhaDfe[]>([]);
  const [busca, setBusca] = useState("");
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [baixando, setBaixando] = useState("");
  const [ligarCiencia, setLigarCiencia] = useState<EmpresaDfe | null>(null);
  const [cienciaSelecao, setCienciaSelecao] = useState(false);
  const [recomecar, setRecomecar] = useState<EmpresaDfe | null>(null);

  const [emissoes, setEmissoes] = useState<EmissaoPropria[]>([]);
  const [cnpjEmissao, setCnpjEmissao] = useState("");
  const [arquivosEmissao, setArquivosEmissao] = useState<File[]>([]);
  const [chaveArquivo, setChaveArquivo] = useState(0);
  const [importando, setImportando] = useState(false);
  useEffect(() => { listarEmissao().then(setEmissoes).catch(() => setEmissoes([])); }, []);

  async function importarXmls() {
    if (!cnpjEmissao || !arquivosEmissao.length) { avisar("Escolha a empresa e o XML.", "erro"); return; }
    setImportando(true);
    let ok = 0;
    try {
      for (const f of arquivosEmissao) {
        try { await importarEmissao(cnpjEmissao, f.name, await f.text()); ok++; }
        catch (x) { avisar(x instanceof Error ? x.message : `${f.name}: não foi possível importar.`, "erro"); }
      }
      setEmissoes(await listarEmissao()); setArquivosEmissao([]); setChaveArquivo((k) => k + 1);
      if (ok) avisar(`${ok} XML importado(s).`, "sucesso");
    } finally { setImportando(false); }
  }
  async function tirarEmissao(e: EmissaoPropria) {
    try { await excluirEmissao(e); setEmissoes(await listarEmissao()); }
    catch (x) { avisar(x instanceof Error ? x.message : "Erro.", "erro"); }
  }

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setEmpresas(await listarEmpresasDfe(ambiente)); setErro(""); }
    catch (x) { setErro(x instanceof Error ? x.message : "Não foi possível carregar."); }
    finally { setCarregando(false); }
  }, [ambiente]);
  useEffect(() => { void carregar(); }, [carregar]);

  const carregarDocs = useCallback(async (cnpj: string, comp?: string) => {
    if (!cnpj) { setDocs([]); setCompetencias([]); setFalhas([]); setCompetencia(""); return; }
    try {
      const r = await listarDocumentos(ambiente, cnpj, servico, comp);
      setSelecao(new Set()); setDocs(r.documentos); setCompetencias(r.competencias); setCompetencia(r.competencia); setFalhas(r.falhas);
    } catch (x) { avisar(x instanceof Error ? x.message : "Não foi possível listar.", "erro"); }
  }, [ambiente, servico, avisar]);
  useEffect(() => { void carregarDocs(cnpjVista); }, [cnpjVista, carregarDocs]);

  const certVencido = (e: EmpresaDfe) => !!e.certificado?.validade && e.certificado.validade < hoje();
  const aptas = useMemo(() => empresas.filter((e) => e.certificado && !certVencido(e)), [empresas]);

  /** Envia as ciências pendentes em lotes de 20; devolve quantas foram registradas e o erro, se houver. */
  async function enviarPendentes(cnpj: string): Promise<{ enviadas: number; erros: number; mensagem: string }> {
    const tot = { enviadas: 0, erros: 0, mensagem: "" };
    while (!parar.current) {
      const r = await enviarCiencias(ambiente, cnpj);
      if (r.status === "erro") { tot.mensagem = r.mensagem; break; }
      tot.enviadas += r.enviadas; tot.erros += r.erros;
      if (!r.restantes || !r.enviadas) break;
      await dormir(PAUSA_LOTES_MS);
    }
    return tot;
  }

  async function capturar() {
    const fila = aptas.filter((e) => marcadas.has(e.cnpj));
    if (!fila.length) { avisar("Marque ao menos uma empresa com certificado válido.", "erro"); return; }
    parar.current = false; setRelatorio([]);
    const saida: string[] = [];
    for (let i = 0; i < fila.length && !parar.current; i++) {
      const e = fila[i];
      const partes: string[] = [];
      for (const s of SERVICOS) {
        const tot = { notas: 0, eventos: 0, falhas: 0 }; let nota = "";
        const mostrar = (texto: string) => setProgresso({ empresa: e.razao || formatarCnpj(e.cnpj), indice: i + 1, total: fila.length, texto: `${s.nome}: ${texto}` });
        mostrar("consultando o Ambiente Nacional…");
        while (!parar.current) {
          try {
            const p = await capturarDfe(ambiente, e.cnpj, s.id);
            if (p.status === "lote" || p.status === "fim") {
              tot.notas += p.notas; tot.eventos += p.eventos; tot.falhas += p.falhas;
              if (p.status === "fim") break;
              mostrar(`lote recebido (NSU ${p.ultimoNsu}).`);
              await dormir(PAUSA_LOTES_MS);
            } else if (p.status === "aguardar") {
              if (p.segundos > ESPERA_MAXIMA_S) { nota = `nova consulta liberada às ${hora(Date.now() / 1000 + p.segundos)}`; break; }
              for (let t = p.segundos; t > 0 && !parar.current; t--) { mostrar(`${p.mensagem} Nova tentativa em ${t}s.`); await dormir(1000); }
            } else if (p.status === "erro") { nota = p.mensagem; break; }
          } catch (x) { nota = x instanceof Error ? x.message : "erro na captura"; break; }
        }
        partes.push(`${s.nome}: ${tot.notas} novo(s), ${tot.eventos} evento(s)${tot.falhas ? `, ${tot.falhas} com falha` : ""}${nota ? ` (${nota})` : ""}`);
        await dormir(PAUSA_LOTES_MS);
      }
      if (!parar.current) {
        try {
          const c = await enviarPendentes(e.cnpj);
          if (c.enviadas || c.erros || c.mensagem) partes.push(`Ciência: ${c.enviadas} registrada(s)${c.erros ? `, ${c.erros} recusada(s)` : ""}${c.mensagem ? ` (${c.mensagem})` : ""}`);
        } catch (x) { partes.push(`Ciência: ${x instanceof Error ? x.message : "erro"}`); }
      }
      saida.push(`${e.razao || formatarCnpj(e.cnpj)} · ${partes.join(" · ")}`); setRelatorio([...saida]);
    }
    setProgresso(null);
    await carregar();
    if (cnpjVista) await carregarDocs(cnpjVista, competencia || undefined);
  }

  async function confirmarCiencia() {
    if (!ligarCiencia) return;
    try { setEmpresas(await definirCiencia(ambiente, ligarCiencia.cnpj, true)); avisar("Ciência automática ligada para esta empresa.", "sucesso"); }
    catch (x) { avisar(x instanceof Error ? x.message : "Erro.", "erro"); }
    finally { setLigarCiencia(null); }
  }
  async function alternarCiencia(e: EmpresaDfe) {
    if (!e.cienciaAuto) { setLigarCiencia(e); return; }
    try { setEmpresas(await definirCiencia(ambiente, e.cnpj, false)); }
    catch (x) { avisar(x instanceof Error ? x.message : "Erro.", "erro"); }
  }
  async function darCiencia() {
    setCienciaSelecao(false); setBaixando("ciencia");
    try {
      await marcarCiencia(ambiente, cnpjVista, resumosSelecionados.map((d) => d.chave));
      parar.current = false;
      const c = await enviarPendentes(cnpjVista);
      avisar(c.mensagem || `${c.enviadas} ciência(s) registrada(s)${c.erros ? `, ${c.erros} recusada(s)` : ""}. O XML completo chega numa próxima captura.`, c.mensagem || c.erros ? "erro" : "sucesso");
      await carregarDocs(cnpjVista, competencia); await carregar();
    } catch (x) { avisar(x instanceof Error ? x.message : "Não foi possível registrar.", "erro"); }
    finally { setBaixando(""); }
  }
  async function confirmarRecomeco() {
    if (!recomecar) return;
    try { await reiniciarDfe(ambiente, recomecar.cnpj, "nfe"); setEmpresas(await reiniciarDfe(ambiente, recomecar.cnpj, "cte")); avisar("A próxima captura relê os documentos disponíveis.", "sucesso"); }
    catch (x) { avisar(x instanceof Error ? x.message : "Erro.", "erro"); }
    finally { setRecomecar(null); }
  }
  async function baixar(tipo: "xml" | "excel") {
    const empresa = empresas.find((e) => e.cnpj === cnpjVista);
    setBaixando(tipo);
    try {
      if (tipo === "xml") await baixarXmlsDfe(ambiente, cnpjVista, servico, competencia, selecao.size ? [...selecao] : undefined);
      else await exportarExcelDfe(empresa?.razao ?? "", formatarCnpj(cnpjVista), servico, competencia, selecao.size ? docs.filter((d) => selecao.has(d.chave)) : docs);
    } catch (x) { avisar(x instanceof Error ? x.message : "Não foi possível gerar o arquivo.", "erro"); }
    finally { setBaixando(""); }
  }

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return docs.filter((d) => !q || `${d.numero} ${d.emit_nome} ${d.emit_doc} ${d.dest_doc} ${d.chave}`.toLowerCase().includes(q));
  }, [docs, busca]);
  const ocupado = !!progresso;
  const todas = visiveis.length > 0 && visiveis.every((d) => selecao.has(d.chave));
  const alternar = (chave: string) => setSelecao((m) => { const n = new Set(m); if (n.has(chave)) n.delete(chave); else n.add(chave); return n; });
  const alternarTodas = () => setSelecao((m) => { const n = new Set(m); visiveis.forEach((v) => { if (todas) n.delete(v.chave); else n.add(v.chave); }); return n; });
  const resumos = docs.filter((d) => d.conteudo === "resumo");
  const resumosSelecionados = (selecao.size ? docs.filter((d) => selecao.has(d.chave)) : docs).filter((d) => d.conteudo === "resumo" && d.situacao === "normal" && d.ciencia !== "enviada");
  const alvo = selecao.size ? `${selecao.size} selecionado(s)` : "todos";
  const estadoLinha = (e: EmpresaDfe) => SERVICOS.map((s) => ({ s, st: e[s.id] }));

  return (
    <>
      <PageHeader titulo="Captura de NF-e e CT-e" descricao="Baixa do Ambiente Nacional os documentos em que a empresa é destinatária, tomadora ou outra interessada, usando o e-CNPJ dela."
        acoes={<Select rotulo="Ambiente" value={ambiente} disabled={ocupado} onChange={(e) => { setAmbiente(e.target.value as AmbienteNfse); setCnpjVista(""); setMarcadas(new Set()); }}>
          <option value="producao">Produção</option><option value="restrita">Homologação (testes)</option></Select>} />
      {erro && <Notice tom="erro">{erro}</Notice>}
      {ambiente === "restrita" && <Notice tom="alerta">Homologação: os documentos deste ambiente não têm validade fiscal e ficam separados dos de produção.</Notice>}
      <Notice tom="alerta">Etapa 1: documentos recebidos. NF-e e CT-e emitidos pela empresa e NFC-e não saem do Ambiente Nacional e virão pela SEFAZ-ES. Só ficam disponíveis os últimos 90 dias, e o sistema guarda a partir de 2 meses antes da primeira captura.</Notice>

      <Card titulo="Empresas" descricao="Vêm da Captura de NFS-e. Aqui vale só o certificado da empresa, de mesma raiz do CNPJ; a procuração da NFS-e não serve. Sem novidade, a SEFAZ só aceita nova consulta após 1 hora. Ligue a captura noturna só onde nenhum outro sistema captura o mesmo CNPJ." semPadding>
        <div className={styles.barra}>
          <Button tamanho="sm" onClick={() => setMarcadas(new Set(aptas.map((e) => e.cnpj)))} disabled={ocupado || !aptas.length}>Marcar todas aptas</Button>
          <Button tamanho="sm" onClick={() => setMarcadas(new Set())} disabled={ocupado}>Limpar</Button>
          <span className={styles.espaco} />
          {progresso ? <Button variante="danger" onClick={() => { parar.current = true; }}>Interromper</Button>
            : <Button variante="primary" onClick={capturar} disabled={!marcadas.size}>Capturar selecionadas ({marcadas.size})</Button>}
        </div>
        {progresso && <div className={styles.progresso} role="status"><b>{progresso.empresa}</b> · empresa {progresso.indice} de {progresso.total}<small>{progresso.texto} Mantenha esta aba aberta.</small></div>}
        {relatorio.length > 0 && <ul className={styles.relatorio}>{relatorio.map((l) => <li key={l}>{l}</li>)}</ul>}
        {carregando ? <Loading /> : (
          <DataTable linhas={empresas} chaveLinha={(e) => e.cnpj} vazio="Nenhuma empresa. Importe um certificado em Configurações."
            colunas={[
              { chave: "sel", titulo: "", largura: "36px", render: (e) => <input type="checkbox" aria-label={`Selecionar ${e.razao}`} checked={marcadas.has(e.cnpj)} disabled={ocupado || !e.certificado || certVencido(e)} onChange={() => setMarcadas((m) => { const n = new Set(m); if (n.has(e.cnpj)) n.delete(e.cnpj); else n.add(e.cnpj); return n; })} /> },
              { chave: "emp", titulo: "Empresa", render: (e) => <><b>{e.razao || "(sem nome)"}</b><br /><small>{formatarCnpj(e.cnpj)}</small></> },
              { chave: "cert", titulo: "Certificado", render: (e) => !e.certificado ? <Badge tom="alerta">sem certificado</Badge> : certVencido(e) ? <Badge tom="perigo">vencido em {dataBr(e.certificado.validade)}</Badge> : <small>até {dataBr(e.certificado.validade)}</small> },
              { chave: "aut", titulo: "Captura noturna", render: (e) => <label className={styles.check}><input type="checkbox" checked={e.capturaAuto} disabled={ocupado} onChange={() => { definirCapturaAuto(ambiente, e.cnpj, !e.capturaAuto).then(setEmpresas).catch((x) => avisar(x instanceof Error ? x.message : "Erro.", "erro")); }} /> {e.capturaAuto ? "Ligada" : "Desligada"}</label> },
              { chave: "cie", titulo: "Ciência automática", render: (e) => <label className={styles.check}><input type="checkbox" checked={e.cienciaAuto} disabled={ocupado} onChange={() => void alternarCiencia(e)} /> {e.cienciaAuto ? "Ligada" : "Desligada"}</label> },
              { chave: "cap", titulo: "Última captura", render: (e) => <>{estadoLinha(e).map(({ s, st }) => <div key={s.id}>{st.ultimoErro ? <span className={styles.erro}>{s.nome}: {st.ultimoErro}</span> : <small>{s.nome}: {st.ultimaCaptura ? dataHora(st.ultimaCaptura) : "nunca"}{st.proximaEm * 1000 > Date.now() ? ` · libera ${hora(st.proximaEm)}` : ""}</small>}</div>)}</> },
              { chave: "doc", titulo: "Documentos", render: (e) => <small>NF-e {e.nfe.documentos}{e.nfe.resumos > 0 ? ` (${e.nfe.resumos} só resumo)` : ""}<br />CT-e {e.cte.documentos}{e.falhas > 0 && <><br /><Badge tom="perigo">{e.falhas} com falha</Badge></>}</small> },
              { chave: "ac", titulo: "", alinhar: "direita", render: (e) => <div className={styles.acoes}>
                <Button tamanho="sm" disabled={!e.nfe.documentos && !e.cte.documentos} onClick={() => setCnpjVista(e.cnpj)}>Ver</Button>
                <Button tamanho="sm" disabled={ocupado || (!e.nfe.ultimoNsu && !e.cte.ultimoNsu)} onClick={() => setRecomecar(e)}>Recomeçar</Button>
              </div> },
            ]} />
        )}
      </Card>

      <div className={styles.notas}>
        <Card titulo="Emissão própria" descricao="Importe um XML emitido pela empresa, um por modelo e série. O número e a série vêm do arquivo e servirão de referência para a captura das notas emitidas pela SEFAZ-ES.">
          <div className={styles.procForm}>
            <Select rotulo="Empresa" value={cnpjEmissao} onChange={(e) => setCnpjEmissao(e.target.value)}>
              <option value="">Escolha…</option>
              {empresas.map((e) => <option key={e.cnpj} value={e.cnpj}>{e.razao || formatarCnpj(e.cnpj)}</option>)}
            </Select>
            <Input key={chaveArquivo} rotulo="XML de NF-e, NFC-e ou CT-e" type="file" accept=".xml" multiple onChange={(e) => setArquivosEmissao([...(e.target.files ?? [])])} />
            <span />
            <Button variante="primary" carregando={importando} disabled={!cnpjEmissao || !arquivosEmissao.length} onClick={importarXmls}>Importar XML</Button>
          </div>
          {emissoes.length > 0 && <DataTable linhas={emissoes} chaveLinha={(e) => `${e.cnpj}-${e.modelo}-${e.serie}`} vazio=""
            colunas={[
              { chave: "e", titulo: "Empresa", render: (e) => <>{empresas.find((x) => x.cnpj === e.cnpj)?.razao || "(sem nome)"}<br /><small>{formatarCnpj(e.cnpj)}</small></> },
              { chave: "m", titulo: "Modelo", render: (e) => ROTULO_MODELO[e.modelo] ?? e.modelo },
              { chave: "s", titulo: "Série", render: (e) => e.serie },
              { chave: "n", titulo: "Número", render: (e) => <>{e.numero}<br /><small>{dataBr(e.emissao)}</small></> },
              { chave: "a", titulo: "Arquivo", render: (e) => <small>{e.arquivo}</small> },
              { chave: "x", titulo: "", alinhar: "direita", render: (e) => <Button tamanho="sm" variante="danger" onClick={() => void tirarEmissao(e)}>Tirar</Button> },
            ]} />}
        </Card>
      </div>

      <div className={styles.notas}>
        <Card titulo="Documentos capturados" descricao="Totais sem canceladas e denegadas. NF-e só com resumo ainda não tem XML completo.">
          <div className={styles.filtros}>
            <Select rotulo="Empresa" value={cnpjVista} onChange={(e) => setCnpjVista(e.target.value)}>
              <option value="">Escolha…</option>
              {empresas.filter((e) => e.nfe.documentos + e.cte.documentos > 0).map((e) => <option key={e.cnpj} value={e.cnpj}>{e.razao || formatarCnpj(e.cnpj)}</option>)}
            </Select>
            <Select rotulo="Documento" value={servico} onChange={(e) => setServico(e.target.value as ServicoDfe)}>{SERVICOS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</Select>
            <Select rotulo="Competência" value={competencia} disabled={!competencias.length} onChange={(e) => void carregarDocs(cnpjVista, e.target.value)}>
              {competencias.map((c) => <option key={c.competencia} value={c.competencia}>{c.competencia.split("-").reverse().join("/")} ({c.notas})</option>)}
            </Select>
            <Input rotulo="Buscar" placeholder="Número, nome, CNPJ ou chave" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          {falhas.length > 0 && <Notice tom="erro">{falhas.length} documento(s) não puderam ser lidos: {falhas.slice(0, 3).map((f) => `NSU ${f.nsu} (${f.motivo})`).join("; ")}{falhas.length > 3 ? "…" : ""}</Notice>}
          {docs.length > 0 && <>
            <div className={styles.kpis}>
              <KpiCard rotulo="Valor válido" valor={moeda(docs.filter(valido).reduce((s, d) => s + d.v_total, 0))} detalhe={`${docs.filter(valido).length} documento(s)`} />
              <KpiCard rotulo="XML completo" valor={docs.length - resumos.length} detalhe="prontos para baixar" />
              <KpiCard rotulo="Só resumo" valor={resumos.length} detalhe="dependem de ciência" />
              <KpiCard rotulo="Fora dos totais" valor={docs.filter((d) => !valido(d)).length} detalhe="canceladas e denegadas" />
            </div>
            <div className={styles.barra}>
              <Button tamanho="sm" variante="primary" carregando={baixando === "excel"} onClick={() => baixar("excel")}>Baixar Excel ({alvo})</Button>
              <Button tamanho="sm" carregando={baixando === "xml"} onClick={() => baixar("xml")}>Baixar XML ({alvo})</Button>
              {servico === "nfe" && <Button tamanho="sm" disabled={!resumosSelecionados.length || ocupado} carregando={baixando === "ciencia"} onClick={() => setCienciaSelecao(true)}>Dar ciência ({resumosSelecionados.length})</Button>}
            </div>
          </>}
          {cnpjVista && (
            <DataTable linhas={visiveis} chaveLinha={(d) => d.chave} vazio="Nenhum documento com esses filtros."
              colunas={[
                { chave: "sel", titulo: <input type="checkbox" aria-label="Selecionar todos" checked={todas} onChange={alternarTodas} />, largura: "36px", render: (d) => <input type="checkbox" aria-label={`Selecionar ${d.numero}`} checked={selecao.has(d.chave)} onChange={() => alternar(d.chave)} /> },
                { chave: "n", titulo: "Número", render: (d) => <><b>{d.numero}</b> <small>série {d.serie}</small><br /><small>{dataBr(d.emissao)}</small></> },
                { chave: "p", titulo: "Papel", render: (d) => ROTULO_PAPEL[d.papel] ?? d.papel },
                { chave: "e", titulo: "Emitente", render: (d) => <>{d.emit_nome || "(sem nome)"}<br /><small>{formatarCnpj(d.emit_doc)}</small></> },
                { chave: "v", titulo: "Valor", alinhar: "direita", render: (d) => moeda(d.v_total) },
                { chave: "x", titulo: "XML", render: (d) => d.conteudo === "completa" ? <Badge tom="sucesso">completo</Badge> : d.ciencia === "enviada" ? <Badge tom="alerta">aguardando XML</Badge> : d.ciencia === "erro" ? <span className={styles.erro} title={d.ciencia_msg ?? ""}>ciência recusada</span> : d.ciencia === "pendente" ? <Badge tom="alerta">ciência pendente</Badge> : <Badge tom="alerta">só resumo</Badge> },
                { chave: "s", titulo: "Situação", render: (d) => <Badge tom={tomSituacao[d.situacao]}>{ROTULO_SITUACAO[d.situacao]}</Badge> },
              ]} />
          )}
        </Card>
      </div>

      <ConfirmDialog aberto={!!ligarCiencia} titulo="Ligar ciência automática" confirmar="Ligar" onConfirmar={confirmarCiencia} onCancelar={() => setLigarCiencia(null)}>
        <p>Toda NF-e nova destinada a <b>{ligarCiencia?.razao}</b> receberá o evento oficial Ciência da Operação, em nome da empresa, para liberar o XML completo. A ciência não substitui a manifestação conclusiva, que tem prazo próprio.</p>
      </ConfirmDialog>
      <ConfirmDialog aberto={cienciaSelecao} titulo="Dar ciência" confirmar="Registrar" onConfirmar={darCiencia} onCancelar={() => setCienciaSelecao(false)}>
        <p>Será registrado o evento oficial Ciência da Operação em <b>{resumosSelecionados.length}</b> NF-e, em nome da empresa. Esse evento não pode ser desfeito.</p>
      </ConfirmDialog>
      <ConfirmDialog aberto={!!recomecar} titulo="Recomeçar captura" confirmar="Recomeçar" onConfirmar={confirmarRecomeco} onCancelar={() => setRecomecar(null)}>
        <p>A próxima captura de <b>{recomecar?.razao}</b> relê os documentos ainda disponíveis na SEFAZ. Os guardados não duplicam.</p>
      </ConfirmDialog>
    </>
  );
}
