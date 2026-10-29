import { useEffect, useState } from "react";
import type { Certificado } from "@/types";
import { Badge, Button, Card, ConfirmDialog, DataTable, Input, Loading, Notice, PageHeader, useToast } from "@/components/ui";
import { arquivoParaBase64 } from "@/lib/files";
import { dataBr, dataHora } from "@/lib/format";
import { definirPadrao, enviarCertificado, listarCertificados, removerCertificado } from "@/services/certificadosService";
import { GoogleAgendaCard } from "./GoogleAgendaCard";
import styles from "./CertificadosPage.module.css";

export function CertificadosPage() {
  const avisar = useToast();
  const [lista, setLista] = useState<Certificado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const [apelido, setApelido] = useState("");
  const [padrao, setPadrao] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState<Certificado | null>(null);
  const [inputKey, setInputKey] = useState(0);

  useEffect(() => {
    listarCertificados().then(setLista).catch((e: Error) => setErro(e.message)).finally(() => setCarregando(false));
  }, []);

  async function importar() {
    if (!arquivo) { avisar("Escolha o arquivo .pfx ou .p12.", "erro"); return; }
    setEnviando(true);
    try {
      setLista(await enviarCertificado({ pfx: await arquivoParaBase64(arquivo), senha, apelido: apelido.trim(), padrao }));
      setArquivo(null); setSenha(""); setApelido(""); setPadrao(false); setInputKey((k) => k + 1);
      avisar("Certificado importado.", "sucesso");
    } catch (e) { avisar(e instanceof Error ? e.message : "Não foi possível importar.", "erro"); }
    finally { setEnviando(false); }
  }
  async function tornarPadrao(id: string) {
    try { setLista(await definirPadrao(id)); avisar("Certificado padrão atualizado.", "sucesso"); }
    catch (e) { avisar(e instanceof Error ? e.message : "Erro.", "erro"); }
  }
  async function remover() {
    if (!removendo) return;
    try { setLista(await removerCertificado(removendo.id)); avisar("Certificado removido.", "sucesso"); }
    catch (e) { avisar(e instanceof Error ? e.message : "Erro.", "erro"); }
    finally { setRemovendo(null); }
  }
  const vencido = (c: Certificado) => !!c.validade && c.validade < new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader titulo="Configurações" descricao="Certificados digitais para consultar a inscrição estadual na SEFAZ e conexão com o Google Agenda. Arquivos e chaves ficam só no servidor, cifrados." />
      {erro && <Notice tom="erro">{erro}</Notice>}
      <div className={styles.grade}>
        <Card titulo="Certificados digitais" semPadding>
          {carregando ? <Loading /> : (
            <DataTable linhas={lista} chaveLinha={(c) => c.id} vazio="Nenhum certificado importado."
              colunas={[
                { chave: "tit", titulo: "Titular", render: (c) => <><b>{c.apelido || c.titular}</b>{c.apelido && <><br /><small>{c.titular}</small></>}</> },
                { chave: "doc", titulo: "Tipo", render: (c) => <>{c.tipo}<br /><small>{c.documento}</small></> },
                { chave: "val", titulo: "Validade", render: (c) => vencido(c) ? <Badge tom="perigo">vencido em {dataBr(c.validade)}</Badge> : dataBr(c.validade) },
                { chave: "env", titulo: "Importado", render: (c) => c.origem === "ambiente" ? "Variável de ambiente" : <>{dataHora(c.enviadoEm)}<br /><small>{c.enviadoPor}</small></> },
                { chave: "acoes", titulo: "", alinhar: "direita", render: (c) => (
                  <div className={styles.acoes}>
                    {c.padrao ? <Badge tom="gold">padrão</Badge> : <Button tamanho="sm" onClick={() => tornarPadrao(c.id)}>Tornar padrão</Button>}
                    {c.origem !== "ambiente" && <Button tamanho="sm" variante="danger" onClick={() => setRemovendo(c)}>Remover</Button>}
                  </div>
                ) },
              ]} />
          )}
        </Card>
        <Card titulo="Importar certificado A1" descricao="Arquivo .pfx ou .p12 e a senha do certificado.">
          <div className={styles.form}>
            <Input key={inputKey} rotulo="Arquivo do certificado" type="file" accept=".pfx,.p12" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            <Input rotulo="Senha do certificado" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
            <Input rotulo="Apelido (opcional)" placeholder="Ex.: e-CNPJ Facilitar" value={apelido} onChange={(e) => setApelido(e.target.value)} />
            <label className={styles.check}><input type="checkbox" checked={padrao} onChange={(e) => setPadrao(e.target.checked)} /> Usar como padrão</label>
            <Button variante="primary" carregando={enviando} onClick={importar}>Importar certificado</Button>
          </div>
        </Card>
      </div>
      <div className={styles.agenda}><GoogleAgendaCard avisar={avisar} /></div>
      <ConfirmDialog aberto={!!removendo} titulo="Remover certificado" confirmar="Remover" perigo onConfirmar={remover} onCancelar={() => setRemovendo(null)}>
        <p>Remover o certificado de <b>{removendo?.apelido || removendo?.titular}</b> do servidor?</p>
      </ConfirmDialog>
    </>
  );
}
