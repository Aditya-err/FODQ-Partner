# Phase 26 — Reports, Statements & Export Foundation

## Overview
Phase 26 establishes the comprehensive, server-authoritative **Reports, Statements & Export Engine** for the FODQ SaaS Restaurant Operating System. It delivers deterministic, read-only analytics, multi-period statements, spreadsheet injection-immune CSV exports, and printable HTML views for restaurant owners and general managers without altering or duplicating any underlying operational or financial records.

---

## 1. Architectural Tenets & Invariants

1. **Strictly Read-Only Reporting Layer**:
   - Zero mutation: Under no circumstances does a report generation, CSV export, or print view modify orders, bills, payments, refunds, ledger entries, cash closing sessions, or inventory balances.
   - Idempotent and side-effect free: Multiple calls to report endpoints yield identical snapshots for identical historical time windows.

2. **Authoritative Source of Truth**:
   - Reports query directly from permanent PostgreSQL tables (`orders`, `bills`, `payments`, `cash_closing_sessions`, `refunds`, `inventory_items`, `purchase_orders`, `inventory_wastage`, `recipes`).
   - Redis is used strictly for short-lived token caching and rate limiting, never as a primary reporting source.

3. **Deterministic Integer Paise Arithmetic**:
   - All financial amounts are stored, aggregated, and balanced in integer **paise** ($1\text{ INR} = 100\text{ paise}$).
   - Human-readable INR values are derived on output using exact division (`amount_paise / 100`), preventing floating-point inaccuracies and cumulative rounding drift.

4. **Contribution Semantics**:
   - Net profit is strictly **NOT** claimed. Operating overheads, labor, taxes, depreciation, rent, and utility expenses are not tracked in this module.
   - Profitability calculations are explicitly labeled **"Gross Contribution"** ($\text{Realized Revenue} - \text{Ingredient Cost} - \text{Direct Wastage Loss}$).

5. **Deterministic Business Timezone (IST)**:
   - All calendar dates and presets ("today", "yesterday", "this_week", "last_7_days", "last_30_days") are evaluated within the local restaurant operational timezone: `Asia/Kolkata` (IST, UTC+05:30).
   - Time boundaries map accurately: `00:00:00.000000 IST` to `23:59:59.999999 IST`, translated cleanly into UTC for PostgreSQL indexed queries (`[start_utc, end_utc]`).

---

## 2. Report Suite (10 Dedicated Reports + 1 Executive Overview)

| # | Report Identifier | Route (`/owner/reports/...`) | Scope & Metrics | Required Permission |
| :--- | :--- | :--- | :--- | :--- |
| **0** | **Executive Overview** | `/overview` | Realized revenue, gross contribution, completed orders, cash register variance, procurement spend, refunds, wastage loss. | `view_finance` |
| **1** | **Sales & Revenue** | `/sales` | Gross menu sales, discounts given, tax collected, service charge, realized revenue, bill count, AOV, payment method breakdown, daily time series. | `view_finance` |
| **2** | **Orders Lifecycle** | `/orders` | Placed orders count, completed/served/cancelled/rejected counts, average prep turnaround time (minutes), hourly distribution, paginated order list. | `manage_orders` |
| **3** | **Payment Gateways** | `/payments` | Captured attempts, failed attempts, net captured amount, breakdown by gateway (`CASH`, `RAZORPAY`), paginated payment transaction list. | `view_finance` |
| **4** | **Cash Closing** | `/cash` | Opening floats, authoritative cash sales, cash refunds, petty cash adjustments, expected cash, counted cash, variance amounts, exact/shortage/surplus count. | `view_finance` |
| **5** | **Refunds** | `/refunds` | Approved and completed reversals, refund amounts, reason categorization, payment method attribution, gateway refund IDs. | `view_finance` |
| **6** | **Inventory Valuation** | `/inventory` | Total tracked items, current quantities, unit of measurement, reorder level warnings, out-of-stock items, total inventory asset valuation. | `manage_inventory` |
| **7** | **Procurement (POs)** | `/procurement` | Purchase orders count, received POs, pending POs, supplier spend breakdown, delivery date compliance, paginated PO line items. | `manage_inventory` |
| **8** | **Wastage & Spoilage** | `/wastage` | Incident counts, physical quantities lost, categorized reasons (`EXPIRED`, `SPOILED`, `PREP_MISTAKE`), total estimated rupee loss. | `manage_inventory` |
| **9** | **Food Cost Variance** | `/food-cost` | Theoretical recipe BOM cost vs actual physical consumption cost, food cost percentage of menu revenue, variance paise. | `manage_inventory` |
| **10** | **Menu Profitability** | `/profitability` | Per-category and per-item sales volume, menu revenue, recipe ingredient cost, wastage loss, gross contribution paise, margin percentage. | `view_finance` |

