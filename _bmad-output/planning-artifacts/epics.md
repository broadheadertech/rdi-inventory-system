---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
---

# redbox-apparel - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for redbox-apparel, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**User Management & Access Control**
- FR1: Admin can create, edit, and deactivate user accounts
- FR2: Admin can assign roles to users (Admin, Manager, Cashier, Warehouse Staff, HQ Staff, Viewer)
- FR3: Admin can assign users to specific branches
- FR4: Users can authenticate via email/password with secure session management
- FR5: Users can only access data for their assigned branch (branch-scoped isolation)
- FR6: HQ Staff and Admin can view data across all branches
- FR7: Admin can create and configure new branches in the system

**Product Catalog & Brand Management**
- FR8: Admin/HQ Staff can manage brands (create, edit, deactivate)
- FR9: Admin/HQ Staff can manage product categories (Shoes, Apparel, Accessories)
- FR10: Admin/HQ Staff can manage product styles/models within a brand and category
- FR11: Admin/HQ Staff can manage product variants (size, color, gender) per style
- FR12: Admin/HQ Staff can assign a unique SKU and barcode to each product variant
- FR13: Admin/HQ Staff can navigate and manage the Brand -> Category -> Style/Model -> Variant hierarchy
- FR14: Admin/HQ Staff can set and update pricing per product variant

**Point of Sale (POS)**
- FR15: Cashier can scan product barcodes to add items to a transaction
- FR16: Cashier can manually search and add products to a transaction
- FR17: POS automatically calculates VAT (12%) on all taxable items
- FR18: Cashier can apply Senior Citizen/PWD discount (20% with VAT exemption) with one action
- FR19: POS correctly computes Senior/PWD discount by removing VAT first, then applying 20% off the base price
- FR20: Cashier can select payment method (Cash, GCash, Maya) for each transaction
- FR21: POS generates BIR-compliant receipts with all required fields (business name, TIN, branch address, date/time, itemized breakdown, VAT line, discount line, total, receipt number)
- FR22: Cashier can continue processing transactions during internet outages (offline mode)
- FR23: POS stores offline transactions locally and automatically syncs when connectivity returns
- FR24: POS guarantees zero data loss for offline transactions
- FR25: Cashier can perform end-of-day cash reconciliation (system total vs physical count)

**Inventory Management**
- FR26: Staff can view a unified real-time inventory pool across all branches
- FR27: Inventory updates at any branch propagate to all connected branches in real-time
- FR28: Admin/HQ Staff can set low-stock alert thresholds per product per branch
- FR29: Branch Manager/HQ Staff receive low-stock alerts when inventory falls below configured thresholds
- FR30: Staff can view current stock levels for their branch
- FR31: Staff can view stock levels at other branches (read-only cross-branch lookup)

**Stock Transfers & Warehouse**
- FR32: Branch Manager/HQ Staff can initiate stock transfer requests
- FR33: Warehouse Staff can view and manage pending transfer requests
- FR34: Warehouse Staff can scan barcodes to pack transfer orders and confirm quantities
- FR35: Staff can track transfer status through workflow stages (Requested -> Packed -> In Transit -> Delivered)
- FR36: Receiving branch can confirm delivery by scanning transferred items
- FR37: Receiving branch staff can flag damaged/missing items during partial delivery handling
- FR38: Staff can view a complete audit trail for every transfer (who, what, when at each stage)

**Dashboards & Reporting**
- FR39: HQ Staff can view an all-branch overview dashboard (stock levels, daily sales, alerts)
- FR40: Branch Manager can view a branch-specific dashboard (stock, sales, performance)
- FR41: Branch Manager/HQ Staff can view daily sales summaries per branch
- FR42: Owner/Admin can view branch-level financial and operational reports
- FR43: HQ Staff/Admin can generate monthly/quarterly VAT summary data for BIR filing
- FR44: HQ Staff can view sales data by brand across branches

**Demand Intelligence (Phase 2)**
- FR45: Cashier/Branch Manager can log customer demand entries (brand, design, size, notes)
- FR46: Cashier/Branch Manager can complete a demand log entry within 30 seconds
- FR47: HQ Staff can view and review all demand log entries across branches
- FR48: HQ Staff can view top-requested items/brands across branches (weekly summary)

**Customer Website (Phase 4)**
- FR49: Customers can browse products by brand, category, and style
- FR50: Customers can view real-time stock availability per branch for any product
- FR51: Customers can locate branches on a branch finder
- FR52: Customers can reserve a product for in-store pickup (name + phone, no upfront payment)
- FR53: Branch staff can view and fulfill pending reservations
- FR54: Branch staff receive notification when a reservation expires unfulfilled after 24 hours

**Logistics (Phase 5)**
- FR55: Driver can view assigned deliveries with digital manifests on mobile
- FR56: HQ Staff can assign deliveries to drivers and track delivery routes
- FR57: Driver/Branch can confirm delivery receipt with barcode scanning

**AI Intelligence (Phase 6)**
- FR58: HQ Staff can view AI-generated restock suggestions based on >=14 days of sales history, showing recommended SKU, quantity, and target branch
- FR59: Owner/Admin can view branch performance scores calculated from sales volume, stock accuracy, and fulfillment speed metrics
- FR60: HQ Staff can view weekly demand pattern reports surfacing top 10 trending requests aggregated from cashier demand logs

**Ecosystem (Phase 7)**
- FR61: Suppliers can view demand signals for their brands across branches
- FR62: Suppliers can submit stock proposals to the owner

### NonFunctional Requirements

**Performance**
- NFR1: POS transaction completion (scan to receipt) <3 seconds
- NFR2: POS barcode scan to price display <500ms
- NFR3: Real-time stock update propagation <1 second across all online branches
- NFR4: HQ Dashboard initial load <2 seconds
- NFR5: Customer website First Contentful Paint <1 second
- NFR6: Customer website Largest Contentful Paint <2 seconds
- NFR7: Offline transaction local storage <200ms per transaction
- NFR8: Offline-to-online sync completion <30 seconds for queued transactions
- NFR9: Demand log entry creation <30 seconds end-to-end

**Security**
- NFR10: All sessions managed via Clerk; 100% of API endpoints require valid auth token; zero unauthenticated access to financial data
- NFR11: 100% of queries filtered by branch scope at API layer; verified by automated test suite
- NFR12: Role permissions enforced server-side on 100% of API requests; zero UI-only permission checks
- NFR13: TLS 1.2+ (HTTPS) for all data in transit; AES-256 encryption at rest for transaction and payment data
- NFR14: Locally stored offline transactions encrypted using AES-256 on device; data wiped after successful sync
- NFR15: Sessions expire after 30 minutes of inactivity; force re-login on role change; session invalidation within 5 seconds
- NFR16: 100% of financial transactions and stock transfers logged with immutable timestamps and user IDs; logs retained for 5 years

**Scalability**
- NFR17: System supports up to 20 branches without architectural changes
- NFR18: Support 2-3 POS terminals per branch simultaneously
- NFR19: System handles 3-5x normal transaction volume during paydays/holidays
- NFR20: Support up to 10,000 product variants across all brands
- NFR21: System retains at least 3 years of transaction history for reporting

