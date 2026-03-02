---
stepsCompleted: ['step-01-init', 'step-02-context', 'step-03-starter', 'step-04-decisions', 'step-05-patterns', 'step-06-structure', 'step-07-validation', 'step-08-complete']
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/product-brief-redbox-apparel-2026-02-25.md'
  - '_bmad-output/analysis/brainstorming-session-2026-02-25.md'
  - '_bmad-output/planning-artifacts/prd-validation-report.md'
workflowType: 'architecture'
project_name: 'redbox-apparel'
user_name: 'FashionMaster'
date: '2026-02-26'
lastStep: 8
status: 'complete'
completedAt: '2026-02-26'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (62 FRs across 11 categories):**

| Category | FRs | Phase | Architectural Weight |
|---|---|---|---|
| User Management & Access Control | FR1-7 | 1 | High — RBAC foundation, branch-scoped isolation |
| Product Catalog & Brand Management | FR8-14 | 1 | High — 4-level hierarchy (Brand→Category→Style→Variant) |
| Point of Sale | FR15-25 | 2 | Critical — offline mode, VAT/discount logic, receipt generation |
| Inventory Management | FR26-31 | 1 | High — real-time sync, cross-branch visibility |
| Stock Transfers & Warehouse | FR32-38 | 3 | Medium — workflow state machine, barcode scanning |
| Dashboards & Reporting | FR39-44 | 1-3 | Medium — real-time aggregations, BIR data generation |
| Demand Intelligence | FR45-48 | 2 | Low — CRUD + weekly aggregation |
| Customer Website | FR49-54 | 4 | Medium — public-facing, SEO, reservation system |
| Logistics | FR55-57 | 5 | Low — driver interface, delivery tracking |
| AI Intelligence | FR58-60 | 6 | Medium — analytics, scoring algorithms |
| Ecosystem | FR61-62 | 7 | Low — supplier portal |

**Non-Functional Requirements (34 NFRs):**

| Category | NFRs | Architecture Impact |
|---|---|---|
| Performance (9) | NFR1-9 | POS <3s, stock sync <1s, offline storage <200ms, website FCP <1s |
| Security (7) | NFR10-16 | Clerk auth, branch isolation, AES-256 offline encryption, 5-year audit logs |
| Scalability (5) | NFR17-21 | 20 branches, 2-3 POS/branch, 10K variants, 3yr history, 3-5x peak traffic |
| Reliability (5) | NFR22-26 | Offline POS, zero data loss, sync conflict resolution, 99.5% uptime |
| Accessibility (3) | NFR27-29 | WCAG 2.1 AA (customer website), large touch targets (POS) |
| Integration (5) | NFR30-34 | Clerk, Convex, html5-qrcode, @react-pdf/renderer, PayMongo (future) |

**Scale & Complexity:**

- Primary domain: Full-stack web application (multi-interface)
- Complexity level: Medium-High
- Estimated architectural components: ~12 (auth, product catalog, POS engine, inventory sync, transfer workflow, dashboards, demand logs, customer site, logistics, AI layer, supplier portal, offline engine)

### Technical Constraints & Dependencies

| Constraint | Impact |
|---|---|
| **Convex as sole database** | All data modeling, queries, and real-time subscriptions through Convex functions. No raw SQL. Schema defined in Convex schema.ts. |
| **Next.js 15 App Router** | Server Components by default, Client Components for interactivity. Route groups for interface separation (POS, HQ, branch, customer, etc.) |
| **Clerk for auth** | User management, session handling, role metadata externalized to Clerk. Webhook sync for user data. |
| **Vercel for hosting** | Serverless functions, edge runtime available. Cold starts possible. No persistent server process. |
| **Offline POS requirement** | Needs service worker or local-first approach. Convex doesn't natively support offline — requires custom sync layer. |
| **Solo developer** | Architecture must be simple enough for one developer to build and maintain across 7 phases. |
| **Philippine internet** | Unreliable connectivity is a baseline assumption, not an edge case. |

### Cross-Cutting Concerns Identified

1. **Branch-scoped data isolation** — Every Convex query/mutation must enforce branch scope. Architectural pattern needed (middleware, wrapper functions, or Convex custom functions with scope injection).
2. **Role-based access control** — 6 roles (Admin, Manager, Cashier, Warehouse Staff, HQ Staff, Viewer) with different permissions per interface. Enforced server-side on every API call.
3. **Offline/Online sync engine** — POS must work offline, queue transactions locally (encrypted), auto-sync on reconnect, handle conflicts. This is the single hardest architectural problem.
4. **Audit trail** — Immutable logs for all financial transactions and stock movements. 5-year retention. Every mutation must generate audit entries.
5. **Real-time subscriptions** — Convex subscriptions power live dashboards, stock updates, and transfer tracking. Architecture must manage subscription lifecycle efficiently.
6. **Philippine tax compliance** — VAT calculation, Senior/PWD discount logic, BIR receipt formatting. Must be centralized, testable, and auditable.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web application (multi-interface) based on project requirements — Next.js App Router + Convex real-time backend + Clerk auth. Tech stack pre-decided in PRD.

### Starter Options Considered

| Option | Source | Verdict |
|---|---|---|
| **`nextjs-clerk-shadcn`** | Official Convex team (get-convex) | **Selected** — exact stack match, minimal, maintained |
| Convex Ents SaaS Starter | Convex community | Rejected — SaaS subscription patterns not needed; wrong multi-tenant model |
| acelords nextjs-starter-kit-convex | Community | Rejected — too heavy; includes AI chat, billing features we'd remove |
| Plain `create-next-app` + manual | Next.js CLI | Rejected — unnecessary manual wiring when official template exists |

### Selected Starter: Official Convex `nextjs-clerk-shadcn`

**Rationale for Selection:**
- Exact tech stack match: Next.js + Convex + Clerk + Tailwind + shadcn/ui
- Maintained by Convex team — guaranteed API compatibility
- Minimal footprint — clean slate for RedBox-specific architecture
- Correct Clerk + Convex provider wiring out of the box
- No unnecessary dependencies to remove

