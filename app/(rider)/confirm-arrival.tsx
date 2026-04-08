import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderInfo {
  pickup_address: string;
  customer_id: string;
}

interface CustomerInfo {
  full_name: string;
  phone: string;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ConfirmArrivalScreen() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { profile } = useAuthStore();

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [departing, setDeparting] = useState(false);

  // ── Pulse animation ────────────────────────────────────────────────────────

  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  // ── Fetch order + customer ─────────────────────────────────────────────────

  useEffect(() => {
    if (!orderId) return;
    let isActive = true;

    const loadOrderAndCustomer = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('pickup_address, customer_id, status')
        .eq('id', orderId)
        .single();
      if (!isActive) return;
      if (error || !data) {
        if (error) {
          console.warn('confirm-arrival load order failed:', error.message);
        }
        return;
      }

      const orderData = data as { customer_id: string; pickup_address: string; status: string };

      // Resume guard: if already past arrived_pickup, go straight to dropoff screen
      if (
        orderData.status === 'in_transit' ||
        orderData.status === 'arrived_dropoff' ||
        orderData.status === 'delivered' ||
        orderData.status === 'completed'
      ) {
        router.replace({ pathname: '/(rider)/navigate-to-dropoff' as any, params: { orderId } });
        return;
      }

      setOrder(orderData as OrderInfo);

      const { data: customerData, error: customerError } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', orderData.customer_id)
        .single();
      if (!isActive) return;
      if (customerError) {
        console.warn('confirm-arrival load customer failed:', customerError.message);
        return;
      }
      if (customerData) setCustomer(customerData as CustomerInfo);
    };

    void loadOrderAndCustomer();

    return () => {
      isActive = false;
    };
  }, [orderId]);

  // ── Proceed to dropoff ─────────────────────────────────────────────────────

  const handlePickedUp = async () => {
    if (!orderId || !profile?.id) return;
    setDeparting(true);
    try {
      const { error } = await (supabase as any).rpc('update_order_status', {
        p_order_id: orderId,
        p_new_status: 'in_transit',
        p_changed_by: profile.id,
      });
      if (error) throw error;
      router.replace({
        pathname: '/(rider)/navigate-to-dropoff' as any,
        params: { orderId },
      });
    } catch (error: any) {
      Alert.alert('Error', error.message ?? 'Could not update status. Please try again.');
    } finally {
      setDeparting(false);
    }
  };

  // ── Call / message customer ────────────────────────────────────────────────

  const callCustomer = () => {
    if (!customer?.phone) return;
    Linking.openURL(`tel:${customer.phone}`);
  };

  const messageCustomer = () => {
    if (!customer?.phone) return;
    Linking.openURL(`sms:${customer.phone}`);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Hero — pulsing check */}
      <View style={styles.hero}>
        <Animated.View style={[styles.pulseOuter, { transform: [{ scale: pulse }] }]}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={52} color="#FFFFFF" />
          </View>
        </Animated.View>
        <Text style={styles.heroLabel}>LOCATION REACHED</Text>
        <Text style={styles.heroHeadline}>Arrived at Pickup</Text>
      </View>

      {/* Bottom card */}
      <View style={[styles.card, { paddingBottom: insets.bottom + 24 }]}>
        {/* Address */}
        <View style={styles.addressSection}>
          <View style={styles.addressIcon}>
            <Ionicons name="location" size={18} color="#0040e0" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.addressLabel}>PICKUP ADDRESS</Text>
            <Text style={styles.addressText} numberOfLines={2}>
              {order?.pickup_address ?? '—'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Customer contact */}
        {customer && (
          <View style={styles.customerRow}>
            <View style={styles.customerAvatar}>
              <Text style={styles.customerInitial}>
                {customer.full_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{customer.full_name}</Text>
              <Text style={styles.customerPhone}>{customer.phone}</Text>
            </View>
            <Pressable style={styles.contactBtn} onPress={messageCustomer} hitSlop={8}>
              <Ionicons name="chatbubble-outline" size={16} color="#0040e0" />
            </Pressable>
            <Pressable style={styles.contactBtn} onPress={callCustomer} hitSlop={8}>
              <Ionicons name="call-outline" size={16} color="#0040e0" />
            </Pressable>
          </View>
        )}

        {/* Confirm button */}
        <Pressable
          style={[styles.confirmBtn, departing && { opacity: 0.6 }]}
          onPress={handlePickedUp}
          disabled={departing}
        >
          <Ionicons name="bicycle" size={18} color="#FFFFFF" />
          <Text style={styles.confirmBtnText}>
            {departing ? 'Updating...' : 'Package Picked Up — Heading Out'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EEF2FF' },

  // Hero
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  pulseOuter: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(0,64,224,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  checkCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#0040e0',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 8,
  },
  heroLabel: {
    fontSize: Typography.xs, fontWeight: '700', color: '#0040e0',
    letterSpacing: 2, textTransform: 'uppercase',
  },
  heroHeadline: { fontSize: Typography['2xl'], fontWeight: '900', color: '#000D22' },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingTop: 24, paddingHorizontal: Spacing[5],
    gap: 16,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 20, elevation: 10,
  },

  // Address
  addressSection: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  addressIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },
  addressLabel: {
    fontSize: Typography.xs, fontWeight: '700', color: '#74777e',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  addressText: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22', marginTop: 2 },

  divider: { height: 1, backgroundColor: '#F1F4F6' },

  // Customer
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customerAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#0040e0', alignItems: 'center', justifyContent: 'center',
  },
  customerInitial: { fontSize: Typography.md, fontWeight: '900', color: '#FFFFFF' },
  customerName: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },
  customerPhone: { fontSize: Typography.xs, color: '#74777e' },
  contactBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },

  // Confirm
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 58, borderRadius: 18,
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 6,
  },
  confirmBtnText: { fontSize: Typography.sm, fontWeight: '800', color: '#FFFFFF' },
});
