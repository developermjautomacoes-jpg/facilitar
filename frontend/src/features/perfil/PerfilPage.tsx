import { useEffect, useState, type ChangeEvent } from "react";
import { Avatar, Button, Card, ImageCropper, Input, Modal, PageHeader, useToast } from "@/components/ui";
import { dataHora } from "@/lib/format";
import { useAuth } from "@/features/auth/AuthContext";
import { usePerfil } from "./PerfilContext";
import styles from "./PerfilPage.module.css";

const VAZIO = { nomeExibicao: "", cargo: "", email: "", telefone: "", foto: "" };

export function PerfilPage() {
  const { usuario } = useAuth();
  const { perfil, salvar } = usePerfil();
  const avisar = useToast();
  const [form, setForm] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [original, setOriginal] = useState(""); // imagem escolhida, antes do recorte
  const [recorte, setRecorte] = useState("");

  useEffect(() => { if (perfil) setForm({ ...VAZIO, ...perfil }); }, [perfil]);

  function escolher(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\//.test(f.type)) { avisar("Escolha um arquivo de imagem (JPG, PNG ou WEBP).", "erro"); return; }
    if (f.size > 15 * 1024 * 1024) { avisar("Imagem grande demais (máximo 15 MB).", "erro"); return; }
    setOriginal(URL.createObjectURL(f));
  }
  function aplicarRecorte() {
    setForm((x) => ({ ...x, foto: recorte }));
    URL.revokeObjectURL(original); setOriginal("");
  }
  async function gravar() {
    setSalvando(true);
    try { await salvar({ ...form, nomeExibicao: form.nomeExibicao.trim() }); avisar("Perfil atualizado.", "sucesso"); }
    catch (e) { avisar(e instanceof Error ? e.message : "Não foi possível salvar.", "erro"); }
    finally { setSalvando(false); }
  }
  const nome = form.nomeExibicao || usuario || "";

  return (
    <>
      <PageHeader titulo="Meu perfil" descricao="Seus dados e sua foto aparecem no cabeçalho do sistema." />
      <div className={styles.grade}>
        <Card className={styles.cartao}>
          <div className={styles.foto}>
            <Avatar nome={nome} foto={form.foto} tamanho={132} />
            <b className={styles.nome}>{nome}</b>
            <span className={styles.cargo}>{form.cargo || "Contabilidade · Facilitar"}</span>
            <div className={styles.acoesFoto}>
              <label className={styles.upload}>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={escolher} />
                {form.foto ? "Trocar foto" : "Enviar foto"}
              </label>
              {form.foto && <Button tamanho="sm" variante="ghost" onClick={() => setOriginal(form.foto)}>Ajustar enquadramento</Button>}
              {form.foto && <Button tamanho="sm" variante="danger" onClick={() => setForm({ ...form, foto: "" })}>Remover</Button>}
            </div>
            {perfil?.atualizadoEm && <small className={styles.meta}>Atualizado em {dataHora(perfil.atualizadoEm)}</small>}
          </div>
        </Card>
        <Card titulo="Dados do perfil" descricao={`Usuário de acesso: ${usuario}`}>
          <div className={styles.campos}>
            <Input rotulo="Nome de exibição" placeholder={usuario ?? ""} value={form.nomeExibicao} onChange={(e) => setForm({ ...form, nomeExibicao: e.target.value })} className={styles.largo} />
            <Input rotulo="Cargo" placeholder="Ex.: Contadora" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
            <Input rotulo="Telefone / ramal" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            <Input rotulo="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={styles.largo} />
          </div>
          <div className={styles.rodape}>
            <Button variante="primary" carregando={salvando} onClick={gravar}>Salvar perfil</Button>
          </div>
        </Card>
      </div>
      <Modal aberto={!!original} titulo="Ajustar foto" onFechar={() => setOriginal("")} largura="sm"
        rodape={<><Button onClick={() => setOriginal("")}>Cancelar</Button><Button variante="primary" onClick={aplicarRecorte}>Usar esta foto</Button></>}>
        {original && <ImageCropper imagem={original} onRecorte={setRecorte} />}
      </Modal>
    </>
  );
}
