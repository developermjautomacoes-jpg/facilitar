# Memorandos de entrada de empresa — Facilitar

Formulário de memorando para clientes novos: consulta de CNPJ, regime tributário, anexos do Simples, atividades (CNAE), códigos de serviço (LC 116), departamentos e responsáveis. Os memorandos são numerados por ano (número editável), ficam arquivados no servidor, podem ser pesquisados e baixados em PDF ou Word, em 4 layouts da Facilitar.

## Arquivos
- `index.html` — o sistema (página única).
- `api.php` — guarda os memorandos em `dados/` e consulta o CNPJ (BrasilAPI, com ReceitaWS como alternativa).
- `config.exemplo.php` — modelo da configuração da senha.

## Instalação na Hostinger
1. Publique o repositório na pasta do site (Git da Hostinger ou upload dos arquivos).
2. No servidor, copie `config.exemplo.php` para `config.php` e defina `SENHA_ACESSO`.
3. Acesse o endereço da pasta e entre com seu nome e a senha.

A pasta `dados/` é criada sozinha no primeiro uso e fica bloqueada para acesso direto. Ela não vai para o GitHub, então faça backup dela pelo painel da Hostinger.

Requisitos: PHP 7.4 ou superior, com cURL (padrão na Hostinger).
