import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Spacing, Typography } from '@/constants/theme';

// ─── Cancel reasons ───────────────────────────────────────────────────────────

const REASONS = [
  'Driver taking too long',
  'Wait time is more than estimated',
  'Incorrect location selected',
  'Changed my mind',
  'Found another option',
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CancelOrderModalScreen() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [selectedReason, setSelectedReason] = useState(REASONS[0]);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setCancelling(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('cancel_order', {
      p_order_id: orderId,
      p_reason: selectedReason,
      p_cancelled_by: 'customer',
    } as any);

    if (rpcError) {
      setError(rpcError.message);
      setCancelling(false);
    } else {
      // Navigate home after cancel
      router.replace('/(customer)/' as any);
    }
  };

  return (
    <View style={[styles.overlay, { paddingBottom: insets.bottom }]}>
      {/* Backdrop */}
      <Pressable style={StyleSheet.absoluteFillObject} onPress={() => router.back()} />

      {/* Modal sheet */}
      <View style={styles.sheet}>
        {/* Drag handle */}
        <View style={styles.dragHandle} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Cancel Order?</Text>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={8}>
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
        </View>

        <Text style={styles.sheetBody}>
          Please let us know why you are cancelling your request.
        </Text>

        {/* Reason list */}
        <View style={styles.reasonList}>
          {REASONS.map((reason) => {
            const selected = reason === selectedReason;
            return (
              <Pressable
                key={reason}
                style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                onPress={() => setSelectedReason(reason)}
              >
                <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                  {selected && <View style={styles.radioInner} />}
                </View>
                <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>
                  {reason}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={[styles.confirmBtn, cancelling && { opacity: 0.7 }]}
            onPress={handleConfirm}
            disabled={cancelling}
          >
            {cancelling ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.confirmBtnText}>Confirm Cancellation</Text>
            )}
          </Pressable>

          <Pressable style={styles.keepBtn} onPress={() => router.back()}>
            <Text style={styles.keepBtnText}>Keep Order</Text>
          </Pressable>
        </View>

        {/* Bottom accent bar */}
        <View style={styles.accentBar} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,13,34,0.5)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E3E5',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: 16,
  },
  sheetTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: '#000D22',
    letterSpacing: -0.5,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { fontSize: 14, color: '#44474e', fontWeight: Typography.bold },

  sheetBody: {
    fontSize: Typography.base,
    color: '#44474e',
    paddingHorizontal: Spacing[5],
    lineHeight: 22,
    marginBottom: 20,
  },

  reasonList: {
    paddingHorizontal: Spacing[5],
    gap: 10,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#F1F4F6',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  reasonRowSelected: {
    backgroundColor: '#EEF1F3',
    borderWidth: 1.5,
    borderColor: '#0040e0',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#C4C6CF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioOuterSelected: { borderColor: '#0040e0' },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0040e0',
  },
  reasonText: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: '#181c1e',
    flex: 1,
  },
  reasonTextSelected: { fontWeight: Typography.semibold, color: '#000D22' },

  errorText: {
    fontSize: Typography.xs,
    color: '#ba1a1a',
    paddingHorizontal: Spacing[5],
    marginTop: 8,
  },

  actions: {
    paddingHorizontal: Spacing[5],
    paddingTop: 24,
    paddingBottom: 16,
    gap: 10,
  },
  confirmBtn: {
    height: 52,
    backgroundColor: '#0040e0',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  confirmBtnText: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  keepBtn: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  keepBtnText: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: '#0040e0',
  },

  accentBar: {
    height: 4,
    backgroundColor: '#0040e0',
    opacity: 0.15,
  },
});
