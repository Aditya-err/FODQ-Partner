# Phase 14 — Security & Penetration Testing Plan

## Scope

This document defines the security testing plan for the FODQ Restaurant Digital Ordering System backend.

**In Scope:**
- FastAPI backend (all API endpoints)
- JWT authentication and session management
- Authorization / RBAC enforcement
- BOLA/IDOR across tenant boundaries
- QR token security
- DineSession authorization
- Order, billing, and payment security
- Webhook signature verification
- File upload security
- API input validation and injection resistance
- CORS and security headers
- WebSocket authentication
- Rate limiting and abuse protection
- Secrets and configuration management
- Dependency vulnerability audit

**Out of Scope:**
- Production environment
- Live Razorpay transactions
- Real customer or restaurant data
- Frontend/Flutter application (informational only)
- Network-level attacks (WAF, TLS, infrastructure)
- Physical security

---

## Environment

| Item | Value |
|---|---|
| Test environment | Local development only |
| Test database | `fodq_test` (PostgreSQL via Docker) |
| Backend | FastAPI via ASGI `AsyncClient` (in-process) |
| Test tool | pytest 8.3.4 + httpx |
| Test date | 2026-09-21 |
| Tester | Automated security regression |
| Exclusions | Production, live Razorpay, real user data |

> [!CAUTION]
> All tests run exclusively against the isolated `fodq_test` database.
> The production `fodq` database is never touched during security testing.

---

## Security Test Areas

### 1. Authentication
- Invalid credentials
- Non-existent accounts
- JWT tampering (signature modification)
- JWT with `none` algorithm (alg confusion)
- Expired JWT
- Malformed JWT
- Refresh token used as access token
- Missing auth header on protected endpoints
- SQL injection in auth fields
- XSS in registration fields
- Password hash leakage in responses
- OTP leakage in responses

### 2. Authorization / RBAC
- Customer token accessing owner endpoints
- Owner endpoints without required headers
- Arbitrary `X-Restaurant-ID` not owned by caller
- Cross-tenant endpoint access

### 3. BOLA / IDOR
- Order ID substitution across sessions
- Bill ID substitution across sessions
- Owner accessing another restaurant's orders
- Payment initiation with foreign bill ID
- Session closure across tenants

### 4. QR Security
- Malformed token (no dot separator)
- Empty token
- Path traversal in token
- SQL injection in token
- Null bytes in token

### 5. Input Validation
- Missing required fields (422)
- Form-encoded body on JSON endpoint
- Negative price/quantity values
- Malformed UUID in path
- Prototype pollution via extra fields
- Filesystem path exposure in error messages

### 6. Webhook Security
- Missing signature header
- Forged signature
- Body modified post-signing
- Malformed JSON body
- Oversized payload (>1MB)
- SQL/internal errors in response

### 7. File Upload Security
- Executable bytes with image extension (magic-byte check)
- PHP script with PNG extension
- File >5MB (size limit check)

### 8. CORS / Headers
- Preflight request to allowed origin
- Production wildcard CORS rejected by config validator
- /health endpoint info leakage
- 422 responses without filesystem paths
- 404 responses without stack traces

### 9. Secrets / Configuration
- SECRET_KEY is non-empty
- Razorpay keys are test/dummy values
- Environment not set to production during tests
- DATABASE_URL points to localhost only

### 10. Sensitive Data Exposure
- Password hash not in login responses
- JWT SECRET_KEY not in any response
- DATABASE_URL/credentials not in error responses
- Razorpay secrets not in responses

### 11. Idempotency Abuse
- Order creation without Idempotency-Key
- Payment initiation without Idempotency-Key

### 12. Rate Limiting
- Login endpoint stability under rapid requests
- QR scan endpoint stability (no 500s)

---

## Finding Classification

| Severity | Definition |
|---|---|
| **CRITICAL** | Authentication bypass, payment forgery, unauthenticated admin access |
| **HIGH** | Cross-tenant data access, IDOR with data leakage, webhook forgery |
| **MEDIUM** | Partial information disclosure, missing rate limit on non-critical path |
| **LOW** | Minor information leakage, non-exploitable configuration issue |
| **INFO** | Deprecation warnings, configuration recommendations, no direct risk |
