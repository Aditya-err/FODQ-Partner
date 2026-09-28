# Phase 3 Plan: Digital Menu

## A. Current Codebase Assessment
**Existing Backend:**
- `MenuCategory` and `MenuItem` models exist with basic fields (`name`, `description`, `price`, `is_available`, `image_url`, `sort_order`, `prep_time_minutes`, `is_veg`).
- Basic `menu_owner.py` API has `POST/GET` for categories and `POST/PATCH` for items.
- Basic `menu_customer.py` API fetches the menu but filters out unavailable items.
- Tenant isolation (`restaurant_id`) is structurally present in the models.

**Gaps to Address in Phase 3:**
- Missing complete CRUD for categories (e.g., DELETE, PUT).
- Missing full item CRUD (e.g., DELETE).
- Missing image upload/storage logic.
- Missing item options/customization models.
- Missing robust admin UI for menu management (drag-and-drop sorting, option builders).
- Customer frontend lacks the complete visual menu rendering based on the new Phase 2 session.

## B. Database Model Design
To support item customization without over-engineering, we will add two new models to the `Menu` domain:

1. **`MenuItemOptionGroup`**
   - `id`: UUID (Primary Key)
   - `item_id`: UUID (Foreign Key to `menu_items.id`)
   - `name`: String (e.g., "Size", "Add-ons", "Crust Type")
   - `min_selections`: Integer (Default 0, 1 for required)
   - `max_selections`: Integer (Default 1, >1 for multi-select)
   - `sort_order`: Integer

2. **`MenuItemOption`**
   - `id`: UUID (Primary Key)
   - `group_id`: UUID (Foreign Key to `menu_item_option_groups.id`)
   - `name`: String (e.g., "Large", "Extra Cheese")
   - `price_adjustment`: Integer (Minor units/cents, e.g., +50)
   - `is_available`: Boolean (Default True)
   - `sort_order`: Integer

*Existing `MenuCategory` and `MenuItem` models remain largely identical but will gain cascading relationships to the new option tables.*

## C. Relationships
- **Restaurant** (1) ➔ (N) **MenuCategory**
- **MenuCategory** (1) ➔ (N) **MenuItem**
- **MenuItem** (1) ➔ (N) **MenuItemOptionGroup**
- **MenuItemOptionGroup** (1) ➔ (N) **MenuItemOption**

All relationships will use `ondelete="CASCADE"` at the database level and `cascade="all, delete-orphan"` at the ORM level to ensure no orphaned records when an item or category is deleted. 

**Architectural Note for Future Orders (Phase 4):**
Future Phase 4 order records must snapshot the purchased item name, price, and selected option information rather than depend on mutable `MenuItem`/`MenuItemOption` rows. This ensures that deleting a category/item/option in Phase 3 does not break historical Phase 4 orders. Do NOT implement order snapshots now.

## D. API Design
**Admin API (`/api/v1/owner/menu`)**:
- `GET /categories`, `POST /categories`, `PUT /categories/{id}`, `DELETE /categories/{id}`
- `GET /items`, `POST /items`, `PUT /items/{id}`, `DELETE /items/{id}`
- `POST /items/{id}/image` (Multipart/form-data upload)
- `POST /items/{id}/options` (Batch create/update option groups and options)

**Customer API (`/api/v1/dine/menu`)**:
- `GET /` (Read-only. Returns the entire menu nested hierarchy: Categories ➔ Items ➔ Option Groups ➔ Options).

## E. Restaurant/Admin Permissions
- All admin endpoints will require the `manage_menu` RBAC permission.
- Enforced via the existing `require_permissions(["manage_menu"])` dependency.

## F. Tenant Isolation
- **Strict enforcement:** Every single `POST`, `PUT`, `DELETE` query will append `restaurant_id == tenant.id`.
- For deeply nested updates (like an Option), validation will traverse up to the `MenuItem` to ensure it belongs to the authenticated `tenant.id`.

## G. Customer Menu Security
The customer menu must securely derive its context entirely from the server. The customer must **NEVER** supply `restaurant_id` as an authority or context selector.

**Explicit Flow:**
1. Phase 2 QR scan/session
   ↓
2. Authenticated/validated `DineSession`
   ↓
3. Restaurant context derived server-side
   ↓
4. Customer Menu API
   ↓
5. Restaurant ➔ Categories ➔ Items ➔ Options

Do not allow the customer menu endpoint to bypass:
- Phase 2 QR validation
- Dining session validation
- Restaurant network/IP validation
- Tenant isolation

## H. Option Validation
Define strict validation rules for item options:
- `0 <= min_selections <= max_selections`
- `max_selections >= 1`
- Prevent impossible configurations where appropriate.
- **Hard Limits:** Maximum 10 option groups per item, and maximum 20 options per group.

