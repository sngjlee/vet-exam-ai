// Database types for the Veterinary Exam AI Supabase schema.
// Kept in sync with supabase/schema.sql and supabase/migrations/.
//
// To regenerate from a live project run:
//   supabase gen types typescript --project-id <id> > lib/supabase/types.ts
//
// NOTE: @supabase/supabase-js ≥ v2.x requires a `Relationships` key on every
// table for its internal type machinery to resolve correctly. Without it,
// upsert/insert/update overloads collapse to `never`.

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;           // uuid — mirrors auth.users.id
          display_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          created_at?: string;
        };
        Update: {
          display_name?: string | null;
        };
        Relationships: [];
      };

      questions: {
        Row: {
          id: string;           // text — matches bank.ts ids ("q1", "q2" …)
          question: string;
          choices: string[];
          answer: string;
          explanation: string;
          category: string;
          subject: string | null;
          topic: string | null;
          difficulty: "easy" | "medium" | "hard" | null;
          source: "manual" | "past_exam" | "ai_generated" | null;
          year: number | null;
          session: number | null;          // 1~4 교시
          round: number | null;            // 국시 회차 (year = round + 1956)
          community_notes: string | null;  // vet40 댓글 — 수험생 팁
          tags: string[] | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          question: string;
          choices: string[];
          answer: string;
          explanation: string;
          category: string;
          subject?: string | null;
          topic?: string | null;
          difficulty?: "easy" | "medium" | "hard" | null;
          source?: "manual" | "past_exam" | "ai_generated" | null;
          year?: number | null;
          session?: number | null;
          round?: number | null;
          community_notes?: string | null;
          tags?: string[] | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          question?: string;
          choices?: string[];
          answer?: string;
          explanation?: string;
          category?: string;
          subject?: string | null;
          topic?: string | null;
          difficulty?: "easy" | "medium" | "hard" | null;
          source?: "manual" | "past_exam" | "ai_generated" | null;
          year?: number | null;
          session?: number | null;
          round?: number | null;
          community_notes?: string | null;
          tags?: string[] | null;
          is_active?: boolean;
        };
        Relationships: [];
      };

      attempts: {
        Row: {
          id: string;           // uuid
          user_id: string;      // uuid — references profiles.id
          session_id: string;   // uuid — client-generated per quiz session
          question_id: string;
          category: string;
          selected_answer: string;
          correct_answer: string;
          is_correct: boolean;
          answered_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          question_id: string;
          category: string;
          selected_answer: string;
          correct_answer: string;
          is_correct: boolean;
          answered_at?: string;
        };
        Update: {
          // attempts are immutable — no fields may be updated
        };
        Relationships: [];
      };

      wrong_notes: {
        Row: {
          id: string;           // uuid
          user_id: string;      // uuid — references profiles.id
          question_id: string;  // references questions.id
          question_text: string;
          category: string;
          choices: string[];
          correct_answer: string;
          selected_answer: string;
          explanation: string;
          saved_at: string;
          review_count: number;
          last_reviewed_at: string | null;
          next_review_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          question_id: string;
          question_text: string;
          category: string;
          choices: string[];
          correct_answer: string;
          selected_answer: string;
          explanation: string;
          saved_at?: string;
          review_count?: number;
          last_reviewed_at?: string | null;
          next_review_at?: string;
        };
        Update: {
          selected_answer?: string;
          saved_at?: string;
          review_count?: number;
          last_reviewed_at?: string | null;
          next_review_at?: string;
        };
        Relationships: [];
      };
    };

    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      difficulty_level: "easy" | "medium" | "hard";
      question_source: "manual" | "past_exam" | "ai_generated";
    };
  };
}

// Convenience row types — import these instead of reaching into Database directly.
export type ProfileRow    = Database["public"]["Tables"]["profiles"]["Row"];
export type QuestionRow   = Database["public"]["Tables"]["questions"]["Row"];
export type AttemptRow    = Database["public"]["Tables"]["attempts"]["Row"];
export type WrongNoteRow  = Database["public"]["Tables"]["wrong_notes"]["Row"];
