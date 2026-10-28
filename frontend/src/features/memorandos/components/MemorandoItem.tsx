import type { Memorando } from "@/types";
import { Badge, Button } from "@/components/ui";
import { dataBr, dataHora, formatarCnpj, numeroMemorando } from "@/lib/format";
import { clienteInativo, historicoDe, memorandoCancelado } from "@/lib/memorando";
import styles from "./MemorandoItem.module.css";

export type AcaoMemorando = "ver" | "editar" | "pdf" | "docx" | "excluir" | "cancelar" | "reativar" | "saida" | "voltou";

export function MemorandoItem({ memorando: d, onAcao }: { memorando: Memorando; onAcao: (acao: AcaoMemorando, d: Memorando) => void }) {
  const cancelado = memorandoCancelado(d), inativo = clienteInativo(d);
  const deps = (d.deps ?? []).filter((x) => x.on);
  const h = historicoDe(d), h0 = h[0], hl = h[h.length - 1];
  return (
    <article className={[styles.item, cancelado || inativo ? styles.apagado : ""].join(" ")}>
      <div className={styles.numero}>{numeroMemorando(d.seq, d.ano)}<small>{dataBr(d.m_data)}</small></div>
      <div className={styles.corpo}>
        <h3 className={styles.nome}>{d.e_razao || "—"}{d.e_fantasia && <span className={styles.fantasia}> · {d.e_fantasia}</span>}</h3>
        <div className={styles.meta}>
          <span>{formatarCnpj(d.e_cnpj)}</span>
          {d.t_regime && <Badge tom="navy">{d.t_regime}{d.t_modalidade ? ` · ${d.t_modalidade}` : ""}</Badge>}
          {cancelado && <Badge tom="perigo">memorando cancelado</Badge>}
          {inativo && <Badge tom="alerta">saiu em {dataBr(d.dataSaida)}{d.motivoSaida ? ` · ${d.motivoSaida}` : ""}</Badge>}
          {!cancelado && !inativo && <Badge tom="sucesso">cliente desde {dataBr(d.e_desde || d.m_data)}</Badge>}
        </div>
        {deps.length > 0 && <p className={styles.linha}>{deps.map((x) => x.nome + (x.resp ? `: ${x.resp}` : "")).join(" · ")}</p>}
        {h0 && <p className={styles.linha}>Criado por {h0.por || "—"} em {dataBr(h0.em)}{hl && hl !== h0 ? ` · última alteração: ${hl.por || "—"} em ${dataHora(hl.em)}` : ""}</p>}
      </div>
      <div className={styles.acoes}>
        <Button tamanho="sm" onClick={() => onAcao("ver", d)}>Visualizar</Button>
        <Button tamanho="sm" variante="primary" onClick={() => onAcao("editar", d)}>Editar</Button>
        <Button tamanho="sm" onClick={() => onAcao("pdf", d)}>PDF</Button>
        <Button tamanho="sm" onClick={() => onAcao("docx", d)}>Word</Button>
        {cancelado ? (
          <Button tamanho="sm" variante="ghost" onClick={() => onAcao("reativar", d)}>Reativar memorando</Button>
        ) : inativo ? (
          <Button tamanho="sm" variante="ghost" onClick={() => onAcao("voltou", d)}>Cliente voltou</Button>
        ) : (
          <>
            <Button tamanho="sm" variante="ghost" onClick={() => onAcao("saida", d)}>Registrar saída</Button>
            <Button tamanho="sm" variante="ghost" onClick={() => onAcao("cancelar", d)}>Cancelar</Button>
          </>
        )}
        <Button tamanho="sm" variante="danger" onClick={() => onAcao("excluir", d)}>Excluir</Button>
      </div>
    </article>
  );
}
