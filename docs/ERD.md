<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; max-width: 1100px; margin: 0 auto; padding: 20px; }
  h1 { color: #E8192C; border-bottom: 3px solid #E8192C; padding-bottom: 8px; }
  h2 { color: #333; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 32px; }
  h3 { color: #555; margin-top: 24px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0 24px 0; font-size: 11px; }
  th { background: #E8192C; color: white; padding: 6px 10px; text-align: left; font-size: 11px; }
  td { border: 1px solid #ddd; padding: 5px 10px; font-size: 11px; }
  tr:nth-child(even) { background: #f9f9f9; }
  .fk { color: #E8192C; font-weight: bold; }
  .pk { color: #0066cc; font-weight: bold; }
  .domain-header { background: #111; color: white; padding: 10px 16px; border-radius: 6px; margin: 28px 0 12px 0; font-size: 16px; }
  .legend { background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 12px; }
  .rel-table td { font-size: 11px; padding: 4px 8px; }
  .rel-table { margin-bottom: 32px; }
  code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 11px; }
  .diagram { background: #0A0A0A; color: #e0e0e0; padding: 16px 20px; border-radius: 8px; font-family: 'Consolas', 'Courier New', monospace; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre; margin: 16px 0; }
  .page-break { page-break-before: always; }
</style>

# Entity Relationship Diagram (ERD)

## Redbox Apparel — Database Schema

| Field | Value |
|-------|-------|
| **Version** | 1.0 |
| **Date** | 2026-03-08 |
| **Database** | Convex Document Store |
| **Total Tables** | 43 |

<div class="legend">

**Legend:**  <span class="pk">PK</span> = Primary Key (auto `_id`)  |  <span class="fk">FK</span> = Foreign Key Reference  |  **idx** = Indexed Field  |  **?** = Optional Field

All tables have an auto-generated `_id` primary key and `_creationTime` system field (Convex).

</div>

---

## High-Level Domain Relationship Map

<div class="diagram">
                            ┌──────────────┐
                            │    brands     │
                            └──────┬───────┘
                                   │ 1:N
                            ┌──────▼───────┐
                       ┌────│  categories   │────┐
                       │    └──────┬───────┘    │
                       │           │ 1:N         │
                       │    ┌──────▼───────┐    │
                       │    │    styles     │    │
                       │    └──┬────┬───┬──┘    │
                       │       │    │   │        │
              1:N      │  1:N  │    │   │ 1:N    │       1:N
      ┌────────────────┘       │    │   └────────┼──────────────────┐
      │                        │    │            │                  │
┌─────▼──────┐  ┌──────────────▼┐   │     ┌──────▼───────┐  ┌──────▼───────┐
│ sizeCharts │  │productImages  │   │     │  promotions  │  │   reviews    │
└────────────┘  └───────────────┘   │     └──────────────┘  └──────────────┘
                                    │ 1:N
                             ┌──────▼───────┐
                        ┌────│   variants   │────┬──────────────────┐
                        │    └──┬────┬──┬──┘    │                  │
                        │       │    │  │        │                  │
                   1:N  │       │    │  │   1:N  │             1:N  │
              ┌────────┘       │    │  │        │                  │
              │                │    │  │        │                  │
       ┌──────▼──────┐        │    │  │  ┌─────▼──────┐    ┌──────▼──────┐
       │  inventory  │        │    │  │  │ wishlists   │    │  cartItems  │
       └─────────────┘        │    │  │  └─────────────┘    └──────┬──────┘
       ┌─────────────┐        │    │  │                           │
       │  inv.Batches │◄──────┘    │  │                     ┌─────▼──────┐
       └─────────────┘             │  │                     │   carts    │
                                   │  │                     └─────┬──────┘
                              1:N  │  │ 1:N                       │
                    ┌──────────────┘  └──────────┐          ┌─────▼──────┐
                    │                            │          │ customers  │◄──┐
             ┌──────▼───────┐            ┌───────▼──────┐   └────────────┘   │
             │  txn Items   │            │ transferItems│                    │
             └──────┬───────┘            └───────┬──────┘   ┌────────────┐   │
                    │                            │          │  orders    │───┘
             ┌──────▼───────┐            ┌───────▼──────┐   └─────┬──────┘
             │ transactions │            │  transfers   │         │
             └──────────────┘            └──────────────┘   ┌─────▼──────┐
                                                            │ orderItems │
         ┌──────────────┐     ┌──────────────┐              └────────────┘
         │   branches   │◄────│    users     │
         └──────────────┘     └──────────────┘
</div>

---

<div class="page-break"></div>

<div class="domain-header">1. IDENTITY & ACCESS CONTROL</div>

### users

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"users">` | PK | Auto-generated |
| clerkId | `string` | **idx**, unique | Clerk OAuth identifier |
| email | `string` | | User email |
| name | `string` | | Display name |
| role | `string` | **idx** | `admin` \| `manager` \| `cashier` \| `warehouseStaff` \| `hqStaff` \| `viewer` \| `driver` \| `supplier` |
| branchId | `Id<"branches">?` | **idx**, <span class="fk">FK→branches</span> | Assigned branch (optional for admin/hq) |
| assignedBrands | `string[]?` | | Brand access list (for suppliers) |
| isActive | `boolean` | | Soft-delete flag |
| createdAt | `number` | | Unix timestamp (ms) |
| updatedAt | `number` | | Unix timestamp (ms) |

### branches

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"branches">` | PK | Auto-generated |
| name | `string` | | Branch name |
| address | `string` | | Physical address |
| type | `string?` | | `retail` \| `warehouse` |
| classification | `string?` | | `premium` \| `aclass` \| `bnc` \| `outlet` |
| isActive | `boolean` | | |
| phone | `string?` | | Contact number |
| latitude | `number?` | | Geo coordinates |
| longitude | `number?` | | Geo coordinates |
| configuration | `object?` | | `{ timezone, businessHours: { openTime, closeTime } }` |
| createdAt | `number` | | |
| updatedAt | `number` | | |

### settings

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"settings">` | PK | |
| key | `string` | **idx** | Setting key |
| value | `string` | | Setting value (JSON stringified) |
| updatedAt | `number` | | |

---

<div class="page-break"></div>

<div class="domain-header">2. PRODUCT CATALOG</div>

### brands

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"brands">` | PK | |
| name | `string` | | Brand name |
| logo | `string?` | | Legacy logo URL |
| storageId | `Id<"_storage">?` | | Logo file in Convex Storage |
| bannerStorageId | `Id<"_storage">?` | | Banner image |
| tags | `string[]?` | | Taxonomy tags |
| isActive | `boolean` | | |
| createdAt | `number` | | |
| updatedAt | `number` | | |

### categories

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"categories">` | PK | |
| brandId | `Id<"brands">` | **idx**, <span class="fk">FK→brands</span> | Parent brand |
| name | `string` | | Category name |
| tag | `string?` | | Display tag |
| storageId | `Id<"_storage">?` | | Category image |
| isActive | `boolean` | | |
| createdAt | `number` | | |
| updatedAt | `number` | | |

### styles

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"styles">` | PK | |
| categoryId | `Id<"categories">` | **idx**, <span class="fk">FK→categories</span> | Parent category |
| name | `string` | | Style/design name |
| description | `string?` | | Product description |
| basePriceCentavos | `number` | | Base price in centavos (₱) |
| isActive | `boolean` | | |
| createdAt | `number` | | |
| updatedAt | `number` | | |

### variants

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"variants">` | PK | |
| styleId | `Id<"styles">` | **idx**, <span class="fk">FK→styles</span> | Parent style |
| sku | `string` | **idx**, unique | Stock Keeping Unit |
| barcode | `string?` | **idx** | Scannable barcode |
| sizeGroup | `string?` | | Size group label |
| size | `string` | | Size value (S, M, L, 42, etc.) |
| color | `string` | | Color name |
| gender | `string?` | | `mens` \| `womens` \| `unisex` \| `kids` \| `boys` \| `girls` |
| priceCentavos | `number` | | Variant-specific price |
| costPriceCentavos | `number?` | | Cost/purchase price |
| storageId | `Id<"_storage">?` | | Variant-specific image |
| isActive | `boolean` | | |
| createdAt | `number` | | |
| updatedAt | `number` | | |

### productImages

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"productImages">` | PK | |
| styleId | `Id<"styles">` | **idx**, <span class="fk">FK→styles</span> | Parent style |
| storageId | `Id<"_storage">` | | Image file |
| isPrimary | `boolean` | | Primary display image |
| sortOrder | `number` | | Display ordering |
| createdAt | `number` | | |

### colors

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"colors">` | PK | |
| name | `string` | **idx** | Color name |
| hexCode | `string?` | | Hex color code |
| isActive | `boolean` | | |
| createdAt | `number` | | |
| updatedAt | `number` | | |

### sizes

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"sizes">` | PK | |
| name | `string` | | Size label |
| sortOrder | `number` | **idx** | Display ordering |
| sizeType | `string?` | | Legacy field |
| isActive | `boolean` | | |
| createdAt | `number` | | |
| updatedAt | `number` | | |

---

<div class="page-break"></div>

<div class="domain-header">3. INVENTORY & STOCK MANAGEMENT</div>

### inventory

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"inventory">` | PK | |
| branchId | `Id<"branches">` | **idx**, <span class="fk">FK→branches</span> | Stock location |
| variantId | `Id<"variants">` | **idx**, <span class="fk">FK→variants</span> | Product variant |
| quantity | `number` | | Available quantity |
| reservedQuantity | `number?` | | Held for pending transfers |
| lowStockThreshold | `number?` | | Alert trigger level |
| updatedAt | `number` | | |

**Composite Index:** `by_branch_variant` → `[branchId, variantId]` (unique per branch-variant pair)

### inventoryBatches

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"inventoryBatches">` | PK | |
| branchId | `Id<"branches">` | <span class="fk">FK→branches</span> | |
| variantId | `Id<"variants">` | <span class="fk">FK→variants</span> | |
| quantity | `number` | | Batch quantity |
| costPriceCentavos | `number` | | Cost at time of receipt |
| receivedAt | `number` | | Receipt timestamp (aging tier basis) |
| source | `string` | | `supplier` \| `transfer` \| `adjustment` \| `legacy` |
| sourceId | `string?` | | Reference to source document |
| notes | `string?` | | |
| createdAt | `number` | | |

**Composite Index:** `by_branch_variant_received` → `[branchId, variantId, receivedAt]`

### lowStockAlerts

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"lowStockAlerts">` | PK | |
| branchId | `Id<"branches">` | **idx**, <span class="fk">FK→branches</span> | |
| variantId | `Id<"variants">` | **idx**, <span class="fk">FK→variants</span> | |
| quantity | `number` | | Current stock when alert created |
| threshold | `number` | | Threshold that was breached |
| status | `string` | **idx** | `active` \| `dismissed` \| `resolved` |
| dismissedBy | `Id<"users">?` | <span class="fk">FK→users</span> | |
| createdAt | `number` | | |
| updatedAt | `number` | | |

---

<div class="page-break"></div>

<div class="domain-header">4. POINT OF SALE (POS)</div>

### transactions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"transactions">` | PK | |
| branchId | `Id<"branches">` | **idx**, <span class="fk">FK→branches</span> | Sale location |
| cashierId | `Id<"users">` | **idx**, <span class="fk">FK→users</span> | Processing cashier |
| receiptNumber | `string` | | Unique receipt number |
| subtotalCentavos | `number` | | Pre-discount total |
| vatAmountCentavos | `number` | | 12% VAT amount |
| discountAmountCentavos | `number` | | Senior/PWD discount |
| totalCentavos | `number` | | Final total |
| paymentMethod | `string` | | `cash` \| `gcash` \| `maya` |
| discountType | `string?` | | `senior` \| `pwd` \| `none` |
| customerId | `string?` | | Customer identifier |
| amountTenderedCentavos | `number?` | | Cash tendered |
| changeCentavos | `number?` | | Change given |
| isOffline | `boolean` | | Created while offline |
| syncedAt | `number?` | | When synced to server |
| promotionId | `Id<"promotions">?` | <span class="fk">FK→promotions</span> | Applied promotion |
| promoDiscountAmountCentavos | `number?` | | Promo discount value |
| createdAt | `number` | **idx** | Transaction timestamp |

### transactionItems

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"transactionItems">` | PK | |
| transactionId | `Id<"transactions">` | **idx**, <span class="fk">FK→transactions</span> | Parent transaction |
| variantId | `Id<"variants">` | <span class="fk">FK→variants</span> | Sold variant |
| quantity | `number` | | Quantity sold |
| unitPriceCentavos | `number` | | Price per unit |
| lineTotalCentavos | `number` | | quantity × unitPrice |

### cashierShifts

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"cashierShifts">` | PK | |
| branchId | `Id<"branches">` | **idx**, <span class="fk">FK→branches</span> | |
| cashierId | `Id<"users">` | **idx**, <span class="fk">FK→users</span> | |
| cashFundCentavos | `number` | | Opening cash fund |
| status | `string` | **idx** | `open` \| `closed` |
| openedAt | `number` | | |
| closedAt | `number?` | | |
| closedCashBalanceCentavos | `number?` | | Closing cash count |
| notes | `string?` | | |

### reconciliations

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"reconciliations">` | PK | |
| branchId | `Id<"branches">` | **idx**, <span class="fk">FK→branches</span> | |
| cashierId | `Id<"users">` | **idx**, <span class="fk">FK→users</span> | |
| reconciliationDate | `string` | **idx** | ISO date (YYYY-MM-DD) |
| expectedCashCentavos | `number` | | System-calculated cash |
| actualCashCentavos | `number` | | Physical cash count |
| differenceCentavos | `number` | | Variance |
| transactionCount | `number` | | Total transactions for day |
| cashSalesCentavos | `number` | | Cash payment total |
| gcashSalesCentavos | `number` | | GCash payment total |
| mayaSalesCentavos | `number` | | Maya payment total |
| totalSalesCentavos | `number` | | Grand total |
| notes | `string?` | | |
| createdAt | `number` | | |

---

<div class="page-break"></div>

<div class="domain-header">5. TRANSFERS & LOGISTICS</div>

### transfers

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"transfers">` | PK | |
| fromBranchId | `Id<"branches">` | **idx**, <span class="fk">FK→branches</span> | Source branch |
| toBranchId | `Id<"branches">` | **idx**, <span class="fk">FK→branches</span> | Destination branch |
| requestedById | `Id<"users">` | <span class="fk">FK→users</span> | Requestor |
| type | `string?` | | `stockRequest` \| `return` |
| status | `string` | **idx** | `requested` → `approved` → `packed` → `inTransit` → `delivered` |
| notes | `string?` | | |
| driverId | `Id<"users">?` | **idx**, <span class="fk">FK→users</span> | Assigned driver |
| packedAt/packedById | `number?` / `Id?` | | Pack timestamp & user |
| shippedAt/shippedById | `number?` / `Id?` | | Ship timestamp & user |
| deliveredAt/deliveredById | `number?` / `Id?` | | Delivery timestamp & user |
| approvedById/approvedAt | `Id?` / `number?` | | Approval details |
| rejectedById/rejectedAt/rejectedReason | | | Rejection details |
| cancelledById/cancelledAt | | | Cancellation details |
| createdAt | `number` | | |
| updatedAt | `number` | | |

### transferItems

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"transferItems">` | PK | |
| transferId | `Id<"transfers">` | **idx**, <span class="fk">FK→transfers</span> | Parent transfer |
| variantId | `Id<"variants">` | <span class="fk">FK→variants</span> | |
| requestedQuantity | `number` | | Originally requested |
| packedQuantity | `number?` | | Actually packed |
| receivedQuantity | `number?` | | Actually received |
| damageNotes | `string?` | | Damage at receiving |

### internalInvoices

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"internalInvoices">` | PK | |
| transferId | `Id<"transfers">` | **idx**, <span class="fk">FK→transfers</span> | |
| fromBranchId | `Id<"branches">` | <span class="fk">FK→branches</span> | |
| toBranchId | `Id<"branches">` | **idx**, <span class="fk">FK→branches</span> | |
| invoiceNumber | `string` | | Unique invoice number |
| subtotalCentavos | `number` | | |
| vatAmountCentavos | `number` | | |
| totalCentavos | `number` | | |
| status | `string` | | `generated` |
| generatedById | `Id<"users">` | <span class="fk">FK→users</span> | |
| createdAt | `number` | **idx** | |

### internalInvoiceItems

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"internalInvoiceItems">` | PK | |
| invoiceId | `Id<"internalInvoices">` | **idx**, <span class="fk">FK→internalInvoices</span> | |
| variantId | `Id<"variants">` | <span class="fk">FK→variants</span> | |
| quantity | `number` | | |
| unitCostCentavos | `number` | | Cost price per unit |
| lineTotalCentavos | `number` | | |

---

<div class="page-break"></div>

<div class="domain-header">6. PROMOTIONS & PRICING</div>

### promotions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"promotions">` | PK | |
| name | `string` | | Promotion name |
| description | `string?` | | |
| promoType | `string` | | `percentage` \| `fixedAmount` \| `buyXGetY` \| `tiered` |
| percentageValue | `number?` | | % discount (for percentage type) |
| maxDiscountCentavos | `number?` | | Cap on percentage discount |
| fixedAmountCentavos | `number?` | | Flat discount (for fixedAmount type) |
| buyQuantity | `number?` | | Buy X (for buyXGetY type) |
| getQuantity | `number?` | | Get Y free (for buyXGetY type) |
| minSpendCentavos | `number?` | | Minimum spend (for tiered type) |
| tieredDiscountCentavos | `number?` | | Discount amount (for tiered type) |
| **Scoping** | | | |
| branchIds | `Id<"branches">[]` | <span class="fk">FK→branches</span> | Empty = all branches |
| branchClassifications | `string[]?` | | Filter by branch classification |
| brandIds | `Id<"brands">[]` | <span class="fk">FK→brands</span> | Empty = all brands |
| categoryIds | `Id<"categories">[]` | <span class="fk">FK→categories</span> | Empty = all categories |
| variantIds | `Id<"variants">[]` | <span class="fk">FK→variants</span> | Empty = all variants |
| styleIds | `Id<"styles">[]?` | <span class="fk">FK→styles</span> | Empty = all styles |
| genders | `string[]?` | | Gender filter |
| colors | `string[]?` | | Color filter |
| sizes | `string[]?` | | Size filter |
| agingTiers | `string[]?` | | `green` \| `yellow` \| `red` |
| **Validity** | | | |
| startDate | `number` | **idx** | Promo start timestamp |
| endDate | `number?` | | Promo end (null = no expiry) |
| isActive | `boolean` | **idx** | |
| priority | `number` | | Lower = higher priority |
| createdById | `Id<"users">` | <span class="fk">FK→users</span> | |
| createdAt | `number` | | |
| updatedAt | `number` | | |

---

<div class="page-break"></div>

<div class="domain-header">7. STOREFRONT — CUSTOMERS & ORDERS</div>

### customers

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"customers">` | PK | |
| clerkId | `string` | **idx** | Clerk OAuth ID |
| email | `string` | **idx** | |
| firstName | `string` | | |
| lastName | `string` | | |
| phone | `string?` | | |
| avatarUrl | `string?` | | |
| gender | `string?` | | `male` \| `female` \| `other` |
| dateOfBirth | `string?` | | ISO date |
| isActive | `boolean` | | |
| createdAt | `number` | | |
| updatedAt | `number` | | |

### customerAddresses

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"customerAddresses">` | PK | |
| customerId | `Id<"customers">` | **idx**, <span class="fk">FK→customers</span> | |
| label | `string` | | "Home", "Office", etc. |
| recipientName | `string` | | |
| phone | `string` | | |
| addressLine1 | `string` | | |
| addressLine2 | `string?` | | |
| city | `string` | | |
| province | `string` | | |
| postalCode | `string` | | |
| country | `string` | | |
| isDefault | `boolean` | | Default shipping address |
| createdAt | `number` | | |
| updatedAt | `number` | | |

### carts

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"carts">` | PK | |
| customerId | `Id<"customers">` | **idx**, <span class="fk">FK→customers</span> | One cart per customer |
| updatedAt | `number` | | |

### cartItems

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"cartItems">` | PK | |
| cartId | `Id<"carts">` | **idx**, <span class="fk">FK→carts</span> | |
| variantId | `Id<"variants">` | <span class="fk">FK→variants</span> | |
| quantity | `number` | | |
| addedAt | `number` | | |

**Composite Index:** `by_cart_variant` → `[cartId, variantId]`

### orders

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"orders">` | PK | |
| customerId | `Id<"customers">` | **idx**, <span class="fk">FK→customers</span> | |
| orderNumber | `string` | **idx** | Unique order number |
| status | `string` | **idx** | `pending` → `paid` → `processing` → `shipped` → `delivered` |
| subtotalCentavos | `number` | | |
| vatAmountCentavos | `number` | | |
| shippingFeeCentavos | `number` | | |
| discountAmountCentavos | `number` | | |
| totalCentavos | `number` | | |
| shippingAddressId | `Id<"customerAddresses">?` | <span class="fk">FK→customerAddresses</span> | |
| shippingAddress | `object?` | | Snapshot of address at order time |
| paymentMethod | `string` | | `cod` \| `gcash` \| `maya` \| `card` \| `bankTransfer` |
| paymentReference | `string?` | | |
| paidAt | `number?` | | |
| promotionId | `Id<"promotions">?` | <span class="fk">FK→promotions</span> | |
| voucherCode | `string?` | | |
| promoDiscountCentavos | `number?` | | |
| fulfilledFromBranchId | `Id<"branches">?` | <span class="fk">FK→branches</span> | |
| notes | `string?` | | |
| createdAt | `number` | **idx** | |
| updatedAt | `number` | | |
| cancelledAt | `number?` | | |
| cancelReason | `string?` | | |

### orderItems

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"orderItems">` | PK | |
| orderId | `Id<"orders">` | **idx**, <span class="fk">FK→orders</span> | |
| variantId | `Id<"variants">` | <span class="fk">FK→variants</span> | |
| quantity | `number` | | |
| unitPriceCentavos | `number` | | |
| lineTotalCentavos | `number` | | |

### shipments

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"shipments">` | PK | |
| orderId | `Id<"orders">` | **idx**, <span class="fk">FK→orders</span> | |
| carrier | `string` | | J&T, LBC, Ninja Van, etc. |
| trackingNumber | `string?` | **idx** | |
| status | `string` | | `preparing` → `pickedUp` → `inTransit` → `outForDelivery` → `delivered` |
| estimatedDelivery | `number?` | | |
| shippedAt | `number?` | | |
| deliveredAt | `number?` | | |
| createdAt | `number` | | |
| updatedAt | `number` | | |

---

<div class="page-break"></div>

<div class="domain-header">8. STOREFRONT — ENGAGEMENT & LOYALTY</div>

### wishlists

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"wishlists">` | PK | |
| customerId | `Id<"customers">` | **idx**, <span class="fk">FK→customers</span> | |
| variantId | `Id<"variants">` | <span class="fk">FK→variants</span> | |
| addedAt | `number` | | |

### reviews

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"reviews">` | PK | |
| customerId | `Id<"customers">` | **idx**, <span class="fk">FK→customers</span> | |
| styleId | `Id<"styles">` | **idx**, <span class="fk">FK→styles</span> | |
| orderId | `Id<"orders">?` | <span class="fk">FK→orders</span> | Verified purchase link |
| rating | `number` | | 1–5 stars |
| title | `string?` | | |
| body | `string?` | | Review text |
| imageStorageIds | `Id<"_storage">[]?` | | Review photos |
| isVerifiedPurchase | `boolean` | | |
| isApproved | `boolean` | **idx** | Moderation flag |
| helpfulCount | `number?` | | Upvote count |
| createdAt | `number` | | |
| updatedAt | `number` | | |

### vouchers

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"vouchers">` | PK | |
| code | `string` | **idx** | Promo code |
| promotionId | `Id<"promotions">` | **idx**, <span class="fk">FK→promotions</span> | Linked promotion |
| usageLimit | `number?` | | Max total redemptions |
| usedCount | `number` | | Current redemption count |
| perCustomerLimit | `number?` | | Max per customer |
| minOrderCentavos | `number?` | | Minimum order value |
| startDate | `number` | | |
| endDate | `number?` | | |
| isActive | `boolean` | | |
| createdAt | `number` | | |

### voucherRedemptions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"voucherRedemptions">` | PK | |
| voucherId | `Id<"vouchers">` | **idx**, <span class="fk">FK→vouchers</span> | |
| customerId | `Id<"customers">` | <span class="fk">FK→customers</span> | |
| orderId | `Id<"orders">` | <span class="fk">FK→orders</span> | |
| redeemedAt | `number` | | |

### loyaltyAccounts

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"loyaltyAccounts">` | PK | |
| customerId | `Id<"customers">` | **idx**, <span class="fk">FK→customers</span> | |
| tier | `string` | **idx** | `bronze` \| `silver` \| `gold` \| `platinum` |
| pointsBalance | `number` | | Current points |
| lifetimePoints | `number` | | All-time points earned |
| lifetimeSpendCentavos | `number` | | All-time spend |
| tierExpiresAt | `number?` | | Tier expiration |
| createdAt | `number` | | |
| updatedAt | `number` | | |

### loyaltyTransactions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"loyaltyTransactions">` | PK | |
| loyaltyAccountId | `Id<"loyaltyAccounts">` | **idx**, <span class="fk">FK→loyaltyAccounts</span> | |
| type | `string` | **idx** | `earn` \| `redeem` \| `expire` \| `bonus` \| `adjustment` |
| points | `number` | | +earn/bonus, −redeem/expire |
| orderId | `Id<"orders">?` | <span class="fk">FK→orders</span> | |
| description | `string` | | |
| createdAt | `number` | | |

### notifications

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"notifications">` | PK | |
| customerId | `Id<"customers">` | **idx**, <span class="fk">FK→customers</span> | |
| type | `string` | | `order` \| `promo` \| `restock` \| `price_drop` \| `system` |
| title | `string` | | |
| body | `string` | | |
| linkUrl | `string?` | | Deep link |
| isRead | `boolean` | **idx** | |
| createdAt | `number` | **idx** | |

### recentlyViewed

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"recentlyViewed">` | PK | |
| customerId | `Id<"customers">` | **idx**, <span class="fk">FK→customers</span> | |
| styleId | `Id<"styles">` | <span class="fk">FK→styles</span> | |
| viewedAt | `number` | | |

---

<div class="page-break"></div>

<div class="domain-header">9. DEMAND, ANALYTICS & AI</div>

### demandLogs

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"demandLogs">` | PK | |
| branchId | `Id<"branches">` | **idx**, <span class="fk">FK→branches</span> | |
| loggedById | `Id<"users">` | <span class="fk">FK→users</span> | Staff who logged |
| brand | `string` | | Requested brand |
| design | `string?` | | Requested design |
| size | `string?` | | Requested size |
| notes | `string?` | | |
| createdAt | `number` | **idx** | |

### demandWeeklySummaries

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"demandWeeklySummaries">` | PK | |
| weekStart | `number` | **idx** | Week start timestamp |
| brand | `string` | **idx** | |
| requestCount | `number` | | Total requests |
| topDesigns | `{ design, count }[]` | | Top requested designs |
| topSizes | `{ size, count }[]` | | Top requested sizes |
| branchBreakdown | `{ branchId, count }[]` | | Per-branch counts |
| generatedAt | `number` | | |

### auditLogs

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"auditLogs">` | PK | |
| action | `string` | | Action performed |
| userId | `Id<"users">` | **idx**, <span class="fk">FK→users</span> | Who performed it |
| branchId | `Id<"branches">?` | **idx**, <span class="fk">FK→branches</span> | |
| entityType | `string` | **idx** | Table name |
| entityId | `string` | **idx** | Document ID |
| before | `any?` | | State before change |
| after | `any?` | | State after change |
| timestamp | `number` | **idx** | |

### restockSuggestions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"restockSuggestions">` | PK | |
| branchId | `Id<"branches">` | <span class="fk">FK→branches</span> | |
| variantId | `Id<"variants">` | <span class="fk">FK→variants</span> | |
| suggestedQuantity | `number` | | AI-recommended restock qty |
| currentStock | `number` | | Stock at time of suggestion |
| avgDailyVelocity | `number` | | Sales velocity |
| daysUntilStockout | `number` | | Projected stockout |
| incomingStock | `number` | | Pending transfer qty |
| confidence | `string` | | `high` \| `medium` \| `low` |
| rationale | `string` | | AI explanation |
| status | `string` | **idx** | `active` \| `accepted` \| `dismissed` |
| acceptedById | `Id<"users">?` | <span class="fk">FK→users</span> | |
| transferId | `Id<"transfers">?` | <span class="fk">FK→transfers</span> | Created transfer |
| generatedAt | `number` | | |
| expiresAt | `number` | | |

### branchScores

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"branchScores">` | PK | |
| branchId | `Id<"branches">` | **idx**, <span class="fk">FK→branches</span> | |
| period | `string` | **idx** | Scoring period (YYYY-MM-DD) |
| salesVolumeScore | `number` | | 0-100 |
| stockAccuracyScore | `number` | | 0-100 |
| fulfillmentSpeedScore | `number` | | 0-100 |
| compositeScore | `number` | | Weighted average |
| salesRevenueCentavos | `number` | | |
| salesTransactionCount | `number` | | |
| activeAlertCount | `number` | | |
| avgTransferHours | `number` | | |
| generatedAt | `number` | | |

---

<div class="page-break"></div>

<div class="domain-header">10. RESERVATIONS & SUPPLIERS</div>

### reservations

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"reservations">` | PK | |
| customerName | `string` | | |
| customerPhone | `string` | | |
| variantId | `Id<"variants">` | <span class="fk">FK→variants</span> | Reserved product |
| branchId | `Id<"branches">` | **idx**, <span class="fk">FK→branches</span> | Pickup branch |
| quantity | `number` | | |
| status | `string` | **idx** | `pending` \| `fulfilled` \| `expired` \| `cancelled` |
| confirmationCode | `string` | **idx** | Unique pickup code |
| expiresAt | `number` | **idx** | Auto-expiry timestamp |
| createdAt | `number` | | |
| updatedAt | `number` | | |

### supplierProposals

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"supplierProposals">` | PK | |
| supplierId | `Id<"users">` | **idx**, <span class="fk">FK→users</span> | |
| brand | `string` | | Target brand |
| items | `{ description, sku?, quantity, unitPriceCentavos }[]` | | Proposed items |
| totalCentavos | `number` | | Total proposal value |
| notes | `string?` | | |
| status | `string` | **idx** | `pending` \| `accepted` \| `rejected` |
| reviewedBy | `Id<"users">?` | <span class="fk">FK→users</span> | |
| reviewedAt | `number?` | | |
| reviewNotes | `string?` | | |
| createdAt | `number` | | |

### sizeCharts

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"sizeCharts">` | PK | |
| categoryId | `Id<"categories">` | **idx**, <span class="fk">FK→categories</span> | |
| sizeGroup | `string` | **idx** | "Apparel", "EU", "US" |
| entries | `{ size, chest?, waist?, hips?, length?, shoulder?, footLength? }[]` | | Measurements |
| createdAt | `number` | | |
| updatedAt | `number` | | |

### banners

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| <span class="pk">_id</span> | `Id<"banners">` | PK | |
| title | `string` | | |
| subtitle | `string?` | | |
| imageStorageId | `Id<"_storage">` | | Banner image |
| linkUrl | `string?` | | Click destination |
| placement | `string` | **idx** | `hero` \| `category` \| `flash_sale` \| `promo` |
| sortOrder | `number` | | Display ordering |
| isActive | `boolean` | **idx** | |
| startDate | `number?` | | Scheduled start |
| endDate | `number?` | | Scheduled end |
| createdAt | `number` | | |

---

<div class="domain-header">RELATIONSHIP SUMMARY</div>

### All Foreign Key References

| From Table | Column | → To Table | Cardinality |
|-----------|--------|-----------|-------------|
| users | branchId | branches | N:1 |
| categories | brandId | brands | N:1 |
| styles | categoryId | categories | N:1 |
| variants | styleId | styles | N:1 |
| productImages | styleId | styles | N:1 |
| inventory | branchId | branches | N:1 |
| inventory | variantId | variants | N:1 |
| inventoryBatches | branchId | branches | N:1 |
| inventoryBatches | variantId | variants | N:1 |
| lowStockAlerts | branchId | branches | N:1 |
| lowStockAlerts | variantId | variants | N:1 |
| lowStockAlerts | dismissedBy | users | N:1 |
| transactions | branchId | branches | N:1 |
| transactions | cashierId | users | N:1 |
| transactions | promotionId | promotions | N:1 |
| transactionItems | transactionId | transactions | N:1 |
| transactionItems | variantId | variants | N:1 |
| cashierShifts | branchId | branches | N:1 |
| cashierShifts | cashierId | users | N:1 |
| reconciliations | branchId | branches | N:1 |
| reconciliations | cashierId | users | N:1 |
| transfers | fromBranchId | branches | N:1 |
| transfers | toBranchId | branches | N:1 |
| transfers | requestedById | users | N:1 |
| transfers | driverId | users | N:1 |
| transferItems | transferId | transfers | N:1 |
| transferItems | variantId | variants | N:1 |
| internalInvoices | transferId | transfers | N:1 |
| internalInvoices | fromBranchId | branches | N:1 |
| internalInvoices | toBranchId | branches | N:1 |
| internalInvoices | generatedById | users | N:1 |
| internalInvoiceItems | invoiceId | internalInvoices | N:1 |
| internalInvoiceItems | variantId | variants | N:1 |
| promotions | createdById | users | N:1 |
| demandLogs | branchId | branches | N:1 |
| demandLogs | loggedById | users | N:1 |
| auditLogs | userId | users | N:1 |
| auditLogs | branchId | branches | N:1 |
| restockSuggestions | branchId | branches | N:1 |
| restockSuggestions | variantId | variants | N:1 |
| restockSuggestions | acceptedById | users | N:1 |
| restockSuggestions | transferId | transfers | N:1 |
| branchScores | branchId | branches | N:1 |
| reservations | variantId | variants | N:1 |
| reservations | branchId | branches | N:1 |
| supplierProposals | supplierId | users | N:1 |
| supplierProposals | reviewedBy | users | N:1 |
| customers | — | — | (Clerk-linked) |
| customerAddresses | customerId | customers | N:1 |
| carts | customerId | customers | N:1 |
| cartItems | cartId | carts | N:1 |
| cartItems | variantId | variants | N:1 |
| orders | customerId | customers | N:1 |
| orders | shippingAddressId | customerAddresses | N:1 |
| orders | promotionId | promotions | N:1 |
| orders | fulfilledFromBranchId | branches | N:1 |
| orderItems | orderId | orders | N:1 |
| orderItems | variantId | variants | N:1 |
| shipments | orderId | orders | N:1 |
| wishlists | customerId | customers | N:1 |
| wishlists | variantId | variants | N:1 |
| reviews | customerId | customers | N:1 |
| reviews | styleId | styles | N:1 |
| reviews | orderId | orders | N:1 |
| vouchers | promotionId | promotions | N:1 |
| voucherRedemptions | voucherId | vouchers | N:1 |
| voucherRedemptions | customerId | customers | N:1 |
| voucherRedemptions | orderId | orders | N:1 |
| loyaltyAccounts | customerId | customers | N:1 |
| loyaltyTransactions | loyaltyAccountId | loyaltyAccounts | N:1 |
| loyaltyTransactions | orderId | orders | N:1 |
| notifications | customerId | customers | N:1 |
| recentlyViewed | customerId | customers | N:1 |
| recentlyViewed | styleId | styles | N:1 |
| sizeCharts | categoryId | categories | N:1 |
| banners | — | — | (standalone) |
