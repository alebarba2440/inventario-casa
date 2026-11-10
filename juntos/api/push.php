<?php
// Notificaciones push (Web Push con VAPID, cifrado aes128gcm — RFC 8291/8292) sin librerías externas.
// Las claves VAPID se generan solas la primera vez y quedan guardadas en la tabla meta.

function b64u(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64ud(string $s): string { return (string)base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4)); }

function pemPublico(string $pub65): string {
  $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $pub65;
  return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}
function pemPrivado(string $d32, string $pub65): string {
  $der = hex2bin('30770201010420') . $d32 . hex2bin('a00a06082a8648ce3d030107a144034200') . $pub65;
  return "-----BEGIN EC PRIVATE KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END EC PRIVATE KEY-----\n";
}
function nuevaClaveEC(): array {
  $k = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
  if (!$k) throw new RuntimeException('openssl no pudo generar la clave EC');
  $e = openssl_pkey_get_details($k)['ec'];
  $pad = fn($x) => str_pad($x, 32, "\0", STR_PAD_LEFT);
  return ['key' => $k, 'd' => $pad($e['d']), 'pub' => "\x04" . $pad($e['x']) . $pad($e['y'])];
}

// Claves VAPID del servidor: ['pub' => 65 bytes, 'pem' => privada en PEM]
function vapid(): array {
  static $v = null;
  if ($v) return $v;
  $q = db()->query("SELECT clave, valor FROM meta WHERE clave IN ('vapid_pub','vapid_priv')")->fetchAll(PDO::FETCH_KEY_PAIR);
  if (empty($q['vapid_pub']) || empty($q['vapid_priv'])) {
    $k = nuevaClaveEC();
    $ins = db()->prepare("INSERT IGNORE INTO meta (clave, valor) VALUES (?, ?)");
    $ins->execute(['vapid_priv', b64u($k['d'])]); $ins->execute(['vapid_pub', b64u($k['pub'])]);
    $q = db()->query("SELECT clave, valor FROM meta WHERE clave IN ('vapid_pub','vapid_priv')")->fetchAll(PDO::FETCH_KEY_PAIR);
  }
  $pub = b64ud($q['vapid_pub']);
  return $v = ['pub' => $pub, 'pem' => pemPrivado(b64ud($q['vapid_priv']), $pub)];
}

// Firma ES256 en formato JOSE (r||s, 64 bytes)
function firmaES256(string $datos, string $pem): string {
  if (!openssl_sign($datos, $der, $pem, OPENSSL_ALGO_SHA256)) throw new RuntimeException('No se pudo firmar');
  $p = 2; if (ord($der[1]) & 0x80) $p += ord($der[1]) & 0x7f;
  $out = '';
  for ($i = 0; $i < 2; $i++) {
    $len = ord($der[$p + 1]); $n = substr($der, $p + 2, $len); $p += 2 + $len;
    $out .= str_pad(ltrim($n, "\0"), 32, "\0", STR_PAD_LEFT);
  }
  return $out;
}

function jwtVapid(string $endpoint): string {
  $u = parse_url($endpoint);
  $h = b64u(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
  $c = b64u(json_encode(['aud' => $u['scheme'] . '://' . $u['host'], 'exp' => time() + 12 * 3600, 'sub' => 'https://juntosapp.com.ar/'], JSON_UNESCAPED_SLASHES));
  return "$h.$c." . b64u(firmaES256("$h.$c", vapid()['pem']));
}

// Cifra el mensaje para una suscripción (RFC 8291, aes128gcm)
function cifrarPush(string $texto, string $p256dh, string $auth): string {
  $ua = b64ud($p256dh); $sec = b64ud($auth);
  if (strlen($ua) !== 65 || strlen($sec) !== 16) throw new RuntimeException('Suscripción inválida');
  $as = nuevaClaveEC();
  $ecdh = openssl_pkey_derive(pemPublico($ua), $as['key'], 32);
  if ($ecdh === false) throw new RuntimeException('ECDH falló');
  $ikm = hash_hmac('sha256', "WebPush: info\0" . $ua . $as['pub'] . "\x01", hash_hmac('sha256', $ecdh, $sec, true), true);
  $salt = random_bytes(16);
  $prk = hash_hmac('sha256', $ikm, $salt, true);
  $cek = substr(hash_hmac('sha256', "Content-Encoding: aes128gcm\0\x01", $prk, true), 0, 16);
  $nonce = substr(hash_hmac('sha256', "Content-Encoding: nonce\0\x01", $prk, true), 0, 12);
  $ct = openssl_encrypt($texto . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
  return $salt . pack('N', 4096) . chr(65) . $as['pub'] . $ct . $tag;
}

// Manda una notificación. Devuelve el código HTTP del servicio de push (201 = ok; 404/410 = suscripción vencida).
function enviarPush(array $sub, array $msg, int $ttl = 3600): int {
  $body = cifrarPush(json_encode($msg, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $sub['p256dh'], $sub['auth']);
  $ch = curl_init($sub['endpoint']);
  curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_POSTFIELDS => $body,
    CURLOPT_HTTPHEADER => ['Content-Type: application/octet-stream', 'Content-Encoding: aes128gcm', 'TTL: ' . $ttl, 'Urgency: high',
      'Authorization: vapid t=' . jwtVapid($sub['endpoint']) . ', k=' . b64u(vapid()['pub'])]]);
  curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  if ($code === 404 || $code === 410) db()->prepare('DELETE FROM push_subs WHERE id = ?')->execute([$sub['id']]);
  return $code;
}

// Manda a todos los celus de un usuario. Devuelve cuántos la recibieron.
function pushUsuario(int $uid, array $msg): int {
  $q = db()->prepare('SELECT * FROM push_subs WHERE usuario_id = ?'); $q->execute([$uid]);
  $ok = 0;
  foreach ($q->fetchAll() as $s) { try { $c = enviarPush($s, $msg); if ($c >= 200 && $c < 300) $ok++; } catch (Throwable $e) { error_log('JuntOS push: ' . $e->getMessage()); } }
  return $ok;
}
