# DZpatch V2.0 — Database Schema Reference

## Overview
- **26 tables**, **17 ENUMs**, **40+ indexes**, **15 auto-update triggers**
- PostgreSQL with PostGIS extension (spatial queries)
- All wallet mutations via database-level transactions
- Idempotent payment processing via unique `reference` on transactions

---

## Table Map

### Core Entities
| Table | Purpose | Key Relations |
|---|---|---|
| `profiles` | User accounts (extends auth.users) | PK = auth.users.id |
| `fleets` | Fleet organizations | owner_id → profiles |
| `riders` | Rider-specific data | profile_id → profiles, fleet_id → fleets |
| `rider_documents` | KYC document uploads | rider_id → riders |
| `rider_bank_accounts` | Payout bank details | rider_id → riders |
| `saved_addresses` | Customer saved locations | user_id → profiles |

### Delivery Loop
| Table | Purpose | Key Relations |
|---|---|---|
| `package_categories` | Delivery categories (Food, Parcel, etc.) | Standalone |
| `orders` | **Central table** — delivery state machine | customer_id → profiles, rider_id → riders |
| `bids` | Negotiation engine (offers/counter-offers) | order_id → orders, rider_id → riders |
| `order_status_history` | Audit trail of status transitions | order_id → orders |

### Financial Engine
| Table | Purpose | Key Relations |
|---|---|---|
| `wallets` | Balance ledger (customer/rider/fleet/platform) | owner_type + owner_id (polymorphic) |
| `transactions` | Immutable ledger entries | wallet_id → wallets, order_id → orders |
| `withdrawals` | Bank payout request queue | wallet_id → wallets |

### Communication & Notifications
| Table | Purpose | Key Relations |
|---|---|---|
| `chat_messages` | Per-order customer ↔ rider chat | order_id → orders |
| `notifications` | Push + in-app notifications | user_id → profiles |

### Ratings & Promos
| Table | Purpose | Key Relations |
|---|---|---|
| `ratings` | Post-delivery ratings (1-5 stars) | order_id → orders (unique) |
| `promo_codes` | Promotional discount codes | created_by → profiles |

### Platform Config
| Table | Purpose | Key Relations |
|---|---|---|
| `service_areas` | Cities/regions with boundaries | Standalone |
| `pricing_rules` | Per-city pricing config | service_area_id → service_areas |
| `partner_accounts` | Partner API credentials, pricing rules, webhook destination | Standalone |
| `partner_deliveries` | External partner delivery requests and lifecycle state | partner_account_id → partner_accounts, dzpatch_order_id → orders |
| `partner_webhook_events` | Outbound webhook delivery ledger and retry state | partner_delivery_id → partner_deliveries |
| `partner_audit_logs` | Audit trail for partner API activity | partner_account_id → partner_accounts |

### Safety & Admin
| Table | Purpose | Key Relations |
|---|---|---|
| `sos_alerts` | Emergency distress triggers | user_id → profiles |
| `cancellations` | Order cancellation tracking | order_id → orders |
| `disputes` | Dispute cases | order_id → orders |
| `admin_action_logs` | Admin audit trail | admin_id → profiles |

### Telemetry
| Table | Purpose | Key Relations |
|---|---|---|
| `rider_location_logs` | GPS breadcrumbs (offline sync) | rider_id → riders |

### Phase 2 (Pre-created)
| Table | Purpose | Key Relations |
|---|---|---|
| `fleet_messages` | Fleet ↔ rider messaging | fleet_id → fleets |
| `fleet_invites` | Fleet join tracking | fleet_id → fleets, rider_id → riders |

---

## ENUM Types

| Enum | Values |
|---|---|
| `user_role` | customer, rider, fleet_manager, admin |
| `kyc_status` | not_submitted, pending, approved, rejected |
| `order_status` | pending, matched, pickup_en_route, arrived_pickup, in_transit, arrived_dropoff, delivered, completed, cancelled |
| `bid_status` | pending, accepted, rejected, countered, expired |
| `package_size` | small, medium, large, extra_large |
| `vehicle_type` | bicycle, motorcycle, car, van, truck |
| `document_type` | drivers_license, vehicle_insurance, plate_photo, national_id, other |
| `document_status` | pending, approved, rejected |
| `wallet_owner_type` | customer, rider, fleet, platform |
| `transaction_type` | credit, debit, commission_credit, commission_debit, withdrawal, refund, adjustment |
| `withdrawal_status` | pending, processing, completed, rejected |
| `notification_type` | order_update, payment, promo, system, chat, sos |
| `sos_status` | active, acknowledged, resolved |
| `dispute_status` | open, investigating, resolved, dismissed |
| `cancellation_actor` | customer, rider, system, admin |
| `fleet_pay_structure` | percentage, flat_rate |
| `promo_discount_type` | percentage, flat |

---

## Key Design Decisions

1. **One role per account** — no multi-role. A user is customer OR rider OR fleet_manager OR admin.
2. **Wallet balance >= 0** — enforced by CHECK constraint at database level.
3. **Commission-lock** — `riders.unpaid_commission_count` tracks unpaid orders; `is_commission_locked` blocks new orders.
4. **Idempotent payments** — `transactions.reference` is UNIQUE. Duplicate Paystack webhooks are rejected.
5. **Polymorphic wallets** — `wallet_owner_type` + `owner_id` allows one table for all wallet types.
6. **Order = single source of truth** — all status transitions happen in `orders.status`; clients react, never drive.
7. **Offline GPS sync** — `rider_location_logs` has `recorded_at` (device) vs `synced_at` (server) + `sequence_number` for dedup.
8. **Commission snapshot** — commission rates are frozen on `orders` at creation time, not looked up dynamically.

---

## Next Migrations
- `00002_rls_policies.sql` — Row Level Security for all tables
- `00003_rpc_functions.sql` — Database RPCs (create_order, accept_bid, update_order_status, wallet mutations)
