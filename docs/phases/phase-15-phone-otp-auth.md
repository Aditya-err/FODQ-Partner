# FODQ Phase 15 — Owner Phone + OTP Authentication Migration

## 1. Executive Summary

Phase 15 migrates the FODQ Restaurant SaaS Owner authentication from legacy password-based authentication to **Phone Number + OTP (One-Time Password)** authentication.

This implementation preserves:
- The existing JWT token architecture (access and refresh tokens).
- Multi-device and session management (`OwnerSession`, `TrustedDevice`, session revocation, "logout all devices").
- Strict Role-Based Access Control (RBAC) and permissions.
- Multi-tenant data isolation (`restaurant_id` security boundaries).
- Comprehensive security audit logging (`audit_logs`).
- Rate limiting and anti-abuse safeguards.

---

## 2. Authentication Lifecycle & Target Flow

```
                     ┌────────────────────────┐
                     │   Enter Phone Number   │
                     └───────────┬────────────┘
                                 │
                                 ▼
                     ┌────────────────────────┐
                     │   Request 6-digit OTP  │
                     └───────────┬────────────┘
                                 │
                                 ▼
                     ┌────────────────────────┐
                     │       Verify OTP       │
                     └───────────┬────────────┘
                                 │
                     ┌───────────┴───────────┐
                     │                       │
           [Existing Owner]            [New Owner]
                     │                       │
                     ▼                       ▼
          Create OwnerSession         Return signed
          & issue JWT tokens        registration_token
                     │                       │
                     ▼                       ▼
              Owner Dashboard         Setup Restaurant &
                                      Owner Profile
                                             │
                                             ▼
                                     Create Restaurant,
                                     User, Role & Session
                                             │
                                             ▼
                                      Owner Dashboard
```

### Flow A: Existing Owner Login
1. Owner submits phone number (`+919876543210` or `9876543210`).
2. Phone number is normalized into strict E.164 format.
3. System verifies 60-second cooldown, invalidates any existing active OTPs for the phone, generates a cryptographically secure 6-digit OTP, stores its Argon2 hash, and dispatches SMS.
4. Response returns a uniform message (`"OTP sent successfully if the phone number is valid."`) regardless of whether the account already exists, preventing account enumeration.
5. Owner enters OTP. Server verifies Argon2 hash, validates TTL (5 minutes), tracks failed attempts (locked out after 5 failures), marks OTP as used (`is_used = True`), and creates a new `OwnerSession` and `TrustedDevice` record.
6. Returns access & refresh tokens with `action: "LOGIN"` and restaurant details.
7. Client stores tokens and navigates directly to the Owner Dashboard.

### Flow B: New Owner Registration
1. Prospective owner submits phone number and verifies OTP (steps 1–4 above).
2. Because no existing `User` is associated with the phone, the server issues a signed, cryptographically verified `registration_token` (HMAC-SHA256, 15-minute expiration) with payload `{"phone": normalized_phone, "scope": "owner_registration"}` and returns `action: "REGISTER"`.
3. Client transitions to Restaurant Setup screen (Restaurant Name, Owner Full Name, optional Email).
4. Owner submits setup details alongside `registration_token`.
5. Server validates token, verifies phone has not been claimed concurrently, creates `Restaurant`, creates `User` (phone verified, `is_owner=True`), seeds standard permissions (`manage_restaurant`, `manage_tables`, `manage_menu`, `manage_orders`, `manage_billing`, `view_analytics`), creates an "Owner" role, links `RestaurantUser`, initializes `OwnerSession`, and issues JWT tokens.
6. Client navigates to Owner Dashboard.

---

## 3. Database Schema Changes

All schema modifications were applied safely via `backend/sync_db_schema.py` and reflected in PostgreSQL (`fodq_db`).

### Table: `otps`
| Column | Type | Constraints / Details |
| :--- | :--- | :--- |
| `user_id` | `UUID` | Modified to `nullable=True` (allows OTP generation prior to user account creation) |
| `phone` | `VARCHAR(32)` | Added, indexed for fast challenge lookup (`ix_otps_phone`) |
| `resend_after` | `TIMESTAMPTZ` | Added, tracks the 60-second resend cooldown deadline |
| `otp_type` | `VARCHAR(32)` | Extended to support `PHONE_LOGIN` and `PHONE_REGISTRATION` |
| `attempts` | `INTEGER` | Tracks failed verification attempts (max 5) |
| `is_used` | `BOOLEAN` | Set to `True` upon successful verification or lockout |