**Reliability**
- NFR22: POS must function during internet outages (offline mode)
- NFR23: Every completed transaction, online or offline, must be persisted and eventually synced (zero data loss)
- NFR24: System detects and handles conflicts when offline data syncs (last-write-wins or flag for HQ review)
- NFR25: 99.5% uptime during business hours (8 AM - 10 PM PHT)
- NFR26: Convex handles data persistence and backup natively

**Accessibility**
- NFR27: Customer website WCAG 2.1 AA compliance
- NFR28: POS terminal high contrast, large touch targets (min 44px), clear visual hierarchy
- NFR29: Internal dashboards keyboard navigable, best-effort accessibility

**Integration**
- NFR30: Stable integration with Clerk for all auth flows
- NFR31: All data operations via Convex; real-time subscriptions for live updates
- NFR32: html5-qrcode integration for POS and warehouse scanning
- NFR33: @react-pdf/renderer for BIR-compliant PDF receipts
- NFR34: Architecture supports adding PayMongo for online payments in Phase 4+

### Additional Requirements

**From Architecture:**
- Starter template: `npm create convex@latest -t nextjs-clerk-shadcn` — must be first implementation story
- Additional Phase 1 dependencies: @react-pdf/renderer, html5-qrcode, recharts, resend
- Convex schema design: flat tables with ID references, single schema.ts, camelCase naming
- Product hierarchy: brands -> categories -> styles -> variants (4-level)
- Money stored in centavos (integer) to avoid floating-point errors; dates as Unix timestamp ms
- Branch-scoping pattern: `withBranchScope(ctx)` helper wraps every Convex query/mutation
- Clerk webhook sync for user data (Clerk -> Convex user sync), role in publicMetadata
- Role-change session invalidation: compare Convex role vs session token, throw SESSION_STALE on mismatch
- 9 route groups: (auth), (pos), (hq), (branch), (warehouse), (customer), (admin), (driver), (supplier)
- Each route group has isolated layout, middleware, error boundary, and subscription scope
- Convex function naming: get* (queries), verb* (mutations), send* (actions), _* (internal)
- Errors via ConvexError with typed codes: INSUFFICIENT_STOCK, INVALID_DISCOUNT, TRANSFER_CONFLICT, etc.
- Offline POS: custom service worker for (pos)/ routes only, IndexedDB stores (transactionQueue, offlineCart, stockSnapshot)
- AES-256 encryption via Web Crypto API on all offline stored data
- Scheduled functions: expireReservations (hourly), generateDemandSummary (weekly), checkLowStockAlerts (event-driven + hourly fallback)
- Bulk import: Convex action pattern, max 500 items per batch, CSV upload UI in admin
- Product images via Convex file storage (upload URL generation, storageId reference on variants)
- PWA manifest for POS installability (standalone mode, start_url: /pos)
- Audit trail: immutable logs via _logAuditEntry() helper, 5-year retention
- Monitoring: Vercel Analytics + Convex dashboard; defer Sentry to post-MVP
- CI/CD: Vercel auto-deploy from main, GitHub CI for lint + type check on PR
- No additional state library (no Zustand/Redux); server state via Convex, local UI state via React Context
- Philippine tax: VAT calculations centralized in convex/_helpers/taxCalculations.ts
- Implementation sequence mandated: init -> schema -> auth+RBAC -> route groups -> features -> offline -> customer -> AI

**From UX Design:**
- 12 custom components: POSCartPanel, POSProductGrid, ProductCard, BranchStockDisplay, StatusPill, MetricCard, AttentionItem, BranchCard, DemandLogEntry, TransferCard, ScanConfirmation, ConnectionIndicator
- Component architecture: ui/ (shadcn primitives) -> shared/ (cross-interface business) -> app/(group)/components/ (interface-specific)
- White-label theming: CSS custom properties stored in Convex settings, HQ-configurable brand colors/logo/favicon/name
- Multi-theme CSS: interface-specific overrides (theme-pos.css, theme-dashboard.css, theme-customer.css, etc.)
- Auto-generated brand color variants (hover, active, light tint) with runtime WCAG contrast checking
- Device-first responsive: POS tablet-first, Dashboard desktop-first, Customer mobile-first, Warehouse phone-first, Driver phone-only
- WCAG 2.1 AA across all interfaces; triple encoding for status indicators (color + text + icon)
- Touch targets: POS 56px, Customer/Warehouse/Driver 44px, Dashboard 36px
- Respect prefers-reduced-motion globally
- Interaction patterns: scan-to-action, one-tap actions, card-based queues, progressive disclosure
- Button hierarchy: one primary action per screen, destructive requires 2-step confirmation
- Toast rules: success auto-dismiss 3s, error persists, max 3 stacked, top-right desktop / top-center mobile
- Form patterns: POS max 2 fields, Dashboard inline filters with chips, Customer progressive disclosure
- Navigation: POS flat tabs, Dashboard sidebar+breadcrumb, Customer bottom nav, Warehouse task-based, Driver single-task
- Loading: skeleton screens mimicking content layout; empty states with contextual messaging and CTAs
- Real-time updates: background pulse on changed data, no "data updated" toasts for live queries
- Modal rules: never stack, confirmation restates action, sheets right on desktop / bottom on mobile
- Data display: tables for comparison (dashboard), card grids for browsing (customer), lists for sequential items (POS cart)
- Testing: axe-core in CI, Playwright screenshot regression at breakpoints, BrowserStack per sprint, Philippine device testing
- Implementation phases: POS Core (Sprint 1-2) -> Dashboard (Sprint 3-4) -> Customer (Sprint 4-5) -> Fulfillment (Sprint 5-6)

### FR Coverage Map

