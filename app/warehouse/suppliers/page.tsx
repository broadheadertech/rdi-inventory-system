"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

export default function WarehouseSuppliersPage() {
  const suppliers = useQuery(api.suppliers.directory.listSuppliers);
  const createSupplier = useMutation(api.suppliers.directory.createSupplier);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !address.trim()) {
      setError("Name and address are required.");
      return;
    }

    setSubmitting(true);
    try {
      await createSupplier({ name: name.trim(), address: address.trim() });
      setName("");
      setAddress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add supplier");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Supplier List</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Suppliers the warehouse sources stock from.
        </p>
      </div>

      {/* Add supplier */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label className="text-sm font-medium">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Supplier name"
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Supplier address"
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? "Adding..." : "Add Supplier"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* List */}
      {suppliers === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : suppliers.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No suppliers yet. Add one above.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Address</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {suppliers.map((s) => (
                <tr key={s._id as string} className="hover:bg-muted/30">
                  <td className="px-4 py-2 font-medium">{s.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {s.address}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
