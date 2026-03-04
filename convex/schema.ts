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
    type: v.optional(v.union(v.literal("retail"), v.literal("warehouse"))),
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
    logo: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  categories: defineTable({
    brandId: v.id("brands"),
    name: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_brand", ["brandId"]),

  styles: defineTable({
    categoryId: v.id("categories"),
    name: v.string(),
    description: v.optional(v.string()),
    basePriceCentavos: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_category", ["categoryId"]),

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
        v.literal("kids")
      )
    ),
    priceCentavos: v.number(),
    costPriceCentavos: v.optional(v.number()),
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
    lowStockThreshold: v.optional(v.number()),
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
    createdAt: v.number(),
  })
    .index("by_branch", ["branchId"])
    .index("by_branch_date", ["branchId", "createdAt"])
    .index("by_cashier", ["cashierId"]),

  transactionItems: defineTable({
    transactionId: v.id("transactions"),
    variantId: v.id("variants"),
    quantity: v.number(),
    unitPriceCentavos: v.number(),
    lineTotalCentavos: v.number(),
  }).index("by_transaction", ["transactionId"]),

  transfers: defineTable({
    fromBranchId: v.id("branches"),
    toBranchId: v.id("branches"),
    requestedById: v.id("users"),
    type: v.optional(v.union(v.literal("stockRequest"), v.literal("return"))),
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
    .index("by_date", ["createdAt"]),

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
    .index("by_expiresAt", ["expiresAt"]),

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

  cashierShifts: defineTable({
    branchId: v.id("branches"),
    cashierId: v.id("users"),
    cashFundCentavos: v.number(),
    status: v.union(v.literal("open"), v.literal("closed")),
    openedAt: v.number(),
    closedAt: v.optional(v.number()),
    closedCashBalanceCentavos: v.optional(v.number()),
    notes: v.optional(v.string()),
  })
    .index("by_branch_status", ["branchId", "status"])
    .index("by_cashier_status", ["cashierId", "status"])
    .index("by_branch_cashier", ["branchId", "cashierId"]),

  promotions: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    promoType: v.union(
      v.literal("percentage"),
      v.literal("fixedAmount"),
      v.literal("buyXGetY"),
      v.literal("tiered")
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
      v.array(v.union(v.literal("mens"), v.literal("womens"), v.literal("unisex"), v.literal("kids")))
    ),
    colors: v.optional(v.array(v.string())),
    sizes: v.optional(v.array(v.string())),
    // aging tier scope (empty/undefined = all stock)
    agingTiers: v.optional(v.array(v.union(v.literal("green"), v.literal("yellow"), v.literal("red")))),
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
});