- FR1: Epic 1 - Admin can create, edit, and deactivate user accounts
- FR2: Epic 1 - Admin can assign roles to users
- FR3: Epic 1 - Admin can assign users to specific branches
- FR4: Epic 1 - Users can authenticate via email/password
- FR5: Epic 1 - Users can only access data for their assigned branch
- FR6: Epic 1 - HQ Staff and Admin can view data across all branches
- FR7: Epic 1 - Admin can create and configure new branches
- FR8: Epic 2 - Admin/HQ Staff can manage brands
- FR9: Epic 2 - Admin/HQ Staff can manage product categories
- FR10: Epic 2 - Admin/HQ Staff can manage product styles/models
- FR11: Epic 2 - Admin/HQ Staff can manage product variants
- FR12: Epic 2 - Admin/HQ Staff can assign SKU and barcode to variants
- FR13: Epic 2 - Admin/HQ Staff can navigate Brand->Category->Style->Variant hierarchy
- FR14: Epic 2 - Admin/HQ Staff can set and update pricing per variant
- FR15: Epic 3 - Cashier can scan barcodes to add items to transaction
- FR16: Epic 3 - Cashier can manually search and add products
- FR17: Epic 3 - POS automatically calculates VAT (12%)
- FR18: Epic 3 - Cashier can apply Senior/PWD discount with one action
- FR19: Epic 3 - POS correctly computes Senior/PWD discount (VAT-exempt base)
- FR20: Epic 3 - Cashier can select payment method (Cash, GCash, Maya)
- FR21: Epic 3 - POS generates BIR-compliant receipts
- FR22: Epic 4 - Cashier can continue transactions during internet outages
- FR23: Epic 4 - POS stores offline transactions and auto-syncs on reconnect
- FR24: Epic 4 - POS guarantees zero data loss for offline transactions
- FR25: Epic 3 - Cashier can perform end-of-day cash reconciliation
- FR26: Epic 5 - Staff can view unified real-time inventory across all branches
- FR27: Epic 5 - Inventory updates propagate in real-time
- FR28: Epic 5 - Admin/HQ can set low-stock alert thresholds
- FR29: Epic 5 - Manager/HQ receive low-stock alerts
- FR30: Epic 5 - Staff can view current stock levels for their branch
- FR31: Epic 5 - Staff can view stock at other branches (cross-branch lookup)
- FR32: Epic 6 - Manager/HQ can initiate stock transfer requests
- FR33: Epic 6 - Warehouse Staff can view and manage pending transfers
- FR34: Epic 6 - Warehouse Staff can scan barcodes to pack transfer orders
- FR35: Epic 6 - Staff can track transfer status through workflow stages
- FR36: Epic 6 - Receiving branch can confirm delivery by scanning
- FR37: Epic 6 - Receiving branch can flag damaged/missing items
- FR38: Epic 6 - Staff can view complete audit trail for every transfer
- FR39: Epic 7 - HQ Staff can view all-branch overview dashboard
- FR40: Epic 7 - Branch Manager can view branch-specific dashboard
- FR41: Epic 7 - Manager/HQ can view daily sales summaries per branch
- FR42: Epic 7 - Owner/Admin can view branch-level reports
- FR43: Epic 7 - HQ/Admin can generate VAT summary data for BIR filing
- FR44: Epic 7 - HQ Staff can view sales data by brand across branches
- FR45: Epic 7 - Cashier/Manager can log customer demand entries
- FR46: Epic 7 - Demand log entry within 30 seconds
- FR47: Epic 7 - HQ Staff can view all demand entries across branches
- FR48: Epic 7 - HQ Staff can view top-requested items weekly summary
- FR49: Epic 8 - Customers can browse products by brand, category, style
- FR50: Epic 8 - Customers can view real-time stock per branch
- FR51: Epic 8 - Customers can locate branches on branch finder
- FR52: Epic 8 - Customers can reserve product for in-store pickup
- FR53: Epic 8 - Branch staff can view and fulfill pending reservations
- FR54: Epic 8 - Branch staff notified when reservation expires (24h)
- FR55: Epic 9 - Driver can view assigned deliveries with digital manifests
- FR56: Epic 9 - HQ Staff can assign deliveries to drivers
- FR57: Epic 9 - Driver/Branch can confirm delivery with barcode scanning
- FR58: Epic 9 - HQ can view AI-generated restock suggestions
- FR59: Epic 9 - Owner can view branch performance scores
- FR60: Epic 9 - HQ can view weekly demand pattern reports
- FR61: Epic 9 - Suppliers can view demand signals for their brands
- FR62: Epic 9 - Suppliers can submit stock proposals

## Epic List

### Epic 1: Project Foundation & Authentication
Users can sign in, be assigned roles, and access only their authorized branch/interface. Admins can manage users and branches.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7
**Implementation notes:** Starter template init (`npm create convex@latest -t nextjs-clerk-shadcn`), Convex schema design (all core tables), Clerk integration with webhook sync, `withBranchScope()` helper, 9 route group structure with layouts/middleware/error boundaries, role-based route protection, white-label theming foundation (CSS custom properties + Convex settings), shared UI primitives (StatusPill, ConnectionIndicator). This epic establishes all infrastructure that downstream epics depend on.

### Epic 2: Product Catalog & Brand Management
HQ Staff can manage the complete product hierarchy (Brand -> Category -> Style -> Variant) with SKUs, barcodes, pricing, and product images.
**FRs covered:** FR8, FR9, FR10, FR11, FR12, FR13, FR14
**Implementation notes:** Admin catalog UI in `(admin)/catalog/`, 4-level hierarchy CRUD, bulk CSV import (max 500 per batch), product image upload via Convex file storage, barcode generation/assignment. Standalone after Epic 1 — full catalog management operational.

### Epic 3: Point of Sale — Online Transactions
Cashiers can scan/search products, build transactions, apply VAT and Senior/PWD discounts, select payment method, generate BIR-compliant receipts, and perform end-of-day reconciliation.
**FRs covered:** FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR25
**Implementation notes:** POS UI (POSCartPanel, POSProductGrid, ScanConfirmation), html5-qrcode barcode scanning, VAT calculation helpers in `convex/_helpers/taxCalculations.ts`, Senior/PWD one-tap toggle (remove VAT then 20% off base), @react-pdf/renderer BIR receipts, payment method selection (Cash/GCash/Maya), cash drawer reconciliation. Online-only; offline comes in Epic 4.

### Epic 4: POS Offline Mode & Resilience
Cashiers can continue selling during internet outages with zero data loss; transactions automatically sync when connectivity returns.
**FRs covered:** FR22, FR23, FR24
**Implementation notes:** Custom service worker for `(pos)/` routes, IndexedDB stores (transactionQueue, offlineCart, stockSnapshot), AES-256 encryption via Web Crypto API, queue-based mutation replay on reconnect, ConnectionIndicator component, conflict resolution (last-write-wins + HQ review flag), PWA manifest for tablet installability.

### Epic 5: Inventory Management & Stock Visibility
Staff can view real-time unified stock across all branches; managers configure and receive low-stock alerts; POS cashiers can check other branches without leaving a transaction.
**FRs covered:** FR26, FR27, FR28, FR29, FR30, FR31
**Implementation notes:** BranchStockDisplay component (shared across POS + dashboard), real-time Convex subscriptions per branch scope, low-stock threshold configuration, alert generation (event-driven on stock mutation + hourly sweep fallback), cross-branch lookup accessible from POS inline (no modal, no navigation away).

### Epic 6: Stock Transfers & Warehouse Operations
Managers can request stock transfers, warehouse staff pack with barcode scanning, receiving branches confirm delivery, with complete audit trail at every stage.
**FRs covered:** FR32, FR33, FR34, FR35, FR36, FR37, FR38
**Implementation notes:** TransferCard component (full lifecycle: Requested->Packed->In Transit->Delivered), warehouse task-based UI, barcode scanning for pack/receive, partial delivery handling with damage/missing flagging, immutable audit log entries per stage, StatusPill progression visualization.

