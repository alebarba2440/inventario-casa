<?php
// API de JuntOS: login con Google, sesión, crear pareja y unirse con código.
require __DIR__ . '/db.php';
require __DIR__ . '/push.php';
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

// Carpeta base según la URL pedida: '/' en juntosapp.com.ar, '/juntos/' en barbamanager.website/juntos
function rutaCookie(): string {
  $p = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
  $i = strpos($p, '/api/');
  return $i === false ? '/' : substr($p, 0, $i + 1);
}

function crearSesion(int $uid): void {
  $token = bin2hex(random_bytes(32));
  $exp = time() + DIAS_SESION * 86400;
  db()->prepare('INSERT INTO sesiones (token_hash, usuario_id, creado, expira) VALUES (?,?,?,?)')
    ->execute([hash('sha256', $token), $uid, ahora(), gmdate('Y-m-d H:i:s', $exp)]);
  setcookie(COOKIE, $token, ['expires' => $exp, 'path' => rutaCookie(), 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
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
      'tuvo_pago' => (bool)$p['pago_hasta'],
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
// La sección Auto traía como "datos iniciales" el auto de Ale y Juli (Clio 2014 y sus services). Si una cuenta nueva
// llegó a guardarlos, se borran (solo en parejas que no son la de ellos) para que cada uno vea únicamente lo suyo.
function limpiarAutoEjemplo(int $pid): void {
  $q = db()->prepare("SELECT COUNT(*) FROM usuarios WHERE pareja_id = ? AND LOWER(email) IN ('alejandrobarba021@gmail.com','gionejulieta@gmail.com')");
  $q->execute([$pid]); if ((int)$q->fetchColumn() > 0) return;
  $q = db()->prepare("SELECT id FROM docs WHERE pareja_id = ? AND col = 'ahorros' AND id = 'copito' AND data IS NOT NULL
    AND (data LIKE '%CONFORT ABS ABCP 2014%' OR data LIKE '%Yul_n - Crespo%' OR data LIKE '%Cintar Santa Fe%')");
  $q->execute([$pid]);
  if ($q->fetchColumn()) db()->prepare("UPDATE docs SET data = NULL, ver = ? WHERE pareja_id = ? AND col = 'ahorros' AND id = 'copito'")->execute([nuevaVersion(), $pid]);
}
function docsDesde(int $pid, int $desde): array {
  $q = db()->prepare('SELECT col, id, data, ver FROM docs WHERE pareja_id = ? AND ver > ? ORDER BY ver');
  $q->execute([$pid, $desde]);
  $out = []; $max = $desde;
  foreach ($q as $r) { $out[] = ['c' => $r['col'], 'i' => $r['id'], 'd' => $r['data'] === null ? null : json_decode($r['data']), 'v' => (int)$r['ver']]; $max = max($max, (int)$r['ver']); }
  return [$out, $max];
}

// Casilla de un usuario: mensajes globales + avisos de su pareja (o suyos), los más nuevos primero, con leído/no leído.
// Los mensajes globales anteriores a que se creara la cuenta se ven como leídos.
function bandeja(array $u): array {
  $items = [];
  $alta = strtotime($u['creado'] . ' UTC');
  foreach (mensajes() as $m) $items[] = ['k' => 'm' . $m['id'], 'tipo' => 'mensaje', 'id' => $m['id'], 'titulo' => $m['titulo'], 'texto' => $m['texto'], 'emoji' => $m['emoji'] ?: '📣', 'url' => '', 'creado' => $m['creado'], 'viejo' => strtotime($m['creado']) < $alta];
  if ($u['pareja_id']) {
    $p = db()->prepare('SELECT * FROM parejas WHERE id = ?'); $p->execute([$u['pareja_id']]); $p = $p->fetch();
    $hasta = $p ? hastaPareja($p) : '';
    $q = db()->prepare('SELECT id, titulo, texto, emoji, url, tipo, ref, creado FROM notifs WHERE pareja_id = ? AND (usuario_id IS NULL OR usuario_id = ?) ORDER BY id DESC LIMIT 30');
    $q->execute([$u['pareja_id'], $u['id']]);
    // Los avisos de prueba/vencimiento solo se ven si siguen valiendo (si se sumaron días o se pagó, desaparecen)
    foreach ($q->fetchAll() as $n) if (!in_array($n['tipo'], ['prueba', 'vence'], true) || $n['ref'] === $hasta) $items[] = ['k' => 'n' . $n['id'], 'tipo' => $n['tipo'] === 'directo' ? 'directo' : 'aviso', 'id' => (int)$n['id'], 'titulo' => $n['titulo'], 'texto' => $n['texto'], 'emoji' => $n['emoji'] ?: '🔔', 'url' => $n['url'], 'creado' => iso($n['creado']), 'viejo' => false];
  }
  usort($items, fn($a, $b) => strcmp($b['creado'], $a['creado']));
  $items = array_slice($items, 0, 40);
  $q = db()->prepare('SELECT clave FROM leidos WHERE usuario_id = ?'); $q->execute([$u['id']]);
  $leidos = array_flip($q->fetchAll(PDO::FETCH_COLUMN));
  foreach ($items as &$i) { $i['leido'] = $i['viejo'] || isset($leidos[$i['k']]); unset($i['viejo']); }
  return $items;
}
// Mensajes globales (los más nuevos primero)
function mensajes(int $max = 30): array {
  $q = db()->query('SELECT id, titulo, texto, emoji, creado FROM mensajes ORDER BY id DESC LIMIT ' . max(1, min(200, $max)));
  return array_map(fn($m) => ['id' => (int)$m['id'], 'titulo' => $m['titulo'], 'texto' => $m['texto'], 'emoji' => $m['emoji'], 'creado' => iso($m['creado'])], $q->fetchAll());
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
        $ultMsg = (int)db()->query('SELECT COALESCE(MAX(id), 0) FROM mensajes')->fetchColumn();   // los mensajes viejos no le saltan como nuevos
        db()->prepare('INSERT INTO usuarios (google_sub, email, nombre, foto, creado, ultimo_ingreso, msg_visto) VALUES (?,?,?,?,?,?,?)')
          ->execute([$t['sub'], $t['email'], $t['name'] ?? '', $t['picture'] ?? '', ahora(), ahora(), $ultMsg]);
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
      setcookie(COOKIE, '', ['expires' => time() - 3600, 'path' => rutaCookie(), 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
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
      // Aviso para quien ya estaba en el espacio
      $otro = $db->prepare('SELECT id FROM usuarios WHERE pareja_id = ? AND id <> ?'); $otro->execute([$pid, $u['id']]);
      $nom = trim(explode(' ', (string)$u['nombre'])[0] ?? '') ?: $u['email'];
      foreach ($otro->fetchAll(PDO::FETCH_COLUMN) as $oid)
        try { notificar((int)$pid, (int)$oid, "unio|$pid|{$u['id']}", "$nom se unió a tu espacio", '¡Ya pueden usar JuntOS de a dos! Todo lo que cargue uno lo ve el otro.', '💞', '', 'unio'); } catch (Throwable $e) { error_log('JuntOS notif: ' . $e->getMessage()); }
      responder(estado(requerirUsuario()));

    case 'GET boot':
      // Todo lo que una pantalla necesita al abrir: quién sos, tu pareja, los datos compartidos y los tuyos.
      $u = usuarioActual();
      if (!$u) responder(['usuario' => null]);
      $e = estado($u);
      if (!$u['pareja_id']) responder($e);
      limpiarAutoEjemplo((int)$u['pareja_id']);
      [$docs, $ver] = docsDesde((int)$u['pareja_id'], (int)($_GET['desde'] ?? 0));
      $q = db()->prepare('SELECT data FROM personal WHERE usuario_id = ?'); $q->execute([$u['id']]);
      $e['pareja_id'] = (int)$u['pareja_id']; $e['usuario_id'] = (int)$u['id'];
      $e['docs'] = $docs; $e['ver'] = $ver; $e['personal'] = json_decode($q->fetchColumn() ?: '{}', true) ?: new stdClass;
      $e['bandeja'] = bandeja($u); $e['msg_visto'] = (int)($u['msg_visto'] ?? 0); $e['precios'] = precios();
      responder($e);

    case 'GET bandeja':
      $u = requerirUsuario();
      responder(['bandeja' => bandeja($u), 'msg_visto' => (int)($u['msg_visto'] ?? 0)]);

    case 'POST leido':
      // Marca como leídos: una lista de claves ("m12" = mensaje, "n7" = aviso) o "todo" (lo que hay hoy en la casilla)
      $u = requerirUsuario(); $k = entrada()['k'] ?? [];
      $ks = $k === 'todo' ? array_column(bandeja($u), 'k') : (array) $k;
      $ins = db()->prepare('INSERT IGNORE INTO leidos (usuario_id, clave) VALUES (?, ?)');
      foreach (array_slice($ks, 0, 100) as $x) if (is_string($x) && preg_match('/^[mn]\d{1,10}$/', $x)) $ins->execute([$u['id'], $x]);
      responder(['ok' => true]);

    case 'POST mensaje_visto':
      $u = requerirUsuario();
      db()->prepare('UPDATE usuarios SET msg_visto = GREATEST(msg_visto, ?) WHERE id = ?')->execute([max(0, (int)(entrada()['id'] ?? 0)), $u['id']]);
      responder(['ok' => true]);

    case 'GET admin_mensajes':
      requerirAdmin();
      responder(['mensajes' => mensajes(100)]);

    case 'POST admin_mensaje':
      requerirAdmin();
      $in = entrada();
      $titulo = trim((string)($in['titulo'] ?? '')); $texto = trim(str_replace("\r", '', (string)($in['texto'] ?? ''))); $emoji = trim((string)($in['emoji'] ?? ''));
      if ($titulo === '' || mb_strlen($titulo) > 120) error_('Poné un título (hasta 120 letras)');
      if ($texto === '' || mb_strlen($texto) > 2000) error_('Escribí el mensaje (hasta 2000 letras)');
      if (mb_strlen($emoji) > 8) $emoji = mb_substr($emoji, 0, 8);
      db()->prepare('INSERT INTO mensajes (titulo, texto, emoji, creado) VALUES (?,?,?,?)')->execute([$titulo, $texto, $emoji, ahora()]);
      $mid = (int)db()->lastInsertId();
      // También llega como notificación a todos los celus con avisos activados
      @set_time_limit(300);
      $cuerpo = mb_strlen($texto) > 140 ? mb_substr($texto, 0, 140) . '…' : $texto;
      $push = 0;
      foreach (db()->query('SELECT * FROM push_subs')->fetchAll() as $sub) {
        try { $c = enviarPush($sub, ['title' => trim(($emoji ?: '📣') . ' ' . $titulo), 'body' => $cuerpo, 'url' => 'index.html', 'tag' => 'msg-' . $mid], 86400); if ($c >= 200 && $c < 300) $push++; }
        catch (Throwable $e) { error_log('JuntOS push mensaje: ' . $e->getMessage()); }
      }
      responder(['ok' => true, 'id' => $mid, 'push' => $push]);

    // Mensajes a una sola cuenta (pareja): van a su casilla como aviso, salen como cartel al abrir y llegan por push
    // ---------- Respuestas privadas ----------
    // chequeo-AAAA-SS: las respuestas de los dos se ven recién cuando contestaron ambos
    // deseos: cada uno marca si / tal / no; solo se devuelven las coincidencias (lo que el otro marcó "no" nunca se ve)
    case 'GET privado':
      $u = requerirUsuario(); $p = parejaActiva($u);
      $clave = (string)($_GET['clave'] ?? '');
      if (!preg_match('/^(chequeo-\d{4}-\d{2}|deseos)$/', $clave)) error_('Clave inválida');
      $q = db()->prepare('SELECT usuario_id, data FROM privado WHERE pareja_id = ? AND clave = ?'); $q->execute([$p['id'], $clave]);
      $mio = null; $otro = null;
      foreach ($q->fetchAll() as $r) { $d = json_decode($r['data'], true); if ((int)$r['usuario_id'] === (int)$u['id']) $mio = $d; else $otro = $d; }
      $out = ['mio' => $mio, 'otro_listo' => $otro !== null];
      if ($clave === 'deseos') {
        $co = [];
        if (is_array($mio) && is_array($otro)) foreach ($mio as $k => $v) {
          $o = $otro[$k] ?? null;
          if (in_array($v, ['si', 'tal'], true) && in_array($o, ['si', 'tal'], true)) $co[$k] = ($v === 'si' && $o === 'si') ? 'si' : 'tal';
        }
        $out['coincidencias'] = $co;
      } elseif ($mio !== null && $otro !== null) $out['otro'] = $otro;
      responder($out);

    case 'POST privado':
      $u = requerirUsuario(); $p = parejaActiva($u); $in = entrada();
      $clave = (string)($in['clave'] ?? '');
      if (!preg_match('/^(chequeo-\d{4}-\d{2}|deseos)$/', $clave)) error_('Clave inválida');
      $data = json_encode($in['data'] ?? null, JSON_UNESCAPED_UNICODE);
      if (strlen($data) > 20000) error_('Demasiados datos');
      db()->prepare('REPLACE INTO privado (usuario_id, pareja_id, clave, data, actualizado) VALUES (?,?,?,?,?)')->execute([$u['id'], $p['id'], $clave, $data, ahora()]);
      responder(['ok' => true]);

    // Aviso a mi pareja (casilla + push): gratitud, cupones, "te toca tirar el dado"
    case 'POST avisar_pareja':
      $u = requerirUsuario(); $p = parejaActiva($u); $in = entrada();
      $titulo = mb_substr(trim((string)($in['titulo'] ?? '')), 0, 120); $texto = mb_substr(trim((string)($in['texto'] ?? '')), 0, 300);
      $url = (string)($in['url'] ?? ''); if (!preg_match('/^[a-z0-9_-]+\.html([#?][a-z0-9=&_#-]*)?$/i', $url)) $url = '';
      if ($titulo === '') error_('Falta el título');
      $n = db()->prepare("SELECT COUNT(*) FROM notifs WHERE pareja_id = ? AND tipo = 'pareja' AND creado > UTC_TIMESTAMP() - INTERVAL 1 HOUR"); $n->execute([$p['id']]);
      if ((int)$n->fetchColumn() >= 30) error_('Muchos avisos seguidos, probá en un rato', 429);
      $o = db()->prepare('SELECT id FROM usuarios WHERE pareja_id = ? AND id <> ?'); $o->execute([$p['id'], $u['id']]);
      $oid = (int)$o->fetchColumn(); if (!$oid) error_('Tu pareja todavía no se unió');
      notificar((int)$p['id'], $oid, 'pareja|' . $u['id'] . '|' . bin2hex(random_bytes(8)), $titulo, $texto, mb_substr((string)($in['emoji'] ?? '💞'), 0, 8), $url, 'pareja');
      responder(['ok' => true]);

    case 'GET precios':
      // Público: lo usa la landing para mostrar precios y datos de transferencia
      header('Cache-Control: public, max-age=300');
      responder(precios());

    case 'POST admin_precios':
      requerirAdmin();
      $in = entrada(); $p = precios();
      foreach (['mensual', 'anual'] as $k) if (isset($in[$k])) { $n = (int)$in[$k]; if ($n < 0 || $n > 100000000) error_('Precio inválido'); $p[$k] = $n; }
      foreach (['alias' => 60, 'cbu' => 30, 'titular' => 100, 'banco' => 60, 'contacto' => 120] as $k => $max)
        if (isset($in[$k])) $p[$k] = mb_substr(trim((string)$in[$k]), 0, $max);
      if ($p['cbu'] !== '' && !preg_match('/^\d{22}$/', $p['cbu'])) error_('El CBU/CVU tiene 22 números');
      db()->prepare("REPLACE INTO ajustes (clave, valor) VALUES ('precios', ?)")->execute([json_encode($p, JSON_UNESCAPED_UNICODE)]);
      responder(['ok' => true, 'precios' => $p]);

    case 'GET admin_notifs':
      requerirAdmin();
      $q = db()->prepare("SELECT id, titulo, texto, emoji, creado FROM notifs WHERE pareja_id = ? AND tipo = 'directo' ORDER BY id DESC LIMIT 50");
      $q->execute([(int)($_GET['pareja_id'] ?? 0)]);
      responder(['mensajes' => array_map(fn($m) => ['id' => (int)$m['id'], 'titulo' => $m['titulo'], 'texto' => $m['texto'], 'emoji' => $m['emoji'], 'creado' => iso($m['creado'])], $q->fetchAll())]);

    case 'POST admin_notif':
      requerirAdmin();
      $in = entrada(); $pid = (int)($in['pareja_id'] ?? 0);
      $titulo = trim((string)($in['titulo'] ?? '')); $texto = trim(str_replace("\r", '', (string)($in['texto'] ?? ''))); $emoji = mb_substr(trim((string)($in['emoji'] ?? '')), 0, 8);
      if ($titulo === '' || mb_strlen($titulo) > 120) error_('Poné un título (hasta 120 letras)');
      if ($texto === '' || mb_strlen($texto) > 500) error_('Escribí el mensaje (hasta 500 letras)');
      $q = db()->prepare('SELECT id FROM parejas WHERE id = ?'); $q->execute([$pid]); if (!$q->fetchColumn()) error_('No existe esa cuenta', 404);
      notificar($pid, null, 'directo|' . $pid . '|' . bin2hex(random_bytes(8)), $titulo, $texto, $emoji ?: '📣', '', 'directo');
      responder(['ok' => true]);

    case 'POST admin_notif_borrar':
      requerirAdmin();
      db()->prepare("DELETE FROM notifs WHERE id = ? AND tipo = 'directo'")->execute([(int)(entrada()['id'] ?? 0)]);
      responder(['ok' => true]);

    case 'POST admin_mensaje_borrar':
      requerirAdmin();
      db()->prepare('DELETE FROM mensajes WHERE id = ?')->execute([(int)(entrada()['id'] ?? 0)]);
      responder(['ok' => true]);

    case 'GET cambios':
      $u = requerirUsuario(); $p = parejaActiva($u);
      [$docs, $ver] = docsDesde((int)$p['id'], (int)($_GET['desde'] ?? 0));
      responder(['docs' => $docs, 'ver' => $ver]);

    case 'POST escribir':
      $u = requerirUsuario(); $p = parejaActiva($u);
      $in = json_decode(file_get_contents('php://input') ?: '{}'); // como objetos, para respetar {} vs []
      $ops = $in->ops ?? [];
      if (!is_array($ops) || count($ops) > 500) error_('Pedido inválido');
      // Período vencido: solo se pueden guardar las opciones (nombres, personajes, colores: documento juntos/pareja)
      if (soloLectura($p)) foreach ($ops as $o) if (!is_object($o) || ($o->c ?? '') !== 'juntos' || ($o->i ?? '') !== 'pareja') error_('Tu período terminó: activá la suscripción para seguir usando JuntOS', 402);
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

    // ---------- Notificaciones ----------
    case 'GET push_clave':
      responder(['clave' => b64u(vapid()['pub'])]);

    case 'POST push_alta':
      // Guarda la suscripción de este celu y le manda un aviso de prueba.
      $u = requerirUsuario();
      $s = entrada();
      $ep = (string)($s['endpoint'] ?? ''); $k = $s['keys'] ?? [];
      if (!preg_match('#^https://[^\s]{10,1000}$#', $ep) || !is_array($k) || !preg_match('/^[A-Za-z0-9_\-=]{80,120}$/', (string)($k['p256dh'] ?? '')) || !preg_match('/^[A-Za-z0-9_\-=]{16,40}$/', (string)($k['auth'] ?? ''))) error_('Suscripción inválida');
      db()->prepare('INSERT INTO push_subs (usuario_id, endpoint_hash, endpoint, p256dh, auth, creado) VALUES (?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), p256dh = VALUES(p256dh), auth = VALUES(auth)')
        ->execute([$u['id'], hash('sha256', $ep), $ep, rtrim($k['p256dh'], '='), rtrim($k['auth'], '='), ahora()]);
      $q = db()->prepare('SELECT * FROM push_subs WHERE endpoint_hash = ?'); $q->execute([hash('sha256', $ep)]);
      $code = 0;
      try { $code = enviarPush($q->fetch(), ['title' => '🔔 Avisos activados', 'body' => 'Te vamos a avisar de los eventos del calendario.', 'url' => 'calendario.html', 'tag' => 'prueba']); }
      catch (Throwable $e) { error_log('JuntOS push_alta: ' . $e->getMessage()); }
      responder(['ok' => true, 'prueba' => $code]);

    case 'POST push_baja':
      $u = requerirUsuario();
      db()->prepare('DELETE FROM push_subs WHERE endpoint_hash = ? AND usuario_id = ?')->execute([hash('sha256', (string)(entrada()['endpoint'] ?? '')), $u['id']]);
      responder(['ok' => true]);

    // ---------- Archivos (fotos y documentos de la pareja) ----------
    case 'POST archivo_subir':
      $u = requerirUsuario(); $p = parejaActiva($u);
      if (soloLectura($p)) error_('Tu período terminó: podés ver todo, pero no guardar cambios', 402);
      $f = $_FILES['f'] ?? null;
      if (!$f || !is_array($f) || ($f['error'] ?? 1) !== UPLOAD_ERR_OK) error_(($f['error'] ?? 0) === UPLOAD_ERR_INI_SIZE ? 'El archivo es muy grande' : 'No llegó el archivo');
      if ($f['size'] > MAX_ARCHIVO) error_('La foto es muy grande');
      $tipo = tipoReal($f['tmp_name']);
      if (!$tipo || !in_array($tipo, TIPOS_SUBIDA, true)) error_('Solo se pueden subir fotos');
      $q = db()->prepare('SELECT COALESCE(SUM(bytes),0) FROM archivos WHERE pareja_id = ?'); $q->execute([$p['id']]);
      if ((int)$q->fetchColumn() + $f['size'] > CUOTA_PAREJA) error_('Se llenó el espacio para fotos de documentos (50 MB)');
      $id = bin2hex(random_bytes(12));
      $ruta = rutaArchivo((int)$p['id'], $id, $tipo);
      if (!is_dir(dirname($ruta))) @mkdir(dirname($ruta), 0750, true);
      if (!move_uploaded_file($f['tmp_name'], $ruta)) error_('No se pudo guardar el archivo', 500);
      $nombre = mb_substr(preg_replace('/[\x00-\x1f\/\\\\]/u', '', (string)($f['name'] ?? '')), 0, 160);
      db()->prepare('INSERT INTO archivos (id, pareja_id, nombre, tipo, bytes, creado) VALUES (?,?,?,?,?,?)')
        ->execute([$id, $p['id'], $nombre, $tipo, (int)$f['size'], ahora()]);
      responder(['id' => $id, 'tipo' => $tipo, 'bytes' => (int)$f['size']]);

    case 'GET archivo':
      $u = requerirUsuario(); $p = parejaActiva($u);
      $q = db()->prepare('SELECT * FROM archivos WHERE id = ? AND pareja_id = ?'); $q->execute([(string)($_GET['id'] ?? ''), $p['id']]);
      $a = $q->fetch(); if (!$a) error_('No existe ese archivo', 404);
      $ruta = rutaArchivo((int)$p['id'], $a['id'], $a['tipo']);
      if (!is_file($ruta)) error_('No existe ese archivo', 404);
      header('Content-Type: ' . $a['tipo']);
      header('Content-Length: ' . filesize($ruta));
      header('Cache-Control: private, max-age=31536000, immutable');
      header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; plugin-types application/pdf");
      header('Content-Disposition: inline; filename="' . (isset($_GET['bajar']) ? 'juntos-' : '') . $a['id'] . '.' . (TIPOS_ARCHIVO[$a['tipo']] ?? 'bin') . '"');
      readfile($ruta); exit;

    case 'POST archivo_borrar':
      $u = requerirUsuario(); $p = parejaActiva($u);
      $id = (string)(entrada()['id'] ?? '');
      $q = db()->prepare('SELECT * FROM archivos WHERE id = ? AND pareja_id = ?'); $q->execute([$id, $p['id']]);
      if ($a = $q->fetch()) { @unlink(rutaArchivo((int)$p['id'], $a['id'], $a['tipo'])); db()->prepare('DELETE FROM archivos WHERE id = ?')->execute([$id]); }
      responder(['ok' => true]);

    case 'GET admin_datos':
      requerirAdmin();
      $ps = db()->query('SELECT * FROM parejas ORDER BY creado DESC')->fetchAll();
      $us = db()->query('SELECT id, email, nombre, foto, pareja_id, creado, ultimo_ingreso FROM usuarios ORDER BY creado DESC')->fetchAll();
      $porPareja = []; $sueltos = [];
      foreach ($us as $x) { if ($x['pareja_id']) $porPareja[$x['pareja_id']][] = $x; else $sueltos[] = $x; }
      $t = time(); $res = ['usuarios' => count($us), 'parejas' => count($ps), 'prueba' => 0, 'pago' => 0, 'vencidas' => 0,
        'altas_semana' => count(array_filter($us, fn($x) => strtotime($x['creado'] . ' UTC') > $t - 7 * 86400))];
      $esp = db()->query('SELECT pareja_id, COUNT(*) n, SUM(bytes) b FROM archivos GROUP BY pareja_id')->fetchAll(PDO::FETCH_UNIQUE);
      $res['fotos_mb'] = round(array_sum(array_column($esp, 'b')) / 1048576, 1);
      $res['fotos'] = (int)array_sum(array_column($esp, 'n'));
      // Más datos para el Dashboard
      $res['sin_pareja'] = count($sueltos);
      $res['altas_mes'] = count(array_filter($us, fn($x) => strtotime($x['creado'] . ' UTC') > $t - 30 * 86400));
      $res['activos_7'] = count(array_filter($us, fn($x) => $x['ultimo_ingreso'] && strtotime($x['ultimo_ingreso'] . ' UTC') > $t - 7 * 86400));
      $res['activos_hoy'] = count(array_filter($us, fn($x) => $x['ultimo_ingreso'] && strtotime($x['ultimo_ingreso'] . ' UTC') > $t - 86400));
      $res['por_vencer'] = 0; $res['completas'] = 0;
      $res['con_avisos'] = (int)db()->query('SELECT COUNT(DISTINCT usuario_id) FROM push_subs')->fetchColumn();
      $porCol = db()->query("SELECT IF(col = 'ahorros', CONCAT('ahorros/', id), col) k, COUNT(*) n FROM docs WHERE data IS NOT NULL GROUP BY k ORDER BY n DESC")->fetchAll(PDO::FETCH_KEY_PAIR);   // en 'ahorros' cada documento es una sección distinta
      $res['registros'] = (int)array_sum($porCol);
      $res['por_seccion'] = array_map('intval', $porCol);
      $regPar = db()->query('SELECT pareja_id, COUNT(*) n FROM docs WHERE data IS NOT NULL GROUP BY pareja_id')->fetchAll(PDO::FETCH_KEY_PAIR);
      $avisosPar = db()->query('SELECT u.pareja_id, COUNT(*) n FROM push_subs s JOIN usuarios u ON u.id = s.usuario_id WHERE u.pareja_id IS NOT NULL GROUP BY u.pareja_id')->fetchAll(PDO::FETCH_KEY_PAIR);
      // altas por día (últimos 30 días, hora de Argentina)
      $tzA = new DateTimeZone('America/Argentina/Buenos_Aires'); $dias = [];
      for ($i = 29; $i >= 0; $i--) $dias[(new DateTime("-$i days", $tzA))->format('Y-m-d')] = 0;
      foreach ($us as $x) { $d = (new DateTime($x['creado'] . ' UTC'))->setTimezone($tzA)->format('Y-m-d'); if (isset($dias[$d])) $dias[$d]++; }
      $res['altas_dias'] = $dias;
      $lista = [];
      foreach ($ps as $p) {
        $pago = $p['pago_hasta'] ? strtotime($p['pago_hasta'] . ' UTC') : 0;
        $prueba = strtotime($p['prueba_hasta'] . ' UTC');
        $hasta = max($pago, $prueba);
        $estado = $pago > $t ? 'pago' : ($prueba > $t ? 'prueba' : 'vencida');
        $res[$estado === 'vencida' ? 'vencidas' : $estado]++;
        if ($estado !== 'vencida' && $hasta - $t <= 7 * 86400) $res['por_vencer']++;
        $ms = $porPareja[$p['id']] ?? [];
        if (count($ms) >= 2) $res['completas']++;
        $lista[] = ['id' => (int)$p['id'], 'nombre' => $p['nombre'], 'codigo' => $p['codigo'], 'creado' => iso($p['creado']),
          'estado' => $estado, 'activo_hasta' => gmdate('c', $hasta), 'dias' => (int)ceil(($hasta - $t) / 86400),
          'pago_hasta' => iso($p['pago_hasta']), 'prueba_hasta' => iso($p['prueba_hasta']), 'plan_pago' => $p['plan_pago'] ?? null,
          'registros' => (int)($regPar[$p['id']] ?? 0), 'avisos' => (int)($avisosPar[$p['id']] ?? 0),
          'fotos' => (int)($esp[$p['id']]['n'] ?? 0), 'fotos_mb' => round(($esp[$p['id']]['b'] ?? 0) / 1048576, 1),
          'ultimo_ingreso' => $ms ? iso(max(array_column($ms, 'ultimo_ingreso'))) : null,
          'miembros' => array_map(fn($m) => ['nombre' => $m['nombre'], 'email' => $m['email'], 'foto' => $m['foto'], 'creado' => iso($m['creado']), 'ultimo_ingreso' => iso($m['ultimo_ingreso'])], $ms)];
      }
      responder(['resumen' => $res, 'parejas' => $lista,
        'sin_pareja' => array_map(fn($m) => ['nombre' => $m['nombre'], 'email' => $m['email'], 'foto' => $m['foto'], 'creado' => iso($m['creado']), 'ultimo_ingreso' => iso($m['ultimo_ingreso'])], $sueltos)]);

    case 'POST admin_pago':
      requerirAdmin();
      $in = entrada(); $pid = (int)($in['pareja_id'] ?? 0); $op = $in['op'] ?? '';
      $q = db()->prepare('SELECT * FROM parejas WHERE id = ?'); $q->execute([$pid]); $p = $q->fetch();
      if (!$p) error_('No existe esa pareja', 404);
      if ($op === 'sumar_mes') {
        // El mes pago arranca cuando termina lo que ya tienen (prueba o pago), así no pierden días.
        $base = max(time(), strtotime($p['prueba_hasta'] . ' UTC'), $p['pago_hasta'] ? strtotime($p['pago_hasta'] . ' UTC') : 0);
        $nuevo = (new DateTime('@' . $base))->modify('+1 month')->format('Y-m-d H:i:s'); $plan = 'mensual';
      } elseif ($op === 'sumar_anio') {
        $base = max(time(), strtotime($p['prueba_hasta'] . ' UTC'), $p['pago_hasta'] ? strtotime($p['pago_hasta'] . ' UTC') : 0);
        $nuevo = (new DateTime('@' . $base))->modify('+1 year')->format('Y-m-d H:i:s'); $plan = 'anual';
      } elseif ($op === 'anular') {
        $nuevo = null; $plan = null;
      } elseif ($op === 'dias') {
        // Sumar o restar días de prueba. Si la prueba ya venció y se suman, se cuentan desde hoy.
        $n = (int)($in['dias'] ?? 0); if (!$n || abs($n) > 3650) error_('Cantidad de días inválida');
        $base = strtotime($p['prueba_hasta'] . ' UTC'); if ($n > 0) $base = max($base, time());
        db()->prepare('UPDATE parejas SET prueba_hasta = ? WHERE id = ?')->execute([gmdate('Y-m-d H:i:s', $base + $n * 86400), $pid]);
        db()->prepare("DELETE FROM notifs WHERE pareja_id = ? AND tipo IN ('prueba','vence')")->execute([$pid]);
        responder(['ok' => true]);
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
      db()->prepare('UPDATE parejas SET pago_hasta = ?, plan_pago = ? WHERE id = ?')->execute([$nuevo, $plan, $pid]);
      db()->prepare("DELETE FROM notifs WHERE pareja_id = ? AND tipo IN ('prueba','vence')")->execute([$pid]);
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

    // ---------- Una cuenta (pareja): backup, restaurar y borrar ----------
    case 'GET admin_cuenta_backup':
      requerirAdmin();
      $pid = (int)($_GET['pareja_id'] ?? 0);
      $q = db()->prepare('SELECT * FROM parejas WHERE id = ?'); $q->execute([$pid]); $p = $q->fetch();
      if (!$p) error_('No existe esa cuenta', 404);
      $q = db()->prepare('SELECT * FROM usuarios WHERE pareja_id = ? ORDER BY id'); $q->execute([$pid]); $us = $q->fetchAll();
      $q = db()->prepare('SELECT col, id, data FROM docs WHERE pareja_id = ? AND data IS NOT NULL ORDER BY col, id'); $q->execute([$pid]); $docs = $q->fetchAll();
      $per = [];
      foreach ($us as $x) { $q = db()->prepare('SELECT data FROM personal WHERE usuario_id = ?'); $q->execute([$x['id']]); if (($d = $q->fetchColumn()) !== false) $per[] = ['email' => $x['email'], 'data' => $d]; }
      $q = db()->prepare('SELECT id, nombre, tipo, bytes, creado FROM archivos WHERE pareja_id = ?'); $q->execute([$pid]);
      header('Content-Disposition: attachment; filename="juntos-cuenta-' . $pid . '-' . gmdate('Y-m-d') . '.json"');
      responder(['formato' => 'juntos-cuenta-1', 'fecha' => gmdate('c'), 'pareja' => $p,
        'usuarios' => array_map(fn($x) => ['nombre' => $x['nombre'], 'email' => $x['email'], 'creado' => $x['creado'], 'ultimo_ingreso' => $x['ultimo_ingreso']], $us),
        'docs' => $docs, 'personal' => $per, 'archivos' => $q->fetchAll()]);

    case 'POST admin_cuenta_restaurar':
      // Vuelve los datos de UNA cuenta a como estaban en su backup (no toca la suscripción ni las otras cuentas).
      requerirAdmin();
      $b = json_decode(file_get_contents('php://input') ?: '', true);
      if (!is_array($b) || ($b['formato'] ?? '') !== 'juntos-cuenta-1' || !is_array($b['docs'] ?? null)) error_('No es un backup de una cuenta de Juntos');
      $pid = (int)($_GET['pareja_id'] ?? 0);
      if ($pid !== (int)($b['pareja']['id'] ?? -1)) error_('Ese backup es de otra cuenta');
      $q = db()->prepare('SELECT id FROM parejas WHERE id = ?'); $q->execute([$pid]); if (!$q->fetch()) error_('No existe esa cuenta', 404);
      $db = db(); $db->beginTransaction();
      try {
        $v = nuevaVersion();
        $db->prepare('UPDATE docs SET data = NULL, ver = ? WHERE pareja_id = ?')->execute([$v, $pid]);   // así los celus abiertos se enteran
        $qd = $db->prepare('INSERT INTO docs (pareja_id, col, id, data, ver) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE data = VALUES(data), ver = VALUES(ver)');
        foreach ($b['docs'] as $d) $qd->execute([$pid, (string)$d['col'], (string)$d['id'], (string)$d['data'], $v]);
        $n = 0;
        foreach (($b['personal'] ?? []) as $x) {
          $q = $db->prepare('SELECT id FROM usuarios WHERE pareja_id = ? AND LOWER(email) = LOWER(?)'); $q->execute([$pid, (string)($x['email'] ?? '')]);
          if ($uid = $q->fetchColumn()) { $db->prepare('REPLACE INTO personal (usuario_id, data) VALUES (?, ?)')->execute([$uid, (string)$x['data']]); $n++; }
        }
        $db->commit();
      } catch (Throwable $e) { $db->rollBack(); throw $e; }
      responder(['ok' => true, 'docs' => count($b['docs']), 'personal' => $n]);

    case 'POST admin_cuenta_borrar':
      // Borra de verdad la cuenta: datos, fotos, avisos, sesiones y los usuarios. Hay que confirmar con el nombre exacto.
      $yo = requerirAdmin();
      $in = entrada(); $pid = (int)($in['pareja_id'] ?? 0);
      $q = db()->prepare('SELECT * FROM parejas WHERE id = ?'); $q->execute([$pid]); $p = $q->fetch();
      if (!$p) error_('No existe esa cuenta', 404);
      if (trim((string)($in['confirmar'] ?? '')) !== trim($p['nombre'])) error_('El nombre no coincide');
      $q = db()->prepare('SELECT * FROM usuarios WHERE pareja_id = ?'); $q->execute([$pid]); $us = $q->fetchAll();
      foreach ($us as $x) if (esAdmin($x) || in_array(strtolower($x['email']), ['alejandrobarba021@gmail.com', 'gionejulieta@gmail.com'], true)) error_('Esa cuenta es de un administrador: no se puede borrar desde el panel', 403);
      $q = db()->prepare('SELECT id, tipo FROM archivos WHERE pareja_id = ?'); $q->execute([$pid]);
      foreach ($q->fetchAll() as $a) @unlink(rutaArchivo($pid, $a['id'], $a['tipo']));
      @rmdir(carpetaArchivos() . '/' . $pid);
      $db = db(); $db->beginTransaction();
      // usuarios → se van sus sesiones, avisos y datos personales (cascada); pareja → sus datos y fotos (cascada)
      $db->prepare('DELETE FROM usuarios WHERE pareja_id = ?')->execute([$pid]);
      $db->prepare('DELETE FROM parejas WHERE id = ?')->execute([$pid]);
      $db->commit();
      error_log('JuntOS: ' . $yo['email'] . ' borró la cuenta ' . $pid . ' (' . $p['nombre'] . ')');
      responder(['ok' => true, 'usuarios' => count($us)]);

    case 'POST admin_usuario_borrar':
      // Usuario que entró pero nunca creó ni se unió a un espacio.
      $yo = requerirAdmin();
      $mail = strtolower(trim((string)(entrada()['email'] ?? '')));
      $q = db()->prepare('SELECT * FROM usuarios WHERE LOWER(email) = ? AND pareja_id IS NULL'); $q->execute([$mail]); $x = $q->fetch();
      if (!$x) error_('No existe ese usuario sin espacio', 404);
      if (esAdmin($x)) error_('Es un administrador: no se puede borrar desde el panel', 403);
      db()->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$x['id']]);
      error_log('JuntOS: ' . $yo['email'] . ' borró el usuario ' . $mail);
      responder(['ok' => true]);

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
