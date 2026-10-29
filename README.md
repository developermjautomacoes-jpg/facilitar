# Sistema de gestão — Facilitar Serviços Contábeis

Memorandos de entrada de empresa, painel gerencial da carteira, colaboradores, certificados digitais e planejamento tributário.
Front-end em **React + Vite + TypeScript + CSS Modules** (`frontend/`), back-end em **PHP** (`api.php`, arquivos JSON no volume `/data`).

Produzido por **NEEKO Automação Inteligente**.

## Estrutura

```
api.php                      back-end (ações via ?acao=..., senha no cabeçalho X-Senha)
legado/index.html            formulário do memorando (CNPJ/IE, CNAEs, sócios, prévia A4, PDF e Word), aberto pelo front-end em modo embutido
planejamento/                simulador de planejamento tributário (fora da pasta pública; entregue pelo api.php)
frontend/
  public/logo-facilitar.png  logo do menu lateral e do login
  scripts/gerar-anexos-cnae.mjs  gera src/lib/cnaeAnexos.json a partir da tabela CNAE do legado
  src/
    App.tsx                  rotas (HashRouter: funciona na raiz e em /memorandos sem regra no Apache)
    styles/tokens.css        TODAS as cores, fontes, espaçamentos, bordas e sombras globais
    styles/global.css        reset e base
    styles/janelas.css       tema das janelas embutidas (memorando e planejamento), compilado como assets/janelas.css
    types/                   tipos compartilhados (memorando, colaborador, certificado, planejamento, auth)
    lib/                     formatadores e regras puras (format, memorando, storage, constantes, files)
    services/                camada de acesso ao api.php (http + um serviço por domínio)
    components/ui/           componentes reutilizáveis (Button, Card, Field, Badge, KpiCard, DataTable, Modal, ConfirmDialog, Toast, BarList, PageHeader, Notice, Loading, Icon, EmptyState, Avatar, ImageCropper, NumberInput)
    components/layout/       AppLayout, Sidebar (logo Facilitar), Header (perfil do usuário), Footer (NEEKO), navegação
    features/                um módulo de negócio por pasta
      auth/                  login e contexto de autenticação
      painel/                painel gerencial (indicadores, gráficos, resumo mensal)
      memorandos/            arquivo, ações de situação e editor (módulo legado embutido)
      colaboradores/         cadastro e empresas vinculadas
      configuracoes/         certificados digitais
      planejamento/          planejamento tributário salvo no servidor
      precificacao/          preço de venda (produto e serviço) com CBS/IBS e transição 2026-2035
      perfil/                perfil do usuário (nome, cargo, contato e foto com zoom e enquadramento)
```

### Regras de arquitetura
1. Cada módulo de negócio fica em `src/features/<modulo>/`, com suas telas, componentes próprios e CSS Modules.
2. Antes de criar um componente, verifique `src/components/ui/` e `src/components/layout/`.
3. Cores, fontes, espaçamentos, bordas e sombras só em `src/styles/tokens.css`; os componentes usam as variáveis.
4. Tipos compartilhados em `src/types/`; formatadores e funções auxiliares em `src/lib/` (sem duplicar).
5. Chamadas ao back-end só pela camada `src/services/` — telas e componentes visuais não chamam `fetch`.

## Integração com o back-end (api.php)

Autenticação: senha única da equipe (`SENHA_ACESSO`) enviada no cabeçalho `X-Senha`, com o nome do usuário gravado no histórico. O login valida a senha com a ação `listar`. A credencial fica no navegador com a mesma chave do módulo legado (`memo-cred`), para os dois funcionarem juntos. Se o servidor responder 401, o sistema volta para o login.

| Serviço (`frontend/src/services`) | Ações do api.php | Usado em |
|---|---|---|
| `authService` | `listar` (validação da senha) | Login |
| `memorandosService` | `listar`, `status`, `cliente`, `excluir` | Painel, Arquivo, Colaboradores |
| `colaboradoresService` | `colabs`, `colabsalvar`, `colabexcluir` | Colaboradores, Painel |
| `certificadosService` | `certlistar`, `certenviar`, `certpadrao`, `certremover` | Configurações |
| `planejamentoService` | `planejamento`, `planlistar`, `planler`, `plansalvar`, `planexcluir` | Planejamento tributário |
| `perfilService` | `perfil`, `perfilsalvar` | Meu perfil, cabeçalho |
| módulo legado (`legado/index.html`) | `salvar`, `cnpj`, `ie`, `colabs`, `certlistar`, `listar` | Novo / editar / visualizar memorando, PDF e Word |

