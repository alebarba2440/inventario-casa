<?php
// Página de prueba: confirma que JuntOS se conecta a la base MySQL. No muestra datos secretos.
header('Content-Type: text/html; charset=utf-8');
$cfgPath = dirname(__DIR__, 3) . '/juntos-config.php';
echo '<meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:24px;text-align:center">';
echo '<h1>JuntOS · prueba de base</h1>';
if (!is_file($cfgPath)) { echo '<p style="color:#b91c1c">❌ No encuentro el archivo de configuración.</p>'; exit; }
$c = require $cfgPath;
try {
  $db = new PDO("mysql:host={$c['host']};dbname={$c['name']};charset=utf8mb4", $c['user'], $c['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
  $v = $db->query('SELECT VERSION()')->fetchColumn();
  $t = $db->query('SHOW TABLES')->rowCount();
  echo '<p style="color:#15803d;font-size:1.3em">✅ ¡Conexión OK!</p>';
  echo '<p>MySQL ' . htmlspecialchars($v) . ' · tablas: ' . $t . ' · PHP ' . PHP_VERSION . '</p>';
} catch (Throwable $e) {
  // Mensaje genérico + código, sin exponer usuario ni contraseña
  echo '<p style="color:#b91c1c">❌ No pude conectar (código ' . htmlspecialchars((string)$e->getCode()) . ').</p>';
}
