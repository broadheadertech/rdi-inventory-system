"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { usePagination } from "@/lib/hooks/usePagination";
import { TablePagination } from "@/components/shared/TablePagination";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Timer, ArrowRight, CheckCircle2, Clock, Truck, ClipboardCheck,
} from "lucide-react";

const PERIOD_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
];

function formatHours(h: number): string {
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  const rem = Math.round(h % 24);
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
}

function speedColor(hours: number, threshold: { good: number; ok: number }): string {
  if (hours <= threshold.good) return "text-green-600";
  if (hours <= threshold.ok) return "text-amber-600";
  return "text-red-600";
}

function StageCard({ label, icon, stats, thresholds }: {
  label: string;
  icon: React.ReactNode;
  stats: { count: number; avgHours: number; medianHours: number; minHours: number; maxHours: number };
  thresholds: { good: number; ok: number };
}) {
  return (
    <div className="rounded-lg border p-4 bg-card">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <p className="text-sm font-semibold">{label}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Average</p>
          <p className={cn("text-xl font-bold tabular-nums", speedColor(stats.avgHours, thresholds))}>
            {formatHours(stats.avgHours)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Median</p>
          <p className={cn("text-xl font-bold tabular-nums", speedColor(stats.medianHours, thresholds))}>
            {formatHours(stats.medianHours)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Fastest</p>
          <p className="text-sm font-medium tabular-nums text-green-600">{formatHours(stats.minHours)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Slowest</p>
          <p className="text-sm font-medium tabular-nums text-red-600">{formatHours(stats.maxHours)}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2">{stats.count} transfers</p>
    </div>
  );
}

export default function WarehouseFulfillmentSpeedPage() {
  const [periodDays, setPeriodDays] = useState("30");

  const data = useQuery(api.analytics.fulfillmentSpeed.getBranchFulfillmentSpeed, {
    periodDays: parseInt(periodDays),
  });

  const pagination = usePagination(data?.details ?? [], 10);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Timer className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Fulfillment Speed</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Pipeline speed for transfers involving this warehouse. Identifies bottlenecks per stage.
        </p>
      </div>

      {/* Filter */}
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Period</Label>
          <Select value={periodDays} onValueChange={setPeriodDays}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stage Cards */}
      {data && (
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <span>Request</span>
            <ArrowRight className="h-3 w-3" />
            <span>Approved</span>
            <ArrowRight className="h-3 w-3" />
            <span>Shipped</span>
            <ArrowRight className="h-3 w-3" />
            <span>Delivered</span>
            <span className="ml-auto font-medium">{data.totalDelivered} completed transfers</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StageCard
              label="Request → Approved"
              icon={<ClipboardCheck className="h-4 w-4 text-amber-500" />}
              stats={data.stages.requestToApproved}
              thresholds={{ good: 24, ok: 72 }}
            />
            <StageCard
              label="Approved → Shipped"
              icon={<Clock className="h-4 w-4 text-blue-500" />}
              stats={data.stages.approvedToShipped}
              thresholds={{ good: 48, ok: 120 }}
            />
            <StageCard
              label="Shipped → Delivered"
              icon={<Truck className="h-4 w-4 text-purple-500" />}
              stats={data.stages.shippedToDelivered}
              thresholds={{ good: 48, ok: 120 }}
            />
            <StageCard
              label="End-to-End"
              icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
              stats={data.stages.endToEnd}
              thresholds={{ good: 96, ok: 240 }}
            />
          </div>
        </>
      )}

      {/* Detail Table */}
      <div className="rounded-lg border overflow-hidden">
        {data === undefined ? (
          <div className="p-8 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (data?.details ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-sm text-muted-foreground">
            <Timer className="h-10 w-10" />
            <p>No completed transfers in this period.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Route</TableHead>
                <TableHead className="text-right">Request → Approved</TableHead>
                <TableHead className="text-right">Approved → Shipped</TableHead>
                <TableHead className="text-right">Shipped → Delivered</TableHead>
                <TableHead className="text-right">End-to-End</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedData.map((d) => (
                <TableRow key={d.transferId}>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <span className="truncate max-w-[120px]">{d.fromBranchName}</span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate max-w-[120px]">{d.toBranchName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.requestToApprovedHours !== null ? (
                      <span className={speedColor(d.requestToApprovedHours, { good: 24, ok: 72 })}>
                        {formatHours(d.requestToApprovedHours)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.approvedToShippedHours !== null ? (
                      <span className={speedColor(d.approvedToShippedHours, { good: 48, ok: 120 })}>
                        {formatHours(d.approvedToShippedHours)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.shippedToDeliveredHours !== null ? (
                      <span className={speedColor(d.shippedToDeliveredHours, { good: 48, ok: 120 })}>
                        {formatHours(d.shippedToDeliveredHours)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      d.endToEndHours <= 96 ? "text-green-600 border-green-500/30" :
                      d.endToEndHours <= 240 ? "text-amber-600 border-amber-500/30" :
                      "text-red-600 border-red-500/30"
                    )}>
                      {formatHours(d.endToEndHours)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {new Date(d.deliveredAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {(data?.details ?? []).length > 0 && (
        <TablePagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          hasNextPage={pagination.hasNextPage}
          hasPrevPage={pagination.hasPrevPage}
          onNextPage={pagination.nextPage}
          onPrevPage={pagination.prevPage}
        />
      )}
    </div>
  );
}
