# FODQ Phase 2 Plan: Restaurant Setup & Table Management

## A. Current relevant implementation
- **Database Models**: 
  - `Restaurant` exists with `name`, `slug`, `tax`, and Phase 1's `allowed_ips`. It lacks physical contact/address fields.
  - `Table` exists with `table_number`, `qr_token` (plain text string), and `is_active`.
  - `DineSession` implicitly handles table states (OPEN, PAID) rather than the `Table` model itself having an explicit state.
- **APIs**: 
  - `tables.py` exists with basic CRUD and a `regenerate-qr` endpoint, but `generate_qr_token()` uses a simple unhashed 32-byte secret stored in plaintext.
  - `customer_session.py` securely validates the QR code and IP (Phase 1), but expects a plaintext `qr_token`.

## B. Phase 2 objectives
1. Complete the Restaurant onboarding profile (address, contact).
2. Solidify Table Management CRUD (capacity, explicit states).
3. Secure the QR Token lifecycle using cryptographic hashing (preventing DB-leak vulnerabilities) and an opaque public identifier.
4. Establish a scalable single-restaurant-per-tenant architecture.
5. Define the Admin UI scope for these features without touching customer-facing flows.

## C. Database changes
1. **Restaurant**: Add `phone`, `email`, `address_line1`, `address_line2`, `city`, `state`, `zip_code`.
2. **Table**:
   - Add `status` field (Enum: `AVAILABLE`, `OCCUPIED`, `INACTIVE`).
   - Add `capacity` (Integer).
   - Replace `qr_token` with `qr_public_id` (String, unique, indexed) and `qr_secret_hash` (String). 
   - Add `qr_version` (Integer, default 1) to track rotations.

## D. Backend/API changes
- **`POST|PUT /api/v1/owner/restaurant`**: Endpoints for updating the restaurant profile.
- **`GET /api/v1/owner/tables`**: Returns tables with their states.
- **`POST /api/v1/owner/tables/{id}/qr/rotate`**: Generates a new secret, hashes it into the DB, and returns the new raw token *once* for printing.
- **`POST /api/v1/owner/tables/{id}/qr/revoke`**: Revokes the current QR without creating a new one (sets status to INACTIVE).
- **`POST /api/v1/dine/scan`**: Parses the token format `public_table_id.secret`, efficiently looks up the table by `qr_public_id`, and verifies the `qr_secret_hash` using Argon2/Bcrypt before passing to Phase 1 network validation.

## E. Security design
- **Authentication & RBAC**: All `/owner` endpoints will utilize the Phase 1 `require_permissions` dependencies.
- **Tenant Isolation**: Strict cross-tenant blocks via `get_current_tenant` to prevent BOLA/IDOR.

## F. QR security/lifecycle design
- **Format**: `public_table_id.secret`
  - `public_table_id`: Cryptographically random/opaque identifier (e.g. 16 bytes URL-safe base64), safe to expose publicly. Prevents exposing internal PostgreSQL sequential IDs.
  - `secret`: Cryptographically secure random high-entropy secret (e.g. 32 bytes).
- **QR Secret Storage**: 
  - The database stores only the `qr_public_id` and the `bcrypt` or `argon2` hash of the secret (`qr_secret_hash`).
  - *Trade-off*: Argon2/Bcrypt is computationally expensive to mitigate brute-force attacks, which is ideal if the secret is leaked. However, since the secret is a high-entropy 32-byte string, even a fast hash (like SHA-256) with a salt is secure against brute-forcing. But to align with password hashing best practices, we will use our existing Argon2 implementation. The performance impact (few milliseconds) is acceptable for the dine-in scan rate.
  - The raw secret is never stored. A database compromise must not reveal usable active QR tokens.
- **QR Token Lookup**: The server uses the `public_table_id` to index and efficiently query the table row. It then performs a constant-time verification of the `secret` against the `qr_secret_hash`. It does *not* perform a slow password-hash scan across the entire database.
- **QR Lifecycle**:
  - **CREATE**: Generate `public_table_id` + `secret` → Store `public_table_id` + `hash(secret)` → Return complete raw QR token once.
  - **ROTATE**: Invalidate old token (by changing the public ID/hash) → Generate new identifier/secret → Store new hash → Increment `qr_version` → Return new raw token once. Old QR becomes invalid instantly.
  - **REVOKE**: Invalidate current QR (clear public ID/hash, mark table INACTIVE).
  - **VALIDATE**: Parse token → Resolve opaque `public_table_id` → Verify secret against hash → Verify QR active/version → Verify restaurant/table relationship → Continue into Phase 1 network/session security.

