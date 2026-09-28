# Phase 5 Plan: KDS & Real-time Order Tracking

## 1. IN SCOPE
- Explicit Order State Machine enforcement (backend).
- Kitchen Display System (KDS) UI for active orders.
- Order details view in the KDS (quantities, special instructions, option snapshots).
- Authorized kitchen/staff status transitions.
- Real-time customer order tracking (polling).
- Native WebSocket architecture for Kitchen updates via FastAPI & Redis Pub/Sub.
- Pessimistic Concurrency Control using PostgreSQL row-level SELECT ... FOR UPDATE locking for status updates.
- Audit logging for order state transitions.
- Comprehensive backend and frontend testing.

## 2. OUT OF SCOPE
- Payments integration.
- Analytics and reporting dashboards.
- Point of Sale (POS) and inventory integrations.
- Offline/PWA caching capabilities for KDS.
- Customer Delivery / external aggregators.

## 3. DATABASE CHANGES
- **Update `OrderStatus` Enum**: Add `ACCEPTED` and `REJECTED`. The complete list will be: `PENDING`, `ACCEPTED`, `REJECTED`, `PREPARING`, `READY`, `SERVED`, `CANCELLED`.
- **New Table `order_status_history`**:
  - `id` (UUID, PK)
  - `order_id` (UUID, FK -> orders.id, Index)
  - `previous_status` (OrderStatus, nullable)
  - `new_status` (OrderStatus)
  - `user_id` (UUID, FK -> users.id, nullable - if updated by staff)
  - `notes` (String, nullable - e.g., rejection reason)
  - `created_at` (DateTime, default=now)

## 4. SECURITY & CONCURRENCY
- **Tenant Isolation**: Kitchen endpoints and WebSocket connections must extract `restaurant_id` from the authenticated staff user's token, never trusting client payloads.
- **RBAC**: Enforce a required permission (e.g., `orders:manage`) on all KDS endpoints.
- **BOLA/IDOR**: Every state change checks `WHERE id = :order_id AND restaurant_id = :tenant_id`.
- **Concurrency (Pessimistic Concurrency Control)**: State changes must use PostgreSQL row-level `SELECT ... FOR UPDATE` (via SQLAlchemy `with_for_update()`) inside a transaction to prevent race conditions when two kitchen staff click "Accept" simultaneously.
- **Strict State Validation**: Server strictly rejects transitions out of sequence (e.g., `READY` directly to `PENDING`).

## 5. ORDER STATE MACHINE
| Current State | Allowed Next States | Triggered By | Business Rules & Actions |
|---------------|---------------------|--------------|--------------------------|
| *None*        | PENDING             | Customer     | Visible to Kitchen as "New". Created when checkout succeeds. |
| PENDING       | ACCEPTED, REJECTED, CANCELLED | Kitchen (Acc/Rej), Customer (Can) | Customer may cancel ONLY while PENDING. Kitchen can Accept or Reject. No refunds/payments in Phase 5. |
| ACCEPTED      | PREPARING, CANCELLED| Kitchen      | Kitchen commits to making it. Customer CANNOT directly cancel once ACCEPTED. Staff cancellation rules apply. |
| PREPARING     | READY               | Kitchen      | Kitchen starts cooking. Customer sees "Preparing". |
| READY         | SERVED              | Kitchen/Staff| Explicit staff-controlled transition when food is packed. Does not happen automatically. |
| SERVED        | *None* (Terminal)   | Kitchen/Staff| Explicit staff-controlled transition when handed to customer. Order archived. |
| CANCELLED     | *None* (Terminal)   | Customer/Staff| Terminated. Only customer (if PENDING) or staff can cancel. |
| REJECTED      | *None* (Terminal)   | Kitchen      | Terminated. Staff rejects due to inventory/capacity. |

*Audit logging is triggered on EVERY state transition in this matrix.*

