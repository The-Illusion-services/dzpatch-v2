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
import { Ionicons } from '@expo/vector-icons';
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

interface CustomerInfo {
  full_name: string;
  phone: string;
  order_status: string;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RiderChatScreen() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { profile } = useAuthStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Fetch customer info ────────────────────────────────────────────────────

  const fetchCustomerInfo = useCallback(async () => {
    const { data: orderRaw } = await supabase
      .from('orders')
      .select('customer_id, status')
      .eq('id', orderId)
      .single();
    const order = orderRaw as { customer_id: string; status: string } | null;
    if (order?.customer_id) {
      const { data: cust } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', order.customer_id)
        .single();
      if (cust) {
        setCustomerInfo({ ...(cust as { full_name: string; phone: string }), order_status: order.status });
      }
    }
  }, [orderId]);

  // ── Fetch message history ──────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('chat_messages')
      .select('id, sender_id, message, created_at, is_read')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
      .limit(100);
    if (data) setMessages(data as ChatMessage[]);
  }, [orderId]);

  // ── Realtime subscription ──────────────────────────────────────────────────

  useEffect(() => {
    if (!orderId) return;
    fetchCustomerInfo();
    fetchMessages();

    const channel = supabase
      .channel(`rider-chat-${orderId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `order_id=eq.${orderId}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as ChatMessage]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      })
      .subscribe();

    channelRef.current = channel;

    return () => { supabase.removeChannel(channel); };
  }, [orderId, fetchCustomerInfo, fetchMessages]);

  useAppStateChannels([channelRef.current]);

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!input.trim() || !profile?.id || !orderId) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    try {
      await (supabase.from('chat_messages') as any).insert({
        order_id: orderId,
        sender_id: profile.id,
        message: text,
      });
    } catch {
      setInput(text); // Restore on failure
    } finally {
      setSending(false);
    }
  };

  // ── Call customer ──────────────────────────────────────────────────────────

  const callCustomer = () => {
    if (!customerInfo?.phone) return;
    Linking.openURL(`tel:${customerInfo.phone}`);
  };

  // ── Format time ────────────────────────────────────────────────────────────

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  };

  // ── Render message ─────────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isOwn = item.sender_id === profile?.id;
    if (item.is_system) {
      return (
        <View style={styles.systemMsgWrap}>
          <Text style={styles.systemMsg}>{item.message}</Text>
        </View>
      );
    }
    return (
      <View style={[styles.msgRow, isOwn ? styles.msgRowOwn : styles.msgRowOther]}>
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{item.message}</Text>
          <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>
            {formatTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  const statusLabel = customerInfo?.order_status?.replace(/_/g, ' ').toUpperCase() ?? 'ACTIVE TRIP';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F7FAFC' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color="#0040e0" />
        </Pressable>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {customerInfo?.full_name?.charAt(0)?.toUpperCase() ?? 'C'}
            </Text>
            <View style={styles.onlineDot} />
          </View>
          <View>
            <Text style={styles.headerName}>{customerInfo?.full_name ?? 'Customer'}</Text>
            <Text style={styles.headerStatus}>{statusLabel}</Text>
          </View>
        </View>
        <Pressable onPress={callCustomer} style={styles.callBtn} hitSlop={8}>
          <Ionicons name="call-outline" size={20} color="#0040e0" />
        </Pressable>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={40} color="#C4C6CF" />
            <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
          </View>
        }
      />

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.inputField}
          value={input}
          onChangeText={setInput}
          placeholder={`Message ${customerInfo?.full_name?.split(' ')[0] ?? 'customer'}...`}
          placeholderTextColor="#C4C6CF"
          multiline
          maxLength={500}
          returnKeyType="send"
          blurOnSubmit
          onSubmitEditing={sendMessage}
        />
        <Pressable
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || sending}
        >
          <Ionicons name="send" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing[5], paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F1F4F6',
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { position: 'relative' },
  headerAvatarText: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#0040e0', textAlign: 'center', lineHeight: 40,
    fontSize: Typography.md, fontWeight: '900', color: '#FFFFFF',
    overflow: 'hidden',
  },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: '#16A34A', borderWidth: 2, borderColor: '#FFFFFF',
  },
  headerName: { fontSize: Typography.sm, fontWeight: '800', color: '#000D22' },
  headerStatus: { fontSize: Typography.xs, fontWeight: '700', color: '#0040e0', letterSpacing: 0.5 },
  callBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },

  // Messages
  messageList: { paddingHorizontal: Spacing[5], paddingVertical: 16, gap: 8 },
  msgRow: { marginBottom: 6 },
  msgRowOwn: { alignItems: 'flex-end' },
  msgRowOther: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '80%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, gap: 4,
  },
  bubbleOwn: {
    backgroundColor: '#0A2342',
    borderBottomRightRadius: 4,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 2,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: 'rgba(196,198,207,0.15)',
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  bubbleText: { fontSize: Typography.sm, color: '#000D22', lineHeight: 20 },
  bubbleTextOwn: { color: '#FFFFFF' },
  bubbleTime: { fontSize: 10, color: '#74777e', alignSelf: 'flex-end' },
  bubbleTimeOwn: { color: 'rgba(255,255,255,0.5)' },

  systemMsgWrap: { alignItems: 'center', marginVertical: 4 },
  systemMsg: {
    fontSize: Typography.xs, color: '#74777e',
    backgroundColor: '#F1F4F6', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 4,
  },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 80 },
  emptyText: { fontSize: Typography.sm, color: '#C4C6CF' },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: Spacing[5], paddingTop: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: '#F1F4F6',
  },
  inputField: {
    flex: 1, minHeight: 44, maxHeight: 100,
    backgroundColor: '#F1F4F6', borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: Typography.sm, color: '#000D22',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#0040e0', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
  },
  sendBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
});
