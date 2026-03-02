# System-Level Test Design — RedBox Apparel

**Date:** 2026-02-26
**Author:** FashionMaster
**Status:** Draft
**Mode:** System-Level (Phase 3 — Pre-Implementation Readiness)

---

## Testability Assessment

### Controllability: PASS

The architecture provides strong controllability for testing:

- **State Control:** Convex mutations enable direct database seeding and state manipulation. Every data operation flows through well-typed Convex functions (`convex/schema.ts` with validators), making it straightforward to set up preconditions.
- **Branch Isolation Control:** The centralized `withBranchScope(ctx)` helper in `convex/_helpers/withBranchScope.ts` provides a single point of enforcement — testable in isolation and mockable when testing other concerns.
- **External Dependency Control:**
  - **Clerk:** Webhook-based sync (`convex/auth/clerkWebhook.ts`) means auth state can be seeded directly into Convex's `users` table for integration tests, bypassing Clerk in non-auth-focused tests.
  - **IndexedDB:** Standard browser API — fully mockable in Playwright and unit tests.
  - **Service Worker:** Scoped to `(pos)/` routes only — limited blast radius, testable via Playwright's service worker controls.
- **Error Triggering:** Typed `ConvexError` with codes (`INSUFFICIENT_STOCK`, `INVALID_DISCOUNT`, `TRANSFER_CONFLICT`, `UNAUTHORIZED`, `BRANCH_MISMATCH`, `SYNC_CONFLICT`) enables deterministic error scenario testing.
- **Financial Calculations:** Centralized in `convex/_helpers/taxCalculations.ts` — pure functions testable without any infrastructure.

### Observability: PASS with CONCERNS

- **PASS — Application State:** Convex's reactive `useQuery` subscriptions provide real-time observable state. Every mutation produces queryable results.
- **PASS — Audit Trail:** Immutable audit logs (`_logAuditEntry()`) for all financial transactions and stock movements. 5-year retention policy. Queryable for test verification.
- **PASS — Error Codes:** Typed `ConvexError` codes make test outcomes deterministic — no ambiguous error messages to parse.
- **CONCERN — Production Error Monitoring:** Sentry is deferred to post-MVP. During implementation, there will be no centralized error tracking beyond Convex Dashboard and Vercel Analytics. This means:
  - No automated alerting on unhandled exceptions in production
  - No error aggregation or trend analysis
  - Recommendation: Add basic error boundary logging to Convex actions at minimum
- **PASS — Performance Observability:** Vercel Analytics provides Core Web Vitals (FCP, LCP, CLS). Convex Dashboard monitors backend function execution times and error rates.

### Reliability: PASS

- **Test Isolation:** Convex functions operate on database state without shared in-memory caches — tests targeting different branches are naturally isolated and parallel-safe.
- **Offline Engine Isolation:** IndexedDB queue (`lib/offlineQueue.ts`) and encryption (`lib/encryption.ts`) are architecturally separated from POS UI logic — each can be tested independently.
- **Reproducibility:** Convex's deterministic function execution (validators on every function, typed inputs/outputs) ensures consistent test outcomes.
- **Service Worker Scope:** Limited to `(pos)/` routes — offline behavior won't leak into other interfaces.
- **Cleanup Discipline:** Convex test data can be cleaned via mutations. No shared mutable state between test runs if properly scoped.

---

## Architecturally Significant Requirements (ASRs)

### High-Priority Risks (Score ≥6)

