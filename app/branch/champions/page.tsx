"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Trophy } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";

const rankStyle = (rank: number) => {
  if (rank === 1) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";
  if (rank === 2) return "bg-gray-400/20 text-gray-300 border-gray-400/40";
  if (rank === 3) return "bg-amber-700/20 text-amber-600 border-amber-700/40";
  return "bg-zinc-800/50 text-zinc-400 border-zinc-700/40";
};

const rankLabel = (rank: number) => {
  if (rank === 1) return "Gold";
  if (rank === 2) return "Silver";
  if (rank === 3) return "Bronze";
  return `#${rank}`;
};

export default function ChampionsPage() {
  const champions = useQuery(api.analytics.staffChampions.getStaffChampions, {});

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/20">
          <Trophy className="h-5 w-5 text-yellow-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Staff Champions
          </h1>
          <p className="text-sm text-muted-foreground">
            Top performers over the last 30 days
          </p>
        </div>
      </div>

      {/* Loading state */}
      {champions === undefined && (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Loading leaderboard...</p>
        </div>
      )}

      {/* Empty state */}
      {champions !== undefined && champions.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Trophy className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground">
            No transactions in the last 30 days.
          </p>
        </div>
      )}

      {/* Leaderboard */}
      {champions && champions.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 w-20">Rank</th>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3 text-right">Transactions</th>
                <th className="px-4 py-3 text-right">Sales</th>
              </tr>
            </thead>
            <tbody>
              {champions.map((champ, idx) => {
                const rank = idx + 1;
                return (
                  <tr
                    key={champ.userId}
                    className={cn(
                      "border-b last:border-b-0 transition-colors hover:bg-muted/30",
                      rank <= 3 && "font-medium"
                    )}
                  >
                    {/* Rank badge */}
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold",
                          rankStyle(rank)
                        )}
                      >
                        {rank}
                      </span>
                    </td>

                    {/* Avatar + name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase text-muted-foreground">
                          {champ.userName
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium leading-tight">
                            {champ.userName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {champ.branchName}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Transaction count */}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {champ.transactionCount.toLocaleString()}
                    </td>

                    {/* Total revenue */}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatPrice(champ.totalRevenue)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
