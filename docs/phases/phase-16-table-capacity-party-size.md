# Phase 16 — Table Capacity, Live Vacancy & Party Size

## Executive Summary
Phase 16 extends the FODQ restaurant SaaS platform to introduce full server-authoritative table capacity awareness, dynamic live vacancy calculation, customer party size specification upon QR scanning, and robust concurrent seating protection via PostgreSQL row-level locks (`SELECT ... FOR UPDATE`).

Prior to Phase 16, tables in FODQ tracked a static `capacity` integer on the `Table` model, but table occupancy was coarse-grained (either `AVAILABLE` or `OCCUPIED`), with no record of individual session party sizes, no customer-facing vacancy counter, no stepper for party size selection on QR scan, and no server-side capacity validation.

With Phase 16:
1. **DineSession Party Size**: Each dining session explicitly tracks `party_size` (validated between 1 and available seating capacity).
2. **Dynamic Live Vacancy**: `occupied_seats` is calculated server-side from non-closed dining sessions (`sum(s.party_size)`). `available_seats = max(0, capacity - occupied_seats)`.
3. **Table Status Enhancements**: Tables now transition dynamically through `AVAILABLE`, `PARTIALLY_OCCUPIED`, `OCCUPIED`, `ORDERED`, `BILLING`, and `INACTIVE`.
4. **Race-Condition & Concurrency Protection**: Simultaneous diner requests are serialized via database row-level locking (`with_for_update(of=Table)`), strictly preventing seat over-allocation.
5. **Multi-Platform UI**: 
   - **Customer Web**: Displays table number, total capacity, occupied seats, and live vacancy indicators before seating, with an interactive party size stepper `[-] N [+]` strictly capped at available capacity.
   - **Owner/Admin Web**: Tables dashboard features live occupancy progress bars (`occupied / capacity`), available seat counts, and status badges.
   - **Flutter Owner App**: Updated `TableModel` and table management screens with live capacity/vacancy indicators and partial occupancy filtering.

---

## 1. Existing Architecture Discovered
During the initial inspection of the codebase:
- **`Table` Model (`backend/app/models/table.py`)**: Contained `capacity` (Integer, default 4), `status` (Enum `TableStatus`), `active_session_id` (ForeignKey), and QR credentials (`qr_public_id`, `qr_secret_hash`, `qr_raw_token`).
- **`DineSession` Model (`backend/app/models/session.py`)**: Contained `restaurant_id`, `table_id`, `status` (`SessionStatus`: `OPEN`, `BILL_REQUESTED`, `PAYMENT_PENDING`, `CLOSED`), and timestamps, but had no column for `party_size`.
- **Customer Scan Route (`backend/app/api/routes/customer_session.py`)**: `POST /api/v1/dine/scan` scanned a QR token and returned a session token. While it had row-locking for table lookup, it did not accept or validate party sizes.
- **Table Management (`backend/app/api/routes/tables.py`)**: Listed tables and returned `TableResponse`, but did not compute live occupied or available seat counts.
- **Session Closure (`backend/app/api/routes/session_owner.py`)**: `close_session` closed a session and marked table `AVAILABLE`, but did not recalculate remaining active session occupancies.

---

## 2. Data Model Changes

### PostgreSQL DDL & Migration
Executed via `backend/sync_db_schema.py`:
```sql
-- 1. Add party_size to dine_sessions
ALTER TABLE dine_sessions ADD COLUMN IF NOT EXISTS party_size INTEGER DEFAULT 1 NOT NULL;

-- 2. Add PARTIALLY_OCCUPIED to TableStatus enum
ALTER TYPE tablestatus ADD VALUE IF NOT EXISTS 'PARTIALLY_OCCUPIED';
```

### SQLAlchemy Models
- **`DineSession` (`backend/app/models/session.py`)**:
  ```python
  party_size = Column(Integer, default=1, nullable=False)
  ```
- **`TableStatus` (`backend/app/models/table.py`)**:
  ```python
  class TableStatus(str, enum.Enum):
      AVAILABLE = "AVAILABLE"
      PARTIALLY_OCCUPIED = "PARTIALLY_OCCUPIED"
      OCCUPIED = "OCCUPIED"
      ORDERED = "ORDERED"
      BILLING = "BILLING"
      INACTIVE = "INACTIVE"
  ```

---

## 3. Capacity & Live Vacancy Calculation

The authoritative vacancy calculation happens strictly server-side in PostgreSQL/FastAPI:
```python
total_occupied = sum(s.party_size for s in active_sessions if s.party_size is not None)
available_capacity = max(0, table.capacity - total_occupied)
```

