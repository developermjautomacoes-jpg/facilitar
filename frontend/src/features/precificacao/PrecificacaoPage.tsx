import { useMemo, useState } from "react";
import { BarList, Card, DataTable, NumberInput, Notice, PageHeader, Select } from "@/components/ui";
import { moeda, numeroBr } from "@/lib/format";
import { ANOS_TRANSICAO, PARAMETROS_REFORMA, cbsDoAno, fatorIcmsIss, ibsDoAno, type ParametrosReforma } from "@/lib/reforma";
import { CardRegime } from "./components/CardRegime";
import { REGIMES_PRECO, creditoCbsIbsCompra, precificar, type EntradaPreco, type RegimePreco } from "./precificacaoCalc";
import styles from "./PrecificacaoPage.module.css";

const INICIAL: EntradaPreco = {
  tipo: "produto", ano: 2027, custo: 100, icmsCompra: 12, pCredCbs: 100, aliqIcms: 17, aliqIss: 5,
  aliqSimples: 9.5, parcelaCbsDas: 15.5, presIrpj: 8, presCsll: 12, despFixas: 10, despVariaveis: 5, margem: 15, reducao: 0,
};
const REDUCOES = [[0, "Nenhuma · alíquota padrão"], [30, "30% · profissões regulamentadas (art. 127)"], [40, "40% · bares, hotelaria, transporte coletivo"], [60, "60% · saúde, educação, medicamentos (arts. 128-133)"], [100, "Alíquota zero (cesta básica, art. 125)"]] as const;

