/** Credencial usada pelo api.php (cabeçalho X-Senha). O nome identifica quem fez cada alteração. */
export interface Credencial {
  nome: string;
  senha: string;
}
