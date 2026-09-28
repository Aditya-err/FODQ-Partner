# Phase 11 Security Audit Report

**Date:** 2026-09-18
**Phase:** 11 (Security Hardening)
**Scope:** Backend API, Authentication, Session Management, Tenant Isolation, Rate Limiting, File Uploads, General Configuration

## Executive Summary
A comprehensive security review of the FODQ backend was conducted. The core architecture—including JWT sessions, tenant isolation (RBAC), idempotency, and QR validation—is highly robust. The primary identified vulnerabilities relate to missing defense-in-depth measures, specifically rate limiting on critical state-mutating endpoints and overly permissive default CORS configurations.

## Findings

### 1. Missing Rate Limiting on Critical Mutating Endpoints (High)
*   **ID**: SEC-001
*   **Severity**: High
*   **Status**: FIXED
*   **Component**: API Routes (`auth.py`, `order_customer.py`, `billing_customer.py`, `payment_customer.py`)
*   **Finding**: Rate limits (`@limiter.limit`) are applied primarily to GET and select POST auth endpoints (`/login`, `/verify-device`), but are missing from highly critical endpoints such as user registration (`/register`), order creation (`/dine/orders`), and bill/payment requests. 
*   **Evidence**: Inspection of route decorators. e.g. `register` in `auth.py`, `create_order` in `order_customer.py`.
*   **Risk**: Denial of Service (DoS) attacks, database exhaustion via bot-driven spam (creating thousands of dummy accounts or fake orders on active tables).
*   **Recommended Remediation**: Apply `@limiter.limit` decorators to `register`, `create_order`, `request_bill`, and `initiate_payment` to strictly throttle requests per minute based on IP or authenticated user session.

### 2. Wildcard CORS Configuration in Production (Medium)
*   **ID**: SEC-002
*   **Severity**: Medium
*   **Status**: FIXED
*   **Component**: `app/core/config.py` & `app/main.py`
*   **Finding**: The `BACKEND_CORS_ORIGINS` setting does not enforce structural limits that would prevent a wildcard (`*`) from being deployed in production environments.
*   **Evidence**: `Settings.assemble_cors_origins` allows `*` if supplied via environment variables, and `main.py` applies it directly to `CORSMiddleware`.
*   **Risk**: If accidentally configured with `*` in production, browsers will permit cross-origin requests from any domain, potentially exposing the API to Cross-Site Request Forgery (CSRF) or data exfiltration.
*   **Recommended Remediation**: Add a validation rule in `config.py` that actively raises a `ValueError` if `ENVIRONMENT == "production"` and `"*"` is found in `BACKEND_CORS_ORIGINS`.

### 3. Review Endpoint Logical Flaw (Low)
*   **ID**: SEC-003
*   **Severity**: Low (Functional/Logical)
*   **Status**: FIXED
*   **Component**: `review_customer.py` and `dependencies.py`
*   **Finding**: The `/dine/review/` endpoint requires the session status to be `CLOSED`. However, the dependency `get_current_dine_session` specifically filters out `CLOSED` sessions (it only allows `OPEN`, `BILL_REQUESTED`, `PAYMENT_PENDING`).
*   **Evidence**: 
    - `review_customer.py`: `if session.status != SessionStatus.CLOSED: raise HTTPException...`
    - `dependencies.py`: `DineSession.status.in_([SessionStatus.OPEN, SessionStatus.BILL_REQUESTED, SessionStatus.PAYMENT_PENDING])`
*   **Risk**: Customers can never legitimately submit reviews. 
*   **Recommended Remediation**: Create a separate dependency (e.g. `get_closed_dine_session`) or modify the review logic to permit reviews when the bill is requested or pending.

## Successfully Verified Security Controls
The following areas were audited and found to be **SECURE**:
*   **OTP & Passwords**: Cryptographically hashed (bcrypt). Strong brute-force protections (max 5 attempts). Unusable after expiry.
*   **Device Trust**: Correctly binds trust to authenticated password completion. `device_id` alone cannot bypass primary auth.
*   **Tenant Isolation / BOLA**: All endpoints in `order_kitchen.py`, `menu_owner.py`, `order_customer.py` strictly enforce `restaurant_id == tenant.id`.
*   **Session Invalidation**: Password changes successfully revoke all prior active Owner sessions.
*   **File Uploads**: Validated by magic bytes (`filetype`), restricted to 5MB, strict MIME-types, randomized UUID names, preventing remote code execution (RCE) and path traversal.
*   **Idempotency**: Atomic Redis locks with payload hashing successfully prevent race-condition double-charges.