### Epic 7: Dashboards, Reporting & Demand Intelligence
HQ sees the Morning Command Center with all-branch overview and alerts; branch managers see their dashboard; cashiers log customer demand; HQ views demand trends and BIR VAT summaries.
**FRs covered:** FR39, FR40, FR41, FR42, FR43, FR44, FR45, FR46, FR47, FR48
**Implementation notes:** MetricCard, AttentionItem, BranchCard, DemandLogEntry components. HQ dashboard in `(hq)/`, branch dashboard in `(branch)/`. Recharts for analytics. BIR VAT summary reports. Brand-level sales data. Demand quick-log (<30s) with visual brand selector. Weekly demand summary via `generateDemandSummary` scheduled function.

### Epic 8: Customer Website & Reserve-for-Pickup
Customers can browse products by brand, view real-time branch stock, find branches, and reserve items for in-store pickup without payment.
**FRs covered:** FR49, FR50, FR51, FR52, FR53, FR54
**Implementation notes:** Customer mobile-first UI in `(customer)/`, ProductCard component, BranchStockDisplay customer variant with distance/map, branch finder, reservation flow (name + phone, no account required), 24-hour auto-expiry via `expireReservations` scheduled function, branch staff reservation management in `(branch)/reservations/`, SSR for customer pages (SEO).

### Epic 9: Logistics, AI Intelligence & Supplier Ecosystem
Drivers manage deliveries on mobile; AI generates restock suggestions, branch scores, and demand patterns; suppliers view demand signals and submit stock proposals.
**FRs covered:** FR55, FR56, FR57, FR58, FR59, FR60, FR61, FR62
**Implementation notes:** Driver single-task phone UI in `(driver)/`, delivery assignment and tracking in `(hq)/logistics/`, barcode delivery confirmation. AI module in `convex/ai/` (restock suggestions from 14-day history, branch performance scoring, weekly demand trends). Supplier portal in `(supplier)/` (read-only demand view + stock proposal submission). Later phases bundled as they build on all prior data.

---

## Epic 1: Project Foundation & Authentication

Users can sign in, be assigned roles, and access only their authorized branch/interface. Admins can manage users and branches.

### Story 1.1: Project Initialization & Core Schema

As a **developer**,
I want the project initialized with the Convex+Next.js+Clerk+shadcn starter template and core database schema defined,
So that all subsequent features have a working foundation to build upon.

**Acceptance Criteria:**

**Given** no existing project setup
**When** the starter template is initialized via `npm create convex@latest -t nextjs-clerk-shadcn`
**Then** the project runs locally with `next dev` and `npx convex dev`
**And** additional dependencies are installed (@react-pdf/renderer, html5-qrcode, recharts, resend)
**And** `convex/schema.ts` defines core tables: `users`, `branches`, `brands`, `categories`, `styles`, `variants`, `inventory`, `transactions`, `transactionItems`, `transfers`, `transferItems`, `demandLogs`, `auditLogs`
**And** all table fields use camelCase naming, money fields store centavos (integer), dates store Unix timestamp ms
**And** `lib/constants.ts` defines VAT_RATE, ROLES, TRANSFER_STATUS, PAYMENT_METHODS enums
**And** `lib/formatters.ts` provides currency (centavos->PHP) and date (Asia/Manila) formatting utilities
**And** `.env.example` template file is included in the repo

### Story 1.2: Authentication & User Management

As an **Admin**,
I want to manage user accounts and assign roles so team members can access the system,
So that each staff member has the appropriate access level for their job.

**Acceptance Criteria:**

**Given** the Clerk provider is configured and wrapping the Convex provider
**When** a new user signs up or is invited via Clerk
**Then** a Clerk webhook syncs the user to the Convex `users` table with role and branch assignment
**And** Clerk `publicMetadata` stores the user's role for fast client-side checks
**And** Admin can create, edit, and deactivate user accounts via `(admin)/users/` UI
**And** Admin can assign one of 6 roles (Admin, Manager, Cashier, Warehouse Staff, HQ Staff, Viewer) to any user
**And** Admin can assign a user to a specific branch
**And** role changes trigger session invalidation within 5 seconds (SESSION_STALE error on mismatch)
**And** sessions expire after 30 minutes of inactivity

### Story 1.3: Branch Management

As an **Admin**,
I want to create and configure branches in the system,
So that each physical store location is represented and staff can be assigned to it.

**Acceptance Criteria:**

**Given** an authenticated Admin user
**When** the Admin navigates to `(admin)/branches/`
**Then** they can create a new branch with name, address, and configuration
**And** they can edit existing branch details
**And** they can deactivate a branch (soft delete — no data loss)
**And** branches appear in the branch selector across all interfaces that need it
**And** newly created branches are immediately available for user assignment

### Story 1.4: Branch-Scoped Data Isolation & Role-Based Access

As a **branch staff member**,
I want to only see data for my assigned branch,
So that I'm not overwhelmed by irrelevant data and branch security is maintained.

**Acceptance Criteria:**

**Given** a user with a branch assignment (e.g., Cashier at Branch 1)
**When** they query any data via Convex functions
**Then** the `withBranchScope(ctx)` helper automatically filters all queries by their branch
**And** HQ Staff and Admin roles bypass the branch filter and access all branches
**And** branch-scoping is enforced server-side in every Convex query/mutation — impossible to bypass
**And** attempting to access data outside assigned branch returns UNAUTHORIZED error
**And** an automated test suite verifies branch isolation on all data endpoints

### Story 1.5: Route Group Structure & Interface Layouts

As a **user of any role**,
I want to land on my role-appropriate interface when I sign in,
So that I see only what's relevant to my job without navigating through unrelated features.

**Acceptance Criteria:**

**Given** 9 route groups exist: `(auth)`, `(pos)`, `(hq)`, `(branch)`, `(warehouse)`, `(customer)`, `(admin)`, `(driver)`, `(supplier)`
**When** a user signs in
**Then** Clerk middleware redirects unauthenticated users to `(auth)/sign-in`
**And** each route group has its own layout.tsx with interface-specific theme class (e.g., `theme-pos`, `theme-dashboard`)
**And** each route group has role-based middleware that checks authorization
**And** each route group has an error boundary wrapping children
**And** role-to-route mapping is enforced: Admin→all, HQ Staff→(hq), Manager→(branch), Cashier→(pos), Warehouse→(warehouse), Viewer→(branch) read-only
**And** unauthorized route access redirects to the user's authorized default route
**And** white-label theming foundation is in place: CSS custom properties for brand tokens, Convex `settings` table for HQ-configurable brand colors/logo/name, RootLayout reads and injects brand tokens dynamically

### Story 1.6: Audit Trail Foundation

As a **system administrator**,
I want every significant action logged with immutable timestamps,
So that we have a complete audit trail for BIR compliance and fraud prevention.

**Acceptance Criteria:**

**Given** the `auditLogs` table exists in Convex schema
**When** any mutation creates, updates, or deletes financial or inventory data
**Then** `_logAuditEntry()` helper in `convex/_helpers/auditLog.ts` creates an immutable log entry
**And** each entry records: action type, user ID, branch ID, timestamp, affected entity, before/after values
**And** audit logs are append-only (no update or delete mutations exist for this table)
**And** `convex/audit/logs.ts` provides query functions for viewing audit trails
**And** log write latency is <500ms
**And** the system is designed for 5-year log retention

