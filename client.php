<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
checkAuth();

$userId = (int) $_SESSION['user']['id'];
$orders = safeQuery('SELECT cargo_number, status, payment_status, date_sent, cost, created_at FROM orders WHERE user_id = :id ORDER BY id DESC', [':id' => $userId])->fetchAll();
?>
<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Кабинет клиента</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
<main class="container">
  <h1>Здравствуйте, <?= h($_SESSION['user']['login']) ?></h1>
  <p><a href="logout.php">Выйти</a></p>
  <table>
    <thead><tr><th>Номер</th><th>Статус</th><th>Оплата</th><th>Дата</th><th>Стоимость</th></tr></thead>
    <tbody>
      <?php foreach ($orders as $row): ?>
      <tr>
        <td><?= h($row['cargo_number']) ?></td>
        <td><?= h($row['status']) ?></td>
        <td><?= h($row['payment_status']) ?></td>
        <td><?= h((string) $row['date_sent']) ?></td>
        <td><?= h((string) $row['cost']) ?></td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
</main>
</body>
</html>
