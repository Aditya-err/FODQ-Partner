# PHASE 6D: SECURE WEBHOOKS + RECONCILIATION PLAN

## 1. Objective
Implement a secure, idempotent Razorpay webhook endpoint to handle asynchronous payment notifications (`payment.captured`, `payment.failed`). The processing must be durably idempotent, enforce financial correctness, safely reconcile orphaned payments, and atomically transition the `Bill` state to `PAID` without advancing to Phase 6E boundaries.

## 2. Current Architecture & Context
- **Phase 6A/6B**: Solidified `Bill`, `Payment`, and financial arithmetic in integer paise.
- **Phase 6C**: Added Razorpay initiation. `Payment` records are created locally as `CREATED` *before* the external network call. Active `CREATED`/`PENDING` duplicate payments are prevented at the DB level.
- **Phase 6C Locking**: The current lock order in `payment_customer.py` is exactly `DineSession` → `Bill`.
- **Limitation**: If the DB disconnects after Razorpay succeeds in Phase 6C, a `Payment` remains `CREATED` without a `gateway_order_id` (an orphaned gateway order).

## 3. Scope
- Dedicated, authenticated Razorpay webhook endpoint.
- HMAC SHA256 Webhook signature verification.
- Webhook secret rotation design.
- Durable Idempotent Processing via a PostgreSQL `webhook_events` table.
- Atomic financial state machine updates (`Payment` and `Bill`).
- Financial amount and currency validation.
- Safe reconciliation correlation for Phase 6C disconnected-state gaps.

## 4. Out of Scope
- Exactly-Once Delivery guarantees (Razorpay provides At-Least-Once delivery; we provide Durable Idempotent Processing).
- Phase 6E logic (closing `DineSession`, releasing `Table`).
- Refund processing.
- Webhook polling / scheduled worker scripts.
- Modifying customer authentication logic.
- Implementing the proposed Phase 6C correlation correction.

---

## 5. Webhook API Design
- **Method**: `POST`
- **Path**: `/api/v1/webhooks/razorpay`
- **Authentication**: Bypasses customer JWT middleware (`get_current_dine_session`). Webhooks are server-to-server and rely exclusively on HMAC cryptographic signatures.
- **Response Timing**: Target a fast `2XX` response safely under Razorpay's webhook timeout window. DB processing will be short and must NOT perform unnecessary external gateway calls while holding PostgreSQL locks.
- **Invalid Signature Processing Order**:
  1. HTTP request received.
  2. Request body size validated (prevent large payload DDoS).
  3. Read RAW body.
  4. Verify HMAC signature against raw body.
  5. **ONLY AFTER verification passes**: Parse JSON, validate event, and begin database processing.
  Invalid signatures must be rejected (401) before any JSON parsing, DB queries, or logging of raw sensitive contents.

## 6. Signature Verification & Rotation
- **Process**: `raw_body` + webhook secret -> HMAC SHA256 -> Compare with `X-Razorpay-Signature`.
- **Secret Configuration**: Use `RAZORPAY_WEBHOOK_SECRET`.
- **Secret Rotation**: Webhook secrets change. The environment will support `RAZORPAY_WEBHOOK_SECRET` (active) and `RAZORPAY_WEBHOOK_SECRET_PREVIOUS`. The endpoint will attempt signature verification with the active secret first; if it fails, it will fallback to the previous secret. 

## 7. Event Idempotency & Atomicity
Razorpay provides **AT-LEAST-ONCE** delivery. FODQ provides **DURABLE IDEMPOTENT PROCESSING**.

- **Atomicity**: Recording a webhook event and applying its financial state transition must occur inside **ONE PostgreSQL transaction**.
  ```
  BEGIN
      Insert webhook_events row (Unique constraint on provider + event_id)
      Lock DineSession
      Lock Bill
      Lock Payment
      Validate validations (amount/currency/identifiers)
      Update Payment
      Update Bill (if CAPTURED)
  COMMIT
  ```
- If the `UNIQUE` constraint is violated during insert, it's a **duplicate event** -> safely return `200 OK` without repeating the transition.
- If any validation or state update fails internally, the transaction is **ROLLED BACK**. The event is not permanently recorded, allowing Razorpay to retry the **failed processing**.

## 8. Payment State Machine
Webhook events dictate state changes, but do NOT blindly overwrite terminal states.

- **`payment.captured`**: Authoritative financial transition.
  - If `Payment` is `CREATED`/`PENDING`: Verify amount/currency -> transition to `CAPTURED`.
  - If `Payment` is `CAPTURED`: Idempotent duplicate; do nothing.
  - If `Payment` is `FAILED`/`CANCELLED`: Flag for manual review; do not blindly overwrite.

