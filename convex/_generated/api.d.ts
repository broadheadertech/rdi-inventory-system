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
import type * as admin_announcements from "../admin/announcements.js";
import type * as admin_banners from "../admin/banners.js";
import type * as admin_colors from "../admin/colors.js";
import type * as admin_hotDeals from "../admin/hotDeals.js";
import type * as admin_promotions from "../admin/promotions.js";
import type * as admin_settings from "../admin/settings.js";
import type * as admin_sizes from "../admin/sizes.js";
import type * as ai_branchScoring from "../ai/branchScoring.js";
import type * as ai_restockSuggestions from "../ai/restockSuggestions.js";
import type * as analytics_commandCenter from "../analytics/commandCenter.js";
import type * as analytics_expansionIntel from "../analytics/expansionIntel.js";
import type * as analytics_holidayForecast from "../analytics/holidayForecast.js";
import type * as analytics_staffChampions from "../analytics/staffChampions.js";
import type * as analytics_trendingByCity from "../analytics/trendingByCity.js";
import type * as audit_logs from "../audit/logs.js";
import type * as auth_branches from "../auth/branches.js";
import type * as auth_clerkWebhook from "../auth/clerkWebhook.js";
import type * as auth_users from "../auth/users.js";
import type * as catalog_brands from "../catalog/brands.js";
import type * as catalog_bulkImport from "../catalog/bulkImport.js";
import type * as catalog_categories from "../catalog/categories.js";
import type * as catalog_drops from "../catalog/drops.js";
import type * as catalog_images from "../catalog/images.js";
import type * as catalog_publicBrowse from "../catalog/publicBrowse.js";
import type * as catalog_smartSearch from "../catalog/smartSearch.js";
import type * as catalog_styles from "../catalog/styles.js";
import type * as catalog_variants from "../catalog/variants.js";
import type * as crons from "../crons.js";
import type * as dashboards_birReports from "../dashboards/birReports.js";
import type * as dashboards_branchAnalytics from "../dashboards/branchAnalytics.js";
import type * as dashboards_branchDashboard from "../dashboards/branchDashboard.js";
import type * as dashboards_demandIntelligence from "../dashboards/demandIntelligence.js";
import type * as dashboards_hqAnalytics from "../dashboards/hqAnalytics.js";
import type * as dashboards_hqDashboard from "../dashboards/hqDashboard.js";
import type * as dashboards_hqDdpAnalytics from "../dashboards/hqDdpAnalytics.js";
import type * as dashboards_hqIntelligence from "../dashboards/hqIntelligence.js";
import type * as dashboards_inventoryAging from "../dashboards/inventoryAging.js";
import type * as dashboards_productMovers from "../dashboards/productMovers.js";
import type * as demand_entries from "../demand/entries.js";
import type * as demand_summaries from "../demand/summaries.js";
import type * as http from "../http.js";
import type * as inventory_alerts from "../inventory/alerts.js";
import type * as inventory_autoReplenish from "../inventory/autoReplenish.js";
import type * as inventory_batches from "../inventory/batches.js";
import type * as inventory_cycleCounts from "../inventory/cycleCounts.js";
import type * as inventory_ghostStock from "../inventory/ghostStock.js";
import type * as inventory_putAway from "../inventory/putAway.js";
import type * as inventory_quarantine from "../inventory/quarantine.js";
import type * as inventory_sizeCurveAlerts from "../inventory/sizeCurveAlerts.js";
import type * as inventory_stockLevels from "../inventory/stockLevels.js";
import type * as inventory_surgeDetection from "../inventory/surgeDetection.js";
import type * as invoices_internalInvoices from "../invoices/internalInvoices.js";
import type * as logistics_assignments from "../logistics/assignments.js";
import type * as logistics_deliveries from "../logistics/deliveries.js";
import type * as migrations_backfillBatches from "../migrations/backfillBatches.js";
import type * as pos_offlineSync from "../pos/offlineSync.js";
import type * as pos_products from "../pos/products.js";
import type * as pos_promotions from "../pos/promotions.js";
import type * as pos_readings from "../pos/readings.js";
import type * as pos_receipts from "../pos/receipts.js";
import type * as pos_reconciliation from "../pos/reconciliation.js";
import type * as pos_returns from "../pos/returns.js";
import type * as pos_shifts from "../pos/shifts.js";
import type * as pos_transactions from "../pos/transactions.js";
import type * as reservations_expiry from "../reservations/expiry.js";
import type * as reservations_manage from "../reservations/manage.js";
import type * as reservations_notifications from "../reservations/notifications.js";
import type * as reservations_reservations from "../reservations/reservations.js";
import type * as seed from "../seed.js";
import type * as storefront_addresses from "../storefront/addresses.js";
import type * as storefront_bestsellers from "../storefront/bestsellers.js";
import type * as storefront_branches from "../storefront/branches.js";
import type * as storefront_cart from "../storefront/cart.js";
import type * as storefront_customers from "../storefront/customers.js";
import type * as storefront_exchanges from "../storefront/exchanges.js";
import type * as storefront_fulfillmentOptions from "../storefront/fulfillmentOptions.js";
import type * as storefront_homepage from "../storefront/homepage.js";
import type * as storefront_loyalty from "../storefront/loyalty.js";
import type * as storefront_newArrivals from "../storefront/newArrivals.js";
import type * as storefront_orders from "../storefront/orders.js";
import type * as storefront_paydaySales from "../storefront/paydaySales.js";
import type * as storefront_paymentOptions from "../storefront/paymentOptions.js";
import type * as storefront_priceWatch from "../storefront/priceWatch.js";
import type * as storefront_recentlyViewed from "../storefront/recentlyViewed.js";
import type * as storefront_recommendations from "../storefront/recommendations.js";
import type * as storefront_reservePriority from "../storefront/reservePriority.js";
import type * as storefront_restockAlerts from "../storefront/restockAlerts.js";
import type * as storefront_returns from "../storefront/returns.js";
import type * as storefront_reviews from "../storefront/reviews.js";
import type * as storefront_savedItems from "../storefront/savedItems.js";
import type * as storefront_sharedWishlist from "../storefront/sharedWishlist.js";
import type * as storefront_streaks from "../storefront/streaks.js";
import type * as storefront_styleDuels from "../storefront/styleDuels.js";
import type * as storefront_styleGallery from "../storefront/styleGallery.js";
import type * as storefront_tryOnAhead from "../storefront/tryOnAhead.js";
import type * as storefront_voting from "../storefront/voting.js";
import type * as storefront_vouchers from "../storefront/vouchers.js";
import type * as storefront_wishlist from "../storefront/wishlist.js";
import type * as storefront_wrapped from "../storefront/wrapped.js";
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
  "admin/announcements": typeof admin_announcements;
  "admin/banners": typeof admin_banners;
  "admin/colors": typeof admin_colors;
  "admin/hotDeals": typeof admin_hotDeals;
  "admin/promotions": typeof admin_promotions;
  "admin/settings": typeof admin_settings;
  "admin/sizes": typeof admin_sizes;
  "ai/branchScoring": typeof ai_branchScoring;
  "ai/restockSuggestions": typeof ai_restockSuggestions;
  "analytics/commandCenter": typeof analytics_commandCenter;
  "analytics/expansionIntel": typeof analytics_expansionIntel;
  "analytics/holidayForecast": typeof analytics_holidayForecast;
  "analytics/staffChampions": typeof analytics_staffChampions;
  "analytics/trendingByCity": typeof analytics_trendingByCity;
  "audit/logs": typeof audit_logs;
  "auth/branches": typeof auth_branches;
  "auth/clerkWebhook": typeof auth_clerkWebhook;
  "auth/users": typeof auth_users;
  "catalog/brands": typeof catalog_brands;
  "catalog/bulkImport": typeof catalog_bulkImport;
  "catalog/categories": typeof catalog_categories;
  "catalog/drops": typeof catalog_drops;
  "catalog/images": typeof catalog_images;
  "catalog/publicBrowse": typeof catalog_publicBrowse;
  "catalog/smartSearch": typeof catalog_smartSearch;
  "catalog/styles": typeof catalog_styles;
  "catalog/variants": typeof catalog_variants;
  crons: typeof crons;
  "dashboards/birReports": typeof dashboards_birReports;
  "dashboards/branchAnalytics": typeof dashboards_branchAnalytics;
  "dashboards/branchDashboard": typeof dashboards_branchDashboard;
  "dashboards/demandIntelligence": typeof dashboards_demandIntelligence;
  "dashboards/hqAnalytics": typeof dashboards_hqAnalytics;
  "dashboards/hqDashboard": typeof dashboards_hqDashboard;
  "dashboards/hqDdpAnalytics": typeof dashboards_hqDdpAnalytics;
  "dashboards/hqIntelligence": typeof dashboards_hqIntelligence;
  "dashboards/inventoryAging": typeof dashboards_inventoryAging;
  "dashboards/productMovers": typeof dashboards_productMovers;
  "demand/entries": typeof demand_entries;
  "demand/summaries": typeof demand_summaries;
  http: typeof http;
  "inventory/alerts": typeof inventory_alerts;
  "inventory/autoReplenish": typeof inventory_autoReplenish;
  "inventory/batches": typeof inventory_batches;
  "inventory/cycleCounts": typeof inventory_cycleCounts;
  "inventory/ghostStock": typeof inventory_ghostStock;
  "inventory/putAway": typeof inventory_putAway;
  "inventory/quarantine": typeof inventory_quarantine;
  "inventory/sizeCurveAlerts": typeof inventory_sizeCurveAlerts;
  "inventory/stockLevels": typeof inventory_stockLevels;
  "inventory/surgeDetection": typeof inventory_surgeDetection;
  "invoices/internalInvoices": typeof invoices_internalInvoices;
  "logistics/assignments": typeof logistics_assignments;
  "logistics/deliveries": typeof logistics_deliveries;
  "migrations/backfillBatches": typeof migrations_backfillBatches;
  "pos/offlineSync": typeof pos_offlineSync;
  "pos/products": typeof pos_products;
  "pos/promotions": typeof pos_promotions;
  "pos/readings": typeof pos_readings;
  "pos/receipts": typeof pos_receipts;
  "pos/reconciliation": typeof pos_reconciliation;
  "pos/returns": typeof pos_returns;
  "pos/shifts": typeof pos_shifts;
  "pos/transactions": typeof pos_transactions;
  "reservations/expiry": typeof reservations_expiry;
  "reservations/manage": typeof reservations_manage;
  "reservations/notifications": typeof reservations_notifications;
  "reservations/reservations": typeof reservations_reservations;
  seed: typeof seed;
  "storefront/addresses": typeof storefront_addresses;
  "storefront/bestsellers": typeof storefront_bestsellers;
  "storefront/branches": typeof storefront_branches;
  "storefront/cart": typeof storefront_cart;
  "storefront/customers": typeof storefront_customers;
  "storefront/exchanges": typeof storefront_exchanges;
  "storefront/fulfillmentOptions": typeof storefront_fulfillmentOptions;
  "storefront/homepage": typeof storefront_homepage;
  "storefront/loyalty": typeof storefront_loyalty;
  "storefront/newArrivals": typeof storefront_newArrivals;
  "storefront/orders": typeof storefront_orders;
  "storefront/paydaySales": typeof storefront_paydaySales;
  "storefront/paymentOptions": typeof storefront_paymentOptions;
  "storefront/priceWatch": typeof storefront_priceWatch;
  "storefront/recentlyViewed": typeof storefront_recentlyViewed;
  "storefront/recommendations": typeof storefront_recommendations;
  "storefront/reservePriority": typeof storefront_reservePriority;
  "storefront/restockAlerts": typeof storefront_restockAlerts;
  "storefront/returns": typeof storefront_returns;
  "storefront/reviews": typeof storefront_reviews;
  "storefront/savedItems": typeof storefront_savedItems;
  "storefront/sharedWishlist": typeof storefront_sharedWishlist;
  "storefront/streaks": typeof storefront_streaks;
  "storefront/styleDuels": typeof storefront_styleDuels;
  "storefront/styleGallery": typeof storefront_styleGallery;
  "storefront/tryOnAhead": typeof storefront_tryOnAhead;
  "storefront/voting": typeof storefront_voting;
  "storefront/vouchers": typeof storefront_vouchers;
  "storefront/wishlist": typeof storefront_wishlist;
  "storefront/wrapped": typeof storefront_wrapped;
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
