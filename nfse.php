<?php
/*
 * Captura em lote de NFS-e pelo ADN (Ambiente de Dados Nacional).
 * Incluído pelo api.php depois da validação da senha; não responde sozinho.
 *
 * Fluxo: cada chamada de "nfsecapturar" busca UM lote (até 50 documentos) de UMA empresa
 * e devolve o resultado. Quem repete é a tela, com pausa entre os lotes: assim nenhuma
 * requisição PHP fica presa, e fechar o navegador não perde nada, porque notas e último
 * NSU são gravados na mesma transação.
 *
 * Contrato: Swagger "API NFS-e - ADN Contribuinte" e Manual de Contribuintes do ADN v1.0.
 *   GET /contribuintes/DFe/{NSU}?cnpjConsulta={cnpj}&lote=true
 *   GET /contribuintes/NFSe/{chave}/Eventos
 */
if (!defined('SENHA_ACESSO')) { http_response_code(403); exit; }

const NFSE_BASES = [
    'producao' => 'https://adn.nfse.gov.br/contribuintes',
    'restrita' => 'https://adn.producaorestrita.nfse.gov.br/contribuintes',
];
// Eventos que mudam a situação da nota (elementos do leiaute, tiposEventos_v1.01.xsd)
const NFSE_EVENTOS = [
    'CANCELAMENTO' => '101101', 'CANCELAMENTO_POR_SUBSTITUICAO' => '105102',
    'SOLICITACAO_CANCELAMENTO_ANALISE_FISCAL' => '101103', 'CANCELAMENTO_DEFERIDO_ANALISE_FISCAL' => '105104',
    'CANCELAMENTO_INDEFERIDO_ANALISE_FISCAL' => '105105', 'CANCELAMENTO_POR_OFICIO' => '305101',
    'BLOQUEIO_POR_OFICIO' => '305102', 'DESBLOQUEIO_POR_OFICIO' => '305103',
];

function nfseDir() { return rtrim(getenv('DADOS_DIR') ?: (__DIR__ . '/dados'), '/') . '/nfse'; }
function nfseAmbiente($v) { $v = (string)$v; if (!isset(NFSE_BASES[$v])) sai(400, ['erro' => 'Ambiente inválido.']); return $v; }
function nfseCnpjLimpo($v) { return strtoupper(preg_replace('/[^0-9A-Za-z]/', '', (string)$v)); }
function nfseCnpjValido($v) { return is_string($v) && preg_match('/^[0-9A-Z]{12}\d{2}$/', $v); }
function nfseCnpj($v) { $c = nfseCnpjLimpo($v); if (!nfseCnpjValido($c)) sai(400, ['erro' => 'CNPJ inválido.']); return $c; }
function nfseCentavos($v) { return $v === '' || $v === null ? 0 : (int) round(((float) $v) * 100); }

function nfseDb() {
    static $db = null;
    if ($db) return $db;
    if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)) sai(500, ['erro' => 'O servidor não tem o driver SQLite do PHP.']);
    $d = nfseDir();
    if (!is_dir($d)) { $old = umask(0077); mkdir($d, 0700, true); umask($old); }
    $db = new PDO('sqlite:' . $d . '/nfse.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=15000; PRAGMA foreign_keys=ON;');
    $db->exec('CREATE TABLE IF NOT EXISTS empresas (cnpj TEXT PRIMARY KEY, razao TEXT, cert_id TEXT, criado_em TEXT);
        CREATE TABLE IF NOT EXISTS estado (ambiente TEXT, cnpj TEXT, ultimo_nsu INTEGER DEFAULT 0, bloqueado_ate INTEGER DEFAULT 0, tentativas INTEGER DEFAULT 0,
            ultima_captura TEXT, ultimo_erro TEXT, PRIMARY KEY (ambiente, cnpj));
        CREATE TABLE IF NOT EXISTS notas (ambiente TEXT, cnpj TEXT, chave TEXT, nsu INTEGER, papel TEXT, competencia TEXT, data_competencia TEXT, emissao TEXT, numero TEXT,
            serie TEXT, n_dps TEXT, cstat TEXT, prest_doc TEXT, prest_nome TEXT, toma_doc TEXT, toma_nome TEXT, interm_doc TEXT, op_simples TEXT, trib_nac TEXT, trib_mun TEXT, desc_nac TEXT,
            descricao TEXT, mun_incid TEXT, trib_issqn TEXT, tp_ret_iss TEXT, aliq TEXT, tp_ret_pis TEXT, v_serv INTEGER, v_bc INTEGER, v_iss INTEGER, v_ret_cp INTEGER, v_ret_irrf INTEGER,
            v_ret_csll INTEGER, v_pis INTEGER, v_cofins INTEGER, v_total_ret INTEGER, v_liq INTEGER, v_ibs INTEGER, v_cbs INTEGER, situacao TEXT DEFAULT \'normal\', arquivo TEXT, eventos_em TEXT,
            PRIMARY KEY (ambiente, cnpj, chave));
        CREATE INDEX IF NOT EXISTS notas_comp ON notas (ambiente, cnpj, competencia);
        CREATE TABLE IF NOT EXISTS eventos (ambiente TEXT, cnpj TEXT, chave TEXT, id TEXT, nsu INTEGER, codigo TEXT, tipo TEXT, data TEXT, arquivo TEXT, PRIMARY KEY (ambiente, cnpj, id));
        CREATE INDEX IF NOT EXISTS eventos_chave ON eventos (ambiente, cnpj, chave);
        CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);
        CREATE TABLE IF NOT EXISTS acesso (cnpj TEXT PRIMARY KEY, modo TEXT);
        CREATE TABLE IF NOT EXISTS falhas (ambiente TEXT, cnpj TEXT, nsu INTEGER, chave TEXT, motivo TEXT, em TEXT, PRIMARY KEY (ambiente, cnpj, nsu));');
    nfseMigra($db);
    return $db;
}

/** Versão 1: campos do relatório (NBS, IBGE, obra). As notas já guardadas são preenchidas a partir dos XML. */
function nfseMigra($db) {
    if ((int) $db->query('PRAGMA user_version')->fetchColumn() >= 1) return;
    $db->exec('BEGIN IMMEDIATE');
    try {
        $tem = array_column($db->query('PRAGMA table_info(notas)')->fetchAll(), 'name');
        foreach (['c_nbs', 'x_nbs', 'c_loc_incid', 'cno_obra'] as $c) if (!in_array($c, $tem, true)) $db->exec("ALTER TABLE notas ADD COLUMN $c TEXT DEFAULT ''");
        $up = $db->prepare('UPDATE notas SET c_nbs = ?, x_nbs = ?, c_loc_incid = ?, cno_obra = ? WHERE ambiente = ? AND cnpj = ? AND chave = ?');
        foreach ($db->query('SELECT ambiente, cnpj, chave, arquivo FROM notas')->fetchAll() as $n) {
            $xml = @file_get_contents(nfseDir() . '/' . $n['arquivo']);
            $d = $xml === false ? null : nfseLerNota($xml, $n['cnpj']);
            if ($d) $up->execute([$d['c_nbs'], $d['x_nbs'], $d['c_loc_incid'], $d['cno_obra'], $n['ambiente'], $n['cnpj'], $n['chave']]);
        }
        $db->exec('PRAGMA user_version = 1');
        $db->exec('COMMIT');
    } catch (Throwable $e) { $db->exec('ROLLBACK'); throw $e; }
}

