"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function CouriersPage() {
  const couriers = useQuery(api.logistics.couriers.listCouriers);
  const createCourier = useMutation(api.logistics.couriers.createCourier);
  const setActive = useMutation(api.logistics.couriers.setCourierActive);

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter a courier name.");
    setBusy(true);
    try {
      await createCourier({ name: name.trim() });
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add courier");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Couriers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Third-party delivery providers available when dispatching stock movements.
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex items-end gap-2 rounded-lg border p-4">
        <div className="flex-1">
          <label className="text-sm font-medium">Courier name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. J&T Express, LBC, Ninja Van"
            className="mt-1"
          />
        </div>
        <Button type="submit" disabled={busy}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Courier
        </Button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-foreground">Name</TableHead>
              <TableHead className="text-foreground">Status</TableHead>
              <TableHead className="text-foreground text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {couriers === undefined ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                </TableCell>
              </TableRow>
            ) : couriers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                  No couriers yet. Add one above.
                </TableCell>
              </TableRow>
            ) : (
              couriers.map((c) => (
                <TableRow key={c._id as string}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setActive({
                          courierId: c._id as Id<"couriers">,
                          isActive: !c.isActive,
                        })
                      }
                    >
                      {c.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
