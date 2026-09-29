# Phase 23 — Food Cost & Profitability Analytics Foundation

## Overview
Phase 23 establishes the foundational **Food Cost & Profitability Analytics Engine** for the FODQ SaaS Restaurant Operating System. It connects the menu catalog, recipes/BOM (Phase 19), inventory unit conversions (Phase 18), procurement purchase orders (Phase 21), physical wastage ledgers (Phase 22), and theoretical vs actual stock variance (Phase 22) into an authoritative, strictly read-only profitability dashboard.

---

## 1. Architectural Principles & Cost Source Strategy

### 1.1 Authoritative Cost Source of Truth
Historical costs and menu margins must be reproducible and not retroactively distorted by future price fluctuations. The engine evaluates ingredient costs using the following strict resolution hierarchy:

1. **Latest Confirmed/Received Purchase Order (`PurchaseOrder` + `PurchaseOrderItem`)**:
   - Matches `restaurant_id` and `inventory_item_id`.
   - Filters orders where `status` is in `[CONFIRMED, PARTIALLY_RECEIVED, RECEIVED]` and `order_date <= as_of_date`.
   - Normalizes to base inventory stock unit:
     $$\text{Cost Paise Per Base Unit} = \text{round}\left(\frac{\text{PurchaseOrderItem.unit\_price}}{\text{PurchaseOrderItem.conversion\_factor}}, 4\right)$$
   - Source tag: `PURCHASE_ORDER`.
2. **Active Preferred Supplier Item Catalog (`SupplierItem`)**:
   - Fallback if no confirmed purchase order exists on or before the analysis date.
   - Matches active, preferred supplier catalog price normalized to base inventory unit:
     $$\text{Cost Paise Per Base Unit} = \text{round}\left(\frac{\text{SupplierItem.purchase\_price}}{\text{SupplierItem.conversion\_factor}}, 4\right)$$
   - Source tag: `SUPPLIER_CATALOG`.
3. **Explicit Missing Cost State**:
   - If no purchase order and no supplier catalog item exist, the ingredient is tagged with `COST_UNAVAILABLE`.
   - **Crucial Rule**: The engine **never silently defaults unknown costs to ₹0**. If any ingredient cost is missing, the dish is flagged with `cost_status: "COST_UNAVAILABLE"`, preventing fabricated margin figures.

---

## 2. Recipe & Menu Item Costing Formulations

### 2.1 Recipe Cost Formula
For each menu item with an active recipe:
$$\text{Ingredient Cost (Paise)} = \sum_{i=1}^{N} \left( \text{convert\_quantity}(q_i, u_i, U_i) \times \text{cost\_paise\_per\_base\_unit}_i \right)$$
where:
- $q_i$: Recipe quantity specified in `RecipeIngredient.quantity_per_menu_unit`.
- $u_i$: Recipe unit (e.g., `G`, `ML`, `PORTION`).
- $U_i$: Base inventory stock unit (e.g., `KG`, `LITRE`).
- `convert_quantity`: Authoritative unit conversion logic from `app.services.recipe_service`.

### 2.2 Food Cost Percentage
$$\text{Food Cost \%} = \frac{\text{Ingredient Cost (Paise)}}{\text{Selling Price (Paise)}} \times 100$$
- If $\text{Selling Price} = 0$, $\text{Food Cost \%} = 0.0\%$ (safe division).
- If recipe is missing or costs unavailable, $\text{Food Cost \%} = \text{None}$ (displayed as `—` or `N/A`).

### 2.3 Gross Contribution (Unit Margin)
$$\text{Gross Contribution} = \text{Selling Price} - \text{Ingredient Cost}$$
> **Important Distinction**: This represents gross contribution before labor, utilities, rent, commissions, or corporate overhead. It is strictly labeled **Gross Contribution** and **never** referred to as "Net Profit".

### 2.4 Status Flags
- `WITHIN_TARGET`: Food Cost % $\le$ configured target threshold (default $30.0\%$).
- `ABOVE_TARGET`: Food Cost % $>$ configured target threshold.
- `COST_UNAVAILABLE`: One or more recipe ingredients lack pricing data.
- `RECIPE_NOT_CONFIGURED`: Menu item has no active recipe BOM.

---

## 3. Period Profitability & Revenue Basis

### 3.1 Sales Revenue Basis
The engine distinguishes between:
- **Gross Menu Sales**: Total list price value of sold items ($\sum \text{OrderItem.quantity} \times \text{OrderItem.unit\_price}$).
- **Realized Sales Revenue**: The authoritative net revenue realized by the restaurant after bill-level discounts or order-level discounts:
  $$\text{Realized Revenue} = \text{Gross Menu Sales} - \text{Total Discounts}$$
- **Discounts**: Aggregated from finalized `Bill.discount_amount` or `Order.total_amount` reductions.

