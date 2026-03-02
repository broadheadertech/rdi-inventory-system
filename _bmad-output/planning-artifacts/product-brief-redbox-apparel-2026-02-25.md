---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - '_bmad-output/analysis/brainstorming-session-2026-02-25.md'
date: '2026-02-25'
author: 'FashionMaster'
---

# Product Brief: redbox-apparel

<!-- Content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

**RedBox Apparel** is a unified commerce platform purpose-built for Philippine multi-branch apparel retail. It replaces fragmented Excel tracking, manual stock transfers, and hired-just-to-check-sales managers with a single, real-time, web-based system that connects HQ, branches, warehouse, drivers, and customers.

The platform combines an AI-powered Inventory Management System (IMS), a lightning-fast POS terminal designed for apparel workflows (size variants, fitting room holds, Senior/PWD compliance), a logistics layer for deliveries and branch transfers, and a customer-facing product showcase website where shoppers check real-time stock availability by branch before visiting.

Unlike generic POS systems (Utak, Vend, Lightspeed) built for coffee shops and general retail, RedBox is engineered for the unique realities of apparel: size curve intelligence, style-based AI recommendations, seasonal/holiday forecasting tuned to Philippine cycles (payday, fiestas, typhoon seasons), and a branch-first discovery model where the website drives foot traffic to physical stores.

The vision: HQ sees everything, branches run themselves intelligently, customers never waste a trip, and the AI learns the business better every day — building a self-optimizing commerce organism that runs reliably for 3-5 years without major intervention.

---

## Core Vision

### Problem Statement

Philippine multi-branch apparel retailers operate on disconnected systems — Excel spreadsheets for inventory, Viber messages for stock transfers, and dedicated staff hired solely to manually check sales figures. HQ has no real-time visibility into branch stock levels, sales velocity, or operational health. Customers have zero way to check product availability before committing to a trip. Branch managers can't see what other branches have. Every decision is delayed by manual data gathering.

### Problem Impact

- **Financial waste:** Businesses pay for a sales manager role that exists only because data isn't accessible — a human band-aid for a systems problem
- **Lost sales:** Customers arrive at branches to find items out of stock, leave frustrated, and may not return
- **Overstocking and stockouts:** Without real-time data, HQ over-orders for some branches and under-orders for others. Dead stock accumulates while bestsellers run dry
- **Operational blind spots:** Shrinkage, ghost stock, and slow-moving inventory go undetected until physical counts
- **Scaling ceiling:** Every new branch multiplies the Excel complexity. Growth becomes an operational burden instead of a revenue multiplier

### Why Existing Solutions Fall Short

Generic POS systems like Utak dominate Philippine food service, coffee shops, and general retail — but none address apparel-specific workflows:

- **No size/color variant intelligence** — apparel lives and dies by size curves that differ per branch location
- **No fitting room workflow** — hold/recall patterns essential for apparel POS are absent
- **No branch-to-branch visibility** — generic POS treats each location as an island
- **No customer-facing stock checker** — no way to bridge online browsing to in-store visits
- **No Philippine compliance depth** — Senior/PWD discount computation with proper VAT exemption and BIR receipt formatting requires apparel-aware logic
- **No AI layer** — zero forecasting, no demand prediction, no style recommendations

The result: apparel retailers either force-fit generic tools and compensate with manual labor, or operate entirely on spreadsheets.

### Proposed Solution

A unified, web-based commerce platform with five integrated layers:

1. **Real-Time IMS** — Every stock movement (receive, sell, transfer, return, damage) tracked instantly across all branches and warehouse. HQ sees everything in one dashboard. Convex real-time subscriptions ensure zero lag.

2. **Apparel-Native POS** — Built for how apparel actually sells: size/color variants, fitting room hold/recall, split payments (cash + GCash), one-touch Senior/PWD discounts with BIR-compliant receipts, rush mode for peak hours, offline capability for unreliable Philippine internet.

3. **Logistics & Delivery** — HQ-to-branch and branch-to-branch transfers with driver tracking, route optimization for Metro Manila traffic, COD collection, and failed delivery handling.

