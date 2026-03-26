import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type MenuItem = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sub: string;
  route?: string;
  onPress?: () => void;
  danger?: boolean;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RiderProfileScreen() {
  const { profile, signOut } = useAuthStore();
  const insets = useSafeAreaInsets();

  const initials = profile?.full_name
    ?.split(' ')
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '?';

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

  const menuSections: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Vehicle & Compliance',
      items: [
        {
          icon: 'bicycle-outline',
          label: 'Edit Vehicle Info',
          sub: 'Update your vehicle details',
          route: '/(rider)/edit-vehicle',
        },
        {
          icon: 'document-text-outline',
          label: 'Documents',
          sub: 'License, insurance, plate photo',
          route: '/(rider)/documents-management',
        },
      ],
    },
    {
      title: 'Financials',
      items: [
        {
          icon: 'card-outline',
          label: 'Bank Account',
          sub: 'Payout bank details',
          route: '/(rider)/bank-account-settings',
        },
      ],
    },
    {
      title: 'Safety',
      items: [
        {
          icon: 'shield-checkmark-outline',
          label: 'SOS & Safety',
          sub: 'Emergency alert and safety features',
          route: '/(rider)/sos-modal',
        },
      ],
    },
    {
      title: 'Account',
      items: [
        {
          icon: 'log-out-outline',
          label: 'Sign Out',
          sub: 'Log out of Dzpatch Rider',
          onPress: handleSignOut,
          danger: true,
        },
      ],
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{profile?.full_name ?? '—'}</Text>
        {profile?.phone && <Text style={styles.phone}>{profile.phone}</Text>}
        <View style={[styles.kycBadge, profile?.kyc_status === 'approved' && styles.kycBadgeApproved]}>
          <Ionicons
            name={profile?.kyc_status === 'approved' ? 'checkmark-circle' : 'time-outline'}
            size={13}
            color={profile?.kyc_status === 'approved' ? '#16A34A' : '#D97706'}
          />
          <Text style={[styles.kycText, profile?.kyc_status === 'approved' && styles.kycTextApproved]}>
            {profile?.kyc_status === 'approved' ? 'Verified Rider' : 'KYC Pending'}
          </Text>
        </View>
      </View>

      {/* Menu sections */}
      {menuSections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.menuCard}>
            {section.items.map((item, idx) => (
              <Pressable
                key={idx}
                style={[styles.menuRow, idx === section.items.length - 1 && styles.menuRowLast]}
                onPress={item.onPress ?? (() => router.push(item.route! as any))}
              >
                <View style={[styles.menuIcon, item.danger && styles.menuIconDanger]}>
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={item.danger ? '#ba1a1a' : '#0040e0'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuLabel, item.danger && styles.menuLabelDanger]}>
                    {item.label}
                  </Text>
                  <Text style={styles.menuSub}>{item.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#C4C6CF" />
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <Text style={styles.version}>Dzpatch Rider v2.0.0</Text>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  content: { gap: 16, paddingTop: 8 },

  // Hero
  hero: { alignItems: 'center', paddingHorizontal: Spacing[5], paddingVertical: 20, gap: 6 },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#0040e0', alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#FFFFFF',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 16, elevation: 6,
  },
  avatarText: { fontSize: 28, fontWeight: '900', color: '#FFFFFF' },
  name: { fontSize: Typography['2xl'], fontWeight: '800', color: '#000D22', marginTop: 4 },
  phone: { fontSize: Typography.sm, color: '#74777e' },
  kycBadge: {
    marginTop: 6, paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 999, backgroundColor: '#FEF3C7',
    borderWidth: 1, borderColor: '#D97706',
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  kycBadgeApproved: { backgroundColor: '#DCFCE7', borderColor: '#16A34A' },
  kycText: { fontSize: Typography.xs, fontWeight: '700', color: '#D97706' },
  kycTextApproved: { color: '#16A34A' },

  // Sections
  section: { gap: 8, paddingHorizontal: Spacing[5] },
  sectionTitle: { fontSize: Typography.xs, fontWeight: '700', color: '#74777e', letterSpacing: 1, textTransform: 'uppercase' },
  menuCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden',
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 12, elevation: 2,
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    gap: 12, borderBottomWidth: 1, borderBottomColor: '#F1F4F6',
  },
  menuRowLast: { borderBottomWidth: 0 },
  menuIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },
  menuIconDanger: { backgroundColor: '#ffdad6' },
  menuLabel: { fontSize: Typography.sm, fontWeight: '700', color: '#000D22' },
  menuLabelDanger: { color: '#ba1a1a' },
  menuSub: { fontSize: Typography.xs, color: '#74777e', marginTop: 1 },

  version: { fontSize: Typography.xs, color: '#C4C6CF', textAlign: 'center', letterSpacing: 0.5, paddingBottom: 8 },
});
