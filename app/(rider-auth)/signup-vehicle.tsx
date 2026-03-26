import { router } from 'expo-router';
import { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useRiderSignupStore, VehicleColor, VehicleType } from '@/store/rider-signup.store';
import { Spacing, Typography } from '@/constants/theme';

const TOTAL_STEPS = 5;

type VehicleOption = {
  type: VehicleType;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  label: string;
};

const VEHICLE_OPTIONS: VehicleOption[] = [
  { type: 'motorcycle', icon: 'bicycle', label: 'Motorcycle' },
  { type: 'car', icon: 'car-outline', label: 'Car' },
  { type: 'bicycle', icon: 'bicycle-outline', label: 'Bicycle' },
];

const COLOR_OPTIONS: { value: VehicleColor; hex: string }[] = [
  { value: 'black', hex: '#1a1a1a' },
  { value: 'white', hex: '#F5F5F5' },
  { value: 'red', hex: '#DC2626' },
  { value: 'blue', hex: '#2563EB' },
  { value: 'gray', hex: '#6B7280' },
];

export default function SignupVehicleScreen() {
  const insets = useSafeAreaInsets();
  const store = useRiderSignupStore();

  const [vehicleType, setVehicleType] = useState<VehicleType>(store.vehicleType);
  const [make, setMake] = useState(store.vehicleMake);
  const [model, setModel] = useState(store.vehicleModel);
  const [year, setYear] = useState(store.vehicleYear);
  const [plate, setPlate] = useState(store.plateNumber);
  const [color, setColor] = useState<VehicleColor>(store.vehicleColor);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!make.trim()) e.make = 'Vehicle make is required';
    if (!model.trim()) e.model = 'Vehicle model is required';
    if (!year.trim()) e.year = 'Year is required';
    else if (!/^\d{4}$/.test(year) || parseInt(year) < 1990 || parseInt(year) > new Date().getFullYear() + 1)
      e.year = 'Enter a valid year (1990–present)';
    if (!plate.trim()) e.plate = 'Plate number is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    store.setVehicle({ vehicleType, vehicleMake: make.trim(), vehicleModel: model.trim(), vehicleYear: year.trim(), plateNumber: plate.trim().toUpperCase(), vehicleColor: color });
    router.push('/(rider-auth)/signup-documents' as any);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color="#0040e0" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Vehicle Details</Text>
          <Text style={styles.headerStep}>Step 2 of {TOTAL_STEPS}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress bar */}
      <View style={progressStyles.track}>
        <View style={[progressStyles.fill, { width: '40%' }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Tell us about the vehicle you&apos;ll use for deliveries.</Text>

        {/* Vehicle type selector */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>VEHICLE TYPE</Text>
          <View style={styles.vehicleGrid}>
            {VEHICLE_OPTIONS.map((v) => (
              <Pressable
                key={v.type}
                style={[styles.vehicleCard, vehicleType === v.type && styles.vehicleCardActive]}
                onPress={() => setVehicleType(v.type)}
              >
                <Ionicons
                  name={v.icon}
                  size={26}
                  color={vehicleType === v.type ? '#FFFFFF' : '#44474e'}
                />
                <Text style={[styles.vehicleLabel, vehicleType === v.type && styles.vehicleLabelActive]}>
                  {v.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Vehicle details */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>VEHICLE DETAILS</Text>
          <View style={styles.detailGrid}>
            <InputField
              label="Make"
              placeholder="e.g. Honda"
              value={make}
              onChangeText={setMake}
              error={errors.make}
              containerStyle={{ flex: 1 }}
            />
            <InputField
              label="Model"
              placeholder="e.g. CB125F"
              value={model}
              onChangeText={setModel}
              error={errors.model}
              containerStyle={{ flex: 1 }}
            />
          </View>
          <View style={styles.detailGrid}>
            <InputField
              label="Year"
              placeholder="e.g. 2020"
              value={year}
              onChangeText={setYear}
              error={errors.year}
              keyboardType="number-pad"
              containerStyle={{ flex: 1 }}
            />
            <InputField
              label="Plate Number"
              placeholder="e.g. ABC-123-XY"
              value={plate}
              onChangeText={(t) => setPlate(t.toUpperCase())}
              error={errors.plate}
              autoCapitalize="characters"
              containerStyle={{ flex: 2 }}
            />
          </View>
        </View>

        {/* Color picker */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>VEHICLE COLOR</Text>
          <View style={styles.colorRow}>
            {COLOR_OPTIONS.map((c) => (
              <Pressable
                key={c.value}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: c.hex },
                  color === c.value && styles.colorSwatchActive,
                ]}
                onPress={() => setColor(c.value)}
              >
                {color === c.value && (
                  <Ionicons name="checkmark" size={14} color={c.value === 'white' ? '#000D22' : '#FFFFFF'} />
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Safety note */}
        <View style={styles.safetyRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#0040e0" />
          <Text style={styles.safetyText}>
            Vehicle information is verified for safety & compliance.
          </Text>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable style={styles.nextBtn} onPress={handleNext}>
          <Text style={styles.nextBtnText}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function InputField({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  keyboardType,
  autoCapitalize,
  containerStyle,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  error?: string;
  keyboardType?: any;
  autoCapitalize?: any;
  containerStyle?: any;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[inputStyles.wrap, containerStyle]}>
      <Text style={inputStyles.label}>{label}</Text>
      <View style={[inputStyles.inputWrap, focused && inputStyles.focused, !!error && inputStyles.errored]}>
        <TextInput
          style={inputStyles.input}
          placeholder={placeholder}
          placeholderTextColor="#9ea2ac"
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
        />
      </View>
      {!!error && <Text style={inputStyles.error}>{error}</Text>}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: { height: 4, backgroundColor: '#E5E7EB', marginHorizontal: Spacing[5], borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#0040e0', borderRadius: 2 },
});

const inputStyles = StyleSheet.create({
  wrap: { gap: 5 },
  label: { fontSize: 11, fontWeight: '600', color: '#74777e', textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrap: {
    backgroundColor: '#FFFFFF', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 12,
  },
  focused: { borderColor: '#0040e0' },
  errored: { borderColor: '#ba1a1a' },
  input: { height: 46, fontSize: 14, color: '#000D22' },
  error: { fontSize: 11, color: '#ba1a1a' },
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

  scroll: { paddingHorizontal: Spacing[5], paddingTop: 20, paddingBottom: 20, gap: 24 },
  subtitle: { fontSize: Typography.sm, color: '#44474e', lineHeight: 22 },

  section: { gap: 12 },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: '#324768',
    textTransform: 'uppercase', letterSpacing: 2,
  },

  vehicleGrid: { flexDirection: 'row', gap: 10 },
  vehicleCard: {
    flex: 1, alignItems: 'center', paddingVertical: 16, gap: 8,
    backgroundColor: '#F1F4F6', borderRadius: 16,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  vehicleCardActive: { backgroundColor: '#0040e0', borderColor: '#0040e0' },
  vehicleLabel: { fontSize: 11, fontWeight: '700', color: '#44474e', textTransform: 'uppercase', letterSpacing: 0.5 },
  vehicleLabelActive: { color: '#FFFFFF' },

  detailGrid: { flexDirection: 'row', gap: 12 },

  colorRow: { flexDirection: 'row', gap: 12 },
  colorSwatch: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  colorSwatchActive: { borderColor: '#0040e0', borderWidth: 2.5 },

  safetyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EEF2FF', borderRadius: 12, padding: 12,
  },
  safetyText: { flex: 1, fontSize: Typography.xs, color: '#44474e', lineHeight: 18 },

  footer: {
    paddingHorizontal: Spacing[5], paddingTop: 12,
    backgroundColor: '#F7FAFC',
    borderTopWidth: 1, borderTopColor: '#F1F4F6',
  },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 54, backgroundColor: '#0040e0', borderRadius: 16,
  },
  nextBtnText: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#FFFFFF' },
});