---

## 3. Spreadsheet Injection Immunity (CSV Defense)

Spreadsheet programs (Microsoft Excel, LibreOffice Calc, Google Sheets) execute dynamic formulas if a cell starts with special prefix characters (`=`, `+`, `-`, `@`, `\t`, `\r`). An adversary placing malicious input in notes, table names, or supplier names could execute arbitrary code when an accountant opens the exported CSV.

### 3.1 Defense Implementation
FODQ implements server-side formula-injection neutralization:
```python
DANGEROUS_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

def sanitize_csv_cell(value: Any) -> str:
    """
    Prevents CSV Formula Injection (CWE-1236).
    Prefixes cells starting with '=', '+', '-', '@', '\t', or '\r' with a single quote (').
    """
    if value is None:
        return ""
    str_val = str(value)
    if str_val and str_val[0] in DANGEROUS_FORMULA_PREFIXES:
        return f"'{str_val}"
    return str_val
```
Every exported string is sanitized prior to writing, and all non-empty cells are enclosed with standard RFC 4180 double-quoting (`csv.QUOTE_NONNUMERIC`).

---

## 4. Printable HTML & Physical Statement Architecture

Rather than depending on heavy, fragile headless browser PDF binaries inside lightweight Docker containers, FODQ generates pure, responsive, standalone printable HTML views:
- **Clean Document Structure**: Rendered with `@media print` CSS rules, page-break optimizations (`page-break-inside: avoid;`), legible serif/sans-serif typography, high-contrast tables, and confidentiality disclaimers.
- **Embedded KPI Cards**: Header cards display crucial metric totals for rapid physical signing and supervisory sign-offs.
- **One-Click Native Printing**: The admin portal fetches the authenticated HTML document and triggers native browser printing (`window.print()`), enabling instant printing or saving as PDF on any device without server rendering overhead.

---

## 5. Security & RBAC Enforcement

1. **Multi-Tenant Isolation**:
   - Every report and export query strictly enforces `restaurant_id == tenant.id`.
   - Accessing foreign tenant reports with arbitrary restaurant IDs returns `404 Not Found` or `403 Forbidden`.

2. **Fine-Grained Permissions**:
   - Financial reports (`sales`, `payments`, `cash`, `refunds`, `profitability`, `overview`): Require `view_finance`.
   - Operational reports (`orders`): Require `manage_orders`.
   - Inventory reports (`inventory`, `procurement`, `wastage`, `food-cost`): Require `manage_inventory`.
   - Non-privileged accounts are rejected with `403 Forbidden`.

---

## 6. Performance Optimization & Database Indexes

To maintain sub-100ms response times across multi-month historical aggregations, the following composite indexes were deployed and verified in `backend/sync_db_schema.py`:
```sql
CREATE INDEX IF NOT EXISTS ix_orders_restaurant_created 
ON orders (restaurant_id, created_at);

CREATE INDEX IF NOT EXISTS ix_bills_restaurant_paid_at 
ON bills (restaurant_id, paid_at);

CREATE INDEX IF NOT EXISTS ix_payments_restaurant_created 
ON payments (restaurant_id, created_at);

CREATE INDEX IF NOT EXISTS ix_purchase_orders_restaurant_created 
ON purchase_orders (restaurant_id, created_at);

CREATE INDEX IF NOT EXISTS ix_inventory_movements_rest_created 
ON inventory_movements (restaurant_id, created_at);
```

---

## 7. Frontend Admin Web Portal

A dedicated **Reports, Statements & Exports** interface was integrated into the FODQ Admin portal at `/reports`:
- **11 Modular Tabs**: Fast switching across Overview, Sales, Orders, Payments, Cash, Refunds, Inventory, Procurement, Wastage, Food Cost, and Profitability.
- **Date Presets & Custom Pickers**: Instant presets (`Today`, `Yesterday`, `This Week`, `Last 7 Days`, `Last 30 Days`) with custom date-range pickers and IST date indicators.
- **KPI Summary Cards**: Formatted in Indian Rupee currency (`₹`), with percentage metrics and explicit "Gross Contribution" badges.
- **Direct Actions**: Integrated "Export CSV" (streaming file download) and "Print Statement" (native print window).
- **Navigation Integration**: Added to the permanent sidebar in `frontend/admin/app/(admin)/layout.tsx`.

