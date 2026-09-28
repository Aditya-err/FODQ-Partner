# FODQ — Phase 6 Plan: Billing, Payments & Session Closure

## 1. Current Repository Findings
Inspection of the existing repository reveals the following:
- **Order Model**: Contains `PENDING`, `ACCEPTED`, `REJECTED`, `PREPARING`, `READY`, `SERVED`, `CANCELLED`.
- **DineSession Model**: Contains `OPEN`, `BILL_REQUESTED`, `PAYMENT_PENDING`, `PAID`, `CLOSED`.
- **Table Model**: Contains `AVAILABLE`, `OCCUPIED`, `INACTIVE`.
- **Billing Customer Route (`billing_customer.py`)**: Subtotals exclude `CANCELLED` orders but incorrectly include `REJECTED` orders. 
- **Billing Owner Route (`billing_owner.py`)**: Allows manual payment which closes the `DineSession` but fails to release the `Table` back to `AVAILABLE`.
- **Concurrency**: Existing financial state updates lack `SELECT ... FOR UPDATE` row-level locking.
- **Payment Model**: A `Payment` entity tracking individual payment intents does not yet exist.

## 2. Phase 6 Objective
Implement production-grade Billing, Payments, and Session Closure. The system must remain strictly server-authoritative for all financial calculations, preventing client-side tampering of amounts, taxes, or payment statuses. 

## 3. Scope
- Correct bill calculations (excluding `CANCELLED` and `REJECTED` orders).
- Strict Bill lifecycle (including Immutability upon finalization).
- Creation of the `Payment` entity.
- Full-bill Payment intent creation, processing, and Webhook verification.
- Secure, atomic Session Closure and Table release.

## 4. Out of Scope
- Partial payments (NOT supported).
- Split payments (NOT supported).
- Pay-half/pay-later flows (NOT supported).
- PDF invoice/receipt generation (Deferred).
- Advanced POS integrations.
- Inventory, loyalty, subscriptions.

## 5. Architecture Dependencies
- PostgreSQL remains the strict financial source of truth.
- `restaurant_id` is derived securely from the authenticated token.
- Integer minor-unit money arithmetic MUST be used exclusively (e.g., INR 1 = 100 paise).
- Existing Phase 1–5 RBAC, audit logging, and domain logic must be preserved.

## 6. Billing Design
The `Bill` entity will be updated/structured to include:
- Ownership/Relationships: `id`, `restaurant_id`, `session_id`.
- Monetary values (paise): `subtotal`, `tax_amount`, `service_charge_amount`, `discount_amount`, `total_amount`, `paid_amount`, `balance_due`.
- Timestamps: `created_at`, `updated_at`, `finalized_at`.
- Status: `BillStatus` tracking the lifecycle.

## 7. Bill Lifecycle
The billing lifecycle transitions as follows:
1. **OPEN/DRAFT**: The bill can be freely recalculated as new orders arrive.
2. **FINALIZED**: The bill is locked. Item prices, taxes, discounts, and totals become immutable. A payment attempt CANNOT mutate a finalized bill's financial values. No new billable orders can be placed.
3. **PAYMENT_PENDING**: A payment intent is currently active.
4. **PAID**: The bill is fully paid.
5. **SESSION CLOSED**: The corresponding session is successfully closed.

## 8. Payment Design
A new `Payment` entity will track individual payment attempts:
- **Primary Key**: `id` (UUID)
- **Foreign Keys**: `restaurant_id`, `bill_id`, `session_id`
- **Monetary**: `amount`, `currency`
- **Gateway details**: `gateway`, `gateway_order_id`, `gateway_payment_id`
- **State tracking**: `status` (`CREATED`, `PENDING`, `CAPTURED`, `FAILED`, `CANCELLED`, `REFUNDED`), `idempotency_key`, `failure_reason`
- **Timestamps**: `created_at`, `updated_at`, `captured_at`

