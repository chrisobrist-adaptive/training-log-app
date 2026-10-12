// Reconstructed 2026-10-11 from the live production bundle
// (dist-fix4/assets/index-1dbc1082.js), minified identifiers `_l`/`vl`,
// found at byte offset 459228 — confirmed the real app-code definitions,
// not the React-internal reconciliation functions that reuse the same
// short minified names elsewhere in the bundle (this pair sits right
// before `yl`, the interactive week-summary table component, and is
// used by both that component and `fK`/PlannedMetricsTable below).
//
//   function _l(e,t=1){return e==null?`—`:e.toFixed(t)}
//   function vl(e){return e==null?``:e>0?`flag-up`:e<0?`flag-down`:``}

// Formats a metric value for display: an em dash when there's nothing
// to show (no logged/planned data yet for that lift this week), else
// fixed to `decimals` places (defaults to 1, matching every call site
// except volume/sets/acwr which pass their own).
export function formatMetric(value: number | null | undefined, decimals = 1): string {
  return value == null ? "—" : value.toFixed(decimals);
}

// CSS class for a week-over-week percent-change figure: "flag-up" /
// "flag-down" color the +/- delta text, no class when flat or absent.
export function pctChangeClass(value: number | null | undefined): string {
  return value == null ? "" : value > 0 ? "flag-up" : value < 0 ? "flag-down" : "";
}
