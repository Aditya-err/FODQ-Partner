# Phase 18 — Inventory & Stock Management Foundation

## Executive Summary
Phase 18 introduces the foundational restaurant inventory and stock tracking architecture to the FODQ SaaS operating system. It provides restaurant owners with tenant-isolated, ledger-backed, and concurrency-safe control over ingredients and raw stock, authoritative backend status classifications, and full movement history auditability.

---

## 1. Existing Architecture Discovered
- **Database & Multitenancy**: PostgreSQL serves as the authoritative, permanent persistence layer using UUID primary keys. All tenant-scoped entities link to `restaurants.id` via `restaurant_id` with foreign key constraints and `ondelete="CASCADE"`.
- **Tenant Context & Identity**: Tenant context is resolved server-side through `get_current_tenant` validating `X-Restaurant-ID` against the authenticated owner's `RestaurantUser` association. Client-supplied restaurant IDs are never trusted.
- **RBAC Enforcement**: The existing permission model uses `RolePermission` and `Permission` lookup. The permission `manage_inventory` has been added to `ALL_PERMISSIONS` and granted to restaurant owner roles.
- **Audit Logging**: Existing `audit_logs` table persists structured mutations with entity types, actor UUIDs, IPs, and jsonb event metadata.

---

## 2. Inventory Item Data Model
Table: `inventory_items`

| Column | Type | Constraints / Description |
| :--- | :--- | :--- |
| `id` | `UUID` | Primary Key, UUIDv4 |
| `restaurant_id` | `UUID` | Foreign Key (`restaurants.id`), Indexed, Not Null |
| `name` | `VARCHAR(150)` | Ingredient/Product name (e.g., "Basmati Rice") |
| `description` | `TEXT` | Optional detailed notes or specs |
| `category` | `VARCHAR(100)` | Optional category (e.g., "Grains", "Oils", "Dairy") |
| `unit` | `VARCHAR(20)` | Controlled measurement unit (see section 3) |
| `current_quantity` | `NUMERIC(12, 3)`| Authoritative current balance, Non-negative |
| `minimum_quantity` | `NUMERIC(12, 3)`| Minimum threshold before stock is flagged low |
| `reorder_quantity` | `NUMERIC(12, 3)`| Reorder threshold triggering restocking |
| `maximum_quantity` | `NUMERIC(12, 3)`| Target / max capacity ceiling |
| `is_active` | `BOOLEAN` | Active state (default `TRUE`) |
| `created_at` | `TIMESTAMPTZ` | Timestamp of creation |
| `updated_at` | `TIMESTAMPTZ` | Timestamp of latest mutation |

---

## 3. Unit of Measurement
Units are constrained to an explicit controlled set to prevent arbitrary strings and unit corruption:
- `KG` (Kilogram)
- `G` (Gram)
- `LITRE` (Litre)
- `ML` (Millilitre)
- `PIECE` (Piece / Unit count)
- `PACKET` (Packet)
- `BOTTLE` (Bottle)
- `BOX` (Box)

*Note: In Phase 18, silent cross-unit conversions (e.g. converting Litres to Millilitres or Kilograms to Grams on the fly) are strictly avoided. All stock operations must be transacted in the item's established unit of measurement.*

---

## 4. Stock Level Semantics & Authoritative Status Calculation
Stock status is authoritatively evaluated on the backend:

```python
def calculate_status(self) -> StockStatus:
    curr = float(self.current_quantity)
    min_q = float(self.minimum_quantity)
    reorder_q = float(self.reorder_quantity)

    if curr <= 0:
        return StockStatus.OUT_OF_STOCK
    elif curr <= min_q:
        return StockStatus.LOW_STOCK
    elif curr <= reorder_q:
        return StockStatus.REORDER_REQUIRED
    else:
        return StockStatus.IN_STOCK
```

### Threshold Invariants:
- `minimum_quantity >= 0`
- `minimum_quantity <= reorder_quantity <= maximum_quantity` (when `maximum_quantity > 0`)
- `current_quantity >= 0` (strictly non-negative)

---

## 5. Stock Movement Ledger & Transaction Strategy
Table: `inventory_movements` (Immutable history)

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | Primary Key, UUIDv4 |
| `inventory_item_id` | `UUID` | FK to `inventory_items.id` |
| `restaurant_id` | `UUID` | FK to `restaurants.id` |
| `movement_type` | `VARCHAR(30)` | `OPENING_BALANCE`, `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT` |
| `quantity` | `NUMERIC(12, 3)`| Quantity changed |
| `previous_balance`| `NUMERIC(12, 3)`| Authoritative balance before transaction |
| `resulting_balance`| `NUMERIC(12, 3)`| Authoritative balance after transaction |
| `reason` | `VARCHAR(500)` | Mandatory reason for auditability |
| `reference` | `VARCHAR(100)` | Optional invoice, shipment, or batch reference |
| `user_id` | `UUID` | FK to `users.id` (actor who executed the change) |
| `created_at` | `TIMESTAMPTZ` | Timestamp of movement |

