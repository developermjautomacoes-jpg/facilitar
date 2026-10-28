export interface Certificado {
  id: string;
  titular?: string;
  documento?: string;
  tipo?: string;
  validade?: string;
  apelido?: string;
  origem?: string;
  enviadoPor?: string;
  enviadoEm?: string;
  padrao: boolean;
}

export interface CertificadoEnvio {
  pfx: string; // conteúdo do .pfx/.p12 em base64
  senha: string;
  apelido: string;
  padrao: boolean;
}
