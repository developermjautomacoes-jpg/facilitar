import { MESES, MESES_CURTOS } from "@/lib/constantes";
import type { DadosMes } from "../painelDados";
import { escala } from "./escala";
import styles from "./Grafico.module.css";

/** Barras agrupadas de entradas × saídas por mês. */
export function GraficoEntradasSaidas({ meses, ano, mesDestaque }: { meses: DadosMes[]; ano: number; mesDestaque: number }) {
  const W = 720, H = 270, L = 34, R = 10, T = 24, B = 30, iw = W - L - R, ih = H - T - B;
  const max = Math.max(1, ...meses.map((m) => Math.max(m.entradas, m.saidas)));
  const sc = escala(max);
  const y = (v: number) => T + ih - (v / sc.topo) * ih;
  const gw = iw / 12, bw = Math.min(20, (gw - 12) / 2);
  const linhas = [];
  for (let v = 0; v <= sc.topo; v += sc.passo) linhas.push(v);
  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Entradas e saídas por mês em ${ano}`}>
      {linhas.map((v) => (
        <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={styles.grade} /><text x={L - 8} y={y(v) + 4} textAnchor="end" className={styles.eixo}>{v}</text></g>
      ))}
      {meses.map((m, i) => {
        const cx = L + gw * i + gw / 2;
        const op = mesDestaque && mesDestaque !== i + 1 ? 0.3 : 1;
        return (
          <g key={i} opacity={op}>
            <title>{`${MESES[i]} de ${ano}: ${m.entradas} entradas, ${m.saidas} saídas`}</title>
            {m.entradas > 0 && <rect x={cx - bw - 1} y={y(m.entradas)} width={bw} height={T + ih - y(m.entradas)} rx={3} className={styles.entrada} />}
            {m.saidas > 0 && <rect x={cx + 1} y={y(m.saidas)} width={bw} height={T + ih - y(m.saidas)} rx={3} className={styles.saida} />}
            {m.entradas > 0 && <text x={cx - bw / 2 - 1} y={y(m.entradas) - 6} textAnchor="middle" className={styles.valor}>{m.entradas}</text>}
            {m.saidas > 0 && <text x={cx + bw / 2 + 1} y={y(m.saidas) - 6} textAnchor="middle" className={styles.valor}>{m.saidas}</text>}
            <text x={cx} y={H - 10} textAnchor="middle" className={mesDestaque === i + 1 ? styles.eixoForte : styles.eixo}>{MESES_CURTOS[i]}</text>
          </g>
        );
      })}
      <line x1={L} x2={W - R} y1={T + ih} y2={T + ih} className={styles.base} />
    </svg>
  );
}