4. **Front Website — Branch-First Product Discovery** — NOT an e-commerce store. A real-time product showcase where customers check what's available, see which branch has their size, and choose: pick up or deliver. The website serves the physical stores.

5. **AI Intelligence Layer** — Dual-use: operational brain for staff (demand forecasting, smart reordering, size curve analysis, holiday/weather alerts) and personal fashion assistant for customers (style recommendations from in-stock items, outfit suggestions, occasion-based templates).

### Key Differentiators

| Differentiator | Why It Matters |
|---|---|
| **Apparel-first, not generic** | Size curves, fitting rooms, style variants, seasonal fashion cycles — built in, not bolted on |
| **Branch-first website** | Website drives foot traffic TO stores instead of competing with them |
| **Unified real-time stock** | One stock pool across POS, website, warehouse, and all branches — powered by Convex subscriptions |
| **AI that runs the business** | Not a reporting tool — a proactive advisor that warns before problems happen and recommends specific actions with peso impact |
| **Philippine-native** | Payday cycles (15th/30th), BIR compliance, typhoon awareness, Taglish-ready AI, GCash/Maya-first payments — not a global product localized |
| **Branch scoring** | Quantified branch performance with drill-down diagnostics — HQ knows exactly which branches thrive and why |
| **Self-optimizing** | The more data flows through, the smarter the system gets — creating an uncopyable compound advantage over time |

---

## Target Users

### Implementation Priority Tiers

| Tier | Roles | Rationale |
|---|---|---|
| **Tier 1: Core Operations** | HQ Staff, Branch Manager, POS Cashier | Generate the data everything else depends on |
| **Tier 2: Fulfillment** | Warehouse Staff, Driver | Move stock based on Tier 1 data |
| **Tier 3: External-Facing** | Customer (Website), Supplier | Consume and contribute data through external interfaces |
| **Tier 4: Strategic** | Owner/Admin | Insights and decisions powered by all other tiers |

All roles are primary users — the unified system's value depends on full participation.

### Primary Users

#### 1. Ate Lisa — HQ Operations Staff (29, Main Office, Pasig)

**Role:** Monitors sales, operations, and logistics across all branches from HQ. Currently the person who replaced the "hired sales manager just to check sales" — except now the system does the heavy lifting.

**Current Pain:** Spends hours consolidating Excel files from branches, manually checking what needs restocking, coordinating transfers via Viber. By the time data is compiled, it's already outdated.

**With RedBox:** Opens one dashboard — real-time sales across all branches, automated restock alerts, transfer requests flowing through the system. Her role shifts from data-gathering to decision-making.

**Success Moment:** "I used to spend Monday mornings chasing branch reports. Now I spend Monday mornings acting on insights the system already prepared over the weekend."

#### 2. Kuya Renz — Branch Manager (35, Glorietta Branch)

**Role:** Runs a single branch — staffing, stock levels, sales targets, customer experience. Accountable for branch performance.

**Current Pain:** Calls HQ when stock runs low. Doesn't know what other branches have. Discovers stockouts when customers complain. Monthly physical counts are his nightmare.

**With RedBox:** Morning command center shows his day in 30 seconds — low stock alerts, incoming transfers, sales targets, AI recommendations. One-tap transfers between branches. Size curve intelligence tells him what to reorder and how much.

**Success Moment:** "The system told me on Wednesday that Medium windbreakers would sell out by Saturday. I transferred 20 from Fairview before the rush even started."

#### 3. Ate Karen — POS Cashier (42, Megamall Branch)

**Role:** Front-line sales — processes transactions, handles customer queries about stock/sizes, manages returns and exchanges, balances drawer at end of shift.

**Current Pain:** Manually computes Senior/PWD discounts, can't answer "do you have this in blue?" without leaving the register, split payments are a headache, promo application is error-prone.

**With RedBox:** One-touch Senior/PWD with auto BIR formatting. Instant variant lookup from the register. Smart promo auto-apply. Hold/recall for fitting rooms. Rush mode when lines get long. End-of-shift drawer balance in 2 minutes.

**Success Moment:** "A customer asked if we had her size in another color. I checked from my register in 5 seconds and reserved it at SM North for her. She didn't even have to ask a second person."

