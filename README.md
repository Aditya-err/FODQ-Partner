<div align="center">

# 🖥️ FODQ Partner Management Suite
### *Professional Desktop Applications for Restaurant Owners & Kitchen Staff*

[![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://www.microsoft.com/windows)
[![Built with](https://img.shields.io/badge/Built_with-Python_%2B_PyInstaller-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://pyinstaller.org)
[![Backend](https://img.shields.io/badge/Powered_by-FODQ_Backend-FF5200?style=for-the-badge)](https://github.com/Aditya-err/FODQ-Resturant-Order-Management-)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=for-the-badge)](./LICENSE)

> Part of the **FODQ — Food Order & Dine Queue** ecosystem.  
> Standalone Windows desktop applications for restaurant management and kitchen operations.

</div>

---

## 📦 What is FODQ Partner Suite?

**FODQ Partner Management Suite** is the desktop companion to the FODQ cloud platform. It provides two powerful Windows applications that restaurant owners and kitchen teams can run on any Windows PC or laptop — no browser required.

| Application | Purpose | Users |
|---|---|---|
| 🏢 **FODQ Management** | Full restaurant operations dashboard | Restaurant Owners, Managers |
| 👨‍🍳 **FODQ Kitchen** | Real-time Kitchen Display System (KDS) | Chefs, Kitchen Staff |

Both apps connect to your FODQ backend and work in sync with the web and mobile apps.

---

## 🏛️ How FODQ Works — Complete System Overview

FODQ is a **multi-tenant restaurant SaaS platform**. Here's how all the pieces connect:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          FODQ ECOSYSTEM                                 │
├─────────────────────┬──────────────────────┬────────────────────────────┤
│    CUSTOMER SIDE    │    OWNER / MGMT SIDE  │      KITCHEN SIDE          │
│                     │                       │                            │
│  📱 Mobile Browser  │  🌐 Web Dashboard     │  🌐 Kitchen Web KDS        │
│  (QR → Order →Pay)  │  📱 Owner Mobile App  │  🖥️ FODQ Kitchen.exe       │
│  📲 Flutter App     │  🖥️ FODQ Mgmt.exe     │                            │
│                     │                       │                            │
└──────────┬──────────┴──────────────┬────────┴────────────┬───────────────┘
           │                         │                     │
           ▼                         ▼                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Python 3.11+)                        │
│  Auth · Tables · Menu · Orders · KDS · Billing · Razorpay · RBAC       │
└──────────────────────┬───────────────────────────────────────────────────┘
                       │
         ┌─────────────┴──────────────┐
         ▼                            ▼
┌────────────────┐         ┌─────────────────────┐
│ PostgreSQL 15+ │         │      Redis 7+       │
│ (Source of     │         │  Cache · Pub/Sub ·  │
│  Truth)        │         │  Idempotency        │
└────────────────┘         └─────────────────────┘
```

---

## 🔄 End-to-End Flow — How the Full System Works

### Step 1 — Customer Scans QR & Orders
```
Customer at table
    │
    ▼ Scans QR Code on table
[FODQ Server validates QR token] ── HMAC-signed, tamper-proof
    │
    ▼ DineSession created (isolated per table)
[Customer browses Digital Menu]
    │
    ▼ Adds items to cart → Checkout
[Server recalculates ALL prices] ── Client prices ignored
    │
    ▼ Order saved as PENDING
[Real-time push via Redis → WebSocket → Kitchen]
```

### Step 2 — Kitchen Receives & Processes Orders
```
FODQ Kitchen.exe (or Kitchen Web KDS)
    │
    ▼ 🔴 NEW ORDER appears on screen (WebSocket, instant)
Chef ACCEPTS → starts PREPARING → marks READY
    │
    ▼ Waiter delivers food → marks SERVED
Customer sees live status update on their phone
```

### Step 3 — Owner Manages Everything from Dashboard
```
FODQ Management.exe (or Admin Web Dashboard)
    │
    ├── View active tables (who is dining, session time)
    ├── View all current orders
    ├── Billing: generate bills, add adjustments, apply discounts
    ├── Menu: update items, prices, images, availability
    ├── Tables: configure layout, generate/rotate QR codes
    ├── Inventory: track stock, view variance
    ├── Intelligence: demand forecasting, peak hour analysis
    ├── Reports: revenue, daily summary, export CSV/PDF
    └── Settings: staff management (RBAC), devices, restaurant info
```

### Step 4 — Payment & Session Closure
```
Customer requests bill on their phone
    │
    ▼ Server generates bill (sum of all table orders)
[Razorpay payment link opened on customer's phone]
    │
    ▼ Customer pays
[Razorpay sends webhook to FODQ backend]
    │ Server verifies webhook signature (NEVER trusts client)
    ▼
Bill marked PAID → DineSession CLOSED → Table becomes AVAILABLE
```

---

## 🖥️ FODQ Management.exe — Feature Guide

> Full restaurant management in a standalone Windows app.

### 🔐 Login & Authentication
- Owner signs in with **phone number OTP**
- Supports **MFA (Multi-Factor Authentication)**
- Trusted device management — remember devices securely
- Session persists across app restarts
- All auth handled server-side (never stored locally)

### 📊 Dashboard
- Live snapshot: active tables, open sessions, today's revenue
- Quick links to all management modules
- Real-time order count indicators

### 🪑 Table Management
- View all tables with live status (Available / Occupied / Billing)
- See active session duration, customer count, order count per table
- Generate and download **QR codes** per table
- Rotate/regenerate QR tokens (invalidates old QR instantly)
- Edit table names and capacity

### 🍽️ Menu Management
- Create and organize **categories** (e.g., Starters, Mains, Beverages)
- Add **menu items** with:
  - Name, description, price
  - Food image (uploaded to Cloudinary CDN)
  - Dietary tags (Veg/Non-Veg/Vegan)
  - Availability toggle (instantly hides from customer menu)
- Add **option groups** (Size, Spice Level, Add-ons)
- Set option prices (positive or negative price adjustments)

### 💰 Billing Hub
- View all bills for active dining sessions
- Add **billing adjustments** (discount, surcharge) with mandatory description
- Apply percentage or fixed-amount discounts
- View bill breakdown per item
- Mark bills as settled
- Download bill as PDF

### 📦 Inventory Management
- Track stock levels for ingredients
- Log stock-in and usage
- View **variance reports** (expected vs. actual consumption)
- Identify discrepancies and waste patterns

### 📈 Intelligence & Analytics
- **Demand Forecasting** — deterministic algorithm predicts item demand based on historical order patterns
- Peak hour analysis — identify busiest times
- Top-selling items report
- Revenue by category
- 30-hour lifecycle planning window

### 📋 Reports
- Daily revenue summary
- Order volume reports
- Payment method breakdown
- Export to **CSV** or **PDF**
- Date-range filtering

### ⚙️ Settings
- **Restaurant profile** — name, address, contact, logo
- **Staff management** — add staff, assign roles (Manager, Kitchen, Waiter)
- **RBAC permissions** — fine-grained access control per role
- **Device sessions** — view and revoke active login sessions
- **Security** — change password, manage MFA
- **Account deletion** — secure multi-stage deletion workflow

---

## 👨‍🍳 FODQ Kitchen.exe — Feature Guide

> A dedicated Kitchen Display System for the kitchen team.

### 📋 Real-Time Order Board
- **Kanban-style columns:**
  - 🔴 **NEW** — Fresh orders from customers
  - 🟡 **ACCEPTED** — Kitchen confirmed
  - 🔵 **PREPARING** — Being cooked
  - 🟢 **READY** — Plated, waiting for waiter
  - ✅ **SERVED** — Delivered to table
- Orders arrive **instantly** via WebSocket (no refresh needed)
- **Visual + audio alerts** for new orders
- Shows: table number, items ordered, special instructions, order time

### ⚡ Order Actions
- **Accept** — Confirm order (moves to Accepted)
- **Start Prep** — Begin cooking (moves to Preparing)
- **Mark Ready** — Food plated (moves to Ready)
- **Mark Served** — Delivered (moves to Served)
- **Reject** — Decline with reason (notifies customer)

### 🔄 Reliability
- **Auto-reconnect** with exponential backoff if connection drops
- Falls back to REST polling if WebSocket unavailable
- First-message JWT authentication (secure WebSocket handshake)

---

## ⬇️ Download & Installation

### Requirements
- Windows 10 or Windows 11 (64-bit)
- Internet connection (connects to FODQ cloud backend)
- Your FODQ restaurant account credentials

### Download
The built EXEs are located in the main FODQ repository:

```
FODQ-Resturant-Order-Management-/
├── dist/
│   ├── FODQ Management/
│   │   └── FODQ Management.exe     ← Management Suite
│   └── FODQ Kitchen/
│       └── FODQ Kitchen.exe        ← Kitchen KDS
```

> **Important:** Always copy the **entire folder** (not just the `.exe`), as supporting DLLs and assets live alongside the executable.

### First Launch
1. Copy the full `FODQ Management/` folder to your PC
2. Double-click `FODQ Management.exe`
3. Enter your restaurant's backend server URL (or use cloud URL)
4. Log in with your owner phone number
5. Complete OTP verification

---

## 🏗️ Build from Source

The desktop apps are built from the main monorepo using **PyInstaller**.

```bash
# Clone the main repo
git clone https://github.com/Aditya-err/FODQ-Resturant-Order-Management-.git
cd FODQ-Resturant-Order-Management-

# Build Management EXE
pyinstaller "FODQ Management.spec" --noconfirm

# Build Kitchen EXE
pyinstaller "FODQ Kitchen.spec" --noconfirm

# Output will be in:
# dist/FODQ Management/FODQ Management.exe
# dist/FODQ Kitchen/FODQ Kitchen.exe
```

### Spec Configuration
- `FODQ Management.spec` — Bundles `desktop/management_launcher.py` + `management_ui.html`
- `FODQ Kitchen.spec` — Bundles `desktop/kitchen_launcher.py` + `kitchen_ui.html`

---

## 🔧 Technology Stack (Desktop Apps)

| Component | Technology |
|---|---|
| **App Shell** | Python 3.11+, PyInstaller |
| **UI Rendering** | Chromium WebEngine (embedded browser) |
| **Frontend UI** | HTML5, CSS3, JavaScript (vanilla) |
| **Backend Connection** | REST API + WebSocket (FastAPI) |
| **Auth** | JWT tokens (managed by FODQ backend) |
| **Build Tool** | PyInstaller (one-folder EXE output) |

---

## 🗺️ Full FODQ Ecosystem

| Repository | Contents |
|---|---|
| **[FODQ-Resturant-Order-Management-](https://github.com/Aditya-err/FODQ-Resturant-Order-Management-)** | Backend (FastAPI), Web Apps (Next.js), Mobile (Flutter), Desktop Source |
| **[FODQ-Partner](https://github.com/Aditya-err/FODQ-Partner)** | This repo — Desktop EXE documentation & assets |

---

## 🔒 Security Notes

- **All authentication is server-side** — credentials never stored in the EXE
- The desktop app is a thin client — all business logic runs on the FODQ backend
- QR tokens are HMAC-signed and verified server-side
- Payments processed exclusively via Razorpay webhook verification
- RBAC enforced at API level — the UI cannot bypass permissions
- All connections use HTTPS in production

---

## 📄 License

Proprietary — All rights reserved © FODQ.  
This software is part of the FODQ restaurant management platform and is not licensed for redistribution.

---

<div align="center">

**Part of the FODQ Platform** · [Main Repository](https://github.com/Aditya-err/FODQ-Resturant-Order-Management-) · Built with ❤️ for restaurant owners

</div>