function nfseEstado($amb, $cnpj) {
    $db = nfseDb();
    $db->prepare('INSERT OR IGNORE INTO estado (ambiente, cnpj) VALUES (?, ?)')->execute([$amb, $cnpj]);
    $s = $db->prepare('SELECT * FROM estado WHERE ambiente = ? AND cnpj = ?'); $s->execute([$amb, $cnpj]);
    return $s->fetch();
}
function nfseEstadoAtualiza($amb, $cnpj, $campos) {
    $sets = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($campos)));
    nfseDb()->prepare("UPDATE estado SET $sets WHERE ambiente = ? AND cnpj = ?")->execute(array_merge(array_values($campos), [$amb, $cnpj]));
}

// ---------- certificado: mesma raiz de CNPJ e cadeia ICP-Brasil completa ----------
function nfseCertDe($cnpj, $certId = '') {
    $validos = array_values(array_filter(certLista(), function ($c) use ($cnpj) {
        $doc = (string)($c['documento'] ?? '');
        return strlen($doc) === 14 && substr($doc, 0, 8) === substr($cnpj, 0, 8);
    }));
    if ($certId) foreach ($validos as $c) if ($c['id'] === $certId) return $c;
    usort($validos, function ($a, $b) use ($cnpj) { // o do próprio CNPJ primeiro; depois o de validade mais longa
        return [($b['documento'] ?? '') === $cnpj, $b['validade'] ?? ''] <=> [($a['documento'] ?? '') === $cnpj, $a['validade'] ?? ''];
    });
    return $validos[0] ?? null;
}
function nfseProcurador() {
    $id = nfseDb()->query("SELECT valor FROM config WHERE chave = 'procurador'")->fetchColumn();
    if (!$id) return null;
    foreach (certLista() as $c) if ($c['id'] === $id) return $c;
    return null;
}
function nfseProcuradorDados($c) { return $c ? ['id' => $c['id'], 'nome' => ($c['apelido'] ?? '') ?: ($c['titular'] ?? ''), 'documento' => $c['documento'] ?? '', 'validade' => $c['validade'] ?? ''] : null; }
function nfseModos() {
    $m = [];
    foreach (nfseDb()->query('SELECT cnpj, modo FROM acesso') as $r) $m[$r['cnpj']] = $r['modo'];
    return $m;
}
/** Certificado usado na busca da empresa: o dela (mesma raiz) ou o do procurador, conforme a escolha na tela. */
function nfseCertEmpresa($cnpj, &$erro, &$modo = null) {
    $modo = nfseModos()[$cnpj] ?? 'certificado';
    if ($modo === 'procuracao') {
        $c = nfseProcurador();
        if (!$c) $erro = 'Cadastre o certificado do procurador na tela de Captura de NFS-e.';
        return $c;
    }
    $s = nfseDb()->prepare('SELECT cert_id FROM empresas WHERE cnpj = ?'); $s->execute([$cnpj]);
    $c = nfseCertDe($cnpj, (string) $s->fetchColumn());
    if (!$c) $erro = 'Nenhum e-CNPJ com a mesma raiz desse CNPJ. Importe o certificado em Configurações ou use a busca por procuração.';
    return $c;
}
function nfseDicaProcuracao($msg, $modo) { return $modo === 'procuracao' ? $msg . ' Confira se a procuração eletrônica desse cliente para a NFS-e está ativa e em nome do procurador cadastrado.' : $msg; }

function nfseHostPublico($host) {
    $ips = gethostbynamel($host);
    if (!$ips) return false;
    foreach ($ips as $ip) if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
    return true;
}
/** Baixa o certificado da AC emissora. O endereço vem de dentro do certificado, por isso só aceita servidor público e sem redirecionamento. */
function nfseBaixaAc($url) {
    $p = parse_url($url);
    if (!$p || !in_array($p['scheme'] ?? '', ['http', 'https'], true) || empty($p['host']) || !nfseHostPublico($p['host'])) return [];
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_MAXFILESIZE => 300000]);
    $b = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($b === false || $code !== 200 || strlen($b) > 300000) return [];
    if (strpos($b, '-----BEGIN CERTIFICATE-----') !== false) { preg_match_all('/-----BEGIN CERTIFICATE-----.+?-----END CERTIFICATE-----/s', $b, $m); return $m[0]; }
    $pem = "-----BEGIN CERTIFICATE-----\n" . chunk_split(base64_encode($b), 64, "\n") . "-----END CERTIFICATE-----\n";
    if (@openssl_x509_read($pem)) return [$pem];
    $p7 = "-----BEGIN PKCS7-----\n" . chunk_split(base64_encode($b), 64, "\n") . "-----END PKCS7-----\n"; // .p7b/.p7c
    $certs = [];
    return @openssl_pkcs7_read($p7, $certs) ? $certs : [];
}
/** O .pfx costuma trazer só o certificado da empresa; sem as ACs intermediárias o ADN recusa a conexão. */
function nfseCompletaCadeia($certPem, $extras) {
    $cadeia = array_values(array_filter($extras));
    $atual = $certPem;
    for ($i = 0; $i < 6; $i++) {
        $x = openssl_x509_parse($atual);
        if (!$x || ($x['subject'] ?? null) == ($x['issuer'] ?? null)) break;
        $proximo = null;
        foreach ($cadeia as $c) { $y = openssl_x509_parse($c); if ($y && ($y['subject'] ?? null) == $x['issuer']) { $proximo = $c; break; } }
        if (!$proximo && preg_match_all('/CA Issuers - URI:(\S+)/', (string)($x['extensions']['authorityInfoAccess'] ?? ''), $m)) {
            foreach ($m[1] as $url) {
                foreach (nfseBaixaAc($url) as $c) {
                    $y = openssl_x509_parse($c);
                    if ($y) { $cadeia[] = $c; if (($y['subject'] ?? null) == $x['issuer']) $proximo = $c; }
                }
                if ($proximo) break;
            }
        }
        if (!$proximo) break;
        $atual = $proximo;
    }
    return $cadeia;
}
function nfseCadeiaCompleta($certPem, $cadeia) {
    $ultimo = $cadeia ? end($cadeia) : $certPem;
    $x = openssl_x509_parse($ultimo);
    return $x && ($x['subject'] ?? null) == ($x['issuer'] ?? null);
}
function nfsePem($certId, &$erro, $recriar = false) {
    $f = certFonte($certId, $erro); if (!$f) return null;
    [$pfx, $senha] = $f;
    $c = [];
    if (!openssl_pkcs12_read($pfx, $c, $senha)) { $erro = 'Não foi possível abrir o certificado: importe-o de novo em Configurações.'; return null; }
    $x = openssl_x509_parse($c['cert']);
    if (($x['validTo_time_t'] ?? 0) < time()) { $erro = 'Certificado vencido em ' . date('d/m/Y', $x['validTo_time_t'] ?? 0) . '. Importe o novo em Configurações.'; return null; }
    $nome = sys_get_temp_dir() . '/memo-cert-nfse-' . substr(hash('sha256', $pfx . '|' . $senha), 0, 16); // removido por limparPems()
    if (!$recriar && is_file("$nome.pem")) return "$nome.pem";
    $cadeia = nfseCompletaCadeia($c['cert'], $c['extracerts'] ?? []);
    $arq = nfseCadeiaCompleta($c['cert'], $cadeia) ? "$nome.pem" : "$nome-parcial.pem"; // a parcial é remontada a cada uso, até o download das ACs funcionar
    $old = umask(0077);
    $ok = file_put_contents($arq, $c['cert'] . "\n" . implode("\n", $cadeia) . "\n" . $c['pkey'] . "\n");
    umask($old);
    if ($ok === false) { $erro = 'Não foi possível preparar o certificado no servidor.'; return null; }
    @chmod($arq, 0600);
    return $arq;
}

