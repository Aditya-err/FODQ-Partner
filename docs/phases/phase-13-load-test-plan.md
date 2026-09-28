# Phase 13 Load & Stress Test Plan

## Objective
To identify the throughput, latency, concurrency limits, database contention, and overall system behavior of the FODQ backend architecture under realistic restaurant SaaS workloads. The goal is to produce verifiable evidence of bottlenecks rather than claiming arbitrary performance metrics.

## Scope of Testing
- **Services**: Backend API (FastAPI) and PostgreSQL/Redis instances via Docker Compose.
- **Frontend apps (Admin/Customer/Kitchen)** are excluded from direct load testing to isolate backend performance.

> [!WARNING] 
> **Live Integrations Disabled**: Razorpay transactions must be completely mocked or routed to sandbox endpoints to prevent actual financial mutation. The `fodq_load_test` database should be used strictly to isolate data.

## Test Environment & Baseline
- **Database**: PostgreSQL 15 (Alpine)
- **Cache / PubSub**: Redis 7 (Alpine)
- **Backend Framework**: Python / FastAPI
- **Backend Concurrency**: Default 1 worker per container (unless testing horizontal scaling).
- **Tooling**: [Locust](https://locust.io/) (Reproducible Python-based HTTP & WebSocket load generation).

## Test Data Isolation Strategy
- A dedicated `fodq_load_test` database will be initialized.
- Seeded with test restaurants, static tables, and mock customers.
- Database reset between distinct scenario blocks to ensure a clean state and prevent uncontrolled unbounded table growth.

---

## Load Scenarios

### Scenario A: QR & Session Creation (Concurrency & Locking)
- **Goal**: Validate `SELECT FOR UPDATE` and active-session protection on the same table.
- **Load Profile**: 10, 25, 50, and 100 concurrent requests scanning the *same* table QR.
- **Expected Outcome**: Only one active `DineSession` is maintained; duplicates are safely rejected or re-routed without 500 errors or deadlocks.

### Scenario B: Menu Read Load
- **Goal**: Measure raw read throughput and caching efficacy.
- **Load Profile**: 25, 50, 100, 250, and 500 concurrent users requesting `/api/v1/dine/menu/`.
- **Metrics**: RPS, median latency, p95/p99 latency, DB connection saturation.

### Scenario C: Order Creation (Idempotency & Correctness)
- **Goal**: Ensure idempotency works under pressure.
- **Load Profile**: 10, 25, 50, 100, and 250 concurrent users submitting orders.
- **Variables**: Identical payloads with same Idempotency-Key; identical payloads with different keys; different payloads with same key.
- **Expected Outcome**: No duplicate financial or order records.

### Scenario D: KDS & Order Status Transitions
- **Goal**: Verify row locking and WebSockets.
- **Load Profile**: Concurrent order state polling and PATCH updates.
- **Expected Outcome**: No lost updates during rapid state progression (`PENDING` -> `ACCEPTED` -> `PREPARING` -> `READY` -> `SERVED`).

### Scenario E: WebSocket Connection Load
- **Goal**: Assess Pub/Sub and WebSocket connection limits.
- **Load Profile**: 10, 25, 50, 100 connections.
- **Expected Outcome**: Connection success rate, proper routing of messages by tenant, bounded memory usage.

### Scenario F & G: Billing & Payment Initiation
- **Goal**: Test concurrent billing requests and active-payment constraints.
- **Load Profile**: 10, 25, 50, 100 concurrent requests for `request_bill` and payment initiation on the *same* session.
- **Expected Outcome**: Unique `Bill.session_id` constraint holds. Concurrent payment initiations return HTTP 409 (Conflict).

### Scenario H: Mixed Restaurant Workload (Realistic)
- **Goal**: Simulate an active platform.
- **Load Profile**: 10 restaurants × 10 active tables × 2-4 concurrent users/table.
- **Mix**: Menu reads (50%), QR requests (10%), Order creation (20%), Order tracking (15%), Billing (5%).

---

## Observability & Metrics
- **PostgreSQL**: Active/Waiting connections, transaction durations, row locks, CPU/RAM.
- **Redis**: Command rate, latency, memory.
- **FastAPI**: Requests/sec (RPS), p95/p99 latency, HTTP 4xx/5xx ratios.
- **Locust Output**: A comprehensive report of total requests, failures, and latency percentiles.

## Safety Limits & Success Criteria

> [!IMPORTANT]
> Rate limits (e.g., 429 Too Many Requests) are considered expected safety nets, **not failures**. Rate limiting will remain enabled.

- **Critical Failures** (Requires Immediate Fix): Data corruption, duplicate active sessions, deadlocks, cross-tenant data leaks, uncontrolled memory growth, or persistent HTTP 5xx.
- **Warnings** (Documented Bottlenecks): Exhausted DB connection pools, resource ceiling hit, severe p99 latency spikes.

## Review & Next Steps
Please review this Load Test Plan. Upon approval, I will create the `locust` directory structure, seed the test data environment, and execute the scenarios step-by-step.
