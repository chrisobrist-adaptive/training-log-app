// Generated directly from the live Supabase project (qgrrcjkemlchcvybkpwz) via
// `mcp__Supabase__generate_typescript_types` on 2026-10-11. This is the raw,
// authoritative schema — regenerate this file (don't hand-edit it) whenever
// the schema changes. App-level, hand-written types that components actually
// import (Block, Week, TrainingDay, Exercise, LoggedSet, Profile, ...) live
// in ./types.ts and are derived from the Row shapes here.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      blocks: {
        Row: {
          athlete_id: string
          created_at: string
          deployed_at: string | null
          id: string
          name: string
          order_index: number
          status: string
          type: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          deployed_at?: string | null
          id?: string
          name: string
          order_index?: number
          status?: string
          type?: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          deployed_at?: string | null
          id?: string
          name?: string
          order_index?: number
          status?: string
          type?: string
        }
      }
      exercise_inventory: {
        Row: {
          category: string | null
          coach_id: string
          created_at: string
          exercise_name: string
          id: string
          lift: string
          rpe_based_e1rm: boolean
        }
        Insert: {
          category?: string | null
          coach_id: string
          created_at?: string
          exercise_name: string
          id?: string
          lift: string
          rpe_based_e1rm?: boolean
        }
        Update: {
          category?: string | null
          coach_id?: string
          created_at?: string
          exercise_name?: string
          id?: string
          lift?: string
          rpe_based_e1rm?: boolean
        }
      }
      exercises: {
        Row: {
          actual_load: number | null
          actual_reps: number | null
          actual_rir: number | null
          actual_rpe: number | null
          actual_sets: number | null
          ascending_sets: Json | null
          backdown_load_fixed: number | null
          backdown_load_pct: number | null
          backdown_reps: string | null
          backdown_rir: number | null
          backdown_rpe: number | null
          coach_cue: string | null
          backdown_sets: number | null
          exercise_inventory_id: string | null
          id: string
          notes: string | null
          order_index: number
          prescribed_load_fixed: number | null
          prescribed_load_pct: number | null
          prescribed_reps: string | null
          prescribed_rir: number | null
          prescribed_rpe: number | null
          prescribed_sets: number | null
          training_day_id: string
        }
        Insert: {
          actual_load?: number | null
          actual_reps?: number | null
          actual_rir?: number | null
          actual_rpe?: number | null
          actual_sets?: number | null
          ascending_sets?: Json | null
          backdown_load_fixed?: number | null
          backdown_load_pct?: number | null
          backdown_reps?: string | null
          backdown_rir?: number | null
          backdown_rpe?: number | null
          coach_cue?: string | null
          backdown_sets?: number | null
          exercise_inventory_id?: string | null
          id?: string
          notes?: string | null
          order_index?: number
          prescribed_load_fixed?: number | null
          prescribed_load_pct?: number | null
          prescribed_reps?: string | null
          prescribed_rir?: number | null
          prescribed_rpe?: number | null
          prescribed_sets?: number | null
          training_day_id: string
        }
        Update: {
          actual_load?: number | null
          actual_reps?: number | null
          actual_rir?: number | null
          actual_rpe?: number | null
          actual_sets?: number | null
          ascending_sets?: Json | null
          backdown_load_fixed?: number | null
          backdown_load_pct?: number | null
          backdown_reps?: string | null
          backdown_rir?: number | null
          backdown_rpe?: number | null
          coach_cue?: string | null
          backdown_sets?: number | null
          exercise_inventory_id?: string | null
          id?: string
          notes?: string | null
          order_index?: number
          prescribed_load_fixed?: number | null
          prescribed_load_pct?: number | null
          prescribed_reps?: string | null
          prescribed_rir?: number | null
          prescribed_rpe?: number | null
          prescribed_sets?: number | null
          training_day_id?: string
        }
      }
      logged_sets: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          reps: number | null
          rpe: number | null
          set_number: number
          status: string | null
          updated_at: string
          velocity_fast: number | null
          velocity_slow: number | null
          weight: number | null
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          reps?: number | null
          rpe?: number | null
          set_number: number
          status?: string | null
          updated_at?: string
          velocity_fast?: number | null
          velocity_slow?: number | null
          weight?: number | null
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          reps?: number | null
          rpe?: number | null
          set_number?: number
          status?: string | null
          updated_at?: string
          velocity_fast?: number | null
          velocity_slow?: number | null
          weight?: number | null
        }
      }
      periodization_blocks: {
        Row: {
          bench_intensity: string | null
          bench_phase: string | null
          created_at: string
          deadlift_intensity: string | null
          deadlift_phase: string | null
          deload_last_week: boolean
          id: string
          macrocycle_id: string
          name: string
          num_weeks: number
          order_index: number
          squat_intensity: string | null
          squat_phase: string | null
        }
        Insert: {
          bench_intensity?: string | null
          bench_phase?: string | null
          created_at?: string
          deadlift_intensity?: string | null
          deadlift_phase?: string | null
          deload_last_week?: boolean
          id?: string
          macrocycle_id: string
          name?: string
          num_weeks?: number
          order_index?: number
          squat_intensity?: string | null
          squat_phase?: string | null
        }
        Update: {
          bench_intensity?: string | null
          bench_phase?: string | null
          created_at?: string
          deadlift_intensity?: string | null
          deadlift_phase?: string | null
          deload_last_week?: boolean
          id?: string
          macrocycle_id?: string
          name?: string
          num_weeks?: number
          order_index?: number
          squat_intensity?: string | null
          squat_phase?: string | null
        }
      }
      periodization_macrocycles: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          meet_date: string
          name: string
          order_index: number
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          meet_date: string
          name?: string
          order_index?: number
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          meet_date?: string
          name?: string
          order_index?: number
        }
      }
      profiles: {
        Row: {
          bench_1rm: number | null
          coach_id: string | null
          created_at: string
          deadlift_1rm: number | null
          email: string
          id: string
          name: string
          role: string
          squat_1rm: number | null
        }
        Insert: {
          bench_1rm?: number | null
          coach_id?: string | null
          created_at?: string
          deadlift_1rm?: number | null
          email: string
          id: string
          name: string
          role: string
          squat_1rm?: number | null
        }
        Update: {
          bench_1rm?: number | null
          coach_id?: string | null
          created_at?: string
          deadlift_1rm?: number | null
          email?: string
          id?: string
          name?: string
          role?: string
          squat_1rm?: number | null
        }
      }
      training_days: {
        Row: {
          completed_at: string | null
          day_label: string
          id: string
          order_index: number
          week_id: string
          weekday: number | null
        }
        Insert: {
          completed_at?: string | null
          day_label: string
          id?: string
          order_index?: number
          week_id: string
          weekday?: number | null
        }
        Update: {
          completed_at?: string | null
          day_label?: string
          id?: string
          order_index?: number
          week_id?: string
          weekday?: number | null
        }
      }
      weekly_metrics: {
        Row: {
          acwr: number | null
          ari: number | null
          central: number | null
          e1rm: number | null
          e1rm_pct_change: number | null
          exertion_load: number | null
          id: string
          lift: string
          monotony: number | null
          peak_intensity: number | null
          peripheral: number | null
          sets: number | null
          updated_at: string
          volume: number | null
          volume_pct_change: number | null
          week_id: string
        }
        Insert: {
          acwr?: number | null
          ari?: number | null
          central?: number | null
          e1rm?: number | null
          e1rm_pct_change?: number | null
          exertion_load?: number | null
          id?: string
          lift: string
          monotony?: number | null
          peak_intensity?: number | null
          peripheral?: number | null
          sets?: number | null
          updated_at?: string
          volume?: number | null
          volume_pct_change?: number | null
          week_id: string
        }
        Update: {
          acwr?: number | null
          ari?: number | null
          central?: number | null
          e1rm?: number | null
          e1rm_pct_change?: number | null
          exertion_load?: number | null
          id?: string
          lift?: string
          monotony?: number | null
          peak_intensity?: number | null
          peripheral?: number | null
          sets?: number | null
          updated_at?: string
          volume?: number | null
          volume_pct_change?: number | null
          week_id?: string
        }
      }
      weeks: {
        Row: {
          bench_1rm: number | null
          block_id: string
          deadlift_1rm: number | null
          id: string
          squat_1rm: number | null
          status: string
          week_number: number
        }
        Insert: {
          bench_1rm?: number | null
          block_id: string
          deadlift_1rm?: number | null
          id?: string
          squat_1rm?: number | null
          status?: string
          week_number: number
        }
        Update: {
          bench_1rm?: number | null
          block_id?: string
          deadlift_1rm?: number | null
          id?: string
          squat_1rm?: number | null
          status?: string
          week_number?: number
        }
      }
    }
    Views: {
      week_effective_1rm: {
        Row: {
          athlete_id: string | null
          bench_1rm: number | null
          deadlift_1rm: number | null
          squat_1rm: number | null
          week_id: string | null
        }
      }
    }
    Functions: {
      exertion_xl: { Args: { p_reps: number; p_rir: number }; Returns: number }
      get_planned_week_metrics: {
        Args: { p_athlete_id: string }
        Returns: {
          acwr: number
          ari: number
          central: number
          e1rm: number
          e1rm_pct_change: number
          exertion_load: number
          lift: string
          monotony: number
          peak_intensity: number
          peripheral: number
          sets: number
          volume: number
          volume_pct_change: number
          week_id: string
        }[]
      }
      is_coach: { Args: never; Returns: boolean }
      recalc_week_metrics: { Args: { p_week_id: string }; Returns: undefined }
      recalc_week_metrics_cascade: {
        Args: { p_week_id: string }
        Returns: undefined
      }
      renumber_athlete_blocks: {
        Args: { p_athlete_id: string }
        Returns: undefined
      }
      renumber_block_weeks: { Args: { p_block_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
