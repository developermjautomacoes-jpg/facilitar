import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import styles from "./Toast.module.css";

type Tipo = "info" | "sucesso" | "erro";
interface Aviso { id: number; texto: string; tipo: Tipo }
const Ctx = createContext<(texto: string, tipo?: Tipo) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const seq = useRef(0);
  const avisar = useCallback((texto: string, tipo: Tipo = "info") => {
    const id = ++seq.current;
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className={styles.pilha} role="status" aria-live="polite">
        {avisos.map((a) => <div key={a.id} className={[styles.toast, styles[a.tipo]].join(" ")}>{a.texto}</div>)}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
