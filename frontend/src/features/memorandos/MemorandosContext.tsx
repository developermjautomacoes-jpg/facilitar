import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Memorando } from "@/types";
import { listarMemorandos } from "@/services/memorandosService";

interface Estado { memorandos: Memorando[]; carregando: boolean; erro: string; recarregar: () => Promise<void> }
const Ctx = createContext<Estado | null>(null);

/** Arquivo de memorandos compartilhado entre Painel, Arquivo e Colaboradores (uma única carga). */
export function MemorandosProvider({ children }: { children: ReactNode }) {
  const [memorandos, setMemorandos] = useState<Memorando[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const recarregar = useCallback(async () => {
    try { setMemorandos(await listarMemorandos()); setErro(""); }
    catch (e) { setErro(e instanceof Error ? e.message : "Erro ao carregar."); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => {
    void recarregar();
    const t = setInterval(() => { if (!document.hidden) void recarregar(); }, 60000);
    return () => clearInterval(t);
  }, [recarregar]);
  const valor = useMemo(() => ({ memorandos, carregando, erro, recarregar }), [memorandos, carregando, erro, recarregar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useMemorandos(): Estado {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMemorandos fora do MemorandosProvider");
  return c;
}
