import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { useRiderSignupStore } from '@/store/rider-signup.store';
import { Spacing, Typography } from '@/constants/theme';

const TOTAL_STEPS = 5;

export default function SignupReviewScreen() {
  const insets = useSafeAreaInsets();
  const { user, loadProfile } = useAuthStore();
  const store = useRiderSignupStore();
  const [loading, setLoading] = useState(false);

  const uploadDocument = async (uri: string, docType: string): Promise<string> => {
    const ext = uri.split('.').pop() ?? 'jpg';
    const path = `rider-docs/${user?.id}/${docType}-${Date.now()}.${ext}`;

    const response = await fetch(uri);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    const { error } = await supabase.storage
      .from('documents')
      .upload(path, arrayBuffer, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: true });

    if (error) throw error;

    // Return the storage path — admin uses signed URLs for review; rider never re-views their own upload docs in-app
    return path;
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'Session expired. Please sign in again.');
      return;
    }

    setLoading(true);
    try {
      // 1. Update profile: set full_name, email, role=rider, kyc_status=pending
      const { error: profileErr } = await (supabase
        .from('profiles') as any)
        .update({
          full_name: store.fullName,
          email: store.email || null,
          role: 'rider',
          kyc_status: 'pending',
        })
        .eq('id', user.id);
      if (profileErr) throw profileErr;

      // 2. Create rider record
      const { data: riderData, error: riderErr } = await supabase
        .from('riders')
        .insert({
          profile_id: user.id,
          vehicle_type: store.vehicleType ? store.vehicleType.toLowerCase() : null,
          vehicle_plate: store.plateNumber,
          vehicle_make: store.vehicleMake,
          vehicle_model: store.vehicleModel,
          vehicle_year: parseInt(store.vehicleYear) || null,
          vehicle_color: store.vehicleColor,
        } as any)
        .select('id')
        .single();
      if (riderErr) throw riderErr;

      const riderId = (riderData as any).id as string;

      // 3. Upload documents + insert rider_documents records
      const docMap: { key: 'driversLicenseUri' | 'insuranceUri' | 'platePhotoUri'; type: string; docType: any }[] = [
        { key: 'driversLicenseUri', type: 'license', docType: 'drivers_license' },
        { key: 'insuranceUri', type: 'insurance', docType: 'vehicle_insurance' },
        { key: 'platePhotoUri', type: 'plate', docType: 'plate_photo' },
      ];

      for (const doc of docMap) {
        const uri = store[doc.key];
        if (uri) {
          const url = await uploadDocument(uri, doc.type);
          const { error: docErr } = await supabase
            .from('rider_documents')
            .insert({ rider_id: riderId, document_type: doc.docType, document_url: url } as any);
          if (docErr) throw docErr;
        }
      }

      // 4. Insert bank account
      const { error: bankErr } = await supabase
        .from('rider_bank_accounts')
        .insert({
          rider_id: riderId,
          bank_name: store.bankName,
          bank_code: '', // Paystack bank code — resolved later in admin/settings
          account_number: store.accountNumber,
          account_name: store.accountHolderName,
          is_default: true,
        } as any);
      if (bankErr) throw bankErr;

      // 5. Reload profile so auth store has updated role
      await loadProfile(user.id);

      // 6. Clear signup store
      store.reset();

      // Navigate to pending approval
      router.replace('/(rider-auth)/pending-approval' as any);
    } catch (err: any) {
      Alert.alert('Submission Failed', err.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color="#0040e0" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Review Application</Text>
          <Text style={styles.headerStep}>Step 5 of {TOTAL_STEPS}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress bar */}
      <View style={progressStyles.track}>
        <View style={[progressStyles.fill, { width: '100%' }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>
          Review your details before submitting for approval.
        </Text>

        {/* Personal Details */}
        <ReviewCard
          title="Personal Details"
          icon="person-outline"
          onEdit={() => router.push('/(rider-auth)/signup-personal' as any)}
          rows={[
            { label: 'Full Name', value: store.fullName || '—' },
            { label: 'Phone', value: store.phone || '—' },
            { label: 'Email', value: store.email || 'Not provided' },
          ]}
        />

        {/* Vehicle Details */}
        <ReviewCard
          title="Vehicle Details"
          icon="bicycle-outline"
          onEdit={() => router.push('/(rider-auth)/signup-vehicle' as any)}
          rows={[
            { label: 'Type', value: store.vehicleType.charAt(0).toUpperCase() + store.vehicleType.slice(1) },
            { label: 'Vehicle', value: `${store.vehicleMake} ${store.vehicleModel} (${store.vehicleYear})` || '—' },
            { label: 'Plate', value: store.plateNumber || '—' },
            { label: 'Color', value: store.vehicleColor.charAt(0).toUpperCase() + store.vehicleColor.slice(1) },
          ]}
        />

        {/* Documents */}
        <ReviewCard
          title="Documents"
          icon="document-text-outline"
          onEdit={() => router.push('/(rider-auth)/signup-documents' as any)}
          rows={[
            { label: "Driver's License", value: store.driversLicenseUri ? '✓ Uploaded' : '✗ Missing', valueColor: store.driversLicenseUri ? '#16A34A' : '#ba1a1a' },
            { label: 'Vehicle Insurance', value: store.insuranceUri ? '✓ Uploaded' : '✗ Missing', valueColor: store.insuranceUri ? '#16A34A' : '#ba1a1a' },
            { label: 'Plate Photo', value: store.platePhotoUri ? '✓ Uploaded' : '✗ Missing', valueColor: store.platePhotoUri ? '#16A34A' : '#ba1a1a' },
          ]}
        />

        {/* Payout Details */}
        <View style={[styles.reviewCard, styles.payoutCard]}>
          <View style={styles.reviewCardHeader}>
            <View style={styles.reviewIconWrap}>
              <Ionicons name="wallet-outline" size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.reviewCardTitleDark}>Payout Details</Text>
            <Pressable onPress={() => router.push('/(rider-auth)/signup-bank' as any)} hitSlop={8}>
              <Text style={styles.editLinkDark}>Edit</Text>
            </Pressable>
          </View>
          <View style={styles.reviewRows}>
            <ReviewRowDark label="Bank" value={store.bankName || '—'} />
            <ReviewRowDark label="Account Name" value={store.accountHolderName || '—'} />
            <ReviewRowDark label="Account No." value={store.accountNumber ? `••••${store.accountNumber.slice(-4)}` : '—'} />
          </View>
          <View style={styles.verifiedBadge}>
            <Ionicons name="shield-checkmark" size={12} color="#0040e0" />
            <Text style={styles.verifiedText}>Bank-grade encryption</Text>
          </View>
        </View>

        <Text style={styles.termsText}>
          By submitting, you agree to the{' '}
          <Text style={styles.termsLink}>Terms of Service</Text>
          {' '}and{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <Text style={styles.submitBtnText}>Submitting Application...</Text>
          ) : (
            <>
              <Text style={styles.submitBtnText}>Submit Application</Text>
              <Ionicons name="send" size={18} color="#FFFFFF" />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function ReviewCard({ title, icon, onEdit, rows }: {
  title: string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  onEdit: () => void;
  rows: { label: string; value: string; valueColor?: string }[];
}) {
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewCardHeader}>
        <View style={styles.reviewIconWrapLight}>
          <Ionicons name={icon} size={18} color="#0040e0" />
        </View>
        <Text style={styles.reviewCardTitle}>{title}</Text>
        <Pressable onPress={onEdit} hitSlop={8}>
          <Text style={styles.editLink}>Edit</Text>
        </Pressable>
      </View>
      <View style={styles.reviewRows}>
        {rows.map((r) => (
          <View key={r.label} style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>{r.label}</Text>
            <Text style={[styles.reviewValue, r.valueColor ? { color: r.valueColor } : null]}>
              {r.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ReviewRowDark({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabelDark}>{label}</Text>
      <Text style={styles.reviewValueDark}>{value}</Text>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: { height: 4, backgroundColor: '#E5E7EB', marginHorizontal: Spacing[5], borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#0040e0', borderRadius: 2 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[5], paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  headerTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#000D22' },
  headerStep: { fontSize: Typography.xs, color: '#74777e' },

  scroll: { paddingHorizontal: Spacing[5], paddingTop: 20, paddingBottom: 20, gap: 16 },
  subtitle: { fontSize: Typography.sm, color: '#44474e', lineHeight: 22 },

  reviewCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 16, gap: 12,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  payoutCard: { backgroundColor: '#0A2342' },

  reviewCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewIconWrapLight: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },
  reviewIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#0040e0', alignItems: 'center', justifyContent: 'center',
  },
  reviewCardTitle: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.bold, color: '#000D22' },
  reviewCardTitleDark: { flex: 1, fontSize: Typography.sm, fontWeight: Typography.bold, color: '#FFFFFF' },
  editLink: { fontSize: Typography.xs, fontWeight: '600', color: '#0040e0' },
  editLinkDark: { fontSize: Typography.xs, fontWeight: '600', color: '#dde1ff' },

  reviewRows: { gap: 8 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewLabel: { fontSize: Typography.xs, color: '#74777e', textTransform: 'uppercase', letterSpacing: 0.5 },
  reviewValue: { fontSize: Typography.sm, fontWeight: '600', color: '#000D22', textAlign: 'right', flex: 1, marginLeft: 12 },
  reviewLabelDark: { fontSize: Typography.xs, color: 'rgba(168,196,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 },
  reviewValueDark: { fontSize: Typography.sm, fontWeight: '600', color: '#FFFFFF', textAlign: 'right', flex: 1, marginLeft: 12 },

  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,64,224,0.15)', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start',
  },
  verifiedText: { fontSize: 11, fontWeight: '600', color: '#dde1ff' },

  termsText: { fontSize: Typography.xs, color: '#74777e', textAlign: 'center', lineHeight: 18 },
  termsLink: { color: '#0040e0', fontWeight: '600' },

  footer: {
    paddingHorizontal: Spacing[5], paddingTop: 12,
    backgroundColor: '#F7FAFC',
    borderTopWidth: 1, borderTopColor: '#F1F4F6',
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 54, backgroundColor: '#0040e0', borderRadius: 16,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#FFFFFF' },
});
