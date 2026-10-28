import { useCallback, useEffect, useState } from "react";
import type { Colaborador } from "@/types";
import { listarColaboradores } from "@/services/colaboradoresService";

export function useColaboradores() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const recarregar = useCallback(async () => {
    try { setColaboradores(await listarColaboradores()); setErro(""); }
    catch (e) { setErro(e instanceof Error ? e.message : "Erro ao carregar."); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { void recarregar(); }, [recarregar]);
  return { colaboradores, setColaboradores, carregando, erro, recarregar };
}
