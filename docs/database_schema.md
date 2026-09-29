# FODQ — Database Schema

## 1. Design Principles

- **Multi-tenant:** Every restaurant-owned entity has a `restaurant_id` foreign key.
- **Exact Money:** All monetary columns use `NUMERIC(10, 2)` — never FLOAT/DOUBLE.
- **Audit Fields:** Every table includes `created_at` and `updated_at`.
- **Soft Deletion:** Applied only where business requirements justify it (e.g., menu items referenced by historical orders).
- **UUID Primary Keys:** All primary keys use UUID v4 for unpredictability and distributed safety.
- **Foreign Keys & Constraints:** Enforced at the database level, not just the application level.
- **Indexes:** Created based on actual query patterns (documented per table).

---

## 2. Entity Catalog

### 2.1 `users`

Core account table for owners, managers, kitchen staff, cashiers, and platform admins.

| Column              | Type                  | Constraints                        |
|---------------------|-----------------------|------------------------------------|
| `id`                | UUID                  | PK, DEFAULT gen_random_uuid()      |
| `email`             | VARCHAR(255)          | NOT NULL, UNIQUE                   |
| `password_hash`     | VARCHAR(255)          | NOT NULL                           |
| `full_name`         | VARCHAR(150)          | NOT NULL                           |
| `phone`             | VARCHAR(20)           | NULLABLE, UNIQUE                   |
| `is_active`         | BOOLEAN               | NOT NULL, DEFAULT TRUE             |
| `is_platform_admin` | BOOLEAN               | NOT NULL, DEFAULT FALSE            |
| `last_login_at`     | TIMESTAMPTZ           | NULLABLE                          |
| `failed_login_count`| INTEGER               | NOT NULL, DEFAULT 0                |
| `locked_until`      | TIMESTAMPTZ           | NULLABLE                          |
| `created_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |
| `updated_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |

**Indexes:** `idx_users_email` (UNIQUE), `idx_users_phone` (UNIQUE, partial WHERE phone IS NOT NULL)

---

### 2.2 `restaurants`

Each restaurant is a tenant.

| Column              | Type                  | Constraints                        |
|---------------------|-----------------------|------------------------------------|
| `id`                | UUID                  | PK                                 |
| `owner_id`          | UUID                  | FK → users(id), NOT NULL           |
| `name`              | VARCHAR(200)          | NOT NULL                           |
| `slug`              | VARCHAR(200)          | NOT NULL, UNIQUE                   |
| `description`       | TEXT                  | NULLABLE                          |
| `logo_url`          | VARCHAR(500)          | NULLABLE                          |
| `address`           | TEXT                  | NULLABLE                          |
| `city`              | VARCHAR(100)          | NULLABLE                          |
| `state`             | VARCHAR(100)          | NULLABLE                          |
| `country`           | VARCHAR(100)          | DEFAULT 'India'                    |
| `phone`             | VARCHAR(20)           | NULLABLE                          |
| `email`             | VARCHAR(255)          | NULLABLE                          |
| `currency`          | VARCHAR(3)            | NOT NULL, DEFAULT 'INR'            |
| `tax_rate`          | NUMERIC(5, 2)         | NOT NULL, DEFAULT 0.00             |
| `service_charge_rate`| NUMERIC(5, 2)        | NOT NULL, DEFAULT 0.00             |
| `is_active`         | BOOLEAN               | NOT NULL, DEFAULT TRUE             |
| `created_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |
| `updated_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |

**Indexes:** `idx_restaurants_owner_id`, `idx_restaurants_slug` (UNIQUE)

---

### 2.3 `staff_members`

Links users to restaurants with specific roles. A user can be staff at multiple restaurants.

