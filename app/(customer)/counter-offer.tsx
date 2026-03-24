import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

export default function CounterOfferScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { orderId, bidId, riderName, bidAmount } = useLocalSearchParams<{
    orderId: string;
    bidId: string;
    riderName: string;
    bidAmount: string;
  }>();

  const originalAmount = Number(bidAmount);
  const minimumAllowed = Math.round(originalAmount * 0.8); // 20% below rider bid

  const [counterAmount, setCounterAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const parsedCounter = Number(counterAmount.replace(/[^0-9]/g, ''));

  const handleSubmit = async () => {
    setError('');
    if (!counterAmount || parsedCounter <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (parsedCounter < minimumAllowed) {
      setError(`Minimum counter is ₦${minimumAllowed.toLocaleString()} (20% below rider's bid)`);
      return;
    }
    if (parsedCounter >= originalAmount) {
      setError(`Counter must be lower than rider's bid (₦${originalAmount.toLocaleString()})`);
      return;
    }

    setSubmitting(true);
    try {
      // Customer counter = new bid from customer with parent_bid_id pointing to rider's bid
      // We insert a countered status update on the original bid, then navigate to waiting screen
      const { error: rpcErr } = await supabase
        .from('bids')
        .update({ status: 'countered' })
        .eq('id', bidId);

      if (rpcErr) throw rpcErr;

      // Insert the customer's counter bid
      const { error: insertErr } = await supabase
        .from('bids')
        .insert({
          order_id: orderId,
          rider_id: (await supabase.from('bids').select('rider_id').eq('id', bidId).single()).data?.rider_id,
          amount: parsedCounter,
          status: 'pending',
          parent_bid_id: bidId,
        } as any);

      if (insertErr) throw insertErr;

      router.replace({
        pathname: '/(customer)/waiting-response',
        params: { orderId, riderName, counterAmount: parsedCounter.toString(), originalBid: bidAmount },
      } as any);
    } catch (err: any) {
      setError(err.message ?? 'Failed to send counter-offer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.overlay]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={() => router.back()} />

      {/* Modal card */}
      <View style={[styles.modal, { paddingBottom: insets.bottom + 24 }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Icon + title */}
        <View style={styles.modalIcon}>
          <Text style={{ fontSize: 28 }}>💬</Text>
        </View>
        <Text style={styles.modalTitle}>Counter-Offer</Text>
        <Text style={styles.modalSubtitle}>
          Send {riderName} a lower price. They can accept or reject.
        </Text>

        {/* Comparison row */}
        <View style={styles.compareRow}>
          <View style={styles.compareBox}>
            <Text style={styles.compareLabel}>Rider's Bid</Text>
            <Text style={styles.compareAmount}>₦{originalAmount.toLocaleString()}</Text>
          </View>
          <View style={styles.compareArrow}>
            <Text style={{ fontSize: 20 }}>→</Text>
          </View>
          <View style={[styles.compareBox, styles.compareBoxActive]}>
            <Text style={[styles.compareLabel, { color: '#0040e0' }]}>Your Counter</Text>
            <Text style={[styles.compareAmount, { color: '#0040e0' }]}>
              {parsedCounter > 0 ? `₦${parsedCounter.toLocaleString()}` : '₦---'}
            </Text>
          </View>
        </View>

        {/* Amount input */}
        <View style={styles.inputWrap}>
          <Text style={styles.inputPrefix}>₦</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your counter amount"
            placeholderTextColor="#74777e"
            keyboardType="numeric"
            value={counterAmount}
            onChangeText={(v) => { setCounterAmount(v); setError(''); }}
            autoFocus
          />
        </View>

        <Text style={styles.hint}>
          Min: ₦{minimumAllowed.toLocaleString()} · Must be lower than rider's bid
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.submitBtnText}>
              {submitting ? 'Sending...' : 'Send Counter-Offer'}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,13,34,0.4)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: Spacing[5],
    paddingTop: 12,
    gap: 14,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 12,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#c4c6cf',
    alignSelf: 'center', marginBottom: 8,
  },
  modalIcon: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(0,64,224,0.07)',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: '#000D22',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: Typography.sm, color: '#44474e',
    textAlign: 'center', lineHeight: 20,
  },

  compareRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginVertical: 4,
  },
  compareBox: {
    flex: 1, alignItems: 'center',
    backgroundColor: '#F1F4F6', borderRadius: 14, padding: 12, gap: 4,
  },
  compareBoxActive: {
    backgroundColor: 'rgba(0,64,224,0.06)',
    borderWidth: 1, borderColor: '#0040e0',
  },
  compareLabel: { fontSize: 10, fontWeight: Typography.bold, color: '#44474e', textTransform: 'uppercase', letterSpacing: 1 },
  compareAmount: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: '#000D22' },
  compareArrow: { paddingHorizontal: 4 },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F1F4F6', borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 4,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  inputPrefix: {
    fontSize: Typography.xl, fontWeight: Typography.bold,
    color: '#000D22', marginRight: 6,
  },
  input: {
    flex: 1, fontSize: Typography.xl,
    fontWeight: Typography.bold, color: '#000D22',
    paddingVertical: 12,
  },
  hint: { fontSize: Typography.xs, color: '#74777e', textAlign: 'center' },
  error: { fontSize: Typography.sm, color: '#ba1a1a', textAlign: 'center' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderRadius: 14, backgroundColor: '#F1F4F6',
  },
  cancelBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#44474e' },
  submitBtn: {
    flex: 2, paddingVertical: 14, alignItems: 'center',
    borderRadius: 14, backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#FFFFFF' },
});
