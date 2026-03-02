"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn, relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";

// ─── Action prefix filter tabs ──────────────────────────────────────────────

type FilterTab = {
  value: string;
  label: string;
};

const TABS: FilterTab[] = [
  { value: "", label: "All" },
  { value: "transfer.", label: "Transfers" },
  { value: "inventory.", label: "Inventory" },
  { value: "transaction.", label: "POS Sales" },
  { value: "user.", label: "Users" },
  { value: "branch.", label: "Branches" },
  { value: "brand.", label: "Brands" },
  { value: "category.", label: "Categories" },
  { value: "style.", label: "Styles" },
  { value: "variant.", label: "Variants" },
  { value: "restock.", label: "Restock AI" },
  { value: "reconciliation.", label: "Reconciliation" },
  { value: "internalInvoice.", label: "Invoices" },
];

// ─── Friendly action label ──────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  "transfer.create": "Transfer Requested",
  "transfer.approve": "Transfer Approved",
  "transfer.reject": "Transfer Rejected",
  "transfer.cancel": "Transfer Cancelled",
  "transfer.pack": "Transfer Packed",
  "transfer.dispatch": "Transfer Dispatched",
  "transfer.deliver": "Transfer Delivered",
  "transfer.deliveryDiscrepancy": "Delivery Discrepancy",
  "transfer.assignDriver": "Driver Assigned",
  "transfer.driverArrived": "Driver Arrived",
  "transfer.driverDeliver": "Driver Delivered",
  "inventory.restock": "Stock Received",
  "inventory.adjust": "Stock Adjusted",
  "transaction.create": "POS Sale",
  "user.roleChange": "Role Changed",
  "user.branchAssign": "Branch Assigned",
  "user.update": "User Updated",
  "user.deactivate": "User Deactivated",
  "user.reactivate": "User Reactivated",
  "branch.create": "Branch Created",
  "branch.update": "Branch Updated",
  "branch.deactivate": "Branch Deactivated",
  "branch.reactivate": "Branch Reactivated",
  "brand.create": "Brand Created",
  "brand.update": "Brand Updated",
  "brand.deactivate": "Brand Deactivated",
  "brand.reactivate": "Brand Reactivated",
  "brand.bulkCreate": "Brands Bulk Import",
  "category.create": "Category Created",
  "category.update": "Category Updated",
  "category.deactivate": "Category Deactivated",
  "category.reactivate": "Category Reactivated",
  "category.bulkCreate": "Categories Bulk Import",
  "style.create": "Style Created",
  "style.update": "Style Updated",
  "style.deactivate": "Style Deactivated",
  "style.reactivate": "Style Reactivated",
  "style.bulkCreate": "Styles Bulk Import",
  "variant.create": "Variant Created",
  "variant.update": "Variant Updated",
  "variant.deactivate": "Variant Deactivated",
  "variant.reactivate": "Variant Reactivated",
  "variant.bulkCreate": "Variants Bulk Import",
  "image.create": "Image Uploaded",
  "image.delete": "Image Deleted",
  "image.setPrimary": "Primary Image Set",
  "image.variantUpdate": "Variant Image Updated",
  "image.variantDelete": "Variant Image Deleted",
  "restock.accept": "Restock Suggestion Accepted",
  "restock.dismiss": "Restock Suggestion Dismissed",
  "reconciliation.submit": "Reconciliation Submitted",
  "demand.log.create": "Demand Logged",
  "setting.update": "Setting Updated",
  "offline.sync.conflict": "Offline Sync Conflict",
  "reservation.fulfill": "Reservation Fulfilled",
  "reservation.cancel": "Reservation Cancelled",
  "internalInvoice.generate": "Invoice Generated",
};

function getActionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

function getActionColor(action: string) {
  if (action.includes("Discrepancy") || action.includes("Conflict")) return "text-red-700 bg-red-50";
  if (action.includes("Deactivat") || action.includes("Reject") || action.includes("Cancel") || action.includes("Deleted")) return "text-orange-700 bg-orange-50";
  if (action.includes("Created") || action.includes("Approved") || action.includes("Received") || action.includes("Delivered")) return "text-green-700 bg-green-50";
  return "text-blue-700 bg-blue-50";
}

// ─── Detail renderer ────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  quantity: "Quantity",
  reservedQuantity: "Reserved Qty",
  reason: "Reason",
  status: "Status",
  name: "Name",
  role: "Role",
  branchId: "Branch",
  packedById: "Packed By",
  shippedById: "Shipped By",
  deliveredById: "Delivered By",
  discrepancy: "Discrepancy",
  transferId: "Transfer",
  isActive: "Active",
  email: "Email",
  phone: "Phone",
  address: "Address",
  notes: "Notes",
  sku: "SKU",
  barcode: "Barcode",
  size: "Size",
  color: "Color",
  price: "Price",
  costPrice: "Cost Price",
  totalIssues: "Total Issues",
  packed: "Packed",
  received: "Received",
  type: "Type",
  damageNotes: "Damage Notes",
};