| Column              | Type                  | Constraints                        |
|---------------------|-----------------------|------------------------------------|
| `id`                | UUID                  | PK                                 |
| `user_id`           | UUID                  | FK → users(id), NOT NULL           |
| `restaurant_id`     | UUID                  | FK → restaurants(id), NOT NULL     |
| `role`              | VARCHAR(20)           | NOT NULL, CHECK IN ('OWNER','MANAGER','KITCHEN','CASHIER','STAFF') |
| `is_active`         | BOOLEAN               | NOT NULL, DEFAULT TRUE             |
| `created_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |
| `updated_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |

**Constraints:** UNIQUE(`user_id`, `restaurant_id`)
**Indexes:** `idx_staff_restaurant_id`, `idx_staff_user_id`

---

### 2.4 `tables`

Physical tables within a restaurant.

| Column              | Type                  | Constraints                        |
|---------------------|-----------------------|------------------------------------|
| `id`                | UUID                  | PK                                 |
| `restaurant_id`     | UUID                  | FK → restaurants(id), NOT NULL     |
| `table_number`      | VARCHAR(20)           | NOT NULL                           |
| `label`             | VARCHAR(50)           | NULLABLE (e.g., "Window Seat 3")   |
| `capacity`          | INTEGER               | NULLABLE, CHECK > 0               |
| `qr_token`          | VARCHAR(64)           | NOT NULL, UNIQUE                   |
| `is_active`         | BOOLEAN               | NOT NULL, DEFAULT TRUE             |
| `created_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |
| `updated_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |

**Constraints:** UNIQUE(`restaurant_id`, `table_number`)
**Indexes:** `idx_tables_restaurant_id`, `idx_tables_qr_token` (UNIQUE)

---

### 2.5 `table_sessions`

A dining session represents one party's visit at a table. Multiple orders can belong to one session.

