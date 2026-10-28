"use client";

// app/admin/getting-started/page.tsx — a first-time guide to running the system.
//
// The checklist at the top reads each step's state from the data
// (convex/admin/gettingStarted.ts), so it shows what is actually set up. The
// tabs below are the how-to, one per job, written for someone who has not used
// the system before.

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";

// ─── Building blocks ────────────────────────────────────────────────────────

function GoTo({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {i + 1}
          </span>
          <div className="pt-0.5 leading-relaxed">{item}</div>
        </li>
      ))}
    </ol>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
      {children}
    </div>
  );
}

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
      </div>
      {children}
    </div>
  );
}

function Columns({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Column</th>
            <th className="px-3 py-2">Required</th>
            <th className="px-3 py-2">What goes in it</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([col, req, what]) => (
            <tr key={col} className="border-t">
              <td className="px-3 py-2 font-mono text-xs">{col}</td>
              <td className="px-3 py-2">{req}</td>
              <td className="px-3 py-2 text-muted-foreground">{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Checklist ──────────────────────────────────────────────────────────────

function Checklist() {
  const status = useQuery(api.admin.gettingStarted.getSetupStatus);
  if (status === undefined) {
    return <div className="h-40 animate-pulse rounded-lg border bg-muted/40" />;
  }

  const steps: { done: boolean; title: string; detail: string; href: string; cta: string }[] = [
    {
      done: status.branches.count > 0 && status.branches.withoutCode === 0,
      title: "Branches are set up",
      detail:
        status.branches.count === 0
          ? "No branches yet."
          : status.branches.withoutCode > 0
            ? `${status.branches.withoutCode} branch(es) have no code.`
            : `${status.branches.count} active branches, all with codes.`,
      href: "/admin/branches",
      cta: "Branches",
    },
    {
      done: status.branches.count > 0 && status.branches.storesWithoutBrand === 0,
      title: "Every store has its brands",
      detail:
        status.branches.storesWithoutBrand > 0
          ? `${status.branches.storesWithoutBrand} store(s) take all brands — tick the brands each store carries.`
          : "Each store is limited to the brands it sells.",
      href: "/admin/branches",
      cta: "Branches",
    },
    {
      done: status.warehouseName !== null,
      title: "A central warehouse is marked",
      detail: status.warehouseName
        ? `${status.warehouseName} is the warehouse stock is sent from.`
        : "Set one branch's channel to Warehouse.",
      href: "/admin/branches",
      cta: "Branches",
    },
    {
      done: status.hasCatalog,
      title: "Products are in the catalog",
      detail: status.hasCatalog ? "The catalog has products." : "Import or add products first.",
      href: "/admin/catalog",
      cta: "Catalog",
    },
    {
      done: status.warehouseHasStock,
      title: "The warehouse has stock",
      detail: status.warehouseHasStock
        ? "Stock is loaded — allocations can go through."
        : "Nothing can be sent until the warehouse holds stock. Load it with Upload legacy stock.",
      href: "/admin/inventory/legacy-upload",
      cta: "Upload legacy stock",
    },
    {
      done: status.hasTeam,
      title: "Your team is invited",
      detail: status.hasTeam ? "Other users have accounts." : "You are the only user so far.",
      href: "/admin/users",
      cta: "Users",
    },
    {
      done: status.hasTransfer,
      title: "First allocation uploaded",
      detail: status.hasTransfer
        ? "Transfer requests exist."
        : "Download a branch template, fill a few quantities and upload it.",
      href: "/merchandising/replenishment",
      cta: "Replenishment",
    },
    {
      done: status.hasDelivery,
      title: "First delivery received",
      detail: status.hasDelivery
        ? "A transfer has been delivered end to end."
        : "Approve, pack, ship and receive one transfer to see the whole flow.",
      href: "/admin/transfers",
      cta: "Transfers",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="font-semibold">Setup checklist</h2>
        <span className="text-sm text-muted-foreground">
          {doneCount} of {steps.length} done
        </span>
      </div>
      <div className="h-1.5 bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>
      <ul className="divide-y">
        {steps.map((s) => (
          <li key={s.title} className="flex items-start gap-3 px-5 py-3">
            {s.done ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            ) : (
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", s.done && "text-muted-foreground")}>
                {s.title}
              </p>
              <p className="text-xs text-muted-foreground">{s.detail}</p>
            </div>
            {!s.done && (
              <span className="shrink-0 text-xs">
                <GoTo href={s.href}>{s.cta}</GoTo>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function GettingStartedPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Getting Started</h1>
        <p className="text-sm text-muted-foreground">
          How stock gets from the warehouse to the stores, and how to set the
          system up the first time.
        </p>
      </div>

      <Checklist />

      <Tabs defaultValue="flow">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="flow">How it fits together</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="stock">Stocking the warehouse</TabsTrigger>
          <TabsTrigger value="allocate">Allocation &amp; replenishment</TabsTrigger>
          <TabsTrigger value="transfers">After you upload</TabsTrigger>
          <TabsTrigger value="inventory">Checking stock</TabsTrigger>
        </TabsList>

        <TabsContent value="flow" className="mt-4">
          <Section
            title="How it fits together"
            intro="Stock comes into the warehouse, and the warehouse sends it out to the stores. Nothing reaches a store any other way."
          >
            <Steps
              items={[
                <>
                  <strong>Stock arrives at the warehouse</strong>: an opening count, or a
                  supplier delivery.
                </>,
                <>
                  <strong>You decide what each store gets</strong> in a spreadsheet: a
                  branch template, or the replenishment sheet.
                </>,
                <>
                  <strong>You upload it.</strong> Each row is checked against the
                  warehouse <em>at that moment</em>. Rows it can cover become one transfer
                  request per store, and those units are reserved straight away.
                </>,
                <>
                  <strong>Logistics approves</strong>, the warehouse <strong>packs</strong>{" "}
                  and <strong>ships</strong>, and the store <strong>receives</strong>. The
                  store&apos;s stock goes up on delivery.
                </>,
              ]}
            />
            <Note>
              The system only pulls stock <strong>when you upload</strong>. If the
              warehouse doesn&apos;t have an item yet, that row is skipped and handed back
              to you. It does not wait and pull later. Keep your plan, and upload it again
              once the stock has arrived.
            </Note>
          </Section>
        </TabsContent>

        <TabsContent value="branches" className="mt-4">
          <Section
            title="Branches"
            intro="Every store, office and the warehouse is a branch. Three fields matter for stock."
          >
            <Steps
              items={[
                <>
                  <strong>Code</strong>: the department code from finance, e.g.{" "}
                  <code>100-5021</code>. Spreadsheets name branches by code, because a
                  missing period in a name sends stock to the wrong place.
                </>,
                <>
                  <strong>Branch Type</strong>: <em>Store</em> sells.{" "}
                  <em>Head Office</em> departments can receive stock (samples, e-commerce)
                  but replenishment never tops them up.
                </>,
                <>
                  <strong>Brands</strong>: tick the brands a branch carries. An
                  Aeropostale store only gets Aeropostale, and the upload refuses anything
                  else. <em>All brands</em> takes everything, including brands you add
                  later.
                </>,
                <>
                  One branch has the <strong>Warehouse</strong> channel. That&apos;s where
                  every allocation is sent from.
                </>,
              ]}
            />
            <GoTo href="/admin/branches">Open Branches</GoTo>
          </Section>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Section
            title="Users"
            intro="People get an account by invitation. The role decides what they can see."
          >
            <Steps
              items={[
                <>
                  On <strong>Users</strong>, click <strong>Invite User</strong>, enter their
                  email and pick a role.
                </>,
                <>They get an email, set up their account, and appear in the list.</>,
                <>
                  Click <strong>Edit</strong> on their row to assign their branch. Store
                  managers and cashiers only see their own branch.
                </>,
              ]}
            />
            <Note>
              <strong>Admin</strong> sees everything. <strong>Merchandiser</strong> plans
              allocations and replenishment. <strong>Warehouse Staff</strong> receives,
              packs and ships. <strong>Manager</strong> and <strong>Cashier</strong> work
              in one store.
            </Note>
            <GoTo href="/admin/users">Open Users</GoTo>
          </Section>
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          <div className="space-y-4">
            <Section
              title="1. The first load: Upload legacy stock"
              intro="Bring in what is already sitting in the warehouse (and the stores) from the old system."
            >
              <Columns
                rows={[
                  ["ProductCode", "Yes", "The SKU or barcode"],
                  ["STORE", "Yes", "Which location the row counts"],
                  ["EndingBalance", "Yes", "How many are there now"],
                  ["ProductDesc, Brand, Sale, Return, MovementIn…", "No", "Kept as that month's history"],
                ]}
              />
              <Steps
                items={[
                  <>Upload the file. You&apos;ll match each STORE value to a branch; pick RDI WAREHOUSE for the warehouse rows.</>,
                  <>Check the preview. It lists any product it couldn&apos;t find.</>,
                  <>Apply it.</>,
                ]}
              />
              <Note>
                This <strong>replaces</strong> the count with EndingBalance; it does not
                add. Use it for an opening count, not for a delivery on top of existing
                stock.
              </Note>
              <GoTo href="/admin/inventory/legacy-upload">Open Upload legacy stock</GoTo>
            </Section>

            <Section
              title="2. A delivery arrives: Receive Stock"
              intro="For stock that turns up without a purchase order to check against."
            >
              <Steps
                items={[
                  <>Open <strong>Inventory → Receive Stock</strong>.</>,
                  <>Search each SKU that arrived, and enter the quantity and cost.</>,
                  <>Receive it. It <strong>adds</strong> to the warehouse.</>,
                ]}
              />
              <GoTo href="/admin/inventory">Open Inventory</GoTo>
            </Section>

            <Section
              title="3. A purchase order delivery: Goods Receipt"
              intro="For supplier deliveries with a declared list. The warehouse counts what actually came."
            >
              <Steps
                items={[
                  <>Open <strong>Warehouse → Goods Receipt</strong> and pick the delivery.</>,
                  <>Count what arrived against what the supplier declared.</>,
                  <>
                    Optional: <strong>pre-allocate</strong> it, deciding which stores get the
                    delivery before it&apos;s even received.
                  </>,
                ]}
              />
              <GoTo href="/warehouse/receiving">Open Goods Receipt</GoTo>
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="allocate" className="mt-4">
          <div className="space-y-4">
            <Section
              title="Allocation: sending stock to a store"
              intro="One row is one product going to one branch."
            >
              <Steps
                items={[
                  <>
                    On <strong>Replenishment</strong> (or Warehouse → Transfer Requests),
                    pick a branch next to <strong>Template</strong> and download it.
                  </>,
                  <>
                    It lists every product that branch carries, even when stock is 0, with{" "}
                    <em>Store on hand</em> and <em>Warehouse on hand</em>.
                  </>,
                  <>
                    Fill in <strong>Quantity</strong> with how many to send. The store ends up
                    with Store on hand + Quantity. Leave everything else at 0. Rows at 0 are
                    skipped.
                  </>,
                  <>
                    Click <strong>Upload allocation</strong>. You can select several files at
                    once.
                  </>,
                ]}
              />
              <Columns
                rows={[
                  ["SKU", "Yes", "The product"],
                  ["Branch Code", "Yes", "Where it goes: the code (a name also works)"],
                  ["Quantity", "Yes", "How many to send"],
                  ["Notes", "No", "Shown on the transfer request"],
                ]}
              />
            </Section>

            <Section
              title="What the upload checks"
              intro="Every row is checked on its own; the rest of the file still goes through."
            >
              <Steps
                items={[
                  <>The SKU exists and the branch code is real.</>,
                  <>The branch carries that brand. A Hurley SKU to an Aeropostale store is refused.</>,
                  <>
                    The warehouse has enough <em>right now</em>. A row asking for 10 when 6 are
                    left is refused <strong>as a whole</strong>. Lower it to 6.
                  </>,
                ]}
              />
              <Note>
                Refused rows come back as a <strong>skipped rows</strong> file with the
                reason for each. Fix those, or wait for stock, and upload just that file
                again.
              </Note>
            </Section>

            <Section
              title="Replenishment: topping stores up"
              intro="The system works out what each store is short of, from what it sold."
            >
              <Steps
                items={[
                  <>Set <strong>Cover</strong> (days of stock to hold) and <strong>Rate of sale over</strong> (days of sales to judge by).</>,
                  <>
                    Download the <strong>sheet</strong> (all stores in one file) or{" "}
                    <strong>Per store</strong> (one file each).
                  </>,
                  <>Adjust the quantities if you want, then upload the file(s) back the same way.</>,
                ]}
              />
              <GoTo href="/merchandising/replenishment">Open Replenishment</GoTo>
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="transfers" className="mt-4">
          <Section
            title="After you upload"
            intro="Each store's request moves through these stages. Its stock only changes on delivery."
          >
            <Steps
              items={[
                <>
                  <strong>Requested</strong>: the units are reserved at the warehouse, so
                  they can&apos;t be promised twice.
                </>,
                <>
                  <strong>Approved</strong> or <strong>rejected</strong> by logistics. A
                  rejection, or a cancellation, puts the reserved units back.
                </>,
                <>
                  <strong>Packed</strong> and <strong>in transit</strong>: the warehouse packs
                  it and ships it.
                </>,
                <>
                  <strong>Delivered</strong>: the store receives it on Receive Transfers, and
                  its stock goes up.
                </>,
              ]}
            />
            <Note>
              Try one small transfer first. Load a couple of units into the warehouse, send
              2 products to one store, and take it all the way to delivered. Then you know
              every step works.
            </Note>
            <GoTo href="/admin/transfers">Open Transfers</GoTo>
          </Section>
        </TabsContent>

        <TabsContent value="inventory" className="mt-4">
          <Section
            title="Checking stock"
            intro="Inventory → Stock Levels shows where everything is."
          >
            <Steps
              items={[
                <>
                  <strong>All branches</strong> (the default): one row per product, with the
                  total across every branch and how many branches hold it.
                </>,
                <>
                  Pick a <strong>branch</strong> to see that branch alone. That&apos;s where you
                  adjust a count, with a reason.
                </>,
                <>Use the status filter to find what is low or out of stock.</>,
              ]}
            />
            <GoTo href="/admin/inventory">Open Inventory</GoTo>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
