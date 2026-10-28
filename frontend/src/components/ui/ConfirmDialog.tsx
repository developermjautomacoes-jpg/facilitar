import type { ReactNode } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface Props { aberto: boolean; titulo: string; children: ReactNode; confirmar: string; perigo?: boolean; carregando?: boolean; onConfirmar: () => void; onCancelar: () => void }

export function ConfirmDialog({ aberto, titulo, children, confirmar, perigo, carregando, onConfirmar, onCancelar }: Props) {
  return (
    <Modal aberto={aberto} titulo={titulo} onFechar={onCancelar} largura="sm"
      rodape={<>
        <Button onClick={onCancelar}>Voltar</Button>
        <Button variante={perigo ? "danger" : "primary"} carregando={carregando} onClick={onConfirmar}>{confirmar}</Button>
      </>}>
      {children}
    </Modal>
  );
}
