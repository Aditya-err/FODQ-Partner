# Phase 6C: Payment Service + Razorpay Initiation Verification

## 1. Executive Summary

The Phase 6C payment initiation domain has been remediated and fully verified.
**Result:** **PHASE 6C REMEDIATION — PASS**

## 2. Transaction Flow Remediation

### A. Original Transaction Flow (Flawed)
- `BEGIN`
- `SELECT ... FOR UPDATE` on DineSession
- `SELECT ... FOR UPDATE` on Bill
- `await gateway.create_payment_intent(...)` (External Razorpay API call holding row locks)
- Create `Payment` record in `CREATED` state
- `COMMIT`

*Problem*: Holding PostgreSQL row locks during an external network call severely blocked concurrent operations, creating a massive production bottleneck.

### B. Remediated Transaction Flow (Safe)
The flow has been restructured into two short, safe transactions:

**Short Transaction 1: Local Reservation**
- `BEGIN`
- `SELECT ... FOR UPDATE` on DineSession and Bill
- Enforce business validations (Full bill amount, Finalized status, Active Session)
- **Active-Payment Protection:** Verify no `Payment` records for this `Bill` are in `CREATED` or `PENDING` states.
- Create local `Payment` reservation in `CREATED` state
- Update `DineSession` to `PAYMENT_PENDING`
- `COMMIT` (Row locks released)

**Network Call**
- `await gateway.create_payment_intent(...)` via `asyncio.to_thread`

**Short Transaction 2: State Finalization**
- If Razorpay API succeeds:
  - `BEGIN`
  - Update local `Payment` with `gateway_order_id`
  - `COMMIT`
- If Razorpay API fails:
  - `BEGIN`
  - Update local `Payment` status to `FAILED` with failure reason.
  - `COMMIT`

## 3. Active-Payment Duplication Protection

A secondary protection layer was implemented inside the reservation transaction. Before creating a new local payment attempt, the database strictly ensures that no other active payment (status `CREATED` or `PENDING`) already exists for the `Bill`.
This guarantees that concurrent requests using different `Idempotency-Key` headers cannot bypass the Redis idempotency lock and duplicate active payment attempts.

## 4. Idempotency Handling

Different `Idempotency-Key` values are handled correctly:
- Same `Idempotency-Key` + same request: Middleware caching safely returns the cached 201 response.
- Different `Idempotency-Key` + same finalized Bill: Handled by the new database active-payment constraint. The second request receives a `409 Conflict`.

## 5. Distributed Failure Handling

**Razorpay Failure:** If the Razorpay order creation fails, the local `Payment` reservation is explicitly marked as `FAILED`, freeing up the `Bill` for a subsequent payment attempt.
**DB Failure After Razorpay Success:** If the database disconnects during Short Transaction 2, the Razorpay order is orphaned on the gateway. The local `Payment` remains in `CREATED` state but without a `gateway_order_id`. This is a known distributed systems limitation documented here for Phase 6D (reconciliation/webhooks) to monitor or ignore, as unpaid gateway orders will eventually expire.

## 6. Testing Outcomes

- **Phase 6C Tests:** Expanded to cover active payment rejection, Razorpay failure recovery, and session closure boundary checks.
- **Full Regression Suite:** 52/52 tests passing (Phase 1 through 6C).

## 7. Files Remediated

- `backend/app/api/routes/payment_customer.py`: Restructured transaction boundaries and added conflict queries.
- `backend/tests/test_phase6c_payments.py`: Added concurrency, duplication, and failure tests.

This phase is securely bounded. No webhook handling, capture processing, or table release logic was introduced.

## 8. Correlation Hardening (Phase 6C Fix)

- **Enhancement**: Razorpay Orders now include the local `payment_id` in their `notes` metadata, alongside the existing `session_id` and `bill_id`.
- **Purpose**: This provides deterministic, collision-safe Payment correlation for future Phase 6D reconciliation.
- **Scope**: Phase 6D webhook/reconciliation implementation is NOT part of this change. Transaction architecture, locks, and idempotency behavior remain completely unchanged.
