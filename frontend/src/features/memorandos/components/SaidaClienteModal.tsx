import { useEffect, useState } from "react";
import type { Memorando, SaidaCliente } from "@/types";
import { Button, Input, Modal, Select } from "@/components/ui";
import { MOTIVOS_SAIDA } from "@/lib/constantes";
import { hojeISO, numeroMemorando } from "@/lib/format";
import styles from "./SaidaClienteModal.module.css";

interface Props { memorando: Memorando | null; salvando: boolean; onCancelar: () => void; onConfirmar: (s: SaidaCliente) => void }

export function SaidaClienteModal({ memorando, salvando, onCancelar, onConfirmar }: Props) {
  const [saida, setSaida] = useState<SaidaCliente>({ dataSaida: hojeISO(), motivoSaida: MOTIVOS_SAIDA[0], obsSaida: "" });
  useEffect(() => { if (memorando) setSaida({ dataSaida: hojeISO(), motivoSaida: MOTIVOS_SAIDA[0], obsSaida: "" }); }, [memorando]);
  return (
    <Modal aberto={!!memorando} onFechar={onCancelar} largura="sm"
      titulo={memorando ? `Saída do cliente · Nº ${numeroMemorando(memorando.seq, memorando.ano)}` : ""}
      rodape={<>
        <Button onClick={onCancelar}>Voltar</Button>
        <Button variante="primary" carregando={salvando} disabled={!saida.dataSaida} onClick={() => onConfirmar({ ...saida, obsSaida: saida.obsSaida.trim() })}>Registrar saída</Button>
      </>}>
      <div className={styles.campos}>
        <p className={styles.empresa}>{memorando?.e_razao}</p>
        <Input rotulo="Data da saída" type="date" value={saida.dataSaida} onChange={(e) => setSaida({ ...saida, dataSaida: e.target.value })} />
        <Select rotulo="Motivo" value={saida.motivoSaida} onChange={(e) => setSaida({ ...saida, motivoSaida: e.target.value })}>
          {MOTIVOS_SAIDA.map((m) => <option key={m}>{m}</option>)}
        </Select>
        <Input rotulo="Observação" value={saida.obsSaida} onChange={(e) => setSaida({ ...saida, obsSaida: e.target.value })} />
      </div>
    </Modal>
  );
}
