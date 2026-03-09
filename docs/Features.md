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
  .new { display: inline-block; background: #16a34a; color: white; font-size: 8px; padding: 1px 5px; border-radius: 3px; font-weight: bold; margin-left: 4px; }
  .num { color: #E8192C; font-weight: bold; text-align: center; width: 30px; }
</style>

<div class="header-bar">
<h1>Redbox Apparel — Complete Feature List</h1>
<p>Version 2.0 &nbsp;|&nbsp; March 8, 2026 &nbsp;|&nbsp; 110 Features across 7 Portals</p>
</div>

<div class="summary">

**Platform:** Next.js 15 + Convex + Clerk &nbsp;|&nbsp; **Portals:** 7 &nbsp;|&nbsp; **Roles:** 8 &nbsp;|&nbsp; **Database Tables:** 43 &nbsp;|&nbsp; **Total Features:** <strong>110</strong>

</div>

## Customer Storefront <span class="badge">31 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 1 | Homepage | Hero banner carousel, brand showcase, category grid, trending products, hot deals, promotions display, location-aware nearest branch badge with distance, flash sale countdown timers, live real-time ticker with stock/promo/drop updates |
| 2 | Product Browsing | Browse by brand, category, and tag with gender filtering (All / Women / Men / Kids), infinite scroll with sticky filter bar, back-to-top FAB |
| 3 | Product Search | Full-text search with smart autocomplete — grouped suggestions for brands, categories, and products as you type |
| 4 | Product Detail Page | Variant selection (color swatch with live image swap, size), full-screen image lightbox with pinch-to-zoom, pricing, brand info, stock urgency indicator ("Only X left!"), price drop alerts, restock notifications, saved size auto-selection |
| 5 | Quick View | Bottom-sheet product preview without leaving the current page |
| 6 | Shopping Cart | Add/remove items, quantity adjustment, stock validation, free shipping progress bar with visual ₱999 threshold, shipping fee transparency |
| 7 | Checkout | Address selection, payment methods (COD, GCash, Maya, Card, Bank Transfer), 3 delivery speeds (Standard/Express/Same-Day), delivery date estimates, BOPIS (Buy Online Pickup In-Store) with branch selection, guest login wall |
| 8 | Order Tracking | Order history with status filtering, order detail with shipment/courier tracking |
| 9 | Customer Account | Profile view, address management (add/edit/delete/set default), order history |
| 10 | Wishlist | Save/remove favorites, add to cart from wishlist, out-of-stock indicators, share wishlist via unique link with public view page |
| 11 | Product Reservations | Reserve items for branch pickup with auto-generated confirmation code, live countdown timer with urgency colors |
| 12 | Recently Viewed | Auto-tracked browsing history with product suggestions |
| 13 | Branch Locator | View retail branch locations, contact info, and star rating with localStorage persistence |
| 14 | Product Reviews & Ratings | Submit reviews with star rating and text, verified purchase badges, size feedback aggregation ("runs small / true to size / runs large") |
| 15 | Product Recommendations | "Complete the Look" outfit suggestions and "Customers Also Bought" co-purchase recommendations on product pages |
| 16 | Store Stock Checker | Check real-time branch availability on product pages — green/gray dot indicators per branch with stock counts |
| 17 | Voucher Collection | Browse available discount vouchers, collect vouchers to account, auto-apply at checkout |
| 18 | Loyalty Dashboard | Points balance with tier status (Bronze/Silver/Gold/Platinum), progress bar to next tier, transaction history with cursor pagination |
| 19 | New Arrivals | Dedicated page showing products added in the last 30 days with gender filter tabs, NEW/HOT badges on product cards |
| 20 | Bestsellers | POS-powered bestseller rankings from real 30-day sales data, social proof ("42 sold"), gender filters |
| 21 | Buy Again | Reorder from past purchases — preview carousel on account page with full dedicated page, one-tap navigation to product |
| 22 | Self-Service Returns | Request returns from order history with reason selection, photo upload option, refund method choice |
| 23 | Style-Centric Navigation | Browse by lifestyle/occasion — Street Style, Office Ready, Weekend Vibes, Athletic, Date Night — with tag-based product matching, filters, and infinite scroll |
| 24 | Saved Size Preferences | Remember preferred sizes per category (Tops, Bottoms, Shoes) via localStorage, auto-selected on product pages |
| 25 | Post-Purchase Size Feedback | "How did the fit feel?" cards sent after delivery — runs small / true to size / runs large — feeds size recommendation data |
| 26 | Price Drop Alerts | Watch products for price drops with bell toggle, notification when price decreases |
| 27 | Restock Notifications | "Notify me when back in stock" for out-of-stock items, automated alerts on restock |
| 28 | Flash Sale Countdown | DD:HH:MM:SS dark-box countdown timers on flash sale banners with real-time tick |
| 29 | Reservation Countdown | Live countdown timer on active reservations showing hours/minutes remaining with urgency color transitions |
| 30 | Image Lightbox | Full-screen product image viewer with swipe navigation, pinch-to-zoom, keyboard controls |
| 31 | Free Shipping Threshold | Visual progress bar in cart showing distance to ₱999 free shipping, dynamic shipping fee display |

---

<div class="page-break"></div>

## POS System (Point of Sale) <span class="badge">17 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 32 | Shift Management | Open/close shifts with cash fund initialization and balance verification |
| 33 | Barcode Scanning | Camera-based scanner, USB barcode gun support, manual SKU entry |
| 34 | Product Lookup | Browse by brand/category with real-time stock display per branch |
| 35 | POS Cart | Table-format cart with item management, quantity entry, line totals |
| 36 | Discount Application | Senior citizen & PWD discounts with VAT-exempt calculation |
| 37 | Promotion Application | Apply active promotions with auto-calculated discounts based on promo rules |
| 38 | Payment Processing | Cash (with change calculation), GCash, Maya payment methods |
| 39 | Receipt Generation | Unique receipt numbers with printable receipt output and PDF export |
| 40 | X-Reading | Mid-shift sales reading report (printable) |
| 41 | Y-Reading | End-of-shift closing report with full breakdown (printable) |
| 42 | Reconciliation | End-of-day cash count vs system total, variance tracking per payment method |
| 43 | Demand Logging | Log customer requests for unavailable products (brand, size, design, notes) |
| 44 | Offline Mode | Offline stock snapshot, cart persistence, queued transactions, auto-sync on reconnect |
| 45 | Connection Indicator | Visual online/offline status badge for cashier awareness |
| 46 | Hold & Recall Transactions | Hold up to 5 in-progress carts with localStorage persistence, recall with badge count indicator, discard held transactions |
| 47 | Split Payment | Split transaction across two payment methods (e.g., Cash + GCash), correct allocation in X/Y/Z readings and reconciliation, receipt display |
| 48 | Quick Return / Exchange | 5-step wizard: receipt lookup, item selection with quantity, reason (wrong size/defective/changed mind/other), refund or exchange, confirmation with inventory restoration |

---

## Branch Manager Portal <span class="badge">9 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 49 | Branch Dashboard | Today's revenue, transaction count, items sold, avg transaction value, hourly sales chart |
| 50 | Stock Levels | View inventory per product/variant with low-stock indicators |
| 51 | Stock Alerts | Low-stock alerts with dismiss/resolve actions and threshold display |
| 52 | Transfer Requests | Create stock requests to warehouse, view incoming/outgoing transfers |
| 53 | Transfer Tracking | Full status pipeline (requested → approved → packed → in-transit → delivered) |
| 54 | Internal Invoices | View transfer invoices with invoice numbers, amounts, and line-item details |
| 55 | Branch Reservations | View/manage customer reservations with confirmation codes and expiry |
| 56 | Branch Demand Tracking | View demand entries logged by staff with search by brand/design, date range filter, brand summary badges, cursor-paginated table |
| 57 | Branch Analytics | Sales performance charts with hourly/daily breakdown |

---

## Warehouse / HQ Portal <span class="badge">9 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 58 | Warehouse Dashboard | Transfer pipeline overview, today's revenue, pending queue count, recent invoices |
| 59 | Transfer Request Review | Approve/reject branch transfer requests with notes and reason tracking |
| 60 | Packing | Pack approved transfers — scan and verify items against requested quantities |
| 61 | Dispatch | Mark packed transfers as dispatched and assign drivers for delivery |
| 62 | Receiving | Receive incoming shipments, scan products, update inventory with batch tracking |
| 63 | Driver Assignment | Assign drivers to deliveries, view driver contact info and route details |
| 64 | In-Transit Tracking | Monitor all active deliveries across routes in real-time |
| 65 | Restock AI Suggestions | AI-generated restock recommendations with confidence levels (high/medium/low) |
| 66 | Warehouse Analytics | Outbound transfer metrics, receiving metrics, fulfillment speed |

---

<div class="page-break"></div>

## Driver Portal <span class="badge">4 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 67 | Delivery Queue | View list of assigned deliveries with item counts and destination info |
| 68 | Delivery Detail | Branch destination, address, complete item list, delivery timeline |
| 69 | Mark Arrival | Confirm driver arrival at delivery location with timestamp |
| 70 | Confirm Delivery | Complete delivery with verification and status update |

---

## Admin Panel (HQ Administration) <span class="badge">25 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 71 | Command Center Dashboard | System-wide revenue, branch health scores (0-100), attention items, product movers snapshot |
| 72 | Brand Management | Create/update/deactivate brands with logo and banner upload, tag assignment |
| 73 | Category Management | Nested under brands with image upload, tag assignment, activation controls |
| 74 | Style/Product Management | Create product designs with descriptions, base pricing, category assignment |
| 75 | Variant Management | SKU, barcode, size, color, gender, selling price, cost price per variant |
| 76 | Product Image Management | Upload images, set primary flag, sort ordering, multi-image gallery |
| 77 | Bulk Import | CSV/Excel product import for mass catalog population |
| 78 | Color Management | System-wide color palette with hex codes and active/inactive status |
| 79 | Size Management | System-wide size list with sort ordering and active/inactive status |
| 80 | Promotions Engine | 4 promo types (percentage, fixed, buy-X-get-Y, tiered) with 10 scoping dimensions |
| 81 | Banner Management | Hero/promo/flash-sale banners with image upload, scheduling, and display ordering |
| 82 | User Management | Create/deactivate users, assign roles (8 types), assign to branches |
| 83 | Inventory Overview | Cross-branch stock levels with batch tracking and aging tiers (green/yellow/red) |
| 84 | Transfer Management | System-wide transfer oversight across all branches with full status history |
| 85 | Invoice Management | View and track all internal transfer invoices with line-item breakdown |
| 86 | Demand Intelligence | Cross-branch demand analysis with weekly auto-generated summaries |
| 87 | DDP Analytics | Demand-Driven Purchasing analytics for procurement decisions |
| 88 | Product Movers Report | Fast/normal/slow/dead stock classification based on 30-day sales velocity |
| 89 | Inventory Aging Analysis | Stock freshness tracking by batch receipt date across branches |
| 90 | BIR Tax Reports | Philippine Bureau of Internal Revenue compliance report generation |
| 91 | Branch Scorecards | Performance scoring: sales volume, stock accuracy, fulfillment speed (0-100) |
| 92 | HQ Analytics | Revenue trends, transaction analytics, branch-to-branch comparisons |
| 93 | Audit Trail | Append-only log of all system actions with user, entity, before/after state |
| 94 | General Settings | Logo/favicon upload, tax config, shipping settings, feature toggles |
| 95 | Seed Data Tool | Database seeding utility for demo/testing environments |

---

## Supplier Portal <span class="badge">2 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 96 | Supplier Proposals | Submit product proposals with item descriptions, quantities, and unit pricing |
| 97 | Proposal Tracking | View proposal status (pending / accepted / rejected) with reviewer notes |

---

<div class="page-break"></div>

## System & Background Features <span class="badge">13 Features</span>

| # | Feature | Description |
|---|---------|-------------|
| 98 | Role-Based Access Control | 8 roles with route-level + function-level enforcement across all portals |
| 99 | Branch Isolation | Non-HQ users scoped to their assigned branch only; HQ sees all branches |
| 100 | Clerk Auth Integration | OAuth login/signup, webhook-based user sync, edge JWT validation |
| 101 | Hourly Low-Stock Sweep | Cron job checks inventory against thresholds and creates alerts automatically |
| 102 | Hourly Reservation Expiry | Auto-expire unfulfilled reservations past 24-hour window |
| 103 | Daily Restock AI Generation | AI-powered restock suggestions generated at 5 AM PHT daily |
| 104 | Daily Branch Scoring | Performance metrics calculation at 6 AM PHT daily |
| 105 | Weekly Demand Summaries | Aggregated demand reports by brand generated every Monday 6 AM PHT |
| 106 | PWA / Service Worker | Installable progressive web app with offline caching |
| 107 | Audit Logging | Every state-changing operation logged with user, branch, entity, before/after |
| 108 | Philippine Tax Compliance | 12% VAT inclusive pricing, Senior/PWD VAT-exempt discount calculations |
| 109 | File Storage CDN | Product images, logos, banners served via Convex Storage with CDN URLs |
| 110 | Live Announcement Ticker | Real-time Convex-powered scrolling ticker bar with promo, stock, and drop updates; payday detection with contextual sale messaging |

---

<div class="summary">

**Feature Summary by Portal:**

| Portal | Features | Target Users |
|--------|----------|-------------|
| Customer Storefront | 31 | Public / Registered Customers |
| POS System | 17 | Cashiers, Managers |
| Branch Manager | 9 | Branch Managers, Viewers |
| Warehouse / HQ | 9 | Warehouse Staff, HQ Staff |
| Driver | 4 | Delivery Drivers |
| Admin Panel | 25 | Administrators, HQ Staff |
| Supplier | 2 | External Suppliers |
| System & Background | 13 | Automated / All Users |
| **Total** | **110** | |

</div>
