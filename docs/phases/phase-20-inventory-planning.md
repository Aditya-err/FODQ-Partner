# Phase 20 — Daily Stock Requirement & Next-Day Requirement Planning

## Executive Summary
Phase 20 delivers a deterministic, explainable, read-only operational planning engine for restaurant owners in FODQ. It connects menu sales, recipe BOM mapping, real-time inventory balances, and historical order trends into actionable daily and next-day ingredient requirement calculations and suggested purchase quantities.

---

## 1. Architecture Discovered & Integrated
- **Menu Items (`menu_items`)**: Dish definitions with prices, prep times, and categories.
- **Recipe / BOM (`recipes`, `recipe_ingredients`)**: Component breakdown defining ingredient quantities and units consumed per unit of menu dish.
- **Inventory Items (`inventory_items`)**: Source of truth for real-time stock balances, units, and operational thresholds (`minimum_quantity`, `reorder_quantity`, `maximum_quantity`).
- **Orders & Order Items (`orders`, `order_items`)**: Real customer and staff orders placed across dine-in and pickup.
- **Inventory Movements (`inventory_movements`)**: Immutable ledger recording actual stock mutations and order consumption (`MovementType.ORDER_CONSUMPTION`).
- **Planning Adjustments (`inventory_planning_adjustments`)**: New persistent model storing owner-specified date-bound manual adjustments for next-day planning.

---

## 2. Distinct Business Concepts & Mathematical Formulations

The engine enforces strict separation between distinct operational metrics:

### A. Current Stock
Authoritative, live balance retrieved directly from PostgreSQL (`InventoryItem.current_quantity`).

### B. Daily Theoretical Requirement
For a given business date $D$:
$$\text{Theoretical Req}(I) = \sum_{M \in \text{Menu Dishes}} \Big(\text{Sold Qty}(M) \times \text{Recipe Qty}(M, I) \text{ converted to } \text{unit}(I)\Big)$$
- Evaluates only eligible orders placed within business date $D$.

### C. Actual Consumption
Sum of recorded `ORDER_CONSUMPTION` ledger movements for ingredient $I$ on business date $D$.
$$\text{Variance}(I) = \text{Actual Consumed}(I) - \text{Theoretical Req}(I)$$

### D. Projected Remaining Stock
$$\text{Projected Remaining}(I) = \text{Current Stock}(I) - \text{Theoretical Req}(I)$$
- Strictly read-only; no stock is deducted when viewing or calculating requirements.

### E. Operational Status Rules
Deterministic status assignment based on Phase 18 inventory thresholds:
1. `SHORTAGE`: If $\text{Projected Remaining} < 0$.
2. `LOW_AFTER_PROJECTED_CONSUMPTION`: If $0 \le \text{Projected Remaining} \le \text{minimum\_quantity}$.
3. `REORDER_REQUIRED`: If $\text{minimum\_quantity} < \text{Projected Remaining} \le \text{reorder\_quantity}$.
4. `SUFFICIENT`: If $\text{Projected Remaining} > \text{reorder\_quantity}$ and $\text{Projected Remaining} > \text{minimum\_quantity}$.

### F. Purchase Requirement Foundation
Calculates the additional stock the restaurant should arrange to restore inventory to healthy operational levels:
- If status is `SHORTAGE`, `LOW_AFTER_PROJECTED_CONSUMPTION`, or `REORDER_REQUIRED`:
  $$\text{Target Stock} = \begin{cases} \text{maximum\_quantity}, & \text{if } \text{maximum\_quantity} > \text{reorder\_quantity} > 0 \\ \max(\text{reorder\_quantity}, \text{minimum\_quantity}), & \text{otherwise} \end{cases}$$
  $$\text{Suggested Purchase} = \max\Big(0, \text{round}\big(\text{Target Stock} - \text{Projected Remaining}, 3\big)\Big)$$
- If status is `SUFFICIENT`:
  $$\text{Suggested Purchase} = 0.0$$

---

## 3. Order Lifecycle & Eligibility Rules
- **Included Order Statuses**:
  - `PENDING`, `ACCEPTED`, `PREPARING`, `READY`, `SERVED`, `COMPLETED`
  - Valid demand representing kitchen preparation and operational consumption.
