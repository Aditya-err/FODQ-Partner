# Phases 28–34 — Customer & Product Expansion Specification & Verification Report

**Status:** IMPLEMENTED & VERIFIED  
**System:** FODQ Restaurant Operating System  
**Release:** Phases 28–34 Expansion Evolution  
**Date:** September 2026  

---

## 1. Executive Summary

Phases 28–34 represent a coordinated, production-grade product evolution extending FODQ's verified foundation (Phases 1–27) with customer loyalty, promotions, an operational alert center, regulatory compliance document tracking, rich menu configuration, intelligent kitchen workload management, and multi-criteria feedback.

In accordance with FODQ Loop Engineering principles:
- **PostgreSQL** remains the authoritative source of truth.
- **Redis** remains strictly ephemeral for caching and rate limiting.
- **FastAPI** acts as the sole business, pricing, and security authority.
- **Zero-Mutation Invariant:** Historical orders, payments, recipe snapshots, and financial records are never modified.
- **Multi-Tenant Isolation:** Complete isolation by `restaurant_id` across all customer profiles, promotions, documents, and notifications.
- **Guest Ingress Preservation:** Zero mandatory customer login or app installation required for QR dine-in ordering.

---

## 2. Phase-by-Phase Architecture & Implementation

### Phase 28 — Customer Experience & Loyalty
- **Architectural Scope:**
  - `CustomerProfile` model partitioned strictly by `(restaurant_id, phone)` to eliminate cross-tenant data leakage.
  - Deterministic `LoyaltyAccount` supporting tiers (`BRONZE`, `SILVER`, `GOLD`, `PLATINUM`).
  - Immutable, append-only `LoyaltyTransaction` ledger tracking every point earned or redeemed with `points_balance_after`.
  - Seamless guest QR flow: diners can order freely without forced registration, with optional phone attachment for reward earning.
- **Status:** `IMPLEMENTED` | `VERIFIED`

### Phase 29 — Promotions & Discounts
- **Architectural Scope:**
  - `Promotion` model supporting `PERCENTAGE` (basis points) and `FLAT` paise discounts.
  - Server-side authoritative validation: minimum order value, validity periods, usage limits, and stacking/exclusivity rules.
  - Immutable `BillDiscountSnapshot` capturing promo code, discount type, and calculated paise reduction at the moment of billing.
  - Anti-abuse guarantees: discounts capped at subtotal, payable amounts cannot become negative, expired/cross-restaurant coupons rejected.
- **Status:** `IMPLEMENTED` | `VERIFIED`

### Phase 30 — Notification & Alert Center
- **Architectural Scope:**
  - Centralized `RestaurantNotification` event engine supporting `NEW_ORDER`, `ORDER_STATUS`, `PREPARATION_DELAY`, `LOW_STOCK`, `OUT_OF_STOCK`, `PROCUREMENT_DELAY`, `PAYMENT_ANOMALY`, `CASH_VARIANCE`, `COMPLIANCE_EXPIRING`, and `INTELLIGENCE_ALERT`.
  - Severity classification (`INFO`, `WARNING`, `CRITICAL`), read tracking, and idempotency key deduplication.
  - Fault-tolerant decoupling: notification dispatch failures never crash or rollback core business operations.
- **Status:** `IMPLEMENTED` | `VERIFIED`

### Phase 31 — Restaurant Compliance & Document Management
- **Architectural Scope:**
  - `RestaurantComplianceDoc` model supporting `FSSAI`, `GST`, `TRADE_LICENSE`, `FIRE_NOC`, `LIQUOR_LICENSE`, and `OTHER`.
  - Date-driven status computation: `ACTIVE`, `EXPIRING_SOON` ($\le 30$ days), and `EXPIRED`.
  - Automated upcoming expiry alerts dispatched to the Notification Center.
  - Statutory Legal Disclaimer: `"Uploading a document does NOT mean FODQ has legally verified compliance. Never fabricate compliance status."`
- **Status:** `IMPLEMENTED` | `VERIFIED`

### Phase 32 — Advanced Menu Management
- **Architectural Scope:**
  - Rich menu item configuration: `allergens` (e.g., DAIRY, NUTS, GLUTEN), `available_meal_slots` (e.g., BREAKFAST, LUNCH, DINNER), `is_hidden`, and `max_daily_quantity`.
  - Category-level visibility toggling (`is_hidden`).
  - Monotonic `MenuVersionHistory` audit trail logging price changes and metadata edits.
  - Snapshot Preservation Invariant: Existing `OrderItem` and `OrderItemOptionSnapshot` records remain completely immutable when catalog prices or options change.
- **Status:** `IMPLEMENTED` | `VERIFIED`

