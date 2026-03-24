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
        Update: Partial<Database['public']['Tables']['riders']['Insert']>;
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
          created_at: string;
          updated_at: string;
        };
        Insert: never; // always via create_order RPC
        Update: never; // always via update_order_status RPC
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
          created_at: string;
          updated_at: string;
        };
        Insert: never; // via place_bid RPC
        Update: never;
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
        Insert: never; // via create_wallet RPC
        Update: never;
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
        Insert: never; // via rate_rider RPC
        Update: never;
      };
      saved_addresses: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          address: string;
          location: unknown;
          place_id: string | null;
          use_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          label: string;
          address: string;
          location: unknown;
          place_id?: string | null;
        };
        Update: {
          label?: string;
          address?: string;
          location?: unknown;
          place_id?: string | null;
          use_count?: number;
        };
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
        };
        Update: never;
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
          is_default?: boolean;
          paystack_recipient_code?: string | null;
        };
      };
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
      complete_delivery: {
        Args: { p_order_id: string; p_rider_id: string; p_pod_photo_url?: string };
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
