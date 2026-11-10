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
function iso(?string $f): ?string { return $f ? str_replace(' ', 'T', $f) . 'Z' : null; }
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
  $out = ['usuario' => ['nombre' => $u['nombre'], 'email' => $u['email'], 'foto' => $u['foto'], 'admin' => esAdmin($u)], 'pareja' => null];
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

function esAdmin(array $u): bool {
  $lista = array_filter(array_map(fn($m) => strtolower(trim($m)), explode(',', (string)(config()['admins'] ?? ''))));
  return in_array(strtolower($u['email']), $lista, true);
}
function requerirAdmin(): array { $u = requerirUsuario(); if (!esAdmin($u)) error_('No tenés acceso al panel', 403); return $u; }

// ---------- Datos de las secciones ----------
const MAX_DOC = 900000; // ~900 KB por documento

function nuevaVersion(): int { db()->exec('INSERT INTO seq () VALUES ()'); $v = (int)db()->lastInsertId(); if ($v % 500 === 0) db()->exec("DELETE FROM seq WHERE n < $v"); return $v; }

// Une como Firebase "set con merge": mezcla objetos en profundidad. {"__op":"delete"} borra, {"__op":"ts"} = hora del servidor.
// Se trabaja con objetos (stdClass) para no confundir {} con [] al guardar.
function esOp($x, string $n): bool { return is_object($x) && count((array)$x) === 1 && (($x->__op ?? null) === $n); }
function resolver($v) {
  if (esOp($v, 'ts')) return (int)round(microtime(true) * 1000);
  if (is_object($v)) { $o = new stdClass; foreach ($v as $k => $x) { if (!esOp($x, 'delete')) $o->$k = resolver($x); } return $o; }
  if (is_array($v)) return array_map('resolver', $v);
  return $v;
}
function mezclar(stdClass $base, stdClass $cambios): stdClass {
  foreach ($cambios as $k => $x) {
    if (esOp($x, 'delete')) { unset($base->$k); continue; }
    if (is_object($x) && !esOp($x, 'ts') && isset($base->$k) && is_object($base->$k)) $base->$k = mezclar($base->$k, $x);
    else $base->$k = resolver($x);
  }
  return $base;
}