#### 4. Kuya Mark — Warehouse Staff (28, Main Warehouse, Pasig)

**Role:** Receives supplier shipments, manages warehouse storage, fulfills branch transfer requests, conducts cycle counts, handles damage/defect quarantine.

**Current Pain:** Handwritten tally sheets for receiving. Sticky notes for transfer requests via Viber. Storage locations memorized, not documented. Monthly full-count audits are brutal.

**With RedBox:** Scan-to-receive against POs. Smart put-away suggestions. Visual transfer queue like Grab orders. 20 SKUs daily cycle count instead of 2,000 monthly. Quarantine scan for defects.

**Success Moment:** "A truck came in with 3 missing boxes. I flagged it during scan-to-receive, supplier was auto-notified, and I had the discrepancy resolved before lunch."

#### 5. Ate Dianne — Delivery Driver (30, Metro Manila Routes)

**Role:** Delivers online orders and branch transfers. Manages routes, status updates, COD collection, and failed delivery handling.

**Current Pain:** Routes planned manually. Status updates via Viber text. COD cash tracked on paper. Failed deliveries require phone calls to reschedule.

**With RedBox:** Morning route optimization considering Manila traffic + customer time windows. One-tap status updates with GPS + photo. COD collection with chain of custody. Auto-notify customers on delays.

**Success Moment:** "Route optimization saved me 45 minutes and one less failed delivery because the customer got an auto-text with my ETA."

#### 6. Jessa — Customer on Front Website (24, Graphic Designer, QC)

**Role:** Browses products, checks branch stock availability, reserves items for pick-up or requests delivery.

**Current Pain:** Travels 45 minutes to a mall branch only to find the item isn't there. No way to check beforehand. Has to visit multiple branches to find her size.

**With RedBox Website:** Searches products, sees real-time stock by branch, picks the nearest one with her size, reserves it for pick-up after work or chooses delivery. In-store, scans barcodes with her phone to check other sizes/colors.

**Success Moment:** "I checked the website during lunch, found the jacket in Medium at SM North, reserved it, and picked it up after work. Zero wasted trips."

#### 7. Supplier — Mang Tony (55, Wholesaler, Divisoria)

**Role:** Supplies apparel to RedBox. Receives purchase orders, confirms availability, delivers to warehouse.

**Current Pain:** Gets orders via Viber or phone call. No visibility into what RedBox actually needs until they call. Mismatched quantities and miscommunication on variants.

**With RedBox:** Logs into a supplier portal — sees pending POs, confirms stock, proposes alternatives when items are unavailable, views RedBox's sales velocity for his products. Proactively offers stock when he sees demand patterns.

**Success Moment:** "I can see RedBox is burning through my windbreakers. I messaged them with a restock offer before they even placed the PO. Faster turnaround for both of us."

#### 8. Boss Arnel — Owner/Admin (52, Multi-Branch Owner)

**Role:** Strategic oversight — revenue, profitability, expansion decisions, brand direction. Doesn't operate day-to-day but needs to know everything.

**Current Pain:** Relies on weekly reports compiled by HQ staff from Excel. Can't drill into why a branch is underperforming. Expansion decisions are gut-feel, not data-driven.

**With RedBox:** CEO dashboard with one-glance business health. AI summary in plain language. One-tap drill-down into any branch with peso-impact analysis. Expansion intelligence from delivery data. Multi-branch P&L.

**Success Moment:** "The AI told me a Cavite branch could capture P280K/month based on our delivery data. I opened the branch, and it hit P250K in month one."

### User Journey

| Phase | Internal Users (HQ, Branch, POS, Warehouse, Driver) | Customer (Website) | Supplier |
|---|---|---|---|
| **Discovery** | Owner decides to modernize operations | Finds RedBox website via social media, search, or in-store QR code | Receives portal invite from RedBox HQ |
| **Onboarding** | Role-based training; system pre-loaded with products and branches | No sign-up required to browse; optional account for reservations | Account setup with product catalog sync |
| **Core Usage** | Daily operations through role-specific interfaces — POS, dashboard, mobile driver app, warehouse scanner | Browse → check stock → reserve or order → pick up or receive delivery | View POs → confirm → deliver → track payments |
| **Aha Moment** | "I can see everything in real-time without calling anyone" | "The website said it was in stock, and it actually was" | "I can see what they need before they ask" |
| **Long-term** | System becomes operational backbone; AI recommendations become trusted advisor | Habitual pre-visit stock checking; loyalty program engagement | Proactive restocking partner with data-driven relationship |