## G. Table state design
- **AVAILABLE**: Table has no active dine session.
- **OCCUPIED**: Table currently has an OPEN, BILL_REQUESTED, or PAYMENT_PENDING session.
- **INACTIVE**: Table is closed for maintenance or physically unavailable (cannot be scanned).
*(RESERVED is deliberately omitted as out of scope).*
**Important**: The `OCCUPIED` state is fundamentally derived from the active `DineSession` lifecycle. While stored on the `Table` model for fast read queries, it must be updated consistently alongside session state changes. It must not become an independently editable field that can contradict the actual session state.

## H. Admin frontend changes (Next.js/Flutter)
- **Restaurant Settings View**: Form for name, address, contact, tax/service charge.
- **Tables Management View**: Datatable showing Table Number, Capacity, Status (Available/Occupied).
- **QR Actions**: A modal to "Download QR" (PNG format only for Phase 2) or "Rotate/Revoke QR" (showing a severe warning that existing physical QRs will break).

## I. Test plan
- **Restaurant**: Test profile update, verify tenant isolation (Tenant A cannot update Tenant B).
- **Tables**: Test creation, cross-tenant table access rejection.
- **QR Security**: Test QR uniqueness, QR rotation, revoked QR rejection, invalid QR rejection.
- **Resolution**: Test correct restaurant/table resolution via `public_table_id`.
- **IDOR/BOLA**: Test that an owner cannot rotate/revoke a QR for a table in another restaurant.

## J. Migration plan
- **Schema Migration**: Generate an Alembic migration for the new `Restaurant` and `Table` fields. Drop the old `qr_token` column. Add `qr_public_id` and `qr_secret_hash`.
- **Existing QR Migration**: We will strictly **invalidate legacy QR tokens** by dropping the old plaintext column and requiring a one-time QR regeneration for any existing tables. We will not silently convert plaintext tokens to hashes, ensuring a clean and mathematically secure break from the old insecure format.

## K. Files expected to change/create
- `backend/app/models/restaurant.py`
- `backend/app/models/table.py`
- `backend/app/api/routes/restaurant_owner.py` (NEW)
- `backend/app/api/routes/tables.py`
- `backend/app/api/routes/customer_session.py`

## L. Explicitly OUT OF SCOPE items
- Customer menu UI
- Cart
- Customer ordering
- KDS (Kitchen Display System)
- WebSockets
- Payment gateway
- Analytics
- Delivery
- Offline ordering
- Branch/franchise hierarchy
- Advanced PDF generation (PNG/downloadable QR is sufficient for Phase 2)

## M. Risks and edge cases
- **QR Usability**: Because we hash the QR, the UI must clearly tell the owner to download/print it immediately. If they close the modal, they have to rotate it to get a new one.
- **State Desync**: A table might be physically empty but logically OCCUPIED if the customer leaves without paying or closing the session. The Admin UI must have a "Force Close Session" or "Clear Table" button (planned for the Table Management UI).

## N. Implementation order
1. Update SQLAlchemy Models (`Restaurant`, `Table`).
2. Generate and apply Alembic migration.
3. Update `tables.py` for the new QR Lifecycle (CREATE, ROTATE, REVOKE) and Table CRUD.
4. Update `customer_session.py` to securely parse and VALIDATE the new hashed QR.
5. Create `restaurant_owner.py` for profile management.
6. Write backend Pytest cases.

## O. Acceptance criteria
- Admin can update restaurant profile information.
- Admin can create a table with a capacity.
- Newly generated QR codes use the `public_table_id.secret` format and store only the hash.
- Scanning an old/rotated QR code is explicitly rejected.
- Test suite passes.

---

### Phase 2 Feature Matrix

| Feature | Current Status | Planned Change | Security Requirement | Tests |
|---------|----------------|----------------|----------------------|-------|
| Restaurant Profile | Name/Slug only | Add Contact & Address | RBAC `manage_restaurant` | Tenant isolation, valid updates |
| Multi-Branch Concept | N/A | **Rejected**. Keep 1 Tenant = 1 Restaurant | None | N/A |
| Table Management | Basic CRUD | Add Capacity, Status | RBAC `manage_tables` | CRUD success, Tenant isolation |
| QR Lifecycle | Plaintext overwrite | CREATE/ROTATE/REVOKE logic | Return raw token ONLY once | Lifecycle sequence |
| QR Format | Plaintext 32-byte | `public_table_id.secret` | Opaque public identifier | Format validation |
| QR Storage | Plaintext DB column | Store `hash(secret)` in `qr_secret_hash` | Hash verification | DB hash check |
| Table States | Implicit via Session | Explicit `AVAILABLE`, `OCCUPIED` | Derived from DineSession | State sync |

<br/>

**PHASE 2 PLAN STATUS: READY FOR IMPLEMENTATION**
