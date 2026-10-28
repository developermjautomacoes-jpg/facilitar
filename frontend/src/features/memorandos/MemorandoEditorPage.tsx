import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Icon, PageHeader, useToast } from "@/components/ui";
import { numeroMemorando } from "@/lib/format";
import { useMemorandos } from "./MemorandosContext";
import styles from "./MemorandoEditorPage.module.css";

/**
 * Formulário do memorando (consulta de CNPJ/IE, CNAEs, sócios, departamentos, prévia, PDF e Word).
 * Continua no módulo legado (legado/index.html), aberto em modo embutido; o salvamento usa a mesma ação "salvar" do api.php.
 */
export function MemorandoEditorPage() {
  const { id, acao } = useParams();
  const { memorandos, recarregar } = useMemorandos();
  const avisar = useToast();
  const navegar = useNavigate();
  const memo = id ? memorandos.find((m) => m._id === id) : undefined;
  const src = useMemo(() => {
    const q = new URLSearchParams({ embed: "1", acao: id ? acao ?? "editar" : "novo" });
    if (id) q.set("memo", id);
    return `legado/index.html?${q.toString()}`;
  }, [id, acao]);

  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.data?.tipo !== "memo-salvo") return;
      avisar(`Memorando Nº ${e.data.numero} salvo no arquivo.`, "sucesso");
      void recarregar();
      if (!id && e.data.id) navegar(`/memorandos/${e.data.id}/editar`, { replace: true });
    };
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, [avisar, recarregar, navegar, id]);

  const titulo = !id ? "Novo memorando" : acao === "ver" ? "Visualizar memorando" : acao === "pdf" || acao === "docx" ? "Baixar memorando" : "Editar memorando";
  return (
    <div className={styles.pagina}>
      <PageHeader titulo={memo ? `${titulo} · Nº ${numeroMemorando(memo.seq, memo.ano)}` : titulo}
        descricao={memo?.e_razao ?? "Consulta de CNPJ e IE, atividades, sócios, departamentos, prévia em A4, PDF e Word."}
        acoes={<Button icone={<Icon nome="voltar" />} onClick={() => navegar("/memorandos")}>Voltar ao arquivo</Button>} />
      <iframe key={src} className={styles.quadro} src={src} title={titulo} />
    </div>
  );
}
