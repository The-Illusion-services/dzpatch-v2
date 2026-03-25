import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
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
import { SkeletonCard } from '@/components/ui';
import { Spacing, Typography } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type TxFilter = 'all' | 'income' | 'spending' | 'pending';

type Transaction = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  status: string;
  created_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCredit(type: string): boolean {
  return ['credit', 'commission_credit', 'refund', 'adjustment'].includes(type);
}

function txIcon(type: string): string {
  if (isCredit(type)) return '↙';
  if (type === 'withdrawal') return '↗';
  return '↗';
}

function txLabel(tx: Transaction): string {
  if (tx.description) return tx.description;
  return tx.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
  }) + ' • ' + new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WalletScreen() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [balance, setBalance] = useState<number | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<TxFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Balance counter animation ──────────────────────────────────────────────
  const animBalance = useRef(new Animated.Value(0)).current;

  const animateTo = (target: number) => {
    Animated.timing(animBalance, {
      toValue: target,
      duration: 800,
      useNativeDriver: false,
    }).start();
  };

  // ── Data fetch ─────────────────────────────────────────────────────────────

  const fetchData = async () => {
    if (!profile?.id) return;

    const { data: wallet } = await supabase
      .from('wallets')
      .select('id, balance')
      .eq('owner_id', profile.id)
      .eq('owner_type', 'customer')
      .single();

    if (wallet) {
      setBalance(wallet.balance);
      setWalletId(wallet.id);
      animateTo(wallet.balance);

      const { data: txs } = await supabase
        .from('transactions')
        .select('id, type, amount, balance_after, description, status, created_at')
        .eq('wallet_id', wallet.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (txs) setTransactions(txs as Transaction[]);
    }
  };

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [profile?.id]);

  // ── Realtime balance updates ───────────────────────────────────────────────
  useEffect(() => {
    if (!walletId) return;
    const channel = supabase
      .channel(`wallet:${walletId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wallets', filter: `id=eq.${walletId}` },
        (payload) => {
          const newBalance = (payload.new as any).balance;
          setBalance(newBalance);
          animateTo(newBalance);
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions', filter: `wallet_id=eq.${walletId}` },
        () => fetchData())
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [walletId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // ── Filter transactions ────────────────────────────────────────────────────

  const filtered = transactions.filter((tx) => {
    switch (filter) {
      case 'income':   return isCredit(tx.type);
      case 'spending': return !isCredit(tx.type) && tx.type !== 'withdrawal';
      case 'pending':  return tx.status === 'pending';
      default:         return true;
    }
  });

  const FILTERS: { key: TxFilter; label: string }[] = [
    { key: 'all',      label: 'All' },
    { key: 'income',   label: 'Income' },
    { key: 'spending', label: 'Spending' },
    { key: 'pending',  label: 'Pending' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(customer)/profile' as any)} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color="#000D22" />
        </Pressable>
        <Text style={styles.headerTitle}>Wallet</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0040e0" />}
        ListHeaderComponent={() => (
          <>
            {/* ── Balance Card ── */}
            <View style={styles.balanceCard}>
              {/* Glow blobs */}
              <View style={styles.glowTopRight} />
              <View style={styles.glowBottomLeft} />
              <View style={{ position: 'relative', zIndex: 1 }}>
                <Text style={styles.balanceLabel}>Available Balance</Text>
                {loading ? (
                  <View style={styles.balanceSkeleton} />
                ) : (
                  <Text style={styles.balanceAmount}>
                    ₦{balance !== null ? Number(balance).toLocaleString('en-NG', { minimumFractionDigits: 2 }) : '0.00'}
                  </Text>
                )}
              </View>
              {/* Action buttons */}
              <View style={styles.balanceActions}>
                <Pressable
                  style={styles.fundBtn}
                  onPress={() => router.push('/(customer)/fund-wallet' as any)}
                >
                  <Text style={styles.fundBtnIcon}>＋</Text>
                  <Text style={styles.fundBtnText}>Fund Wallet</Text>
                </Pressable>
                <Pressable
                  style={styles.withdrawBtn}
                  onPress={() => router.push('/(customer)/withdraw' as any)}
                >
                  <Text style={styles.withdrawBtnIcon}>🏦</Text>
                  <Text style={styles.withdrawBtnText}>Withdraw</Text>
                </Pressable>
              </View>
            </View>

            {/* ── Transactions header + filters ── */}
            <View style={styles.txHeader}>
              <Text style={styles.txTitle}>Transactions</Text>
              <Pressable hitSlop={8}>
                <Text style={styles.filterIcon}>⚙</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTERS.map((f) => (
                <Pressable
                  key={f.key}
                  style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                  onPress={() => setFilter(f.key)}
                >
                  <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                    {f.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingHorizontal: Spacing[5], gap: 10 }}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💸</Text>
              <Text style={styles.emptyTitle}>No transactions yet</Text>
              <Text style={styles.emptyBody}>Fund your wallet to get started.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const credit = isCredit(item.type);
          const isPending = item.status === 'pending';
          return (
            <View style={styles.txRow}>
              <View style={[styles.txIconWrap, credit ? styles.txIconCredit : styles.txIconDebit]}>
                <Text style={[styles.txIconText, credit ? styles.txIconTextCredit : styles.txIconTextDebit]}>
                  {txIcon(item.type)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txDesc} numberOfLines={1}>{txLabel(item)}</Text>
                <Text style={styles.txDate}>{formatDate(item.created_at)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[styles.txAmount, credit ? styles.txAmountCredit : styles.txAmountDebit]}>
                  {credit ? '+' : '-'}₦{Number(item.amount).toLocaleString()}
                </Text>
                <Text style={[styles.txStatus, isPending && styles.txStatusPending]}>
                  {isPending ? 'Processing' : 'Success'}
                </Text>
              </View>
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  headerTitle: { fontSize: Typography.xl, fontWeight: Typography.extrabold, color: '#000D22', letterSpacing: -0.5 },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#FFFFFF' },

  listContent: { paddingTop: 0 },

  // Balance card
  balanceCard: {
    margin: Spacing[5],
    backgroundColor: '#000D22',
    borderRadius: 28,
    padding: 28,
    gap: 20,
    overflow: 'hidden',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 10,
  },
  glowTopRight: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#0040e0',
    opacity: 0.15,
  },
  glowBottomLeft: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2e5bff',
    opacity: 0.1,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: '#768baf',
    textTransform: 'uppercase',
    letterSpacing: 3,
    marginBottom: 6,
  },
  balanceSkeleton: { height: 44, width: 180, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8 },
  balanceAmount: {
    fontSize: 40,
    fontWeight: Typography.extrabold,
    color: '#FFFFFF',
    letterSpacing: -1,
  },

  balanceActions: { flexDirection: 'row', gap: 12 },
  fundBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0040e0',
    borderRadius: 14,
    paddingVertical: 14,
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  fundBtnIcon: { fontSize: 18, color: '#FFFFFF', fontWeight: Typography.bold },
  fundBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#FFFFFF' },
  withdrawBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  withdrawBtnIcon: { fontSize: 16 },
  withdrawBtnText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#FFFFFF' },

  // Transactions header
  txHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingTop: 8,
    paddingBottom: 12,
  },
  txTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: '#000D22', letterSpacing: -0.3 },
  filterIcon: { fontSize: 18, color: '#44474e' },

  filterRow: { paddingHorizontal: Spacing[5], paddingBottom: 16, gap: 10 },
  filterChip: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EBEEf0',
  },
  filterChipActive: { backgroundColor: '#000D22' },
  filterChipText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: '#44474e' },
  filterChipTextActive: { color: '#FFFFFF' },

  // Transaction rows
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: Spacing[5],
    gap: 12,
  },
  txIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  txIconCredit: { backgroundColor: '#dde1ff' },
  txIconDebit: { backgroundColor: '#ffdad6' },
  txIconText: { fontSize: 18, fontWeight: Typography.bold },
  txIconTextCredit: { color: '#0040e0' },
  txIconTextDebit: { color: '#ba1a1a' },
  txDesc: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#000D22' },
  txDate: { fontSize: Typography.xs, color: '#74777e', marginTop: 2 },
  txAmount: { fontSize: Typography.md, fontWeight: Typography.extrabold },
  txAmountCredit: { color: '#0040e0' },
  txAmountDebit: { color: '#ba1a1a' },
  txStatus: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: '#74777e',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  txStatusPending: { color: '#D97706' },

  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8, paddingHorizontal: Spacing[5] },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#000D22' },
  emptyBody: { fontSize: Typography.sm, color: '#44474e', textAlign: 'center', maxWidth: 220 },
});
