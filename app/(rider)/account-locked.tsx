import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

export default function AccountLockedScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const [amountOwed, setAmountOwed] = useState(0);

  useEffect(() => {
    if (!profile?.id) return;
    // Fetch rider's unpaid commission info
    supabase
      .from('riders')
      .select('unpaid_commission_count')
      .eq('profile_id', profile.id)
      .single()
      .then(({ data }) => {
        if (data) {
          // Estimate debt (actual amount would come from order history)
          setAmountOwed((data as any).unpaid_commission_count * 500);
        }
      });
  }, [profile?.id]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      {/* Back button */}
      <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 12 }]} hitSlop={8}>
        <Ionicons name="arrow-back" size={20} color="#0040e0" />
      </Pressable>

      {/* Icon */}
      <View style={styles.iconSection}>
        <View style={styles.iconOuter}>
          <Ionicons name="lock-closed" size={52} color="#D97706" />
          <View style={styles.alertBadge}>
            <Ionicons name="warning" size={12} color="#FFFFFF" />
          </View>
        </View>
        <Text style={styles.headline}>Account Locked</Text>
        <View style={styles.debtPill}>
          <Text style={styles.debtText}>Outstanding Debt: ₦{amountOwed.toLocaleString()}</Text>
        </View>
        <Text style={styles.description}>
          Your account is currently restricted due to an unpaid commission balance. Please settle your debt to continue receiving delivery requests.
        </Text>
      </View>

      {/* Info cards */}
      <View style={styles.infoGrid}>
        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Ionicons name="wallet-outline" size={20} color="#0040e0" />
          </View>
          <Text style={styles.infoTitle}>Fund wallet to settle balance</Text>
          <Text style={styles.infoText}>
            Top up your internal wallet and the outstanding commission will be automatically deducted.
          </Text>
        </View>
        <View style={[styles.infoCard, styles.infoCardDark]}>
          <View style={styles.darkCardRow}>
            <View>
              <Text style={styles.darkCardLabel}>LAST TRANSACTION</Text>
              <Text style={styles.darkCardValue}>Unpaid Commission</Text>
            </View>
            <View style={styles.unpaidBadge}>
              <Text style={styles.unpaidText}>UNPAID</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={styles.fundBtn}
          onPress={() => router.push({ pathname: '/(rider)/earnings' as any })}
        >
          <Ionicons name="wallet" size={18} color="#FFFFFF" />
          <Text style={styles.fundBtnText}>Fund Wallet to Unlock</Text>
        </Pressable>
        <Pressable
          style={styles.supportBtn}
          onPress={() => Linking.openURL('https://dzpatch.com/support')}
        >
          <Ionicons name="headset-outline" size={16} color="#44474e" />
          <Text style={styles.supportBtnText}>Contact Support</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#F7FAFC',
    paddingHorizontal: Spacing[5], gap: 24,
  },

  backBtn: {
    position: 'absolute', left: Spacing[5],
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },

  iconSection: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  iconOuter: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#FEF3C7',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#D97706', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 4,
  },
  alertBadge: {
    position: 'absolute', top: -4, right: -4,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#ba1a1a',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#F7FAFC',
  },
  headline: { fontSize: Typography['2xl'], fontWeight: '900', color: '#000D22' },
  debtPill: {
    backgroundColor: '#F7FAFC', borderRadius: 999, borderWidth: 1, borderColor: '#C4C6CF',
    paddingHorizontal: 20, paddingVertical: 8,
  },
  debtText: { fontSize: Typography.lg, fontWeight: '900', color: '#000D22' },
  description: {
    fontSize: Typography.sm, color: '#74777e', textAlign: 'center',
    lineHeight: 22, paddingHorizontal: 16,
  },

  infoGrid: { gap: 12 },
  infoCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 8,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  infoCardDark: { backgroundColor: '#0A2342', overflow: 'hidden' },
  infoIcon: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },
  infoTitle: { fontSize: Typography.sm, fontWeight: '800', color: '#000D22' },
  infoText: { fontSize: Typography.xs, color: '#74777e', lineHeight: 18 },
  darkCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  darkCardLabel: {
    fontSize: Typography.xs, fontWeight: '700', color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  darkCardValue: { fontSize: Typography.sm, fontWeight: '700', color: '#FFFFFF', marginTop: 2 },
  unpaidBadge: {
    backgroundColor: 'rgba(255,182,82,0.2)', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  unpaidText: { fontSize: 10, fontWeight: '900', color: '#ffb652', letterSpacing: 1 },

  actions: { gap: 12 },
  fundBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 58, borderRadius: 18,
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 6,
  },
  fundBtnText: { fontSize: Typography.md, fontWeight: '800', color: '#FFFFFF' },
  supportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 50,
  },
  supportBtnText: { fontSize: Typography.sm, fontWeight: '700', color: '#44474e' },
});