---

## Success Metrics

### North Star Metric

**Time-to-Decision Reduction** — Every user in the system (HQ, branch, cashier, customer, supplier) makes faster, better-informed decisions than they could with Excel + Viber + phone calls.

### User Success Metrics

| User | Success Indicator | Measurement |
|---|---|---|
| **HQ Staff (Lisa)** | Time freed from data gathering | Hours/week spent on manual consolidation → target: near zero by month 3 |
| **Branch Manager (Renz)** | Faster stock decisions with full detail | Stockout incidents per branch per month (baseline vs. system); time to complete morning review < 2 min |
| **POS Cashier (Karen)** | Smooth, fast transactions | Avg transaction time (target: < 30 sec for standard sale); Senior/PWD discount errors → zero |
| **Warehouse (Mark)** | Receiving accuracy and speed | Receiving discrepancy detection rate; time to process incoming shipment (target: 50% faster than tally sheets) |
| **Driver (Dianne)** | Route efficiency, fewer failed deliveries | Deliveries per day; failed delivery rate (target: < 5%); avg route time reduction |
| **Customer (Jessa)** | Fewer wasted trips, faster purchase journey | Reservation-to-pickup conversion rate; repeat visitor rate; bounce rate on product pages |
| **Supplier (Tony)** | Proactive restocking, faster PO turnaround | Avg PO confirmation time; % of proactive restock offers vs. reactive POs |
| **Owner (Arnel)** | Real-time visibility without chasing reports | Time from "I want to know X" to answer → target: < 10 seconds via dashboard |

### Business Objectives

**3-Month Targets (System Launch + Stabilization):**
- All branches live on the platform — zero Excel tracking remaining
- HQ staff time freed: reclaim 15-20 hours/week previously spent on manual data consolidation
- POS processing: zero manual Senior/PWD computation errors
- Stock accuracy: > 95% system-vs-physical match rate across all branches
- Front website live with real-time stock data for all products

**12-Month Targets (Optimization + Growth):**
- Stockout reduction: 40-60% fewer stockout incidents vs. pre-system baseline
- Customer website adoption: measurable reservation-to-visit conversion proving the website drives foot traffic
- Supplier PO cycle: 50% faster from request to delivery through portal vs. old Viber method
- AI trust: branch managers acting on > 70% of AI restock recommendations
- Pesos saved: quantifiable reduction in dead stock, shrinkage losses, and wasted labor hours

**3-5 Year Targets (Self-Optimizing Platform):**
- System runs with minimal manual intervention — AI handles routine decisions, humans handle exceptions
- Branch expansion supported without proportional increase in HQ staff
- Customer loyalty program driving measurable repeat visits
- Supplier relationships fully data-driven with mutual visibility

### Key Performance Indicators

**Operational KPIs:**

| KPI | Target | Frequency |
|---|---|---|
| Stock accuracy rate (system vs. physical) | > 98% | Monthly cycle counts |
| Avg POS transaction time | < 30 seconds | Daily |
| Stockout incidents per branch | 50% reduction from baseline | Weekly |
| Transfer request-to-fulfillment time | < 24 hours | Per transfer |
| HQ manual reporting hours | Near zero | Weekly |

**Customer KPIs:**

| KPI | Target | Frequency |
|---|---|---|
| Website → reservation conversion | Track and grow month-over-month | Monthly |
| Reservation → pickup completion rate | > 80% | Monthly |
| Repeat website visitors | Growing month-over-month, low churn | Monthly |
| "Wasted trip" complaints | Near zero for website users | Monthly |

**Financial KPIs:**

| KPI | Target | Frequency |
|---|---|---|
| Dead stock value reduction | 30-50% decrease | Quarterly |
| Shrinkage losses | Measurable decrease from pre-system | Quarterly |
| Labor hours saved (HQ + branches) | 15-20 hrs/week at HQ level | Monthly |
| Cost per transaction (operational overhead) | Decreasing trend | Quarterly |

