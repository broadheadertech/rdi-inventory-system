import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, HeadingLevel, ShadingType,
  TableLayoutType, VerticalAlign, PageBreak,
} from "docx";
import { writeFileSync } from "fs";

const RED = "E8192C";
const BLACK = "0A0A0A";
const WHITE = "FFFFFF";
const GRAY = "F5F5F5";
const LIGHT_GRAY = "F9F9F9";
const MED_GRAY = "DDDDDD";

const noBorder = { style: BorderStyle.NONE, size: 0, color: WHITE };
const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: MED_GRAY };
const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, color: BLACK },
    borders,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text, bold: true, color: WHITE, size: 20, font: "Segoe UI" })],
    })],
  });
}

function cell(text, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: opts.shading ? { type: ShadingType.SOLID, color: opts.shading } : undefined,
    borders: opts.noBorders ? noBorders : borders,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      spacing: { before: 30, after: 30 },
      children: [new TextRun({
        text,
        bold: opts.bold || false,
        color: opts.color || "333333",
        size: opts.size || 20,
        font: "Segoe UI",
      })],
    })],
  });
}

function sectionTitle(text) {
  return new Paragraph({
    spacing: { before: 360, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: RED } },
    children: [new TextRun({ text, bold: true, color: RED, size: 26, font: "Segoe UI" })],
  });
}

function moduleHeader(title, subtitle) {
  return [
    new Paragraph({
      spacing: { before: 300, after: 60 },
      children: [new TextRun({ text: title, bold: true, color: RED, size: 24, font: "Segoe UI" })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: subtitle, italics: true, color: "666666", size: 20, font: "Segoe UI" })],
    }),
  ];
}

function featureTable(features) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ children: [headerCell("#", 6), headerCell("Feature", 25), headerCell("What It Does", 69)] }),
      ...features.map((f, i) =>
        new TableRow({
          children: [
            cell(String(f.num), 6, { align: AlignmentType.CENTER, shading: i % 2 === 1 ? LIGHT_GRAY : undefined }),
            cell(f.name, 25, { bold: true, shading: i % 2 === 1 ? LIGHT_GRAY : undefined }),
            cell(f.desc, 69, { shading: i % 2 === 1 ? LIGHT_GRAY : undefined }),
          ],
        })
      ),
    ],
  });
}

// --- Data ---

