"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import {
  Package,
  PackageCheck,
  Truck,
  ClipboardCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function WarehouseDashboardPage() {
  const approved = useQuery(api.transfers.fulfillment.listApprovedTransfers);
  const packed = useQuery(api.transfers.fulfillment.listPackedTransfers);
  const inTransit = useQuery(api.transfers.fulfillment.listInTransitTransfers);

  const isLoading =
    approved === undefined || packed === undefined || inTransit === undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Warehouse Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of warehouse operations and transfer pipeline
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <>
          {/* Transfer Pipeline */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Transfer Pipeline</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Link href="/warehouse/transfers">
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Awaiting Packing
                    </CardTitle>
                    <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {approved.length}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Approved transfers ready to pack
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/warehouse/transfers">
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Ready to Dispatch
                    </CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {packed.length}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Packed and awaiting driver assignment
                    </p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/warehouse/logistics">
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      In Transit
                    </CardTitle>
                    <Truck className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {inTransit.length}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Currently being delivered
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Link
                href="/warehouse/transfer-requests"
                className="flex items-center gap-3 rounded-lg border p-4 hover:bg-gray-50 transition-colors"
              >
                <ClipboardCheck className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Transfer Requests</p>
                  <p className="text-xs text-muted-foreground">
                    Approve or reject requests
                  </p>
                </div>
              </Link>

              <Link
                href="/warehouse/transfers"
                className="flex items-center gap-3 rounded-lg border p-4 hover:bg-gray-50 transition-colors"
              >
                <PackageCheck className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Pack Transfers</p>
                  <p className="text-xs text-muted-foreground">
                    Scan and pack approved transfers
                  </p>
                </div>
              </Link>

              <Link
                href="/warehouse/receiving"
                className="flex items-center gap-3 rounded-lg border p-4 hover:bg-gray-50 transition-colors"
              >
                <Package className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Receive Shipments</p>
                  <p className="text-xs text-muted-foreground">
                    Scan and receive incoming stock
                  </p>
                </div>
              </Link>

              <Link
                href="/warehouse/logistics"
                className="flex items-center gap-3 rounded-lg border p-4 hover:bg-gray-50 transition-colors"
              >
                <Truck className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Logistics</p>
                  <p className="text-xs text-muted-foreground">
                    Assign drivers and track deliveries
                  </p>
                </div>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
