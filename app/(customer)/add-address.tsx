import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui';
import { Spacing, Typography } from '@/constants/theme';

type Label = 'home' | 'work' | 'school' | 'other';

const LABELS: { value: Label; icon: string; text: string }[] = [
  { value: 'home', icon: '🏠', text: 'Home' },
  { value: 'work', icon: '🏢', text: 'Work' },
  { value: 'school', icon: '🎓', text: 'School' },
  { value: 'other', icon: '📍', text: 'Other' },
];

export default function AddAddressScreen() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { addressId } = useLocalSearchParams<{ addressId?: string }>();
  const isEditing = Boolean(addressId);

  const [address, setAddress] = useState('');
  const [label, setLabel] = useState<Label>('home');
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load existing data when editing
  useEffect(() => {
    if (!addressId) return;
    supabase
      .from('saved_addresses')
      .select('*')
      .eq('id', addressId)
      .single()
      .then(({ data }) => {
        if (data) {
          setAddress(data.address ?? '');
          setLabel((data.label as Label) ?? 'home');
          setIsDefault(data.is_default ?? false);
        }
      });
  }, [addressId]);

  const handleSave = async () => {
    if (!address.trim()) { setError('Enter an address'); return; }
    setError('');
    setLoading(true);

    try {
      // If setting as default, clear existing defaults first
      if (isDefault) {
        await supabase
          .from('saved_addresses')
          .update({ is_default: false })
          .eq('user_id', profile?.id ?? '');
      }

      if (isEditing) {
        const { error: e } = await supabase
          .from('saved_addresses')
          .update({ address: address.trim(), label, is_default: isDefault })
          .eq('id', addressId);
        if (e) throw e;
      } else {
        const { error: e } = await supabase
          .from('saved_addresses')
          .insert({
            user_id: profile?.id ?? '',
            address: address.trim(),
            label,
            // lat/lng will be 0 until Places autocomplete is wired
            lat: 0,
            lng: 0,
            is_default: isDefault,
          });
        if (e) throw e;
      }

      router.back();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save address');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title}>{isEditing ? 'Edit Address' : 'Add Address'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Address input */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>ADDRESS</Text>
          <TextInput
            style={styles.addressInput}
            placeholder="Type or search address..."
            placeholderTextColor="#74777e"
            value={address}
            onChangeText={setAddress}
            multiline
            numberOfLines={2}
          />
          <Text style={styles.hint}>
            💡 Google Maps autocomplete will be enabled once the Places API key is configured.
          </Text>
        </View>

        {/* Label selector */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>LABEL</Text>
          <View style={styles.labelGrid}>
            {LABELS.map((l) => (
              <Pressable
                key={l.value}
                style={[styles.labelBtn, label === l.value && styles.labelBtnActive]}
                onPress={() => setLabel(l.value)}
              >
                <Text style={styles.labelIcon}>{l.icon}</Text>
                <Text style={[styles.labelText, label === l.value && styles.labelTextActive]}>{l.text}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Default toggle */}
        <Pressable
          style={styles.defaultRow}
          onPress={() => setIsDefault((v) => !v)}
        >
          <View>
            <Text style={styles.defaultTitle}>Set as Default</Text>
            <Text style={styles.defaultSubtitle}>Auto-fill this address when ordering</Text>
          </View>
          <View style={[styles.checkbox, isDefault && styles.checkboxActive]}>
            {isDefault && <Text style={styles.checkmark}>✓</Text>}
          </View>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label={isEditing ? 'Update Address' : 'Save Address'} onPress={handleSave} loading={loading} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 20,
    color: '#0040e0',
    fontWeight: '600',
  },
  title: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: '#000D22',
    letterSpacing: -0.3,
  },
  scroll: {
    padding: Spacing[5],
    gap: 20,
    paddingBottom: 40,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: '#324768',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  addressInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    color: '#000D22',
    minHeight: 72,
    textAlignVertical: 'top',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  hint: {
    fontSize: Typography.xs,
    color: '#74777e',
    lineHeight: 16,
  },
  labelGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  labelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: '#F1F4F6',
    borderRadius: 16,
    gap: 6,
  },
  labelBtnActive: {
    backgroundColor: '#0A2342',
  },
  labelIcon: { fontSize: 22 },
  labelText: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  labelTextActive: {
    color: '#FFFFFF',
  },
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  defaultTitle: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: '#000D22',
  },
  defaultSubtitle: {
    fontSize: Typography.xs,
    color: '#44474e',
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#c4c6cf',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#0040e0',
    borderColor: '#0040e0',
  },
  checkmark: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: Typography.bold,
  },
  error: {
    fontSize: Typography.sm,
    color: '#ba1a1a',
    textAlign: 'center',
  },
});
