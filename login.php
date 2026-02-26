<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

if (!empty($_SESSION['user'])) {
    $target = $_SESSION['user']['role'] === 'admin' ? 'admin.php' : 'client.php';
    header('Location: ' . $target);
    exit;
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf_token'] ?? null)) {
        $error = 'Сессия устарела. Обновите страницу и повторите.';
    } else {
        $login = trim((string) ($_POST['login'] ?? ''));
        $password = (string) ($_POST['password'] ?? '');

        if (!validate_login($login) || strlen($password) < 6) {
            $error = 'Проверьте логин и пароль.';
        } else {
            $user = safeQuery('SELECT * FROM users WHERE login = :login LIMIT 1', [':login' => $login])->fetch();
            if ($user && password_verify($password, $user['password'])) {
                session_regenerate_id(true);
                $_SESSION['user'] = [
                    'id' => (int) $user['id'],
                    'login' => $user['login'],
                    'role' => $user['role'],
                ];

                header('Location: ' . ($user['role'] === 'admin' ? 'admin.php' : 'client.php'));
                exit;
            }
            $error = 'Неверный логин или пароль.';
        }
    }
}
?>
<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Вход — VPCargo</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
<main class="container">
  <h1>Вход</h1>
  <?php if ($error): ?><p class="alert error"><?= h($error) ?></p><?php endif; ?>
  <form method="post">
    <input type="hidden" name="csrf_token" value="<?= h(csrf_token()) ?>">
    <label>Логин <input type="text" name="login" required></label>
    <label>Пароль <input type="password" name="password" required></label>
    <button class="btn" type="submit">Войти</button>
  </form>
</main>
</body>
</html>