// ---------- comunicação com o ADN ----------
function nfseUrl($amb, $caminho) { return rtrim(getenv('NFSE_ADN_URL') ?: NFSE_BASES[$amb], '/') . $caminho; }
function nfseCurl($url, $pem, $http11, $tls12, $log = null) {
    $cabecalhos = [];
    $ch = curl_init($url);
    $op = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2, CURLOPT_ENCODING => '', CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_HEADERFUNCTION => function ($c, $h) use (&$cabecalhos) { $p = explode(':', $h, 2); if (count($p) === 2) $cabecalhos[strtolower(trim($p[0]))] = trim($p[1]); return strlen($h); }];
    if ($pem) { $op[CURLOPT_SSLCERT] = $pem; $op[CURLOPT_SSLKEY] = $pem; }
    if ($http11) $op[CURLOPT_HTTP_VERSION] = CURL_HTTP_VERSION_1_1;
    if ($tls12) $op[CURLOPT_SSLVERSION] = CURL_SSLVERSION_TLSv1_2 | CURL_SSLVERSION_MAX_TLSv1_2;
    if ($log) { $op[CURLOPT_VERBOSE] = true; $op[CURLOPT_STDERR] = $log; }
    if (getenv('NFSE_ADN_CA')) $op[CURLOPT_CAINFO] = getenv('NFSE_ADN_CA'); // só em teste local
    curl_setopt_array($ch, $op);
    $corpo = curl_exec($ch);
    $r = ['http' => (int) curl_getinfo($ch, CURLINFO_HTTP_CODE), 'corpo' => (string) $corpo, 'errno' => curl_errno($ch), 'erro' => curl_error($ch), 'json' => json_decode((string) $corpo, true), 'cabecalhos' => $cabecalhos];
    curl_close($ch);
    return $r;
}
function nfseGet($amb, $caminho, $pem) {
    $url = nfseUrl($amb, $caminho);
    $r = nfseCurl($url, $pem, false, false);
    foreach ([[true, false], [true, true]] as [$http11, $tls12]) { // alguns servidores só aceitam HTTP/1.1 ou TLS 1.2
        if (!in_array($r['errno'], [35, 56], true)) break;
        $r = nfseCurl($url, $pem, $http11, $tls12);
    }
    return $r;
}
function nfseMsgConexao($r) {
    if (in_array($r['http'], [401, 403, 495, 496], true)) return 'O ADN recusou o certificado (HTTP ' . $r['http'] . '). Confira se é um e-CNPJ ICP-Brasil da mesma raiz do CNPJ consultado.';
    if (in_array($r['errno'], [35, 56, 58, 59], true)) return 'O ADN encerrou a conexão segura (' . $r['erro'] . '). Use o botão Diagnosticar da empresa para ver onde ela cai.';
    return 'Falha de comunicação com o ADN: ' . ($r['erro'] ?: 'HTTP ' . $r['http']);
}
function nfseMsgErros($j) {
    $m = [];
    foreach (($j['Erros'] ?? []) as $e) $m[] = trim(($e['Codigo'] ?? '') . ' ' . ($e['Descricao'] ?? '') . ' ' . ($e['Complemento'] ?? ''));
    return implode(' | ', array_filter($m)) ?: 'O ADN rejeitou a consulta.';
}
function nfseEspera($r, $tentativas) {
    $h = $r['cabecalhos']['retry-after'] ?? '';
    if (ctype_digit($h)) return max(1, (int) $h);
    if ($h !== '' && ($t = strtotime($h))) return max(1, $t - time());
    return min(3600, 60 * (2 ** min($tentativas, 6)));
}

