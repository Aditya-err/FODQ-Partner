# Phase 27 — Restaurant Intelligence & Decision Support Foundation

## 1. Executive Summary

Phase 27 introduces a **purely deterministic, read-only Restaurant Intelligence & Decision Support Foundation** for the FODQ restaurant platform.

The intelligence layer consumes existing authoritative PostgreSQL tables—orders, order items, bills, payments, cash closing sessions, inventory items, inventory movements, recipes, purchase orders, and wastage incidents—to identify operational patterns, bottlenecks, cost surges, and inventory risks.

### Critical Operating Constraints
1. **Read-Only / No Automatic Action:**
   The intelligence engine strictly observes and informs. It **never** mutates menu prices, inventory balances, recipes, purchase orders, table statuses, cash closing records, or financial ledger entries.
2. **Deterministic Rules Engine (Zero LLM as Authority):**
   All calculations, classifications, and thresholds are fully auditable, deterministic, and computed directly from PostgreSQL data in Python. No restaurant financial, customer, or operational data is transmitted to external AI providers.
3. **Asia/Kolkata (IST) Business Day Alignment:**
   All comparison windows (`7d`, `30d`, `90d`) and period aggregations are resolved relative to the Indian Standard Time (IST, UTC+05:30) calendar date boundaries.

---

## 2. Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL Data Layer                          │
│  (Orders, Bills, Payments, Inventory, Wastage, Recipes, POs, Cash)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Read-Only Aggregations
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             backend/app/services/restaurant_intelligence_service.py    │
│  - Period Resolution (IST calendar aligned)                            │
│  - Data Sufficiency Classification                                     │
│  - Trend Engine (compare_metrics, percentage change, moving averages)  │
│  - 9 Domain Analyzers + 1 Executive Overview Synthesizer               │
│  - Explainable Insight Generator                                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Authoritative JSON Payloads
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                backend/app/api/routes/intelligence_owner.py            │
│  - Tenant Scoping (X-Restaurant-ID / Authenticated Tenant Isolation)   │
│  - RBAC Enforcement (view_finance, manage_inventory, manage_orders)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ REST API
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             frontend/admin/app/(admin)/intelligence/page.tsx           │
│  - Executive KPI Strip (Turnover, Orders, AOV, Food Cost %, Margin)    │
│  - Attention Required (CRITICAL / IMPORTANT Alerts with Actions)       │
│  - 9 Domain Intelligence Tabs & 4-Quadrant Menu Performance Matrix     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Intelligence Domains & Formulas

### A. Sales Intelligence
- **Revenue Trend:** Compares realized turnover across periods:
  $$\text{Turnover} = \sum (\text{Bills with status } PAID \text{ within period})$$
  $$\Delta \% = \left(\frac{\text{Current} - \text{Previous}}{\text{Previous}}\right) \times 100$$
- **Order Trend:** Total placed and completed orders count.
- **Average Order Value (AOV):**
  $$\text{AOV} = \frac{\text{Turnover}}{\text{Order Count}}$$
- **Hourly Pattern:** Aggregated orders and sales by hour of day (0-23 in IST) identifying peak and quiet windows.
- **Weekday Pattern:** Monday through Sunday breakdown for staff scheduling.

### B. Menu Intelligence & 4-Quadrant Matrix
- **Top Sellers by Quantity:** Menu items ranked by total units sold.
- **Gross Contribution Leaders:** Menu items generating the highest aggregate contribution:
  $$\text{Total Gross Contribution} = \text{Orders Sold} \times (\text{Selling Price} - \text{Unit Recipe Cost})$$
- **Declining Items Alert:** Items experiencing $\ge 15\%$ drop in sales volume compared to the prior period.
- **Menu Performance Matrix (4 Quadrants):**
  1. `HIGH_VOLUME_HIGH_CONTRIBUTION` ("Stars"): Volume $\ge$ Average and Contribution $\ge$ Average. Recommendation: Maintain recipe quality, ensure ingredient availability.
  2. `HIGH_VOLUME_LOW_CONTRIBUTION` ("Workhorses"): Volume $\ge$ Average and Contribution $<$ Average. Recommendation: Review portion sizing, supplier ingredient rates, or modest price adjustments.
  3. `LOW_VOLUME_HIGH_CONTRIBUTION` ("Puzzles"): Volume $<$ Average and Contribution $\ge$ Average. Recommendation: High margin potential; examine menu placement, feature cards, or staff recommendation.
  4. `LOW_VOLUME_LOW_CONTRIBUTION` ("Dogs"): Volume $<$ Average and Contribution $<$ Average. Recommendation: Assess whether prep complexity and perishability justify menu slot.

