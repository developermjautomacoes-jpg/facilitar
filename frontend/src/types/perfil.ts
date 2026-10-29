/** Perfil do usuário (gravado pelo api.php em /data/perfis, um por nome de usuário). */
export interface Perfil {
  usuario: string;
  nomeExibicao: string;
  cargo: string;
  email: string;
  telefone: string;
  foto: string; // data URL (JPEG), já recortada
  criadoEm?: string;
  atualizadoEm?: string;
}