### Transactional Guarantees:
Every stock change updates the `inventory_items.current_quantity`, inserts a record into `inventory_movements`, and appends an entry to `audit_logs` inside a single atomic PostgreSQL transaction.

---

## 6. Concurrency & Negative Stock Protection
- **Pessimistic Row Locking**: When executing a movement, the backend issues:
  ```python
  stmt = select(InventoryItem).where(
      InventoryItem.id == item_id,
      InventoryItem.restaurant_id == tenant.id
  ).with_for_update()
  ```
  This locks the item's row exclusively until the transaction commits.
- **Race Condition Prevention**:
  - Two concurrent requests (+5 kg and -4 kg from 10 kg) serialize safely, arriving deterministically at 11 kg with no lost updates.
  - Two concurrent stock-out requests (-4 kg and -4 kg from 5 kg) serialize safely: the first succeeds (balance drops to 1 kg), while the second is rejected with `400 Bad Request ("Insufficient stock")`. The balance never falls negative.

---

## 7. API Endpoints
Base URL: `/api/v1/owner/inventory`

- `GET /` — List inventory items with summary counters (`total_items`, `in_stock`, `low_stock`, `reorder_required`, `out_of_stock`), search, category, and status filters.
- `POST /` — Create an inventory item (atomically records `OPENING_BALANCE` movement if initial quantity > 0).
- `GET /{id}` — Fetch item details with backend-calculated authoritative status.
- `PUT /{id}` — Update item metadata and threshold settings.
- `POST /{id}/movement` — Execute stock movement (`ADD`, `REMOVE`, `ADJUST`). Requires row lock, validates non-negative stock, and records movement + audit entry.
- `GET /{id}/movements` — Fetch movement audit history (chronologically descending).

---

## 8. Admin Web UI
Implemented at `frontend/admin/app/(admin)/inventory/page.tsx`:
- **KPI Summary Cards**: Total Items, In Stock, Low Stock, Reorder Needed, Out of Stock.
- **Search & Filters**: Instant search by item/category name and quick filter buttons by status.
- **Inventory Table**: Item details, current balance with unit, thresholds, status badge, and action triggers.
- **Modals**:
  - Item Creation Modal (supports units, initial stock, and threshold levels)
  - Stock Operation Modal (Add, Remove, Adjust with mandatory reason and reference)
  - Stock Movement Ledger Modal (audit history display with previous/resulting balances and timestamps)

---

## 9. Verification & Test Coverage
The suite `backend/tests/test_phase18_inventory.py` covers all 26 scenarios:
1. `test_create_inventory_item` — PASSED
2. `test_retrieve_inventory_item` — PASSED
3. `test_update_inventory_item` — PASSED
4. `test_valid_units` — PASSED
5. `test_invalid_unit` — PASSED
6. `test_quantity_cannot_be_negative` — PASSED
7. `test_minimum_reorder_maximum_validation` — PASSED
8. `test_correct_stock_status` — PASSED
9. `test_add_stock` — PASSED
10. `test_remove_stock` — PASSED
11. `test_adjustment_stock` — PASSED
12. `test_negative_stock_protection` — PASSED
13. `test_stock_movement_created` — PASSED
14. `test_resulting_balance_correct` — PASSED
15. `test_actor_recorded` — PASSED
16. `test_reason_required` — PASSED
17. `test_atomic_movement_and_balance_update` — PASSED
18. `test_concurrent_stock_adjustment` — PASSED (Verified pessimistic lock serialized updates)
19. `test_concurrent_stock_out_protection` — PASSED (Verified race condition prevention against negative stock)
20. `test_tenant_isolation` — PASSED (Cross-tenant read/write blocked with 404)
21. `test_unauthorized_access` — PASSED (Missing permissions/tokens return 401/403)
22. `test_inactive_item_behavior` — PASSED
23. `test_existing_restaurant_unaffected` — PASSED
24. `test_existing_orders_unaffected` — PASSED
25. `test_existing_billing_unaffected` — PASSED
26. `test_existing_session_order_flow_unaffected` — PASSED

---

## 10. Boundaries & Intentional Exclusions (Non-Goals)
The following are intentionally NOT part of Phase 18 and are deferred to subsequent phases:
- ❌ Automatic recipe consumption / BOM linkage on order placement
- ❌ Recipe / ingredient-to-menu-item mapping
- ❌ Purchase orders, supplier catalog, and procurement workflows
- ❌ Wastage logging and approval analytics
- ❌ Next-day forecasting and automated demand predictions
