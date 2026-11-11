<?php
// Conexión a la base y creación automática de las tablas de JuntOS.
const GOOGLE_CLIENT_ID = '457912406995-23uq0tpoet60emrrgclsdeansh8cq3il.apps.googleusercontent.com';
const DIAS_PRUEBA = 30;
const VERSION_ESQUEMA = 10;

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
  if ($v < 5) {
    // Mensajes globales del panel: le llegan a todos al abrir la app. Cada usuario guarda hasta cuál ya vio.
    $db->exec("CREATE TABLE IF NOT EXISTS mensajes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      titulo VARCHAR(120) NOT NULL,
      texto TEXT NOT NULL,
      emoji VARCHAR(16) NOT NULL DEFAULT '',
      creado DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $c = $db->query("SHOW COLUMNS FROM usuarios LIKE 'msg_visto'")->fetch();
    if (!$c) $db->exec("ALTER TABLE usuarios ADD COLUMN msg_visto INT NOT NULL DEFAULT 0");
  }
  if ($v < 6) {
    // Casilla de notificaciones: avisos automáticos de cada pareja (o de una persona) y qué leyó cada uno.
    $db->exec("CREATE TABLE IF NOT EXISTS notifs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pareja_id INT NOT NULL,
      usuario_id INT NULL,
      clave CHAR(64) NOT NULL UNIQUE,
      titulo VARCHAR(160) NOT NULL,
      texto VARCHAR(500) NOT NULL DEFAULT '',
      emoji VARCHAR(16) NOT NULL DEFAULT '',
      url VARCHAR(200) NOT NULL DEFAULT '',
      creado DATETIME NOT NULL,
      INDEX (pareja_id, id),
      FOREIGN KEY (pareja_id) REFERENCES parejas(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS leidos (
      usuario_id INT NOT NULL,
      clave VARCHAR(24) NOT NULL,
      PRIMARY KEY (usuario_id, clave),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  }
  if ($v < 7) {
    // Tipo de aviso y a qué fecha de vencimiento corresponde: los de prueba/vencimiento se ocultan si la fecha cambió
    // (se sumaron días, se pagó). Los de prueba que había quedaron viejos: se borran y el cron arma los que correspondan.
    $c = $db->query("SHOW COLUMNS FROM notifs LIKE 'tipo'")->fetch();
    if (!$c) $db->exec("ALTER TABLE notifs ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT '', ADD COLUMN ref VARCHAR(40) NOT NULL DEFAULT ''");
    $db->exec("DELETE FROM notifs WHERE titulo LIKE '%de prueba%' OR titulo LIKE 'Terminó tu prueba%' OR titulo LIKE 'Tu suscripción venció%'");
  }
  if ($v < 8) {
    // Qué plan pagó cada pareja la última vez (mensual / anual), para verlo en el panel
    $c = $db->query("SHOW COLUMNS FROM parejas LIKE 'plan_pago'")->fetch();
    if (!$c) $db->exec("ALTER TABLE parejas ADD COLUMN plan_pago VARCHAR(10) NULL");
    // Precios y datos de transferencia: texto largo (la tabla meta guarda hasta 255)
    $db->exec("CREATE TABLE IF NOT EXISTS ajustes (clave VARCHAR(40) PRIMARY KEY, valor TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  }
  if ($v < 9) {
    // Respuestas privadas de cada uno (chequeo semanal de Coaching, lista de deseos de Intimidad):
    // la pareja NO las puede leer; el servidor devuelve solo los resultados (las dos cuando contestaron ambos, o las coincidencias)
    $db->exec("CREATE TABLE IF NOT EXISTS privado (
      usuario_id INT NOT NULL,
      pareja_id INT NOT NULL,
      clave VARCHAR(40) NOT NULL,
      data TEXT NOT NULL,
      actualizado DATETIME NOT NULL,
      PRIMARY KEY (usuario_id, clave),
      INDEX (pareja_id, clave),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  }
  if ($v < 10) {
    // Notificaciones que cada uno borró de su casilla (no se borran para la pareja ni para los demás)
    $db->exec("CREATE TABLE IF NOT EXISTS notif_borradas (
      usuario_id INT NOT NULL,
      clave VARCHAR(24) NOT NULL,
      PRIMARY KEY (usuario_id, clave),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  }
  $db->prepare("REPLACE INTO meta (clave, valor) VALUES ('version', ?)")->execute([VERSION_ESQUEMA]);
}

// ---------- Archivos ----------
const MAX_ARCHIVO = 3 * 1024 * 1024;         // 3 MB por archivo (las fotos llegan achicadas, ~100-200 KB)
const CUOTA_PAREJA = 50 * 1024 * 1024;      // 50 MB por pareja (cientos de fotos de documentos)
const TIPOS_ARCHIVO = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf'];
const TIPOS_SUBIDA = ['image/jpeg', 'image/webp'];   // solo fotos (achicadas en el celu); los PDF ya subidos se siguen viendo

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

// ---------- Casilla de notificaciones ----------
// Guarda un aviso para una pareja (o solo para una persona, con $uid) y, si es nuevo, lo manda como push.
// $clave evita repetidos: el mismo aviso no se guarda ni se manda dos veces. Necesita push.php cargado.
// $tipo 'prueba' / 'vence': avisos de suscripción; el nuevo reemplaza a los anteriores de la pareja y $ref es la fecha de vencimiento a la que se refiere.
function notificar(int $pid, ?int $uid, string $clave, string $titulo, string $texto, string $emoji = '', string $url = '', string $tipo = '', string $ref = ''): bool {
  $h = hash('sha256', $clave);
  $ya = db()->prepare('SELECT 1 FROM notifs WHERE clave = ?'); $ya->execute([$h]);
  if ($ya->fetchColumn()) return false;   // ya se mandó
  if ($tipo === 'prueba' || $tipo === 'vence') db()->prepare("DELETE FROM notifs WHERE pareja_id = ? AND tipo IN ('prueba','vence')")->execute([$pid]);
  $q = db()->prepare('INSERT IGNORE INTO notifs (pareja_id, usuario_id, clave, titulo, texto, emoji, url, tipo, ref, creado) VALUES (?,?,?,?,?,?,?,?,?,?)');
  $q->execute([$pid, $uid, $h, mb_substr($titulo, 0, 160), mb_substr($texto, 0, 500), $emoji, $url, $tipo, $ref, gmdate('Y-m-d H:i:s')]);
  if ($q->rowCount() === 0) return false;
  if (function_exists('pushUsuario')) {
    if ($uid) $para = [$uid];
    else { $m = db()->prepare('SELECT id FROM usuarios WHERE pareja_id = ?'); $m->execute([$pid]); $para = array_map('intval', $m->fetchAll(PDO::FETCH_COLUMN)); }
    foreach ($para as $u) pushUsuario($u, ['title' => trim($emoji . ' ' . $titulo), 'body' => $texto, 'url' => ($url && $url[0] !== '#') ? $url : 'index.html', 'tag' => 'notif-' . substr(hash('sha256', $clave), 0, 12)]);
  }
  return true;
}
// Fecha hasta la que una pareja puede usar la app (prueba o pago), como texto: sirve de "ref" de los avisos de suscripción
function hastaPareja(array $p): string {
  return gmdate('Y-m-d H:i:s', max(strtotime($p['prueba_hasta'] . ' UTC'), $p['pago_hasta'] ? strtotime($p['pago_hasta'] . ' UTC') : 0));
}

// ---------- Precios y datos para pagar por transferencia (se editan desde el panel) ----------
const PRECIOS_DEF = ['mensual' => 5000, 'anual' => 50000, 'alias' => '', 'cbu' => '', 'titular' => '', 'banco' => '', 'contacto' => ''];
function precios(): array {
  $v = db()->query("SELECT valor FROM ajustes WHERE clave = 'precios'")->fetchColumn();
  $p = array_merge(PRECIOS_DEF, json_decode($v ?: '{}', true) ?: []);
  $p['mensual'] = (int)$p['mensual']; $p['anual'] = (int)$p['anual'];
  return array_intersect_key($p, PRECIOS_DEF);
}