export function PrecificacaoPage() {
  const [e, setE] = useState<EntradaPreco>(INICIAL);
  const [par, setPar] = useState<ParametrosReforma>(PARAMETROS_REFORMA);
  const [regime, setRegime] = useState<RegimePreco>("LP");
  const set = <K extends keyof EntradaPreco>(k: K, v: EntradaPreco[K]) => setE((x) => ({ ...x, [k]: v }));
  const trocarTipo = (tipo: EntradaPreco["tipo"]) => setE((x) => ({ ...x, tipo, presIrpj: tipo === "servico" ? 32 : 8, presCsll: tipo === "servico" ? 32 : 12, icmsCompra: tipo === "servico" ? 0 : x.icmsCompra, aliqSimples: tipo === "servico" ? 13.5 : 9.5, parcelaCbsDas: tipo === "servico" ? 16 : 15.5 }));

  const resultados = useMemo(() => REGIMES_PRECO.map((rg) => ({ ...rg, r: precificar(e, rg.id, par) })), [e, par]);
  const atual = resultados.find((x) => x.id === regime)!.r;
  const viaveis = resultados.filter((x) => !x.r.inviavel);
  const menorCliente = viaveis.length ? viaveis.reduce((a, b) => (b.r.custoLiquidoCliente < a.r.custoLiquidoCliente ? b : a)).id : null;
  const anos = useMemo(() => ANOS_TRANSICAO.map((ano) => ({ ano, r: precificar({ ...e, ano }, regime, par) })), [e, regime, par]);
  const credSugerido = creditoCbsIbsCompra(e, par);

  return (
    <>
      <PageHeader titulo="Precificação com a reforma tributária"
        descricao="Calcule o preço de venda de produtos e serviços com CBS e IBS por fora, a redução do ICMS/ISS na transição e a comparação entre regimes." />
      <div className={styles.grade}>
        <div className={styles.form}>
          <Card titulo="Operação">
            <div className={styles.campos}>
              <div className={styles.tipo} role="group" aria-label="Tipo de operação">
                {(["produto", "servico"] as const).map((t) => (
                  <button key={t} type="button" aria-pressed={e.tipo === t} className={e.tipo === t ? styles.on : ""} onClick={() => trocarTipo(t)}>{t === "produto" ? "Venda de produto" : "Prestação de serviço"}</button>
                ))}
              </div>
              <Select rotulo="Ano da operação" value={e.ano} onChange={(x) => set("ano", Number(x.target.value))}>
                {ANOS_TRANSICAO.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
              <Select rotulo="Redução da CBS/IBS do item" value={e.reducao} onChange={(x) => set("reducao", Number(x.target.value))}>
                {REDUCOES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </Select>
            </div>
          </Card>
          <Card titulo="Custo e créditos" descricao="Valores por unidade (ou por serviço).">
            <div className={styles.campos}>
              <NumberInput rotulo={e.tipo === "produto" ? "Custo de compra pago ao fornecedor" : "Custo do serviço (insumos e mão de obra)"} sufixo="R$" valor={e.custo} onChange={(v) => set("custo", v)} />
              {e.tipo === "produto" && <NumberInput rotulo="ICMS destacado na compra" sufixo="R$" valor={e.icmsCompra} onChange={(v) => set("icmsCompra", v)} dica="Crédito no Presumido e no Real." />}
              <NumberInput rotulo="Compras com crédito de CBS/IBS" sufixo="%" valor={e.pCredCbs} onChange={(v) => set("pCredCbs", v)}
                dica={`Fornecedor do regime regular. Crédito estimado: ${moeda(credSugerido.cbs + credSugerido.ibs)}.`} />
            </div>
          </Card>
          <Card titulo="Tributos do vendedor">
            <div className={styles.campos}>
              {e.tipo === "produto"
                ? <NumberInput rotulo="Alíquota de ICMS na venda" sufixo="%" valor={e.aliqIcms} onChange={(v) => set("aliqIcms", v)} />
                : <NumberInput rotulo="Alíquota de ISS" sufixo="%" valor={e.aliqIss} onChange={(v) => set("aliqIss", v)} />}
              <NumberInput rotulo="Alíquota efetiva do Simples" sufixo="%" valor={e.aliqSimples} onChange={(v) => set("aliqSimples", v)} dica="Do PGDAS ou do planejamento tributário." />
              <NumberInput rotulo="Parcela do DAS que vira CBS/IBS" sufixo="%" valor={e.parcelaCbsDas} onChange={(v) => set("parcelaCbsDas", v)} dica="PIS/COFINS da partilha do Anexo (ex.: Anexo I ≈ 15,5%)." />
              <NumberInput rotulo="Presunção IRPJ (Presumido)" sufixo="%" valor={e.presIrpj} onChange={(v) => set("presIrpj", v)} />
              <NumberInput rotulo="Presunção CSLL (Presumido)" sufixo="%" valor={e.presCsll} onChange={(v) => set("presCsll", v)} />
            </div>
          </Card>
          <Card titulo="Despesas e margem" descricao="Percentuais sobre o preço de venda (sem CBS/IBS).">
            <div className={styles.campos}>
              <NumberInput rotulo="Despesas fixas" sufixo="%" valor={e.despFixas} onChange={(v) => set("despFixas", v)} />
              <NumberInput rotulo="Despesas variáveis" sufixo="%" valor={e.despVariaveis} onChange={(v) => set("despVariaveis", v)} dica="Comissão, cartão, frete." />
              <NumberInput rotulo="Lucro líquido desejado" sufixo="%" valor={e.margem} onChange={(v) => set("margem", v)} />
            </div>
          </Card>
          <Card titulo="Parâmetros da reforma">
            <div className={styles.campos}>
              <NumberInput rotulo="CBS de referência" sufixo="%" valor={par.cbsReferencia} onChange={(v) => setPar({ ...par, cbsReferencia: v })} dica="TCU, 28/10/2026 (pendente do Senado)." />
              <NumberInput rotulo="IBS de referência pleno" sufixo="%" valor={par.ibsReferencia} onChange={(v) => setPar({ ...par, ibsReferencia: v })} dica="Estimativa CGIBS (Res. 14/2026)." />
            </div>
          </Card>
        </div>

        <div className={styles.resultado}>
          <div className={styles.cards}>
            {resultados.map((x) => <CardRegime key={x.id} nome={x.nome} r={x.r} selecionado={x.id === regime} melhorParaCliente={x.id === menorCliente} onSelecionar={() => setRegime(x.id)} />)}
          </div>
          {atual.inviavel && <Notice tom="erro">Tributos, despesas e margem somam 100% ou mais do preço: reduza a margem ou as despesas.</Notice>}
          <Card titulo={`Composição do preço · ${REGIMES_PRECO.find((x) => x.id === regime)!.nome} · ${e.ano}`}
            descricao={`CBS ${numeroBr(cbsDoAno(e.ano, par) * (1 - e.reducao / 100))}% · IBS ${numeroBr(ibsDoAno(e.ano, par) * (1 - e.reducao / 100))}% · ${e.tipo === "produto" ? "ICMS" : "ISS"} a ${Math.round(fatorIcmsIss(e.ano) * 100)}%`} semPadding>
            <DataTable chaveLinha={(l) => l.rotulo} linhas={atual.composicao}
              colunas={[
                { chave: "item", titulo: "Item", render: (l) => <span className={styles[`t_${l.tipo}`]}>{l.rotulo}</span> },
                { chave: "pct", titulo: "% do preço", alinhar: "direita", render: (l) => `${numeroBr(l.percentual)}%` },
                { chave: "val", titulo: "Valor", alinhar: "direita", render: (l) => moeda(l.valor) },
              ]}
              rodape={<>
                <tr><td>Preço de venda (sem CBS/IBS)</td><td /><td style={{ textAlign: "right" }}>{moeda(atual.precoBase)}</td></tr>
                <tr><td>Valor total da nota</td><td /><td style={{ textAlign: "right" }}>{moeda(atual.precoTotal)}</td></tr>
                <tr><td>Crédito de CBS/IBS para o cliente contribuinte</td><td /><td style={{ textAlign: "right" }}>{moeda(atual.creditoCliente)}</td></tr>
              </>} />
          </Card>
          <Card titulo="Para onde vai o preço">
            <BarList itens={atual.composicao.filter((l) => l.valor > 0.005).map((l) => [l.rotulo, Math.round(l.valor * 100) / 100] as [string, number])} vazio="Sem valores." formatar={moeda} />
          </Card>
          <Card titulo={`Evolução na transição · ${REGIMES_PRECO.find((x) => x.id === regime)!.nome}`} descricao="Mesmo custo, despesas e margem; muda só a regra de cada ano. * Custo para cliente contribuinte, após o crédito de CBS/IBS." semPadding>
            <DataTable chaveLinha={(x) => String(x.ano)} linhas={anos}
              linhaClasse={(x) => (x.ano === e.ano ? "destaque" : undefined)}
              colunas={[
                { chave: "ano", titulo: "Ano", render: (x) => <b>{x.ano}</b> },
                { chave: "base", titulo: "Preço s/ CBS/IBS", alinhar: "direita", render: (x) => (x.r.inviavel ? "—" : moeda(x.r.precoBase)) },
                { chave: "cbsibs", titulo: "CBS + IBS", alinhar: "direita", render: (x) => moeda(x.r.cbs + x.r.ibs) },
                { chave: "total", titulo: "Total nota", alinhar: "direita", render: (x) => (x.r.inviavel ? "—" : moeda(x.r.precoTotal)) },
                { chave: "cliente", titulo: "Custo cliente*", alinhar: "direita", render: (x) => (x.r.inviavel ? "—" : moeda(x.r.custoLiquidoCliente)) },
              ]} />
          </Card>
          <Card titulo="Premissas e base legal">
            <ul className={styles.legal}>
              <li>Preço pelo método do divisor: preço = custo líquido ÷ (1 − tributos sobre o preço − despesas − lucro). No Lucro Real, o lucro desejado é líquido de IRPJ/CSLL (34%).</li>
              <li>CBS e IBS por fora, sobre o preço sem ICMS/ISS (LC 214/2025, art. 12, V), com crédito das compras (arts. 47 a 57). CBS de 2027-2028 = referência − 0,1 ponto (art. 347); IBS 0,1% em 2027-2028 (art. 344) e proporcional de 2029 a 2032 (art. 349). Reduções sobre a alíquota (arts. 126 a 133).</li>
              <li>ICMS/ISS a 90%, 80%, 70% e 60% de 2029 a 2032 e extintos em 2033 (LC 87/1996, art. 31-A; LC 116/2003, art. 8º-B; LC 214/2025, arts. 501, 508 e 543). PIS/COFINS só em 2026 (extintos pelo art. 542).</li>
              <li>Simples puro: CBS/IBS dentro do DAS; o cliente credita só a parcela paga no DAS (art. 47, § 9º). Simples híbrido: CBS/IBS por fora com crédito (LC 123/2006, art. 13, §§ 9º a 11). A parcela do DAS que vira CBS/IBS é uma estimativa informada.</li>
              <li>Presumido: IRPJ 15% e CSLL 9% sobre a presunção (Lei 9.249/1995, arts. 3º, 15 e 20), sem o adicional de 10% e sem o acréscimo da IN RFB 2.305/2025. Alíquotas de referência pendentes de confirmação do Senado (art. 349).</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