**Supplier KPIs:**

| KPI | Target | Frequency |
|---|---|---|
| PO confirmation turnaround | < 24 hours | Per PO |
| Proactive restock offers (% of total orders) | Growing trend | Monthly |
| Supplier delivery accuracy | > 95% match to PO | Per delivery |

---

## MVP Scope

### Core Features — Phased Build

#### Phase 1: Foundation (Everything depends on this)

| Feature | Description | Users Served |
|---|---|---|
| Auth + Role-Based Access | Clerk integration with roles: Admin, Manager, Cashier, Warehouse, Driver, Viewer | All |
| Product Catalog | Products with size/color variants, categories, images, pricing | All |
| Branch/Location Management | Create and manage branches, assign staff, set operating details | HQ, Owner |
| Inventory Tracking | Real-time stock levels per branch per variant, stock movements | HQ, Branch Manager |
| HQ Dashboard | See all branch stock levels, sales summary, and movement activity in real-time | HQ Staff, Owner |

**Milestone:** HQ can see every branch's inventory without calling anyone or opening Excel.

#### Phase 2: Revenue Engine (Start selling)

| Feature | Description | Users Served |
|---|---|---|
| POS Terminal | Barcode scan, cart, checkout, payment processing (cash + GCash/Maya) | Cashier |
| Senior/PWD Discounts | One-touch discount with auto VAT exemption + BIR receipt formatting | Cashier |
| Split Payments | Cash + digital split with auto remainder calculation | Cashier |
| BIR-Compliant Receipts | Auto-generated with all required fields, print or digital | Cashier, Customer |
| Hold/Recall | Fitting room workflow — hold cart, serve next, recall when ready | Cashier |
| Variant Lookup from POS | "Do you have this in blue?" — instant check from the register, all branches | Cashier |
| Drawer Balancing | End-of-shift cash reconciliation in 2 minutes | Cashier, Manager |
| Sales Reporting | Daily/weekly/monthly sales per branch, per product, per cashier | HQ, Manager, Owner |

**Milestone:** Branches can sell, comply with BIR, and report sales in real-time. Excel is dead.

#### Phase 3: Stock Flow (Connect the network)

| Feature | Description | Users Served |
|---|---|---|
| Stock Transfers | HQ-to-branch and branch-to-branch requests with approval workflow | HQ, Manager |
| Purchase Orders | Create POs to suppliers with variant quantities | HQ |
| Warehouse Receiving | Scan-to-receive against PO, flag discrepancies, photo + notes | Warehouse |
| Stock Movement Audit Trail | Every movement traced: received, sold, transferred, returned, damaged | All internal |
| Low Stock Alerts | Configurable reorder points, automatic alerts to HQ and branch managers | HQ, Manager |
| Cycle Counts | Daily 20-SKU counts replacing monthly full audits | Warehouse, Manager |
| Damage/Defect Quarantine | Scan defective items out of sellable inventory | Warehouse |

**Milestone:** Stock flows between HQ, warehouse, and branches with full traceability. No more Viber coordination.

#### Phase 4: Customer-Facing Website (The differentiator)

| Feature | Description | Users Served |
|---|---|---|
| Product Showcase | Browsable catalog with images, prices, size/color options | Customer |
| Real-Time Branch Availability | See which branches have your size in stock, right now | Customer |
| Branch Locator | Find nearest branch with the product you want | Customer |
| Reserve for Pick-Up | Reserve item at a branch with time window, pick up after work | Customer |
| Order for Delivery | Place an order for home delivery with address and payment | Customer |
| Customer Accounts | Optional — for reservation history, wishlists, order tracking | Customer |

**Milestone:** Customers never waste a trip. The website drives foot traffic to physical stores.

#### Phase 5: Logistics & Delivery

| Feature | Description | Users Served |
|---|---|---|
| Delivery Order Management | Process online orders, assign to drivers | HQ, Warehouse |
| Driver Status Tracking | One-tap status updates with GPS + timestamp + photo | Driver |
| Route Display | View assigned deliveries on map with sequence | Driver |
| COD Collection | Record cash collected per delivery, end-of-day remittance | Driver, HQ |
| Customer Notifications | Auto-notify on dispatch, ETA, arrival, delays | Customer |
| Failed Delivery Handling | Mark failed + reason + photo, auto-reschedule notification | Driver, Customer |

