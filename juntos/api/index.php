<?php
// API de JuntOS: login con Google, sesión, crear pareja y unirse con código.
require __DIR__ . '/db.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const COOKIE = 'juntos_s';
const DIAS_SESION = 60;

function responder($datos, int $estado = 200): void { http_response_code($estado); echo json_encode($datos, JSON_UNESCAPED_UNICODE); exit; }
function error_(string $msg, int $estado = 400): void { responder(['error' => $msg], $estado); }
function ahora(): string { return gmdate('Y-m-d H:i:s'); }
function entrada(): array { $j = json_decode(file_get_contents('php://input') ?: '{}', true); return is_array($j) ? $j : []; }

// Verifica el token de Google (firma, emisor, destinatario y vencimiento los chequea Google en tokeninfo).
function verificarGoogle(string $credencial): array {
  $url = (getenv('JUNTOS_TOKENINFO') ?: 'https://oauth2.googleapis.com/tokeninfo') . '?id_token=' . urlencode($credencial);
  $ch = curl_init($url);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
  $r = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  $t = json_decode($r ?: '', true);
  if ($code !== 200 || !is_array($t)) error_('No pudimos validar tu cuenta de Google', 401);
  if (($t['aud'] ?? '') !== GOOGLE_CLIENT_ID) error_('Cuenta no válida para JuntOS', 401);
  if (!in_array($t['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)) error_('Emisor inválido', 401);
  if ((int)($t['exp'] ?? 0) < time()) error_('El ingreso venció, probá de nuevo', 401);
  if (($t['email_verified'] ?? '') !== 'true' && ($t['email_verified'] ?? null) !== true) error_('Tu mail de Google no está verificado', 401);
  return $t;
}

function crearSesion(int $uid): void {
  $token = bin2hex(random_bytes(32));
  $exp = time() + DIAS_SESION * 86400;
  db()->prepare('INSERT INTO sesiones (token_hash, usuario_id, creado, expira) VALUES (?,?,?,?)')
    ->execute([hash('sha256', $token), $uid, ahora(), gmdate('Y-m-d H:i:s', $exp)]);
  setcookie(COOKIE, $token, ['expires' => $exp, 'path' => '/juntos/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
}

function usuarioActual(): ?array {
  $tok = $_COOKIE[COOKIE] ?? '';
  if (!preg_match('/^[a-f0-9]{64}$/', $tok)) return null;
  $s = db()->prepare('SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ? AND s.expira > ?');
  $s->execute([hash('sha256', $tok), ahora()]);
  return $s->fetch() ?: null;
}

function requerirUsuario(): array { $u = usuarioActual(); if (!$u) error_('Tenés que ingresar', 401); return $u; }

function estado(array $u): array {
  $out = ['usuario' => ['nombre' => $u['nombre'], 'email' => $u['email'], 'foto' => $u['foto']], 'pareja' => null];
  if ($u['pareja_id']) {
    $p = db()->prepare('SELECT * FROM parejas WHERE id = ?'); $p->execute([$u['pareja_id']]); $p = $p->fetch();
    $m = db()->prepare('SELECT nombre, foto, email FROM usuarios WHERE pareja_id = ? ORDER BY id'); $m->execute([$u['pareja_id']]);
    $hasta = max(strtotime($p['prueba_hasta'] . ' UTC'), $p['pago_hasta'] ? strtotime($p['pago_hasta'] . ' UTC') : 0);
    $out['pareja'] = [
      'nombre' => $p['nombre'], 'codigo' => $p['codigo'],
      'miembros' => $m->fetchAll(),
      'plan' => $p['pago_hasta'] && strtotime($p['pago_hasta'] . ' UTC') > time() ? 'pago' : 'prueba',
      'activo_hasta' => gmdate('c', $hasta),
      'dias_restantes' => max(0, (int)ceil(($hasta - time()) / 86400)),
      'solo_lectura' => $hasta < time(),
    ];
  }
  return $out;
}

function codigoNuevo(): string {
  $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  do {
    $c = ''; for ($i = 0; $i < 6; $i++) $c .= $abc[random_int(0, strlen($abc) - 1)];
    $q = db()->prepare('SELECT 1 FROM parejas WHERE codigo = ?'); $q->execute([$c]);
  } while ($q->fetchColumn());
  return $c;
}

try {
  $accion = $_GET['a'] ?? '';
  $metodo = $_SERVER['REQUEST_METHOD'];
  // Protección contra pedidos desde otros sitios: todo POST debe traer este encabezado (un formulario ajeno no puede).
  if ($metodo === 'POST' && ($_SERVER['HTTP_X_JUNTOS'] ?? '') !== '1') error_('Pedido no permitido', 403);

  switch ("$metodo $accion") {
    case 'POST login':
      $t = verificarGoogle((string)(entrada()['credencial'] ?? ''));
      $q = db()->prepare('SELECT id FROM usuarios WHERE google_sub = ?'); $q->execute([$t['sub']]);
      $id = $q->fetchColumn();
      if ($id) {
        db()->prepare('UPDATE usuarios SET email=?, nombre=?, foto=?, ultimo_ingreso=? WHERE id=?')
          ->execute([$t['email'], $t['name'] ?? '', $t['picture'] ?? '', ahora(), $id]);
      } else {
        db()->prepare('INSERT INTO usuarios (google_sub, email, nombre, foto, creado, ultimo_ingreso) VALUES (?,?,?,?,?,?)')
          ->execute([$t['sub'], $t['email'], $t['name'] ?? '', $t['picture'] ?? '', ahora(), ahora()]);
        $id = db()->lastInsertId();
      }
      crearSesion((int)$id);
      $u = db()->prepare('SELECT * FROM usuarios WHERE id = ?'); $u->execute([$id]);
      responder(estado($u->fetch()));

    case 'GET yo':
      $u = usuarioActual();
      responder($u ? estado($u) : ['usuario' => null]);

    case 'POST salir':
      $tok = $_COOKIE[COOKIE] ?? '';
      if ($tok) db()->prepare('DELETE FROM sesiones WHERE token_hash = ?')->execute([hash('sha256', $tok)]);
      setcookie(COOKIE, '', ['expires' => time() - 3600, 'path' => '/juntos/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
      responder(['ok' => true]);

    case 'POST crear_pareja':
      $u = requerirUsuario();
      if ($u['pareja_id']) error_('Ya estás en una pareja');
      $nombre = trim((string)(entrada()['nombre'] ?? ''));
      if ($nombre === '' || mb_strlen($nombre) > 80) error_('Poné un nombre para la pareja (hasta 80 letras)');
      $db = db(); $db->beginTransaction();
      $db->prepare('INSERT INTO parejas (nombre, codigo, creado, prueba_hasta) VALUES (?,?,?,?)')
        ->execute([$nombre, codigoNuevo(), ahora(), gmdate('Y-m-d H:i:s', time() + DIAS_PRUEBA * 86400)]);
      $db->prepare('UPDATE usuarios SET pareja_id = ? WHERE id = ?')->execute([$db->lastInsertId(), $u['id']]);
      $db->commit();
      responder(estado(requerirUsuario()));

    case 'POST unirse':
      $u = requerirUsuario();
      if ($u['pareja_id']) error_('Ya estás en una pareja');
      $codigo = strtoupper(preg_replace('/\s+/', '', (string)(entrada()['codigo'] ?? '')));
      if (!preg_match('/^[A-Z0-9]{6}$/', $codigo)) error_('El código tiene 6 letras y números');
      $db = db(); $db->beginTransaction();
      $p = $db->prepare('SELECT id FROM parejas WHERE codigo = ? FOR UPDATE'); $p->execute([$codigo]);
      $pid = $p->fetchColumn();
      if (!$pid) { $db->rollBack(); error_('No encontramos ese código', 404); }
      $n = $db->prepare('SELECT COUNT(*) FROM usuarios WHERE pareja_id = ?'); $n->execute([$pid]);
      if ((int)$n->fetchColumn() >= 2) { $db->rollBack(); error_('Esa pareja ya está completa'); }
      $db->prepare('UPDATE usuarios SET pareja_id = ? WHERE id = ?')->execute([$pid, $u['id']]);
      $db->commit();
      responder(estado(requerirUsuario()));

    default:
      error_('Acción desconocida', 404);
  }
} catch (Throwable $e) {
  error_log('JuntOS API: ' . $e->getMessage());
  error_('Algo falló en el servidor, probá de nuevo', 500);
}
