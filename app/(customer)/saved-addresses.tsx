import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Button, SkeletonCard } from '@/components/ui';
import { Colors, Spacing, Typography } from '@/constants/theme';

type SavedAddress = {
  id: string;
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
};

const LABEL_ICONS: Record<string, string> = {
  home: '🏠',
  work: '🏢',
  school: '🎓',
  other: '📍',
};

export default function SavedAddressesScreen() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAddresses = async () => {
    const { data } = await supabase
      .from('saved_addresses')
      .select('*')
      .eq('user_id', profile?.id ?? '')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    setAddresses((data as SavedAddress[]) ?? []);
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchAddresses().finally(() => setLoading(false));
    }, [profile?.id])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAddresses();
    setRefreshing(false);
  };

  const handleDelete = (id: string, label: string) => {
    Alert.alert('Delete Address', `Remove "${label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('saved_addresses').delete().eq('id', id);
          setAddresses((prev) => prev.filter((a) => a.id !== id));
        },
      },
    ]);
  };

  const handleSetDefault = async (id: string) => {
    // Clear existing default, set new one
    await supabase
      .from('saved_addresses')
      .update({ is_default: false })
      .eq('user_id', profile?.id ?? '');
    await supabase
      .from('saved_addresses')
      .update({ is_default: true })
      .eq('id', id);
    setAddresses((prev) =>
      prev.map((a) => ({ ...a, is_default: a.id === id }))
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(customer)/profile' as any)} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title}>Saved Addresses</Text>
        <Pressable
          style={styles.addBtn}
          onPress={() => router.push('/(customer)/add-address' as any)}
          hitSlop={8}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: Spacing[5], marginTop: 16 }}>
          <SkeletonCard />
          <SkeletonCard style={{ marginTop: 12 }} />
        </View>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🗺️</Text>
              <Text style={styles.emptyTitle}>No saved addresses</Text>
              <Text style={styles.emptyBody}>Add your home, work, or favourite spots for faster ordering.</Text>
              <Button
                label="Add Address"
                onPress={() => router.push('/(customer)/add-address' as any)}
                style={{ marginTop: 16 }}
                size="sm"
              />
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.addressCard}>
              <View style={styles.addressLeft}>
                <View style={styles.addressIconWrap}>
                  <Text style={styles.addressIcon}>
                    {LABEL_ICONS[item.label.toLowerCase()] ?? '📍'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.addressTopRow}>
                    <Text style={styles.addressLabel}>
                      {item.label.charAt(0).toUpperCase() + item.label.slice(1)}
                    </Text>
                    {item.is_default && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>Default</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.addressText} numberOfLines={2}>{item.address}</Text>
                </View>
              </View>

              <View style={styles.addressActions}>
                {!item.is_default && (
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => handleSetDefault(item.id)}
                    hitSlop={4}
                  >
                    <Text style={styles.actionBtnText}>Set Default</Text>
                  </Pressable>
                )}
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => router.push({
                    pathname: '/(customer)/add-address',
                    params: { addressId: item.id },
                  } as any)}
                  hitSlop={4}
                >
                  <Text style={styles.actionBtnText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnDanger]}
                  onPress={() => handleDelete(item.id, item.label)}
                  hitSlop={4}
                >
                  <Text style={styles.actionBtnDangerText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
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
  title: {
    flex: 1,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: '#000D22',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  addBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#0040e0',
    borderRadius: 999,
  },
  addBtnText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#FFFFFF',
  },
  list: {
    paddingHorizontal: Spacing[5],
    paddingTop: 16,
    paddingBottom: 100,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 8,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: '#000D22',
    marginTop: 8,
  },
  emptyBody: {
    fontSize: Typography.sm,
    color: '#44474e',
    textAlign: 'center',
    maxWidth: 240,
  },
  addressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    gap: 12,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  addressLeft: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  addressIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F1F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressIcon: { fontSize: 22 },
  addressTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addressLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#000D22',
  },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#dde1ff',
    borderRadius: 999,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: '#0040e0',
  },
  addressText: {
    fontSize: Typography.xs,
    color: '#44474e',
    marginTop: 2,
    lineHeight: 18,
  },
  addressActions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F1F4F6',
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F4F6',
  },
  actionBtnText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: '#44474e',
  },
  actionBtnDanger: {
    backgroundColor: '#ffdad6',
  },
  actionBtnDangerText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: '#ba1a1a',
  },
});
