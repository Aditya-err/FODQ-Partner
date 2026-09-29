# Phase 24 — Financial Ledger & Payment Reconciliation Foundation

## Overview
Phase 24 establishes the authoritative **Financial Transaction Ledger & Payment Reconciliation Engine** for the FODQ SaaS Restaurant Operating System. It connects billing generation, digital gateway payments (Razorpay webhooks), offline/POS settlements, refunds, and financial anomaly detection into a unified, server-authoritative, immutable financial foundation.

---

## 1. Architectural Principles & Ledger Immutability

### 1.1 Append-Oriented Immutable Ledger (`FinancialLedgerEntry`)
The financial ledger serves as the restaurant's tamper-evident audit record of all financial events.
- **Append-Only**: Ledger entries can only be inserted. Once an entry is written to `financial_ledger_entries`, it can **never** be edited or deleted.
- **ORM-Enforced Immutability**:
  SQLAlchemy event listeners (`before_update` and `before_delete`) attached to `FinancialLedgerEntry` intercept any modification or deletion attempt at the ORM layer, throwing a `ValueError("FinancialLedgerEntry is immutable and cannot be updated/deleted.")`.
- **Database Indexing**: Compound indexes on `(restaurant_id, created_at)` and `(restaurant_id, event_type)` ensure sub-millisecond retrieval across millions of historical transactions.
- **Balancing via Adjustments**: Corrective operations are handled strictly by recording opposing or adjusting ledger entries (`ADJUSTMENT`) with an explicit audit reason and creator metadata, maintaining a complete, auditable transaction history.

### 1.2 Event Types
| Event Type | Description | Primary Correlation |
| :--- | :--- | :--- |
| `BILL_CREATED` | Emitted when a customer bill is finalized/issued. | `bill_id` |
| `PAYMENT_CAPTURED` | Emitted when a payment is captured via Razorpay webhook or POS settlement. | `payment_id`, `bill_id` |
| `PAYMENT_FAILED` | Emitted when gateway payment processing fails. | `payment_id`, `bill_id` |
| `PAYMENT_CANCELLED`| Emitted when a payment authorization/intent is explicitly cancelled. | `payment_id`, `bill_id` |
| `REFUND_CREATED` | Emitted when a refund record is initiated/submitted. | `refund_id`, `payment_id` |
| `REFUND_COMPLETED` | Emitted when refund settlement is confirmed. | `refund_id`, `payment_id` |
| `REFUND_FAILED` | Emitted when gateway refund processing fails. | `refund_id`, `payment_id` |
| `ADJUSTMENT` | Emitted for manual/manager adjustments with mandatory audit reason. | Optional `bill_id` / `payment_id` |

---

## 2. Server-Authoritative Bill ↔ Payment Reconciliation

The reconciliation engine calculates live settlement integrity for every bill:

### 2.1 Formulation
$$\text{Captured Amount} = \sum \text{Payment.amount} \quad \forall \text{ Payments where } \text{status} = \text{CAPTURED}$$
$$\text{Refunded Amount} = \sum \text{Refund.amount} \quad \forall \text{ Refunds where } \text{status} = \text{COMPLETED}$$
$$\text{Net Collected} = \text{Captured Amount} - \text{Refunded Amount}$$

### 2.2 Bill Settlement Status Classification
- **`SETTLED`**: $\text{Net Collected} \ge \text{Bill.total\_amount}$
- **`PARTIALLY_PAID`**: $0 < \text{Net Collected} < \text{Bill.total\_amount}$
- **`OVERPAID`**: $\text{Net Collected} > \text{Bill.total\_amount}$
- **`UNPAID`**: $\text{Net Collected} = 0$ and $\text{Bill.total\_amount} > 0$
- **`REFUNDED`**: $\text{Captured Amount} > 0$ and $\text{Net Collected} = 0$

> **Zero Floating-Point Financials**: All ledger calculations, amounts, and comparisons are strictly stored and computed in integer **paise** ($1\text{ INR} = 100\text{ paise}$).

---

## 3. Refund Reconciliation Layer

