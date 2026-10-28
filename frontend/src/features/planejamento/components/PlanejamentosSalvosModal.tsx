import { useState } from "react";
import type { PlanejamentoResumo } from "@/types";
import { Button, EmptyState, Input, Modal } from "@/components/ui";
import { dataHora } from "@/lib/format";
import styles from "./PlanejamentosSalvosModal.module.css";

interface Props { aberto: boolean; lista: PlanejamentoResumo[]; atualId: string | null; onFechar: () => void; onAbrir: (id: string) => void; onExcluir: (p: PlanejamentoResumo) => void }

export function PlanejamentosSalvosModal({ aberto, lista, atualId, onFechar, onAbrir, onExcluir }: Props) {
  const [busca, setBusca] = useState("");
  const q = busca.trim().toLowerCase();
  const itens = lista.filter((p) => !q || [p.cliente, p.resumo, p.criadoPor, p.atualizadoPor].join(" ").toLowerCase().includes(q));
  return (
    <Modal aberto={aberto} titulo="Planejamentos salvos" onFechar={onFechar} largura="lg">
      <Input rotulo="Pesquisar" type="search" placeholder="Cliente, resultado ou responsável" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className={styles.lista}>
        {!itens.length ? <EmptyState titulo="Nenhum planejamento">{q ? "Nada encontrado para essa pesquisa." : "Salve um planejamento para ele aparecer aqui."}</EmptyState> : itens.map((p) => (
          <article key={p.id} className={[styles.item, p.id === atualId ? styles.atual : ""].join(" ")}>
            <div className={styles.texto}>
              <b>{p.cliente || "(sem nome)"}</b>
              <small>Atualizado em {dataHora(p.atualizadoEm)}{p.atualizadoPor ? ` por ${p.atualizadoPor}` : ""} · criado em {dataHora(p.criadoEm)}{p.criadoPor ? ` por ${p.criadoPor}` : ""}</small>
              {p.resumo && <p>{p.resumo}</p>}
            </div>
            <div className={styles.acoes}>
              <Button tamanho="sm" variante="primary" onClick={() => onAbrir(p.id)}>Abrir</Button>
              <Button tamanho="sm" variante="danger" onClick={() => onExcluir(p)}>Excluir</Button>
            </div>
          </article>
        ))}
      </div>
    </Modal>
  );
}