| ASR ID | Category | Requirement | NFR | Probability | Impact | Score | Testability Challenge |
|--------|----------|-------------|-----|-------------|--------|-------|----------------------|
| ASR-001 | SEC | Branch data isolation — 100% of queries filtered by branch scope | NFR11 | 3 | 3 | **9** | Must verify `withBranchScope()` on every Convex query/mutation. Missing a single function = cross-branch data leak. Requires comprehensive automated coverage. |
| ASR-002 | BUS | VAT 12% and Senior/PWD discount accuracy (BIR compliance) | FR17-19 | 2 | 3 | **6** | Complex discount logic (VAT-exempt first, then 20% off base). All money in centavos. Must test edge cases: rounding, zero-item, mixed regular/discount items. |
| ASR-003 | DATA | Zero data loss for offline POS transactions | NFR23 | 2 | 3 | **6** | Offline queue → IndexedDB → AES-256 encryption → sync replay → conflict detection. Multiple failure points: mid-sync network drop, corrupt encryption, duplicate replay. |
| ASR-004 | SEC | Offline data encryption (AES-256 via Web Crypto API) | NFR14 | 2 | 3 | **6** | Must verify encryption roundtrips, key management, and data wipe after sync. Device loss scenario = sensitive financial data exposed if encryption fails. |
| ASR-005 | SEC | Role-based access enforcement server-side on 100% of API requests | NFR12 | 2 | 3 | **6** | 6-8 roles × multiple route groups. Every Convex function must verify role. Missing check = privilege escalation. |
| ASR-006 | PERF | POS transaction completion <3 seconds | NFR1 | 2 | 3 | **6** | Offline mode avoids network latency, but online POS must also meet target. Real-time stock updates + receipt generation must complete within budget. |

### Medium-Priority Risks (Score 3-4)

| ASR ID | Category | Requirement | NFR | Probability | Impact | Score | Notes |
|--------|----------|-------------|-----|-------------|--------|-------|-------|
| ASR-007 | PERF | Real-time stock sync <1 second across branches | NFR3 | 2 | 2 | **4** | Convex handles natively; risk increases with 20 branches + 10K variants |
| ASR-008 | PERF | Customer website FCP <1s, LCP <2s | NFR5-6 | 2 | 2 | **4** | Next.js + Vercel should handle; risk with large product catalog |
| ASR-009 | OPS | 99.5% uptime during business hours (8 AM - 10 PM PHT) | NFR25 | 1 | 3 | **3** | Platform-managed (Vercel + Convex); low probability but high impact |
| ASR-010 | SEC | Session expiry after 30 min inactivity; force re-login on role change | NFR15 | 2 | 2 | **4** | Clerk manages sessions; must verify POS behavior on session expiry during transaction |
| ASR-011 | DATA | Sync conflict resolution (last-write-wins + HQ review flag) | NFR24 | 2 | 2 | **4** | Conflict scenarios: two branches modify same stock offline simultaneously |
| ASR-012 | PERF | Support 20 branches × 2-3 POS terminals simultaneously | NFR17-18 | 1 | 3 | **3** | Convex scales horizontally; stress test needed at 60 concurrent connections |

### Low-Priority Risks (Score 1-2)

| ASR ID | Category | Requirement | NFR | Probability | Impact | Score | Action |
|--------|----------|-------------|-----|-------------|--------|-------|--------|
| ASR-013 | OPS | Convex handles data backup natively | NFR26 | 1 | 2 | **2** | Monitor; platform-managed |
| ASR-014 | PERF | Demand log entry <30 seconds | NFR9 | 1 | 1 | **1** | Monitor; simple form submission |
| ASR-015 | BUS | WCAG 2.1 AA on customer website | NFR27 | 1 | 2 | **2** | Standard compliance; shadcn/ui baseline helps |

---

## Test Levels Strategy

Based on architecture analysis: **UI-heavy multi-interface system with significant business logic and offline capabilities.**

### Recommended Split: 40 / 35 / 25

| Level | Percentage | Rationale |
|-------|-----------|-----------|
| **Unit** | 40% | Heavy business logic: VAT/discount calculations, validators, branch scope helpers, audit logging, demand aggregation, AI scoring algorithms. All in `convex/_helpers/` and pure functions — fast, isolated, high coverage value. |
| **Integration** | 35% | Convex function testing is the backbone: mutations with validators, branch-scoped queries, real-time subscription behavior, Clerk webhook sync, transfer workflow state machine, reservation lifecycle. Integration tests validate Convex functions end-to-end without browser overhead. |
| **E2E** | 25% | 5 distinct interfaces (POS, HQ, Branch, Customer, Warehouse/Driver). Critical user journeys: POS scan-to-receipt, offline mode transition, transfer workflow, customer reservation, dashboard load. E2E validates the complete stack including real-time subscriptions and offline behavior. |

### Test Framework Recommendations

