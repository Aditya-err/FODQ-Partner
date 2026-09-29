# Phase 21 — Procurement & Purchase Order Foundation

## 1. Executive Summary

Phase 21 expands the FODQ Restaurant Operating System by introducing an end-to-end **Procurement Foundation**, **Supplier Management Foundation**, and **Purchase Order (PO) Lifecycle**. It bridges Phase 20's automated requirement planning and advisory purchase calculations directly into an authoritative, owner-controlled procurement pipeline with atomic, idempotent stock receiving into the Phase 18 inventory ledger.

The complete supply chain loop is now closed:
```
Inventory Item
  └──> Recipe/BOM (Phase 19)
         └──> Order Consumption (Phase 19)
                └──> Daily / Next-Day Requirement Planning (Phase 20)
                       └──> Suggested Advisory Purchase (Phase 20)
                              └──> Purchase Order Creation (Phase 21)
                                     └──> Supplier Coordination (Phase 21)
                                            └──> Atomic Stock Receiving (Phase 21)
                                                   └──> Inventory Physical Balance & Ledger (Phase 18)
```

---

## 2. Supplier Model & Tenant Isolation

Suppliers are strictly scoped to a tenant restaurant via `restaurant_id`. A restaurant cannot view, query, or map suppliers belonging to any other restaurant.

### Database Table: `suppliers`
- `id` (UUID, Primary Key)
- `restaurant_id` (UUID, Foreign Key -> `restaurants.id` ON DELETE CASCADE, Indexed)
- `name` (VARCHAR(150), Indexed, Non-nullable)
- `contact_person` (VARCHAR(100), Optional)
- `phone` (VARCHAR(30), Optional)
- `email` (VARCHAR(120), Optional)
- `address` (TEXT, Optional)
- `tax_identifier` (VARCHAR(50), Optional — GSTIN/VAT/Tax ID)
- `payment_terms` (VARCHAR(50), Optional — e.g. NET30, COD, Weekly)
- `notes` (TEXT, Optional)
- `is_active` (BOOLEAN, Default True)
- `created_at` / `updated_at` (TIMESTAMP WITH TIME ZONE)

An inactive supplier cannot be chosen for new purchase orders or have new items mapped to it.

---

## 3. Supplier ↔ Inventory Item Relationship

An inventory item can be sourced from one or more active suppliers, and a supplier supplies multiple inventory items. This relationship maintains separate packaging units and conversion rates.

### Database Table: `supplier_items`
- `id` (UUID, Primary Key)
- `restaurant_id` (UUID, Foreign Key -> `restaurants.id`)
- `supplier_id` (UUID, Foreign Key -> `suppliers.id` ON DELETE CASCADE, Indexed)
- `inventory_item_id` (UUID, Foreign Key -> `inventory_items.id` ON DELETE CASCADE, Indexed)
- `supplier_sku` (VARCHAR(100), Optional)
- `purchase_unit` (VARCHAR(20), Non-nullable — e.g., "25 KG BAG", "CRATE", "BOX")
- `conversion_factor` (NUMERIC(12, 3), Non-nullable, Default 1.0)
- `purchase_price` (INTEGER, Non-nullable, Default 0 — Stored in integer paise, e.g. ₹1,600 = 160000 paise)
- `minimum_order_quantity` (NUMERIC(12, 3), Default 1.0)
- `lead_time_days` (INTEGER, Default 1)
- `is_preferred` (BOOLEAN, Default False)
- `is_active` (BOOLEAN, Default True)
- `created_at` / `updated_at` (TIMESTAMP WITH TIME ZONE)
- `UniqueConstraint("supplier_id", "inventory_item_id")`

### Unit Compatibility & Packaging Multiplier
- Stock Unit: The physical consumption unit defined on `InventoryItem` (e.g. `KG`).
- Purchase Unit: The commercial packaging unit from the vendor (e.g. `25 KG BAG`).
- `conversion_factor`: When 1 purchase unit is received, $\text{stock\_added} = \text{round}(\text{quantity\_received} \times \text{conversion\_factor}, 3)$ base inventory units are added to physical inventory.

