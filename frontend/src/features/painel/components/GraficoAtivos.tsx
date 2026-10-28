import { MESES, MESES_CURTOS } from "@/lib/constantes";
import { escala } from "./escala";
import styles from "./Grafico.module.css";

/** Linha de clientes ativos no fim de cada mês. */
export function GraficoAtivos({ valores, ano, mesDestaque }: { valores: (number | null)[]; ano: number; mesDestaque: number }) {
  const W = 720, H = 250, L = 34, R = 24, T = 26, B = 30, iw = W - L - R, ih = H - T - B;
  const nums = valores.filter((v): v is number => v != null);
  const sc = escala(Math.max(1, ...nums));
  const x = (i: number) => L + (iw * (i + 0.5)) / 12;
  const y = (v: number) => T + ih - (v / sc.topo) * ih;
  const pts = valores.map((v, i) => (v == null ? null : { x: x(i), y: y(v), v, i })).filter((p): p is { x: number; y: number; v: number; i: number } => p != null);
  const linhas = [];
  for (let v = 0; v <= sc.topo; v += sc.passo) linhas.push(v);
  return (
    <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Clientes ativos no fim de cada mês em ${ano}`}>
      {linhas.map((v) => (
        <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={styles.grade} /><text x={L - 8} y={y(v) + 4} textAnchor="end" className={styles.eixo}>{v}</text></g>
      ))}
      {pts.length > 0 && (
        <>
          <path d={`M${pts[0].x},${T + ih}${pts.map((p) => `L${p.x},${p.y}`).join("")}L${pts[pts.length - 1].x},${T + ih}Z`} className={styles.area} />
          <path d={pts.map((p, k) => `${k ? "L" : "M"}${p.x},${p.y}`).join("")} className={styles.linha} />
        </>
      )}
      {pts.map((p) => {
        const grande = mesDestaque ? mesDestaque === p.i + 1 : p === pts[pts.length - 1];
        return (
          <g key={p.i}>
            <title>{`Fim de ${MESES[p.i].toLowerCase()} de ${ano}: ${p.v} clientes ativos`}</title>
            <circle cx={p.x} cy={p.y} r={grande ? 5 : 4} className={styles.ponto} />
            {grande && <text x={p.x} y={p.y - 12} textAnchor="middle" className={styles.valor}>{p.v}</text>}
          </g>
        );
      })}
      {MESES_CURTOS.map((m, i) => <text key={m} x={x(i)} y={H - 10} textAnchor="middle" className={mesDestaque === i + 1 ? styles.eixoForte : styles.eixo}>{m}</text>)}
      <line x1={L} x2={W - R} y1={T + ih} y2={T + ih} className={styles.base} />
    </svg>
  );
}
