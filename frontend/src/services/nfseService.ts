import type { AmbienteNfse, EmpresaNfse, ListaNotasNfse, PassoCaptura, PassoVerificacao } from "@/types";
import type { NotaXml } from "@/features/nfse/nfseDanfse";
import { baixarArquivo, chamarApi } from "./http";

type Lista = { empresas: EmpresaNfse[] };

export async function listarEmpresas(ambiente: AmbienteNfse): Promise<EmpresaNfse[]> {
  return (await chamarApi<Lista>("nfseempresas", { query: { ambiente } })).empresas ?? [];
}
export async function salvarEmpresa(ambiente: AmbienteNfse, e: { cnpj: string; razao: string; certId: string }): Promise<EmpresaNfse[]> {
  return (await chamarApi<Lista>("nfseempresasalvar", { corpo: { ...e, ambiente } })).empresas ?? [];
}
export async function excluirEmpresa(ambiente: AmbienteNfse, cnpj: string): Promise<EmpresaNfse[]> {
  return (await chamarApi<Lista>("nfseempresaexcluir", { corpo: { cnpj, ambiente } })).empresas ?? [];
}
export async function reiniciarCaptura(ambiente: AmbienteNfse, cnpj: string): Promise<EmpresaNfse[]> {
  return (await chamarApi<Lista>("nfsereiniciar", { corpo: { cnpj, ambiente } })).empresas ?? [];
}
/** Busca um lote (até 50 documentos). Quem repete, com pausa, é a tela. */
export function capturarLote(ambiente: AmbienteNfse, cnpj: string): Promise<PassoCaptura> {
  return chamarApi<PassoCaptura>("nfsecapturar", { corpo: { cnpj, ambiente } });
}
export function listarNotas(ambiente: AmbienteNfse, cnpj: string, competencia?: string): Promise<ListaNotasNfse> {
  return chamarApi<ListaNotasNfse>("nfsenotas", { query: { ambiente, cnpj, ...(competencia ? { competencia } : {}) } });
}
export function verificarEventos(ambiente: AmbienteNfse, cnpj: string, chave: string): Promise<PassoVerificacao> {
  return chamarApi<PassoVerificacao>("nfseverificar", { corpo: { cnpj, chave, ambiente } });
}
export async function diagnosticar(ambiente: AmbienteNfse, cnpj: string): Promise<string[]> {
  return (await chamarApi<{ linhas: string[] }>("nfsediagnostico", { corpo: { cnpj, ambiente } })).linhas ?? [];
}
export function baixarXmls(ambiente: AmbienteNfse, cnpj: string, competencia: string, chaves?: string[]): Promise<void> {
  const nome = `NFSe-${cnpj}-${competencia}${chaves ? "-selecionadas" : ""}.zip`;
  return baixarArquivo("nfsezip", { ambiente, cnpj, competencia }, nome, chaves ? { chaves } : undefined);
}
export async function buscarXmls(ambiente: AmbienteNfse, cnpj: string, chaves: string[]): Promise<NotaXml[]> {
  return (await chamarApi<{ notas: NotaXml[] }>("nfsexmls", { corpo: { cnpj, chaves, ambiente } })).notas ?? [];
}
