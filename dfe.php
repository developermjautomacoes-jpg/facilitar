<?php
/*
 * Captura de NF-e e CT-e pelo Ambiente Nacional. Incluído pelo api.php, depois do nfse.php,
 * de quem reaproveita certificados, ambiente e leitura de XML; não responde sozinho.
 *
 * Fluxo: cada chamada de "dfecapturar" busca UM lote (até 50 documentos) de UM serviço de UMA empresa.
 * Quem repete é a tela ou o agendador. Notas e último NSU são gravados na mesma transação.
 *
 * Contrato:
 *   NT 2014.002 v1.40 (NFeDistribuicaoDFe) e NT 2015.002 (CTeDistribuicaoDFe).
 *   Sem novidade (cStat 137) ou com ultNSU = maxNSU, só se consulta de novo depois de 1 hora;
 *   antes disso a SEFAZ devolve 656 (consumo indevido) e bloqueia por 1 hora.
 *   Emitente não recebe a própria NF-e por aqui (rejeição 641): as emitidas e a NFC-e virão da SEFAZ-ES.
 *   O destinatário recebe só o resumo até registrar a manifestação; a ciência é opção por empresa.
 */
if (!defined('SENHA_ACESSO')) { http_response_code(403); exit; }

const DFE_SERVICOS = [
    'nfe' => ['producao' => 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx', 'restrita' => 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
        'portal' => 'http://www.portalfiscal.inf.br/nfe', 'operacao' => 'NFeDistribuicaoDFe', 'versao' => '1.01', 'metodo' => 'nfeDistDFeInteresse', 'dados' => 'nfeDadosMsg', 'acoes' => ['nfeDistDFeInteresse'], 'env' => 'DFE_URL_NFE'],
    'cte' => ['producao' => 'https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx', 'restrita' => 'https://hom1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx',
        'portal' => 'http://www.portalfiscal.inf.br/cte', 'operacao' => 'CTeDistribuicaoDFe', 'versao' => '1.00', 'metodo' => 'cteDistDFeInteresse', 'dados' => 'cteDadosMsg', 'acoes' => ['cteDistDFeInteresse', 'CTeDistribuicaoDFe'], 'env' => 'DFE_URL_CTE'],
];
const DFE_EVENTO_URL = ['producao' => 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx', 'restrita' => 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx'];
const DFE_CUF_ES = '32';          // primeira etapa: empresas do ES
const DFE_ORGAO_NACIONAL = '91';  // eventos de manifestação vão para o Ambiente Nacional
const DFE_ESPERA_S = 3660;        // 1 hora da NT, com folga
const DFE_HISTORICO = '-2 months';
const DFE_CIENCIA_LOTE = 20;      // limite de eventos por lote

function dfeDir() { return rtrim(getenv('DADOS_DIR') ?: (__DIR__ . '/dados'), '/') . '/dfe'; }
function dfeServico($v) { $v = (string) $v; if (!isset(DFE_SERVICOS[$v])) sai(400, ['erro' => 'Tipo de documento inválido.']); return $v; }
function dfeChaveValida($c) { return is_string($c) && preg_match('/^[0-9A-Z]{44}$/', $c); }

function dfeDb() {
    static $db = null;
    if ($db) return $db;
    $d = dfeDir();
    if (!is_dir($d)) { $old = umask(0077); mkdir($d, 0700, true); umask($old); }
    $db = new PDO('sqlite:' . $d . '/dfe.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=15000; PRAGMA foreign_keys=ON;');
    $db->exec("CREATE TABLE IF NOT EXISTS empresas (cnpj TEXT PRIMARY KEY, ciencia_auto INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS estado (ambiente TEXT, cnpj TEXT, servico TEXT, ultimo_nsu INTEGER DEFAULT 0, max_nsu INTEGER DEFAULT 0, proxima_em INTEGER DEFAULT 0,
            corte TEXT, ultima_captura TEXT, ultimo_erro TEXT, PRIMARY KEY (ambiente, cnpj, servico));
        CREATE TABLE IF NOT EXISTS docs (ambiente TEXT, cnpj TEXT, servico TEXT, chave TEXT, nsu INTEGER, conteudo TEXT, modelo TEXT, papel TEXT, numero TEXT, serie TEXT, emissao TEXT, competencia TEXT,
            emit_doc TEXT, emit_nome TEXT, dest_doc TEXT, dest_nome TEXT, tp_nf TEXT, v_total INTEGER, situacao TEXT DEFAULT 'normal', ciencia TEXT DEFAULT '', ciencia_em TEXT, ciencia_msg TEXT, arquivo TEXT,
            PRIMARY KEY (ambiente, cnpj, servico, chave));
        CREATE INDEX IF NOT EXISTS docs_comp ON docs (ambiente, cnpj, servico, competencia);
        CREATE INDEX IF NOT EXISTS docs_ciencia ON docs (ambiente, cnpj, ciencia);
        CREATE TABLE IF NOT EXISTS eventos (ambiente TEXT, cnpj TEXT, servico TEXT, chave TEXT, tipo TEXT, seq TEXT, nsu INTEGER, data TEXT, arquivo TEXT, PRIMARY KEY (ambiente, cnpj, servico, chave, tipo, seq));
        CREATE TABLE IF NOT EXISTS emissao (cnpj TEXT, modelo TEXT, serie TEXT, numero TEXT, emissao TEXT, chave TEXT, arquivo TEXT, importado_em TEXT, PRIMARY KEY (cnpj, modelo, serie));
        CREATE TABLE IF NOT EXISTS falhas (ambiente TEXT, cnpj TEXT, servico TEXT, nsu INTEGER, motivo TEXT, em TEXT, PRIMARY KEY (ambiente, cnpj, servico, nsu));");
    // Captura noturna só por escolha: outro sistema no mesmo CNPJ disputa a sequência de NSU da SEFAZ.
    if (!in_array('captura_auto', array_column($db->query('PRAGMA table_info(empresas)')->fetchAll(), 'name'), true)) $db->exec('ALTER TABLE empresas ADD COLUMN captura_auto INTEGER DEFAULT 0');
    return $db;
}
function dfeEstado($amb, $cnpj, $serv) {
    $db = dfeDb();
    $db->prepare('INSERT OR IGNORE INTO estado (ambiente, cnpj, servico, corte) VALUES (?, ?, ?, ?)')->execute([$amb, $cnpj, $serv, date('Y-m-d', strtotime(DFE_HISTORICO))]);
    $s = $db->prepare('SELECT * FROM estado WHERE ambiente = ? AND cnpj = ? AND servico = ?'); $s->execute([$amb, $cnpj, $serv]);
    return $s->fetch();
}
function dfeEstadoAtualiza($amb, $cnpj, $serv, $campos) {
    $sets = implode(', ', array_map(function ($k) { return "$k = ?"; }, array_keys($campos)));
    dfeDb()->prepare("UPDATE estado SET $sets WHERE ambiente = ? AND cnpj = ? AND servico = ?")->execute(array_merge(array_values($campos), [$amb, $cnpj, $serv]));
}
function dfeCienciaAuto($cnpj) {
    $s = dfeDb()->prepare('SELECT ciencia_auto FROM empresas WHERE cnpj = ?'); $s->execute([$cnpj]);
    return (bool) $s->fetchColumn();
}
/** Web service exige e-CNPJ da mesma raiz; procuração da NFS-e não vale aqui. */
function dfeCert($cnpj, &$erro) {
    $s = nfseDb()->prepare('SELECT cert_id FROM empresas WHERE cnpj = ?'); $s->execute([$cnpj]);
    $c = nfseCertDe($cnpj, (string) $s->fetchColumn());
    if (!$c) { $erro = 'Nenhum e-CNPJ com a mesma raiz desse CNPJ. Importe o certificado em Configurações.'; return null; }
    return $c;
}