### C. Inventory & Demand Risk
- **Average Daily Consumption:**
  $$\text{Daily Consumption} = \frac{\text{Total Period Consumption (Orders + Wastage)}}{\text{Days in Period}}$$
- **Projected Days of Stock Coverage:**
  $$\text{Coverage Days} = \frac{\text{Current Stock Quantity}}{\text{Average Daily Consumption}}$$
- **Demand Risk Classification:**
  - `STOCKOUT_RISK`: Current Stock $\le 0$ OR Coverage Days $\le 1.0$ day.
  - `REORDER_RISK`: Coverage Days $\le 3.0$ days OR Current Stock $\le$ Reorder Quantity.
  - `WATCH`: Coverage Days $\le 7.0$ days.
  - `SAFE`: Coverage Days $> 7.0$ days.

### D. Procurement Intelligence
- **Supplier Price Escalation:** Compares unit prices of ingredients across consecutive Purchase Orders:
  $$\text{Price Increase } \% \ge 5.0\% \implies \text{Generate Alert}$$
- **Supplier Spend Concentration:** Percentage of total procurement spend distributed across vendors:
  $$\text{Spend Share } \% = \left(\frac{\text{Supplier Spend}}{\text{Total Procurement Spend}}\right) \times 100$$
- **Delayed Purchase Orders:** Active POs where `expected_date < today_ist` and status is still `CONFIRMED` or `SUBMITTED`.

### E. Wastage Intelligence
- **Valued Wastage Trend:** Compares cost of non-reversed wastage incidents across periods.
- **Repeated Discard Patterns:** Ingredients discarded $\ge 2$ separate times within the period generate an advisory to inspect storage, handling, or portioning.
- **Reason Breakdown:** Spoilage, Expiry, Prep Loss, Burned, etc.

### F. Food Cost & Profitability Intelligence
- **Theoretical Food Cost Percentage:**
  $$\text{Food Cost } \% = \left(\frac{\text{Total Recipe Ingredient Cost}}{\text{Realized Turnover}}\right) \times 100$$
- **High Food Cost Items Alert:** Items where recipe ingredient cost constitutes $\ge 40\%$ of selling price.
- **Preservation of `COST_UNAVAILABLE`:** If any ingredient lacks purchase history or recipe is unconfigured, the system reports `COST_UNAVAILABLE` rather than fabricating zero cost.

### G. Operations Intelligence
- **Average Prep Time:** Turnaround duration calculated from kitchen lifecycle and order estimates.
- **Cancellation Rate:**
  $$\text{Cancellation Rate } \% = \left(\frac{\text{Cancelled Orders}}{\text{Total Orders}}\right) \times 100$$
- **Bottleneck Hours:** Hours where average prep time exceeds 20 minutes across multiple orders.

### H. Payments & Cash Intelligence
- **Payment Gateway Failure Rate:**
  $$\text{Failure Rate } \% = \left(\frac{\text{Failed Payments}}{\text{Total Payment Attempts}}\right) \times 100$$
- **Cash Register Variances:** Audits closed cash drawer sessions. Identifies recurring shortages ($\ge 2$ sessions) using neutral, objective language:
  > *"Physical cash drawer had shortages across N closing sessions totaling ₹X. Pattern requires management review: audit cash float handover, change dispensing, and receipt slips."*

---

## 4. Explainable Insight Schema

Every insight generated by the engine conforms to the standardized, auditable schema:

```json
{
  "insight_id": "inventory-out-of-stock",
  "category": "INVENTORY",
  "title": "1 Ingredients Currently Out of Stock",
  "severity": "CRITICAL",
  "observation": "Basmati Rice is completely depleted (0.0 kg on hand).",
  "supporting_metrics": {
    "out_of_stock_count": 1,
    "items": ["Basmati Rice"]
  },
  "comparison_period": "2026-09-23 to 2026-09-30",
  "data_sufficiency": "SUFFICIENT_DATA",
  "generated_at": "2026-09-30T12:00:00Z",
  "recommended_action": "Review immediate replenishment and verify pending purchase orders.",
  "source_service": "restaurant_intelligence_service"
}
```

### Severity Levels
- `CRITICAL`: Immediate threat to operations (e.g. stock depleted on active menu ingredient).
- `IMPORTANT`: Notable deviation requiring prompt attention (e.g. stockout within 1-3 days, elevated cancellation rate, recurring cash drawer shortages).
- `WATCH`: Developing pattern requiring monitoring (e.g. ingredient price increase $\ge 5\%$, repeated wastage).
- `INFO`: Normal observations, positive trends, or data sufficiency notifications.

