<div align="center">

  <!-- FODQ Hero Banner with Food Doodle -->
  <img src="./assets/HEAD2.png" width="100%" alt="FODQ - Scan. Order. Dine." style="border-radius: 12px; max-width: 900px;" />

  <br/><br/>

  <!-- Brand Title & Tagline -->
  <p align="center">
    <a href="#-the-fodq-experience">
      <img src="https://img.shields.io/badge/EXPERIENCE-Scan._Order._Dine.-FF6B00?style=for-the-badge&logoColor=white" alt="Scan Order Dine" />
    </a>
    <a href="#-system-architecture">
      <img src="https://img.shields.io/badge/ARCHIFY-Interactive_Diagrams-FF3D71?style=for-the-badge&logoColor=white" alt="Interactive Architecture" />
    </a>
    <a href="#-built-with">
      <img src="https://img.shields.io/badge/STACK-Next.js_•_FastAPI_•_Flutter-10B981?style=for-the-badge&logoColor=white" alt="Tech Stack" />
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/badge/LICENSE-MIT-8B5CF6?style=for-the-badge&logoColor=white" alt="MIT License" />
    </a>
  </p>

  <h3 align="center" style="font-weight: 400; color: #a1a1aa;">
    The cloud-native, QR-first operating system transforming restaurant dining into an effortless, real-time visual journey.
  </h3>

  <p align="center">
    <a href="#-what-is-fodq"><b>Explore Platform</b></a> •
    <a href="#-the-fodq-experience"><b>Diner Journey</b></a> •
    <a href="#-core-features"><b>Capabilities</b></a> •
    <a href="#-system-architecture"><b>Architecture</b></a> •
    <a href="#-product-preview"><b>Product Preview</b></a>
  </p>

</div>

<img src="./assets/dividers/orange-glow-line.svg" width="100%" height="8" alt="divider" />

## ⚡ What is FODQ?

**FODQ** is a modern food-tech operating ecosystem engineered from the ground up to solve the friction of traditional hospitality. In a world where guests expect instant responsiveness, physical paper menus and delayed waitstaff handoffs create operational drag, order errors, and sluggish table turnover.

FODQ replaces legacy bottlenecks with a **unified, real-time operating flow**:

* 📱 **Zero-Install Web Experience**: Diners scan a physical table QR code and instantly access a rich visual menu directly in their mobile browser. No app download, no account friction.
* 👨‍🍳 **Synchronous Kitchen Routing**: Line cooks receive digitized tickets on dedicated Kitchen Display Systems (KDS) stations the split-second guests submit their cart.
* 💳 **Authoritative Table Billing**: Instant checkout with automated tax computation, split-bill support, Razorpay payment verification, and paperless digital receipts.
* 📊 **Intelligence for Operators**: Live floor occupancy maps, instant table status synchronization (`AVAILABLE` ➔ `OCCUPIED` ➔ `ORDERED` ➔ `BILLING`), and actionable revenue insights.

<img src="./assets/dividers/orange-glow-line.svg" width="100%" height="8" alt="divider" />

## 🍽️ The FODQ Experience

```
 [ Table Arrival ] ──► [ Scan Dynamic QR ] ──► [ Visual Interactive Menu ]
                                                            │
 [ Table Reset ]   ◄── [ Instant Settlement ] ◄── [ Real-Time KDS Prep ]
```

<br/>

<table>
  <tr align="center">
    <td width="16%">
      <img src="./assets/qr-code-scan.svg" width="48" height="48" alt="Scan QR" /><br/>
      <b>1. Scan QR</b><br/>
      <sub>Camera auto-detects table token</sub>
    </td>
    <td width="16%">
      <img src="./assets/food-menu.svg" width="48" height="48" alt="Explore Menu" /><br/>
      <b>2. Browse Menu</b><br/>
      <sub>Photos, dietary tags & addons</sub>
    </td>
    <td width="16%">
      <img src="./assets/dine-in-rounded.svg" width="48" height="48" alt="Order Direct" /><br/>
      <b>3. Submit Cart</b><br/>
      <sub>Server-verified authoritative pricing</sub>
    </td>
    <td width="16%">
      <img src="./assets/kitchen.svg" width="48" height="48" alt="Kitchen KDS" /><br/>
      <b>4. Live KDS</b><br/>
      <sub>Line stations prep in real time</sub>
    </td>
    <td width="16%">
      <img src="./assets/receipt.svg" width="48" height="48" alt="Itemized Bill" /><br/>
      <b>5. Itemized Bill</b><br/>
      <sub>Automated taxes & discounts</sub>
    </td>
    <td width="16%">
      <img src="./assets/razorpay.svg" width="64" alt="Digital Pay" /><br/>
      <b>6. Settle & Free</b><br/>
      <sub>UPI / Cards & table reset</sub>
    </td>
  </tr>