- **`payment.failed`**:
  - If `Payment` is `CREATED`/`PENDING`: Transition to `FAILED`.
  - If `Payment` is `CAPTURED`: Impossible in normal flow. Log and ignore. A CAPTURED payment must never be blindly downgraded.

- **`payment.authorized`**:
  - Razorpay authorized the funds but not yet captured.
  - We will transition `Payment` to `PENDING` (from `CREATED`).
  - Do NOT mark `Bill` PAID. Do NOT mark `Payment` CAPTURED. 

- **`order.paid`**:
  - Secondary/duplicate confirmation event.
  - `payment.captured` is chosen as the authoritative transition because it maps precisely to the financial capture of funds. `order.paid` will be handled idempotently: it will simply be logged or ignored to prevent double-applying the `Bill → PAID` transition.

## 9. Financial Validation & Trust Hierarchy
**DO NOT BLINDLY TRUST WEBHOOK METADATA.**
Trust Hierarchy:
1. Verify webhook HMAC signature against RAW body.
2. Extract gateway identifiers (order ID, payment ID).
3. Correlate to local `Payment` using database identifiers.
4. Load local `Bill` and `DineSession` from the database.
5. **Treat local database financial values as authoritative.**
6. Verify gateway amount and currency against local `Payment` and `Bill` records.

If `webhook.amount != Payment.amount` or `webhook.amount != Bill.total_amount` (or currency mismatch):
- Do NOT capture. Do NOT mark Bill PAID. 
- Record a security audit event and return `200 OK` (to acknowledge receipt but reject business processing).

## 10. Bill PAID Atomicity
- `Payment` transition to `CAPTURED` and `Bill` transition to `PAID` must happen atomically within the same transaction.
- If the `Bill` update fails, the `Payment` transition rolls back.
- **Boundary**: The transaction updates `Bill.status = PAID` and `balance_due = 0`. `DineSession` remains `PAYMENT_PENDING` and `Table` remains unchanged (reserved for Phase 6E).

## 11. Concurrency Strategy
- **Lock Ordering**: To strictly avoid deadlocks with Phase 6C (`payment_customer.py` locks `DineSession` → `Bill`), the webhook will enforce the identical locking order:
  `DineSession` → `Bill` → `Payment`.
- Overlapping concurrent webhooks for the same order will serialize on these locks, ensuring safe, deterministic resolution.
- External gateway calls will NEVER be made while these locks are held.

## 12. Reconciliation Correlation (Healing Gaps)
**Phase 6C Gap**: If DB fails after Razorpay success, `Payment` is `CREATED` but lacks a `gateway_order_id`.
**Correlation Strategy**:
- Primary correlation: `Razorpay payload order_id` == `Payment.gateway_order_id`.
- **Design Gap Identified**: Phase 6C currently passes `session_id` and `bill_id` in Razorpay metadata. The user explicitly stated this is NOT strong enough for a collision-safe fallback correlation.
- **Proposed Correction for Phase 6C**: Phase 6C should be updated to pass `payment_id: str(new_payment.id)` into the Razorpay order `notes` payload. 
- **Revised Phase 6D Fallback**: When `payment.captured` arrives and the primary `gateway_order_id` lookup fails, the webhook will extract `notes.payment_id` and look up the `Payment` by its exact Primary Key. If it's `CREATED` and amounts match, it safely heals the orphan.
- **Scheduled Reconciliation**: Scheduled workers (polling Razorpay for unresolved `CREATED` payments) are marked as FUTURE/Phase 6D subcomponent and will not be implemented now.

## 13. Failure Handling
- **Invalid signature**: `401 Unauthorized` (Fast rejection).
- **Unknown event/Duplicate**: `200 OK` (Idempotent success).
- **Amount/Currency mismatch**: `200 OK`, log critical security event. Do not mutate state.
- **Unknown order/payment ID**: `200 OK`, log critical error.
- **Out-of-order event**: (e.g. `captured` then `failed`). State machine explicitly ignores downgrades from terminal states.
- **DB/Internal error**: `500 Internal Server Error`. Transaction rolls back, allowing Razorpay to retry.

## 14. Database Design
New Table: `webhook_events`
- `id`: UUID (PK)
- `provider`: String
- `provider_event_id`: String
- `event_type`: String
- `created_at`: DateTime
**Constraint**: `UNIQUE(provider, provider_event_id)`.
No `status` column is needed. Because the insert happens in the same transaction as the financial update, the mere existence of the row guarantees it was PROCESSED. If processing fails, the transaction rolls back the insert.

