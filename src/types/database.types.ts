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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      brand_feature_switches: {
        Row: {
          brand_id: string
          enabled: boolean
          feature_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_id: string
          enabled?: boolean
          feature_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_id?: string
          enabled?: boolean
          feature_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_feature_switches_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_feature_switches_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "feature_flag_catalog"
            referencedColumns: ["feature_key"]
          },
          {
            foreignKeyName: "brand_feature_switches_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          ai_config: Json
          created_at: string
          email_templates: Json
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          primary_color: string
          secondary_color: string
          slug: string
          sms_templates: Json
          upsell_items: Json
          vertical: string
        }
        Insert: {
          ai_config?: Json
          created_at?: string
          email_templates?: Json
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          primary_color?: string
          secondary_color?: string
          slug: string
          sms_templates?: Json
          upsell_items?: Json
          vertical?: string
        }
        Update: {
          ai_config?: Json
          created_at?: string
          email_templates?: Json
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          primary_color?: string
          secondary_color?: string
          slug?: string
          sms_templates?: Json
          upsell_items?: Json
          vertical?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          org_id: string | null
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          org_id?: string | null
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          org_id?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          booking_group_id: string | null
          category: string | null
          client_address: string | null
          client_email: string | null
          client_job: string | null
          client_name: string | null
          client_phone: string | null
          color: string | null
          created_at: string
          description: string | null
          end_time: string
          id: string
          job_quote: number | null
          lead_id: string | null
          notes: string | null
          org_id: string | null
          start_time: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          booking_group_id?: string | null
          category?: string | null
          client_address?: string | null
          client_email?: string | null
          client_job?: string | null
          client_name?: string | null
          client_phone?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          end_time: string
          id?: string
          job_quote?: number | null
          lead_id?: string | null
          notes?: string | null
          org_id?: string | null
          start_time: string
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          booking_group_id?: string | null
          category?: string | null
          client_address?: string | null
          client_email?: string | null
          client_job?: string | null
          client_name?: string | null
          client_phone?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          end_time?: string
          id?: string
          job_quote?: number | null
          lead_id?: string | null
          notes?: string | null
          org_id?: string | null
          start_time?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flag_catalog: {
        Row: {
          category: string
          created_at: string
          default_enabled: boolean
          description: string | null
          feature_key: string
          label: string
          min_tier: string
        }
        Insert: {
          category: string
          created_at?: string
          default_enabled?: boolean
          description?: string | null
          feature_key: string
          label: string
          min_tier?: string
        }
        Update: {
          category?: string
          created_at?: string
          default_enabled?: boolean
          description?: string | null
          feature_key?: string
          label?: string
          min_tier?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          chase_count: number
          chase_paused: boolean
          created_at: string
          created_by: string | null
          currency: string
          customer_email: string | null
          customer_name: string
          delivery_method: string
          gst_amount: number | null
          id: string
          invoice_number: string
          last_chased_at: string | null
          lead_id: string
          line_items: Json
          org_id: string
          paid_at: string | null
          paid_via: string | null
          pdf_storage_path: string | null
          public_token: string | null
          quote_id: string | null
          sent_at: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          token_expires_at: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          chase_count?: number
          chase_paused?: boolean
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_email?: string | null
          customer_name: string
          delivery_method?: string
          gst_amount?: number | null
          id?: string
          invoice_number: string
          last_chased_at?: string | null
          lead_id: string
          line_items?: Json
          org_id: string
          paid_at?: string | null
          paid_via?: string | null
          pdf_storage_path?: string | null
          public_token?: string | null
          quote_id?: string | null
          sent_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          token_expires_at?: string | null
          total_amount: number
          updated_at?: string
        }
        Update: {
          chase_count?: number
          chase_paused?: boolean
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string
          delivery_method?: string
          gst_amount?: number | null
          id?: string
          invoice_number?: string
          last_chased_at?: string | null
          lead_id?: string
          line_items?: Json
          org_id?: string
          paid_at?: string | null
          paid_via?: string | null
          pdf_storage_path?: string | null
          public_token?: string | null
          quote_id?: string | null
          sent_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          token_expires_at?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          actor_id: string | null
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          lead_id: string
          note: string | null
          org_id: string | null
          payload: Json | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          lead_id: string
          note?: string | null
          org_id?: string | null
          payload?: Json | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          lead_id?: string
          note?: string | null
          org_id?: string | null
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_photos: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          org_id: string | null
          public_url: string | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          org_id?: string | null
          public_url?: string | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          org_id?: string | null
          public_url?: string | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_photos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          assigned_at: string | null
          assigned_to: string | null
          contact_attempt_round: number
          created_at: string
          customer_id: string | null
          demo_mode: boolean
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          details: string | null
          email: string | null
          email_hash: string | null
          extraction_status: string
          hidden_from_kanban_at: string | null
          id: string
          last_contact_attempted_at: string | null
          lead_source: string | null
          lost_reason: string | null
          name: string
          org_id: string | null
          phone: string | null
          raw_email: string | null
          raw_sms: string | null
          review_request_sent_at: string | null
          service_type: string
          source: string | null
          status: string
          timer_expires_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          contact_attempt_round?: number
          created_at?: string
          customer_id?: string | null
          demo_mode?: boolean
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          details?: string | null
          email?: string | null
          email_hash?: string | null
          extraction_status?: string
          hidden_from_kanban_at?: string | null
          id?: string
          last_contact_attempted_at?: string | null
          lead_source?: string | null
          lost_reason?: string | null
          name: string
          org_id?: string | null
          phone?: string | null
          raw_email?: string | null
          raw_sms?: string | null
          review_request_sent_at?: string | null
          service_type?: string
          source?: string | null
          status?: string
          timer_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          contact_attempt_round?: number
          created_at?: string
          customer_id?: string | null
          demo_mode?: boolean
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          details?: string | null
          email?: string | null
          email_hash?: string | null
          extraction_status?: string
          hidden_from_kanban_at?: string | null
          id?: string
          last_contact_attempted_at?: string | null
          lead_source?: string | null
          lost_reason?: string | null
          name?: string
          org_id?: string | null
          phone?: string | null
          raw_email?: string | null
          raw_sms?: string | null
          review_request_sent_at?: string | null
          service_type?: string
          source?: string | null
          status?: string
          timer_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_messaging_sessions: {
        Row: {
          asset_id: string
          channel: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          details: string | null
          expires_at: string
          id: string
          lead_id: string | null
          messages: Json
          name: string | null
          org_id: string
          phone: string | null
          platform_user_id: string
          service_type: string
          state: string
          suburb: string | null
          updated_at: string
        }
        Insert: {
          asset_id: string
          channel: string
          created_at?: string
          details?: string | null
          expires_at?: string
          id?: string
          lead_id?: string | null
          messages?: Json
          name?: string | null
          org_id: string
          phone?: string | null
          platform_user_id: string
          service_type?: string
          state?: string
          suburb?: string | null
          updated_at?: string
        }
        Update: {
          asset_id?: string
          channel?: string
          created_at?: string
          details?: string | null
          expires_at?: string
          id?: string
          lead_id?: string | null
          messages?: Json
          name?: string | null
          org_id?: string
          phone?: string | null
          platform_user_id?: string
          service_type?: string
          state?: string
          suburb?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_messaging_sessions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_messaging_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_agent_reports: {
        Row: {
          agent_id: string
          agent_name: string | null
          agent_role: string | null
          assignments: number
          booking_cancelled: number
          bookings: number
          completed: number
          contact_attempts: number
          created_at: string
          expired: number
          id: string
          lost: number
          month_end: string
          month_start: string
          org_id: string
          review_requests: number
          snapshot_generated_at: string
          unassigned: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          agent_name?: string | null
          agent_role?: string | null
          assignments?: number
          booking_cancelled?: number
          bookings?: number
          completed?: number
          contact_attempts?: number
          created_at?: string
          expired?: number
          id?: string
          lost?: number
          month_end: string
          month_start: string
          org_id: string
          review_requests?: number
          snapshot_generated_at?: string
          unassigned?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          agent_name?: string | null
          agent_role?: string | null
          assignments?: number
          booking_cancelled?: number
          bookings?: number
          completed?: number
          contact_attempts?: number
          created_at?: string
          expired?: number
          id?: string
          lost?: number
          month_end?: string
          month_start?: string
          org_id?: string
          review_requests?: number
          snapshot_generated_at?: string
          unassigned?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_agent_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_org_reports: {
        Row: {
          assigned_to_contacted_denominator: number
          assigned_to_contacted_numerator: number
          assigned_to_contacted_rate: number | null
          assignments: number
          avg_hours_to_booking: number | null
          avg_hours_to_first_contact: number | null
          booked_to_completed_denominator: number
          booked_to_completed_numerator: number
          booked_to_completed_rate: number | null
          booking_cancelled: number
          booking_samples: number
          bookings: number
          completed: number
          contact_attempts: number
          contacted_to_booked_denominator: number
          contacted_to_booked_numerator: number
          contacted_to_booked_rate: number | null
          created_at: string
          expired: number
          first_contact_samples: number
          id: string
          leads_received: number
          lost: number
          month_end: string
          month_start: string
          org_id: string
          review_requests: number
          snapshot_generated_at: string
          source_breakdown: Json
          unassigned: number
          updated_at: string
        }
        Insert: {
          assigned_to_contacted_denominator?: number
          assigned_to_contacted_numerator?: number
          assigned_to_contacted_rate?: number | null
          assignments?: number
          avg_hours_to_booking?: number | null
          avg_hours_to_first_contact?: number | null
          booked_to_completed_denominator?: number
          booked_to_completed_numerator?: number
          booked_to_completed_rate?: number | null
          booking_cancelled?: number
          booking_samples?: number
          bookings?: number
          completed?: number
          contact_attempts?: number
          contacted_to_booked_denominator?: number
          contacted_to_booked_numerator?: number
          contacted_to_booked_rate?: number | null
          created_at?: string
          expired?: number
          first_contact_samples?: number
          id?: string
          leads_received?: number
          lost?: number
          month_end: string
          month_start: string
          org_id: string
          review_requests?: number
          snapshot_generated_at?: string
          source_breakdown?: Json
          unassigned?: number
          updated_at?: string
        }
        Update: {
          assigned_to_contacted_denominator?: number
          assigned_to_contacted_numerator?: number
          assigned_to_contacted_rate?: number | null
          assignments?: number
          avg_hours_to_booking?: number | null
          avg_hours_to_first_contact?: number | null
          booked_to_completed_denominator?: number
          booked_to_completed_numerator?: number
          booked_to_completed_rate?: number | null
          booking_cancelled?: number
          booking_samples?: number
          bookings?: number
          completed?: number
          contact_attempts?: number
          contacted_to_booked_denominator?: number
          contacted_to_booked_numerator?: number
          contacted_to_booked_rate?: number | null
          created_at?: string
          expired?: number
          first_contact_samples?: number
          id?: string
          leads_received?: number
          lost?: number
          month_end?: string
          month_start?: string
          org_id?: string
          review_requests?: number
          snapshot_generated_at?: string
          source_breakdown?: Json
          unassigned?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_org_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          lead_id: string | null
          message: string
          org_id: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id?: string | null
          message: string
          org_id?: string | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string | null
          message?: string
          org_id?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_facebook_pages: {
        Row: {
          created_at: string
          id: string
          instagram_business_account_id: string | null
          org_id: string
          page_access_token: string | null
          page_id: string
          page_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          instagram_business_account_id?: string | null
          org_id: string
          page_access_token?: string | null
          page_id: string
          page_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          instagram_business_account_id?: string | null
          org_id?: string
          page_access_token?: string | null
          page_id?: string
          page_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_facebook_pages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_phone_numbers: {
        Row: {
          created_at: string
          id: string
          org_id: string
          phone_number: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          phone_number: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          phone_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_phone_numbers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          abn: string | null
          accounting_account_code: string | null
          avg_job_value: number
          billing_status: string
          brand_id: string | null
          created_at: string
          email_templates: Json
          google_review_url: string | null
          gst_registered: boolean
          id: string
          inbound_email_tag: string
          invoice_payment_instructions: string | null
          invoice_pdf_template_path: string | null
          lead_count_this_month: number
          logo_url: string | null
          name: string
          operation_mode: string
          primary_color: string
          review_requests_enabled: boolean
          secondary_color: string
          slug: string
          stripe_connect_account_id: string | null
          stripe_connect_status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_expires_at: string | null
          subscription_tier: string
          support_email: string | null
          support_phone: string | null
          upsell_items: Json
        }
        Insert: {
          abn?: string | null
          accounting_account_code?: string | null
          avg_job_value?: number
          billing_status?: string
          brand_id?: string | null
          created_at?: string
          email_templates?: Json
          google_review_url?: string | null
          gst_registered?: boolean
          id?: string
          inbound_email_tag: string
          invoice_payment_instructions?: string | null
          invoice_pdf_template_path?: string | null
          lead_count_this_month?: number
          logo_url?: string | null
          name: string
          operation_mode?: string
          primary_color?: string
          review_requests_enabled?: boolean
          secondary_color?: string
          slug: string
          stripe_connect_account_id?: string | null
          stripe_connect_status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_expires_at?: string | null
          subscription_tier?: string
          support_email?: string | null
          support_phone?: string | null
          upsell_items?: Json
        }
        Update: {
          abn?: string | null
          accounting_account_code?: string | null
          avg_job_value?: number
          billing_status?: string
          brand_id?: string | null
          created_at?: string
          email_templates?: Json
          google_review_url?: string | null
          gst_registered?: boolean
          id?: string
          inbound_email_tag?: string
          invoice_payment_instructions?: string | null
          invoice_pdf_template_path?: string | null
          lead_count_this_month?: number
          logo_url?: string | null
          name?: string
          operation_mode?: string
          primary_color?: string
          review_requests_enabled?: boolean
          secondary_color?: string
          slug?: string
          stripe_connect_account_id?: string | null
          stripe_connect_status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_expires_at?: string | null
          subscription_tier?: string
          support_email?: string | null
          support_phone?: string | null
          upsell_items?: Json
        }
        Relationships: [
          {
            foreignKeyName: "orgs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_announcements: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: []
      }
      price_list_items: {
        Row: {
          active: boolean
          amount: number
          created_at: string
          description: string | null
          id: string
          label: string
          last_used_at: string | null
          org_id: string
          sort_order: number
          usage_count: number
        }
        Insert: {
          active?: boolean
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          label: string
          last_used_at?: string | null
          org_id: string
          sort_order?: number
          usage_count?: number
        }
        Update: {
          active?: boolean
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          last_used_at?: string | null
          org_id?: string
          sort_order?: number
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_list_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          first_name: string | null
          full_name: string | null
          id: string
          is_hidden_test_profile: boolean
          last_name: string | null
          lat: number | null
          lng: number | null
          location_enabled: boolean
          location_updated_at: string | null
          manager_id: string | null
          org_id: string | null
          phone: string | null
          push_enabled: boolean
          role: string
          suburb: string | null
          test_profile_owner_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          full_name?: string | null
          id: string
          is_hidden_test_profile?: boolean
          last_name?: string | null
          lat?: number | null
          lng?: number | null
          location_enabled?: boolean
          location_updated_at?: string | null
          manager_id?: string | null
          org_id?: string | null
          phone?: string | null
          push_enabled?: boolean
          role?: string
          suburb?: string | null
          test_profile_owner_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          is_hidden_test_profile?: boolean
          last_name?: string | null
          lat?: number | null
          lng?: number | null
          location_enabled?: boolean
          location_updated_at?: string | null
          manager_id?: string | null
          org_id?: string | null
          phone?: string | null
          push_enabled?: boolean
          role?: string
          suburb?: string | null
          test_profile_owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_test_profile_owner_id_fkey"
            columns: ["test_profile_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_signatures: {
        Row: {
          created_at: string
          ip_address: string | null
          org_id: string
          quote_id: string
          signature_text: string
          signed_at: string
          signer_email: string | null
          signer_name: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          ip_address?: string | null
          org_id: string
          quote_id: string
          signature_text: string
          signed_at?: string
          signer_email?: string | null
          signer_name: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          ip_address?: string | null
          org_id?: string
          quote_id?: string
          signature_text?: string
          signed_at?: string
          signer_email?: string | null
          signer_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_signatures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_signatures_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: true
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          declined_at: string | null
          follow_up_count: number
          follow_up_paused: boolean
          id: string
          last_followed_up_at: string | null
          lead_id: string
          line_items: Json | null
          org_id: string
          public_token: string
          scope: string
          sent_at: string | null
          service_type: string | null
          status: string
          terms: string | null
          token_expires_at: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          declined_at?: string | null
          follow_up_count?: number
          follow_up_paused?: boolean
          id?: string
          last_followed_up_at?: string | null
          lead_id: string
          line_items?: Json | null
          org_id: string
          public_token: string
          scope: string
          sent_at?: string | null
          service_type?: string | null
          status?: string
          terms?: string | null
          token_expires_at: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          declined_at?: string | null
          follow_up_count?: number
          follow_up_paused?: boolean
          id?: string
          last_followed_up_at?: string | null
          lead_id?: string
          line_items?: Json | null
          org_id?: string
          public_token?: string
          scope?: string
          sent_at?: string | null
          service_type?: string | null
          status?: string
          terms?: string | null
          token_expires_at?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          org_id: string
          sender_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          org_id: string
          sender_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          org_id?: string
          sender_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      task_items: {
        Row: {
          created_at: string
          id: string
          is_checked: boolean
          label: string
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_checked?: boolean
          label: string
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_checked?: boolean
          label?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_completed: boolean
          org_id: string | null
          title: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_completed?: boolean
          org_id?: string | null
          title: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_completed?: boolean
          org_id?: string | null
          title?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      unrouted_inbound: {
        Row: {
          channel: string
          created_at: string
          id: string
          identifier: string | null
          payload: Json
          reason: string
          resolved_at: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          identifier?: string | null
          payload: Json
          reason: string
          resolved_at?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          identifier?: string | null
          payload?: Json
          reason?: string
          resolved_at?: string | null
        }
        Relationships: []
      }
      workflow_run_steps: {
        Row: {
          error: Json | null
          finished_at: string
          id: string
          node_id: string
          output: Json | null
          run_id: string
          seq: number
          started_at: string
          status: string
        }
        Insert: {
          error?: Json | null
          finished_at: string
          id?: string
          node_id: string
          output?: Json | null
          run_id: string
          seq: number
          started_at: string
          status: string
        }
        Update: {
          error?: Json | null
          finished_at?: string
          id?: string
          node_id?: string
          output?: Json | null
          run_id?: string
          seq?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          finished_at: string | null
          id: string
          org_id: string
          started_at: string
          status: string
          trigger_channel: string | null
          trigger_summary: Json | null
          workflow_key: string
        }
        Insert: {
          finished_at?: string | null
          id?: string
          org_id: string
          started_at?: string
          status?: string
          trigger_channel?: string | null
          trigger_summary?: Json | null
          workflow_key: string
        }
        Update: {
          finished_at?: string | null
          id?: string
          org_id?: string
          started_at?: string
          status?: string
          trigger_channel?: string | null
          trigger_summary?: Json | null
          workflow_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_org_id: { Args: never; Returns: string }
      ensure_monthly_reporting_schedule: { Args: never; Returns: string }
      expire_overdue_leads: { Args: never; Returns: undefined }
      get_effective_feature_switch: {
        Args: { p_feature_key: string; p_org_id: string }
        Returns: boolean
      }
      hide_monthly_closed_leads: {
        Args: { p_hidden_at?: string; p_org_id?: string }
        Returns: number
      }
      is_platform_admin: { Args: never; Returns: boolean }
      run_monthly_reporting_maintenance: {
        Args: { p_org_id?: string; p_run_at?: string }
        Returns: Json
      }
      snapshot_monthly_reporting: {
        Args: { p_month_start?: string; p_org_id?: string }
        Returns: {
          agent_rows_upserted: number
          org_rows_upserted: number
        }[]
      }
      upsert_monthly_agent_reports: {
        Args: { p_month_start: string; p_org_id?: string }
        Returns: number
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