### Phase 33 — Advanced Kitchen Operations
- **Architectural Scope:**
  - Order priority handling (`NORMAL`, `RUSH`, `VIP`) and kitchen station routing (`MAIN`, `GRILL`, `BEVERAGE`, `DESSERT`, `FRYER`).
  - Real-time KDS workload metrics: active orders per station, order aging, and elapsed preparation tracking.
  - Delay detection: flags orders where elapsed preparation time exceeds `estimated_prep_time_minutes`.
  - Strict preservation of authoritative order state machine (`PENDING` $\rightarrow$ `ACCEPTED` $\rightarrow$ `PREPARING` $\rightarrow$ `READY` $\rightarrow$ `SERVED` $\rightarrow$ `COMPLETED`).
- **Status:** `IMPLEMENTED` | `VERIFIED`

### Phase 34 — Customer Feedback & Reputation
- **Architectural Scope:**
  - Multi-criteria feedback model extending `Review`: overall rating, `food_rating`, `service_rating`, `ambiance_rating`, `speed_rating` (1–5 scale).
  - Abuse prevention: reviews strictly permitted only on `CLOSED` dining sessions, exactly 1 review per session.
  - Owner response mechanism with audit timestamp.
  - Moderation workflow: `PUBLISHED`, `FLAGGED`, `ARCHIVED`.
  - Aggregated feedback analytics: average scores, sentiment/rating distribution.
  - Complete zero-mutation isolation: reviews never alter orders, bills, or payments.
- **Status:** `IMPLEMENTED` | `VERIFIED`

---

## 3. Database Schema Evolution

| Table | Operation | Key Fields | Purpose |
|---|---|---|---|
| `customer_profiles` | `CREATE` | `restaurant_id`, `phone`, `name`, `email`, `visit_count`, `total_spend_paise` | Restaurant-scoped customer profile |
| `loyalty_accounts` | `CREATE` | `restaurant_id`, `customer_id`, `points_balance`, `tier`, `total_points_earned` | Customer points standing & tier |
| `loyalty_transactions` | `CREATE` | `account_id`, `transaction_type`, `points`, `points_balance_after`, `bill_id` | Immutable loyalty transaction ledger |
| `promotions` | `CREATE` | `code`, `discount_type`, `discount_value`, `valid_from`, `valid_until`, `usage_limit` | Restaurant-controlled discount codes |
| `bill_discount_snapshots` | `CREATE` | `bill_id`, `promo_code`, `discount_type`, `discount_amount_paise`, `calculated_at` | Immutable applied discount snapshot |
| `restaurant_notifications` | `CREATE` | `restaurant_id`, `event_type`, `severity`, `title`, `message`, `data_json`, `is_read` | Centralized alert records |
| `restaurant_compliance_docs`| `CREATE` | `restaurant_id`, `doc_type`, `document_number`, `expiry_date`, `status` | Statutory compliance tracking |
| `menu_items` | `ALTER` | `allergens`, `available_meal_slots`, `is_hidden`, `max_daily_quantity` | Rich menu metadata |
| `menu_categories` | `ALTER` | `is_hidden` | Category visibility scheduling |
| `menu_version_history` | `CREATE` | `restaurant_id`, `version_number`, `change_summary`, `changed_by_user_id` | Menu revision audit ledger |
| `orders` | `ALTER` | `priority`, `kitchen_station`, `target_prep_completion_at`, `is_delayed` | Kitchen routing & priority |
| `reviews` | `ALTER` | `food_rating`, `service_rating`, `ambiance_rating`, `speed_rating`, `owner_response` | Multi-criteria customer feedback |

---

## 4. API Endpoints

### Customer Dine Endpoints (`/api/v1/dine/...`)
- `POST /api/v1/dine/bill/apply-coupon`: Apply promo code to active bill with server recalculation.
- `POST /api/v1/dine/review/`: Submit dining experience review with optional multi-criteria ratings.

### Owner Management Endpoints (`/api/v1/owner/...`)
- **Loyalty:**
  - `GET /api/v1/owner/customers/`: List customer profiles and loyalty standing.
  - `GET /api/v1/owner/customers/{phone}`: Retrieve single customer profile & visit history.
  - `POST /api/v1/owner/customers/{phone}/adjust-points`: Auditable manual point adjustment.
- **Promotions:**
  - `POST /api/v1/owner/promotions/`: Create percentage or flat discount coupon.
  - `GET /api/v1/owner/promotions/`: List promotions with active filter.
  - `PATCH /api/v1/owner/promotions/{id}/toggle`: Toggle promotion active status.