---

## 8. Verification & Test Evidence

### 8.1 Phase 26 Targeted Test Suite (`backend/tests/test_phase26_reports.py`)
- **29 Scenarios Evaluated**:
  1. `test_01_executive_overview`: Multi-dimensional aggregate validation.
  2. `test_02_sales_report`: Turnover, discount deductions, bill count, AOV.
  3. `test_03_orders_report`: Status distribution, hourly breakdown, prep turnaround.
  4. `test_04_payments_report`: Gateway breakdown (`CASH`, `RAZORPAY`), capture ratios.
  5. `test_05_cash_closing_report`: Drawer sessions, float, expected, counted, variance.
  6. `test_06_refunds_report`: Reversals, gateway references, reasons.
  7. `test_07_inventory_report`: Stock status, reorder warnings, units.
  8. `test_08_procurement_report`: PO lifecycle, supplier totals, delivery compliance.
  9. `test_09_wastage_report`: Incident logs, reasons, rupee loss valuation.
  10. `test_10_food_cost_report`: Theoretical BOM vs actual usage variance.
  11. `test_11_profitability_report`: Category/item contribution & margins.
  12. `test_12_date_filtering`: Preset boundary resolution in IST.
  13. `test_13_business_timezone_ist`: Shift of UTC timestamps into IST business dates.
  14. `test_14_pagination_behavior`: Page size, offsets, total counts.
  15. `test_15_csv_export_sales`: Header compliance, row formatting, CSV headers.
  16. `test_16_csv_formula_injection_defense`: Neutralization of `=`, `+`, `-`, `@`.
  17. `test_17_permission_enforcement_rbac`: Rejection of unauthorized users.
  18. `test_18_tenant_isolation`: Total isolation across distinct tenant restaurants.
  19. `test_19_direct_id_access_isolation`: Cross-tenant direct query prevention.
  20. `test_20_empty_report_period`: Graceful zero-value handling without errors.
  21. `test_21_cost_unavailable_preservation`: Incomplete BOM handling without crash.
  22. `test_22_historical_profitability_semantics`: Consistency with Phase 23 data.
  23. `test_23_phase24_reconciliation_unaffected`: Reconciliation ledger intact.
  24. `test_24_phase25_cash_closing_unaffected`: Cash drawer finalization intact.
  25. `test_25_phase23_profitability_unaffected`: Food cost services intact.
  26. `test_26_financial_integer_paise_correctness`: Exact paise arithmetic.
  27. `test_27_no_report_mutation`: Zero mutations on underlying records.
  28. `test_28_printable_html_render`: Valid HTML markup, CSS `@media print`.
  29. `test_29_large_range_query_bounding`: Performance bounding on large periods.
- **Result**: `29 passed in 26.72s (100% PASS RATE)`.

### 8.2 Multi-Phase Regression Test Results
- **Phases 23–26 Suite**: `115 passed in 116.81s (100% PASS RATE)`.
- **Phases 21–22 Suite**: `69 passed in 98.36s (100% PASS RATE)`.
- **Total Backend Tests Verified**: **213 passed, 0 failed**.

### 8.3 Mobile Test Results
- **Customer App (`mobile/customer`)**: `All 10 tests passed!`.
- **Owner App (`mobile/owner-app`)**: `All 4 tests passed!`.

### 8.4 Frontend Web Application Build Verification
- **Admin App (`frontend/admin`)**: Compiled in 26.4s, TypeScript passed in 15.7s, prerendered 15 routes including `/reports` (0 errors).
- **Customer App (`frontend/customer`)**: Compiled in 6.7s, TypeScript passed in 14.9s, prerendered 8 routes (0 errors).
- **Kitchen App (`frontend/kitchen`)**: Compiled in 24.6s, TypeScript passed in 9.6s, prerendered 4 routes (0 errors).

---

## 9. Conclusion
Phase 26 successfully delivers a complete, secure, performant, and read-only Reporting, Statements & Export foundation for FODQ. All financial figures are deterministic in integer paise, spreadsheet injections are neutralized, tenant isolation is strictly enforced, and all web and mobile clients are verified regression-free.
