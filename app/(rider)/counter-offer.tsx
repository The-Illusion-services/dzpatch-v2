import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderSummary {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  dynamic_price: number | null;
  suggested_price: number;
  distance_km: number | null;
  package_size: string | null;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CounterOfferScreen() {
  const insets = useSafeAreaInsets();
  const { orderId, customerCounterAmount, myOriginalAmount } = useLocalSearchParams<{
    orderId: string;
    customerCounterAmount?: string;
    myOriginalAmount?: string;
  }>();
  const { riderId } = useAuthStore();
  // If customer sent a counter, pre-fill at their amount and show the banner
  const isCustomerCounter = !!customerCounterAmount && Number(customerCounterAmount) > 0;
  const customerOffer = isCustomerCounter ? Number(customerCounterAmount) : null;

  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(120); // 2 min countdown
  const inputRef = useRef<TextInput>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch order summary ────────────────────────────────────────────────────

  useEffect(() => {
    if (!orderId) return;
    supabase
      .from('orders')
      .select('id, pickup_address, dropoff_address, dynamic_price, suggested_price, distance_km, package_size')
      .eq('id', orderId)
      .single()
      .then(({ data }) => {
        if (data) {
          const o = data as { dynamic_price: number | null; suggested_price: number; [key: string]: any };
          setOrder(o as OrderSummary);
          // Pre-fill at customer's counter amount if we're responding to one, else listed price
          const prefill = isCustomerCounter ? Number(customerCounterAmount) : (o.dynamic_price ?? o.suggested_price);
          setBidAmount(String(Math.round(prefill)));
        }
      });
  }, [orderId]);

  // ── Countdown timer ────────────────────────────────────────────────────────

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Navigate back when countdown reaches 0 (outside setState)
  useEffect(() => {
    if (countdown === 0) {
      router.back();
    }
  }, [countdown]);

  const formatCountdown = () => {
    const m = Math.floor(countdown / 60);
    const s = countdown % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Bid adjustments ────────────────────────────────────────────────────────

  const adjustBid = (delta: number | 'market') => {
    const listed = order ? (order.dynamic_price ?? order.suggested_price) : 0;
    if (delta === 'market') {
      setBidAmount(String(Math.round(listed)));
    } else {
      const current = parseInt(bidAmount || '0', 10);
      setBidAmount(String(Math.max(0, current + delta)));
    }
  };

  // ── Submit bid ─────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!orderId || !riderId) return;
    const amount = parseInt(bidAmount, 10);
    if (!amount || amount < 100) return;
    Keyboard.dismiss();
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc('place_bid', {
        p_order_id: orderId,
        p_rider_id: riderId,
        p_amount: amount,
      });
      if (error) throw error;
      router.replace({
        pathname: '/(rider)/waiting-for-customer' as any,
        params: { orderId, bidAmount: String(amount) },
      });
    } catch (err: any) {
      Alert.alert('Could not place bid', err.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const listedPrice = order ? (order.dynamic_price ?? order.suggested_price) : 0;
  const marketLow = Math.round(listedPrice * 0.9);
  const marketHigh = Math.round(listedPrice * 1.15);
  const bidNum = parseInt(bidAmount || '0', 10);
  const isValidBid = bidNum >= 100;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F7FAFC' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color="#0040e0" />
          </Pressable>
          <Text style={styles.headerTitle}>Counter-Offer</Text>
          <View style={styles.timerBadge}>
            <Ionicons name="time-outline" size={12} color="#0040e0" />
            <Text style={styles.timerText}>{formatCountdown()}</Text>
          </View>
        </View>

        {/* Customer counter-offer banner */}
        {isCustomerCounter && (
          <View style={styles.customerCounterBanner}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#0040e0" />
            <View style={{ flex: 1 }}>
              <Text style={styles.customerCounterLabel}>Customer Counter-Offer</Text>
              <Text style={styles.customerCounterText}>
                Customer offered <Text style={styles.customerCounterAmount}>₦{customerOffer!.toLocaleString()}</Text>
                {myOriginalAmount ? ` (your bid: ₦${Number(myOriginalAmount).toLocaleString()})` : ''}
              </Text>
            </View>
          </View>
        )}

        {/* Order Summary Card */}
        {order && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>LISTED PRICE</Text>
              <Text style={styles.summaryPrice}>₦{listedPrice.toLocaleString()}</Text>
            </View>
            <View style={styles.routeSection}>
              <View style={styles.routeLine} />
              <View style={styles.routeItem}>
                <View style={[styles.routeDot, styles.routeDotPickup]} />
                <View>
                  <Text style={styles.routeTag}>PICKUP</Text>
                  <Text style={styles.routeAddress} numberOfLines={1}>{order.pickup_address}</Text>
                </View>
              </View>
              <View style={styles.routeItem}>
                <View style={[styles.routeDot, styles.routeDotDropoff]} />
                <View>
                  <Text style={styles.routeTag}>DROP-OFF</Text>
                  <Text style={styles.routeAddress} numberOfLines={1}>{order.dropoff_address}</Text>
                </View>
              </View>
            </View>
            {order.distance_km && (
              <Text style={styles.distanceText}>{order.distance_km.toFixed(1)} km route</Text>
            )}
          </View>
        )}

        {/* Bid Amount Input */}
        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>YOUR BID</Text>
          <Pressable style={styles.inputRow} onPress={() => inputRef.current?.focus()}>
            <Text style={styles.currencySymbol}>₦</Text>
            <TextInput
              ref={inputRef}
              style={styles.bidInput}
              value={bidAmount}
              onChangeText={(v) => setBidAmount(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#C4C6CF"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </Pressable>
          <View style={styles.inputDivider} />
        </View>

        {/* Quick Adjustment Chips */}
        <View style={styles.chipsRow}>
          {[100, 200, 500].map((delta) => (
            <Pressable key={delta} style={styles.chip} onPress={() => adjustBid(delta)}>
              <Text style={styles.chipText}>+₦{delta}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.chip, styles.chipMarket]} onPress={() => adjustBid('market')}>
            <Text style={[styles.chipText, styles.chipTextMarket]}>Market Avg</Text>
          </Pressable>
        </View>

        {/* Market Rate Bento */}
        <View style={styles.bentoGrid}>
          <View style={styles.bentoCard}>
            <Ionicons name="trending-up-outline" size={18} color="#0040e0" />
            <Text style={styles.bentoValue}>₦{marketLow.toLocaleString()} – ₦{marketHigh.toLocaleString()}</Text>
            <Text style={styles.bentoLabel}>Market Range</Text>
          </View>
          <View style={styles.bentoCard}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#16A34A" />
            <Text style={[styles.bentoValue, { color: '#16A34A' }]}>94%</Text>
            <Text style={styles.bentoLabel}>Accept Rate</Text>
          </View>
        </View>

        {/* Submit Button */}
        <Pressable
          style={[styles.submitBtn, (!isValidBid || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!isValidBid || submitting}
        >
          <Ionicons name="send" size={16} color="#FFFFFF" />
          <Text style={styles.submitText}>
            {submitting ? 'Submitting...' : `Submit ₦${bidNum.toLocaleString()} Bid`}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: { gap: 16, paddingHorizontal: Spacing[5] },

  // Customer counter banner
  customerCounterBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#EEF2FF', borderRadius: 14,
    padding: 14, borderWidth: 1.5, borderColor: '#0040e0',
  },
  customerCounterLabel: { fontSize: Typography.xs, fontWeight: '800', color: '#0040e0', textTransform: 'uppercase', letterSpacing: 1 },
  customerCounterText: { fontSize: Typography.sm, color: '#000D22', marginTop: 2 },
  customerCounterAmount: { fontWeight: '800', color: '#0040e0' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 4,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  headerTitle: { fontSize: Typography.md, fontWeight: '700', color: '#000D22' },
  timerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  timerText: { fontSize: Typography.xs, fontWeight: '700', color: '#0040e0' },

  // Summary card
  summaryCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 20, gap: 14,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: Typography.xs, fontWeight: '700', color: '#74777e', letterSpacing: 1, textTransform: 'uppercase' },
  summaryPrice: { fontSize: Typography.lg, fontWeight: '800', color: '#0040e0' },
  routeSection: { position: 'relative', paddingLeft: 24, gap: 12 },
  routeLine: {
    position: 'absolute', left: 8, top: 8, bottom: 8,
    width: 1, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: '#C4C6CF',
  },
  routeItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  routeDot: { width: 16, height: 16, borderRadius: 8, marginLeft: -20, marginTop: 2, borderWidth: 3, borderColor: '#FFFFFF' },
  routeDotPickup: { backgroundColor: '#0040e0' },
  routeDotDropoff: { backgroundColor: '#401600' },
  routeTag: { fontSize: 9, fontWeight: '700', color: '#74777e', letterSpacing: 1.5, textTransform: 'uppercase' },
  routeAddress: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22', maxWidth: 260 },
  distanceText: { fontSize: Typography.xs, color: '#74777e', textAlign: 'right' },

  // Input card
  inputCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 20, gap: 8,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  inputLabel: { fontSize: Typography.xs, fontWeight: '700', color: '#74777e', letterSpacing: 1.5, textTransform: 'uppercase' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currencySymbol: { fontSize: 36, fontWeight: '900', color: '#0040e0' },
  bidInput: {
    flex: 1, fontSize: 48, fontWeight: '900', color: '#000D22',
    padding: 0, includeFontPadding: false,
  },
  inputDivider: { height: 2, backgroundColor: '#0040e0', borderRadius: 1 },

  // Chips
  chipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#C4C6CF',
  },
  chipText: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },
  chipMarket: { backgroundColor: '#EEF2FF', borderColor: '#0040e0' },
  chipTextMarket: { color: '#0040e0' },

  // Bento
  bentoGrid: { flexDirection: 'row', gap: 12 },
  bentoCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 16, gap: 4,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  bentoValue: { fontSize: Typography.sm, fontWeight: '800', color: '#000D22', marginTop: 4 },
  bentoLabel: { fontSize: Typography.xs, color: '#74777e' },

  // Submit
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 58, borderRadius: 18,
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 6,
  },
  submitBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  submitText: { fontSize: Typography.md, fontWeight: '800', color: '#FFFFFF' },
});