</table>

<img src="./assets/dividers/orange-glow-line.svg" width="100%" height="8" alt="divider" />

## 🚀 Core Features

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>📲 Zero-Install Guest Ordering</h3>
      <ul>
        <li><b>Frictionless Ingress:</b> Dynamic QR code scanning opens the lightweight PWA instantly in Mobile Safari or Chrome.</li>
        <li><b>Rich Visual Catalog:</b> High-resolution photography, categorized navigation, allergen filters, and Veg/Non-Veg toggles.</li>
        <li><b>Modular Customization:</b> Multi-level modifiers (portion sizing, spice level, ingredient add-ons, chef special instructions).</li>
        <li><b>Synchronous Table Carts:</b> Diners seated at the same table can browse and review items seamlessly.</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3>👨‍🍳 Kitchen Display System (KDS)</h3>
      <ul>
        <li><b>Instant Ticket Ingestion:</b> Orders appear instantly on kitchen tablets without ticket printers or paper waste.</li>
        <li><b>Station-Based Dispatch:</b> Routing of appetizers, main entrées, and bar beverages to specific prep lines.</li>
        <li><b>Stage Progression:</b> Clear touch progression (<code>ACCEPTED</code> ➔ <code>PREPARING</code> ➔ <code>READY</code> ➔ <code>SERVED</code>).</li>
        <li><b>Visual Timer Alerts:</b> Color-coded elapsed timers alert kitchen staff to ticket delays before bottlenecks occur.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🧾 Authoritative Fiscal Billing</h3>
      <ul>
        <li><b>Server-Side Calculation:</b> Item subtotals, GST/VAT taxes, and service fees are computed securely on the backend.</li>
        <li><b>Flexible Settlement:</b> Diners pay directly through integrated UPI Intent, cards, netbanking, or request cash payment.</li>
        <li><b>Cryptographic Webhook Capture:</b> Gateway confirmations securely transition bills to <code>PAID</code> status.</li>
        <li><b>Digital Paperless Invoices:</b> Instant receipt generation directly to the diner's mobile screen.</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3>📊 Restaurateur Governance</h3>
      <ul>
        <li><b>Floor & Table Provisioning:</b> Dynamic table layout designer with bulk PDF and sticker sheet QR code generation.</li>
        <li><b>Live Table Status:</b> Real-time synchronization of floor occupancy (<code>AVAILABLE</code>, <code>OCCUPIED</code>, <code>ORDERED</code>, <code>BILLING</code>).</li>
        <li><b>Dynamic 86'd Inventory:</b> One-tap out-of-stock toggling prevents customers from ordering unavailable dishes.</li>
        <li><b>Actionable Analytics:</b> Track daily sales revenue, peak ordering hours, popular dishes, and table turn rates.</li>
      </ul>
    </td>
  </tr>
</table>

<img src="./assets/dividers/orange-glow-line.svg" width="100%" height="8" alt="divider" />

## 🏛️ System Architecture

FODQ leverages an event-driven, cloud-native architecture decoupling client presentation, authoritative backend validation, low-latency message distribution, and durable ACID storage.

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

### 📐 Interactive Archify Specifications

The repository includes standalone, interactive architectural models built with Archify:

| Architecture Specification | Interactive Diagram | Architecture Scope |
| :--- | :--- | :--- |
| 🌐 **System Architecture** | [**View Diagram**](docs/architecture/system-architecture.html) | Global components, trust boundaries, and platform connections |
| 🔄 **Ordering & Kitchen Flow** | [**View Diagram**](docs/architecture/ordering-flow.html) | Sequence from QR scan to kitchen ticket and payment capture |
| 🚶 **Customer Experience Journey** | [**View Diagram**](docs/architecture/customer-journey.html) | Complete step-by-step diner experience across table arrival and checkout |
| 🧑‍💼 **Restaurant Partner Workflow** | [**View Diagram**](docs/architecture/restaurant-workflow.html) | Operator workflow across venue setup, menu authoring, and analytics |