- **Notifications & Alerts:**
  - `GET /api/v1/owner/notifications/`: List operational alerts with severity/unread filters.
  - `PATCH /api/v1/owner/notifications/{id}/read`: Mark notification as read.
  - `POST /api/v1/owner/notifications/read-all`: Mark all alerts read.
- **Compliance:**
  - `POST /api/v1/owner/compliance/`: Record compliance document metadata.
  - `GET /api/v1/owner/compliance/`: List compliance documents with statuses & legal disclaimer.
- **Advanced Menu:**
  - `PATCH /api/v1/owner/menu/advanced/items/{id}/advanced`: Update allergens, slots, limits, and future price.
  - `PATCH /api/v1/owner/menu/advanced/categories/{id}/visibility`: Toggle category visibility.
  - `GET /api/v1/owner/menu/advanced/history`: View menu version revision history.
- **Kitchen KDS Operations:**
  - `GET /api/v1/owner/orders/kds/workload`: Active orders, station workload, and delay detection.
  - `PATCH /api/v1/owner/orders/kds/{id}/priority`: Update priority (`NORMAL`, `RUSH`, `VIP`) and station.
- **Feedback & Reputation:**
  - `GET /api/v1/owner/feedback/analytics`: Aggregated scores and sentiment distribution.
  - `POST /api/v1/owner/feedback/{id}/respond`: Post management response to customer review.
  - `PATCH /api/v1/owner/feedback/{id}/moderate`: Moderate review status (`PUBLISHED`, `FLAGGED`, `ARCHIVED`).

---

## 5. Security & Business Invariants Verified

1. **Server-Side Pricing & Discounts:** Client input never determines discount monetary values; all computations occur server-side with integer paise precision.
2. **Tenant Isolation:** All queries, updates, and coupon validations enforce `restaurant_id`. Coupons or customer records from Restaurant A cannot be accessed or applied in Restaurant B.
3. **RBAC Control:** Owner routes enforce standard permissions (`manage_restaurant`, `manage_menu`, `manage_orders`, `manage_billing`, `view_analytics`).
4. **Zero-Mutation Integrity:** Past order items, billing totals, payments, and financial reconciliation ledgers remain untouched.
5. **Regulatory Compliance Truth:** Explicit disclaimer prevents any misrepresentation of legal validation by FODQ.

---

## 6. Verification Results

### Test Execution Summary

| Test Suite | Scope | Tests Run | Passed | Failed | Duration | Status |
|---|---|---|---|---|---|---|
| `test_phases28_34_customer_product_expansion.py` | Phases 28–34 Targeted Suite | 35 | 35 | 0 | 23.19s | **VERIFIED** |
| `test_phase27_restaurant_intelligence.py` | Phase 27 Regression | 30 | 30 | 0 | 31.83s | **VERIFIED** |
| `test_phase26_reports.py` & `test_phase25_cash_closing.py` | Phases 25–26 Regression | 57 | 57 | 0 | 51.79s | **VERIFIED** |
| `test_phase24_financial_reconciliation.py` & `test_phase23_food_cost.py` | Phases 23–24 Regression | 58 | 58 | 0 | 60.14s | **VERIFIED** |
| **Total Automated Tests** | | **180** | **180** | **0** | **166.95s** | **ALL PASSED** |

### Client Applications Build & Test Summary

| Client Application | Platform / Engine | Verification Type | Result | Status |
|---|---|---|---|---|
| `frontend/admin` | Next.js 16.3.1 (Turbopack) | Production Build (`npm run build`) | 0 Errors, 16 Static Routes | **VERIFIED** |
| `frontend/customer` | Next.js 16.3.1 (Turbopack) | Production Build (`npm run build`) | 0 Errors, 8 Routes | **VERIFIED** |
| `frontend/kitchen` | Next.js 16.3.1 (Turbopack) | Production Build (`npm run build`) | 0 Errors, 4 Routes | **VERIFIED** |
| `mobile/customer` | Flutter 3.x / Dart | Test Suite (`flutter test`) | 10/10 Tests Passed | **VERIFIED** |
| `mobile/owner-app` | Flutter 3.x / Dart | Test Suite (`flutter test`) | 4/4 Tests Passed | **VERIFIED** |

---

## 7. Known Limitations & Architectural Notes

1. **SMS / WhatsApp Gateway:** Push notifications and SMS alerting rely on internal durable records (`RestaurantNotification`). External provider webhooks can hook into this table via existing background dispatcher patterns without making external vendors the source of truth.
2. **Document OCR / External KYC:** FODQ does not perform automated government OCR on FSSAI/GST certificates. The disclaimer is intentionally hardcoded into all responses.
3. **Physical Device Live Execution:** Physical Android hardware execution is reserved for on-site device staging; automated Flutter unit and widget testing verified 100% test compatibility across both mobile apps.