| Column              | Type                  | Constraints                        |
|---------------------|-----------------------|------------------------------------|
| `id`                | UUID                  | PK                                 |
| `restaurant_id`     | UUID                  | FK → restaurants(id), NOT NULL     |
| `table_id`          | UUID                  | FK → tables(id), NOT NULL          |
| `session_token`     | VARCHAR(64)           | NOT NULL, UNIQUE                   |
| `status`            | VARCHAR(20)           | NOT NULL, DEFAULT 'OPEN', CHECK IN ('OPEN','BILL_REQUESTED','PAYMENT_PENDING','PAID','CLOSED') |
| `customer_phone`    | VARCHAR(20)           | NULLABLE                          |
| `started_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |
| `closed_at`         | TIMESTAMPTZ           | NULLABLE                          |
| `expires_at`        | TIMESTAMPTZ           | NOT NULL                           |
| `created_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |
| `updated_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |

**Indexes:** `idx_sessions_restaurant_id`, `idx_sessions_table_id`, `idx_sessions_token` (UNIQUE), `idx_sessions_status`

---

### 2.6 `menu_categories`

| Column              | Type                  | Constraints                        |
|---------------------|-----------------------|------------------------------------|
| `id`                | UUID                  | PK                                 |
| `restaurant_id`     | UUID                  | FK → restaurants(id), NOT NULL     |
| `name`              | VARCHAR(100)          | NOT NULL                           |
| `description`       | TEXT                  | NULLABLE                          |
| `sort_order`        | INTEGER               | NOT NULL, DEFAULT 0                |
| `is_active`         | BOOLEAN               | NOT NULL, DEFAULT TRUE             |
| `created_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |
| `updated_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |

**Constraints:** UNIQUE(`restaurant_id`, `name`)
**Indexes:** `idx_categories_restaurant_id`

---

### 2.7 `menu_items`

| Column              | Type                  | Constraints                        |
|---------------------|-----------------------|------------------------------------|
| `id`                | UUID                  | PK                                 |
| `restaurant_id`     | UUID                  | FK → restaurants(id), NOT NULL     |
| `category_id`       | UUID                  | FK → menu_categories(id), NOT NULL |
| `name`              | VARCHAR(200)          | NOT NULL                           |
| `description`       | TEXT                  | NULLABLE                          |
| `price`             | NUMERIC(10, 2)        | NOT NULL, CHECK >= 0               |
| `image_url`         | VARCHAR(500)          | NULLABLE                          |
| `preparation_time`  | INTEGER               | NULLABLE (minutes)                 |
| `is_veg`            | BOOLEAN               | NULLABLE                          |
| `is_available`      | BOOLEAN               | NOT NULL, DEFAULT TRUE             |
| `is_recommended`    | BOOLEAN               | NOT NULL, DEFAULT FALSE            |
| `allergens`         | TEXT                  | NULLABLE                          |
| `dietary_info`      | TEXT                  | NULLABLE                          |
| `sort_order`        | INTEGER               | NOT NULL, DEFAULT 0                |
| `is_deleted`        | BOOLEAN               | NOT NULL, DEFAULT FALSE            |
| `created_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |
| `updated_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |

**Indexes:** `idx_items_restaurant_id`, `idx_items_category_id`, `idx_items_available` (partial WHERE is_available = TRUE AND is_deleted = FALSE)

> **Note:** `is_deleted` (soft delete) is used here because historical orders reference menu items. Deleting a menu item must not break existing order data.

---

### 2.8 `orders`

| Column              | Type                  | Constraints                        |
|---------------------|-----------------------|------------------------------------|
| `id`                | UUID                  | PK                                 |
| `restaurant_id`     | UUID                  | FK → restaurants(id), NOT NULL     |
| `session_id`        | UUID                  | FK → table_sessions(id), NOT NULL  |
| `table_id`          | UUID                  | FK → tables(id), NOT NULL          |
| `order_number`      | SERIAL                | NOT NULL (auto-increment per restaurant is handled at app level) |
| `status`            | VARCHAR(20)           | NOT NULL, DEFAULT 'PLACED', CHECK IN ('PLACED','ACCEPTED','PREPARING','READY','SERVED','CANCELLED') |
| `subtotal`          | NUMERIC(10, 2)        | NOT NULL                           |
| `tax_amount`        | NUMERIC(10, 2)        | NOT NULL, DEFAULT 0.00             |
| `discount_amount`   | NUMERIC(10, 2)        | NOT NULL, DEFAULT 0.00             |
| `total`             | NUMERIC(10, 2)        | NOT NULL                           |
| `idempotency_key`   | VARCHAR(64)           | NOT NULL, UNIQUE                   |
| `special_instructions`| TEXT                | NULLABLE                          |
| `placed_at`         | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |
| `accepted_at`       | TIMESTAMPTZ           | NULLABLE                          |
| `preparing_at`      | TIMESTAMPTZ           | NULLABLE                          |
| `ready_at`          | TIMESTAMPTZ           | NULLABLE                          |
| `served_at`         | TIMESTAMPTZ           | NULLABLE                          |
| `cancelled_at`      | TIMESTAMPTZ           | NULLABLE                          |
| `cancellation_reason`| TEXT                 | NULLABLE                          |
| `created_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |
| `updated_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |

**Indexes:** `idx_orders_restaurant_id`, `idx_orders_session_id`, `idx_orders_table_id`, `idx_orders_status`, `idx_orders_idempotency_key` (UNIQUE)

---

### 2.9 `order_items`

| Column              | Type                  | Constraints                        |
|---------------------|-----------------------|------------------------------------|
| `id`                | UUID                  | PK                                 |
| `order_id`          | UUID                  | FK → orders(id), NOT NULL          |
| `menu_item_id`      | UUID                  | FK → menu_items(id), NOT NULL      |
| `item_name`         | VARCHAR(200)          | NOT NULL (snapshot at order time)   |
| `unit_price`        | NUMERIC(10, 2)        | NOT NULL (snapshot at order time)   |
| `quantity`          | INTEGER               | NOT NULL, CHECK > 0               |
| `line_total`        | NUMERIC(10, 2)        | NOT NULL                           |
| `created_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |

**Indexes:** `idx_order_items_order_id`, `idx_order_items_menu_item_id`

