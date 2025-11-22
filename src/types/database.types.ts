export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          created_at: string | null
          preferences: Json | null
        }
        Insert: {
          id: string
          email: string
          created_at?: string | null
          preferences?: Json | null
        }
        Update: {
          id?: string
          email?: string
          created_at?: string | null
          preferences?: Json | null
        }
        Relationships: []
      }
      product_cache: {
        Row: {
          barcode: string
          product_data: Json
          last_updated: string | null
        }
        Insert: {
          barcode: string
          product_data: Json
          last_updated?: string | null
        }
        Update: {
          barcode?: string
          product_data?: Json
          last_updated?: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          id: string
          user_id: string
          barcode: string
          product_name: string
          category: string
          image_url: string | null
          quantity: number | null
          added_date: string | null
          expiration_date: string
          manual_expiry_override: boolean | null
          is_expired: boolean | null
          days_until_expiry: number | null
        }
        Insert: {
          id?: string
          user_id: string
          barcode: string
          product_name: string
          category: string
          image_url?: string | null
          quantity?: number | null
          added_date?: string | null
          expiration_date: string
          manual_expiry_override?: boolean | null
        }
        Update: {
          id?: string
          user_id?: string
          barcode?: string
          product_name?: string
          category?: string
          image_url?: string | null
          quantity?: number | null
          added_date?: string | null
          expiration_date?: string
          manual_expiry_override?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      recipe_history: {
        Row: {
          id: string
          user_id: string
          recipe_id: string
          recipe_name: string
          ingredients_used: string[]
          created_at: string | null
          rating: number | null
        }
        Insert: {
          id?: string
          user_id: string
          recipe_id: string
          recipe_name: string
          ingredients_used: string[]
          created_at?: string | null
          rating?: number | null
        }
        Update: {
          id?: string
          user_id?: string
          recipe_id?: string
          recipe_name?: string
          ingredients_used?: string[]
          created_at?: string | null
          rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_history_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_expiration: {
        Args: {
          p_category: string
          p_added_date?: string
        }
        Returns: string
      }
      get_expiring_items: {
        Args: {
          p_user_id: string
          p_days?: number
        }
        Returns: {
          id: string
          product_name: string
          category: string
          expiration_date: string
          days_until_expiry: number
          quantity: number
        }[]
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