---

## 4. Purchase Order Model & Server-Side Numbering

Authoritative purchase orders are tenant-scoped and server-numbered.

### Database Table: `purchase_orders`
- `id` (UUID, Primary Key)
- `restaurant_id` (UUID, Foreign Key -> `restaurants.id`, Indexed)
- `supplier_id` (UUID, Foreign Key -> `suppliers.id`, Indexed)
- `po_number` (VARCHAR(50), Non-nullable, Unique per restaurant)
- `status` (Enum: `DRAFT`, `SUBMITTED`, `CONFIRMED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED`)
- `order_date` (DATE, Non-nullable)
- `expected_date` (DATE, Optional)
- `notes` (TEXT, Optional)
- `subtotal` (INTEGER, Default 0, Paise)
- `tax_amount` (INTEGER, Default 0, Paise)
- `total_amount` (INTEGER, Default 0, Paise)
- `created_by` (UUID, Foreign Key -> `users.id`, Optional)
- `created_at` / `updated_at` (TIMESTAMP WITH TIME ZONE)

### Database Table: `purchase_order_items`
- `id` (UUID, Primary Key)
- `purchase_order_id` (UUID, Foreign Key -> `purchase_orders.id` ON DELETE CASCADE, Indexed)
- `inventory_item_id` (UUID, Foreign Key -> `inventory_items.id`, Indexed)
- `ordered_quantity` (NUMERIC(12, 3), Non-nullable)
- `purchase_unit` (VARCHAR(20), Non-nullable)
- `conversion_factor` (NUMERIC(12, 3), Default 1.0)
- `unit_price` (INTEGER, Non-nullable, Paise)
- `total_price` (INTEGER, Non-nullable, Paise)
- `received_quantity` (NUMERIC(12, 3), Default 0.0)
- `remaining_quantity` (NUMERIC(12, 3), Default 0.0)
- `notes` (TEXT, Optional)
- `created_at` / `updated_at` (TIMESTAMP WITH TIME ZONE)

### PO Number Generation
PO numbers follow the format `PO-{YYYY}-{seq:06d}` (e.g. `PO-2026-000001`). The sequence is generated server-side within the restaurant's scope and validated against collisions.

---

## 5. State Machine & Lifecycle Transitions

```
               ┌──────────┐
               │  DRAFT   ├────────┐
               └────┬─────┘        │
                    │ submit       │
                    ▼              │
               ┌──────────┐        │
               │SUBMITTED ├────────┤
               └────┬─────┘        │
                    │ confirm      │ cancel
                    ▼              │
               ┌──────────┐        │
               │CONFIRMED ├────────┤
               └────┬─────┘        │
                    │ receive      │
                    ▼              │
        ┌───────────────────────┐  │
        │  PARTIALLY_RECEIVED   ├──┘
        └───────────┬───────────┘
                    │ full receive
                    ▼
               ┌──────────┐
               │ RECEIVED │  (Terminal, physical stock posted, cannot cancel)
               └──────────┘
```

### Transition Validation Rules:
1. `DRAFT -> SUBMITTED`: Requires active supplier and $\ge 1$ item.
2. `SUBMITTED -> CONFIRMED`: Marks PO as ready for stock receipt.
3. `CONFIRMED -> PARTIALLY_RECEIVED`: Occurs automatically when $0 < \text{received} < \text{ordered}$.
4. `CONFIRMED / PARTIALLY_RECEIVED -> RECEIVED`: Occurs automatically when all line items have $\text{remaining\_quantity} \le 0$.
5. Cancellation:
   - `DRAFT`, `SUBMITTED`, `CONFIRMED` can be freely cancelled.
   - `PARTIALLY_RECEIVED` cancellation zeroes remaining unreceived balances without modifying already received physical stock.
   - `RECEIVED` cannot be cancelled.

---