---

## Epic 2: Product Catalog & Brand Management

HQ Staff can manage the complete product hierarchy (Brand -> Category -> Style -> Variant) with SKUs, barcodes, pricing, and product images.

### Story 2.1: Brand & Category Management

As an **HQ Staff member**,
I want to create and manage brands and product categories,
So that our product catalog is organized by the brands we carry and the types of products we sell.

**Acceptance Criteria:**

**Given** an authenticated HQ Staff or Admin user at `(admin)/catalog/`
**When** they manage brands
**Then** they can create a new brand with name and logo
**And** they can edit brand details
**And** they can deactivate a brand (soft delete — existing products remain, no new products can be added)
**And** brands are displayed in a searchable list with status indicators
**When** they manage categories
**Then** they can create categories (Shoes, Apparel, Accessories) linked to a brand
**And** they can edit and deactivate categories
**And** the Brand -> Category hierarchy is navigable in the UI

### Story 2.2: Style & Variant Management

As an **HQ Staff member**,
I want to create product styles and their variants (size, color, gender),
So that every physical product in our stores has a digital representation with a unique SKU.

**Acceptance Criteria:**

**Given** an existing brand and category
**When** the user creates a new style/model
**Then** they can set the style name, description, and base price
**And** the style is linked to its parent category (Brand -> Category -> Style hierarchy)
**When** the user adds variants to a style
**Then** they can specify size, color, and gender for each variant
**And** a unique SKU is auto-generated or manually assigned per variant
**And** a unique barcode is assigned to each variant
**And** pricing can be overridden at the variant level (default inherits from style)
**And** the full 4-level hierarchy (Brand -> Category -> Style -> Variant) is navigable in the admin UI
**And** variant prices are stored in centavos (integer)

### Story 2.3: Product Image Management

As an **HQ Staff member**,
I want to upload product images for styles and variants,
So that products are visually identifiable across all interfaces (POS lookup, customer website, dashboards).

**Acceptance Criteria:**

**Given** an existing style or variant
**When** the user uploads an image via the admin catalog form
**Then** the image is stored via Convex file storage using `storage.generateUploadUrl()`
**And** the `storageId` is saved as a reference on the style/variant record
**And** images are served via `storage.getUrl()` with automatic CDN caching
**And** multiple images can be uploaded per style (3-5 for product gallery)
**And** a primary image can be designated for thumbnails
**And** `convex/catalog/images.ts` provides upload and delete mutations

### Story 2.4: Bulk Product Import

As an **Admin**,
I want to import products in bulk via CSV upload,
So that I can quickly populate the catalog with hundreds of products without manual entry.

**Acceptance Criteria:**

**Given** an Admin user at `(admin)/catalog/import/`
**When** they upload a CSV file with product data
**Then** the system parses the CSV and validates each row (brand, category, style, variant fields)
**And** a Convex action processes up to 500 items per batch using `ctx.runMutation` per item
**And** larger imports are automatically split into multiple batches on the client
**And** the UI shows progress: success count, failure count, and error details per failed row
**And** successfully imported products are immediately visible in the catalog
**And** import errors do not affect successfully imported rows (partial success allowed)

---

## Epic 3: Point of Sale — Online Transactions

Cashiers can scan/search products, build transactions, apply VAT and Senior/PWD discounts, select payment method, generate BIR-compliant receipts, and perform end-of-day reconciliation.

### Story 3.1: POS Layout & Product Search

As a **Cashier**,
I want a tablet-optimized POS interface where I can scan or search for products,
So that I can quickly find and add items to a customer's transaction.

**Acceptance Criteria:**

**Given** a Cashier signed in and on the `(pos)/` route
**When** the POS loads on a tablet (1024px+)
**Then** the screen shows a split layout: POSProductGrid (65% left) + POSCartPanel (35% right)
**And** on smaller tablets (768-1023px), the layout is single-column with cart as bottom sheet
**And** the POSProductGrid shows product thumbnails, name, price, available sizes as pills, stock count
**And** the grid supports 3-column (portrait) and 4-column (landscape) layouts
**And** a search bar allows text-based product lookup with instant results
**And** category/brand filter chips are available above the grid
**And** all touch targets are minimum 56px for POS interface
**And** the base font size is 18px per POS theme

### Story 3.2: Barcode Scanning & Cart Management

As a **Cashier**,
I want to scan product barcodes and manage the cart,
So that I can build a transaction quickly without typing.

**Acceptance Criteria:**

**Given** the POS interface is active
**When** a barcode is scanned via html5-qrcode (tablet camera)
**Then** the ScanConfirmation overlay appears within 100ms showing product name, size, color, price
**And** the product is automatically added to the POSCartPanel
**And** if the same product is scanned again, the quantity increments (duplicate warning in amber)
**And** if the barcode is not found, a red shake animation + buzz + "Not found" message appears
**And** audio chimes differ per scan state (success, not found, duplicate)
**When** managing the cart
**Then** the cashier can adjust quantity via +/- stepper (not text input)
**And** the cashier can remove items by swiping or tapping delete
**And** the cart shows: line items (product, size, color, qty, unit price, line total), subtotal, and running grand total
**And** the cashier can hold a transaction (dimmed with "resume" badge) and start a new one
**And** the cashier can clear the entire cart

### Story 3.3: VAT Calculation & Senior/PWD Discount

As a **Cashier**,
I want VAT automatically calculated and Senior/PWD discounts applied with one tap,
So that every transaction is tax-compliant and discounts are computed correctly.

**Acceptance Criteria:**

**Given** items are in the cart
**When** the transaction is in progress
**Then** VAT (12%) is automatically calculated on all taxable items and shown as a line item
**And** all calculations are in centavos (integer math) to avoid floating-point errors
**When** the cashier toggles the Senior/PWD discount (one-tap toggle)
**Then** VAT is removed first from each item price (price / 1.12)
**And** 20% discount is applied to the VAT-exempt base price
**And** the receipt shows the breakdown: original price, VAT-exempt price, discount amount, final price
**And** a green highlight shows total savings
**And** the tax calculation logic lives in `convex/_helpers/taxCalculations.ts` and is testable independently
**And** the discount toggle is a prominent, easily accessible UI element (not buried in a menu)

### Story 3.4: Payment Processing & Transaction Completion

As a **Cashier**,
I want to select a payment method and complete the sale,
So that the transaction is recorded and the customer can leave with their purchase.

**Acceptance Criteria:**

**Given** a cart with items and correct totals
**When** the cashier selects a payment method
**Then** Cash, GCash, and Maya are available as payment options
**And** Cash is pre-selected as default (most common in PH retail)
**And** for cash payment, the cashier enters the amount tendered and change is calculated
**When** the cashier taps "Complete Sale" (primary action, pinned to cart footer, always visible)
**Then** a Convex mutation creates the `transaction` and `transactionItems` records
**And** inventory quantities are decremented for the branch in real-time
**And** an audit log entry is created for the transaction
**And** the transaction is completed in <3 seconds (scan to receipt)
**And** the cart resets and is ready for the next customer
**And** the "Complete Sale" button shows a loading spinner during processing (button disabled, width preserved)

