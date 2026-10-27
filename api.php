<?php
/*
 * API do sistema de Memorandos — Facilitar Serviços Contábeis
 * Guarda os memorandos em arquivos JSON na pasta "dados" (bloqueada para acesso direto)
 * e faz a consulta de CNPJ (BrasilAPI, com ReceitaWS como alternativa).
 */

// ================== CONFIGURAÇÃO ==================
// A senha fica em config.php (fora do Git). Crie o arquivo a partir de config.exemplo.php.
if (file_exists(__DIR__ . '/config.php')) require __DIR__ . '/config.php';
if (!defined('SENHA_ACESSO')) define('SENHA_ACESSO', 'TROQUE-ESTA-SENHA');
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
    sai(500, ['erro' => 'Crie o arquivo config.php no servidor (copie config.exemplo.php) e defina a senha de acesso.']);
}

$senha = $_SERVER['HTTP_X_SENHA'] ?? '';
if (!is_string($senha) || !hash_equals(SENHA_ACESSO, $senha)) {
    usleep(400000); // dificulta tentativas em série
    sai(401, ['erro' => 'Senha inválida.']);
}

$base   = __DIR__ . '/dados';
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
            echo json_encode($j, JSON_UNESCAPED_UNICODE); exit;
        }
        $ultimo = $j['message'] ?? ($code === 404 ? 'CNPJ não encontrado.' : 'Consulta não retornou dados.');
        if ($code === 404) break;
    }
    sai(502, ['erro' => $ultimo ?: 'Não foi possível consultar o CNPJ.']);
}

// ---------- gravações (com trava para a numeração) ----------
$lock = fopen($base . '/.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) sai(500, ['erro' => 'Não foi possível travar o arquivo de dados.']);

if ($acao === 'salvar') {
    $memo = $in['memo'] ?? null;
    if (!is_array($memo)) sai(400, ['erro' => 'Dados do memorando ausentes.']);
    $id  = $in['id'] ?? null;
    $num = $in['numero'] ?? null;
    $agora = date('c');

    if ($id) {
        if (!idValido($id) || !file_exists(arq($memDir, $id))) sai(404, ['erro' => 'Memorando não encontrado no arquivo.']);
        $atual = ler(arq($memDir, $id)) ?: [];
        $seq = (int)($atual['seq'] ?? 0); $ano = (int)($atual['ano'] ?? 0);
        if (is_array($num) && ((int)$num['seq'] !== $seq || (int)$num['ano'] !== $ano)) { $seq = (int)$num['seq']; $ano = (int)$num['ano']; }
        $memo['criadoEm'] = $atual['criadoEm'] ?? $agora;
        $memo['criadoPorNome'] = $atual['criadoPorNome'] ?? '';
        $memo['status'] = $memo['status'] ?? ($atual['status'] ?? 'ativo');
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
        $memo['status'] = 'ativo';
    }
    if ($seq < 1 || $seq > 9999 || $ano < 2000 || $ano > 2100) sai(400, ['erro' => 'Número inválido.']);
    $novoId = idDe($seq, $ano);
    if ($novoId !== $id && file_exists(arq($memDir, $novoId))) {
        sai(409, ['erro' => 'Já existe o memorando Nº ' . numTxt($seq, $ano) . '. Escolha outro número.']);
    }
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
    if (!grava($f, $m)) sai(500, ['erro' => 'Não foi possível gravar.']);
    sai(200, ['ok' => true]);
}

sai(400, ['erro' => 'Ação desconhecida.']);
