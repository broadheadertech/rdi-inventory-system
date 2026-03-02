---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
inputDocuments:
  - '_bmad-output/planning-artifacts/product-brief-redbox-apparel-2026-02-25.md'
  - '_bmad-output/analysis/brainstorming-session-2026-02-25.md'
workflowType: 'prd'
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 1
  projectDocs: 0
  projectContext: 0
classification:
  projectType: 'Web Application (Multi-interface)'
  domain: 'Retail / Unified Commerce'
  complexity: 'Medium-High'
  projectContext: 'Greenfield'
userNotes:
  - 'RedBox caters branded apparel (Nike, Adidas, etc.) - Brand is a first-class entity in product catalog'
---

# Product Requirements Document - redbox-apparel

**Author:** FashionMaster
**Date:** 2026-02-25

## Executive Summary

**Product:** RedBox Apparel — a unified commerce platform for Philippine multi-branch branded apparel retail.

**Differentiator:** No existing POS or commerce platform in the Philippines serves multi-branch branded apparel retail with its unique needs: brand hierarchy (Nike, Adidas, etc.), size/color/gender variants, multi-branch stock balancing, and floor-level demand intelligence. RedBox fills this vertical gap.

**Target Users:** HQ staff, branch managers, cashiers, warehouse staff, drivers, customers, suppliers, and the business owner — spanning 5+ physical branches across Metro Manila.

**Core Value Proposition:**
- Replaces Excel-based tracking with real-time unified stock across all branches
- Offline-first POS ensures sales continue during internet outages
- Floor-level demand intelligence captures what customers want but can't buy
- Reverse commerce model: website drives foot traffic via Check → Reserve → Pickup → Repeat

**Tech Stack:** Next.js 15 (App Router), Convex (real-time DB), Clerk (auth), Tailwind + shadcn/ui, @react-pdf/renderer (BIR receipts), html5-qrcode (barcode scanning), Recharts (analytics), Resend (email), Vercel (hosting)

## Success Criteria

### User Success

| Role | Success Indicator | Measurable Target |
|---|---|---|
| **Ate Lisa (HQ Staff)** | Real-time visibility into all branch sales, stock levels, and brand performance — no more Excel chasing | Dashboard loads all-branch overview in <2 seconds; zero manual consolidation needed |
| **Kuya Renz (Branch Manager)** | Knows exactly what's selling, what customers are asking for, and what to restock — with branch scoring transparency | Can generate branch performance report in 1 click; logs customer demand inquiries daily |
| **Ate Karen (Cashier)** | Fast checkout with auto-discounts (Senior/PWD/VAT), plus ability to log what customers are looking for (brands, designs, sizes) | Transaction completes in <3 seconds; demand logging takes <30 seconds per entry |
| **Kuya Mark (Warehouse)** | Accurate stock counts, clear transfer workflows, no guessing what branches need | Stock counts match physical inventory 98%+; transfer requests processed same-day |
| **Ate Dianne (Driver)** | Clear delivery routes, confirmed transfers, no wasted trips | Delivery completion rate 95%+; zero unconfirmed transfers |
| **Jessa (Customer)** | Check branch stock online → reserve → pick up at branch → repeat | Stock accuracy on website 95%+; reservation-to-pickup conversion 80%+ |
| **Mang Tony (Supplier)** | See demand trends per brand/branch proactively, fewer wasted proposals | Receives demand signals before stockout; proposal acceptance rate increases 30%+ |
| **Boss Arnel (Owner)** | Freed-up time, pesos saved, system running smoothly across all branches | 60% reduction in decision-to-action time within 3 months |

### Business Success

| Timeframe | Success Criteria |
|---|---|
| **3-Month** | All branches on unified system; Excel tracking eliminated; real-time stock sync live; HQ dashboard operational; POS processing all transactions with correct VAT/discount calculations |
| **12-Month** | Brand performance analytics driving procurement decisions; customer website live with reserve-and-pickup; branch scoring operational; AI restock suggestions active; demand logging insights informing inventory decisions |
| **3-5 Year** | Full ecosystem self-sustaining; HQ and all branches running smoothly without major problems; supplier portal active; customer loyalty loop (check → reserve → pickup → repeat) driving measurable repeat traffic |

### Technical Success

| Metric | Target |
|---|---|
| **Real-time stock sync** | Updates propagate across all branches within seconds (Convex real-time subscriptions) |
| **POS transaction speed** | Complete sale (scan → discount calc → receipt) in <3 seconds |
| **Website stock accuracy** | No "ghost inventory" — displayed availability matches actual branch stock 95%+ |
| **Peak load resilience** | System handles payday weekends and holiday sales (3-5x normal traffic) without degradation |
| **Data integrity** | Stock counts, transfers, and financial records maintain 99.9% accuracy |

### Measurable Outcomes

**North Star Metric:** Time from decision to action across all operations drops by 60% within 3 months.

**Brand Intelligence:**
- HQ can view sales-by-brand per branch in real-time
- Cashier/branch manager demand logs capture what customers are seeking (brands, designs, sizes not currently stocked)
- Demand log data informs procurement — top requested brands/items surfaced to HQ weekly

**Customer Loop Metric:**
- Check → Reserve → Pickup conversion rate tracked per branch
- Repeat customer rate measured (customers who complete the loop 2+ times)

## Product Scope

RedBox is built in 7 phases across 3 horizons. See **Project Scoping & Phased Development** below for detailed feature sets, priority tables, and success gates.

| Horizon | Phases | Summary |
|---|---|---|
| **MVP** | 1-3 (Foundation, Revenue Engine, Stock Flow) | Auth, POS with offline mode, unified inventory, transfers |
| **Growth** | 4-6 (Customer Website, Logistics, AI Intelligence) | Public website, delivery coordination, AI restock suggestions |
| **Vision** | 7 (Ecosystem) | Supplier portal, loyalty program, automated procurement |