### Story 3.5: BIR-Compliant Receipt Generation

As a **Cashier**,
I want a BIR-compliant receipt generated automatically on sale completion,
So that the business meets Philippine tax authority requirements.

**Acceptance Criteria:**

**Given** a completed transaction
**When** the receipt is generated via @react-pdf/renderer
**Then** the receipt includes all BIR-required fields: business name (white-label), TIN, branch address, date/time (Asia/Manila), itemized breakdown with unit price and quantity, VAT line (12%), discount line (if applicable), grand total, and sequential receipt number
**And** Senior/PWD receipts show the discount computation breakdown
**And** the receipt includes the white-label brand logo and business name from Convex settings
**And** the receipt is viewable on-screen and downloadable as PDF
**And** receipt data is stored in Convex for future retrieval
**And** `convex/pos/receipts.ts` handles receipt data persistence

### Story 3.6: End-of-Day Cash Reconciliation

As a **Cashier**,
I want to reconcile my cash drawer at the end of the day,
So that I can verify my physical cash matches the system total and report any discrepancies.

**Acceptance Criteria:**

**Given** the cashier navigates to the reconciliation screen in the POS
**When** the end-of-day view loads
**Then** it shows a single screen with: system-calculated expected cash total, input field for physical cash count, auto-calculated difference
**And** the reconciliation can be completed in under 2 minutes
**And** the cashier submits the reconciliation with the physical count
**And** discrepancies (over/short) are logged in the audit trail with the cashier's user ID, branch, and timestamp
**And** the reconciliation record is stored for manager/HQ review

---

## Epic 4: POS Offline Mode & Resilience

Cashiers can continue selling during internet outages with zero data loss; transactions automatically sync when connectivity returns.

### Story 4.1: Service Worker & Offline Detection

As a **Cashier**,
I want the POS to detect when I'm offline and continue working seamlessly,
So that sales are never interrupted by internet outages.

**Acceptance Criteria:**

**Given** the POS is running as a PWA (manifest.json with `display: standalone`, `start_url: /pos`)
**When** the service worker is registered for `(pos)/` routes only
**Then** POS UI assets are pre-cached for offline use
**And** the ConnectionIndicator shows: green dot (online, hidden by default), blue pulse (syncing), amber dot + "Offline Mode" text (offline), red dot + retry (error)
**And** the transition from online to offline is ambient — no blocking modals or error popups
**And** the POS flow (scan, cart, payment, complete) works identically regardless of connectivity
**And** the Clerk session token is cached in Service Worker storage for offline auth
**And** force re-auth occurs on reconnect if the token has expired

### Story 4.2: Offline Transaction Queue & Encryption

As a **Cashier**,
I want my offline transactions stored securely and synced automatically when internet returns,
So that no sales data is ever lost and customer transactions are protected.

**Acceptance Criteria:**

**Given** the POS is offline
**When** a transaction is completed
**Then** the transaction is stored in IndexedDB `transactionQueue` store
**And** all stored data is encrypted with AES-256 via Web Crypto API
**And** local storage operation completes in <200ms
**And** the current cart state is persisted to `offlineCart` IndexedDB store on every cart change
**And** branch stock levels are snapshotted to `stockSnapshot` on going offline, decremented locally per sale
**When** connectivity returns
**Then** queued transactions replay sequentially to Convex mutations
**And** sync completes in <30 seconds for queued transactions
**And** encrypted local data is wiped after successful sync
**And** the local stock snapshot is discarded and Convex real-time subscriptions resume
**And** sync conflicts are flagged for HQ review (last-write-wins with discrepancy flag)
**And** the ConnectionIndicator shows syncing progress, then returns to online state

---

## Epic 5: Inventory Management & Stock Visibility

Staff can view real-time unified stock across all branches; managers configure and receive low-stock alerts; POS cashiers can check other branches without leaving a transaction.

### Story 5.1: Real-Time Branch Stock View

As a **branch staff member**,
I want to see my branch's current stock levels in real-time,
So that I always know what products are available and in what quantities.

**Acceptance Criteria:**

**Given** an authenticated staff member with a branch assignment
**When** they view the inventory page for their branch
**Then** stock levels are displayed per variant (product, size, color, quantity)
**And** data updates in real-time via Convex `useQuery` subscriptions — no manual refresh needed
**And** changed stock quantities get a brief background pulse animation (200ms ease-in, 300ms ease-out)
**And** stock levels that cross thresholds trigger StatusPill color transitions (green→amber→red)
**And** the view supports search, filter by brand/category, and sort by quantity
**And** stock updates from POS transactions at this branch propagate in <1 second

### Story 5.2: Cross-Branch Stock Lookup

As a **Cashier at the POS**,
I want to check if another branch has a product in stock without leaving my current transaction,
So that I can immediately tell a customer where to find what they need.

**Acceptance Criteria:**

**Given** a Cashier is in an active POS transaction
**When** they tap "Check other branches" on a product (or scan a product during lookup)
**Then** the BranchStockDisplay component appears inline (popover or sheet, NOT a full navigation away)
**And** it shows all branches with: branch name, stock quantity, status indicator (In Stock green / Low amber / Out red)
**And** the current transaction is preserved — the cashier can return to it immediately
**And** the cross-branch lookup completes in <5 seconds
**And** HQ Staff and Admin see all branches; branch staff see all branches read-only

### Story 5.3: Low-Stock Alerts & Threshold Configuration

As a **Branch Manager or HQ Staff**,
I want to set low-stock thresholds and receive alerts when inventory runs low,
So that I can reorder or request transfers before products run out.

**Acceptance Criteria:**

**Given** an Admin or HQ Staff user
**When** they configure low-stock thresholds per product per branch
**Then** thresholds are stored in the inventory or a configuration table in Convex
**And** when a stock mutation causes quantity to fall below threshold, an alert is generated
**And** alert generation is event-driven (triggered on stock change mutation) with hourly sweep fallback
**And** alerts appear in the HQ dashboard's AttentionItem list and branch dashboard
**And** alerts include: product name, variant, branch, current quantity, threshold, suggested action
**And** managers can dismiss or act on alerts (e.g., initiate a transfer request)

---

## Epic 6: Stock Transfers & Warehouse Operations

Managers can request stock transfers, warehouse staff pack with barcode scanning, receiving branches confirm delivery, with complete audit trail at every stage.

### Story 6.1: Transfer Request & Approval

As a **Branch Manager**,
I want to request stock transfers from the warehouse or another branch,
So that I can restock products that are running low at my location.

**Acceptance Criteria:**

**Given** an authenticated Manager or HQ Staff user
**When** they create a new transfer request
**Then** they can select source branch/warehouse, destination branch, and add line items (product variant + quantity)
**And** the request is saved with status "Requested" and timestamped
**And** the request appears in the warehouse staff's pending queue
**And** HQ Staff can approve or reject transfer requests
**And** rejected requests include a reason and notify the requestor
**And** an audit log entry is created for the request