## 15. Security Threat Model
- **Forged webhook**: Prevented by HMAC SHA256 validation.
- **Replay / Duplicate delivery**: Prevented by PostgreSQL `UNIQUE` constraint on `webhook_events`.
- **Out-of-order delivery**: Safely handled by strict state machine transitions (terminal states cannot regress).
- **Amount/Currency tampering**: Prevented by server-authoritative validation against `Bill.total_amount`.
- **Metadata manipulation / ID Substitution**: Neutralized by strict cryptographic validation + local DB exact PK lookups + amount match requirements.
- **Cross-tenant correlation**: DB foreign keys enforce that Payment belongs to Bill belongs to Session belongs to Restaurant.
- **DB Race conditions**: Defeated by strict `DineSession` → `Bill` → `Payment` pessimistic locking.
- **Webhook flooding / DDoS**: Rejected in microseconds at the signature verification layer before JSON parsing.
- **Secret leakage**: Secrets are exclusively in env variables. Raw payloads are NEVER logged on invalid signatures.

## 16. Test Strategy
1. Valid `payment.captured` correctly updates Payment and Bill atomically.
2. Valid `payment.failed` updates Payment to FAILED.
3. Invalid signature is rejected with 401 before processing.
4. Duplicate webhook event returns 200 with no side effects.
5. Concurrent duplicate webhooks race condition is safely resolved.
6. `payment.authorized` updates to PENDING but does not mark PAID.
7. `order.paid` is idempotently ignored/logged.
8. `payment.captured` + `order.paid` sequence does not double-apply PAID.
9. `captured` → `failed` out-of-order event is safely ignored.
10. Already CAPTURED payment receives duplicate `captured` event -> ignored.
11. Unknown gateway payment ID returns 200 + logged.
12. Unknown gateway order ID returns 200 + logged.
13. Amount mismatch blocks CAPTURE, leaves Bill FINALIZED.
14. Currency mismatch blocks CAPTURE.
15. Wrong gateway order ID mapped to Payment fails validation.
16. Cross-tenant correlation attempt is blocked.
17. Orphaned Phase 6C Payment reconciliation successfully heals using `notes.payment_id`.
18. Ambiguous reconciliation candidate fails safely.
19. DB failure rolls back webhook event insert + payment/bill changes.
20. Bill becomes PAID atomically with Payment CAPTURED.
21. Session remains PAYMENT_PENDING.
22. Table remains OCCUPIED/Unchanged.
23. Phase 6C idempotency regression.
24. Complete regression suite passes.

## 17. Phase Boundary
**Phase 6D MAY**: Verify webhooks, update Payment state, mark Bill PAID, reconcile safe orphan payment state.
**Phase 6D MUST NOT**: Close DineSession, set DineSession CLOSED, release Table, set Table AVAILABLE, process refunds, implement Phase 6E logic.
**Final Financial Boundary**: `Payment CAPTURED` → `Bill PAID` → STOP.

---
### Revision Summary
- **Exactly-Once Terminology**: Replaced with "At-Least-Once Delivery" and "Durable Idempotent Processing".
- **Processing Atomicity**: Clarified that webhook deduplication and financial state updates happen in ONE atomic Postgres transaction.
- **Lock Ordering**: Verified Phase 6C locks `DineSession` → `Bill`, and explicitly set Phase 6D to follow this exact order to prevent deadlocks.
- **Reconciliation Correlation**: Identified the Phase 6C gap (`bill_id` + metadata is unsafe). Proposed updating Phase 6C to include `payment_id` in Razorpay metadata for a collision-safe PK fallback correlation.
- **Trust Hierarchy**: Explicitly listed the sequence emphasizing local DB authority over metadata.
- **State Handling**: Explicitly defined handling for `payment.authorized` (to PENDING) and `order.paid` (secondary, ignored).
- **Response Timing**: Updated to require fast 2XX execution without blocking on external calls.
- **Signature Processing**: Moved signature validation to occur *before* JSON parsing to prevent DDoS/leakage.
- **Secret Rotation**: Added design for `RAZORPAY_WEBHOOK_SECRET_PREVIOUS` fallback.
- **Atomicity**: Ensured Payment CAPTURED and Bill PAID are transactionally locked together.
- **Amount Validation**: Enforced strict equality between webhook, `Payment.amount`, and `Bill.total_amount`.
- **Database Design**: Removed unnecessary `status` column from `webhook_events`, leveraging RDBMS transaction atomicity.

**PHASE 6D PLAN — READY FOR FINAL REVIEW**