### Out of Scope

The following are explicitly deferred until the core platform is proven:

- Virtual try-on / AR features
- Visual search ("snap to find")
- Voice-controlled dashboard
- Customer voting on new products
- Pop-up van triggered by delivery data
- RedBox Wrapped year-in-review
- Style Duels weekly voting
- Self-checkout via customer phone
- Influencer tracking with measurable foot traffic
- International expansion (multi-currency, multi-language)

## User Journeys

### Journey 1: Ate Lisa — "The Morning Command Center"
**Role:** HQ Staff | **Type:** Primary — Happy Path

**Opening Scene:** It's 8:30 AM. Ate Lisa arrives at HQ in Makati, coffee in hand. In the old days, she'd spend the first 2 hours calling branch managers one by one, asking for yesterday's sales numbers, cross-checking with Excel files that were always a day late and never matched.

**Rising Action:** She opens RedBox on her laptop. The HQ Dashboard loads instantly — all 5 branches displayed. She sees Branch 3 (SM Fairview) had a strong day selling Nike running shoes, while Branch 1 (Divisoria) is running low on Adidas slides. A demand log entry catches her eye: Ate Karen at Branch 2 logged that 3 customers asked for New Balance this week — a brand they don't carry yet.

**Climax:** In one screen, without a single phone call, Lisa knows exactly which branches need restocking, which brands are hot, and that there's unmet customer demand for New Balance. She creates a stock transfer from HQ warehouse to Branch 1 for Adidas slides and flags the New Balance demand for Boss Arnel's review.

**Resolution:** By 9:00 AM, she's done what used to take until lunch. The rest of her day is spent on strategic work — analyzing brand trends, coordinating with Mang Tony the supplier, reviewing branch performance scores, and pulling the monthly VAT summary for BIR filing. She no longer needs to hire someone just to chase sales numbers.

**Reveals:** HQ dashboard, multi-branch overview, demand log review, stock transfer initiation, brand analytics, BIR VAT summary

---

### Journey 2: Kuya Renz — "Payday Friday at SM Fairview"
**Role:** Branch Manager | **Type:** Primary — Peak Load Scenario

**Opening Scene:** It's Friday, the 15th — payday. Kuya Renz knows the branch will be packed. He checks the RedBox branch dashboard on his tablet before the doors open. Stock levels are green across most items, but he sees a low-stock alert: only 4 pairs left of the Nike Air Force 1 in white, their top seller.

**Rising Action:** He submits a restock request to HQ with one tap. The morning rush hits — Ate Karen is processing transactions on the POS while a steady stream of customers browse. A customer asks for Adidas Samba in size 10. Renz checks real-time stock: his branch doesn't have it, but Branch 4 (Alabang) has 3 pairs. He logs this as a demand entry and tells the customer they can reserve it online for pickup.

**Climax:** By 3 PM, the branch has processed 87 transactions. The real-time dashboard shows sales are up 20% from last payday. The restock from HQ is already in transit — Ate Dianne is en route. Branch score is climbing.

**Resolution:** End of day: Renz reviews the branch performance summary. He sees what sold, what customers asked for, and the branch score. No Excel. No calling HQ. Everything is in the system.

**Reveals:** Branch dashboard, low-stock alerts, restock requests, cross-branch stock visibility, demand logging, branch scoring, real-time sales tracking

---

### Journey 3: Ate Karen — "The 3-Second Checkout"
**Role:** Cashier | **Type:** Primary — Happy Path + Edge Case (Senior Discount)

**Opening Scene:** A customer walks up to the counter with two pairs of Nike shoes. Ate Karen greets them and reaches for the barcode scanner.

**Rising Action:** Scan, scan — both items appear on the POS screen with correct prices. Total: ₱7,800. The customer presents a Senior Citizen ID. Karen taps "Senior/PWD Discount" — the system automatically applies the 20% discount AND removes VAT, recalculating to ₱5,571.43. The BIR-compliant receipt generates showing the breakdown clearly.

**Climax:** Total transaction time: under 3 seconds from last scan to receipt. The customer is impressed with the speed and clear receipt.

**Edge Case:** After the customer leaves, another customer asks: "Do you have New Balance 574 in gray?" Karen checks stock — not available in any branch. She taps the demand log button, types "New Balance 574 gray size 9" in 15 seconds. This feeds directly into HQ's demand intelligence.

**Resolution:** Karen has processed 45 transactions today without a single manual discount calculation or handwritten receipt. Every customer inquiry she logged is now visible to Ate Lisa at HQ.

**Reveals:** POS barcode scanning, auto VAT/discount calculation, BIR receipt generation, demand logging, stock lookup

---

### Journey 4: Jessa — "Check, Reserve, Pick Up, Repeat"
**Role:** Customer | **Type:** Primary — The Customer Loop

**Opening Scene:** Jessa is scrolling Instagram and sees a friend wearing Nike Dunk Low in panda colorway. She wants a pair but doesn't want to waste time visiting branches that don't have her size.

**Rising Action:** She opens the RedBox website on her phone. She browses by brand → Nike → Dunk Low. The page shows real-time stock: Branch 2 (MOA) has her size 7. Branch 5 (Trinoma) also has it. She picks MOA because it's closer.

**Climax:** She taps "Reserve for Pickup," enters her name and phone number. She gets a confirmation with a 24-hour pickup window. She heads to MOA after work, walks straight to the counter, gives her name. Kuya Renz pulls up the reservation, Ate Karen processes the sale. In and out in 5 minutes.

**Resolution:** Two weeks later, Jessa checks the website again for Adidas slides. She's now a repeat customer in the loop: check → reserve → pick up → repeat. No wasted trips, no disappointment.

**Reveals:** Customer website, brand browsing, real-time branch stock display, reserve-for-pickup flow, pickup processing at branch

---

