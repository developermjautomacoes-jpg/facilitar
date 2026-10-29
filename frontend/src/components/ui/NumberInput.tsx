import { useEffect, useState } from "react";
import { lerNumero, numeroBr } from "@/lib/format";
import { Input } from "./Field";

interface Props { rotulo: string; valor: number; onChange: (v: number) => void; sufixo?: "%" | "R$"; casas?: number; dica?: string; className?: string; placeholder?: string }

/** Campo numérico no formato brasileiro (1.234,56), com prefixo R$ ou sufixo %. */
export function NumberInput({ rotulo, valor, onChange, sufixo, casas = 2, dica, className, placeholder }: Props) {
  const [texto, setTexto] = useState(numeroBr(valor, casas));
  const [editando, setEditando] = useState(false);
  useEffect(() => { if (!editando) setTexto(numeroBr(valor, casas)); }, [valor, casas, editando]);
  return (
    <Input
      rotulo={sufixo ? `${rotulo} (${sufixo})` : rotulo}
      inputMode="decimal"
      value={texto}
      placeholder={placeholder}
      dica={dica}
      className={className}
      onFocus={() => setEditando(true)}
      onChange={(e) => { setTexto(e.target.value); onChange(lerNumero(e.target.value)); }}
      onBlur={() => { setEditando(false); setTexto(numeroBr(lerNumero(texto), casas)); }}
    />
  );
}
