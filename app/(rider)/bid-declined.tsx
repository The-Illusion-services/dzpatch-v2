import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Typography } from '@/constants/theme';

export default function BidDeclinedScreen() {
  const insets = useSafeAreaInsets();
  const { cancellationReason } = useLocalSearchParams<{ cancellationReason?: string }>();

  const isCancelled = !!cancellationReason;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Ionicons name={isCancelled ? 'ban-outline' : 'close-circle'} size={64} color="#ba1a1a" />
        </View>
        <Text style={styles.headline}>{isCancelled ? 'Order Cancelled' : 'Bid Declined'}</Text>
        <Text style={styles.sub}>
          {isCancelled
            ? 'The customer cancelled the order before accepting your bid.'
            : "The customer didn't accept your offer this time."}
        </Text>
      </View>

      {/* Status Bento */}
      <View style={styles.bentoGrid}>
        <View style={[styles.bentoCard, styles.bentoCardError]}>
          <Ionicons name={isCancelled ? 'ban-outline' : 'close-outline'} size={20} color="#ba1a1a" />
          <Text style={[styles.bentoValue, { color: '#ba1a1a' }]}>{isCancelled ? 'CANCELLED' : 'REJECTED'}</Text>
          <Text style={styles.bentoLabel}>Order Status</Text>
        </View>
        <View style={styles.bentoCard}>
          <Ionicons name="trending-up-outline" size={20} color="#0040e0" />
          <Text style={[styles.bentoValue, { color: '#0040e0' }]}>HIGH</Text>
          <Text style={styles.bentoLabel}>Market Activity</Text>
        </View>
      </View>

      {/* Cancellation reason card */}
      {isCancelled && (
        <View style={styles.reasonCard}>
          <View style={styles.reasonRow}>
            <Ionicons name="alert-circle-outline" size={18} color="#b45309" />
            <View style={{ flex: 1 }}>
              <Text style={styles.reasonLabel}>REASON</Text>
              <Text style={styles.reasonText}>{cancellationReason}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Info card */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Ionicons name="information-circle-outline" size={18} color="#0040e0" />
          <Text style={styles.infoText}>
            More orders are available nearby. Return to the map to find another delivery.
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.replace({ pathname: '/(rider)/' as any })}
        >
          <Ionicons name="map-outline" size={18} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>Back to Home</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC', paddingHorizontal: Spacing[5] },

  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  iconWrap: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#ffdad6',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#ba1a1a', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 4,
  },
  headline: { fontSize: Typography['2xl'], fontWeight: '900', color: '#000D22', textAlign: 'center' },
  sub: { fontSize: Typography.sm, color: '#74777e', textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },

  bentoGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  bentoCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 18, gap: 4,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  bentoCardError: { backgroundColor: '#ffdad6' },
  bentoValue: { fontSize: Typography.sm, fontWeight: '900', color: '#000D22', letterSpacing: 1 },
  bentoLabel: { fontSize: Typography.xs, color: '#74777e' },

  reasonCard: {
    backgroundColor: '#fff4e5', borderRadius: 16,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#f59e0b',
  },
  reasonRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  reasonLabel: { fontSize: 10, fontWeight: '700', color: '#b45309', textTransform: 'uppercase', letterSpacing: 0.5 },
  reasonText: { fontSize: Typography.sm, color: '#000D22', lineHeight: 20, marginTop: 2 },

  infoCard: {
    backgroundColor: '#EEF2FF', borderRadius: 16,
    padding: 16, marginBottom: 24,
  },
  infoRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: Typography.sm, color: '#000D22', lineHeight: 20 },

  actions: { gap: 12 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 58, borderRadius: 18,
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 6,
  },
  primaryBtnText: { fontSize: Typography.md, fontWeight: '800', color: '#FFFFFF' },
});
