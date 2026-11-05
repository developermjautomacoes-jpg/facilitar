<?php
/*
 * Acessos individuais da equipe. Incluído pelo api.php antes de qualquer ação.
 * O navegador envia um token de sessão no cabeçalho X-Senha; a senha geral (SENHA_ACESSO) só vale
 * para o agendador dentro do contêiner e para criar o primeiro usuário.
 * Toda regra de nível e de empresa restrita é aplicada aqui, no servidor.
 */
if (!defined('SENHA_ACESSO')) { http_response_code(403); exit; }

const AUTH_NIVEIS = ['auxiliar' => 1, 'assistente' => 2, 'analista' => 3, 'encarregado' => 4, 'gerente' => 5, 'socia' => 5];
const AUTH_SISTEMA = 9;
const AUTH_HORAS = 12;
// Nível mínimo por ação. Ação fora da lista exige gerente ou sócia/diretora.
const AUTH_ACOES = [
    'authme' => 1, 'authsair' => 1, 'authsenha' => 1, 'perfil' => 1, 'perfilsalvar' => 1,
    'listar' => 1, 'cnpj' => 1, 'ie' => 1, 'colabs' => 1, 'certlistar' => 1, 'agendacfg' => 1, 'agendaeventos' => 1, 'agendasalvar' => 1, 'agendaexcluir' => 1,
    'nfseempresas' => 1, 'nfsenotas' => 1, 'nfsexmls' => 1, 'nfsezip' => 1, 'nfseagenda' => 1, 'nfseprocurador' => 1,
    'dfeempresas' => 1, 'dfedocs' => 1, 'dfezip' => 1, 'dfeemissao' => 1,
    'nfsecapturar' => 3, 'nfseverificar' => 3, 'nfsediagnostico' => 3, 'dfecapturar' => 3, 'planejamento' => 3, 'planlistar' => 3, 'planler' => 3,
    'salvar' => 4, 'status' => 4, 'cliente' => 4, 'plansalvar' => 4, 'dfecienciaenviar' => 4, 'dfecienciamarcar' => 4, 'dfeemissaoimportar' => 4, 'dfeemissaoexcluir' => 4,
    'nfseagendaresultado' => AUTH_SISTEMA,
];
const AUTH_SEGREDOS_MEMO = ['r_senhaNfse', 'r_sefaz', 'r_codSimples', 'r_loginNfse']; // só de encarregado para cima

