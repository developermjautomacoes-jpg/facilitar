import type { AmbienteNfse, EmissaoPropria, EmpresaDfe, ListaDfe, PassoCiencia, PassoDfe, ServicoDfe } from "@/types";
import { baixarArquivo, chamarApi } from "./http";

type Lista = { empresas: EmpresaDfe[] };

export async function listarEmpresasDfe(ambiente: AmbienteNfse): Promise<EmpresaDfe[]> {
  return (await chamarApi<Lista>("dfeempresas", { query: { ambiente } })).empresas ?? [];
}
export async function definirCiencia(ambiente: AmbienteNfse, cnpj: string, ativo: boolean): Promise<EmpresaDfe[]> {
  return (await chamarApi<Lista>("dfeciencia_config", { corpo: { cnpj, ativo, ambiente } })).empresas ?? [];
}
export async function definirCapturaAuto(ambiente: AmbienteNfse, cnpj: string, ativo: boolean): Promise<EmpresaDfe[]> {
  return (await chamarApi<Lista>("dfecaptura_config", { corpo: { cnpj, ativo, ambiente } })).empresas ?? [];
}
/** Busca um lote (até 50 documentos). Quem repete, com pausa, é a tela. */
export function capturarDfe(ambiente: AmbienteNfse, cnpj: string, servico: ServicoDfe): Promise<PassoDfe> {
  return chamarApi<PassoDfe>("dfecapturar", { corpo: { cnpj, servico, ambiente } });
}
export function enviarCiencias(ambiente: AmbienteNfse, cnpj: string): Promise<PassoCiencia> {
  return chamarApi<PassoCiencia>("dfecienciaenviar", { corpo: { cnpj, ambiente } });
}
export function marcarCiencia(ambiente: AmbienteNfse, cnpj: string, chaves: string[]): Promise<{ marcadas: number }> {
  return chamarApi<{ marcadas: number }>("dfecienciamarcar", { corpo: { cnpj, chaves, ambiente } });
}
export function listarDocumentos(ambiente: AmbienteNfse, cnpj: string, servico: ServicoDfe, competencia?: string): Promise<ListaDfe> {
  return chamarApi<ListaDfe>("dfedocs", { query: { ambiente, cnpj, servico, ...(competencia ? { competencia } : {}) } });
}
export async function reiniciarDfe(ambiente: AmbienteNfse, cnpj: string, servico: ServicoDfe): Promise<EmpresaDfe[]> {
  return (await chamarApi<Lista>("dfereiniciar", { corpo: { cnpj, servico, ambiente } })).empresas ?? [];
}
export function baixarXmlsDfe(ambiente: AmbienteNfse, cnpj: string, servico: ServicoDfe, competencia: string, chaves?: string[]): Promise<void> {
  return baixarArquivo("dfezip", { ambiente, cnpj, servico, competencia }, `${servico.toUpperCase()}-${cnpj}-${competencia}.zip`, chaves ? { chaves } : undefined);
}
export async function listarEmissao(): Promise<EmissaoPropria[]> {
  return (await chamarApi<{ emissoes: EmissaoPropria[] }>("dfeemissao")).emissoes ?? [];
}
export function importarEmissao(cnpj: string, arquivo: string, xml: string): Promise<EmissaoPropria> {
  return chamarApi<EmissaoPropria>("dfeemissaoimportar", { corpo: { cnpj, arquivo, xml } });
}
export function excluirEmissao(e: EmissaoPropria): Promise<{ ok: boolean }> {
  return chamarApi<{ ok: boolean }>("dfeemissaoexcluir", { corpo: { cnpj: e.cnpj, modelo: e.modelo, serie: e.serie } });
}