> **Note:** `item_name` and `unit_price` are snapshotted at order time so that historical orders remain accurate even if the menu item is later renamed or repriced.

---

### 2.10 `bills`

| Column              | Type                  | Constraints                        |
|---------------------|-----------------------|------------------------------------|
| `id`                | UUID                  | PK                                 |
| `restaurant_id`     | UUID                  | FK → restaurants(id), NOT NULL     |
| `session_id`        | UUID                  | FK → table_sessions(id), NOT NULL, UNIQUE |
| `table_id`          | UUID                  | FK → tables(id), NOT NULL          |
| `bill_number`       | VARCHAR(50)           | NOT NULL                           |
| `subtotal`          | NUMERIC(10, 2)        | NOT NULL                           |
| `tax_amount`        | NUMERIC(10, 2)        | NOT NULL, DEFAULT 0.00             |
| `discount_amount`   | NUMERIC(10, 2)        | NOT NULL, DEFAULT 0.00             |
| `service_charge`    | NUMERIC(10, 2)        | NOT NULL, DEFAULT 0.00             |
| `total`             | NUMERIC(10, 2)        | NOT NULL                           |
| `payment_status`    | VARCHAR(20)           | NOT NULL, DEFAULT 'PENDING', CHECK IN ('PENDING','CONFIRMED','FAILED','REFUNDED') |
| `payment_method`    | VARCHAR(30)           | NULLABLE                          |
| `paid_at`           | TIMESTAMPTZ           | NULLABLE                          |
| `confirmed_by`      | UUID                  | FK → users(id), NULLABLE           |
| `idempotency_key`   | VARCHAR(64)           | NOT NULL, UNIQUE                   |
| `created_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |
| `updated_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |

**Constraints:** UNIQUE(`session_id`) — one bill per session.
**Indexes:** `idx_bills_restaurant_id`, `idx_bills_session_id` (UNIQUE), `idx_bills_payment_status`

---

### 2.11 `reviews`

| Column              | Type                  | Constraints                        |
|---------------------|-----------------------|------------------------------------|
| `id`                | UUID                  | PK                                 |
| `restaurant_id`     | UUID                  | FK → restaurants(id), NOT NULL     |
| `menu_item_id`      | UUID                  | FK → menu_items(id), NOT NULL      |
| `session_id`        | UUID                  | FK → table_sessions(id), NOT NULL  |
| `order_item_id`     | UUID                  | FK → order_items(id), NOT NULL     |
| `rating`            | INTEGER               | NOT NULL, CHECK BETWEEN 1 AND 5   |
| `comment`           | TEXT                  | NULLABLE                          |
| `created_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |

**Constraints:** UNIQUE(`order_item_id`) — one review per ordered item.
**Indexes:** `idx_reviews_menu_item_id`, `idx_reviews_restaurant_id`

---

### 2.12 `audit_logs`

| Column              | Type                  | Constraints                        |
|---------------------|-----------------------|------------------------------------|
| `id`                | UUID                  | PK                                 |
| `restaurant_id`     | UUID                  | NULLABLE (NULL for platform events)|
| `user_id`           | UUID                  | NULLABLE                          |
| `action`            | VARCHAR(50)           | NOT NULL                           |
| `entity_type`       | VARCHAR(50)           | NULLABLE                          |
| `entity_id`         | UUID                  | NULLABLE                          |
| `details`           | JSONB                 | NULLABLE                          |
| `ip_address`        | VARCHAR(45)           | NULLABLE                          |
| `user_agent`        | TEXT                  | NULLABLE                          |
| `created_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |

**Indexes:** `idx_audit_restaurant_id`, `idx_audit_user_id`, `idx_audit_action`, `idx_audit_created_at`

---

### 2.13 `security_events`