## 6. Phase 20 Suggested Purchase Integration

Phase 20's daily planning and next-day requirement calculations produce advisory `suggested_purchase_quantity` values based on stock levels, consumption rates, and menu recipes.

1. `/api/v1/owner/procurement/suggested-purchases?mode=daily|next-day`:
   - Inspects Phase 20 planning outputs where `suggested_purchase_quantity > 0`.
   - Annotates each item with active supplier mappings and identifies the `preferred_supplier`.
2. One-Click Draft PO:
   - In the Admin UI, owners click `[Create Draft PO]` on any suggested line item.
   - Pre-populates the PO creation dialog with the preferred supplier, suggested quantity, and supplier-item purchase price.
   - **Crucial Rule**: POs are **never automatically placed**. The suggestion is advisory; the owner retains complete authority.

---

## 7. Purchase Price Snapshot Strategy

Historical purchase orders snapshot the negotiated unit price (`unit_price`) at the moment the PO is created/updated in `DRAFT` status.
If the supplier changes prices later in `supplier_items`, existing historical POs and their lines retain their historical price permanently.

---

## 8. Stock Receiving Pipeline, Idempotency & Concurrency

Receiving purchased stock is an operational transaction that updates physical inventory:

1. **Transaction & Row Locking**:
   - The purchase order is fetched with `selectinload(items)`.
   - Inventory item rows are locked using `select(...).with_for_update().order_by(InventoryItem.id.asc())`.
   - Sorting by item ID prevents deadlocks when multiple concurrent receipts occur.
2. **Idempotency Guarantee**:
   - Each receipt payload accepts an `idempotency_key` (via body or `X-Idempotency-Key` header).
   - If a duplicate receipt request is transmitted (network retry, double-click, browser reload), the server detects the key in `PurchaseOrderReceipt` and immediately returns the previously committed receipt result without re-crediting physical stock.
3. **Over-Receipt Protection**:
   - For every receipt line: $\text{qty\_to\_receive} \le \text{po\_item.remaining\_quantity}$.
   - Over-receipt attempts return `HTTP 400 Bad Request`.
4. **Physical Ledger Movement**:
   - An immutable record is created in `inventory_movements`:
     - `movement_type = "PURCHASE_RECEIPT"`
     - `quantity = qty_to_receive * conversion_factor`
     - `previous_balance = current_quantity`
     - `resulting_balance = current_quantity + quantity`
     - `reference = po.po_number`
     - `reason = f"Stock received on {po.po_number} (Receipt {receipt_number}) from {supplier.name}"`
   - `inventory_items.current_quantity` is updated to `resulting_balance`.

---

## 9. API Reference

### Suppliers
- `GET /api/v1/owner/procurement/suppliers`: List restaurant suppliers (supports `search` and `active_only`).
- `POST /api/v1/owner/procurement/suppliers`: Create supplier (201 Created).
- `GET /api/v1/owner/procurement/suppliers/{supplier_id}`: Get supplier detail with mapped inventory items.
- `PUT /api/v1/owner/procurement/suppliers/{supplier_id}`: Update supplier metadata.
- `PATCH /api/v1/owner/procurement/suppliers/{supplier_id}/status`: Activate or deactivate supplier.
- `POST /api/v1/owner/procurement/suppliers/{supplier_id}/items`: Map inventory item with packaging units, price, conversion factor, and preferred flag.
- `DELETE /api/v1/owner/procurement/suppliers/{supplier_id}/items/{inventory_item_id}`: Remove item mapping.

### Advisory Planning Integration
- `GET /api/v1/owner/procurement/suggested-purchases?mode=daily|next-day`: Retrieve Phase 20 suggested purchases annotated with supplier mappings.