### Journey 5: Kuya Mark — "The Stock Transfer"
**Role:** Warehouse Staff | **Type:** Primary — Operational Flow

**Opening Scene:** Kuya Mark starts his shift at the HQ warehouse at 7 AM. His RedBox dashboard shows 3 pending transfer requests from branches that came in overnight.

**Rising Action:** He reviews each request: Branch 1 needs 20 pairs of Adidas slides, Branch 3 needs 12 pairs of Nike Air Max, Branch 5 needs a mixed box of various sizes. He picks each order from the warehouse shelves, scanning each item's barcode as he packs — the system confirms quantities and updates the transfer status to "Packed."

**Climax:** All items scanned match the request. Zero discrepancies. He marks the transfers as "Ready for Pickup" and assigns them to Ate Dianne for delivery.

**Resolution:** The warehouse stock count is automatically updated. Ate Lisa at HQ can see all three transfers are in motion. Mark's physical count matches the system — 98%+ accuracy maintained.

**Reveals:** Warehouse dashboard, transfer request queue, barcode scanning for transfers, stock count accuracy, transfer status workflow

---

### Journey 6: Ate Dianne — "The Delivery Run"
**Role:** Driver | **Type:** Secondary — Logistics Flow

**Opening Scene:** Ate Dianne checks her RedBox mobile view at 9 AM. Three deliveries assigned from Kuya Mark — Branch 1, Branch 3, Branch 5.

**Rising Action:** She loads the packed boxes into the van. Each delivery has a digital manifest she can check on her phone. She starts with Branch 1 (closest). On arrival, Kuya Renz confirms receipt by scanning the delivery — system marks it "Delivered" and stock automatically transfers to Branch 1's inventory.

**Climax:** At Branch 3, a partial issue — one box has a damaged pair. Dianne logs it in the system. The transfer is marked "Partial — 1 item flagged." HQ is notified immediately.

**Resolution:** All 3 deliveries completed by 1 PM. Zero wasted trips. Every transfer confirmed digitally. Ate Lisa at HQ sees all transfers completed in real-time.

**Reveals:** Driver mobile view, delivery manifest, delivery confirmation scanning, partial delivery handling, real-time transfer tracking

---

### Journey 7: Mang Tony — "The Proactive Supplier"
**Role:** Supplier (Nike distributor) | **Type:** Secondary — Ecosystem Flow (Phase 7)

**Opening Scene:** Mang Tony is a Nike distributor in the Philippines. He used to cold-call retail stores, guessing what they needed. Now he logs into the RedBox supplier portal.

**Rising Action:** His dashboard shows demand signals across all RedBox branches: Nike Dunk Low is flying off shelves, Air Force 1 white is consistently requested, and there's growing demand for Nike running shoes at Branch 3. He also sees that lead times matter — Branch 1 tends to reorder every 2 weeks.

**Climax:** Instead of guessing, Tony proactively sends a proposal to Boss Arnel: "Based on your demand data, I recommend pre-ordering 50 pairs of Dunk Low and 30 pairs of AF1 for next month. I can offer a 5% volume discount." The proposal arrives in RedBox, linked to actual demand data.

**Resolution:** Boss Arnel accepts the proposal with confidence — it's backed by real numbers, not gut feel. Tony's acceptance rate is up 30%. Fewer wasted trips, more successful deliveries.

**Reveals:** Supplier portal, demand signals, proactive proposals, volume discounts, data-backed procurement

---

### Journey 8: Boss Arnel — "The Owner's Weekend Review + System Admin"
**Role:** Owner + System Admin | **Type:** Primary — Strategic + Admin

**Opening Scene:** It's Sunday afternoon. Boss Arnel opens RedBox on his iPad at home. No need to drive to HQ. He checks the weekly summary — all 5 branches have reported, all numbers are in.

**Rising Action:** Branch scoring shows Branch 2 (MOA) is the top performer this month. Branch 4 (Alabang) is underperforming — low foot traffic but high online reservations. He sees the brand performance report: Nike dominates at 60% of sales, Adidas at 25%, others at 15%. The demand logs show growing interest in New Balance — a brand they don't carry yet.

**Climax:** Arnel makes a strategic decision: explore adding New Balance to the catalog. He messages Ate Lisa to research distributors. He also notices a new branch manager was hired at Branch 4 — he goes to the admin panel and creates a new user account with Branch Manager role, assigns them to Branch 4.

**Resolution:** In 30 minutes on a Sunday, Arnel has reviewed all operations, made a strategic brand decision, and onboarded a new employee into the system. No Excel. No Monday morning catch-up meetings.

**Reveals:** Owner dashboard, weekly summary, branch scoring comparison, brand performance analytics, demand log trends, user management/admin panel, role assignment, new employee onboarding

---

### Journey 9: New Cashier — "First Day On the System"
**Role:** New Employee | **Type:** Edge Case — Onboarding

**Opening Scene:** It's Maria's first day as a cashier at Branch 2. Kuya Renz shows her the POS system.

**Rising Action:** The interface is straightforward — scan item, total appears, select payment method, print receipt. Renz shows her the Senior/PWD discount button and the demand log. Maria processes her first real transaction with Renz watching. The system handles the VAT calculation automatically — she doesn't need to memorize discount formulas.

**Climax:** By her third transaction, Maria is confident. The system is simple enough that training takes 15 minutes, not days.

**Resolution:** Maria logs a customer demand entry by end of shift — she's fully operational on Day 1.

**Reveals:** Intuitive POS UI design requirement, minimal training needed, guided first-use experience

---

### Journey Requirements Summary