### Table Status Resolution
```python
def _compute_table_status(table: Table, active_sessions: List[DineSession]) -> str:
    if not table.is_active or table.status == TableStatus.INACTIVE:
        return TableStatus.INACTIVE.value
    if not active_sessions:
        return TableStatus.AVAILABLE.value

    total_occupied = sum(getattr(s, "party_size", 1) or 1 for s in active_sessions)
    if total_occupied == 0:
        return TableStatus.AVAILABLE.value

    for s in active_sessions:
        if s.status in [SessionStatus.BILL_REQUESTED, SessionStatus.PAYMENT_PENDING]:
            return TableStatus.BILLING.value
        if hasattr(s, "bill") and s.bill and s.bill.status == BillStatus.PENDING:
            return TableStatus.BILLING.value

    for s in active_sessions:
        if s.orders:
            non_cancelled = [o for o in s.orders if o.status != OrderStatus.CANCELLED]
            if non_cancelled:
                return TableStatus.ORDERED.value

    if total_occupied >= table.capacity:
        return TableStatus.OCCUPIED.value
    return TableStatus.PARTIALLY_OCCUPIED.value
```

---

## 4. Concurrency & Race-Condition Protection Strategy

When two customers simultaneously scan the QR code for a table with 2 remaining seats and both request a `party_size` of 2:
1. `scan_qr` performs:
   ```python
   stmt = select(Table, Restaurant).join(Restaurant, Table.restaurant_id == Restaurant.id).where(
       Table.qr_public_id == public_id,
       Table.is_active == True,
       Table.status != TableStatus.INACTIVE
   ).with_for_update(of=Table)
   ```
2. The PostgreSQL row lock (`SELECT ... FOR UPDATE`) serializes the transactions.
3. Transaction A acquires the lock first:
   - Evaluates `total_occupied = 2`, `available_capacity = 2`.
   - `party_size = 2 <= 2`: Success! Creates `DineSession(party_size=2)`. Table occupancy becomes 4/4.
   - Commits and releases the lock.
4. Transaction B acquires the lock next:
   - Reads the newly committed state: `total_occupied = 4`, `available_capacity = 0`.
   - `party_size = 2 > 0`: Capacity check fails.
   - Immediately raises `HTTPException(400, "Requested party size 2 exceeds available table capacity (0 available).")`.
   - Zero over-allocation is possible.

---

## 5. API Changes & Endpoints

| Endpoint | Method | Role | Description |
|---|---|---|---|
| `/api/v1/dine/qr-info` | `POST` | Customer (Public) | Returns table number, capacity, occupied seats, and available seats before diner confirms party size. |
| `/api/v1/dine/scan` | `POST` | Customer (Public) | Accepts `qr_token` and optional `party_size`. Enforces row-level capacity lock, updates table status, returns session token. |
| `/api/v1/dine/me` | `GET` | Customer (Auth) | Returns active session metadata including `party_size`, `capacity`, `occupied_seats`, and `available_seats`. |
| `/api/v1/tables/` | `GET` | Owner (Auth) | Returns table list with `occupied_seats`, `available_seats`, and computed status (`AVAILABLE`, `PARTIALLY_OCCUPIED`, `OCCUPIED`, etc.). |
| `/api/v1/tables/{id}` | `GET` | Owner (Auth) | Returns individual table details with `occupied_seats` and `available_seats`. |
| `/api/v1/tables/{id}/details` | `GET` | Owner (Auth) | Returns comprehensive live table details including active session and order items. |
| `/api/v1/owner/sessions/{id}/close` | `POST` | Owner (Auth) | Closes session and recalculates table occupancy/status from remaining active sessions. |

---

## 6. Frontend Implementations

### Customer Web (`frontend/customer/app/q/[qr_token]/page.tsx`)
- Fetches real-time capacity and occupancy via `POST /api/v1/dine/qr-info`.
- Visual Seating Card:
  - Table number badge
  - Capacity pills: Total Capacity, Occupied Seats, Available Seats
  - Visual seat dots indicating filled vs free seats
- Interactive Party Size Stepper:
  - Decrement `[-]` and Increment `[+]` controls constrained strictly to `[1, available_seats]`.
  - Disabled if table is fully occupied (`available_seats == 0`), prompting the customer to refresh or notify staff.
- Confirmation button submits `{ qr_token, party_size }` to `/api/v1/dine/scan` and redirects to digital menu.

### Admin Web (`frontend/admin/app/(admin)/tables/page.tsx`)
- Table management table enhanced with:
  - **Live Occupancy Column**: Displays `${table.occupied_seats} / ${table.capacity}` with a colored progress bar (green if available, amber if partial, red if full).
  - **Available Seats Column**: Clear numerical indicator of remaining capacity.
  - **Status Badges**: Added support for `PARTIALLY OCCUPIED` (blue badge).

### Flutter Owner App (`mobile/owner-app/`)
- `TableModel` (`mobile/owner-app/lib/models/table_model.dart`): Added `occupiedSeats` and `availableSeats` deserialization.
- `TablesScreen` (`mobile/owner-app/lib/screens/tables_screen.dart`):
  - Added `PARTIALLY_OCCUPIED` filter chip and styling (blue theme).
  - Grid view cards display: `${table.occupiedSeats}/${table.capacity} seats • ${table.availableSeats} free`.
  - List view items display: `${table.occupiedSeats}/${table.capacity} seats (${table.availableSeats} free)`.
  - Live details bottom sheet header displays full capacity breakdown.

