# Phase 22 — Wastage, Stock Variance & Inventory Loss Management

## 1. Executive Summary

Phase 22 enhances the FODQ Restaurant Operating System by establishing an authoritative **Wastage & Inventory Loss Management** foundation alongside a deterministic **Theoretical vs. Actual Stock Consumption & Variance Analysis** engine.

This phase completes the operational audit loop:
```
Menu Item Order
  └──> Recipe / BOM (Phase 19)
         ├──> Theoretical Consumption = Order Qty × Recipe Qty
         └──> Actual Consumption = Immutable ORDER_CONSUMPTION Movements (Phase 19)
                └──> Variance = Actual Consumption - Theoretical Consumption
                       └──> Stock Variance Analysis (Read-Only Audit)
Physical Loss Event
  └──> Explicit Wastage Recording (Phase 22)
         ├──> Required Reason Category (SPOILAGE, EXPIRY, PREPARATION_LOSS, etc.)
         ├──> Atomic Deduction with Negative Stock Protection
         ├──> Immutable Ledger Movement (movement_type = "WASTAGE")
         └──> Controlled Reversal via Compensating ADJUSTMENT_IN
```

### Critical Architectural Boundaries Preserved:
1. **Zero Automatic Variance-to-Wastage Conversion:** Variance reporting is strictly an analytical, read-only audit tool. A variance never automatically creates wastage records or alters stock balances.
2. **PostgreSQL as Permanent Source of Truth:** All physical inventory deductions, wastage records, and ledger events are persisted directly into PostgreSQL tables wrapped in atomic database transactions.
3. **Immutability of Ledger:** Historical wastage movements are never rewritten or deleted. Reversals create compensating adjustment movements with explicit audit reasons.
4. **Tenant Isolation & RBAC:** Multi-tenant boundaries are strictly enforced at the database query level; operations require authenticated owner/staff credentials with `manage_inventory` permission.

---

## 2. Wastage Data Model

Physical stock loss is tracked in the `inventory_wastages` table, linked to the restaurant tenant and inventory item.

### Database Table: `inventory_wastages`
- `id` (`UUID`, Primary Key, default `uuid.uuid4`)
- `restaurant_id` (`UUID`, Foreign Key -> `restaurants.id` ON DELETE CASCADE, Indexed, Non-nullable)
- `inventory_item_id` (`UUID`, Foreign Key -> `inventory_items.id` ON DELETE RESTRICT, Indexed, Non-nullable)
- `quantity` (`NUMERIC(12, 3)`, Positive Decimal, Non-nullable)
- `unit` (`VARCHAR(20)`, Non-nullable, must match inventory item unit)
- `reason_category` (`VARCHAR(50)`, Non-nullable, Enum `WastageReason`)
- `notes` (`TEXT`, Optional contextual details)
- `recorded_by` (`UUID`, Foreign Key -> `users.id`, Optional actor reference)
- `movement_id` (`UUID`, Foreign Key -> `inventory_movements.id`, Indexed, Optional)
- `idempotency_key` (`VARCHAR(100)`, Indexed, Optional unique client submission token)
- `is_reversed` (`BOOLEAN`, Default `False`, Non-nullable)
- `reversal_reason` (`TEXT`, Optional rationale when reversed)
- `reversed_at` (`TIMESTAMP WITH TIME ZONE`, Optional reversal timestamp)
- `reversed_by` (`UUID`, Foreign Key -> `users.id`, Optional reversing actor reference)
- `reversal_movement_id` (`UUID`, Foreign Key -> `inventory_movements.id`, Optional compensating ledger ID)
- `created_at` / `updated_at` (`TIMESTAMP WITH TIME ZONE`, Default UTC now)

### Wastage Reason Categories (`WastageReason`)
Uncontrolled freeform loss reasons are rejected in favor of structured audit categories:
- `SPOILAGE`: Organic decay, mold, souring, or biological deterioration.
- `EXPIRY`: Reached or exceeded manufacturer expiration or shelf-life date.
- `PREPARATION_LOSS`: Trimming waste, butcher yield loss, peeling loss, or kitchen prep errors.
- `BURNED`: Overcooked, scorched, or charred dish waste during preparation.
- `DAMAGED`: Dropped packaging, crushed containers, punctured bags, or broken glassware.
- `SPILLAGE`: Accidental liquid drops, overturned saucepans, or counter spills.
- `CONTAMINATION`: Foreign objects, sanitation breach, pest incident, or allergen cross-contamination.
- `OVER_PRODUCTION`: Excess prepared batches that could not be preserved or sold.
- `COUNTING_ERROR`: Physical audit discrepancies not attributable to stock correction.
- `UNKNOWN`: Unexplained inventory deficit requiring formal owner review.