| Journey | Key Capabilities Revealed |
|---|---|
| **Ate Lisa (HQ)** | HQ dashboard, multi-branch overview, demand log review, stock transfer initiation, brand analytics |
| **Kuya Renz (Branch)** | Branch dashboard, low-stock alerts, restock requests, cross-branch stock lookup, demand logging, branch scoring |
| **Ate Karen (Cashier)** | POS barcode scan, auto VAT/discount, BIR receipt, demand logging, stock lookup |
| **Jessa (Customer)** | Customer website, brand browsing, real-time stock, reserve-for-pickup, pickup processing |
| **Kuya Mark (Warehouse)** | Warehouse dashboard, transfer queue, barcode scanning, stock accuracy tracking |
| **Ate Dianne (Driver)** | Mobile delivery view, digital manifest, delivery confirmation, partial delivery handling |
| **Mang Tony (Supplier)** | Supplier portal, demand signals, proactive proposals, volume discounts |
| **Boss Arnel (Owner)** | Owner dashboard, branch scoring, brand analytics, admin panel, user management |
| **New Employee** | Intuitive UI, minimal training, guided onboarding |

## Domain-Specific Requirements

### Compliance & Regulatory (PH)

| Requirement | Details |
|---|---|
| **VAT 12%** | Applied to all taxable sales; must be itemized on every receipt |
| **Senior Citizen / PWD Discount** | 20% discount with VAT exemption — VAT removed first, then 20% off base price (not 20% off VAT-inclusive total) |
| **BIR-Style Receipts** | Must include: business name, TIN, branch address, date/time, itemized breakdown, VAT line, discount line, total, receipt number |
| **BIR Summary Data** | System must be able to generate monthly/quarterly VAT summary data for BIR filing |

### Technical Constraints

| Constraint | Details |
|---|---|
| **Offline-First POS** | Branch POS must continue processing sales even when internet is down. Transactions stored locally, auto-synced to Convex when connectivity returns. Queue-based upload with conflict resolution. |
| **Offline Stock Tracking** | Local stock counts update immediately on the device during offline mode. On reconnect, sync engine reconciles local changes with server state. |
| **Sync Conflict Resolution** | When two branches modify the same stock data offline, system must detect conflicts and apply last-write-wins or flag for manual resolution by HQ. |
| **Data Integrity During Sync** | Zero data loss guarantee — every offline transaction must eventually reach the server. Local storage persists until server confirms receipt. |
| **Real-Time Sync (Online)** | Convex real-time subscriptions for instant stock updates across all connected branches |
| **Peak Load** | Payday weekends and holiday sales (3-5x normal traffic) — system must not degrade |

### Payment & Financial

| Requirement | Details |
|---|---|
| **POS Payments** | Cash, GCash, Maya at the physical counter |
| **Online Reservations** | Reserve-for-pickup — no upfront payment (pay at branch on pickup) |
| **End-of-Day Reconciliation** | Cash drawer reconciliation per cashier shift; system total vs physical count |
| **PayMongo Integration** | For future online payment if needed (Phase 4+) |

### Multi-Branch Operations

| Requirement | Details |
|---|---|
| **Audit Trails** | Every stock transfer logged: who initiated, who packed, who delivered, who received, timestamps at each step |
| **Branch-Level Reporting** | Financial and operational reports per branch for owner visibility |
| **Role Isolation** | Cashier at Branch 1 cannot see or modify Branch 2's data; HQ sees all |
| **Branch Setup** | Adding a new branch must be straightforward — admin creates branch, assigns manager, system is ready |

### Brand & Product Hierarchy

| Level | Example | Notes |
|---|---|---|
| **Brand** | Nike, Adidas, New Balance | First-class entity; tracks brand performance |
| **Category** | Shoes, Apparel, Accessories | Product type classification |
| **Style/Model** | Air Force 1, Dunk Low, Samba | Specific product line |
| **Variant** | Size 7 / White / Men's | SKU-level with size, color, gender |

### Risk Mitigations

Domain-specific risks and mitigations are consolidated in **Project Scoping & Phased Development → Risk Mitigation Strategy** below. Key domain risks addressed: internet outages (offline-first POS), data loss during sync (local persistence + retry), incorrect discount calculations (automated VAT logic with unit tests), stock discrepancies (real-time sync + conflict detection), unauthorized access (Clerk + branch isolation), and receipt compliance (validated BIR templates).

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Apparel-Specific Unified Commerce Gap (PH Market)**
No existing POS/commerce platform in the Philippines targets multi-branch branded apparel retail. Utak POS dominates coffee shops and general retail, but the apparel vertical — with its brand hierarchy, size/color variants, seasonal demand, and multi-branch stock balancing — remains unserved. RedBox fills this gap.

**2. Floor-Level Demand Intelligence**
Most retail systems only track what sold. RedBox captures what customers *wanted but couldn't buy* — through cashier/branch manager demand logs. This is a fundamentally different data signal: it reveals unmet demand (brands not carried, sizes not stocked, designs customers are asking about). This data doesn't exist in any competitor's system because it requires participation from floor staff, which requires a system they actually want to use.

**3. Physical-Store-First Website (Reverse Commerce Model)**
The industry default is e-commerce first, physical stores second. RedBox inverts this: the website exists to *serve* the physical stores — driving foot traffic through the Check → Reserve → Pickup → Repeat loop. The website is a stock checker and branch locator, not a shopping cart. This model builds in-store relationships and avoids the margin compression of pure e-commerce.

**4. Compound Innovation Stack**
Each layer amplifies the others:
- **Real-time inventory** makes the website accurate
- **Accurate website** drives reservations and foot traffic
- **Foot traffic** generates sales data AND demand logs
- **Demand logs** inform AI restock suggestions
- **AI suggestions** improve inventory allocation
- **Better inventory** makes the website more useful → cycle repeats

No single layer is revolutionary. The compound effect is. A competitor would need to copy all layers simultaneously to match the value — which is extremely difficult.

### Market Context & Competitive Landscape

