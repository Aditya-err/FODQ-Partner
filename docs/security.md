# FODQ — Security Model

## 1. Threat Model

### 1.1 Attack Surface

| Surface                  | Threat                                          | Mitigation                                     |
|--------------------------|------------------------------------------------|------------------------------------------------|
| Public QR URLs           | Session hijacking, URL guessing                 | Cryptographic random tokens (64 chars)          |
| Customer API             | Price manipulation, fake orders                 | Server-side pricing, input validation           |
| Staff API                | Privilege escalation, IDOR                     | RBAC + object-level authorization               |
| Authentication           | Brute force, credential stuffing               | Rate limiting, account lockout, bcrypt          |
| JWT tokens               | Token theft, replay                            | Short TTL (15 min), HTTPS-only, no localStorage |
| File uploads             | Malicious files, oversized uploads             | MIME validation, size limits, virus scanning    |
| Database                 | SQL injection, data leakage                    | Parameterized queries (SQLAlchemy ORM)          |
| Frontend                 | XSS, CSRF                                     | CSP headers, CSRF tokens, output encoding       |
| Cross-tenant             | Restaurant A accessing Restaurant B's data     | Tenant isolation at query + auth level          |
| Payment                  | Frontend claiming payment success              | Server-side payment verification only           |
| Network                  | Man-in-the-middle                              | HTTPS mandatory in production                   |
| Dependencies             | Known vulnerabilities in packages              | Regular dependency audits                       |

### 1.2 Trust Boundaries

```text
┌─────────────────────────────────────────────────┐
│              UNTRUSTED ZONE                      │
│  Customer Browser, Owner App, Kitchen Tablet     │
│  Any data from here is suspect                   │
└───────────────────┬─────────────────────────────┘
                    │ HTTPS
                    ▼
┌─────────────────────────────────────────────────┐
│              TRUST BOUNDARY                      │
│  API Gateway / FastAPI middleware                 │
│  Authentication, rate limiting, input validation │
└───────────────────┬─────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│              TRUSTED ZONE                        │
│  Service Layer, Database, Redis                  │
│  Business logic executes here                    │
└─────────────────────────────────────────────────┘
```

---

## 2. Security Controls

### 2.1 Authentication Security
- Password hashing: **bcrypt** with cost factor 12
- JWT signing: **HS256** with a cryptographically random 256-bit secret
- Refresh tokens: stored as **SHA-256 hash** in database, never in plaintext
- Session tokens (customer): 64-character **cryptographically random** string
- QR tokens: 64-character **cryptographically random** string

### 2.2 Input Validation
All inputs validated by **Pydantic v2** schemas before reaching business logic:
- String length limits
- Numeric range constraints
- Email format validation
- Enum value checking
- UUID format validation
- No HTML/script injection in text fields (strip/escape)

### 2.3 Rate Limiting

