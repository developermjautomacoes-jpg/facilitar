import { useCallback, useEffect, useState } from "react";
import type { EmpresaRestrita, NivelAcesso, UsuarioSistema } from "@/types";
import { Badge, Button, Card, DataTable, Input, Loading, Modal, Notice, PageHeader, Select, useToast } from "@/components/ui";
import { dataHora } from "@/lib/format";
import { listarRestritas, listarUsuarios, redefinirSenha, salvarRestritas, salvarUsuario } from "@/services/authService";
import { useAuth } from "@/features/auth/AuthContext";
import styles from "@/features/nfse/NfsePage.module.css";

const NIVEIS: { id: NivelAcesso; nome: string; faz: string }[] = [
  { id: "auxiliar", nome: "Auxiliar", faz: "Consulta e baixa" },
  { id: "assistente", nome: "Assistente", faz: "Consulta e baixa" },
  { id: "analista", nome: "Analista", faz: "Também captura notas e vê planejamentos" },
  { id: "encarregado", nome: "Encarregado", faz: "Também dá ciência, edita memorandos e vê senhas de acesso" },
  { id: "gerente", nome: "Gerente", faz: "Acesso completo" },
  { id: "socia", nome: "Sócia/diretora", faz: "Acesso completo" },
];
const nomeNivel = (n: NivelAcesso) => NIVEIS.find((x) => x.id === n)?.nome ?? n;
interface Form { id?: number; nome: string; login: string; nivel: NivelAcesso; facilitar: boolean; ativo: boolean; senha: string }
const VAZIO: Form = { nome: "", login: "", nivel: "auxiliar", facilitar: false, ativo: true, senha: "" };

