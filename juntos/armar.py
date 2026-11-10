#!/usr/bin/env python3
"""Arma la carpeta que se sube a DonWeb (juntosapp.com.ar, carpeta public_html/juntos/).

- Copia lo propio de JuntOS (login, api, admin).
- En app/ copia las secciones de siempre (las mismas páginas de GitHub Pages) y les cambia Firebase
  por el adaptador app-db.js, que guarda en la base de DonWeb separado por pareja.
Así hay un solo código: lo que se mejora en las páginas llega a las dos versiones.

Uso: python3 juntos/armar.py <carpeta_salida>
"""
import hashlib, re, shutil, sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
JUNTOS = RAIZ / 'juntos'
SALIDA = Path(sys.argv[1]).resolve()

PAGINAS = ['index.html', 'inventario.html', 'ahorros.html', 'vacaciones.html', 'copito.html',
           'gastos.html', 'compartidos.html', 'calendario.html', 'mascotas.html', 'hijos.html', 'personajes.html', 'sonidos.html']
ARCHIVOS = ['tema.js', 'sonidos.js', 'personajes.js', 'comun.css', 'fondo.css', 'manifest.json',
            'logo.png', 'logo2.png', 'logo3.png']



def main():
    if SALIDA.exists():
        shutil.rmtree(SALIDA)
    # 1) Lo propio de JuntOS
    shutil.copytree(JUNTOS, SALIDA, ignore=shutil.ignore_patterns('armar.py', 'htaccess_raiz.py', 'app-db.js', 'sw.js', 'extra', '.*'))

    # 2) Las secciones
    app = SALIDA / 'app'
    app.mkdir()
    adaptador = (JUNTOS / 'app-db.js').read_bytes()
    (app / 'app-db.js').write_bytes(adaptador)
    shutil.copy2(JUNTOS / 'sw.js', app / 'sw.js')   # notificaciones (alcance: app/)
    v = hashlib.md5(adaptador).hexdigest()[:8]
    shutil.copy2(JUNTOS / 'instalar.js', app / 'instalar.js')
    vi = hashlib.md5((JUNTOS / 'instalar.js').read_bytes()).hexdigest()[:8]
    for f in ARCHIVOS:
        if (RAIZ / f).exists():
            shutil.copy2(RAIZ / f, app / f)
    shutil.copytree(RAIZ / 'img', app / 'img')

    versiones = {r: hashlib.md5((RAIZ / r).read_bytes()).hexdigest()[:8] for r in ['tema.js', 'sonidos.js', 'personajes.js', 'comun.css', 'fondo.css'] if (RAIZ / r).exists()}
    extras = sorted((JUNTOS / 'extra').glob('*.html'))
    for f in PAGINAS + extras:
        html = Path(f).read_text(encoding='utf-8') if isinstance(f, Path) else (RAIZ / f).read_text(encoding='utf-8')
        html = html.replace('<script src="firebase-config.js"></script>', '')
        # El adaptador va primero de todo (antes de tema.js, que ya lee los ajustes).
        tag = f'<script src="app-db.js?v={v}"></script>'
        html, n = re.subn(r'(<meta charset="[^"]*">)', r'\1\n' + tag, html, count=1, flags=re.I)
        if not n:
            html, n = re.subn(r'(<head[^>]*>)', r'\1\n' + tag, html, count=1, flags=re.I)
        assert n, f'{f}: no encontré <head>'
        assert 'src="firebase-config.js"' not in html, f'{f}: quedó firebase-config.js'
        # Versión según el contenido en los .css/.js comunes: así los celus no se quedan con uno viejo guardado
        for res, h in versiones.items():
            html = re.sub(r'((?:src|href)=")' + re.escape(res) + r'(?:\?v=[^"]*)?"', lambda m: f'{m.group(1)}{res}?v={h}"', html)
        # Un solo manifest para toda la app (el de la raíz): así instalar desde la landing o desde adentro es la misma app
        html = re.sub(r'<link rel="manifest" href="[^"]*">', '', html)
        html = re.sub(r'(</head>)', '<link rel="manifest" href="../manifest.webmanifest">\n\\1', html, count=1, flags=re.I)
        if Path(f).name == 'index.html':   # en el inicio: aviso para instalarla (se puede cerrar)
            html = re.sub(r'(</body>)', f'<script>window.JX_INSTALAR_AVISO=true</script><script src="instalar.js?v={vi}"></script>\n\\1', html, count=1, flags=re.I)
        (app / Path(f).name).write_text(html, encoding='utf-8')
    print(f'Listo: {SALIDA} ({len(PAGINAS) + len(extras)} páginas, adaptador v{v})')


main()
