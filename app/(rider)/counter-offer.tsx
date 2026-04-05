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
import { adjustCurrencyAmount, buildRiderEarningsBreakdown } from '@/lib/sprint4-ux';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

interface OrderSummary {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  dynamic_price: number | null;
  suggested_price: number;
  distance_km: number | null;
  package_size: string | null;
  platform_commission_rate: number | null;
  platform_commission_amount: number | null;
}

export default function CounterOfferScreen() {
  const insets = useSafeAreaInsets();
  const { orderId, customerCounterAmount, myOriginalAmount, negotiationRound, counterBidId } = useLocalSearchParams<{
    orderId: string;
    customerCounterAmount?: string;
    myOriginalAmount?: string;
    negotiationRound?: string;
    counterBidId?: string;
  }>();
  const { riderId } = useAuthStore();
  const isCustomerCounter = !!customerCounterAmount && Number(customerCounterAmount) > 0;
  const customerOffer = isCustomerCounter ? Number(customerCounterAmount) : null;
  const currentRound = Number(negotiationRound ?? 1);
  const isFinalRound = currentRound >= 3;

  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(300);
  const [incomingCounter, setIncomingCounter] = useState<number | null>(null);
  const inputRef = useRef<TextInput>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!orderId) return;
    supabase
      .from('orders')
      .select('id, pickup_address, dropoff_address, dynamic_price, suggested_price, distance_km, package_size, platform_commission_rate, platform_commission_amount')
      .eq('id', orderId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const fetchedOrder = data as OrderSummary;
        setOrder(fetchedOrder);
        const prefill = isCustomerCounter
          ? Number(customerCounterAmount)
          : (fetchedOrder.dynamic_price ?? fetchedOrder.suggested_price);
        setBidAmount(String(Math.round(prefill)));
      });
  }, [customerCounterAmount, isCustomerCounter, orderId]);

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

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ── Watch for customer counter-offer while rider is on this screen ──────
  useEffect(() => {
    if (!orderId || !riderId) return;

    const channel = supabase
      .channel(`rider-counter-watch-${orderId}-${riderId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `order_id=eq.${orderId}` },
        (payload) => {
          const bid = payload.new as { rider_id: string; amount: number; parent_bid_id: string | null };
          // A new bid with parent_bid_id set means it's a customer counter-offer for this rider
          if (bid.rider_id === riderId && bid.parent_bid_id) {
            setIncomingCounter(bid.amount);
            setBidAmount(String(Math.round(bid.amount)));
            Alert.alert(
              'Customer Counter-Offer',
              `Customer responded with ₦${bid.amount.toLocaleString()}. Your input has been updated.`,
              [{ text: 'OK', style: 'default' }]
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId, riderId]);

  useEffect(() => {
    if (countdown !== 0 || submittingRef.current) return;

    if (orderId && riderId) {
      supabase
        .from('bids')
        .select('id')
        .eq('order_id', orderId)
        .eq('rider_id', riderId)
        .in('status', ['pending', 'countered'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
        .then(({ data }) => {
          if (!data) return;
          void (supabase as any).rpc('withdraw_bid', {
            p_bid_id: (data as { id: string }).id,
            p_rider_id: riderId,
          });
        });
    }

    router.replace('/(rider)/' as any);
  }, [countdown, orderId, riderId]);

  const formatCountdown = () => {
    const minutes = Math.floor(countdown / 60);
    const seconds = countdown % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const adjustBid = (delta: number | 'market') => {
    const listed = order ? (order.dynamic_price ?? order.suggested_price) : 0;
    if (delta === 'market') {
      setBidAmount(String(Math.round(listed)));
      return;
    }

    const current = parseInt(bidAmount || '0', 10);
    setBidAmount(String(adjustCurrencyAmount(current, delta, 0)));
  };

  const handleAcceptExact = async (exactAmount: number) => {
    if (!orderId || !riderId) return;
    Keyboard.dismiss();
    setSubmitting(true);
    submittingRef.current = true;
    try {
      if (counterBidId) {
        const { error } = await (supabase as any).rpc('send_rider_counter_offer', {
          p_bid_id: counterBidId,
          p_rider_id: riderId,
          p_amount: exactAmount,
        });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).rpc('place_bid', {
          p_order_id: orderId,
          p_rider_id: riderId,
          p_amount: exactAmount,
        });
        if (error) throw error;
      }
      router.replace({
        pathname: '/(rider)/waiting-for-customer' as any,
        params: { orderId, bidAmount: String(exactAmount) },
      });
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!orderId || !riderId) return;
    const amount = parseInt(bidAmount, 10);
    if (!amount || amount < 100) return;

    if (myOriginalAmount && amount > Number(myOriginalAmount)) {
      Alert.alert('Invalid Bid', `You cannot bid higher than your previous offer of ₦${Number(myOriginalAmount).toLocaleString()}.`);
      return;
    }

    Keyboard.dismiss();
    setSubmitting(true);
    submittingRef.current = true;

    try {
      if (counterBidId) {
        // Rider is replying to a customer counter-offer through the rider-specific RPC.
        const { error } = await (supabase as any).rpc('send_rider_counter_offer', {
          p_bid_id: counterBidId,
          p_rider_id: riderId,
          p_amount: amount,
        });
        if (error) throw error;
      } else {
        // First bid (no prior counter chain) — use place_bid
        const { error } = await (supabase as any).rpc('place_bid', {
          p_order_id: orderId,
          p_rider_id: riderId,
          p_amount: amount,
        });
        if (error) throw error;
      }

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

  const listedPrice = order ? (order.suggested_price ?? order.dynamic_price) : 0;
  const marketLow = Math.round(listedPrice * 0.9);
  const marketHigh = Math.round(listedPrice * 1.15);
  const bidNum = parseInt(bidAmount || '0', 10);
  const isValidBid = bidNum >= 100;
  const earningsBreakdown = buildRiderEarningsBreakdown({
    gross: bidNum,
    commissionAmount: order?.platform_commission_amount != null && listedPrice > 0
      ? Math.round((bidNum / listedPrice) * order.platform_commission_amount)
      : undefined,
    commissionRatePercentage: order?.platform_commission_rate,
  });

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
        <View style={[styles.roundBadge, isFinalRound && styles.roundBadgeFinal]}>
          <Text style={[styles.roundText, isFinalRound && styles.roundTextFinal]}>
            {isFinalRound ? 'Final round - no more counters after this' : `Round ${currentRound} of 3`}
          </Text>
        </View>

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

        {(isCustomerCounter && customerOffer != null || incomingCounter != null) && (
          <View style={styles.customerCounterBanner}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#0040e0" />
            <View style={{ flex: 1 }}>
              <Text style={styles.customerCounterLabel}>Customer Counter-Offer</Text>
              <Text style={styles.customerCounterText}>
                Customer offered N{(incomingCounter ?? customerOffer!).toLocaleString()}
                {myOriginalAmount ? ` (your bid: N${Number(myOriginalAmount).toLocaleString()})` : ''}
              </Text>
            </View>
            <Pressable 
              style={{ backgroundColor: '#0040e0', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, justifyContent: 'center' }}
              onPress={() => handleAcceptExact(incomingCounter ?? customerOffer!)}
              disabled={submitting}
            >
               <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 }}>Accept</Text>
            </Pressable>
          </View>
        )}

        {order && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>LISTED PRICE</Text>
              <Text style={styles.summaryPrice}>N{listedPrice.toLocaleString()}</Text>
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
            {order.distance_km ? (
              <Text style={styles.distanceText}>{order.distance_km.toFixed(1)} km route</Text>
            ) : null}
          </View>
        )}

        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>YOUR BID</Text>
          <Pressable style={styles.inputRow} onPress={() => inputRef.current?.focus()}>
            <Text style={styles.currencySymbol}>N</Text>
            <TextInput
              ref={inputRef}
              style={styles.bidInput}
              value={bidAmount}
              onChangeText={(value) => setBidAmount(value.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#C4C6CF"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </Pressable>
          <View style={styles.inputDivider} />
        </View>

        <View style={styles.chipsRow}>
          {[-500, -200, 100, 200, 500].map((delta) => (
            <Pressable key={delta} style={styles.chip} onPress={() => adjustBid(delta)}>
              <Text style={styles.chipText}>{delta > 0 ? `+N${delta}` : `-N${Math.abs(delta)}`}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.chip, styles.chipMarket]} onPress={() => adjustBid('market')}>
            <Text style={[styles.chipText, styles.chipTextMarket]}>Market Avg</Text>
          </Pressable>
        </View>

        <View style={styles.bentoGrid}>
          <View style={styles.bentoCard}>
            <Ionicons name="trending-up-outline" size={18} color="#0040e0" />
            <Text style={styles.bentoValue}>N{marketLow.toLocaleString()} - N{marketHigh.toLocaleString()}</Text>
            <Text style={styles.bentoLabel}>Market Range</Text>
          </View>
          <View style={styles.bentoCard}>
            <Ionicons name="wallet-outline" size={18} color="#16A34A" />
            <Text style={[styles.bentoValue, { color: '#16A34A' }]}>N{earningsBreakdown.net.toLocaleString()}</Text>
            <Text style={styles.bentoLabel}>Est. Take-Home</Text>
          </View>
        </View>

        <View style={styles.earningsCard}>
          <View style={styles.earningsRow}>
            <Text style={styles.earningsLabel}>Your bid</Text>
            <Text style={styles.earningsValue}>N{earningsBreakdown.gross.toLocaleString()}</Text>
          </View>
          <View style={styles.earningsRow}>
            <Text style={styles.earningsLabel}>Platform commission</Text>
            <Text style={styles.earningsValue}>N{earningsBreakdown.commission.toLocaleString()}</Text>
          </View>
          <View style={[styles.earningsRow, styles.earningsTotalRow]}>
            <Text style={styles.earningsTotalLabel}>Estimated take-home</Text>
            <Text style={styles.earningsTotalValue}>N{earningsBreakdown.net.toLocaleString()}</Text>
          </View>
          <Text style={styles.earningsHint}>
            Based on this order&apos;s saved commission snapshot so you can decide faster before sending.
          </Text>
        </View>

        <Pressable
          style={[styles.submitBtn, (!isValidBid || submitting || isFinalRound) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!isValidBid || submitting || isFinalRound}
        >
          <Ionicons name="send" size={16} color="#FFFFFF" />
          <Text style={styles.submitText}>
            {isFinalRound ? 'Max rounds - accept or decline' : submitting ? 'Submitting...' : `Submit N${bidNum.toLocaleString()} Bid`}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingHorizontal: Spacing[5] },
  customerCounterBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#0040e0',
  },
  customerCounterLabel: { fontSize: Typography.xs, fontWeight: '800', color: '#0040e0', textTransform: 'uppercase', letterSpacing: 1 },
  customerCounterText: { fontSize: Typography.sm, color: '#000D22', marginTop: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  headerTitle: { fontSize: Typography.md, fontWeight: '700', color: '#000D22' },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  timerText: { fontSize: Typography.xs, fontWeight: '700', color: '#0040e0' },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    gap: 14,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: Typography.xs, fontWeight: '700', color: '#74777e', letterSpacing: 1, textTransform: 'uppercase' },
  summaryPrice: { fontSize: Typography.lg, fontWeight: '800', color: '#0040e0' },
  routeSection: { position: 'relative', paddingLeft: 24, gap: 12 },
  routeLine: {
    position: 'absolute',
    left: 8,
    top: 8,
    bottom: 8,
    width: 1,
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C4C6CF',
  },
  routeItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  routeDot: { width: 16, height: 16, borderRadius: 8, marginLeft: -20, marginTop: 2, borderWidth: 3, borderColor: '#FFFFFF' },
  routeDotPickup: { backgroundColor: '#0040e0' },
  routeDotDropoff: { backgroundColor: '#401600' },
  routeTag: { fontSize: 9, fontWeight: '700', color: '#74777e', letterSpacing: 1.5, textTransform: 'uppercase' },
  routeAddress: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22', maxWidth: 260 },
  distanceText: { fontSize: Typography.xs, color: '#74777e', textAlign: 'right' },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    gap: 8,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  inputLabel: { fontSize: Typography.xs, fontWeight: '700', color: '#74777e', letterSpacing: 1.5, textTransform: 'uppercase' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currencySymbol: { fontSize: 36, fontWeight: '900', color: '#0040e0' },
  bidInput: {
    flex: 1,
    fontSize: 48,
    fontWeight: '900',
    color: '#000D22',
    padding: 0,
    includeFontPadding: false,
  },
  inputDivider: { height: 2, backgroundColor: '#0040e0', borderRadius: 1 },
  chipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C4C6CF',
  },
  chipText: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },
  chipMarket: { backgroundColor: '#EEF2FF', borderColor: '#0040e0' },
  chipTextMarket: { color: '#0040e0' },
  bentoGrid: { flexDirection: 'row', gap: 12 },
  bentoCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 4,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  bentoValue: { fontSize: Typography.sm, fontWeight: '800', color: '#000D22', marginTop: 4 },
  bentoLabel: { fontSize: Typography.xs, color: '#74777e' },
  earningsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E4E8EE',
  },
  earningsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  earningsLabel: { fontSize: Typography.xs, color: '#74777e' },
  earningsValue: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },
  earningsTotalRow: { borderTopWidth: 1, borderTopColor: '#F1F4F6', paddingTop: 10, marginTop: 2 },
  earningsTotalLabel: { fontSize: Typography.sm, fontWeight: '800', color: '#000D22' },
  earningsTotalValue: { fontSize: Typography.md, fontWeight: '800', color: '#16A34A' },
  earningsHint: { fontSize: Typography.xs, color: '#74777e', lineHeight: 18 },
  roundBadge: {
    alignSelf: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 4,
  },
  roundBadgeFinal: { backgroundColor: '#fff4e5', borderWidth: 1.5, borderColor: '#f59e0b' },
  roundText: { fontSize: Typography.xs, fontWeight: '800', color: '#0040e0', letterSpacing: 0.5 },
  roundTextFinal: { color: '#b45309' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  submitBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  submitText: { fontSize: Typography.md, fontWeight: '800', color: '#FFFFFF' },
});
