-- VPCargo test credentials:
-- admin / admin123 (admin)
-- client1 / client123 (client)
-- client2 / client123 (client)

CREATE DATABASE IF NOT EXISTS vpcargo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE vpcargo;

DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    login VARCHAR(64) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    role ENUM('client','admin') NOT NULL DEFAULT 'client',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    cargo_number VARCHAR(64) NOT NULL,
    status ENUM('в пути','готов к выдаче на ФФ','получен') NOT NULL DEFAULT 'в пути',
    payment_status ENUM('не оплачен','оплачен') NOT NULL DEFAULT 'не оплачен',
    date_sent DATE NULL,
    cost DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_orders_cargo_number (cargo_number),
    KEY idx_orders_user_id (user_id),
    KEY idx_orders_status (status),
    KEY idx_orders_payment_status (payment_status)
) ENGINE=InnoDB;

INSERT INTO users (login, password, phone, role) VALUES
('admin', '$2y$12$vsgoE40xeLHq2tSRId8/EuQSD8gvIlf/68e8/nY7YRwOtVE914rG2', '+79990000001', 'admin'),
('client1', '$2y$12$gGSYTJgDFjfuVkMFhnsfEu4KGy2WdIqOiMCwYk3c5.jxFnKjFCpwi', '+79990000002', 'client'),
('client2', '$2y$12$gGSYTJgDFjfuVkMFhnsfEu4KGy2WdIqOiMCwYk3c5.jxFnKjFCpwi', '+79990000003', 'client');

INSERT INTO orders (user_id, cargo_number, status, payment_status, date_sent, cost) VALUES
(2, 'VP-1001', 'в пути', 'не оплачен', NULL, 0.00),
(3, 'VP-1002', 'готов к выдаче на ФФ', 'оплачен', '2025-01-15', 1200.00);
