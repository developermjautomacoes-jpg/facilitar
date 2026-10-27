# Memorandos de entrada de empresa — Facilitar

Formulário de memorando para clientes novos: consulta de CNPJ, regime tributário, anexos do Simples, atividades (CNAE), códigos de serviço (LC 116), departamentos e responsáveis. Os memorandos são numerados por ano (número editável), ficam arquivados no servidor, podem ser pesquisados e baixados em PDF ou Word, em 4 layouts da Facilitar.

## Arquivos
- `index.html` — o sistema (página única).
- `api.php` — guarda os memorandos em `dados/` e consulta o CNPJ (BrasilAPI, com ReceitaWS como alternativa).
- `config.exemplo.php` — modelo da configuração da senha.

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
1. Publique o repositório na pasta do site (Git da Hostinger ou upload dos arquivos).
2. No servidor, copie `config.exemplo.php` para `config.php` e defina `SENHA_ACESSO`.
3. Acesse o endereço da pasta e entre com seu nome e a senha.

A pasta `dados/` é criada sozinha no primeiro uso e fica bloqueada para acesso direto. Ela não vai para o GitHub, então faça backup dela pelo painel da Hostinger.

Requisitos: PHP 7.4 ou superior, com cURL (padrão na Hostinger).
