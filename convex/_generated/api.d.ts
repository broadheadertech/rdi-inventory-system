/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _helpers_auditLog from "../_helpers/auditLog.js";
import type * as _helpers_constants from "../_helpers/constants.js";
import type * as _helpers_internalInvoice from "../_helpers/internalInvoice.js";
import type * as _helpers_permissions from "../_helpers/permissions.js";
import type * as _helpers_promoCalculations from "../_helpers/promoCalculations.js";
import type * as _helpers_taxCalculations from "../_helpers/taxCalculations.js";
import type * as _helpers_transferStock from "../_helpers/transferStock.js";
import type * as _helpers_withBranchScope from "../_helpers/withBranchScope.js";
import type * as admin_promotions from "../admin/promotions.js";
import type * as admin_settings from "../admin/settings.js";
import type * as ai_branchScoring from "../ai/branchScoring.js";
import type * as ai_restockSuggestions from "../ai/restockSuggestions.js";
import type * as audit_logs from "../audit/logs.js";
import type * as auth_branches from "../auth/branches.js";
import type * as auth_clerkWebhook from "../auth/clerkWebhook.js";
import type * as auth_users from "../auth/users.js";
import type * as catalog_brands from "../catalog/brands.js";
import type * as catalog_bulkImport from "../catalog/bulkImport.js";
import type * as catalog_categories from "../catalog/categories.js";
import type * as catalog_images from "../catalog/images.js";
import type * as catalog_publicBrowse from "../catalog/publicBrowse.js";
import type * as catalog_styles from "../catalog/styles.js";
import type * as catalog_variants from "../catalog/variants.js";
import type * as crons from "../crons.js";
import type * as dashboards_birReports from "../dashboards/birReports.js";
import type * as dashboards_branchAnalytics from "../dashboards/branchAnalytics.js";
import type * as dashboards_branchDashboard from "../dashboards/branchDashboard.js";
import type * as dashboards_demandIntelligence from "../dashboards/demandIntelligence.js";
import type * as dashboards_hqAnalytics from "../dashboards/hqAnalytics.js";
import type * as dashboards_hqDashboard from "../dashboards/hqDashboard.js";
import type * as dashboards_inventoryAging from "../dashboards/inventoryAging.js";
import type * as dashboards_productMovers from "../dashboards/productMovers.js";
import type * as demand_entries from "../demand/entries.js";
import type * as demand_summaries from "../demand/summaries.js";
import type * as http from "../http.js";
import type * as inventory_alerts from "../inventory/alerts.js";
import type * as inventory_batches from "../inventory/batches.js";
import type * as inventory_stockLevels from "../inventory/stockLevels.js";
import type * as invoices_internalInvoices from "../invoices/internalInvoices.js";
import type * as logistics_assignments from "../logistics/assignments.js";
import type * as logistics_deliveries from "../logistics/deliveries.js";
import type * as pos_offlineSync from "../pos/offlineSync.js";
import type * as pos_products from "../pos/products.js";
import type * as pos_promotions from "../pos/promotions.js";
import type * as pos_readings from "../pos/readings.js";
import type * as pos_receipts from "../pos/receipts.js";
import type * as pos_reconciliation from "../pos/reconciliation.js";
import type * as pos_shifts from "../pos/shifts.js";
import type * as pos_transactions from "../pos/transactions.js";
import type * as reservations_expiry from "../reservations/expiry.js";
import type * as reservations_manage from "../reservations/manage.js";
import type * as reservations_notifications from "../reservations/notifications.js";
import type * as reservations_reservations from "../reservations/reservations.js";
import type * as seed from "../seed.js";
import type * as suppliers_portal from "../suppliers/portal.js";
import type * as transfers_fulfillment from "../transfers/fulfillment.js";
import type * as transfers_requests from "../transfers/requests.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_helpers/auditLog": typeof _helpers_auditLog;
  "_helpers/constants": typeof _helpers_constants;
  "_helpers/internalInvoice": typeof _helpers_internalInvoice;
  "_helpers/permissions": typeof _helpers_permissions;
  "_helpers/promoCalculations": typeof _helpers_promoCalculations;
  "_helpers/taxCalculations": typeof _helpers_taxCalculations;
  "_helpers/transferStock": typeof _helpers_transferStock;
  "_helpers/withBranchScope": typeof _helpers_withBranchScope;
  "admin/promotions": typeof admin_promotions;
  "admin/settings": typeof admin_settings;
  "ai/branchScoring": typeof ai_branchScoring;
  "ai/restockSuggestions": typeof ai_restockSuggestions;
  "audit/logs": typeof audit_logs;
  "auth/branches": typeof auth_branches;
  "auth/clerkWebhook": typeof auth_clerkWebhook;
  "auth/users": typeof auth_users;
  "catalog/brands": typeof catalog_brands;
  "catalog/bulkImport": typeof catalog_bulkImport;
  "catalog/categories": typeof catalog_categories;
  "catalog/images": typeof catalog_images;
  "catalog/publicBrowse": typeof catalog_publicBrowse;
  "catalog/styles": typeof catalog_styles;
  "catalog/variants": typeof catalog_variants;
  crons: typeof crons;
  "dashboards/birReports": typeof dashboards_birReports;
  "dashboards/branchAnalytics": typeof dashboards_branchAnalytics;
  "dashboards/branchDashboard": typeof dashboards_branchDashboard;
  "dashboards/demandIntelligence": typeof dashboards_demandIntelligence;
  "dashboards/hqAnalytics": typeof dashboards_hqAnalytics;
  "dashboards/hqDashboard": typeof dashboards_hqDashboard;
  "dashboards/inventoryAging": typeof dashboards_inventoryAging;
  "dashboards/productMovers": typeof dashboards_productMovers;
  "demand/entries": typeof demand_entries;
  "demand/summaries": typeof demand_summaries;
  http: typeof http;
  "inventory/alerts": typeof inventory_alerts;
  "inventory/batches": typeof inventory_batches;
  "inventory/stockLevels": typeof inventory_stockLevels;
  "invoices/internalInvoices": typeof invoices_internalInvoices;
  "logistics/assignments": typeof logistics_assignments;
  "logistics/deliveries": typeof logistics_deliveries;
  "pos/offlineSync": typeof pos_offlineSync;
  "pos/products": typeof pos_products;
  "pos/promotions": typeof pos_promotions;
  "pos/readings": typeof pos_readings;
  "pos/receipts": typeof pos_receipts;
  "pos/reconciliation": typeof pos_reconciliation;
  "pos/shifts": typeof pos_shifts;
  "pos/transactions": typeof pos_transactions;
  "reservations/expiry": typeof reservations_expiry;
  "reservations/manage": typeof reservations_manage;
  "reservations/notifications": typeof reservations_notifications;
  "reservations/reservations": typeof reservations_reservations;
  seed: typeof seed;
  "suppliers/portal": typeof suppliers_portal;
  "transfers/fulfillment": typeof transfers_fulfillment;
  "transfers/requests": typeof transfers_requests;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