### Table: `users`
| Column | Type | Constraints / Details |
| :--- | :--- | :--- |
| `hashed_password` | `VARCHAR(255)` | Modified to `nullable=True` (allows passwordless phone-first accounts) |
| `email` | `VARCHAR(255)` | Modified to `nullable=True` (phone is now primary owner credential) |
| `phone` | `VARCHAR(32)` | Existing column indexed (`ix_users_phone`) for unique identity resolution |

---

## 4. API Endpoints Specification

### 1. `POST /api/v1/auth/phone/request-otp`
- **Rate Limit:** 5 requests / minute / IP.
- **Request Body:**
  ```json
  {
    "phone": "9876543210"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "message": "OTP sent successfully if the phone number is valid.",
    "phone": "+919876543210",
    "cooldown_seconds": 60,
    "dev_otp": "123456" // ONLY included in development/test environment
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Invalid phone number format.
  - `429 Too Many Requests`: Resend requested within 60-second cooldown.
  - `503 Service Unavailable`: Production SMS delivery failed or unconfigured.

### 2. `POST /api/v1/auth/phone/verify-otp`
- **Rate Limit:** 10 requests / minute / IP.
- **Request Body:**
  ```json
  {
    "phone": "+919876543210",
    "otp": "123456",
    "device_name": "Chrome on Windows",
    "device_type": "browser"
  }
  ```
- **Response (`200 OK` — Existing Owner Login):**
  ```json
  {
    "action": "LOGIN",
    "access_token": "eyJhbGciOi...",
    "refresh_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "restaurant_id": "a50c822e-...",
    "restaurant_slug": "urban-bistro",
    "user_id": "c10d723f-...",
    "role": "Owner"
  }
  ```
- **Response (`200 OK` — New Owner Registration):**
  ```json
  {
    "action": "REGISTER",
    "registration_token": "eyJhbGciOi...",
    "phone": "+919876543210"
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Expired OTP, wrong OTP (includes remaining attempts), locked out OTP, or reused OTP.
  - `404 Not Found`: No active OTP challenge found.

### 3. `POST /api/v1/auth/phone/register`
- **Rate Limit:** 5 requests / minute / IP.
- **Request Body:**
  ```json
  {
    "registration_token": "eyJhbGciOi...",
    "restaurant_name": "Grand Royale Spice",
    "full_name": "Chef Ramesh",
    "email": "ramesh@grandroyale.com",
    "device_name": "Pixel 7 Pro",
    "device_type": "mobile"
  }
  ```
- **Response (`201 Created`):**
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "restaurant_id": "f82b189c-...",
    "restaurant_slug": "grand-royale-spice",
    "user_id": "70d9a61e-...",
    "role": "Owner"
  }
  ```

---

## 5. Security Controls & Hardening

1. **Argon2 Hashing:** Plaintext OTP codes are never stored in the database. Only Argon2 password-hashed values are saved and matched.
2. **Short-Lived Lifetime:** OTP expiration is strictly 5 minutes.
3. **Brute-Force Lockout:** Up to 5 failed attempts are tracked per OTP challenge. Upon the 5th failed attempt, the OTP is burned immediately (`is_used = True`) and rejected.
4. **Resend Cooldown:** 60-second cooldown is enforced server-side. Requests within the window trigger `429 Too Many Requests`.
5. **Single-Use Burning:** Once verified or locked out, `is_used` prevents any replay or reuse attacks.
6. **Anti-Enumeration Protection:** Requesting an OTP returns the same response message whether a phone number belongs to an existing owner or a new registrant.
7. **Tamper-Proof Registration:** Phone verification state for new owners is sealed in a signed HMAC-SHA256 JWT `registration_token` with 15-minute expiration, guaranteeing registration cannot be called with an unverified phone.
8. **Fail-Closed SMS Policy:** When `ENVIRONMENT == "production"`, if Twilio SMS credentials are not configured or SMS transmission fails, the API raises `503 Service Unavailable`, failing closed rather than silently bypassing verification.
9. **Safe Development Mode:** `dev_otp` is provided in the JSON response only when `settings.ENVIRONMENT != "production"`.
10. **Device & Session Persistence:** Successful logins and registrations create standard `OwnerSession` and `TrustedDevice` records in PostgreSQL. Token revocation (`/api/v1/auth/logout` and `/api/v1/auth/logout-all`) terminates sessions as expected.

---

## 6. Frontend Implementations

### Admin Web Application (`frontend/admin`)
- **File:** `frontend/admin/app/page.tsx`
- **Design:** Modern dark food-tech theme with brand orange gradients, responsive card layout, and step-by-step state machine (`phone` -> `otp` -> `register`).
- **Features:**
  - 10-digit phone entry with +91 country selector and instant validation.
  - 6-digit OTP inputs with auto-focus, paste support, and numeric keypad.
  - Active resend countdown timer (60s).
  - Dev Code Helper badge (in non-production mode) displaying the active code for one-click filling.
  - Back/Edit button to modify phone number without losing state.
  - Restaurant & Owner profile registration form for new owners.
  - Direct routing to `/dashboard` upon verification/registration.
- **Build Status:** Verified with `npm run build` (Next.js 16.3.1, TypeScript compile 0 errors).

### Owner Flutter Application (`mobile/owner-app`)
- **Files:**
  - `mobile/owner-app/lib/screens/login_screen.dart`
  - `mobile/owner-app/lib/services/auth_service.dart`
  - `mobile/owner-app/test/auth_phone_test.dart`
- **Features:**
  - `AuthStep.phone`: Phone number input with validator and server endpoint switcher.
  - `AuthStep.otp`: 6-digit verification code with 60s cooldown timer and dev code indicator.
  - `AuthStep.register`: Name and restaurant setup form with validation.
  - Synchronous context safety (`ctx.mounted` guards) and zero deprecation warnings.
- **Test Status:** 4/4 Flutter tests passed. `flutter analyze` verified with 0 issues.

---

## 7. Test Results & Verification Evidence

### Backend Targeted Test Suite (`backend/tests/test_phase15_phone_otp.py`)
Executed against PostgreSQL and Redis:
```text
tests/test_phase15_phone_otp.py::test_phone_normalization_and_validation PASSED
tests/test_phase15_phone_otp.py::test_request_otp_anti_enumeration PASSED
tests/test_phase15_phone_otp.py::test_resend_otp_cooldown PASSED
tests/test_phase15_phone_otp.py::test_verify_otp_invalid_and_attempt_limit PASSED
tests/test_phase15_phone_otp.py::test_verify_otp_expired PASSED
tests/test_phase15_phone_otp.py::test_verify_otp_reused PASSED
tests/test_phase15_phone_otp.py::test_new_owner_registration_flow PASSED
tests/test_phase15_phone_otp.py::test_existing_owner_login_flow PASSED
tests/test_phase15_phone_otp.py::test_phone_auth_session_and_device_management PASSED
tests/test_phase15_phone_otp.py::test_production_fail_closed_sms PASSED

