export const VAT_RATE = 0.12; // 12% Philippine VAT
export const SENIOR_PWD_DISCOUNT_RATE = 0.20; // 20% Senior/PWD discount

export const ROLES = {
  ADMIN: "admin",
  MANAGER: "manager",
  CASHIER: "cashier",
  WAREHOUSE_STAFF: "warehouseStaff",
  HQ_STAFF: "hqStaff",
  VIEWER: "viewer",
  DRIVER: "driver",
  SUPPLIER: "supplier",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const TRANSFER_STATUS = {
  REQUESTED: "requested",
  PACKED: "packed",
  IN_TRANSIT: "inTransit",
  DELIVERED: "delivered",
} as const;

export type TransferStatus =
  (typeof TRANSFER_STATUS)[keyof typeof TRANSFER_STATUS];

export const PAYMENT_METHODS = {
  CASH: "cash",
  GCASH: "gcash",
  MAYA: "maya",
  BANK_TRANSFER: "bankTransfer",
} as const;

export type PaymentMethod =
  (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  bankTransfer: "Bank Transfer",
};

export const DISCOUNT_TYPES = {
  SENIOR: "senior",
  PWD: "pwd",
  NONE: "none",
} as const;

export type DiscountType =
  (typeof DISCOUNT_TYPES)[keyof typeof DISCOUNT_TYPES];

export const PROMO_TYPES = {
  PERCENTAGE: "percentage",
  FIXED_AMOUNT: "fixedAmount",
  BUY_X_GET_Y: "buyXGetY",
  TIERED: "tiered",
} as const;

export type PromoType = (typeof PROMO_TYPES)[keyof typeof PROMO_TYPES];

export const ERROR_CODES = {
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  INVALID_DISCOUNT: "INVALID_DISCOUNT",
  TRANSFER_CONFLICT: "TRANSFER_CONFLICT",
  UNAUTHORIZED: "UNAUTHORIZED",
  BRANCH_MISMATCH: "BRANCH_MISMATCH",
  SYNC_CONFLICT: "SYNC_CONFLICT",
  SESSION_STALE: "SESSION_STALE",
} as const;