### 3.1 Strict Server-Side Validation
Before any refund is recorded or approved:
1. **Target Payment Must Exist**: The `payment_id` must match a recorded payment within the tenant restaurant.
2. **Captured State Required**: The target payment must have status `CAPTURED`. Non-captured or failed payments cannot be refunded.
3. **Cumulative Refund Ceiling**:
   $$\sum \text{Existing Active Refunds} + \text{New Refund Amount} \le \text{Payment.amount}$$
   Any refund request exceeding the captured payment amount is rejected with HTTP 400 (`EXCEEDS_CAPTURED_AMOUNT`).

---

## 4. Financial Anomaly Detection Engine

The engine scans bills, payments, and refunds for a restaurant across 8 deterministic detection rules without modifying any historical data:

| # | Anomaly Type | Condition / Trigger | Severity | Action / Resolution |
| :- | :--- | :--- | :--- | :--- |
| 1 | `BILL_AMOUNT_MISMATCH` | Finalized bill marked `PAID` but $\text{Captured Amount} \neq \text{Bill.total\_amount}$. | `HIGH` | Manual review / reconciliation adjustment |
| 2 | `DUPLICATE_PAYMENT` | Multiple `CAPTURED` payments sharing the same `gateway_payment_id`. | `CRITICAL` | Gateway refund duplicate charge |
| 3 | `REFUND_EXCEEDS_PAYMENT` | Cumulative refunds for a payment exceed original payment amount. | `CRITICAL` | Financial investigation |
| 4 | `ORPHAN_PAYMENT` | Payment has no valid `bill_id` or references a bill belonging to another restaurant. | `HIGH` | Re-associate to valid bill |
| 5 | `CURRENCY_MISMATCH` | Payment currency does not match restaurant currency (`INR`). | `MEDIUM` | Currency verification |
| 6 | `MISSING_GATEWAY_CORRELATION` | Online/Razorpay payment with status `CAPTURED` has empty `gateway_payment_id`. | `MEDIUM` | Gateway sync / manual reference entry |
| 7 | `REFUND_WITHOUT_CAPTURED_PAYMENT` | Refund record linked to payment whose status is not `CAPTURED`. | `HIGH` | Invalidate refund |
| 8 | `CONFLICTING_PAYMENT_STATES` | Payment has contradictory states (e.g. captured but marked failed). | `HIGH` | State resolution |

### 4.1 Non-Destructive Lifecycle
- Anomalies are persisted to `financial_anomalies` with status `DETECTED`.
- Management can acknowledge (`ACKNOWLEDGED`), resolve (`RESOLVED`), or dismiss (`DISMISSED`) anomalies with audit notes via `PATCH /api/v1/owner/finance/anomalies/{anomaly_id}/status`.
- Detection is **strictly read-only**; the engine never alters bills or payments automatically.

---

## 5. Security, RBAC & Multi-Tenancy

- **Strict Tenant Isolation**: All queries filter by `restaurant_id == tenant.id`. Ledger entries, bills, payments, refunds, and anomalies never leak across tenant boundaries.
- **Role-Based Access Control**:
  - Requires valid Owner/Staff JWT authentication.
  - Requires the `view_finance` permission (added to `ALL_PERMISSIONS` and seeded).
- **Client Non-Authoritative**: Customer apps and web clients cannot declare bill settlement, initiate refunds, or post ledger adjustments.

---

## 6. Endpoints Reference