10 passed in 14.87s (100% pass)
```

### Backend Full Regression Suite
```text
tests/test_auth.py: PASSED (Legacy auth regression)
tests/test_auth_phase7.py: PASSED (MFA, Device & Session Management)
tests/test_menu.py: PASSED (Menu, Category, Add-ons)
tests/test_orders.py: PASSED (Order lifecycle & state machine)
tests/test_billing.py: PASSED (Billing & Razorpay payment flow)
tests/test_rate_limiter.py: PASSED (Redis rate-limiting)
tests/test_idempotency.py: PASSED (Idempotency keys)

25 passed in 13.20s (100% pass)
```

### Frontend Build & Analysis
- **Next.js Admin Frontend:** `npm run build` completed successfully. 0 TypeScript errors. All 7 static routes generated.
- **Flutter Owner App:** `flutter analyze` completed with 0 errors. `flutter test` passed all test cases.

---

## 8. Migration & Rollback Considerations

1. **Existing Owners:** Existing owner records in `users` with legacy passwords can immediately log in with their registered phone number.
2. **Backward Compatibility:** Legacy email/password authentication endpoints (`POST /api/v1/auth/login`) remain functional for system administrators or migration scripts, while the client applications default exclusively to Phone + OTP.
3. **Database Rollback:** The schema alterations made columns nullable (`hashed_password`, `email`) and added new nullable columns to `otps`. No destructive column drops were performed. Rollback can be achieved without data loss by restoring prior route definitions.

---

## 9. Phase Status

- **Status:** **VERIFIED**
- **Definition of Done Met:**
  - Implemented: Complete backend APIs, frontend Admin Web, and Owner Flutter App.
  - Targeted tests: 10/10 passed.
  - Regression tests: 25/25 passed.
  - Integration verified: Phone normalization, OTP lifecycle, dev mode, session creation, logout, RBAC, tenant isolation.
  - Security preserved: Argon2 OTP hashing, 60s cooldown, 5-attempt limit, anti-enumeration, fail-closed production SMS.
  - Documentation updated: `docs/phase-15-phone-otp-auth.md`.
