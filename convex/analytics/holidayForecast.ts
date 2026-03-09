import { query } from "../_generated/server";
import { requireRole } from "../_helpers/permissions";

// ─── Regional Holiday & Event Forecasting ───────────────────────────────────
// Static calendar of Philippine holidays/events with demand impact predictions.

type HolidayEntry = {
  month: number; // 1-12 for fixed dates, 0 for recurring monthly
  day: number;
  name: string;
  category: string;
  demandImpact: "low" | "medium" | "high" | "very_high";
  topCategories: string[];
  recurring?: boolean;
};

const PH_EVENTS: HolidayEntry[] = [
  { month: 1, day: 1, name: "New Year", category: "Holiday", demandImpact: "high", topCategories: ["Casual Wear", "Loungewear"] },
  { month: 2, day: 14, name: "Valentine's Day", category: "Event", demandImpact: "high", topCategories: ["Dress Shirts", "Dresses"] },
  { month: 3, day: 1, name: "Graduation Season Start", category: "Season", demandImpact: "very_high", topCategories: ["Formal Wear", "Dress Shoes", "Polo Shirts"] },
  { month: 4, day: 9, name: "Araw ng Kagitingan", category: "Holiday", demandImpact: "low", topCategories: [] },
  { month: 5, day: 1, name: "Labor Day", category: "Holiday", demandImpact: "medium", topCategories: ["Casual Wear"] },
  { month: 6, day: 1, name: "Back to School", category: "Season", demandImpact: "very_high", topCategories: ["Uniforms", "Sneakers", "Backpacks"] },
  { month: 6, day: 12, name: "Independence Day", category: "Holiday", demandImpact: "medium", topCategories: ["Athletic Wear"] },
  { month: 8, day: 21, name: "Ninoy Aquino Day", category: "Holiday", demandImpact: "low", topCategories: [] },
  { month: 9, day: 1, name: "BER Months Start", category: "Season", demandImpact: "high", topCategories: ["Christmas Apparel", "Party Wear"] },
  { month: 10, day: 31, name: "Halloween / Undas", category: "Holiday", demandImpact: "medium", topCategories: ["Dark Wear", "Costumes"] },
  { month: 11, day: 11, name: "11.11 Sale", category: "Sale Event", demandImpact: "very_high", topCategories: ["All Categories"] },
  { month: 11, day: 30, name: "Bonifacio Day", category: "Holiday", demandImpact: "low", topCategories: [] },
  { month: 12, day: 12, name: "12.12 Sale", category: "Sale Event", demandImpact: "very_high", topCategories: ["All Categories"] },
  { month: 12, day: 25, name: "Christmas Day", category: "Holiday", demandImpact: "very_high", topCategories: ["Gift Items", "Formal Wear", "Party Wear"] },
  { month: 12, day: 30, name: "Rizal Day", category: "Holiday", demandImpact: "low", topCategories: [] },
  // Paydays (recurring monthly)
  { month: 0, day: 15, name: "Mid-Month Payday", category: "Payday", demandImpact: "high", topCategories: ["All Categories"], recurring: true },
  { month: 0, day: 30, name: "End-Month Payday", category: "Payday", demandImpact: "high", topCategories: ["All Categories"], recurring: true },
];

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function generateRecommendation(
  entry: HolidayEntry,
  daysUntil: number
): string {
  const cats =
    entry.topCategories.length > 0
      ? entry.topCategories.slice(0, 2).join(" & ")
      : "general inventory";

  if (daysUntil <= 3) return `${entry.name} is imminent — ensure ${cats} are fully stocked`;
  if (daysUntil <= 14) return `Stock up on ${cats} now — ${entry.name} is in ${daysUntil} days`;
  if (daysUntil <= 30) return `Prepare ${cats} inventory for ${entry.name}`;
  return `Plan ${cats} procurement ahead of ${entry.name}`;
}

function formatDate(month: number, day: number): string {
  return `${MONTH_ABBR[month - 1]} ${day}`;
}

// ─── Typhoon & Weather-Driven Stocking ──────────────────────────────────────
// Static Philippine seasonal weather data with PAGASA-style signal alerts.

type WeatherAlert = {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
  recommendations: string[];
};

type WeatherSeason = {
  months: number[];
  season: string;
  alerts: WeatherAlert[];
};

