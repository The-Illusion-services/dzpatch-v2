import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import type { PackageSize } from '@/types/database';

// ─── Types ───────────────────────────────────────────────────────────────────

type Category = { id: string; name: string; icon: string };
type PricingRule = {
  base_fare: number;
  per_km_rate: number;
  minimum_fare: number;
  service_fee_rate: number;
};
type CreateOrderParams = {
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_contact_name: string;
  dropoff_contact_phone: string;
  package_size: PackageSize;
  category_id: string | null;
  require_delivery_code: boolean;
  promo_code?: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const SIZES: { value: PackageSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const SIZE_MULTIPLIER: Record<PackageSize, number> = {
  small: 1,
  medium: 1.3,
  large: 1.6,
  extra_large: 2,
};

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CreateOrderScreen() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();

  // Location
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  // Keep lat/lng as 0 until Places is wired — RPC will still work with placeholder coords
  const pickupCoords = useRef({ lat: 6.5244, lng: 3.3792 }); // Lagos default
  const dropoffCoords = useRef({ lat: 0, lng: 0 });

  // Recipient
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');

  // Package
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<PackageSize>('small');
  const [requireDeliveryCode, setRequireDeliveryCode] = useState(true);

  // Promo
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoError, setPromoError] = useState('');

  // Pricing
  const [pricingRule, setPricingRule] = useState<PricingRule | null>(null);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [serviceFee, setServiceFee] = useState(0);
  const [discount, setDiscount] = useState(0);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ─── Load categories + pricing rule on mount ──────────────────────────────

  useEffect(() => {
    async function load() {
      const [catRes, priceRes] = await Promise.all([
        supabase.from('package_categories').select('id, name').order('name'),
        supabase.from('pricing_rules').select('*').eq('is_active', true).limit(1).single(),
      ]);

      if (catRes.data) {
        const iconMap: Record<string, string> = {
          food: '🍔', docs: '📄', documents: '📄', parcel: '📦',
          fashion: '👗', clothing: '👗', electronics: '📱',
        };
        setCategories(
          catRes.data.map((c: any) => ({
            id: c.id,
            name: c.name,
            icon: iconMap[c.name.toLowerCase()] ?? '📦',
          }))
        );
        if (catRes.data[0]) setSelectedCategory(catRes.data[0].id);
      }

      if (priceRes.data) setPricingRule(priceRes.data as PricingRule);
    }
    load();
  }, []);

  // ─── Recalculate price whenever inputs change ─────────────────────────────

  useEffect(() => {
    if (!pricingRule) return;

    // Estimate distance: if both addresses set, use fixed 5km placeholder until
    // Places coords are wired in. Real distance calc happens server-side in RPC.
    const estimatedKm = pickupAddress && dropoffAddress ? 5 : 0;
    const multiplier = SIZE_MULTIPLIER[selectedSize];

    const base = Math.max(
      pricingRule.minimum_fare,
      pricingRule.base_fare + estimatedKm * pricingRule.per_km_rate
    ) * multiplier;

    const svc = base * pricingRule.service_fee_rate;
    setDeliveryFee(Math.round(base));
    setServiceFee(Math.round(svc));
  }, [pricingRule, pickupAddress, dropoffAddress, selectedSize]);

  const total = deliveryFee + serviceFee - discount;

  // ─── Apply promo ──────────────────────────────────────────────────────────

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoError('');

    const { data } = await supabase
      .from('promo_codes')
      .select('id, discount_type, discount_value, min_order_amount, is_active')
      .eq('code', promoCode.trim().toUpperCase())
      .eq('is_active', true)
      .single();

    if (!data) {
      setPromoError('Invalid or expired promo code');
      return;
    }
    if (data.min_order_amount && deliveryFee < data.min_order_amount) {
      setPromoError(`Min order ₦${data.min_order_amount.toLocaleString()} required`);
      return;
    }

    const disc =
      data.discount_type === 'percentage'
        ? Math.round((deliveryFee * data.discount_value) / 100)
        : data.discount_value;
    setDiscount(disc);
    setPromoApplied(true);
  };

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleFindRider = async () => {
    setError('');

    if (!pickupAddress.trim()) { setError('Enter pick-up address'); return; }
    if (!dropoffAddress.trim()) { setError('Enter drop-off address'); return; }
    if (!recipientName.trim()) { setError('Enter recipient name'); return; }
    if (!recipientPhone.trim()) { setError('Enter recipient phone'); return; }

    setSubmitting(true);
    try {
      const params: CreateOrderParams = {
        pickup_address: pickupAddress.trim(),
        pickup_lat: pickupCoords.current.lat,
        pickup_lng: pickupCoords.current.lng,
        dropoff_address: dropoffAddress.trim(),
        dropoff_lat: dropoffCoords.current.lat,
        dropoff_lng: dropoffCoords.current.lng,
        dropoff_contact_name: recipientName.trim(),
        dropoff_contact_phone: recipientPhone.trim(),
        package_size: selectedSize,
        category_id: selectedCategory,
        require_delivery_code: requireDeliveryCode,
        ...(promoApplied ? { promo_code: promoCode.trim().toUpperCase() } : {}),
      };

      const { data, error: rpcErr } = await supabase.rpc('create_order', params as any);
      if (rpcErr) throw rpcErr;

      router.replace({
        pathname: '/(customer)/order-tracking',
        params: { orderId: (data as any)?.order_id ?? data },
      } as any);
    } catch (err: any) {
      setError(err.message ?? 'Failed to create order. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Create Shipment</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Locations ─────────────────────────────────────────────────────── */}
        <Section title="Locations">
          <View style={styles.locationsCard}>
            {/* Dashed connector line */}
            <View style={styles.dashLine} />

            {/* FROM */}
            <View style={styles.locRow}>
              <View style={styles.dotFrom} />
              <View style={styles.locInputWrap}>
                <Text style={styles.locLabel}>FROM</Text>
                <TextInput
                  style={styles.locInput}
                  placeholder="Search pick-up address..."
                  placeholderTextColor="#74777e"
                  value={pickupAddress}
                  onChangeText={setPickupAddress}
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* TO */}
            <View style={[styles.locRow, { marginTop: 20 }]}>
              <View style={styles.dotTo}>
                <View style={styles.dotToInner} />
              </View>
              <View style={styles.locInputWrap}>
                <Text style={styles.locLabelTo}>TO</Text>
                <TextInput
                  style={styles.locInput}
                  placeholder="Where is it going?"
                  placeholderTextColor="#74777e"
                  value={dropoffAddress}
                  onChangeText={setDropoffAddress}
                  returnKeyType="next"
                />
              </View>
            </View>
          </View>
        </Section>

        {/* ── Recipient ─────────────────────────────────────────────────────── */}
        <Section title="Recipient">
          <View style={styles.rowInputs}>
            <View style={styles.halfInput}>
              <Text style={styles.inputLabel}>FULL NAME</Text>
              <TextInput
                style={styles.textInput}
                placeholder="John Doe"
                placeholderTextColor="#74777e"
                value={recipientName}
                onChangeText={setRecipientName}
              />
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.inputLabel}>PHONE NUMBER</Text>
              <TextInput
                style={styles.textInput}
                placeholder="+234 --- --- ----"
                placeholderTextColor="#74777e"
                value={recipientPhone}
                onChangeText={setRecipientPhone}
                keyboardType="phone-pad"
              />
            </View>
          </View>
        </Section>

        {/* ── Package Details ────────────────────────────────────────────────── */}
        <Section title="Package Details">
          {/* Category */}
          <Text style={styles.inputLabel}>CATEGORY</Text>
          <View style={styles.categoryGrid}>
            {(categories.length > 0
              ? categories
              : [
                  { id: 'food', name: 'Food', icon: '🍔' },
                  { id: 'docs', name: 'Docs', icon: '📄' },
                  { id: 'parcel', name: 'Parcel', icon: '📦' },
                  { id: 'fashion', name: 'Fashion', icon: '👗' },
                ]
            ).map((cat) => (
              <Pressable
                key={cat.id}
                style={[styles.categoryBtn, selectedCategory === cat.id && styles.categoryBtnActive]}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text style={[styles.categoryLabel, selectedCategory === cat.id && styles.categoryLabelActive]}>
                  {cat.name}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Size */}
          <Text style={[styles.inputLabel, { marginTop: 16 }]}>SIZE ESTIMATE</Text>
          <View style={styles.sizeBar}>
            {SIZES.map((s) => (
              <Pressable
                key={s.value}
                style={[styles.sizeBtn, selectedSize === s.value && styles.sizeBtnActive]}
                onPress={() => setSelectedSize(s.value)}
              >
                <Text style={[styles.sizeBtnText, selectedSize === s.value && styles.sizeBtnTextActive]}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Delivery Code Toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleIconWrap}>
              <Text style={{ fontSize: 20 }}>🔐</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Require Delivery Code</Text>
              <Text style={styles.toggleSubtitle}>Rider must enter 4-digit code to finish</Text>
            </View>
            <Switch
              value={requireDeliveryCode}
              onValueChange={setRequireDeliveryCode}
              trackColor={{ false: '#c4c6cf', true: '#0040e0' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Section>

        {/* ── Promotions ────────────────────────────────────────────────────── */}
        <Section title="Promotions">
          <View style={styles.promoRow}>
            <TextInput
              style={[styles.promoInput, promoApplied && styles.promoInputApplied]}
              placeholder="Promo code"
              placeholderTextColor="#74777e"
              value={promoCode}
              onChangeText={(v) => { setPromoCode(v); setPromoError(''); setPromoApplied(false); setDiscount(0); }}
              autoCapitalize="characters"
              editable={!promoApplied}
            />
            <Pressable
              style={[styles.promoApplyBtn, promoApplied && styles.promoAppliedBtn]}
              onPress={handleApplyPromo}
              disabled={promoApplied}
            >
              <Text style={styles.promoApplyText}>{promoApplied ? '✓' : 'Apply'}</Text>
            </Pressable>
          </View>
          {promoError ? <Text style={styles.promoError}>{promoError}</Text> : null}
          {promoApplied ? (
            <Text style={styles.promoSuccess}>✓ Discount applied: -₦{discount.toLocaleString()}</Text>
          ) : null}
        </Section>

        {/* ── Pricing Summary ───────────────────────────────────────────────── */}
        <View style={styles.pricingCard}>
          <View style={styles.pricingRow}>
            <Text style={styles.pricingLabel}>Delivery Fee</Text>
            <Text style={styles.pricingValue}>₦{deliveryFee.toLocaleString()}</Text>
          </View>
          <View style={styles.pricingRow}>
            <Text style={styles.pricingLabel}>Service & Tax</Text>
            <Text style={styles.pricingValue}>₦{serviceFee.toLocaleString()}</Text>
          </View>
          {discount > 0 && (
            <View style={styles.pricingRow}>
              <Text style={[styles.pricingLabel, { color: '#ffb692' }]}>Discount</Text>
              <Text style={[styles.pricingValue, { color: '#ffb692' }]}>-₦{discount.toLocaleString()}</Text>
            </View>
          )}
          <View style={styles.pricingDivider} />
          <View style={styles.pricingTotal}>
            <View>
              <Text style={styles.pricingTotalLabel}>TOTAL PAYABLE</Text>
              <Text style={styles.pricingTotalAmount}>₦{total.toLocaleString()}</Text>
            </View>
            <Text style={{ fontSize: 32 }}>⚡</Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Spacer for fixed bottom bar */}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ── Bottom CTA Bar ────────────────────────────────────────────────── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={styles.saveDraftBtn} onPress={() => router.back()}>
          <Text style={styles.saveDraftText}>Save Draft</Text>
        </Pressable>
        <Pressable
          style={[styles.findRiderBtn, submitting && styles.findRiderBtnDisabled]}
          onPress={handleFindRider}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.findRiderText}>⚡ Find Rider · ₦{total.toLocaleString()}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 20,
    color: '#0040e0',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: '#000D22',
    letterSpacing: -0.3,
  },
  scroll: {
    paddingHorizontal: Spacing[5],
    paddingBottom: 100,
    paddingTop: 20,
    gap: 24,
  },

  // Section
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: Typography.bold,
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },

  // Locations
  locationsCard: {
    backgroundColor: '#F1F4F6',
    borderRadius: 20,
    padding: 20,
    position: 'relative',
  },
  dashLine: {
    position: 'absolute',
    left: 27,
    top: 42,
    bottom: 42,
    width: 1,
    borderStyle: 'dashed',
    borderLeftWidth: 2,
    borderColor: 'rgba(196,198,207,0.5)',
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    zIndex: 1,
  },
  dotFrom: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#0040e0',
    backgroundColor: '#FFFFFF',
    marginTop: 22,
    flexShrink: 0,
  },
  dotTo: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#0A2342',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    flexShrink: 0,
  },
  dotToInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  locInputWrap: {
    flex: 1,
    gap: 4,
  },
  locLabel: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: '#0040e0',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  locLabelTo: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  locInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: '#000D22',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },

  // Recipient
  rowInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
    gap: 6,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: '#324768',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  textInput: {
    backgroundColor: '#E0E3E5',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: '#000D22',
  },

  // Category
  categoryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#F1F4F6',
    borderRadius: 16,
    gap: 6,
  },
  categoryBtnActive: {
    backgroundColor: '#0A2342',
  },
  categoryIcon: {
    fontSize: 22,
  },
  categoryLabel: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  categoryLabelActive: {
    color: '#FFFFFF',
  },

  // Size
  sizeBar: {
    flexDirection: 'row',
    backgroundColor: '#E0E3E5',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  sizeBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  sizeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  sizeBtnText: {
    fontSize: 11,
    fontWeight: Typography.bold,
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sizeBtnTextActive: {
    color: '#000D22',
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F1F4F6',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  toggleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffdbcb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#000D22',
  },
  toggleSubtitle: {
    fontSize: Typography.xs,
    color: '#44474e',
    marginTop: 2,
  },

  // Promo
  promoRow: {
    flexDirection: 'row',
    gap: 10,
  },
  promoInput: {
    flex: 1,
    backgroundColor: '#F1F4F6',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: '#000D22',
    letterSpacing: 1,
  },
  promoInputApplied: {
    backgroundColor: '#dde1ff',
  },
  promoApplyBtn: {
    backgroundColor: '#0A2342',
    borderRadius: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoAppliedBtn: {
    backgroundColor: '#0040e0',
  },
  promoApplyText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#FFFFFF',
  },
  promoError: {
    fontSize: Typography.xs,
    color: '#ba1a1a',
    marginTop: 4,
  },
  promoSuccess: {
    fontSize: Typography.xs,
    color: '#0040e0',
    fontWeight: Typography.semibold,
    marginTop: 4,
  },

  // Pricing
  pricingCard: {
    backgroundColor: '#0A2342',
    borderRadius: 24,
    padding: 24,
    gap: 12,
    shadowColor: '#0A2342',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pricingLabel: {
    fontSize: Typography.sm,
    color: 'rgba(255,255,255,0.7)',
  },
  pricingValue: {
    fontSize: Typography.sm,
    color: 'rgba(255,255,255,0.7)',
    fontVariant: ['tabular-nums'],
  },
  pricingDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 4,
  },
  pricingTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  pricingTotalLabel: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: '#b8c3ff',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  pricingTotalAmount: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginTop: 2,
  },

  // Error
  error: {
    fontSize: Typography.sm,
    color: '#ba1a1a',
    textAlign: 'center',
    fontWeight: Typography.medium,
  },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(196,198,207,0.2)',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 8,
  },
  saveDraftBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#c4c6cf',
  },
  saveDraftText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: '#44474e',
  },
  findRiderBtn: {
    flex: 2,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0040e0',
    borderRadius: 16,
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  findRiderBtnDisabled: {
    opacity: 0.6,
  },
  findRiderText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
});
