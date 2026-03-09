<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; max-width: 1000px; margin: 0 auto; padding: 20px; }
  h1 { color: #E8192C; font-size: 22px; margin-bottom: 4px; }
  h2 { color: #E8192C; margin-top: 32px; font-size: 15px; border-bottom: 2px solid #E8192C; padding-bottom: 4px; }
  h3 { color: #333; font-size: 13px; margin-top: 20px; margin-bottom: 6px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 16px 0; font-size: 11px; }
  th { background: #0A0A0A; color: white; padding: 7px 10px; text-align: left; font-size: 11px; }
  td { border: 1px solid #ddd; padding: 6px 10px; font-size: 11px; vertical-align: top; }
  tr:nth-child(even) { background: #f9f9f9; }
  .header-bar { background: #0A0A0A; color: white; padding: 20px 24px; border-radius: 8px; margin-bottom: 20px; }
  .header-bar h1 { color: white; border-bottom: none; margin: 0; font-size: 22px; }
  .header-bar p { color: #aaa; margin: 4px 0 0 0; font-size: 11px; }
  .header-bar .subtitle { color: #E8192C; font-size: 13px; font-weight: 600; margin-top: 6px; }
  .summary-box { background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; padding: 14px 18px; margin: 16px 0; font-size: 11px; line-height: 1.6; }
  .summary-box strong { color: #E8192C; }
  .page-break { page-break-before: always; }
  .module-card { border: 2px solid #E8192C; border-radius: 8px; padding: 14px 18px; margin: 12px 0; }
  .module-card h3 { color: #E8192C; margin: 0 0 6px 0; font-size: 14px; }
  .module-card p { font-size: 11px; color: #555; margin: 0 0 8px 0; }
  .badge { display: inline-block; background: #E8192C; color: white; font-size: 9px; padding: 2px 8px; border-radius: 3px; font-weight: bold; }
  .tag { display: inline-block; background: #0A0A0A; color: white; font-size: 8px; padding: 2px 6px; border-radius: 3px; margin-right: 4px; }
  .note { font-size: 10px; color: #777; font-style: italic; margin-top: 4px; }
  .price-cell { font-weight: bold; color: #E8192C; font-size: 13px; text-align: right; white-space: nowrap; }
  .total-row td { background: #0A0A0A !important; color: white !important; font-weight: bold; font-size: 12px; }
  .total-row .price-cell { color: #E8192C !important; font-size: 14px; }
  .footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 10px; color: #999; }
  ul { margin: 4px 0; padding-left: 18px; font-size: 11px; }
  li { margin-bottom: 2px; }
</style>

<div class="header-bar">
<h1>Redbox Apparel — Customer App</h1>
<div class="subtitle">Project Pricing Proposal</div>
<p>Prepared: March 8, 2026 &nbsp;|&nbsp; Valid for 30 days</p>
</div>

<div class="summary-box">

**Project:** Custom-built mobile-first customer storefront web application<br>
**Technology:** Next.js 15 (React), Convex (real-time backend), Clerk (authentication), Tailwind CSS<br>
**Delivery:** Progressive Web App (PWA) — works on all devices, installable on mobile<br>
**Total Modules:** 8 &nbsp;|&nbsp; **Total Features:** 31

</div>

## Project Overview

A premium, mobile-first e-commerce storefront designed for the Philippine retail market. The app provides a complete online shopping experience — from product discovery and real-time stock checking to checkout with multiple payment options and delivery methods. Built with real-time technology for live inventory updates, location awareness, and personalized customer experiences.

---

## Module Breakdown

## Module 1: Core Shopping Experience

The foundation of the storefront — browse, search, discover, and view products.

| # | Feature | What It Does |
|---|---------|-------------|
| 1 | Homepage | Hero banners, brand showcase, trending products, category grid, promotions display |
| 2 | Product Browsing | Browse by brand, category, and tag with gender tabs; infinite scroll with sticky filters |
| 3 | Product Search | Smart search with autocomplete — shows matching brands, categories, and products as you type |
| 4 | Product Detail Page | Image gallery with full-screen lightbox, color swatch with live image swap, size selector, pricing, brand info |
| 5 | Quick View | Bottom-sheet product preview without leaving current page — faster browsing |
| 6 | New Arrivals | Dedicated page for products added in the last 30 days with gender filters |
| 7 | Bestsellers | Rankings powered by real sales data with social proof ("42 sold this month") |
| 8 | Style Navigation | Browse by lifestyle — Street Style, Office Ready, Weekend Vibes, Athletic, Date Night |

---

## Module 2: Cart & Checkout

Complete purchase flow from cart to order confirmation.

| # | Feature | What It Does |
|---|---------|-------------|
| 9 | Shopping Cart | Add/remove items, quantity adjustment, stock validation, free shipping progress bar (₱999 threshold) |
| 10 | Checkout | Address selection, 5 payment methods (COD, GCash, Maya, Card, Bank Transfer), order placement |
| 11 | Delivery Options | 3 speeds — Standard (free over ₱999), Express (₱149, 1-2 days), Same-Day (₱249) with delivery date estimates |
| 12 | In-Store Pickup (BOPIS) | Buy online, pick up at branch — branch selector with hours and contact info, free shipping |

---

<div class="page-break"></div>

## Module 3: Customer Account & Orders

Post-purchase experience and account management.

| # | Feature | What It Does |
|---|---------|-------------|
| 13 | Customer Account | Profile management, address book (add/edit/delete/set default) |
| 14 | Order Tracking | Order history with status filters, detailed tracking with shipment/courier info |
| 15 | Self-Service Returns | Request returns from order history — reason selection, photo upload, refund method choice |
| 16 | Buy Again | Reorder from past purchases — preview on account page with dedicated full page |

---

## Module 4: Wishlist & Social

Save favorites and share with others.

| # | Feature | What It Does |
|---|---------|-------------|
| 17 | Wishlist | Save/remove favorites, add to cart from wishlist, out-of-stock indicators |
| 18 | Shared Wishlists | Generate unique shareable link — recipients view your wishlist without logging in |

---

## Module 5: Real-Time Intelligence

Live data features powered by real-time backend technology.

| # | Feature | What It Does |
|---|---------|-------------|
| 19 | Location-Aware Hero | Detects user location, shows nearest branch with distance in the hero section |
| 20 | Store Stock Checker | Check real-time branch stock availability on product pages — green/gray indicators per branch |
| 21 | Stock Urgency | "Only 3 left in your size!" alerts from live inventory data |
| 22 | Live Announcement Ticker | Scrolling real-time ticker with promo updates, stock changes, and drop announcements; payday sale detection |
| 23 | Flash Sale Countdown | DD:HH:MM:SS countdown timers on flash sale banners with live tick |

---

## Module 6: Loyalty & Promotions

Customer retention and engagement tools.

| # | Feature | What It Does |
|---|---------|-------------|
| 24 | Loyalty Dashboard | Points balance, tier status (Bronze → Platinum), progress bar, earning history |
| 25 | Voucher Collection | Browse and collect available discount vouchers, auto-apply at checkout |
| 26 | Price Drop Alerts | Watch products for price changes — get notified when price drops |
| 27 | Restock Notifications | "Notify me when back in stock" — alerts when out-of-stock items return |

---

## Module 7: Reviews & Personalization

Trust-building and personalized shopping experience.

| # | Feature | What It Does |
|---|---------|-------------|
| 28 | Product Reviews | Submit star ratings and text reviews, verified purchase badges, photo reviews |
| 29 | Size Feedback | Post-purchase "How did the fit feel?" — runs small / true to size / runs large |
| 30 | Saved Size Preferences | Remembered sizes per category, auto-selected on product pages |
| 31 | Product Recommendations | "Complete the Look" outfit suggestions + "Customers Also Bought" co-purchase recommendations |

---

<div class="page-break"></div>

## Module 8: Infrastructure & Foundation

Non-visible but essential technical foundation that powers every module above.

| Component | What It Provides |
|-----------|-----------------|
| Authentication | Secure login/signup with Google, email/password via Clerk — session management, JWT validation |
| Real-Time Backend | Convex-powered live data subscriptions — inventory, prices, and promotions update instantly |
| PWA Support | Installable on mobile home screen, offline caching, app-like experience |
| Responsive Design | Mobile-first design that works on phones, tablets, and desktops |
| CDN & Image Optimization | Product images served via global CDN for fast loading |
| SEO Optimization | Server-side rendering for search engine discoverability |

---

## Pricing Summary

| Module | Features | Price |
|--------|----------|-------|
| Module 1 — Core Shopping Experience | 8 | ₱___,___ |
| Module 2 — Cart & Checkout | 4 | ₱___,___ |
| Module 3 — Customer Account & Orders | 4 | ₱___,___ |
| Module 4 — Wishlist & Social | 2 | ₱___,___ |
| Module 5 — Real-Time Intelligence | 5 | ₱___,___ |
| Module 6 — Loyalty & Promotions | 4 | ₱___,___ |
| Module 7 — Reviews & Personalization | 4 | ₱___,___ |
| Module 8 — Infrastructure & Foundation | — | ₱___,___ |
<tr class="total-row"><td colspan="2">**TOTAL PROJECT COST**</td><td class="price-cell">₱___,___</td></tr>

---

## Terms & Conditions

- **Payment Terms:** 50% upon contract signing, 30% at midpoint delivery, 20% upon final acceptance
- **Timeline:** To be discussed based on selected modules
- **Warranty:** 30-day bug-fix warranty after final delivery
- **Hosting:** Convex (backend) + Vercel (frontend) — hosting costs billed separately at actual usage rates
- **Scope Changes:** Additional features or modifications beyond this scope will be quoted separately
- **Intellectual Property:** Full source code ownership transfers to client upon final payment

---

## Optional Add-Ons

| Add-On | Description | Price |
|--------|-------------|-------|
| POS System | 17-feature point-of-sale for retail branches | ₱___,___ |
| Branch Manager Portal | 9-feature branch operations dashboard | ₱___,___ |
| Warehouse Portal | 9-feature warehouse & logistics management | ₱___,___ |
| Admin Panel | 25-feature HQ administration system | ₱___,___ |
| Driver Portal | 4-feature delivery tracking for drivers | ₱___,___ |
| Supplier Portal | 2-feature supplier proposal management | ₱___,___ |

<div class="footer">

Redbox Apparel — Confidential Pricing Document &nbsp;|&nbsp; Prepared March 8, 2026 &nbsp;|&nbsp; Valid for 30 days from date of issue

</div>