const DISCREPANCY_TYPE_LABELS: Record<string, { label: string; className: string }> = {
  shortage: { label: "Shortage", className: "text-orange-700 bg-orange-50" },
  overage: { label: "Overage", className: "text-blue-700 bg-blue-50" },
  damaged: { label: "Damaged", className: "text-red-700 bg-red-50" },
};

function formatValue(value: unknown): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

type DiscrepancyItem = {
  sku: string;
  packed: number;
  received: number;
  type: string;
  damageNotes?: string;
};

function DiscrepancyList({ items }: { items: DiscrepancyItem[] }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const typeInfo = DISCREPANCY_TYPE_LABELS[item.type] ?? { label: item.type, className: "text-gray-700 bg-gray-50" };
        return (
          <div key={i} className="rounded border bg-muted/50 px-3 py-2 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{item.sku}</span>
              <span className={cn("px-1.5 py-0.5 rounded text-[11px] font-medium", typeInfo.className)}>
                {typeInfo.label}
              </span>
            </div>
            <div className="flex gap-4 text-muted-foreground">
              <span>Packed: <span className="text-foreground font-medium">{item.packed}</span></span>
              <span>Received: <span className="text-foreground font-medium">{item.received}</span></span>
              {item.packed !== item.received && (
                <span>Diff: <span className={cn("font-medium", item.received > item.packed ? "text-blue-700" : "text-orange-700")}>
                  {item.received > item.packed ? "+" : ""}{item.received - item.packed}
                </span></span>
              )}
            </div>
            {item.damageNotes && (
              <p className="text-red-600">{item.damageNotes}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DetailSection({ label, data }: { label: string; data: unknown }) {
  if (!data || (typeof data === "object" && Object.keys(data as object).length === 0)) return null;
  const obj = data as Record<string, unknown>;
  const entries = Object.entries(obj);

  // Check if this contains a discrepancy items array
  const hasDiscrepancyItems = Array.isArray(obj.items) && obj.items.length > 0 && obj.items[0]?.sku;

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-1.5">{label}</p>
      {hasDiscrepancyItems ? (
        <div className="space-y-2">
          <div className="rounded border bg-muted/50 px-3 py-1.5 text-xs flex items-baseline justify-between">
            <span className="text-muted-foreground">Total Issues</span>
            <span className="font-medium">{(obj.items as unknown[]).length}</span>
          </div>
          <DiscrepancyList items={obj.items as DiscrepancyItem[]} />
        </div>
      ) : (
        <div className="rounded border bg-muted/50 divide-y">
          {entries.map(([key, val]) => (
            <div key={key} className="flex items-baseline justify-between gap-4 px-3 py-1.5 text-xs">
              <span className="text-muted-foreground shrink-0">{FIELD_LABELS[key] ?? key}</span>
              <span className="font-medium text-right">{formatValue(val)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Expandable row ─────────────────────────────────────────────────────────

type AuditEntry = {
  _id: string;
  action: string;
  userName: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  timestamp: number;
};

function AuditRow({ log }: { log: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const label = getActionLabel(log.action);
  const colorClass = getActionColor(label);
  const hasDetails = !!(log.before || log.after);

  return (
    <>
      <tr
        className={cn(
          "border-b hover:bg-muted/30 transition-colors",
          hasDetails && "cursor-pointer"
        )}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
          {relativeTime(log.timestamp)}
        </td>
        <td className="px-4 py-3 font-medium">{log.userName}</td>
        <td className="px-4 py-3">
          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", colorClass)}>
            {label}
          </span>
        </td>
        <td className="px-4 py-3 text-muted-foreground text-xs">
          {log.entityType}
        </td>
        <td className="px-4 py-3 w-8">
          {hasDetails && (
            expanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr className="border-b bg-muted/20">
          <td colSpan={5} className="px-6 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
              <DetailSection label="Before" data={log.before} />
              <DetailSection label="After" data={log.after} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [activeTab, setActiveTab] = useState("");
  const [cursor, setCursor] = useState<number | undefined>(undefined);

  const result = useQuery(api.audit.logs.getEnrichedAuditLogs, {
    limit: 10,
    cursor,
    actionPrefix: activeTab || undefined,
  });

  const logs = result?.logs ?? [];
  const hasMore = result?.hasMore ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track all system actions — transfers, inventory changes, user updates, and more.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setActiveTab(tab.value);
              setCursor(undefined);
            }}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              activeTab === tab.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">When</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Entity</th>
                <th className="w-8 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {result === undefined &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b animate-pulse">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-muted w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

              {result !== undefined && logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No audit entries found.
                  </td>
                </tr>
              )}

              {logs.map((log) => (
                <AuditRow key={log._id} log={log as AuditEntry} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {logs.length > 0 ? `Showing ${logs.length} entries` : ""}
        </p>
        <div className="flex gap-2">
          {cursor !== undefined && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursor(undefined)}
            >
              Back to latest
            </Button>
          )}
          {hasMore && result?.nextCursor && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursor(result.nextCursor)}
            >
              Load older
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
