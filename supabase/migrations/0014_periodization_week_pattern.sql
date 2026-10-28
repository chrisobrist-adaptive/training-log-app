-- Typed week pattern for an annual-plan block, e.g. "001234T": one character
-- per week, shown as that week's microcycle label (0 = deload, T = taper,
-- numbers = training weeks). When set, the block's length is the pattern's
-- length (num_weeks is kept in sync); when null, the older num_weeks +
-- deload_last_week behaviour applies. Existing RLS policies cover it.

alter table public.periodization_blocks add column week_pattern text;
