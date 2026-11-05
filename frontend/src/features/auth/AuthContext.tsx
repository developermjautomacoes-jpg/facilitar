import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Credencial, NivelAcesso } from "@/types";
import { credencialSalva, sair as sairApi } from "@/services/authService";
import { aoPerderAcesso } from "@/services/http";

const RANK: Record<NivelAcesso, number> = { auxiliar: 1, assistente: 2, analista: 3, encarregado: 4, gerente: 5, socia: 5 };

interface Auth {
  usuario: string | null;
  rank: number;
  facilitar: boolean;
  trocarSenha: boolean;
  aplicar: (c: Credencial | null) => void;
  sair: () => void;
}
const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [cred, setCred] = useState<Credencial | null>(() => credencialSalva());
  const sair = useCallback(() => { sairApi(); setCred(null); }, []);
  // se a sessão expirar ou for encerrada, volta para o login
  useEffect(() => { aoPerderAcesso(sair); return () => aoPerderAcesso(null); }, [sair]);
  const valor = useMemo(() => ({ usuario: cred?.nome ?? null, rank: cred?.nivel ? RANK[cred.nivel] : 0, facilitar: !!cred?.facilitar, trocarSenha: !!cred?.trocarSenha, aplicar: setCred, sair }), [cred, sair]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}