<img src="./assets/dividers/orange-glow-line.svg" width="100%" height="8" alt="divider" />

## 🔍 How It Works

```
 ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
 │ 1. Table QR  │ ──►  │  2. Dynamic  │ ──►  │ 3. Automated │ ──►  │  4. Instant  │
 │  Activation  │      │  Menu Sync   │      │ Kitchen KDS  │      │  Settlement  │
 └──────────────┘      └──────────────┘      └──────────────┘      └──────────────┘
```

1. **Venue & Table Setup**: The restaurateur defines table numbers and capacities. FODQ provisions encrypted table tokens and exports printable sticker sheets.
2. **Instant Diner Discovery**: The diner scans the table QR. The system creates an active session and serves the digital catalog with sub-second latency.
3. **Kitchen Synchronization**: Orders bypass paper transcription, triggering instantaneous visual and audible alerts on line-cook KDS screens.
4. **Checkout & Reset**: The check is requested and settled digitally. The session closes, freeing the table status to `AVAILABLE` for the next dining party.

<img src="./assets/dividers/orange-glow-line.svg" width="100%" height="8" alt="divider" />

## 🛠️ Built With

FODQ is built on a battle-tested, high-performance technology stack:

<br/>

<table>
  <tr align="center">
    <td width="20%">
      <img src="./assets/next-js.svg" width="48" height="48" alt="Next.js" /><br/><br/>
      <b>Next.js PWA</b><br/>
      <sub>Customer Web & Admin</sub>
    </td>
    <td width="20%">
      <img src="./assets/fastapi-1.svg" width="48" height="48" alt="FastAPI" /><br/><br/>
      <b>FastAPI ASGI</b><br/>
      <sub>Core Business Authority</sub>
    </td>
    <td width="20%">
      <img src="./assets/python-5.svg" width="48" height="48" alt="Python" /><br/><br/>
      <b>Python 3.12</b><br/>
      <sub>Strict Type-Checked Logic</sub>
    </td>
    <td width="20%">
      <img src="./assets/flutter.svg" width="48" height="48" alt="Flutter" /><br/><br/>
      <b>Flutter</b><br/>
      <sub>Mobile App Foundation</sub>
    </td>
    <td width="20%">
      <img src="./assets/postgresql-inc-2.svg" width="48" height="48" alt="PostgreSQL" /><br/><br/>
      <b>PostgreSQL</b><br/>
      <sub>Relational Source of Truth</sub>
    </td>
  </tr>
  <tr align="center">
    <td width="20%">
      <img src="./assets/redis.svg" width="48" height="48" alt="Redis" /><br/><br/>
      <b>Redis 7</b><br/>
      <sub>Pub/Sub & Distributed Cache</sub>
    </td>
    <td width="20%">
      <img src="./assets/tailwind-css-2.svg" width="48" height="48" alt="Tailwind CSS" /><br/><br/>
      <b>Tailwind CSS</b><br/>
      <sub>Responsive Mobile UI</sub>
    </td>
    <td width="20%">
      <img src="./assets/razorpay.svg" width="80" alt="Razorpay" /><br/><br/>
      <b>Razorpay</b><br/>
      <sub>UPI & Card Gateway</sub>
    </td>
    <td width="20%">
      <img src="./assets/docker.svg" width="48" height="48" alt="Docker" /><br/><br/>
      <b>Docker</b><br/>
      <sub>Containerized Runtime</sub>
    </td>
    <td width="20%">
      <img src="./assets/git-icon.svg" width="48" height="48" alt="Git" /><br/><br/>
      <b>Git & GitHub</b><br/>
      <sub>Version Control & Releases</sub>
    </td>
  </tr>
</table>

<img src="./assets/dividers/orange-glow-line.svg" width="100%" height="8" alt="divider" />

## 📱 Product Preview

Verified real-device mobile and tablet interface previews across the FODQ ecosystem:

<br/>

