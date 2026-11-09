<?php
// Conexión a la base y creación automática de las tablas de JuntOS.
const GOOGLE_CLIENT_ID = '457912406995-23uq0tpoet60emrrgclsdeansh8cq3il.apps.googleusercontent.com';
const DIAS_PRUEBA = 30;
const VERSION_ESQUEMA = 1;

function db(): PDO {
  static $db = null;
  if ($db) return $db;
  $ruta = getenv('JUNTOS_CONFIG') ?: dirname(__DIR__, 3) . '/juntos-config.php';
  $c = require $ruta;
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
  $db->prepare("REPLACE INTO meta (clave, valor) VALUES ('version', ?)")->execute([VERSION_ESQUEMA]);
}
