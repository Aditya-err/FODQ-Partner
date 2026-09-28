# Phase 2 Verification: Restaurant Setup & Table Management

**Status:** ✅ COMPLETED & VERIFIED

## 1. Restaurant Profile Setup
- **Endpoint:** `GET /api/v1/owner/restaurant`, `PUT /api/v1/owner/restaurant`
- **Fields:** Name, Phone, Email, Location (Address Line 1 & 2, City, State, ZIP).
- **Validation:** Implemented secure REST API inside `restaurant_owner.py` bound to tenant context. Only authenticated users with `manage_restaurant` permission can modify the profile.

## 2. Table Management
- **Endpoint:** `/api/v1/tables` (CRUD)
- **Fields:** Table Number, Capacity, Status (`AVAILABLE`, `OCCUPIED`, `INACTIVE`), `is_active`.
- **Validation:** Enforces uniqueness of `table_number` within a restaurant. Soft delete implemented via `is_active=False`.

## 3. Secure QR Lifecycle
- **Implementation:** `backend/app/security/qr.py` utilizing existing Argon2 `pwd_context`.
- **QR Format:** `public_table_id.secret`
- **Database Storage:**
  - `qr_public_id`: Randomly generated opaque string.
  - `qr_secret_hash`: Argon2 hash of the secret string.
  - Raw QR Token is **NEVER** stored in the database.
- **Table Endpoints:**
  - `POST /api/v1/tables/`: Creates table, generates QR public ID, secret, and hash. Returns raw QR token only once.
  - `POST /api/v1/tables/{id}/qr/rotate`: Breaks old QR tokens immediately by regenerating `public_id`, `secret`, and `hash`. Increments `qr_version`.
  - `POST /api/v1/tables/{id}/qr/revoke`: Voids the current QR by setting a dummy public ID (`revoked-...`) and hash (`REVOKED`), sets Table Status to `INACTIVE`. Increments `qr_version`.

## 4. Customer Session Scan Validation
- **Endpoint:** `/api/v1/dine/scan`
- **Validation:** Parses the scanned `public_table_id.secret`. Looks up table by `public_table_id` and verifies the `secret` against the `qr_secret_hash` using Argon2.
- **Security:** If the format is invalid or hash mismatch, returns standard `400` or `404` errors without leaking the existence of valid IDs.

## 5. Admin Frontend
- **Navigation:** Added `Tables` and `Settings` to the Admin Sidebar.
- **Settings Page:** Built React form integrating `PUT /api/v1/owner/restaurant`.
- **Tables Page:** Built React data table to list, create, rotate QR, revoke QR, and delete tables. Includes a modal to display and securely download the freshly generated QR code as PNG, warning the owner that the raw code won't be shown again.

## 6. Testing & Environment
- **Alembic:** Migration `5b97e1445efd` successfully created `Table` changes, `Restaurant` changes, and purged legacy `qr_token` rows.
- **Pytest:** The full 14/14 test suite passed with updated invalid QR format `400 Bad Request` assertions. Docker/Postgres environment restored and functioning correctly.

Phase 2 is now completely hardened and verified. Ready to proceed to Phase 3.
