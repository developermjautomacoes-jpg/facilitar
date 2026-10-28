import type { Certificado, CertificadoEnvio } from "@/types";
import { chamarApi, usuarioAtual } from "./http";

type Lista = { certificados: Certificado[] };

export async function listarCertificados(): Promise<Certificado[]> {
  return (await chamarApi<Lista>("certlistar")).certificados ?? [];
}
export async function enviarCertificado(c: CertificadoEnvio): Promise<Certificado[]> {
  return (await chamarApi<Lista>("certenviar", { corpo: { ...c, usuario: usuarioAtual() } })).certificados ?? [];
}
export async function definirPadrao(id: string): Promise<Certificado[]> {
  return (await chamarApi<Lista>("certpadrao", { corpo: { id } })).certificados ?? [];
}
export async function removerCertificado(id: string): Promise<Certificado[]> {
  return (await chamarApi<Lista>("certremover", { corpo: { id } })).certificados ?? [];
}
