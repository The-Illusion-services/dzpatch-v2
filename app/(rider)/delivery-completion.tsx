import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { uploadProofOfDelivery } from '@/lib/delivery-flow';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderInfo {
  id: string;
  dropoff_address: string;
  package_size: string | null;
  package_description: string | null;
  status: string;
  payment_method: string | null;
  final_price: number | null;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DeliveryCompletionScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { riderId, profile } = useAuthStore();

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [podPhotoUri, setPodPhotoUri] = useState<string | null>(null);
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [completing, setCompleting] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // ── Fetch order + ensure arrived_dropoff status ───────────────────────────

  useEffect(() => {
    if (!orderId || !profile?.id) return;
    supabase
      .from('orders')
      .select('id, dropoff_address, package_size, package_description, status, payment_method, final_price')
      .eq('id', orderId)
      .single()
      .then(async ({ data, error }) => {
        if (error) {
          console.warn('delivery-completion load order failed:', error.message);
          return;
        }
        if (!data) return;
        const orderData = data as OrderInfo;
        setOrder(orderData);
        if (orderData.status === 'in_transit') {
          const { error: statusError } = await (supabase as any).rpc('update_order_status', {
            p_order_id: orderId,
            p_new_status: 'arrived_dropoff',
            p_changed_by: profile.id,
          });
          if (statusError) {
            Alert.alert(
              'Status Update Failed',
              `Could not mark arrival at drop-off: ${statusError.message}. Please contact support if this persists.`,
            );
            return;
          }
          // Reflect updated status in local state
          setOrder({ ...orderData, status: 'arrived_dropoff' });
          return;
        }
      });
  }, [orderId, profile?.id]);

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
        Alert.alert(
          'Wrong Code',
          'The delivery code is incorrect. Please ask the customer for their correct code.\n\nAfter 3 wrong attempts, code entry will be locked for 15 minutes.',
        );
        setCompleting(false);
        return;
      }

      // 2. Upload POD photo if taken
      let podPath: string | undefined;
      if (podPhotoUri && profile?.id) {
        podPath = await uploadProofOfDelivery({
          podPhotoUri,
          profileId: profile.id,
          orderId,
          fetchBlob: async (uri) => {
            // React Native Blob doesn't support ArrayBufferView construction.
            // Read as base64 and convert to ArrayBuffer manually, then wrap in Blob.
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
            // Decode base64 → ArrayBuffer (no Uint8Array needed)
            const binaryStr = atob(base64);
            const buffer = new ArrayBuffer(binaryStr.length);
            const view = new DataView(buffer);
            for (let i = 0; i < binaryStr.length; i++) {
              view.setUint8(i, binaryStr.charCodeAt(i));
            }
            return buffer as unknown as Blob;
          },
          uploadFile: (path, file, options) => supabase.storage.from('documents').upload(path, file, options),
        });
      }

      // 3. For cash orders: mark cash as collected before completing
      if (order?.payment_method === 'cash') {
        const { error: cashErr } = await (supabase as any).rpc('mark_cash_paid', {
          p_order_id: orderId,
          p_rider_id: riderId,
        });
        if (cashErr) throw cashErr;
      }

      // 4. Complete delivery (distributes earnings + commission)
      const { data: result, error: completeErr } = await supabase.rpc('complete_delivery', {
        p_order_id: orderId,
        p_rider_id: riderId,
        p_pod_photo_url: podPath ?? null,
      } as any);
      if (completeErr) throw completeErr;

      const earnings = result as {
        rider_earnings: number;
        platform_commission?: number;
        commission?: number;
      } | null;

      router.replace({
        pathname: '/(rider)/trip-complete' as any,
        params: {
          orderId,
          riderEarnings: String(earnings?.rider_earnings ?? 0),
          commission: String(earnings?.platform_commission ?? earnings?.commission ?? 0),
        },
      });
    } catch (error: any) {
      const msg: string = error?.message ?? '';
      if (msg.includes('locked')) {
        Alert.alert(
          'Code Entry Locked',
          'Too many incorrect attempts. Code entry is locked for 15 minutes. Contact support if needed.',
        );
      } else if (msg.includes('verified')) {
        Alert.alert('Code Required', 'Delivery code must be verified before completing the delivery.');
      } else {
        Alert.alert('Error', `Could not complete delivery: ${msg || 'Please try again.'}`);
      }
    } finally {
      setCompleting(false);
    }
  };

  const isCashOrder = order?.payment_method === 'cash';
  const isReady = code.every((d) => d !== '') && !!podPhotoUri && !completing && (!isCashOrder || cashConfirmed);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
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
            <Text style={styles.photoSub}>Required — tap to take a photo</Text>
          </View>
        )}
      </Pressable>

      {/* Cash confirmation (cash orders only) */}
      {isCashOrder && (
        <Pressable style={styles.cashConfirmRow} onPress={() => setCashConfirmed((v) => !v)}>
          <View style={[styles.cashCheckbox, cashConfirmed && styles.cashCheckboxChecked]}>
            {cashConfirmed && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
          </View>
          <Text style={styles.cashConfirmText}>
            I collected ₦{(order?.final_price ?? 0).toLocaleString()} in cash from the customer
          </Text>
        </Pressable>
      )}

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

function makeStyles(colors: ReturnType<typeof import('@/hooks/use-theme').useTheme>['colors']) {
  return StyleSheet.create({
  content: { gap: 16, paddingHorizontal: Spacing[5] },

  // Header
  header: { gap: 8 },
  stepBadge: {
    alignSelf: 'flex-start', backgroundColor: '#EEF2FF',
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5,
  },
  stepText: { fontSize: Typography.xs, fontWeight: '700', color: '#0040e0' },
  title: { fontSize: Typography['2xl'], fontWeight: '900', color: colors.textPrimary },

  // Package card
  packageCard: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 8,
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  packageRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  packageTitle: { fontSize: Typography.md, fontWeight: '800', color: colors.textPrimary },
  packageDesc: { fontSize: Typography.sm, color: colors.textSecondary },
  destRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  destText: { flex: 1, fontSize: Typography.sm, color: colors.textSecondary },
  orderId: { fontSize: Typography.xs, color: colors.textDisabled, fontWeight: '700', letterSpacing: 1 },

  // Code input
  codeCard: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 12,
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  codeLabel: {
    fontSize: Typography.xs, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  codeHint: { fontSize: Typography.xs, color: colors.textSecondary },
  codeInputRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  codeBox: {
    width: 46, height: 56, borderRadius: 12,
    borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.background,
    fontSize: 24, fontWeight: '900', color: colors.textPrimary,
  },
  codeBoxFilled: { borderColor: '#0040e0', backgroundColor: '#EEF2FF' },

  // Photo
  photoCard: {
    backgroundColor: colors.surface, borderRadius: 20, overflow: 'hidden',
    shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  photoPlaceholder: {
    height: 160, alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 2, borderColor: colors.border,
    borderStyle: 'dashed', borderRadius: 20,
    margin: 1,
  },
  photoLabel: { fontSize: Typography.sm, fontWeight: '700', color: colors.textSecondary },
  photoSub: { fontSize: Typography.xs, color: colors.textSecondary },
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

  // Cash confirmation row
  cashConfirmRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: colors.border,
  },
  cashCheckbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: '#74777e',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  cashCheckboxChecked: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  cashConfirmText: { flex: 1, fontSize: Typography.sm, fontWeight: '600', color: colors.textPrimary },
  }); // end makeStyles
}
