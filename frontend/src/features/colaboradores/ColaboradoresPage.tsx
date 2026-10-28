import { useEffect, useMemo, useState } from "react";
import type { Colaborador, ColaboradorEntrada } from "@/types";
import { Badge, Button, Card, ChipGroup, ConfirmDialog, DataTable, Icon, Input, Loading, Notice, PageHeader, useToast } from "@/components/ui";
import { DEPARTAMENTOS_PADRAO } from "@/lib/constantes";
import { dataBr, formatarCnpj } from "@/lib/format";
import { clienteInativo, empresasDoColaborador, memorandoAtivo } from "@/lib/memorando";
import { excluirColaborador, salvarColaborador } from "@/services/colaboradoresService";
import { useMemorandos } from "@/features/memorandos/MemorandosContext";
import { ColaboradorLista } from "./components/ColaboradorLista";
import { useColaboradores } from "./useColaboradores";
import styles from "./ColaboradoresPage.module.css";

const VAZIO: ColaboradorEntrada = { nome: "", cargo: "", email: "", telefone: "", setores: [], ativo: true };

export function ColaboradoresPage() {
  const { colaboradores, setColaboradores, carregando, erro } = useColaboradores();
  const { memorandos } = useMemorandos();
  const avisar = useToast();
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [form, setForm] = useState<ColaboradorEntrada>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const atual = colaboradores.find((c) => c.id === selecionado) ?? null;
  useEffect(() => { setForm(atual ? { ...VAZIO, ...atual } : VAZIO); }, [atual]);

  const setoresDisponiveis = useMemo(() => [...new Set([...DEPARTAMENTOS_PADRAO, ...memorandos.flatMap((d) => (d.deps ?? []).map((x) => x.nome)), ...(form.setores ?? [])])], [memorandos, form.setores]);
  const filtrados = colaboradores.filter((c) => !busca || `${c.nome} ${c.cargo ?? ""}`.toLowerCase().includes(busca.toLowerCase()));
  const empresas = atual ? empresasDoColaborador(memorandos, atual) : [];

  async function salvar() {
    if (!form.nome.trim()) { avisar("Informe o nome do colaborador.", "erro"); return; }
    setSalvando(true);
    try {
      const r = await salvarColaborador({ ...form, id: selecionado ?? undefined });
      setColaboradores(r.colaboradores); setSelecionado(r.id);
      avisar("Colaborador salvo.", "sucesso");
    } catch (e) { avisar(e instanceof Error ? e.message : "Não foi possível salvar.", "erro"); }
    finally { setSalvando(false); }
  }
  async function excluir() {
    if (!selecionado) return;
    setSalvando(true);
    try { setColaboradores(await excluirColaborador(selecionado)); setSelecionado(null); avisar("Colaborador excluído.", "sucesso"); }
    catch (e) { avisar(e instanceof Error ? e.message : "Não foi possível excluir.", "erro"); }
    finally { setSalvando(false); setExcluindo(false); }
  }

  if (carregando) return <Loading />;
  return (
    <>
      <PageHeader titulo="Colaboradores" descricao="Cadastre a equipe para vincular os responsáveis em cada memorando. As empresas de cada colaborador aparecem conforme os vínculos."
        acoes={<Button variante="primary" icone={<Icon nome="mais" />} onClick={() => setSelecionado(null)}>Novo colaborador</Button>} />
      {erro && <Notice tom="erro">{erro}</Notice>}
      <div className={styles.grade}>
        <div className={styles.coluna}>
          <Input rotulo="Pesquisar" type="search" placeholder="Nome ou cargo" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <ColaboradorLista colaboradores={filtrados} selecionado={selecionado} onSelecionar={setSelecionado}
            empresas={(c: Colaborador) => empresasDoColaborador(memorandos, c).filter((x) => memorandoAtivo(x.memorando)).length}
            vazio={colaboradores.length ? "Nenhum colaborador encontrado." : "Nenhum colaborador cadastrado. Use o formulário para cadastrar o primeiro."} />
        </div>
        <div className={styles.coluna}>
          <Card titulo={selecionado ? "Editar colaborador" : "Novo colaborador"}>
            <div className={styles.campos}>
              <Input rotulo="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={styles.largo} />
              <Input rotulo="Cargo" placeholder="Ex.: Analista fiscal" value={form.cargo ?? ""} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
              <Input rotulo="E-mail" type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input rotulo="Telefone / ramal" value={form.telefone ?? ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
              <div className={styles.largo}><ChipGroup rotulo="Setores em que atua" opcoes={setoresDisponiveis} marcadas={form.setores ?? []} onChange={(v) => setForm({ ...form, setores: v })} /></div>
              <label className={styles.ativo}><input type="checkbox" checked={form.ativo !== false} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo</label>
            </div>
            <div className={styles.acoes}>
              <Button variante="primary" carregando={salvando} onClick={salvar}>Salvar colaborador</Button>
              {selecionado && <Button variante="danger" onClick={() => setExcluindo(true)}>Excluir</Button>}
            </div>
          </Card>
          {atual && (
            <Card titulo={`Empresas vinculadas (${empresas.length})`} descricao="Empresas em que o colaborador é responsável por algum setor no memorando." semPadding>
              <DataTable chaveLinha={(x) => x.memorando._id} linhas={empresas} vazio="Nenhuma empresa vinculada."
                colunas={[
                  { chave: "emp", titulo: "Empresa", render: (x) => <><b>{x.memorando.e_razao}</b><br /><small>{formatarCnpj(x.memorando.e_cnpj)}</small></> },
                  { chave: "set", titulo: "Setores", render: (x) => x.setores.join(", ") },
                  { chave: "sit", titulo: "Situação", render: (x) => clienteInativo(x.memorando) ? <Badge tom="alerta">saiu em {dataBr(x.memorando.dataSaida)}</Badge> : <Badge tom="sucesso">ativa</Badge> },
                ]} />
            </Card>
          )}
        </div>
      </div>
      <ConfirmDialog aberto={excluindo} titulo="Excluir colaborador" confirmar="Excluir" perigo carregando={salvando} onConfirmar={excluir} onCancelar={() => setExcluindo(false)}>
        <p>Excluir <b>{atual?.nome}</b>? Os memorandos continuam com o nome do responsável, mas sem o vínculo ao cadastro.</p>
      </ConfirmDialog>
    </>
  );
}
