import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout";
import { ToastProvider } from "@/components/ui";
import { AuthProvider, useAuth } from "@/features/auth/AuthContext";
import { LoginPage, TrocarSenhaPage } from "@/features/auth/LoginPage";
import { CertificadosPage } from "@/features/configuracoes/CertificadosPage";
import { AgendaPage } from "@/features/agenda/AgendaPage";
import { ArquivoPage } from "@/features/memorandos/ArquivoPage";
import { MemorandoEditorPage } from "@/features/memorandos/MemorandoEditorPage";
import { MemorandosProvider } from "@/features/memorandos/MemorandosContext";
import { NfsePage } from "@/features/nfse/NfsePage";
import { DfePage } from "@/features/dfe/DfePage";
import { UsuariosPage } from "@/features/usuarios/UsuariosPage";
import { PainelPage } from "@/features/painel/PainelPage";
import { PlanejamentoPage } from "@/features/planejamento/PlanejamentoPage";
import { PerfilPage } from "@/features/perfil/PerfilPage";
import { PerfilProvider } from "@/features/perfil/PerfilContext";
import { PrecificacaoPage } from "@/features/precificacao/PrecificacaoPage";

function Rotas() {
  const { usuario, rank, trocarSenha } = useAuth();
  if (!usuario) return <LoginPage />;
  if (trocarSenha) return <TrocarSenhaPage />;
  const inicio = rank >= 5 ? "/painel" : "/agenda";
  return (
    <PerfilProvider>
    <MemorandosProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to={inicio} replace />} />
          {rank >= 5 && <Route path="painel" element={<PainelPage />} />}
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="memorandos" element={<ArquivoPage />} />
          <Route path="memorandos/novo" element={<MemorandoEditorPage />} />
          <Route path="memorandos/:id/:acao" element={<MemorandoEditorPage />} />
          <Route path="nfse" element={<NfsePage />} />
          <Route path="dfe" element={<DfePage />} />
          {rank >= 5 && <Route path="usuarios" element={<UsuariosPage />} />}
          <Route path="planejamento" element={<PlanejamentoPage />} />
          <Route path="precificacao" element={<PrecificacaoPage />} />
          <Route path="perfil" element={<PerfilPage />} />
          {rank >= 5 && <Route path="configuracoes" element={<CertificadosPage />} />}
          <Route path="*" element={<Navigate to={inicio} replace />} />
        </Route>
      </Routes>
    </MemorandosProvider>
    </PerfilProvider>
  );
}

/** HashRouter: funciona em qualquer pasta do servidor (raiz ou /memorandos) sem regras de reescrita no Apache. */
export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <HashRouter><Rotas /></HashRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
