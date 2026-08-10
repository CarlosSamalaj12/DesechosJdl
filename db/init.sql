-- ====================================================================
-- Desperdicios JDL — Schema + Seeds
-- Ejecutar con: node backend/db_init.cjs
-- Equivale a: mysql -h ... -u ... -p < db/init.sql
-- ====================================================================

CREATE DATABASE IF NOT EXISTS desperdicios_jdl
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE desperdicios_jdl;

-- --------------------------------------------------------------------
-- Usuarios (sistema independiente, no comparte con el CRM)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(190) UNIQUE NOT NULL,
  full_name     VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin','operator') NOT NULL DEFAULT 'operator',
  area_id       INT NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_area (area_id),
  CONSTRAINT fk_user_area FOREIGN KEY (area_id) REFERENCES waste_areas(id)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------
-- Áreas del hotel (restaurante, cocina, bar, etc.)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waste_areas (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80) UNIQUE NOT NULL,
  description VARCHAR(255),
  color       CHAR(7) DEFAULT '#10b981',
  icon        VARCHAR(40) DEFAULT 'trash-2',
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- --------------------------------------------------------------------
-- Categorías de desecho (configurables; seeds con las 7 del cliente)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waste_categories (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(60) UNIQUE NOT NULL,
  slug       VARCHAR(40) UNIQUE NOT NULL,
  color      CHAR(7) DEFAULT '#6366f1',
  icon       VARCHAR(40) DEFAULT 'package',
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

-- --------------------------------------------------------------------
-- Registro diario: libras por (día, área, categoría)
-- UNIQUE evita duplicados; UPSERT desde la app.
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waste_records (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_date DATE NOT NULL,
  area_id     INT NOT NULL,
  category_id INT NOT NULL,
  pounds      DECIMAL(10,2) NOT NULL,
  notes       VARCHAR(255),
  recorded_by INT NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_daily (record_date, area_id, category_id),
  KEY idx_date (record_date),
  KEY idx_area (area_id),
  KEY idx_category (category_id),
  CONSTRAINT fk_rec_area     FOREIGN KEY (area_id)     REFERENCES waste_areas(id),
  CONSTRAINT fk_rec_category FOREIGN KEY (category_id) REFERENCES waste_categories(id),
  CONSTRAINT fk_rec_user     FOREIGN KEY (recorded_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------
-- Headcount global: 1 fila por día
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_headcount (
  record_date  DATE PRIMARY KEY,
  people_count INT UNSIGNED NOT NULL,
  notes        VARCHAR(255),
  recorded_by  INT NOT NULL,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_hc_user FOREIGN KEY (recorded_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------
-- Plan de reducción
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reduction_plans (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  area_id          INT,
  category_id      INT,
  title            VARCHAR(120) NOT NULL,
  description      TEXT,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  target_pct       DECIMAL(5,2),
  target_lb_person DECIMAL(8,3),
  status           ENUM('active','completed','expired','cancelled')
                     NOT NULL DEFAULT 'active',
  responsible_id   INT,
  created_by       INT NOT NULL,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_status (status),
  KEY idx_dates (start_date, end_date),
  CONSTRAINT fk_plan_area    FOREIGN KEY (area_id)        REFERENCES waste_areas(id),
  CONSTRAINT fk_plan_cat     FOREIGN KEY (category_id)    REFERENCES waste_categories(id),
  CONSTRAINT fk_plan_resp    FOREIGN KEY (responsible_id) REFERENCES users(id),
  CONSTRAINT fk_plan_creator FOREIGN KEY (created_by)     REFERENCES users(id)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------
-- Pasos del plan (checklist)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reduction_plan_steps (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  plan_id    INT NOT NULL,
  step_order INT NOT NULL,
  title      VARCHAR(200) NOT NULL,
  is_done    TINYINT(1) NOT NULL DEFAULT 0,
  done_at    DATETIME,
  done_by    INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_plan (plan_id),
  CONSTRAINT fk_step_plan FOREIGN KEY (plan_id) REFERENCES reduction_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_step_user FOREIGN KEY (done_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------
-- Auditoría mínima
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT,
  action     VARCHAR(60) NOT NULL,
  entity     VARCHAR(60) NOT NULL,
  entity_id  INT,
  payload    JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  KEY idx_entity (entity, entity_id)
) ENGINE=InnoDB;

-- --------------------------------------------------------------------
-- Seeds
-- --------------------------------------------------------------------
INSERT INTO waste_categories (name, slug, color, icon, sort_order) VALUES
  ('Orgánico',          'organico',         '#16a34a', 'leaf',              1),
  ('Plástico',          'plastico',         '#3b82f6', 'package',           2),
  ('Cartón',            'carton',           '#a16207', 'box',               3),
  ('Vidrio / Botellas', 'vidrio-botellas',  '#0891b2', 'wine',              4),
  ('Papel',             'papel',            '#64748b', 'file-text',         5),
  ('Loza quebrada',     'loza',             '#dc2626', 'alert-triangle',    6),
  ('Cristalería rota',  'cristaleria',      '#7c3aed', 'alert-octagon',     7)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Las áreas las crea el admin desde el panel.
-- El admin seed lo crea el backend (no se hardcodea el hash aquí).
