/** Passo e topo "redondos" para o eixo vertical dos gráficos. */
export function escala(max: number): { passo: number; topo: number } {
  const passo = max <= 5 ? 1 : max <= 10 ? 2 : Math.ceil(max / 5);
  return { passo, topo: Math.max(passo, Math.ceil(max / passo) * passo) };
}