// ---------- leitura dos XML ----------
function nfseDom($xml) {
    if (stripos($xml, '<!DOCTYPE') !== false) return null;
    $d = new DOMDocument();
    return @$d->loadXML($xml, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING) ? $d : null;
}
function nfseCaminho($caminho) { return './' . implode('/', array_map(function ($p) { return "*[local-name()='$p']"; }, explode('/', $caminho))); }
function nfseLerNota($xml, $cnpj) {
    $d = nfseDom($xml); if (!$d) return null;
    $xp = new DOMXPath($d);
    $inf = $xp->query("/*[local-name()='NFSe']/*[local-name()='infNFSe']")->item(0);
    if (!$inf) return null;
    $t = function ($caminho) use ($xp, $inf) { $n = $xp->query(nfseCaminho($caminho), $inf)->item(0); return $n ? trim($n->textContent) : ''; };
    $id = 'infDPS'; $dps = "DPS/$id";
    $doc = function ($g) use ($t, $dps) { foreach (['CNPJ', 'CPF', 'NIF'] as $k) { $v = $t("$dps/$g/$k"); if ($v !== '') return $v; } return ''; };
    $prest = $doc('prest'); $toma = $doc('toma'); $interm = $doc('interm');
    $papel = $prest === $cnpj ? 'prestador' : ($toma === $cnpj ? 'tomador' : ($interm === $cnpj ? 'intermediario' : 'outro'));
    $comp = $t("$dps/dCompet");
    $emiteTomador = $t("$dps/tpEmit") === '2';
    return [
        'competencia' => substr($comp, 0, 7), 'data_competencia' => $comp, 'emissao' => $t("$dps/dhEmi") ?: $t('dhProc'), 'numero' => $t('nNFSe'), 'serie' => $t("$dps/serie"), 'n_dps' => $t("$dps/nDPS"),
        'cstat' => $t('cStat'), 'papel' => $papel, 'prest_doc' => $prest, 'prest_nome' => $t("$dps/prest/xNome") ?: ($emiteTomador ? '' : $t('emit/xNome')),
        'toma_doc' => $toma, 'toma_nome' => $t("$dps/toma/xNome") ?: ($emiteTomador ? $t('emit/xNome') : ''), 'interm_doc' => $interm, 'op_simples' => $t("$dps/prest/regTrib/opSimpNac"),
        'trib_nac' => $t("$dps/serv/cServ/cTribNac"), 'trib_mun' => $t("$dps/serv/cServ/cTribMun"), 'desc_nac' => $t('xTribNac'), 'descricao' => $t("$dps/serv/cServ/xDescServ"),
        'c_nbs' => $t("$dps/serv/cServ/cNBS"), 'x_nbs' => $t('xNBS'), 'c_loc_incid' => $t('cLocIncid'), 'cno_obra' => $t("$dps/serv/obra/cObra"),
        'mun_incid' => $t('xLocIncid'), 'trib_issqn' => $t("$dps/valores/trib/tribMun/tribISSQN"), 'tp_ret_iss' => $t("$dps/valores/trib/tribMun/tpRetISSQN"),
        'aliq' => $t('valores/pAliqAplic') ?: $t("$dps/valores/trib/tribMun/pAliq"), 'tp_ret_pis' => $t("$dps/valores/trib/tribFed/piscofins/tpRetPisCofins"),
        'v_serv' => nfseCentavos($t("$dps/valores/vServPrest/vServ")), 'v_bc' => nfseCentavos($t('valores/vBC')), 'v_iss' => nfseCentavos($t('valores/vISSQN')),
        'v_ret_cp' => nfseCentavos($t("$dps/valores/trib/tribFed/vRetCP")), 'v_ret_irrf' => nfseCentavos($t("$dps/valores/trib/tribFed/vRetIRRF")), 'v_ret_csll' => nfseCentavos($t("$dps/valores/trib/tribFed/vRetCSLL")),
        'v_pis' => nfseCentavos($t("$dps/valores/trib/tribFed/piscofins/vPis")), 'v_cofins' => nfseCentavos($t("$dps/valores/trib/tribFed/piscofins/vCofins")),
        'v_total_ret' => nfseCentavos($t('valores/vTotalRet')), 'v_liq' => nfseCentavos($t('valores/vLiq')),
        'v_ibs' => nfseCentavos($t('IBSCBS/totCIBS/gIBS/vIBSTot')), 'v_cbs' => nfseCentavos($t('IBSCBS/totCIBS/gCBS/vCBS')),
    ];
}
function nfseCodigoEvento($xml, $tipo) {
    if (isset(NFSE_EVENTOS[$tipo])) return NFSE_EVENTOS[$tipo];
    return preg_match('/<(?:\w+:)?e(\d{6})[\s>]/', $xml, $m) ? $m[1] : '';
}
function nfseChaveEvento($xml) { return preg_match('/<(?:\w+:)?chNFSe>(\d{50})</', $xml, $m) ? $m[1] : ''; }
function nfseDescompacta($b64) {
    $b = base64_decode((string) $b64, true); if ($b === false || $b === '') return null;
    $x = @gzdecode($b);
    return $x === false || $x === '' ? null : $x;
}
function nfseGravaArquivo($relativo, $conteudo) {
    $f = nfseDir() . '/' . $relativo; $d = dirname($f);
    if (!is_dir($d) && !mkdir($d, 0700, true) && !is_dir($d)) return false;
    $tmp = $f . '.tmp';
    return file_put_contents($tmp, $conteudo) !== false && rename($tmp, $f);
}
function nfseGravaNota($amb, $cnpj, $chave, $nsu, $xml) {
    $n = nfseLerNota($xml, $cnpj); if (!$n) return 'XML da NFS-e ilegível.';
    if (!preg_match('/^\d{4}-\d{2}$/', $n['competencia'])) return 'NFS-e sem data de competência.';
    $arquivo = "$amb/$cnpj/{$n['competencia']}/$chave.xml";
    if (!nfseGravaArquivo($arquivo, $xml)) return 'Não foi possível gravar o XML no servidor.';
    $campos = ['ambiente' => $amb, 'cnpj' => $cnpj, 'chave' => $chave, 'nsu' => $nsu, 'arquivo' => $arquivo] + $n;
    $novos = array_diff(array_keys($campos), ['ambiente', 'cnpj', 'chave']);
    $ja = nfseDb()->prepare('SELECT 1 FROM notas WHERE ambiente = ? AND cnpj = ? AND chave = ?'); $ja->execute([$amb, $cnpj, $chave]);
    $existe = (bool) $ja->fetchColumn();
    $sql = 'INSERT INTO notas (' . implode(', ', array_keys($campos)) . ') VALUES (' . rtrim(str_repeat('?, ', count($campos)), ', ') . ') ON CONFLICT (ambiente, cnpj, chave) DO UPDATE SET '
         . implode(', ', array_map(function ($k) { return "$k = excluded.$k"; }, $novos));
    nfseDb()->prepare($sql)->execute(array_values($campos));
    nfseAtualizaSituacao($amb, $cnpj, $chave);
    return $existe ? 'repetida' : '';
}
function nfseGravaEvento($amb, $cnpj, $chave, $nsu, $tipo, $data, $xml) {
    if (!preg_match('/^\d{50}$/', (string) $chave)) $chave = nfseChaveEvento($xml);
    if (!$chave) return 'Evento sem chave de acesso.';
    $id = substr(hash('sha256', $xml), 0, 32);
    $arquivo = "$amb/$cnpj/eventos/$chave-$id.xml";
    if (!nfseGravaArquivo($arquivo, $xml)) return 'Não foi possível gravar o evento no servidor.';
    nfseDb()->prepare('INSERT OR IGNORE INTO eventos (ambiente, cnpj, chave, id, nsu, codigo, tipo, data, arquivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$amb, $cnpj, $chave, $id, $nsu, nfseCodigoEvento($xml, (string) $tipo), (string) $tipo, (string) $data, $arquivo]);
    nfseAtualizaSituacao($amb, $cnpj, $chave);
    return '';
}
/** A situação sai sempre dos eventos, na ordem em que aconteceram; o evento pode chegar antes da própria nota. */
function nfseAtualizaSituacao($amb, $cnpj, $chave) {
    $s = nfseDb()->prepare('SELECT codigo FROM eventos WHERE ambiente = ? AND cnpj = ? AND chave = ? ORDER BY data, COALESCE(nsu, 0)');
    $s->execute([$amb, $cnpj, $chave]);
    $sit = 'normal';
    foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $c) {
        if (in_array($sit, ['cancelada', 'substituida'], true)) break;
        if (in_array($c, ['101101', '105104', '305101'], true)) $sit = 'cancelada';
        elseif ($c === '105102') $sit = 'substituida';
        elseif ($c === '101103') $sit = 'em_analise';
        elseif ($c === '105105' || $c === '305103') $sit = 'normal';
        elseif ($c === '305102') $sit = 'bloqueada';
    }
    nfseDb()->prepare('UPDATE notas SET situacao = ? WHERE ambiente = ? AND cnpj = ? AND chave = ?')->execute([$sit, $amb, $cnpj, $chave]);
}

