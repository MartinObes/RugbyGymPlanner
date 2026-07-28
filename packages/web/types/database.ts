export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      block_exercises: {
        Row: {
          block_id: string
          exercise_id: string
          id: string
          load_type: string
          order_index: number
          percentage: number | null
          reps: string | null
          sets: number | null
          target_rpe: number | null
          weight: number | null
        }
        Insert: {
          block_id: string
          exercise_id: string
          id?: string
          load_type: string
          order_index?: number
          percentage?: number | null
          reps?: string | null
          sets?: number | null
          target_rpe?: number | null
          weight?: number | null
        }
        Update: {
          block_id?: string
          exercise_id?: string
          id?: string
          load_type?: string
          order_index?: number
          percentage?: number | null
          reps?: string | null
          sets?: number | null
          target_rpe?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "block_exercises_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          day_id: string
          id: string
          order_index: number
          rounds: number | null
          type: string | null
        }
        Insert: {
          day_id: string
          id?: string
          order_index?: number
          rounds?: number | null
          type?: string | null
        }
        Update: {
          day_id?: string
          id?: string
          order_index?: number
          rounds?: number | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "days"
            referencedColumns: ["id"]
          },
        ]
      }
      days: {
        Row: {
          id: string
          name: string
          order_index: number
          week_id: string
        }
        Insert: {
          id?: string
          name: string
          order_index?: number
          week_id: string
        }
        Update: {
          id?: string
          name?: string
          order_index?: number
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "days_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          kg: number
          player_id: string
          tested_on: string
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          kg: number
          player_id: string
          tested_on?: string
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          kg?: number
          player_id?: string
          tested_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_entries: {
        Row: {
          block_exercise_id: string
          id: string
          reps: number | null
          rpe: number | null
          session_log_id: string
          weight: number | null
        }
        Insert: {
          block_exercise_id: string
          id?: string
          reps?: number | null
          rpe?: number | null
          session_log_id: string
          weight?: number | null
        }
        Update: {
          block_exercise_id?: string
          id?: string
          reps?: number | null
          rpe?: number | null
          session_log_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_entries_block_exercise_id_fkey"
            columns: ["block_exercise_id"]
            isOneToOne: false
            referencedRelation: "block_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_entries_session_log_id_fkey"
            columns: ["session_log_id"]
            isOneToOne: false
            referencedRelation: "session_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          category: string | null
          created_at: string
          id: string
          name: string
          normalized_name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          name: string
          normalized_name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          normalized_name?: string
        }
        Relationships: []
      }
      one_rms: {
        Row: {
          exercise_id: string
          kg: number
          player_id: string
          updated_at: string
        }
        Insert: {
          exercise_id: string
          kg: number
          player_id: string
          updated_at?: string
        }
        Update: {
          exercise_id?: string
          kg?: number
          player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_rms_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "one_rms_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      position_group_positions: {
        Row: {
          group_id: string
          position_id: string
        }
        Insert: {
          group_id: string
          position_id: string
        }
        Update: {
          group_id?: string
          position_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_group_positions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "position_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      position_groups: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_groups_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          coach_id: string | null
          created_at: string
          email: string
          height_cm: number | null
          id: string
          invite_code: string | null
          name: string
          position_id: string | null
          role: string
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          email: string
          height_cm?: number | null
          id: string
          invite_code?: string | null
          name: string
          position_id?: string | null
          role: string
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          email?: string
          height_cm?: number | null
          id?: string
          invite_code?: string | null
          name?: string
          position_id?: string | null
          role?: string
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      program_assignments: {
        Row: {
          created_at: string
          id: string
          player_id: string | null
          position_group_id: string | null
          position_id: string | null
          priority: number
          program_id: string
          system_group_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          player_id?: string | null
          position_group_id?: string | null
          position_id?: string | null
          priority?: number
          program_id: string
          system_group_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string | null
          position_group_id?: string | null
          position_id?: string | null
          priority?: number
          program_id?: string
          system_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_assignments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_assignments_position_group_id_fkey"
            columns: ["position_group_id"]
            isOneToOne: false
            referencedRelation: "position_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          coach_id: string
          created_at: string
          current_week_id: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          current_week_id?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          current_week_id?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_current_week_fk"
            columns: ["current_week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      session_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          day_id: string
          id: string
          note: string | null
          player_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          day_id: string
          id?: string
          note?: string | null
          player_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          day_id?: string
          id?: string
          note?: string | null
          player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_logs_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_logs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weeks: {
        Row: {
          created_at: string
          id: string
          name: string
          order_index: number
          program_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order_index?: number
          program_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order_index?: number
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weeks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_read_program: { Args: { target: string }; Returns: boolean }
      can_write_program: { Args: { target: string }; Returns: boolean }
      generate_invite_code: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_my_player: { Args: { target: string }; Returns: boolean }
      my_coach_id: { Args: never; Returns: string }
      my_position_id: { Args: never; Returns: unknown }
      my_system_group_id: { Args: never; Returns: unknown }
      owns_program: { Args: { target: string }; Returns: boolean }
      program_reaches_me: { Args: { target: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
