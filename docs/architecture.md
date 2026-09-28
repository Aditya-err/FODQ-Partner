# FODQ — System Architecture

## 1. Overview

FODQ is a multi-tenant SaaS platform for restaurant digital ordering and operations management. It enables customers to scan a QR code at their table, browse a digital menu, place orders, and track their status in real time. Restaurant owners and staff manage menus, tables, kitchen workflows, billing, and analytics through dedicated interfaces.

---

## 2. High-Level Deployment Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT TIER                                │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Customer Web │  │ Kitchen Web  │  │  Admin Web   │              │
│  │ (Next.js)    │  │ (Next.js)    │  │  (Next.js)   │              │
│  │ Mobile-First │  │ Tablet-Opt.  │  │  Desktop     │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                 │                       │
│  ┌──────────────┐                                                   │
│  │ Owner App    │  (Flutter — Phase 7+)                             │
│  └──────┬───────┘                                                   │
└─────────┼─────────────────┼─────────────────┼───────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        API GATEWAY / BACKEND                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    FastAPI Application                       │    │
│  │                                                             │    │
│  │  ┌───────────┐  ┌────────────┐  ┌────────────────────┐     │    │
│  │  │ REST API  │  │ WebSocket  │  │ Background Workers │     │    │
│  │  │ Endpoints │  │ Channels   │  │ (if needed)        │     │    │
│  │  └─────┬─────┘  └─────┬──────┘  └────────┬───────────┘     │    │
│  │        │               │                  │                 │    │
│  │  ┌─────▼───────────────▼──────────────────▼─────────────┐   │    │
│  │  │              Application / Service Layer              │   │    │
│  │  │  (Business logic, validation, orchestration)          │   │    │
│  │  └──────────────────────┬────────────────────────────────┘   │    │
│  │                         │                                    │    │
│  │  ┌──────────────────────▼────────────────────────────────┐   │    │
│  │  │              Repository / Data Access Layer            │   │    │
│  │  └──────────────────────┬────────────────────────────────┘   │    │
│  └─────────────────────────┼────────────────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────────┐
│                       DATA / INFRA TIER                              │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐      │
│  │ PostgreSQL   │  │    Redis     │  │  Object Storage      │      │
│  │ (Primary DB) │  │ (Cache/RT)   │  │  (Images)            │      │
│  └──────────────┘  └──────────────┘  └──────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Backend Module Structure

The FastAPI backend is organized into domain-driven modules. Each module contains its own routes, schemas, services, and repository.

```text
services/backend/
├── app/
│   ├── main.py                    # FastAPI app factory, startup/shutdown
│   ├── config.py                  # Environment-based configuration
│   ├── database.py                # SQLAlchemy engine, session factory
│   │
│   ├── core/                      # Cross-cutting concerns
│   │   ├── security.py            # Password hashing, JWT, token utils
│   │   ├── dependencies.py        # Shared FastAPI dependencies
│   │   ├── middleware.py          # CORS, rate limiting, security headers
│   │   ├── exceptions.py         # Custom exception classes
│   │   ├── responses.py          # Standard API response envelope
│   │   └── logging.py            # Structured logging setup
│   │
│   ├── auth/                      # Authentication module
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   ├── repository.py
│   │   └── models.py
│   │
│   ├── restaurants/               # Restaurant management module
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   ├── repository.py
│   │   └── models.py
│   │
│   ├── tables/                    # Table & QR management
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   ├── repository.py
│   │   └── models.py
│   │
│   ├── sessions/                  # Dining sessions
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   ├── repository.py
│   │   └── models.py
│   │
│   ├── menu/                      # Categories & menu items
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   ├── repository.py
│   │   └── models.py
│   │
│   ├── orders/                    # Order lifecycle
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   ├── repository.py
│   │   ├── models.py
│   │   └── state_machine.py
│   │
│   ├── billing/                   # Bills & payments
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   ├── repository.py
│   │   ├── models.py
│   │   └── payment_provider.py   # Payment abstraction interface
│   │
│   ├── reviews/                   # Ratings & reviews
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   ├── repository.py
│   │   └── models.py
│   │
│   ├── staff/                     # Staff & RBAC
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   ├── repository.py
│   │   └── models.py
│   │
│   ├── analytics/                 # Reporting & analytics
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   └── repository.py
│   │
│   ├── audit/                     # Audit logging
│   │   ├── service.py
│   │   ├── models.py
│   │   └── repository.py
│   │
│   ├── admin/                     # Platform super-admin
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   └── repository.py
│   │
│   └── realtime/                  # WebSocket manager
│       ├── manager.py
│       └── events.py
│
├── migrations/                    # Alembic migrations
│   ├── env.py
│   └── versions/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── security/
│
├── alembic.ini
├── pyproject.toml
├── requirements.txt
└── .env.example
```

