import { query } from "../_generated/server";

export const getPaydayStatus = query({
  args: {},
  handler: async () => {
    const now = new Date();
    const day = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    // Payday windows: 12th-17th and 27th-2nd(next month)
    const isPaydayWindow =
      (day >= 12 && day <= 17) ||
      (day >= 27) ||
      (day <= 2);

    // Next payday
    let nextPayday: number;
    if (day <= 15) {
      nextPayday = 15;
    } else if (day <= daysInMonth) {
      nextPayday = Math.min(30, daysInMonth);
    } else {
      nextPayday = 15;
    }

    const daysUntilPayday = day <= nextPayday
      ? nextPayday - day
      : (daysInMonth - day) + (nextPayday <= 15 ? 15 : Math.min(30, daysInMonth));

    return {
      isPaydayWindow,
      daysUntilPayday,
      nextPayday,
      message: isPaydayWindow
        ? "Payday Sale is ON! Extra deals available"
        : `Payday sale in ${daysUntilPayday} days`,
    };
  },
});