### Data Sufficiency Statuses
- `INSUFFICIENT_DATA`: Insufficient records to make a credible trend comparison (e.g., $< 3$ sample points). Never claims a decline or growth when data is insufficient.
- `LIMITED_DATA`: Small sample ($3 \le n < 10$). Trends reported with cautionary indicators.
- `SUFFICIENT_DATA`: Adequate sample ($n \ge 10$) supporting high confidence observations.

---

## 5. Security & Tenant Isolation

- **Authentication:** All routes enforce Bearer JWT authentication linked to active `OwnerSession`.
- **Tenant Isolation:** Every query explicitly filters on `restaurant_id == tenant.id`. Cross-tenant data leakage is strictly prevented and verified by test scenarios (`test_26_tenant_isolation`).
- **RBAC Enforcement:**
  - `view_finance`: Required for Overview, Sales, Menu, Food Cost, Profitability, Payments.
  - `manage_inventory`: Required for Inventory, Procurement, Wastage.
  - `manage_orders`: Required for Operations turnaround.

---

## 6. Verification Results

### 1. Targeted Test Suite (`backend/tests/test_phase27_restaurant_intelligence.py`)
- Total tests: 30
- Result: **30 PASSED** in 31.48s (100% Pass Rate).
- Scenarios covered:
  1. `test_01_intelligence_overview` — PASSED
  2. `test_02_sales_trend` — PASSED
  3. `test_03_order_trend` — PASSED
  4. `test_04_aov_trend` — PASSED
  5. `test_05_insufficient_historical_data` — PASSED
  6. `test_06_top_selling_items` — PASSED
  7. `test_07_contribution_leaders` — PASSED
  8. `test_08_menu_performance_matrix` — PASSED
  9. `test_09_declining_item_detection` — PASSED
  10. `test_10_inventory_stock_risk` — PASSED
  11. `test_11_stock_coverage_calculation` — PASSED
  12. `test_12_out_of_stock_detection` — PASSED
  13. `test_13_procurement_price_trend` — PASSED
  14. `test_14_supplier_spend_analysis` — PASSED
  15. `test_15_wastage_trend` — PASSED
  16. `test_16_repeated_wastage_detection` — PASSED
  17. `test_17_food_cost_trend` — PASSED
  18. `test_18_contribution_trend` — PASSED
  19. `test_19_preparation_time_trend` — PASSED
  20. `test_20_cancellation_pattern` — PASSED
  21. `test_21_payment_failure_pattern` — PASSED
  22. `test_22_cash_variance_pattern` — PASSED
  23. `test_23_percentage_calculation_unit` — PASSED
  24. `test_24_zero_division_safety` — PASSED
  25. `test_25_data_sufficiency_classification` — PASSED
  26. `test_26_tenant_isolation` — PASSED
  27. `test_27_rbac_permissions` — PASSED
  28. `test_28_no_source_data_mutation` — PASSED
  29. `test_29_business_timezone_ist` — PASSED
  30. `test_30_phase26_reports_unaffected` — PASSED

### 2. Regression Suites
- `test_phase26_reports.py`, `test_phase25_cash_closing.py`, `test_phase24_financial_reconciliation.py`, `test_phase23_food_cost.py`
- Result: **115 PASSED out of 115** in 113.64s (100% Regression Pass Rate).

### 3. Frontend Production Builds
- `frontend/admin`: `npm run build` completed successfully (Next.js 16.3.1 Turbopack, static page generation for `/intelligence` 16/16 pages).
- `frontend/customer`: `npm run build` completed successfully (8/8 pages).
- `frontend/kitchen`: `npm run build` completed successfully (4/4 pages).

### 4. Mobile Test Suites
- `mobile/customer`: `flutter test` passed (10/10 tests).
- `mobile/owner-app`: `flutter test` passed (4/4 tests).

---

## 7. Status Classification

| Layer | Component | Status | Evidence |
|---|---|---|---|
| Backend | `restaurant_intelligence_service.py` | VERIFIED | 30 targeted tests passing |
| API | `intelligence_owner.py` (10 routes) | VERIFIED | Authenticated tenant & RBAC verified |
| Admin Web | `/intelligence` executive dashboard | VERIFIED | Production build verified |
| Frontends | Customer, Kitchen, Admin web apps | VERIFIED | Next.js builds clean |
| Mobile | Customer & Owner Flutter apps | VERIFIED | Flutter test suites clean |
| Regression | Phases 23, 24, 25, 26 | VERIFIED | 115/115 tests passing |
| Production Infra | DNS, TLS, Razorpay Webhooks live | PENDING | Local / container environment verified |
