# Phase 4: Cart & Ordering - Implementation Plan

## 1. Executive Summary
This document outlines the architecture and implementation plan for Phase 4 (Cart & Ordering) of FODQ. It builds upon the secure foundation of Phase 1-3, extending the Digital Menu into a robust, secure, and transactional ordering system. It emphasizes strict server-side validation, immutable historical order snapshots, and financial security (minor-unit pricing). 

## 2. Existing Architecture Findings
Based on inspection of the current implementation:
- **Models**: `Order`, `OrderItem`, and `DineSession` exist, but `OrderItem` currently lacks historical snapshotting (it misses `item_name`, option names, etc.).
- **Options**: `MenuItemOptionGroup` and `MenuItemOption` exist from Phase 3, but the existing `Order` API and models currently do not support them.
- **Session**: `DineSession` is correctly established via a secure QR scan and bound to an HTTP-Only cookie (`dine_session_token`).
- **Idempotency**: An `IdempotencyMiddleware` using Redis is globally configured in `main.py`, but the current frontend cart does not yet generate or send the `Idempotency-Key` header.
- **Frontend**: The current `cart/page.tsx` uses a simple `localStorage` approach for client-side state but lacks option selection support and idempotency handling.

## 3. Phase 4 Scope
**In Scope**:
- Item customization (Option Groups & Options selection).
- Client-side cart state management with session isolation.
- Complete server-side price calculation and validation.
- Immutable order snapshots (historical records disconnected from mutable menu data).
- Multiple orders per `DineSession` (Kitchen Order Tickets / KOTs).
- Atomic idempotency implementation to prevent duplicate orders.
- Order state machine boundary definition (orders created in `PENDING`).

**Out of Scope (Phase Boundary Clarification)**:
- **Phase 4**: Cart & Ordering only. No state transitions beyond creation.
- **Phase 5**: Kitchen Display System (KDS), Order Operations, Status Transitions (`PENDING` ➔ `PREPARING` ➔ `READY` ➔ `SERVED`), and WebSockets.
- **Phase 6**: Billing, Invoicing, Tax Engines, Service Charges, and Payments.
- **Phase 7+**: Inventory, Analytics, Loyalty, POS integrations.

*Phase 4 will calculate the exact subtotal of ordered items, but tax and final bill calculation strictly belongs to Phase 6.*

## 4. Cart Architecture Decision
**Recommendation: Client-Side Cart (Local Storage)**
For Phase 4, the cart will remain **Client-Side**, stored in the browser's `localStorage` (or Zustand store), and submitted as a single payload to the server upon checkout. 

### Client-Side Cart Session Isolation
To prevent the browser from accidentally submitting stale items from a previous restaurant, table, or expired session:
1. **Namespace Binding**: The `localStorage` key must bind to the `DineSession` ID (e.g., `fodq_cart_{session_id}`).
2. **Session Verification**: When the customer loads the app, the frontend verifies the active `session_id` from the API (`/dine/session/me`).
3. **Cleanup Rules**: 
   - If the frontend detects a new `session_id` (via a new QR scan), all legacy `fodq_cart_*` keys must be aggressively wiped from `localStorage`.
   - If the API returns a `401 Unauthorized` or session expired response, the frontend must wipe the cart and redirect to a scan prompt.

## 5. Database Design (Order Snapshot Strategy)
Orders must be **immutable historical snapshots**. If a restaurant deletes a menu item or changes a price, past orders must remain perfectly intact.

**Model Updates**:
1. **`OrderItem` (Modified)**
   - `menu_item_id`: UUID (nullable=True, `SET NULL`).
   - `item_name`: String (snapshot of item name).
   - `item_description`: String (snapshot of item description, optional).
   - `quantity`: Integer.
   - `unit_price`: Integer (snapshot in minor units, base price).
   - `subtotal`: Integer (snapshot in minor units, including options).
   - `special_instructions`: String (max 500 chars).
   - `sort_order`: Integer (preserves display sequence).

2. **`OrderItemOptionSnapshot` (NEW)**
   - `id`: UUID (PK).
   - `order_item_id`: UUID (FK to `order_items.id`, CASCADE).
   - `menu_item_option_id`: UUID (nullable=True, `SET NULL`).
   - `group_name`: String (snapshot of Option Group name).
   - `option_name`: String (snapshot of Option name).
   - `price_adjustment`: Integer (snapshot in minor units).
   - `sort_order`: Integer (preserves display sequence from menu).