const modules = [
  {
    title: "Module 1 — Core Shopping Experience",
    subtitle: "The foundation of the storefront — browse, search, discover, and view products.",
    features: [
      { num: 1, name: "Homepage", desc: "Hero banners, brand showcase, trending products, category grid, promotions display" },
      { num: 2, name: "Product Browsing", desc: "Browse by brand, category, and tag with gender tabs; infinite scroll with sticky filters" },
      { num: 3, name: "Product Search", desc: "Smart search with autocomplete — shows matching brands, categories, and products as you type" },
      { num: 4, name: "Product Detail Page", desc: "Image gallery with full-screen lightbox, color swatch with live image swap, size selector, pricing, brand info" },
      { num: 5, name: "Quick View", desc: "Bottom-sheet product preview without leaving current page — faster browsing" },
      { num: 6, name: "New Arrivals", desc: "Dedicated page for products added in the last 30 days with gender filters" },
      { num: 7, name: "Bestsellers", desc: "Rankings powered by real sales data with social proof (\"42 sold this month\")" },
      { num: 8, name: "Style Navigation", desc: "Browse by lifestyle — Street Style, Office Ready, Weekend Vibes, Athletic, Date Night" },
    ],
  },
  {
    title: "Module 2 — Cart & Checkout",
    subtitle: "Complete purchase flow from cart to order confirmation.",
    features: [
      { num: 9, name: "Shopping Cart", desc: "Add/remove items, quantity adjustment, stock validation, free shipping progress bar (₱999 threshold)" },
      { num: 10, name: "Checkout", desc: "Address selection, 5 payment methods (COD, GCash, Maya, Card, Bank Transfer), order placement" },
      { num: 11, name: "Delivery Options", desc: "3 speeds — Standard (free over ₱999), Express (₱149, 1-2 days), Same-Day (₱249) with delivery date estimates" },
      { num: 12, name: "In-Store Pickup (BOPIS)", desc: "Buy online, pick up at branch — branch selector with hours and contact info, free shipping" },
    ],
  },
  {
    title: "Module 3 — Customer Account & Orders",
    subtitle: "Post-purchase experience and account management.",
    features: [
      { num: 13, name: "Customer Account", desc: "Profile management, address book (add/edit/delete/set default)" },
      { num: 14, name: "Order Tracking", desc: "Order history with status filters, detailed tracking with shipment/courier info" },
      { num: 15, name: "Self-Service Returns", desc: "Request returns from order history — reason selection, photo upload, refund method choice" },
      { num: 16, name: "Buy Again", desc: "Reorder from past purchases — preview on account page with dedicated full page" },
    ],
  },
  {
    title: "Module 4 — Wishlist & Social",
    subtitle: "Save favorites and share with others.",
    features: [
      { num: 17, name: "Wishlist", desc: "Save/remove favorites, add to cart from wishlist, out-of-stock indicators" },
      { num: 18, name: "Shared Wishlists", desc: "Generate unique shareable link — recipients view your wishlist without logging in" },
    ],
  },
  {
    title: "Module 5 — Real-Time Intelligence",
    subtitle: "Live data features powered by real-time backend technology.",
    features: [
      { num: 19, name: "Location-Aware Hero", desc: "Detects user location, shows nearest branch with distance in the hero section" },
      { num: 20, name: "Store Stock Checker", desc: "Check real-time branch stock availability on product pages — green/gray indicators per branch" },
      { num: 21, name: "Stock Urgency", desc: "\"Only 3 left in your size!\" alerts from live inventory data" },
      { num: 22, name: "Live Announcement Ticker", desc: "Scrolling real-time ticker with promo updates, stock changes, and drop announcements; payday sale detection" },
      { num: 23, name: "Flash Sale Countdown", desc: "DD:HH:MM:SS countdown timers on flash sale banners with live tick" },
    ],
  },
  {
    title: "Module 6 — Loyalty & Promotions",
    subtitle: "Customer retention and engagement tools.",
    features: [
      { num: 24, name: "Loyalty Dashboard", desc: "Points balance, tier status (Bronze → Platinum), progress bar, earning history" },
      { num: 25, name: "Voucher Collection", desc: "Browse and collect available discount vouchers, auto-apply at checkout" },
      { num: 26, name: "Price Drop Alerts", desc: "Watch products for price changes — get notified when price drops" },
      { num: 27, name: "Restock Notifications", desc: "\"Notify me when back in stock\" — alerts when out-of-stock items return" },
    ],
  },
  {
    title: "Module 7 — Reviews & Personalization",
    subtitle: "Trust-building and personalized shopping experience.",
    features: [
      { num: 28, name: "Product Reviews", desc: "Submit star ratings and text reviews, verified purchase badges, photo reviews" },
      { num: 29, name: "Size Feedback", desc: "Post-purchase \"How did the fit feel?\" — runs small / true to size / runs large" },
      { num: 30, name: "Saved Size Preferences", desc: "Remembered sizes per category, auto-selected on product pages" },
      { num: 31, name: "Product Recommendations", desc: "\"Complete the Look\" outfit suggestions + \"Customers Also Bought\" co-purchase recommendations" },
    ],
  },
];

const infraComponents = [
  { name: "Authentication", desc: "Secure login/signup with Google, email/password via Clerk — session management, JWT validation" },
  { name: "Real-Time Backend", desc: "Convex-powered live data subscriptions — inventory, prices, and promotions update instantly" },
  { name: "PWA Support", desc: "Installable on mobile home screen, offline caching, app-like experience" },
  { name: "Responsive Design", desc: "Mobile-first design that works on phones, tablets, and desktops" },
  { name: "CDN & Image Optimization", desc: "Product images served via global CDN for fast loading" },
  { name: "SEO Optimization", desc: "Server-side rendering for search engine discoverability" },
];

const pricingRows = [
  { module: "Module 1 — Core Shopping Experience", count: "8" },
  { module: "Module 2 — Cart & Checkout", count: "4" },
  { module: "Module 3 — Customer Account & Orders", count: "4" },
  { module: "Module 4 — Wishlist & Social", count: "2" },
  { module: "Module 5 — Real-Time Intelligence", count: "5" },
  { module: "Module 6 — Loyalty & Promotions", count: "4" },
  { module: "Module 7 — Reviews & Personalization", count: "4" },
  { module: "Module 8 — Infrastructure & Foundation", count: "—" },
];

