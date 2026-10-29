import type { NomeIcone } from "@/components/ui";

export interface ItemMenu { rota: string; rotulo: string; icone: NomeIcone; descricao: string }

/** Itens do menu lateral (um por módulo em src/features). */
export const MENU: ItemMenu[] = [
  { rota: "/painel", rotulo: "Painel gerencial", icone: "painel", descricao: "Indicadores da carteira de clientes" },
  { rota: "/agenda", rotulo: "Agenda", icone: "agenda", descricao: "Reuniões, tarefas e eventos do escritório (Google Agenda)" },
  { rota: "/memorandos/novo", rotulo: "Novo memorando", icone: "memorando", descricao: "Memorando de entrada de empresa" },
  { rota: "/memorandos", rotulo: "Arquivo de memorandos", icone: "arquivo", descricao: "Memorandos salvos, situação e histórico" },
  { rota: "/colaboradores", rotulo: "Colaboradores", icone: "colaboradores", descricao: "Equipe e empresas vinculadas" },
  { rota: "/planejamento", rotulo: "Planejamento tributário", icone: "planejamento", descricao: "Simples × Presumido × Real com a reforma" },
  { rota: "/precificacao", rotulo: "Precificação", icone: "preco", descricao: "Preço de venda com a reforma tributária" },
  { rota: "/configuracoes", rotulo: "Configurações", icone: "config", descricao: "Certificados digitais e Google Agenda" },
];

/** Páginas fora do menu, só para o título do cabeçalho. */
export const PAGINAS: ItemMenu[] = [...MENU, { rota: "/perfil", rotulo: "Meu perfil", icone: "colaboradores", descricao: "Dados e foto do usuário" }];
