export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          naam: string
          geboortedatum: string | null
          km_per_week: number | null
          runs_per_week: number | null
          created_at: string
          updated_at: string
          runkeeper_token: string | null
          push_subscription: Json | null
          physio_klacht: string | null
          wil_core: boolean
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      goals: {
        Row: {
          id: string
          user_id: string
          type: 'marathon' | 'halve_marathon' | 'triathlon_heel' | 'triathlon_half' | 'anders'
          naam: string
          datum: string
          tijdsdoel: string | null
          actief: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['goals']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['goals']['Insert']>
      }
      previous_results: {
        Row: {
          id: string
          user_id: string
          type: 'marathon' | 'halve_marathon' | 'triathlon_heel' | 'triathlon_half' | 'anders'
          datum: string
          tijd: string
          notitie: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['previous_results']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['previous_results']['Insert']>
      }
      vacations: {
        Row: {
          id: string
          user_id: string
          naam: string
          start_datum: string
          eind_datum: string
          kan_trainen: 'ja' | 'nee' | 'beperkt'
          notitie: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['vacations']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['vacations']['Insert']>
      }
      training_sessions: {
        Row: {
          id: string
          user_id: string
          goal_id: string | null
          datum: string
          type: 'hardlopen' | 'rust' | 'krachttraining' | 'cross'
          beschrijving: string
          duur_minuten: number | null
          afstand_km: number | null
          intensiteit: 'herstel' | 'makkelijk' | 'gemiddeld' | 'zwaar' | 'interval'
          voltooid: boolean
          overgeslagen: boolean
          runkeeper_id: string | null
          volgorde: number
          week_nummer: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['training_sessions']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['training_sessions']['Insert']>
      }
      session_feedback: {
        Row: {
          id: string
          session_id: string
          user_id: string
          rating: 'te_zwaar' | 'zwaar' | 'goed' | 'beter_dan_verwacht' | 'topdag'
          notitie: string | null
          hartslag_gem: number | null
          hartslag_max: number | null
          werkelijke_duur: number | null
          werkelijke_afstand: number | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['session_feedback']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['session_feedback']['Insert']>
      }
      physio_exercises: {
        Row: {
          id: string
          user_id: string
          naam: string
          beschrijving: string | null
          sets: number | null
          reps: number | null
          duur_seconden: number | null
          video_url: string | null
          video_start_seconden: number | null
          actief: boolean
          categorie: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['physio_exercises']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['physio_exercises']['Insert']>
      }
      physio_sessions: {
        Row: {
          id: string
          user_id: string
          datum: string
          voltooid: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['physio_sessions']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['physio_sessions']['Insert']>
      }
      physio_feedback: {
        Row: {
          id: string
          physio_session_id: string
          exercise_id: string
          user_id: string
          pijn_score: 0 | 1 | 2
          notitie: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['physio_feedback']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['physio_feedback']['Insert']>
      }
      recurring_activities: {
        Row: {
          id: string
          user_id: string
          naam: string
          dag_van_week: number
          tijdstip: 'ochtend' | 'middag' | 'avond' | null
          blokkeert_hardlopen: boolean
          blokkeert_fysio: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['recurring_activities']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['recurring_activities']['Insert']>
      }
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Goal = Database['public']['Tables']['goals']['Row']
export type PreviousResult = Database['public']['Tables']['previous_results']['Row']
export type Vacation = Database['public']['Tables']['vacations']['Row']
export type TrainingSession = Database['public']['Tables']['training_sessions']['Row']
export type SessionFeedback = Database['public']['Tables']['session_feedback']['Row']
export type PhysioExercise = Database['public']['Tables']['physio_exercises']['Row']
export type PhysioSession = Database['public']['Tables']['physio_sessions']['Row']
export type PhysioFeedback = Database['public']['Tables']['physio_feedback']['Row']
export type RecurringActivity = Database['public']['Tables']['recurring_activities']['Row']