// ---------- empresas ----------
function nfseEmpresas($amb, $memDir) {
    $lista = [];
    foreach (nfseDb()->query('SELECT * FROM empresas') as $e) $lista[$e['cnpj']] = ['cnpj' => $e['cnpj'], 'razao' => $e['razao'], 'certId' => $e['cert_id'], 'manual' => true];
    foreach (glob($memDir . '/*.json') ?: [] as $f) {
        $m = json_decode((string) @file_get_contents($f), true); if (!is_array($m)) continue;
        $c = nfseCnpjLimpo($m['e_cnpj'] ?? '');
        if (!nfseCnpjValido($c) || ($m['status'] ?? '') === 'cancelado' || ($m['situacaoCliente'] ?? '') === 'inativa') continue;
        if (!isset($lista[$c])) $lista[$c] = ['cnpj' => $c, 'razao' => (string)($m['e_razao'] ?? ''), 'certId' => '', 'manual' => false];
        elseif (!$lista[$c]['razao']) $lista[$c]['razao'] = (string)($m['e_razao'] ?? '');
    }
    $certs = certLista();
    foreach ($certs as $c) {
        $doc = (string)($c['documento'] ?? '');
        if (strlen($doc) === 14 && !isset($lista[$doc])) $lista[$doc] = ['cnpj' => $doc, 'razao' => (string)($c['titular'] ?? ''), 'certId' => '', 'manual' => false];
    }
    $totais = [];
    $s = nfseDb()->prepare('SELECT cnpj, COUNT(*) n FROM notas WHERE ambiente = ? GROUP BY cnpj'); $s->execute([$amb]);
    foreach ($s as $r) $totais[$r['cnpj']] = (int) $r['n'];
    $falhas = [];
    $s = nfseDb()->prepare('SELECT cnpj, COUNT(*) n FROM falhas WHERE ambiente = ? GROUP BY cnpj'); $s->execute([$amb]);
    foreach ($s as $r) $falhas[$r['cnpj']] = (int) $r['n'];
    $saida = []; $modos = nfseModos(); $procurador = nfseProcurador();
    foreach ($lista as $e) {
        $st = nfseEstado($amb, $e['cnpj']);
        $modo = $modos[$e['cnpj']] ?? 'certificado';
        $cert = $modo === 'procuracao' ? $procurador : nfseCertDe($e['cnpj'], $e['certId']);
        $saida[] = $e + ['modo' => $modo, 'certificado' => nfseProcuradorDados($cert),
            'ultimoNsu' => (int) $st['ultimo_nsu'], 'ultimaCaptura' => $st['ultima_captura'], 'ultimoErro' => $st['ultimo_erro'], 'notas' => $totais[$e['cnpj']] ?? 0, 'falhas' => $falhas[$e['cnpj']] ?? 0];
    }
    usort($saida, function ($a, $b) { return strcasecmp($a['razao'], $b['razao']); });
    return $saida;
}

// ---------- ações ----------
$nfseAmb = nfseAmbiente($_GET['ambiente'] ?? $in['ambiente'] ?? 'producao');

function nfseAgenda() {
    $s = nfseDb()->query("SELECT valor FROM config WHERE chave = 'agenda'")->fetchColumn();
    $a = $s ? json_decode($s, true) : null;
    return (is_array($a) ? $a : []) + ['ativo' => true, 'hora' => '02:00', 'ultimoDia' => '', 'status' => '', 'inicio' => '', 'fim' => '', 'linhas' => []];
}
function nfseAgendaGrava($a) { nfseDb()->prepare("INSERT OR REPLACE INTO config (chave, valor) VALUES ('agenda', ?)")->execute([json_encode($a, JSON_UNESCAPED_UNICODE)]); return $a; }

if ($acao === 'nfseagenda') sai(200, nfseAgenda());

if ($acao === 'nfseagendasalvar') {
    $hora = (string)($in['hora'] ?? '');
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $hora)) sai(400, ['erro' => 'Horário inválido.']);
    $a = nfseAgenda(); $a['ativo'] = !empty($in['ativo']); $a['hora'] = $hora;
    sai(200, nfseAgendaGrava($a));
}

if ($acao === 'nfseagendaresultado') { // chamada pelo agendador
    $a = nfseAgenda(); $st = (string)($in['status'] ?? ''); $dia = (string)($in['dia'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dia)) sai(400, ['erro' => 'Dia inválido.']);
    $a['ultimoDia'] = $dia; $a['status'] = $st === 'rodando' ? 'rodando' : 'concluido';
    if ($st === 'rodando') { $a['inicio'] = date('c'); $a['fim'] = ''; $a['linhas'] = []; }
    else { $a['fim'] = date('c'); $a['linhas'] = array_map(function ($l) { return mb_substr((string) $l, 0, 300); }, array_slice((array)($in['linhas'] ?? []), 0, 500)); }
    sai(200, nfseAgendaGrava($a));
}

if ($acao === 'nfseempresas') sai(200, ['empresas' => nfseEmpresas($nfseAmb, $memDir)]);

if ($acao === 'nfseempresasalvar') {
    $cnpj = nfseCnpj($in['cnpj'] ?? '');
    $certId = (string)($in['certId'] ?? '');
    if ($certId !== '' && $certId !== 'ambiente' && !certIdValido($certId)) sai(400, ['erro' => 'Certificado inválido.']);
    if ($certId !== '' && !nfseCertDe($cnpj, $certId)) sai(400, ['erro' => 'O certificado escolhido não tem a mesma raiz desse CNPJ.']);
    nfseDb()->prepare('INSERT INTO empresas (cnpj, razao, cert_id, criado_em) VALUES (?, ?, ?, ?) ON CONFLICT (cnpj) DO UPDATE SET razao = excluded.razao, cert_id = excluded.cert_id')
        ->execute([$cnpj, mb_substr(trim((string)($in['razao'] ?? '')), 0, 150), $certId, date('c')]);
    sai(200, ['empresas' => nfseEmpresas($nfseAmb, $memDir)]);
}