| Competitor | What They Do | What They Miss |
|---|---|---|
| **Utak POS** | POS for coffee shops, general retail | No apparel-specific features (brand, size/color variants); no multi-branch unified stock; no customer website |
| **Generic POS (Square, etc.)** | Single-store POS | No multi-branch visibility; no PH compliance (VAT/Senior/PWD); no demand intelligence |
| **Shopify POS** | E-commerce + POS | E-commerce first model; expensive for PH market; no demand logging; no branch scoring |
| **Excel / Manual** | Current state for many PH retailers | No real-time anything; error-prone; requires hiring staff just to track sales |

### Validation Approach

| Innovation | How to Validate | Timeline |
|---|---|---|
| **Apparel gap** | Deploy MVP at RedBox branches; measure adoption and pain relief vs Excel | Phase 1-2 (Month 1-2) |
| **Demand intelligence** | Track demand log entries per week; measure if logged items influence procurement decisions | Phase 2-3 (Month 2-3) |
| **Reverse commerce model** | Measure website → reservation → pickup conversion rate; compare branch traffic before/after | Phase 4 (Month 4-5) |
| **Compound stack** | Track North Star metric (decision-to-action time); measure if each layer improves the others | Ongoing from Month 3 |

### Risk Mitigation

| Innovation Risk | Fallback |
|---|---|
| **Cashiers don't log demand** | Make logging frictionless (<30 sec); gamify with recognition; show impact ("your log led to a new brand!") |
| **Customers don't use website** | Website still works as internal stock checker for staff; pivot to WhatsApp-based stock inquiries |
| **Compound stack takes too long to build** | Each phase delivers standalone value; the stack compounds over time but doesn't require all layers to be useful |
| **Market gap closes (competitor enters apparel)** | First-mover advantage + demand intelligence data moat; by the time a competitor enters, RedBox has months of demand data they don't |

## Web Application Specific Requirements

### Project-Type Overview

RedBox is a **hybrid Next.js 15 web application** with multiple interfaces served from a single codebase:
- **Internal dashboards** (HQ, Branch, Warehouse) — SPA behavior with client-side navigation for fast interactions
- **POS terminal** — Dedicated SPA optimized for speed and offline capability
- **Customer-facing website** — SSR for SEO, fast initial load, and social sharing
- **Mobile views** (Driver, field staff) — Responsive web, not native apps

### Browser & Device Matrix

| Interface | Primary Browser | Device | Minimum Support |
|---|---|---|---|
| **HQ Dashboard** | Chrome/Edge | Desktop/Laptop | Modern evergreen browsers |
| **Branch Dashboard** | Chrome | Tablet/Desktop | Chrome 90+ |
| **POS Terminal** | Chrome | Dedicated tablet/desktop | Chrome 90+ (controlled device) |
| **Warehouse** | Chrome | Tablet | Chrome 90+ |
| **Driver View** | Chrome/Safari Mobile | Smartphone | iOS Safari 15+, Chrome Android 90+ |
| **Customer Website** | All modern | Smartphone (primary), Desktop | Chrome, Safari, Firefox, Edge — last 2 versions |

### Responsive Design Strategy

| Interface | Primary Viewport | Approach |
|---|---|---|
| **POS Terminal** | Tablet landscape (1024px+) | Fixed layout optimized for touch; large tap targets for speed |
| **HQ Dashboard** | Desktop (1280px+) | Data-dense layout with charts and tables; sidebar navigation |
| **Branch Dashboard** | Tablet portrait/landscape | Adaptive — works both orientations; key metrics prominently displayed |
| **Warehouse** | Tablet portrait | Scan-focused UI; large buttons; minimal scrolling |
| **Driver View** | Mobile portrait (375px+) | Mobile-first; card-based delivery list; one-hand operation |
| **Customer Website** | Mobile-first (375px+) | Fully responsive; mobile-first design; desktop enhancement |

### Performance Targets

| Metric | Internal Apps | Customer Website |
|---|---|---|
| **First Contentful Paint** | <1.5s | <1.0s |
| **Largest Contentful Paint** | <2.5s | <2.0s |
| **Time to Interactive** | <3.0s | <2.5s |
| **POS Scan-to-Total** | <500ms | N/A |
| **Real-time Update Latency** | <1s (Convex subscription) | <2s |
| **Offline Recovery** | Instant local, sync <30s on reconnect | N/A |
| **Lighthouse Score** | 70+ | 90+ |

### SEO Strategy

| Aspect | Approach |
|---|---|
| **Customer Website Pages** | SSR via Next.js — brand pages, product pages, branch pages are server-rendered and indexable |
| **URL Structure** | `/brands/nike`, `/brands/nike/dunk-low`, `/branches/sm-fairview` — clean, semantic URLs |
| **Meta Tags** | Dynamic OG tags per product/brand page for social sharing (Instagram, Facebook) |
| **Structured Data** | JSON-LD for products (brand, availability, price) and local business (branch locations) |
| **Sitemap** | Auto-generated sitemap.xml from product catalog and branch data |
| **Internal Dashboards** | No SEO — behind authentication, `noindex` on all internal routes |

### Accessibility Level

| Interface | WCAG Level | Rationale |
|---|---|---|
| **Customer Website** | WCAG 2.1 AA | Public-facing; must be accessible to all customers |
| **Internal Dashboards** | Best-effort | Controlled environment; focus on usability over strict compliance |
| **POS Terminal** | Usability-focused | High-contrast, large touch targets, clear visual hierarchy — practical accessibility for fast operation |

### Implementation Considerations

| Consideration | Decision |
|---|---|
| **Rendering Strategy** | Next.js App Router — SSR for customer pages, client components for dashboards/POS |
| **State Management** | Convex real-time queries as primary state; local state for POS offline mode via IndexedDB/localStorage |
| **PWA Capability** | POS terminal should be installable as PWA for offline support and fullscreen mode |
| **Code Splitting** | Route-based splitting — internal dashboard bundle separate from customer website bundle |
| **Image Optimization** | Next.js Image component for product photos; WebP with fallbacks |
| **Authentication Routing** | Clerk middleware — public routes (customer website), protected routes (all internal) |

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-Solving MVP — eliminate Excel tracking, unify stock across branches, and get POS running with offline resilience. Every feature in MVP directly replaces a manual pain point.

