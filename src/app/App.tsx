import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ApiProvider } from '@/api'
import { AuthProvider, destinoDe, RequireRole, RequireSession, useAuth } from '@/auth/AuthContext'
import { ToastProvider } from '@/componentes/Toast'
import { Layout } from './Layout'
import { criarQueryClient } from './queryClient'
import { LoginPage } from '@/paginas/auth/LoginPage'
import { TrocarSenhaPage } from '@/paginas/auth/TrocarSenhaPage'
import { PainelPage } from '@/paginas/portaria/PainelPage'
import { EntradaPage } from '@/paginas/portaria/EntradaPage'
import { PessoasDentroPage } from '@/paginas/portaria/PessoasDentroPage'
import { SaidaPage } from '@/paginas/portaria/SaidaPage'
import { EncomendasPage } from '@/paginas/encomendas/EncomendasPage'
import { OcorrenciasPage } from '@/paginas/ocorrencias/OcorrenciasPage'
import { UnidadesPage } from '@/paginas/unidades/UnidadesPage'
import { VinculosPage } from '@/paginas/vinculos/VinculosPage'
import { CadastroPage } from '@/paginas/cadastro/CadastroPage'
import { ImportacaoPage } from '@/paginas/importacao/ImportacaoPage'
import { PrivacidadePage } from '@/paginas/lgpd/PrivacidadePage'
import { HistoricoPage } from '@/paginas/historico/HistoricoPage'
import { RelatoriosPage } from '@/paginas/relatorios/RelatoriosPage'
import { UsuariosPage } from '@/paginas/usuarios/UsuariosPage'
import { FuncionariosPage } from '@/paginas/funcionarios/FuncionariosPage'
import { CatalogoProvider } from './catalogo'
import { AvisosPwa } from '@/pwa/AvisosPwa'

function Raiz() {
  const { usuario, pronto } = useAuth()
  if (!pronto) return null
  return <Navigate to={usuario ? destinoDe(usuario) : '/login'} replace />
}

export function App() {
  // Um QueryClient por montagem do App (não global de módulo): testes e HMR não herdam cache.
  const [queryClient] = useState(criarQueryClient)
  return (
    <ApiProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AvisosPwa />
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/trocar-senha" element={<TrocarSenhaPage />} />
                <Route path="/" element={<Raiz />} />
                <Route
                  element={
                    <RequireSession>
                      <CatalogoProvider>
                        <Layout />
                      </CatalogoProvider>
                    </RequireSession>
                  }
                >
                  {/* o Layout exige apenas sessão; cada rota filtra pelo papel */}
                  <Route
                    path="/painel"
                    element={
                      <RequireRole rota="painel">
                        <PainelPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/entrada"
                    element={
                      <RequireRole rota="entrada">
                        <EntradaPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/saida"
                    element={
                      <RequireRole rota="saida">
                        <SaidaPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/pessoas"
                    element={
                      <RequireRole rota="pessoas">
                        <PessoasDentroPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/encomendas"
                    element={
                      <RequireRole rota="encomendas">
                        <EncomendasPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/ocorrencias"
                    element={
                      <RequireRole rota="ocorrencias">
                        <OcorrenciasPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/unidades/:id?"
                    element={
                      <RequireRole rota="unidades">
                        <UnidadesPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/vinculos"
                    element={
                      <RequireRole rota="vinculos">
                        <VinculosPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/cadastro"
                    element={
                      <RequireRole rota="cadastro">
                        <CadastroPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/importar"
                    element={
                      <RequireRole rota="importar">
                        <ImportacaoPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/historico"
                    element={
                      <RequireRole rota="historico">
                        <HistoricoPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/relatorios"
                    element={
                      <RequireRole rota="relatorios">
                        <RelatoriosPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/usuarios"
                    element={
                      <RequireRole rota="usuarios">
                        <UsuariosPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/privacidade"
                    element={
                      <RequireRole rota="privacidade">
                        <PrivacidadePage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/funcionarios"
                    element={
                      <RequireRole rota="funcionarios">
                        <FuncionariosPage />
                      </RequireRole>
                    }
                  />
                  {/* Virou aba do Histórico; o endereço antigo continua valendo (e a administração continua sem acesso) */}
                </Route>
                <Route path="*" element={<Raiz />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ApiProvider>
  )
}