export function UsuariosPage() {
  const avisar = useToast();
  const { facilitar } = useAuth();
  const [lista, setLista] = useState<UsuarioSistema[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [redefinir, setRedefinir] = useState<{ u: UsuarioSistema; senha: string } | null>(null);
  const [restritas, setRestritas] = useState<EmpresaRestrita[]>([]);
  const erro = useCallback((x: unknown) => avisar(x instanceof Error ? x.message : "Não foi possível concluir.", "erro"), [avisar]);
  useEffect(() => { listarUsuarios().then(setLista).catch(erro); if (facilitar) listarRestritas().then(setRestritas).catch(erro); }, [facilitar, erro]);

  async function gravar() {
    if (!form) return;
    try { setLista(await salvarUsuario(form)); setForm(null); avisar("Usuário salvo.", "sucesso"); } catch (x) { erro(x); }
  }
  async function gravarSenha() {
    if (!redefinir) return;
    try { setLista(await redefinirSenha(redefinir.u.id, redefinir.senha)); setRedefinir(null); avisar("Senha provisória definida.", "sucesso"); } catch (x) { erro(x); }
  }
  async function gravarRestritas() {
    try { await salvarRestritas(restritas.filter((r) => r.raiz.trim())); avisar("Empresas restritas salvas.", "sucesso"); } catch (x) { erro(x); }
  }
  return (
    <>
      <PageHeader titulo="Usuários e acessos" descricao="Login individual de cada pessoa da equipe. As permissões são aplicadas no servidor."
        acoes={<Button variante="primary" onClick={() => setForm({ ...VAZIO })}>Novo usuário</Button>} />
      {facilitar && !restritas.length && <Notice tom="alerta">Nenhuma empresa restrita cadastrada. Inclua o CNPJ da Facilitar abaixo para escondê-la dos demais usuários.</Notice>}
      <Card titulo="Equipe" semPadding>
        {!lista ? <Loading /> : <DataTable linhas={lista} chaveLinha={(u) => String(u.id)} vazio="Nenhum usuário."
          colunas={[
            { chave: "n", titulo: "Nome", render: (u) => <><b>{u.nome}</b><br /><small>{u.login}</small></> },
            { chave: "l", titulo: "Nível", render: (u) => nomeNivel(u.nivel) },
            { chave: "f", titulo: "Empresa restrita", render: (u) => u.facilitar ? <Badge tom="alerta">Com acesso</Badge> : "Sem acesso" },
            { chave: "s", titulo: "Situação", render: (u) => <Badge tom={u.ativo ? "sucesso" : "perigo"}>{u.ativo ? "Ativo" : "Inativo"}</Badge> },
            { chave: "a", titulo: "Último acesso", render: (u) => u.ultimoAcesso ? dataHora(u.ultimoAcesso) : "Nunca" },
            { chave: "x", titulo: "", alinhar: "direita", render: (u) => <div className={styles.acoes}>
              <Button tamanho="sm" onClick={() => setForm({ ...u, senha: "" })}>Editar</Button>
              <Button tamanho="sm" onClick={() => setRedefinir({ u, senha: "" })}>Redefinir senha</Button>
            </div> },
          ]} />}
      </Card>
      <div className={styles.notas}>
        <Card titulo="Níveis de acesso">
          <ul className={styles.relatorio}>{NIVEIS.map((n) => <li key={n.id}><b>{n.nome}:</b> {n.faz}</li>)}</ul>
        </Card>
      </div>
      {facilitar && <div className={styles.notas}>
        <Card titulo="Empresas restritas" descricao="Somem do sistema para quem não tem acesso à empresa restrita, em qualquer nível. Vale para a matriz e as filiais da mesma raiz de CNPJ.">
          <div className={styles.form}>
            {restritas.map((r, i) => <div key={i} className={styles.procForm}>
              <Input rotulo="CNPJ" value={r.raiz} onChange={(e) => setRestritas(restritas.map((x, k) => k === i ? { ...x, raiz: e.target.value } : x))} />
              <Input rotulo="Nome usado nos cadastros" value={r.nome} onChange={(e) => setRestritas(restritas.map((x, k) => k === i ? { ...x, nome: e.target.value } : x))} />
              <span />
              <Button variante="danger" onClick={() => setRestritas(restritas.filter((_, k) => k !== i))}>Tirar</Button>
            </div>)}
            <div className={styles.barra}><Button onClick={() => setRestritas([...restritas, { raiz: "", nome: "" }])}>Incluir empresa</Button><Button variante="primary" onClick={gravarRestritas}>Salvar</Button></div>
          </div>
        </Card>
      </div>}
      <Modal aberto={!!form} titulo={form?.id ? "Editar usuário" : "Novo usuário"} onFechar={() => setForm(null)}>
        {form && <div className={styles.form}>
          <Input rotulo="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          <Input rotulo="Usuário para entrar" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
          <Select rotulo="Nível" value={form.nivel} onChange={(e) => setForm({ ...form, nivel: e.target.value as NivelAcesso })}>{NIVEIS.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}</Select>
          {!form.id && <Input rotulo="Senha provisória" type="text" autoComplete="off" dica="Mínimo de 8 caracteres. A pessoa troca no primeiro acesso." value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />}
          {facilitar && <label className={styles.check}><input type="checkbox" checked={form.facilitar} onChange={(e) => setForm({ ...form, facilitar: e.target.checked })} /> Acessa a empresa restrita</label>}
          <label className={styles.check}><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo</label>
          <Button variante="primary" onClick={gravar}>Salvar</Button>
        </div>}
      </Modal>
      <Modal aberto={!!redefinir} titulo="Redefinir senha" onFechar={() => setRedefinir(null)}>
        {redefinir && <div className={styles.form}>
          <p>Define uma senha provisória para <b>{redefinir.u.nome}</b> e encerra as sessões abertas.</p>
          <Input rotulo="Senha provisória" type="text" autoComplete="off" value={redefinir.senha} onChange={(e) => setRedefinir({ ...redefinir, senha: e.target.value })} />
          <Button variante="primary" onClick={gravarSenha}>Salvar</Button>
        </div>}
      </Modal>
    </>
  );
}