// ---------- comunicação SOAP ----------
function dfeCurl($url, $acao, $corpo, $pem, $verificar) {
    $ch = curl_init($url);
    $op = [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $corpo, CURLOPT_TIMEOUT => 90, CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_ENCODING => '',
        CURLOPT_HTTPHEADER => ['Content-Type: application/soap+xml;charset=utf-8;action="' . $acao . '"'],
        CURLOPT_SSLCERT => $pem, CURLOPT_SSLKEY => $pem, CURLOPT_SSL_VERIFYPEER => $verificar, CURLOPT_SSL_VERIFYHOST => $verificar ? 2 : 0];
    if (getenv('DFE_CA')) $op[CURLOPT_CAINFO] = getenv('DFE_CA');
    curl_setopt_array($ch, $op);
    $b = curl_exec($ch);
    $r = ['corpo' => (string) $b, 'errno' => curl_errno($ch), 'erro' => curl_error($ch), 'http' => (int) curl_getinfo($ch, CURLINFO_HTTP_CODE)];
    curl_close($ch);
    return $r;
}
/** Tenta as ações SOAP em ordem. Sem a cadeia ICP-Brasil no servidor, repete sem verificar, como a consulta de IE; DFE_CA evita esse caminho. */
function dfePost($url, $acoes, $corpo, $pem, $retorno) {
    $envelope = '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>' . $corpo . '</soap12:Body></soap12:Envelope>';
    $verificar = true; $r = null;
    foreach ($acoes as $acao) {
        $r = dfeCurl($url, $acao, $envelope, $pem, $verificar);
        if ($r['errno'] === 60 || $r['errno'] === 77) { $verificar = false; $r = dfeCurl($url, $acao, $envelope, $pem, false); }
        if ($r['errno'] || strpos($r['corpo'], $retorno) !== false) break;
    }
    return $r;
}
function dfeRetorno($r, $nome) {
    if ($r['errno']) return ['erro' => 'Falha de comunicação com a SEFAZ: ' . $r['erro']];
    $d = nfseDom($r['corpo']);
    $x = $d ? (new DOMXPath($d))->query("//*[local-name()='$nome']")->item(0) : null;
    if (!$x) return ['erro' => 'Resposta inesperada da SEFAZ (HTTP ' . $r['http'] . ').'];
    return ['no' => $x, 'xp' => new DOMXPath($d)];
}

// ---------- leitura dos XML ----------
function dfeTexto($xp, $ctx, $caminho) { $n = $xp->query(nfseCaminho($caminho), $ctx)->item(0); return $n ? trim($n->textContent) : ''; }
function dfeDoc($xp, $ctx, $g) {
    foreach (['CNPJ', 'CPF', 'idEstrangeiro'] as $k) { $v = dfeTexto($xp, $ctx, $g === '' ? $k : "$g/$k"); if ($v !== '') return $v; }
    return '';
}
function dfeBusca($xp, $nome) { return $xp->query("//*[local-name()='$nome']")->item(0); }
/** Número e série não vêm no resumo: saem da chave (cUF 2, AAMM 4, CNPJ 14, mod 2, série 3, número 9). */
function dfePelaChave($chave) { return ['modelo' => substr($chave, 20, 2), 'serie' => ltrim(substr($chave, 22, 3), '0') ?: '0', 'numero' => ltrim(substr($chave, 25, 9), '0')]; }

