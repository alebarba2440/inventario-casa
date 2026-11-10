#!/usr/bin/env python3
"""Agrega (o actualiza) el bloque de JuntOS al principio de public_html/.htaccess, respetando lo demás.
Uso: htaccess_raiz.py <actual> <nuevo>"""
import re, sys
BLOQUE = """# BEGIN JuntOS
<IfModule mod_rewrite.c>
RewriteEngine On
# Estas reglas corren también en subcarpetas con su propio .htaccess (ej. app/ de BARBA), antes que las de ellas
RewriteOptions InheritDownBefore
# http -> https (solo juntosapp)
RewriteCond %{HTTPS} off
RewriteCond %{HTTP:CDN-LOOP} !cloudflare
RewriteCond %{REQUEST_URI} !^/.well-known/acme-challenge/
RewriteCond %{HTTP_HOST} ^(www\\.)?juntosapp\\.com\\.ar$ [NC]
RewriteRule ^ https://juntosapp.com.ar%{REQUEST_URI} [R=301,L]
# www -> sin www
RewriteCond %{HTTP_HOST} ^www\\.juntosapp\\.com\\.ar$ [NC]
RewriteRule ^ https://juntosapp.com.ar%{REQUEST_URI} [R=301,L]
# La URL vieja barbamanager.website/juntos/... -> juntosapp.com.ar/...
RewriteCond %{HTTP_HOST} ^(www\\.)?barbamanager\\.website$ [NC]
RewriteCond %{REQUEST_URI} ^/juntos(/.*)?$
RewriteRule ^ https://juntosapp.com.ar%1 [R=301,L]
# juntosapp.com.ar/juntos/... escrito a mano -> sin /juntos
RewriteCond %{HTTP_HOST} ^juntosapp\\.com\\.ar$ [NC]
RewriteCond %{THE_REQUEST} \\s/juntos(/[^\\s?]*)?
RewriteRule ^ https://juntosapp.com.ar%1 [R=301,L]
# juntosapp.com.ar muestra la carpeta juntos/ como si fuera la raíz
RewriteCond %{HTTP_HOST} ^juntosapp\\.com\\.ar$ [NC]
RewriteCond %{REQUEST_URI} !^/juntos/
RewriteCond %{REQUEST_URI} !^/.well-known/
RewriteRule ^ /juntos%{REQUEST_URI} [L]
</IfModule>
# END JuntOS
"""
actual = open(sys.argv[1], encoding='utf-8', errors='surrogateescape').read()
resto = re.sub(r'# BEGIN JuntOS\n.*?# END JuntOS\n?', '', actual, flags=re.S).lstrip('\n')
open(sys.argv[2], 'w', encoding='utf-8', errors='surrogateescape').write(BLOQUE + ('\n' + resto if resto else ''))
