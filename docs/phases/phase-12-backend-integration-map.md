# Phase 12: Backend Integration Map (Customer App)

This document maps the **actual** backend contracts currently implemented in the system, to be consumed by the Flutter Customer Application.

## Environment & Network
* **API Base URL**: `http://<PC-LAN-IP>:8000/api/v1` (for local development on physical Android device).
* **Authentication**: The customer session uses an `HttpOnly` cookie (`dine_session_token`) securely linking the client to a `DineSession`.
* **CORS**: Requires the origin to be appropriately allowed. (Flutter mobile apps typically don't send `Origin` headers like browsers do, so CORS is mostly a browser concern, but cookie handling is critical).

---

## 1. Authentication & Session Establishment (Phase 10 QR)

### **Scan QR Code**
* **Endpoint**: `POST /dine/scan`
* **Rate Limit**: 10/minute
* **Request Body**:
  ```json
  {
    "qr_token": "string (The parsed or raw QR content)"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "session_id": "UUID",
    "restaurant_name": "string",
    "table_number": "string",
    "status": "OPEN"
  }
  ```
  *(Also sets `Set-Cookie: dine_session_token=...; HttpOnly`)*
* **Error States**:
  * `400 Bad Request`: Invalid QR token format.
  * `404 Not Found`: Invalid or inactive QR code (or bad secret).

---

## 2. Menu Retrieval

### **Get Customer Menu**
* **Endpoint**: `GET /dine/menu/`
* **Authentication**: Requires valid `dine_session_token` cookie.
* **Response (200 OK)**: Array of Categories.
  ```json
  [
    {
      "id": "UUID",
      "name": "string",
      "description": "string | null",
      "items": [
        {
          "id": "UUID",
          "name": "string",
          "description": "string | null",
          "price": "integer (paise/cents)",
          "image_url": "string | null",
          "is_veg": "boolean",
          "is_available": "boolean",
          "prep_time_minutes": "integer",
          "option_groups": [
            {
              "id": "UUID",
              "name": "string",
              "min_selections": "integer",
              "max_selections": "integer",
              "options": [
                {
                  "id": "UUID",
                  "name": "string",
                  "price_adjustment": "integer",
                  "is_available": "boolean"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
  ```
* **Notes**: Unavailable items/options are returned; the UI must disable them.

---

## 3. Order Management

### **Create Order (Cart Checkout)**
* **Endpoint**: `POST /dine/orders/`
* **Rate Limit**: 10/minute
* **Headers**: `Idempotency-Key: UUIDv4`
* **Request Body**:
  ```json
  {
    "items": [
      {
        "menu_item_id": "UUID",
        "quantity": "integer (1-20)",
        "special_instructions": "string | null (max 500 chars)",
        "selected_option_ids": ["UUID", "UUID"]
      }
    ]
  }
  ```
* **Response (201 Created)**: Order details with calculated totals.
* **Error States**:
  * `409 Conflict`: Bill is finalized, cannot add orders. (Or Idempotency conflict).
  * `400 Bad Request`: Invalid items/options, duplicate options, min/max limits violated.

### **List Orders (Order Tracking)**
* **Endpoint**: `GET /dine/orders/`
* **Response (200 OK)**: Array of Orders.
  * **Order Statuses**: `PENDING`, `ACCEPTED`, `REJECTED`, `PREPARING`, `READY`, `SERVED`, `CANCELLED`.
* **Notes**: Use REST polling to track order status.

---

## 4. Billing

### **Request Bill**
* **Endpoint**: `POST /dine/bill/request`
* **Rate Limit**: 5/minute
* **Response (201 Created or 200 OK if already requested)**:
  ```json
  {
    "id": "UUID",
    "session_id": "UUID",
    "subtotal": "integer",
    "tax_amount": "integer",
    "service_charge_amount": "integer",
    "total_amount": "integer",
    "status": "PENDING | FINALIZED | PAID",
    "created_at": "datetime"
  }
  ```
* **Error States**:
  * `400 Bad Request`: Cannot request bill for this session state (e.g., already closed), or no valid orders found.

### **Get Current Bill**
* **Endpoint**: `GET /dine/bill/`
* **Response (200 OK)**: Same as Request Bill response.
* **Error States**:
  * `404 Not Found`: Bill not requested yet.

---

## 5. Payments

### **Initiate Payment (Razorpay)**
* **Endpoint**: `POST /dine/payments/initiate`
* **Rate Limit**: 5/minute
* **Headers**: `Idempotency-Key: UUIDv4`
* **Request Body**:
  ```json
  {
    "amount": "integer (must exactly match bill total_amount)",
    "currency": "INR"
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "id": "UUID",
    "gateway_order_id": "string (Razorpay Order ID)",
    "amount": "integer",
    "currency": "INR",
    "status": "CREATED"
  }
  ```
* **Error States**:
  * `400 Bad Request`: Amount mismatch.
  * `409 Conflict`: Bill not FINALIZED, bill already paid, or active payment already exists.
  * `502 Bad Gateway`: Razorpay API failure.

---

## Important Architectural Notes for Flutter
1. **Source of Truth**: The PostgreSQL backend is the absolute source of truth for pricing, availability, and states. Flutter must NEVER calculate authoritative totals.
2. **Session Lifecycle**: The customer app does NOT close the session. The session is closed by the restaurant staff. The app should display a "Thank You" or "Completed" screen once the bill is PAID.
3. **Idempotency**: All mutating operations (Create Order, Initiate Payment) require a `uuid4` generated locally by the Flutter app and sent in the `Idempotency-Key` header.
4. **Security**: DO NOT store Razorpay Secret Key in Flutter. DO NOT store JWT secrets or DB credentials. Use `flutter_secure_storage` for managing local session preferences (if any, though cookies are the primary driver).
5. **Cookie Handling**: Because the backend uses `HttpOnly` cookies, the Flutter `Dio` client MUST be configured with a cookie manager (e.g., `dio_cookie_manager`) to persist and send the session cookie automatically.
