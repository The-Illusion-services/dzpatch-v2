import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';
import { useAppStateChannels } from '@/hooks/use-app-state-channels';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WalletData {
  id: string;
  balance: number;
}

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
  order: {
    final_price: number | null;
    platform_commission_amount: number | null;
  } | null;
}

interface DailyEntry {
  label: string;
  date: string;
  trips: number;
  amount: number;
  status: 'Settled' | 'Processing';
}

// Commission is already deducted by complete_delivery before crediting the rider wallet.
// Do not re-deduct here — grossRevenue IS net earnings.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(n: number) {
  return `₦${n.toLocaleString()}`;
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type Period = 'weekly' | 'monthly';

export default function RiderEarningsScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [period, setPeriod] = useState<Period>('weekly');
  const [refreshing, setRefreshing] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Fetch data ─────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;

    // Wallet
    const { data: walletRaw } = await supabase
      .from('wallets')
      .select('id, balance')
      .eq('owner_id', profile.id)
      .eq('owner_type', 'rider')
      .single();
    const w = walletRaw as { id: string; balance: number } | null;
    if (w) setWallet(w);

    // Transactions
    const since = new Date();
    since.setDate(since.getDate() - (period === 'weekly' ? 7 : 30));
    const { data: txs } = await supabase
      .from('transactions')
      .select('id, amount, type, description, created_at')
      .eq('wallet_id', w?.id ?? '')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);
    if (txs) setTransactions(txs as Transaction[]);
  }, [profile?.id, period]);

  useEffect(() => { fetchData(); }, [profile?.id, period, fetchData]);

  // ── Realtime wallet update ─────────────────────────────────────────────────

  useEffect(() => {
    if (!wallet?.id) return;
    const channel = supabase
      .channel(`rider-wallet-${wallet.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wallets', filter: `id=eq.${wallet.id}` },
        (payload) => { setWallet(payload.new as WalletData); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions', filter: `wallet_id=eq.${wallet.id}` },
        (payload) => { setTransactions((prev) => [payload.new as Transaction, ...prev]); })
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [wallet?.id]);

  useAppStateChannels([channelRef.current]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // ── Derived metrics ────────────────────────────────────────────────────────

  const incomeTransactions = useMemo(
    () => transactions.filter((t) => t.amount > 0 && t.type === 'credit'),
    [transactions]
  );

  const grossRevenue = useMemo(
    () => incomeTransactions.reduce((sum, t) => sum + t.amount, 0),
    [incomeTransactions]
  );

  // Commission was already deducted by the backend before crediting the wallet.
  // grossRevenue is already the rider's net pay — show it as-is.
  const commissionPaid = 0; // not calculable from net earnings alone; omit from display
  const netPay = useMemo(() => Math.round(grossRevenue), [grossRevenue]);

  const totalTrips = useMemo(
    () => incomeTransactions.filter((t) =>
      t.description?.toLowerCase().includes('delivery') || t.type === 'credit'
    ).length,
    [incomeTransactions]
  );

  // ── Build daily summary ────────────────────────────────────────────────────

  const dailyEntries = useMemo(() => {
    const dailyMap = new Map<string, DailyEntry>();
    for (const tx of incomeTransactions) {
      const date = tx.created_at.slice(0, 10);
      const existing = dailyMap.get(date);
      if (existing) {
        existing.trips += 1;
        existing.amount += tx.amount;
      } else {
        dailyMap.set(date, {
          label: dayLabel(tx.created_at),
          date,
          trips: 1,
          amount: tx.amount,
          // Transactions older than 1 day are considered settled
          status: new Date(tx.created_at) < new Date(Date.now() - 86400000) ? 'Settled' : 'Processing',
        });
      }
    }
    return Array.from(dailyMap.values()).slice(0, 7);
  }, [incomeTransactions]);

  const balance = wallet?.balance ?? 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F7FAFC' }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0040e0" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Financials</Text>
      </View>

      {/* Hero Balance Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroDecor} />
        <View style={styles.heroTopRow}>
          <Text style={styles.heroLabel}>Available Balance</Text>
          <View style={styles.walletIconWrap}>
            <Ionicons name="wallet" size={18} color="rgba(255,255,255,0.7)" />
          </View>
        </View>
        <Text style={styles.heroBalance}>{formatAmount(balance)}</Text>

        {/* Period toggle */}
        <View style={styles.periodToggle}>
          {(['weekly', 'monthly'] as Period[]).map((p) => (
            <Pressable
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Action buttons */}
        <View style={styles.heroActions}>
          <Pressable
            style={styles.heroActionBtnPrimary}
            onPress={() => router.push({ pathname: '/(rider)/rider-wallet' as any })}
          >
            <Ionicons name="add-circle-outline" size={16} color="#FFFFFF" />
            <Text style={styles.heroActionBtnTextPrimary}>Fund</Text>
          </Pressable>
          <Pressable
            style={styles.heroActionBtnSecondary}
            onPress={() => router.push({ pathname: '/(rider)/rider-withdraw' as any })}
          >
            <Ionicons name="arrow-down-circle-outline" size={16} color="rgba(255,255,255,0.9)" />
            <Text style={styles.heroActionBtnTextSecondary}>Withdraw</Text>
          </Pressable>
        </View>
      </View>

      {/* Stats bento */}
      <View style={styles.bentoGrid}>
        <View style={styles.bentoCard}>
          <Text style={styles.bentoLabel}>Total Trips</Text>
          <Text style={styles.bentoValue}>{totalTrips}</Text>
          <View style={styles.bentoStat}>
            <Ionicons name="trending-up-outline" size={12} color="#16A34A" />
            <Text style={styles.bentoStatText}>{period === 'weekly' ? 'This Week' : 'This Month'}</Text>
          </View>
        </View>
        <View style={styles.bentoCard}>
          <Text style={styles.bentoLabel}>Gross Revenue</Text>
          <Text style={styles.bentoValue}>{formatAmount(grossRevenue)}</Text>
          <Text style={styles.bentoStatText}>Before commission</Text>
        </View>
      </View>

      {/* Commission info */}
      <View style={styles.commissionCard}>
        <View style={styles.commissionRow}>
          <View style={styles.commissionIcon}>
            <Ionicons name="information-circle-outline" size={18} color="#0040e0" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.commissionTitle}>Dzpatch Commission</Text>
            <Text style={styles.commissionText}>
              Platform commission is deducted before your earnings are credited. Your balance shows net pay only.
            </Text>
          </View>
        </View>
      </View>

      {/* Daily breakdown */}
      {dailyEntries.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Breakdown</Text>
          <View style={styles.dailyList}>
            {dailyEntries.map((entry) => (
              <View key={entry.date} style={styles.dailyRow}>
                <View style={styles.dayCircle}>
                  <Text style={styles.dayCircleText}>{entry.label.slice(0, 3)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dayLabel}>{entry.label}</Text>
                  <Text style={styles.dayTrips}>{entry.trips} trip{entry.trips !== 1 ? 's' : ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.dayAmount}>{formatAmount(entry.amount)}</Text>
                  <View style={[
                    styles.statusBadge,
                    entry.status === 'Settled' ? styles.statusSettled : styles.statusProcessing,
                  ]}>
                    <Text style={[
                      styles.statusText,
                      entry.status === 'Settled' ? styles.statusTextSettled : styles.statusTextProcessing,
                    ]}>
                      {entry.status}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Cash out CTA */}
      <Pressable
        style={styles.cashOutBtn}
        onPress={() => router.push({ pathname: '/(rider)/rider-withdraw' as any })}
      >
        <Ionicons name="cash-outline" size={18} color="#FFFFFF" />
        <Text style={styles.cashOutText}>Cash Out Now</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: { gap: 16, paddingHorizontal: Spacing[5] },

  header: { paddingTop: 8 },
  screenTitle: { fontSize: Typography['2xl'], fontWeight: '900', color: '#000D22' },

  // Hero card
  heroCard: {
    backgroundColor: '#0A2342', borderRadius: 28,
    padding: 24, gap: 16, overflow: 'hidden',
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 24, elevation: 8,
  },
  heroDecor: {
    position: 'absolute', right: -40, top: -40,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(0,64,224,0.18)',
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLabel: {
    fontSize: Typography.xs, fontWeight: '700', color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  walletIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroBalance: { fontSize: 44, fontWeight: '900', color: '#FFFFFF', lineHeight: 48 },

  // Period toggle
  periodToggle: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999, padding: 4, alignSelf: 'flex-start',
  },
  periodBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 },
  periodBtnActive: { backgroundColor: '#0040e0' },
  periodBtnText: { fontSize: Typography.xs, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  periodBtnTextActive: { color: '#FFFFFF' },

  // Hero actions
  heroActions: { flexDirection: 'row', gap: 12 },
  heroActionBtnPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 48, borderRadius: 14, backgroundColor: '#0040e0',
  },
  heroActionBtnSecondary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  heroActionBtnTextPrimary: { fontSize: Typography.sm, fontWeight: '700', color: '#FFFFFF' },
  heroActionBtnTextSecondary: { fontSize: Typography.sm, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },

  // Bento
  bentoGrid: { flexDirection: 'row', gap: 12 },
  bentoCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, gap: 6,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  bentoLabel: { fontSize: Typography.xs, fontWeight: '700', color: '#74777e', textTransform: 'uppercase', letterSpacing: 1 },
  bentoValue: { fontSize: Typography.xl, fontWeight: '900', color: '#000D22' },
  bentoStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bentoStatText: { fontSize: Typography.xs, color: '#74777e' },

  // Commission
  commissionCard: {
    backgroundColor: '#EEF2FF', borderRadius: 16, padding: 16,
  },
  commissionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  commissionIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(0,64,224,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  commissionTitle: { fontSize: Typography.sm, fontWeight: '800', color: '#000D22' },
  commissionText: { fontSize: Typography.xs, color: '#44474e', marginTop: 2, lineHeight: 18 },

  // Daily
  section: { gap: 12 },
  sectionTitle: { fontSize: Typography.md, fontWeight: '800', color: '#000D22' },
  dailyList: {
    backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden',
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  dailyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F4F6',
  },
  dayCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },
  dayCircleText: { fontSize: Typography.xs, fontWeight: '800', color: '#0040e0' },
  dayLabel: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },
  dayTrips: { fontSize: Typography.xs, color: '#74777e' },
  dayAmount: { fontSize: Typography.sm, fontWeight: '800', color: '#000D22' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusSettled: { backgroundColor: '#DCFCE7' },
  statusProcessing: { backgroundColor: '#FEF3C7' },
  statusText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  statusTextSettled: { color: '#16A34A' },
  statusTextProcessing: { color: '#D97706' },

  // Cash out
  cashOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 58, borderRadius: 18,
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 6,
  },
  cashOutText: { fontSize: Typography.md, fontWeight: '800', color: '#FFFFFF' },
});