---

## 3. Inventory Movement & Physical Deduction

Physical loss is not merely an accounting note—it represents stock leaving the physical premises. Recording wastage automatically decreases available inventory balance.

### Movement Type: `WASTAGE`
Added to `MovementType` enum alongside `ADD`, `REMOVE`, `ADJUSTMENT`, `PURCHASE_RECEIPT`, and `ORDER_CONSUMPTION`.

### Atomic Transaction Strategy
Every wastage event executes within an atomic PostgreSQL transaction:
```python
async with db.begin():
    # 1. Acquire row-level lock on the item
    item = await db.execute(
        select(InventoryItem)
        .where(InventoryItem.id == item_id, InventoryItem.restaurant_id == restaurant_id)
        .with_for_update()
    )
    # 2. Enforce negative stock protection
    if item.current_quantity < wastage_quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock")
    
    # 3. Calculate balances
    previous_balance = item.current_quantity
    resulting_balance = previous_balance - wastage_quantity
    item.current_quantity = resulting_balance
    
    # 4. Create immutable ledger movement
    movement = InventoryMovement(
        inventory_item_id=item.id,
        restaurant_id=restaurant_id,
        movement_type=MovementType.WASTAGE.value,
        quantity=-wastage_quantity,
        previous_balance=previous_balance,
        resulting_balance=resulting_balance,
        reason=f"Physical wastage: {reason_category}",
        reference=idempotency_key,
        user_id=user_id
    )
    db.add(movement)
    await db.flush()
    
    # 5. Insert wastage audit entity
    wastage = InventoryWastage(
        inventory_item_id=item.id,
        restaurant_id=restaurant_id,
        quantity=wastage_quantity,
        unit=unit,
        reason_category=reason_category,
        movement_id=movement.id,
        ...
    )
    db.add(wastage)
```

### Strict Negative Stock Protection
If an item has `5.000 KG` and an operator attempts to record `6.000 KG` wastage, the backend immediately rejects the mutation with HTTP `400 Bad Request` (`Insufficient stock`). The item balance remains untouched at `5.000 KG`, and neither a wastage entity nor an inventory movement is written.

### Concurrency & Row Locking
Concurrent deductions against the same ingredient (e.g. two operators recording wastage simultaneously or concurrent kitchen consumption) are serialized via `SELECT ... FOR UPDATE`. No lost updates or negative balances can occur.

### Durable Idempotency
Clients supply an optional `idempotency_key` (via JSON payload or `X-Idempotency-Key` header). If an identical key is presented within the restaurant tenant, the backend returns the previously recorded wastage record without executing a second stock deduction.

### Wastage Reversal Strategy
To prevent ledger fraud, historical `WASTAGE` ledger movements are immutable and cannot be deleted or rewritten. If a wastage record was logged erroneously (e.g. miscount), an authorized user invokes the reversal endpoint:
1. Validates that `is_reversed == False` and a non-empty `reversal_reason` is supplied.
2. Acquires row lock on the `InventoryItem`.
3. Adds `wastage.quantity` back to `current_quantity`.
4. Writes an immutable `ADJUSTMENT_IN` movement into `InventoryMovement` documenting `Compensating reversal of wastage {wastage_id}`.
5. Updates `is_reversed=True`, `reversed_at`, `reversed_by`, and `reversal_movement_id`.

---

## 4. Theoretical vs. Actual Consumption & Variance Analysis

The daily variance engine computes discrepancies between theoretical recipe expectations and actual physical consumption across the restaurant's operational business date.

### Definitions & Formulas

#### 1. Theoretical Consumption
The quantity of an ingredient that should have been consumed according to paid/active orders and their configured recipes:
$$\text{Theoretical Consumption} = \sum_{\text{Orders in Date}} (\text{Order Item Quantity} \times \text{Recipe Ingredient Quantity})$$
Where recipe ingredient quantities are converted to base inventory units using Phase 19 conversion rules.

#### 2. Actual Consumption
The physical stock deducted for food orders, derived solely from authoritative ledger records created during order processing:
$$\text{Actual Consumption} = \sum |\text{Movement Quantity}| \quad \text{where } \text{movement\_type} = \text{ORDER\_CONSUMPTION} \text{ in date window}$$

#### 3. Variance
The numerical difference between actual and theoretical consumption:
$$\text{Variance} = \text{Actual Consumption} - \text{Theoretical Consumption}$$