---

## 4. Technology Stack Summary

| Layer              | Technology                              | Purpose                                    |
|--------------------|----------------------------------------|---------------------------------------------|
| Customer Web       | Next.js, TypeScript, Tailwind, shadcn/ui | Mobile-first QR ordering                   |
| Kitchen Web        | Next.js, TypeScript, Tailwind, shadcn/ui | Tablet-optimized kitchen display            |
| Admin Web          | Next.js, TypeScript, Tailwind, shadcn/ui | Platform super-admin dashboard             |
| Owner App          | Flutter (Dart)                          | Mobile management (Phase 7+)               |
| Backend API        | Python 3.12+, FastAPI, Pydantic v2      | REST API + WebSocket                        |
| ORM                | SQLAlchemy 2.x                          | Database abstraction                        |
| Migrations         | Alembic                                 | Schema versioning                           |
| Database           | PostgreSQL 16+                          | Primary data store (multi-tenant)           |
| Cache / Realtime   | Redis 7+                                | Rate limiting, caching, pub/sub             |
| Image Storage      | Cloudinary or S3-compatible             | Food images, logos                          |
| Auth               | JWT (access + refresh tokens)           | Owner/staff authentication                  |
| Containerization   | Docker, Docker Compose                  | Local development environment               |
| Package Management | pnpm (JS/TS), pip/uv (Python)           | Dependency management                       |

---

## 5. Architecture Decision Records (ADRs)

### ADR-001: PostgreSQL as Primary Database
**Decision:** Use PostgreSQL for all persistent application data.
**Rationale:** PostgreSQL provides robust ACID transactions, NUMERIC type for exact monetary calculations, rich indexing, JSON support for flexible metadata, and excellent tooling. It is battle-tested for SaaS multi-tenant workloads.

### ADR-002: Shared-Schema Multi-Tenancy
**Decision:** Use a shared-schema approach where all restaurants share the same database tables, with `restaurant_id` as the tenant discriminator.
**Rationale:** At MVP scale (tens to low hundreds of restaurants), per-tenant databases/schemas add operational complexity without benefit. A shared schema with proper indexing and authorization is simpler and sufficient. If scale demands it, sharding can be introduced later.

### ADR-003: FastAPI for Backend
**Decision:** Use Python FastAPI for the backend service.
**Rationale:** FastAPI provides automatic OpenAPI documentation, Pydantic-based validation, async support, dependency injection, and WebSocket support. It is well-suited for building a validated, documented REST API quickly.

### ADR-004: Flutter Owner App — Delayed
**Decision:** Defer Flutter development until backend, customer web, and core business logic are stable (Phase 7+).
**Rationale:** Building and debugging across web and mobile simultaneously adds significant complexity. The owner can use a web dashboard initially. Flutter connects to the same production APIs once they are stable.

### ADR-005: pnpm Monorepo
**Decision:** Use pnpm workspaces for JavaScript/TypeScript apps; keep Python backend independent within the same repo.
**Rationale:** pnpm is faster and more disk-efficient than npm. Shared packages (UI, types, config) benefit from workspace linking. The Python backend does not need to participate in the JS workspace system.

### ADR-006: Server-Side Pricing (Exact Arithmetic)
**Decision:** All pricing, tax, discount, and bill calculations happen exclusively on the backend using PostgreSQL NUMERIC (precision 10, scale 2).
**Rationale:** Floating-point arithmetic is unsuitable for financial calculations. The frontend sends only item IDs and quantities; the backend retrieves authoritative prices from the database and computes totals. This prevents client-side price manipulation and rounding errors.

### ADR-007: Idempotent Order & Payment Creation
**Decision:** Order creation and payment confirmation will use client-generated idempotency keys.
**Rationale:** Network retries, double-clicks, and mobile connectivity issues can cause duplicate requests. An idempotency key allows the backend to return the original response without creating duplicate orders or payment state transitions. This is mandatory for production reliability.

### ADR-008: JWT with Refresh Tokens for Staff Auth
**Decision:** Use short-lived JWT access tokens (15 min) with long-lived refresh tokens (7 days) stored server-side.
**Rationale:** JWTs allow stateless request authentication for the common case. Refresh tokens stored in the database enable server-side revocation, session management, and logout-from-all-devices functionality.

### ADR-009: Session-Based Customer Identity
**Decision:** Customers are identified by dining session tokens, not user accounts.
**Rationale:** Restaurant customers expect a frictionless experience — scan QR, browse menu, order. Forcing account creation adds friction. The dining session (tied to a specific restaurant + table + time window) provides sufficient identity for ordering, tracking, and billing within a single visit.