**MVP Philosophy:** If it doesn't help Ate Lisa see real-time data, Ate Karen process sales, or Kuya Mark transfer stock — it waits.

**Resource Requirements:** Solo developer (FashionMaster) with AI-assisted development (Claude). Next.js 15 + Convex + Clerk stack minimizes infrastructure overhead.

### MVP Feature Set (Phases 1-3)

**Core User Journeys Supported in MVP:**

| Journey | MVP Support | Notes |
|---|---|---|
| Ate Lisa (HQ) | Full | Dashboard, multi-branch view, transfers, demand log review (Phase 2) |
| Kuya Renz (Branch) | Full | Branch dashboard, low-stock alerts, restock requests |
| Ate Karen (Cashier) | Full | POS, VAT/discounts, BIR receipts, demand logging (Phase 2), offline POS |
| Kuya Mark (Warehouse) | Full | Transfer queue, barcode scanning, stock accuracy |
| Boss Arnel (Owner) | Partial | Admin panel, user management, basic reporting — no branch scoring yet |
| Jessa (Customer) | Not in MVP | Website is Phase 4 |
| Ate Dianne (Driver) | Not in MVP | Logistics is Phase 5 |
| Mang Tony (Supplier) | Not in MVP | Ecosystem is Phase 7 |

**Phase 1 — Foundation (Must-Have):**

| Feature | Priority | Details |
|---|---|---|
| User authentication (Clerk) | P0 | Sign-up, login, password reset |
| Role-based access control | P0 | Admin, Manager, Cashier, Warehouse, HQ Staff, Viewer |
| Multi-branch setup | P0 | Create branches, assign staff, branch-scoped data isolation |
| Product catalog | P0 | Brand → Category → Style/Model → Variant (size, color, gender) |
| Brand as first-class entity | P0 | Brand CRUD, brand-level reporting foundation |
| Basic HQ Dashboard | P0 | All-branch overview, stock levels, today's sales summary |
| Branch Dashboard | P0 | Branch-specific stock, sales, alerts |
| User management (Admin) | P0 | Create/edit users, assign roles, assign to branches |

**Phase 2 — Revenue Engine (Must-Have):**

| Feature | Priority | Details |
|---|---|---|
| POS with barcode scanning | P0 | html5-qrcode scanner, item lookup, cart management |
| VAT 12% auto-calculation | P0 | Automatic on every transaction |
| Senior/PWD 20% discount + VAT exemption | P0 | One-tap activation, correct calculation (VAT removed first) |
| BIR-style receipt generation | P0 | @react-pdf/renderer; all required fields |
| Payment methods | P0 | Cash, GCash, Maya selection |
| End-of-day cash reconciliation | P0 | Per-cashier shift; system total vs physical count |
| Daily sales summary per branch | P0 | Auto-generated, visible to HQ |
| Offline-first POS | P0 | IndexedDB/localStorage queue; auto-sync on reconnect; zero data loss |
| Demand logging | P1 | Cashier/manager logs customer requests (brand, design, size); visible to HQ |

**Phase 3 — Stock Flow (Must-Have):**

| Feature | Priority | Details |
|---|---|---|
| Unified inventory pool | P0 | Single source of truth across all branches (Convex real-time) |
| Real-time stock sync | P0 | Convex subscriptions; updates propagate in seconds |
| Stock transfer workflows | P0 | Request → Pack → Ship → Receive with barcode scanning at each step |
| Warehouse management dashboard | P0 | Pending transfers, stock counts, packing queue |
| Low-stock alerts | P0 | Configurable thresholds per product per branch |
| Audit trails | P0 | Every transfer logged with who/when/what at each step |
| Cross-branch stock lookup | P1 | Staff can check other branches' stock (read-only) |

**MVP Success Gate:** All branches processing real transactions on unified system; HQ sees real-time stock and sales; offline POS works during internet outages; Excel tracking fully eliminated; demand logging capturing customer requests.

### Post-MVP Features

**Phase 4 — Customer Website (Growth):**
- Product showcase with real-time branch stock availability
- Brand browsing (by brand, category, style)
- Branch locator with stock visibility
- Reserve-for-pickup flow (no upfront payment)
- SEO-optimized pages (SSR, structured data, OG tags)
- Pickup processing integration with POS

**Phase 5 — Logistics (Growth):**
- Driver mobile view with delivery manifest
- Delivery assignment and route tracking
- Delivery confirmation via barcode scanning
- Partial delivery handling
- Real-time transfer tracking visible to HQ

**Phase 6 — AI Intelligence (Growth):**
- AI-powered restock suggestions based on sales patterns
- Brand performance analytics (sales by brand per branch)
- Demand pattern recognition from cashier logs
- Branch scoring algorithm
- Automated low-stock predictions

**Growth Success Gate:** Customer website driving measurable foot traffic; AI reducing stockouts by 30%+; demand logs actively informing procurement.

### Vision Features (Phase 7 — Ecosystem)
- Supplier portal with proactive demand signals
- Customer loyalty program
- Multi-brand analytics dashboard
- Automated purchase order suggestions
- Cross-branch demand intelligence

### Risk Mitigation Strategy

**Technical Risks:**

| Risk | Mitigation | Contingency |
|---|---|---|
| Offline sync complexity | Build offline layer into POS from Day 1 (Phase 2); use IndexedDB with queue pattern | If too complex, launch with "save locally, manual upload" as interim |
| Convex real-time at scale | Start with 5 branches; Convex handles real-time natively | If latency issues, add caching layer |
| Single developer bottleneck | AI-assisted development (Claude); modular architecture for future team expansion | Prioritize phases ruthlessly; Phase 1 alone delivers value |

