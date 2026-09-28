# FODQ — API Conventions

## 1. Base URL Structure

```text
/api/v1/                         # Versioned API root

# Staff/Owner endpoints (JWT auth)
/api/v1/auth/                    # Authentication
/api/v1/restaurants/             # Restaurant management
/api/v1/restaurants/{id}/tables/ # Table management
/api/v1/restaurants/{id}/menu/   # Menu management
/api/v1/restaurants/{id}/orders/ # Order management (staff view)
/api/v1/restaurants/{id}/bills/  # Billing
/api/v1/restaurants/{id}/staff/  # Staff management
/api/v1/restaurants/{id}/analytics/ # Analytics
/api/v1/restaurants/{id}/reviews/ # Reviews (staff view)

# Customer endpoints (Session token auth)
/api/v1/dine/{qr_token}         # QR scan entry point
/api/v1/dine/session/menu       # Browse menu
/api/v1/dine/session/cart       # Cart operations
/api/v1/dine/session/orders     # Place/view orders
/api/v1/dine/session/bill       # Request/view bill
/api/v1/dine/session/reviews    # Submit reviews

# Kitchen endpoints (JWT auth, KITCHEN role)
/api/v1/kitchen/orders          # Kitchen order queue

# Platform admin endpoints (JWT auth, PLATFORM_ADMIN)
/api/v1/admin/restaurants       # All restaurants
/api/v1/admin/users             # All users
/api/v1/admin/audit-logs        # Audit logs
/api/v1/admin/security-events   # Security events
/api/v1/admin/stats             # Platform statistics

# System
/health                          # Health check
/ready                           # Readiness check
```

---

## 2. Standard Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "message": "Order created successfully"
}
```

### Success Response (List with Pagination)

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_items": 156,
    "total_pages": 8
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ITEM_UNAVAILABLE",
    "message": "One or more items are no longer available",
    "details": [
      {
        "field": "items[0].item_id",
        "message": "Chicken Biryani is currently sold out"
      }
    ]
  }
}
```

---

## 3. HTTP Status Codes

| Code | Meaning               | Used For                                        |
|------|-----------------------|-------------------------------------------------|
| 200  | OK                    | Successful GET, PUT, PATCH                      |
| 201  | Created               | Successful POST that creates a resource         |
| 204  | No Content            | Successful DELETE                               |
| 400  | Bad Request           | Validation errors, business rule violations      |
| 401  | Unauthorized          | Missing or invalid authentication                |
| 403  | Forbidden             | Authenticated but lacks permission               |
| 404  | Not Found             | Resource doesn't exist (or hidden for security)  |
| 409  | Conflict              | Duplicate resource, state conflict               |
| 410  | Gone                  | Expired session, deactivated resource             |
| 422  | Unprocessable Entity  | Semantically invalid input                       |
| 429  | Too Many Requests     | Rate limit exceeded                              |
| 500  | Internal Server Error | Unexpected server error                          |

---

## 4. Error Codes

Application-specific error codes for programmatic handling:

| Code                        | HTTP | Description                              |
|-----------------------------|------|------------------------------------------|
| `VALIDATION_ERROR`          | 400  | Input validation failed                  |
| `INVALID_CREDENTIALS`       | 401  | Wrong email or password                  |
| `TOKEN_EXPIRED`             | 401  | JWT or session token has expired         |
| `TOKEN_INVALID`             | 401  | Malformed or invalid token               |
| `ACCOUNT_LOCKED`            | 403  | Too many failed login attempts           |
| `INSUFFICIENT_PERMISSIONS`  | 403  | User role doesn't allow this action      |
| `TENANT_ACCESS_DENIED`      | 403  | Cross-tenant access attempt              |
| `RESOURCE_NOT_FOUND`        | 404  | Requested entity does not exist          |
| `ITEM_UNAVAILABLE`          | 400  | Menu item is sold out or inactive        |
| `SESSION_EXPIRED`           | 410  | Dining session has expired               |
| `SESSION_CLOSED`            | 410  | Session is already closed                |
| `INVALID_STATE_TRANSITION`  | 409  | Order/session/bill state change invalid  |
| `DUPLICATE_REQUEST`         | 409  | Idempotency key already processed        |
| `RATE_LIMIT_EXCEEDED`       | 429  | Too many requests                        |
| `INTERNAL_ERROR`            | 500  | Unexpected server error                  |

---

## 5. Request Headers

| Header                | Required | Description                              |
|-----------------------|----------|------------------------------------------|
| `Authorization`       | Yes*     | `Bearer <jwt>` or `Session <token>`      |
| `Content-Type`        | Yes      | `application/json` for request bodies    |
| `X-Idempotency-Key`  | Conditional | Required for order/bill/payment creation |
| `Accept-Language`     | Optional | For future multilingual support          |

*Not required for public endpoints (health check, QR scan).

---

## 6. Pagination

All list endpoints support cursor-based or offset pagination:

```text
GET /api/v1/restaurants/{id}/orders?page=1&page_size=20&status=PLACED
```

| Parameter   | Default | Max  | Description                |
|-------------|---------|------|----------------------------|
| `page`      | 1       | —    | Page number (1-indexed)    |
| `page_size` | 20      | 100  | Items per page             |

---

## 7. Filtering & Sorting

```text
# Filter by status
GET /api/v1/restaurants/{id}/orders?status=PLACED,ACCEPTED

# Filter by date range
GET /api/v1/restaurants/{id}/orders?from_date=2026-01-01&to_date=2026-01-31

# Sort
GET /api/v1/restaurants/{id}/orders?sort_by=created_at&sort_order=desc
```

---

## 8. WebSocket Events

Real-time updates use WebSocket connections:

```text
# Kitchen connects
WS /api/v1/ws/kitchen/{restaurant_id}

# Customer connects
WS /api/v1/ws/customer/{session_token}
```

### Event Payload Format

```json
{
  "event": "ORDER_STATUS_CHANGED",
  "data": {
    "order_id": "...",
    "status": "PREPARING",
    "updated_at": "2026-01-15T10:30:00Z"
  }
}
```

### Event Types

| Event                    | Sent To         | Trigger                           |
|--------------------------|-----------------|-----------------------------------|
| `NEW_ORDER`              | Kitchen          | Customer places order             |
| `ORDER_STATUS_CHANGED`   | Customer         | Kitchen updates order status      |
| `ORDER_CANCELLED`        | Kitchen/Customer | Order cancelled                   |
| `BILL_GENERATED`         | Customer         | Bill is ready                     |
| `PAYMENT_CONFIRMED`      | Customer         | Payment confirmed                 |
| `ITEM_AVAILABILITY`      | Customer         | Menu item sold out / restocked    |
| `TABLE_STATUS_CHANGED`   | Owner dashboard  | Table session status changed      |

---

## 9. API Versioning

- API version in URL path: `/api/v1/`
- Major version changes warrant a new path (`/api/v2/`)
- Minor/backward-compatible changes don't require version bump
- Deprecated endpoints return `Deprecation` header with sunset date