### Purchase Orders
- `GET /api/v1/owner/procurement/purchase-orders`: List purchase orders (filtered by `status_filter`, `supplier_id`).
- `POST /api/v1/owner/procurement/purchase-orders`: Create draft purchase order with authoritative server-side totals.
- `GET /api/v1/owner/procurement/purchase-orders/{po_id}`: Get detailed PO with all line items and completion metrics.
- `PUT /api/v1/owner/procurement/purchase-orders/{po_id}`: Update draft PO details or items.
- `POST /api/v1/owner/procurement/purchase-orders/{po_id}/items`: Add/update an item in draft PO.
- `DELETE /api/v1/owner/procurement/purchase-orders/{po_id}/items/{item_id}`: Remove an item from draft PO.
- `POST /api/v1/owner/procurement/purchase-orders/{po_id}/submit`: Transition from `DRAFT` to `SUBMITTED`.
- `POST /api/v1/owner/procurement/purchase-orders/{po_id}/confirm`: Transition from `SUBMITTED` to `CONFIRMED`.
- `POST /api/v1/owner/procurement/purchase-orders/{po_id}/cancel`: Cancel PO according to lifecycle semantics.

### Stock Receiving & Receipts
- `POST /api/v1/owner/procurement/purchase-orders/{po_id}/receive`: Atomic, idempotent stock receiving endpoint.
- `GET /api/v1/owner/procurement/purchase-orders/{po_id}/receipts`: Retrieve receipt audit history for a purchase order.

---

## 10. Owner / Admin UI Implementation

The Admin Web application incorporates a dedicated, responsive procurement dashboard (`/procurement`):

1. **Purchase Orders Tab**:
   - Filter bar: ALL, DRAFT, SUBMITTED, CONFIRMED, PARTIAL RECEIPT, RECEIVED, CANCELLED.
   - Search by PO # or supplier name.
   - Status badges with contextual action buttons: View, Submit, Confirm, Receive Stock, Cancel.
   - Detailed PO modal displaying line-item remaining vs received quantities and authoritative total calculations.
2. **Suppliers Tab**:
   - Complete supplier directory with contact details, GSTIN, and active status toggles.
   - Modal to add/edit suppliers and manage the supplier's catalog with package conversion factors and preferred flags.
3. **Suggested Purchases Tab**:
   - Real-time Phase 20 advisory purchases with "Today's Daily Demand" vs "Next-Day Window Forecast" modes.
   - Preferred supplier mapping and unit pricing display.
   - One-click `[Create Draft PO]` pre-populating draft order lines.
4. **Stock Receiving Modal**:
   - Opens on confirmed POs, displays current ordered/received/remaining quantities.
   - Real-time input capped at remaining balance.
   - Posts stock directly into the Phase 18 inventory ledger upon confirmation.
5. **Inventory Link**:
   - Seamless cross-navigation button `[Procurement & POs]` added to the main Inventory header.

---

## 11. Verification Evidence