const WEATHER_SEASONS: WeatherSeason[] = [
  {
    months: [6, 7, 8, 9, 10, 11],
    season: "Wet Season (Habagat)",
    alerts: [
      {
        type: "typhoon_season",
        severity: "high",
        message: "Peak typhoon season",
        recommendations: [
          "Stock up on rain gear",
          "Waterproof jackets",
          "Rain boots",
          "Quick-dry clothing",
        ],
      },
      {
        type: "flooding",
        severity: "medium",
        message: "Flooding risk in low-lying areas",
        recommendations: [
          "Elevated storage for ground-floor inventory",
          "Waterproof packaging",
        ],
      },
    ],
  },
  {
    months: [12, 1, 2],
    season: "Cool Dry (Amihan)",
    alerts: [
      {
        type: "cool_weather",
        severity: "low",
        message: "Cooler temperatures",
        recommendations: [
          "Hoodies and sweaters",
          "Long sleeves",
          "Layering pieces",
        ],
      },
    ],
  },
  {
    months: [3, 4, 5],
    season: "Hot Dry (Tag-init)",
    alerts: [
      {
        type: "heat_wave",
        severity: "medium",
        message: "Extreme heat expected",
        recommendations: [
          "Lightweight fabrics",
          "UV protection wear",
          "Shorts and tank tops",
          "Light-colored clothing",
        ],
      },
      {
        type: "summer_travel",
        severity: "low",
        message: "Summer vacation season",
        recommendations: [
          "Beach wear",
          "Swimwear",
          "Resort wear",
          "Travel clothing",
        ],
      },
    ],
  },
];

type PagasaSignal = {
  signal: number;
  label: string;
  severity: "medium" | "high" | "critical";
  message: string;
  recommendations: string[];
};

const PAGASA_SIGNALS: PagasaSignal[] = [
  {
    signal: 1,
    label: "Signal #1",
    severity: "medium",
    message: "Gusty winds expected in the area",
    recommendations: [
      "Secure outdoor displays and signage",
      "Move lightweight stock away from entrances",
    ],
  },
  {
    signal: 2,
    label: "Signal #2",
    severity: "high",
    message: "Heavy rain and strong winds expected",
    recommendations: [
      "Waterproof stock protection for all ground-level inventory",
      "Prepare sandbags for flood-prone branches",
      "Pre-position emergency supplies",
    ],
  },
  {
    signal: 3,
    label: "Signal #3+",
    severity: "critical",
    message: "Typhoon warning — severe weather imminent",
    recommendations: [
      "Close outdoor branches immediately",
      "Initiate emergency stock transfers to safe warehouses",
      "Notify all branch staff of closure protocol",
      "Secure all high-value inventory in waterproof containers",
    ],
  },
];

export const getWeatherAlerts = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["admin", "manager"]);

    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-based

    // Find the current season
    const currentSeason = WEATHER_SEASONS.find((s) =>
      s.months.includes(currentMonth)
    );

    // During wet season months (Jun-Nov), simulate PAGASA signal alerts
    // Signal level based on peak typhoon months (Aug-Oct get higher signals)
    const peakTyphoonMonths = [8, 9, 10];
    const activeSignals: PagasaSignal[] = [];

    if (currentSeason && currentSeason.months.includes(6)) {
      // We're in wet season
      if (peakTyphoonMonths.includes(currentMonth)) {
        // Peak months: show Signal #1 as baseline advisory
        activeSignals.push(PAGASA_SIGNALS[0]);
      }
    }

    return {
      currentMonth,
      season: currentSeason?.season ?? "Unknown",
      seasonAlerts: currentSeason?.alerts ?? [],
      pagasaSignals: activeSignals,
      allSignalDefinitions: PAGASA_SIGNALS,
    };
  },
});

export const getUpcomingHolidays = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["admin", "manager"]);

    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth() + 1; // 1-based
    const todayDay = now.getDate();

    type Result = {
      name: string;
      date: string;
      daysUntil: number;
      category: string;
      demandImpact: string;
      topCategories: string[];
      recommendation: string;
    };

    const candidates: Result[] = [];

    for (const entry of PH_EVENTS) {
      if (entry.month === 0 && entry.recurring) {
        // Recurring monthly: generate next 3 occurrences
        for (let offset = 0; offset < 3; offset++) {
          let m = todayMonth + offset;
          let y = todayYear;
          if (m > 12) {
            m -= 12;
            y += 1;
          }

          // Clamp day to valid range for the month (e.g. Feb doesn't have 30)
          const maxDay = new Date(y, m, 0).getDate();
          const day = Math.min(entry.day, maxDay);

          const eventDate = new Date(y, m - 1, day);
          const daysUntil = Math.ceil(
            (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysUntil < 0) continue;

          candidates.push({
            name: entry.name,
            date: formatDate(m, day),
            daysUntil,
            category: entry.category,
            demandImpact: entry.demandImpact,
            topCategories: entry.topCategories,
            recommendation: generateRecommendation(entry, daysUntil),
          });
        }
      } else {
        // Fixed annual event: try this year and next year
        for (const y of [todayYear, todayYear + 1]) {
          const eventDate = new Date(y, entry.month - 1, entry.day);
          const daysUntil = Math.ceil(
            (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysUntil < 0) continue;

          candidates.push({
            name: entry.name,
            date: formatDate(entry.month, entry.day),
            daysUntil,
            category: entry.category,
            demandImpact: entry.demandImpact,
            topCategories: entry.topCategories,
            recommendation: generateRecommendation(entry, daysUntil),
          });
          break; // Only need the nearest future occurrence
        }
      }
    }

    // Sort by daysUntil ascending, return first 10
    candidates.sort((a, b) => a.daysUntil - b.daysUntil);
    return candidates.slice(0, 10);
  },
});