**Market Risks:**

| Risk | Mitigation | Contingency |
|---|---|---|
| Staff resistance to new system | Intuitive UI (<15 min training); show immediate value (no more Excel) | Run parallel (Excel + RedBox) for 2 weeks during transition |
| MVP doesn't replace Excel fully | Ensure all daily operations covered in Phases 1-3 | Identify specific gaps and patch with quick fixes |

**Resource Risks:**

| Risk | Mitigation | Contingency |
|---|---|---|
| Solo dev slower than planned | Each phase delivers standalone value; no phase blocks on another | Launch Phase 1 alone if needed — even basic dashboard + catalog replaces Excel |
| Budget constraints | Convex free tier + Vercel free tier + Clerk free tier covers MVP | Scale paid tiers only when branches are actively using the system |

## Functional Requirements

### 1. User Management & Access Control

- **FR1:** Admin can create, edit, and deactivate user accounts
- **FR2:** Admin can assign roles to users (Admin, Manager, Cashier, Warehouse Staff, HQ Staff, Viewer)
- **FR3:** Admin can assign users to specific branches
- **FR4:** Users can authenticate via email/password with secure session management
- **FR5:** Users can only access data for their assigned branch (branch-scoped isolation)
- **FR6:** HQ Staff and Admin can view data across all branches
- **FR7:** Admin can create and configure new branches in the system

### 2. Product Catalog & Brand Management

- **FR8:** Admin/HQ Staff can manage brands (create, edit, deactivate)
- **FR9:** Admin/HQ Staff can manage product categories (Shoes, Apparel, Accessories)
- **FR10:** Admin/HQ Staff can manage product styles/models within a brand and category
- **FR11:** Admin/HQ Staff can manage product variants (size, color, gender) per style
- **FR12:** Admin/HQ Staff can assign a unique SKU and barcode to each product variant
- **FR13:** Admin/HQ Staff can navigate and manage the Brand → Category → Style/Model → Variant hierarchy
- **FR14:** Admin/HQ Staff can set and update pricing per product variant

### 3. Point of Sale (POS)

- **FR15:** Cashier can scan product barcodes to add items to a transaction
- **FR16:** Cashier can manually search and add products to a transaction
- **FR17:** POS automatically calculates VAT (12%) on all taxable items
- **FR18:** Cashier can apply Senior Citizen/PWD discount (20% with VAT exemption) with one action
- **FR19:** POS correctly computes Senior/PWD discount by removing VAT first, then applying 20% off the base price
- **FR20:** Cashier can select payment method (Cash, GCash, Maya) for each transaction
- **FR21:** POS generates BIR-compliant receipts with all required fields (business name, TIN, branch address, date/time, itemized breakdown, VAT line, discount line, total, receipt number)
- **FR22:** Cashier can continue processing transactions during internet outages (offline mode)
- **FR23:** POS stores offline transactions locally and automatically syncs when connectivity returns
- **FR24:** POS guarantees zero data loss for offline transactions
- **FR25:** Cashier can perform end-of-day cash reconciliation (system total vs physical count)

### 4. Inventory Management

- **FR26:** Staff can view a unified real-time inventory pool across all branches
- **FR27:** Inventory updates at any branch propagate to all connected branches in real-time
- **FR28:** Admin/HQ Staff can set low-stock alert thresholds per product per branch
- **FR29:** Branch Manager/HQ Staff receive low-stock alerts when inventory falls below configured thresholds
- **FR30:** Staff can view current stock levels for their branch
- **FR31:** Staff can view stock levels at other branches (read-only cross-branch lookup)

### 5. Stock Transfers & Warehouse

- **FR32:** Branch Manager/HQ Staff can initiate stock transfer requests
- **FR33:** Warehouse Staff can view and manage pending transfer requests
- **FR34:** Warehouse Staff can scan barcodes to pack transfer orders and confirm quantities
- **FR35:** Staff can track transfer status through workflow stages (Requested → Packed → In Transit → Delivered)
- **FR36:** Receiving branch can confirm delivery by scanning transferred items
- **FR37:** Receiving branch staff can flag damaged/missing items during partial delivery handling
- **FR38:** Staff can view a complete audit trail for every transfer (who, what, when at each stage)

### 6. Dashboards & Reporting

- **FR39:** HQ Staff can view an all-branch overview dashboard (stock levels, daily sales, alerts)
- **FR40:** Branch Manager can view a branch-specific dashboard (stock, sales, performance)
- **FR41:** Branch Manager/HQ Staff can view daily sales summaries per branch
- **FR42:** Owner/Admin can view branch-level financial and operational reports
- **FR43:** HQ Staff/Admin can generate monthly/quarterly VAT summary data for BIR filing
- **FR44:** HQ Staff can view sales data by brand across branches

### 7. Demand Intelligence (Phase 2)

- **FR45:** Cashier/Branch Manager can log customer demand entries (brand, design, size, notes)
- **FR46:** Cashier/Branch Manager can complete a demand log entry within 30 seconds
- **FR47:** HQ Staff can view and review all demand log entries across branches
- **FR48:** HQ Staff can view top-requested items/brands across branches (weekly summary)

### Post-MVP Functional Requirements

#### Customer Website (Phase 4)

- **FR49:** Customers can browse products by brand, category, and style
- **FR50:** Customers can view real-time stock availability per branch for any product
- **FR51:** Customers can locate branches on a branch finder
- **FR52:** Customers can reserve a product for in-store pickup (name + phone, no upfront payment)
- **FR53:** Branch staff can view and fulfill pending reservations
- **FR54:** Branch staff receive notification when a reservation expires unfulfilled after 24 hours

#### Logistics (Phase 5)

