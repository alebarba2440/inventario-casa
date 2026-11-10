#!/usr/bin/env python3
"""Agrega (o actualiza) el bloque de JuntOS al principio de public_html/.htaccess, respetando lo demás.
Uso: htaccess_raiz.py <actual> <nuevo>"""
import re, sys
BLOQUE = """# BEGIN JuntOS
<IfModule mod_rewrite.c>
RewriteEngine On
# www -> sin www
RewriteCond %{HTTP_HOST} ^www\\.juntosapp\\.com\\.ar$ [NC]
RewriteRule ^(.*)$ https://juntosapp.com.ar/$1 [R=301,L]
# juntosapp.com.ar muestra la carpeta juntos/ como si fuera la raíz
RewriteCond %{HTTP_HOST} ^juntosapp\\.com\\.ar$ [NC]
RewriteCond %{REQUEST_URI} !^/juntos/
RewriteRule ^(.*)$ juntos/$1 [L]
</IfModule>
# END JuntOS
"""
actual = open(sys.argv[1], encoding='utf-8', errors='surrogateescape').read()
resto = re.sub(r'# BEGIN JuntOS\n.*?# END JuntOS\n?', '', actual, flags=re.S).lstrip('\n')
open(sys.argv[2], 'w', encoding='utf-8', errors='surrogateescape').write(BLOQUE + ('\n' + resto if resto else ''))
