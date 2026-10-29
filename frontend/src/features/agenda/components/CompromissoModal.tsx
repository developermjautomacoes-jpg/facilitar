import { useEffect, useState } from "react";
import type { Colaborador, Compromisso, CompromissoEntrada, TipoCompromisso } from "@/types";
import { Button, Input, Modal, Select, Textarea } from "@/components/ui";
import { somarDias, TIPOS } from "@/lib/agenda";
import { hojeISO, pad } from "@/lib/format";
import styles from "./CompromissoModal.module.css";

interface Props {
  aberto: boolean;
  compromisso: Compromisso | null;
  diaInicial: string;
  colaboradores: Colaborador[];
  salvando: boolean;
  onSalvar: (e: CompromissoEntrada) => void;
  onExcluir: (c: Compromisso) => void;
  onFechar: () => void;
}

interface Form { tipo: TipoCompromisso; titulo: string; diaInteiro: boolean; dataIni: string; horaIni: string; dataFim: string; horaFim: string; local: string; descricao: string; responsavelId: string; concluida: boolean }

function proximaHora(): string { const h = Math.min(new Date().getHours() + 1, 22); return `${pad(h, 2)}:00`; }
function maisUmaHora(h: string): string { const [hh, mm] = h.split(":").map(Number); const t = Math.min(hh * 60 + mm + 60, 23 * 60 + 59); return `${pad(Math.floor(t / 60), 2)}:${pad(t % 60, 2)}`; }

function formDe(c: Compromisso | null, dia: string): Form {
  if (!c) { const h = proximaHora(); return { tipo: "reuniao", titulo: "", diaInteiro: false, dataIni: dia || hojeISO(), horaIni: h, dataFim: dia || hojeISO(), horaFim: maisUmaHora(h), local: "", descricao: "", responsavelId: "", concluida: false }; }
  const fimData = c.diaInteiro ? somarDias(c.fim.slice(0, 10), -1) : c.fim.slice(0, 10);
  return { tipo: c.tipo, titulo: c.titulo, diaInteiro: c.diaInteiro, dataIni: c.inicio.slice(0, 10), horaIni: c.diaInteiro ? "09:00" : c.inicio.slice(11, 16),
    dataFim: fimData < c.inicio.slice(0, 10) ? c.inicio.slice(0, 10) : fimData, horaFim: c.diaInteiro ? "10:00" : c.fim.slice(11, 16),
    local: c.local, descricao: c.descricao, responsavelId: c.responsavelId, concluida: c.concluida };
}