## 9. Full-Bill Payment Rule
This is a HARD MVP RULE: Payment must be for the **exact and complete bill total**.
- No partial amounts or split payments.
- Client-provided amounts in API requests act strictly as assertions; the backend exclusively relies on `bill.total_amount`.
- Payment initiation verifies: `payment.amount == bill.total_amount` AND `bill.balance_due == bill.total_amount`.

## 10. Razorpay Gateway Abstraction
**Razorpay** is the PRIMARY Phase 6 implementation target. The integration will use an abstraction interface:
```
PaymentGateway
      |
      └── RazorpayGateway
```
The interface will strictly define business-level operations (`create_payment_intent`, `verify_webhook_signature`, `refund_payment`) allowing for future addition of other gateways without modifying core FODQ logic. Razorpay secrets MUST remain strictly server-side.

## 11. Webhook Security
`POST /api/v1/payments/webhooks/razorpay` MUST:
- Verify Razorpay webhook signature.
- Parse the raw request body.
- Be idempotent to prevent replay or double processing.
- Safely handle duplicate or unknown events.
- Rely on PostgreSQL transactional locking (`SELECT ... FOR UPDATE`) to mutate the `Payment` and `Bill` states.

## 12. Payment Idempotency
- **Application Level**: Duplicate payment initiation requests with the same `idempotency_key` safely return the existing result. Different requests with the same key return `409 Conflict`.
- **Database Level**: Unique constraint on `idempotency_key`.
- An already `PAID` bill must explicitly reject any new payment intents or capture webhooks.

## 13. Concurrency Strategy
The system must safely handle race conditions using PostgreSQL pessimistic row-level locking (`SELECT ... FOR UPDATE`):
- **Double Pay click**: Handled by uniqueness on `idempotency_key`.
- **Simultaneous Webhook + Status Request**: `Payment` and `Bill` rows locked during updates.
- **Payment Capture + Session Close**: `DineSession`, `Bill`, and `Table` rows locked.
- **Payment + Order Cancellation**: `Bill` finalization state strictly prevents mutation.
- **Duplicate Webhook Delivery**: Webhook idempotency and state assertions (`PENDING` -> `CAPTURED` only) reject duplicates.

## 14. Session Closure
Session closure must be strictly **ATOMIC**. 
Transaction boundary:
1. `SELECT DineSession ... FOR UPDATE`
2. `SELECT Bill ... FOR UPDATE`
3. `SELECT Table ... FOR UPDATE`
4. Verify bill is `PAID` and `captured payments == bill total`.
5. Update `DineSession.status = CLOSED`.
6. Update `Table.status = AVAILABLE`.
7. Commit transaction. (If any step fails, roll back completely).

## 15. Table State Synchronization
Tables associated with a `CLOSED` session (and fully paid bill) must atomically transition back to `AVAILABLE`. Existing `INACTIVE` tables must be preserved and never automatically transition to `AVAILABLE`.

## 16. API Contracts
- `POST /api/v1/dine/bill/request`: Requests and finalizes the bill.
- `GET /api/v1/dine/bill`: Retrieves the bill.
- `POST /api/v1/dine/payments/initiate`: Generates Razorpay intent. Validates full-amount and finalized bill constraints.
- `GET /api/v1/dine/payments/{payment_id}/status`: Fetches status.
- `POST /api/v1/payments/webhooks/razorpay`: Verifies Webhooks.

All endpoints must securely derive `restaurant_id` and `session_id` from the auth layer and enforce `SELECT ... FOR UPDATE` boundaries for mutations.

## 17. Owner/Admin Flow
- `GET /api/v1/owner/sessions/{session_id}/bill`
- `GET /api/v1/owner/payments`
- `POST /api/v1/owner/payments/{payment_id}/refund`: Authorized endpoint to reverse a payment.
- `PATCH /api/v1/owner/bills/{bill_id}/pay`: Explicit manual (cash) payment capture. Must follow atomic session closure protocol.

