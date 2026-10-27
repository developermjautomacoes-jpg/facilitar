# Sistema de Memorandos — Facilitar (Easypanel / Docker)
FROM php:8.3-apache

# Arquivos do sistema na raiz e em /memorandos (funciona com ou sem caminho no domínio)
COPY index.html api.php /var/www/html/
COPY index.html api.php /var/www/html/memorandos/

# Dados dos memorandos fora da pasta pública; monte um volume em /data no Easypanel
ENV DADOS_DIR=/data
RUN mkdir -p /data \
 && echo "ServerTokens Prod\nServerSignature Off" > /etc/apache2/conf-available/zz-seguranca.conf \
 && a2enconf zz-seguranca

EXPOSE 80
CMD ["sh", "-c", "mkdir -p /data && chown -R www-data:www-data /data && exec apache2-foreground"]
