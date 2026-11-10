<?php
// Conexión a la base y creación automática de las tablas de JuntOS.
const GOOGLE_CLIENT_ID = '457912406995-23uq0tpoet60emrrgclsdeansh8cq3il.apps.googleusercontent.com';
const DIAS_PRUEBA = 30;
const VERSION_ESQUEMA = 4;

function config(): array {
  static $c = null;
  if ($c === null) $c = require (getenv('JUNTOS_CONFIG') ?: dirname(__DIR__, 3) . '/juntos-config.php');
  return $c;
}

function db(): PDO {
  static $db = null;
  if ($db) return $db;
  $c = config();
  $db = new PDO("mysql:host={$c['host']};dbname={$c['name']};charset=utf8mb4", $c['user'], $c['pass'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);
  $db->exec("SET time_zone = '+00:00'");
  esquema($db);
  return $db;
}

function esquema(PDO $db): void {
  $db->exec("CREATE TABLE IF NOT EXISTS meta (clave VARCHAR(40) PRIMARY KEY, valor VARCHAR(255)) ENGINE=InnoDB");
  $v = (int)$db->query("SELECT valor FROM meta WHERE clave='version'")->fetchColumn();
  if ($v >= VERSION_ESQUEMA) return;
  if ($v < 1) {
    $db->exec("CREATE TABLE IF NOT EXISTS parejas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(80) NOT NULL,
      codigo CHAR(6) NOT NULL UNIQUE,
      creado DATETIME NOT NULL,
      prueba_hasta DATETIME NOT NULL,
      pago_hasta DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      google_sub VARCHAR(64) NOT NULL UNIQUE,
      email VARCHAR(190) NOT NULL,
      nombre VARCHAR(120) NOT NULL DEFAULT '',
      foto VARCHAR(500) NOT NULL DEFAULT '',
      pareja_id INT NULL,
      creado DATETIME NOT NULL,
      ultimo_ingreso DATETIME NOT NULL,
      INDEX (pareja_id),
      FOREIGN KEY (pareja_id) REFERENCES parejas(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS sesiones (
      token_hash CHAR(64) PRIMARY KEY,
      usuario_id INT NOT NULL,
      creado DATETIME NOT NULL,
      expira DATETIME NOT NULL,
      INDEX (usuario_id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  }
  if ($v < 2) {
    // Datos de las secciones: un "documento" JSON por (pareja, colección, id), como en Firebase.
    $db->exec("CREATE TABLE IF NOT EXISTS docs (
      pareja_id INT NOT NULL,
      col VARCHAR(64) NOT NULL,
      id VARCHAR(128) NOT NULL,
      data MEDIUMTEXT NULL,
      ver BIGINT NOT NULL,
      PRIMARY KEY (pareja_id, col, id),
      INDEX (pareja_id, ver),
      FOREIGN KEY (pareja_id) REFERENCES parejas(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS seq (n BIGINT AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB");
    // Datos de cada persona (gastos personales, ajustes): no se comparten con la pareja.
    $db->exec("CREATE TABLE IF NOT EXISTS personal (
      usuario_id INT PRIMARY KEY,
      data MEDIUMTEXT NOT NULL,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  }
  if ($v < 3) {
    // Notificaciones: los celus suscriptos de cada persona y los avisos ya mandados (para no repetir).
    $db->exec("CREATE TABLE IF NOT EXISTS push_subs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NOT NULL,
      endpoint_hash CHAR(64) NOT NULL UNIQUE,
      endpoint TEXT NOT NULL,
      p256dh VARCHAR(120) NOT NULL,
      auth VARCHAR(40) NOT NULL,
      creado DATETIME NOT NULL,
      INDEX (usuario_id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS avisos (
      clave CHAR(64) PRIMARY KEY,
      enviado DATETIME NOT NULL,
      INDEX (enviado)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  }
  if ($v < 4) {
    // Archivos (fotos y documentos): el contenido va a una carpeta fuera de la web; acá solo los datos.
    $db->exec("CREATE TABLE IF NOT EXISTS archivos (
      id CHAR(24) PRIMARY KEY,
      pareja_id INT NOT NULL,
      nombre VARCHAR(160) NOT NULL DEFAULT '',
      tipo VARCHAR(60) NOT NULL,
      bytes INT NOT NULL,
      creado DATETIME NOT NULL,
      INDEX (pareja_id),
      FOREIGN KEY (pareja_id) REFERENCES parejas(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  }
  $db->prepare("REPLACE INTO meta (clave, valor) VALUES ('version', ?)")->execute([VERSION_ESQUEMA]);
}

// ---------- Archivos ----------
const MAX_ARCHIVO = 10 * 1024 * 1024;        // 10 MB por archivo
const CUOTA_PAREJA = 300 * 1024 * 1024;     // 300 MB por pareja
const TIPOS_ARCHIVO = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf'];

// Carpeta de archivos: fuera de public_html si se puede (junto a juntos-config.php); si no, una carpeta protegida.
function carpetaArchivos(): string {
  static $c = null;
  if ($c) return $c;
  $fuera = getenv('JUNTOS_ARCHIVOS') ?: dirname(__DIR__, 3) . '/juntos-archivos';
  if ((is_dir($fuera) || @mkdir($fuera, 0750, true)) && is_writable($fuera)) return $c = $fuera;
  $dentro = __DIR__ . '/archivos';
  if (!is_dir($dentro)) @mkdir($dentro, 0750, true);
  if (!file_exists("$dentro/.htaccess")) @file_put_contents("$dentro/.htaccess", "Require all denied\nDeny from all\n");
  if (!file_exists("$dentro/index.html")) @file_put_contents("$dentro/index.html", '');
  return $c = $dentro;
}
function rutaArchivo(int $pid, string $id, string $tipo): string {
  return carpetaArchivos() . '/' . $pid . '/' . $id . '.' . (TIPOS_ARCHIVO[$tipo] ?? 'bin');
}
// Tipo real del archivo mirando su contenido (no lo que dice el navegador)
function tipoReal(string $ruta): ?string {
  $h = (string)@file_get_contents($ruta, false, null, 0, 16);
  if (strncmp($h, "\xFF\xD8\xFF", 3) === 0) return 'image/jpeg';
  if (strncmp($h, "\x89PNG\r\n\x1A\n", 8) === 0) return 'image/png';
  if (strncmp($h, 'RIFF', 4) === 0 && substr($h, 8, 4) === 'WEBP') return 'image/webp';
  if (strncmp($h, '%PDF', 4) === 0) return 'application/pdf';
  return null;
}