function authDb() {
    static $db = null;
    if ($db) return $db;
    $d = rtrim(getenv('DADOS_DIR') ?: (__DIR__ . '/dados'), '/') . '/auth';
    if (!is_dir($d)) { $old = umask(0077); mkdir($d, 0700, true); umask($old); }
    $db = new PDO('sqlite:' . $d . '/auth.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=15000;');
    $db->exec("CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY, login TEXT UNIQUE COLLATE NOCASE, nome TEXT, nivel TEXT, hash TEXT, ativo INTEGER DEFAULT 1, facilitar INTEGER DEFAULT 0, trocar_senha INTEGER DEFAULT 1, criado_em TEXT, ultimo_acesso TEXT);
        CREATE TABLE IF NOT EXISTS sessoes (token TEXT PRIMARY KEY, usuario_id INTEGER, expira INTEGER);
        CREATE TABLE IF NOT EXISTS tentativas (login TEXT PRIMARY KEY, n INTEGER, ate INTEGER);
        CREATE TABLE IF NOT EXISTS restritas (raiz TEXT PRIMARY KEY, nome TEXT);");
    return $db;
}
function authHash($t) { return hash('sha256', $t); }
function authSenhaOk($s) { return is_string($s) && strlen($s) >= 8; }
function authTexto($v, $n) { return mb_substr(trim((string) $v), 0, $n); }
function authPublico($u) { return ['id' => (int) $u['id'], 'login' => $u['login'], 'nome' => $u['nome'], 'nivel' => $u['nivel'], 'ativo' => (bool) $u['ativo'], 'facilitar' => (bool) $u['facilitar'], 'trocarSenha' => (bool) $u['trocar_senha'], 'ultimoAcesso' => $u['ultimo_acesso']]; }
function authSessao($u) {
    $t = bin2hex(random_bytes(32));
    authDb()->prepare('DELETE FROM sessoes WHERE expira < ?')->execute([time()]);
    authDb()->prepare('INSERT INTO sessoes (token, usuario_id, expira) VALUES (?, ?, ?)')->execute([authHash($t), $u['id'], time() + AUTH_HORAS * 3600]);
    authDb()->prepare('UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?')->execute([date('c'), $u['id']]);
    return ['token' => $t, 'usuario' => authPublico($u)];
}
function authDerruba($id, $menosToken = '') { authDb()->prepare('DELETE FROM sessoes WHERE usuario_id = ? AND token <> ?')->execute([$id, $menosToken]); }
function authUsuario($id) { $s = authDb()->prepare('SELECT * FROM usuarios WHERE id = ?'); $s->execute([$id]); return $s->fetch(); }

// ---------- empresas restritas ----------
function authRaizes() { static $r = null; if ($r === null) { $r = []; foreach (authDb()->query('SELECT raiz, nome FROM restritas') as $x) $r[$x['raiz']] = $x['nome']; } return $r; }
function authVeTudo() { global $AUTH; return !empty($AUTH['facilitar']); }
function authCnpjOculto($cnpj) {
    if (authVeTudo()) return false;
    $c = strtoupper(preg_replace('/[^0-9A-Za-z]/', '', (string) $cnpj));
    return strlen($c) >= 8 && isset(authRaizes()[substr($c, 0, 8)]);
}
function authTextoOculto($t) {
    if (authVeTudo()) return false;
    foreach (authRaizes() as $nome) if ($nome !== '' && mb_stripos((string) $t, $nome) !== false) return true;
    return false;
}
function authMemoVisivel($m) { return !authCnpjOculto($m['e_cnpj'] ?? '') && !authTextoOculto($m['e_razao'] ?? ''); }
function authLimpaMemo($m) { global $AUTH; if (($AUTH['rank'] ?? 0) < 4) foreach (AUTH_SEGREDOS_MEMO as $k) unset($m[$k]); return $m; }

// ---------- entrada ----------
$acao = $_GET['acao'] ?? '';
$AUTH = null;
$authIn = json_decode(file_get_contents('php://input'), true);
if (!is_array($authIn)) $authIn = [];

if ($acao === 'authstatus') sai(200, ['temUsuarios' => (int) authDb()->query('SELECT COUNT(*) FROM usuarios')->fetchColumn() > 0]);

if ($acao === 'authprimeiro') { // só funciona enquanto não há usuários, e exige a senha geral do sistema
    usleep(400000);
    if ((int) authDb()->query('SELECT COUNT(*) FROM usuarios')->fetchColumn() > 0) sai(403, ['erro' => 'O primeiro acesso já foi criado.']);
    if (!hash_equals(SENHA_ACESSO, (string)($authIn['senhaSistema'] ?? ''))) sai(403, ['erro' => 'Senha do sistema incorreta.']);
    $nome = authTexto($authIn['nome'] ?? '', 80); $login = authTexto($authIn['login'] ?? '', 80); $s = $authIn['senha'] ?? '';
    if ($nome === '' || $login === '' || !authSenhaOk($s)) sai(400, ['erro' => 'Informe nome, usuário e uma senha com pelo menos 8 caracteres.']);
    authDb()->prepare("INSERT INTO usuarios (login, nome, nivel, hash, facilitar, trocar_senha, criado_em) VALUES (?, ?, 'socia', ?, 1, 0, ?)")->execute([$login, $nome, password_hash($s, PASSWORD_DEFAULT), date('c')]);
    sai(200, authSessao(authUsuario(authDb()->lastInsertId())));
}

if ($acao === 'authlogin') {
    usleep(300000);
    $login = authTexto($authIn['login'] ?? '', 80); $s = (string)($authIn['senha'] ?? ''); $chave = mb_strtolower($login);
    $q = authDb()->prepare('SELECT n, ate FROM tentativas WHERE login = ?'); $q->execute([$chave]); $t = $q->fetch();
    if ($t && (int) $t['ate'] > time()) sai(429, ['erro' => 'Muitas tentativas. Aguarde 15 minutos.']);
    $q = authDb()->prepare('SELECT * FROM usuarios WHERE login = ?'); $q->execute([$login]); $u = $q->fetch();
    if (!$u || !$u['ativo'] || !password_verify($s, $u['hash'])) {
        $n = ($t ? (int) $t['n'] : 0) + 1;
        authDb()->prepare('INSERT OR REPLACE INTO tentativas (login, n, ate) VALUES (?, ?, ?)')->execute([$chave, $n, $n >= 5 ? time() + 900 : 0]);
        if ($n >= 5) authDb()->prepare('UPDATE tentativas SET n = 0 WHERE login = ?')->execute([$chave]);
        sai(403, ['erro' => 'Usuário ou senha incorretos.']);
    }
    authDb()->prepare('DELETE FROM tentativas WHERE login = ?')->execute([$chave]);
    sai(200, authSessao($u));
}

// ---------- quem está chamando ----------
$cabecalho = $_SERVER['HTTP_X_SENHA'] ?? '';
$local = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
if ($local && is_string($cabecalho) && hash_equals(SENHA_ACESSO, $cabecalho)) {
    $AUTH = ['id' => 0, 'nome' => 'Sistema', 'nivel' => 'sistema', 'rank' => AUTH_SISTEMA, 'facilitar' => true, 'trocarSenha' => false];
} elseif (!$retornoGoogle) {
    $s = authDb()->prepare('SELECT u.*, x.token FROM sessoes x JOIN usuarios u ON u.id = x.usuario_id WHERE x.token = ? AND x.expira > ? AND u.ativo = 1');
    $s->execute([authHash((string) $cabecalho), time()]);
    $u = $s->fetch();
    if (!$u) { usleep(400000); sai(401, ['erro' => 'Sessão encerrada. Entre novamente.']); }
    $AUTH = ['id' => (int) $u['id'], 'nome' => $u['nome'], 'nivel' => $u['nivel'], 'rank' => AUTH_NIVEIS[$u['nivel']] ?? 1, 'facilitar' => (bool) $u['facilitar'], 'trocarSenha' => (bool) $u['trocar_senha'], 'token' => $u['token']];
}

if ($AUTH) {
    if ($AUTH['trocarSenha'] && !in_array($acao, ['authme', 'authsenha', 'authsair'], true)) sai(403, ['erro' => 'Troque sua senha para continuar.']);
    if ($AUTH['rank'] < (AUTH_ACOES[$acao] ?? 5)) sai(403, ['erro' => 'Seu nível de acesso não permite esta ação.']);
    // Empresa restrita: vale para qualquer ação que informe CNPJ, exceto a consulta pública de cadastro.
    if (!in_array($acao, ['cnpj', 'ie', 'authrestritas', 'authrestritassalvar'], true)) {
        foreach ([$_GET['cnpj'] ?? '', $authIn['cnpj'] ?? '', $authIn['memo']['e_cnpj'] ?? ''] as $c) if ($c !== '' && authCnpjOculto($c)) sai(403, ['erro' => 'Empresa restrita.']);
    }
}

if ($acao === 'authme') sai(200, ['usuario' => authPublico(authUsuario($AUTH['id']))]);
if ($acao === 'authsair') { authDb()->prepare('DELETE FROM sessoes WHERE token = ?')->execute([$AUTH['token'] ?? '']); sai(200, ['ok' => true]); }
if ($acao === 'authsenha') {
    $u = authUsuario($AUTH['id']); $nova = $authIn['nova'] ?? '';
    if (!password_verify((string)($authIn['atual'] ?? ''), $u['hash'])) sai(403, ['erro' => 'Senha atual incorreta.']);
    if (!authSenhaOk($nova)) sai(400, ['erro' => 'A nova senha precisa ter pelo menos 8 caracteres.']);
    authDb()->prepare('UPDATE usuarios SET hash = ?, trocar_senha = 0 WHERE id = ?')->execute([password_hash($nova, PASSWORD_DEFAULT), $u['id']]);
    authDerruba($u['id'], $AUTH['token'] ?? '');
    sai(200, ['usuario' => authPublico(authUsuario($u['id']))]);
}
function authListar() {
    $v = authVeTudo();
    return array_values(array_map('authPublico', array_filter(authDb()->query('SELECT * FROM usuarios ORDER BY nome')->fetchAll(), function ($u) use ($v) { return $v || !$u['facilitar']; })));
}
if ($acao === 'authusuarios') sai(200, ['usuarios' => authListar()]);
if ($acao === 'authusuariosalvar') {
    $id = (int)($authIn['id'] ?? 0); $nome = authTexto($authIn['nome'] ?? '', 80); $login = authTexto($authIn['login'] ?? '', 80); $nivel = (string)($authIn['nivel'] ?? '');
    if ($nome === '' || $login === '' || !isset(AUTH_NIVEIS[$nivel])) sai(400, ['erro' => 'Informe nome, usuário e nível.']);
    $flag = !empty($authIn['facilitar']); $ativo = !isset($authIn['ativo']) || !empty($authIn['ativo']);
    $atual = $id ? authUsuario($id) : null;
    if ($id && !$atual) sai(404, ['erro' => 'Usuário não encontrado.']);
    if ($atual && $atual['facilitar'] && !authVeTudo()) sai(403, ['erro' => 'Sem permissão para este usuário.']);
    if ($flag && !authVeTudo()) sai(403, ['erro' => 'Só quem acessa a empresa restrita pode conceder esse acesso.']);
    if ($id === $AUTH['id'] && ($nivel !== $atual['nivel'] || !$ativo || $flag !== (bool) $atual['facilitar'])) sai(400, ['erro' => 'Peça a outra pessoa para alterar seu próprio nível ou acesso.']);
    try {
        if ($id) {
            authDb()->prepare('UPDATE usuarios SET login = ?, nome = ?, nivel = ?, facilitar = ?, ativo = ? WHERE id = ?')->execute([$login, $nome, $nivel, $flag ? 1 : 0, $ativo ? 1 : 0, $id]);
            if ($id !== $AUTH['id']) authDerruba($id);
        } else {
            $temp = (string)($authIn['senha'] ?? '');
            if (!authSenhaOk($temp)) sai(400, ['erro' => 'A senha inicial precisa ter pelo menos 8 caracteres.']);
            authDb()->prepare('INSERT INTO usuarios (login, nome, nivel, hash, facilitar, trocar_senha, criado_em) VALUES (?, ?, ?, ?, ?, 1, ?)')->execute([$login, $nome, $nivel, password_hash($temp, PASSWORD_DEFAULT), $flag ? 1 : 0, date('c')]);
        }
    } catch (PDOException $e) { sai(400, ['erro' => 'Já existe um usuário com esse login.']); }
    sai(200, ['usuarios' => authListar()]);
}
if ($acao === 'authusuariosenha') { // senha provisória: a pessoa troca no próximo acesso
    $id = (int)($authIn['id'] ?? 0); $u = authUsuario($id); $temp = $authIn['senha'] ?? '';
    if (!$u) sai(404, ['erro' => 'Usuário não encontrado.']);
    if ($u['facilitar'] && !authVeTudo()) sai(403, ['erro' => 'Sem permissão para este usuário.']);
    if (!authSenhaOk($temp)) sai(400, ['erro' => 'A senha precisa ter pelo menos 8 caracteres.']);
    authDb()->prepare('UPDATE usuarios SET hash = ?, trocar_senha = 1 WHERE id = ?')->execute([password_hash($temp, PASSWORD_DEFAULT), $id]);
    authDerruba($id);
    sai(200, ['usuarios' => authListar()]);
}
if ($acao === 'authrestritas') { if (!authVeTudo()) sai(403, ['erro' => 'Sem permissão.']); $l = []; foreach (authRaizes() as $r => $n) $l[] = ['raiz' => $r, 'nome' => $n]; sai(200, ['restritas' => $l]); }
if ($acao === 'authrestritassalvar') {
    if (!authVeTudo()) sai(403, ['erro' => 'Sem permissão.']);
    $db = authDb(); $db->exec('BEGIN IMMEDIATE'); $db->exec('DELETE FROM restritas');
    $ins = $db->prepare('INSERT OR REPLACE INTO restritas (raiz, nome) VALUES (?, ?)');
    foreach ((array)($authIn['restritas'] ?? []) as $x) {
        $c = strtoupper(preg_replace('/[^0-9A-Za-z]/', '', (string)($x['raiz'] ?? '')));
        if (strlen($c) < 8) { $db->exec('ROLLBACK'); sai(400, ['erro' => 'Informe o CNPJ completo ou a raiz de 8 dígitos.']); }
        $ins->execute([substr($c, 0, 8), authTexto($x['nome'] ?? '', 150)]);
    }
    $db->exec('COMMIT');
    sai(200, ['ok' => true]);
}
