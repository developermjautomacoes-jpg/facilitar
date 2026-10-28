import type { ReactNode } from "react";
import styles from "./DataTable.module.css";

export interface Coluna<T> {
  chave: string;
  titulo: ReactNode;
  render: (linha: T) => ReactNode;
  alinhar?: "esquerda" | "direita" | "centro";
  largura?: string;
}

interface Props<T> {
  colunas: Coluna<T>[];
  linhas: T[];
  chaveLinha: (linha: T) => string;
  vazio?: ReactNode;
  rodape?: ReactNode;
  linhaClasse?: (linha: T) => string | undefined;
}

export function DataTable<T>({ colunas, linhas, chaveLinha, vazio, rodape, linhaClasse }: Props<T>) {
  return (
    <div className={styles.wrap}>
      <table className={styles.tabela}>
        <thead>
          <tr>{colunas.map((c) => <th key={c.chave} className={styles[c.alinhar ?? "esquerda"]} style={c.largura ? { width: c.largura } : undefined}>{c.titulo}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? (
            <tr><td colSpan={colunas.length} className={styles.vazio}>{vazio ?? "Nenhum registro."}</td></tr>
          ) : (
            linhas.map((l) => (
              <tr key={chaveLinha(l)} className={linhaClasse ? styles[linhaClasse(l) ?? ""] : undefined}>
                {colunas.map((c) => <td key={c.chave} className={styles[c.alinhar ?? "esquerda"]} data-titulo={typeof c.titulo === "string" ? c.titulo : undefined}>{c.render(l)}</td>)}
              </tr>
            ))
          )}
        </tbody>
        {rodape && <tfoot>{rodape}</tfoot>}
      </table>
    </div>
  );
}
