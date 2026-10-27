<?php
/*
 * API do sistema de Memorandos — Facilitar Serviços Contábeis
 * Guarda os memorandos em arquivos JSON na pasta "dados" (bloqueada para acesso direto)
 * e faz a consulta de CNPJ (BrasilAPI, com ReceitaWS como alternativa).
 */

// ================== CONFIGURAÇÃO ==================
// A senha fica em config.php (fora do Git). Crie o arquivo a partir de config.exemplo.php.
// No Easypanel/Docker, use a variável de ambiente SENHA_ACESSO (e DADOS_DIR para a pasta de dados).
if (file_exists(__DIR__ . '/config.php')) require __DIR__ . '/config.php';
if (!defined('SENHA_ACESSO')) define('SENHA_ACESSO', getenv('SENHA_ACESSO') ?: 'TROQUE-ESTA-SENHA');
// ==================================================

date_default_timezone_set('America/Sao_Paulo');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function sai($code, $arr) {
    http_response_code($code);
    echo json_encode($arr, JSON_UNESCAPED_UNICODE);
    exit;
}

if (SENHA_ACESSO === 'TROQUE-ESTA-SENHA') {
    sai(500, ['erro' => 'Defina a senha de acesso: variável de ambiente SENHA_ACESSO (Easypanel) ou arquivo config.php.']);
}

$senha = $_SERVER['HTTP_X_SENHA'] ?? '';
if (!is_string($senha) || !hash_equals(SENHA_ACESSO, $senha)) {
    usleep(400000); // dificulta tentativas em série
    sai(401, ['erro' => 'Senha inválida.']);
}

$base   = rtrim(getenv('DADOS_DIR') ?: (__DIR__ . '/dados'), '/');
$memDir = $base . '/memorandos';
if (!is_dir($memDir) && !mkdir($memDir, 0755, true)) {
    sai(500, ['erro' => 'Não foi possível criar a pasta de dados no servidor. Verifique as permissões.']);
}
if (!file_exists($base . '/.htaccess')) {
    file_put_contents($base . '/.htaccess',
        "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
}
if (!file_exists($base . '/index.html')) file_put_contents($base . '/index.html', '');

function idDe($seq, $ano) { return sprintf('%04d-%03d', $ano, $seq); }
function numTxt($seq, $ano) { return sprintf('%02d/%d', $seq, $ano); }
function arq($memDir, $id) { return $memDir . '/' . $id . '.json'; }
function idValido($id) { return is_string($id) && preg_match('/^\d{4}-\d{3,4}$/', $id); }
function ler($f) { $m = json_decode(@file_get_contents($f), true); return is_array($m) ? $m : null; }
function grava($f, $m) {
    $tmp = $f . '.tmp';
    if (file_put_contents($tmp, json_encode($m, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX) === false) return false;
    return rename($tmp, $f);
}

$acao = $_GET['acao'] ?? '';
$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) $in = [];

// ---------- listar ----------
if ($acao === 'listar') {
    $out = [];
    foreach (glob($memDir . '/*.json') as $f) {
        $m = ler($f);
        if ($m) { $m['_id'] = basename($f, '.json'); $out[] = $m; }
    }
    usort($out, function ($a, $b) { return [$b['ano'] ?? 0, $b['seq'] ?? 0] <=> [$a['ano'] ?? 0, $a['seq'] ?? 0]; });
    sai(200, ['memorandos' => $out]);
}

function buscaJson($u) {
    if (function_exists('curl_init')) {
        $ch = curl_init($u);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_HTTPHEADER => ['Accept: application/json', 'User-Agent: Memorandos-Facilitar/1.0']]);
        $b = curl_exec($ch); curl_close($ch);
    } else {
        $b = @file_get_contents($u, false, stream_context_create(['http' => ['timeout' => 12, 'ignore_errors' => true]]));
    }
    return $b ? json_decode($b, true) : null;
}