if ($acao === 'nfseacesso') { // escolhe como a empresa é consultada
    $cnpj = nfseCnpj($in['cnpj'] ?? ''); $modo = (string)($in['modo'] ?? '');
    if (!in_array($modo, ['certificado', 'procuracao'], true)) sai(400, ['erro' => 'Forma de busca inválida.']);
    nfseDb()->prepare('INSERT OR REPLACE INTO acesso (cnpj, modo) VALUES (?, ?)')->execute([$cnpj, $modo]);
    sai(200, ['empresas' => nfseEmpresas($nfseAmb, $memDir)]);
}

if ($acao === 'nfseprocurador') sai(200, ['procurador' => nfseProcuradorDados(nfseProcurador())]);

if ($acao === 'nfseprocuradorsalvar') { // id vazio tira o procurador; o certificado continua em Configurações
    $id = (string)($in['id'] ?? '');
    if ($id !== '' && !array_filter(certLista(), function ($c) use ($id) { return $c['id'] === $id; })) sai(400, ['erro' => 'Certificado não encontrado.']);
    nfseDb()->prepare("INSERT OR REPLACE INTO config (chave, valor) VALUES ('procurador', ?)")->execute([$id]);
    sai(200, ['procurador' => nfseProcuradorDados(nfseProcurador()), 'empresas' => nfseEmpresas($nfseAmb, $memDir)]);
}

if ($acao === 'nfseempresaexcluir') { // tira só o cadastro manual; notas e último NSU continuam guardados
    nfseDb()->prepare('DELETE FROM empresas WHERE cnpj = ?')->execute([nfseCnpj($in['cnpj'] ?? '')]);
    sai(200, ['empresas' => nfseEmpresas($nfseAmb, $memDir)]);
}

if ($acao === 'nfsecapturar') {
    $cnpj = nfseCnpj($in['cnpj'] ?? '');
    if (!is_dir(nfseDir())) nfseDb();
    $trava = fopen(nfseDir() . '/captura.lock', 'c');
    if (!$trava || !flock($trava, LOCK_EX | LOCK_NB)) sai(200, ['status' => 'aguardar', 'segundos' => 5, 'mensagem' => 'Outra captura está em andamento.']);
    $st = nfseEstado($nfseAmb, $cnpj);
    $resta = (int) $st['bloqueado_ate'] - time();
    if ($resta > 0) sai(200, ['status' => 'aguardar', 'segundos' => $resta, 'mensagem' => 'Aguardando o limite de consultas do ADN.']);
    $erro = ''; $modo = 'certificado'; $cert = nfseCertEmpresa($cnpj, $erro, $modo);
    $falha = function ($msg) use ($nfseAmb, $cnpj) { nfseEstadoAtualiza($nfseAmb, $cnpj, ['ultimo_erro' => $msg]); sai(200, ['status' => 'erro', 'mensagem' => $msg]); };
    if (!$cert) $falha($erro);
    $pem = nfsePem($cert['id'], $erro);
    if (!$pem) $falha($erro);

    $nsu = (int) $st['ultimo_nsu'];
    $r = nfseGet($nfseAmb, '/DFe/' . $nsu . '?cnpjConsulta=' . rawurlencode($cnpj) . '&lote=true', $pem);
    if ($r['http'] === 429 || $r['http'] >= 500) {
        $seg = nfseEspera($r, (int) $st['tentativas']);
        nfseEstadoAtualiza($nfseAmb, $cnpj, ['bloqueado_ate' => time() + $seg, 'tentativas' => (int) $st['tentativas'] + 1]);
        sai(200, ['status' => 'aguardar', 'segundos' => $seg, 'mensagem' => $r['http'] === 429 ? 'O ADN pediu uma pausa nas consultas.' : 'O ADN está instável (HTTP ' . $r['http'] . ').']);
    }
    $j = $r['json'];
    // 404 e 400 trazem o motivo no corpo: só o StatusProcessamento diz se é fim da fila ou rejeição
    if ($r['errno'] || !is_array($j) || empty($j['StatusProcessamento'])) $falha(nfseDicaProcuracao(nfseMsgConexao($r), $modo));
    $status = $j['StatusProcessamento'];
    if ($status === 'REJEICAO') $falha(nfseDicaProcuracao(nfseMsgErros($j), $modo));
    $agora = date('c');
    if ($status === 'NENHUM_DOCUMENTO_LOCALIZADO') {
        nfseEstadoAtualiza($nfseAmb, $cnpj, ['ultima_captura' => $agora, 'ultimo_erro' => null, 'tentativas' => 0]);
        sai(200, ['status' => 'fim', 'ultimoNsu' => $nsu, 'notas' => 0, 'eventos' => 0, 'ignorados' => 0, 'falhas' => 0]);
    }
    if ($status !== 'DOCUMENTOS_LOCALIZADOS') $falha('Resposta inesperada do ADN: ' . mb_substr((string) $status, 0, 80));

    $lote = array_values(array_filter($j['LoteDFe'] ?? [], function ($d) use ($nsu) { return (int)($d['NSU'] ?? 0) > $nsu; }));
    usort($lote, function ($a, $b) { return (int) $a['NSU'] <=> (int) $b['NSU']; });
    if (!$lote) { // o lote só repetiu o NSU de partida
        nfseEstadoAtualiza($nfseAmb, $cnpj, ['ultima_captura' => $agora, 'ultimo_erro' => null, 'tentativas' => 0]);
        sai(200, ['status' => 'fim', 'ultimoNsu' => $nsu, 'notas' => 0, 'eventos' => 0, 'ignorados' => 0, 'falhas' => 0]);
    }
    $cont = ['notas' => 0, 'repetidas' => 0, 'eventos' => 0, 'ignorados' => 0, 'falhas' => 0];
    $maior = $nsu;
    $db = nfseDb();
    $db->exec('BEGIN IMMEDIATE');
    try {
        foreach ($lote as $d) {
            $n = (int) $d['NSU']; $maior = max($maior, $n);
            $tipo = (string)($d['TipoDocumento'] ?? ''); $chave = (string)($d['ChaveAcesso'] ?? '');
            $motivo = '';
            if ($tipo === 'NFSE' || $tipo === 'EVENTO') {
                $xml = nfseDescompacta($d['ArquivoXml'] ?? '');
                if ($xml === null) $motivo = 'Arquivo XML corrompido.';
                elseif ($tipo === 'NFSE') {
                    if (!preg_match('/^\d{50}$/', $chave)) $motivo = 'NFS-e sem chave de acesso válida.';
                    else { $motivo = nfseGravaNota($nfseAmb, $cnpj, $chave, $n, $xml); if ($motivo === 'repetida') { $cont['repetidas']++; $motivo = ''; } elseif ($motivo === '') $cont['notas']++; }
                } else { $motivo = nfseGravaEvento($nfseAmb, $cnpj, $chave, $n, $d['TipoEvento'] ?? '', $d['DataHoraGeracao'] ?? '', $xml); if ($motivo === '') $cont['eventos']++; }
            } else $cont['ignorados']++;
            if ($motivo !== '') {
                $cont['falhas']++;
                $db->prepare('INSERT OR REPLACE INTO falhas (ambiente, cnpj, nsu, chave, motivo, em) VALUES (?, ?, ?, ?, ?, ?)')->execute([$nfseAmb, $cnpj, $n, $chave, $motivo, $agora]);
            } else $db->prepare('DELETE FROM falhas WHERE ambiente = ? AND cnpj = ? AND nsu = ?')->execute([$nfseAmb, $cnpj, $n]);
        }
        nfseEstadoAtualiza($nfseAmb, $cnpj, ['ultimo_nsu' => $maior, 'ultima_captura' => $agora, 'ultimo_erro' => null, 'tentativas' => 0, 'bloqueado_ate' => 0]);
        $db->exec('COMMIT');
    } catch (Throwable $e) {
        $db->exec('ROLLBACK');
        $falha('Erro ao gravar o lote; nada foi perdido, a captura retoma do mesmo ponto.');
    }
    sai(200, ['status' => 'lote', 'ultimoNsu' => $maior] + $cont);
}

