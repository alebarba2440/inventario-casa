#!/usr/bin/env python3
"""Sube JuntOS a DonWeb por FTPS (conexión cifrada) usando solo Python, sin instalar nada.

Datos de conexión por variables de entorno: FTP_SERVER, FTP_USERNAME, FTP_PASSWORD.
Uso:
  subir_ftp.py mirror <carpeta_local> <carpeta_remota>   sube todo (crea carpetas; solo lo que cambió de tamaño o es nuevo, salvo .html/.js/.css/.php/.json que van siempre)
  subir_ftp.py put <archivo_local> <ruta_remota>
  subir_ftp.py get <ruta_remota> <archivo_local>
  subir_ftp.py rm <ruta_remota>                          (si no existe, no pasa nada)
  subir_ftp.py existe <ruta_remota>                      sale con 0 si existe, 1 si no
"""
import ftplib, os, socket, ssl, sys, time


class FTPS(ftplib.FTP_TLS):
    # Muchos servidores (como el de DonWeb) exigen que la conexión de datos reutilice la sesión TLS de la de control.
    def ntransfercmd(self, cmd, rest=None):
        conn, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
        if self._prot_p:
            conn = self.context.wrap_socket(conn, server_hostname=self.host, session=self.sock.session)
        return conn, size


def conectar():
    host = os.environ['FTP_SERVER'].replace('ftp://', '').replace('ftps://', '').strip('/')
    puerto = 21
    if ':' in host:
        host, p = host.rsplit(':', 1); puerto = int(p)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE   # igual que antes con lftp (ssl:verify-certificate no)
    for intento in range(3):
        try:
            f = FTPS(context=ctx, timeout=60)
            f.connect(host, puerto)
            f.login(os.environ['FTP_USERNAME'], os.environ['FTP_PASSWORD'])
            f.prot_p()
            f.set_pasv(True)
            return f
        except (OSError, ftplib.Error) as e:
            print(f'No pude conectar (intento {intento + 1}): {e}', flush=True)
            time.sleep(5)
    sys.exit('No se pudo conectar al FTP')


def crear_carpetas(f, ruta, hechas):
    partes = [p for p in ruta.split('/') if p]
    actual = ''
    for p in partes:
        actual = f'{actual}/{p}' if actual else p
        if actual in hechas:
            continue
        try:
            f.mkd(actual)
        except ftplib.error_perm:
            pass   # ya existe
        hechas.add(actual)


def tamanos_remotos(f, carpeta):
    """{nombre: tamaño} de una carpeta remota (vacío si no se puede listar)."""
    out = {}
    try:
        for nombre, datos in f.mlsd(carpeta, facts=['type', 'size']):
            if datos.get('type') == 'file':
                out[nombre] = int(datos.get('size', -1))
    except (ftplib.Error, OSError):
        pass
    return out


SIEMPRE = ('.html', '.js', '.css', '.php', '.json', '.webmanifest', '.htaccess', '.txt')


def subir(f, local, remoto):
    for intento in range(3):
        try:
            with open(local, 'rb') as fh:
                f.storbinary(f'STOR {remoto}', fh)
            return f
        except (OSError, ftplib.Error) as e:
            print(f'  reintento {remoto}: {e}', flush=True)
            time.sleep(3)
            try: f.quit()
            except Exception: pass
            f = conectar()
    sys.exit(f'No se pudo subir {remoto}')


def mirror(f, local, remoto):
    hechas = set(); n = 0; saltados = 0
    remoto = remoto.strip('/')
    for raiz, dirs, archivos in os.walk(local):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.git'))
        rel = os.path.relpath(raiz, local).replace(os.sep, '/')
        dest = remoto if rel == '.' else f'{remoto}/{rel}'
        crear_carpetas(f, dest, hechas)
        tams = tamanos_remotos(f, dest)
        for a in sorted(archivos):
            if a.startswith('.git'):
                continue
            ruta = os.path.join(raiz, a)
            if not a.lower().endswith(SIEMPRE) and tams.get(a) == os.path.getsize(ruta):
                saltados += 1
                continue
            print(f'Transferring file `{dest}/{a}`', flush=True)
            f = subir(f, ruta, f'{dest}/{a}'); n += 1
    print(f'Listo: {n} archivos subidos, {saltados} sin cambios', flush=True)
    return f


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    cmd, args = sys.argv[1], sys.argv[2:]
    f = conectar()
    try:
        if cmd == 'mirror':
            f = mirror(f, args[0], args[1])
        elif cmd == 'put':
            crear_carpetas(f, os.path.dirname(args[1]), set())
            f = subir(f, args[0], args[1]); print(f'Subido {args[1]}')
        elif cmd == 'get':
            with open(args[1], 'wb') as fh:
                f.retrbinary(f'RETR {args[0]}', fh.write)
        elif cmd == 'rm':
            try: f.delete(args[0])
            except ftplib.error_perm: pass
        elif cmd == 'existe':
            # Primero pregunto el tamaño (sirve también para archivos ocultos como .htaccess); si el servidor no lo soporta, listo la carpeta
            try:
                f.voidcmd('TYPE I')
                if f.size(args[0]) is not None: sys.exit(0)
            except ftplib.error_perm as e:
                if str(e)[:3] == '550': sys.exit(1)
            carpeta, nombre = os.path.split(args[0].rstrip('/'))
            try:
                nombres = [n for n, _ in f.mlsd(carpeta or '.')]
            except ftplib.error_perm:
                nombres = [os.path.basename(x) for x in f.nlst(carpeta or '.')]
            sys.exit(0 if nombre in nombres else 1)
        else:
            sys.exit(__doc__)
    finally:
        try: f.quit()
        except Exception: pass


if __name__ == '__main__':
    main()
