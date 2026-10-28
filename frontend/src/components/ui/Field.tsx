import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId } from "react";
import styles from "./Field.module.css";

interface Base { rotulo: ReactNode; dica?: ReactNode; erro?: string; className?: string }

export function Input({ rotulo, dica, erro, className, id, ...rest }: Base & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId(); const fid = id ?? auto;
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={fid} className={styles.rotulo}>{rotulo}</label>
      <input id={fid} className={styles.controle} aria-invalid={!!erro} {...rest} />
      {erro ? <span className={styles.erro}>{erro}</span> : dica && <span className={styles.dica}>{dica}</span>}
    </div>
  );
}

export function Select({ rotulo, dica, erro, className, id, children, ...rest }: Base & SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId(); const fid = id ?? auto;
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={fid} className={styles.rotulo}>{rotulo}</label>
      <select id={fid} className={styles.controle} {...rest}>{children}</select>
      {erro ? <span className={styles.erro}>{erro}</span> : dica && <span className={styles.dica}>{dica}</span>}
    </div>
  );
}

export function Textarea({ rotulo, dica, erro, className, id, ...rest }: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId(); const fid = id ?? auto;
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={fid} className={styles.rotulo}>{rotulo}</label>
      <textarea id={fid} className={styles.controle} {...rest} />
      {erro ? <span className={styles.erro}>{erro}</span> : dica && <span className={styles.dica}>{dica}</span>}
    </div>
  );
}

/** Grupo de opções marcáveis em formato de "chip". */
export function ChipGroup({ rotulo, opcoes, marcadas, onChange }: { rotulo: ReactNode; opcoes: string[]; marcadas: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className={styles.chips}>
      <legend className={styles.rotulo}>{rotulo}</legend>
      <div className={styles.chipLista}>
        {opcoes.map((o) => {
          const on = marcadas.includes(o);
          return (
            <label key={o} className={[styles.chip, on ? styles.chipOn : ""].join(" ")}>
              <input type="checkbox" checked={on} onChange={() => onChange(on ? marcadas.filter((x) => x !== o) : [...marcadas, o])} />
              {o}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
