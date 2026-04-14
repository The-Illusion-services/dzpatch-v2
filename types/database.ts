export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ============================================================
// ENUMS
// ============================================================
export type UserRole = 'customer' | 'rider' | 'fleet_manager' | 'admin';
export type KycStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected';
export type OrderStatus =
  | 'pending'
  | 'matched'
  | 'pickup_en_route'
  | 'arrived_pickup'
  | 'in_transit'
  | 'arrived_dropoff'
  | 'delivered'
  | 'completed'
  | 'cancelled';
export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired';
export type PackageSize = 'small' | 'medium' | 'large' | 'extra_large';
export type VehicleType = 'bicycle' | 'motorcycle' | 'car' | 'van' | 'truck';
export type DocumentType = 'drivers_license' | 'vehicle_insurance' | 'plate_photo' | 'national_id' | 'other';
export type DocumentStatus = 'pending' | 'approved' | 'rejected';
export type WalletOwnerType = 'customer' | 'rider' | 'fleet' | 'platform';
export type TransactionType =
  | 'credit'
  | 'debit'
  | 'commission_credit'
  | 'commission_debit'
  | 'withdrawal'
  | 'refund'
  | 'adjustment';
export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'rejected';
export type NotificationType = 'order_update' | 'payment' | 'promo' | 'system' | 'chat' | 'sos';
export type SosStatus = 'active' | 'acknowledged' | 'resolved';
export type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';
export type CancellationActor = 'customer' | 'rider' | 'system' | 'admin';
export type FleetPayStructure = 'percentage' | 'flat_rate';
export type PromoDiscountType = 'percentage' | 'flat';
export type PartnerAccountStatus = 'active' | 'inactive' | 'suspended';
export type PartnerPricingMode = 'partner_submitted' | 'fixed';
export type PartnerDeliveryStatus =
  | 'accepted'
  | 'rider_assigned'
  | 'arrived_pickup'
  | 'picked_up'
  | 'in_transit'
  | 'arrived_dropoff'
  | 'delivered'
  | 'cancelled'
  | 'failed'
  | 'failed_no_rider';
export type PartnerPricingSource = 'partner_submitted' | 'partner_contract';
export type PartnerWebhookDeliveryStatus = 'pending' | 'delivered' | 'failed';
export type PartnerAuditActorType = 'partner' | 'admin' | 'service' | 'system';
export type PartnerDeliveryCodeStatus = 'active' | 'used' | 'expired';