| Framework | Purpose | Scope |
|-----------|---------|-------|
| **Vitest** | Unit tests | `convex/_helpers/`, pure functions, validators, calculations |
| **Convex Test Utils** | Integration tests | Convex functions (queries, mutations, actions), schema validation |
| **Playwright** | E2E tests | Multi-interface user journeys, offline simulation, accessibility |
| **k6** | Performance tests | Load testing (60 concurrent POS terminals), stress testing (3-5x peak) |

---

## NFR Testing Approach

### Security (NFR10-NFR16)

**Approach:** Defense-in-depth with automated verification at every layer.

| NFR | Test Strategy | Level | Tools |
|-----|--------------|-------|-------|
| NFR10 (Authentication) | Verify Clerk session required on all routes; test unauthenticated access redirects | E2E + Integration | Playwright (route access), Convex tests (function auth checks) |
| NFR11 (Branch Isolation) | **CRITICAL:** Automated test for every Convex query/mutation verifying `withBranchScope()` enforcement. Test: User A (Branch 1) cannot read/write Branch 2 data. | Integration | Convex test utils with multi-branch fixtures |
| NFR12 (RBAC) | Test all 6 roles against all Convex functions. Verify server-side enforcement (not UI-only). | Integration | Convex test utils with role-based test users |
| NFR13 (TLS/Encryption) | Verify HTTPS enforcement (Vercel default); AES-256 at rest for offline data | E2E + Unit | Playwright (HTTPS redirect), Vitest (encryption roundtrip) |
| NFR14 (Offline Encryption) | AES-256 roundtrip tests; verify data wipe after sync; key management | Unit + E2E | Vitest (crypto functions), Playwright (IndexedDB inspection) |
| NFR15 (Session Management) | 30-min expiry; force re-login on role change; POS behavior during session expiry | E2E | Playwright (clock manipulation, session state) |
| NFR16 (Audit Logging) | Verify 100% of financial mutations create audit entries; <500ms write latency | Integration | Convex test utils (mutation → audit query verification) |

**Security Test Pattern:**
```
For each Convex function:
  1. Call without auth → expect UNAUTHORIZED
  2. Call with wrong branch → expect BRANCH_MISMATCH
  3. Call with insufficient role → expect UNAUTHORIZED
  4. Call with valid auth + correct branch + correct role → expect success
```

### Performance (NFR1-NFR9)

**Approach:** Automated SLO validation with k6 load testing and Lighthouse for web vitals.

| NFR | Target | Test Strategy | Tools |
|-----|--------|--------------|-------|
| NFR1 (POS Transaction) | <3 seconds | E2E timing measurement; k6 for concurrent POS load | Playwright + k6 |
| NFR2 (Barcode Scan Feedback) | <500ms | E2E timing measurement from scan event to price display | Playwright |
| NFR3 (Stock Sync) | <1 second | Integration test measuring Convex subscription latency | Convex test utils + timing |
| NFR4 (HQ Dashboard Load) | <2 seconds | E2E with Lighthouse audit | Playwright + Lighthouse |
| NFR5-6 (Customer FCP/LCP) | <1s / <2s | Lighthouse CI with threshold enforcement | Lighthouse CI |
| NFR7 (Offline Storage) | <200ms | Unit test measuring IndexedDB write latency | Vitest + IndexedDB mock |
| NFR8 (Offline Sync) | <30 seconds | E2E test: go offline → queue transactions → reconnect → measure sync time | Playwright |
| NFR19 (Peak Traffic 3-5x) | No degradation | k6 stress test: ramp to 200 concurrent users | k6 |

### Reliability (NFR22-NFR26)

**Approach:** Offline resilience testing and data integrity verification.

| NFR | Test Strategy | Level | Tools |
|-----|--------------|-------|-------|
| NFR22 (POS Offline) | Service worker intercept; POS functions during network disconnect; UI shows ConnectionIndicator | E2E | Playwright (context.setOffline) |
| NFR23 (Zero Data Loss) | Queue N transactions offline → reconnect → verify all N exist in Convex | E2E + Integration | Playwright + Convex verification queries |
| NFR24 (Sync Conflicts) | Two branches modify same stock offline → sync both → verify conflict flagged for HQ review | Integration | Convex test utils (simulate dual-branch conflict) |
| NFR25 (99.5% Uptime) | Monitor via Vercel Analytics + Convex Dashboard; no automated test needed | OPS | Vercel + Convex dashboards |
| NFR26 (Data Backup) | Platform-managed (Convex); verify with periodic restore test | OPS | Manual quarterly verification |

