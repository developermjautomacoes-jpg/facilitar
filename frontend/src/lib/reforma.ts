/**
 * Regras da transição da reforma tributária do consumo usadas no front-end (precificação).
 * EC 132/2023; LC 214/2025: arts. 343-344 (IBS de teste), 346-347 (CBS 2026 e 2027-2028), 349 (alíquotas de referência),
 * 501 e 508 (redução do ICMS/ISS de 2029 a 2032) e 543 (extinção do ICMS/ISS em 2033).
 */
export interface ParametrosReforma {
  cbsReferencia: number; // % (TCU, 28/10/2026: 11,3%)
  reducaoCbs2027: number; // p.p. (art. 347: 0,1)
  ibsTeste: number; // % em 2027-2028 (art. 344: 0,05% UF + 0,05% Município)
  ibsReferencia: number; // % pleno (estimativa CGIBS, Res. 14/2026: 18,7%)
}

export const PARAMETROS_REFORMA: ParametrosReforma = { cbsReferencia: 11.3, reducaoCbs2027: 0.1, ibsTeste: 0.1, ibsReferencia: 18.7 };

export const ANOS_TRANSICAO = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035];

/** Fator do ICMS/ISS no ano: 100% até 2028; 90%, 80%, 70%, 60% de 2029 a 2032; extintos a partir de 2033. */
export function fatorIcmsIss(ano: number): number {
  if (ano <= 2028) return 1;
  if (ano >= 2033) return 0;
  return { 2029: 0.9, 2030: 0.8, 2031: 0.7, 2032: 0.6 }[ano] ?? 1;
}

/** 2026 é ano de teste: CBS 0,9% e IBS 0,1% destacados, mas compensáveis/dispensados (art. 348). */
export const anoDeTeste = (ano: number): boolean => ano <= 2026;
export const temPisCofins = (ano: number): boolean => ano <= 2026;

/** CBS cobrada no ano (%). */
export function cbsDoAno(ano: number, p: ParametrosReforma = PARAMETROS_REFORMA): number {
  if (anoDeTeste(ano)) return 0;
  return Math.max(p.cbsReferencia - (ano <= 2028 ? p.reducaoCbs2027 : 0), 0);
}

/** IBS cobrado no ano (%): teste em 2027-2028, proporcional de 2029 a 2032 e pleno a partir de 2033. */
export function ibsDoAno(ano: number, p: ParametrosReforma = PARAMETROS_REFORMA): number {
  if (anoDeTeste(ano)) return 0;
  if (ano <= 2028) return p.ibsTeste;
  return p.ibsReferencia * (1 - fatorIcmsIss(ano));
}