## 6. Pricing & Money Security
- All money is stored and calculated in **minor units** (e.g., paise/cents) using standard integer types. Floating point math is strictly prohibited.
- **Calculation Flow (Server-Side ONLY)**:
  1. Server fetches `MenuItem` and requested `MenuItemOption`s from DB.
  2. `Item Base Price` + `Sum(Option price_adjustments)` = `Unit Price`.
  3. `Unit Price` * `Quantity` = `Subtotal`.
  4. `Sum(Subtotals)` = `Order Total`.
- The server outright ignores any pricing data sent in the customer's JSON payload.

## 7. Menu Validation at Order Time
When `POST /dine/orders` is called, the server performs a strict recalculation and validation pass. If ANY validation fails, the entire transaction rolls back and NO partial data is saved.

1. **Session & Network**: Ensure `DineSession` is OPEN and network/IP is valid.
2. **Item Existence/Availability**: Ensure all `menu_item_id`s belong to `restaurant_id` and `is_available == True`.
3. **Option Validity**: 
   - Ensure all submitted option IDs belong to the correct item and group.
   - Ensure the option is `is_available == True`.
   - **Duplicate Option Rejection**: Explicitly reject duplicate selected option IDs within the same line item.
4. **Constraints**: Validate `min_selections` and `max_selections` for every option group on the item.
5. **Quantity & Limits Validation**:
   - `quantity`: Must be between 1 and 20 per line item.
   - Line items: Maximum 50 line items per order payload.
   - `special_instructions`: Max 500 characters.

## 8. DineSession & Network Security
Customer ordering authorization strictly follows the Phase 1/2 design:
- The customer cannot supply a `restaurant_id` or `table_id` in the API payload. 
- Context is exclusively derived from the `dine_session_token` (HTTP-Only Cookie).
- `get_current_dine_session` dependency validates the JWT and returns the DB `DineSession` object.
- Network IP enforcements continue to apply at the session-creation level (QR scan).

## 9. Order State Machine Boundary
Phase 4 MUST NOT implement staff/KDS status transition APIs. It only establishes the foundation:
- Phase 4 exclusively creates orders in the `PENDING` state. 
- Phase 5 will implement the transition logic (`PENDING` ➔ `PREPARING` ➔ `READY` ➔ `SERVED`) and cancellation rules.

## 10. Additional Orders Strategy
A `DineSession` represents the continuous seating of a table. 
- A single `DineSession` has a `One-to-Many` relationship with `Order`s.
- Order #1 might be drinks, Order #2 might be mains.
- The cart resets (clears `localStorage`) immediately after a successful `201 Created` response.
- The customer UI will have a "My Orders" tab displaying all `Order`s belonging to the current `DineSession`.

## 11. Idempotency & Concurrency
Order creation is a critical financial action. To prevent double-ordering due to network retries or concurrent clicks, an **atomic claim/lock** is required in Redis.

1. **Generation**: Frontend generates a `uuid4` on Checkout mount and passes it via `Idempotency-Key` header.
2. **Key Scope & Binding**: The Redis key must bind the idempotency key to the specific session/tenant (e.g., `idem:{session_id}:{idempotency_key}`).
3. **Payload Fingerprint**: The backend hashes the request body (e.g., SHA-256 of the JSON payload).
4. **Atomic Lock**: 
   - The server uses Redis `SETNX` (Set if Not eXists) to claim the key atomically as "in-progress".
   - If `SETNX` fails (key already exists):
     - If state is "in-progress", return `409 Conflict` ("Request already processing").
     - If state is "completed":
       - Compare the incoming payload fingerprint to the stored fingerprint.
       - If **Same Key + Same Body**: Return the cached `201 Created` response.
       - If **Same Key + Different Body**: Return `409 Conflict` ("Idempotency key mismatch").
5. **Database Concurrency**: The entire Order creation and Snapshot insertion must be wrapped in a single ACID database transaction.
6. **Failure/Expiration**: If Redis fails, the system must fail-closed (return 503 Service Unavailable) for endpoints requiring idempotency. Cached responses expire after 24 hours.

## 12. API Specification

