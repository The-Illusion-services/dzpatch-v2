import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Avatar } from '@/components/ui';
import { Spacing, Typography } from '@/constants/theme';

type MenuItem = {
  icon: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  danger?: boolean;
};

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
      icon: '📍',
      label: 'Saved Addresses',
      sublabel: 'Manage your frequent locations',
      onPress: () => router.push('/(customer)/saved-addresses' as any),
    },
    {
      icon: '🔔',
      label: 'Notifications',
      sublabel: 'Manage push preferences',
      onPress: () => {},
    },
    {
      icon: '🔒',
      label: 'Security',
      sublabel: 'Password & account security',
      onPress: () => {},
    },
    {
      icon: '🎧',
      label: 'Help & Support',
      sublabel: 'FAQs, contact us',
      onPress: () => {},
    },
    {
      icon: '📄',
      label: 'Terms & Privacy',
      onPress: () => {},
    },
    {
      icon: '🚪',
      label: 'Sign Out',
      onPress: handleSignOut,
      danger: true,
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile card */}
      <View style={styles.profileCard}>
        <Avatar name={profile?.full_name ?? ''} uri={profile?.avatar_url} size="lg" />
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{profile?.full_name ?? '—'}</Text>
          <Text style={styles.profilePhone}>{profile?.phone ?? ''}</Text>
          {profile?.email ? <Text style={styles.profileEmail}>{profile.email}</Text> : null}
        </View>
        <View style={[styles.kycBadge, profile?.kyc_status === 'approved' && styles.kycApproved]}>
          <Text style={styles.kycText}>
            {profile?.kyc_status === 'approved' ? '✓ Verified' : profile?.kyc_status?.replace('_', ' ') ?? 'KYC Pending'}
          </Text>
        </View>
      </View>

      {/* Menu */}
      <View style={styles.menu}>
        {menuItems.map((item, idx) => (
          <Pressable
            key={idx}
            style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.7 }]}
            onPress={item.onPress}
          >
            <View style={styles.menuIconWrap}>
              <Text style={styles.menuIcon}>{item.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, item.danger && styles.menuLabelDanger]}>{item.label}</Text>
              {item.sublabel ? <Text style={styles.menuSublabel}>{item.sublabel}</Text> : null}
            </View>
            {!item.danger && <Text style={styles.menuChevron}>›</Text>}
          </Pressable>
        ))}
      </View>

      <Text style={styles.version}>Dzpatch v2.0.0 — Nigeria</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  content: {
    paddingHorizontal: Spacing[5],
    paddingBottom: 120,
    gap: 20,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
    elevation: 3,
    marginTop: 16,
  },
  profileInfo: {
    alignItems: 'center',
    gap: 4,
  },
  profileName: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: '#000D22',
    letterSpacing: -0.3,
  },
  profilePhone: {
    fontSize: Typography.sm,
    color: '#44474e',
    fontWeight: Typography.medium,
  },
  profileEmail: {
    fontSize: Typography.xs,
    color: '#74777e',
  },
  kycBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F1F4F6',
    borderWidth: 1,
    borderColor: '#c4c6cf',
  },
  kycApproved: {
    backgroundColor: '#dde1ff',
    borderColor: '#0040e0',
  },
  kycText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  menu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
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
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: { fontSize: 18 },
  menuLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: '#000D22',
  },
  menuLabelDanger: {
    color: '#ba1a1a',
  },
  menuSublabel: {
    fontSize: Typography.xs,
    color: '#74777e',
    marginTop: 1,
  },
  menuChevron: {
    fontSize: 20,
    color: '#c4c6cf',
  },
  version: {
    fontSize: Typography.xs,
    color: '#c4c6cf',
    textAlign: 'center',
    fontWeight: Typography.medium,
    letterSpacing: 1,
  },
});
