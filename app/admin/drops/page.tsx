"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Sparkles, Search, X, Building2 } from "lucide-react";
import { toast } from "sonner";
import { formatPrice, cn } from "@/lib/utils";

export default function DropsAdminPage() {
  const drops = useQuery(api.catalog.drops.listExclusiveDrops);
  const branches = useQuery(api.auth.branches.listBranches);
  const toggleExclusive = useMutation(api.catalog.drops.toggleExclusive);

  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchResults = useQuery(
    api.catalog.drops.searchStyles,
    showSearch && search.trim().length >= 2
      ? { search: search.trim() }
      : "skip"
  );

  const [selectedBranches, setSelectedBranches] = useState<Id<"branches">[]>(
    []
  );

  const retailBranches = branches?.filter(
    (b) => b.channel !== "warehouse" && b.isActive
  );

  const handleMarkExclusive = async (styleId: Id<"styles">) => {
    try {
      await toggleExclusive({
        styleId,
        isExclusive: true,
        exclusiveBranchIds: selectedBranches,
      });
      toast.success("Marked as exclusive drop");
      setSearch("");
      setShowSearch(false);
      setSelectedBranches([]);
    } catch {
      toast.error("Failed to mark as exclusive");
    }
  };

  const handleRemoveExclusive = async (styleId: Id<"styles">) => {
    try {
      await toggleExclusive({ styleId, isExclusive: false });
      toast.success("Removed exclusive status");
    } catch {
      toast.error("Failed to update");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Exclusive Drops</h1>
          <p className="text-sm text-muted-foreground">
            Manage exclusive product drops and branch availability
          </p>
        </div>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
            showSearch
              ? "bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {showSearch ? (
            <>
              <X className="h-4 w-4" /> Cancel
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Add Exclusive Drop
            </>
          )}
        </button>
      </div>

      {/* Search & Add Panel */}
      {showSearch && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search styles by name..."
              className="w-full rounded-md border border-border bg-background pl-10 pr-4 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>

          {/* Branch picker */}
          {retailBranches && retailBranches.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Exclusive to branches (leave empty for all):
              </p>
              <div className="flex flex-wrap gap-2">
                {retailBranches.map((branch) => {
                  const isSelected = selectedBranches.includes(branch._id);
                  return (
                    <button
                      key={branch._id}
                      onClick={() =>
                        setSelectedBranches((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== branch._id)
                            : [...prev, branch._id]
                        )
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-muted-foreground"
                      )}
                    >
                      <Building2 className="h-3 w-3" />
                      {branch.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search results */}
          {searchResults && searchResults.length > 0 && (
            <div className="divide-y divide-border rounded-md border border-border">
              {searchResults.map((style) => (
                <div
                  key={style._id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{style.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {style.brandName}
                    </p>
                  </div>
                  {style.isExclusive ? (
                    <span className="rounded bg-purple-600/20 px-2 py-0.5 text-xs font-medium text-purple-400">
                      Already Exclusive
                    </span>
                  ) : (
                    <button
                      onClick={() => handleMarkExclusive(style._id)}
                      className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
                    >
                      Mark Exclusive
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {searchResults && searchResults.length === 0 && search.length >= 2 && (
            <p className="text-center text-sm text-muted-foreground py-4">
              No styles found matching &quot;{search}&quot;
            </p>
          )}
        </div>
      )}

      {/* Current Exclusive Drops */}
      {drops === undefined ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border border-border bg-muted"
            />
          ))}
        </div>
      ) : drops.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Sparkles className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No exclusive drops configured yet
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {drops.map((drop) => (
            <div
              key={drop._id}
              className="flex items-center justify-between px-4 py-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-purple-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                    EXCLUSIVE
                  </span>
                  <p className="text-sm font-medium">{drop.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {drop.brandName} &middot; {drop.categoryName} &middot;{" "}
                  {formatPrice(drop.priceCentavos)}
                </p>
                {drop.exclusiveBranchNames.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    {drop.exclusiveBranchNames.join(", ")}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleRemoveExclusive(drop._id)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-destructive hover:text-destructive"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
