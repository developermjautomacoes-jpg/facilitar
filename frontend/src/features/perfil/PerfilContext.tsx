import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Perfil } from "@/types";
import { obterPerfil, salvarPerfil } from "@/services/perfilService";

type DadosPerfil = Omit<Perfil, "usuario" | "criadoEm" | "atualizadoEm">;
interface Estado { perfil: Perfil | null; salvar: (p: DadosPerfil) => Promise<void> }
const Ctx = createContext<Estado | null>(null);

/** Perfil do usuário logado: carregado uma vez e usado no cabeçalho e na tela de perfil. */
export function PerfilProvider({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  useEffect(() => { obterPerfil().then(setPerfil).catch(() => setPerfil(null)); }, []);
  const salvar = useCallback(async (p: DadosPerfil) => { setPerfil(await salvarPerfil(p)); }, []);
  const valor = useMemo(() => ({ perfil, salvar }), [perfil, salvar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function usePerfil(): Estado {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePerfil fora do PerfilProvider");
  return c;
}
