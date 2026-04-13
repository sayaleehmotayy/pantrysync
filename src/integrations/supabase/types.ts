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
      activity_log: {
        Row: {
          action: string
          created_at: string
          details: string | null
          household_id: string
          id: string
          item_name: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          household_id: string
          id?: string
          item_name?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          household_id?: string
          id?: string
          item_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          household_id: string
          id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          household_id: string
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          household_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_read_receipts: {
        Row: {
          household_id: string
          id: string
          last_read_at: string
          last_read_message_id: string
          user_id: string
        }
        Insert: {
          household_id: string
          id?: string
          last_read_at?: string
          last_read_message_id: string
          user_id: string
        }
        Update: {
          household_id?: string
          id?: string
          last_read_at?: string
          last_read_message_id?: string
          user_id?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      discount_codes: {
        Row: {
          added_by: string
          code: string
          created_at: string
          description: string | null
          expiry_date: string | null
          household_id: string
          id: string
          receipt_image_url: string | null
          store_name: string
          updated_at: string
        }
        Insert: {
          added_by: string
          code: string
          created_at?: string
          description?: string | null
          expiry_date?: string | null
          household_id: string
          id?: string
          receipt_image_url?: string | null
          store_name: string
          updated_at?: string
        }
        Update: {
          added_by?: string
          code?: string
          created_at?: string
          description?: string | null
          expiry_date?: string | null
          household_id?: string
          id?: string
          receipt_image_url?: string | null
          store_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      household_members: {
        Row: {
          household_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          household_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          household_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string
          id: string
          invite_code: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          invite_code?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          invite_code?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          added_by: string | null
          category: string
          created_at: string
          expiry_date: string | null
          household_id: string
          id: string
          min_threshold: number | null
          name: string
          quantity: number
          storage_location: string
          unit: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          category?: string
          created_at?: string
          expiry_date?: string | null
          household_id: string
          id?: string
          min_threshold?: number | null
          name: string
          quantity?: number
          storage_location?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          category?: string
          created_at?: string
          expiry_date?: string | null
          household_id?: string
          id?: string
          min_threshold?: number | null
          name?: string
          quantity?: number
          storage_location?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          chat_message_id: string | null
          created_at: string
          household_id: string
          id: string
          message: string
          read: boolean
          sender_id: string
          user_id: string
        }
        Insert: {
          chat_message_id?: string | null
          created_at?: string
          household_id: string
          id?: string
          message: string
          read?: boolean
          sender_id: string
          user_id: string
        }
        Update: {
          chat_message_id?: string | null
          created_at?: string
          household_id?: string
          id?: string
          message?: string
          read?: boolean
          sender_id?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      receipt_items: {
        Row: {
          added_to_pantry: boolean | null
          category: string | null
          created_at: string
          id: string
          name: string
          quantity: number | null
          receipt_id: string
          total_price: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          added_to_pantry?: boolean | null
          category?: string | null
          created_at?: string
          id?: string
          name: string
          quantity?: number | null
          receipt_id: string
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          added_to_pantry?: boolean | null
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          quantity?: number | null
          receipt_id?: string
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipt_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_scans: {
        Row: {
          created_at: string
          currency: string | null
          household_id: string
          id: string
          image_url: string | null
          receipt_date: string | null
          scanned_by: string
          store_name: string | null
          total_amount: number | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          household_id: string
          id?: string
          image_url?: string | null
          receipt_date?: string | null
          scanned_by: string
          store_name?: string | null
          total_amount?: number | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          household_id?: string
          id?: string
          image_url?: string | null
          receipt_date?: string | null
          scanned_by?: string
          store_name?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_scans_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          id: string
          is_optional: boolean | null
          name: string
          quantity: number
          recipe_id: string
          unit: string
        }
        Insert: {
          id?: string
          is_optional?: boolean | null
          name: string
          quantity?: number
          recipe_id: string
          unit?: string
        }
        Update: {
          id?: string
          is_optional?: boolean | null
          name?: string
          quantity?: number
          recipe_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          category: string | null
          cook_time: number | null
          created_at: string
          description: string | null
          difficulty: string | null
          id: string
          image_url: string | null
          instructions: string[] | null
          name: string
          prep_time: number | null
          servings: number | null
        }
        Insert: {
          category?: string | null
          cook_time?: number | null
          created_at?: string
          description?: string | null
          difficulty?: string | null
          id?: string
          image_url?: string | null
          instructions?: string[] | null
          name: string
          prep_time?: number | null
          servings?: number | null
        }
        Update: {
          category?: string | null
          cook_time?: number | null
          created_at?: string
          description?: string | null
          difficulty?: string | null
          id?: string
          image_url?: string | null
          instructions?: string[] | null
          name?: string
          prep_time?: number | null
          servings?: number | null
        }
        Relationships: []
      }
      shopping_list_items: {
        Row: {
          assigned_to: string | null
          bought_quantity: number | null
          category: string
          created_at: string
          household_id: string
          id: string
          name: string
          quantity: number
          requested_by: string | null
          status: string
          unit: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          bought_quantity?: number | null
          category?: string
          created_at?: string
          household_id: string
          id?: string
          name: string
          quantity?: number
          requested_by?: string | null
          status?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          bought_quantity?: number | null
          category?: string
          created_at?: string
          household_id?: string
          id?: string
          name?: string
          quantity?: number
          requested_by?: string | null
          status?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_household_member: {
        Args: { _household_id: string; _user_id: string }
        Returns: boolean
      }
      lookup_household_by_invite_code: {
        Args: { _invite_code: string }
        Returns: {
          id: string
          invite_code: string
          name: string
        }[]
      }
      realtime_topic_household_id: { Args: { _topic: string }; Returns: string }
      shares_household: {
        Args: { _user_a: string; _user_b: string }
        Returns: boolean
      }
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
