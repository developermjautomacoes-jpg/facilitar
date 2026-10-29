# Sistema de gestão Facilitar (Easypanel / Docker)
# Etapa 1: compila o front-end React (frontend/) para arquivos estáticos
FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# Etapa 2: Apache + PHP servindo o front-end, o api.php e o módulo legado do memorando
FROM php:8.3-apache

# Na raiz e em /memorandos (funciona com ou sem caminho no domínio)
COPY --from=frontend /app/dist/ /var/www/html/
COPY --from=frontend /app/dist/ /var/www/html/memorandos/
COPY api.php google-retorno.php /var/www/html/
COPY api.php google-retorno.php /var/www/html/memorandos/
# Formulário do memorando (consulta CNPJ/IE, prévia, PDF e Word), aberto pelo front-end em modo embutido
COPY legado/index.html /var/www/html/legado/index.html
COPY legado/index.html /var/www/html/memorandos/legado/index.html

# Planejamento tributário: fora da pasta pública; o api.php entrega a página só para quem entrou com a senha
COPY planejamento/planejamento-tributario.html /opt/planejamento/planejamento-tributario.html
ENV PLANEJ_HTML=/opt/planejamento/planejamento-tributario.html

# Certificados A1 antigos (.pfx com RC2/3DES) precisam do provedor "legacy" do OpenSSL 3
RUN if ls /usr/lib/*/ossl-modules/legacy.so >/dev/null 2>&1; then \
      printf 'openssl_conf = openssl_init\n[openssl_init]\nproviders = provider_sect\n[provider_sect]\ndefault = default_sect\nlegacy = legacy_sect\n[default_sect]\nactivate = 1\n[legacy_sect]\nactivate = 1\n' > /etc/ssl/openssl-memorandos.cnf; \
    else cp /etc/ssl/openssl.cnf /etc/ssl/openssl-memorandos.cnf; fi
ENV OPENSSL_CONF=/etc/ssl/openssl-memorandos.cnf

# Dados fora da pasta pública; monte um volume em /data no Easypanel
ENV DADOS_DIR=/data
RUN mkdir -p /data \
 && echo "ServerTokens Prod\nServerSignature Off" > /etc/apache2/conf-available/zz-seguranca.conf \
 && a2enconf zz-seguranca

EXPOSE 80
CMD ["sh", "-c", "mkdir -p /data && chown -R www-data:www-data /data && exec apache2-foreground"]
