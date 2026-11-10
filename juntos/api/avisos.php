<?php
// Avisos del calendario por notificación. Lo llama cron-job.org cada 5 minutos:
//   https://barbamanager.website/juntos/api/avisos.php
// Todos: el día anterior a las 20. Con hora: además 1 hora antes y a la hora justa. Sin hora: además ese día a las 9.
// Cada aviso se manda una sola vez (tabla avisos), así que llamarlo de más no repite nada.
require __DIR__ . '/db.php';
require __DIR__ . '/push.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const ANTES_MIN = 60;      // aviso previo, en minutos
const HORA_DIA = '09:00';  // aviso de los eventos de todo el día
const HORA_VISPERA = '20:00';  // y el día anterior a esta hora
const TOLERANCIA = 20;     // si el cron se atrasó, se manda igual hasta 20 min tarde

function cae(array $e, string $s): bool {
  $f = $e['fecha'] ?? '';
  if ($s === $f) return true;
  $rep = $e['rep'] ?? 'no';
  if ($s < $f || !$rep || $rep === 'no') return false;
  $a = new DateTime($f . ' 12:00'); $b = new DateTime($s . ' 12:00');
  if ($rep === 'semana') return ((int)$a->diff($b)->days) % 7 === 0;
  if ($rep === 'mes') return $a->format('d') === $b->format('d');
  if ($rep === 'anio') return $a->format('m-d') === $b->format('m-d');
  return false;
}