### Story 6.2: Warehouse Packing with Barcode Scanning

As a **Warehouse Staff member**,
I want to pick and pack transfer orders by scanning barcodes,
So that I can confirm the correct items and quantities are being shipped.

**Acceptance Criteria:**

**Given** an approved transfer request visible in the `(warehouse)/` task-based interface
**When** the warehouse staff starts packing
**Then** the current task dominates the screen (full-screen focus mode per UX spec)
**And** they scan each item's barcode to confirm it matches the transfer manifest
**And** scanned items are checked off the manifest with quantity tracking
**And** mismatched scans trigger an immediate audio + visual alert
**And** the bottom action bar shows: Complete, Skip, Report Issue
**When** all items are packed and confirmed
**Then** the transfer status updates to "Packed" with timestamp and packer ID
**And** an audit log entry is created for the packing action

### Story 6.3: Transfer Tracking & Delivery Confirmation

As a **receiving branch staff member**,
I want to confirm delivery by scanning received items,
So that inventory is accurately updated and any discrepancies are flagged immediately.

**Acceptance Criteria:**

**Given** a transfer with status "In Transit" arrives at the destination branch
**When** the receiving staff opens the transfer in their interface
**Then** they see the TransferCard with full manifest (items, quantities expected)
**And** they scan received items to confirm quantities
**And** the StatusPill shows progression: Requested → Packed → In Transit → Delivered
**When** all items match
**Then** the transfer status updates to "Delivered" and inventory is added to the receiving branch
**When** items are missing or damaged
**Then** the staff can flag specific items as damaged or missing with notes
**And** a partial delivery is recorded — received items are added, flagged items trigger HQ alert
**And** an audit log entry records the delivery confirmation with all details (who, what, when, discrepancies)
**And** the complete transfer audit trail is viewable: every stage with timestamps and user IDs

---

## Epic 7: Dashboards, Reporting & Demand Intelligence

HQ sees the Morning Command Center with all-branch overview and alerts; branch managers see their dashboard; cashiers log customer demand; HQ views demand trends and BIR VAT summaries.

### Story 7.1: HQ Morning Command Center

As **HQ Staff (Ate Lisa)**,
I want to see an all-branch overview dashboard when I open the system each morning,
So that I can quickly identify what needs my attention across all branches.

**Acceptance Criteria:**

**Given** an HQ Staff user navigates to `(hq)/` dashboard
**When** the dashboard loads (in <2 seconds)
**Then** the top row shows MetricCards: total revenue today, transaction count, stock alerts count, transfer status summary — each with trend arrows vs previous period
**And** BranchCards show each branch with: today's revenue, transaction count, stock health indicator, alerts badge
**And** branch health states: Healthy (green), Needs Attention (amber), Critical (red), Offline (gray + last sync time)
**And** AttentionItems list actionable alerts: low-stock warnings, pending transfers, overdue reservations, sync conflicts
**And** alerts are prioritized: Critical (red border) > Warning (amber) > Info (blue)
**And** clicking any BranchCard drills down into that branch's detail view
**And** clicking any AttentionItem opens the relevant view to take action
**And** real-time Convex subscriptions keep all data live — no manual refresh

### Story 7.2: Branch Dashboard

As a **Branch Manager**,
I want to see my branch's performance dashboard,
So that I can monitor sales, stock, and staff activity for my location.

**Acceptance Criteria:**

**Given** a Manager navigates to `(branch)/` dashboard
**When** the dashboard loads
**Then** MetricCards show: today's revenue, transaction count, items sold, average transaction value
**And** a daily sales chart (Recharts) shows hourly sales volume
**And** stock alerts for this branch are displayed
**And** pending transfers (incoming and outgoing) are listed
**And** the dashboard is scoped to the manager's branch only (withBranchScope)
**And** all data updates in real-time via Convex subscriptions

### Story 7.3: Sales Reporting & BIR VAT Summary

As an **Owner/Admin or HQ Staff**,
I want to view sales reports and generate VAT summaries,
So that I can track business performance and comply with BIR filing requirements.

**Acceptance Criteria:**

**Given** an authorized user navigates to `(hq)/reports/`
**When** they view daily sales summaries
**Then** they can see sales per branch, with filters for date range, branch, and brand
**And** date range picker defaults to "Today" with quick presets (Yesterday, This Week, This Month)
**And** brand-level sales data is available (sales by Nike, Adidas, etc. across branches)
**When** they navigate to `(hq)/reports/bir/`
**Then** they can generate monthly/quarterly VAT summary data
**And** the summary shows total taxable sales, total VAT collected, Senior/PWD discount totals
**And** the data is formatted for BIR filing requirements
**And** reports can be exported or downloaded

### Story 7.4: Demand Logging at POS

As a **Cashier or Branch Manager**,
I want to quickly log what customers are asking for that we don't have,
So that HQ can understand demand patterns and make smarter stocking decisions.

**Acceptance Criteria:**

**Given** a Cashier or Manager at the POS or branch interface
**When** they open the demand log quick-entry
**Then** a visual quick-tap brand selector shows most-used brands pre-loaded
**And** they can select category, size, and add optional notes
**And** the entire demand log entry completes in <30 seconds
**And** the entry records: product requested, size, timestamp, branch, staff who logged it
**And** the `demandLogs` table stores the entry with all metadata
**And** the UI uses tap/scan selectors — not text fields — for speed

### Story 7.5: Demand Intelligence Dashboard

As **HQ Staff**,
I want to view demand trends across all branches,
So that I can identify what products customers want and make informed purchasing decisions.

**Acceptance Criteria:**

**Given** an HQ Staff user navigates to the demand intelligence section
**When** they view the demand dashboard
**Then** they can see all demand log entries across branches, filterable by date, branch, brand
**And** a weekly summary shows top-requested items/brands (top 10 trending)
**And** the `generateDemandSummary` scheduled function aggregates data weekly (Monday 6 AM PHT)
**And** demand trends are visualized with Recharts (bar charts, trend lines)
**And** DemandLogEntry components show: product, size, branch, timestamp, status (Logged/Trending/Fulfilled)
**And** entries marked as "Trending" (multiple requests for same item) are highlighted

---

## Epic 8: Customer Website & Reserve-for-Pickup

Customers can browse products by brand, view real-time branch stock, find branches, and reserve items for in-store pickup without payment.

### Story 8.1: Product Browsing & Brand Navigation

As a **Customer**,
I want to browse products by brand and category on a mobile-friendly website,
So that I can discover what's available at RedBox stores near me.

**Acceptance Criteria:**