## 6. REALTIME ARCHITECTURE
- **Protocol**: Native FastAPI WebSockets.
- **Broadcasting**: Redis Pub/Sub backend.
- **Connection**: `ws://<domain>/api/v1/owner/orders/ws`
- **Authentication**: Concrete WebSocket authentication via the first incoming WebSocket message containing the JWT (no JWT in URL/query parameters for security).
- **Tenant Isolation**: Upon connection and authentication, the backend derives `restaurant_id` securely from the authenticated token (e.g., via `get_current_tenant` dependency) and subscribes the WebSocket ONLY to the Redis channel `kds:orders:{restaurant_id}`. The client payload is never trusted for isolation.
- **Events**: 
  - `ORDER_CREATED`: Broadcast to KDS when a customer submits a new order.
  - `ORDER_UPDATED`: Broadcast when status changes (so other KDS screens update instantly).
  - *Event Delivery is "notification only".*
- **Failure Behavior**: Redis Pub/Sub is for transient events. The PostgreSQL DB remains the single source of truth. If Redis fails or a message is missed, the KDS will recover via periodic polling/refresh of the REST API.
- **Customer Fallback**: Customer UI will continue using 15s polling for simplicity in Phase 5, reducing concurrent connection overhead for transient users, while Kitchen gets full WebSockets.

## 7. BACKEND CHANGES
- **Models**: Add `OrderStatusHistory`, update `OrderStatus` Enum.
- **API `order_kitchen.py`**:
  - Implement `PATCH /{order_id}/status` with `with_for_update()`, strict state machine rules, and history insertion.
  - Add WebSocket endpoint `/ws` with Redis Pub/Sub listener.
- **Core/Redis**: Expose Pub/Sub utility functions (`broadcast_kds_event`, `subscribe_kds_events`).

## 8. FRONTEND CHANGES
- **Customer (`app/order/page.tsx`)**:
  - Update UI to reflect the new granular statuses (ACCEPTED, REJECTED).
  - Add visual timeline (Pending -> Accepted -> Preparing -> Ready).
- **Kitchen (`frontend/kitchen`)**:
  - Add WebSocket connection hook with auto-reconnect.
  - Main Dashboard: Kanban board or queue layout grouping orders into columns: `New (Pending)`, `Accepted/Prep`, `Ready`.
  - Order Card: Displays time elapsed, items, options, special instructions.
  - Action Buttons: Context-aware (e.g., if Pending, show "Accept" and "Reject").

## 9. TESTING
1. **Valid State Transitions**: Test all happy paths.
2. **Invalid State Transitions**: Test skipping states, reverting states, and unauthorized customer cancellations once ACCEPTED (expect 400 Bad Request / 403 Forbidden).
3. **Concurrency**: Simulate 2 simultaneous requests updating the same order status to verify Pessimistic Concurrency Control using `SELECT ... FOR UPDATE` (expect one 200 OK, one 409 Conflict / 400 Bad Request).
4. **Cross-Tenant Isolation**: Verify Kitchen A cannot view, receive WebSocket events for, or update an Order belonging to Restaurant B. Verify `restaurant_id` is derived from server auth, not client payload.
5. **WebSocket Auth**: Reject connection without valid JWT (sent via first message, not URL).
6. **Audit Logs**: Verify `OrderStatusHistory` rows are correctly written on every transition.
7. **Idempotency Regression**: Ensure Phase 4 idempotency remains intact on order creation.

## 10. VERIFICATION COMMANDS
After implementation, execute:
\`\`\`bash
# Backend checks
alembic current
python -m pytest tests/test_phase5_kds.py tests/test_phase5_realtime.py
python -m pytest

# Frontend checks
cd frontend/customer && npx tsc --noEmit && npm run lint
cd ../kitchen && npx tsc --noEmit && npm run lint
\`\`\`

## 11. ACCEPTANCE CRITERIA
- Database schema matches the new Enum and audit table.
- KDS UI successfully connects via WebSockets and updates without manual refresh.
- Race conditions on status updates are prevented via DB locks.
- Customer polling reflects the new granular state machine.
- All tests pass with 0 failures.

## 12. FUTURE PHASES
- Payment integration.
- Analytics.
- Order throttling based on kitchen load.