- **FR55:** Driver can view assigned deliveries with digital manifests on mobile
- **FR56:** HQ Staff can assign deliveries to drivers and track delivery routes
- **FR57:** Driver/Branch can confirm delivery receipt with barcode scanning

#### AI Intelligence (Phase 6)

- **FR58:** HQ Staff can view AI-generated restock suggestions based on ≥14 days of sales history, showing recommended SKU, quantity, and target branch
- **FR59:** Owner/Admin can view branch performance scores calculated from sales volume, stock accuracy, and fulfillment speed metrics
- **FR60:** HQ Staff can view weekly demand pattern reports surfacing top 10 trending requests aggregated from cashier demand logs

#### Ecosystem (Phase 7)

- **FR61:** Suppliers can view demand signals for their brands across branches
- **FR62:** Suppliers can submit stock proposals to the owner

## Non-Functional Requirements

### Performance

| ID | Requirement | Target | Context |
|---|---|---|---|
| **NFR1** | POS transaction completion (scan to receipt) | <3 seconds | Critical for cashier productivity and customer experience |
| **NFR2** | POS barcode scan to price display | <500ms | Cashier expects instant feedback |
| **NFR3** | Real-time stock update propagation | <1 second across all online branches | Core to unified inventory promise |
| **NFR4** | HQ Dashboard initial load | <2 seconds | Ate Lisa's morning command center must be instant |
| **NFR5** | Customer website First Contentful Paint | <1 second | Mobile users on PH networks expect fast loads |
| **NFR6** | Customer website Largest Contentful Paint | <2 seconds | Google Core Web Vitals compliance for SEO |
| **NFR7** | Offline transaction local storage | <200ms per transaction | Must feel as fast as online mode |
| **NFR8** | Offline-to-online sync completion | <30 seconds for queued transactions | Staff shouldn't wait when internet returns |
| **NFR9** | Demand log entry creation | <30 seconds end-to-end | Must be fast enough that cashiers actually use it |

### Security

| ID | Requirement | Target | Context |
|---|---|---|---|
| **NFR10** | Authentication | All sessions managed via Clerk; 100% of API endpoints require valid auth token; zero unauthenticated access to financial data | Prevent unauthorized access to financial data |
| **NFR11** | Branch data isolation | 100% of queries filtered by branch scope at API layer; verified by automated test suite covering all data endpoints | Cashier at Branch 1 cannot see Branch 2 data |
| **NFR12** | Role-based access enforcement | Role permissions enforced server-side on 100% of API requests; zero UI-only permission checks; verified by role escalation test suite | Prevent privilege escalation |
| **NFR13** | Financial data protection | TLS 1.2+ (HTTPS) for all data in transit; AES-256 encryption at rest for transaction and payment data | Protect revenue data |
| **NFR14** | Offline data security | Locally stored offline transactions encrypted using AES-256 on device; data wiped after successful sync | Prevent data theft if device is lost |
| **NFR15** | Session management | Sessions expire after 30 minutes of inactivity; force re-login on role change; session invalidation completes within 5 seconds | Prevent abandoned session misuse |
| **NFR16** | Audit logging | 100% of financial transactions and stock transfers logged with immutable timestamps and user IDs; logs retained for 5 years; log write latency <500ms | BIR compliance and fraud prevention |

### Scalability

| ID | Requirement | Target | Context |
|---|---|---|---|
| **NFR17** | Branch count | System supports up to 20 branches without architectural changes | Growth from 5 to 20 branches |
| **NFR18** | Concurrent POS terminals | Support 2-3 POS terminals per branch simultaneously | Peak hour scenarios |
| **NFR19** | Peak traffic handling | System handles 3-5x normal transaction volume during paydays/holidays without degradation | Payday Friday at SM malls |
| **NFR20** | Product catalog size | Support up to 10,000 product variants across all brands | Growth as new brands are added |
| **NFR21** | Transaction history | System retains at least 3 years of transaction history for reporting | BIR compliance and business analytics |

### Reliability

| ID | Requirement | Target | Context |
|---|---|---|---|
| **NFR22** | POS availability | POS must function during internet outages (offline mode) | Internet unreliability at PH branches |
| **NFR23** | Zero data loss for transactions | Every completed transaction — online or offline — must be persisted and eventually synced | Financial data cannot be lost |
| **NFR24** | Sync conflict resolution | System detects and handles conflicts when offline data syncs (last-write-wins or flag for HQ review) | Two branches modifying same stock offline |
| **NFR25** | System uptime (online services) | 99.5% uptime during business hours (8 AM - 10 PM PHT) | Branch operations depend on dashboards and stock sync |
| **NFR26** | Data backup | Convex handles data persistence and backup natively; no manual backup required | Platform-managed reliability |

### Accessibility

| ID | Requirement | Target | Context |
|---|---|---|---|
| **NFR27** | Customer website | WCAG 2.1 AA compliance | Public-facing; must serve all customers |
| **NFR28** | POS terminal | High contrast, large touch targets (min 44px), clear visual hierarchy | Fast operation in store lighting; usable by all staff |
| **NFR29** | Internal dashboards | Best-effort accessibility; keyboard navigable | Controlled environment; focus on usability |

### Integration

| ID | Requirement | Target | Context |
|---|---|---|---|
| **NFR30** | Clerk authentication | Stable integration with Clerk for all auth flows | Core dependency for user management |
| **NFR31** | Convex real-time database | All data operations via Convex; real-time subscriptions for live updates | Core dependency for unified stock |
| **NFR32** | Barcode scanning | html5-qrcode integration for POS and warehouse scanning | Works on tablet cameras; no external hardware required |
| **NFR33** | Receipt generation | @react-pdf/renderer for BIR-compliant PDF receipts | Print-ready and downloadable |
| **NFR34** | Future payment integration | Architecture supports adding PayMongo for online payments in Phase 4+ | Don't block future integration |
