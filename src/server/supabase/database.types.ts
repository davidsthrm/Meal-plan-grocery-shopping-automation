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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      aisle_group: {
        Row: {
          fresh_place: string | null
          household_id: string
          id: string
          is_fallback: boolean
          name: string
          sort_order: number
        }
        Insert: {
          fresh_place?: string | null
          household_id: string
          id?: string
          is_fallback?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          fresh_place?: string | null
          household_id?: string
          id?: string
          is_fallback?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "aisle_group_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      household: {
        Row: {
          balance_targets: Json | null
          created_at: string
          default_servings: number
          drugstore_weekday: number | null
          id: string
          name: string
          place_name: string | null
          postal_code: string | null
          shopping_days: Json | null
          shopping_weekday: number
        }
        Insert: {
          balance_targets?: Json | null
          created_at?: string
          default_servings?: number
          drugstore_weekday?: number | null
          id?: string
          name: string
          place_name?: string | null
          postal_code?: string | null
          shopping_days?: Json | null
          shopping_weekday?: number
        }
        Update: {
          balance_targets?: Json | null
          created_at?: string
          default_servings?: number
          drugstore_weekday?: number | null
          id?: string
          name?: string
          place_name?: string | null
          postal_code?: string | null
          shopping_days?: Json | null
          shopping_weekday?: number
        }
        Relationships: []
      }
      household_invite: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          household_id: string
          id: string
          token_hash: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          household_id: string
          id?: string
          token_hash: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          household_id?: string
          id?: string
          token_hash?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "household_invite_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      household_member: {
        Row: {
          created_at: string
          display_name: string | null
          household_id: string
          role: Database["public"]["Enums"]["household_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          household_id: string
          role?: Database["public"]["Enums"]["household_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          household_id?: string
          role?: Database["public"]["Enums"]["household_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_member_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batch: {
        Row: {
          created_at: string
          created_by: string | null
          for_date: string | null
          for_meal: Database["public"]["Enums"]["meal"] | null
          grouped_at: string | null
          household_id: string
          id: string
          source_book: string | null
          source_edition: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          for_date?: string | null
          for_meal?: Database["public"]["Enums"]["meal"] | null
          grouped_at?: string | null
          household_id: string
          id?: string
          source_book?: string | null
          source_edition?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          for_date?: string | null
          for_meal?: Database["public"]["Enums"]["meal"] | null
          grouped_at?: string | null
          household_id?: string
          id?: string
          source_book?: string | null
          source_edition?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batch_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      import_job: {
        Row: {
          batch_id: string
          claimed_at: string | null
          created_at: string
          extraction: Json | null
          finished_at: string | null
          focus_count: number | null
          focus_position: number | null
          focus_title: string | null
          household_id: string
          id: string
          input_tokens: number | null
          issues: Json
          model: string | null
          notes: Json
          output_tokens: number | null
          page_ids: string[]
          photo_paths: string[]
          position: number
          provided_page: number | null
          provided_title: string | null
          recipe_id: string | null
          status: Database["public"]["Enums"]["import_status"]
          verification: Json | null
        }
        Insert: {
          batch_id: string
          claimed_at?: string | null
          created_at?: string
          extraction?: Json | null
          finished_at?: string | null
          focus_count?: number | null
          focus_position?: number | null
          focus_title?: string | null
          household_id: string
          id?: string
          input_tokens?: number | null
          issues?: Json
          model?: string | null
          notes?: Json
          output_tokens?: number | null
          page_ids?: string[]
          photo_paths?: string[]
          position?: number
          provided_page?: number | null
          provided_title?: string | null
          recipe_id?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          verification?: Json | null
        }
        Update: {
          batch_id?: string
          claimed_at?: string | null
          created_at?: string
          extraction?: Json | null
          finished_at?: string | null
          focus_count?: number | null
          focus_position?: number | null
          focus_title?: string | null
          household_id?: string
          id?: string
          input_tokens?: number | null
          issues?: Json
          model?: string | null
          notes?: Json
          output_tokens?: number | null
          page_ids?: string[]
          photo_paths?: string[]
          position?: number
          provided_page?: number | null
          provided_title?: string | null
          recipe_id?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          verification?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "import_job_household_id_batch_id_fkey"
            columns: ["household_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "import_batch"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "import_job_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_job_household_id_recipe_id_fkey"
            columns: ["household_id", "recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      import_page: {
        Row: {
          batch_id: string
          claimed_at: string | null
          created_at: string
          error: string | null
          file_name: string
          full_path: string | null
          household_id: string
          id: string
          original_path: string | null
          photo_path: string | null
          position: number
          printed_page: number | null
          status: Database["public"]["Enums"]["import_page_status"]
          survey: Json | null
        }
        Insert: {
          batch_id: string
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          file_name: string
          full_path?: string | null
          household_id: string
          id?: string
          original_path?: string | null
          photo_path?: string | null
          position: number
          printed_page?: number | null
          status?: Database["public"]["Enums"]["import_page_status"]
          survey?: Json | null
        }
        Update: {
          batch_id?: string
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          file_name?: string
          full_path?: string | null
          household_id?: string
          id?: string
          original_path?: string | null
          photo_path?: string | null
          position?: number
          printed_page?: number | null
          status?: Database["public"]["Enums"]["import_page_status"]
          survey?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "import_page_household_id_batch_id_fkey"
            columns: ["household_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "import_batch"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "import_page_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient: {
        Row: {
          aisle_group_id: string
          buying_mode: Database["public"]["Enums"]["buying_mode"]
          created_at: string
          default_unit: Database["public"]["Enums"]["unit"]
          grams_per: Json
          household_id: string
          id: string
          is_pantry_staple: boolean
          name: string
          pack_size: number | null
          preferred_brand: string | null
          preferred_shop_id: string
          rounding_step: number | null
          shelf_life_days: number | null
          status: Database["public"]["Enums"]["ingredient_status"]
          synonyms: string[]
        }
        Insert: {
          aisle_group_id: string
          buying_mode?: Database["public"]["Enums"]["buying_mode"]
          created_at?: string
          default_unit: Database["public"]["Enums"]["unit"]
          grams_per?: Json
          household_id: string
          id?: string
          is_pantry_staple?: boolean
          name: string
          pack_size?: number | null
          preferred_brand?: string | null
          preferred_shop_id: string
          rounding_step?: number | null
          shelf_life_days?: number | null
          status?: Database["public"]["Enums"]["ingredient_status"]
          synonyms?: string[]
        }
        Update: {
          aisle_group_id?: string
          buying_mode?: Database["public"]["Enums"]["buying_mode"]
          created_at?: string
          default_unit?: Database["public"]["Enums"]["unit"]
          grams_per?: Json
          household_id?: string
          id?: string
          is_pantry_staple?: boolean
          name?: string
          pack_size?: number | null
          preferred_brand?: string | null
          preferred_shop_id?: string
          rounding_step?: number | null
          shelf_life_days?: number | null
          status?: Database["public"]["Enums"]["ingredient_status"]
          synonyms?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_household_id_aisle_group_id_fkey"
            columns: ["household_id", "aisle_group_id"]
            isOneToOne: false
            referencedRelation: "aisle_group"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "ingredient_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_household_id_preferred_shop_id_fkey"
            columns: ["household_id", "preferred_shop_id"]
            isOneToOne: false
            referencedRelation: "shop"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      ingredient_proposal: {
        Row: {
          aisle_group_id: string
          buying_mode: Database["public"]["Enums"]["buying_mode"]
          created_at: string
          default_unit: Database["public"]["Enums"]["unit"]
          household_id: string
          id: string
          is_pantry_staple: boolean
          name: string
          pack_size: number | null
          preferred_shop_id: string
          resolved_at: string | null
          resolved_ingredient_id: string | null
          same_as_ingredient_id: string | null
          shelf_life_days: number | null
          status: Database["public"]["Enums"]["proposal_status"]
        }
        Insert: {
          aisle_group_id: string
          buying_mode?: Database["public"]["Enums"]["buying_mode"]
          created_at?: string
          default_unit: Database["public"]["Enums"]["unit"]
          household_id: string
          id?: string
          is_pantry_staple?: boolean
          name: string
          pack_size?: number | null
          preferred_shop_id: string
          resolved_at?: string | null
          resolved_ingredient_id?: string | null
          same_as_ingredient_id?: string | null
          shelf_life_days?: number | null
          status?: Database["public"]["Enums"]["proposal_status"]
        }
        Update: {
          aisle_group_id?: string
          buying_mode?: Database["public"]["Enums"]["buying_mode"]
          created_at?: string
          default_unit?: Database["public"]["Enums"]["unit"]
          household_id?: string
          id?: string
          is_pantry_staple?: boolean
          name?: string
          pack_size?: number | null
          preferred_shop_id?: string
          resolved_at?: string | null
          resolved_ingredient_id?: string | null
          same_as_ingredient_id?: string | null
          shelf_life_days?: number | null
          status?: Database["public"]["Enums"]["proposal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_proposal_household_id_aisle_group_id_fkey"
            columns: ["household_id", "aisle_group_id"]
            isOneToOne: false
            referencedRelation: "aisle_group"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "ingredient_proposal_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_proposal_household_id_preferred_shop_id_fkey"
            columns: ["household_id", "preferred_shop_id"]
            isOneToOne: false
            referencedRelation: "shop"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "ingredient_proposal_household_id_resolved_ingredient_id_fkey"
            columns: ["household_id", "resolved_ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "ingredient_proposal_household_id_same_as_ingredient_id_fkey"
            columns: ["household_id", "same_as_ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      plan_extra: {
        Row: {
          created_at: string
          household_id: string
          id: string
          needed_on: string | null
          note: string | null
          planned_on: string | null
          recipe_id: string
          servings: number
          week_plan_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          needed_on?: string | null
          note?: string | null
          planned_on?: string | null
          recipe_id: string
          servings: number
          week_plan_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          needed_on?: string | null
          note?: string | null
          planned_on?: string | null
          recipe_id?: string
          servings?: number
          week_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_extra_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_extra_household_id_recipe_id_fkey"
            columns: ["household_id", "recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "plan_extra_household_id_week_plan_id_fkey"
            columns: ["household_id", "week_plan_id"]
            isOneToOne: false
            referencedRelation: "week_plan"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      plan_slot: {
        Row: {
          date: string
          extra_servings: number
          household_id: string
          id: string
          kind: Database["public"]["Enums"]["slot_kind"]
          label: string | null
          leftovers_of_slot_id: string | null
          meal: Database["public"]["Enums"]["meal"]
          week_plan_id: string
        }
        Insert: {
          date: string
          extra_servings?: number
          household_id: string
          id?: string
          kind: Database["public"]["Enums"]["slot_kind"]
          label?: string | null
          leftovers_of_slot_id?: string | null
          meal: Database["public"]["Enums"]["meal"]
          week_plan_id: string
        }
        Update: {
          date?: string
          extra_servings?: number
          household_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["slot_kind"]
          label?: string | null
          leftovers_of_slot_id?: string | null
          meal?: Database["public"]["Enums"]["meal"]
          week_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_slot_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_slot_household_id_week_plan_id_fkey"
            columns: ["household_id", "week_plan_id"]
            isOneToOne: false
            referencedRelation: "week_plan"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "plan_slot_leftovers_of_slot_id_fkey"
            columns: ["leftovers_of_slot_id"]
            isOneToOne: false
            referencedRelation: "plan_slot"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_slot_food: {
        Row: {
          household_id: string
          id: string
          ingredient_id: string | null
          label: string
          plan_slot_id: string
          planned_at: string | null
          planned_on: string | null
          position: number
          shop_id: string | null
        }
        Insert: {
          household_id: string
          id?: string
          ingredient_id?: string | null
          label: string
          plan_slot_id: string
          planned_at?: string | null
          planned_on?: string | null
          position?: number
          shop_id?: string | null
        }
        Update: {
          household_id?: string
          id?: string
          ingredient_id?: string | null
          label?: string
          plan_slot_id?: string
          planned_at?: string | null
          planned_on?: string | null
          position?: number
          shop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_slot_food_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_slot_food_household_id_ingredient_id_fkey"
            columns: ["household_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "plan_slot_food_household_id_plan_slot_id_fkey"
            columns: ["household_id", "plan_slot_id"]
            isOneToOne: false
            referencedRelation: "plan_slot"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "plan_slot_food_household_id_shop_id_fkey"
            columns: ["household_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "shop"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      plan_slot_item: {
        Row: {
          household_id: string
          id: string
          plan_slot_id: string
          planned_at: string | null
          planned_on: string | null
          position: number
          recipe_id: string
          servings: number
        }
        Insert: {
          household_id: string
          id?: string
          plan_slot_id: string
          planned_at?: string | null
          planned_on?: string | null
          position?: number
          recipe_id: string
          servings: number
        }
        Update: {
          household_id?: string
          id?: string
          plan_slot_id?: string
          planned_at?: string | null
          planned_on?: string | null
          position?: number
          recipe_id?: string
          servings?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_slot_item_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_slot_item_household_id_plan_slot_id_fkey"
            columns: ["household_id", "plan_slot_id"]
            isOneToOne: false
            referencedRelation: "plan_slot"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "plan_slot_item_household_id_recipe_id_fkey"
            columns: ["household_id", "recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      recipe: {
        Row: {
          checked_fields: string[]
          created_at: string
          household_id: string
          id: string
          is_favorite: boolean
          kind: Database["public"]["Enums"]["recipe_kind"]
          prep_minutes: number | null
          prep_steps: string[] | null
          prep_steps_doubts: string[]
          protein_type: Database["public"]["Enums"]["protein_type"] | null
          servings_max: number | null
          servings_min: number | null
          servings_unit: string | null
          source_book: string | null
          source_edition: string | null
          source_page: number | null
          source_text: string | null
          source_title: string | null
          status: Database["public"]["Enums"]["recipe_status"]
          steps: string | null
          title: string
          updated_at: string
          wanted_at: string | null
        }
        Insert: {
          checked_fields?: string[]
          created_at?: string
          household_id: string
          id?: string
          is_favorite?: boolean
          kind?: Database["public"]["Enums"]["recipe_kind"]
          prep_minutes?: number | null
          prep_steps?: string[] | null
          prep_steps_doubts?: string[]
          protein_type?: Database["public"]["Enums"]["protein_type"] | null
          servings_max?: number | null
          servings_min?: number | null
          servings_unit?: string | null
          source_book?: string | null
          source_edition?: string | null
          source_page?: number | null
          source_text?: string | null
          source_title?: string | null
          status?: Database["public"]["Enums"]["recipe_status"]
          steps?: string | null
          title: string
          updated_at?: string
          wanted_at?: string | null
        }
        Update: {
          checked_fields?: string[]
          created_at?: string
          household_id?: string
          id?: string
          is_favorite?: boolean
          kind?: Database["public"]["Enums"]["recipe_kind"]
          prep_minutes?: number | null
          prep_steps?: string[] | null
          prep_steps_doubts?: string[]
          protein_type?: Database["public"]["Enums"]["protein_type"] | null
          servings_max?: number | null
          servings_min?: number | null
          servings_unit?: string | null
          source_book?: string | null
          source_edition?: string | null
          source_page?: number | null
          source_text?: string | null
          source_title?: string | null
          status?: Database["public"]["Enums"]["recipe_status"]
          steps?: string | null
          title?: string
          updated_at?: string
          wanted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredient: {
        Row: {
          alternative_to: string | null
          household_id: string
          id: string
          ingredient_id: string | null
          is_approximate: boolean
          is_optional: boolean
          note: string | null
          original_text: string
          position: number
          proposal_id: string | null
          quantity: number | null
          quantity_max: number | null
          recipe_id: string
          secondary_quantity: number | null
          secondary_scope: Database["public"]["Enums"]["measure_scope"] | null
          secondary_unit: Database["public"]["Enums"]["unit"] | null
          unit: Database["public"]["Enums"]["unit"] | null
        }
        Insert: {
          alternative_to?: string | null
          household_id: string
          id?: string
          ingredient_id?: string | null
          is_approximate?: boolean
          is_optional?: boolean
          note?: string | null
          original_text: string
          position: number
          proposal_id?: string | null
          quantity?: number | null
          quantity_max?: number | null
          recipe_id: string
          secondary_quantity?: number | null
          secondary_scope?: Database["public"]["Enums"]["measure_scope"] | null
          secondary_unit?: Database["public"]["Enums"]["unit"] | null
          unit?: Database["public"]["Enums"]["unit"] | null
        }
        Update: {
          alternative_to?: string | null
          household_id?: string
          id?: string
          ingredient_id?: string | null
          is_approximate?: boolean
          is_optional?: boolean
          note?: string | null
          original_text?: string
          position?: number
          proposal_id?: string | null
          quantity?: number | null
          quantity_max?: number | null
          recipe_id?: string
          secondary_quantity?: number | null
          secondary_scope?: Database["public"]["Enums"]["measure_scope"] | null
          secondary_unit?: Database["public"]["Enums"]["unit"] | null
          unit?: Database["public"]["Enums"]["unit"] | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredient_alternative_to_fkey"
            columns: ["alternative_to"]
            isOneToOne: false
            referencedRelation: "recipe_ingredient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredient_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredient_household_id_ingredient_id_fkey"
            columns: ["household_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "recipe_ingredient_household_id_recipe_id_fkey"
            columns: ["household_id", "recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "recipe_ingredient_proposal_fk"
            columns: ["household_id", "proposal_id"]
            isOneToOne: false
            referencedRelation: "ingredient_proposal"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      recipe_pair_kept: {
        Row: {
          created_at: string
          household_id: string
          recipe_a: string
          recipe_b: string
        }
        Insert: {
          created_at?: string
          household_id: string
          recipe_a: string
          recipe_b: string
        }
        Update: {
          created_at?: string
          household_id?: string
          recipe_a?: string
          recipe_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_pair_kept_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_pair_kept_household_id_recipe_a_fkey"
            columns: ["household_id", "recipe_a"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "recipe_pair_kept_household_id_recipe_b_fkey"
            columns: ["household_id", "recipe_b"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      recipe_photo: {
        Row: {
          crop_path: string | null
          framed_at: string | null
          household_id: string
          id: string
          recipe_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          crop_path?: string | null
          framed_at?: string | null
          household_id: string
          id?: string
          recipe_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          crop_path?: string | null
          framed_at?: string | null
          household_id?: string
          id?: string
          recipe_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_photo_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_photo_household_id_recipe_id_fkey"
            columns: ["household_id", "recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      recipe_tag: {
        Row: {
          household_id: string
          recipe_id: string
          tag_id: string
        }
        Insert: {
          household_id: string
          recipe_id: string
          tag_id: string
        }
        Update: {
          household_id?: string
          recipe_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_tag_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_tag_household_id_recipe_id_fkey"
            columns: ["household_id", "recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "recipe_tag_household_id_tag_id_fkey"
            columns: ["household_id", "tag_id"]
            isOneToOne: false
            referencedRelation: "tag"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      recurring_item: {
        Row: {
          default_quantity: number | null
          default_unit: Database["public"]["Enums"]["unit"] | null
          household_id: string
          id: string
          ingredient_id: string | null
          is_on_by_default: boolean
          label: string | null
          sort_order: number
        }
        Insert: {
          default_quantity?: number | null
          default_unit?: Database["public"]["Enums"]["unit"] | null
          household_id: string
          id?: string
          ingredient_id?: string | null
          is_on_by_default?: boolean
          label?: string | null
          sort_order?: number
        }
        Update: {
          default_quantity?: number | null
          default_unit?: Database["public"]["Enums"]["unit"] | null
          household_id?: string
          id?: string
          ingredient_id?: string | null
          is_on_by_default?: boolean
          label?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "recurring_item_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_item_household_id_ingredient_id_fkey"
            columns: ["household_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      restock_item: {
        Row: {
          created_at: string
          created_by: string | null
          fresh_place: string | null
          household_id: string
          id: string
          text: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fresh_place?: string | null
          household_id: string
          id?: string
          text: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fresh_place?: string | null
          household_id?: string
          id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "restock_item_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      shop: {
        Row: {
          address: string | null
          found_near: string | null
          household_id: string
          id: string
          is_default: boolean
          kind: string
          logo_url: string | null
          name: string
          short_label: string
          sort_order: number
          supermarket_rank: number | null
        }
        Insert: {
          address?: string | null
          found_near?: string | null
          household_id: string
          id?: string
          is_default?: boolean
          kind?: string
          logo_url?: string | null
          name: string
          short_label: string
          sort_order?: number
          supermarket_rank?: number | null
        }
        Update: {
          address?: string | null
          found_near?: string | null
          household_id?: string
          id?: string
          is_default?: boolean
          kind?: string
          logo_url?: string | null
          name?: string
          short_label?: string
          sort_order?: number
          supermarket_rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_aisle_order: {
        Row: {
          aisle_group_id: string
          household_id: string
          shop_id: string
          sort_order: number
        }
        Insert: {
          aisle_group_id: string
          household_id: string
          shop_id: string
          sort_order: number
        }
        Update: {
          aisle_group_id?: string
          household_id?: string
          shop_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "shop_aisle_order_household_id_aisle_group_id_fkey"
            columns: ["household_id", "aisle_group_id"]
            isOneToOne: false
            referencedRelation: "aisle_group"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "shop_aisle_order_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_aisle_order_household_id_shop_id_fkey"
            columns: ["household_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "shop"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      shopping_line: {
        Row: {
          aisle_group_id: string
          amounts: Json
          contributions: Json
          default_at_home: boolean
          has_unquantified: boolean
          household_id: string
          ingredient_id: string | null
          is_optional: boolean
          label: string
          line_key: string
          needed_by: string | null
          note: string | null
          purchase_quantity: number | null
          purchase_unit: Database["public"]["Enums"]["unit"] | null
          shop_id: string
          shopping_list_id: string
          trip: Database["public"]["Enums"]["trip"]
        }
        Insert: {
          aisle_group_id: string
          amounts?: Json
          contributions?: Json
          default_at_home?: boolean
          has_unquantified?: boolean
          household_id: string
          ingredient_id?: string | null
          is_optional?: boolean
          label: string
          line_key: string
          needed_by?: string | null
          note?: string | null
          purchase_quantity?: number | null
          purchase_unit?: Database["public"]["Enums"]["unit"] | null
          shop_id: string
          shopping_list_id: string
          trip?: Database["public"]["Enums"]["trip"]
        }
        Update: {
          aisle_group_id?: string
          amounts?: Json
          contributions?: Json
          default_at_home?: boolean
          has_unquantified?: boolean
          household_id?: string
          ingredient_id?: string | null
          is_optional?: boolean
          label?: string
          line_key?: string
          needed_by?: string | null
          note?: string | null
          purchase_quantity?: number | null
          purchase_unit?: Database["public"]["Enums"]["unit"] | null
          shop_id?: string
          shopping_list_id?: string
          trip?: Database["public"]["Enums"]["trip"]
        }
        Relationships: [
          {
            foreignKeyName: "shopping_line_household_id_aisle_group_id_fkey"
            columns: ["household_id", "aisle_group_id"]
            isOneToOne: false
            referencedRelation: "aisle_group"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "shopping_line_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_line_household_id_ingredient_id_fkey"
            columns: ["household_id", "ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "shopping_line_household_id_shop_id_fkey"
            columns: ["household_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "shop"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "shopping_line_household_id_shopping_list_id_fkey"
            columns: ["household_id", "shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_list"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      shopping_line_state: {
        Row: {
          amount: number | null
          amount_instead: number | null
          at_home: boolean | null
          checked_at: string | null
          checked_by: string | null
          checked_changed_at: string | null
          household_id: string
          line_key: string
          moved_date: string | null
          moved_place: string | null
          note: string | null
          quantity: number | null
          shop_id: string | null
          shopping_list_id: string
          unit: Database["public"]["Enums"]["unit"] | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          amount_instead?: number | null
          at_home?: boolean | null
          checked_at?: string | null
          checked_by?: string | null
          checked_changed_at?: string | null
          household_id: string
          line_key: string
          moved_date?: string | null
          moved_place?: string | null
          note?: string | null
          quantity?: number | null
          shop_id?: string | null
          shopping_list_id: string
          unit?: Database["public"]["Enums"]["unit"] | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          amount_instead?: number | null
          at_home?: boolean | null
          checked_at?: string | null
          checked_by?: string | null
          checked_changed_at?: string | null
          household_id?: string
          line_key?: string
          moved_date?: string | null
          moved_place?: string | null
          note?: string | null
          quantity?: number | null
          shop_id?: string | null
          shopping_list_id?: string
          unit?: Database["public"]["Enums"]["unit"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_line_state_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_line_state_household_id_shop_id_fkey"
            columns: ["household_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "shop"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "shopping_line_state_household_id_shopping_list_id_fkey"
            columns: ["household_id", "shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_list"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      shopping_list: {
        Row: {
          generated_at: string | null
          household_id: string
          id: string
          place: string
          shopping_date: string
          week_plan_id: string | null
        }
        Insert: {
          generated_at?: string | null
          household_id: string
          id?: string
          place?: string
          shopping_date: string
          week_plan_id?: string | null
        }
        Update: {
          generated_at?: string | null
          household_id?: string
          id?: string
          place?: string
          shopping_date?: string
          week_plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_household_id_week_plan_id_fkey"
            columns: ["household_id", "week_plan_id"]
            isOneToOne: false
            referencedRelation: "week_plan"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      shopping_manual_entry: {
        Row: {
          aisle_group_id: string | null
          created_at: string
          created_by: string | null
          for_whom: string | null
          household_id: string
          id: string
          quantity: number | null
          shop_id: string | null
          shopping_list_id: string
          text: string
        }
        Insert: {
          aisle_group_id?: string | null
          created_at?: string
          created_by?: string | null
          for_whom?: string | null
          household_id: string
          id?: string
          quantity?: number | null
          shop_id?: string | null
          shopping_list_id: string
          text: string
        }
        Update: {
          aisle_group_id?: string | null
          created_at?: string
          created_by?: string | null
          for_whom?: string | null
          household_id?: string
          id?: string
          quantity?: number | null
          shop_id?: string | null
          shopping_list_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_manual_entry_household_id_aisle_group_id_fkey"
            columns: ["household_id", "aisle_group_id"]
            isOneToOne: false
            referencedRelation: "aisle_group"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "shopping_manual_entry_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_manual_entry_household_id_shop_id_fkey"
            columns: ["household_id", "shop_id"]
            isOneToOne: false
            referencedRelation: "shop"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "shopping_manual_entry_household_id_shopping_list_id_fkey"
            columns: ["household_id", "shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_list"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      tag: {
        Row: {
          group_name: string
          household_id: string
          id: string
          key: string | null
          name: string
          sort_order: number
        }
        Insert: {
          group_name: string
          household_id: string
          id?: string
          key?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          group_name?: string
          household_id?: string
          id?: string
          key?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "tag_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      week_plan: {
        Row: {
          created_at: string
          household_id: string
          id: string
          saved_at: string | null
          week_start: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          saved_at?: string | null
          week_start: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          saved_at?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_plan_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      week_recurring_item: {
        Row: {
          household_id: string
          is_on: boolean
          quantity: number | null
          recurring_item_id: string
          week_plan_id: string
        }
        Insert: {
          household_id: string
          is_on: boolean
          quantity?: number | null
          recurring_item_id: string
          week_plan_id: string
        }
        Update: {
          household_id?: string
          is_on?: boolean
          quantity?: number | null
          recurring_item_id?: string
          week_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_recurring_item_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_recurring_item_household_id_recurring_item_id_fkey"
            columns: ["household_id", "recurring_item_id"]
            isOneToOne: false
            referencedRelation: "recurring_item"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "week_recurring_item_household_id_week_plan_id_fkey"
            columns: ["household_id", "week_plan_id"]
            isOneToOne: false
            referencedRelation: "week_plan"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      leave_household: { Args: never; Returns: undefined }
      merge_recipes: {
        Args: { drop_id: string; keep_id: string }
        Returns: undefined
      }
      remove_household_member: { Args: { member: string }; Returns: undefined }
      tick_shopping_line: {
        Args: {
          list_id: string
          tick_checked: boolean
          tick_key: string
          ticked_at: string
        }
        Returns: boolean
      }
    }
    Enums: {
      buying_mode: "count" | "weight" | "pack" | "none"
      household_role: "admin" | "member"
      import_page_status:
        | "uploaded"
        | "processing"
        | "read"
        | "ignored"
        | "failed"
      import_status:
        | "uploaded"
        | "processing"
        | "approved"
        | "needs_review"
        | "failed"
        | "discarded"
      ingredient_status: "active" | "proposed"
      meal: "lunch" | "dinner" | "coffee"
      measure_scope: "total" | "perPiece"
      proposal_status: "open" | "accepted" | "rejected"
      protein_type:
        | "red_meat"
        | "poultry"
        | "fish"
        | "vegetarian"
        | "vegan"
        | "none"
      recipe_kind: "cookbook" | "quick_meal"
      recipe_status: "needs_review" | "approved"
      slot_kind: "recipes" | "free_text" | "leftovers" | "away" | "skipped"
      trip: "main" | "later"
      unit:
        | "g"
        | "kg"
        | "ml"
        | "l"
        | "TL"
        | "EL"
        | "Stück"
        | "Zehe"
        | "Bund"
        | "Stängel"
        | "Zweig"
        | "Blatt"
        | "Scheibe"
        | "Dose"
        | "Glas"
        | "Becher"
        | "Packung"
        | "Beutel"
        | "Würfel"
        | "Kopf"
        | "Knolle"
        | "Stange"
        | "Prise"
        | "Msp"
        | "Handvoll"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      buying_mode: ["count", "weight", "pack", "none"],
      household_role: ["admin", "member"],
      import_page_status: [
        "uploaded",
        "processing",
        "read",
        "ignored",
        "failed",
      ],
      import_status: [
        "uploaded",
        "processing",
        "approved",
        "needs_review",
        "failed",
        "discarded",
      ],
      ingredient_status: ["active", "proposed"],
      meal: ["lunch", "dinner", "coffee"],
      measure_scope: ["total", "perPiece"],
      proposal_status: ["open", "accepted", "rejected"],
      protein_type: [
        "red_meat",
        "poultry",
        "fish",
        "vegetarian",
        "vegan",
        "none",
      ],
      recipe_kind: ["cookbook", "quick_meal"],
      recipe_status: ["needs_review", "approved"],
      slot_kind: ["recipes", "free_text", "leftovers", "away", "skipped"],
      trip: ["main", "later"],
      unit: [
        "g",
        "kg",
        "ml",
        "l",
        "TL",
        "EL",
        "Stück",
        "Zehe",
        "Bund",
        "Stängel",
        "Zweig",
        "Blatt",
        "Scheibe",
        "Dose",
        "Glas",
        "Becher",
        "Packung",
        "Beutel",
        "Würfel",
        "Kopf",
        "Knolle",
        "Stange",
        "Prise",
        "Msp",
        "Handvoll",
      ],
    },
  },
} as const
