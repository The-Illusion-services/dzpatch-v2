import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderInfo {
  id: string;
  dropoff_address: string;
  package_size: string | null;
  package_description: string | null;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DeliveryCompletionScreen() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { riderId } = useAuthStore();

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [podPhotoUri, setPodPhotoUri] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // ── Fetch order ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!orderId) return;
    supabase
      .from('orders')
      .select('id, dropoff_address, package_size, package_description')
      .eq('id', orderId)
      .single()
      .then(({ data }) => { if (data) setOrder(data as OrderInfo); });
  }, [orderId]);

  // ── OTP input handlers ─────────────────────────────────────────────────────

  const handleCodeChange = (idx: number, val: string) => {
    const digit = val.replace(/[^0-9]/g, '').slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    if (digit && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleCodeKeyPress = (idx: number, key: string) => {
    if (key === 'Backspace' && !code[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  // ── Take POD photo ─────────────────────────────────────────────────────────

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is needed to take a proof of delivery photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setPodPhotoUri(result.assets[0].uri);
    }
  };

  // ── Complete delivery ──────────────────────────────────────────────────────

  const handleComplete = async () => {
    if (!orderId || !riderId) return;
    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      Alert.alert('Delivery Code', 'Please enter the full 6-digit delivery code.');
      return;
    }

    setCompleting(true);
    try {
      // 1. Verify delivery code
      const { data: verified, error: verifyErr } = await supabase.rpc('verify_delivery_code', {
        p_order_id: orderId,
        p_rider_id: riderId,
        p_code: fullCode,
      } as any);
      if (verifyErr) throw verifyErr;
      if (!verified) {
        Alert.alert('Wrong Code', 'The delivery code is incorrect. Please ask the customer for the correct code.');
        setCompleting(false);
        return;
      }

      // 2. Upload POD photo if taken
      let podUrl: string | undefined;
      if (podPhotoUri) {
        const fileName = `pod-${orderId}-${Date.now()}.jpg`;
        // Convert URI to Blob (required for Android; works on iOS too)
        const blob = await fetch(podPhotoUri).then((r) => r.blob());
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(`pod/${fileName}`, blob, { contentType: 'image/jpeg' });
        if (uploadErr) throw uploadErr;
        if (uploadData?.path) {
          const { data: urlData } = supabase.storage.from('documents').getPublicUrl(uploadData.path);
          podUrl = urlData.publicUrl;
        }
      }

      // 3. Complete delivery (distributes earnings + commission)
      const { data: result, error: completeErr } = await supabase.rpc('complete_delivery', {
        p_order_id: orderId,
        p_rider_id: riderId,
        p_pod_photo_url: podUrl ?? null,
      } as any);
      if (completeErr) throw completeErr;

      const earnings = result as { rider_earnings: number; platform_commission: number } | null;

      router.replace({
        pathname: '/(rider)/trip-complete' as any,
        params: {
          orderId,
          riderEarnings: String(earnings?.rider_earnings ?? 0),
          commission: String(earnings?.platform_commission ?? 0),
        },
      });
    } catch {
      Alert.alert('Error', 'Could not complete delivery. Please try again.');
    } finally {
      setCompleting(false);
    }
  };

  const isReady = code.every((d) => d !== '') && !completing;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F7FAFC' }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepText}>Step 4 of 4</Text>
        </View>
        <Text style={styles.title}>Complete Delivery</Text>
      </View>

      {/* Package summary */}
      {order && (
        <View style={styles.packageCard}>
          <View style={styles.packageRow}>
            <Ionicons name="cube-outline" size={18} color="#0040e0" />
            <Text style={styles.packageTitle}>
              {order.package_size ? `${order.package_size} Package` : 'Package'}
            </Text>
          </View>
          {order.package_description && (
            <Text style={styles.packageDesc}>{order.package_description}</Text>
          )}
          <View style={styles.destRow}>
            <Ionicons name="location-outline" size={14} color="#74777e" />
            <Text style={styles.destText} numberOfLines={2}>{order.dropoff_address}</Text>
          </View>
          <Text style={styles.orderId}>#{orderId?.slice(0, 8).toUpperCase()}</Text>
        </View>
      )}

      {/* Delivery Code */}
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>DELIVERY CODE</Text>
        <Text style={styles.codeHint}>Enter the 6-digit code provided by the customer</Text>
        <View style={styles.codeInputRow}>
          {code.map((digit, idx) => (
            <TextInput
              key={idx}
              ref={(r) => { inputRefs.current[idx] = r; }}
              style={[styles.codeBox, digit ? styles.codeBoxFilled : null]}
              value={digit}
              onChangeText={(v) => handleCodeChange(idx, v)}
              onKeyPress={({ nativeEvent }) => handleCodeKeyPress(idx, nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={1}
              textAlign="center"
              selectTextOnFocus
            />
          ))}
        </View>
      </View>

      {/* POD Photo */}
      <Pressable style={styles.photoCard} onPress={takePhoto}>
        {podPhotoUri ? (
          <View style={styles.photoPreview}>
            <Image source={{ uri: podPhotoUri }} style={styles.previewImage} />
            <View style={styles.photoOverlay}>
              <Ionicons name="camera" size={20} color="#FFFFFF" />
              <Text style={styles.photoOverlayText}>Retake</Text>
            </View>
          </View>
        ) : (
          <View style={styles.photoPlaceholder}>
            <Ionicons name="camera-outline" size={36} color="#74777e" />
            <Text style={styles.photoLabel}>Take Photo of Package</Text>
            <Text style={styles.photoSub}>Optional — proof of delivery</Text>
          </View>
        )}
      </Pressable>

      {/* Complete Button */}
      <Pressable
        style={[styles.completeBtn, !isReady && styles.completeBtnDisabled]}
        onPress={handleComplete}
        disabled={!isReady}
      >
        <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
        <Text style={styles.completeBtnText}>
          {completing ? 'Completing Delivery...' : 'Complete Delivery'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: { gap: 16, paddingHorizontal: Spacing[5] },

  // Header
  header: { gap: 8 },
  stepBadge: {
    alignSelf: 'flex-start', backgroundColor: '#EEF2FF',
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5,
  },
  stepText: { fontSize: Typography.xs, fontWeight: '700', color: '#0040e0' },
  title: { fontSize: Typography['2xl'], fontWeight: '900', color: '#000D22' },

  // Package card
  packageCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 8,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  packageRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  packageTitle: { fontSize: Typography.md, fontWeight: '800', color: '#000D22' },
  packageDesc: { fontSize: Typography.sm, color: '#44474e' },
  destRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  destText: { flex: 1, fontSize: Typography.sm, color: '#74777e' },
  orderId: { fontSize: Typography.xs, color: '#C4C6CF', fontWeight: '700', letterSpacing: 1 },

  // Code input
  codeCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 12,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  codeLabel: {
    fontSize: Typography.xs, fontWeight: '700', color: '#74777e',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  codeHint: { fontSize: Typography.xs, color: '#74777e' },
  codeInputRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  codeBox: {
    width: 46, height: 56, borderRadius: 12,
    borderWidth: 2, borderColor: '#C4C6CF',
    backgroundColor: '#F7FAFC',
    fontSize: 24, fontWeight: '900', color: '#000D22',
  },
  codeBoxFilled: { borderColor: '#0040e0', backgroundColor: '#EEF2FF' },

  // Photo
  photoCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden',
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  photoPlaceholder: {
    height: 160, alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 2, borderColor: '#C4C6CF',
    borderStyle: 'dashed', borderRadius: 20,
    margin: 1,
  },
  photoLabel: { fontSize: Typography.sm, fontWeight: '700', color: '#44474e' },
  photoSub: { fontSize: Typography.xs, color: '#74777e' },
  photoPreview: { position: 'relative', height: 200 },
  previewImage: { width: '100%', height: '100%' },
  photoOverlay: {
    position: 'absolute', bottom: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,13,34,0.6)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6,
  },
  photoOverlayText: { fontSize: Typography.xs, fontWeight: '700', color: '#FFFFFF' },

  // Complete button
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 58, borderRadius: 18,
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 6,
  },
  completeBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
  completeBtnText: { fontSize: Typography.md, fontWeight: '800', color: '#FFFFFF' },
});
