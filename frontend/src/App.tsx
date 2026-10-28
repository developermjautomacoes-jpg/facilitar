import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout";
import { ToastProvider } from "@/components/ui";
import { AuthProvider, useAuth } from "@/features/auth/AuthContext";
import { LoginPage } from "@/features/auth/LoginPage";
import { ColaboradoresPage } from "@/features/colaboradores/ColaboradoresPage";
import { CertificadosPage } from "@/features/configuracoes/CertificadosPage";
import { ArquivoPage } from "@/features/memorandos/ArquivoPage";
import { MemorandoEditorPage } from "@/features/memorandos/MemorandoEditorPage";
import { MemorandosProvider } from "@/features/memorandos/MemorandosContext";
import { PainelPage } from "@/features/painel/PainelPage";
import { PlanejamentoPage } from "@/features/planejamento/PlanejamentoPage";

function Rotas() {
  const { usuario } = useAuth();
  if (!usuario) return <LoginPage />;
  return (
    <MemorandosProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/painel" replace />} />
          <Route path="painel" element={<PainelPage />} />
          <Route path="memorandos" element={<ArquivoPage />} />
          <Route path="memorandos/novo" element={<MemorandoEditorPage />} />
          <Route path="memorandos/:id/:acao" element={<MemorandoEditorPage />} />
          <Route path="colaboradores" element={<ColaboradoresPage />} />
          <Route path="planejamento" element={<PlanejamentoPage />} />
          <Route path="configuracoes" element={<CertificadosPage />} />
          <Route path="*" element={<Navigate to="/painel" replace />} />
        </Route>
      </Routes>
    </MemorandosProvider>
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
