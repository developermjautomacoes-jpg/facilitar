import { iniciais } from "@/lib/format";
import styles from "./Avatar.module.css";

/** Foto do usuário ou iniciais, em círculo com borda dourada. */
export function Avatar({ nome, foto, tamanho = 38 }: { nome: string; foto?: string; tamanho?: number }) {
  return (
    <span className={styles.avatar} style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.36) }} aria-hidden>
      {foto ? <img src={foto} alt="" className={styles.foto} /> : iniciais(nome)}
    </span>
  );
}