### 3.2 Aggregate Period Metrics
For any selected business date range $[T_{\text{start}}, T_{\text{end}}]$:
- $\text{Total Realized Revenue} = \sum \text{Item Realized Revenue}$
- $\text{Total Ingredient Cost} = \sum (\text{Orders Sold}_j \times \text{Unit Ingredient Cost}_j)$
- $\text{Period Food Cost \%} = \frac{\text{Total Ingredient Cost}}{\text{Total Realized Revenue}} \times 100$
- $\text{Operational Gross Contribution} = \text{Total Realized Revenue} - \text{Total Ingredient Cost} - \text{Total Wastage Cost}$

---

## 4. Wastage & Stock Variance Cost Impact

### 4.1 Physical Wastage Financial Loss
Phase 22 records physical wastage incidents (`InventoryWastage`). Phase 23 converts these physical quantities into actual monetary loss:
$$\text{Wastage Cost Impact} = \text{Wastage Quantity} \times \text{Authoritative Unit Cost}$$
- Grouped by `reason_category` (`SPOILAGE`, `EXPIRY`, `PREPARATION_LOSS`, `BURNED`, `DAMAGED`, `SPILLAGE`, `CONTAMINATION`, `OVER_PRODUCTION`).
- Filtered to non-reversed records (`is_reversed == False`).
- Ranks top wasted ingredients by financial loss.

### 4.2 Over-Consumption Variance Financial Impact
Phase 22 computes daily theoretical vs actual consumption variance. Phase 23 evaluates the financial loss resulting from positive over-consumption variance ($\text{Actual} > \text{Theoretical}$):
$$\text{Variance Cost Impact} = \max(0, \text{Actual} - \text{Theoretical}) \times \text{Authoritative Unit Cost}$$
- **Analytics Only**: Does not alter inventory stock balances or automatically create wastage records.

---

## 5. Security, RBAC & Multi-Tenancy

- **Tenant Isolation**: All database queries strictly scope by `restaurant_id == tenant.id`. Cross-tenant data leakage is cryptographically and logically prohibited.
- **RBAC Authority**: All endpoints require authenticated owner session and the `manage_inventory` permission.
- **Customer Protection**: Customer endpoints never expose ingredient costs, purchase prices, supplier names, margins, or wastage analytics.
- **Monetary Precision**: All monetary values are internally tracked and calculated in integer **paise** ($1\text{ INR} = 100\text{ paise}$). Final display fields format both paise and INR (e.g. `selling_price_paise` and `selling_price_inr`).
- **Read-Only Guarantee**: Executing profitability analytics performs zero mutations to `inventory_items`, `recipes`, `orders`, `bills`, `purchase_orders`, or `inventory_movements`.

---

## 6. API Specifications

All endpoints mounted under `/api/v1/owner/profitability` and `/api/v1/owner/analytics/profitability`:

| Method | Endpoint | Query Parameters | Description |
|---|---|---|---|
| `GET` | `/overview` | `preset`, `start_date`, `end_date`, `target_food_cost_pct` | Executive summary: Realized revenue, ingredient cost, food cost %, wastage cost, variance impact, operational gross contribution, high food cost items. |
| `GET` | `/menu` | `preset`, `start_date`, `end_date`, `category_id`, `search`, `target_food_cost_pct` | Menu profitability table with item selling price, ingredient cost, food cost %, orders sold, gross sales, realized revenue, and gross contribution. |
| `GET` | `/menu/{menu_item_id}` | `as_of_date`, `target_food_cost_pct` | Line-by-line recipe ingredient drilldown with quantities, unit conversions, unit costs, and contribution. |
| `GET` | `/ingredients` | `preset`, `start_date`, `end_date` | Ingredient spend analysis ranked by total consumed cost, showing consumption vs wastage quantities. |
| `GET` | `/wastage` | `preset`, `start_date`, `end_date` | Wastage cost impact grouped by reason category with top loss ingredients. |
| `GET` | `/variance` | `date` | Theoretical vs actual variance financial impact for a given business date. |

---

## 7. Admin / Owner User Interface

Added a new dedicated navigation tab **Profitability & Cost** (`/profitability`) in the Admin Web portal (`frontend/admin/app/(admin)/profitability/page.tsx`):
- **Period Filter Bar**: Instant preset selection (`Today`, `Yesterday`, `Last 7 Days`, `Last 30 Days`, `Custom Range`) with live refresh.
- **Overview Dashboard**:
  - Executive KPI cards for Realized Sales, Recipe Food Cost, Food Cost %, and Operational Gross Contribution.
  - Loss cards for Physical Wastage Loss and Over-Consumption Variance.
  - High Food Cost alert banner highlighting items exceeding target thresholds.
