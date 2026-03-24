import { useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Card, SkeletonCard } from '@/components/ui';
import { Colors, Spacing, Typography } from '@/constants/theme';

type Transaction = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
};

const TX_ICON: Record<string, string> = {
  credit: '↙',
  debit: '↗',
  commission_credit: '↙',
  commission_debit: '↗',
  refund: '↩',
  withdrawal: '↗',
  adjustment: '±',
};

export default function WalletScreen() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    const [walletRes, txRes] = await Promise.all([
      supabase
        .from('wallets')
        .select('balance')
        .eq('owner_id', profile?.id ?? '')
        .eq('owner_type', 'customer')
        .single(),
      supabase
        .from('transactions')
        .select('id, type, amount, balance_after, description, created_at')
        .eq('wallet_id', profile?.id ?? '') // wallet_id resolved via join — simplified for now
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    if (walletRes.data) setBalance(walletRes.data.balance);
    if (txRes.data) setTransactions(txRes.data as Transaction[]);
  };

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [profile?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Balance card */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceDots} />
        <Text style={styles.balanceLabel}>WALLET BALANCE</Text>
        {loading ? (
          <View style={styles.balanceSkeleton} />
        ) : (
          <Text style={styles.balanceAmount}>
            ₦{balance !== null ? Number(balance).toLocaleString('en-NG', { minimumFractionDigits: 2 }) : '0.00'}
          </Text>
        )}
        <Text style={styles.balanceCurrency}>Nigerian Naira</Text>
      </View>

      {/* Transactions */}
      <View style={styles.txHeader}>
        <Text style={styles.txTitle}>Transactions</Text>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: Spacing[5] }}>
          <SkeletonCard />
          <SkeletonCard style={{ marginTop: 10 }} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.txList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <Card variant="flat" style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>💸</Text>
              <Text style={styles.emptyTitle}>No transactions yet</Text>
              <Text style={styles.emptyBody}>Fund your wallet or complete a delivery to see history.</Text>
            </Card>
          }
          renderItem={({ item }) => {
            const isCredit = ['credit', 'commission_credit', 'refund', 'adjustment'].includes(item.type);
            return (
              <View style={styles.txRow}>
                <View style={[styles.txIconWrap, isCredit ? styles.txIconCredit : styles.txIconDebit]}>
                  <Text style={[styles.txIcon, isCredit ? styles.txIconTextCredit : styles.txIconTextDebit]}>
                    {TX_ICON[item.type] ?? '·'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txDesc} numberOfLines={1}>
                    {item.description ?? item.type.replace(/_/g, ' ')}
                  </Text>
                  <Text style={styles.txDate}>
                    {new Date(item.created_at).toLocaleDateString('en-NG', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </Text>
                </View>
                <Text style={[styles.txAmount, isCredit ? styles.txAmountCredit : styles.txAmountDebit]}>
                  {isCredit ? '+' : '-'}₦{Number(item.amount).toLocaleString()}
                </Text>
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  balanceCard: {
    backgroundColor: '#0A2342',
    marginHorizontal: Spacing[5],
    marginTop: 16,
    borderRadius: 24,
    padding: 28,
    gap: 8,
    overflow: 'hidden',
    shadowColor: '#0A2342',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  balanceDots: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.06,
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: '#b8c3ff',
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
  balanceSkeleton: {
    height: 40,
    width: 160,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: Typography.extrabold,
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  balanceCurrency: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: Typography.medium,
  },
  txHeader: {
    paddingHorizontal: Spacing[5],
    paddingTop: 24,
    paddingBottom: 12,
  },
  txTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: '#000D22',
    letterSpacing: -0.3,
  },
  txList: {
    paddingHorizontal: Spacing[5],
    paddingBottom: 120,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
    backgroundColor: '#F1F4F6',
  },
  emptyIcon: { fontSize: 40 },
  emptyTitle: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: '#000D22',
  },
  emptyBody: {
    fontSize: Typography.sm,
    color: '#44474e',
    textAlign: 'center',
    maxWidth: 220,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  txIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txIconCredit: { backgroundColor: '#dde1ff' },
  txIconDebit: { backgroundColor: '#ffdad6' },
  txIcon: { fontSize: 18, fontWeight: Typography.bold },
  txIconTextCredit: { color: '#0040e0' },
  txIconTextDebit: { color: '#ba1a1a' },
  txDesc: {
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: '#000D22',
    textTransform: 'capitalize',
  },
  txDate: {
    fontSize: Typography.xs,
    color: '#74777e',
    marginTop: 2,
  },
  txAmount: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
  },
  txAmountCredit: { color: '#0040e0' },
  txAmountDebit: { color: '#ba1a1a' },
});