<table>
  <tr align="center">
    <td width="20%">
      <img src="./screenshots/device_screen_menu.png" width="100%" alt="Interactive Menu" /><br/>
      <sub><b>Digital Menu</b><br/>Categories, photos & dietary tags</sub>
    </td>
    <td width="20%">
      <img src="./screenshots/device_screen_kitchen.png" width="100%" alt="Kitchen KDS" /><br/>
      <sub><b>Kitchen KDS</b><br/>Live ticket queues & timers</sub>
    </td>
    <td width="20%">
      <img src="./screenshots/device_screen_billing.png" width="100%" alt="Table Billing" /><br/>
      <sub><b>Billing POS</b><br/>Automated tax & settlements</sub>
    </td>
    <td width="20%">
      <img src="./screenshots/device_screen_tables.png" width="100%" alt="Floor Management" /><br/>
      <sub><b>Floor Tables</b><br/>Live occupancy monitoring</sub>
    </td>
    <td width="20%">
      <img src="./screenshots/device_screen_table_qr_code.png" width="100%" alt="Table QR Token" /><br/>
      <sub><b>QR Provisioning</b><br/>Dynamic table identifiers</sub>
    </td>
  </tr>
</table>

<img src="./assets/dividers/orange-glow-line.svg" width="100%" height="8" alt="divider" />

## 🔒 Security & Data Integrity

* 🛡️ **Zero Price Tampering**: Client devices never dictate prices, tax rates, or bill totals. All orders and line items undergo rigorous recalculation on the authoritative backend.
* 🔐 **Cryptographic Presence Verification**: Dynamic QR tokens require physical table proximity verification before sessions can be established.
* 🏢 **Multi-Tenant Isolation**: Complete isolation guarantees that restaurant menus, orders, tables, and financial analytics remain strictly scoped to each tenant.
* 📜 **Tamper-Evident Audit Trails**: Critical actions such as item 86-ing, bill voids, order cancellations, and refunds are logged with timestamps and operator identity.

<img src="./assets/dividers/orange-glow-line.svg" width="100%" height="8" alt="divider" />

## 🗺️ Product Roadmap

- [x] **Zero-Install Customer Web (PWA)**: Sub-second mobile menu rendering and dietary filtering
- [x] **Kitchen Display System (KDS)**: Real-time ticket dispatch with stage progression
- [x] **Authoritative Billing & Invoicing**: Automated taxes, itemization, and paperless invoices
- [x] **Digital Payment Gateway**: Razorpay UPI and card settlement with signed webhook verification
- [x] **Floor & Table Management**: Dynamic table provisioning with bulk sticker and PDF export
- [x] **Analytics Dashboard**: Operational metrics, peak hour analysis, and sales turnover
- [ ] **Offline Kitchen Resilience**: Local network queueing for intermittent internet connectivity
- [ ] **Multi-Language Diner Localization**: Seamless language switching across regional languages
- [ ] **Live Inventory Depletion**: Automated stock decrementing mapped to ingredient recipes
- [ ] **Direct Customer Feedback Loop**: Post-meal rating collection and guest loyalty incentives

<img src="./assets/dividers/orange-glow-line.svg" width="100%" height="8" alt="divider" />

## 📈 Project Status

| Area | Status | Channel |
| :--- | :--- | :--- |
| **Customer Web App** | <img src="./assets/approved.svg" width="16" /> Production Ready | Mobile Browsers (Zero-Install) |
| **Kitchen Display (KDS)** | <img src="./assets/approved.svg" width="16" /> Production Ready | Tablets & Web Displays |
| **Cashier & Billing Desk** | <img src="./assets/approved.svg" width="16" /> Production Ready | Desktop & POS Tablets |
| **Management Dashboard** | <img src="./assets/approved.svg" width="16" /> Production Ready | Web & Native Mobile |
| **Core API Services** | <img src="./assets/approved.svg" width="16" /> Production Ready | Cloud ASGI Engine |

<img src="./assets/dividers/orange-glow-line.svg" width="100%" height="8" alt="divider" />

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for complete terms.

<br/>

<div align="center">
  <img src="./assets/logo.png" width="64" height="64" alt="FODQ Logo" /><br/>
  <b>FODQ Technologies</b><br/>
  <sub>Transforming Hospitality Operations • Scan. Order. Dine.</sub>
</div>