if ($acao === 'nfsenotas') {
    $cnpj = nfseCnpj($_GET['cnpj'] ?? '');
    $s = nfseDb()->prepare('SELECT competencia, COUNT(*) n FROM notas WHERE ambiente = ? AND cnpj = ? GROUP BY competencia ORDER BY competencia DESC');
    $s->execute([$nfseAmb, $cnpj]);
    $comps = array_map(function ($r) { return ['competencia' => $r['competencia'], 'notas' => (int) $r['n']]; }, $s->fetchAll());
    $comp = (string)($_GET['competencia'] ?? ($comps[0]['competencia'] ?? ''));
    if ($comp !== '' && !preg_match('/^\d{4}-\d{2}$/', $comp)) sai(400, ['erro' => 'Competência inválida.']);
    $s = nfseDb()->prepare('SELECT * FROM notas WHERE ambiente = ? AND cnpj = ? AND competencia = ? ORDER BY emissao, numero');
    $s->execute([$nfseAmb, $cnpj, $comp]);
    $notas = array_map(function ($n) { unset($n['ambiente'], $n['arquivo']); foreach ($n as $k => $v) if (strpos($k, 'v_') === 0) $n[$k] = (int) $v; return $n; }, $s->fetchAll());
    $s = nfseDb()->prepare('SELECT nsu, chave, motivo, em FROM falhas WHERE ambiente = ? AND cnpj = ? ORDER BY nsu');
    $s->execute([$nfseAmb, $cnpj]);
    sai(200, ['competencias' => $comps, 'competencia' => $comp, 'notas' => $notas, 'falhas' => $s->fetchAll()]);
}

if ($acao === 'nfseverificar') { // consulta os eventos de uma nota pela chave
    $cnpj = nfseCnpj($in['cnpj'] ?? ''); $chave = (string)($in['chave'] ?? '');
    if (!preg_match('/^\d{50}$/', $chave)) sai(400, ['erro' => 'Chave inválida.']);
    $erro = ''; $modo = 'certificado'; $cert = nfseCertEmpresa($cnpj, $erro, $modo); if (!$cert) sai(200, ['status' => 'erro', 'mensagem' => $erro]);
    $pem = nfsePem($cert['id'], $erro); if (!$pem) sai(200, ['status' => 'erro', 'mensagem' => $erro]);
    $r = nfseGet($nfseAmb, '/NFSe/' . $chave . '/Eventos', $pem);
    if ($r['http'] === 429 || $r['http'] >= 500) sai(200, ['status' => 'aguardar', 'segundos' => nfseEspera($r, 0), 'mensagem' => 'O ADN pediu uma pausa nas consultas.']);
    $j = $r['json'];
    if ($r['errno'] || !is_array($j) || empty($j['StatusProcessamento'])) sai(200, ['status' => 'erro', 'mensagem' => nfseDicaProcuracao(nfseMsgConexao($r), $modo)]);
    if ($j['StatusProcessamento'] === 'REJEICAO') sai(200, ['status' => 'erro', 'mensagem' => nfseDicaProcuracao(nfseMsgErros($j), $modo)]);
    $novos = 0;
    foreach (($j['LoteDFe'] ?? []) as $d) {
        $xml = nfseDescompacta($d['ArquivoXml'] ?? ''); if ($xml === null) continue;
        if (nfseGravaEvento($nfseAmb, $cnpj, $chave, $d['NSU'] ?? null, $d['TipoEvento'] ?? '', $d['DataHoraGeracao'] ?? '', $xml) === '') $novos++;
    }
    nfseDb()->prepare('UPDATE notas SET eventos_em = ? WHERE ambiente = ? AND cnpj = ? AND chave = ?')->execute([date('c'), $nfseAmb, $cnpj, $chave]);
    $s = nfseDb()->prepare('SELECT situacao FROM notas WHERE ambiente = ? AND cnpj = ? AND chave = ?'); $s->execute([$nfseAmb, $cnpj, $chave]);
    sai(200, ['status' => 'ok', 'eventos' => $novos, 'situacao' => $s->fetchColumn() ?: 'normal']);
}

