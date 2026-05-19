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
      automation_keywords: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          pattern: string
          tenant_id: number
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_active?: boolean
          pattern: string
          tenant_id: number
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          pattern?: string
          tenant_id?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_keywords_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_keywords_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      calendar_accounts: {
        Row: {
          channel_kind: Database["public"]["Enums"]["channel_type"] | null
          created_at: string
          description: string | null
          external_calendar_id: string
          ghl_metadata: Json | null
          id: number
          integration_account_id: number
          is_active: boolean
          is_default: boolean
          name: string
          provider: string
          slug: string | null
          tenant_id: number
          updated_at: string
          widget_base_url: string
        }
        Insert: {
          channel_kind?: Database["public"]["Enums"]["channel_type"] | null
          created_at?: string
          description?: string | null
          external_calendar_id: string
          ghl_metadata?: Json | null
          id?: number
          integration_account_id: number
          is_active?: boolean
          is_default?: boolean
          name: string
          provider?: string
          slug?: string | null
          tenant_id: number
          updated_at?: string
          widget_base_url: string
        }
        Update: {
          channel_kind?: Database["public"]["Enums"]["channel_type"] | null
          created_at?: string
          description?: string | null
          external_calendar_id?: string
          ghl_metadata?: Json | null
          id?: number
          integration_account_id?: number
          is_active?: boolean
          is_default?: boolean
          name?: string
          provider?: string
          slug?: string | null
          tenant_id?: number
          updated_at?: string
          widget_base_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_accounts_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      calendar_appointments: {
        Row: {
          appointment_status: string
          assigned_user_external_id: string | null
          calendar_account_id: number
          conversation_id: number | null
          end_at: string
          external_appointment_id: string
          external_contact_id: string | null
          id: number
          lead_id: number | null
          match_confidence: number | null
          match_method: string | null
          notes: string | null
          payload: Json
          received_at: string
          source: string | null
          start_at: string
          tenant_id: number
          title: string | null
          updated_at: string
        }
        Insert: {
          appointment_status?: string
          assigned_user_external_id?: string | null
          calendar_account_id: number
          conversation_id?: number | null
          end_at: string
          external_appointment_id: string
          external_contact_id?: string | null
          id?: number
          lead_id?: number | null
          match_confidence?: number | null
          match_method?: string | null
          notes?: string | null
          payload: Json
          received_at?: string
          source?: string | null
          start_at: string
          tenant_id: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          appointment_status?: string
          assigned_user_external_id?: string | null
          calendar_account_id?: number
          conversation_id?: number | null
          end_at?: string
          external_appointment_id?: string
          external_contact_id?: string | null
          id?: number
          lead_id?: number | null
          match_confidence?: number | null
          match_method?: string | null
          notes?: string | null
          payload?: Json
          received_at?: string
          source?: string | null
          start_at?: string
          tenant_id?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_appointments_calendar_account_id_fkey"
            columns: ["calendar_account_id"]
            isOneToOne: false
            referencedRelation: "calendar_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_appointments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      channels: {
        Row: {
          channel_type: Database["public"]["Enums"]["channel_type"]
          created_at: string
          id: number
          is_active: boolean
          label: string | null
          tenant_id: number
          via_provider: Database["public"]["Enums"]["channel_provider"]
        }
        Insert: {
          channel_type: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          id?: number
          is_active?: boolean
          label?: string | null
          tenant_id: number
          via_provider?: Database["public"]["Enums"]["channel_provider"]
        }
        Update: {
          channel_type?: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          id?: number
          is_active?: boolean
          label?: string | null
          tenant_id?: number
          via_provider?: Database["public"]["Enums"]["channel_provider"]
        }
        Relationships: [
          {
            foreignKeyName: "channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      coach_ai_knowledge: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: number
          is_active: boolean
          metadata: Json
          tenant_id: number
          title: string | null
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: number
          is_active?: boolean
          metadata?: Json
          tenant_id: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: number
          is_active?: boolean
          metadata?: Json
          tenant_id?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_ai_knowledge_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_ai_knowledge_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      conversation_events: {
        Row: {
          conversation_id: number
          created_at: string
          event_data: Json
          event_type: string
          id: number
          tenant_id: number
        }
        Insert: {
          conversation_id: number
          created_at?: string
          event_data?: Json
          event_type: string
          id?: number
          tenant_id: number
        }
        Update: {
          conversation_id?: number
          created_at?: string
          event_data?: Json
          event_type?: string
          id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversation_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      conversation_labels: {
        Row: {
          applied_at: string
          applied_by: string | null
          applied_via: string
          conversation_id: number
          label_id: number
          tenant_id: number
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          applied_via: string
          conversation_id: number
          label_id: number
          tenant_id: number
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          applied_via?: string
          conversation_id?: number
          label_id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversation_labels_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "tenant_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_labels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_labels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          content: string | null
          content_type: Database["public"]["Enums"]["message_content_type"]
          conversation_id: number
          id: number
          media_mime: string | null
          media_url: string | null
          sent_at: string
          source: Database["public"]["Enums"]["message_source"]
          tenant_id: number
          transcription: string | null
        }
        Insert: {
          content?: string | null
          content_type?: Database["public"]["Enums"]["message_content_type"]
          conversation_id: number
          id?: number
          media_mime?: string | null
          media_url?: string | null
          sent_at?: string
          source: Database["public"]["Enums"]["message_source"]
          tenant_id: number
          transcription?: string | null
        }
        Update: {
          content?: string | null
          content_type?: Database["public"]["Enums"]["message_content_type"]
          conversation_id?: number
          id?: number
          media_mime?: string | null
          media_url?: string | null
          sent_at?: string
          source?: Database["public"]["Enums"]["message_source"]
          tenant_id?: number
          transcription?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      conversation_notes: {
        Row: {
          author_email: string | null
          author_user_id: string | null
          content: string
          conversation_id: number
          created_at: string
          id: number
          tenant_id: number
        }
        Insert: {
          author_email?: string | null
          author_user_id?: string | null
          content: string
          conversation_id: number
          created_at?: string
          id?: number
          tenant_id: number
        }
        Update: {
          author_email?: string | null
          author_user_id?: string | null
          content?: string
          conversation_id?: number
          created_at?: string
          id?: number
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_paused_until: string | null
          assigned_user_id: string | null
          call_scheduled_at: string | null
          channel_id: number
          conversation_source: string | null
          created_at: string
          current_context: string | null
          custom_fields: Json
          direction: Database["public"]["Enums"]["conversation_direction"]
          emotion: string | null
          first_ai_message_at: string | null
          first_lead_response_at: string | null
          general_context: string | null
          general_motivation: string | null
          ghl_contact_id: string | null
          ghl_conversation_id: string | null
          ghl_opportunity_id: string | null
          ghl_opportunity_status: string | null
          goal: string | null
          handoff_at: string | null
          handoff_cause: Database["public"]["Enums"]["handoff_cause"] | null
          handoff_reason: string | null
          id: number
          is_blocked: boolean
          is_call_scheduling_link_sent: boolean
          is_handoff_to_human: boolean
          is_qualified: boolean | null
          is_unread: boolean
          last_appointment_id: number | null
          last_message_at: string | null
          lead_id: number
          next_action: string | null
          phase_message_count: number
          phase_number: number
          priority: Database["public"]["Enums"]["conversation_priority"] | null
          problem: string | null
          state: Database["public"]["Enums"]["conversation_state"]
          tenant_id: number
          updated_at: string
          urgency: string | null
        }
        Insert: {
          ai_paused_until?: string | null
          assigned_user_id?: string | null
          call_scheduled_at?: string | null
          channel_id: number
          conversation_source?: string | null
          created_at?: string
          current_context?: string | null
          custom_fields?: Json
          direction?: Database["public"]["Enums"]["conversation_direction"]
          emotion?: string | null
          first_ai_message_at?: string | null
          first_lead_response_at?: string | null
          general_context?: string | null
          general_motivation?: string | null
          ghl_contact_id?: string | null
          ghl_conversation_id?: string | null
          ghl_opportunity_id?: string | null
          ghl_opportunity_status?: string | null
          goal?: string | null
          handoff_at?: string | null
          handoff_cause?: Database["public"]["Enums"]["handoff_cause"] | null
          handoff_reason?: string | null
          id?: number
          is_blocked?: boolean
          is_call_scheduling_link_sent?: boolean
          is_handoff_to_human?: boolean
          is_qualified?: boolean | null
          is_unread?: boolean
          last_appointment_id?: number | null
          last_message_at?: string | null
          lead_id: number
          next_action?: string | null
          phase_message_count?: number
          phase_number?: number
          priority?: Database["public"]["Enums"]["conversation_priority"] | null
          problem?: string | null
          state?: Database["public"]["Enums"]["conversation_state"]
          tenant_id: number
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          ai_paused_until?: string | null
          assigned_user_id?: string | null
          call_scheduled_at?: string | null
          channel_id?: number
          conversation_source?: string | null
          created_at?: string
          current_context?: string | null
          custom_fields?: Json
          direction?: Database["public"]["Enums"]["conversation_direction"]
          emotion?: string | null
          first_ai_message_at?: string | null
          first_lead_response_at?: string | null
          general_context?: string | null
          general_motivation?: string | null
          ghl_contact_id?: string | null
          ghl_conversation_id?: string | null
          ghl_opportunity_id?: string | null
          ghl_opportunity_status?: string | null
          goal?: string | null
          handoff_at?: string | null
          handoff_cause?: Database["public"]["Enums"]["handoff_cause"] | null
          handoff_reason?: string | null
          id?: number
          is_blocked?: boolean
          is_call_scheduling_link_sent?: boolean
          is_handoff_to_human?: boolean
          is_qualified?: boolean | null
          is_unread?: boolean
          last_appointment_id?: number | null
          last_message_at?: string | null
          lead_id?: number
          next_action?: string | null
          phase_message_count?: number
          phase_number?: number
          priority?: Database["public"]["Enums"]["conversation_priority"] | null
          problem?: string | null
          state?: Database["public"]["Enums"]["conversation_state"]
          tenant_id?: number
          updated_at?: string
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_last_appointment_id_fkey"
            columns: ["last_appointment_id"]
            isOneToOne: false
            referencedRelation: "calendar_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      dashboard_widgets: {
        Row: {
          created_at: string
          created_by: string | null
          filter_json: Json
          id: number
          metric_key: string
          position: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filter_json?: Json
          id?: number
          metric_key: string
          position?: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filter_json?: Json
          id?: number
          metric_key?: string
          position?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_widgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_widgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          attachment_resource_id: number | null
          created_at: string
          follow_up_delay: string
          id: number
          is_active: boolean
          message_template: string
          name: string
          tenant_id: number
        }
        Insert: {
          attachment_resource_id?: number | null
          created_at?: string
          follow_up_delay: string
          id?: number
          is_active?: boolean
          message_template: string
          name: string
          tenant_id: number
        }
        Update: {
          attachment_resource_id?: number | null
          created_at?: string
          follow_up_delay?: string
          id?: number
          is_active?: boolean
          message_template?: string
          name?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_attachment_resource_id_fkey"
            columns: ["attachment_resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      followup_templates: {
        Row: {
          ai_guide: string | null
          ai_personalize: boolean
          body: string | null
          category: string | null
          channel_kind: Database["public"]["Enums"]["channel_type"]
          created_at: string
          created_by: string | null
          description: string | null
          id: number
          language: string | null
          name: string
          provider: string
          provider_metadata: Json
          provider_template_id: string | null
          status: string
          tenant_id: number
          updated_at: string
          variables: Json
        }
        Insert: {
          ai_guide?: string | null
          ai_personalize?: boolean
          body?: string | null
          category?: string | null
          channel_kind: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: number
          language?: string | null
          name: string
          provider?: string
          provider_metadata?: Json
          provider_template_id?: string | null
          status?: string
          tenant_id: number
          updated_at?: string
          variables?: Json
        }
        Update: {
          ai_guide?: string | null
          ai_personalize?: boolean
          body?: string | null
          category?: string | null
          channel_kind?: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: number
          language?: string | null
          name?: string
          provider?: string
          provider_metadata?: Json
          provider_template_id?: string | null
          status?: string
          tenant_id?: number
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "followup_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      ignored_users: {
        Row: {
          channel_id: number | null
          created_at: string
          external_user_id: string
          id: number
          reason: string | null
          tenant_id: number
        }
        Insert: {
          channel_id?: number | null
          created_at?: string
          external_user_id: string
          id?: number
          reason?: string | null
          tenant_id: number
        }
        Update: {
          channel_id?: number | null
          created_at?: string
          external_user_id?: string
          id?: number
          reason?: string | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ignored_users_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ignored_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ignored_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      integration_accounts: {
        Row: {
          channel_id: number
          connection_config: Json
          created_at: string
          credentials: Json
          credentials_encrypted: Json | null
          id: number
          is_active: boolean
          last_webhook_at: string | null
          provider: Database["public"]["Enums"]["channel_provider"]
          tenant_id: number
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          channel_id: number
          connection_config?: Json
          created_at?: string
          credentials?: Json
          credentials_encrypted?: Json | null
          id?: number
          is_active?: boolean
          last_webhook_at?: string | null
          provider: Database["public"]["Enums"]["channel_provider"]
          tenant_id: number
          updated_at?: string
          webhook_secret?: string
        }
        Update: {
          channel_id?: number
          connection_config?: Json
          created_at?: string
          credentials?: Json
          credentials_encrypted?: Json | null
          id?: number
          is_active?: boolean
          last_webhook_at?: string | null
          provider?: Database["public"]["Enums"]["channel_provider"]
          tenant_id?: number
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_accounts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      label_automation_rules: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          label_id: number
          tenant_id: number
          trigger_type: string
          trigger_value: Json
          trigger_who: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_active?: boolean
          label_id: number
          tenant_id: number
          trigger_type: string
          trigger_value?: Json
          trigger_who: string
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          label_id?: number
          tenant_id?: number
          trigger_type?: string
          trigger_value?: Json
          trigger_who?: string
        }
        Relationships: [
          {
            foreignKeyName: "label_automation_rules_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "tenant_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_automation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_automation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      lead_external_ids: {
        Row: {
          created_at: string
          external_user_id: string
          id: number
          integration_account_id: number
          lead_id: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_user_id: string
          id?: number
          integration_account_id: number
          lead_id: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_user_id?: string
          id?: number
          integration_account_id?: number
          lead_id?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_external_ids_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_external_ids_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_external_ids_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_external_ids_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      leads: {
        Row: {
          channel_id: number
          created_at: string
          email: string | null
          external_id: string
          first_name: string | null
          id: number
          last_message_at: string | null
          last_name: string | null
          location: string | null
          notes: string | null
          phone: string | null
          source_channel: string | null
          tenant_id: number
          timezone: string | null
          tracking_uuid: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          channel_id: number
          created_at?: string
          email?: string | null
          external_id: string
          first_name?: string | null
          id?: number
          last_message_at?: string | null
          last_name?: string | null
          location?: string | null
          notes?: string | null
          phone?: string | null
          source_channel?: string | null
          tenant_id: number
          timezone?: string | null
          tracking_uuid?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          channel_id?: number
          created_at?: string
          email?: string | null
          external_id?: string
          first_name?: string | null
          id?: number
          last_message_at?: string | null
          last_name?: string | null
          location?: string | null
          notes?: string | null
          phone?: string | null
          source_channel?: string | null
          tenant_id?: number
          timezone?: string | null
          tracking_uuid?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      llm_calls: {
        Row: {
          conversation_id: number | null
          cost: number | null
          created_at: string
          error_message: string | null
          id: number
          latency_ms: number | null
          model: string
          provider: Database["public"]["Enums"]["llm_provider"]
          request_payload: Json | null
          response_payload: Json | null
          role: Database["public"]["Enums"]["llm_role"]
          status: Database["public"]["Enums"]["llm_call_status"]
          tenant_id: number
          tokens_in: number | null
          tokens_in_cached: number | null
          tokens_out: number | null
        }
        Insert: {
          conversation_id?: number | null
          cost?: number | null
          created_at?: string
          error_message?: string | null
          id?: number
          latency_ms?: number | null
          model: string
          provider: Database["public"]["Enums"]["llm_provider"]
          request_payload?: Json | null
          response_payload?: Json | null
          role: Database["public"]["Enums"]["llm_role"]
          status: Database["public"]["Enums"]["llm_call_status"]
          tenant_id: number
          tokens_in?: number | null
          tokens_in_cached?: number | null
          tokens_out?: number | null
        }
        Update: {
          conversation_id?: number | null
          cost?: number | null
          created_at?: string
          error_message?: string | null
          id?: number
          latency_ms?: number | null
          model?: string
          provider?: Database["public"]["Enums"]["llm_provider"]
          request_payload?: Json | null
          response_payload?: Json | null
          role?: Database["public"]["Enums"]["llm_role"]
          status?: Database["public"]["Enums"]["llm_call_status"]
          tenant_id?: number
          tokens_in?: number | null
          tokens_in_cached?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      llm_configs: {
        Row: {
          api_key_encrypted: string
          created_at: string
          id: number
          is_active: boolean
          model: string
          price_cached_input_per_1m: number | null
          price_input_per_1m: number | null
          price_output_per_1m: number | null
          provider: Database["public"]["Enums"]["llm_provider"]
          role: Database["public"]["Enums"]["llm_role"]
          tenant_id: number
          updated_at: string
        }
        Insert: {
          api_key_encrypted: string
          created_at?: string
          id?: number
          is_active?: boolean
          model: string
          price_cached_input_per_1m?: number | null
          price_input_per_1m?: number | null
          price_output_per_1m?: number | null
          provider?: Database["public"]["Enums"]["llm_provider"]
          role?: Database["public"]["Enums"]["llm_role"]
          tenant_id: number
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string
          created_at?: string
          id?: number
          is_active?: boolean
          model?: string
          price_cached_input_per_1m?: number | null
          price_input_per_1m?: number | null
          price_output_per_1m?: number | null
          provider?: Database["public"]["Enums"]["llm_provider"]
          role?: Database["public"]["Enums"]["llm_role"]
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      message_schedules: {
        Row: {
          ai_guide: string | null
          ai_personalize: boolean
          attachment_url: string | null
          attempts: number
          auto_cancel_on_reply: boolean
          conversation_id: number
          created_at: string
          created_by_user_id: string | null
          has_attachment: boolean
          id: number
          integration_account_id: number
          last_error: string | null
          message: string | null
          message_type: Database["public"]["Enums"]["schedule_message_kind"]
          resource_id: number | null
          resource_type: Database["public"]["Enums"]["resource_type"] | null
          scheduled_at: string
          sent_at: string | null
          sequence_index: number | null
          status: Database["public"]["Enums"]["schedule_status"]
          template_id: number | null
          tenant_id: number
          triggered_by: string
        }
        Insert: {
          ai_guide?: string | null
          ai_personalize?: boolean
          attachment_url?: string | null
          attempts?: number
          auto_cancel_on_reply?: boolean
          conversation_id: number
          created_at?: string
          created_by_user_id?: string | null
          has_attachment?: boolean
          id?: number
          integration_account_id: number
          last_error?: string | null
          message?: string | null
          message_type?: Database["public"]["Enums"]["schedule_message_kind"]
          resource_id?: number | null
          resource_type?: Database["public"]["Enums"]["resource_type"] | null
          scheduled_at: string
          sent_at?: string | null
          sequence_index?: number | null
          status?: Database["public"]["Enums"]["schedule_status"]
          template_id?: number | null
          tenant_id: number
          triggered_by?: string
        }
        Update: {
          ai_guide?: string | null
          ai_personalize?: boolean
          attachment_url?: string | null
          attempts?: number
          auto_cancel_on_reply?: boolean
          conversation_id?: number
          created_at?: string
          created_by_user_id?: string | null
          has_attachment?: boolean
          id?: number
          integration_account_id?: number
          last_error?: string | null
          message?: string | null
          message_type?: Database["public"]["Enums"]["schedule_message_kind"]
          resource_id?: number | null
          resource_type?: Database["public"]["Enums"]["resource_type"] | null
          scheduled_at?: string
          sent_at?: string | null
          sequence_index?: number | null
          status?: Database["public"]["Enums"]["schedule_status"]
          template_id?: number | null
          tenant_id?: number
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_schedules_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_schedules_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_schedules_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "followup_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      notification_events: {
        Row: {
          attempts: number
          created_at: string
          event_type: string
          id: number
          last_error: string | null
          next_attempt_at: string
          payload: Json
          resend_message_id: string | null
          sent_at: string | null
          status: string
          tenant_id: number
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_type: string
          id?: number
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
          tenant_id: number
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_type?: string
          id?: number
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      pending_invites: {
        Row: {
          accepted_at: string | null
          email: string
          full_name_hint: string | null
          id: number
          invited_at: string
          invited_by: string
          is_agency_admin: boolean
          revoked_at: string | null
          role: Database["public"]["Enums"]["profile_role"]
          tenant_id: number | null
          token: string
          token_expires_at: string
        }
        Insert: {
          accepted_at?: string | null
          email: string
          full_name_hint?: string | null
          id?: number
          invited_at?: string
          invited_by: string
          is_agency_admin?: boolean
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          tenant_id?: number | null
          token: string
          token_expires_at?: string
        }
        Update: {
          accepted_at?: string | null
          email?: string
          full_name_hint?: string | null
          id?: number
          invited_at?: string
          invited_by?: string
          is_agency_admin?: boolean
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          tenant_id?: number | null
          token?: string
          token_expires_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      phases: {
        Row: {
          description: string | null
          max_messages: number
          name: string
          number: number
        }
        Insert: {
          description?: string | null
          max_messages?: number
          name: string
          number: number
        }
        Update: {
          description?: string | null
          max_messages?: number
          name?: string
          number?: number
        }
        Relationships: []
      }
      pipeline_events: {
        Row: {
          conversation_id: number
          event_type: string
          from_value: string | null
          id: number
          occurred_at: string
          source: string
          tenant_id: number
          to_value: string
        }
        Insert: {
          conversation_id: number
          event_type: string
          from_value?: string | null
          id?: number
          occurred_at?: string
          source: string
          tenant_id: number
          to_value: string
        }
        Update: {
          conversation_id?: number
          event_type?: string
          from_value?: string | null
          id?: number
          occurred_at?: string
          source?: string
          tenant_id?: number
          to_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      pipeline_runs: {
        Row: {
          conversation_id: number | null
          correlation_id: string
          created_at: string
          duration_ms: number | null
          ended_at: string | null
          error_message: string | null
          generator_cost_usd: number | null
          generator_model: string | null
          generator_tokens_in: number | null
          generator_tokens_out: number | null
          id: number
          judge_cost_usd: number | null
          judge_decision: string | null
          judge_model: string | null
          judge_tokens_in: number | null
          judge_tokens_out: number | null
          multimodal_audio_seconds: number | null
          multimodal_cost_usd: number | null
          multimodal_image_count: number
          outcome: string
          splitter_cost_usd: number | null
          splitter_model: string | null
          splitter_parts: number | null
          splitter_tokens_in: number | null
          splitter_tokens_out: number | null
          started_at: string
          tenant_id: number
          total_cost_usd: number | null
          total_tokens_in: number | null
          total_tokens_out: number | null
          validator_violations: Json | null
        }
        Insert: {
          conversation_id?: number | null
          correlation_id: string
          created_at?: string
          duration_ms?: number | null
          ended_at?: string | null
          error_message?: string | null
          generator_cost_usd?: number | null
          generator_model?: string | null
          generator_tokens_in?: number | null
          generator_tokens_out?: number | null
          id?: number
          judge_cost_usd?: number | null
          judge_decision?: string | null
          judge_model?: string | null
          judge_tokens_in?: number | null
          judge_tokens_out?: number | null
          multimodal_audio_seconds?: number | null
          multimodal_cost_usd?: number | null
          multimodal_image_count?: number
          outcome?: string
          splitter_cost_usd?: number | null
          splitter_model?: string | null
          splitter_parts?: number | null
          splitter_tokens_in?: number | null
          splitter_tokens_out?: number | null
          started_at?: string
          tenant_id: number
          total_cost_usd?: number | null
          total_tokens_in?: number | null
          total_tokens_out?: number | null
          validator_violations?: Json | null
        }
        Update: {
          conversation_id?: number | null
          correlation_id?: string
          created_at?: string
          duration_ms?: number | null
          ended_at?: string | null
          error_message?: string | null
          generator_cost_usd?: number | null
          generator_model?: string | null
          generator_tokens_in?: number | null
          generator_tokens_out?: number | null
          id?: number
          judge_cost_usd?: number | null
          judge_decision?: string | null
          judge_model?: string | null
          judge_tokens_in?: number | null
          judge_tokens_out?: number | null
          multimodal_audio_seconds?: number | null
          multimodal_cost_usd?: number | null
          multimodal_image_count?: number
          outcome?: string
          splitter_cost_usd?: number | null
          splitter_model?: string | null
          splitter_parts?: number | null
          splitter_tokens_in?: number | null
          splitter_tokens_out?: number | null
          started_at?: string
          tenant_id?: number
          total_cost_usd?: number | null
          total_tokens_in?: number | null
          total_tokens_out?: number | null
          validator_violations?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          is_active: boolean
          is_agency_admin: boolean
          phone: string | null
          role: Database["public"]["Enums"]["profile_role"]
          tenant_id: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          is_agency_admin?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          tenant_id: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          is_agency_admin?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      prompt_block_drafts: {
        Row: {
          base_version: number
          block_key: string
          content: string
          created_at: string
          id: number
          owner_user_id: string
          tenant_id: number | null
          updated_at: string
        }
        Insert: {
          base_version: number
          block_key: string
          content: string
          created_at?: string
          id?: number
          owner_user_id: string
          tenant_id?: number | null
          updated_at?: string
        }
        Update: {
          base_version?: number
          block_key?: string
          content?: string
          created_at?: string
          id?: number
          owner_user_id?: string
          tenant_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_block_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_block_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      prompt_block_versions: {
        Row: {
          change_summary: string | null
          changed_at: string
          changed_by: string | null
          content: string
          id: number
          prompt_block_id: number
          version_number: number
          was_applied: boolean
        }
        Insert: {
          change_summary?: string | null
          changed_at?: string
          changed_by?: string | null
          content: string
          id?: number
          prompt_block_id: number
          version_number: number
          was_applied?: boolean
        }
        Update: {
          change_summary?: string | null
          changed_at?: string
          changed_by?: string | null
          content?: string
          id?: number
          prompt_block_id?: number
          version_number?: number
          was_applied?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "prompt_block_versions_prompt_block_id_fkey"
            columns: ["prompt_block_id"]
            isOneToOne: false
            referencedRelation: "prompt_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_blocks: {
        Row: {
          block_key: string
          channel_override: Database["public"]["Enums"]["channel_type"] | null
          content: string
          created_at: string
          created_by: string | null
          id: number
          is_active: boolean
          sort_order: number
          tenant_id: number | null
          updated_at: string
          version: number
        }
        Insert: {
          block_key: string
          channel_override?: Database["public"]["Enums"]["channel_type"] | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: number
          is_active?: boolean
          sort_order?: number
          tenant_id?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          block_key?: string
          channel_override?: Database["public"]["Enums"]["channel_type"] | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: number
          is_active?: boolean
          sort_order?: number
          tenant_id?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_blocks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_blocks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      resources: {
        Row: {
          created_at: string
          description: string | null
          id: number
          is_active: boolean
          mime_type: string | null
          name: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          storage_path: string | null
          tenant_id: number
          url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          mime_type?: string | null
          name: string
          resource_type: Database["public"]["Enums"]["resource_type"]
          storage_path?: string | null
          tenant_id: number
          url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          mime_type?: string | null
          name?: string
          resource_type?: Database["public"]["Enums"]["resource_type"]
          storage_path?: string | null
          tenant_id?: number
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenant_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          id: number
          metadata: Json
          target_email: string | null
          target_user_id: string | null
          tenant_id: number
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: number
          metadata?: Json
          target_email?: string | null
          target_user_id?: string | null
          tenant_id: number
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: number
          metadata?: Json
          target_email?: string | null
          target_user_id?: string | null
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenant_configs: {
        Row: {
          active_conversation_delay: string
          created_at: string
          debounce_window_seconds: number
          default_audio_language: string
          ghl_fyzon_uuid_field_id: string | null
          ghl_inbound_mode: string
          health_threshold_hours_amber: number
          health_threshold_hours_red: number
          idle_conversation_delay: string
          manychat_inbound_mode: string
          max_messages_per_conversation: number
          tenant_id: number
          timezone: string
          updated_at: string
          wa_inbound_mode: string
          welcome_template_id: number | null
        }
        Insert: {
          active_conversation_delay?: string
          created_at?: string
          debounce_window_seconds?: number
          default_audio_language?: string
          ghl_fyzon_uuid_field_id?: string | null
          ghl_inbound_mode?: string
          health_threshold_hours_amber?: number
          health_threshold_hours_red?: number
          idle_conversation_delay?: string
          manychat_inbound_mode?: string
          max_messages_per_conversation?: number
          tenant_id: number
          timezone?: string
          updated_at?: string
          wa_inbound_mode?: string
          welcome_template_id?: number | null
        }
        Update: {
          active_conversation_delay?: string
          created_at?: string
          debounce_window_seconds?: number
          default_audio_language?: string
          ghl_fyzon_uuid_field_id?: string | null
          ghl_inbound_mode?: string
          health_threshold_hours_amber?: number
          health_threshold_hours_red?: number
          idle_conversation_delay?: string
          manychat_inbound_mode?: string
          max_messages_per_conversation?: number
          tenant_id?: number
          timezone?: string
          updated_at?: string
          wa_inbound_mode?: string
          welcome_template_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_configs_welcome_template_id_fkey"
            columns: ["welcome_template_id"]
            isOneToOne: false
            referencedRelation: "followup_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_followup_config: {
        Row: {
          auto_personalize: boolean
          created_at: string
          default_followup_text: string | null
          enabled: boolean
          followup_voice_examples: string | null
          intervals_hours: number[]
          materialize_lookahead_hours: number
          max_followups_per_lead: number
          tenant_id: number
          updated_at: string
          window_end_hour: number
          window_start_hour: number
          window_timezone: string
        }
        Insert: {
          auto_personalize?: boolean
          created_at?: string
          default_followup_text?: string | null
          enabled?: boolean
          followup_voice_examples?: string | null
          intervals_hours?: number[]
          materialize_lookahead_hours?: number
          max_followups_per_lead?: number
          tenant_id: number
          updated_at?: string
          window_end_hour?: number
          window_start_hour?: number
          window_timezone?: string
        }
        Update: {
          auto_personalize?: boolean
          created_at?: string
          default_followup_text?: string | null
          enabled?: boolean
          followup_voice_examples?: string | null
          intervals_hours?: number[]
          materialize_lookahead_hours?: number
          max_followups_per_lead?: number
          tenant_id?: number
          updated_at?: string
          window_end_hour?: number
          window_start_hour?: number
          window_timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_followup_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_followup_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenant_labels: {
        Row: {
          auto_assign_to: string | null
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          destination_bucket: string | null
          id: number
          is_system: boolean
          name: string
          pause_ai_on_apply: boolean
          resume_ai_on_apply: boolean
          tenant_id: number
          updated_at: string
        }
        Insert: {
          auto_assign_to?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          destination_bucket?: string | null
          id?: number
          is_system?: boolean
          name: string
          pause_ai_on_apply?: boolean
          resume_ai_on_apply?: boolean
          tenant_id: number
          updated_at?: string
        }
        Update: {
          auto_assign_to?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          destination_bucket?: string | null
          id?: number
          is_system?: boolean
          name?: string
          pause_ai_on_apply?: boolean
          resume_ai_on_apply?: boolean
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_labels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_labels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenant_schedules: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: number
          is_active: boolean
          schedule_type: string
          start_time: string
          tenant_id: number
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: number
          is_active?: boolean
          schedule_type?: string
          start_time: string
          tenant_id: number
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: number
          is_active?: boolean
          schedule_type?: string
          start_time?: string
          tenant_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenant_templates: {
        Row: {
          content: string
          description: string | null
          key: string
          updated_at: string
        }
        Insert: {
          content: string
          description?: string | null
          key: string
          updated_at?: string
        }
        Update: {
          content?: string
          description?: string | null
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenant_tokens: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          purpose: string
          revoked_at: string | null
          tenant_id: number
          token: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_active?: boolean
          purpose?: string
          revoked_at?: string | null
          tenant_id: number
          token?: string
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          purpose?: string
          revoked_at?: string | null
          tenant_id?: number
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_email: string | null
          id: number
          is_active: boolean
          name: string
          onboarded_at: string | null
          settings: Json
          setup_step_overrides: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: number
          is_active?: boolean
          name: string
          onboarded_at?: string | null
          settings?: Json
          setup_step_overrides?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: number
          is_active?: boolean
          name?: string
          onboarded_at?: string | null
          settings?: Json
          setup_step_overrides?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      trainer_custom_instructions: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: number
          is_active: boolean
          sort_order: number
          tenant_id: number
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: number
          is_active?: boolean
          sort_order?: number
          tenant_id: number
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: number
          is_active?: boolean
          sort_order?: number
          tenant_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_custom_instructions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_custom_instructions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      trainer_preferences: {
        Row: {
          id: number
          preferences: Json
          tenant_id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          preferences?: Json
          tenant_id: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          preferences?: Json
          tenant_id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainer_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "v_tenant_health"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
    }
    Views: {
      v_tenant_health: {
        Row: {
          active_members: number | null
          approved_wa_templates: number | null
          coach_v3_is_placeholder: boolean | null
          created_at: string | null
          created_by: string | null
          ghl_connected: boolean | null
          has_coach_v3: boolean | null
          has_config: boolean | null
          has_keywords_bienvenida: boolean | null
          has_keywords_leadmagnet: boolean | null
          has_trainer_prefs: boolean | null
          is_active: boolean | null
          is_onboarding_complete: boolean | null
          name: string | null
          onboarded_at: string | null
          slug: string | null
          tenant_id: number | null
          token_ghl: string | null
          token_lead_form: string | null
          token_manychat: string | null
          token_ycloud: string | null
          welcome_template_id: number | null
          ycloud_connected: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      provision_tenant: {
        Args: {
          p_created_by?: string
          p_created_by_email?: string
          p_internal_notes?: string
          p_name: string
          p_slug: string
          p_timezone?: string
        }
        Returns: Json
      }
      tenant_id_for_user: { Args: never; Returns: number }
    }
    Enums: {
      channel_provider: "manychat" | "meta_cloud" | "ghl" | "other" | "ycloud"
      channel_type: "whatsapp" | "instagram_dm" | "facebook_messenger"
      conversation_direction: "inbound" | "outbound" | "untagged"
      conversation_priority: "alta" | "media" | "baja"
      conversation_state: "active" | "paused" | "stopped" | "closed"
      handoff_cause:
        | "A_agenda"
        | "B_derivacion"
        | "C_descualificado"
        | "D_espera"
        | "E_error"
      llm_call_status: "success" | "error" | "fallback"
      llm_provider:
        | "anthropic"
        | "openai"
        | "google"
        | "azure_openai"
        | "custom"
      llm_role: "generator" | "judge" | "splitter" | "transcriber" | "embedder"
      message_content_type:
        | "text"
        | "audio"
        | "image"
        | "video"
        | "file"
        | "mixed"
      message_source: "lead" | "ai" | "system" | "human"
      profile_role: "owner" | "admin" | "viewer"
      resource_type:
        | "pdf"
        | "video"
        | "image"
        | "audio"
        | "link"
        | "document"
        | "other"
      schedule_message_kind: "message" | "follow_up" | "resource"
      schedule_status:
        | "pending"
        | "processing"
        | "sent"
        | "failed"
        | "cancelled"
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
    Enums: {
      channel_provider: ["manychat", "meta_cloud", "ghl", "other", "ycloud"],
      channel_type: ["whatsapp", "instagram_dm", "facebook_messenger"],
      conversation_direction: ["inbound", "outbound", "untagged"],
      conversation_priority: ["alta", "media", "baja"],
      conversation_state: ["active", "paused", "stopped", "closed"],
      handoff_cause: [
        "A_agenda",
        "B_derivacion",
        "C_descualificado",
        "D_espera",
        "E_error",
      ],
      llm_call_status: ["success", "error", "fallback"],
      llm_provider: ["anthropic", "openai", "google", "azure_openai", "custom"],
      llm_role: ["generator", "judge", "splitter", "transcriber", "embedder"],
      message_content_type: [
        "text",
        "audio",
        "image",
        "video",
        "file",
        "mixed",
      ],
      message_source: ["lead", "ai", "system", "human"],
      profile_role: ["owner", "admin", "viewer"],
      resource_type: [
        "pdf",
        "video",
        "image",
        "audio",
        "link",
        "document",
        "other",
      ],
      schedule_message_kind: ["message", "follow_up", "resource"],
      schedule_status: ["pending", "processing", "sent", "failed", "cancelled"],
    },
  },
} as const