const addOns = [
  { name: "POS System", desc: "17-feature point-of-sale for retail branches" },
  { name: "Branch Manager Portal", desc: "9-feature branch operations dashboard" },
  { name: "Warehouse Portal", desc: "9-feature warehouse & logistics management" },
  { name: "Admin Panel", desc: "25-feature HQ administration system" },
  { name: "Driver Portal", desc: "4-feature delivery tracking for drivers" },
  { name: "Supplier Portal", desc: "2-feature supplier proposal management" },
];

// --- Build Document ---

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Segoe UI", size: 22 } },
    },
  },
  sections: [
    {
      properties: {
        page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } },
      },
      children: [
        // Header bar
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  shading: { type: ShadingType.SOLID, color: BLACK },
                  borders: noBorders,
                  children: [
                    new Paragraph({
                      spacing: { before: 160, after: 0 },
                      children: [new TextRun({ text: "Redbox Apparel — Customer App", bold: true, color: WHITE, size: 36, font: "Segoe UI" })],
                    }),
                    new Paragraph({
                      spacing: { before: 60, after: 0 },
                      children: [new TextRun({ text: "Project Pricing Proposal", bold: true, color: RED, size: 24, font: "Segoe UI" })],
                    }),
                    new Paragraph({
                      spacing: { before: 40, after: 160 },
                      children: [new TextRun({ text: "Prepared: March 8, 2026  |  Valid for 30 days", color: "AAAAAA", size: 18, font: "Segoe UI" })],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),

        // Summary box
        new Paragraph({ spacing: { before: 200 } }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  shading: { type: ShadingType.SOLID, color: GRAY },
                  borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
                  children: [
                    new Paragraph({
                      spacing: { before: 80, after: 30 },
                      children: [
                        new TextRun({ text: "Project: ", bold: true, color: RED, size: 20, font: "Segoe UI" }),
                        new TextRun({ text: "Custom-built mobile-first customer storefront web application", size: 20, font: "Segoe UI" }),
                      ],
                    }),
                    new Paragraph({
                      spacing: { after: 30 },
                      children: [
                        new TextRun({ text: "Technology: ", bold: true, color: RED, size: 20, font: "Segoe UI" }),
                        new TextRun({ text: "Next.js 15 (React), Convex (real-time backend), Clerk (authentication), Tailwind CSS", size: 20, font: "Segoe UI" }),
                      ],
                    }),
                    new Paragraph({
                      spacing: { after: 30 },
                      children: [
                        new TextRun({ text: "Delivery: ", bold: true, color: RED, size: 20, font: "Segoe UI" }),
                        new TextRun({ text: "Progressive Web App (PWA) — works on all devices, installable on mobile", size: 20, font: "Segoe UI" }),
                      ],
                    }),
                    new Paragraph({
                      spacing: { after: 80 },
                      children: [
                        new TextRun({ text: "Total Modules: ", bold: true, color: RED, size: 20, font: "Segoe UI" }),
                        new TextRun({ text: "8  |  ", size: 20, font: "Segoe UI" }),
                        new TextRun({ text: "Total Features: ", bold: true, color: RED, size: 20, font: "Segoe UI" }),
                        new TextRun({ text: "31", size: 20, font: "Segoe UI" }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),

        // Overview
        sectionTitle("Project Overview"),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({
            text: "A premium, mobile-first e-commerce storefront designed for the Philippine retail market. The app provides a complete online shopping experience — from product discovery and real-time stock checking to checkout with multiple payment options and delivery methods. Built with real-time technology for live inventory updates, location awareness, and personalized customer experiences.",
            size: 20, font: "Segoe UI", color: "444444",
          })],
        }),

        // Modules 1-4
        ...modules.slice(0, 4).flatMap(m => [...moduleHeader(m.title, m.subtitle), featureTable(m.features)]),

        // Page break
        new Paragraph({ children: [new PageBreak()] }),

        // Modules 5-7
        ...modules.slice(4, 7).flatMap(m => [...moduleHeader(m.title, m.subtitle), featureTable(m.features)]),

        // Module 8 — Infrastructure
        ...moduleHeader("Module 8 — Infrastructure & Foundation", "Non-visible but essential technical foundation that powers every module above."),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({ children: [headerCell("Component", 28), headerCell("What It Provides", 72)] }),
            ...infraComponents.map((c, i) =>
              new TableRow({
                children: [
                  cell(c.name, 28, { bold: true, shading: i % 2 === 1 ? LIGHT_GRAY : undefined }),
                  cell(c.desc, 72, { shading: i % 2 === 1 ? LIGHT_GRAY : undefined }),
                ],
              })
            ),
          ],
        }),

        // Page break
        new Paragraph({ children: [new PageBreak()] }),

        // Pricing Summary
        sectionTitle("Pricing Summary"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({ children: [headerCell("Module", 55), headerCell("Features", 15), headerCell("Price", 30)] }),
            ...pricingRows.map((r, i) =>
              new TableRow({
                children: [
                  cell(r.module, 55, { shading: i % 2 === 1 ? LIGHT_GRAY : undefined }),
                  cell(r.count, 15, { align: AlignmentType.CENTER, shading: i % 2 === 1 ? LIGHT_GRAY : undefined }),
                  cell("₱___,___", 30, { align: AlignmentType.RIGHT, bold: true, color: RED, shading: i % 2 === 1 ? LIGHT_GRAY : undefined }),
                ],
              })
            ),
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 55, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.SOLID, color: BLACK },
                  borders,
                  columnSpan: 1,
                  children: [new Paragraph({
                    spacing: { before: 60, after: 60 },
                    children: [new TextRun({ text: "TOTAL PROJECT COST", bold: true, color: WHITE, size: 22, font: "Segoe UI" })],
                  })],
                }),
                new TableCell({
                  width: { size: 15, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.SOLID, color: BLACK },
                  borders,
                  children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 60, after: 60 },
                    children: [new TextRun({ text: "31", bold: true, color: WHITE, size: 22, font: "Segoe UI" })],
                  })],
                }),
                new TableCell({
                  width: { size: 30, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.SOLID, color: BLACK },
                  borders,
                  children: [new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    spacing: { before: 60, after: 60 },
                    children: [new TextRun({ text: "₱___,___", bold: true, color: RED, size: 26, font: "Segoe UI" })],
                  })],
                }),
              ],
            }),
          ],
        }),

        // Terms
        sectionTitle("Terms & Conditions"),
        ...[
          ["Payment Terms:", "50% upon contract signing, 30% at midpoint delivery, 20% upon final acceptance"],
          ["Timeline:", "To be discussed based on selected modules"],
          ["Warranty:", "30-day bug-fix warranty after final delivery"],
          ["Hosting:", "Convex (backend) + Vercel (frontend) — hosting costs billed separately at actual usage rates"],
          ["Scope Changes:", "Additional features or modifications beyond this scope will be quoted separately"],
          ["Intellectual Property:", "Full source code ownership transfers to client upon final payment"],
        ].map(([label, value]) =>
          new Paragraph({
            spacing: { before: 60, after: 60 },
            bullet: { level: 0 },
            children: [
              new TextRun({ text: label + " ", bold: true, size: 20, font: "Segoe UI" }),
              new TextRun({ text: value, size: 20, font: "Segoe UI", color: "444444" }),
            ],
          })
        ),

        // Add-ons
        sectionTitle("Optional Add-Ons"),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({ children: [headerCell("Add-On", 25), headerCell("Description", 50), headerCell("Price", 25)] }),
            ...addOns.map((a, i) =>
              new TableRow({
                children: [
                  cell(a.name, 25, { bold: true, shading: i % 2 === 1 ? LIGHT_GRAY : undefined }),
                  cell(a.desc, 50, { shading: i % 2 === 1 ? LIGHT_GRAY : undefined }),
                  cell("₱___,___", 25, { align: AlignmentType.RIGHT, bold: true, color: RED, shading: i % 2 === 1 ? LIGHT_GRAY : undefined }),
                ],
              })
            ),
          ],
        }),

        // Footer
        new Paragraph({ spacing: { before: 400 }, border: { top: { style: BorderStyle.SINGLE, size: 1, color: MED_GRAY } } }),
        new Paragraph({
          spacing: { before: 80 },
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: "Redbox Apparel — Confidential Pricing Document  |  Prepared March 8, 2026  |  Valid for 30 days from date of issue",
            size: 16, color: "999999", font: "Segoe UI", italics: true,
          })],
        }),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync("docs/Pricing-CustomerApp.docx", buffer);
console.log("Generated docs/Pricing-CustomerApp.docx");
