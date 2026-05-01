// Auto-generated via MCP supabase-fyzon.generate_typescript_types (2026-04-20).
// Do not edit manually. Regenerate with: pnpm db:generate-types
// Or from Claude Code with MCP: mcp__supabase-fyzon__generate_typescript_types.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      channels: {
        Row: {
          channel_type: Database['public']['Enums']['channel_type'];
          created_at: string;
          id: number;
          is_active: boolean;
          label: string | null;
          tenant_id: number;
          via_provider: Database['public']['Enums']['channel_provider'];
        };
        Insert: {
          channel_type: Database['public']['Enums']['channel_type'];
          created_at?: string;
          id?: number;
          is_active?: boolean;
          label?: string | null;
          tenant_id: number;
          via_provider?: Database['public']['Enums']['channel_provider'];
        };
        Update: {
          channel_type?: Database['public']['Enums']['channel_type'];
          created_at?: string;
          id?: number;
          is_active?: boolean;
          label?: string | null;
          tenant_id?: number;
          via_provider?: Database['public']['Enums']['channel_provider'];
        };
      };
      coach_ai_knowledge: {
        Row: {
          content: string;
          created_at: string;
          embedding: string | null;
          id: number;
          is_active: boolean;
          metadata: Json;
          tenant_id: number;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          embedding?: string | null;
          id?: number;
          is_active?: boolean;
          metadata?: Json;
          tenant_id: number;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          embedding?: string | null;
          id?: number;
          is_active?: boolean;
          metadata?: Json;
          tenant_id?: number;
          title?: string | null;
          updated_at?: string;
        };
      };
      conversation_events: {
        Row: {
          conversation_id: number;
          created_at: string;
          event_data: Json;
          event_type: string;
          id: number;
          tenant_id: number;
        };
        Insert: {
          conversation_id: number;
          created_at?: string;
          event_data?: Json;
          event_type: string;
          id?: number;
          tenant_id: number;
        };
        Update: {
          conversation_id?: number;
          created_at?: string;
          event_data?: Json;
          event_type?: string;
          id?: number;
          tenant_id?: number;
        };
      };
      conversation_messages: {
        Row: {
          content: string | null;
          content_type: Database['public']['Enums']['message_content_type'];
          conversation_id: number;
          id: number;
          media_mime: string | null;
          media_url: string | null;
          sent_at: string;
          source: Database['public']['Enums']['message_source'];
          tenant_id: number;
          transcription: string | null;
        };
        Insert: {
          content?: string | null;
          content_type?: Database['public']['Enums']['message_content_type'];
          conversation_id: number;
          id?: number;
          media_mime?: string | null;
          media_url?: string | null;
          sent_at?: string;
          source: Database['public']['Enums']['message_source'];
          tenant_id: number;
          transcription?: string | null;
        };
        Update: {
          content?: string | null;
          content_type?: Database['public']['Enums']['message_content_type'];
          conversation_id?: number;
          id?: number;
          media_mime?: string | null;
          media_url?: string | null;
          sent_at?: string;
          source?: Database['public']['Enums']['message_source'];
          tenant_id?: number;
          transcription?: string | null;
        };
      };
      conversations: {
        Row: {
          call_scheduled_at: string | null;
          channel_id: number;
          created_at: string;
          current_context: string | null;
          custom_fields: Json;
          direction: Database['public']['Enums']['conversation_direction'];
          emotion: string | null;
          general_context: string | null;
          general_motivation: string | null;
          goal: string | null;
          handoff_at: string | null;
          handoff_cause: Database['public']['Enums']['handoff_cause'] | null;
          handoff_reason: string | null;
          id: number;
          is_call_scheduling_link_sent: boolean;
          is_handoff_to_human: boolean;
          is_qualified: boolean | null;
          last_message_at: string | null;
          lead_id: number;
          next_action: string | null;
          phase_message_count: number;
          phase_number: number;
          priority: Database['public']['Enums']['conversation_priority'] | null;
          problem: string | null;
          state: Database['public']['Enums']['conversation_state'];
          tenant_id: number;
          updated_at: string;
          urgency: string | null;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      follow_ups: {
        Row: {
          attachment_resource_id: number | null;
          created_at: string;
          follow_up_delay: string;
          id: number;
          is_active: boolean;
          message_template: string;
          name: string;
          tenant_id: number;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      ignored_users: {
        Row: {
          channel_id: number | null;
          created_at: string;
          external_user_id: string;
          id: number;
          reason: string | null;
          tenant_id: number;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      integration_accounts: {
        Row: {
          channel_id: number;
          connection_config: Json;
          created_at: string;
          credentials: Json;
          id: number;
          is_active: boolean;
          provider: Database['public']['Enums']['channel_provider'];
          tenant_id: number;
          updated_at: string;
          webhook_secret: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      lead_external_ids: {
        Row: {
          created_at: string;
          external_user_id: string;
          id: number;
          integration_account_id: number;
          lead_id: number;
          tenant_id: number;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      leads: {
        Row: {
          channel_id: number;
          created_at: string;
          email: string | null;
          external_id: string;
          first_name: string | null;
          id: number;
          last_name: string | null;
          location: string | null;
          notes: string | null;
          phone: string | null;
          source_channel: string | null;
          tenant_id: number;
          updated_at: string;
          username: string | null;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      llm_calls: {
        Row: {
          conversation_id: number | null;
          cost: number | null;
          created_at: string;
          error_message: string | null;
          id: number;
          latency_ms: number | null;
          model: string;
          provider: Database['public']['Enums']['llm_provider'];
          request_payload: Json | null;
          response_payload: Json | null;
          role: Database['public']['Enums']['llm_role'];
          status: Database['public']['Enums']['llm_call_status'];
          tenant_id: number;
          tokens_in: number | null;
          tokens_in_cached: number | null;
          tokens_out: number | null;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      llm_configs: {
        Row: {
          api_key_encrypted: string;
          created_at: string;
          id: number;
          is_active: boolean;
          model: string;
          price_cached_input_per_1m: number | null;
          price_input_per_1m: number | null;
          price_output_per_1m: number | null;
          provider: Database['public']['Enums']['llm_provider'];
          role: Database['public']['Enums']['llm_role'];
          tenant_id: number;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      message_schedules: {
        Row: {
          attachment_url: string | null;
          attempts: number;
          conversation_id: number;
          created_at: string;
          has_attachment: boolean;
          id: number;
          integration_account_id: number;
          last_error: string | null;
          message: string | null;
          message_type: Database['public']['Enums']['schedule_message_kind'];
          resource_id: number | null;
          resource_type: Database['public']['Enums']['resource_type'] | null;
          scheduled_at: string;
          sent_at: string | null;
          status: Database['public']['Enums']['schedule_status'];
          tenant_id: number;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      phases: {
        Row: {
          description: string | null;
          max_messages: number;
          name: string;
          number: number;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string | null;
          id: string;
          role: Database['public']['Enums']['profile_role'];
          tenant_id: number;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      prompt_blocks: {
        Row: {
          block_key: string;
          channel_override: Database['public']['Enums']['channel_type'] | null;
          content: string;
          created_at: string;
          created_by: string | null;
          id: number;
          is_active: boolean;
          sort_order: number;
          tenant_id: number | null;
          updated_at: string;
          version: number;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      resources: {
        Row: {
          created_at: string;
          description: string | null;
          id: number;
          is_active: boolean;
          mime_type: string | null;
          name: string;
          resource_type: Database['public']['Enums']['resource_type'];
          storage_path: string | null;
          tenant_id: number;
          url: string | null;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      tenant_configs: {
        Row: {
          active_conversation_delay: string;
          created_at: string;
          debounce_window_seconds: number;
          idle_conversation_delay: string;
          max_messages_per_conversation: number;
          tenant_id: number;
          timezone: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      tenant_schedules: {
        Row: {
          created_at: string;
          day_of_week: number;
          end_time: string;
          id: number;
          is_active: boolean;
          schedule_type: string;
          start_time: string;
          tenant_id: number;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      tenant_tokens: {
        Row: {
          created_at: string;
          id: number;
          is_active: boolean;
          purpose: string;
          revoked_at: string | null;
          tenant_id: number;
          token: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      tenants: {
        Row: {
          created_at: string;
          id: number;
          is_active: boolean;
          name: string;
          onboarded_at: string | null;
          settings: Json;
          slug: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      tenant_id_for_user: { Args: never; Returns: number };
    };
    Enums: {
      channel_provider: 'manychat' | 'meta_cloud' | 'ghl' | 'other';
      channel_type: 'whatsapp' | 'instagram_dm' | 'facebook_messenger';
      conversation_direction: 'inbound' | 'outbound' | 'untagged';
      conversation_priority: 'alta' | 'media' | 'baja';
      conversation_state: 'active' | 'paused' | 'stopped' | 'closed';
      handoff_cause:
        | 'A_agenda'
        | 'B_derivacion'
        | 'C_descualificado'
        | 'D_espera'
        | 'E_error';
      llm_call_status: 'success' | 'error' | 'fallback';
      llm_provider: 'anthropic' | 'openai' | 'google' | 'azure_openai' | 'custom';
      llm_role: 'generator' | 'judge' | 'splitter' | 'transcriber' | 'embedder';
      message_content_type: 'text' | 'audio' | 'image' | 'video' | 'file' | 'mixed';
      message_source: 'lead' | 'ai' | 'system';
      profile_role: 'owner' | 'admin' | 'viewer';
      resource_type:
        | 'pdf'
        | 'video'
        | 'image'
        | 'audio'
        | 'link'
        | 'document'
        | 'other';
      schedule_message_kind: 'message' | 'follow_up' | 'resource';
      schedule_status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';
    };
    CompositeTypes: Record<string, never>;
  };
};
