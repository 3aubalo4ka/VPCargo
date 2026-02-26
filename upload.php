<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';
checkAdmin();

$returnQuery = ltrim((string) ($_POST['return_query'] ?? ''), '?');
$redirect = 'admin.php' . ($returnQuery !== '' ? ('?' . $returnQuery) : '');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ' . $redirect);
    exit;
}

if (!csrf_check($_POST['csrf_token'] ?? null)) {
    set_flash('error', 'Сессия устарела. Обновите страницу и повторите.');
    header('Location: ' . $redirect);
    exit;
}

if (empty($_FILES['import_file']) || $_FILES['import_file']['error'] !== UPLOAD_ERR_OK) {
    set_flash('error', 'Файл не загружен.');
    header('Location: ' . $redirect);
    exit;
}

$file = $_FILES['import_file'];
if (($file['size'] ?? 0) > 10 * 1024 * 1024) {
    set_flash('error', 'Файл слишком большой (максимум 10MB).');
    header('Location: ' . $redirect);
    exit;
}

$ext = strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
if (!in_array($ext, ['csv', 'xlsx'], true)) {
    set_flash('error', 'Допустимы только CSV и XLSX.');
    header('Location: ' . $redirect);
    exit;
}

$tmpPath = sys_get_temp_dir() . '/vpcargo_' . bin2hex(random_bytes(8)) . '.' . $ext;
if (!move_uploaded_file((string) $file['tmp_name'], $tmpPath)) {
    set_flash('error', 'Не удалось сохранить файл.');
    header('Location: ' . $redirect);
    exit;
}

function parse_csv_rows(string $path): array {
    $content = file_get_contents($path);
    if ($content === false) {
        return [];
    }

    $lines = preg_split('/\r\n|\n|\r/', trim($content));
    if (!$lines) {
        return [];
    }

    $delim = (substr_count($lines[0], ';') > substr_count($lines[0], ',')) ? ';' : ',';
    $rows = [];
    foreach ($lines as $line) {
        if ($line === '') continue;
        $rows[] = str_getcsv($line, $delim);
    }
    return $rows;
}

function map_rows(array $rows): array {
    if (empty($rows)) return [];

    $header = array_map(fn($v) => mb_strtolower(trim((string)$v)), $rows[0]);
    $hasHeader = in_array('cargo_number', $header, true) || in_array('client_phone', $header, true) || in_array('номер', $header, true);

    $cargoIdx = 0;
    $phoneIdx = 1;
    if ($hasHeader) {
        foreach ($header as $i => $name) {
            if (in_array($name, ['cargo_number', 'номер', 'номер груза'], true)) $cargoIdx = $i;
            if (in_array($name, ['client_phone', 'телефон', 'phone'], true)) $phoneIdx = $i;
        }
        array_shift($rows);
    }

    $mapped = [];
    foreach ($rows as $rowNum => $row) {
        $mapped[] = [
            'row' => $hasHeader ? $rowNum + 2 : $rowNum + 1,
            'cargo_number' => trim((string)($row[$cargoIdx] ?? '')),
            'client_phone' => trim((string)($row[$phoneIdx] ?? '')),
        ];
    }

    return $mapped;
}

function parse_xlsx_rows(string $path): array {
    $autoload = __DIR__ . '/vendor/autoload.php';
    if (!file_exists($autoload)) {
        throw new RuntimeException('PhpSpreadsheet не установлен. Выполните composer install.');
    }
    require_once $autoload;

    $sheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($path)->getSheet(0);
    $rows = $sheet->toArray(null, true, true, false);
    return is_array($rows) ? $rows : [];
}

$rawRows = [];
try {
    $rawRows = $ext === 'csv' ? parse_csv_rows($tmpPath) : parse_xlsx_rows($tmpPath);
    $rows = map_rows($rawRows);

    $success = 0;
    $errors = [];
    foreach ($rows as $row) {
        $cargo = trim($row['cargo_number']);
        $phone = normalize_phone($row['client_phone']);

        if (!validate_cargo_number($cargo)) {
            $errors[] = 'Строка ' . $row['row'] . ': Некорректный номер груза';
            continue;
        }
        if ($phone === null) {
            $errors[] = 'Строка ' . $row['row'] . ': Некорректный телефон';
            continue;
        }

        $user = safeQuery('SELECT id FROM users WHERE phone = :phone LIMIT 1', [':phone' => $phone])->fetch();
        if (!$user) {
            $errors[] = 'Строка ' . $row['row'] . ': Клиент не найден';
            continue;
        }

        $exists = safeQuery('SELECT id FROM orders WHERE cargo_number = :cargo LIMIT 1', [':cargo' => $cargo])->fetch();
        if ($exists) {
            $errors[] = 'Строка ' . $row['row'] . ': Номер уже существует';
            continue;
        }

        safeQuery('INSERT INTO orders(user_id, cargo_number, status, payment_status, date_sent, cost) VALUES(:uid,:cargo,:status,:payment,:date_sent,:cost)', [
            ':uid' => (int) $user['id'],
            ':cargo' => $cargo,
            ':status' => 'в пути',
            ':payment' => 'не оплачен',
            ':date_sent' => null,
            ':cost' => 0,
        ]);
        $success++;
    }

    $message = 'Импорт завершен. Успешно: ' . $success . '. Ошибок: ' . count($errors) . '.';
    if ($errors) {
        $message .= ' ' . implode(' | ', array_slice($errors, 0, 5));
    }
    set_flash($errors ? 'error' : 'success', $message);
} catch (Throwable $e) {
    set_flash('error', 'Ошибка импорта. Проверьте формат файла и попробуйте снова.');
} finally {
    if (file_exists($tmpPath)) {
        unlink($tmpPath);
    }
}

header('Location: ' . $redirect);
exit;
