import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

const EMERGENCY_NUMBER = '112';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SOSModalScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // ── Pulse animation ────────────────────────────────────────────────────────

  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.15,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulse]);

  // ── Send SOS ───────────────────────────────────────────────────────────────

  const handleSendSOS = async () => {
    if (!profile?.id || sending || sent) return;

    Alert.alert(
      'Send Emergency Alert?',
      'This will notify our security team and share your live location with emergency contacts.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Alert',
          style: 'destructive',
          onPress: async () => {
            setSending(true);
            try {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              // Get current location for SOS
              const { default: ExpoLocation } = await import('expo-location');
              let lat: number | undefined;
              let lng: number | undefined;
              try {
                const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High });
                lat = loc.coords.latitude;
                lng = loc.coords.longitude;
              } catch {
                // Location unavailable — send SOS anyway
              }

              await (supabase as any).rpc('trigger_sos', {
                p_user_id: profile.id,
                p_lat: lat ?? null,
                p_lng: lng ?? null,
              });

              setSent(true);
              Alert.alert(
                'Alert Sent',
                'Our security team has been notified. Call emergency services now if you are in immediate danger.',
                [
                  {
                    text: 'Call 112',
                    style: 'destructive',
                    onPress: () => {
                      void Linking.openURL(`tel:${EMERGENCY_NUMBER}`);
                      router.back();
                    },
                  },
                  { text: 'OK', onPress: () => router.back() },
                ]
              );
            } catch {
              Alert.alert('Error', 'Could not send emergency alert. Please call emergency services directly.');
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Back */}
      <Pressable onPress={() => router.back()} style={[styles.backBtn]} hitSlop={8}>
        <Ionicons name="close" size={20} color="#0040e0" />
      </Pressable>

      {/* Status area */}
      <View style={styles.statusArea}>
        {/* Security features bento */}
        <View style={styles.securityGrid}>
          <View style={styles.securityCard}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#0040e0" />
            <Text style={styles.securityCardTitle}>Active Monitoring</Text>
            <Text style={styles.securityCardSub}>24/7 Security Guard</Text>
          </View>
          <View style={styles.securityCard}>
            <Ionicons name="location-outline" size={20} color="#0040e0" />
            <Text style={styles.securityCardTitle}>Live Sharing</Text>
            <Text style={styles.securityCardSub}>2 Emergency Contacts</Text>
          </View>
        </View>
      </View>

      {/* SOS Modal-style panel */}
      <View style={[styles.panel, { paddingBottom: insets.bottom + 24 }]}>
        {/* Icon */}
        <View style={styles.iconSection}>
          <Animated.View style={[styles.iconPulse, { transform: [{ scale: pulse }] }]}>
            <View style={styles.iconCircle}>
              <Ionicons name="warning" size={40} color="#FFFFFF" />
            </View>
          </Animated.View>
        </View>

        <Text style={styles.headline}>Trigger SOS?</Text>
        <Text style={styles.description}>
          This will notify our <Text style={{ fontWeight: '900' }}>security team</Text> and share your{' '}
          <Text style={{ fontWeight: '900' }}>live location</Text> with emergency contacts.
        </Text>

        {/* Actions */}
        <Pressable
          style={[styles.sosBtn, (sending || sent) && { opacity: 0.6 }]}
          onPress={handleSendSOS}
          disabled={sending || sent}
        >
          <Ionicons name="warning-outline" size={18} color="#FFFFFF" />
          <Text style={styles.sosBtnText}>
            {sending ? 'Sending Alert...' : sent ? 'Alert Sent' : 'Send Emergency Alert'}
          </Text>
        </Pressable>

        <Pressable style={styles.callBtn} onPress={() => Linking.openURL(`tel:${EMERGENCY_NUMBER}`)}>
          <Ionicons name="call-outline" size={18} color="#ba1a1a" />
          <Text style={styles.callBtnText}>Call {EMERGENCY_NUMBER} Now</Text>
        </Pressable>

        <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>

        {/* Dispatch status */}
        <View style={styles.dispatchStatus}>
          <View style={styles.dispatchDot} />
          <Text style={styles.dispatchText}>DISPATCH CENTER • ONLINE</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  backBtn: {
    position: 'absolute', top: 56, left: Spacing[5],
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },

  statusArea: {
    flex: 1, paddingHorizontal: Spacing[5],
    justifyContent: 'center', paddingTop: 60,
  },
  securityGrid: { flexDirection: 'row', gap: 12 },
  securityCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 6,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  securityCardTitle: { fontSize: Typography.sm, fontWeight: '800', color: '#000D22' },
  securityCardSub: { fontSize: Typography.xs, color: '#74777e' },

  panel: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
    paddingTop: 28, paddingHorizontal: Spacing[5],
    gap: 16,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 12,
  },

  iconSection: { alignItems: 'center' },
  iconPulse: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(186,26,26,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#ba1a1a',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#ba1a1a', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
  },

  headline: { fontSize: Typography['2xl'], fontWeight: '900', color: '#000D22', textAlign: 'center' },
  description: { fontSize: Typography.sm, color: '#44474e', textAlign: 'center', lineHeight: 22 },

  sosBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 62, borderRadius: 18,
    backgroundColor: '#ba1a1a',
    shadowColor: '#ba1a1a', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
  },
  sosBtnText: { fontSize: Typography.md, fontWeight: '800', color: '#FFFFFF' },

  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(186,26,26,0.18)',
    backgroundColor: '#FFF4F4',
  },
  callBtnText: { fontSize: Typography.md, fontWeight: '800', color: '#ba1a1a' },

  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { fontSize: Typography.sm, fontWeight: '700', color: '#74777e' },

  dispatchStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dispatchDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' },
  dispatchText: {
    fontSize: Typography.xs, fontWeight: '700', color: '#74777e',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
});
