// Where an athlete is in their training BY THE CALENDAR — not by what they've
// logged. Shared by the athlete's Training tab (its calendar grid) and the
// coach's Athletes list / athlete page, so both always agree on "Block 2 ·
// Week 1".
//
// Anchor rule (see TrainingLog's calendarSlots for the history): week 1 day 1
// of a block is the Monday ON OR AFTER the day it was deployed, because
// blocks are deployed ahead of when the athlete starts them.

const DAY_MS = 86400000;

function localMidnight(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Monday on or after the deploy date, at local midnight.
export function blockStartMonday(deployedAt: string): Date {
  const deploy = localMidnight(new Date(deployedAt));
  const weekday = (deploy.getDay() + 6) % 7; // 0=Mon..6=Sun
  deploy.setDate(deploy.getDate() + (weekday === 0 ? 0 : 7 - weekday));
  return deploy;
}

// Whole calendar days from a to b (rounded, so DST shifts don't matter).
function daysBetween(a: Date, b: Date): number {
  return Math.round((localMidnight(b).getTime() - localMidnight(a).getTime()) / DAY_MS);
}

export interface CalendarBlock {
  id: string;
  name: string;
  order_index: number;
  deployed_at: string | null;
}

export type CalendarPosition =
  // Today falls inside this block: weekNumber is 1-based.
  | { state: "current"; block: CalendarBlock; weekNumber: number; totalWeeks: number }
  // No block covers today, but this one starts later.
  | { state: "upcoming"; block: CalendarBlock; startsOn: Date; totalWeeks: number }
  // Every block has ended; this is the most recent one.
  | { state: "finished"; block: CalendarBlock; totalWeeks: number };

// Given an athlete's deployed (or completed) blocks and how many weeks each
// has, which block and week is today? Overlaps resolve to the later block.
// Between blocks, an upcoming block wins over a finished one (the athlete is
// waiting to start it). Returns null if nothing has been deployed.
export function calendarPosition(
  blocks: CalendarBlock[],
  weekCountByBlock: Map<string, number>,
  now: Date = new Date(),
): CalendarPosition | null {
  const today = localMidnight(now);
  const spans = blocks
    .filter((b) => b.deployed_at && (weekCountByBlock.get(b.id) ?? 0) > 0)
    .map((b) => {
      const start = blockStartMonday(b.deployed_at!);
      const totalWeeks = weekCountByBlock.get(b.id)!;
      return { block: b, start, totalWeeks, dayIndex: daysBetween(start, today) };
    })
    .sort((a, b) => a.block.order_index - b.block.order_index);
  if (spans.length === 0) return null;

  const current = spans.filter((s) => s.dayIndex >= 0 && s.dayIndex < s.totalWeeks * 7).pop();
  if (current) {
    return { state: "current", block: current.block, weekNumber: Math.floor(current.dayIndex / 7) + 1, totalWeeks: current.totalWeeks };
  }
  const upcoming = spans.filter((s) => s.dayIndex < 0).sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  if (upcoming) return { state: "upcoming", block: upcoming.block, startsOn: upcoming.start, totalWeeks: upcoming.totalWeeks };
  const last = spans[spans.length - 1];
  return { state: "finished", block: last.block, totalWeeks: last.totalWeeks };
}

// Today's weekday in the app's Monday-first numbering (training_days.weekday).
export function todayWeekday(now: Date = new Date()): number {
  return (now.getDay() + 6) % 7;
}