---

## 7. Security Controls Preserved
- **Tenant Isolation**: Restaurant A owners can never view or modify Restaurant B tables, occupancy, or dine sessions (tested in `test_tenant_isolation_table_capacity`).
- **Server Authority**: Available capacity is never accepted from the client; it is recalculated from Postgres rows under transaction lock.
- **Bounded Inputs**: `party_size` is strictly validated (`party_size >= 1` and `party_size <= available_capacity`).
- **Additional Orders Invariance**: Subsequent orders within the same session do not inflate or alter party size.
- **Payment Lifecycle Security**: Session closure still requires paid bill status before freeing seats.

---

## 8. Test Execution & Verification

### Targeted Test Suite: `backend/tests/test_phase16_table_capacity.py` (22/22 Passed)
```
backend\tests\test_phase16_table_capacity.py::test_table_capacity_retrieval PASSED [  4%]
backend\tests\test_phase16_table_capacity.py::test_available_seat_calculation PASSED [  9%]
backend\tests\test_phase16_table_capacity.py::test_zero_occupancy PASSED [ 13%]
backend\tests\test_phase16_table_capacity.py::test_partial_occupancy PASSED [ 18%]
backend\tests\test_phase16_table_capacity.py::test_full_occupancy PASSED [ 22%]
backend\tests\test_phase16_table_capacity.py::test_party_size_one PASSED [ 27%]
backend\tests\test_phase16_table_capacity.py::test_party_size_equals_available_capacity PASSED [ 31%]
backend\tests\test_phase16_table_capacity.py::test_party_size_exceeds_available_capacity PASSED [ 36%]
backend\tests\test_phase16_table_capacity.py::test_party_size_zero_rejected PASSED [ 40%]
backend\tests\test_phase16_table_capacity.py::test_party_size_negative_rejected PASSED [ 45%]
backend\tests\test_phase16_table_capacity.py::test_closed_session_releases_occupancy PASSED [ 50%]
backend\tests\test_phase16_table_capacity.py::test_additional_order_does_not_increase_party_size PASSED [ 54%]
backend\tests\test_phase16_table_capacity.py::test_concurrent_seating_attempt PASSED [ 59%]
backend\tests\test_phase16_table_capacity.py::test_race_condition_protection PASSED [ 63%]
backend\tests\test_phase16_table_capacity.py::test_tenant_isolation_table_capacity PASSED [ 68%]
backend\tests\test_phase16_table_capacity.py::test_unauthorized_access_table_capacity PASSED [ 72%]
backend\tests\test_phase16_table_capacity.py::test_invalid_table_qr PASSED [ 77%]
backend\tests\test_phase16_table_capacity.py::test_inactive_table_rejected PASSED [ 81%]
backend\tests\test_phase16_table_capacity.py::test_existing_qr_session_flow_functional PASSED [ 86%]
backend\tests\test_phase16_table_capacity.py::test_existing_order_flow_functional PASSED [ 90%]
backend\tests\test_phase16_table_capacity.py::test_existing_billing_flow_functional PASSED [ 95%]
backend\tests\test_phase16_table_capacity.py::test_existing_session_closure_functional PASSED [100%]
======================= 22 passed in 19.82s ========================
```

### Full Core Backend Regression Suite (29/29 Passed)
```
backend\tests\test_auth.py .                                             [  3%]
backend\tests\test_phase15_phone_otp.py ..........                       [ 37%]
backend\tests\test_customer_session.py ..                                [ 44%]
backend\tests\test_menu.py .......                                       [ 68%]
backend\tests\test_orders.py ..                                          [ 75%]
backend\tests\test_billing.py ...                                        [ 86%]
backend\tests\test_phase6e_session_closure.py ....                       [100%]
======================= 29 passed in 21.76s ========================
```

### Flutter Test Suite (`mobile/owner-app`)
```
00:05 +4: All tests passed!
```

### Frontend Build Verification
- **Admin Next.js Web (`frontend/admin`)**: `next build` completed with 0 errors (all routes prerendered).
- **Customer Next.js Web (`frontend/customer`)**: `next build` completed with 0 errors (all routes compiled).

---

## 9. Verification Status
- **Backend Model & DDL**: VERIFIED
- **Server Capacity Validation**: VERIFIED
- **Concurrency & Row Locking**: VERIFIED
- **Customer QR Party Size Flow**: VERIFIED
- **Admin Tables Live Occupancy UI**: VERIFIED
- **Owner App Capacity & Partial Filtering**: VERIFIED
- **Targeted Test Suite (22/22)**: VERIFIED
- **Regression Test Suite (29/29)**: VERIFIED
- **Frontend Web & Flutter Builds**: VERIFIED
