#!/usr/bin/env python3
"""Arma la carpeta que se sube a DonWeb (barbamanager.website/juntos/).

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
           'gastos.html', 'compartidos.html', 'personajes.html', 'sonidos.html']
ARCHIVOS = ['tema.js', 'sonidos.js', 'personajes.js', 'comun.css', 'fondo.css', 'manifest.json',
            'logo.png', 'logo2.png', 'logo3.png']

CUENTA = '''
    <div class="block acc">
      <button class="acc-h" onclick="toggleAccCfg(this)" aria-expanded="false"><i class="ti ti-user-circle"></i> Mi cuenta<i class="ti ti-chevron-down chev"></i></button>
      <div class="acc-b">
        <p id="jxCuenta" style="margin:0 0 10px;color:var(--text2)"></p>
        <a class="btn pri" href="../?cuenta=1" style="text-decoration:none;justify-content:center">Ver cuenta, pareja y suscripción</a>
      </div>
    </div>
    <script>document.addEventListener('DOMContentLoaded',function(){var J=window.JUNTOS||{},u=J.usuario,p=J.pareja,e=document.getElementById('jxCuenta');
      if(e&&u)e.textContent=(u.nombre||u.email)+(p?' · '+p.nombre:'');});</script>
'''


def main():
    if SALIDA.exists():
        shutil.rmtree(SALIDA)
    # 1) Lo propio de JuntOS
    shutil.copytree(JUNTOS, SALIDA, ignore=shutil.ignore_patterns('armar.py', 'app-db.js', 'extra', '.*'))

    # 2) Las secciones
    app = SALIDA / 'app'
    app.mkdir()
    adaptador = (JUNTOS / 'app-db.js').read_bytes()
    (app / 'app-db.js').write_bytes(adaptador)
    v = hashlib.md5(adaptador).hexdigest()[:8]
    for f in ARCHIVOS:
        if (RAIZ / f).exists():
            shutil.copy2(RAIZ / f, app / f)
    shutil.copytree(RAIZ / 'img', app / 'img')

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
        if f == 'index.html':
            marca = '    <div class="block" style="display:none"><!-- oculto: estado de Firebase'
            assert marca in html, 'index.html: no encontré dónde poner "Mi cuenta"'
            html = html.replace(marca, CUENTA + marca, 1)
        (app / Path(f).name).write_text(html, encoding='utf-8')
    print(f'Listo: {SALIDA} ({len(PAGINAS) + len(extras)} páginas, adaptador v{v})')


main()
