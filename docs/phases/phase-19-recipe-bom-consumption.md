# Phase 19 — Recipe / BOM Mapping & Automatic Ingredient Consumption

## Executive Summary
Phase 19 successfully connects Menu Items, Recipe Bills of Materials (BOM), Inventory Items, Customer Orders, and the Phase 18 Inventory Stock Ledger into an authoritative, transactional, and idempotent ingredient consumption pipeline in FODQ.

---

## 1. Architecture Discovered & Integrated
- **Menu Items (`menu_items`)**: Core dish definition with preparation times, categories, and prices.
- **Inventory Items (`inventory_items`)**: Stores authoritative current stock, minimum stock, reorder quantities, and units.
- **Inventory Movements (`inventory_movements`)**: Immutable ledger recording all additions, deductions, and adjustments with previous and resulting balances.
- **Orders & Order Items (`orders`, `order_items`)**: Dine-in and pickup orders placed by customers or staff.
- **Kitchen Flow (`order_kitchen.py`)**: Transitions orders between `PENDING`, `ACCEPTED`, `PREPARING`, `READY`, and `SERVED`.

---

## 2. Data Models Implemented (`backend/app/models/recipe.py`)

### `Recipe`
- `id`: UUID (Primary Key)
- `restaurant_id`: UUID (Tenant isolation foreign key)
- `menu_item_id`: UUID (Unique per menu item)
- `version`: Integer (Monotonically incremented on recipe edits)
- `is_active`: Boolean
- `created_at`, `updated_at`: UTC timestamps

### `RecipeIngredient`
- `id`: UUID (Primary Key)
- `recipe_id`: UUID (Foreign Key to `recipes.id`, cascade delete)
- `inventory_item_id`: UUID (Foreign Key to `inventory_items.id`)
- `quantity_per_menu_unit`: Numeric(12, 3) (> 0)
- `unit`: InventoryUnit enum (`KG`, `G`, `LITRE`, `ML`, `PIECE`, `PACKET`, `BOTTLE`, `BOX`)
- Unique constraint: `(recipe_id, inventory_item_id)` to prevent duplicate ingredient assignments.

### `OrderItemRecipeSnapshot`
- `id`: UUID (Primary Key)
- `order_item_id`: UUID (Foreign Key to `order_items.id`)
- `inventory_item_id`: UUID
- `ingredient_name`: String
- `recipe_version`: Integer
- `quantity_per_unit`: Numeric(12, 3)
- `unit`: InventoryUnit
- `total_consumed_quantity`: Numeric(12, 3)
- `inventory_unit`: InventoryUnit

### Order Extension
- `orders.inventory_consumed`: Boolean (default `False`, indexed)

---

## 3. Controlled Unit Compatibility Matrix
The system enforces strict unit compatibility rules and rejects incompatible combinations (e.g. attempting to measure rice in milliliters or piece):
- **Mass**: `KG ↔ G` (1 KG = 1000 G)
- **Volume**: `LITRE ↔ ML` (1 LITRE = 1000 ML)
- **Count / Units**: `PIECE ↔ PIECE`, `PACKET ↔ PACKET`, `BOTTLE ↔ BOTTLE`, `BOX ↔ BOX` (1:1 conversion only)

Incompatible mappings raise an HTTP 400 Bad Request error.

---

## 4. Authoritative Consumption Lifecycle & Idempotency
- **Lifecycle Point**: Order placement / checkout (`order_customer.py`) with fallback checks during kitchen state transitions (`ACCEPTED` / `PREPARING`).
- **Idempotency Guarantee**: Protected by `order.inventory_consumed` flag and explicit database row locks (`SELECT ... FOR UPDATE`).
- **Concurrency & Deadlock Prevention**: All inventory rows affected by an order are sorted by UUID before acquiring PostgreSQL row locks (`with_for_update()`).
- **Negative Stock Protection**: If any required ingredient has insufficient stock, the transaction is rejected immediately with HTTP 400 Bad Request, preventing negative inventory. No partial deductions occur.
- **Stock Ledger Integration**: Deductions are committed atomically into `inventory_movements` with `movement_type = "ORDER_CONSUMPTION"` and `reference = f"ORDER-{order.id}"`.

---

## 5. Recipe Snapshot & Versioning Strategy
When an owner edits an existing recipe, the recipe's version increments from $V$ to $V+1$. Existing orders preserve their `OrderItemRecipeSnapshot` records, ensuring that historical consumption remains strictly immutable and reproducible even if recipe ingredient proportions change in the future.

---

## 6. Admin / Owner Web Interface
In `frontend/admin/app/(admin)/menu/page.tsx`:
- A "Recipe / BOM" action button opens a dedicated modal for each menu item.
- Displays current recipe ingredients with live inventory stock and status badges.
- Dynamic addition/removal of ingredients with quantity inputs and unit selectors.
- Strict client and server-side validation against duplicate ingredients or negative values.

---

## 7. Verification Evidence
- **Targeted Test Suite**: `backend/tests/test_phase19_recipe_bom.py` (28/28 tests passed, 100% pass rate).
- Key verified test scenarios:
  1. Recipe creation, retrieval, updates, and soft/hard deletion.
  2. Multi-ingredient composition and duplicate prevention.
  3. Positive quantity validation and strict unit compatibility.
  4. Cross-tenant menu and inventory access protections.
  5. Customer RBAC restriction against recipe modification.
  6. Recipe snapshots upon order placement.
  7. Order item quantity multiplication ($N \times \text{recipe quantity}$).
  8. Independent consumption for additional orders on the same table.
  9. Ledger entry verification with previous and resulting balances.
  10. Idempotent consumption and duplicate deduction prevention.
  11. Insufficient stock and concurrent order race-condition protections (no negative stock).
  12. Historical recipe immutability after recipe version changes.
  13. Compatibility with existing order, billing, session closure, and KDS flows.