| Endpoint Category       | Limit                  | Window   |
|--------------------------|------------------------|----------|
| Login                    | 5 requests             | 1 minute |
| Registration             | 3 requests             | 1 minute |
| Password reset           | 3 requests             | 15 min   |
| Order creation           | 10 requests            | 1 minute |
| General API (auth'd)     | 100 requests           | 1 minute |
| General API (unauth'd)   | 30 requests            | 1 minute |

Implemented using Redis-backed sliding window counters.

### 2.4 HTTP Security Headers

```text
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0  (rely on CSP instead)
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; img-src 'self' https://res.cloudinary.com; ...
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### 2.5 CORS Configuration

```python
# Development
allow_origins = ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]

# Production
allow_origins = ["https://app.fodq.com", "https://admin.fodq.com", "https://kitchen.fodq.com"]

allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE"]
allow_headers = ["Authorization", "Content-Type", "X-Idempotency-Key"]
allow_credentials = True
```

### 2.6 File Upload Security

| Check             | Rule                                                  |
|-------------------|-------------------------------------------------------|
| File size         | Max 5 MB per image                                    |
| Allowed MIME      | `image/jpeg`, `image/png`, `image/webp`               |
| MIME validation   | Check magic bytes, not just Content-Type header        |
| Filename          | Sanitize, rename to UUID before storage                |
| Storage           | External object storage (Cloudinary/S3), never local   |

### 2.7 SQL Injection Prevention
- All database queries use SQLAlchemy ORM with parameterized queries
- No raw SQL string concatenation
- Database user has minimal required privileges

### 2.8 Error Handling
- Production errors return generic messages: `{ "error": "Something went wrong" }`
- Stack traces are NEVER exposed to clients
- Detailed errors logged server-side with correlation IDs
- Validation errors return field-level details (safe, expected)

---

## 3. Idempotency Strategy

### 3.1 Why Idempotency

Network failures, double-clicks, and mobile connectivity issues cause duplicate requests. Without idempotency:
- Customer taps "Place Order" twice → 2 identical orders
- Cashier confirms payment twice → inconsistent billing state
- Bill generation retried → duplicate bills

### 3.2 Implementation

```text
Client generates a unique idempotency key (UUID v4)
    ↓
Sends request with header: X-Idempotency-Key: <uuid>
    ↓
Backend checks: does an operation with this key already exist?
    ├── YES → Return the original response (200 OK)
    └── NO  → Process the request, store key + response
```

### 3.3 Idempotent Operations

| Operation              | Key Source                    | Storage                          |
|------------------------|-------------------------------|----------------------------------|
| Order creation         | `X-Idempotency-Key` header   | `orders.idempotency_key` (UNIQUE)|
| Bill generation        | `X-Idempotency-Key` header   | `bills.idempotency_key` (UNIQUE) |
| Payment confirmation   | Derived from `bill_id`       | State machine prevents re-transition |

### 3.4 Key Expiration
Idempotency keys are permanent in the database (since orders and bills are permanent records). For future non-persistent idempotent operations, Redis with a 24-hour TTL can be used.

---

## 4. Money Handling Strategy

### 4.1 Core Rule
**Never use FLOAT or DOUBLE for monetary values.** All money is stored as `NUMERIC(10, 2)` in PostgreSQL and `Decimal` in Python.

### 4.2 Calculation Flow

```text
Customer submits: { item_id: "abc", quantity: 2 }
    ↓
Backend loads item from DB: price = NUMERIC 249.00
    ↓
line_total = price × quantity = 498.00  (exact NUMERIC arithmetic)
    ↓
subtotal = SUM(all line_totals) = 498.00
    ↓
tax_amount = subtotal × restaurant.tax_rate / 100
           = 498.00 × 5.00 / 100 = 24.90 (rounded to 2 decimal places)
    ↓
service_charge = subtotal × restaurant.service_charge_rate / 100
    ↓
discount_amount = (future — coupon/promo system)
    ↓
total = subtotal + tax_amount + service_charge - discount_amount
    ↓
All values stored as NUMERIC(10, 2)
```

### 4.3 Python Implementation

```python
from decimal import Decimal, ROUND_HALF_UP

def calculate_tax(subtotal: Decimal, tax_rate: Decimal) -> Decimal:
    return (subtotal * tax_rate / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
```

### 4.4 Frontend Display
The frontend receives pre-calculated monetary values as strings (e.g., `"498.00"`) from the API. It displays them but never recalculates them.

---

## 5. Audit & Security Event Logging

### 5.1 Audit Log Events

| Event                        | Logged Data                                      |
|------------------------------|--------------------------------------------------|
| `OWNER_LOGIN`                | user_id, ip, user_agent                          |
| `OWNER_LOGIN_FAILED`         | email (not password), ip, user_agent             |
| `PASSWORD_RESET`             | user_id                                          |
| `RESTAURANT_CREATED`         | restaurant_id, owner_id                          |
| `MENU_PRICE_CHANGED`         | item_id, old_price, new_price                    |
| `MENU_ITEM_DISABLED`         | item_id                                          |
| `TABLE_CREATED`              | table_id, restaurant_id                          |
| `ORDER_CREATED`              | order_id, session_id, total                      |
| `ORDER_CANCELLED`            | order_id, reason, cancelled_by                   |
| `BILL_GENERATED`             | bill_id, session_id, total                       |
| `PAYMENT_CONFIRMED`          | bill_id, confirmed_by, method                    |
| `STAFF_ROLE_CHANGED`         | staff_id, old_role, new_role                     |
| `STAFF_REMOVED`              | staff_id, restaurant_id                          |

### 5.2 Security Events (Separate from Audit)

| Event                        | Severity | Trigger                                |
|------------------------------|----------|----------------------------------------|
| `BRUTE_FORCE_DETECTED`       | HIGH     | 5+ failed logins in 1 minute           |
| `ACCOUNT_LOCKED`             | HIGH     | Account locked due to failed attempts  |
| `CROSS_TENANT_ATTEMPT`       | CRITICAL | User tried accessing another tenant    |
| `INVALID_TOKEN`              | MEDIUM   | Expired/malformed JWT presented         |
| `RATE_LIMIT_EXCEEDED`        | MEDIUM   | IP exceeded rate limit                 |
| `INVALID_QR_ATTEMPT`         | LOW      | Non-existent or disabled QR scanned    |
| `PRIVILEGE_ESCALATION`       | CRITICAL | User tried action beyond their role    |
| `SUSPICIOUS_ORDER`           | HIGH     | Unusual order pattern detected         |

### 5.3 What is NEVER Logged
- Passwords (plain or hashed)
- Access tokens
- Refresh tokens
- Payment secrets
- Full credit card numbers
- Personal data beyond what's operationally necessary

---

## 6. Residual Risks (Documented)

| Risk                                     | Status           | Mitigation Plan                        |
|------------------------------------------|------------------|----------------------------------------|
| DDoS at infrastructure level             | Not mitigated    | Use CDN/WAF in production (Cloudflare) |
| Insider threat (rogue staff)             | Partially mitigated | Audit logs, role restrictions        |
| Zero-day in dependencies                 | Accepted risk    | Regular dependency updates             |
| Physical QR code theft/photo             | Accepted risk    | Session expiration, QR regeneration    |
| Social engineering of restaurant staff   | Not mitigated    | Training, 2FA (future)                |
| Data breach at rest                      | Partially mitigated | Encrypted DB connections, backups   |
