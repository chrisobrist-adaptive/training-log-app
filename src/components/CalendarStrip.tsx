const WEEKDAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export type CalendarSlot = {
  weekId: string;
  date: Date;
  day: { id: string; completed_at: string | null } | null;
  wd: number; // 0=Mon..6=Sun
};

// Rolling, date-driven replacement for WeekdayStrip on the athlete training
// log screen specifically. Unlike WeekdayStrip (which only shows the 7 days
// of whichever week is currently "active"), this spans every week of the
// deployed block and is keyed on real calendar dates, not day-of-week
// labels or completion status. Deliberately does NOT call out "missed" days
// differently from ordinary future ones — see the mockup discussion: a day
// that's merely scheduled shouldn't look different just because its date
// has passed, since the whole point is that past days stay just as
// reachable as any other.
//
// 2026-10-06 redesign: this used to be a horizontally-scrollable strip
// spanning every week at once, with the ‹ › arrows trying to scroll a full
// week over. That turned into three rounds of chasing scroll bugs — an
// edge-fade overlay visually clipping Monday, a dueling effect that
// silently re-centered and undid the arrow's own scroll on every click,
// and (even after fixing both of those) CSS scroll-snap potentially still
// pulling the rest position away from Monday. Chris's own suggestion fixed
// all of it at the root: following MyStrengthBook's pattern, show exactly
// ONE week at a time as a fixed, non-scrolling 7-day grid, and have the ‹ ›
// arrows change WHICH week is displayed (a plain state change) rather than
// animate a scroll position. There is no scrolling left to get wrong.
export default function CalendarStrip({
  slots,
  selectedDate,
  onSelect,
}: {
  slots: CalendarSlot[];
  selectedDate: Date | null;
  onSelect: (slot: CalendarSlot) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // slots is always exactly 7 per week, Monday first (see TrainingLog.tsx's
  // calendarSlots builder), so the week containing selectedDate is just
  // Math.floor(its index / 7) - and slicing that same window out gives the
  // fixed 7 days to render, with no concept of "scroll position" at all.
  const idx0 = selectedDate ? slots.findIndex((s) => s.date.getTime() === selectedDate.getTime()) : -1;
  const curWeek = idx0 >= 0 ? Math.floor(idx0 / 7) : 0;
  const maxWeek = slots.length > 0 ? Math.floor((slots.length - 1) / 7) : 0;
  const weekSlots = slots.slice(curWeek * 7, curWeek * 7 + 7);

  const monthLabel = weekSlots.length > 0
    ? weekSlots[0].date.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "";

  const goToWeek = (delta: number) => {
    const targetWeek = Math.min(Math.max(curWeek + delta, 0), maxWeek);
    const targetSlot = slots[targetWeek * 7]; // that week's Monday
    if (targetSlot) onSelect(targetSlot);
  };

  return (
    <div className="log-cal-section">
      <div className="log-cal-month-row">
        <button type="button" disabled={curWeek <= 0} onClick={() => goToWeek(-1)}>
          ‹
        </button>
        <span className="log-cal-month-label">{monthLabel}</span>
        <button type="button" disabled={curWeek >= maxWeek} onClick={() => goToWeek(1)}>
          ›
        </button>
      </div>
      <div className="log-cal-strip">
        {weekSlots.map((s, idx) => {
          const isToday = s.date.getTime() === today.getTime();
          const isSelected = !!selectedDate && s.date.getTime() === selectedDate.getTime();
          const isDone = !!s.day?.completed_at;
          const cls =
            "log-cal-day" +
            (s.day ? "" : " rest") +
            (isDone ? " done" : "") +
            (isToday ? " today" : "") +
            (isSelected ? " selected" : "");
          return (
            <button key={idx} type="button" className={cls} onClick={() => onSelect(s)}>
              <span className="wd">{WEEKDAY_LABELS[s.wd]}</span>
              <span className="num">{isDone ? "✓" : s.day ? String(s.date.getDate()) : "–"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