- **Menu Profitability Table**:
  - Real-time search by menu item name.
  - Full financial metrics: selling price, ingredient cost, food cost %, orders sold, realized revenue, total ingredient cost, total gross contribution.
  - Status badges (`TARGET MET`, `ABOVE TARGET`, `NO RECIPE`, `NO COST`).
  - Interactive drilldown modal opening detailed recipe BOM breakdown.
- **Ingredient Spend Dashboard**:
  - Ranking of ingredients by consumed spend.
  - Shows current unit cost, consumed quantity/spend, and wastage quantity/loss.
- **Wastage Impact Dashboard**:
  - Summary metrics and cards broken down by reason category (`Spoilage`, `Prep Loss`, etc.).
  - Top wasted ingredients table.
- **Variance Impact Dashboard**:
  - Daily theoretical vs actual variance with financial impact calculation.

---

## 8. Verification & Test Evidence

### 8.1 Targeted Test Suite (`backend/tests/test_phase23_food_cost.py`)
30 comprehensive test cases covering all requirements:
1. `test_01_recipe_cost_single_ingredient` (PASSED)
2. `test_02_recipe_cost_multiple_ingredients` (PASSED)
3. `test_03_unit_conversion_in_cost_calculation` (PASSED)
4. `test_04_correct_ingredient_cost` (PASSED)
5. `test_05_correct_menu_food_cost_percentage` (PASSED)
6. `test_06_gross_contribution_calculation` (PASSED)
7. `test_07_multiple_menu_items` (PASSED)
8. `test_08_historical_sales_aggregation` (PASSED)
9. `test_09_correct_revenue_basis` (PASSED)
10. `test_10_discount_revenue_behavior` (PASSED)
11. `test_11_zero_revenue_handling` (PASSED)
12. `test_12_missing_recipe_handling` (PASSED)
13. `test_13_missing_ingredient_cost_handling` (PASSED)
14. `test_14_historical_purchase_cost_handling` (PASSED)
15. `test_15_wastage_cost_calculation` (PASSED)
16. `test_16_variance_cost_calculation` (PASSED)
17. `test_17_aggregate_food_cost_percentage` (PASSED)
18. `test_18_ingredient_cost_contribution` (PASSED)
19. `test_19_date_range_filtering` (PASSED)
20. `test_20_business_date_handling` (PASSED)
21. `test_21_tenant_isolation` (PASSED)
22. `test_22_unauthorized_access` (PASSED)
23. `test_23_analytics_read_only_guarantee` (PASSED)
24. `test_24_existing_inventory_unaffected` (PASSED)
25. `test_25_existing_procurement_unaffected` (PASSED)
26. `test_26_existing_wastage_unaffected` (PASSED)
27. `test_27_existing_recipe_bom_unaffected` (PASSED)
28. `test_28_existing_orders_unaffected` (PASSED)
29. `test_29_existing_billing_unaffected` (PASSED)
30. `test_30_existing_planning_unaffected` (PASSED)

**Result**: `30 passed in 39.13s`.

### 8.2 Full Multi-Phase Regression Suite
- **Phases 18 to 23**: `pytest tests/test_phase18_inventory.py tests/test_phase19_recipe_bom.py tests/test_phase20_inventory_planning.py tests/test_phase21_procurement.py tests/test_phase22_wastage_variance.py tests/test_phase23_food_cost.py -q`
  - **Result**: `181 passed in 237.37s`.
- **Phases 14 to 17**: `pytest tests/test_phase14_security.py tests/test_phase15_phone_otp.py tests/test_phase16_table_capacity.py tests/test_phase17_prep_time.py -q`
  - **Result**: `113 passed in 84.61s`.
- **Total Backend Tests Passed**: `294 passed, 0 failed`.

### 8.3 Frontend Builds
- `frontend/admin`: `npm run build` -> **SUCCESS** (Route `/profitability` generated cleanly).
- `frontend/customer`: `npm run build` -> **SUCCESS** (0 errors).
- `frontend/kitchen`: `npm run build` -> **SUCCESS** (0 errors).

### 8.4 Mobile Test Suite
- `mobile/customer`: `flutter test` -> **SUCCESS** (`All 10 tests passed`).
- `mobile/owner-app`: `flutter test` -> **SUCCESS** (`All 4 tests passed`).

---

## 9. Known Boundaries & Future Finance Integration

1. **Not an Accounting/Finance System**: This phase computes direct **Food Cost** and **Gross Contribution** from recipe BOMs and inventory purchase costs. It deliberately does not include employee salaries, utility bills, rent, accounts payable, depreciation, or general ledger balance sheets.
2. **Read-Only Analytics**: Profitability evaluation does not mutate inventory ledger levels or purchase order statuses.
3. **Future Finance Integration Hooks**:
   - Accounts Payable (AP) integration can directly reference `PurchaseOrder` and `PurchaseOrderReceipt` totals.
   - P&L financial reporting will ingest `operational_gross_contribution_paise` as the top-line Gross Profit line item before operating expenses.