### Maintainability

**Approach:** CI-enforced quality gates.

| Metric | Target | Enforcement |
|--------|--------|-------------|
| Test Coverage (critical paths) | ≥80% | Vitest coverage report in CI |
| Code Duplication | <5% | jscpd in CI pipeline |
| TypeScript Strict Mode | Enforced | `tsconfig.json` strict: true |
| Dependency Vulnerabilities | 0 critical/high | `npm audit` in CI |
| Error Tracking | CONCERNS | No Sentry until post-MVP — add basic Convex action error logging |

---

## Test Environment Requirements

### Local Development

| Component | Setup |
|-----------|-------|
| Next.js 15 | `npm run dev` (localhost:3000) |
| Convex | `npx convex dev` (local dev deployment) |
| Clerk | Dev instance with test users |
| Database | Convex dev deployment (separate from prod) |
| Offline Testing | Chrome DevTools Network throttling + Playwright `setOffline()` |

### CI/CD (GitHub Actions)

| Job | Purpose | Duration Target |
|-----|---------|----------------|
| Lint + Type Check | TypeScript strict mode, ESLint | <2 min |
| Unit Tests | Vitest — helpers, calculations, validators | <3 min |
| Integration Tests | Convex function tests with test deployment | <5 min |
| E2E Tests | Playwright — critical user journeys (smoke) | <10 min |
| Lighthouse | Customer website Core Web Vitals | <3 min |
| Security Audit | npm audit, dependency scan | <1 min |

### Staging

| Component | Setup |
|-----------|-------|
| Vercel | Preview deployment per PR |
| Convex | Preview deployment (separate data) |
| Clerk | Staging instance |
| Test Data | Seeded via Convex mutations (5 branches, 100 products, 6 test users with different roles) |

### Performance Testing

| Component | Setup |
|-----------|-------|
| k6 | Run against staging environment |
| Load Profile | 60 concurrent connections (20 branches × 3 terminals) |
| Stress Profile | 200 concurrent connections (3-5x peak) |
| Data Volume | 10,000 product variants, 3 years simulated transaction history |

---

## Testability Concerns

### CONCERN 1: No Production Error Monitoring (Moderate)

**Issue:** Sentry deferred to post-MVP. No centralized error tracking beyond Convex Dashboard and Vercel Analytics.

**Impact:** Cannot detect, aggregate, or alert on unhandled exceptions in production. Silent failures in offline sync, background scheduled functions (expireReservations, generateDemandSummary), or edge-case UI errors will go unnoticed.

**Recommendation:** At minimum, implement error boundary logging in Convex actions that writes to an `errorLogs` table. Add a simple admin view to surface recent errors. This is not a blocker but should be addressed in Epic 1 or early Sprint 0.

### CONCERN 2: Clerk Integration Testing Complexity (Low)

**Issue:** Clerk is an external auth provider. Testing auth flows end-to-end requires either Clerk's test mode or mocking the webhook sync.

**Impact:** Integration tests that bypass Clerk (seeding users directly into Convex) won't catch webhook sync issues. E2E tests using real Clerk will be slower and require test API keys.

**Recommendation:** Dual strategy — Integration tests seed Convex directly (fast, isolated). E2E smoke tests use Clerk's test mode for auth flow validation. Document Clerk test key management.

### CONCERN 3: Offline POS Testing Requires Device Testing (Low)

**Issue:** Service Worker + IndexedDB + AES-256 encryption behavior can differ between browsers and devices. Playwright can simulate offline but may not catch all device-specific issues.

**Recommendation:** Include manual testing on actual iPad/Android tablets in QA process for Epic 4 (POS Offline Mode). Automate what's possible in Playwright, flag the rest for manual verification.

### No Blockers Identified

All concerns are addressable within the current architecture. No testability concerns rise to FAIL level.

---

## Recommendations for Sprint 0

### 1. Test Framework Setup (`*framework` workflow)

