# FODQ — Phase 6B Plan: Bill Calculation & Immutable Bill Finalization

## 1. Objective
Establish a reliable, server-enforced financial boundary where a generated Bill becomes immutable. This phase transitions an active dining session from taking orders to a locked financial state (`FINALIZED`), acting as the foundation for payment processing in Phase 6C.

## 2. Current Repository Findings
An inspection of the repository (models and existing API routes) revealed:
- **`Order` Model**: Contains `total_amount` (integer paise) that acts as an immutable financial snapshot. Statuses include `PENDING`, `ACCEPTED`, `REJECTED`, `PREPARING`, `READY`, `SERVED`, `CANCELLED`.
- **`Bill` Model**: Contains integer financial fields (`subtotal`, `tax_amount`, `service_charge_amount`, `discount_amount`, `total_amount`, `paid_amount`, `balance_due`) and uses a `BillStatus` ENUM (`PENDING`, `FINALIZED`, `PAID`).
- **`Restaurant` Model**: Contains `tax_percentage` and `service_charge_percentage` stored as integers (multiplied by 100, i.e., 500 = 5%).
- **Current `billing_customer.py` Implementation**: The customer `/request` endpoint currently aggregates all orders where `status != CANCELLED`. **Finding:** This is incomplete, as `REJECTED` orders are incorrectly included in the subtotal.
- **Current `billing_owner.py` Implementation**: Has a legacy `/pay` endpoint that directly marks the bill as `PAID` and session as `CLOSED`. **Finding:** This bypasses the structured finalization flow and must be disabled/removed.

## 3. Scope
Phase 6B focuses **ONLY** on:
- **Order → Bill Calculation**: Determining correct subtotals based on order snapshots.
- **Bill Finalization**: Changing bill status to `FINALIZED` and enforcing strict immutability.
- **Session State Transitions**: Moving a session into a locked state where no new orders can be placed.

## 4. Billable Order Rules & Finalization Prerequisites
Only legitimate, fulfilled orders contribute to the financial total.
- **Included (Billable)**: `SERVED` (all other active states must reach `SERVED` before finalization)
- **Excluded**: `CANCELLED`, `REJECTED`

**Phase 6B Policy for In-Progress Orders**: 
A bill **may only be finalized when all billable orders have reached `SERVED`**. If a session contains any orders still in `PENDING`, `ACCEPTED`, `PREPARING`, or `READY` status, finalization will fail with a `400 Bad Request`. This strict prerequisite guarantees financial consistency because no included order will subsequently transition into `REJECTED` or `CANCELLED` state, eliminating the risk of a finalized bill containing ghost amounts.

## 5. Server-Side Bill Calculation
Calculations will be performed **100% server-side**. 
Phase 6B will **use the existing `Order.total_amount`** because Phase 4 already guarantees this is an accurate, server-calculated financial snapshot of `OrderItem`s at the time the order was placed. 

## 6. Financial Formula
All arithmetic will use integer paise (no floats) and floor division (`//`) for rounding.
1. `subtotal` = SUM(`Order.total_amount` for all `SERVED` orders in the session)
2. `service_charge_amount` = `(subtotal * restaurant.service_charge_percentage) // 10000`
3. `tax_amount` = `(subtotal * restaurant.tax_percentage) // 10000`
4. `discount_amount` = `0` (Discounts are not modeled in `Restaurant` yet; this explicit zero avoids inventing a tax engine).
5. `total_amount` = `subtotal + tax_amount + service_charge_amount - discount_amount`
6. `paid_amount` = `0` (Phase 6C handles payments).
7. `balance_due` = `total_amount`

## 7. Immutable Finalization & Order Mutability
A bill's lifecycle transitions from `PENDING` to `FINALIZED`. 
- **Financial Immutability**: Once `Bill.status == FINALIZED`, the application service layer must reject any attempts to add new orders to the `DineSession`, modify existing orders, or recalculate the bill. The `finalized_at` timestamp will be populated.
- **Operational State Immutability**: Since finalization requires all non-cancelled/non-rejected orders to be `SERVED`, there are no further kitchen status transitions possible. No order can transition from `SERVED` to `CANCELLED` or `REJECTED`. The operational state is inherently locked alongside the financial state.

## 8. Concurrency & Transaction Protocol
To prevent race conditions, the **same `DineSession` lock (`SELECT FOR UPDATE`)** must serialize both order creation and bill finalization.

### Operation A: Order Creation (Customer)
1. `BEGIN`
2. `SELECT * FROM dine_sessions WHERE id = ? FOR UPDATE`
3. Check `session.status < PAYMENT_PENDING`. If false, abort.
4. Insert `Order`.
5. `COMMIT`

### Operation B: Bill Finalization (Owner)
1. `BEGIN`
2. `SELECT * FROM dine_sessions WHERE id = ? FOR UPDATE`
3. Check `session.status < PAYMENT_PENDING`. If false, abort or return idempotent result.
4. `SELECT * FROM orders WHERE session_id = ? FOR UPDATE`
5. Verify no orders are `PENDING`, `ACCEPTED`, `PREPARING`, or `READY`. If any exist, abort.
6. Calculate totals.
7. `SELECT * FROM bills WHERE session_id = ? FOR UPDATE`
8. Update `Bill` status to `FINALIZED` and `finalized_at = now()`.
9. Update `DineSession` status to `PAYMENT_PENDING`.
10. `COMMIT`

