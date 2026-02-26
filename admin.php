<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
checkAdmin();

$allowedStatuses = ['в пути', 'готов к выдаче на ФФ', 'получен'];
$allowedPayment = ['не оплачен', 'оплачен'];

$page = max(1, (int) ($_GET['page'] ?? 1));
$perPage = (int) ($_GET['per_page'] ?? 50);
if (!in_array($perPage, [25, 50, 100], true)) {
    $perPage = 50;
}
$offset = ($page - 1) * $perPage;

$statusFilter = trim((string) ($_GET['status'] ?? ''));
$paymentFilter = trim((string) ($_GET['payment_status'] ?? ''));
$search = trim((string) ($_GET['search'] ?? ''));

$where = [];
$params = [];
if (in_array($statusFilter, $allowedStatuses, true)) {
    $where[] = 'o.status = :status';
    $params[':status'] = $statusFilter;
}
if (in_array($paymentFilter, $allowedPayment, true)) {
    $where[] = 'o.payment_status = :payment_status';
    $params[':payment_status'] = $paymentFilter;
}
if ($search !== '') {
    $where[] = '(o.cargo_number LIKE :search OR u.login LIKE :search OR u.phone LIKE :search)';
    $params[':search'] = '%' . $search . '%';
}
$whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

$returnQuery = $_SERVER['QUERY_STRING'] !== '' ? ('?' . $_SERVER['QUERY_STRING']) : '';

function normalize_return_query(string $raw): string
{
    $raw = ltrim($raw, '?');
    if ($raw === '') {
        return '';
    }

    parse_str($raw, $parsed);
    if (!is_array($parsed)) {
        return '';
    }

    $allowedKeys = ['page', 'per_page', 'status', 'payment_status', 'search'];
    $safe = [];
    foreach ($allowedKeys as $key) {
        if (array_key_exists($key, $parsed)) {
            $safe[$key] = (string) $parsed[$key];
        }
    }

    if ($safe === []) {
        return '';
    }

    return '?' . http_build_query($safe);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postReturnQuery = normalize_return_query((string) ($_POST['return_query'] ?? ''));
    if ($postReturnQuery === '') {
        $postReturnQuery = $returnQuery;
    }

    if (!csrf_check($_POST['csrf_token'] ?? null)) {
        set_flash('error', 'Сессия устарела. Обновите страницу и повторите.');
        header('Location: admin.php' . $postReturnQuery);
        exit;
    }

    $action = $_POST['action'] ?? '';

    if ($action === 'create_user') {
        $login = trim((string) ($_POST['login'] ?? ''));
        $password = (string) ($_POST['password'] ?? '');
        $phone = normalize_phone((string) ($_POST['phone'] ?? ''));

        if (!validate_login($login) || strlen($password) < 6 || $phone === null) {
            set_flash('error', 'Проверьте корректность логина, пароля и телефона.');
        } else {
            try {
                safeQuery(
                    'INSERT INTO users(login, password, phone, role) VALUES(:login,:password,:phone,:role)',
                    [
                        ':login' => $login,
                        ':password' => password_hash($password, PASSWORD_DEFAULT),
                        ':phone' => $phone,
                        ':role' => 'client',
                    ]
                );
                set_flash('success', 'Пользователь создан.');
            } catch (PDOException $e) {
                if ($e->getCode() === '23000') {
                    $msg = str_contains($e->getMessage(), 'users.login') ? 'Логин уже занят' : 'Телефон уже используется';
                    set_flash('error', $msg);
                } else {
                    set_flash('error', 'Не удалось создать пользователя.');
                }
            }
        }

        header('Location: admin.php' . $postReturnQuery);
        exit;
    }

    if ($action === 'add_order') {
        $client = trim((string) ($_POST['client'] ?? ''));
        $cargo = trim((string) ($_POST['cargo_number'] ?? ''));

        $clientPhone = normalize_phone($client);
        if (!validate_cargo_number($cargo)) {
            set_flash('error', 'Некорректный номер груза.');
        } else {
            $user = null;
            if ($clientPhone !== null) {
                $user = safeQuery('SELECT id FROM users WHERE phone = :phone LIMIT 1', [':phone' => $clientPhone])->fetch();
            }
            if (!$user && validate_login($client)) {
                $user = safeQuery('SELECT id FROM users WHERE login = :login LIMIT 1', [':login' => $client])->fetch();
            }

            if (!$user) {
                set_flash('error', 'Клиент не найден.');
            } else {
                try {
                    safeQuery('INSERT INTO orders(user_id, cargo_number, status, payment_status, date_sent, cost) VALUES(:uid,:cargo,:status,:payment,:date_sent,:cost)', [
                        ':uid' => (int) $user['id'],
                        ':cargo' => $cargo,
                        ':status' => 'в пути',
                        ':payment' => 'не оплачен',
                        ':date_sent' => null,
                        ':cost' => 0,
                    ]);
                    set_flash('success', 'Заказ добавлен.');
                } catch (PDOException $e) {
                    set_flash('error', $e->getCode() === '23000' ? 'Номер уже существует' : 'Не удалось добавить заказ.');
                }
            }
        }

        header('Location: admin.php' . $postReturnQuery);
        exit;
    }

    if ($action === 'update_order') {
        $id = (int) ($_POST['order_id'] ?? 0);
        $status = (string) ($_POST['status'] ?? '');
        $payment = (string) ($_POST['payment_status'] ?? '');
        $dateSent = trim((string) ($_POST['date_sent'] ?? ''));
        $costRaw = trim((string) ($_POST['cost'] ?? ''));

        $validCost = is_numeric($costRaw) && (float) $costRaw >= 0;
        if (!in_array($status, $allowedStatuses, true) || !in_array($payment, $allowedPayment, true) || !validate_date_or_null($dateSent) || !$validCost) {
            set_flash('error', 'Некорректные данные заказа.');
        } else {
            safeQuery('UPDATE orders SET status=:status,payment_status=:payment,date_sent=:date_sent,cost=:cost WHERE id=:id', [
                ':status' => $status,
                ':payment' => $payment,
                ':date_sent' => $dateSent === '' ? null : $dateSent,
                ':cost' => number_format((float) $costRaw, 2, '.', ''),
                ':id' => $id,
            ]);
            set_flash('success', 'Заказ обновлен.');
        }

        header('Location: admin.php' . $postReturnQuery);
        exit;
    }

    if ($action === 'delete_order') {
        $id = (int) ($_POST['order_id'] ?? 0);
        safeQuery('DELETE FROM orders WHERE id=:id', [':id' => $id]);
        set_flash('success', 'Заказ удален.');
        header('Location: admin.php' . $postReturnQuery);
        exit;
    }
}