- [ ] Initialize **Vitest** for unit testing (`convex/_helpers/` and pure functions)
- [ ] Configure **Convex test utilities** for integration testing (test deployment, fixtures)
- [ ] Initialize **Playwright** for E2E testing with project configurations for each interface:
  - `pos` project (tablet viewport: 1024×768)
  - `hq` project (desktop viewport: 1440×900)
  - `customer` project (mobile viewport: 375×812)
  - `warehouse` project (mobile viewport: 375×667)
- [ ] Set up **test data factories** for: users (per role), branches, products (Brand→Category→Style→Variant), transactions
- [ ] Configure **Convex test deployment** separate from dev/staging

### 2. CI Pipeline Setup (`*ci` workflow)

- [ ] GitHub Actions workflow with staged jobs:
  1. Lint + Type Check (<2 min)
  2. Unit Tests with coverage (<3 min)
  3. Integration Tests (<5 min)
  4. E2E Smoke Tests (<10 min)
- [ ] Coverage threshold enforcement (80% for `convex/_helpers/`)
- [ ] Lighthouse CI for customer website routes
- [ ] `npm audit` for dependency vulnerability scanning

### 3. Critical Test Infrastructure

- [ ] **Branch isolation test harness:** Automated script that tests every Convex query/mutation with cross-branch access attempts. This should be a P0 requirement before any branch-specific feature ships.
- [ ] **Tax calculation test suite:** Comprehensive unit tests for `convex/_helpers/taxCalculations.ts` covering VAT 12%, Senior/PWD discount (VAT-exempt then 20%), rounding behavior with centavos, and mixed-discount transactions.
- [ ] **Offline test fixtures:** Playwright helpers for offline mode simulation, IndexedDB inspection, and sync verification.

### 4. Test Data Seeding Strategy

- [ ] **Factory functions** in `tests/factories/`:
  - `createTestUser({ role, branchId })` — creates Convex user with Clerk-like metadata
  - `createTestBranch({ name, address })` — creates branch with settings
  - `createTestProduct({ brand, category, style, variants[] })` — creates full hierarchy
  - `createTestTransaction({ branchId, items[], discountType })` — creates POS transaction
- [ ] **Cleanup discipline:** Auto-cleanup via test teardown; unique IDs per test run

---

## Risk Category Legend

- **TECH**: Technical/Architecture (flaws, integration, scalability)
- **SEC**: Security (access controls, auth, data exposure)
- **PERF**: Performance (SLA violations, degradation, resource limits)
- **DATA**: Data Integrity (loss, corruption, inconsistency)
- **BUS**: Business Impact (UX harm, logic errors, revenue, compliance)
- **OPS**: Operations (deployment, config, monitoring)

---

## Summary

| Metric | Value |
|--------|-------|
| **Testability Assessment** | PASS (all 3 dimensions) |
| **ASRs Identified** | 15 |
| **High-Priority (Score ≥6)** | 6 |
| **Medium-Priority (Score 3-4)** | 6 |
| **Low-Priority (Score 1-2)** | 3 |
| **Test Level Split** | Unit 40% / Integration 35% / E2E 25% |
| **Testability Concerns** | 3 (all CONCERNS, no blockers) |
| **Recommended Frameworks** | Vitest, Convex Test Utils, Playwright, k6 |
| **Gate Recommendation** | **PASS** — Architecture is testable with no blocking concerns |

---

## Appendix

### Knowledge Base References

- `nfr-criteria.md` — NFR validation approach (security, performance, reliability, maintainability)
- `test-levels-framework.md` — Test level selection guidance
- `risk-governance.md` — Risk classification and gate decision framework
- `test-quality.md` — Quality standards and Definition of Done

### Related Documents

- PRD: `_bmad-output/planning-artifacts/prd.md`
- Architecture: `_bmad-output/planning-artifacts/architecture.md`
- Epics: `_bmad-output/planning-artifacts/epics.md`
- UX Design: `_bmad-output/planning-artifacts/ux-design-specification.md`

---

**Generated by**: BMad TEA Agent — Test Architect Module
**Workflow**: `_bmad/bmm/testarch/test-design`
**Version**: 4.0 (BMad v6)
**Mode**: System-Level (Phase 3)