- **Excluded Order Statuses**:
  - `CANCELLED`, `REJECTED`
  - Explicitly excluded from theoretical demand and planning aggregations.

---

## 4. Date & Business-Date Timezone Architecture
- FODQ operates under Indian Standard Time (IST, `UTC+05:30` / `Asia/Kolkata`).
- A business day $D$ begins at $00:00:00\text{ IST}$ and concludes at $23:59:59\text{ IST}$.
- The service dynamically converts local business day boundaries into UTC timestamps `[start_utc, end_utc)` for database queries against `Order.created_at`.
- Supports an explicit `target_date=YYYY-MM-DD` query parameter with validation.

---

## 5. Next-Day Requirement Planning & Historical Baseline
- **Methodology**: Deterministic rolling average baseline across a configurable historical window (default 7 days).
- **Formula**:
  For each menu dish $M$:
  $$\text{Daily Avg Qty}(M) = \frac{\sum_{t \in \text{Window}} \text{Sold Qty}(M)}{\text{Window Days}}$$
  $$\text{Base Estimated Requirement}(I) = \sum_{M} \Big(\text{Daily Avg Qty}(M) \times \text{Recipe Qty}(M, I)\Big)$$
- **Manual Planning Adjustment**:
  Owners can apply positive or negative overrides for planned events (e.g. $+3\text{ kg}$ for event catering):
  $$\text{Final Planned Requirement}(I) = \max\Big(0, \text{Base Estimated Requirement}(I) + \text{Manual Adjustment}(I)\Big)$$
  - Adjustments are persisted in `inventory_planning_adjustments` without modifying actual physical inventory.

---

## 6. Audit Drill-Down
Provides complete audit transparency explaining why any ingredient requirement exists:
- Item name and base unit
- Contributing menu dishes
- Orders sold or rolling daily average sold
- Recipe requirement per menu unit
- Total contribution to the ingredient's requirement

---

## 7. Performance & Anti-N+1 Strategy
- Single SQL group-by query aggregates all order sales per menu item for the target window.
- Single query eagerly loads all active recipes and ingredients (`selectinload(Recipe.ingredients)`).
- Single query loads all active inventory items for the restaurant.
- In-memory calculation completes in $\mathcal{O}(M + N)$ time with 0 extra queries.

---

## 8. Tenant Isolation & RBAC
- All lookups, aggregations, and adjustments are filtered by `restaurant_id == tenant.id`.
- Cross-tenant lookups return HTTP 404 Not Found.
- Access requires `manage_inventory` permission. Customer tokens receive HTTP 401/403.

---

## 9. Admin / Owner Web Interface
In `frontend/admin/app/(admin)/inventory/page.tsx`:
- Top-level tab switcher:
  1. `Current Stock & Movements`
  2. `Today's Requirement`
  3. `Next-Day Planning`
- Today's Requirement features date selection, KPI overview cards (Shortages, Low Stock, Reorder Needed), full comparison table, and "Why?" drilldown modal.
- Next-Day Planning features target date selection, historical rolling window selector (3, 7, 14, 30 days), KPI overview, "Adjust Plan" modal, and drilldown inspection.

---

## 10. API Specification
- `GET /api/v1/owner/inventory/planning/daily`: Returns today's theoretical requirements, live stock, variance, status, and suggested purchases.
- `GET /api/v1/owner/inventory/planning/next-day`: Returns next-day requirement planning estimate, manual adjustments, and suggested purchases.
- `POST /api/v1/owner/inventory/planning/adjustments`: Creates or updates a manual planning adjustment.
- `DELETE /api/v1/owner/inventory/planning/adjustments/{item_id}`: Reverts manual adjustments.
- `GET /api/v1/owner/inventory/planning/breakdown/{item_id}`: Returns granular drilldown breakdown of dish contributions.

---

## 11. Verification Results
- **Targeted Tests**: `backend/tests/test_phase20_inventory_planning.py` (28/28 passed, 100% pass rate).
- **Frontend Builds**: `frontend/admin`, `frontend/customer`, `frontend/kitchen` (0 build errors).
- **Regression Tests**: All regression suites covering Phases 14-19, Orders, KDS, Billing, and Session Closure passed.