$countStmt = safeQuery('SELECT COUNT(*) AS total FROM orders o JOIN users u ON u.id=o.user_id' . $whereSql, $params);
$total = (int) $countStmt->fetch()['total'];
$totalPages = max(1, (int) ceil($total / $perPage));
if ($page > $totalPages) {
    $page = $totalPages;
    $offset = ($page - 1) * $perPage;
}

$listSql = 'SELECT o.*, u.login, u.phone FROM orders o JOIN users u ON u.id=o.user_id' . $whereSql . ' ORDER BY o.id DESC LIMIT :limit OFFSET :offset';
$stmt = db()->prepare($listSql);
foreach ($params as $k => $v) {
    $stmt->bindValue($k, $v);
}
$stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
$stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
$stmt->execute();
$orders = $stmt->fetchAll();
$flash = get_flash();

function page_url(int $newPage): string {
    $q = $_GET;
    $q['page'] = $newPage;
    return 'admin.php?' . http_build_query($q);
}
?>
<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Админка</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
<main class="container wide">
  <h1>Админ-панель</h1>
  <p><a href="logout.php">Выйти</a></p>

  <?php if ($flash): ?><p class="alert <?= h($flash['type']) ?>"><?= h($flash['message']) ?></p><?php endif; ?>

  <section>
    <h2>Создать клиента</h2>
    <form method="post" class="inline-form">
      <input type="hidden" name="csrf_token" value="<?= h(csrf_token()) ?>">
      <input type="hidden" name="action" value="create_user">
      <input type="hidden" name="return_query" value="<?= h($returnQuery) ?>">
      <input name="login" placeholder="login" required>
      <input name="phone" placeholder="+7XXXXXXXXXX" required>
      <input type="password" name="password" placeholder="пароль" required>
      <button class="btn" type="submit">Создать</button>
    </form>
  </section>

  <section>
    <h2>Добавить заказ вручную</h2>
    <form method="post" class="inline-form">
      <input type="hidden" name="csrf_token" value="<?= h(csrf_token()) ?>">
      <input type="hidden" name="action" value="add_order">
      <input type="hidden" name="return_query" value="<?= h($returnQuery) ?>">
      <input name="client" placeholder="логин или телефон" required>
      <input name="cargo_number" placeholder="номер груза" required>
      <button class="btn" type="submit">Добавить</button>
    </form>
  </section>

  <section>
    <h2>Импорт CSV/XLSX</h2>
    <form method="post" action="upload.php<?= $returnQuery ?>" enctype="multipart/form-data" class="inline-form">
      <input type="hidden" name="csrf_token" value="<?= h(csrf_token()) ?>">
      <input type="hidden" name="return_query" value="<?= h($returnQuery) ?>">
      <input type="file" name="import_file" accept=".csv,.xlsx" required>
      <button class="btn" type="submit">Загрузить</button>
    </form>
  </section>

  <section>
    <h2>Заказы</h2>
    <form method="get" class="inline-form">
      <input name="search" value="<?= h($search) ?>" placeholder="поиск">
      <select name="status">
        <option value="">Все статусы</option>
        <?php foreach ($allowedStatuses as $s): ?><option value="<?= h($s) ?>" <?= $statusFilter===$s?'selected':'' ?>><?= h($s) ?></option><?php endforeach; ?>
      </select>
      <select name="payment_status">
        <option value="">Все оплаты</option>
        <?php foreach ($allowedPayment as $p): ?><option value="<?= h($p) ?>" <?= $paymentFilter===$p?'selected':'' ?>><?= h($p) ?></option><?php endforeach; ?>
      </select>
      <select name="per_page">
        <?php foreach ([25,50,100] as $pp): ?><option value="<?= $pp ?>" <?= $perPage===$pp?'selected':'' ?>><?= $pp ?>/стр</option><?php endforeach; ?>
      </select>
      <button class="btn" type="submit">Фильтр</button>
    </form>

    <table>
      <thead><tr><th>Номер</th><th>Клиент</th><th>Телефон</th><th>Статус</th><th>Оплата</th><th>Дата</th><th>Стоимость</th><th></th></tr></thead>
      <tbody>
      <?php foreach ($orders as $o): ?>
        <tr>
          <td><?= h($o['cargo_number']) ?></td>
          <td><?= h($o['login']) ?></td>
          <td><?= h($o['phone']) ?></td>
          <td colspan="5">
            <form method="post" class="inline-form">
              <input type="hidden" name="csrf_token" value="<?= h(csrf_token()) ?>">
              <input type="hidden" name="return_query" value="<?= h($returnQuery) ?>">
              <input type="hidden" name="action" value="update_order">
              <input type="hidden" name="order_id" value="<?= (int)$o['id'] ?>">
              <select name="status"><?php foreach ($allowedStatuses as $s): ?><option value="<?= h($s) ?>" <?= $o['status']===$s?'selected':'' ?>><?= h($s) ?></option><?php endforeach; ?></select>
              <select name="payment_status"><?php foreach ($allowedPayment as $p): ?><option value="<?= h($p) ?>" <?= $o['payment_status']===$p?'selected':'' ?>><?= h($p) ?></option><?php endforeach; ?></select>
              <input type="date" name="date_sent" value="<?= h((string)$o['date_sent']) ?>">
              <input type="number" step="0.01" min="0" name="cost" value="<?= h((string)$o['cost']) ?>">
              <button class="btn" type="submit">Сохранить</button>
            </form>
            <form method="post" onsubmit="return confirm('Удалить заказ?');" class="inline-form">
              <input type="hidden" name="csrf_token" value="<?= h(csrf_token()) ?>">
              <input type="hidden" name="return_query" value="<?= h($returnQuery) ?>">
              <input type="hidden" name="action" value="delete_order">
              <input type="hidden" name="order_id" value="<?= (int)$o['id'] ?>">
              <button class="btn danger" type="submit">Удалить</button>
            </form>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>

    <div class="pagination">
      <a href="<?= h(page_url(max(1, $page - 1))) ?>">←</a>
      <span>Страница <?= $page ?> / <?= $totalPages ?></span>
      <a href="<?= h(page_url(min($totalPages, $page + 1))) ?>">→</a>
    </div>
  </section>
</main>
</body>
</html>