#### 4. Variance Percentage
$$\text{Variance \%} = \begin{cases} 
\left(\frac{\text{Actual} - \text{Theoretical}}{\text{Theoretical}}\right) \times 100 & \text{if Theoretical} > 0 \\
0.0 & \text{if Theoretical} = 0 \text{ and Actual} = 0 \\
100.0 & \text{if Theoretical} = 0 \text{ and Actual} > 0
\end{cases}$$

#### 5. Tolerance Rule
Configurable restaurant or system-wide threshold (default: $\pm 5.0\%$).
- `WITHIN_TOLERANCE`: $|\text{Variance \%}| \le \text{Tolerance \%}$
- `OVER_CONSUMPTION`: $\text{Variance \%} > +\text{Tolerance \%}$ (Actual usage exceeded theoretical recipe requirement, e.g. over-portioning or unrecorded prep spillage).
- `UNDER_CONSUMPTION`: $\text{Variance \%} < -\text{Tolerance \%}$ (Actual usage was less than theoretical recipe requirement, e.g. under-portioning or batch carryover).

#### 6. Physical Wastage Display
Recorded physical wastage (`movement_type = "WASTAGE"`) during the same business date is displayed alongside variance figures. This gives management full visibility into whether an over-consumption variance matches explicit loss records or stems from portioning drift.

#### 7. Contributing Menu Item Attribution
Where recipe mappings exist, the variance endpoint returns an itemized breakdown of contributing menu dishes:
- `menu_item_name`: The ordered dish name.
- `quantity_sold`: Number of portions ordered.
- `recipe_quantity_per_unit`: Ingredient required per portion.
- `expected_consumption`: Total theoretical ingredient demand for that dish.

---

## 5. API Reference

All routes are mounted under `/api/v1/owner/inventory/` and require JWT authentication with `manage_inventory` permission.

### Wastage Endpoints (`/api/v1/owner/inventory/wastage`)
- `POST /api/v1/owner/inventory/wastage`: Records physical wastage, atomically creates `WASTAGE` ledger entry, and deducts inventory balance.
- `GET /api/v1/owner/inventory/wastage`: Lists historical wastage events with date-range, item, and category filters.
- `GET /api/v1/owner/inventory/wastage/summary`: Returns aggregate loss KPIs, quantity by reason, and top wasted ingredients.
- `POST /api/v1/owner/inventory/wastage/{wastage_id}/reverse`: Executes a controlled reversal via compensating `ADJUSTMENT_IN` movement.

### Variance Endpoints (`/api/v1/owner/inventory/variance`)
- `GET /api/v1/owner/inventory/variance/daily`: Computes daily theoretical vs actual consumption, variance, variance %, status badges, and contributing menu items for a restaurant business date.

---

## 6. Admin Web Dashboard Implementation

The Owner/Admin web application (`frontend/admin/app/(admin)/inventory/page.tsx`) incorporates Phase 22 directly into the existing Inventory portal:

### 1. Stock Variance & Consumption Tab (`activeTab = "variance"`)
- **Date & Status Filters:** Quick date navigation with filter by `OVER_CONSUMPTION`, `UNDER_CONSUMPTION`, or `WITHIN_TOLERANCE`.
- **KPI Summary Cards:** Monitored Ingredients, Over-Consumption Count, Under-Consumption Count, Within Tolerance Count.
- **Authoritative Analysis Table:** Ingredient, Category, Theoretical Consumption, Actual Ledger Consumption, Numerical Variance, Variance %, Recorded Wastage, Current Available Stock, Status Badge, and Dish Attribution button.
- **Menu Attribution Modal:** Drilldown showing each menu dish sold, recipe unit demand, and expected contribution.

### 2. Wastage & Loss Management Tab (`activeTab = "wastage"`)
- **Period Filter:** Date range selector with Category dropdown filter.
- **KPI Summary Cards:** Total Loss Events, Total Quantity Lost, Top Wasted Ingredient, and Loss Reason Category counts.
- **Wastage Ledger Table:** Formatted date/time, ingredient name, lost quantity, reason badge, recorded by actor, notes, status (`Active Loss` vs `Reversed`), and action button.
- **Record Wastage Modal:** Dropdown with live stock balance display (`Item (Stock: 12.500 KG)`), step-validated quantity input, unit lock, required reason category, optional auditor notes, idempotency key generation, and negative-stock warning.
- **Reversal Confirmation Modal:** Displays original loss context, mandates a reversal explanation, and creates a compensating ledger entry.

---

## 7. Verification & Test Evidence

### Targeted Test Suite: `backend/tests/test_phase22_wastage_variance.py`
A comprehensive 34-point test suite was executed against the active PostgreSQL database:

| # | Test Case Description | Result |
|---|---|---|
| 01 | Create wastage record successfully | **PASSED** |
| 02 | Retrieve wastage record by ID and listing | **PASSED** |
| 03 | Required reason category validation | **PASSED** |
| 04 | Valid wastage quantity deduction | **PASSED** |
| 05 | Invalid zero quantity rejected (422) | **PASSED** |
| 06 | Negative wastage quantity rejected (422) | **PASSED** |
| 07 | Insufficient stock rejected (400, no balance change) | **PASSED** |
| 08 | Inventory decreases correctly after wastage | **PASSED** |
| 09 | Inventory movement created with type `WASTAGE` | **PASSED** |
| 10 | Previous and resulting balances computed accurately | **PASSED** |
| 11 | Wastage record and stock movement are atomic | **PASSED** |
| 12 | Wastage idempotency key returns identical record | **PASSED** |
| 13 | Duplicate wastage calls do not deduct stock twice | **PASSED** |
| 14 | Concurrent wastage protection (`SELECT ... FOR UPDATE`) | **PASSED** |
| 15 | All structured wastage categories supported | **PASSED** |
| 16 | Wastage audit actor correctly attributed to User ID | **PASSED** |
| 17 | Tenant isolation enforced (cross-tenant rejected) | **PASSED** |
| 18 | Unauthorized access rejected without JWT/permission | **PASSED** |
| 19 | Business date filtering for daily variance | **PASSED** |
| 20 | Theoretical consumption calculation from recipes | **PASSED** |
| 21 | Actual consumption calculation from order movements | **PASSED** |
| 22 | Variance calculation ($\text{Actual} - \text{Theoretical}$) | **PASSED** |
| 23 | Variance percentage calculation with tolerance check | **PASSED** |
| 24 | Zero theoretical consumption handled cleanly (0.0% / 100.0%) | **PASSED** |
| 25 | Wastage does not automatically modify variance | **PASSED** |
| 26 | Variance does not automatically modify stock balance | **PASSED** |
| 27 | Purchase receipts unaffected (`PURCHASE_RECEIPT`) | **PASSED** |
| 28 | Order consumption unaffected (`ORDER_CONSUMPTION`) | **PASSED** |
| 29 | Existing inventory foundation unaffected | **PASSED** |
| 30 | Existing procurement foundation unaffected | **PASSED** |
| 31 | Existing recipe/BOM foundation unaffected | **PASSED** |
| 32 | Existing requirement planning unaffected | **PASSED** |
| 33 | Existing active orders unaffected | **PASSED** |
| 34 | Existing billing active session bills unaffected | **PASSED** |

**Targeted Test Score:** **34 passed in 32.77s (100%)**

---

### Backend Multi-Phase Regression Suite
Regression testing verified that Phases 18, 19, 20, 21, and 22 operate harmoniously with zero side effects:
- Command: `pytest tests/test_phase18_inventory.py tests/test_phase19_recipe_bom.py tests/test_phase20_inventory_planning.py tests/test_phase21_procurement.py tests/test_phase22_wastage_variance.py -q`
- Result: **151 passed in 228.04s (100% pass rate)**

---

### Frontend Builds & Mobile Verification
All web applications and mobile clients were built and tested to verify type safety and cross-platform integrity:
- `frontend/admin`: `npm run build` -> **Compiled successfully in 4.3s, 0 TypeScript errors, 12 static routes generated (Exit code 0)**.
- `frontend/customer`: `npm run build` -> **Compiled successfully in 2.2s, 0 TypeScript errors, 8 static/dynamic routes generated (Exit code 0)**.
- `frontend/kitchen`: `npm run build` -> **Compiled successfully in 2.4s, 0 TypeScript errors, 4 static routes generated (Exit code 0)**.
- `mobile/customer`: `flutter test` -> **10 tests passed (Exit code 0)**.
- `mobile/owner-app`: `flutter test` -> **4 tests passed (Exit code 0)**.

---

## 8. Known Limitations & Future Roadmap

1. **Photo Evidence:** File attachment for wastage records was documented as a future enhancement to avoid uncontrolled local file storage without dedicated object-storage buckets (S3 / Cloudinary).
2. **Food-Cost Financial Valuation:** Phase 22 isolates physical quantity loss from monetary cost evaluation; procurement pricing was established in Phase 21 and will feed future food-cost and P&L financial modules in later phases.
3. **Automated Tolerances:** Tolerance percentage is currently system-configurable; individual item-level tolerance thresholds can be introduced in subsequent configuration sprints.
