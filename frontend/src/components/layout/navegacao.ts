import type { NomeIcone } from "@/components/ui";

export interface ItemMenu { rota: string; rotulo: string; icone: NomeIcone; descricao: string; nivel?: number }

/** Itens do menu lateral (um por módulo em src/features). */
export const MENU: ItemMenu[] = [
  { rota: "/painel", rotulo: "Painel gerencial", icone: "painel", descricao: "Indicadores da carteira de clientes", nivel: 5 },
  { rota: "/agenda", rotulo: "Agenda", icone: "agenda", descricao: "Reuniões, tarefas e eventos do escritório (Google Agenda)" },
  { rota: "/memorandos/novo", rotulo: "Novo memorando", icone: "memorando", descricao: "Memorando de entrada de empresa", nivel: 4 },
  { rota: "/memorandos", rotulo: "Arquivo de memorandos", icone: "arquivo", descricao: "Memorandos salvos, situação e histórico" },
  { rota: "/colaboradores", rotulo: "Colaboradores", icone: "colaboradores", descricao: "Equipe e empresas vinculadas" },
  { rota: "/nfse", rotulo: "Captura de NFS-e", icone: "nfse", descricao: "Notas de serviço das empresas, direto do Ambiente Nacional" },
  { rota: "/dfe", rotulo: "Captura de NF-e e CT-e", icone: "nfse", descricao: "Documentos recebidos pelas empresas, direto do Ambiente Nacional" },
  { rota: "/planejamento", rotulo: "Planejamento tributário", icone: "planejamento", descricao: "Simples × Presumido × Real com a reforma", nivel: 3 },
  { rota: "/precificacao", rotulo: "Precificação", icone: "preco", descricao: "Preço de venda com a reforma tributária" },
  { rota: "/usuarios", rotulo: "Usuários e acessos", icone: "colaboradores", descricao: "Logins, níveis e empresas restritas", nivel: 5 },
  { rota: "/configuracoes", rotulo: "Configurações", icone: "config", descricao: "Certificados digitais e Google Agenda", nivel: 5 },
];

/** Páginas fora do menu, só para o título do cabeçalho. */
export const PAGINAS: ItemMenu[] = [...MENU, { rota: "/perfil", rotulo: "Meu perfil", icone: "colaboradores", descricao: "Dados e foto do usuário" }];
