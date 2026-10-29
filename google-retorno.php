<?php
// Endereço de retorno do login do Google (cadastrado no Google Cloud como "URI de redirecionamento autorizado").
// Repassa para o api.php, que confere o "state" de uso único, guarda a autorização e mostra uma página de confirmação.
$_GET['acao'] = 'agendaoauthretorno';
require __DIR__ . '/api.php';
