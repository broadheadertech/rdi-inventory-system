<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; max-width: 1100px; margin: 0 auto; padding: 20px; }
  h1 { color: #E8192C; border-bottom: 3px solid #E8192C; padding-bottom: 8px; font-size: 24px; }
  h2 { color: #E8192C; margin-top: 28px; font-size: 16px; border-bottom: 1px solid #E8192C; padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 20px 0; font-size: 11px; }
  th { background: #E8192C; color: white; padding: 6px 10px; text-align: left; font-size: 11px; }
  td { border: 1px solid #ddd; padding: 5px 10px; font-size: 11px; vertical-align: top; }
  tr:nth-child(even) { background: #f9f9f9; }
  .header-bar { background: #0A0A0A; color: white; padding: 16px 20px; border-radius: 8px; margin-bottom: 20px; }
  .header-bar h1 { color: white; border-bottom: none; margin: 0; }
  .header-bar p { color: #aaa; margin: 4px 0 0 0; font-size: 12px; }
  .summary { background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 12px; }
  .summary strong { color: #E8192C; }
  .page-break { page-break-before: always; }
  .badge { display: inline-block; background: #E8192C; color: white; font-size: 9px; padding: 1px 6px; border-radius: 3px; font-weight: bold; }
  .num { color: #E8192C; font-weight: bold; text-align: center; width: 30px; }
</style>

<div class="header-bar">
<h1>Redbox Apparel — Complete Feature List</h1>
<p>Version 1.0 &nbsp;|&nbsp; March 8, 2026 &nbsp;|&nbsp; 88 Features across 7 Portals</p>
</div>

<div class="summary">

**Platform:** Next.js 15 + Convex + Clerk &nbsp;|&nbsp; **Portals:** 7 &nbsp;|&nbsp; **Roles:** 8 &nbsp;|&nbsp; **Database Tables:** 43 &nbsp;|&nbsp; **Total Features:** <strong>88</strong>

</div>

## Customer Storefront <span class="badge">13 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 1 | Homepage | Hero banner carousel, brand showcase, category grid, trending products, hot deals, promotions display |
| 2 | Product Browsing | Browse by brand, category, and tag with gender filtering (All / Women / Men / Kids) |
| 3 | Product Search | Full-text search with instant results page |
| 4 | Product Detail Page | Variant selection (color, size), image gallery, pricing, brand info |
| 5 | Quick View | Bottom-sheet product preview without leaving the current page |
| 6 | Shopping Cart | Add/remove items, quantity adjustment, stock validation, free shipping threshold (₱999) |
| 7 | Checkout | Address selection, payment methods (COD, GCash, Maya, Card, Bank Transfer), order placement |
| 8 | Order Tracking | Order history with status filtering, order detail with shipment/courier tracking |
| 9 | Customer Account | Profile view, address management (add/edit/delete/set default), order history |
| 10 | Wishlist | Save/remove favorites, add to cart from wishlist, out-of-stock indicators |
| 11 | Product Reservations | Reserve items for branch pickup with auto-generated confirmation code |
| 12 | Recently Viewed | Auto-tracked browsing history with product suggestions |
| 13 | Branch Locator | View retail branch locations and contact info |

---

## POS System (Point of Sale) <span class="badge">14 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 14 | Shift Management | Open/close shifts with cash fund initialization and balance verification |
| 15 | Barcode Scanning | Camera-based scanner, USB barcode gun support, manual SKU entry |
| 16 | Product Lookup | Browse by brand/category with real-time stock display per branch |
| 17 | POS Cart | Table-format cart with item management, quantity entry, line totals |
| 18 | Discount Application | Senior citizen & PWD discounts with VAT-exempt calculation |
| 19 | Promotion Application | Apply active promotions with auto-calculated discounts based on promo rules |
| 20 | Payment Processing | Cash (with change calculation), GCash, Maya payment methods |
| 21 | Receipt Generation | Unique receipt numbers with printable receipt output |
| 22 | X-Reading | Mid-shift sales reading report (printable) |
| 23 | Y-Reading | End-of-shift closing report with full breakdown (printable) |
| 24 | Reconciliation | End-of-day cash count vs system total, variance tracking per payment method |
| 25 | Demand Logging | Log customer requests for unavailable products (brand, size, design, notes) |
| 26 | Offline Mode | Offline stock snapshot, cart persistence, queued transactions, auto-sync on reconnect |
| 27 | Connection Indicator | Visual online/offline status badge for cashier awareness |

---

<div class="page-break"></div>

## Branch Manager Portal <span class="badge">9 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 28 | Branch Dashboard | Today's revenue, transaction count, items sold, avg transaction value, hourly sales chart |
| 29 | Stock Levels | View inventory per product/variant with low-stock indicators |
| 30 | Stock Alerts | Low-stock alerts with dismiss/resolve actions and threshold display |
| 31 | Transfer Requests | Create stock requests to warehouse, view incoming/outgoing transfers |
| 32 | Transfer Tracking | Full status pipeline (requested → approved → packed → in-transit → delivered) |
| 33 | Internal Invoices | View transfer invoices with invoice numbers, amounts, and line-item details |
| 34 | Branch Reservations | View/manage customer reservations with confirmation codes and expiry |
| 35 | Branch Demand Tracking | View demand entries logged by staff, search/filter by brand and design |
| 36 | Branch Analytics | Sales performance charts with hourly/daily breakdown |

---

## Warehouse / HQ Portal <span class="badge">9 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 37 | Warehouse Dashboard | Transfer pipeline overview, today's revenue, pending queue count, recent invoices |
| 38 | Transfer Request Review | Approve/reject branch transfer requests with notes and reason tracking |
| 39 | Packing | Pack approved transfers — scan and verify items against requested quantities |
| 40 | Dispatch | Mark packed transfers as dispatched and assign drivers for delivery |
| 41 | Receiving | Receive incoming shipments, scan products, update inventory with batch tracking |
| 42 | Driver Assignment | Assign drivers to deliveries, view driver contact info and route details |
| 43 | In-Transit Tracking | Monitor all active deliveries across routes in real-time |
| 44 | Restock AI Suggestions | AI-generated restock recommendations with confidence levels (high/medium/low) |
| 45 | Warehouse Analytics | Outbound transfer metrics, receiving metrics, fulfillment speed |

---

## Driver Portal <span class="badge">4 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 46 | Delivery Queue | View list of assigned deliveries with item counts and destination info |
| 47 | Delivery Detail | Branch destination, address, complete item list, delivery timeline |
| 48 | Mark Arrival | Confirm driver arrival at delivery location with timestamp |
| 49 | Confirm Delivery | Complete delivery with verification and status update |

---

<div class="page-break"></div>

## Admin Panel (HQ Administration) <span class="badge">25 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 50 | Command Center Dashboard | System-wide revenue, branch health scores (0-100), attention items, product movers snapshot |
| 51 | Brand Management | Create/update/deactivate brands with logo and banner upload, tag assignment |
| 52 | Category Management | Nested under brands with image upload, tag assignment, activation controls |
| 53 | Style/Product Management | Create product designs with descriptions, base pricing, category assignment |
| 54 | Variant Management | SKU, barcode, size, color, gender, selling price, cost price per variant |
| 55 | Product Image Management | Upload images, set primary flag, sort ordering, multi-image gallery |
| 56 | Bulk Import | CSV/Excel product import for mass catalog population |
| 57 | Color Management | System-wide color palette with hex codes and active/inactive status |
| 58 | Size Management | System-wide size list with sort ordering and active/inactive status |
| 59 | Promotions Engine | 4 promo types (percentage, fixed, buy-X-get-Y, tiered) with 10 scoping dimensions |
| 60 | Banner Management | Hero/promo/flash-sale banners with image upload, scheduling, and display ordering |
| 61 | User Management | Create/deactivate users, assign roles (8 types), assign to branches |
| 62 | Inventory Overview | Cross-branch stock levels with batch tracking and aging tiers (green/yellow/red) |
| 63 | Transfer Management | System-wide transfer oversight across all branches with full status history |
| 64 | Invoice Management | View and track all internal transfer invoices with line-item breakdown |
| 65 | Demand Intelligence | Cross-branch demand analysis with weekly auto-generated summaries |
| 66 | DDP Analytics | Demand-Driven Purchasing analytics for procurement decisions |
| 67 | Product Movers Report | Fast/normal/slow/dead stock classification based on 30-day sales velocity |
| 68 | Inventory Aging Analysis | Stock freshness tracking by batch receipt date across branches |
| 69 | BIR Tax Reports | Philippine Bureau of Internal Revenue compliance report generation |
| 70 | Branch Scorecards | Performance scoring: sales volume, stock accuracy, fulfillment speed (0-100) |
| 71 | HQ Analytics | Revenue trends, transaction analytics, branch-to-branch comparisons |
| 72 | Audit Trail | Append-only log of all system actions with user, entity, before/after state |
| 73 | General Settings | Logo/favicon upload, tax config, shipping settings, feature toggles |
| 74 | Seed Data Tool | Database seeding utility for demo/testing environments |

---

## Supplier Portal <span class="badge">2 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 75 | Supplier Proposals | Submit product proposals with item descriptions, quantities, and unit pricing |
| 76 | Proposal Tracking | View proposal status (pending / accepted / rejected) with reviewer notes |

---

<div class="page-break"></div>

## System & Background Features <span class="badge">12 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 77 | Role-Based Access Control | 8 roles with route-level + function-level enforcement across all portals |
| 78 | Branch Isolation | Non-HQ users scoped to their assigned branch only; HQ sees all branches |
| 79 | Clerk Auth Integration | OAuth login/signup, webhook-based user sync, edge JWT validation |
| 80 | Hourly Low-Stock Sweep | Cron job checks inventory against thresholds and creates alerts automatically |
| 81 | Hourly Reservation Expiry | Auto-expire unfulfilled reservations past 24-hour window |
| 82 | Daily Restock AI Generation | AI-powered restock suggestions generated at 5 AM PHT daily |
| 83 | Daily Branch Scoring | Performance metrics calculation at 6 AM PHT daily |
| 84 | Weekly Demand Summaries | Aggregated demand reports by brand generated every Monday 6 AM PHT |
| 85 | PWA / Service Worker | Installable progressive web app with offline caching |
| 86 | Audit Logging | Every state-changing operation logged with user, branch, entity, before/after |
| 87 | Philippine Tax Compliance | 12% VAT inclusive pricing, Senior/PWD VAT-exempt discount calculations |
| 88 | File Storage CDN | Product images, logos, banners served via Convex Storage with CDN URLs |

---

<div class="summary">

**Feature Summary by Portal:**

| Portal | Features | Target Users |
|--------|----------|-------------|
| Customer Storefront | 13 | Public / Registered Customers |
| POS System | 14 | Cashiers, Managers |
| Branch Manager | 9 | Branch Managers, Viewers |
| Warehouse / HQ | 9 | Warehouse Staff, HQ Staff |
| Driver | 4 | Delivery Drivers |
| Admin Panel | 25 | Administrators, HQ Staff |
| Supplier | 2 | External Suppliers |
| System & Background | 12 | Automated / All Users |
| **Total** | **88** | |

</div>