// ---------- consulta de CNPJ ----------
if ($acao === 'cnpj') {
    $c = preg_replace('/\D/', '', $_GET['cnpj'] ?? '');
    if (strlen($c) !== 14) sai(400, ['erro' => 'CNPJ deve ter 14 dígitos.']);
    $urls = ["https://brasilapi.com.br/api/cnpj/v1/$c", "https://receitaws.com.br/v1/cnpj/$c"];
    $ultimo = '';
    foreach ($urls as $u) {
        $body = null; $code = 0;
        if (function_exists('curl_init')) {
            $ch = curl_init($u);
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 8,
                CURLOPT_FOLLOWLOCATION => true, CURLOPT_HTTPHEADER => ['Accept: application/json', 'User-Agent: Memorandos-Facilitar/1.0']]);
            $body = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
        } else {
            $ctx = stream_context_create(['http' => ['timeout' => 15, 'ignore_errors' => true, 'header' => "Accept: application/json\r\nUser-Agent: Memorandos-Facilitar/1.0\r\n"]]);
            $body = @file_get_contents($u, false, $ctx);
            if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $mm)) $code = (int)$mm[1];
        }
        if ($body === false || $body === null) { $ultimo = 'Serviço de consulta indisponível.'; continue; }
        $j = json_decode($body, true);
        if (!is_array($j)) { $ultimo = 'Resposta inválida da consulta.'; continue; }
        if ($code === 200 && (isset($j['razao_social']) || (isset($j['nome']) && ($j['status'] ?? '') !== 'ERROR'))) {
            // BrasilAPI às vezes não traz a opção pelo Simples: completa com a ReceitaWS
            if (isset($j['razao_social']) && !isset($j['opcao_pelo_simples'])) {
                $rw = buscaJson("https://receitaws.com.br/v1/cnpj/$c");
                if (is_array($rw) && ($rw['status'] ?? '') !== 'ERROR') {
                    $j['_rws_simples'] = $rw['simples'] ?? null;
                    $j['_rws_simei'] = $rw['simei'] ?? null;
                }
            }
            echo json_encode($j, JSON_UNESCAPED_UNICODE); exit;
        }
        $ultimo = $j['message'] ?? ($code === 404 ? 'CNPJ não encontrado.' : 'Consulta não retornou dados.');
        if ($code === 404) break;
    }
    sai(502, ['erro' => $ultimo ?: 'Não foi possível consultar o CNPJ.']);
}