| Column              | Type                  | Constraints                        |
|---------------------|-----------------------|------------------------------------|
| `id`                | UUID                  | PK                                 |
| `event_type`        | VARCHAR(50)           | NOT NULL                           |
| `severity`          | VARCHAR(10)           | NOT NULL, CHECK IN ('LOW','MEDIUM','HIGH','CRITICAL') |
| `user_id`           | UUID                  | NULLABLE                          |
| `restaurant_id`     | UUID                  | NULLABLE                          |
| `ip_address`        | VARCHAR(45)           | NULLABLE                          |
| `details`           | JSONB                 | NULLABLE                          |
| `created_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |

**Indexes:** `idx_security_event_type`, `idx_security_severity`, `idx_security_created_at`

---

### 2.14 `refresh_tokens`

| Column              | Type                  | Constraints                        |
|---------------------|-----------------------|------------------------------------|
| `id`                | UUID                  | PK                                 |
| `user_id`           | UUID                  | FK → users(id), NOT NULL           |
| `token_hash`        | VARCHAR(255)          | NOT NULL, UNIQUE                   |
| `device_info`       | VARCHAR(255)          | NULLABLE                          |
| `ip_address`        | VARCHAR(45)           | NULLABLE                          |
| `expires_at`        | TIMESTAMPTZ           | NOT NULL                           |
| `revoked_at`        | TIMESTAMPTZ           | NULLABLE                          |
| `created_at`        | TIMESTAMPTZ           | NOT NULL, DEFAULT NOW()            |

**Indexes:** `idx_refresh_tokens_user_id`, `idx_refresh_tokens_hash` (UNIQUE)

---

### 2.15 `inventory_items` & `inventory_movements` (Phase 18)

Authoritative inventory catalog with pessimistic locking and append-only stock movement ledger.

| Table | Primary Columns | Key Constraints & Indexes |
|---|---|---|
| `inventory_items` | `id` (UUID), `restaurant_id` (UUID), `item_name`, `sku`, `unit`, `current_quantity`, `minimum_quantity`, `cost_per_unit_paise` | FK -> restaurants(id), UNIQUE(restaurant_id, sku) |
| `inventory_movements` | `id` (UUID), `restaurant_id`, `inventory_item_id`, `movement_type`, `quantity`, `balance_after`, `reference_type`, `reference_id` | FK -> inventory_items(id), idx_inventory_movements_item_time |

---

### 2.16 `recipes` & `recipe_ingredients` (Phase 19)

Bill of Materials (BOM) linking menu items with automatic unit conversions for real-time order consumption.

| Table | Primary Columns | Key Constraints & Indexes |
|---|---|---|
| `recipes` | `id` (UUID), `restaurant_id`, `menu_item_id`, `prep_notes`, `yield_servings` | FK -> menu_items(id), UNIQUE(restaurant_id, menu_item_id) |
| `recipe_ingredients` | `id` (UUID), `recipe_id`, `inventory_item_id`, `quantity_per_menu_unit`, `recipe_unit` | FK -> recipes(id), FK -> inventory_items(id) |

---

### 2.17 `daily_prep_plans` & `daily_prep_items` (Phase 20)

Historical demand aggregation and next-day preparation planning.

| Table | Primary Columns | Key Constraints & Indexes |
|---|---|---|
| `daily_prep_plans` | `id` (UUID), `restaurant_id`, `plan_date`, `status`, `buffer_multiplier` | FK -> restaurants(id), UNIQUE(restaurant_id, plan_date) |
| `daily_prep_items` | `id` (UUID), `plan_id`, `menu_item_id`, `projected_quantity`, `actual_prepared` | FK -> daily_prep_plans(id) |

---

### 2.18 `suppliers`, `supplier_items`, `purchase_orders`, `purchase_order_items` (Phase 21)

Procurement lifecycle tracking supplier catalogs, purchase orders, and partial goods receipts.

| Table | Primary Columns | Key Constraints & Indexes |
|---|---|---|
| `suppliers` | `id` (UUID), `restaurant_id`, `supplier_name`, `contact_phone`, `email` | FK -> restaurants(id) |
| `supplier_items` | `id` (UUID), `supplier_id`, `inventory_item_id`, `purchase_price`, `conversion_factor` | FK -> suppliers(id), FK -> inventory_items(id) |
| `purchase_orders` | `id` (UUID), `restaurant_id`, `po_number`, `supplier_id`, `status`, `total_amount_paise` | FK -> restaurants(id), UNIQUE(restaurant_id, po_number) |
| `purchase_order_items` | `id` (UUID), `po_id`, `inventory_item_id`, `ordered_quantity`, `received_quantity`, `unit_price_paise` | FK -> purchase_orders(id) |

---

### 2.19 `inventory_wastage` & `daily_stock_variances` (Phase 22)

Physical wastage incident logging and daily theoretical vs actual stock variance evaluation.

| Table | Primary Columns | Key Constraints & Indexes |
|---|---|---|
| `inventory_wastage` | `id` (UUID), `restaurant_id`, `inventory_item_id`, `quantity`, `reason_category`, `is_reversed` | FK -> inventory_items(id) |
| `daily_stock_variances` | `id` (UUID), `restaurant_id`, `inventory_item_id`, `variance_date`, `theoretical_consumption`, `actual_consumption`, `variance_quantity` | UNIQUE(restaurant_id, inventory_item_id, variance_date) |

---

### 2.20 `financial_ledger_entries`, `refunds`, `financial_anomalies` (Phase 24)

Tamper-evident append-only financial ledger, refund management, and automated discrepancy detection.

| Table | Primary Columns | Key Constraints & Indexes |
|---|---|---|
| `financial_ledger_entries` | `id` (UUID), `restaurant_id`, `event_type`, `amount_paise`, `bill_id`, `payment_id`, `refund_id`, `balance_after_paise` | Immutable (ORM before_update/before_delete listener), compound indexes |
| `refunds` | `id` (UUID), `restaurant_id`, `payment_id`, `bill_id`, `amount_paise`, `status`, `reason` | FK -> payments(id), FK -> bills(id) |
| `financial_anomalies` | `id` (UUID), `restaurant_id`, `anomaly_type`, `severity`, `status`, `details`, `bill_id`, `payment_id` | Compound indexes on (restaurant_id, status) |

---

### 2.21 `cash_closing_sessions` & `cash_adjustments` (Phase 25)

Daily cash closing sessions, denomination breakdown, variance classification, and auditable cash drawer movements.

| Table | Primary Columns | Key Constraints & Indexes |
|---|---|---|
| `cash_closing_sessions` | `id` (UUID), `restaurant_id`, `business_date`, `status`, `opening_float_paise`, `expected_cash_paise`, `cash_sales_paise`, `cash_refunds_paise`, `cash_adjustments_paise`, `counted_cash_paise`, `variance_paise`, `variance_status`, `denominations_json`, `opened_at`, `closed_at`, `version` | Partial UNIQUE(restaurant_id, business_date) WHERE status = 'OPEN', immutable once CLOSED |
| `cash_adjustments` | `id` (UUID), `cash_session_id`, `restaurant_id`, `adjustment_type`, `amount_paise`, `reason`, `created_by_user_id`, `created_by_name`, `created_at` | FK -> cash_closing_sessions(id), FK -> restaurants(id) |

---

## 3. Key Relationships Summary

```text
users 1──M staff_members M──1 restaurants
restaurants 1──M tables
restaurants 1──M menu_categories 1──M menu_items
tables 1──M table_sessions
table_sessions 1──M orders 1──M order_items
table_sessions 1──1 bills 1──M payments
bills 1──M refunds
menu_items 1──M order_items
menu_items 1──1 recipes 1──M recipe_ingredients M──1 inventory_items
inventory_items 1──M inventory_movements
restaurants 1──M suppliers 1──M supplier_items
restaurants 1──M purchase_orders 1──M purchase_order_items
restaurants 1──M inventory_wastage
restaurants 1──M financial_ledger_entries (Append-only)
restaurants 1──M financial_anomalies
restaurants 1──M cash_closing_sessions 1──M cash_adjustments
```