function dfeLerResumoNfe($xp, $raiz, $cnpj) {
    $chave = dfeTexto($xp, $raiz, 'chNFe');
    $sit = ['1' => 'normal', '2' => 'denegada', '3' => 'cancelada'][dfeTexto($xp, $raiz, 'cSitNFe')] ?? 'normal';
    return dfePelaChave($chave) + ['chave' => $chave, 'conteudo' => 'resumo', 'papel' => 'destinatario', 'emissao' => dfeTexto($xp, $raiz, 'dhEmi'), 'emit_doc' => dfeDoc($xp, $raiz, ''), 'emit_nome' => dfeTexto($xp, $raiz, 'xNome'),
        'dest_doc' => $cnpj, 'dest_nome' => '', 'tp_nf' => dfeTexto($xp, $raiz, 'tpNF'), 'v_total' => nfseCentavos(dfeTexto($xp, $raiz, 'vNF')), 'situacao' => $sit];
}
function dfeLerNfe($xp, $cnpj) {
    $inf = dfeBusca($xp, 'infNFe'); if (!$inf) return null;
    $chave = preg_replace('/^NFe/', '', (string) $inf->getAttribute('Id'));
    $emit = dfeDoc($xp, $inf, 'emit'); $dest = dfeDoc($xp, $inf, 'dest'); $transp = dfeDoc($xp, $inf, 'transp/transporta');
    $papel = $emit === $cnpj ? 'emitente' : ($dest === $cnpj ? 'destinatario' : ($transp === $cnpj ? 'transportador' : 'terceiro'));
    $prot = dfeBusca($xp, 'infProt'); $cstat = $prot ? dfeTexto($xp, $prot, 'cStat') : '';
    return dfePelaChave($chave) + ['chave' => $chave, 'conteudo' => 'completa', 'papel' => $papel, 'emissao' => dfeTexto($xp, $inf, 'ide/dhEmi') ?: dfeTexto($xp, $inf, 'ide/dEmi'),
        'emit_doc' => $emit, 'emit_nome' => dfeTexto($xp, $inf, 'emit/xNome'), 'dest_doc' => $dest, 'dest_nome' => dfeTexto($xp, $inf, 'dest/xNome'), 'tp_nf' => dfeTexto($xp, $inf, 'ide/tpNF'),
        'v_total' => nfseCentavos(dfeTexto($xp, $inf, 'total/ICMSTot/vNF')), 'situacao' => in_array($cstat, ['110', '301', '302', '303'], true) ? 'denegada' : (in_array($cstat, ['101', '151', '155'], true) ? 'cancelada' : 'normal')];
}
function dfeLerCte($xp, $cnpj) {
    $inf = dfeBusca($xp, 'infCte') ?: dfeBusca($xp, 'infCTe'); if (!$inf) return null;
    $chave = preg_replace('/^CTe/', '', (string) $inf->getAttribute('Id'));
    $partes = ['remetente' => dfeDoc($xp, $inf, 'rem'), 'expedidor' => dfeDoc($xp, $inf, 'exped'), 'recebedor' => dfeDoc($xp, $inf, 'receb'), 'destinatario' => dfeDoc($xp, $inf, 'dest')];
    $toma = dfeTexto($xp, $inf, 'ide/toma3/toma') ?: dfeTexto($xp, $inf, 'ide/toma4/toma');
    $tomador = ['0' => 'remetente', '1' => 'expedidor', '2' => 'recebedor', '3' => 'destinatario'][$toma] ?? '';
    $docToma = $tomador !== '' ? $partes[$tomador] : (dfeDoc($xp, $inf, 'ide/toma4') ?: dfeDoc($xp, $inf, 'toma'));
    $emit = dfeDoc($xp, $inf, 'emit');
    $papel = $emit === $cnpj ? 'emitente' : ($docToma === $cnpj ? 'tomador' : 'terceiro');
    if ($papel === 'terceiro') foreach ($partes as $p => $doc) if ($doc === $cnpj) { $papel = $p; break; }
    $prot = dfeBusca($xp, 'infProt'); $cstat = $prot ? dfeTexto($xp, $prot, 'cStat') : '';
    return dfePelaChave($chave) + ['chave' => $chave, 'conteudo' => 'completa', 'papel' => $papel, 'emissao' => dfeTexto($xp, $inf, 'ide/dhEmi'), 'emit_doc' => $emit, 'emit_nome' => dfeTexto($xp, $inf, 'emit/xNome'),
        'dest_doc' => $docToma, 'dest_nome' => dfeTexto($xp, $inf, 'dest/xNome'), 'tp_nf' => '', 'v_total' => nfseCentavos(dfeTexto($xp, $inf, 'vPrest/vTPrest')),
        'situacao' => in_array($cstat, ['101', '135'], true) ? 'cancelada' : (in_array($cstat, ['110', '301', '302', '303'], true) ? 'denegada' : 'normal')];
}
function dfeGravaArquivo($relativo, $conteudo) {
    $f = dfeDir() . '/' . $relativo; $d = dirname($f);
    if (!is_dir($d) && !mkdir($d, 0700, true) && !is_dir($d)) return false;
    $tmp = $f . '.tmp';
    return file_put_contents($tmp, $conteudo) !== false && rename($tmp, $f);
}
/** Devolve 'nova', 'repetida', 'antiga' (antes do corte de histórico) ou o motivo da falha. */
function dfeGravaDoc($amb, $cnpj, $serv, $nsu, $n, $xml, $corte, $cienciaAuto) {
    if (!dfeChaveValida($n['chave'])) return 'Documento sem chave de acesso válida.';
    $comp = substr($n['emissao'], 0, 7);
    if (!preg_match('/^\d{4}-\d{2}$/', $comp)) return 'Documento sem data de emissão.';
    if (substr($n['emissao'], 0, 10) < $corte) return 'antiga';
    $db = dfeDb();
    $s = $db->prepare('SELECT conteudo, ciencia FROM docs WHERE ambiente = ? AND cnpj = ? AND servico = ? AND chave = ?'); $s->execute([$amb, $cnpj, $serv, $n['chave']]);
    $ja = $s->fetch();
    if ($ja && $ja['conteudo'] === 'completa' && $n['conteudo'] === 'resumo') return 'repetida';
    $arquivo = "$amb/$cnpj/$serv/$comp/{$n['chave']}.xml";
    if (!dfeGravaArquivo($arquivo, $xml)) return 'Não foi possível gravar o XML no servidor.';
    $ciencia = $ja ? $ja['ciencia'] : '';
    if ($n['conteudo'] === 'completa') { if ($ciencia === 'pendente') $ciencia = ''; }
    elseif (!$ja && $cienciaAuto && $n['situacao'] === 'normal') $ciencia = 'pendente';
    $campos = ['ambiente' => $amb, 'cnpj' => $cnpj, 'servico' => $serv, 'chave' => $n['chave'], 'nsu' => $nsu, 'competencia' => $comp, 'ciencia' => $ciencia, 'arquivo' => $arquivo] + $n;
    $novos = array_diff(array_keys($campos), ['ambiente', 'cnpj', 'servico', 'chave']);
    $db->prepare('INSERT INTO docs (' . implode(', ', array_keys($campos)) . ') VALUES (' . rtrim(str_repeat('?, ', count($campos)), ', ') . ') ON CONFLICT (ambiente, cnpj, servico, chave) DO UPDATE SET '
        . implode(', ', array_map(function ($k) { return "$k = excluded.$k"; }, $novos)))->execute(array_values($campos));
    dfeAtualizaSituacao($amb, $cnpj, $serv, $n['chave']);
    return $ja && $ja['conteudo'] === $n['conteudo'] ? 'repetida' : 'nova';
}
function dfeGravaEvento($amb, $cnpj, $serv, $nsu, $xp, $raizNome, $xml) {
    $inf = dfeBusca($xp, $raizNome === 'resEvento' ? 'resEvento' : 'infEvento');
    if (!$inf) return 'Evento ilegível.';
    $chave = dfeTexto($xp, $inf, 'chNFe') ?: dfeTexto($xp, $inf, 'chCTe');
    $tipo = dfeTexto($xp, $inf, 'tpEvento'); $seq = dfeTexto($xp, $inf, 'nSeqEvento') ?: '1';
    if (!dfeChaveValida($chave) || $tipo === '') return 'Evento sem chave de acesso.';
    $arquivo = "$amb/$cnpj/$serv/eventos/$chave-$tipo-$seq.xml";
    if (!dfeGravaArquivo($arquivo, $xml)) return 'Não foi possível gravar o evento no servidor.';
    dfeDb()->prepare('INSERT OR REPLACE INTO eventos (ambiente, cnpj, servico, chave, tipo, seq, nsu, data, arquivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$amb, $cnpj, $serv, $chave, $tipo, $seq, $nsu, dfeTexto($xp, $inf, 'dhEvento'), $arquivo]);
    dfeAtualizaSituacao($amb, $cnpj, $serv, $chave);
    return 'nova';
}
/** O cancelamento pode chegar antes da própria nota; 110111 e 110112 são cancelamento e cancelamento por substituição. */
function dfeAtualizaSituacao($amb, $cnpj, $serv, $chave) {
    $s = dfeDb()->prepare("SELECT 1 FROM eventos WHERE ambiente = ? AND cnpj = ? AND servico = ? AND chave = ? AND tipo IN ('110111', '110112')"); $s->execute([$amb, $cnpj, $serv, $chave]);
    if ($s->fetchColumn()) dfeDb()->prepare("UPDATE docs SET situacao = 'cancelada', ciencia = CASE WHEN ciencia = 'pendente' THEN '' ELSE ciencia END WHERE ambiente = ? AND cnpj = ? AND servico = ? AND chave = ?")->execute([$amb, $cnpj, $serv, $chave]);
}
function dfeProcessa($amb, $cnpj, $serv, $nsu, $xml, $corte, $auto, &$cont) {
    $d = nfseDom($xml); if (!$d) return 'XML ilegível.';
    $xp = new DOMXPath($d); $raiz = $d->documentElement; $nome = $raiz->localName;
    if ($nome === 'procEventoNFe' || $nome === 'procEventoCTe' || $nome === 'resEvento') {
        $m = dfeGravaEvento($amb, $cnpj, $serv, $nsu, $xp, $nome, $xml);
        if ($m === 'nova') { $cont['eventos']++; return ''; }
        return $m;
    }
    if ($nome === 'resNFe') $n = dfeLerResumoNfe($xp, $raiz, $cnpj);
    elseif ($nome === 'nfeProc') $n = dfeLerNfe($xp, $cnpj);
    elseif (in_array($nome, ['cteProc', 'cteOSProc', 'GTVeProc'], true)) $n = dfeLerCte($xp, $cnpj);
    else { $cont['ignorados']++; return ''; }
    if (!$n) return 'XML do documento ilegível.';
    $m = dfeGravaDoc($amb, $cnpj, $serv, $nsu, $n, $xml, $corte, $auto);
    if ($m === 'nova') { $cont['notas']++; return ''; }
    if ($m === 'repetida') { $cont['repetidas']++; return ''; }
    if ($m === 'antiga') { $cont['ignorados']++; return ''; }
    return $m;
}

// ---------- ciência da operação (evento 210210, assinado com o certificado da empresa) ----------
function dfeC14n($no) { return $no->C14N(false, false); }
function dfeAssinaEvento($eventoXml, $id, $pkey, $certPem) {
    $d = new DOMDocument(); $d->preserveWhiteSpace = false; $d->loadXML($eventoXml);
    $inf = $d->getElementsByTagName('infEvento')->item(0);
    $digest = base64_encode(sha1(dfeC14n($inf), true));
    $ds = 'http://www.w3.org/2000/09/xmldsig#';
    $sf = '<SignedInfo xmlns="' . $ds . '"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="' . $ds . 'rsa-sha1"/><Reference URI="#' . $id . '"><Transforms><Transform Algorithm="' . $ds . 'enveloped-signature"/><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms><DigestMethod Algorithm="' . $ds . 'sha1"/><DigestValue>' . $digest . '</DigestValue></Reference></SignedInfo>';
    $ds2 = new DOMDocument(); $ds2->loadXML($sf);
    $assinatura = '';
    if (!openssl_sign(dfeC14n($ds2->documentElement), $assinatura, $pkey, OPENSSL_ALGO_SHA1)) return null;
    $cert = preg_replace('/-----[A-Z ]+-----|\s+/', '', $certPem);
    $sig = new DOMDocument();
    $sig->loadXML('<Signature xmlns="' . $ds . '">' . $sf . '<SignatureValue>' . base64_encode($assinatura) . '</SignatureValue><KeyInfo><X509Data><X509Certificate>' . $cert . '</X509Certificate></X509Data></KeyInfo></Signature>');
    $d->documentElement->appendChild($d->importNode($sig->documentElement, true));
    return $d->saveXML($d->documentElement);
}
function dfeEventoCiencia($amb, $cnpj, $chave, $pkey, $certPem) {
    $id = 'ID210210' . $chave . '01';
    $xml = '<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><infEvento Id="' . $id . '"><cOrgao>' . DFE_ORGAO_NACIONAL . '</cOrgao><tpAmb>' . ($amb === 'producao' ? '1' : '2') . '</tpAmb><CNPJ>' . $cnpj . '</CNPJ><chNFe>' . $chave . '</chNFe><dhEvento>' . date('Y-m-d\TH:i:sP') . '</dhEvento><tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento></infEvento></evento>';
    return dfeAssinaEvento($xml, $id, $pkey, $certPem);
}

// ---------- empresas ----------
function dfeEmpresas($amb, $memDir) {
    $cfg = []; $auto = []; foreach (dfeDb()->query('SELECT * FROM empresas') as $r) { $cfg[$r['cnpj']] = (bool) $r['ciencia_auto']; $auto[$r['cnpj']] = (bool) $r['captura_auto']; }
    $tot = [];
    $s = dfeDb()->prepare("SELECT cnpj, servico, COUNT(*) n, SUM(conteudo = 'resumo') resumos, SUM(ciencia = 'pendente') pendentes FROM docs WHERE ambiente = ? GROUP BY cnpj, servico"); $s->execute([$amb]);
    foreach ($s as $r) $tot[$r['cnpj']][$r['servico']] = $r;
    $fal = [];
    $s = dfeDb()->prepare('SELECT cnpj, COUNT(*) n FROM falhas WHERE ambiente = ? GROUP BY cnpj'); $s->execute([$amb]);
    foreach ($s as $r) $fal[$r['cnpj']] = (int) $r['n'];
    $s = dfeDb()->prepare('SELECT * FROM estado WHERE ambiente = ?'); $s->execute([$amb]);
    $ests = []; foreach ($s as $r) $ests[$r['cnpj']][$r['servico']] = $r;
    $saida = [];
    foreach (nfseEmpresas($amb, $memDir) as $e) {
        $cert = nfseCertDe($e['cnpj'], $e['certId']);
        $linha = ['cnpj' => $e['cnpj'], 'razao' => $e['razao'], 'certificado' => nfseProcuradorDados($cert), 'cienciaAuto' => $cfg[$e['cnpj']] ?? false, 'capturaAuto' => $auto[$e['cnpj']] ?? false, 'falhas' => $fal[$e['cnpj']] ?? 0];
        foreach (['nfe', 'cte'] as $sv) {
            $st = $ests[$e['cnpj']][$sv] ?? []; $t = $tot[$e['cnpj']][$sv] ?? [];
            $linha[$sv] = ['ultimoNsu' => (int)($st['ultimo_nsu'] ?? 0), 'maxNsu' => (int)($st['max_nsu'] ?? 0), 'proximaEm' => (int)($st['proxima_em'] ?? 0), 'ultimaCaptura' => $st['ultima_captura'] ?? null, 'ultimoErro' => $st['ultimo_erro'] ?? null,
                'documentos' => (int)($t['n'] ?? 0), 'resumos' => (int)($t['resumos'] ?? 0), 'pendentes' => (int)($t['pendentes'] ?? 0)];
        }
        $saida[] = $linha;
    }
    return $saida;
}

/** Lê do XML de uma nota emitida o que identifica a sequência: modelo, série e número. */
function dfeLerEmissao($xml) {
    $d = nfseDom($xml); if (!$d) return null;
    $xp = new DOMXPath($d);
    $inf = dfeBusca($xp, 'infNFe');
    if ($inf) { $chave = preg_replace('/^NFe/', '', (string) $inf->getAttribute('Id')); $numero = dfeTexto($xp, $inf, 'ide/nNF'); $data = dfeTexto($xp, $inf, 'ide/dhEmi') ?: dfeTexto($xp, $inf, 'ide/dEmi'); }
    else {
        $inf = dfeBusca($xp, 'infCte'); if (!$inf) return null;
        $chave = preg_replace('/^CTe/', '', (string) $inf->getAttribute('Id')); $numero = dfeTexto($xp, $inf, 'ide/nCT'); $data = dfeTexto($xp, $inf, 'ide/dhEmi');
    }
    $n = ['cnpj' => dfeDoc($xp, $inf, 'emit'), 'modelo' => dfeTexto($xp, $inf, 'ide/mod'), 'serie' => dfeTexto($xp, $inf, 'ide/serie'), 'numero' => $numero, 'emissao' => $data, 'chave' => $chave];
    return in_array($n['modelo'], ['55', '65', '57', '67'], true) && $n['serie'] !== '' && $n['numero'] !== '' ? $n : null;
}

// ---------- ações ----------
if ($acao === 'dfeemissao') sai(200, ['emissoes' => array_values(array_filter(dfeDb()->query('SELECT cnpj, modelo, serie, numero, emissao, chave, arquivo, importado_em FROM emissao ORDER BY cnpj, modelo, serie')->fetchAll(), function ($e) { return !authCnpjOculto($e['cnpj']); }))]);

if ($acao === 'dfeemissaoimportar') { // emitente, modelo, série e número vêm do XML; repetir a série substitui a referência
    $cnpj = nfseCnpj($in['cnpj'] ?? ''); $xml = (string)($in['xml'] ?? ''); $nome = mb_substr(basename((string)($in['arquivo'] ?? '')), 0, 120);
    if ($xml === '' || strlen($xml) > 3000000) sai(400, ['erro' => 'Arquivo XML inválido.']);
    $n = dfeLerEmissao($xml);
    if (!$n) sai(400, ['erro' => "$nome: não é o XML de uma NF-e, NFC-e ou CT-e."]);
    if ($n['cnpj'] !== $cnpj) sai(400, ['erro' => "$nome: o emitente deste XML é " . $n['cnpj'] . ', não a empresa escolhida.']);
    dfeDb()->prepare('INSERT OR REPLACE INTO emissao (cnpj, modelo, serie, numero, emissao, chave, arquivo, importado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$cnpj, $n['modelo'], $n['serie'], $n['numero'], $n['emissao'], $n['chave'], $nome, date('c')]);
    sai(200, ['ok' => true] + $n);
}

if ($acao === 'dfeemissaoexcluir') {
    dfeDb()->prepare('DELETE FROM emissao WHERE cnpj = ? AND modelo = ? AND serie = ?')->execute([nfseCnpj($in['cnpj'] ?? ''), (string)($in['modelo'] ?? ''), (string)($in['serie'] ?? '')]);
    sai(200, ['ok' => true]);
}

if ($acao === 'dfeempresas') sai(200, ['empresas' => dfeEmpresas($nfseAmb, $memDir)]);

if ($acao === 'dfeciencia_config') {
    $cnpj = nfseCnpj($in['cnpj'] ?? '');
    dfeDb()->prepare('INSERT INTO empresas (cnpj, ciencia_auto) VALUES (?, ?) ON CONFLICT (cnpj) DO UPDATE SET ciencia_auto = excluded.ciencia_auto')->execute([$cnpj, empty($in['ativo']) ? 0 : 1]);
    sai(200, ['empresas' => dfeEmpresas($nfseAmb, $memDir)]);
}

if ($acao === 'dfecaptura_config') {
    $cnpj = nfseCnpj($in['cnpj'] ?? '');
    dfeDb()->prepare('INSERT INTO empresas (cnpj, captura_auto) VALUES (?, ?) ON CONFLICT (cnpj) DO UPDATE SET captura_auto = excluded.captura_auto')->execute([$cnpj, empty($in['ativo']) ? 0 : 1]);
    sai(200, ['empresas' => dfeEmpresas($nfseAmb, $memDir)]);
}

if ($acao === 'dfecapturar') {
    $cnpj = nfseCnpj($in['cnpj'] ?? ''); $serv = dfeServico($in['servico'] ?? '');
    dfeDb();
    $trava = fopen(dfeDir() . '/captura.lock', 'c');
    if (!$trava || !flock($trava, LOCK_EX | LOCK_NB)) sai(200, ['status' => 'aguardar', 'segundos' => 5, 'mensagem' => 'Outra captura está em andamento.']);
    $st = dfeEstado($nfseAmb, $cnpj, $serv);
    $resta = (int) $st['proxima_em'] - time();
    if ($resta > 0) sai(200, ['status' => 'aguardar', 'segundos' => $resta, 'mensagem' => 'A SEFAZ só permite nova consulta depois de 1 hora.']);
    $falha = function ($msg) use ($nfseAmb, $cnpj, $serv) { dfeEstadoAtualiza($nfseAmb, $cnpj, $serv, ['ultimo_erro' => $msg]); sai(200, ['status' => 'erro', 'mensagem' => $msg]); };
    $erro = ''; $cert = dfeCert($cnpj, $erro); if (!$cert) $falha($erro);
    $pem = nfsePem($cert['id'], $erro); if (!$pem) $falha($erro);

    $w = DFE_SERVICOS[$serv]; $nsu = (int) $st['ultimo_nsu'];
    $ns = $w['portal'] . '/wsdl/' . $w['operacao'];
    $pedido = '<distDFeInt xmlns="' . $w['portal'] . '" versao="' . $w['versao'] . '"><tpAmb>' . ($nfseAmb === 'producao' ? '1' : '2') . '</tpAmb><cUFAutor>' . DFE_CUF_ES . '</cUFAutor><CNPJ>' . $cnpj . '</CNPJ><distNSU><ultNSU>' . str_pad((string) $nsu, 15, '0', STR_PAD_LEFT) . '</ultNSU></distNSU></distDFeInt>';
    $corpo = '<' . $w['metodo'] . ' xmlns="' . $ns . '"><' . $w['dados'] . '>' . $pedido . '</' . $w['dados'] . '></' . $w['metodo'] . '>';
    $url = getenv($w['env']) ?: $w[$nfseAmb];
    $r = dfePost($url, array_map(function ($a) use ($ns) { return "$ns/$a"; }, $w['acoes']), $corpo, $pem, 'retDistDFeInt');
    $ret = dfeRetorno($r, 'retDistDFeInt');
    if (isset($ret['erro'])) $falha($ret['erro']);
    $xp = $ret['xp']; $no = $ret['no'];
    $cstat = dfeTexto($xp, $no, 'cStat'); $motivo = dfeTexto($xp, $no, 'xMotivo');
    $ult = (int) dfeTexto($xp, $no, 'ultNSU'); $max = (int) dfeTexto($xp, $no, 'maxNSU');
    $agora = date('c');
    if ($cstat === '656') {
        // A 656 devolve o último NSU já consultado para o CNPJ (NT 2014.002, desde a v1.14): a captura segue dele.
        $aviso = "656 $motivo";
        $campos = ['proxima_em' => time() + DFE_ESPERA_S];
        if ($ult > 0 && $ult !== $nsu) {
            $campos['ultimo_nsu'] = $ult;
            $aviso = "Outro sistema ou consulta já usou este CNPJ até o NSU $ult. A captura continua a partir dele; o que veio antes só pode ser obtido naquele sistema.";
        }
        dfeEstadoAtualiza($nfseAmb, $cnpj, $serv, $campos + ['ultimo_erro' => $aviso]);
        sai(200, ['status' => 'aguardar', 'segundos' => DFE_ESPERA_S, 'mensagem' => 'A SEFAZ bloqueou a consulta por 1 hora (consumo indevido).']);
    }
    if ($cstat === '137') {
        dfeEstadoAtualiza($nfseAmb, $cnpj, $serv, ['ultimo_nsu' => max($nsu, $ult), 'max_nsu' => $max, 'proxima_em' => time() + DFE_ESPERA_S, 'ultima_captura' => $agora, 'ultimo_erro' => null]);
        sai(200, ['status' => 'fim', 'ultimoNsu' => max($nsu, $ult), 'notas' => 0, 'eventos' => 0, 'ignorados' => 0, 'falhas' => 0]);
    }
    if ($cstat !== '138') $falha("SEFAZ $cstat: $motivo");

    $cont = ['notas' => 0, 'repetidas' => 0, 'eventos' => 0, 'ignorados' => 0, 'falhas' => 0];
    $auto = $serv === 'nfe' && dfeCienciaAuto($cnpj);
    $db = dfeDb();
    $db->exec('BEGIN IMMEDIATE');
    try {
        foreach ($xp->query(".//*[local-name()='docZip']", $no) as $z) {
            $n = (int) $z->getAttribute('NSU');
            $xml = nfseDescompacta(trim($z->textContent));
            $m = $xml === null ? 'Arquivo XML corrompido.' : dfeProcessa($nfseAmb, $cnpj, $serv, $n, $xml, (string) $st['corte'], $auto, $cont);
            if ($m !== '') {
                $cont['falhas']++;
                $db->prepare('INSERT OR REPLACE INTO falhas (ambiente, cnpj, servico, nsu, motivo, em) VALUES (?, ?, ?, ?, ?, ?)')->execute([$nfseAmb, $cnpj, $serv, $n, $m, $agora]);
            } else $db->prepare('DELETE FROM falhas WHERE ambiente = ? AND cnpj = ? AND servico = ? AND nsu = ?')->execute([$nfseAmb, $cnpj, $serv, $n]);
        }
        $fim = $ult >= $max;
        dfeEstadoAtualiza($nfseAmb, $cnpj, $serv, ['ultimo_nsu' => $ult, 'max_nsu' => $max, 'proxima_em' => $fim ? time() + DFE_ESPERA_S : 0, 'ultima_captura' => $agora, 'ultimo_erro' => null]);
        $db->exec('COMMIT');
    } catch (Throwable $e) {
        $db->exec('ROLLBACK');
        $falha('Erro ao gravar o lote; nada foi perdido, a captura retoma do mesmo ponto.');
    }
    sai(200, ['status' => $fim ? 'fim' : 'lote', 'ultimoNsu' => $ult] + $cont);
}

// Envia até 20 ciências pendentes da empresa. O XML completo chega numa captura seguinte.
if ($acao === 'dfecienciaenviar') {
    $cnpj = nfseCnpj($in['cnpj'] ?? '');
    $s = dfeDb()->prepare("SELECT chave FROM docs WHERE ambiente = ? AND cnpj = ? AND servico = 'nfe' AND ciencia = 'pendente' ORDER BY nsu LIMIT " . DFE_CIENCIA_LOTE);
    $s->execute([$nfseAmb, $cnpj]); $chaves = $s->fetchAll(PDO::FETCH_COLUMN);
    if (!$chaves) sai(200, ['status' => 'ok', 'enviadas' => 0, 'erros' => 0, 'restantes' => 0]);
    $erro = ''; $cert = dfeCert($cnpj, $erro); if (!$cert) sai(200, ['status' => 'erro', 'mensagem' => $erro]);
    $pem = nfsePem($cert['id'], $erro); if (!$pem) sai(200, ['status' => 'erro', 'mensagem' => $erro]);
    $f = certFonte($cert['id'], $erro); if (!$f) sai(200, ['status' => 'erro', 'mensagem' => $erro]);
    $c = []; if (!openssl_pkcs12_read($f[0], $c, $f[1])) sai(200, ['status' => 'erro', 'mensagem' => 'Não foi possível abrir o certificado.']);
    $eventos = '';
    foreach ($chaves as $ch) {
        $e = dfeEventoCiencia($nfseAmb, $cnpj, $ch, $c['pkey'], $c['cert']);
        if (!$e) sai(200, ['status' => 'erro', 'mensagem' => 'Não foi possível assinar a ciência com esse certificado.']);
        $eventos .= $e;
    }
    $ns = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4';
    $lote = substr(str_replace('.', '', sprintf('%.6F', microtime(true))), -15);
    $corpo = '<nfeDadosMsg xmlns="' . $ns . '"><envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>' . $lote . '</idLote>' . $eventos . '</envEvento></nfeDadosMsg>';
    $r = dfePost(getenv('DFE_URL_EVENTO') ?: DFE_EVENTO_URL[$nfseAmb], ["$ns/nfeRecepcaoEvento", "$ns/nfeRecepcaoEventoNF"], $corpo, $pem, 'retEnvEvento');
    $ret = dfeRetorno($r, 'retEnvEvento');
    if (isset($ret['erro'])) sai(200, ['status' => 'erro', 'mensagem' => $ret['erro']]);
    $xp = $ret['xp']; $no = $ret['no'];
    $cst = dfeTexto($xp, $no, 'cStat');
    if ($cst !== '128') sai(200, ['status' => 'erro', 'mensagem' => "SEFAZ $cst: " . dfeTexto($xp, $no, 'xMotivo')]);
    $ok = 0; $ruins = 0; $agora = date('c');
    $up = dfeDb()->prepare("UPDATE docs SET ciencia = ?, ciencia_em = ?, ciencia_msg = ? WHERE ambiente = ? AND cnpj = ? AND servico = 'nfe' AND chave = ?");
    foreach ($xp->query(".//*[local-name()='retEvento']/*[local-name()='infEvento']", $no) as $i) {
        $ch = dfeTexto($xp, $i, 'chNFe'); $st = dfeTexto($xp, $i, 'cStat'); $mot = dfeTexto($xp, $i, 'xMotivo');
        if (!in_array($ch, $chaves, true)) continue;
        $bom = in_array($st, ['135', '136', '573'], true); // 573: a ciência já estava registrada
        $up->execute([$bom ? 'enviada' : 'erro', $agora, $bom ? '' : "$st $mot", $nfseAmb, $cnpj, $ch]);
        if ($bom) $ok++; else $ruins++;
    }
    $s = dfeDb()->prepare("SELECT COUNT(*) FROM docs WHERE ambiente = ? AND cnpj = ? AND servico = 'nfe' AND ciencia = 'pendente'"); $s->execute([$nfseAmb, $cnpj]);
    sai(200, ['status' => 'ok', 'enviadas' => $ok, 'erros' => $ruins, 'restantes' => (int) $s->fetchColumn()]);
}

function dfeChaves($v) {
    if ($v === null) return null;
    if (!is_array($v) || count($v) > 5000) sai(400, ['erro' => 'Seleção inválida.']);
    foreach ($v as $c) if (!dfeChaveValida($c)) sai(400, ['erro' => 'Chave inválida.']);
    return $v;
}

if ($acao === 'dfecienciamarcar') { // ciência pedida na tela, nota a nota
    $cnpj = nfseCnpj($in['cnpj'] ?? '');
    $up = dfeDb()->prepare("UPDATE docs SET ciencia = 'pendente', ciencia_msg = '' WHERE ambiente = ? AND cnpj = ? AND servico = 'nfe' AND chave = ? AND conteudo = 'resumo' AND situacao = 'normal' AND ciencia <> 'enviada'");
    $n = 0;
    foreach (dfeChaves($in['chaves'] ?? []) as $c) { $up->execute([$nfseAmb, $cnpj, $c]); $n += $up->rowCount(); }
    sai(200, ['marcadas' => $n]);
}

if ($acao === 'dfedocs') {
    $cnpj = nfseCnpj($_GET['cnpj'] ?? ''); $serv = dfeServico($_GET['servico'] ?? '');
    $s = dfeDb()->prepare('SELECT competencia, COUNT(*) n FROM docs WHERE ambiente = ? AND cnpj = ? AND servico = ? GROUP BY competencia ORDER BY competencia DESC');
    $s->execute([$nfseAmb, $cnpj, $serv]);
    $comps = array_map(function ($r) { return ['competencia' => $r['competencia'], 'notas' => (int) $r['n']]; }, $s->fetchAll());
    $comp = (string)($_GET['competencia'] ?? ($comps[0]['competencia'] ?? ''));
    if ($comp !== '' && !preg_match('/^\d{4}-\d{2}$/', $comp)) sai(400, ['erro' => 'Competência inválida.']);
    $s = dfeDb()->prepare('SELECT * FROM docs WHERE ambiente = ? AND cnpj = ? AND servico = ? AND competencia = ? ORDER BY emissao, numero');
    $s->execute([$nfseAmb, $cnpj, $serv, $comp]);
    $docs = array_map(function ($n) { unset($n['ambiente'], $n['arquivo']); $n['v_total'] = (int) $n['v_total']; return $n; }, $s->fetchAll());
    $s = dfeDb()->prepare('SELECT servico, nsu, motivo, em FROM falhas WHERE ambiente = ? AND cnpj = ? AND servico = ? ORDER BY nsu');
    $s->execute([$nfseAmb, $cnpj, $serv]);
    sai(200, ['competencias' => $comps, 'competencia' => $comp, 'documentos' => $docs, 'falhas' => $s->fetchAll()]);
}

if ($acao === 'dfereiniciar') { // volta o NSU a zero; a chave de acesso impede duplicar
    $cnpj = nfseCnpj($in['cnpj'] ?? ''); $serv = dfeServico($in['servico'] ?? '');
    dfeEstado($nfseAmb, $cnpj, $serv);
    dfeEstadoAtualiza($nfseAmb, $cnpj, $serv, ['ultimo_nsu' => 0, 'ultimo_erro' => null]);
    sai(200, ['empresas' => dfeEmpresas($nfseAmb, $memDir)]);
}

if ($acao === 'dfezip') {
    $cnpj = nfseCnpj($_GET['cnpj'] ?? ''); $serv = dfeServico($_GET['servico'] ?? ''); $comp = (string)($_GET['competencia'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}$/', $comp)) sai(400, ['erro' => 'Competência inválida.']);
    $selecao = dfeChaves($in['chaves'] ?? null);
    if (!class_exists('ZipArchive')) sai(500, ['erro' => 'O servidor não tem a extensão zip do PHP.']);
    $s = dfeDb()->prepare("SELECT chave, papel, arquivo FROM docs WHERE ambiente = ? AND cnpj = ? AND servico = ? AND competencia = ? AND conteudo = 'completa'");
    $s->execute([$nfseAmb, $cnpj, $serv, $comp]);
    $docs = $s->fetchAll();
    if ($selecao !== null) $docs = array_values(array_filter($docs, function ($n) use ($selecao) { return in_array($n['chave'], $selecao, true); }));
    if (!$docs) sai(404, ['erro' => 'Nenhum XML completo para baixar. Notas só com resumo precisam de ciência.']);
    $tmp = tempnam(sys_get_temp_dir(), 'dfezip');
    $z = new ZipArchive();
    if ($z->open($tmp, ZipArchive::OVERWRITE) !== true) sai(500, ['erro' => 'Não foi possível montar o arquivo.']);
    $ev = dfeDb()->prepare('SELECT tipo, seq, arquivo FROM eventos WHERE ambiente = ? AND cnpj = ? AND servico = ? AND chave = ?');
    foreach ($docs as $n) {
        $pasta = preg_replace('/[^a-z]/', '', $n['papel']) ?: 'outros';
        $z->addFile(dfeDir() . '/' . $n['arquivo'], "$pasta/{$n['chave']}.xml");
        $ev->execute([$nfseAmb, $cnpj, $serv, $n['chave']]);
        foreach ($ev->fetchAll() as $e) $z->addFile(dfeDir() . '/' . $e['arquivo'], "$pasta/eventos/{$n['chave']}-{$e['tipo']}-{$e['seq']}.xml");
    }
    $z->close();
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . strtoupper($serv) . '-' . $cnpj . '-' . $comp . '.zip"');
    header('Content-Length: ' . filesize($tmp));
    readfile($tmp); @unlink($tmp);
    exit;
}