function parejaActiva(array $u): array {
  if (!$u['pareja_id']) error_('Primero creá o unite a una pareja', 409);
  $q = db()->prepare('SELECT * FROM parejas WHERE id = ?'); $q->execute([$u['pareja_id']]); return $q->fetch();
}
function soloLectura(array $p): bool {
  $h = max(strtotime($p['prueba_hasta'] . ' UTC'), $p['pago_hasta'] ? strtotime($p['pago_hasta'] . ' UTC') : 0);
  return $h < time();
}
function docsDesde(int $pid, int $desde): array {
  $q = db()->prepare('SELECT col, id, data, ver FROM docs WHERE pareja_id = ? AND ver > ? ORDER BY ver');
  $q->execute([$pid, $desde]);
  $out = []; $max = $desde;
  foreach ($q as $r) { $out[] = ['c' => $r['col'], 'i' => $r['id'], 'd' => $r['data'] === null ? null : json_decode($r['data']), 'v' => (int)$r['ver']]; $max = max($max, (int)$r['ver']); }
  return [$out, $max];
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

    case 'GET boot':
      // Todo lo que una pantalla necesita al abrir: quién sos, tu pareja, los datos compartidos y los tuyos.
      $u = usuarioActual();
      if (!$u) responder(['usuario' => null]);
      $e = estado($u);
      if (!$u['pareja_id']) responder($e);
      [$docs, $ver] = docsDesde((int)$u['pareja_id'], (int)($_GET['desde'] ?? 0));
      $q = db()->prepare('SELECT data FROM personal WHERE usuario_id = ?'); $q->execute([$u['id']]);
      $e['pareja_id'] = (int)$u['pareja_id']; $e['usuario_id'] = (int)$u['id'];
      $e['docs'] = $docs; $e['ver'] = $ver; $e['personal'] = json_decode($q->fetchColumn() ?: '{}', true) ?: new stdClass;
      responder($e);

    case 'GET cambios':
      $u = requerirUsuario(); $p = parejaActiva($u);
      [$docs, $ver] = docsDesde((int)$p['id'], (int)($_GET['desde'] ?? 0));
      responder(['docs' => $docs, 'ver' => $ver]);

    case 'POST escribir':
      $u = requerirUsuario(); $p = parejaActiva($u);
      if (soloLectura($p)) error_('Tu período terminó: podés ver todo, pero no guardar cambios', 402);
      $in = json_decode(file_get_contents('php://input') ?: '{}'); // como objetos, para respetar {} vs []
      $ops = $in->ops ?? [];
      if (!is_array($ops) || count($ops) > 500) error_('Pedido inválido');
      $db = db(); $db->beginTransaction();
      $sel = $db->prepare('SELECT data FROM docs WHERE pareja_id = ? AND col = ? AND id = ? FOR UPDATE');
      $put = $db->prepare('INSERT INTO docs (pareja_id, col, id, data, ver) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE data = VALUES(data), ver = VALUES(ver)');
      foreach ($ops as $o) {
        if (!is_object($o)) { $db->rollBack(); error_('Pedido inválido'); }
        $col = (string)($o->c ?? ''); $id = (string)($o->i ?? ''); $tipo = $o->t ?? '';
        if (!preg_match('/^[A-Za-z0-9_\-]{1,64}$/', $col) || $id === '' || strlen($id) > 128 || preg_match('/[\/\x00-\x1f]/', $id)) { $db->rollBack(); error_('Documento inválido'); }
        if ($tipo === 'delete') { $data = null; }
        else {
          $d = $o->d ?? null; if (!is_object($d)) { $db->rollBack(); error_('Datos inválidos'); }
          if ($tipo === 'merge') { $sel->execute([$p['id'], $col, $id]); $prev = $sel->fetchColumn(); $base = $prev ? json_decode($prev) : null; $data = mezclar(is_object($base) ? $base : new stdClass, $d); }
          else $data = resolver($d);
          $data = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
          if (strlen($data) > MAX_DOC) { $db->rollBack(); error_('Documento demasiado grande'); }
        }
        $put->execute([$p['id'], $col, $id, $data, nuevaVersion()]);
      }
      $db->commit();
      [$docs, $ver] = docsDesde((int)$p['id'], (int)($in->desde ?? 0));
      responder(['docs' => $docs, 'ver' => $ver]);

    case 'POST personal':
      // Guarda claves propias de esta persona (ej. gastos personales). null = borrar la clave.
      $u = requerirUsuario();
      $cambios = entrada()['claves'] ?? [];
      if (!is_array($cambios)) error_('Pedido inválido');
      $db = db(); $db->beginTransaction();
      $q = $db->prepare('SELECT data FROM personal WHERE usuario_id = ? FOR UPDATE'); $q->execute([$u['id']]);
      $data = json_decode($q->fetchColumn() ?: '{}', true) ?: [];
      foreach ($cambios as $k => $v) { if (!is_string($k) || strlen($k) > 80) continue; if ($v === null) unset($data[$k]); else $data[$k] = (string)$v; }
      $j = json_encode($data ?: new stdClass, JSON_UNESCAPED_UNICODE);
      if (strlen($j) > 4000000) { $db->rollBack(); error_('Demasiados datos personales'); }
      $db->prepare('INSERT INTO personal (usuario_id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)')->execute([$u['id'], $j]);
      $db->commit();
      responder(['ok' => true]);

    case 'GET admin_datos':
      requerirAdmin();
      $ps = db()->query('SELECT * FROM parejas ORDER BY creado DESC')->fetchAll();
      $us = db()->query('SELECT id, email, nombre, foto, pareja_id, creado, ultimo_ingreso FROM usuarios ORDER BY creado DESC')->fetchAll();
      $porPareja = []; $sueltos = [];
      foreach ($us as $x) { if ($x['pareja_id']) $porPareja[$x['pareja_id']][] = $x; else $sueltos[] = $x; }
      $t = time(); $res = ['usuarios' => count($us), 'parejas' => count($ps), 'prueba' => 0, 'pago' => 0, 'vencidas' => 0,
        'altas_semana' => count(array_filter($us, fn($x) => strtotime($x['creado'] . ' UTC') > $t - 7 * 86400))];
      $lista = [];
      foreach ($ps as $p) {
        $pago = $p['pago_hasta'] ? strtotime($p['pago_hasta'] . ' UTC') : 0;
        $prueba = strtotime($p['prueba_hasta'] . ' UTC');
        $hasta = max($pago, $prueba);
        $estado = $pago > $t ? 'pago' : ($prueba > $t ? 'prueba' : 'vencida');
        $res[$estado === 'vencida' ? 'vencidas' : $estado]++;
        $ms = $porPareja[$p['id']] ?? [];
        $lista[] = ['id' => (int)$p['id'], 'nombre' => $p['nombre'], 'codigo' => $p['codigo'], 'creado' => iso($p['creado']),
          'estado' => $estado, 'activo_hasta' => gmdate('c', $hasta), 'dias' => (int)ceil(($hasta - $t) / 86400),
          'pago_hasta' => iso($p['pago_hasta']),
          'ultimo_ingreso' => $ms ? iso(max(array_column($ms, 'ultimo_ingreso'))) : null,
          'miembros' => array_map(fn($m) => ['nombre' => $m['nombre'], 'email' => $m['email'], 'foto' => $m['foto']], $ms)];
      }
      responder(['resumen' => $res, 'parejas' => $lista,
        'sin_pareja' => array_map(fn($m) => ['nombre' => $m['nombre'], 'email' => $m['email'], 'foto' => $m['foto'], 'creado' => iso($m['creado'])], $sueltos)]);

    case 'POST admin_pago':
      requerirAdmin();
      $in = entrada(); $pid = (int)($in['pareja_id'] ?? 0); $op = $in['op'] ?? '';
      $q = db()->prepare('SELECT * FROM parejas WHERE id = ?'); $q->execute([$pid]); $p = $q->fetch();
      if (!$p) error_('No existe esa pareja', 404);
      if ($op === 'sumar_mes') {
        // El mes pago arranca cuando termina lo que ya tienen (prueba o pago), así no pierden días.
        $base = max(time(), strtotime($p['prueba_hasta'] . ' UTC'), $p['pago_hasta'] ? strtotime($p['pago_hasta'] . ' UTC') : 0);
        $nuevo = (new DateTime('@' . $base))->modify('+1 month')->format('Y-m-d H:i:s');
      } elseif ($op === 'anular') {
        $nuevo = null;
      } elseif ($op === 'intercambiar') {
        // Arreglo puntual: invierte qué integrante ocupa cada lugar (j/a) en los datos de la pareja.
        $db = db(); $db->beginTransaction();
        $q = $db->prepare("SELECT data FROM docs WHERE pareja_id = ? AND col = 'juntos' AND id = 'pareja' FOR UPDATE"); $q->execute([$pid]);
        $d = json_decode($q->fetchColumn() ?: '{}'); if (!is_object($d)) $d = new stdClass;
        $d->invertido = empty($d->invertido);
        $db->prepare("INSERT INTO docs (pareja_id, col, id, data, ver) VALUES (?, 'juntos', 'pareja', ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), ver = VALUES(ver)")
          ->execute([$pid, json_encode($d, JSON_UNESCAPED_UNICODE), nuevaVersion()]);
        $db->commit();
        responder(['ok' => true, 'invertido' => $d->invertido]);
      } else error_('Operación inválida');
      db()->prepare('UPDATE parejas SET pago_hasta = ? WHERE id = ?')->execute([$nuevo, $pid]);
      responder(['ok' => true]);

    case 'GET admin_backup':
      // Copia completa de la base: parejas, usuarios, datos compartidos y personales (sin sesiones).
      requerirAdmin();
      $out = ['formato' => 'juntos-backup-1', 'fecha' => gmdate('c'), 'esquema' => VERSION_ESQUEMA];
      $out['parejas'] = db()->query('SELECT * FROM parejas ORDER BY id')->fetchAll();
      $out['usuarios'] = db()->query('SELECT * FROM usuarios ORDER BY id')->fetchAll();
      $out['docs'] = db()->query('SELECT pareja_id, col, id, data FROM docs WHERE data IS NOT NULL ORDER BY pareja_id, col, id')->fetchAll();
      $out['personal'] = db()->query('SELECT usuario_id, data FROM personal ORDER BY usuario_id')->fetchAll();
      header('Content-Disposition: attachment; filename="juntos-backup-' . gmdate('Y-m-d') . '.json"');
      responder($out);

    case 'POST admin_restaurar':
      // Vuelve la base al estado del backup. Lo que no está en el backup se borra.
      requerirAdmin();
      $b = json_decode(file_get_contents('php://input') ?: '', true);
      if (!is_array($b) || ($b['formato'] ?? '') !== 'juntos-backup-1') error_('No es un backup de Juntos');
      foreach (['parejas', 'usuarios', 'docs', 'personal'] as $k) if (!isset($b[$k]) || !is_array($b[$k])) error_("Backup incompleto ($k)");
      $db = db(); $db->beginTransaction();
      try {
        $pids = array_map(fn($p) => (int)$p['id'], $b['parejas']);
        $uids = array_map(fn($u) => (int)$u['id'], $b['usuarios']);
        // 1) borrar usuarios y parejas que no están en el backup (sus sesiones y datos se van con ellos)
        $db->exec('DELETE FROM usuarios' . ($uids ? ' WHERE id NOT IN (' . implode(',', $uids) . ')' : ''));
        $db->exec('UPDATE usuarios SET pareja_id = NULL');
        $db->exec('DELETE FROM parejas' . ($pids ? ' WHERE id NOT IN (' . implode(',', $pids) . ')' : ''));
        // 2) parejas y usuarios del backup (se actualizan sin borrar, para no perder datos en cascada)
        $qp = $db->prepare('INSERT INTO parejas (id, nombre, codigo, creado, prueba_hasta, pago_hasta) VALUES (?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), codigo=VALUES(codigo), creado=VALUES(creado), prueba_hasta=VALUES(prueba_hasta), pago_hasta=VALUES(pago_hasta)');
        foreach ($b['parejas'] as $p) $qp->execute([(int)$p['id'], $p['nombre'], $p['codigo'], $p['creado'], $p['prueba_hasta'], $p['pago_hasta'] ?: null]);
        $qu = $db->prepare('INSERT INTO usuarios (id, google_sub, email, nombre, foto, pareja_id, creado, ultimo_ingreso) VALUES (?,?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE google_sub=VALUES(google_sub), email=VALUES(email), nombre=VALUES(nombre), foto=VALUES(foto), pareja_id=VALUES(pareja_id), creado=VALUES(creado), ultimo_ingreso=VALUES(ultimo_ingreso)');
        foreach ($b['usuarios'] as $u) $qu->execute([(int)$u['id'], $u['google_sub'], $u['email'], $u['nombre'] ?? '', $u['foto'] ?? '', $u['pareja_id'] ? (int)$u['pareja_id'] : null, $u['creado'], $u['ultimo_ingreso']]);
        // 3) datos compartidos: lo actual se marca como borrado y se carga lo del backup, todo con una versión nueva
        //    (así los celus que están abiertos se enteran solos de los cambios)
        $v = nuevaVersion();
        $db->prepare('UPDATE docs SET data = NULL, ver = ?')->execute([$v]);
        $qd = $db->prepare('INSERT INTO docs (pareja_id, col, id, data, ver) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE data = VALUES(data), ver = VALUES(ver)');
        foreach ($b['docs'] as $d) $qd->execute([(int)$d['pareja_id'], (string)$d['col'], (string)$d['id'], (string)$d['data'], $v]);
        // 4) datos personales
        $db->exec('DELETE FROM personal');
        $qx = $db->prepare('INSERT INTO personal (usuario_id, data) VALUES (?,?)');
        foreach ($b['personal'] as $x) $qx->execute([(int)$x['usuario_id'], (string)$x['data']]);
        $db->commit();
      } catch (Throwable $e) { $db->rollBack(); error_log('JuntOS restaurar: ' . $e->getMessage()); error_('No se pudo restaurar: el backup no coincide con la base', 400); }
      responder(['ok' => true, 'parejas' => count($b['parejas']), 'usuarios' => count($b['usuarios']), 'docs' => count($b['docs'])]);

    default:
      error_('Acción desconocida', 404);
  }
} catch (Throwable $e) {
  error_log('JuntOS API: ' . $e->getMessage());
  error_('Algo falló en el servidor, probá de nuevo', 500);
}
