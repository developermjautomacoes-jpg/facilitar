import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { credencialSalva, entrar as entrarApi, sair as sairApi } from "@/services/authService";
import { aoPerderAcesso } from "@/services/http";

interface Auth {
  usuario: string | null;
  entrar: (nome: string, senha: string) => Promise<void>;
  sair: () => void;
}
const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<string | null>(() => credencialSalva()?.nome ?? null);
  const sair = useCallback(() => { sairApi(); setUsuario(null); }, []);
  const entrar = useCallback(async (nome: string, senha: string) => {
    await entrarApi({ nome: nome.trim(), senha });
    setUsuario(nome.trim());
  }, []);
  // se o servidor recusar a senha (trocada no EasyPanel, por exemplo), volta para o login
  useEffect(() => { aoPerderAcesso(sair); return () => aoPerderAcesso(null); }, [sair]);
  const valor = useMemo(() => ({ usuario, entrar, sair }), [usuario, entrar, sair]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}