// ---------- inscrição estadual (SEFAZ, webservice CadConsultaCadastro4 com certificado A1) ----------
// Certificado: variável CERT_PFX_BASE64 (conteúdo do .pfx em base64) ou arquivo DADOS_DIR/certificado.pfx; senha em CERT_SENHA.
// Certificados importados pelo sistema ficam em DADOS_DIR/cert/<id>.pfx + <id>.json (vários; um é o padrão).
// A senha de cada um fica cifrada com uma chave derivada de SENHA_ACESSO (que não fica no volume de dados).
// Alternativa: CERT_PFX_BASE64 + CERT_SENHA no ambiente (aparece como certificado "ambiente").
function certDir() { return rtrim(getenv('DADOS_DIR') ?: (__DIR__ . '/dados'), '/') . '/cert'; }
function chaveCifra() { return hash('sha256', 'memorandos-cert|' . SENHA_ACESSO, true); }
function cifra($txt) { $iv = random_bytes(16); return base64_encode($iv . openssl_encrypt($txt, 'aes-256-cbc', chaveCifra(), OPENSSL_RAW_DATA, $iv)); }
function decifra($b64) { $r = base64_decode((string)$b64, true); if (!$r || strlen($r) < 17) return null; $o = openssl_decrypt(substr($r, 16), 'aes-256-cbc', chaveCifra(), OPENSSL_RAW_DATA, substr($r, 0, 16)); return $o === false ? null : $o; }
function infoCert($pemCert) {
    $x = openssl_x509_parse($pemCert);
    $cn = $x['subject']['CN'] ?? '';
    $doc = ''; if (preg_match('/:(\d{11}|\d{14})\s*$/', $cn, $m)) $doc = $m[1];
    $nome = trim(preg_replace('/:\d+\s*$/', '', $cn));
    return ['titular' => $nome ?: $cn, 'documento' => $doc, 'tipo' => strlen($doc) === 14 ? 'e-CNPJ' : (strlen($doc) === 11 ? 'e-CPF' : 'Certificado A1'),
            'validade' => isset($x['validTo_time_t']) ? date('Y-m-d', $x['validTo_time_t']) : ''];
}
function certIdValido($id) { return is_string($id) && preg_match('/^[a-f0-9]{16}$/', $id); }
function certLista() {
    $d = certDir(); $out = [];
    $padrao = is_file("$d/padrao.txt") ? trim(file_get_contents("$d/padrao.txt")) : '';
    foreach (glob("$d/*.json") ?: [] as $f) {
        $id = basename($f, '.json'); if (!certIdValido($id) || !is_file("$d/$id.pfx")) continue;
        $m = json_decode(file_get_contents($f), true) ?: []; unset($m['senha']);
        $out[] = ['id' => $id] + $m;
    }
    if (getenv('CERT_PFX_BASE64')) {
        $c = [];
        if (openssl_pkcs12_read(base64_decode(preg_replace('/\s+/', '', getenv('CERT_PFX_BASE64')), true), $c, (string)getenv('CERT_SENHA')))
            $out[] = ['id' => 'ambiente', 'origem' => 'ambiente'] + infoCert($c['cert']);
    }
    usort($out, function ($a, $b) { return strcmp($a['titular'] ?? '', $b['titular'] ?? ''); });
    if (!$padrao || !array_filter($out, function ($c) use ($padrao) { return $c['id'] === $padrao; })) $padrao = $out[0]['id'] ?? '';
    foreach ($out as &$c) $c['padrao'] = $c['id'] === $padrao;
    return $out;
}
function certFonte($id, &$erro) {
    $d = certDir();
    if (!$id) { foreach (certLista() as $c) if ($c['padrao']) $id = $c['id']; }
    if (!$id) { $erro = 'Nenhum certificado digital importado. Importe em Configurações.'; return null; }
    if ($id === 'ambiente') {
        $b64 = getenv('CERT_PFX_BASE64'); if (!$b64) { $erro = 'Certificado do ambiente não configurado.'; return null; }
        return [base64_decode(preg_replace('/\s+/', '', $b64), true), (string)getenv('CERT_SENHA')];
    }
    if (!certIdValido($id) || !is_file("$d/$id.pfx")) { $erro = 'Certificado escolhido não foi encontrado.'; return null; }
    $meta = json_decode(file_get_contents("$d/$id.json"), true) ?: [];
    $senha = decifra($meta['senha'] ?? '');
    if ($senha === null) { $erro = 'Não foi possível ler a senha desse certificado (a senha de acesso do sistema mudou?). Importe-o de novo.'; return null; }
    return [file_get_contents("$d/$id.pfx"), $senha];
}
function certPem($id, &$erro) {
    $f = certFonte($id, $erro); if (!$f) return null;
    [$pfx, $senha] = $f;
    $pem = sys_get_temp_dir() . '/memo-cert-' . substr(hash('sha256', $pfx . '|' . $senha), 0, 16) . '.pem';
    if (is_file($pem)) return $pem;
    $c = [];
    if (!openssl_pkcs12_read($pfx, $c, $senha)) { $erro = 'Não foi possível abrir o certificado: confira a senha e o arquivo.'; return null; }
    $conteudo = $c['cert'] . "\n" . $c['pkey'] . "\n" . implode("\n", $c['extracerts'] ?? []);
    $old = umask(0077); file_put_contents($pem, $conteudo); umask($old); @chmod($pem, 0600);
    return $pem;
}
function limparPems() { foreach (glob(sys_get_temp_dir() . '/memo-cert-*.pem') ?: [] as $f) @unlink($f); }
if ($acao === 'certlistar') sai(200, ['certificados' => certLista()]);

