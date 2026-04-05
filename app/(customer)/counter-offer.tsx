import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
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
import { adjustCurrencyAmount } from '@/lib/sprint4-ux';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function CounterOfferScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { orderId, bidId, riderName, bidAmount, negotiationRound } = useLocalSearchParams<{
    orderId: string;
    bidId: string;
    riderName: string;
    bidAmount: string;
    negotiationRound?: string;
  }>();
  const { profile } = useAuthStore();

  const originalAmount = Number(bidAmount);
  const minimumAllowed = Math.round(originalAmount * 0.8); // 20% below rider bid
  const currentRound = Number(negotiationRound ?? 1);
  const nextRound = currentRound + 1;
  const isFinalRound = nextRound >= 3;

  const [counterAmount, setCounterAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const parsedCounter = Number(counterAmount.replace(/[^0-9]/g, ''));
  const quickCounterDeltas = [100, 200, 500];

  const handleQuickAdjust = (delta: number) => {
    const baseAmount = parsedCounter > 0 ? parsedCounter : originalAmount;
    const nextAmount = adjustCurrencyAmount(baseAmount, delta, minimumAllowed);
    setCounterAmount(String(nextAmount));
    setError('');
  };

  const handleAccept = async () => {
    setSubmitting(true);
    setError('');
    try {
      const { error: rpcErr } = await (supabase as any).rpc('accept_bid', {
        p_bid_id: bidId,
        p_customer_id: profile?.id,
      });
      if (rpcErr) throw rpcErr;
      router.replace({ pathname: '/(customer)/active-order-tracking', params: { orderId } } as any);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to accept bid');
    } finally {
      setSubmitting(false);
    }
  };

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
      const { error: rpcErr } = await (supabase as any).rpc('send_counter_offer', {
        p_bid_id: bidId,
        p_customer_id: profile?.id,
        p_amount: parsedCounter,
      });

      if (rpcErr) throw rpcErr;

      router.replace({
        pathname: '/(customer)/waiting-response',
        params: {
          orderId,
          riderName,
          counterAmount: parsedCounter.toString(),
          originalBid: bidAmount,
          negotiationRound: String(nextRound),
        },
      } as any);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (msg.includes('Maximum 3')) {
        setError('Max 3 rounds reached. You can only accept or decline this bid.');
      } else {
        setError(msg || 'Failed to send counter-offer');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.overlay]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={() => router.back()} />

      {/* Modal card */}
      <View style={[styles.modal, { paddingBottom: insets.bottom + 24 }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Round indicator */}
        <View style={[styles.roundBadge, isFinalRound && styles.roundBadgeFinal]}>
          <Text style={[styles.roundText, isFinalRound && styles.roundTextFinal]}>
            {isFinalRound ? ('Final round — no more counters') : ('Round ' + nextRound + ' of 3')}
          </Text>
        </View>

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
            <Text style={styles.compareLabel}>Rider&apos;s Bid</Text>
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

        <View style={styles.quickActionsRow}>
          {quickCounterDeltas.map((delta) => (
            <Pressable
              key={delta}
              style={styles.quickActionChip}
              onPress={() => handleQuickAdjust(-delta)}
            >
              <Text style={styles.quickActionText}>-N{delta}</Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.quickActionChip, styles.quickActionChipPrimary]}
            onPress={() => {
              setCounterAmount(String(minimumAllowed));
              setError('');
            }}
          >
            <Text style={[styles.quickActionText, styles.quickActionTextPrimary]}>Best Min</Text>
          </Pressable>
        </View>

        <Text style={styles.hint}>
          Min: ₦{minimumAllowed.toLocaleString()} · Must be lower than rider&apos;s bid
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          {currentRound >= 3 ? (
            <Pressable
              style={[styles.submitBtn, { backgroundColor: '#16A34A', shadowColor: '#16A34A' }, submitting && { opacity: 0.6 }]}
              onPress={handleAccept}
              disabled={submitting}
            >
              <Text style={styles.submitBtnText}>
                {submitting ? 'Accepting...' : 'Accept Rider Bid'}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Text style={styles.submitBtnText}>
                {submitting ? 'Sending...' : 'Send Counter-Offer'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof import('@/hooks/use-theme').useTheme>['colors']) {
  return StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,13,34,0.4)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: Spacing[5],
    paddingTop: 12,
    gap: 14,
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 12,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border,
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
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: Typography.sm, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 20,
  },

  compareRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginVertical: 4,
  },
  compareBox: {
    flex: 1, alignItems: 'center',
    backgroundColor: colors.background, borderRadius: 14, padding: 12, gap: 4,
  },
  compareBoxActive: {
    backgroundColor: 'rgba(0,64,224,0.06)',
    borderWidth: 1, borderColor: '#0040e0',
  },
  compareLabel: { fontSize: 10, fontWeight: Typography.bold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  compareAmount: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: colors.textPrimary },
  compareArrow: { paddingHorizontal: 4 },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 4,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  inputPrefix: {
    fontSize: Typography.xl, fontWeight: Typography.bold,
    color: colors.textPrimary, marginRight: 6,
  },
  input: {
    flex: 1, fontSize: Typography.xl,
    fontWeight: Typography.bold, color: colors.textPrimary,
    paddingVertical: 12,
  },
  quickActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  quickActionChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionChipPrimary: {
    backgroundColor: 'rgba(0,64,224,0.08)',
    borderColor: '#0040e0',
  },
  quickActionText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: colors.textPrimary,
  },
  quickActionTextPrimary: {
    color: '#0040e0',
  },
  hint: { fontSize: Typography.xs, color: colors.textSecondary, textAlign: 'center' },
  error: { fontSize: Typography.sm, color: '#ba1a1a', textAlign: 'center' },

  roundBadge: {
    alignSelf: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  roundBadgeFinal: { backgroundColor: '#fff4e5', borderWidth: 1.5, borderColor: '#f59e0b' },
  roundText: { fontSize: Typography.xs, fontWeight: '800', color: '#0040e0', letterSpacing: 0.5 },
  roundTextFinal: { color: '#b45309' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderRadius: 14, backgroundColor: colors.background,
  },
  cancelBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: colors.textSecondary },
  submitBtn: {
    flex: 2, paddingVertical: 14, alignItems: 'center',
    borderRadius: 14, backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#FFFFFF' },
  }); // end makeStyles
}