Endpoints novos: `perfil` (GET `?usuario=`) e `perfilsalvar` (POST `{usuario, nomeExibicao, cargo, email, telefone, foto}`), autenticados por `X-Senha`. O perfil fica em `DADOS_DIR/perfis/<usuario>.json`; a foto é recortada no navegador (JPEG 320×320, até ~300 KB) e gravada como data URL. Não há outros endpoints novos.

### Precificação
`#/precificacao` (também pelo botão no Planejamento) calcula o preço de venda pelo método do divisor para Simples puro, Simples híbrido, Lucro Presumido e Lucro Real, no ano escolhido (2026 a 2035). A regra é toda no navegador (`features/precificacao/precificacaoCalc.ts`), com as alíquotas da transição em `src/lib/reforma.ts`: CBS de referência 11,3% (TCU, 28/10/2026), cobrada com −0,1 ponto em 2027-2028 (art. 347), IBS 0,1% de teste e proporcional de 2029 a 2032, ICMS/ISS a 90/80/70/60% de 2029 a 2032 e extintos em 2033, PIS/COFINS só em 2026. CBS/IBS por fora, sobre o preço sem ICMS/ISS (LC 214, art. 12, V). A base legal aparece no rodapé da tela.

O formulário do memorando O formulário do memorando continua no módulo legado (aberto em `#/memorandos/novo` e `#/memorandos/<id>/<editar|ver|pdf|docx>`): ele avisa o front-end ao salvar (`postMessage` "memo-salvo") e o arquivo é recarregado.

## Desenvolvimento

```bash
cd frontend
npm install
# em outro terminal, um PHP local servindo a raiz do repositório (o Vite encaminha /api.php e /legado):
#   SENHA_ACESSO=teste DADOS_DIR=/tmp/dados php -S 127.0.0.1:8099 -t ..
npm run dev
npm run build      # compilação de produção (tsc + vite) em frontend/dist
```

Se a tabela CNAE do legado mudar, rode `node scripts/gerar-anexos-cnae.mjs` (anexos do Simples usados no painel).

## Instalação no Easypanel (VPS Hostinger)
1. No Easypanel, crie um serviço **App** e escolha como fonte o GitHub: repositório `developermjautomacoes-jpg/facilitar`, branch `main`.
2. Em **Build**, selecione **Dockerfile** (arquivo `Dockerfile`).
3. Em **Environment**, adicione `SENHA_ACESSO=sua-senha`.
4. Em **Mounts**, crie um **Volume** chamado `dados` com caminho `/data`. É onde ficam os memorandos; sem ele, os dados se perdem a cada atualização.
5. Em **Domains**, aponte o domínio para a porta `80`. O sistema responde tanto na raiz quanto em `/memorandos`.
6. Clique em **Deploy**. Ative o **Auto Deploy** para publicar a cada push.

### Consulta da inscrição estadual (SEFAZ)
A IE é consultada no webservice oficial de cadastro (CadConsultaCadastro4, SVRS) com um certificado A1.
Importe os certificados na aba **Configurações** do sistema (arquivo .pfx/.p12 + senha). Dá para ter vários: escolha o padrão e, em cada consulta, qual usar.
Os arquivos ficam em `/data/cert` (volume) e as senhas ficam cifradas com uma chave derivada de `SENHA_ACESSO` — se essa senha mudar, importe os certificados de novo.

Se a SEFAZ responder "Rejeição 257 – solicitante não habilitado", use um e-CNPJ de empresa habilitada como emissora de NF-e no ES.

## Instalação em hospedagem compartilhada
1. Rode `npm run build` em `frontend/` e envie para a pasta do site o conteúdo de `frontend/dist/`, mais `api.php`, `.htaccess`, `config.exemplo.php` e as pastas `legado/` e `planejamento/`.
2. No servidor, copie `config.exemplo.php` para `config.php` e defina `SENHA_ACESSO`.
3. Acesse o endereço da pasta e entre com seu nome e a senha.

A pasta `dados/` é criada sozinha no primeiro uso e fica bloqueada para acesso direto. Ela não vai para o GitHub, então faça backup dela pelo painel da Hostinger.

Requisitos: PHP 7.4 ou superior, com cURL (padrão na Hostinger).