### Phase 21 Targeted Tests
35 out of 35 test cases in `backend/tests/test_phase21_procurement.py` passed:
```
tests/test_phase21_procurement.py::test_01_create_supplier PASSED        [  2%]
tests/test_phase21_procurement.py::test_02_retrieve_supplier PASSED      [  5%]
tests/test_phase21_procurement.py::test_03_update_supplier PASSED        [  8%]
tests/test_phase21_procurement.py::test_04_activate_deactivate_supplier PASSED [ 11%]
tests/test_phase21_procurement.py::test_05_supplier_tenant_isolation PASSED [ 14%]
tests/test_phase21_procurement.py::test_06_map_supplier_to_inventory_item PASSED [ 17%]
tests/test_phase21_procurement.py::test_07_invalid_cross_tenant_mapping_rejected PASSED [ 20%]
tests/test_phase21_procurement.py::test_08_create_draft_po PASSED        [ 22%]
tests/test_phase21_procurement.py::test_09_add_po_items PASSED           [ 25%]
tests/test_phase21_procurement.py::test_10_server_side_po_totals PASSED  [ 28%]
tests/test_phase21_procurement.py::test_11_unique_po_number PASSED       [ 31%]
tests/test_phase21_procurement.py::test_12_draft_po_does_not_alter_inventory PASSED [ 34%]
tests/test_phase21_procurement.py::test_13_convert_phase20_suggested_purchase_into_draft_po PASSED [ 37%]
tests/test_phase21_procurement.py::test_14_submit_po PASSED              [ 40%]
tests/test_phase21_procurement.py::test_15_confirm_po PASSED             [ 42%]
tests/test_phase21_procurement.py::test_16_receive_full_po PASSED        [ 45%]
tests/test_phase21_procurement.py::test_17_partial_receipt PASSED        [ 48%]
tests/test_phase21_procurement.py::test_18_multiple_partial_receipts PASSED [ 51%]
tests/test_phase21_procurement.py::test_19_po_status_updates_correctly PASSED [ 54%]
tests/test_phase21_procurement.py::test_20_receipt_creates_inventory_ledger_movement PASSED [ 57%]
tests/test_phase21_procurement.py::test_21_inventory_balance_updated_correctly PASSED [ 60%]
tests/test_phase21_procurement.py::test_22_receipt_idempotency PASSED    [ 62%]
tests/test_phase21_procurement.py::test_23_concurrent_receipt_protection PASSED [ 65%]
tests/test_phase21_procurement.py::test_24_over_receipt_rejected PASSED  [ 68%]
tests/test_phase21_procurement.py::test_25_cancellation_rules PASSED     [ 71%]
tests/test_phase21_procurement.py::test_26_received_po_cannot_silently_erase_stock PASSED [ 74%]
tests/test_phase21_procurement.py::test_27_historical_purchase_price_preserved PASSED [ 77%]
tests/test_phase21_procurement.py::test_28_inactive_supplier_cannot_receive_new_po PASSED [ 80%]
tests/test_phase21_procurement.py::test_29_unauthorized_access PASSED    [ 82%]
tests/test_phase21_procurement.py::test_30_tenant_isolation PASSED       [ 85%]
tests/test_phase21_procurement.py::test_31_existing_inventory_flow_unaffected PASSED [ 88%]
tests/test_phase21_procurement.py::test_32_existing_recipe_bom_unaffected PASSED [ 91%]
tests/test_phase21_procurement.py::test_33_existing_planning_unaffected PASSED [ 94%]
tests/test_phase21_procurement.py::test_34_existing_orders_unaffected PASSED [ 97%]
tests/test_phase21_procurement.py::test_35_existing_billing_unaffected PASSED [100%]

======================= 35 passed, 3 warnings in 45.93s =======================
```

### Full Regression Test Suite
126 out of 126 regression tests across phases 16 through 20 passed:
```
tests/test_phase20_inventory_planning.py
tests/test_phase19_recipe_bom.py
tests/test_phase18_inventory.py
tests/test_phase17_prep_time.py
tests/test_phase16_table_capacity.py
======================= 126 passed in 171.14s (0:02:51) =======================
```

### Frontend Production Builds
- `frontend/admin`: Next.js 16.3.1 Turbopack build succeeded (`✓ Compiled successfully`, `Route /procurement static prerendered`).
- `frontend/customer`: Next.js 16.3.1 Turbopack build succeeded.
- `frontend/kitchen`: Next.js 16.3.1 Turbopack build succeeded.
- `mobile/customer`: `flutter test` passed (10/10 tests passed).
- `mobile/owner-app`: `flutter test` passed (4/4 tests passed).

---

## 12. Known Limitations & Future Phase Handoffs

1. **Supplier Invoicing & Accounts Payable**: Phase 21 intentionally stops at physical stock receipt and ledger posting. Supplier bill settlement, credit balances, payment capture, and bank transfers belong to a future Accounts Payable/Finance phase.
2. **Goods Return / Wastage Workflow**: Damaged goods returns and supplier credit notes will be integrated into future wastage and credit lifecycle phases.
3. **Automated Bidding / RFQs**: RFQ distribution, supplier ratings, and vendor bidding are excluded by design to keep the core restaurant workflow focused and lean.