## 9. API Contract Updates
### Customer API:
- `POST /api/customer/billing/request`: Exclude `REJECTED` and `CANCELLED`. Update `DineSession.status` to `BILL_REQUESTED`. Bill remains `PENDING`.

### Owner API:
- `POST /api/owner/billing/{bill_id}/finalize`:
  - **Auth**: Authenticated restaurant staff.
  - **RBAC**: Must verify `Bill.restaurant_id == current_tenant.id`.
  - **Rule**: Owner finalization is allowed directly from `OPEN -> FINALIZED` (it does not require the customer to reach `BILL_REQUESTED` first).
  - **Action**: Executes the atomic transaction described above.
- **Legacy `/pay` Endpoint**: The existing `/{bill_id}/pay` endpoint in `billing_owner.py` will be **completely disabled/removed** in Phase 6B. It is a legacy bypass that incorrectly marks bills `PAID` without the Phase 6C gateway lifecycle. Phase 6B strictly removes this bypass route.

## 10. Session State Interaction
Phase 6B supports:
- `OPEN` -> (Customer Request) -> `BILL_REQUESTED`
- `OPEN` or `BILL_REQUESTED` -> (Owner Finalization) -> `PAYMENT_PENDING`

Phase 6B will **NOT**:
- Mark the session as `PAID`.
- Mark the session as `CLOSED`.
- Release the table.

## 11. Idempotency & Error Handling
- **Idempotency**: `POST /finalize` on an already `FINALIZED` bill will safely return the exact existing finalized financial snapshot. It will **not** recalculate or mutate the bill.
- **Errors**:
  - `400 Bad Request`: "Cannot finalize: Orders are still in progress." or "No billable orders found."
  - `403 Forbidden`: Cross-tenant access attempt.
  - `409 Conflict`: "Cannot add orders; bill is finalized."

## 12. Threat Model
| Threat | Mitigation |
|--------|------------|
| Client-side total manipulation | Server ignores all client financial inputs; re-calculates via DB `Order.total_amount`. |
| Cross-tenant finalization (IDOR) | Enforce `tenant.id == Bill.restaurant_id` on all owner routes. |
| Double finalization race condition | Row-level locking (`FOR UPDATE`) on Session and Bill guarantees serial execution. |
| Order creation vs finalization race | Both routes must lock the `DineSession` row via `FOR UPDATE` before proceeding. |
| Finalized bill mutation attempt | Application layer rejects all modifications to a `FINALIZED` bill. |
| Legacy `/pay` endpoint bypass | The `/pay` endpoint is fully removed. |

## 13. Test Plan (Concurrency & Security Focus)
- **Finalize vs Finalize**: `asyncio.gather` two simultaneous `/finalize` requests. Assert one fails or idempotently returns the result of the first, ensuring no double-counting.
- **Order Creation vs Finalize**: `asyncio.gather` an order creation and a finalization. Assert that serial row-locking prevents an order from sneaking into a finalized bill.
- **Cross-tenant Finalize**: Attempt IDOR by passing a different restaurant's `bill_id`.
- **Repeated Finalize**: Attempt finalization on a `FINALIZED` bill. Assert the timestamp and amounts remain completely unchanged.
- **Finalized Bill Mutation Attempt**: Attempt to update totals directly.
- **Post-Finalization Ordering**: Attempt to add an order to a `PAYMENT_PENDING` session.
- **Order Status Mutation**: Attempt to transition a `SERVED` order to `CANCELLED` after finalization.

## 14. Acceptance Criteria
1. No billable order can become `REJECTED`/`CANCELLED` after its financial amount has been included in a finalized bill (enforced by requiring all billable orders to be `SERVED` before finalization).
2. Order creation and Bill finalization use the exact same `DineSession` row lock.
3. Legacy `/pay` endpoint is removed and cannot bypass the lifecycle.
4. Finalized financial values never change.
5. Bill calculation operates 100% server-side using `Order.total_amount`.
6. Idempotent finalization (retries safely return the finalized bill snapshot).
7. Tenant isolation (RBAC) enforced on owner routes.
8. No payment integration or gateway code is implemented.
9. No sessions are marked `PAID` or `CLOSED`.
10. All new and existing Phase 1–6A tests pass.

## 15. Migration Assessment
**No database migration required.** 
The schema deployed and verified in Phase 6A already contains all necessary fields (`BillStatus.FINALIZED`, `SessionStatus.PAYMENT_PENDING`, integer financial columns, and `finalized_at`). 

## 16. Implementation Sequence
1. Remove legacy `/pay` route in `billing_owner.py`.
2. Update `order_customer.py` (Order Creation) to lock the `DineSession` with `FOR UPDATE` and block new orders if session is `>= PAYMENT_PENDING`.
3. Update `billing_customer.py` `/request` to exclude `REJECTED`.
4. Implement atomic `/finalize` route in `billing_owner.py` with `FOR UPDATE` on `DineSession`, verifying all active orders are `SERVED`.
5. Write comprehensive Phase 6B unit & concurrency tests.
6. Execute full regression suite.
7. Verify completely.