**Milestone:** End-to-end delivery from order to doorstep with full tracking and COD support.

#### Phase 6: Intelligence Layer (AI + Analytics)

| Feature | Description | Users Served |
|---|---|---|
| Owner CEO Dashboard | One-glance business health with drill-down by branch | Owner |
| Branch Scoring | Performance comparison across branches with diagnostics | Owner, HQ |
| AI Demand Forecasting | Predict stockouts before they happen, recommend reorder quantities | Manager, HQ |
| Size Curve Analysis | Per-branch size selling patterns to optimize orders | Manager, HQ |
| Holiday/Weather/Payday Alerts | Philippine calendar engine with impact forecasting | Manager, HQ |
| Search Data Insights | "What customers search but we don't carry" — product development signals | Owner, HQ |

**Milestone:** The system gets smart. It warns before problems happen and recommends specific actions with peso impact.

#### Phase 7: Ecosystem (Network effects)

| Feature | Description | Users Served |
|---|---|---|
| Supplier Portal | View POs, confirm stock, propose alternatives, see demand velocity | Supplier |
| Customer Loyalty Program | Tiers, points, streaks, rewards | Customer |
| AI Fashion Assistant | "Style Me Near Me" — outfit recommendations from in-stock items | Customer |
| Advanced POS Features | Rush mode, smart promo auto-apply, mobile POS | Cashier |
| Route Optimization | AI-optimized delivery routes for Manila traffic | Driver |
| Advanced Analytics | Expansion intelligence, multi-branch P&L, supplier negotiation data | Owner |

**Milestone:** The ecosystem compounds. Suppliers, customers, and AI create a self-reinforcing advantage.

### Out of Scope for MVP (All Phases)

These brainstorming ideas are deferred until the core platform is proven:

- Virtual try-on / AR features (#43)
- Visual search — "snap to find" (#52)
- Voice dashboard (#51)
- Customer voting on new products (#69)
- Pop-up van from delivery data (#66)
- RedBox Wrapped year-in-review (#72)
- Style Duels weekly voting (#97)
- Self-checkout via customer phone (#63)
- Influencer tracking + measurable foot traffic (#60)
- International expansion features (multi-currency, multi-language)

### MVP Success Criteria

**Phase 1-2 = Minimum Viable Product:**
- At least 1 branch fully operational on the platform (no Excel)
- HQ can see branch stock and sales in real-time
- POS handles all standard transactions including Senior/PWD
- Stock accuracy > 95% within first month

**Phase 3 = Minimum Viable Network:**
- Multi-branch stock transfers flowing through the system
- Warehouse receiving digitized
- Zero Viber-based stock coordination remaining

**Phase 4 = Minimum Viable Differentiator:**
- Website shows real-time stock by branch
- At least one successful reservation-to-pickup conversion
- Customer feedback confirms "the website said it was there, and it was"

**Go/No-Go Decision Points:**
- After Phase 2: Is the system faster than Excel? → If yes, expand to all branches
- After Phase 3: Is stock flow smooth across branches? → If yes, launch website
- After Phase 4: Are customers using the website? → If yes, invest in delivery and AI

### Future Vision

**2-3 Year Vision — The Self-Optimizing Commerce Organism:**

The platform evolves from a tool people use into a system that runs itself:

- **AI handles routine decisions** — auto-reorder, auto-transfer, auto-price adjustments for slow-moving stock
- **Branches self-balance** — peer-to-peer stock trading without HQ involvement
- **Customers co-create** — voting on new products, photo reviews, style community
- **Suppliers are partners** — proactive restocking, shared demand visibility, data-driven negotiation
- **Expansion is data-driven** — delivery data reveals where to open next, AI predicts revenue before lease is signed

**The Innovation Stack compounds:** Real-time inventory + AI + Physical stores + Website + Customer data = a self-learning system that gets smarter every day. A competitor would need all five layers simultaneously to replicate it.
