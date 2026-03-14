// Hand-written Database type matching the planned SQL schema.
// Replace this file with the output of `supabase gen types typescript` once
// the Supabase project is created and the schema is applied.

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
          tags?: string[] | null;
          is_active?: boolean;
        };
      };

      attempts: {
        Row: {
          id: string;           // uuid
          user_id: string;      // uuid — references profiles.id
          session_id: string;   // uuid — client-generated per quiz session
          question_id: string;  // references questions.id
          selected_answer: string;
          is_correct: boolean;
          answered_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          question_id: string;
          selected_answer: string;
          is_correct: boolean;
          answered_at?: string;
        };
        Update: never;          // attempts are immutable
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
        };
        Update: {
          selected_answer?: string;
          saved_at?: string;
        };
      };
    };

    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Convenience row types — import these instead of reaching into Database directly.
export type ProfileRow    = Database["public"]["Tables"]["profiles"]["Row"];
export type QuestionRow   = Database["public"]["Tables"]["questions"]["Row"];
export type AttemptRow    = Database["public"]["Tables"]["attempts"]["Row"];
export type WrongNoteRow  = Database["public"]["Tables"]["wrong_notes"]["Row"];
