import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("manager"),
      v.literal("cashier"),
      v.literal("warehouseStaff"),
      v.literal("hqStaff"),
      v.literal("viewer"),
      v.literal("driver"),
      v.literal("supplier")
    ),
    branchId: v.optional(v.id("branches")),
    assignedBrands: v.optional(v.array(v.string())),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_branch", ["branchId"])
    .index("by_role", ["role"]),

  branches: defineTable({
    name: v.string(),
    address: v.string(),
    isActive: v.boolean(),
    channel: v.optional(
      v.union(
        v.literal("inline"),
        v.literal("online"),
        v.literal("outlet"),
        v.literal("popup"),
        v.literal("dtc"),
        v.literal("warehouse"),
        v.literal("outright")
      )
    ),
    classification: v.optional(
      v.union(v.literal("premium"), v.literal("aclass"), v.literal("bnc"), v.literal("outlet"))
    ),
    phone: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    configuration: v.optional(
      v.object({
        timezone: v.optional(v.string()),
        businessHours: v.optional(
          v.object({
            openTime: v.string(),
            closeTime: v.string(),
          })
        ),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  brands: defineTable({
    name: v.string(),
    code: v.optional(v.string()),
    logo: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    bannerStorageId: v.optional(v.id("_storage")),
    tags: v.optional(v.array(v.string())),
    parLevel: v.optional(v.number()), // SOH target; below = red, at/above = green on dashboard
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_code", ["code"]),

  productCodes: defineTable({
    type: v.union(
      v.literal("department"),
      v.literal("division"),
      v.literal("category"),
      v.literal("subCategory"),
      v.literal("season"),
      v.literal("year"),
      v.literal("production"),
      v.literal("outlier"),
      v.literal("fit")
    ),
    description: v.string(),
    code: v.optional(v.string()),
    parentId: v.optional(v.id("productCodes")),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_type", ["type"])
    .index("by_type_code", ["type", "code"]),

  // Legacy: kept for data migration reference — new styles use productCodes
  categories: defineTable({
    brandId: v.id("brands"),
    name: v.string(),
    tag: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_brand", ["brandId"]),

  styles: defineTable({
    // Legacy: old styles reference categories table directly
    categoryId: v.optional(v.id("categories")),
    // New product code references
    brandId: v.optional(v.id("brands")),
    departmentId: v.optional(v.id("productCodes")),
    divisionId: v.optional(v.id("productCodes")),
    productCategoryId: v.optional(v.id("productCodes")),
    subCategoryId: v.optional(v.id("productCodes")),
    seasonId: v.optional(v.id("productCodes")),
    yearId: v.optional(v.id("productCodes")),
    productionId: v.optional(v.id("productCodes")),
    outlierId: v.optional(v.id("productCodes")),
    fitId: v.optional(v.id("productCodes")),
    styleCode: v.optional(v.string()),
    sequenceNumber: v.optional(v.number()),
    name: v.string(),
    description: v.optional(v.string()),
    sku: v.optional(v.string()),
    barcode: v.optional(v.string()),
    color: v.optional(v.string()),
    srp: v.optional(v.number()),
    costPrice: v.optional(v.number()),
    basePriceCentavos: v.number(),
    isActive: v.boolean(),
    isExclusive: v.optional(v.boolean()),
    exclusiveBranchIds: v.optional(v.array(v.id("branches"))),
    dropDate: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_category", ["categoryId"])
    .index("by_brand", ["brandId"])
    .index("by_styleCode", ["styleCode"]),

  variants: defineTable({
    styleId: v.id("styles"),
    sku: v.string(),
    barcode: v.optional(v.string()),
    sizeGroup: v.optional(v.string()),
    size: v.string(),
    color: v.string(),
    gender: v.optional(
      v.union(
        v.literal("mens"),
        v.literal("womens"),
        v.literal("unisex"),
        v.literal("kids"),
        v.literal("boys"),
        v.literal("girls")
      )
    ),
    priceCentavos: v.number(),
    costPriceCentavos: v.optional(v.number()),
    colorCode: v.optional(v.string()), // Auto-assigned letter: A, B, C... per unique color within a style
    storageId: v.optional(v.id("_storage")),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_style", ["styleId"])
    .index("by_sku", ["sku"])
    .index("by_barcode", ["barcode"]),

  productImages: defineTable({
    styleId: v.id("styles"),
    storageId: v.id("_storage"),
    isPrimary: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
  }).index("by_style", ["styleId"]),

  inventory: defineTable({
    branchId: v.id("branches"),
    variantId: v.id("variants"),
    quantity: v.number(),
    reservedQuantity: v.optional(v.number()),
    quarantinedQuantity: v.optional(v.number()),
    lowStockThreshold: v.optional(v.number()),
    arrivedAt: v.optional(v.number()), // when stock last arrived at this branch
    updatedAt: v.number(),
  })
    .index("by_branch", ["branchId"])
    .index("by_variant", ["variantId"])
    .index("by_branch_variant", ["branchId", "variantId"]),

  lowStockAlerts: defineTable({
    branchId: v.id("branches"),
    variantId: v.id("variants"),
    quantity: v.number(),
    threshold: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("dismissed"),
      v.literal("resolved"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    dismissedBy: v.optional(v.id("users")),
  })
    .index("by_branch", ["branchId"])
    .index("by_branch_status", ["branchId", "status"])
    .index("by_variant", ["variantId"])
    .index("by_branch_variant", ["branchId", "variantId"]),

  transactions: defineTable({
    branchId: v.id("branches"),
    cashierId: v.id("users"),
    receiptNumber: v.string(),
    subtotalCentavos: v.number(),
    vatAmountCentavos: v.number(),
    discountAmountCentavos: v.number(),
    totalCentavos: v.number(),
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("gcash"),
      v.literal("maya")
    ),
    discountType: v.optional(
      v.union(
        v.literal("senior"),
        v.literal("pwd"),
        v.literal("none")
      )
    ),
    customerId: v.optional(v.string()),
    amountTenderedCentavos: v.optional(v.number()),
    changeCentavos: v.optional(v.number()),
    isOffline: v.boolean(),
    syncedAt: v.optional(v.number()),
    promotionId: v.optional(v.id("promotions")),
    promoDiscountAmountCentavos: v.optional(v.number()),
    splitPayment: v.optional(v.object({
      method: v.union(v.literal("cash"), v.literal("gcash"), v.literal("maya")),
      amountCentavos: v.number(),
    })),
    fashionAssistantId: v.optional(v.id("fashionAssistants")),
    status: v.optional(v.union(v.literal("completed"), v.literal("voided"))),
    voidedAt: v.optional(v.number()),
    voidedById: v.optional(v.id("users")),
    voidReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_branch", ["branchId"])
    .index("by_branch_date", ["branchId", "createdAt"])
    .index("by_cashier", ["cashierId"])
    .index("by_receiptNumber", ["receiptNumber"]),

  transactionItems: defineTable({
    transactionId: v.id("transactions"),
    variantId: v.id("variants"),
    quantity: v.number(),
    unitPriceCentavos: v.number(),
    lineTotalCentavos: v.number(),
  })
    .index("by_transaction", ["transactionId"])
    .index("by_variant", ["variantId"]),

  transfers: defineTable({
    fromBranchId: v.id("branches"),
    toBranchId: v.id("branches"),
    requestedById: v.id("users"),
    type: v.optional(v.union(v.literal("stockRequest"), v.literal("return"), v.literal("interBranch"))),
    status: v.union(
      v.literal("requested"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("packed"),
      v.literal("inTransit"),
      v.literal("delivered"),
      v.literal("cancelled")
    ),
    notes: v.optional(v.string()),
    packedAt: v.optional(v.number()),
    packedById: v.optional(v.id("users")),
    shippedAt: v.optional(v.number()),
    shippedById: v.optional(v.id("users")),
    deliveredAt: v.optional(v.number()),
    deliveredById: v.optional(v.id("users")),
    driverId: v.optional(v.id("users")),
    driverArrivedAt: v.optional(v.number()),
    expectedDeliveryDays: v.optional(v.number()),  // warehouse sets how many days
    expectedDeliveryDate: v.optional(v.number()),   // computed: shippedAt + days
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedById: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    rejectedById: v.optional(v.id("users")),
    rejectedAt: v.optional(v.number()),
    rejectedReason: v.optional(v.string()),
    cancelledById: v.optional(v.id("users")),
    cancelledAt: v.optional(v.number()),
  })
    .index("by_from_branch", ["fromBranchId"])
    .index("by_to_branch", ["toBranchId"])
    .index("by_status", ["status"])
    .index("by_driver", ["driverId"]),

  transferItems: defineTable({
    transferId: v.id("transfers"),
    variantId: v.id("variants"),
    requestedQuantity: v.number(),
    packedQuantity: v.optional(v.number()),
    receivedQuantity: v.optional(v.number()),
    damageNotes: v.optional(v.string()),
  }).index("by_transfer", ["transferId"]),

  transferBoxes: defineTable({
    transferId: v.id("transfers"),
    boxNumber: v.number(),             // sequential: 1, 2, 3...
    boxCode: v.string(),               // unique QR/barcode: e.g. "TRF-abc123-BOX-001"
    totalItems: v.number(),            // count of items in this box
    sealedAt: v.optional(v.number()),  // when box was sealed/finalized
    sealedById: v.optional(v.id("users")),
    receivedAt: v.optional(v.number()),
    receivedById: v.optional(v.id("users")),
    status: v.union(
      v.literal("packing"),            // items being scanned in
      v.literal("sealed"),             // finalized, ready for transit
      v.literal("received"),           // branch confirmed receipt
      v.literal("discrepancy")         // branch found issues
    ),
    discrepancyNotes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_transfer", ["transferId"])
    .index("by_boxCode", ["boxCode"]),

  transferBoxItems: defineTable({
    boxId: v.id("transferBoxes"),
    transferId: v.id("transfers"),     // denormalized for easy queries
    variantId: v.id("variants"),
    quantity: v.number(),
    scannedAt: v.number(),
    scannedById: v.id("users"),
  })
    .index("by_box", ["boxId"])
    .index("by_transfer", ["transferId"]),

  internalInvoices: defineTable({
    transferId: v.id("transfers"),
    fromBranchId: v.id("branches"),
    toBranchId: v.id("branches"),
    invoiceNumber: v.string(),
    subtotalCentavos: v.number(),
    vatAmountCentavos: v.number(),
    totalCentavos: v.number(),
    status: v.literal("generated"),
    generatedById: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_transfer", ["transferId"])
    .index("by_toBranch", ["toBranchId"])
    .index("by_createdAt", ["createdAt"]),

  internalInvoiceItems: defineTable({
    invoiceId: v.id("internalInvoices"),
    variantId: v.id("variants"),
    quantity: v.number(),
    unitCostCentavos: v.number(),
    lineTotalCentavos: v.number(),
  }).index("by_invoice", ["invoiceId"]),

  demandLogs: defineTable({
    branchId: v.id("branches"),
    loggedById: v.id("users"),
    brand: v.string(),
    design: v.optional(v.string()),
    size: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_branch", ["branchId"])
    .index("by_date", ["createdAt"])
    .index("by_branch_date", ["branchId", "createdAt"]),

  demandWeeklySummaries: defineTable({
    weekStart: v.number(),
    brand: v.string(),
    requestCount: v.number(),
    topDesigns: v.array(v.object({ design: v.string(), count: v.number() })),
    topSizes: v.array(v.object({ size: v.string(), count: v.number() })),
    branchBreakdown: v.array(
      v.object({ branchId: v.id("branches"), count: v.number() })
    ),
    generatedAt: v.number(),
  })
    .index("by_week", ["weekStart"])
    .index("by_week_brand", ["weekStart", "brand"]),

  auditLogs: defineTable({
    action: v.string(),
    userId: v.id("users"),
    branchId: v.optional(v.id("branches")),
    entityType: v.string(),
    entityId: v.string(),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    timestamp: v.number(),
  })
    .index("by_branch", ["branchId"])
    .index("by_user", ["userId"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_timestamp", ["timestamp"]),

  reconciliations: defineTable({
    branchId: v.id("branches"),
    cashierId: v.id("users"),
    reconciliationDate: v.string(),
    expectedCashCentavos: v.number(),
    actualCashCentavos: v.number(),
    differenceCentavos: v.number(),
    transactionCount: v.number(),
    cashSalesCentavos: v.number(),
    gcashSalesCentavos: v.number(),
    mayaSalesCentavos: v.number(),
    totalSalesCentavos: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_branch", ["branchId"])
    .index("by_branch_date", ["branchId", "reconciliationDate"])
    .index("by_cashier", ["cashierId"]),

  reservations: defineTable({
    customerName: v.string(),
    customerPhone: v.string(),
    customerId: v.optional(v.id("customers")),
    reservationType: v.optional(v.union(v.literal("standard"), v.literal("try_on"))),
    variantId: v.id("variants"),
    branchId: v.id("branches"),
    quantity: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("fulfilled"),
      v.literal("expired"),
      v.literal("cancelled")
    ),
    confirmationCode: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_branch", ["branchId"])
    .index("by_status", ["status"])
    .index("by_branch_status", ["branchId", "status"])
    .index("by_confirmation", ["confirmationCode"])
    .index("by_expiresAt", ["expiresAt"])
    .index("by_customer", ["customerId"]),

  restockSuggestions: defineTable({
    branchId: v.id("branches"),
    variantId: v.id("variants"),
    suggestedQuantity: v.number(),
    currentStock: v.number(),
    avgDailyVelocity: v.number(),
    daysUntilStockout: v.number(),
    incomingStock: v.number(),
    confidence: v.union(
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    rationale: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("accepted"),
      v.literal("dismissed")
    ),
    acceptedById: v.optional(v.id("users")),
    transferId: v.optional(v.id("transfers")),
    generatedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_branch_status", ["branchId", "status"])
    .index("by_branch_variant", ["branchId", "variantId"]),

  branchScores: defineTable({
    branchId: v.id("branches"),
    period: v.string(),
    salesVolumeScore: v.number(),
    stockAccuracyScore: v.number(),
    fulfillmentSpeedScore: v.number(),
    compositeScore: v.number(),
    salesRevenueCentavos: v.number(),
    salesTransactionCount: v.number(),
    activeAlertCount: v.number(),
    avgTransferHours: v.number(),
    generatedAt: v.number(),
  })
    .index("by_branch", ["branchId"])
    .index("by_branch_period", ["branchId", "period"])
    .index("by_period", ["period"]),

  supplierProposals: defineTable({
    supplierId: v.id("users"),
    brand: v.string(),
    items: v.array(
      v.object({
        description: v.string(),
        sku: v.optional(v.string()),
        quantity: v.number(),
        unitPriceCentavos: v.number(),
      })
    ),
    totalCentavos: v.number(),
    notes: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected")
    ),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    reviewNotes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_supplier", ["supplierId"])
    .index("by_status", ["status"])
    .index("by_supplier_status", ["supplierId", "status"]),

  inventoryBatches: defineTable({
    branchId: v.id("branches"),
    variantId: v.id("variants"),
    quantity: v.number(),
    costPriceCentavos: v.number(),
    receivedAt: v.number(),
    source: v.union(
      v.literal("supplier"),
      v.literal("transfer"),
      v.literal("adjustment"),
      v.literal("legacy"),
    ),
    sourceId: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_branch_variant_received", ["branchId", "variantId", "receivedAt"])
    .index("by_branch_variant", ["branchId", "variantId"]),

  cashierAccounts: defineTable({
    branchId: v.id("branches"),
    firstName: v.string(),
    lastName: v.string(),
    username: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    isActive: v.boolean(),
    createdById: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_branch", ["branchId"])
    .index("by_branch_username", ["branchId", "username"])
    .index("by_branch_isActive", ["branchId", "isActive"]),

  cashierShifts: defineTable({
    branchId: v.id("branches"),
    cashierId: v.id("users"),
    cashierAccountId: v.optional(v.id("cashierAccounts")),
    changeFundCentavos: v.optional(v.number()),
    cashFundCentavos: v.number(),
    status: v.union(v.literal("open"), v.literal("closed")),
    openedAt: v.number(),
    closedAt: v.optional(v.number()),
    closeType: v.optional(v.union(v.literal("turnover"), v.literal("endOfDay"))),
    closedCashBalanceCentavos: v.optional(v.number()),
    notes: v.optional(v.string()),
    prevShiftId: v.optional(v.id("cashierShifts")),
    handoverCashInRegisterCentavos: v.optional(v.number()),
    handoverChangeFundCentavos: v.optional(v.number()),
    handoverCashFundCentavos: v.optional(v.number()),
  })
    .index("by_branch_status", ["branchId", "status"])
    .index("by_branch_opened", ["branchId", "openedAt"])
    .index("by_cashier_status", ["cashierId", "status"])
    .index("by_cashierAccount", ["cashierAccountId"])
    .index("by_branch_cashier", ["branchId", "cashierId"]),

  promotions: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    promoType: v.union(
      v.literal("percentage"),
      v.literal("fixedAmount"),
      v.literal("buyXGetY"),
      v.literal("tiered"),
      v.literal("crossSell"),
      v.literal("pwp")
    ),
    // percentage
    percentageValue: v.optional(v.number()),
    maxDiscountCentavos: v.optional(v.number()),
    // fixedAmount
    fixedAmountCentavos: v.optional(v.number()),
    // buyXGetY
    buyQuantity: v.optional(v.number()),
    getQuantity: v.optional(v.number()),
    // tiered
    minSpendCentavos: v.optional(v.number()),
    tieredDiscountCentavos: v.optional(v.number()),
    // scoping
    branchIds: v.array(v.id("branches")),
    branchClassifications: v.optional(
      v.array(v.union(v.literal("premium"), v.literal("aclass"), v.literal("bnc"), v.literal("outlet")))
    ),
    brandIds: v.array(v.id("brands")),
    categoryIds: v.array(v.id("categories")),
    variantIds: v.array(v.id("variants")),
    // extended scoping (all optional — empty/undefined = all)
    styleIds: v.optional(v.array(v.id("styles"))),
    genders: v.optional(
      v.array(v.union(v.literal("mens"), v.literal("womens"), v.literal("unisex"), v.literal("kids"), v.literal("boys"), v.literal("girls")))
    ),
    colors: v.optional(v.array(v.string())),
    sizes: v.optional(v.array(v.string())),
    // aging tier scope (empty/undefined = all stock)
    agingTiers: v.optional(v.array(v.union(v.literal("green"), v.literal("yellow"), v.literal("red")))),
    // crossSell reward scope — products that get discounted when trigger scope items are in cart
    crossSellRewardType: v.optional(v.union(v.literal("percentage"), v.literal("fixedAmount"))),
    rewardBrandIds: v.optional(v.array(v.id("brands"))),
    rewardCategoryIds: v.optional(v.array(v.id("categories"))),
    rewardStyleIds: v.optional(v.array(v.id("styles"))),
    rewardVariantIds: v.optional(v.array(v.id("variants"))),
    // pwp (Purchase with Purchase) — buy X of trigger, get reward at special price
    pwpTriggerMinQuantity: v.optional(v.number()),
    pwpRewardVariantIds: v.optional(v.array(v.id("variants"))),
    pwpRewardPriceCentavos: v.optional(v.number()),
    // date range (endDate optional = no expiration)
    startDate: v.number(),
    endDate: v.optional(v.number()),
    // status
    isActive: v.boolean(),
    priority: v.number(),
    // audit
    createdById: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_isActive", ["isActive"])
    .index("by_startDate", ["startDate"]),

  colors: defineTable({
    name: v.string(),
    hexCode: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  sizes: defineTable({
    name: v.string(),
    sortOrder: v.number(),
    // TODO: remove after DB wipe — legacy field from old schema
    sizeType: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_sortOrder", ["sortOrder"]),

  settings: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // ═══════════════════════════════════════════════════════════════════════════
  // STOREFRONT / CUSTOMER-FACING TABLES
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Customer Accounts ─────────────────────────────────────────────────────
  customers: defineTable({
    clerkId: v.string(),
    email: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    phone: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    gender: v.optional(
      v.union(v.literal("male"), v.literal("female"), v.literal("other"))
    ),
    dateOfBirth: v.optional(v.string()), // ISO date string
    wishlistShareToken: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_wishlistShareToken", ["wishlistShareToken"]),

  // ─── Customer Addresses ────────────────────────────────────────────────────
  customerAddresses: defineTable({
    customerId: v.id("customers"),
    label: v.string(), // "Home", "Office", etc.
    recipientName: v.string(),
    phone: v.string(),
    addressLine1: v.string(),
    addressLine2: v.optional(v.string()),
    city: v.string(),
    province: v.string(),
    postalCode: v.string(),
    country: v.string(),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_customer", ["customerId"]),

  // ─── Shopping Cart ─────────────────────────────────────────────────────────
  carts: defineTable({
    customerId: v.id("customers"),
    updatedAt: v.number(),
  })
    .index("by_customer", ["customerId"]),

  cartItems: defineTable({
    cartId: v.id("carts"),
    variantId: v.id("variants"),
    quantity: v.number(),
    addedAt: v.number(),
  })
    .index("by_cart", ["cartId"])
    .index("by_cart_variant", ["cartId", "variantId"]),

  // ─── Online Orders ─────────────────────────────────────────────────────────
  orders: defineTable({
    customerId: v.id("customers"),
    orderNumber: v.string(),
    status: v.union(
      v.literal("pending"),        // awaiting payment
      v.literal("paid"),           // payment confirmed
      v.literal("processing"),     // being prepared
      v.literal("shipped"),        // handed to courier
      v.literal("delivered"),      // received by customer
      v.literal("cancelled"),      // cancelled by customer or admin
      v.literal("returned"),       // return processed
      v.literal("refunded")        // refund issued
    ),
    // pricing
    subtotalCentavos: v.number(),
    vatAmountCentavos: v.number(),
    shippingFeeCentavos: v.number(),
    discountAmountCentavos: v.number(),
    totalCentavos: v.number(),
    // delivery
    shippingAddressId: v.optional(v.id("customerAddresses")),
    shippingAddress: v.optional(v.object({
      recipientName: v.string(),
      phone: v.string(),
      addressLine1: v.string(),
      addressLine2: v.optional(v.string()),
      city: v.string(),
      province: v.string(),
      postalCode: v.string(),
      country: v.string(),
    })),
    // payment
    paymentMethod: v.union(
      v.literal("cod"),
      v.literal("gcash"),
      v.literal("maya"),
      v.literal("card"),
      v.literal("bankTransfer")
    ),
    paymentReference: v.optional(v.string()),
    onlineAmountCentavos: v.optional(v.number()),
    codAmountCentavos: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    // promo
    promotionId: v.optional(v.id("promotions")),
    voucherCode: v.optional(v.string()),
    promoDiscountCentavos: v.optional(v.number()),
    // delivery speed
    deliveryMethod: v.optional(v.union(
      v.literal("standard"),
      v.literal("express"),
      v.literal("sameDay")
    )),
    // fulfillment
    fulfillmentType: v.optional(v.union(
      v.literal("delivery"),
      v.literal("pickup")
    )),
    pickupBranchId: v.optional(v.id("branches")),
    fulfilledFromBranchId: v.optional(v.id("branches")),
    notes: v.optional(v.string()),
    // timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    cancelledAt: v.optional(v.number()),
    cancelReason: v.optional(v.string()),
    // return request fields
    returnReason: v.optional(v.string()),
    returnNotes: v.optional(v.string()),
    returnRequestedAt: v.optional(v.number()),
  })
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"])
    .index("by_orderNumber", ["orderNumber"])
    .index("by_createdAt", ["createdAt"]),

  orderItems: defineTable({
    orderId: v.id("orders"),
    variantId: v.id("variants"),
    quantity: v.number(),
    unitPriceCentavos: v.number(),
    lineTotalCentavos: v.number(),
  })
    .index("by_order", ["orderId"]),

  // ─── Shipments / Delivery Tracking ─────────────────────────────────────────
  shipments: defineTable({
    orderId: v.id("orders"),
    carrier: v.string(), // "J&T", "LBC", "Ninja Van", etc.
    trackingNumber: v.optional(v.string()),
    status: v.union(
      v.literal("preparing"),
      v.literal("pickedUp"),
      v.literal("inTransit"),
      v.literal("outForDelivery"),
      v.literal("delivered"),
      v.literal("failed")
    ),
    estimatedDelivery: v.optional(v.number()),
    shippedAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_order", ["orderId"])
    .index("by_trackingNumber", ["trackingNumber"]),

  // ─── Wishlist ──────────────────────────────────────────────────────────────
  wishlists: defineTable({
    customerId: v.id("customers"),
    variantId: v.id("variants"),
    addedAt: v.number(),
  })
    .index("by_customer", ["customerId"])
    .index("by_customer_variant", ["customerId", "variantId"]),

  // ─── Product Reviews ───────────────────────────────────────────────────────
  reviews: defineTable({
    customerId: v.id("customers"),
    styleId: v.id("styles"),
    orderId: v.optional(v.id("orders")), // verified purchase
    rating: v.number(), // 1-5
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
    // size feedback
    sizeFeedback: v.optional(
      v.union(
        v.literal("runs_small"),
        v.literal("true_to_size"),
        v.literal("runs_large")
      )
    ),
    // moderation
    isVerifiedPurchase: v.boolean(),
    isApproved: v.boolean(),
    // helpful votes
    helpfulCount: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_style", ["styleId"])
    .index("by_customer", ["customerId"])
    .index("by_style_approved", ["styleId", "isApproved"])
    .index("by_order", ["orderId"]),

  // ─── Voucher Codes ─────────────────────────────────────────────────────────
  vouchers: defineTable({
    code: v.string(),
    promotionId: v.id("promotions"),
    // usage limits
    usageLimit: v.optional(v.number()),    // total redemptions allowed
    usedCount: v.number(),
    perCustomerLimit: v.optional(v.number()), // max per customer
    // minimum spend
    minOrderCentavos: v.optional(v.number()),
    // validity
    startDate: v.number(),
    endDate: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_promotion", ["promotionId"]),

  voucherRedemptions: defineTable({
    voucherId: v.id("vouchers"),
    customerId: v.id("customers"),
    orderId: v.id("orders"),
    redeemedAt: v.number(),
  })
    .index("by_voucher", ["voucherId"])
    .index("by_customer_voucher", ["customerId", "voucherId"]),

  // ─── Loyalty Program ───────────────────────────────────────────────────────
  loyaltyAccounts: defineTable({
    customerId: v.id("customers"),
    tier: v.union(
      v.literal("bronze"),
      v.literal("silver"),
      v.literal("gold"),
      v.literal("platinum")
    ),
    pointsBalance: v.number(),
    lifetimePoints: v.number(),
    lifetimeSpendCentavos: v.number(),
    tierExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_customer", ["customerId"])
    .index("by_tier", ["tier"]),

  loyaltyTransactions: defineTable({
    loyaltyAccountId: v.id("loyaltyAccounts"),
    type: v.union(
      v.literal("earn"),        // from purchase
      v.literal("redeem"),      // used as discount
      v.literal("expire"),      // points expired
      v.literal("bonus"),       // admin bonus / promo
      v.literal("adjustment")   // manual correction
    ),
    points: v.number(), // positive for earn/bonus, negative for redeem/expire
    orderId: v.optional(v.id("orders")),
    description: v.string(),
    createdAt: v.number(),
  })
    .index("by_account", ["loyaltyAccountId"])
    .index("by_account_type", ["loyaltyAccountId", "type"]),

  // ─── Notifications ─────────────────────────────────────────────────────────
  notifications: defineTable({
    customerId: v.id("customers"),
    type: v.union(
      v.literal("order"),         // order status update
      v.literal("promo"),         // promotion / flash sale
      v.literal("restock"),       // wishlist item back in stock
      v.literal("price_drop"),    // wishlist item price dropped
      v.literal("system")         // general announcement
    ),
    title: v.string(),
    body: v.string(),
    linkUrl: v.optional(v.string()),
    isRead: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_customer", ["customerId"])
    .index("by_customer_read", ["customerId", "isRead"])
    .index("by_createdAt", ["createdAt"]),

  // ─── Recently Viewed ───────────────────────────────────────────────────────
  recentlyViewed: defineTable({
    customerId: v.id("customers"),
    styleId: v.id("styles"),
    viewedAt: v.number(),
  })
    .index("by_customer", ["customerId"])
    .index("by_customer_style", ["customerId", "styleId"]),

  // ─── Size Charts ───────────────────────────────────────────────────────────
  sizeCharts: defineTable({
    categoryId: v.id("categories"),
    sizeGroup: v.string(), // "Apparel", "EU", "US", etc.
    entries: v.array(v.object({
      size: v.string(),          // "S", "M", "L", "42", etc.
      chest: v.optional(v.string()),
      waist: v.optional(v.string()),
      hips: v.optional(v.string()),
      length: v.optional(v.string()),
      shoulder: v.optional(v.string()),
      footLength: v.optional(v.string()),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_category", ["categoryId"])
    .index("by_category_sizeGroup", ["categoryId", "sizeGroup"]),

  // ─── Banners / Homepage Content ────────────────────────────────────────────
  banners: defineTable({
    title: v.string(),
    subtitle: v.optional(v.string()),
    imageStorageId: v.id("_storage"),
    linkUrl: v.optional(v.string()),
    placement: v.union(
      v.literal("hero"),         // main homepage carousel
      v.literal("category"),     // category page banner
      v.literal("flash_sale"),   // flash sale section
      v.literal("promo")         // promotional strip
    ),
    sortOrder: v.number(),
    isActive: v.boolean(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_placement", ["placement"])
    .index("by_active_placement", ["isActive", "placement"]),

  // ─── Announcements (Marquee Ticker) ────────────────────────────────────────
  announcements: defineTable({
    message: v.string(),
    sortOrder: v.number(),
    isActive: v.boolean(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_active", ["isActive"]),

  // ─── Hot Deals ────────────────────────────────────────────────────────────
  hotDeals: defineTable({
    styleId: v.id("styles"),
    label: v.string(),             // e.g. "50% OFF", "HOT", "FLASH DEAL"
    sortOrder: v.number(),
    isActive: v.boolean(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_active", ["isActive"])
    .index("by_style", ["styleId"]),

  // ─── Sell-Through Notes (Merchandising Verdicts) ───────────────────────────
  sellThruNotes: defineTable({
    styleId: v.id("styles"),
    branchId: v.optional(v.id("branches")), // null = overall note
    note: v.string(),
    verdict: v.optional(
      v.union(
        v.literal("markdown"),
        v.literal("transfer"),
        v.literal("return_to_supplier"),
        v.literal("bundle"),
        v.literal("promote"),
        v.literal("hold"),
        v.literal("other")
      )
    ),
    authorId: v.id("users"),
    authorName: v.string(),
    createdAt: v.number(),
  })
    .index("by_style", ["styleId"])
    .index("by_style_branch", ["styleId", "branchId"]),

  // ─── Check-Ins (Daily Rewards) ──────────────────────────────────────────────
  checkIns: defineTable({
    customerId: v.id("customers"),
    checkedInAt: v.number(),
    streakDay: v.number(),
    pointsAwarded: v.number(),
  })
    .index("by_customer", ["customerId"]),

  // ─── Digital Receipts ──────────────────────────────────────────────────────
  digitalReceipts: defineTable({
    transactionId: v.id("transactions"),
    type: v.union(v.literal("email"), v.literal("sms")),
    destination: v.string(),
    sentAt: v.number(),
  })
    .index("by_transaction", ["transactionId"]),

  // ─── Restock Alerts ───────────────────────────────────────────────────────
  restockAlerts: defineTable({
    customerId: v.id("users"),
    variantId: v.id("variants"),
    styleId: v.id("styles"),
    status: v.union(v.literal("active"), v.literal("notified"), v.literal("cancelled")),
    createdAt: v.number(),
    notifiedAt: v.optional(v.number()),
  })
    .index("by_customer", ["customerId", "status"])
    .index("by_variant", ["variantId", "status"]),

  // ─── Saved Items (Wishlist) ───────────────────────────────────────────────
  savedItems: defineTable({
    customerId: v.id("customers"),
    styleId: v.id("styles"),
    variantId: v.optional(v.id("variants")),
    savedAt: v.number(),
  })
    .index("by_customer", ["customerId"])
    .index("by_customer_style", ["customerId", "styleId"]),

  // ─── Exchange Requests ──────────────────────────────────────────────────
  exchangeRequests: defineTable({
    orderId: v.id("orders"),
    customerId: v.id("users"),
    originalVariantId: v.id("variants"),
    requestedVariantId: v.id("variants"),
    reason: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("completed")
    ),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_customer", ["customerId"])
    .index("by_order", ["orderId"]),

  // ─── Cycle Counts ───────────────────────────────────────────────────────
  // ─── Product Votes (Demand Voting) ─────────────────────────────────────────
  productVotes: defineTable({
    styleId: v.id("styles"),
    customerId: v.id("customers"),
    votedAt: v.number(),
  })
    .index("by_style", ["styleId"])
    .index("by_customer", ["customerId"])
    .index("by_customer_style", ["customerId", "styleId"]),

  cycleCounts: defineTable({
    branchId: v.id("branches"),
    initiatedBy: v.id("users"),
    status: v.union(v.literal("in_progress"), v.literal("completed"), v.literal("cancelled")),
    items: v.array(v.object({
      variantId: v.id("variants"),
      expectedQuantity: v.number(),
      countedQuantity: v.optional(v.number()),
    })),
    notes: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_branch", ["branchId", "status"]),

  tradingEvents: defineTable({
    date: v.string(), // YYYYMMDD
    name: v.string(),
    type: v.union(
      v.literal("promotion"),
      v.literal("event"),
      v.literal("closure"),
      v.literal("note")
    ),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    createdById: v.id("users"),
  }).index("by_date", ["date"]),

  // ─── Staff / Internal Notifications ────────────────────────────────────────
  staffNotifications: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("transfer_requested"),
      v.literal("transfer_approved"),
      v.literal("transfer_rejected"),
      v.literal("transfer_packed"),
      v.literal("driver_assigned"),
      v.literal("driver_in_transit"),
      v.literal("driver_arrived"),
      v.literal("driver_delivered"),
      v.literal("transfer_confirmed"),
      v.literal("transfer_cancelled")
    ),
    title: v.string(),
    body: v.string(),
    transferId: v.optional(v.id("transfers")),
    isRead: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_unread", ["userId", "isRead"]),

  // ─── Fashion Assistants ──────────────────────────────────────────────────────
  fashionAssistants: defineTable({
    name: v.string(),
    branchId: v.id("branches"),
    employeeCode: v.optional(v.string()), // optional internal ID / code
    isActive: v.boolean(),
    createdAt: v.number(),
    createdById: v.id("users"),
  }).index("by_branch", ["branchId", "isActive"]),

  // ─── Trading Calendar Reminder Dedup ────────────────────────────────────────
  tradingReminders: defineTable({
    key: v.string(), // "{YYYYMMDD}_{window}d" e.g. "20261225_7d"
    sentAt: v.number(),
  }).index("by_key", ["key"]),

  // ─── Branch Daily Snapshots ─────────────────────────────────────────────────
  // Pre-computed daily metrics per branch. Generated by hourly cron.
  // Eliminates N+1 branch-loop queries in dashboards, scoring, and digests.
  branchDailySnapshots: defineTable({
    branchId: v.id("branches"),
    date: v.string(), // "YYYY-MM-DD" in PHT
    // Sales (POS)
    salesTotalCentavos: v.number(),
    salesTransactionCount: v.number(),
    salesItemsSold: v.number(),
    salesCash: v.number(),
    salesGcash: v.number(),
    salesMaya: v.number(),
    // Inventory health
    totalSkus: v.number(),
    inStockCount: v.number(),
    lowStockCount: v.number(),
    outOfStockCount: v.number(),
    activeAlertCount: v.number(),
    // Transfers
    incomingPendingCount: v.number(),   // requested+approved+packed+inTransit TO this branch
    outgoingPendingCount: v.number(),   // requested+approved+packed+inTransit FROM this branch
    avgFulfillmentHours: v.number(),    // avg hours for delivered transfers in last 30d
    // Warehouse invoices (for warehouse branches)
    invoiceTotalCentavos: v.number(),
    invoiceCount: v.number(),
    // Metadata
    generatedAt: v.number(),
  })
    .index("by_branch_date", ["branchId", "date"])
    .index("by_date", ["date"]),

  // ─── Variant Daily Snapshots ──────────────────────────────────────────────
  // Pre-computed daily metrics per variant (global, not per-branch).
  // Powers: productMovers, surgeDetection, restockSuggestions, comparison analytics.
  variantDailySnapshots: defineTable({
    variantId: v.id("variants"),
    date: v.string(), // "YYYY-MM-DD" in PHT
    // Hierarchy (denormalized for zero-join reads)
    sku: v.string(),
    styleName: v.string(),
    styleId: v.id("styles"),
    categoryId: v.id("categories"),
    categoryName: v.string(),
    brandId: v.id("brands"),
    brandName: v.string(),
    size: v.string(),
    color: v.string(),
    priceCentavos: v.number(),
    // Sales (aggregated across ALL branches)
    totalQtySold: v.number(),
    totalRevenueCentavos: v.number(),
    // Sales per-branch breakdown (top branches only, to keep document small)
    branchSales: v.array(v.object({
      branchId: v.id("branches"),
      qtySold: v.number(),
      revenueCentavos: v.number(),
    })),
    // Inventory (aggregated across ALL branches)
    totalStock: v.number(),
    totalReserved: v.number(),
    branchStockCount: v.number(), // how many branches carry this variant
    // Velocity (7-day window)
    avgDailyVelocity7d: v.number(),
    daysOfSupply: v.number(),     // totalStock / avgDailyVelocity7d
    movementIndex: v.number(),    // MI classification score
    classification: v.union(
      v.literal("fast"),
      v.literal("normal"),
      v.literal("slow"),
      v.literal("dead")
    ),
    // Metadata
    generatedAt: v.number(),
  })
    .index("by_variant_date", ["variantId", "date"])
    .index("by_date", ["date"])
    .index("by_date_classification", ["date", "classification"]),

  // ─── Cross-Sell Events ───────────────────────────────────────────────────────
  // Logged whenever a cashier adds an item from the "Frequently Bought Together" strip.
  crossSellEvents: defineTable({
    branchId: v.id("branches"),
    suggestedVariantId: v.id("variants"),
    cartVariantIds: v.array(v.id("variants")), // items in cart that triggered the suggestion
    priceCentavos: v.number(), // price at time of acceptance
    createdAt: v.number(),
  })
    .index("by_branch_date", ["branchId", "createdAt"])
    .index("by_date", ["createdAt"]),
});