*Note: Phase 3 only needs to display/view options. Do NOT implement cart/order selection persistence yet.*

## I. Pricing Integrity
Explicitly maintain:
- Integer minor units only (e.g., cents/paise).
- No floating-point data types.
- Non-negative prices (`>= 0`).
- Strict server-side validation.
- Customer API derives price solely from the database.
- Frontend only formats prices for display; it never defines the price.

## J. Image Storage & Security Architecture
**Phase 3 Approach:** Local Disk Storage with strict validation.
- Images will be uploaded as `multipart/form-data` to `backend/uploads/menu_images/`.
- Served by FastAPI `StaticFiles` at `/static/menu_images/{filename}`.
- Design the storage abstraction so future object-storage/CDN migration is possible without changing the `MenuItem` domain model.

**Strict Image Security Requirements:**
- Maximum file size: 5 MB.
- Allowed formats: JPEG, PNG, WebP only.
- Strict MIME validation AND file-signature/magic-byte validation.
- Reject SVG.
- Reject executable/disallowed formats.
- Never trust the client filename.
- Generate a random filename (e.g., `uuid4().hex`).
- Path traversal prevention.
- Safe static serving.
- Corrupted/non-image payload rejection.
- Explicit cleanup/unlinking of replaced or deleted image files.

## K. Availability Design
- The `is_available` boolean on `MenuItem` and `MenuItemOption` will determine if the customer can order it.
- **Phase 3 UX:** The Customer menu may display unavailable items with `is_available = false` (e.g., to render a "Sold Out" overlay). 
- **Informational Only:** Frontend availability is informational only. When Phase 4 ordering is implemented, the backend MUST re-check:
  - Item existence
  - Item availability
  - Option availability
  - Restaurant ownership
  - Current price
- The client can never be trusted for these values. *(Do not implement Phase 4 behavior now).*

## L. Preparation-Time Design
- `prep_time_minutes` will be exposed in the frontend UI to help customers gauge wait times before ordering.

## M. Display Ordering
- Categories, Items, and Options all contain a `sort_order` integer.
- The UI will support simple drag-and-drop ordering, sending an array of `[id, new_sort_order]` back to the server in a batch update to re-index the list.

## N. Admin Frontend
- **Menu Builder UI:** A unified interface showing categories on a sidebar and items in a main panel.
- Modals for adding/editing items, including a drag-and-drop image upload zone.
- An "Options Builder" modal allowing dynamic addition of option groups (e.g., "Size") and choices (e.g., "Large +$2.00").

## O. Customer Frontend Scope
- Digital Menu view (mobile-first layout).
- Sticky category navigation (e.g., tap "Drinks" to jump down).
- Beautiful item cards displaying the image, name, description, price, and a "Sold Out" overlay if unavailable.
- Clicking an item opens a bottom-sheet/modal showing the options. *(Selecting options will not add to a cart yet, as Cart is Phase 4, but the UI component to view options will be built).*

## P. Tests
- **Category & Item CRUD:** Ensure creation, updates, and cascading deletes work.
- **Tenant Isolation:** Ensure Tenant A cannot modify Tenant B's menu or options.
- **IDOR/BOLA:** Ensure trying to upload an image to an item owned by another restaurant returns `404` or `403`.
- **Image Validation:** Reject `.exe`, `.svg`, corrupted payloads, and oversized uploads.
- **Pricing & Options:** Test price validation (`>= 0`) and option constraints (`min <= max`, limits).
- **Customer API:** Ensure unauthorized access fails (no active session), and nested serialization is accurate.
- **Empty Menu & Sorting:** Verify proper handling of empty menus and `sort_order` sequences.

## Q. Alembic Migration Strategy
- Create table `menu_item_option_groups`.
- Create table `menu_item_options`.
- Add foreign keys, indexes on `item_id` and `group_id`.

## R. Implementation Order
1. **Backend Database:** Alembic migration for options tables.
2. **Backend Services:** Image upload utility (security validation + saving).
3. **Backend Admin API:** Flesh out Owner Menu CRUD and options batch saving.
4. **Backend Customer API:** Implement nested eager-loading for the menu read endpoint and Session validation.
5. **Backend Tests:** Write and verify pytest suite for Phase 3 logic.
6. **Admin Frontend:** Build the Menu Management UI.
7. **Customer Frontend:** Build the Digital Menu viewer.

## S. Explicit OUT OF SCOPE List
- Cart
- Order creation
- Order management
- KDS (Kitchen Display System)
- Payments
- Delivery
- Offline ordering
- Analytics
- Loyalty
- POS (Point of Sale integration)
- AI recommendations

---
PHASE 3 PLAN STATUS: READY FOR IMPLEMENTATION