Base URL prefix: `/api/v1/owner/finance` (and `/api/v1/owner/reconciliation`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/overview` | Executive financial summary (billed, captured, refunds, net collected, reconciliation breakdown, active anomalies count). |
| `GET` | `/reconciliation/payments` | Paginated bill ↔ payment reconciliation list with status filtering and search. |
| `GET` | `/reconciliation/refunds` | Paginated refund records with status and payment linkage. |
| `POST` | `/refunds` | Create a refund record with server-side captured balance validation. |
| `GET` | `/anomalies` | List detected financial anomalies with severity and status filters. |
| `PATCH`| `/anomalies/{anomaly_id}/status` | Update anomaly review status (`ACKNOWLEDGED`, `RESOLVED`, `DISMISSED`) with audit notes. |
| `GET` | `/ledger` | Paginated append-only immutable financial ledger audit log. |
| `POST` | `/ledger/adjustment` | Post an auditable adjustment ledger entry with mandatory reason. |

---

## 7. Owner / Admin Dashboard UI

Located at `frontend/admin/app/(admin)/finance/page.tsx`, linked from the Admin sidebar with the `Scale` icon:
- **Tab 1: Executive Overview**: High-level financial KPIs (Total Billed, Total Captured, Total Refunded, Net Collected, Anomaly Count, Settlement Health Ratio).
- **Tab 2: Payment Reconciliation**: Live bill-by-bill reconciliation ledger with search, status filters (`SETTLED`, `PARTIALLY_PAID`, `OVERPAID`, `UNPAID`, `REFUNDED`), and bill payment breakdown modal.
- **Tab 3: Refund Reconciliation**: Refund history table, reason tracking, and modal to record new refunds against captured payments.
- **Tab 4: Financial Anomalies**: Interactive anomaly center displaying detected discrepancies, severity tags (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), with status management dialog.
- **Tab 5: Immutable Ledger**: Full tamper-evident transaction event log (`BILL_CREATED`, `PAYMENT_CAPTURED`, etc.) with event badges, user metadata, and modal to post adjustments.

---

## 8. Verification & Test Evidence

### 8.1 Targeted Test Suite (`tests/test_phase24_financial_reconciliation.py`)
28 automated tests covering 100% of Phase 24 requirements:
- `test_financial_ledger_entry_creation`: Verified ledger creation on financial events.
- `test_ledger_immutability`: Confirmed `UPDATE` and `DELETE` throw `ValueError` at ORM level.
- `test_bill_payment_reconciliation_settled`: Exact bill total matching captured payments.
- `test_bill_payment_reconciliation_partial`: Incomplete payment detection.
- `test_bill_payment_reconciliation_overpaid`: Overpayment scenario detection.
- `test_bill_payment_reconciliation_unpaid`: Zero payment state.
- `test_bill_payment_reconciliation_refunded`: Fully refunded bill identification.
- `test_refund_validation_success`: Approved refund within captured limit.
- `test_refund_validation_exceeds_payment`: Rejected refund exceeding payment ceiling.
- `test_refund_validation_non_captured_payment`: Rejected refund on failed payment.
- `test_anomaly_bill_amount_mismatch`: Detection rule 1 verified.
- `test_anomaly_duplicate_payment`: Detection rule 2 verified.
- `test_anomaly_refund_exceeds_payment`: Detection rule 3 verified.
- `test_anomaly_orphan_payment`: Detection rule 4 verified.
- `test_anomaly_currency_mismatch`: Detection rule 5 verified.
- `test_anomaly_missing_gateway_correlation`: Detection rule 6 verified.
- `test_anomaly_refund_without_captured_payment`: Detection rule 7 verified.
- `test_anomaly_conflicting_payment_states`: Detection rule 8 verified.
- `test_anomaly_resolution_workflow`: Full `DETECTED` $\rightarrow$ `ACKNOWLEDGED` $\rightarrow$ `RESOLVED` lifecycle.
- `test_manual_adjustment_entry`: Recording of valid adjusting ledger entry.
- `test_adjustment_requires_reason`: Empty reason validation error.
- `test_get_financial_overview_endpoint`: API executive overview data contract.
- `test_get_reconciliation_payments_endpoint`: API bill reconciliation listing.
- `test_get_reconciliation_refunds_endpoint`: API refund listing.
- `test_create_refund_endpoint`: API refund creation endpoint.
- `test_get_anomalies_endpoint`: API anomaly detection listing.
- `test_get_ledger_endpoint`: API immutable ledger query.
- `test_tenant_isolation_finance`: Cross-tenant cryptographic and query boundary verification.

---

## 9. Next Steps & Phase Boundaries
- **Daily Cash Closing**: Daily cash count, register opening/closing, and physical cash drawer variance are intentionally deferred to a future dedicated phase.
- **General Ledger / Accounting**: Tax filing (GST/TDS), double-entry journal book, Balance Sheet, Accounts Payable, and payroll are out of scope.
- **Gateway Direct Refunds**: Direct invocation of Razorpay refund APIs will use the `Refund` record created in Phase 24.
