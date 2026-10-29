import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout";
import { ToastProvider } from "@/components/ui";
import { AuthProvider, useAuth } from "@/features/auth/AuthContext";
import { LoginPage } from "@/features/auth/LoginPage";
import { ColaboradoresPage } from "@/features/colaboradores/ColaboradoresPage";
import { CertificadosPage } from "@/features/configuracoes/CertificadosPage";
import { AgendaPage } from "@/features/agenda/AgendaPage";
import { ArquivoPage } from "@/features/memorandos/ArquivoPage";
import { MemorandoEditorPage } from "@/features/memorandos/MemorandoEditorPage";
import { MemorandosProvider } from "@/features/memorandos/MemorandosContext";
import { PainelPage } from "@/features/painel/PainelPage";
import { PlanejamentoPage } from "@/features/planejamento/PlanejamentoPage";
import { PerfilPage } from "@/features/perfil/PerfilPage";
import { PerfilProvider } from "@/features/perfil/PerfilContext";
import { PrecificacaoPage } from "@/features/precificacao/PrecificacaoPage";

function Rotas() {
  const { usuario } = useAuth();
  if (!usuario) return <LoginPage />;
  return (
    <PerfilProvider>
    <MemorandosProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/painel" replace />} />
          <Route path="painel" element={<PainelPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="memorandos" element={<ArquivoPage />} />
          <Route path="memorandos/novo" element={<MemorandoEditorPage />} />
          <Route path="memorandos/:id/:acao" element={<MemorandoEditorPage />} />
          <Route path="colaboradores" element={<ColaboradoresPage />} />
          <Route path="planejamento" element={<PlanejamentoPage />} />
          <Route path="precificacao" element={<PrecificacaoPage />} />
          <Route path="perfil" element={<PerfilPage />} />
          <Route path="configuracoes" element={<CertificadosPage />} />
          <Route path="*" element={<Navigate to="/painel" replace />} />
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