### `POST /api/v1/dine/orders`
- **Auth**: `dine_session_token` cookie required.
- **Headers**: `Idempotency-Key: <uuid>`
- **Body**:
  ```json
  {
    "items": [
      {
        "menu_item_id": "uuid",
        "quantity": 2,
        "special_instructions": "No onions",
        "selected_option_ids": ["uuid-option1", "uuid-option2"]
      }
    ]
  }
  ```
- **Responses**:
  - `201 Created`: Complete order snapshot returned.
  - `400 Bad Request`: Validation failure (min/max options, quantity bounds, stale item availability/price, invalid session).
  - `401 Unauthorized`: Session expired or invalid.
  - `403 Forbidden`: Network restriction (wrong IP).
  - `409 Conflict`: Idempotency collision or duplicate processing.
  - `422 Unprocessable Entity`: Body schema validation failed (e.g., quantity > 20).

### `GET /api/v1/dine/orders`
- **Auth**: `dine_session_token` cookie required.
- **Response**: `200 OK` List of all historical orders for the active session, sorted by `created_at` desc. Includes full snapshots for display.

### `GET /api/v1/dine/orders/{order_id}`
- **Auth**: `dine_session_token` cookie required. Ensures the order belongs to the active session.
- **Response**: `200 OK` with full order details.

## 13. Customer Frontend Architecture
- **Cart State**: Stored in `localStorage` scoped to the `session_id`.
- **Option Customization Modal**: When adding an item with options, a modal forces the user to satisfy `min_selections` and strictly clamps to `max_selections`.
- **Checkout View**: Displays cart items, options, subtotal, and a "Place Order" button that generates the Idempotency Key.
- **Stale Price/Availability Handling**: If the API returns `400 Bad Request` due to menu changes during checkout, the frontend prompts the user to refresh the cart based on current menu state.

## 14. Security Threat Model

| Threat | Mitigation |
|--------|------------|
| **IDOR / Cross-Tenant** | `restaurant_id` enforced strictly from signed JWT session token. |
| **Price Tampering** | API strictly calculates unit price by querying DB `MenuItem` & `Options`. Payload prices ignored. |
| **Stale / Cross-Session Cart** | LocalStorage keys bound to `session_id`; aggressive wipe on session expiration/new scan. |
| **Duplicate Orders (Replay/Concurrent)** | Atomic `SETNX` Redis lock on `Idempotency-Key` bound to session and payload fingerprint. |
| **Unavailable Item Ordering** | Hard DB query check `is_available == True` inside the atomic POST transaction. |
| **Mass Quantity/Payload Abuse** | Schema validation limits: `quantity` (20), `items` (50), `special_instructions` (500 chars). |
| **Option Manipulation** | Strict server check for duplicate option IDs, item association, and min/max bounds. |
| **Cross-Session Order Access** | `GET /orders` strictly filtered by `session_id` extracted from JWT. |

## 15. Migration Plan
1. Create Alembic revision `phase4_order_snapshots`.
2. Modify `order_items` table: add `item_name`, `item_description`, `sort_order`.
3. Create `order_item_option_snapshots` table with all fields (`group_name`, `option_name`, `price_adjustment`, `sort_order`).
4. Apply downgrades (Drop table, drop columns).

## 16. Acceptance Criteria
- [ ] Database models updated with all required snapshot fields for items and options.
- [ ] Server recalculates all prices accurately and atomically within a single transaction.
- [ ] Option validation strictly enforces bounds, association, availability, and rejects duplicates.
- [ ] Cart state is safely isolated to the `session_id` in the frontend `localStorage`.
- [ ] Frontend strictly wipes the cart if session expires or a new QR is scanned.
- [ ] Atomic `SETNX` Redis idempotency handles concurrent clicks, payload mismatch, and replays correctly.
- [ ] Order creation saves historical names, prices, and options detached from mutable menu data.
- [ ] Multiple independent orders can be placed under the same `DineSession`.
- [ ] Customers can view their active session's order history and statuses.
- [ ] Order status is hardcoded to `PENDING` upon creation, with no phase 4 transitions allowed.

---

**CONFIRMATION:** I have strictly performed Planning & Architecture analysis only. I have read the source code to verify existing structures. **NO code modifications, no migrations, and no database changes have been performed.**
