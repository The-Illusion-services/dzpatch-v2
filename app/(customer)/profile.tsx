import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type MenuItem = {
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  label: string;
  sublabel: string;
  onPress: () => void;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { profile, signOut } = useAuthStore();
  const insets = useSafeAreaInsets();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login' as any);
        },
      },
    ]);
  };

  const menuItems: MenuItem[] = [
    {
      icon: 'location-outline',
      label: 'Saved Addresses',
      sublabel: 'Manage your frequent locations',
      onPress: () => router.push('/(customer)/saved-addresses' as any),
    },
    {
      icon: 'cube-outline',
      label: 'Order History',
      sublabel: 'View past and active deliveries',
      onPress: () => router.push('/(customer)/order-history' as any),
    },
    {
      icon: 'wallet-outline',
      label: 'Wallet',
      sublabel: 'Balance, top-up, withdrawals',
      onPress: () => router.push('/(customer)/wallet' as any),
    },
    {
      icon: 'notifications-outline',
      label: 'Notifications',
      sublabel: 'Order updates and alerts',
      onPress: () => router.push('/(customer)/notifications' as any),
    },
    {
      icon: 'lock-closed-outline',
      label: 'Account Security',
      sublabel: 'Password and login settings',
      onPress: () => Alert.alert('Coming Soon', 'Account security settings are coming in the next update.'),
    },
    {
      icon: 'headset-outline',
      label: 'Help & Support',
      sublabel: 'FAQs, contact us',
      onPress: () => Alert.alert('Need Help?', 'Email us at support@dzpatch.com or WhatsApp +234 800 000 0000.'),
    },
  ];

  const initials = profile?.full_name
    ?.split(' ')
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '?';

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero section */}
      <View style={styles.hero}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={[styles.kycDot, profile?.kyc_status === 'approved' && styles.kycDotApproved]} />
        </View>

        <Text style={styles.profileName}>{profile?.full_name ?? '—'}</Text>
        {profile?.email && <Text style={styles.profileEmail}>{profile.email}</Text>}
        {profile?.phone && <Text style={styles.profilePhone}>{profile.phone}</Text>}

        <View style={[styles.kycBadge, profile?.kyc_status === 'approved' && styles.kycBadgeApproved]}>
          <Text style={[styles.kycText, profile?.kyc_status === 'approved' && styles.kycTextApproved]}>
            {profile?.kyc_status === 'approved' ? '✓  Verified' : '⏳  KYC Pending'}
          </Text>
        </View>
      </View>

      {/* Menu */}
      <View style={styles.menuCard}>
        {menuItems.map((item, idx) => (
          <Pressable
            key={idx}
            style={({ pressed }) => [
              styles.menuRow,
              idx === menuItems.length - 1 && styles.menuRowLast,
              pressed && { backgroundColor: '#F7FAFC' },
            ]}
            onPress={item.onPress}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name={item.icon} size={18} color="#0040e0" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuSublabel}>{item.sublabel}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#C4C6CF" />
          </Pressable>
        ))}
      </View>

      {/* Upgrade to Business CTA */}
      <Pressable
        style={({ pressed }) => [styles.upgradeBanner, pressed && { opacity: 0.92 }]}
        onPress={() => Alert.alert('Coming Soon', 'Business accounts are launching soon. We\'ll notify you when it\'s ready!')}
      >
        <View style={styles.upgradeLeft}>
          <View style={styles.upgradeIconWrap}>
            <Ionicons name="business-outline" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.upgradeTextWrap}>
            <Text style={styles.upgradeTitle}>Upgrade to Business</Text>
            <Text style={styles.upgradeSub}>Bulk deliveries, invoicing & analytics</Text>
          </View>
        </View>
        <View style={styles.upgardeArrow}>
          <Ionicons name="arrow-forward" size={16} color="#0040e0" />
        </View>
      </Pressable>

      {/* Sign out */}
      <Pressable
        style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.8 }]}
        onPress={handleSignOut}
      >
        <Ionicons name="log-out-outline" size={18} color="#ba1a1a" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      <Text style={styles.version}>Dzpatch v2.0.0 · Built for Speed</Text>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  content: { gap: 16, paddingTop: 8 },

  // Hero
  hero: {
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingTop: 16,
    paddingBottom: 8,
    gap: 6,
  },
  avatarWrap: { position: 'relative', marginBottom: 4 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  avatarText: { fontSize: Typography['2xl'], fontWeight: Typography.extrabold, color: '#FFFFFF' },
  kycDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#C4C6CF',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  kycDotApproved: { backgroundColor: '#16A34A' },
  profileName: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: '#000D22',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  profileEmail: { fontSize: Typography.sm, color: '#44474e' },
  profilePhone: { fontSize: Typography.sm, color: '#74777e' },
  kycBadge: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#F1F4F6',
    borderWidth: 1,
    borderColor: '#C4C6CF',
  },
  kycBadgeApproved: { backgroundColor: '#dcfce7', borderColor: '#16A34A' },
  kycText: { fontSize: Typography.xs, fontWeight: Typography.bold, color: '#44474e', letterSpacing: 0.5 },
  kycTextApproved: { color: '#16A34A' },

  // Menu
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    marginHorizontal: Spacing[5],
    overflow: 'hidden',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F4F6',
  },
  menuRowLast: { borderBottomWidth: 0 },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#000D22' },
  menuSublabel: { fontSize: Typography.xs, color: '#74777e', marginTop: 1 },

  // Upgrade banner
  upgradeBanner: {
    marginHorizontal: Spacing[5],
    backgroundColor: '#0A2342',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upgradeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  upgradeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  upgradeTextWrap: { flex: 1, gap: 3 },
  upgradeTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.extrabold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  upgradeSub: {
    fontSize: Typography.xs,
    color: 'rgba(168,196,255,0.8)',
  },
  upgardeArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Sign out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: Spacing[5],
    height: 52,
    borderRadius: 16,
    backgroundColor: '#ffdad6',
    borderWidth: 1,
    borderColor: '#ba1a1a',
  },
  signOutText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#ba1a1a' },

  version: {
    fontSize: Typography.xs,
    color: '#C4C6CF',
    textAlign: 'center',
    letterSpacing: 0.5,
    paddingBottom: 8,
  },
});
