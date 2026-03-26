import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
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
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Spacing, Typography } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VehicleForm {
  vehicle_type: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: string;
  vehicle_plate: string;
  vehicle_color: string;
}

const VEHICLE_TYPES = ['Motorcycle', 'Bicycle', 'Car', 'Van', 'Truck'];
const COLORS = [
  { name: 'Black', hex: '#1a1a1a' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Navy', hex: '#0A2342' },
  { name: 'Red', hex: '#ba1a1a' },
  { name: 'Silver', hex: '#C4C6CF' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EditVehicleScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();

  const [form, setForm] = useState<VehicleForm>({
    vehicle_type: '',
    vehicle_make: '',
    vehicle_model: '',
    vehicle_year: '',
    vehicle_plate: '',
    vehicle_color: 'Black',
  });
  const [saving, setSaving] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  // ── Fetch existing vehicle info ────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('riders')
      .select('vehicle_type, vehicle_make, vehicle_model, vehicle_year, vehicle_plate, vehicle_color')
      .eq('profile_id', profile.id)
      .single()
      .then(({ data }) => {
        if (data) {
          const v = data as { vehicle_type: string; vehicle_make: string | null; vehicle_model: string | null; vehicle_year: number | null; vehicle_plate: string | null; vehicle_color: string | null };
          setForm({
            vehicle_type: v.vehicle_type ?? '',
            vehicle_make: v.vehicle_make ?? '',
            vehicle_model: v.vehicle_model ?? '',
            vehicle_year: v.vehicle_year ? String(v.vehicle_year) : '',
            vehicle_plate: v.vehicle_plate ?? '',
            vehicle_color: v.vehicle_color ?? 'Black',
          });
        }
      });
  }, [profile?.id]);

  const update = (field: keyof VehicleForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!profile?.id) return;
    if (!form.vehicle_plate.trim()) {
      Alert.alert('Required', 'Please enter the vehicle plate number.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase.from('riders') as any)
        .update({
          vehicle_type: form.vehicle_type || null,
          vehicle_make: form.vehicle_make || null,
          vehicle_model: form.vehicle_model || null,
          vehicle_year: form.vehicle_year ? parseInt(form.vehicle_year, 10) : null,
          vehicle_plate: form.vehicle_plate.toUpperCase().trim(),
          vehicle_color: form.vehicle_color,
        })
        .eq('profile_id', profile.id);
      if (error) throw error;
      Alert.alert('Saved', 'Vehicle info updated. Changes may take up to 24 hours to verify.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Error', 'Could not save vehicle info. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#F7FAFC' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color="#0040e0" />
          </Pressable>
          <Text style={styles.headerTitle}>Edit Vehicle Info</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Form card */}
        <View style={styles.formCard}>
          {/* Vehicle type */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Vehicle Type</Text>
            <Pressable
              style={styles.selectBtn}
              onPress={() => setShowTypeDropdown(!showTypeDropdown)}
            >
              <Text style={[styles.selectBtnText, !form.vehicle_type && { color: '#C4C6CF' }]}>
                {form.vehicle_type || 'Select type...'}
              </Text>
              <Ionicons name={showTypeDropdown ? 'chevron-up' : 'chevron-down'} size={16} color="#74777e" />
            </Pressable>
            {showTypeDropdown && (
              <View style={styles.dropdown}>
                {VEHICLE_TYPES.map((type) => (
                  <Pressable
                    key={type}
                    style={[styles.dropdownItem, form.vehicle_type === type && styles.dropdownItemActive]}
                    onPress={() => { update('vehicle_type', type); setShowTypeDropdown(false); }}
                  >
                    <Text style={[styles.dropdownItemText, form.vehicle_type === type && { color: '#0040e0' }]}>
                      {type}
                    </Text>
                    {form.vehicle_type === type && <Ionicons name="checkmark" size={16} color="#0040e0" />}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Make & Model row */}
          <View style={styles.row}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Make</Text>
              <TextInput
                style={styles.input}
                value={form.vehicle_make}
                onChangeText={(v) => update('vehicle_make', v)}
                placeholder="e.g. Honda"
                placeholderTextColor="#C4C6CF"
                autoCapitalize="words"
              />
            </View>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Model</Text>
              <TextInput
                style={styles.input}
                value={form.vehicle_model}
                onChangeText={(v) => update('vehicle_model', v)}
                placeholder="e.g. CBR"
                placeholderTextColor="#C4C6CF"
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Year */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Year</Text>
            <TextInput
              style={styles.input}
              value={form.vehicle_year}
              onChangeText={(v) => update('vehicle_year', v.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="e.g. 2022"
              placeholderTextColor="#C4C6CF"
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>

          {/* Plate number */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Plate Number *</Text>
            <TextInput
              style={[styles.input, styles.inputUppercase]}
              value={form.vehicle_plate}
              onChangeText={(v) => update('vehicle_plate', v.toUpperCase())}
              placeholder="e.g. ABC-1234"
              placeholderTextColor="#C4C6CF"
              autoCapitalize="characters"
            />
          </View>

          {/* Color */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Vehicle Color</Text>
            <View style={styles.colorsRow}>
              {COLORS.map((c) => (
                <Pressable
                  key={c.name}
                  onPress={() => update('vehicle_color', c.name)}
                  style={[
                    styles.colorBtn,
                    { backgroundColor: c.hex },
                    form.vehicle_color === c.name && styles.colorBtnSelected,
                  ]}
                >
                  {form.vehicle_color === c.name && (
                    <Ionicons name="checkmark" size={14} color={c.name === 'White' ? '#0040e0' : '#FFFFFF'} />
                  )}
                </Pressable>
              ))}
            </View>
            <Text style={styles.colorLabel}>Selected: {form.vehicle_color}</Text>
          </View>
        </View>

        {/* Save button */}
        <Pressable
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
        </Pressable>
        <Text style={styles.saveNote}>Updates take up to 24 hours for verification</Text>
      </ScrollView>
    </KeyboardAvoidingView>
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

  formCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, gap: 20,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: Typography.xs, fontWeight: '700', color: '#000D22', letterSpacing: 0.5 },
  input: {
    height: 48, borderRadius: 12, paddingHorizontal: 14,
    backgroundColor: '#F7FAFC', borderWidth: 1.5, borderColor: '#E5E7EB',
    fontSize: Typography.sm, fontWeight: '600', color: '#000D22',
  },
  inputUppercase: { textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 12 },

  selectBtn: {
    height: 48, borderRadius: 12, paddingHorizontal: 14,
    backgroundColor: '#F7FAFC', borderWidth: 1.5, borderColor: '#E5E7EB',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  selectBtnText: { fontSize: Typography.sm, fontWeight: '600', color: '#000D22' },
  dropdown: {
    backgroundColor: '#FFFFFF', borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
    overflow: 'hidden', marginTop: -4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F1F4F6',
  },
  dropdownItemActive: { backgroundColor: '#EEF2FF' },
  dropdownItemText: { fontSize: Typography.sm, fontWeight: '600', color: '#000D22' },

  colorsRow: { flexDirection: 'row', gap: 12 },
  colorBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 3, elevation: 1,
  },
  colorBtnSelected: { borderColor: '#0040e0', borderWidth: 3 },
  colorLabel: { fontSize: Typography.xs, color: '#74777e' },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 58, borderRadius: 18,
    backgroundColor: '#0040e0',
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 6,
  },
  saveBtnText: { fontSize: Typography.md, fontWeight: '800', color: '#FFFFFF' },
  saveNote: { fontSize: Typography.xs, color: '#74777e', textAlign: 'center' },
});
