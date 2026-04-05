import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type DocStatus = 'verified' | 'pending' | 'rejected' | 'expired' | 'missing';

interface RiderDocument {
  id: string;
  document_type: string;
  status: DocStatus;
  document_url: string | null;
  created_at: string;
}

const DOC_CONFIG: Record<string, { label: string; category: string; categoryColor: string }> = {
  drivers_license: { label: "Driver's License", category: 'IDENTIFICATION', categoryColor: '#0040e0' },
  vehicle_insurance: { label: 'Vehicle Insurance', category: 'LEGAL & SAFETY', categoryColor: '#D97706' },
  plate_photo: { label: 'Plate Photo', category: 'VEHICLE DETAIL', categoryColor: '#ba1a1a' },
};

const STATUS_CONFIG: Record<DocStatus, { icon: string; color: string; bg: string; label: string }> = {
  verified: { icon: 'checkmark-circle', color: '#16A34A', bg: '#DCFCE7', label: 'Verified' },
  pending: { icon: 'time-outline', color: '#D97706', bg: '#FEF3C7', label: 'Pending Review' },
  rejected: { icon: 'close-circle', color: '#ba1a1a', bg: '#ffdad6', label: 'Rejected' },
  expired: { icon: 'alert-circle', color: '#ba1a1a', bg: '#ffdad6', label: 'Expired' },
  missing: { icon: 'cloud-upload-outline', color: '#74777e', bg: '#F1F4F6', label: 'Upload Required' },
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DocumentsManagementScreen() {
  const insets = useSafeAreaInsets();
  const { profile, riderId } = useAuthStore();

  const [documents, setDocuments] = useState<RiderDocument[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  // ── Fetch documents ────────────────────────────────────────────────────────

  const fetchDocuments = useCallback(async () => {
    if (!riderId) return;
    const { data } = await supabase
      .from('rider_documents')
      .select('id, document_type, status, document_url, created_at')
      .eq('rider_id', riderId)
      .order('created_at', { ascending: false });
    if (data) setDocuments(data as RiderDocument[]);
  }, [riderId]);

  useEffect(() => { fetchDocuments(); }, [riderId, fetchDocuments]);

  // ── Upload document ────────────────────────────────────────────────────────

  const handleUpload = async (documentType: string) => {
    if (!profile?.id || !riderId) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Photo library access is needed to upload documents.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(documentType);
    try {
      const asset = result.assets[0];
      const fileName = `${documentType}-${Date.now()}.jpg`;
      const path = `rider-docs/${profile.id}/documents/${documentType}/${fileName}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(path, {
          uri: asset.uri,
          name: fileName,
          type: 'image/jpeg',
        } as unknown as Blob, { upsert: true });

      if (uploadErr) throw uploadErr;
      const { data: existingDoc, error: existingDocError } = await supabase
        .from('rider_documents')
        .select('id')
        .eq('rider_id', riderId)
        .eq('document_type', documentType)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingDocError) throw existingDocError;

      if (existingDoc?.id) {
        const { error: updateErr } = await supabase
          .from('rider_documents')
          .update({
            status: 'pending',
            document_url: uploadData.path,
          } as any)
          .eq('id', existingDoc.id);

        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from('rider_documents')
          .insert({
            rider_id: riderId,
            document_type: documentType,
            status: 'pending',
            document_url: uploadData.path,
          } as any);

        if (insertErr) throw insertErr;
      }

      Alert.alert('Uploaded!', 'Your document has been submitted for review.');
      await fetchDocuments();
    } catch {
      Alert.alert('Error', 'Upload failed. Please try again.');
    } finally {
      setUploading(null);
    }
  };

  // ── Build display list ─────────────────────────────────────────────────────

  const allDocTypes = Object.keys(DOC_CONFIG);
  const docMap = new Map(documents.map((d) => [d.document_type, d]));

  const displayDocs = allDocTypes.map((type) => ({
    type,
    doc: docMap.get(type) ?? null,
    config: DOC_CONFIG[type]!,
    statusKey: (docMap.get(type)?.status ?? 'missing') as DocStatus,
  }));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F7FAFC' }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color="#0040e0" />
        </Pressable>
        <Text style={styles.headerTitle}>Documents</Text>
        <View style={{ width: 36 }} />
      </View>

      <Text style={styles.subtitle}>Keep your credentials up to date to continue receiving deliveries.</Text>

      {/* Document cards */}
      {displayDocs.map(({ type, doc, config, statusKey }) => {
        const sc = STATUS_CONFIG[statusKey];
        const isUploading = uploading === type;

        return (
          <View key={type} style={[styles.docCard, { borderLeftColor: config.categoryColor }]}>
            {/* Category + status */}
            <View style={styles.docTopRow}>
              <Text style={[styles.categoryLabel, { color: config.categoryColor }]}>
                {config.category}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                <Ionicons name={sc.icon as any} size={12} color={sc.color} />
                <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
              </View>
            </View>

            <Text style={styles.docTitle}>{config.label}</Text>

            {/* Submission info */}
            {doc?.created_at && statusKey === 'pending' && (
              <Text style={styles.docMeta}>
                Submitted {new Date(doc.created_at).toLocaleDateString('en-NG')}
              </Text>
            )}
            {statusKey === 'rejected' && (
              <Text style={styles.docWarning}>Document was rejected. Please reupload.</Text>
            )}

            {/* Actions */}
            <View style={styles.docActions}>
              <Pressable
                style={[styles.uploadBtn, isUploading && { opacity: 0.6 }]}
                onPress={() => handleUpload(type)}
                disabled={isUploading}
              >
                <Ionicons name="cloud-upload-outline" size={14} color="#FFFFFF" />
                <Text style={styles.uploadBtnText}>{isUploading ? 'Uploading...' : doc ? 'Reupload' : 'Upload'}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {/* Support card */}
      <View style={styles.supportCard}>
        <View style={styles.supportIconWrap}>
          <Ionicons name="headset-outline" size={24} color="#0040e0" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.supportTitle}>Need help with verification?</Text>
          <Text style={styles.supportText}>Our support team is available 24/7 to assist with document issues.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: { gap: 16, paddingHorizontal: Spacing[5] },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 4,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  headerTitle: { fontSize: Typography.md, fontWeight: '800', color: '#000D22' },

  subtitle: { fontSize: Typography.sm, color: '#74777e', lineHeight: 20 },

  docCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 18, gap: 10, borderLeftWidth: 4,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  docTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  docTitle: { fontSize: Typography.md, fontWeight: '800', color: '#000D22' },
  docMeta: { fontSize: Typography.xs, color: '#74777e' },
  docWarning: { fontSize: Typography.xs, color: '#ba1a1a', fontWeight: '600' },

  docActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#0040e0', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 9,
  },
  uploadBtnText: { fontSize: Typography.xs, fontWeight: '700', color: '#FFFFFF' },

  supportCard: {
    backgroundColor: '#0A2342', borderRadius: 20, padding: 18,
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
  },
  supportIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(0,64,224,0.25)', alignItems: 'center', justifyContent: 'center',
  },
  supportTitle: { fontSize: Typography.sm, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  supportText: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.7)', lineHeight: 18 },
});
