import type { Colaborador } from "@/types";
import { iniciais } from "@/lib/format";
import styles from "./ColaboradorLista.module.css";

interface Props { colaboradores: Colaborador[]; selecionado: string | null; empresas: (c: Colaborador) => number; onSelecionar: (id: string) => void; vazio: string }

export function ColaboradorLista({ colaboradores, selecionado, empresas, onSelecionar, vazio }: Props) {
  if (!colaboradores.length) return <p className={styles.vazio}>{vazio}</p>;
  return (
    <ul className={styles.lista}>
      {colaboradores.map((c) => {
        const n = empresas(c);
        return (
          <li key={c.id}>
            <button type="button" className={[styles.item, c.ativo === false ? styles.inativo : ""].join(" ")} aria-current={selecionado === c.id} onClick={() => onSelecionar(c.id)}>
              <span className={styles.avatar}>{iniciais(c.nome)}</span>
              <span className={styles.texto}><b>{c.nome}</b><small>{c.cargo || "Sem cargo"}{c.ativo === false ? " · inativo" : ""}</small></span>
              <span className={styles.qtd}>{n}<small>{n === 1 ? "empresa" : "empresas"}</small></span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
