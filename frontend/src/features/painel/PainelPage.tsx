import { useMemo, useState } from "react";
import { BarList, Card, DataTable, EmptyState, KpiCard, Loading, Notice, PageHeader, Select } from "@/components/ui";
import { MESES } from "@/lib/constantes";
import { dataBr, formatarCnpj, percentual, plural } from "@/lib/format";
import type { EventoCarteira } from "@/lib/memorando";
import { useMemorandos } from "@/features/memorandos/MemorandosContext";
import { useColaboradores } from "@/features/colaboradores/useColaboradores";
import { GraficoAtivos } from "./components/GraficoAtivos";
import { GraficoEntradasSaidas } from "./components/GraficoEntradasSaidas";
import graf from "./components/Grafico.module.css";
import { calcularPainel } from "./painelDados";
import styles from "./PainelPage.module.css";

export function PainelPage() {
  const { memorandos, carregando, erro } = useMemorandos();
  const { colaboradores } = useColaboradores();
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(0);
  const d = useMemo(() => calcularPainel(memorandos, colaboradores, ano, mes), [memorandos, colaboradores, ano, mes]);

  if (carregando) return <Loading />;
  const colunasEvento = (tipo: "entrada" | "saida") => [
    { chave: "data", titulo: tipo === "entrada" ? "Cliente desde" : "Saída", render: (e: EventoCarteira) => dataBr(tipo === "entrada" ? e.entrada : e.saida) },
    { chave: "empresa", titulo: "Empresa", render: (e: EventoCarteira) => <><b>{e.memorando.e_razao}</b><br /><small>{formatarCnpj(e.memorando.e_cnpj)}</small></> },
    { chave: "info", titulo: tipo === "entrada" ? "Regime" : "Motivo", render: (e: EventoCarteira) => (tipo === "entrada" ? e.memorando.t_regime : e.memorando.motivoSaida) || "—" },
  ];

  return (
    <>
      <PageHeader
        titulo="Painel gerencial de clientes"
        descricao='Entradas pelo "Cliente desde" de cada memorando e saídas registradas no Arquivo. Memorandos cancelados não contam.'
        acoes={<>
          <Select rotulo="Ano" value={ano} onChange={(e) => setAno(Number(e.target.value))} className={styles.filtroAno}>
            {d.anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
          <Select rotulo="Mês" value={mes} onChange={(e) => setMes(Number(e.target.value))} className={styles.filtroMes}>
            <option value={0}>Ano inteiro</option>
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
        </>}
      />
      {erro && <Notice tom="erro">Não foi possível carregar o arquivo: {erro}</Notice>}
      {!memorandos.length && !erro ? (
        <EmptyState titulo="Nenhum memorando no arquivo">Os indicadores aparecem quando houver memorandos salvos.</EmptyState>
      ) : (
        <div className={styles.grade}>
          <div className={styles.kpis}>
            <KpiCard rotulo="Clientes ativos" valor={d.ativos} detalhe={`em ${dataBr(d.referencia)}`} destaque />
            <KpiCard rotulo="Entradas" valor={d.entradas.length} detalhe={d.periodo} marcador="--chart-in" />
            <KpiCard rotulo="Saídas" valor={d.saidas.length} detalhe={d.periodo} marcador="--chart-out" />
            <KpiCard rotulo="Saldo" valor={`${d.saldo > 0 ? "+" : ""}${d.saldo}`} detalhe="entradas menos saídas" />
            <KpiCard rotulo="Variação da carteira" valor={percentual(d.variacao)} detalhe={`ativos no início: ${d.ativosInicio} · inativos no total: ${d.inativosTotal}`} />
          </div>
          <div className={styles.duas}>
            <Card titulo="Entradas e saídas por mês" descricao={String(ano) + (mes ? ` · destaque em ${MESES[mes - 1].toLowerCase()}` : "")}>
              <div className={graf.legenda}><span><i className={graf.in} />Entradas</span><span><i className={graf.out} />Saídas</span></div>
              <GraficoEntradasSaidas meses={d.meses} ano={ano} mesDestaque={mes} />
            </Card>
            <Card titulo="Clientes ativos no fim de cada mês" descricao={`${ano} · empresas com memorando ativo e sem saída registrada`}>
              <GraficoAtivos valores={d.meses.map((m) => m.ativosNoFim)} ano={ano} mesDestaque={mes} />
            </Card>
          </div>
          <Card titulo="Resumo mensal" descricao={String(ano)} semPadding>
            <DataTable
              colunas={[
                { chave: "mes", titulo: "Mês", render: (m: { i: number }) => MESES[m.i] },
                { chave: "ent", titulo: "Entradas", alinhar: "direita", render: (m) => d.meses[m.i].entradas },
                { chave: "sai", titulo: "Saídas", alinhar: "direita", render: (m) => d.meses[m.i].saidas },
                { chave: "saldo", titulo: "Saldo", alinhar: "direita", render: (m) => { const s = d.meses[m.i].entradas - d.meses[m.i].saidas; return `${s > 0 ? "+" : ""}${s}`; } },
                { chave: "ativos", titulo: "Ativos no fim do mês", alinhar: "direita", render: (m) => d.meses[m.i].ativosNoFim ?? "—" },
              ]}
              linhas={MESES.map((_, i) => ({ i }))}
              chaveLinha={(m) => String(m.i)}
            />
          </Card>
          <div className={styles.tres}>
            <Card titulo="Ativos por regime tributário" descricao={`${plural(d.ativos, "empresa ativa", "empresas ativas")} em ${dataBr(d.referencia)}`}><BarList itens={d.porRegime} vazio="Sem empresas ativas." /></Card>
            <Card titulo="Ativos por setor atendido" descricao="Empresas ativas que têm o setor marcado no memorando."><BarList itens={d.porSetor} vazio="Nenhum setor marcado." /></Card>
            <Card titulo="Ativos no Simples por anexo" descricao="Uma empresa pode estar em mais de um anexo."><BarList itens={d.porAnexo} vazio="Nenhuma empresa ativa no Simples." tom="gold" /></Card>
            <Card titulo="Empresas ativas por responsável" descricao="Uma empresa conta para cada colaborador vinculado."><BarList itens={d.porResponsavel} vazio="Nenhum responsável informado." /></Card>
            <Card titulo="Ferramentas a serem configuradas" descricao="Empresas ativas por ferramenta a configurar."><BarList itens={d.porFerramenta} vazio="Sem empresas ativas." tom="gold" /></Card>
            <Card titulo="Motivos de saída" descricao={d.saidas.length ? `${plural(d.saidas.length, "saída", "saídas")} em ${d.periodo}` : `Nenhuma saída em ${d.periodo}`}><BarList itens={d.porMotivo} vazio="Sem saídas no período." tom="gold" /></Card>
          </div>
          <div className={styles.duas}>
            <Card titulo="Entradas no período" semPadding>
              <DataTable colunas={colunasEvento("entrada")} linhas={d.entradas} chaveLinha={(e) => e.memorando._id} vazio="Nenhuma entrada no período." />
            </Card>
            <Card titulo="Saídas no período" semPadding>
              <DataTable colunas={colunasEvento("saida")} linhas={d.saidas} chaveLinha={(e) => e.memorando._id} vazio="Nenhuma saída no período." />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