**Given** a visitor on the `(customer)/` route (no auth required for browsing)
**When** the customer website loads
**Then** pages are server-side rendered for SEO (Next.js App Router SSR)
**And** the mobile-first layout shows: bottom nav (Home, Browse, Cart, Account), top header with logo + search + branch selector
**And** brands are browsable: `/brands/` shows brand cards, `/brands/[slug]` shows that brand's products
**And** category browsing via horizontal scrollable chips
**And** ProductCards show: hero image (Next.js `<Image>` with lazy load + blur-up), brand logo, name, price, "Available at X branches" text, size availability dots
**And** product grid: 2-column mobile, 3-column tablet, 4-column desktop
**And** First Contentful Paint <1 second, Largest Contentful Paint <2 seconds

### Story 8.2: Real-Time Branch Stock & Product Detail

As a **Customer**,
I want to see which branches have a product in stock in real-time,
So that I know exactly where to go to buy what I want.

**Acceptance Criteria:**

**Given** a customer taps on a ProductCard
**When** the product detail page loads
**Then** it shows: image gallery (swipeable, 3-5 images), product name, brand, price, color swatches (circles, not dropdown), size grid (visual selector, not dropdown)
**And** the BranchStockDisplay customer variant shows: branch name, distance (if location shared), stock quantity, status (In Stock green / Low amber / Out red / Incoming blue with ETA)
**And** stock levels update in real-time via Convex subscriptions
**And** out-of-stock variants show a "Notify Me" option
**And** sale items show strikethrough original price with red sale badge

### Story 8.3: Branch Finder

As a **Customer**,
I want to find RedBox branches near me,
So that I can visit the closest store that has what I'm looking for.

**Acceptance Criteria:**

**Given** a customer navigates to the branch finder
**When** the branch list loads
**Then** all active branches are displayed with name, address, and contact info
**And** if the customer shares their location, branches are sorted by distance
**And** each branch card shows a brief status (open/closed if business hours are configured)
**And** tapping a branch shows directions (link to Google Maps)

### Story 8.4: Reserve-for-Pickup Flow

As a **Customer**,
I want to reserve a product for in-store pickup without creating an account or paying upfront,
So that I can guarantee the item will be held for me when I visit the store.

**Acceptance Criteria:**

**Given** a customer is viewing a product with available stock at a branch
**When** they tap "Reserve for Pickup"
**Then** a bottom sheet opens (stays in context) asking for: name and phone number only (no account creation)
**And** a real-time stock check occurs on reserve tap — if stock is gone, show alternative branches
**And** on submission, the reservation is created with 24-hour auto-expiry
**And** the customer sees a confirmation with: reserved item, branch name, pickup deadline
**And** branch staff see the reservation in `(branch)/reservations/`

### Story 8.5: Reservation Management & Expiry

As a **Branch Staff member**,
I want to view and manage customer reservations,
So that I can set aside reserved items and be notified when reservations expire.

**Acceptance Criteria:**

**Given** a branch staff member navigates to `(branch)/reservations/`
**When** they view the reservation list
**Then** they see all pending reservations for their branch with: customer name, phone, product, size, color, reservation time, expiry countdown
**And** they can mark a reservation as "Fulfilled" when the customer picks up
**And** the `expireReservations` scheduled function runs hourly and expires unfulfilled reservations after 24 hours
**And** expired reservations release the reserved stock back to available inventory
**And** staff receive a notification when a reservation expires unfulfilled
**And** reservation status is tracked: Pending → Fulfilled or Expired

---

## Epic 9: Logistics, AI Intelligence & Supplier Ecosystem

Drivers manage deliveries on mobile; AI generates restock suggestions, branch scores, and demand patterns; suppliers view demand signals and submit stock proposals.

### Story 9.1: Driver Delivery Management

As a **Driver**,
I want to see my assigned deliveries on my phone and confirm each delivery,
So that I can efficiently complete my route and the system tracks delivery status.

**Acceptance Criteria:**

**Given** a Driver role user on the `(driver)/` route (phone-only, one-hand operation)
**When** they open the driver interface
**Then** they see one delivery at a time, full-screen (single-task flow per UX spec)
**And** the delivery shows: destination branch name, address, items count, transfer ID
**And** the bottom CTA shows the primary action for the current step: "Navigate" → "Arrived" → "Delivered"
**And** tapping "Navigate" opens directions (Google Maps link)
**And** the delivery list is accessible via back/up navigation
**And** all touch targets are minimum 48px, CTA is maximum-size
**And** no sidebar, no tabs — pure sequential flow

### Story 9.2: Delivery Assignment & Tracking

As **HQ Staff**,
I want to assign deliveries to drivers and track delivery progress,
So that I can manage logistics efficiently and know where transfers are in real-time.

**Acceptance Criteria:**

**Given** HQ Staff at `(hq)/logistics/`
**When** they view pending transfers that need delivery
**Then** they can assign a driver to each transfer
**And** they can see all active deliveries with status (Assigned → In Transit → Delivered)
**And** delivery status updates in real-time as drivers update their progress
**When** a Driver confirms delivery with barcode scanning
**Then** the transfer status updates to "Delivered"
**And** the receiving branch is notified
**And** an audit log entry records the delivery confirmation

### Story 9.3: AI Restock Suggestions

As **HQ Staff**,
I want AI-generated restock suggestions based on sales history,
So that I can make data-driven restocking decisions instead of guessing.

**Acceptance Criteria:**

**Given** at least 14 days of sales history exist in the system
**When** HQ Staff views the AI suggestions dashboard at `(hq)/`
**Then** the system shows recommended restocks: SKU, recommended quantity, target branch
**And** suggestions are generated by `convex/ai/restockSuggestions.ts` analyzing sales velocity per variant per branch
**And** suggestions account for current stock levels and transfer-in-progress
**And** each suggestion includes a confidence rationale (e.g., "Selling 3/day, 5 left, restock in 2 days")
**And** HQ Staff can accept a suggestion (creates a transfer request) or dismiss it

### Story 9.4: Branch Performance Scoring

As the **Owner (Boss Arnel)**,
I want to see performance scores for each branch,
So that I can identify which branches are performing well and which need attention.

**Acceptance Criteria:**

**Given** the Owner/Admin navigates to the performance view
**When** they view branch scores
**Then** each branch shows a composite performance score calculated from: sales volume, stock accuracy (inventory count vs system), and fulfillment speed (transfer completion time)
**And** `convex/ai/branchScoring.ts` calculates scores based on available data
**And** scores are displayed on BranchCards in the HQ dashboard
**And** branches are rankable/sortable by performance score
**And** trend indicators show improvement or decline vs previous period

### Story 9.5: Supplier Demand Visibility & Stock Proposals

As a **Supplier**,
I want to see demand signals for my brand across RedBox branches,
So that I can understand what's selling and propose stock replenishment.

**Acceptance Criteria:**

**Given** a Supplier role user at `(supplier)/` route
**When** they sign in
**Then** they see demand data filtered to their brand(s) only
**And** they can view: top-selling variants, demand log entries for their brand, stock levels across branches
**And** they can submit stock proposals: proposed items, quantities, pricing
**And** proposals are submitted to the Owner/Admin for review
**And** the supplier portal is read-only for data, write-only for proposals (no edits to RedBox data)
**And** the interface is desktop-only, mouse + keyboard optimized