try {
  $db = db();
  // No correr dos veces en el mismo minuto
  $ult = (int)$db->query("SELECT valor FROM meta WHERE clave = 'avisos_ult'")->fetchColumn();
  if ($ult > time() - 50 && !isset($_GET['forzar'])) { echo json_encode(['ok' => true, 'salteado' => true]); exit; }
  $db->prepare("REPLACE INTO meta (clave, valor) VALUES ('avisos_ult', ?)")->execute([time()]);
  $db->exec("DELETE FROM avisos WHERE enviado < UTC_TIMESTAMP() - INTERVAL 3 DAY");

  $tz = new DateTimeZone('America/Argentina/Buenos_Aires');
  $ahora = new DateTime('now', $tz);
  $hoy = $ahora->format('Y-m-d');
  $manana = (clone $ahora)->modify('+1 day')->format('Y-m-d');
  $marca = $db->prepare('INSERT IGNORE INTO avisos (clave, enviado) VALUES (?, UTC_TIMESTAMP())');
  $enviados = 0;

  $parejas = $db->query('SELECT DISTINCT u.pareja_id FROM push_subs s JOIN usuarios u ON u.id = s.usuario_id WHERE u.pareja_id IS NOT NULL')->fetchAll(PDO::FETCH_COLUMN);
  foreach ($parejas as $pid) {
    $pid = (int)$pid;
    // Quién es "j" y quién "a" (igual que en la app: por orden de alta, salvo que estén intercambiados)
    $m = $db->prepare('SELECT id FROM usuarios WHERE pareja_id = ? ORDER BY id'); $m->execute([$pid]);
    $ms = array_map('intval', $m->fetchAll(PDO::FETCH_COLUMN));
    $q = $db->prepare("SELECT data FROM docs WHERE pareja_id = ? AND col = 'juntos' AND id = 'pareja'"); $q->execute([$pid]);
    $perfil = json_decode($q->fetchColumn() ?: '{}', true);
    if (!empty($perfil['invertido'])) $ms = [$ms[1] ?? null, $ms[0] ?? null];
    // Pareja fija (Juli y Ale): Juli siempre es "j" y Ale "a" (igual que en app-db.js)
    $fijo = $db->prepare("SELECT id, LOWER(email) e FROM usuarios WHERE pareja_id = ? AND LOWER(email) IN ('gionejulieta@gmail.com','alejandrobarba021@gmail.com')");
    $fijo->execute([$pid]); $fj = array_column($fijo->fetchAll(), 'id', 'e');
    if ($fj) {
      $ju = isset($fj['gionejulieta@gmail.com']) ? (int)$fj['gionejulieta@gmail.com'] : null; $al = isset($fj['alejandrobarba021@gmail.com']) ? (int)$fj['alejandrobarba021@gmail.com'] : null;
      $otro = array_values(array_diff(array_filter($ms), [$ju, $al]))[0] ?? null;
      $ms = [$ju ?? $otro, $al ?? ($ju ? $otro : null)];
    }
    $slot = ['j' => $ms[0] ?? null, 'a' => $ms[1] ?? null];

    $q = $db->prepare("SELECT id, data FROM docs WHERE pareja_id = ? AND col = 'calendario' AND data IS NOT NULL"); $q->execute([$pid]);
    foreach ($q as $r) {
      $e = json_decode($r['data'], true);
      if (!is_array($e) || empty($e['fecha']) || empty($e['titulo'])) continue;
      $emoji = ['evento' => '📅', 'recordatorio' => '⏰', 'cumple' => '🎂'][$e['tipo'] ?? 'evento'] ?? '📅';
      $hora = preg_match('/^\d{2}:\d{2}$/', $e['hora'] ?? '') ? $e['hora'] : '';
      foreach ([$hoy, $manana] as $dia) {
        if (!cae($e, $dia)) continue;
        $pasos = $hora
          ? [['vispera', (new DateTime($dia . ' ' . HORA_VISPERA, $tz))->modify('-1 day'), 0, 'Mañana · ' . $hora . ' hs'],
             ['antes', new DateTime("$dia $hora", $tz), -ANTES_MIN, 'En 1 hora · ' . $hora . ' hs'], ['ahora', new DateTime("$dia $hora", $tz), 0, 'Ahora · ' . $hora . ' hs']]
          : [['vispera', (new DateTime($dia . ' ' . HORA_VISPERA, $tz))->modify('-1 day'), 0, ($e['tipo'] ?? '') === 'cumple' ? 'Mañana es el cumple 🎂' : 'Mañana, todo el día'],
             ['dia', new DateTime($dia . ' ' . HORA_DIA, $tz), 0, ($e['tipo'] ?? '') === 'cumple' ? '¡Hoy es el cumple! 🎉' : 'Hoy, todo el día']];
        foreach ($pasos as [$tipo, $t, $min, $texto]) {
          if ($min) $t->modify("$min minutes");
          $dif = ($ahora->getTimestamp() - $t->getTimestamp()) / 60;
          if ($dif < 0 || $dif > TOLERANCIA) continue;
          $quien = $e['quien'] ?? 'ambos';
          $para = $quien === 'j' || $quien === 'a' ? [$slot[$quien]] : [$slot['j'], $slot['a']];
          $notas = trim((string)($e['notas'] ?? ''));
          $msg = ['title' => $emoji . ' ' . $e['titulo'], 'body' => $texto . ($notas !== '' ? ' · ' . mb_substr($notas, 0, 120) : ''),
            'url' => 'calendario.html', 'tag' => 'cal-' . $r['id'] . '-' . $dia];
          foreach (array_unique(array_filter($para)) as $uid) {
            $marca->execute([hash('sha256', "$pid|{$r['id']}|$dia|$hora|$tipo|$uid")]);
            if ($marca->rowCount() === 0) continue;   // ya se mandó
            $enviados += pushUsuario($uid, $msg);
          }
        }
      }
    }
  }
  // ---------- Mascotas: lo que "le toca" (próxima vacuna, desparasitación, control…) ----------
  // Por cada mascota y tipo vale el último registro; si tiene "próxima vez", se avisa el día anterior a las 20 y ese día a las 9.
  $TIP = ['vacuna' => ['💉', 'Vacuna'], 'despar' => ['🪱', 'Desparasitación'], 'pelu' => ['✂️', 'Peluquería'], 'bano' => ['🛁', 'Baño'],
    'vete' => ['🩺', 'Veterinario'], 'enfer' => ['🤒', 'Control'], 'lesion' => ['🦴', 'Control'], 'raro' => ['⚠️', 'Control'],
    'comida' => ['🍖', 'Comida'], 'juguete' => ['🧸', 'Compras'], 'otro' => ['🐾', 'Recordatorio']];
  foreach ($parejas as $pid) {
    $pid = (int)$pid;
    $q = $db->prepare("SELECT id, data FROM docs WHERE pareja_id = ? AND col = 'mascotas' AND data IS NOT NULL"); $q->execute([$pid]);
    $pets = []; foreach ($q as $r) { $x = json_decode($r['data'], true); if (is_array($x)) $pets[$r['id']] = $x; }
    if (!$pets) continue;
    $q = $db->prepare("SELECT id, data FROM docs WHERE pareja_id = ? AND col = 'mascota_reg' AND data IS NOT NULL"); $q->execute([$pid]);
    $ult = [];
    foreach ($q as $r) {
      $x = json_decode($r['data'], true);
      if (!is_array($x) || empty($x['mascota']) || empty($x['tipo']) || empty($x['fecha']) || !isset($pets[$x['mascota']])) continue;
      $k = $x['mascota'] . '|' . $x['tipo']; $x['id'] = $r['id'];
      if (!isset($ult[$k]) || [$x['fecha'], $x['creado'] ?? 0] > [$ult[$k]['fecha'], $ult[$k]['creado'] ?? 0]) $ult[$k] = $x;
    }
    $m = $db->prepare('SELECT id FROM usuarios WHERE pareja_id = ?'); $m->execute([$pid]);
    $todos = array_map('intval', $m->fetchAll(PDO::FETCH_COLUMN));
    foreach ($ult as $x) {
      $prox = (string)($x['prox'] ?? '');
      if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $prox) || ($prox !== $hoy && $prox !== $manana)) continue;
      $t = $TIP[$x['tipo']] ?? $TIP['otro']; $pet = $pets[$x['mascota']];
      $pasos = [['vispera', (new DateTime($prox . ' ' . HORA_VISPERA, $tz))->modify('-1 day'), 'Mañana le toca a ' . ($pet['nombre'] ?? 'tu mascota')],
                ['dia', new DateTime($prox . ' ' . HORA_DIA, $tz), 'Hoy le toca a ' . ($pet['nombre'] ?? 'tu mascota')]];
      foreach ($pasos as [$tipo, $tt, $texto]) {
        $dif = ($ahora->getTimestamp() - $tt->getTimestamp()) / 60;
        if ($dif < 0 || $dif > TOLERANCIA) continue;
        $msg = ['title' => ($pet['emoji'] ?? '🐾') . ' ' . $t[0] . ' ' . $t[1] . ' de ' . ($pet['nombre'] ?? 'tu mascota'), 'body' => $texto,
          'url' => 'mascotas.html#m=' . $x['mascota'], 'tag' => 'masc-' . $x['id']];
        foreach ($todos as $uid) {
          $marca->execute([hash('sha256', "$pid|m|{$x['id']}|$prox|$tipo|$uid")]);
          if ($marca->rowCount() === 0) continue;
          $enviados += pushUsuario($uid, $msg);
        }
      }
    }
  }

  echo json_encode(['ok' => true, 'enviados' => $enviados, 'hora' => $ahora->format('Y-m-d H:i')]);
} catch (Throwable $e) {
  error_log('JuntOS avisos: ' . $e->getMessage());
  http_response_code(500);
  echo json_encode(['ok' => false]);
}
