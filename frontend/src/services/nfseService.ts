import type { AgendaNfse, AmbienteNfse, CertificadoEnvio, CertificadoNfse, ModoBuscaNfse, EmpresaNfse, ListaNotasNfse, PassoCaptura, PassoVerificacao } from "@/types";
import type { NotaXml } from "@/features/nfse/nfseDanfse";
import { baixarArquivo, chamarApi, usuarioAtual } from "./http";

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
export function lerAgenda(): Promise<AgendaNfse> {
  return chamarApi<AgendaNfse>("nfseagenda");
}
export function salvarAgenda(ativo: boolean, hora: string): Promise<AgendaNfse> {
  return chamarApi<AgendaNfse>("nfseagendasalvar", { corpo: { ativo, hora } });
}
export async function definirModo(ambiente: AmbienteNfse, cnpj: string, modo: ModoBuscaNfse): Promise<EmpresaNfse[]> {
  return (await chamarApi<Lista>("nfseacesso", { corpo: { cnpj, modo, ambiente } })).empresas ?? [];
}
type Procurador = { procurador: CertificadoNfse | null; empresas?: EmpresaNfse[] };
export async function lerProcurador(): Promise<CertificadoNfse | null> {
  return (await chamarApi<Procurador>("nfseprocurador")).procurador;
}
/** Importa o certificado com os demais e o define como procurador. */
export async function cadastrarProcurador(ambiente: AmbienteNfse, c: CertificadoEnvio): Promise<Procurador> {
  const { id } = await chamarApi<{ id: string }>("certenviar", { corpo: { ...c, usuario: usuarioAtual() } });
  return chamarApi<Procurador>("nfseprocuradorsalvar", { corpo: { id, ambiente } });
}
export function retirarProcurador(ambiente: AmbienteNfse): Promise<Procurador> {
  return chamarApi<Procurador>("nfseprocuradorsalvar", { corpo: { id: "", ambiente } });
}
