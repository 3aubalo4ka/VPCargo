<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

if (!empty($_SESSION['user'])) {
    $target = $_SESSION['user']['role'] === 'admin' ? 'admin.php' : 'client.php';
    header('Location: ' . $target);
    exit;
}
?>
<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>VPCargo</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="container">
    <h1>VPCargo</h1>
    <p>Сервис отслеживания грузов.</p>
    <a class="btn" href="login.php">Войти</a>
  </main>
</body>
</html>