export function CompromissoModal({ aberto, compromisso, diaInicial, colaboradores, salvando, onSalvar, onExcluir, onFechar }: Props) {
  const [f, setF] = useState<Form>(() => formDe(compromisso, diaInicial));
  const [erro, setErro] = useState("");
  useEffect(() => { if (aberto) { setF(formDe(compromisso, diaInicial)); setErro(""); } }, [aberto, compromisso, diaInicial]);
  const mudar = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));

  function escolherTipo(t: TipoCompromisso) {
    // tarefa nova começa como dia inteiro; reunião nova, com horário
    if (!compromisso && t === "tarefa" && f.tipo !== "tarefa") mudar({ tipo: t, diaInteiro: true });
    else if (!compromisso && t === "reuniao" && f.tipo === "tarefa") mudar({ tipo: t, diaInteiro: false });
    else mudar({ tipo: t });
  }

  function salvar() {
    if (!f.titulo.trim()) { setErro("Informe o título."); return; }
    if (!f.dataIni) { setErro("Informe a data."); return; }
    let inicio: string, fim: string;
    if (f.diaInteiro) { inicio = f.dataIni; fim = f.dataFim && f.dataFim >= f.dataIni ? f.dataFim : f.dataIni; }
    else {
      inicio = `${f.dataIni}T${f.horaIni}`; fim = `${f.diaInteiro ? f.dataFim : f.dataFim || f.dataIni}T${f.horaFim}`;
      if (fim <= inicio) { setErro("O horário de fim precisa ser depois do início."); return; }
    }
    const resp = colaboradores.find((c) => c.id === f.responsavelId);
    onSalvar({ id: compromisso?.id, tipo: f.tipo, titulo: f.titulo.trim(), descricao: f.descricao, local: f.local.trim(), inicio, fim, diaInteiro: f.diaInteiro,
      concluida: f.tipo === "tarefa" && f.concluida, responsavelId: resp?.id ?? "", responsavel: resp?.nome ?? (f.responsavelId ? compromisso?.responsavel ?? "" : ""), criadoPor: compromisso?.criadoPor });
  }

  const ativos = colaboradores.filter((c) => c.ativo !== false || c.id === f.responsavelId);
  return (
    <Modal aberto={aberto} onFechar={onFechar} largura="md" titulo={compromisso ? "Editar compromisso" : "Novo compromisso"}
      rodape={<>
        {compromisso && <Button variante="danger" onClick={() => onExcluir(compromisso)} className={styles.esquerda}>Excluir</Button>}
        {compromisso?.link && <a className={styles.google} href={compromisso.link} target="_blank" rel="noopener noreferrer">Abrir no Google Agenda</a>}
        <Button onClick={onFechar}>Cancelar</Button>
        <Button variante="primary" carregando={salvando} onClick={salvar}>Salvar</Button>
      </>}>
      <div className={styles.form}>
        <div className={styles.tipos} role="radiogroup" aria-label="Tipo">
          {TIPOS.map((t) => (
            <button key={t.valor} type="button" role="radio" aria-checked={f.tipo === t.valor} className={[styles.tipo, styles[t.valor], f.tipo === t.valor ? styles.on : ""].join(" ")} onClick={() => escolherTipo(t.valor)}>
              <i aria-hidden />{t.rotulo}
            </button>
          ))}
        </div>
        <Input rotulo="Título" value={f.titulo} autoFocus onChange={(e) => mudar({ titulo: e.target.value })}
          placeholder={f.tipo === "reuniao" ? "Ex.: Reunião de alinhamento fiscal" : f.tipo === "tarefa" ? "Ex.: Entregar ECF da empresa X" : "Ex.: Palestra CRC-ES"} erro={erro && !f.titulo.trim() ? erro : undefined} />
        <label className={styles.check}><input type="checkbox" checked={f.diaInteiro} onChange={(e) => mudar({ diaInteiro: e.target.checked })} /> Dia inteiro</label>
        <div className={styles.datas}>
          <Input rotulo={f.diaInteiro ? "De" : "Data"} type="date" value={f.dataIni} onChange={(e) => mudar({ dataIni: e.target.value, dataFim: !f.dataFim || f.dataFim < e.target.value || !f.diaInteiro ? e.target.value : f.dataFim })} />
          {f.diaInteiro
            ? <Input rotulo="Até" type="date" value={f.dataFim} min={f.dataIni} onChange={(e) => mudar({ dataFim: e.target.value })} />
            : <>
              <Input rotulo="Início" type="time" value={f.horaIni} onChange={(e) => mudar({ horaIni: e.target.value, horaFim: f.horaFim <= e.target.value ? maisUmaHora(e.target.value) : f.horaFim })} />
              <Input rotulo="Fim" type="time" value={f.horaFim} onChange={(e) => mudar({ horaFim: e.target.value })} />
            </>}
        </div>
        {erro && f.titulo.trim() && <p className={styles.erro}>{erro}</p>}
        <div className={styles.datas2}>
          <Select rotulo="Responsável" value={f.responsavelId} onChange={(e) => mudar({ responsavelId: e.target.value })}>
            <option value="">{compromisso?.responsavel && !compromisso.responsavelId ? compromisso.responsavel : "Sem responsável"}</option>
            {ativos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
          <Input rotulo={f.tipo === "reuniao" ? "Local ou link da reunião" : "Local"} value={f.local} onChange={(e) => mudar({ local: e.target.value })} placeholder={f.tipo === "reuniao" ? "Sala, endereço ou link do Meet/Teams" : ""} />
        </div>
        <Textarea rotulo="Descrição" rows={4} value={f.descricao} onChange={(e) => mudar({ descricao: e.target.value })} />
        {f.tipo === "tarefa" && <label className={styles.check}><input type="checkbox" checked={f.concluida} onChange={(e) => mudar({ concluida: e.target.checked })} /> Tarefa concluída</label>}
        {compromisso && !compromisso.doSistema && <p className={styles.nota}>Criado direto no Google Agenda. Ao salvar aqui, ele passa a ter tipo e responsável no sistema.</p>}
      </div>
    </Modal>
  );
}