if ($acao === 'nfsediagnostico') { // só leitura: mostra a cadeia do certificado e como cada forma de conexão responde
    $cnpj = nfseCnpj($in['cnpj'] ?? '');
    $erro = ''; $modo = 'certificado'; $cert = nfseCertEmpresa($cnpj, $erro, $modo);
    if (!$cert) sai(200, ['linhas' => [$erro]]);
    $linhas = ['Empresa: ' . $cnpj, 'Busca por: ' . ($modo === 'procuracao' ? 'procuração' : 'certificado da empresa'), 'Certificado: ' . ($cert['titular'] ?? '') . ' / ' . ($cert['documento'] ?? '') . ' / validade ' . ($cert['validade'] ?? ''), 'PHP ' . PHP_VERSION . ' / curl ' . (curl_version()['version'] ?? '') . ' / ' . (curl_version()['ssl_version'] ?? '')];
    $pem = nfsePem($cert['id'], $erro, true);
    if (!$pem) sai(200, ['linhas' => array_merge($linhas, ['Certificado: ' . $erro])]);
    preg_match_all('/-----BEGIN CERTIFICATE-----.+?-----END CERTIFICATE-----/s', (string) file_get_contents($pem), $m);
    $linhas[] = 'Cadeia enviada (' . count($m[0]) . ' certificados' . (strpos($pem, '-parcial') === false ? ', completa até a raiz' : ', INCOMPLETA: não chegou à raiz') . '):';
    foreach ($m[0] as $i => $c) {
        $x = openssl_x509_parse($c);
        $linhas[] = '  ' . ($i + 1) . '. ' . ($x['subject']['CN'] ?? '?') . ' <- ' . ($x['issuer']['CN'] ?? '?');
        if ($i === 0) {
            $linhas[] = '     Uso: ' . ($x['extensions']['extendedKeyUsage'] ?? '(não informado)');
            $linhas[] = '     AC: ' . preg_replace('/\s+/', ' ', trim((string)($x['extensions']['authorityInfoAccess'] ?? '(não informado)')));
        }
    }
    $url = nfseUrl($nfseAmb, '/DFe/0?cnpjConsulta=' . rawurlencode($cnpj) . '&lote=true');
    $testes = [['sem certificado', null, false, false], ['certificado, padrão', $pem, false, false], ['certificado, HTTP/1.1', $pem, true, false], ['certificado, HTTP/1.1 e TLS 1.2', $pem, true, true]];
    $linhas[] = 'Conexão com ' . parse_url($url, PHP_URL_HOST) . ':';
    $detalhe = null;
    foreach ($testes as $t) {
        $log = fopen('php://temp', 'w+');
        $ini = microtime(true);
        $r = nfseCurl($url, $t[1], $t[2], $t[3], $log);
        $st = is_array($r['json']) ? ($r['json']['StatusProcessamento'] ?? '') : '';
        $linhas[] = '  ' . $t[0] . ': ' . ($r['errno'] ? 'erro ' . $r['errno'] . ' ' . $r['erro'] : 'HTTP ' . $r['http'] . ' ' . $st) . ' (' . round(microtime(true) - $ini, 1) . 's)';
        if ($t[1] && $r['errno'] && $detalhe === null) { rewind($log); $detalhe = (string) stream_get_contents($log); }
        fclose($log);
        usleep(1500000);
    }
    if ($detalhe) {
        $linhas[] = 'Detalhe da primeira falha:';
        foreach (array_slice(array_filter(explode("\n", $detalhe), function ($l) { return preg_match('/^\*.*(TLS|SSL|ALPN|Connected|certificate|issuer|subject|reset|Recv)/i', $l); }), -24) as $l) $linhas[] = '  ' . trim($l);
    }
    sai(200, ['linhas' => $linhas]);
}

if ($acao === 'nfsereiniciar') { // volta o NSU a zero; as notas já guardadas não duplicam porque a chave de acesso é única
    $cnpj = nfseCnpj($in['cnpj'] ?? '');
    nfseEstado($nfseAmb, $cnpj);
    nfseEstadoAtualiza($nfseAmb, $cnpj, ['ultimo_nsu' => 0, 'ultimo_erro' => null, 'tentativas' => 0]);
    sai(200, ['empresas' => nfseEmpresas($nfseAmb, $memDir)]);
}

function nfseChaves($v) {
    if ($v === null) return null;
    if (!is_array($v) || count($v) > 5000) sai(400, ['erro' => 'Seleção inválida.']);
    foreach ($v as $c) if (!is_string($c) || !preg_match('/^\d{50}$/', $c)) sai(400, ['erro' => 'Chave inválida.']);
    return $v;
}

if ($acao === 'nfsexmls') { // XML das notas escolhidas, para montar o DANFSe no navegador
    $cnpj = nfseCnpj($in['cnpj'] ?? ''); $chaves = nfseChaves($in['chaves'] ?? []);
    if (count($chaves) > 300) sai(400, ['erro' => 'Escolha até 300 notas por vez.']);
    $s = nfseDb()->prepare('SELECT chave, situacao, arquivo FROM notas WHERE ambiente = ? AND cnpj = ? AND chave = ?');
    $saida = [];
    foreach ($chaves as $c) {
        $s->execute([$nfseAmb, $cnpj, $c]); $n = $s->fetch(); if (!$n) continue;
        $xml = @file_get_contents(nfseDir() . '/' . $n['arquivo']);
        if ($xml !== false) $saida[] = ['chave' => $c, 'situacao' => $n['situacao'], 'xml' => $xml];
    }
    sai(200, ['notas' => $saida]);
}

if ($acao === 'nfsezip') {
    $cnpj = nfseCnpj($_GET['cnpj'] ?? ''); $comp = (string)($_GET['competencia'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}$/', $comp)) sai(400, ['erro' => 'Competência inválida.']);
    $selecao = nfseChaves($in['chaves'] ?? null);
    if (!class_exists('ZipArchive')) sai(500, ['erro' => 'O servidor não tem a extensão zip do PHP.']);
    $s = nfseDb()->prepare('SELECT chave, papel, arquivo FROM notas WHERE ambiente = ? AND cnpj = ? AND competencia = ?');
    $s->execute([$nfseAmb, $cnpj, $comp]);
    $notas = $s->fetchAll();
    if ($selecao !== null) $notas = array_values(array_filter($notas, function ($n) use ($selecao) { return in_array($n['chave'], $selecao, true); }));
    if (!$notas) sai(404, ['erro' => 'Nenhuma nota para baixar.']);
    $tmp = tempnam(sys_get_temp_dir(), 'nfsezip');
    $z = new ZipArchive();
    if ($z->open($tmp, ZipArchive::OVERWRITE) !== true) sai(500, ['erro' => 'Não foi possível montar o arquivo.']);
    $pastas = ['prestador' => 'prestadas', 'tomador' => 'tomadas', 'intermediario' => 'intermediadas', 'outro' => 'outras'];
    $ev = nfseDb()->prepare('SELECT id, arquivo FROM eventos WHERE ambiente = ? AND cnpj = ? AND chave = ?');
    foreach ($notas as $n) {
        $pasta = $pastas[$n['papel']] ?? 'outras';
        $z->addFile(nfseDir() . '/' . $n['arquivo'], "$pasta/{$n['chave']}.xml");
        $ev->execute([$nfseAmb, $cnpj, $n['chave']]);
        foreach ($ev->fetchAll() as $e) $z->addFile(nfseDir() . '/' . $e['arquivo'], "$pasta/eventos/{$n['chave']}-{$e['id']}.xml");
    }
    $z->close();
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="NFSe-' . $cnpj . '-' . $comp . '.zip"');
    header('Content-Length: ' . filesize($tmp));
    readfile($tmp); @unlink($tmp);
    exit;
}

sai(400, ['erro' => 'Ação desconhecida.']);