// ============================================================
// TABLE ROW TYPES
// ============================================================
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          full_name: string;
          phone: string;
          email: string | null;
          avatar_url: string | null;
          kyc_status: KycStatus;
          kyc_id_url: string | null;
          is_active: boolean;
          is_banned: boolean;
          ban_reason: string | null;
          push_token: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role: UserRole;
          full_name: string;
          phone: string;
          email?: string | null;
          avatar_url?: string | null;
          kyc_status?: KycStatus;
          kyc_id_url?: string | null;
          is_active?: boolean;
          is_banned?: boolean;
          ban_reason?: string | null;
          push_token?: string | null;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      riders: {
        Row: {
          id: string;
          profile_id: string;
          fleet_id: string | null;
          vehicle_type: VehicleType;
          vehicle_plate: string | null;
          vehicle_make: string | null;
          vehicle_model: string | null;
          vehicle_year: number | null;
          vehicle_color: string | null;
          documents_verified: boolean;
          is_approved: boolean;
          is_online: boolean;
          current_location: unknown | null;
          location_updated_at: string | null;
          total_trips: number;
          total_earnings: number;
          average_rating: number;
          rating_count: number;
          unpaid_commission_count: number;
          is_commission_locked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          vehicle_type: VehicleType;
          fleet_id?: string | null;
          vehicle_plate?: string | null;
          vehicle_make?: string | null;
          vehicle_model?: string | null;
          vehicle_year?: number | null;
          vehicle_color?: string | null;
        };
        Update: {
          vehicle_type?: VehicleType;
          vehicle_plate?: string | null;
          vehicle_make?: string | null;
          vehicle_model?: string | null;
          vehicle_year?: number | null;
          vehicle_color?: string | null;
          is_online?: boolean;
          documents_verified?: boolean;
          is_approved?: boolean;
          is_commission_locked?: boolean;
          unpaid_commission_count?: number;
        };
        Relationships: [];
      };
      fleets: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          logo_url: string | null;
          fleet_code: string;
          commission_type: FleetPayStructure;
          commission_rate: number;
          payout_schedule: string;
          bank_name: string | null;
          bank_account_number: string | null;
          bank_account_name: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          name: string;
          fleet_code: string;
          commission_type?: FleetPayStructure;
          commission_rate?: number;
          payout_schedule?: string;
          logo_url?: string | null;
          bank_name?: string | null;
          bank_account_number?: string | null;
          bank_account_name?: string | null;
        };
        Update: Partial<Database['public']['Tables']['fleets']['Insert']>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          customer_id: string;
          rider_id: string | null;
          status: OrderStatus;
          pickup_address: string;
          pickup_location: unknown;
          pickup_contact_name: string | null;
          pickup_contact_phone: string | null;
          dropoff_address: string;
          dropoff_location: unknown;
          dropoff_contact_name: string | null;
          dropoff_contact_phone: string | null;
          category_id: string | null;
          package_size: PackageSize;
          package_description: string | null;
          package_notes: string | null;
          distance_km: number | null;
          dynamic_price: number;
          suggested_price: number | null;
          final_price: number | null;
          vat_amount: number;
          platform_commission_rate: number;
          platform_commission_amount: number;
          fleet_commission_rate: number;
          fleet_commission_amount: number;
          rider_net_amount: number;
          promo_code_id: string | null;
          discount_amount: number;
          delivery_code: string | null;
          delivery_code_verified: boolean;
          pod_photo_url: string | null;
          matched_at: string | null;
          picked_up_at: string | null;
          delivered_at: string | null;
          cancelled_at: string | null;
          expires_at: string | null;
          service_area_id: string | null;
          payment_method: 'cash' | 'wallet';
          rider_profile_id: string | null;
          failed_delivery_attempts: number;
          delivery_locked_until: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // always via create_order RPC
        Update: {
          rider_id?: string | null;
          status?: OrderStatus;
          matched_at?: string | null;
          picked_up_at?: string | null;
          delivered_at?: string | null;
          cancelled_at?: string | null;
          expires_at?: string | null;
          delivery_code_verified?: boolean;
          failed_delivery_attempts?: number;
          delivery_locked_until?: string | null;
          pod_photo_url?: string | null;
          payment_method?: 'cash' | 'wallet';
          rider_profile_id?: string | null;
        };
        Relationships: [];
      };
      bids: {
        Row: {
          id: string;
          order_id: string;
          rider_id: string;
          amount: number;
          status: BidStatus;
          parent_bid_id: string | null;
          metadata: Json | null;
          expires_at: string | null;
          negotiation_round: number;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // via place_bid RPC
        Update: {
          status?: BidStatus;
          parent_bid_id?: string | null;
          metadata?: Json | null;
          expires_at?: string | null;
          negotiation_round?: number;
        };
        Relationships: [];
      };
      wallets: {
        Row: {
          id: string;
          owner_type: WalletOwnerType;
          owner_id: string;
          balance: number;
          currency: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_type: WalletOwnerType;
          owner_id: string;
          balance?: number;
          currency?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          balance?: number;
          currency?: string;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          wallet_id: string;
          type: TransactionType;
          amount: number;
          balance_before: number;
          balance_after: number;
          reference: string;
          description: string | null;
          order_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      withdrawals: {
        Row: {
          id: string;
          wallet_id: string;
          amount: number;
          bank_name: string;
          bank_code: string;
          account_number: string;
          account_name: string;
          status: WithdrawalStatus;
          paystack_transfer_code: string | null;
          paystack_reference: string | null;
          processed_by: string | null;
          processed_at: string | null;
          rejection_reason: string | null;
          transaction_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // via request_withdrawal RPC
        Update: never;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationType;
          title: string;
          body: string;
          data: Json | null;
          is_read: boolean;
          is_pushed: boolean;
          created_at: string;
        };
        Insert: never;
        Update: {
          is_read?: boolean;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          order_id: string;
          sender_id: string;
          message: string;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          order_id: string;
          sender_id: string;
          message: string;
        };
        Update: {
          is_read?: boolean;
        };
        Relationships: [];
      };
      ratings: {
        Row: {
          id: string;
          order_id: string;
          customer_id: string;
          rider_id: string;
          score: number;
          review: string | null;
          created_at: string;
        };
        Insert: {
          order_id: string;
          customer_id: string;
          rider_id: string;
          score: number;
          review?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      saved_addresses: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          address: string;
          address_line: string | null;
          location: unknown;
          latitude: number | null;
          longitude: number | null;
          place_id: string | null;
          is_default: boolean;
          use_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          label: string;
          address: string;
          address_line?: string | null;
          location?: unknown;
          latitude?: number | null;
          longitude?: number | null;
          place_id?: string | null;
          is_default?: boolean;
        };
        Update: {
          label?: string;
          address?: string;
          address_line?: string | null;
          location?: unknown;
          latitude?: number | null;
          longitude?: number | null;
          place_id?: string | null;
          use_count?: number;
          is_default?: boolean;
        };
        Relationships: [];
      };
      package_categories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          icon_name: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      promo_codes: {
        Row: {
          id: string;
          code: string;
          description: string | null;
          discount_type: PromoDiscountType;
          discount_value: number;
          min_order_amount: number;
          max_discount_amount: number | null;
          max_uses: number | null;
          used_count: number;
          max_uses_per_user: number;
          is_active: boolean;
          starts_at: string;
          expires_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      pricing_rules: {
        Row: {
          id: string;
          service_area_id: string | null;
          base_rate: number;
          per_km_rate: number;
          min_price: number;
          max_price: number | null;
          vat_percentage: number;
          surge_multiplier: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          service_area_id?: string | null;
          base_rate: number;
          per_km_rate: number;
          min_price: number;
          max_price?: number | null;
          vat_percentage?: number;
          surge_multiplier?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          service_area_id?: string | null;
          base_rate?: number;
          per_km_rate?: number;
          min_price?: number;
          max_price?: number | null;
          vat_percentage?: number;
          surge_multiplier?: number;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      partner_accounts: {
        Row: {
          id: string;
          name: string;
          slug: string;
          status: PartnerAccountStatus;
          api_key_hash: string;
          webhook_secret: string;
          webhook_url: string;
          pricing_mode: PartnerPricingMode;
          fixed_price_amount: number | null;
          dispatch_ttl_minutes: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          status?: PartnerAccountStatus;
          api_key_hash: string;
          webhook_secret: string;
          webhook_url: string;
          pricing_mode?: PartnerPricingMode;
          fixed_price_amount?: number | null;
          dispatch_ttl_minutes?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
          status?: PartnerAccountStatus;
          api_key_hash?: string;
          webhook_secret?: string;
          webhook_url?: string;
          pricing_mode?: PartnerPricingMode;
          fixed_price_amount?: number | null;
          dispatch_ttl_minutes?: number;
          metadata?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      partner_deliveries: {
        Row: {
          id: string;
          partner_account_id: string;
          external_order_id: string;
          external_reference: string | null;
          idempotency_key: string;
          request_fingerprint: string;
          dzpatch_order_id: string | null;
          status: PartnerDeliveryStatus;
          request_payload: Json;
          response_payload: Json | null;
          submitted_fee: number;
          applied_fee: number;
          pricing_source: PartnerPricingSource;
          delivery_code: string | null;
          delivery_code_status: PartnerDeliveryCodeStatus;
          delivery_code_generated_at: string | null;
          attempt_count: number;
          last_error: Json | null;
          accepted_at: string;
          completed_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          partner_account_id: string;
          external_order_id: string;
          external_reference?: string | null;
          idempotency_key: string;
          request_fingerprint: string;
          dzpatch_order_id?: string | null;
          status?: PartnerDeliveryStatus;
          request_payload: Json;
          response_payload?: Json | null;
          submitted_fee: number;
          applied_fee: number;
          pricing_source: PartnerPricingSource;
          delivery_code?: string | null;
          delivery_code_status?: PartnerDeliveryCodeStatus;
          delivery_code_generated_at?: string | null;
          attempt_count?: number;
          last_error?: Json | null;
          accepted_at?: string;
          completed_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          external_reference?: string | null;
          idempotency_key?: string;
          request_fingerprint?: string;
          dzpatch_order_id?: string | null;
          status?: PartnerDeliveryStatus;
          request_payload?: Json;
          response_payload?: Json | null;
          submitted_fee?: number;
          applied_fee?: number;
          pricing_source?: PartnerPricingSource;
          delivery_code?: string | null;
          delivery_code_status?: PartnerDeliveryCodeStatus;
          delivery_code_generated_at?: string | null;
          attempt_count?: number;
          last_error?: Json | null;
          accepted_at?: string;
          completed_at?: string | null;
          cancelled_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      partner_webhook_events: {
        Row: {
          id: string;
          partner_account_id: string;
          partner_delivery_id: string;
          event_id: string;
          event_type: string;
          sequence_version: number;
          payload: Json;
          delivery_attempts: number;
          next_retry_at: string | null;
          last_delivery_at: string | null;
          last_delivery_error: Json | null;
          status: PartnerWebhookDeliveryStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          partner_account_id: string;
          partner_delivery_id: string;
          event_id: string;
          event_type: string;
          sequence_version: number;
          payload: Json;
          delivery_attempts?: number;
          next_retry_at?: string | null;
          last_delivery_at?: string | null;
          last_delivery_error?: Json | null;
          status?: PartnerWebhookDeliveryStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          delivery_attempts?: number;
          next_retry_at?: string | null;
          last_delivery_at?: string | null;
          last_delivery_error?: Json | null;
          status?: PartnerWebhookDeliveryStatus;
          updated_at?: string;
        };
        Relationships: [];
      };
      partner_audit_logs: {
        Row: {
          id: string;
          partner_account_id: string | null;
          action: string;
          actor_type: PartnerAuditActorType;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          partner_account_id?: string | null;
          action: string;
          actor_type: PartnerAuditActorType;
          payload?: Json;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      sos_alerts: {
        Row: {
          id: string;
          user_id: string;
          order_id: string | null;
          location: unknown | null;
          status: SosStatus;
          resolved_by: string | null;
          resolved_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          order_id?: string | null;
          location?: unknown | null;
        };
        Update: never;
        Relationships: [];
      };
      rider_documents: {
        Row: {
          id: string;
          rider_id: string;
          document_type: DocumentType;
          document_url: string;
          status: DocumentStatus;
          rejection_reason: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          rider_id: string;
          document_type: DocumentType;
          document_url: string;
          status?: DocumentStatus;
        };
        Update: {
          document_url?: string;
          status?: DocumentStatus;
          rejection_reason?: string | null;
        };
        Relationships: [];
      };
      rider_bank_accounts: {
        Row: {
          id: string;
          rider_id: string;
          bank_name: string;
          bank_code: string;
          account_number: string;
          account_name: string;
          is_default: boolean;
          paystack_recipient_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          rider_id: string;
          bank_name: string;
          bank_code: string;
          account_number: string;
          account_name: string;
          is_default?: boolean;
        };
        Update: {
          bank_name?: string;
          bank_code?: string;
          account_number?: string;
          account_name?: string;
          is_default?: boolean;
          paystack_recipient_code?: string | null;
        };
        Relationships: [];
      };
      cancellations: {
        Row: {
          id: string;
          order_id: string;
          cancelled_by: CancellationActor;
          user_id: string | null;
          reason: string;
          penalty_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          cancelled_by: CancellationActor;
          user_id?: string | null;
          reason: string;
          penalty_amount?: number;
          created_at?: string;
        };
        Update: {
          user_id?: string | null;
          reason?: string;
          penalty_amount?: number;
        };
        Relationships: [];
      };
      disputes: {
        Row: {
          id: string;
          order_id: string;
          raised_by: string;
          subject: string;
          description: string;
          status: DisputeStatus;
          resolution: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          raised_by: string;
          subject: string;
          description: string;
          status?: DisputeStatus;
          resolution?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          subject?: string;
          description?: string;
          status?: DisputeStatus;
          resolution?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_status_history: {
        Row: {
          id: string;
          order_id: string;
          old_status: OrderStatus | null;
          new_status: OrderStatus;
          changed_by: string | null;
          reason: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          old_status?: OrderStatus | null;
          new_status: OrderStatus;
          changed_by?: string | null;
          reason?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      outstanding_balances: {
        Row: {
          id: string;
          customer_id: string;
          order_id: string;
          rider_id: string;
          amount: number;
          due_date: string;
          paid_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          order_id: string;
          rider_id: string;
          amount: number;
          due_date?: string;
          paid_at?: string | null;
          created_at?: string;
        };
        Update: {
          paid_at?: string | null;
          due_date?: string;
        };
        Relationships: [];
      };
      rider_locations: {
        Row: {
          rider_id: string;
          latitude: number;
          longitude: number;
          order_id: string | null;
          speed: number | null;
          heading: number | null;
          accuracy: number | null;
          updated_at: string;
        };
        Insert: {
          rider_id: string;
          latitude: number;
          longitude: number;
          order_id?: string | null;
          speed?: number | null;
          heading?: number | null;
          accuracy?: number | null;
          updated_at?: string;
        };
        Update: {
          latitude?: number;
          longitude?: number;
          order_id?: string | null;
          speed?: number | null;
          heading?: number | null;
          accuracy?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_order: {
        Args: {
          p_customer_id: string;
          p_pickup_address: string;
          p_pickup_lat: number;
          p_pickup_lng: number;
          p_dropoff_address: string;
          p_dropoff_lat: number;
          p_dropoff_lng: number;
          p_package_size?: PackageSize;
          p_pickup_contact_name?: string;
          p_pickup_contact_phone?: string;
          p_dropoff_contact_name?: string;
          p_dropoff_contact_phone?: string;
          p_category_id?: string;
          p_package_description?: string;
          p_package_notes?: string;
          p_suggested_price?: number;
          p_payment_method?: 'cash' | 'wallet';
          p_promo_code?: string;
          p_service_area_id?: string;
        };
        Returns: Json;
      };
      place_bid: {
        Args: { p_order_id: string; p_rider_id: string; p_amount: number };
        Returns: string;
      };
      accept_bid: {
        Args: { p_bid_id: string; p_customer_id: string };
        Returns: Json;
      };
      update_order_status: {
        Args: {
          p_order_id: string;
          p_new_status: OrderStatus;
          p_changed_by?: string;
          p_reason?: string;
          p_metadata?: Json;
        };
        Returns: void;
      };
      verify_delivery_code: {
        Args: { p_order_id: string; p_rider_id: string; p_code: string };
        Returns: boolean;
      };
      get_order_delivery_code: {
        Args: { p_order_id: string };
        Returns: string | null;
      };
      complete_delivery: {
        Args: { p_order_id: string; p_rider_id: string; p_pod_photo_url?: string | null };
        Returns: Json;
      };
      cancel_order: {
        Args: {
          p_order_id: string;
          p_cancelled_by: CancellationActor;
          p_user_id?: string;
          p_reason?: string;
        };
        Returns: void;
      };
      rate_rider: {
        Args: {
          p_order_id: string;
          p_customer_id: string;
          p_score: number;
          p_review?: string;
        };
        Returns: string;
      };
      toggle_rider_online: {
        Args: { p_rider_id: string; p_is_online: boolean; p_lat?: number; p_lng?: number };
        Returns: void;
      };
      update_rider_location: {
        Args: {
          p_rider_id: string;
          p_lat: number;
          p_lng: number;
          p_order_id?: string;
          p_speed?: number;
          p_heading?: number;
          p_accuracy?: number;
          p_recorded_at?: string;
          p_sequence_number?: number;
        };
        Returns: void;
      };
      get_nearby_orders: {
        Args: { p_rider_id: string; p_radius_meters?: number };
        Returns: {
          order_id: string;
          customer_name: string;
          pickup_address: string;
          dropoff_address: string;
          distance_to_pickup: number;
          dynamic_price: number;
          suggested_price: number | null;
          package_size: PackageSize;
          package_description: string | null;
          category_name: string | null;
          created_at: string;
          expires_at: string | null;
          pickup_lat: number | null;
          pickup_lng: number | null;
        }[];
      };
      get_price_quote: {
        Args: {
          p_pickup_lat: number;
          p_pickup_lng: number;
          p_dropoff_lat: number;
          p_dropoff_lng: number;
          p_package_size?: string;
          p_promo_code?: string;
          p_service_area_id?: string;
        };
        Returns: {
          distance_km: number;
          delivery_fee: number;
          vat_amount: number;
          discount_amount: number;
          total_price: number;
          surge_multiplier: number;
          promo_applied: boolean;
        }[];
      };
      request_withdrawal: {
        Args: {
          p_wallet_id: string;
          p_amount: number;
          p_bank_name: string;
          p_bank_code: string;
          p_account_number: string;
          p_account_name: string;
        };
        Returns: string;
      };
      trigger_sos: {
        Args: { p_user_id: string; p_order_id?: string; p_lat?: number; p_lng?: number };
        Returns: string;
      };
      credit_wallet: {
        Args: {
          p_wallet_id: string;
          p_amount: number;
          p_type: TransactionType;
          p_reference: string;
          p_description?: string;
          p_order_id?: string;
          p_metadata?: Json;
        };
        Returns: string;
      };
      debit_wallet: {
        Args: {
          p_wallet_id: string;
          p_amount: number;
          p_type: TransactionType;
          p_reference: string;
          p_description?: string;
          p_order_id?: string;
          p_metadata?: Json;
        };
        Returns: string;
      };
      send_counter_offer: {
        Args: { p_bid_id: string; p_customer_id: string; p_amount: number };
        Returns: string;
      };
      send_rider_counter_offer: {
        Args: { p_bid_id: string; p_rider_id: string; p_amount: number };
        Returns: string;
      };
      withdraw_bid: {
        Args: { p_bid_id: string; p_rider_id: string };
        Returns: void;
      };
    };
    Enums: {
      user_role: UserRole;
      kyc_status: KycStatus;
      order_status: OrderStatus;
      bid_status: BidStatus;
      package_size: PackageSize;
      vehicle_type: VehicleType;
      document_type: DocumentType;
      document_status: DocumentStatus;
      wallet_owner_type: WalletOwnerType;
      transaction_type: TransactionType;
      withdrawal_status: WithdrawalStatus;
      notification_type: NotificationType;
      sos_status: SosStatus;
      dispute_status: DisputeStatus;
      cancellation_actor: CancellationActor;
      fleet_pay_structure: FleetPayStructure;
      promo_discount_type: PromoDiscountType;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// ============================================================
// CONVENIENCE TYPES
// ============================================================
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Rider = Database['public']['Tables']['riders']['Row'];
export type Fleet = Database['public']['Tables']['fleets']['Row'];
export type Order = Database['public']['Tables']['orders']['Row'];
export type Bid = Database['public']['Tables']['bids']['Row'];
export type Wallet = Database['public']['Tables']['wallets']['Row'];
export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type Withdrawal = Database['public']['Tables']['withdrawals']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
export type SavedAddress = Database['public']['Tables']['saved_addresses']['Row'];
export type PackageCategory = Database['public']['Tables']['package_categories']['Row'];
export type RiderDocument = Database['public']['Tables']['rider_documents']['Row'];
export type RiderBankAccount = Database['public']['Tables']['rider_bank_accounts']['Row'];
export type Cancellation = Database['public']['Tables']['cancellations']['Row'];
export type Dispute = Database['public']['Tables']['disputes']['Row'];
export type OrderStatusHistory = Database['public']['Tables']['order_status_history']['Row'];
export type OutstandingBalance = Database['public']['Tables']['outstanding_balances']['Row'];
export type RiderLocation = Database['public']['Tables']['rider_locations']['Row'];
export type PartnerAccount = Database['public']['Tables']['partner_accounts']['Row'];
export type PartnerDelivery = Database['public']['Tables']['partner_deliveries']['Row'];
export type PartnerWebhookEvent = Database['public']['Tables']['partner_webhook_events']['Row'];
export type PartnerAuditLog = Database['public']['Tables']['partner_audit_logs']['Row'];
