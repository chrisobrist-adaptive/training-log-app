import type { TrainingDay } from "../lib/types";

const WEEKDAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

// Mon-Sun calendar strip: one circle per weekday, in Monday-first order. A
// weekday with a training day assigned to it (day.weekday === that index)
// is clickable and shows either a checkmark (session completed) or its
// initial; a weekday with nothing assigned renders as a dim, unclickable
// "rest day" circle instead of being left out, so the week's shape (e.g. a
// 4-day Mon/Wed/Fri/Sat plan) reads at a glance. The currently open day gets
// a highlighted fill regardless of its completion state.
export default function WeekdayStrip({
  days,
  selectedDayId,
  onSelect,
}: {
  days: TrainingDay[];
  selectedDayId: string | null;
  onSelect: (dayId: string) => void;
}) {
  const byWeekday = new Map<number, TrainingDay>();
  for (const d of days) {
    if (d.weekday != null) byWeekday.set(d.weekday, d);
  }

  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.35rem" }}>
      {WEEKDAY_LABELS.map((label, weekday) => {
        const day = byWeekday.get(weekday);
        const isSelected = !!day && day.id === selectedDayId;
        const isCompleted = !!day?.completed_at;
        return (
          <button
            key={weekday}
            type="button"
            disabled={!day}
            onClick={() => day && onSelect(day.id)}
            title={day ? day.day_label : "Rest day"}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.35rem",
              background: "none",
              border: "none",
              padding: "0.15rem 0",
              cursor: day ? "pointer" : "default",
            }}
          >
            <span
              style={{
                fontSize: "0.64rem",
                color: "var(--muted)",
                fontWeight: 800,
                letterSpacing: "0.03em",
              }}
            >
              {label}
            </span>
            <span
              style={{
                width: "2.55rem",
                height: "2.55rem",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.85rem",
                fontWeight: 800,
                background: isCompleted
                  ? "rgba(62, 207, 126, 0.14)"
                  : isSelected
                    ? "var(--accent-fill)"
                    : day
                      ? "var(--surface-2)"
                      : "transparent",
                border: isCompleted
                  ? "1px solid rgba(62, 207, 126, 0.4)"
                  : isSelected
                    ? "1px solid var(--accent-border)"
                    : day
                      ? "1px solid var(--border)"
                      : "1px dashed var(--border)",
                color: isCompleted ? "var(--good)" : isSelected ? "var(--accent)" : day ? "var(--text)" : "var(--muted)",
                opacity: day ? 1 : 0.55,
              }}
            >
              {isCompleted ? "✓" : day ? label[0] : "–"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
