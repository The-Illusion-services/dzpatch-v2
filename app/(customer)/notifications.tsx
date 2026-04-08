import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';
import { useAppStateChannels } from '@/hooks/use-app-state-channels';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationType = 'order_update' | 'promo' | 'system' | 'payment';

type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
  order_id: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notifIcon(type: NotificationType): string {
  switch (type) {
    case 'order_update': return '🚚';
    case 'payment':      return '💳';
    case 'promo':        return '🎁';
    case 'system':       return 'ℹ';
    default:             return '🔔';
  }
}

function notifIconBg(type: NotificationType, isRead: boolean): string {
  if (!isRead) {
    switch (type) {
      case 'order_update': return '#dde1ff';
      case 'payment':      return '#dde1ff';
      case 'promo':        return '#ffdbcb';
      default:             return '#F1F4F6';
    }
  }
  return '#F1F4F6';
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!profile?.id) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, data, is_read, created_at')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) {
      console.warn('notifications load failed:', error.message);
      return;
    }
    if (data) {
      setNotifications((data as (Omit<Notification, 'order_id'> & { data: Record<string, unknown> | null })[]).map((item) => ({
        ...item,
        order_id: typeof item.data?.order_id === 'string' ? item.data.order_id : null,
      })));
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchNotifications().finally(() => setLoading(false));

    // Realtime — new notifications
    if (!profile?.id) return;
    const channel = supabase
      .channel(`user:${profile.id}:notifications`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, (payload) => {
        setNotifications((prev) => [payload.new as Notification, ...prev]);
      })
      .subscribe();
    channelRef.current = channel;

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, fetchNotifications]);

  useAppStateChannels([channelRef.current], {
    onForeground: fetchNotifications,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const markAllRead = async () => {
    if (!profile?.id) return;
    const { error } = await (supabase.from('notifications') as any)
      .update({ is_read: true })
      .eq('user_id', profile.id)
      .eq('is_read', false);
    if (error) {
      console.warn('notifications mark-all-read failed:', error.message);
      return;
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const markRead = async (id: string) => {
    const { error } = await (supabase.from('notifications') as any).update({ is_read: true }).eq('id', id);
    if (error) {
      console.warn('notifications mark-read failed:', error.message);
      return;
    }
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const handlePress = async (notif: Notification) => {
    if (!notif.is_read) await markRead(notif.id);
    if (notif.order_id && notif.type === 'order_update') {
      router.push({ pathname: '/(customer)/order-details', params: { orderId: notif.order_id } } as any);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Group by type category
  const orderNotifs = notifications.filter((n) => n.type === 'order_update' || n.type === 'payment');
  const promoNotifs = notifications.filter((n) => n.type === 'promo');
  const systemNotifs = notifications.filter((n) => n.type === 'system');

  const renderNotif = (notif: Notification) => (
    <Pressable
      key={notif.id}
      style={[styles.notifRow, !notif.is_read && styles.notifRowUnread]}
      onPress={() => handlePress(notif)}
    >
      {!notif.is_read && <View style={styles.unreadAccent} />}
      <View style={[styles.notifIconWrap, { backgroundColor: notifIconBg(notif.type, notif.is_read) }]}>
        <Text style={styles.notifIcon}>{notifIcon(notif.type)}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.notifHeader}>
          <Text style={styles.notifTitle} numberOfLines={1}>{notif.title}</Text>
          <Text style={styles.notifTime}>{relativeTime(notif.created_at)}</Text>
        </View>
        <Text style={styles.notifBody} numberOfLines={2}>{notif.body}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(customer)/profile' as any)} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 ? (
          <Pressable onPress={markAllRead} hitSlop={8}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        ) : (
          <View style={{ width: 70 }} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0040e0" />}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
      >
        {!loading && notifications.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyBody}>Order updates and alerts will appear here.</Text>
          </View>
        )}

        {/* Order Updates */}
        {orderNotifs.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Order Updates</Text>
              {orderNotifs.filter((n) => !n.is_read).length > 0 && (
                <View style={styles.sectionBadge}>
                  <Text style={styles.sectionBadgeText}>
                    {orderNotifs.filter((n) => !n.is_read).length} NEW
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.notifGroup}>
              {orderNotifs.map(renderNotif)}
            </View>
          </View>
        )}

        {/* Promo Alerts */}
        {promoNotifs.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Promo Alerts</Text>
            </View>

            {/* Featured promo card (first promo item) */}
            {promoNotifs[0] && (
              <Pressable
                style={styles.promoCard}
                onPress={() => handlePress(promoNotifs[0])}
              >
                <View style={styles.promoGlow1} />
                <View style={styles.promoGlow2} />
                <View style={styles.promoContent}>
                  <Text style={styles.promoTagline}>SPECIAL OFFER</Text>
                  <Text style={styles.promoTitle}>{promoNotifs[0].title}</Text>
                  <Text style={styles.promoBody} numberOfLines={2}>{promoNotifs[0].body}</Text>
                </View>
              </Pressable>
            )}

            {/* Remaining promos */}
            {promoNotifs.length > 1 && (
              <View style={styles.notifGroup}>
                {promoNotifs.slice(1).map(renderNotif)}
              </View>
            )}
          </View>
        )}

        {/* System Messages */}
        {systemNotifs.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>System</Text>
            </View>
            <View style={styles.notifGroup}>
              {systemNotifs.map(renderNotif)}
            </View>
          </View>
        )}
      </ScrollView>
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
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  backArrow: { fontSize: 20, color: '#0040e0', fontWeight: Typography.bold },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: '#000D22', letterSpacing: -0.3 },
  unreadBadge: {
    backgroundColor: '#0040e0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    minWidth: 22,
    alignItems: 'center',
  },
  unreadBadgeText: { fontSize: 11, fontWeight: Typography.extrabold, color: '#FFFFFF' },
  markAllText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: '#0040e0' },

  scrollContent: { gap: 0, paddingTop: 8 },

  // Sections
  section: { paddingBottom: 16 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing[5],
    paddingTop: 16,
    paddingBottom: 10,
  },
  sectionTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#000D22' },
  sectionBadge: {
    backgroundColor: '#0040e0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  sectionBadgeText: { fontSize: 9, fontWeight: Typography.extrabold, color: '#FFFFFF', letterSpacing: 1 },

  notifGroup: {
    marginHorizontal: Spacing[5],
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F4F6',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  notifRowUnread: { backgroundColor: '#FAFBFF' },
  unreadAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#0040e0',
  },
  notifIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  notifIcon: { fontSize: 18 },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  notifTitle: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.bold, color: '#000D22' },
  notifTime: { fontSize: 10, color: '#74777e', flexShrink: 0 },
  notifBody: { fontSize: Typography.xs, color: '#44474e', lineHeight: 18 },

  // Promo card
  promoCard: {
    marginHorizontal: Spacing[5],
    backgroundColor: '#0a2342',
    borderRadius: 20,
    padding: 20,
    gap: 8,
    overflow: 'hidden',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 10,
  },
  promoGlow1: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#0040e0',
    opacity: 0.2,
  },
  promoGlow2: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e66100',
    opacity: 0.15,
  },
  promoContent: { position: 'relative', zIndex: 1, gap: 6 },
  promoTagline: {
    fontSize: 9,
    fontWeight: Typography.extrabold,
    color: '#768baf',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  promoTitle: { fontSize: Typography.lg, fontWeight: Typography.extrabold, color: '#FFFFFF', letterSpacing: -0.3 },
  promoBody: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.7)', lineHeight: 18 },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 8, paddingHorizontal: Spacing[5] },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: Typography.lg, fontWeight: Typography.bold, color: '#000D22' },
  emptyBody: { fontSize: Typography.sm, color: '#44474e', textAlign: 'center' },
});