## 18. Customer Flow
The frontend must provide a view of the current bill (subtotal, tax, final payable amount) and a "Pay" button initiating Razorpay checkout. The frontend must correctly handle processing states, failures, and retries. Frontend must NEVER calculate authoritative totals or independently assert payment success.

## 19. Refund Boundary
- The MVP supports basic full-refund logging and gateway requests for `CAPTURED` payments.
- Partial refunds are OUT OF SCOPE.
- Refunds must be fully auditable and protected by idempotency constraints. Card details/CVV are never stored.

## 20. Security Threat Model
- **Tampering**: Exclusively server-authoritative financial calculation.
- **Spoofing**: Frontend callbacks are untrusted; gateway Webhooks (or server-side status checks) are the sole source of truth for payment success.
- **BOLA/IDOR**: strict cross-tenant assertions block unauthorized bill/payment viewing.
- **Closed-Session Ordering**: Explicit server-side blocks prevent new orders if `session.status != OPEN`.
- **Leakage**: Sensitive payment credentials are NEVER stored or logged.

## 21. Audit Logging
Audit events to be logged using the existing infrastructure:
- `BILL_REQUESTED`, `BILL_FINALIZED`
- `PAYMENT_INITIATED`, `PAYMENT_CAPTURED`, `PAYMENT_FAILED`
- `WEBHOOK_RECEIVED`, `WEBHOOK_PROCESSED`
- `SESSION_CLOSED`

## 22. Failure & Recovery
- If Razorpay is temporarily unavailable, safe 5xx errors are surfaced.
- If frontend closes during payment, the Webhook will asynchronously fulfill the payment capture and session closure securely.
- Strict state management ensures a timeout DOES NOT cause double charges.

## 23. Observability
Safe structured logging will track:
- Payment and Webhook success/failure rates.
- Duplicate Webhook occurrences.
- Reconciliation mismatches.
- **CRITICAL**: No card data, CVV, or API keys will ever be logged.

## 24. Database/Migration Plan
- Alembic migration to create `Payment` table.
- Alembic migration to alter `Bill` table (adding `finalized_at`, `discount_amount`, `balance_due`, `paid_amount`).

## 25. Test Plan
- **Billing**: Validates exact paise arithmetic. Ensures `REJECTED` and `CANCELLED` orders are omitted. Confirms Immutability post-finalization.
- **Payment**: Asserts full-payment ONLY rules. Rejects duplicate payments.
- **Webhooks**: Simulates valid, invalid, duplicate, and unknown signatures/events.
- **Session/Concurrency**: Executes simultaneous payment and session closure races ensuring data integrity.
- **Regression**: All Phase 1–5 tests continue to pass.

## 26. Implementation Order
1. **Phase 6A**: Bill model corrections & Payment schema.
2. **Phase 6B**: Server-authoritative Bill calculation and Immutability lifecycle.
3. **Phase 6C**: Payment domain & constraints.
4. **Phase 6D**: Payment service & Razorpay abstraction.
5. **Phase 6E**: Webhook verification and idempotency.
6. **Phase 6F**: Atomic session closure & table release.
7. **Phase 6G**: Owner/Admin UI and Customer UI.
8. **Phase 6H**: E2E Concurrency, Security, and Regression Testing.

## 27. Acceptance Criteria
- `REJECTED` and `CANCELLED` orders are correctly excluded from the bill.
- Finalized bills are immutable.
- ONLY full-bill payments are supported.
- Razorpay Webhooks are verified, processed idempotently, and protected by PostgreSQL locks.
- Paid sessions atomically close and release tables to `AVAILABLE`.
- Phase 6 tests pass without regressions across Phase 1–5.
- No critical security issues remain.

## 28. Resolved Decisions
1. **Partial payments**: NO for Phase 6 MVP.
2. **Primary payment gateway**: RAZORPAY.

## 29. New Decisions Requiring User Approval
None at this time.
