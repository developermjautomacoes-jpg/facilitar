<?php
/**
 * Exporta memorandos e certificados para a Neeko em um pacote cifrado.
 * Uso único: depois da migração, volte o deploy ao ramo main e este arquivo sai do servidor.
 * A página exige HTTPS e a SENHA_ACESSO. O pacote só abre com a frase digitada aqui.
 */
if (is_file(__DIR__ . '/config.php')) require __DIR__ . '/config.php';
if (!defined('SENHA_ACESSO')) define('SENHA_ACESSO', getenv('SENHA_ACESSO') ?: 'TROQUE-ESTA-SENHA');
header('X-Content-Type-Options: nosniff'); header('Cache-Control: no-store'); header('X-Robots-Tag: noindex');
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
function pagina($msg = '') {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Exportar para a Neeko</title>'
       . '<style>body{font-family:system-ui,sans-serif;background:#f4f6fb;margin:0;padding:24px}form{max-width:420px;margin:40px auto;background:#fff;padding:24px;border-radius:12px}label{display:block;margin:14px 0 4px;font-size:14px}input{width:100%;padding:10px;box-sizing:border-box}button{margin-top:18px;padding:12px;width:100%}p.e{color:#c02626}</style>'
       . '<form method="post"><h1>Exportar para a Neeko</h1><p>Gera um pacote cifrado com todos os memorandos e certificados.</p>'
       . ($msg ? '<p class="e">' . htmlspecialchars($msg) . '</p>' : '')
       . '<label>Senha de acesso do sistema<input type="password" name="senha" required autocomplete="off"></label>'
       . '<label>Crie uma frase para o pacote (mínimo 12 caracteres)<input type="password" name="frase" required minlength="12" autocomplete="off"></label>'
       . '<button>Gerar pacote</button></form>';
    exit;
}
if (!$https && php_sapi_name() !== 'cli') { http_response_code(403); pagina('Abra esta página por https.'); }
if (SENHA_ACESSO === 'TROQUE-ESTA-SENHA') { http_response_code(500); pagina('Senha de acesso não definida no servidor.'); }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') pagina();
if (!hash_equals(SENHA_ACESSO, (string)($_POST['senha'] ?? ''))) { sleep(3); http_response_code(403); pagina('Senha incorreta.'); }
$frase = (string)($_POST['frase'] ?? '');
if (strlen($frase) < 12) pagina('A frase precisa de pelo menos 12 caracteres.');

$base = rtrim(getenv('DADOS_DIR') ?: (__DIR__ . '/dados'), '/');
function lerJson($f) { $j = json_decode((string)@file_get_contents($f), true); return is_array($j) ? $j : null; }
function abrirSenha($b64) {
    $r = base64_decode((string)$b64, true); if (!$r || strlen($r) < 17) return null;
    $o = openssl_decrypt(substr($r, 16), 'aes-256-cbc', hash('sha256', 'memorandos-cert|' . SENHA_ACESSO, true), OPENSSL_RAW_DATA, substr($r, 0, 16));
    return $o === false ? null : $o;
}
function linhas($arq, $sql) {
    if (!is_file($arq)) return [];
    try { $d = new PDO('sqlite:' . $arq, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]); return $d->query($sql)->fetchAll(); }
    catch (Exception $e) { return []; }
}
$memorandos = [];
foreach (glob("$base/memorandos/*.json") ?: [] as $f) { $m = lerJson($f); if ($m) $memorandos[] = $m; }
$certificados = [];
foreach (glob("$base/cert/*.json") ?: [] as $f) {
    $id = basename($f, '.json'); $m = lerJson($f);
    if (!$m || !is_file("$base/cert/$id.pfx")) continue;
    $certificados[] = ['id' => $id, 'apelido' => $m['apelido'] ?? '', 'titular' => $m['titular'] ?? '', 'pfx' => base64_encode(file_get_contents("$base/cert/$id.pfx")), 'senha' => (string)abrirSenha($m['senha'] ?? '')];
}
if (getenv('CERT_PFX_BASE64')) $certificados[] = ['id' => 'ambiente', 'apelido' => 'Certificado do ambiente', 'pfx' => preg_replace('/\s+/', '', getenv('CERT_PFX_BASE64')), 'senha' => (string)getenv('CERT_SENHA')];
$modos = []; foreach (linhas("$base/nfse/nfse.sqlite", 'SELECT cnpj, modo FROM acesso') as $l) $modos[$l['cnpj']] = $l['modo'];
$proc = linhas("$base/nfse/nfse.sqlite", "SELECT valor FROM config WHERE chave = 'procurador'");
$restritas = array_map(function ($l) { return $l['raiz']; }, linhas("$base/auth/auth.sqlite", 'SELECT raiz FROM restritas'));
$claro = json_encode(['memorandos' => $memorandos, 'certificados' => $certificados, 'nfse' => ['procurador' => $proc[0]['valor'] ?? '', 'modos' => (object)$modos], 'restritas' => $restritas], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
$iter = 210000; $salt = random_bytes(16); $iv = random_bytes(12); $tag = '';
$cifrado = openssl_encrypt($claro, 'aes-256-gcm', hash_pbkdf2('sha256', $frase, $salt, $iter, 32, true), OPENSSL_RAW_DATA, $iv, $tag);
if ($cifrado === false) { http_response_code(500); pagina('Não foi possível gerar o pacote.'); }
header('Content-Type: application/octet-stream');
header('Content-Disposition: attachment; filename="facilitar-para-neeko.neeko"');
echo json_encode(['formato' => 'neeko-migracao', 'versao' => 1, 'iter' => $iter, 'salt' => base64_encode($salt), 'iv' => base64_encode($iv), 'tag' => base64_encode($tag), 'data' => base64_encode($cifrado)]);
