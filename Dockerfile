# Sistema de Memorandos — Facilitar (Easypanel / Docker)
FROM php:8.3-apache

# Arquivos do sistema na raiz e em /memorandos (funciona com ou sem caminho no domínio)
COPY index.html api.php /var/www/html/
COPY index.html api.php /var/www/html/memorandos/

# Planejamento tributário: fora da pasta pública; o api.php entrega a página só para quem entrou com a senha
COPY planejamento/planejamento-tributario.html /opt/planejamento/planejamento-tributario.html
ENV PLANEJ_HTML=/opt/planejamento/planejamento-tributario.html

# Certificados A1 antigos (.pfx com RC2/3DES) precisam do provedor "legacy" do OpenSSL 3
RUN if ls /usr/lib/*/ossl-modules/legacy.so >/dev/null 2>&1; then \
      printf 'openssl_conf = openssl_init\n[openssl_init]\nproviders = provider_sect\n[provider_sect]\ndefault = default_sect\nlegacy = legacy_sect\n[default_sect]\nactivate = 1\n[legacy_sect]\nactivate = 1\n' > /etc/ssl/openssl-memorandos.cnf; \
    else cp /etc/ssl/openssl.cnf /etc/ssl/openssl-memorandos.cnf; fi
ENV OPENSSL_CONF=/etc/ssl/openssl-memorandos.cnf

# Dados dos memorandos fora da pasta pública; monte um volume em /data no Easypanel
ENV DADOS_DIR=/data
RUN mkdir -p /data \
 && echo "ServerTokens Prod\nServerSignature Off" > /etc/apache2/conf-available/zz-seguranca.conf \
 && a2enconf zz-seguranca

EXPOSE 80
CMD ["sh", "-c", "mkdir -p /data && chown -R www-data:www-data /data && exec apache2-foreground"]
