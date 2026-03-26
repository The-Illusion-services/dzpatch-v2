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
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRiderSignupStore } from '@/store/rider-signup.store';
import { Spacing, Typography } from '@/constants/theme';

const TOTAL_STEPS = 5;

type DocKey = 'driversLicenseUri' | 'insuranceUri' | 'platePhotoUri';

type DocItem = {
  key: DocKey;
  label: string;
  description: string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
};

const DOCS: DocItem[] = [
  {
    key: 'driversLicenseUri',
    label: "Driver's License",
    description: 'Clear photo of front side',
    icon: 'card-outline',
  },
  {
    key: 'insuranceUri',
    label: 'Vehicle Insurance',
    description: 'Insurance certificate or policy document',
    icon: 'document-text-outline',
  },
  {
    key: 'platePhotoUri',
    label: 'Plate Number Photo',
    description: 'Clear photo of vehicle plate',
    icon: 'car-outline',
  },
];

export default function SignupDocumentsScreen() {
  const insets = useSafeAreaInsets();
  const store = useRiderSignupStore();

  const [docs, setDocs] = useState<Record<DocKey, string | null>>({
    driversLicenseUri: store.driversLicenseUri,
    insuranceUri: store.insuranceUri,
    platePhotoUri: store.platePhotoUri,
  });
  const [uploading, setUploading] = useState<DocKey | null>(null);

  const pickImage = async (key: DocKey) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to upload documents.');
      return;
    }
    setUploading(key);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });
    setUploading(null);
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setDocs((prev) => ({ ...prev, [key]: uri }));
      store.setDocument(key, uri);
    }
  };

  const allUploaded = DOCS.every((d) => docs[d.key] !== null);

  const handleNext = () => {
    if (!allUploaded) {
      Alert.alert('Missing Documents', 'Please upload all required documents to continue.');
      return;
    }
    router.push('/(rider-auth)/signup-bank' as any);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color="#0040e0" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Identity & Verification</Text>
          <Text style={styles.headerStep}>Step 3 of {TOTAL_STEPS}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress bar */}
      <View style={progressStyles.track}>
        <View style={[progressStyles.fill, { width: '60%' }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>
          Upload clear photos of your documents. All files are encrypted.
        </Text>

        {DOCS.map((doc) => {
          const uri = docs[doc.key];
          const isUploading = uploading === doc.key;
          return (
            <View key={doc.key} style={styles.docCard}>
              <View style={styles.docInfo}>
                <View style={[styles.docIconWrap, uri && styles.docIconUploaded]}>
                  {uri ? (
                    <Ionicons name="checkmark" size={20} color="#16A34A" />
                  ) : (
                    <Ionicons name={doc.icon} size={20} color="#0040e0" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docLabel}>{doc.label}</Text>
                  <Text style={styles.docDesc}>{doc.description}</Text>
                  {uri && (
                    <Text style={styles.uploadedText}>✓ Uploaded</Text>
                  )}
                </View>
              </View>

              {uri ? (
                <View style={styles.previewRow}>
                  <Image source={{ uri }} style={styles.preview} contentFit="cover" />
                  <Pressable
                    style={styles.replaceBtn}
                    onPress={() => pickImage(doc.key)}
                  >
                    <Text style={styles.replaceBtnText}>Replace</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={[styles.uploadBtn, isUploading && styles.uploadBtnDisabled]}
                  onPress={() => pickImage(doc.key)}
                  disabled={isUploading}
                >
                  <Ionicons name="cloud-upload-outline" size={16} color="#0040e0" />
                  <Text style={styles.uploadBtnText}>
                    {isUploading ? 'Selecting...' : 'Upload Photo'}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}

        {/* Security note */}
        <View style={styles.securityCard}>
          <Ionicons name="lock-closed" size={16} color="#0040e0" />
          <Text style={styles.securityText}>
            Encrypted Data Storage — Your documents are stored securely and only used for identity verification.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={[styles.nextBtn, !allUploaded && styles.nextBtnDisabled]}
          onPress={handleNext}
        >
          <Text style={styles.nextBtnText}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </Pressable>
        {!allUploaded && (
          <Text style={styles.footerHint}>Upload all 3 documents to continue</Text>
        )}
      </View>
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

  docCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 16, gap: 14,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  docInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  docIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  docIconUploaded: { backgroundColor: '#dcfce7' },
  docLabel: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#000D22' },
  docDesc: { fontSize: Typography.xs, color: '#74777e', marginTop: 2 },
  uploadedText: { fontSize: Typography.xs, color: '#16A34A', fontWeight: '600', marginTop: 4 },

  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: { width: 80, height: 56, borderRadius: 10, backgroundColor: '#F1F4F6' },
  replaceBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#F1F4F6', borderRadius: 10,
  },
  replaceBtnText: { fontSize: Typography.xs, fontWeight: '600', color: '#44474e' },

  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 44, backgroundColor: '#EEF2FF', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#0040e0', borderStyle: 'dashed',
  },
  uploadBtnDisabled: { opacity: 0.5 },
  uploadBtnText: { fontSize: Typography.sm, fontWeight: '600', color: '#0040e0' },

  securityCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#EEF2FF', borderRadius: 14, padding: 14,
  },
  securityText: { flex: 1, fontSize: Typography.xs, color: '#44474e', lineHeight: 18 },

  footer: {
    paddingHorizontal: Spacing[5], paddingTop: 12,
    backgroundColor: '#F7FAFC',
    borderTopWidth: 1, borderTopColor: '#F1F4F6',
    gap: 8,
  },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 54, backgroundColor: '#0040e0', borderRadius: 16,
  },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#FFFFFF' },
  footerHint: { fontSize: Typography.xs, color: '#74777e', textAlign: 'center' },
});
