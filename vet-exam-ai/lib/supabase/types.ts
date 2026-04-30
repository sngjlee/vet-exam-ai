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
          role: Database["public"]["Enums"]["user_role"];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };

      questions: {
        Row: {
          id: string;           // text — matches bank.ts ids ("q1", "q2" …)
          public_id: string;    // KVLE-0001 — copyright-safe display id (assigned by trigger)
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
          session: number | null;          // 1~4 교시 (internal, never displayed)
          round: number | null;            // 국시 회차 (internal, never displayed; year = round + 1956)
          community_notes: string | null;  // vet40 댓글 — 수험생 팁
          tags: string[] | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          public_id?: string;   // optional — trigger auto-assigns when omitted
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
          public_id?: string;
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

      // ─────────────────────────────────────────────────────────────────────
      // Community tables — mirrors supabase/migrations/20260425000000-3.
      // Counter columns (vote_score, upvote_count, etc.) are maintained by
      // database triggers; treat them as read-only from the app layer.
      // ─────────────────────────────────────────────────────────────────────

      user_profiles_public: {
        Row: {
          user_id: string;
          nickname: string;
          bio: string | null;
          target_round: number | null;
          university: string | null;
          target_round_visible: boolean;
          university_visible: boolean;
          nickname_changed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          nickname: string;
          bio?: string | null;
          target_round?: number | null;
          university?: string | null;
          target_round_visible?: boolean;
          university_visible?: boolean;
          nickname_changed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          nickname?: string;
          bio?: string | null;
          target_round?: number | null;
          university?: string | null;
          target_round_visible?: boolean;
          university_visible?: boolean;
          nickname_changed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      badges: {
        Row: {
          id: string;
          user_id: string;
          badge_type: Database["public"]["Enums"]["badge_type"];
          awarded_at: string;
          reason: string | null;
          awarded_by: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          badge_type: Database["public"]["Enums"]["badge_type"];
          awarded_at?: string;
          reason?: string | null;
          awarded_by?: string | null;
        };
        Update: {
          // badges are append-only; no Update fields exposed
        };
        Relationships: [];
      };

      comments: {
        Row: {
          id: string;
          question_id: string;
          user_id: string | null;
          parent_id: string | null;
          type: Database["public"]["Enums"]["comment_type"];
          body_text: string;
          body_html: string;
          image_urls: string[];
          status: Database["public"]["Enums"]["comment_status"];
          vote_score: number;
          upvote_count: number;
          downvote_count: number;
          report_count: number;
          reply_count: number;
          blinded_until: string | null;
          is_anonymized: boolean;
          created_at: string;
          updated_at: string;
          edit_count: number;
        };
        Insert: {
          id?: string;
          question_id: string;
          user_id?: string | null;
          parent_id?: string | null;
          type: Database["public"]["Enums"]["comment_type"];
          body_text: string;
          body_html: string;
          image_urls?: string[];
          status?: Database["public"]["Enums"]["comment_status"];
          vote_score?: number;
          upvote_count?: number;
          downvote_count?: number;
          report_count?: number;
          reply_count?: number;
          blinded_until?: string | null;
          is_anonymized?: boolean;
          created_at?: string;
          updated_at?: string;
          edit_count?: number;
        };
        Update: {
          body_text?: string;
          body_html?: string;
          image_urls?: string[];
          status?: Database["public"]["Enums"]["comment_status"];
          blinded_until?: string | null;
          is_anonymized?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };

      comment_votes: {
        Row: {
          comment_id: string;
          user_id: string;
          value: 1 | -1;
          created_at: string;
        };
        Insert: {
          comment_id: string;
          user_id: string;
          value: 1 | -1;
          created_at?: string;
        };
        Update: {
          value?: 1 | -1;
        };
        Relationships: [];
      };

      comment_reports: {
        Row: {
          id: string;
          comment_id: string;
          reporter_id: string | null;
          reason: Database["public"]["Enums"]["report_reason"];
          description: string | null;
          status: Database["public"]["Enums"]["report_status"];
          resolved_by: string | null;
          resolved_at: string | null;
          resolution_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          comment_id: string;
          reporter_id?: string | null;
          reason: Database["public"]["Enums"]["report_reason"];
          description?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          resolved_by?: string | null;
          resolved_at?: string | null;
          resolution_note?: string | null;
          created_at?: string;
        };
        Update: {
          status?: Database["public"]["Enums"]["report_status"];
          resolved_by?: string | null;
          resolved_at?: string | null;
          resolution_note?: string | null;
        };
        Relationships: [];
      };

      comment_pins: {
        Row: {
          id: string;
          user_id: string;
          question_id: string;
          comment_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          question_id: string;
          comment_id: string;
          created_at?: string;
        };
        Update: {
          comment_id?: string;
        };
        Relationships: [];
      };

      comment_edit_history: {
        Row: {
          id: string;
          comment_id: string;
          body_text: string;
          body_html: string;
          image_urls: string[];
          edited_at: string;
        };
        Insert: {
          id?: string;
          comment_id: string;
          body_text: string;
          body_html: string;
          image_urls?: string[];
          edited_at?: string;
        };
        Update: {
          // edit history is immutable
        };
        Relationships: [];
      };

      comment_image_upload_log: {
        Row: {
          id: number;
          user_id: string;
          created_at: string;
          storage_path: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          created_at?: string;
          storage_path: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          created_at?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comment_image_upload_log_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };

      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: Database["public"]["Enums"]["notification_type"];
          payload: Record<string, unknown>;
          actor_id: string | null;
          related_comment_id: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: Database["public"]["Enums"]["notification_type"];
          payload?: Record<string, unknown>;
          actor_id?: string | null;
          related_comment_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          read_at?: string | null;
        };
        Relationships: [];
      };

      question_corrections: {
        Row: {
          id: string;
          question_id: string;
          proposed_by: string | null;
          proposed_change: Record<string, unknown>;
          status: Database["public"]["Enums"]["correction_status"];
          resolved_by: string | null;
          resolved_at: string | null;
          resolution_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          question_id: string;
          proposed_by?: string | null;
          proposed_change: Record<string, unknown>;
          status?: Database["public"]["Enums"]["correction_status"];
          resolved_by?: string | null;
          resolved_at?: string | null;
          resolution_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: Database["public"]["Enums"]["correction_status"];
          resolved_by?: string | null;
          resolved_at?: string | null;
          resolution_note?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      admin_audit_logs: {
        Row: {
          id: string;
          admin_id: string | null;
          action: Database["public"]["Enums"]["audit_action"];
          target_type: string;
          target_id: string;
          before_state: Record<string, unknown> | null;
          after_state: Record<string, unknown> | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id?: string | null;
          action: Database["public"]["Enums"]["audit_action"];
          target_type: string;
          target_id: string;
          before_state?: Record<string, unknown> | null;
          after_state?: Record<string, unknown> | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          // audit rows are insert-only
        };
        Relationships: [];
      };
    };

    Views: Record<string, never>;
    Functions: {
      is_temp_nickname: {
        Args: { n: string };
        Returns: boolean;
      };
      get_user_total_vote_score: {
        Args: { uid: string };
        Returns: number;
      };
      count_questions_distinct: {
        Args: { col: string };
        Returns: number;
      };
      get_questions_filter_options: {
        Args: Record<string, never>;
        Returns: {
          rounds: number[];
          years: number[];
          sessions: number[];
          subjects: string[];
          categories: string[];
        };
      };
      log_admin_action: {
        Args: {
          p_action:      Database["public"]["Enums"]["audit_action"];
          p_target_type: string;
          p_target_id:   string;
          p_before?:     Record<string, unknown> | null;
          p_after?:      Record<string, unknown> | null;
          p_note?:       string | null;
        };
        Returns: string;
      };
      resolve_comment_report: {
        Args: {
          p_comment_id: string;
          p_resolution: string;
          p_note?:      string | null;
        };
        Returns: number;
      };
      resolve_question_correction: {
        Args: {
          p_correction_id: string;
          p_resolution:    string;
          p_note?:         string | null;
        };
        Returns: boolean;
      };
      set_user_role: {
        Args: {
          p_user_id:  string;
          p_new_role: Database["public"]["Enums"]["user_role"];
          p_note?:    string | null;
        };
        Returns: void;
      };
      set_user_active: {
        Args: {
          p_user_id:    string;
          p_new_active: boolean;
          p_note?:      string | null;
        };
        Returns: void;
      };
      grant_badge: {
        Args: {
          p_user_id:    string;
          p_badge_type: Database["public"]["Enums"]["badge_type"];
          p_reason?:    string | null;
        };
        Returns: void;
      };
      revoke_badge: {
        Args: {
          p_user_id:    string;
          p_badge_type: Database["public"]["Enums"]["badge_type"];
          p_note?:      string | null;
        };
        Returns: void;
      };
      list_admin_user_emails: {
        Args: { p_user_ids: string[] };
        Returns: { user_id: string; email: string }[];
      };
      log_password_reset_issued: {
        Args: {
          p_user_id: string;
          p_note?:   string | null;
        };
        Returns: void;
      };
      search_questions: {
        Args: {
          q:               string;
          category_filter?: string | null;
          recent_years?:    number | null;
          page_size?:       number;
          page_offset?:     number;
        };
        Returns: {
          id:          string;
          public_id:   string;
          question:    string;
          category:    string;
          year:        number | null;
          is_active:   boolean;
          matched_in:  "question" | "explanation" | "choices" | "community_notes";
          headline:    string;
          rank:        number;
          total_count: number;
        }[];
      };
      suggest_similar_queries: {
        Args: { q: string };
        Returns: {
          suggestion: string;
          similarity: number;
        }[];
      };
    };
    Enums: {
      difficulty_level: "easy" | "medium" | "hard";
      question_source: "manual" | "past_exam" | "ai_generated";
      user_role: "user" | "reviewer" | "admin";
      badge_type:
        | "operator"
        | "reviewer"
        | "newbie"
        | "first_contrib"
        | "popular_comment";
      comment_type:
        | "memorization"
        | "correction"
        | "explanation"
        | "question"
        | "discussion";
      comment_status:
        | "visible"
        | "hidden_by_author"
        | "hidden_by_votes"
        | "blinded_by_report"
        | "removed_by_admin";
      report_reason:
        | "spam"
        | "misinformation"
        | "privacy"
        | "hate_speech"
        | "advertising"
        | "copyright"
        | "defamation"
        | "other";
      report_status: "pending" | "reviewing" | "upheld" | "dismissed";
      notification_type:
        | "reply"
        | "vote_milestone"
        | "mention"
        | "report_resolved"
        | "comment_blinded"
        | "correction_resolved";
      correction_status: "proposed" | "reviewing" | "accepted" | "rejected";
      audit_action:
        | "comment_remove"
        | "comment_unblind"
        | "user_suspend"
        | "user_unsuspend"
        | "badge_grant"
        | "badge_revoke"
        | "correction_accept"
        | "correction_reject"
        | "report_uphold"
        | "report_dismiss"
        | "role_change"
        | "question_update"
        | "password_reset_issued";
    };
  };
}

// Convenience row types — import these instead of reaching into Database directly.
export type ProfileRow             = Database["public"]["Tables"]["profiles"]["Row"];
export type QuestionRow            = Database["public"]["Tables"]["questions"]["Row"];
export type AttemptRow             = Database["public"]["Tables"]["attempts"]["Row"];
export type WrongNoteRow           = Database["public"]["Tables"]["wrong_notes"]["Row"];
export type UserProfilePublicRow   = Database["public"]["Tables"]["user_profiles_public"]["Row"];
export type BadgeRow               = Database["public"]["Tables"]["badges"]["Row"];
export type CommentRow             = Database["public"]["Tables"]["comments"]["Row"];
export type CommentVoteRow         = Database["public"]["Tables"]["comment_votes"]["Row"];
export type CommentReportRow       = Database["public"]["Tables"]["comment_reports"]["Row"];
export type CommentPinRow          = Database["public"]["Tables"]["comment_pins"]["Row"];
export type CommentEditHistoryRow  = Database["public"]["Tables"]["comment_edit_history"]["Row"];
export type NotificationRow        = Database["public"]["Tables"]["notifications"]["Row"];
export type QuestionCorrectionRow  = Database["public"]["Tables"]["question_corrections"]["Row"];
export type AdminAuditLogRow       = Database["public"]["Tables"]["admin_audit_logs"]["Row"];