function soapCadastro($url, $xml, $pem, $verificar) {
    $env = '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4">' . $xml . '</nfeDadosMsg></soap12:Body></soap12:Envelope>';
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $env, CURLOPT_TIMEOUT => 30, CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSLCERT => $pem, CURLOPT_SSLKEY => $pem, CURLOPT_SSL_VERIFYPEER => $verificar, CURLOPT_SSL_VERIFYHOST => $verificar ? 2 : 0,
        CURLOPT_HTTPHEADER => ['Content-Type: application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4/consultaCadastro"']]);
    $body = curl_exec($ch); $errno = curl_errno($ch); $err = curl_error($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$body, $errno, $err, $code];
}
function lerRetCadastro($body) {
    $dom = new DOMDocument();
    if (!@$dom->loadXML($body)) return null;
    $xp = new DOMXPath($dom);
    $t = function ($q, $ctx = null) use ($xp) { $n = $xp->query($q, $ctx); return $n && $n->length ? trim($n->item(0)->textContent) : ''; };
    $ret = ['cStat' => $t('//*[local-name()="infCons"]/*[local-name()="cStat"]'), 'xMotivo' => $t('//*[local-name()="infCons"]/*[local-name()="xMotivo"]'), 'cadastros' => []];
    foreach ($xp->query('//*[local-name()="infCad"]') as $ic) {
        $ret['cadastros'][] = [
            'ie' => $t('./*[local-name()="IE"]', $ic), 'cnpj' => $t('./*[local-name()="CNPJ"]', $ic), 'uf' => $t('./*[local-name()="UF"]', $ic),
            'situacao' => $t('./*[local-name()="cSit"]', $ic) === '1' ? 'Habilitado' : 'Não habilitado',
            'nfe' => $t('./*[local-name()="indCredNFe"]', $ic), 'nome' => $t('./*[local-name()="xNome"]', $ic),
            'regime' => $t('./*[local-name()="xRegApur"]', $ic), 'inicio' => $t('./*[local-name()="dIniAtiv"]', $ic),
            'ultimaSituacao' => $t('./*[local-name()="dUltSit"]', $ic), 'municipio' => $t('.//*[local-name()="xMun"]', $ic),
        ];
    }
    return $ret;
}
if ($acao === 'ie') {
    $c = preg_replace('/\D/', '', $_GET['cnpj'] ?? '');
    $uf = strtoupper(preg_replace('/[^a-z]/i', '', $_GET['uf'] ?? 'ES')) ?: 'ES';
    if (strlen($c) !== 14) sai(400, ['erro' => 'CNPJ deve ter 14 dígitos.']);
    // SVRS atende o ES (e outras UFs) na consulta de cadastro
    $svrs = ['AC', 'ES', 'PB', 'RN', 'SC', 'RJ', 'PI', 'TO', 'RO', 'AL', 'AP', 'DF', 'PA', 'RR', 'SE'];
    if (!in_array($uf, $svrs, true)) sai(400, ['erro' => "Consulta de IE automática ainda não configurada para $uf. Preencha a IE manualmente."]);
    if (!function_exists('curl_init')) sai(500, ['erro' => 'O servidor não tem cURL.']);
    $erro = '';
    $pem = certPem((string)($_GET['cert'] ?? ''), $erro);
    if (!$pem) sai(500, ['erro' => $erro]);
    $xml = '<ConsCad xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00"><infCons><xServ>CONS-CAD</xServ><UF>' . $uf . '</UF><CNPJ>' . $c . '</CNPJ></infCons></ConsCad>';
    $url = 'https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx';
    [$body, $errno, $err, $code] = soapCadastro($url, $xml, $pem, true);
    $semVerificacao = false;
    if ($errno === 60 || $errno === 77) { // cadeia de certificados da SEFAZ fora do repositório do servidor
        [$body, $errno, $err, $code] = soapCadastro($url, $xml, $pem, false); $semVerificacao = true;
    }
    if ($errno) sai(502, ['erro' => 'SEFAZ indisponível: ' . $err]);
    $r = lerRetCadastro((string)$body);
    if (!$r) sai(502, ['erro' => 'Resposta inesperada da SEFAZ (HTTP ' . $code . ').']);
    $r['sslNaoVerificado'] = $semVerificacao;
    sai(200, $r);
}

