import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
import { useAppStateChannels } from '@/hooks/use-app-state-channels';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
  is_system?: boolean;
}

interface RiderInfo {
  full_name: string;
  phone: string;
  order_status: string;
  vehicle_plate?: string;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { profile } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [riderInfo, setRiderInfo] = useState<RiderInfo | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Fetch rider info for header ────────────────────────────────────────────

  const fetchRiderInfo = useCallback(async () => {
    const { data: orderRaw } = await supabase
      .from('orders')
      .select('rider_id, status')
      .eq('id', orderId)
      .single();
    const order = orderRaw as { rider_id: string | null; status: string } | null;

    if (order?.rider_id) {
      const { data: rider } = await supabase
        .from('riders')
        .select('vehicle_plate, profiles(full_name, phone)')
        .eq('profile_id', order.rider_id)
        .single();

      if (rider && (rider as any).profiles) {
        setRiderInfo({
          ...(rider as any).profiles,
          order_status: order.status,
          vehicle_plate: (rider as any).vehicle_plate,
        });
      }
    }
  }, [orderId]);

  // ── Fetch message history ──────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('chat_messages')
      .select('id, sender_id, message, created_at, is_read')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (data) setMessages(data as ChatMessage[]);
  }, [orderId]);

  // ── Subscribe to new messages ──────────────────────────────────────────────

  useEffect(() => {
    if (!orderId) return;
    fetchRiderInfo();
    fetchMessages();

    const channel = supabase
      .channel(`chat:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => { supabase.removeChannel(channel); };
  }, [orderId, fetchRiderInfo, fetchMessages]);

  useAppStateChannels([channelRef.current]);

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending || !profile) return;
    setSending(true);
    setInput('');

    await supabase.from('chat_messages').insert({
      order_id: orderId,
      sender_id: profile.id,
      message: text,
    } as any);

    setSending(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // ── Status label ───────────────────────────────────────────────────────────

  const statusLabel = (status: string) => {
    switch (status) {
      case 'matched':         return 'Assigned';
      case 'pickup_en_route': return 'Heading to Pick-up';
      case 'arrived_pickup':  return 'Arrived at Pick-up';
      case 'in_transit':      return 'On the Way';
      case 'delivered':       return 'Delivered';
      default:                return status;
    }
  };

  // ── Render message bubble ──────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    if (item.is_system) {
      return (
        <View style={styles.systemMsg}>
          <Text style={styles.systemMsgText}>ℹ️  {item.message}</Text>
        </View>
      );
    }

    const isMe = item.sender_id === profile?.id;
    const time = new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.msgRow, isMe && styles.msgRowRight]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.message}</Text>
        </View>
        <View style={[styles.msgMeta, isMe && styles.msgMetaRight]}>
          <Text style={styles.msgTime}>{time}</Text>
          {isMe && <Text style={styles.readTick}>✓✓</Text>}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* ── Floating header ── */}
      <View style={styles.headerCard}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>
                {riderInfo?.full_name?.charAt(0) ?? '?'}
              </Text>
            </View>
            <View style={styles.onlineDot} />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.riderName}>{riderInfo?.full_name ?? 'Rider'}</Text>
            {riderInfo?.vehicle_plate && (
              <Text style={styles.vehiclePlate}>{riderInfo.vehicle_plate}</Text>
            )}
            {riderInfo?.order_status && (
              <View style={styles.statusChip}>
                <Text style={styles.statusChipText}>{statusLabel(riderInfo.order_status)}</Text>
              </View>
            )}
          </View>
        </View>

        {riderInfo?.phone && (
          <Pressable
            style={styles.callBtn}
            onPress={() => Linking.openURL(`tel:${riderInfo.phone}`)}
          >
            <Text style={styles.callIcon}>📞</Text>
          </Pressable>
        )}
      </View>

      {/* ── Message list ── */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={[
          styles.messageList,
          { paddingTop: 100 }, // space for floating header
        ]}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />

      {/* ── Input bar ── */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor="#74777e"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            returnKeyType="default"
          />
          <Pressable
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || sending}
          >
            <Text style={styles.sendIcon}>➤</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  // Floating header
  headerCard: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    zIndex: 50,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 28,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(196,198,207,0.15)',
  },
  backBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 18, color: '#74777e', fontWeight: '600' },

  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: { position: 'relative' },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarInitials: { fontSize: Typography.lg, fontWeight: Typography.bold, color: '#FFFFFF' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#16A34A',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  headerInfo: { flex: 1, gap: 2 },
  riderName: { fontSize: Typography.md, fontWeight: Typography.extrabold, color: '#000D22', letterSpacing: -0.3 },
  vehiclePlate: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginTop: 2,
  },
  statusChipText: {
    fontSize: 9,
    fontWeight: Typography.bold,
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  callBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#F1F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callIcon: { fontSize: 22 },

  // Messages
  messageList: {
    paddingHorizontal: Spacing[5],
    paddingBottom: 24,
  },
  msgRow: { flexDirection: 'column', alignItems: 'flex-start', maxWidth: '85%' },
  msgRowRight: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleThem: {
    backgroundColor: '#E5E9EB',
    borderTopLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: '#0040e0',
    borderTopRightRadius: 4,
  },
  bubbleText: { fontSize: Typography.sm, color: '#181c1e', lineHeight: 20 },
  bubbleTextMe: { color: '#FFFFFF' },
  msgMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, paddingHorizontal: 4 },
  msgMetaRight: { alignSelf: 'flex-end' },
  msgTime: { fontSize: 10, color: '#74777e' },
  readTick: { fontSize: 11, color: '#0040e0', fontWeight: Typography.bold },

  systemMsg: {
    alignSelf: 'center',
    backgroundColor: 'rgba(241,244,246,0.7)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#dde1ff',
    maxWidth: '90%',
  },
  systemMsgText: { fontSize: 12, color: '#44474e', lineHeight: 18 },

  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: Typography.sm, color: '#74777e' },

  // Input
  inputBar: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingTop: 8,
    paddingHorizontal: Spacing[5],
    borderTopWidth: 1,
    borderTopColor: 'rgba(196,198,207,0.2)',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F1F4F6',
    borderRadius: 999,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: Typography.sm,
    color: '#181c1e',
    maxHeight: 100,
    paddingVertical: 4,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  sendBtnDisabled: { backgroundColor: '#C4C6CF', shadowOpacity: 0 },
  sendIcon: { fontSize: 16, color: '#FFFFFF', fontWeight: Typography.bold },
});
