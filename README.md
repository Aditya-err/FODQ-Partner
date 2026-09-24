# FODQ — Scan. Order. Dine. 🍽️⚡

[![Status](https://img.shields.io/badge/Status-Production%20Ready-emerald.svg)](https://github.com/Aditya-err/FODQ-Partner)
[![Architecture](https://img.shields.io/badge/Architecture-Event--Driven%20Cloud-blue.svg)](docs/architecture/system-architecture.html)
[![Web](https://img.shields.io/badge/Customer%20Web-Next.js%20PWA-black.svg)](https://nextjs.org)
[![Mobile](https://img.shields.io/badge/Mobile%20Apps-Flutter-02569B.svg)](https://flutter.dev)
[![API](https://img.shields.io/badge/Backend%20API-FastAPI%20ASGI-009688.svg)](https://fastapi.tiangolo.com)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

> **FODQ** is a next-generation, QR-first restaurant operating system and diner engagement platform. Designed to eliminate friction in hospitality, FODQ unifies table-side mobile ordering, real-time Kitchen Display Systems (KDS), cashier billing, and executive analytics into a cohesive, high-performance ecosystem.

---

## 🌟 The "Scan. Order. Dine." Concept

Traditional restaurant dining suffers from unnecessary operational bottlenecks: waiting for physical menus, waiting for waitstaff to record orders, transcription errors to the kitchen, and delayed checkouts.

FODQ transforms this paradigm:

```
[ Table Arrival ] ──► [ Scan Dynamic QR ] ──► [ Visual Interactive Menu ]
                                                            │
[ Table Freed ] ◄── [ Instant Settlement ] ◄── [ Real-Time KDS Prep ]
```

1. **Scan**: Guests scan an encrypted, table-specific QR code using their native phone camera. No mobile app download or account creation required.
2. **Order**: Diners explore a rich visual menu with customizable ingredients, spice levels, allergen tags, and addon combos. Orders are placed directly to the kitchen with server-authoritative price validation.
3. **Dine**: Kitchen stations receive orders in real time via responsive KDS displays. Diners observe live preparation status updates on their mobile screens and settle the check seamlessly via digital payments (UPI, credit/debit cards, netbanking) or cash.

---

## 🚀 Key Feature Matrix

| Capability | Customer Experience | Kitchen & Floor Staff | Management & Owners |
| :--- | :--- | :--- | :--- |
| **Menu Exploration** | High-res imagery, diet filters (Veg/Non-Veg), spice selectors | Dynamic 86'd out-of-stock toggles | Multi-category visual catalog builder with addon groups |
| **Ordering** | Zero-install PWA, simultaneous table carting | Instant ticket dispatch with station routing | Order history, cancellation audits, peak rush controls |
| **Live Tracking** | Accepted ➔ Preparing ➔ Ready ➔ Served updates | Drag-and-drop or tap status progression timers | Average prep time monitoring & bottleneck alerts |
| **Billing & Payments**| UPI Intent, Cards, NetBanking, split bill review | Cash desk drawer tracking, paperless digital invoices | Server-side tax calculation, discount & refund audits |
| **Table Management** | Automatic dining session association | Floor occupancy map, dirty/clean table state sync | Permanent FODQ identity, bulk PDF/sticker QR export |
| **Governance** | Strict privacy (zero tracking cookies required) | Station-restricted UI views (Chef, Waiter, Cashier) | Granular RBAC, trusted device sessions, revenue reports |

---

## 🏛️ High-Level System Architecture

FODQ is architected as an asynchronous, event-driven platform separating client interfaces, business validation authority, real-time message brokering, and durable multi-tenant persistence.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CUSTOMER EXPERIENCE                             │
│       ┌──────────────────────┐        ┌──────────────────────┐         │
│       │  Customer Web (PWA)  │        │  Customer Native App │         │
│       │ (Zero-install Mobile)│        │   (Flutter Loyalty)  │         │
│       └──────────┬───────────┘        └──────────┬───────────┘         │
└──────────────────┼───────────────────────────────┼─────────────────────┘
                   │                               │
                   ▼                               ▼
       ┌───────────────────────────────────────────────────────┐
       │               API Edge Reverse Proxy                  │
       │            (HTTPS Termination & Routing)              │
       └───────────────────────────┬───────────────────────────┘
                                   │
      ┌────────────────────────────┼───────────────────────────┐
      │                            ▼                           │
      │              ┌───────────────────────────┐             │
      │              │    FODQ Platform Core     │             │
      │              │  (FastAPI Business Auth)  │             │
      │              └───────┬───────────┬───────┘             │
      │                      │           │                     │
      │          ┌───────────┘           └───────────┐         │
      │          ▼                                   ▼         │
      │  ┌───────────────┐                   ┌───────────────┐ │
      │  │  Realtime Hub │                   │ Billing Engine│ │
      │  │  (Event Sync) │                   │(Fiscal Ledger)│ │
      │  └───────┬───────┘                   └───────┬───────┘ │
      │          │                                   │         │
      └──────────┼───────────────────────────────────┼─────────┘
                 │                                   │
        ┌────────┴────────┐                 ┌────────┴────────┐
        ▼                 ▼                 ▼                 ▼
 ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
 │ Kitchen KDS  │  │ Cashier POS  │  │Relational DB │  │Razorpay Gate │
 │(Line Display)│  │(Floor Desk)  │  │(Durable Data)│  │ (Payments)   │
 └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

> 💡 **Explore Interactive Architecture**: Open the interactive, validated [Archify System Architecture](docs/architecture/system-architecture.html) diagram to inspect live component inspectability, views, and data routes.

---

## 🔄 Major Operational Flows

### 1. Customer Ordering & Kitchen Dispatch Flow
1. **Physical Presence Verification**: Customer scans physical table QR code. Platform validates cryptographic token and opens a table-bound dining session.
2. **Catalog Retrieval**: Customer browses fast, CDN-cached digital menu with variants, modifiers, and addon groups.
3. **Authoritative Order Placement**: When customer submits cart, prices and taxes are recalculated strictly on the server to prevent client-side manipulation.
4. **Kitchen Broadcast**: Order is converted into kitchen tickets and broadcast in sub-milliseconds to the relevant KDS stations.
5. **Real-time Status Updates**: Line chefs update ticket progress (`ACCEPTED` ➔ `PREPARING` ➔ `READY`), streaming updates to the diner's screen.

> 📊 *View the full interactive sequence in [ordering-flow.html](docs/architecture/ordering-flow.html).*

### 2. Billing, Payment & Table Turnover Flow
1. **Invoice Generation**: Diners or floor cashiers initiate bill generation. Server calculates exact item subtotals, configurable taxes (GST/VAT), service charges, and applied discounts.
2. **Digital Settlement**: Diners pay directly from their smartphone via integrated UPI / Card gateway, or choose to settle with cash at the floor cashier station.
3. **Cryptographic Webhook Verification**: The payment gateway notifies FODQ via signed webhook signatures. Once verified, the bill is marked `PAID`.
4. **Session Closure & Table Reset**: Dine session closes, the table is automatically reset to `AVAILABLE`, and an itemized digital receipt is delivered to the customer.

> 📊 *View the interactive user journey in [customer-journey.html](docs/architecture/customer-journey.html).*

### 3. Restaurateur & Floor Management Workflow
1. **Venue Identity**: Owners configure restaurant details, service hours, currency, and permanent FODQ codes.
2. **Floor Provisioning**: Physical dining tables are created with dynamic QR identifiers. Export printable high-density QR stickers or PDF table stands in bulk.
3. **Catalog Management**: Add dishes, organize categories, attach high-resolution food photography, and configure modular addon groups.
4. **Business Analytics**: Review real-time sales revenue, average ticket sizes, peak turnover hours, and top-selling dishes.

> 📊 *View the interactive restaurant operations diagram in [restaurant-workflow.html](docs/architecture/restaurant-workflow.html).*

---

## 🛠️ Technology Stack Overview

### Frontend & Client Applications
- **Customer Web (PWA)**: Built with Next.js, React, and modern Tailwind CSS. Optimized for mobile viewports, sub-second First Contentful Paint (FCP), and zero-app installation.
- **Partner & Kitchen Applications**: Responsive Next.js web application for desktop/tablets alongside native Flutter applications for Android and iOS devices.

### Backend Services & Authority
- **Core API Engine**: FastAPI (Python ASGI) providing strict OpenAPI contracts, Pydantic type safety, and microsecond endpoint latencies.
- **Asynchronous Processing**: Non-blocking asynchronous I/O handling high concurrency during peak dining rush hours.

### Data & Message Distribution
- **Relational Data Store**: PostgreSQL database serving as the durable source of truth for restaurants, tables, menus, orders, bills, and immutable audit logs.
- **Real-Time Event Broker & Cache**: Redis pub/sub broker for instant kitchen ticket broadcasting, distributed locks, and sub-millisecond menu caching.

### Cloud Integrations & Payments
- **Payment Processing**: Integrated digital payment gateway (Razorpay) supporting UPI Intent, dynamic QR, cards, and netbanking with signed webhook capture.
- **Asset Storage & CDN**: Cloud asset storage (Cloudinary / CDN) for responsive, WebP-compressed food imagery.

---

## 📐 Interactive Architecture Specifications

The `docs/architecture/` folder contains validated interactive architecture models created using Archify:

| Diagram Specification | Interactive Viewer | Description |
| :--- | :--- | :--- |
| **System Architecture** | [`system-architecture.html`](docs/architecture/system-architecture.html) | Global system components, trust boundaries, and platform connections |
| **Ordering & Billing Flow** | [`ordering-flow.html`](docs/architecture/ordering-flow.html) | Sequence diagram detailing scan, kitchen dispatch, and payment capture |
| **Customer Journey** | [`customer-journey.html`](docs/architecture/customer-journey.html) | Step-by-step guest lifecycle from table arrival to receipt generation |
| **Restaurant Operations** | [`restaurant-workflow.html`](docs/architecture/restaurant-workflow.html) | Restaurateur operational workflow across floor setup, KDS, and analytics |

---

## 🔒 Security & Fiscal Integrity Principles

1. **Client Never Dictates Price**: All item amounts, modifier add-ons, discounts, and taxes are strictly recalculated on the backend server.
2. **Physical Presence Verification**: QR tokens contain cryptographically signed parameters to prove guests are physically seated at the designated table.
3. **Multi-Tenant Isolation**: Tenant scoping is enforced at the database query layer, ensuring complete data isolation between restaurants.
4. **Tamper-Evident Audit Logging**: Sensitive operations (price changes, order cancellations, bill adjustments) are recorded in append-only audit ledgers.

---

## 🗺️ Product Roadmap

- [x] Zero-install QR mobile ordering web application
- [x] Multi-station Kitchen Display System (KDS) with live status sync
- [x] Authoritative server-side billing with digital payment gateway integration
- [x] Table QR provisioning and bulk sticker/PDF export
- [x] Owner analytics dashboard for revenue, peak hours, and popular dishes
- [ ] Offline-tolerant local kitchen sync mode for network interruptions
- [ ] Multi-language diner menu localization (English, Hindi, regional dialects)
- [ ] Automated inventory deduction tied to live recipe ingredients
- [ ] WhatsApp digital receipt and loyalty re-engagement integration

---

## 📄 License

This repository is distributed under the **MIT License**. See [`LICENSE`](LICENSE) for complete details.

---

<div align="center">
  <sub>FODQ Platform • Transforming the Dining Experience • Scan. Order. Dine.</sub>
</div>
