<?php
/*
 * Agendador da captura de NFS-e. Roda dentro do contêiner, fora da pasta pública.
 * A cada minuto consulta a agenda e, no horário definido na tela, repete para cada empresa
 * a mesma chamada do botão de captura. Assim, a regra da captura fica só no nfse.php.
 * Uso: php nfse-agendador.php [--uma-vez]  (--uma-vez: confere a agenda uma vez e termina)
 */
if (PHP_SAPI !== 'cli') exit(1);
date_default_timezone_set('America/Sao_Paulo');
$url = getenv('NFSE_AGENDADOR_URL') ?: 'http://127.0.0.1/api.php';
$senha = (string) getenv('SENHA_ACESSO');
if ($senha === '') { echo "nfse-agendador: SENHA_ACESSO não definida\n"; exit(0); }
const JANELA_HORAS = 6;       // só começa até 6 h depois do horário e para ao fim dessas 6 h
const ESPERA_MAXIMA_S = 300;  // pausa maior passa para a próxima empresa; a captura dela continua na noite seguinte

function api($acao, $corpo = null, $query = []) {
    global $url, $senha;
    $ch = curl_init($url . '?' . http_build_query(['acao' => $acao] + $query));
    $op = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 200, CURLOPT_PROXY => '', CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Senha: ' . $senha]];
    if ($corpo !== null) { $op[CURLOPT_POST] = true; $op[CURLOPT_POSTFIELDS] = json_encode($corpo); }
    curl_setopt_array($ch, $op);
    $r = curl_exec($ch); curl_close($ch);
    $j = json_decode((string) $r, true);
    return is_array($j) ? $j : null;
}

function executar($dia, $limite) {
    api('nfseagendaresultado', ['dia' => $dia, 'status' => 'rodando', 'linhas' => []]);
    $empresas = api('nfseempresas')['empresas'] ?? [];
    $hoje = date('Y-m-d');
    $linhas = [];
    foreach ($empresas as $e) {
        if (empty($e['certificado']) || ($e['certificado']['validade'] ?? '') < $hoje) continue;
        $nome = ($e['razao'] ?? '') ?: $e['cnpj'];
        $tot = ['notas' => 0, 'eventos' => 0, 'falhas' => 0]; $texto = '';
        while (true) {
            if (time() >= $limite) { $texto = 'fim da janela da noite; continua na próxima'; break; }
            $p = api('nfsecapturar', ['cnpj' => $e['cnpj'], 'ambiente' => 'producao']);
            if (!$p) { $texto = 'sem resposta do sistema'; break; }
            $st = $p['status'] ?? '';
            if ($st === 'lote' || $st === 'fim') {
                foreach ($tot as $k => $v) $tot[$k] = $v + (int)($p[$k] ?? 0);
                if ($st === 'fim') break;
                usleep(2500000);
            } elseif ($st === 'aguardar') {
                $s = (int)($p['segundos'] ?? 60);
                if ($s > ESPERA_MAXIMA_S) { $texto = 'pausada pelo ADN; continua na próxima noite'; break; }
                sleep(max(1, $s));
            } else { $texto = (string)($p['mensagem'] ?? 'erro na captura'); break; }
        }
        $linhas[] = "$nome: {$tot['notas']} nota(s) nova(s), {$tot['eventos']} evento(s)" . ($tot['falhas'] ? ", {$tot['falhas']} com falha" : '') . ($texto ? " ($texto)" : '');
        usleep(2500000);
    }
    if (!$linhas) $linhas[] = 'Nenhuma empresa com certificado válido.';
    api('nfseagendaresultado', ['dia' => $dia, 'status' => 'concluido', 'linhas' => $linhas]);
}

do {
    $a = api('nfseagenda');
    if ($a && !empty($a['ativo']) && preg_match('/^\d{2}:\d{2}$/', (string)($a['hora'] ?? ''))) {
        // a noite pertence ao dia em que o horário cai; passar da meia-noite não repete a execução
        $hoje = date('Y-m-d'); $ontem = date('Y-m-d', time() - 86400);
        foreach ([$hoje, $ontem] as $dia) {
            $inicio = strtotime("$dia {$a['hora']}:00"); $limite = $inicio + JANELA_HORAS * 3600;
            if (time() >= $inicio && time() < $limite && strcmp((string)($a['ultimoDia'] ?? ''), $dia) < 0) { executar($dia, $limite); break; }
        }
    }
    if (in_array('--uma-vez', $argv, true)) break;
    sleep(60);
} while (true);