// ---------- gravações (com trava para a numeração) ----------
$lock = fopen($base . '/.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) sai(500, ['erro' => 'Não foi possível travar o arquivo de dados.']);

if ($acao === 'certenviar') {
    $pfx = base64_decode((string)($in['pfx'] ?? ''), true);
    $senha = (string)($in['senha'] ?? '');
    if (!$pfx || strlen($pfx) > 200000) sai(400, ['erro' => 'Arquivo de certificado inválido. Envie o .pfx ou .p12.']);
    $c = [];
    if (!openssl_pkcs12_read($pfx, $c, $senha)) sai(400, ['erro' => 'Não foi possível abrir o certificado com essa senha. Confira a senha e o arquivo (.pfx ou .p12).']);
    $info = infoCert($c['cert']);
    if ($info['validade'] && $info['validade'] < date('Y-m-d')) sai(400, ['erro' => 'Certificado vencido em ' . implode('/', array_reverse(explode('-', $info['validade']))) . '.']);
    $d = certDir();
    if (!is_dir($d)) { $old = umask(0077); mkdir($d, 0700, true); umask($old); }
    $id = substr(hash('sha256', $c['cert']), 0, 16); // o mesmo certificado importado de novo substitui o anterior
    $apelido = mb_substr(trim((string)($in['apelido'] ?? '')), 0, 60);
    $old = umask(0077);
    $ok = file_put_contents("$d/$id.pfx", $pfx) !== false
       && file_put_contents("$d/$id.json", json_encode($info + ['apelido' => $apelido, 'senha' => cifra($senha), 'enviadoPor' => mb_substr(trim((string)($in['usuario'] ?? '')), 0, 80), 'enviadoEm' => date('c')], JSON_UNESCAPED_UNICODE)) !== false;
    if ($ok && (!empty($in['padrao']) || !is_file("$d/padrao.txt"))) file_put_contents("$d/padrao.txt", $id);
    umask($old);
    if (!$ok) sai(500, ['erro' => 'Não foi possível gravar o certificado no servidor.']);
    limparPems();
    sai(200, ['id' => $id, 'certificados' => certLista()]);
}

if ($acao === 'certpadrao') {
    $id = (string)($in['id'] ?? '');
    if ($id !== 'ambiente' && !certIdValido($id)) sai(400, ['erro' => 'Certificado inválido.']);
    $d = certDir(); if (!is_dir($d)) mkdir($d, 0700, true);
    file_put_contents("$d/padrao.txt", $id);
    sai(200, ['certificados' => certLista()]);
}

if ($acao === 'certremover') {
    $id = (string)($in['id'] ?? '');
    if (!certIdValido($id)) sai(400, ['erro' => 'Só é possível remover certificados importados pelo sistema.']);
    $d = certDir();
    @unlink("$d/$id.pfx"); @unlink("$d/$id.json"); limparPems();
    if (is_file("$d/padrao.txt") && trim(file_get_contents("$d/padrao.txt")) === $id) @unlink("$d/padrao.txt");
    sai(200, ['certificados' => certLista()]);
}

if ($acao === 'salvar') {
    $memo = $in['memo'] ?? null;
    if (!is_array($memo)) sai(400, ['erro' => 'Dados do memorando ausentes.']);
    $id  = $in['id'] ?? null;
    $num = $in['numero'] ?? null;
    $agora = date('c');
    $usuario = mb_substr(trim((string)($in['usuario'] ?? '')), 0, 80);
    $alts = [];
    foreach ((array)($in['alteracoes'] ?? []) as $a) { if (is_string($a) && count($alts) < 60) $alts[] = mb_substr($a, 0, 80); }
    $acaoAlterou = trim((string)($in['acaoAlterou'] ?? ''));
    if ($acaoAlterou === '') $acaoAlterou = 'Alterou';
    $acaoAlterou = mb_substr($acaoAlterou, 0, 80);

    if ($id) {
        if (!idValido($id) || !file_exists(arq($memDir, $id))) sai(404, ['erro' => 'Memorando não encontrado no arquivo.']);
        $atual = ler(arq($memDir, $id)) ?: [];
        $seq = (int)($atual['seq'] ?? 0); $ano = (int)($atual['ano'] ?? 0);
        if (is_array($num) && ((int)$num['seq'] !== $seq || (int)$num['ano'] !== $ano)) { $seq = (int)$num['seq']; $ano = (int)$num['ano']; }
        $memo['criadoEm'] = $atual['criadoEm'] ?? $agora;
        $memo['criadoPorNome'] = $atual['criadoPorNome'] ?? '';
        $memo['status'] = $memo['status'] ?? ($atual['status'] ?? 'ativo');
        $hist = is_array($atual['historico'] ?? null) ? $atual['historico'] : [];
        if (!$hist && !empty($atual['criadoEm'])) $hist[] = ['acao' => 'Criou o memorando', 'por' => $atual['criadoPorNome'] ?? '', 'em' => $atual['criadoEm']];
        $antigoSeq = (int)($atual['seq'] ?? 0); $antigoAno = (int)($atual['ano'] ?? 0);
        // situação do cliente é alterada só pela ação "cliente"
        foreach (['situacaoCliente', 'dataSaida', 'motivoSaida', 'obsSaida'] as $k) $memo[$k] = $atual[$k] ?? '';
    } else {
        if (is_array($num)) { $seq = (int)$num['seq']; $ano = (int)$num['ano']; }
        else {
            $ano = (int)($in['anoAuto'] ?? date('Y'));
            $max = 0;
            foreach (glob($memDir . '/' . sprintf('%04d', $ano) . '-*.json') as $f) {
                if (preg_match('/-(\d+)\.json$/', $f, $mm)) $max = max($max, (int)$mm[1]);
            }
            $seq = $max + 1;
        }
        $memo['criadoEm'] = $agora;
        $memo['criadoPorNome'] = $usuario;
        $memo['status'] = 'ativo';
        $hist = [['acao' => 'Criou o memorando', 'por' => $usuario, 'em' => $agora]];
    }
    if ($seq < 1 || $seq > 9999 || $ano < 2000 || $ano > 2100) sai(400, ['erro' => 'Número inválido.']);
    $novoId = idDe($seq, $ano);
    if ($novoId !== $id && file_exists(arq($memDir, $novoId))) {
        sai(409, ['erro' => 'Já existe o memorando Nº ' . numTxt($seq, $ano) . '. Escolha outro número.']);
    }
    if ($id) {
        if ($antigoSeq !== $seq || $antigoAno !== $ano) {
            $hist[] = ['acao' => 'Renumerou de ' . numTxt($antigoSeq, $antigoAno) . ' para ' . numTxt($seq, $ano), 'campos' => $alts, 'por' => $usuario, 'em' => $agora];
        } elseif ($alts) {
            $hist[] = ['acao' => $acaoAlterou, 'campos' => $alts, 'por' => $usuario, 'em' => $agora];
        }
    }
    $memo['historico'] = array_slice($hist, -300);
    $memo['atualizadoPorNome'] = $usuario;
    unset($memo['_id'], $memo['busca']);
    $memo['seq'] = $seq; $memo['ano'] = $ano; $memo['m_numero'] = numTxt($seq, $ano);
    $memo['atualizadoEm'] = $agora;
    if (!grava(arq($memDir, $novoId), $memo)) sai(500, ['erro' => 'Não foi possível gravar o memorando no servidor.']);
    if ($id && $novoId !== $id) @unlink(arq($memDir, $id));
    $memo['_id'] = $novoId;
    sai(200, ['memo' => $memo]);
}

if ($acao === 'status') {
    $id = $in['id'] ?? ''; $st = $in['status'] ?? '';
    if (!idValido($id) || !in_array($st, ['ativo', 'cancelado'], true)) sai(400, ['erro' => 'Pedido inválido.']);
    $f = arq($memDir, $id);
    $m = ler($f);
    if (!$m) sai(404, ['erro' => 'Memorando não encontrado.']);
    $m['status'] = $st; $m['atualizadoEm'] = date('c');
    $hist = is_array($m['historico'] ?? null) ? $m['historico'] : [];
    $hist[] = ['acao' => $st === 'cancelado' ? 'Cancelou o memorando' : 'Reativou o memorando', 'por' => mb_substr(trim((string)($in['usuario'] ?? '')), 0, 80), 'em' => $m['atualizadoEm']];
    $m['historico'] = array_slice($hist, -300);
    if (!grava($f, $m)) sai(500, ['erro' => 'Não foi possível gravar.']);
    sai(200, ['ok' => true]);
}

if ($acao === 'excluir') {
    $id = $in['id'] ?? '';
    if (!idValido($id)) sai(400, ['erro' => 'Pedido inválido.']);
    $f = arq($memDir, $id);
    $m = ler($f);
    if (!$m) sai(404, ['erro' => 'Memorando não encontrado.']);
    // guarda uma cópia na lixeira (fora do arquivo ativo) antes de excluir; o número fica livre
    $lix = $base . '/lixeira';
    if (!is_dir($lix)) mkdir($lix, 0755, true);
    $m['excluidoEm'] = date('c');
    $m['excluidoPorNome'] = mb_substr(trim((string)($in['usuario'] ?? '')), 0, 80);
    if (!grava($lix . '/' . $id . '-' . date('Ymd-His') . '.json', $m)) sai(500, ['erro' => 'Não foi possível guardar a cópia na lixeira.']);
    if (!@unlink($f)) sai(500, ['erro' => 'Não foi possível excluir o memorando.']);
    sai(200, ['ok' => true]);
}

if ($acao === 'cliente') {
    $id = $in['id'] ?? ''; $sit = $in['situacaoCliente'] ?? '';
    if (!idValido($id) || !in_array($sit, ['ativa', 'inativa'], true)) sai(400, ['erro' => 'Pedido inválido.']);
    $f = arq($memDir, $id);
    $m = ler($f);
    if (!$m) sai(404, ['erro' => 'Memorando não encontrado.']);
    $usuario = mb_substr(trim((string)($in['usuario'] ?? '')), 0, 80);
    $agora = date('c');
    $hist = is_array($m['historico'] ?? null) ? $m['historico'] : [];
    if ($sit === 'inativa') {
        $data = (string)($in['dataSaida'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $data)) sai(400, ['erro' => 'Data de saída inválida.']);
        $m['situacaoCliente'] = 'inativa';
        $m['dataSaida'] = $data;
        $m['motivoSaida'] = mb_substr((string)($in['motivoSaida'] ?? ''), 0, 120);
        $m['obsSaida'] = mb_substr((string)($in['obsSaida'] ?? ''), 0, 500);
        $hist[] = ['acao' => 'Registrou a saída do cliente (' . implode('/', array_reverse(explode('-', $data))) . ($m['motivoSaida'] ? ' · ' . $m['motivoSaida'] : '') . ')', 'por' => $usuario, 'em' => $agora];
    } else {
        $m['situacaoCliente'] = 'ativa'; $m['dataSaida'] = ''; $m['motivoSaida'] = ''; $m['obsSaida'] = '';
        $hist[] = ['acao' => 'Reativou o cliente', 'por' => $usuario, 'em' => $agora];
    }
    $m['historico'] = array_slice($hist, -300);
    $m['atualizadoEm'] = $agora;
    if (!grava($f, $m)) sai(500, ['erro' => 'Não foi possível gravar.']);
    sai(200, ['ok' => true]);
}

sai(400, ['erro' => 'Ação desconhecida.']);