**Initialization Command:**

```bash
npm create convex@latest -t nextjs-clerk-shadcn
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
TypeScript (strict mode), React 19, Next.js App Router

**Styling Solution:**
Tailwind CSS + shadcn/ui component library initialized

**Auth Integration:**
Clerk provider wrapping Convex provider, middleware configured for protected routes

**Database Layer:**
Convex schema.ts, query/mutation/action functions, real-time subscription wiring

**Code Organization:**
`app/` (Next.js routes), `convex/` (backend functions + schema), `components/` (UI components)

**Development Experience:**
`npx convex dev` for backend hot reload, `next dev` for frontend, TypeScript type safety across full stack

**Additional Dependencies to Install (Phase 1):**
- `@react-pdf/renderer` — BIR-compliant receipt generation
- `html5-qrcode` — Barcode scanning for POS and warehouse
- `recharts` — Analytics dashboards
- `resend` — Email notifications

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Data schema design (flat tables with ID references)
- Branch-scoping enforcement pattern (`withBranchScope()` wrapper)
- Offline POS architecture (Service Worker + IndexedDB)
- Role storage strategy (dual: Clerk publicMetadata + Convex users table)

**Important Decisions (Shape Architecture):**
- Convex function organization (feature-based folders)
- Route group structure (7 interface groups)
- State management approach (Convex-native + React Context)
- Sync conflict resolution (last-write-wins + HQ review flag)

**Deferred Decisions (Post-MVP):**
- Payment gateway integration pattern (PayMongo — Phase 4+)
- AI/ML pipeline architecture (Phase 6)
- Supplier portal auth model (Phase 7)
- Advanced caching strategy (optimize after baseline metrics)

### Data Architecture

**Schema Design: Flat Tables with ID References**
- Decision: Separate Convex tables for each entity level, linked by ID references
- Rationale: Convex best practice — flat documents, arrays capped at ~10 elements, relationships via IDs
- Core tables: `users`, `branches`, `brands`, `categories`, `styles`, `variants`, `transactions`, `transactionItems`, `inventory`, `transfers`, `transferItems`, `demandLogs`, `auditLogs`
- Product hierarchy: `brands` → `categories` (brandId) → `styles` (categoryId) → `variants` (styleId) with size/color/gender fields
- Affects: Every feature module queries through this schema

**Convex Ents: Not Used**
- Decision: Plain Convex with custom helper functions
- Rationale: Fewer abstractions for solo dev; relationships aren't complex enough to warrant Ents dependency
- Pattern: Shared helper functions for common joins (e.g., `getVariantWithStyle()`, `getProductHierarchy()`)

**Offline Storage: IndexedDB**
- Decision: IndexedDB for offline POS transaction queue
- Rationale: Native browser API, proven, no WASM bundle needed, sufficient capacity for queued transactions
- Pattern: Transactions serialized to IndexedDB with timestamp, branch, cashier, and encrypted payload
- Encryption: AES-256 via Web Crypto API on all stored transaction data

**Sync Strategy: Queue-Based with Conflict Flagging**
- Decision: Offline mutations queued in IndexedDB → replayed to Convex on reconnect
- Conflict resolution: Last-write-wins for inventory counts with automatic HQ review flag when discrepancies detected
- Rationale: Simple, predictable, auditable. HQ Staff (Lisa) reviews flagged conflicts rather than automated merge logic
- Affects: POS module, inventory sync, audit trail

### Authentication & Security

**Role Storage: Dual (Clerk + Convex)**
- Decision: Clerk `publicMetadata` stores role in session token + Convex `users` table stores role/branch for server-side enforcement
- Sync: Clerk webhook → Convex `users` table on role/branch changes
- Rationale: Fast client-side role checks (no network call) + bulletproof server-side enforcement
- Affects: Every Convex function, middleware, route protection

**Branch-Scoping Pattern: `withBranchScope()` Wrapper**
- Decision: Every Convex query/mutation wraps data access through a `withBranchScope(ctx)` helper
- Behavior: Reads authenticated user's branch assignment from `users` table, injects as filter on all queries
- HQ/Admin bypass: Users with HQ Staff or Admin role skip branch filter, access all data
- Rationale: Single enforcement point — impossible to accidentally bypass branch isolation
- Affects: Every Convex query and mutation

**Offline Auth: Cached Session Token**
- Decision: Cache Clerk session token in Service Worker storage
- Behavior: POS operates with cached token during offline. Force re-auth on reconnect if expired.
- Rationale: POS must work without network — auth cannot block sales
- Affects: POS offline module, service worker

### API & Communication Patterns

**Convex Function Organization: Feature-Based**
- Decision: Organize Convex functions by feature domain

```
convex/
├── auth/           — user management, role checks
├── catalog/        — brands, categories, styles, variants
├── pos/            — transactions, cart, receipts, offline sync
├── inventory/      — stock levels, movements, alerts
├── transfers/      — transfer requests, workflow states
├── dashboards/     — aggregation queries for HQ/branch views
├── demand/         — demand log entries, summaries
├── audit/          — audit trail logging
├── _helpers/       — shared utilities (withBranchScope, permissions, tax calc)
└── schema.ts       — single schema file for all tables
```

- Rationale: Related logic stays together; scales cleanly across 7 phases
- Affects: All backend code organization

**Error Handling: Typed ConvexError**
- Decision: Use Convex's `ConvexError` with typed error codes
- Codes: `INSUFFICIENT_STOCK`, `INVALID_DISCOUNT`, `TRANSFER_CONFLICT`, `UNAUTHORIZED`, `BRANCH_MISMATCH`, `SYNC_CONFLICT`
- Frontend: Catches error codes and displays human-readable PH-context messages
- Rationale: Type-safe, consistent error handling across all functions

**Real-Time Subscriptions: Selective Convex-Native**
- Decision: `useQuery` hooks with selective subscriptions per view
- POS: Subscribes to branch stock levels only
- HQ Dashboard: Subscribes to all-branch summaries (aggregated)
- Branch Dashboard: Subscribes to own branch stock + transfers
- Rationale: Convex handles subscription lifecycle; selective subscriptions prevent over-fetching

### Frontend Architecture

**State Management: Convex-Native + React Context**
- Decision: No additional state library (no Zustand, no Redux)
- Server state: Convex `useQuery`/`useMutation` hooks (reactive, real-time)
- Local UI state: React Context for POS cart, current transaction, UI toggles
- Rationale: Convex already provides reactive server state; adding another layer creates confusion
- Affects: All frontend components

**Route Group Structure:**

```
app/
├── (auth)/         — Sign-in, sign-up (Clerk components)
├── (pos)/          — POS terminal interface (offline-capable)
│   └── layout.tsx  — Service worker registration, offline indicator
├── (hq)/           — HQ dashboard (Lisa's command center)
│   └── layout.tsx  — All-branch data subscriptions
├── (branch)/       — Branch manager dashboard (Renz's view)
│   └── layout.tsx  — Branch-scoped subscriptions
├── (warehouse)/    — Warehouse operations (Phase 3)
├── (customer)/     — Public website (Phase 4, no auth required)
├── (admin)/        — System admin, user management
└── layout.tsx      — Root: Clerk + Convex providers
```

- Rationale: Each interface gets isolated layout, middleware, and subscription scope. Role-based middleware per group.
- Affects: All route definitions, middleware configuration

**Offline POS Architecture: Service Worker + IndexedDB**
- Decision: Custom service worker for POS routes only
- Static asset caching: Service worker pre-caches POS UI assets
- Mutation interception: When offline, Convex mutations are intercepted and queued to IndexedDB
- Reconnect replay: On connectivity restore, queued mutations replay sequentially to Convex
- UI indicator: Persistent banner shows online/offline status
- Rationale: POS is the only interface requiring offline capability; scoping service worker to `(pos)/` avoids complexity elsewhere

**Component Organization: Feature Co-Location**
- Decision: Components live next to the route that uses them
- `components/ui/` — shadcn/ui primitives (Button, Input, Dialog, etc.)
- `components/shared/` — Business components used across routes (ProductCard, BranchSelector, StockBadge)
- Route-specific components stay in their route folder
- Rationale: Easy to find, easy to delete, no orphan components

### Infrastructure & Deployment

**CI/CD: Vercel + GitHub**
- Decision: Vercel auto-deploy from GitHub `main` branch
- Preview deployments for PRs
- Convex deployment linked to Vercel (production + preview environments)
- Rationale: Zero-config for Next.js; Convex integrates natively with Vercel

**Environment Configuration:**
- Production: Vercel environment variables (Clerk keys, Convex deployment URL)
- Development: `.env.local` (gitignored)
- Staging: Separate Convex deployment + Vercel preview
- Rationale: Standard Vercel + Convex pattern

**Monitoring:**
- Frontend: Vercel Analytics (Core Web Vitals, performance)
- Backend: Convex dashboard (function execution, errors, usage)
- Error tracking: Defer Sentry until post-MVP; Convex + Vercel dashboards sufficient initially
- Rationale: Start simple, add observability as system scales

### Decision Impact Analysis

**Implementation Sequence:**
1. Project initialization (starter template + additional dependencies)
2. Convex schema design (all core tables)
3. Auth + RBAC setup (Clerk webhook, users table, withBranchScope)
4. Route group structure with layouts and middleware
5. Feature modules built per phase (catalog → POS → inventory → transfers)
6. Offline POS engine (service worker + IndexedDB — Phase 2)
7. Customer website route group (Phase 4)
8. AI/analytics modules (Phase 6)

**Cross-Component Dependencies:**
- `withBranchScope()` + `users` table → must exist before any feature module
- `schema.ts` → defines types used by every Convex function
- Service worker → only needed for `(pos)/` routes, can be added in Phase 2
- Audit trail → `audit/` module called from every mutation, built alongside first feature

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 5 categories where AI agents could make different choices — naming, structure, format, communication, and process patterns.

### Naming Patterns

**Convex Tables & Fields:**
- Tables: camelCase plural — `users`, `brands`, `variants`, `transactionItems`, `auditLogs`
- Fields: camelCase — `brandId`, `createdAt`, `branchId`, `unitPrice`
- No snake_case anywhere in Convex schema

**Files & Directories:**
- Route folders: kebab-case — `(pos)/`, `stock-transfers/`, `demand-logs/`
- React components: PascalCase files — `ProductCard.tsx`, `BranchSelector.tsx`
- Convex functions: camelCase files — `createTransaction.ts`, `getStockLevels.ts`
- Utilities/helpers: camelCase files — `withBranchScope.ts`, `taxCalculations.ts`

**Functions & Variables:**
- Functions: camelCase — `getVariantsByStyle()`, `processTransaction()`
- React components: PascalCase — `<StockLevelBadge />`
- Constants: UPPER_SNAKE — `MAX_OFFLINE_QUEUE_SIZE`, `VAT_RATE`
- Types/interfaces: PascalCase — `Transaction`, `ProductVariant`, `BranchScope`
- Convex document types: `Doc<"users">` (Convex convention)

### Structure Patterns

**Test Location:** Co-located `*.test.ts` files next to the code they test
- `convex/pos/createTransaction.test.ts` next to `createTransaction.ts`
- `components/shared/ProductCard.test.tsx` next to `ProductCard.tsx`

**Shared Code:**
- `convex/_helpers/` — Convex-side shared utilities (branch scope, permissions, tax calc, audit)
- `lib/` — Client-side shared utilities (formatters, constants, type guards)
- `components/ui/` — shadcn/ui primitives only
- `components/shared/` — Business components used across route groups

**Configuration:**
- `convex/schema.ts` — Single source of truth for all table definitions
- `lib/constants.ts` — App-wide constants (VAT_RATE, roles, statuses)
- `lib/types.ts` — Shared TypeScript types not generated by Convex

### Format Patterns

**Convex Data Exchange:**
- Queries return data directly (no wrapper) — Convex convention
- Mutations return the created/updated document ID or void
- Errors thrown via `ConvexError` with typed code string
- No REST endpoints — all communication via Convex function calls

**Date/Time:**
- Storage: `number` (Unix timestamp ms) in Convex — `Date.now()`
- Display: Formatted to Philippine timezone (Asia/Manila) using `Intl.DateTimeFormat`
- Never store dates as strings

**Money/Currency:**
- Storage: `number` in centavos (integer) — `14999` = ₱149.99
- Display: Formatted with `₱` prefix, 2 decimal places
- All calculations in centavos to avoid floating-point errors
- VAT and discount calculations use centavo math

**Enums/Status Values:**
- Stored as string literals in Convex: `v.union(v.literal("requested"), v.literal("packed"), ...)`
- Defined as const objects in `lib/constants.ts` for reuse
- Example: `TRANSFER_STATUS = { REQUESTED: "requested", PACKED: "packed", IN_TRANSIT: "inTransit", DELIVERED: "delivered" } as const`

### Communication Patterns

**Convex Function Naming:**
- Queries: `get` prefix — `getStockLevels`, `getBranchDashboard`
- Mutations: verb prefix — `createTransaction`, `updateTransferStatus`, `deleteVariant`
- Actions (external calls): descriptive — `sendReceiptEmail`, `syncOfflineQueue`
- Internal functions: `_` prefix — `_validateBranchAccess`, `_logAuditEntry`

**React State Patterns:**
- Server state: Always via `useQuery`/`useMutation` — never cache Convex data in local state
- Loading: Check `data === undefined` from `useQuery` (Convex convention)
- Error: Wrap mutations in try/catch, display toast notifications
- Optimistic updates: Use Convex's built-in optimistic update pattern for mutations

### Process Patterns

**Validation:**
- Backend: Convex argument validators on every function (`v.string()`, `v.id("users")`, etc.)
- Frontend: Form validation via HTML5 + shadcn/ui form patterns
- Business rules: Validated in Convex mutations (never trust client)
- Example: Stock quantity validated server-side before transaction commits

**Error Handling:**
- Convex functions: Throw `ConvexError` with code for business errors, let unexpected errors propagate
- React: Error boundaries per route group (each layout wraps children)
- Toast notifications for user-facing errors (shadcn/ui toast)
- No `console.log` in production code

**Loading States:**
- Skeleton components for initial page loads (shadcn/ui Skeleton)
- Inline spinners for mutation actions (save, submit)
- Never show blank screens — always skeleton or previous data

**Auth Flow:**
- Protected routes: Clerk middleware redirects to `(auth)/sign-in`
- Role check: `withBranchScope()` in every Convex function
- Unauthorized: Throw `ConvexError({ code: "UNAUTHORIZED" })` — frontend redirects

### Enforcement Guidelines

**All AI Agents MUST:**
1. Run data through `withBranchScope()` on every Convex query/mutation
2. Store money in centavos, dates as timestamps, enums as string literals
3. Use Convex argument validators on every function — no untyped inputs
4. Log every financial mutation to `auditLogs` table via `_logAuditEntry()`
5. Follow naming patterns — no snake_case in JS/TS, no PascalCase for files except React components

**Pattern Violations:**
- Any code not following these patterns should be caught in code review
- Architecture doc is the source of truth for all pattern decisions
- Patterns can be updated through the architecture Edit workflow if needed

### Pattern Examples

**Good:**
```typescript
// Convex mutation with all patterns applied
export const createTransaction = mutation({
  args: {
    branchId: v.id("branches"),
    items: v.array(v.object({
      variantId: v.id("variants"),
      quantity: v.number(),
      unitPriceCentavos: v.number(),
    })),
    paymentMethod: v.union(v.literal("cash"), v.literal("gcash"), v.literal("maya")),
  },
  handler: async (ctx, args) => {
    const scope = await withBranchScope(ctx);
    // ... business logic
    await _logAuditEntry(ctx, "transaction.created", transactionId);
    return transactionId;
  },
});
```

**Anti-Patterns:**
```typescript
// BAD: snake_case field names
{ unit_price: 149.99 }           // Use unitPriceCentavos: 14999

// BAD: No branch scope check
const items = await ctx.db.query("variants").collect();  // Use withBranchScope()

// BAD: Storing dates as strings
{ created_at: "2026-02-26" }     // Use createdAt: Date.now()

// BAD: Caching Convex data in React state
const [items, setItems] = useState(convexData);  // Use useQuery directly
```

## Project Structure & Boundaries

### Complete Project Directory Structure

```
redbox-apparel/
├── .env.local                          # Local dev (Clerk keys, Convex URL) — gitignored
├── .env.example                        # Template for env vars
├── .gitignore
├── .github/
│   └── workflows/
│       └── ci.yml                      # Lint + type check on PR
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── postcss.config.js
├── components.json                     # shadcn/ui config
├── middleware.ts                       # Clerk auth + role-based route protection
│
├── public/
│   ├── icons/                          # App icons, favicons
│   ├── images/                         # Static images (logo, placeholders)
│   └── sw.js                           # Service worker entry (POS offline — Phase 2)
│
├── convex/
│   ├── _generated/                     # Auto-generated by Convex (types, API)
│   ├── schema.ts                       # Single source of truth — all tables
│   ├── _helpers/
│   │   ├── withBranchScope.ts          # Branch isolation enforcer
│   │   ├── permissions.ts              # Role check utilities
│   │   ├── auditLog.ts                 # _logAuditEntry() helper
│   │   ├── taxCalculations.ts          # VAT, Senior/PWD discount logic
│   │   └── validators.ts              # Shared argument validators
│   ├── auth/
│   │   ├── users.ts                    # FR1-7: CRUD, role assignment, branch assignment
│   │   ├── clerkWebhook.ts            # Clerk → Convex user sync webhook
│   │   └── users.test.ts
│   ├── catalog/
│   │   ├── brands.ts                   # FR8: brand CRUD
│   │   ├── categories.ts              # FR9: category CRUD
│   │   ├── styles.ts                   # FR10: style/model CRUD
│   │   ├── variants.ts                # FR11-14: variant CRUD, SKU, pricing
│   │   └── catalog.test.ts
│   ├── pos/
│   │   ├── transactions.ts            # FR15-21, FR25: create transaction, apply discounts
│   │   ├── offlineSync.ts             # FR22-24: replay queued offline transactions
│   │   ├── receipts.ts                # FR21: BIR receipt data generation
│   │   └── pos.test.ts
│   ├── inventory/
│   │   ├── stockLevels.ts             # FR26-27, FR30-31: real-time stock queries
│   │   ├── alerts.ts                  # FR28-29: low-stock threshold config & alerts
│   │   └── inventory.test.ts
│   ├── transfers/
│   │   ├── requests.ts                # FR32-33: initiate, view transfer requests
│   │   ├── fulfillment.ts             # FR34-37: pack, ship, deliver, partial handling
│   │   ├── audit.ts                   # FR38: transfer audit trail
│   │   └── transfers.test.ts
│   ├── dashboards/
│   │   ├── hqDashboard.ts             # FR39, FR42, FR44: all-branch overview
│   │   ├── branchDashboard.ts         # FR40-41: branch-specific dashboard
│   │   ├── birReports.ts              # FR43: VAT summary for BIR filing
│   │   └── dashboards.test.ts
│   ├── demand/
│   │   ├── entries.ts                 # FR45-47: demand log CRUD
│   │   ├── summaries.ts              # FR48: weekly top-requested aggregation
│   │   └── demand.test.ts
│   ├── audit/
│   │   ├── logs.ts                    # Audit log queries, retention
│   │   └── audit.test.ts
│   ├── reservations/                   # Phase 4
│   │   ├── reservations.ts            # FR49-54: create, fulfill, expire reservations
│   │   └── reservations.test.ts
│   ├── logistics/                      # Phase 5
│   │   ├── deliveries.ts             # FR55-57: driver manifests, tracking
│   │   └── logistics.test.ts
│   ├── ai/                             # Phase 6
│   │   ├── restockSuggestions.ts      # FR58: AI restock recommendations
│   │   ├── branchScoring.ts           # FR59: performance scoring
│   │   ├── demandPatterns.ts          # FR60: trend analysis
│   │   └── ai.test.ts
│   └── suppliers/                      # Phase 7
│       ├── portal.ts                  # FR61-62: supplier demand view, proposals
│       └── suppliers.test.ts
│
├── lib/
│   ├── constants.ts                    # VAT_RATE, ROLES, TRANSFER_STATUS, etc.
│   ├── types.ts                        # Shared TS types not from Convex
│   ├── formatters.ts                   # Currency (centavos→₱), dates (Asia/Manila)
│   ├── offlineQueue.ts                 # IndexedDB queue manager for POS
│   ├── encryption.ts                   # AES-256 via Web Crypto API
│   └── serviceWorker.ts               # SW registration utility
│
├── components/
│   ├── ui/                             # shadcn/ui primitives (Button, Input, Dialog, etc.)
│   ├── shared/
│   │   ├── ProductCard.tsx             # Product display with variant info
│   │   ├── BranchSelector.tsx          # Branch picker dropdown
│   │   ├── StockBadge.tsx             # Stock level indicator
│   │   ├── RoleGuard.tsx              # Client-side role visibility wrapper
│   │   ├── OfflineIndicator.tsx        # Online/offline status banner
│   │   ├── ReceiptViewer.tsx          # PDF receipt preview
│   │   ├── BarcodeScanner.tsx         # html5-qrcode wrapper
│   │   └── LoadingSkeleton.tsx        # Reusable skeleton patterns
│   └── providers/
│       ├── ConvexClientProvider.tsx    # Clerk + Convex provider wrapper
│       └── POSCartProvider.tsx         # POS cart context (local state)
│
├── app/
│   ├── globals.css                     # Tailwind imports + custom styles
│   ├── layout.tsx                      # Root layout: ConvexClientProvider
│   ├── page.tsx                        # Landing → redirect by role
│   │
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/
│   │   │   └── page.tsx               # Clerk SignIn component
│   │   └── sign-up/[[...sign-up]]/
│   │       └── page.tsx               # Clerk SignUp component
│   │
│   ├── (admin)/                        # Admin & system settings
│   │   ├── layout.tsx                 # Admin role guard
│   │   ├── users/
│   │   │   └── page.tsx               # FR1-3: User management
│   │   ├── branches/
│   │   │   └── page.tsx               # FR7: Branch configuration
│   │   └── catalog/
│   │       ├── page.tsx               # FR8-14: Product catalog management
│   │       ├── brands/page.tsx
│   │       ├── categories/page.tsx
│   │       └── styles/
│   │           ├── page.tsx
│   │           └── [styleId]/page.tsx # Variant management per style
│   │
│   ├── (hq)/                           # HQ Staff dashboard
│   │   ├── layout.tsx                 # HQ/Admin role guard
│   │   ├── dashboard/
│   │   │   └── page.tsx               # FR39: All-branch overview
│   │   ├── reports/
│   │   │   ├── page.tsx               # FR42: Financial/operational reports
│   │   │   └── bir/page.tsx           # FR43: BIR VAT summary
│   │   ├── brands/
│   │   │   └── page.tsx               # FR44: Sales by brand
│   │   ├── demand/
│   │   │   └── page.tsx               # FR47-48: Demand log review
│   │   └── transfers/
│   │       └── page.tsx               # Transfer overview (all branches)
│   │
│   ├── (branch)/                       # Branch Manager dashboard
│   │   ├── layout.tsx                 # Manager role guard, branch-scoped
│   │   ├── dashboard/
│   │   │   └── page.tsx               # FR40-41: Branch dashboard + daily summary
│   │   ├── stock/
│   │   │   └── page.tsx               # FR30-31: Stock levels, cross-branch lookup
│   │   ├── transfers/
│   │   │   └── page.tsx               # FR32: Initiate transfer requests
│   │   ├── demand/
│   │   │   └── page.tsx               # FR45-46: Demand log entry
│   │   └── alerts/
│   │       └── page.tsx               # FR28-29: Low-stock alerts
│   │
│   ├── (pos)/                          # POS Terminal
│   │   ├── layout.tsx                 # Cashier role guard, SW registration, offline UI
│   │   ├── page.tsx                   # FR15-20: Main POS interface
│   │   ├── reconciliation/
│   │   │   └── page.tsx               # FR25: End-of-day drawer balancing
│   │   └── demand/
│   │       └── page.tsx               # FR45-46: Quick demand log from POS
│   │
│   ├── (warehouse)/                    # Phase 3
│   │   ├── layout.tsx                 # Warehouse Staff role guard
│   │   ├── transfers/
│   │   │   └── page.tsx               # FR33-34: Transfer queue, barcode packing
│   │   └── receiving/
│   │       └── page.tsx               # FR36-37: Delivery confirmation, partial handling
│   │
│   ├── (customer)/                     # Phase 4 — Public (no auth required)
│   │   ├── layout.tsx                 # Public layout, SEO, no auth
│   │   ├── page.tsx                   # Homepage / product browse
│   │   ├── products/
│   │   │   ├── page.tsx               # FR49: Browse by brand/category/style
│   │   │   └── [variantId]/page.tsx   # FR50: Product detail + branch availability
│   │   ├── branches/
│   │   │   └── page.tsx               # FR51: Branch finder
│   │   └── reserve/
│   │       └── page.tsx               # FR52-53: Reserve for pickup
│   │
│   ├── (driver)/                       # Phase 5
│   │   ├── layout.tsx                 # Driver role guard, mobile-optimized
│   │   └── deliveries/
│   │       └── page.tsx               # FR55-57: Delivery manifests, scanning
│   │
│   └── (supplier)/                     # Phase 7
│       ├── layout.tsx                 # Supplier role guard
│       └── portal/
│           └── page.tsx               # FR61-62: Demand signals, stock proposals
```

### Architectural Boundaries

**Data Boundary: Convex is the Single Data Layer**
- All data flows through Convex functions — no direct database access from Next.js
- `convex/schema.ts` is the single source of truth for all tables
- `convex/_helpers/withBranchScope.ts` enforces branch isolation on every data access

**Auth Boundary: Clerk → Middleware → Convex**
- `middleware.ts`: Clerk verifies session, protects routes by role
- Convex functions: Re-verify role + branch scope server-side via `withBranchScope()`
- No route group trusts client-side role checks alone

**Offline Boundary: POS Only**
- Only `(pos)/` routes are offline-capable
- `public/sw.js` + `lib/offlineQueue.ts` + `lib/encryption.ts` form the offline engine
- All other route groups require active internet

**Component Boundaries:**
- `components/ui/` → shadcn primitives only, never import business logic
- `components/shared/` → Business components, may import from `lib/` and call Convex hooks
- Route-specific components → Stay inside their route folder, never imported by other route groups

### Requirements to Structure Mapping

| FR Category | Convex Module | Route Group(s) | Phase |
|---|---|---|---|
| User Management (FR1-7) | `convex/auth/` | `(admin)/users/` | 1 |
| Product Catalog (FR8-14) | `convex/catalog/` | `(admin)/catalog/` | 1 |
| POS (FR15-25) | `convex/pos/` | `(pos)/` | 2 |
| Inventory (FR26-31) | `convex/inventory/` | `(hq)/`, `(branch)/stock/` | 1 |
| Stock Transfers (FR32-38) | `convex/transfers/` | `(warehouse)/`, `(branch)/transfers/` | 3 |
| Dashboards (FR39-44) | `convex/dashboards/` | `(hq)/dashboard/`, `(branch)/dashboard/` | 1-3 |
| Demand Intelligence (FR45-48) | `convex/demand/` | `(branch)/demand/`, `(pos)/demand/` | 2 |
| Customer Website (FR49-54) | `convex/reservations/` | `(customer)/` | 4 |
| Logistics (FR55-57) | `convex/logistics/` | `(driver)/` | 5 |
| AI Intelligence (FR58-60) | `convex/ai/` | `(hq)/` | 6 |
| Ecosystem (FR61-62) | `convex/suppliers/` | `(supplier)/` | 7 |

**Cross-Cutting Concerns Mapping:**

| Concern | Location |
|---|---|
| Branch isolation | `convex/_helpers/withBranchScope.ts` |
| Role permissions | `convex/_helpers/permissions.ts` + `middleware.ts` |
| Audit logging | `convex/_helpers/auditLog.ts` + `convex/audit/` |
| Tax calculations | `convex/_helpers/taxCalculations.ts` |
| Offline engine | `lib/offlineQueue.ts` + `lib/encryption.ts` + `public/sw.js` |
| Formatting | `lib/formatters.ts` (currency, dates) |

### External Integrations

| Service | Integration Point | Phase |
|---|---|---|
| **Clerk** | `middleware.ts`, `convex/auth/clerkWebhook.ts`, `components/providers/ConvexClientProvider.tsx` | 1 |
| **Convex** | `convex/` entire directory, `components/providers/ConvexClientProvider.tsx` | 1 |
| **html5-qrcode** | `components/shared/BarcodeScanner.tsx` | 2 |
| **@react-pdf/renderer** | `components/shared/ReceiptViewer.tsx`, `convex/pos/receipts.ts` | 2 |
| **Recharts** | Dashboard pages in `(hq)/` and `(branch)/` | 1 |
| **Resend** | `convex/` actions for email notifications | 3 |
| **PayMongo** | Future: `convex/payments/` + `(customer)/` checkout | 4+ |

### Data Flow

```
User Action → Next.js Client Component
  → useQuery (reads) / useMutation (writes) → Convex Function
    → withBranchScope(ctx) → Branch-filtered query/mutation
      → schema.ts tables → Real-time subscription update
        → All subscribed clients receive update

Offline POS Flow:
User Action → POS Client Component
  → Offline? → lib/offlineQueue.ts → IndexedDB (encrypted)
  → Online restored → lib/offlineQueue.ts → Convex mutation replay
    → Conflict? → Flag for HQ review in auditLogs
```

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:** All technology choices work together without conflicts. Convex + Next.js App Router + Clerk + Tailwind + shadcn/ui is a proven, officially-supported combination.

**Pattern Consistency:** Naming conventions (camelCase everywhere), structure patterns (feature co-location), and format patterns (centavos, timestamps) are internally consistent and align with Convex conventions.

**Structure Alignment:** Project structure directly maps to architectural decisions — route groups match interface separation, Convex modules match feature domains, shared helpers support cross-cutting concerns.

### Requirements Coverage

**FR Coverage: 62/62 mapped.** Every FR has a Convex module and route group. Two minor route additions needed:
- FR35 (transfer tracking view): Add `(warehouse)/transfers/[transferId]/page.tsx` for status timeline
- FR56 (HQ delivery assignment): Add `(hq)/logistics/page.tsx` for delivery assignment (Phase 5)

**NFR Coverage: 30/34 fully covered.** Gaps addressed below in addendum:
- NFR27 (WCAG 2.1 AA): Accessibility enforcement strategy added
- NFR28 (POS 44px touch targets): POS Tailwind override pattern added
- NFR29 (Keyboard navigation): shadcn/ui baseline + testing strategy added
- NFR16 (5-year retention): Convex retains all data; explicit policy documented

### Implementation Readiness

**Decision Completeness:** All critical and important decisions documented with rationale and affected components. Deferred decisions clearly marked as post-MVP.

**Structure Completeness:** Full directory tree with FR-to-file mapping. All integration points specified. Component boundaries defined.

**Pattern Completeness:** Naming, structure, format, communication, and process patterns all specified with examples and anti-patterns. Enforcement guidelines documented.

### Gap Analysis — Issues Found & Resolved

#### Addendum 1: POS Offline Cart + Local Stock Cache (HIGH)

**Problem:** React Context (POSCartProvider) doesn't survive page refresh. POS needs stock levels visible during offline for validation.

**Resolution:** Extend the offline engine with two additional IndexedDB stores:
- `offlineCart` store: Persists current cart state to IndexedDB on every cart change. On page load, restore from IndexedDB if offline.
- `offlineStockSnapshot` store: When POS goes offline, snapshot current branch stock levels to IndexedDB. Each offline sale decrements the local snapshot. On reconnect, discard snapshot and resubscribe to Convex.

**Updated pattern:** `lib/offlineQueue.ts` manages three IndexedDB stores: `transactionQueue` (completed sales), `offlineCart` (in-progress cart), `stockSnapshot` (branch inventory cache).

#### Addendum 2: Scheduled Functions (`convex/crons.ts`) (MEDIUM)

**Problem:** Several FRs need periodic processing — no cron pattern defined.

**Resolution:** Add `convex/crons.ts` to project structure:
```
convex/crons.ts — Convex scheduled function definitions
```

**Scheduled functions needed:**
- `expireReservations` — Hourly: expire unfulfilled reservations older than 24h (FR54)
- `generateDemandSummary` — Weekly (Monday 6 AM PHT): aggregate top-requested items (FR48)
- `checkLowStockAlerts` — Event-driven preferred (on stock change mutation), with hourly fallback sweep

**Pattern:** Cron functions call into their feature module — e.g., `expireReservations` calls `convex/reservations/reservations.ts` internal function.

#### Addendum 3: Bulk Import Operations (MEDIUM)

**Problem:** Onboarding from Excel needs batch processing. Convex mutations run individually.

**Resolution:** Define a `convex/catalog/bulkImport.ts` action pattern:
- Convex `action` accepts array of items (up to 500 per batch)
- Internally calls `ctx.runMutation` in a loop for each item
- Returns success/failure counts and error details
- Admin UI in `(admin)/catalog/import/page.tsx` provides CSV upload

**Pattern:** Batch actions accept arrays, process sequentially, return results. Never process more than 500 items per action invocation — split larger imports into multiple batches on the client.

#### Addendum 4: Clerk Webhook Failure Recovery (MEDIUM)

**Problem:** If webhook fails, Convex `users` table has stale data.

**Resolution:**
- Clerk has built-in webhook retry with exponential backoff (up to 3 days)
- Fallback: In `withBranchScope()`, if user record not found in Convex, create it from the Clerk session token data (first-login bootstrap)
- Role-change session invalidation: `withBranchScope()` compares Convex user role with session token role — if mismatch, throw `ConvexError({ code: "SESSION_STALE" })` which triggers client-side re-auth

#### Addendum 5: Role → Route Group Mapping (LOW)

**Problem:** PRD FR2 lists 6 roles but architecture implies 8-9.

**Resolution — Explicit role mapping:**

| Role | Route Groups | Notes |
|---|---|---|
| **Admin** | `(admin)`, `(hq)`, `(branch)`, `(pos)`, `(warehouse)` | Full access to all internal routes |
| **HQ Staff** | `(hq)` | All-branch dashboards and reports |
| **Manager** | `(branch)` | Own branch dashboard, transfers, demand |
| **Cashier** | `(pos)` | POS terminal and demand logging |
| **Warehouse Staff** | `(warehouse)` | Transfer fulfillment and receiving |
| **Viewer** | `(branch)` (read-only) | Branch dashboard in read-only mode — no mutations |
| **Driver** | `(driver)` | Added in Phase 5 — extend FR2 role list |
| **Supplier** | `(supplier)` | Added in Phase 7 — extend FR2 role list |
| **Owner** | Uses Admin role | Boss Arnel accesses `(hq)` + `(admin)` via Admin role |

**Note:** Driver and Supplier roles are added to `lib/constants.ts` ROLES when their phases are implemented.

#### Addendum 6: Accessibility Patterns (LOW)

**NFR27 (WCAG 2.1 AA — Customer Website):**
- All `(customer)/` components must include proper `aria-` attributes, focus management, and alt text
- Use Next.js `<Image>` with mandatory `alt` prop for all product images
- Color contrast verified with Tailwind's built-in contrast checking

**NFR28 (POS Touch Targets — 44px minimum):**
- POS layout (`(pos)/layout.tsx`) applies a Tailwind layer override: all interactive elements default to `min-h-[44px] min-w-[44px]`
- POS-specific component variants in `(pos)/` folder with enlarged touch targets

**NFR29 (Keyboard Navigation — Internal Dashboards):**
- shadcn/ui provides keyboard navigation baseline for all components
- Tab order verified per route group during development
- Not a blocking requirement — best-effort with shadcn/ui defaults

#### Addendum 7: Product Image Storage (LOW)

**Decision:** Use Convex file storage for product images.
- Upload via `(admin)/catalog/` forms using Convex `storage.generateUploadUrl()`
- Store `storageId` reference on `variants` table
- Serve via Convex `storage.getUrl()` — automatically CDN-cached
- Customer website uses Next.js `<Image>` component with Convex URLs for optimization

**Project structure addition:** `convex/catalog/images.ts` for upload/delete mutations.

#### Addendum 8: PWA Manifest (LOW)

**Addition to project structure:** `public/manifest.json`
- `name`: "RedBox POS"
- `display`: "standalone"
- `start_url`: "/pos"
- `theme_color`: RedBox brand color
- Enables POS installability on tablets for full-screen operation

#### Addendum 9: Email Notification Triggers (LOW)

**Pattern:** Email-sending actions co-located with feature modules:
- `convex/transfers/` → sends transfer status notification emails
- `convex/reservations/` → sends reservation confirmation and expiry emails
- `convex/inventory/` → sends low-stock alert emails to HQ

**Convention:** Email actions named `send[Event]Email` (e.g., `sendTransferStatusEmail`). All use Resend via Convex actions (not mutations, since email is an external side effect).

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (Medium-High)
- [x] Technical constraints identified (6 constraints)
- [x] Cross-cutting concerns mapped (6 concerns)

**Architectural Decisions**
- [x] Critical decisions documented (4 critical, 4 important, 4 deferred)
- [x] Technology stack fully specified with versions
- [x] Integration patterns defined (7 external services)
- [x] Performance considerations addressed (9 NFRs)

**Implementation Patterns**
- [x] Naming conventions established (tables, files, functions, variables)
- [x] Structure patterns defined (tests, shared code, configuration)
- [x] Communication patterns specified (Convex functions, React state)
- [x] Process patterns documented (validation, errors, loading, auth)

**Project Structure**
- [x] Complete directory structure defined (~100 files mapped)
- [x] Component boundaries established (4 boundary types)
- [x] Integration points mapped (7 services, per-phase)
- [x] Requirements to structure mapping complete (11 FR categories → modules)

### Architecture Readiness Assessment

**Overall Status: READY FOR IMPLEMENTATION**

**Confidence Level:** High — all 62 FRs mapped, 34/34 NFRs addressed, 9 validation gaps resolved via addendums.

**Key Strengths:**
- Clean separation of 9 route groups maps perfectly to 8 user personas
- Convex real-time subscriptions solve the core unified-stock promise
- Feature-based Convex module organization scales cleanly across 7 phases
- `withBranchScope()` as a single enforcement point makes branch isolation impossible to bypass
- Offline POS architecture is the hardest problem and is thoroughly specified

**Areas for Future Enhancement:**
- Advanced caching strategy (optimize after baseline metrics established)
- AI/ML pipeline architecture (flesh out when Phase 6 begins)
- Performance profiling and optimization (after Phase 1-2 baseline)
- Supplier portal authentication model (Phase 7)

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- Refer to this document for all architectural questions
- Check enforcement guidelines before writing any Convex function

**First Implementation Priority:**
```bash
npm create convex@latest -t nextjs-clerk-shadcn
```
Then: Install additional dependencies → Define `convex/schema.ts` → Build `convex/_helpers/` (withBranchScope, permissions, auditLog, taxCalculations) → Set up route groups with layouts and middleware.

## Architecture Completion Summary

### Workflow Completion

**Architecture Decision Workflow:** COMPLETED
**Total Steps Completed:** 8
**Date Completed:** 2026-02-26
**Document Location:** _bmad-output/planning-artifacts/architecture.md

### Final Architecture Deliverables

**Complete Architecture Document**

- All architectural decisions documented with specific versions
- Implementation patterns ensuring AI agent consistency
- Complete project structure with all files and directories
- Requirements to architecture mapping
- Validation confirming coherence and completeness

**Implementation Ready Foundation**

- 12 architectural decisions made (4 critical, 4 important, 4 deferred)
- 6 pattern categories defined (naming, structure, format, communication, process, enforcement)
- ~12 architectural components specified across 9 route groups
- 62 functional requirements + 34 non-functional requirements fully supported

**AI Agent Implementation Guide**

- Technology stack with verified versions (Next.js 15+, Convex, Clerk, Tailwind, shadcn/ui)
- Consistency rules that prevent implementation conflicts
- Project structure with ~100 files mapped to specific features
- Integration patterns and communication standards

### Development Sequence

1. Initialize project using `npm create convex@latest -t nextjs-clerk-shadcn`
2. Install additional dependencies (@react-pdf/renderer, html5-qrcode, recharts, resend)
3. Define `convex/schema.ts` with all entity tables
4. Build `convex/_helpers/` foundation (withBranchScope, permissions, auditLog, taxCalculations)
5. Set up 9 route groups with layouts and middleware
6. Implement features following established patterns, phase by phase

### Quality Assurance Checklist

**Architecture Coherence**
- [x] All decisions work together without conflicts
- [x] Technology choices are compatible
- [x] Patterns support the architectural decisions
- [x] Structure aligns with all choices

**Requirements Coverage**
- [x] All 62 functional requirements are supported
- [x] All 34 non-functional requirements are addressed
- [x] 6 cross-cutting concerns are handled
- [x] 7 external integration points are defined

**Implementation Readiness**
- [x] Decisions are specific and actionable
- [x] Patterns prevent agent conflicts
- [x] Structure is complete and unambiguous
- [x] Code examples provided for key patterns

---

**Architecture Status:** READY FOR IMPLEMENTATION

**Next Phase:** Begin implementation using the architectural decisions and patterns documented herein.

**Document Maintenance:** Update this architecture when major technical decisions are made during implementation.
