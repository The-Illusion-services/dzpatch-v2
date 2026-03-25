import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GooglePlacesAutocomplete, GooglePlacesAutocompleteRef } from 'react-native-google-places-autocomplete';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui';
import { Spacing, Typography } from '@/constants/theme';

const GOOGLE_API_KEY = 'AIzaSyA3mvMe2cDnVIMVFOmLKDhVAv7bJ8WV-ws';
const BIAS_RADIUS = 20000;

type Label = 'home' | 'work' | 'school' | 'other';

const LABELS: { value: Label; icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; text: string }[] = [
  { value: 'home',   icon: 'home-outline',    text: 'Home'   },
  { value: 'work',   icon: 'business-outline', text: 'Work'   },
  { value: 'school', icon: 'school-outline',   text: 'School' },
  { value: 'other',  icon: 'location-outline', text: 'Other'  },
];

export default function AddAddressScreen() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { addressId } = useLocalSearchParams<{ addressId?: string }>();
  const isEditing = Boolean(addressId);

  const [address, setAddress] = useState('');
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [label, setLabel] = useState<Label>('home');
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const placesRef = useRef<GooglePlacesAutocompleteRef>(null);

  // Get user location for bias
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    })();
  }, []);

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
          const d = data as any;
          setAddress(d.address ?? '');
          setLabel((d.label as Label) ?? 'home');
          setIsDefault(d.is_default ?? false);
          if (d.latitude && d.longitude) {
            setSelectedCoords({ lat: d.latitude, lng: d.longitude });
            placesRef.current?.setAddressText(d.address ?? '');
          }
        }
      });
  }, [addressId]);

  const handleSave = async () => {
    if (!address.trim()) { setError('Enter an address'); return; }
    setError('');
    setLoading(true);

    const lat = selectedCoords?.lat ?? userLocation?.lat ?? 6.4551;
    const lng = selectedCoords?.lng ?? userLocation?.lng ?? 3.3841;
    const wkt = `SRID=4326;POINT(${lng} ${lat})`;

    try {
      if (isDefault) {
        // Clear existing default first
        await supabase
          .from('saved_addresses')
          .update({ is_default: false } as any)
          .eq('user_id', profile?.id ?? '');
      }

      if (isEditing) {
        const { error: e } = await supabase
          .from('saved_addresses')
          .update({ address: address.trim(), label, is_default: isDefault, latitude: lat, longitude: lng } as any)
          .eq('id', addressId!);
        if (e) throw e;
      } else {
        const { error: e } = await supabase
          .from('saved_addresses')
          .insert({
            user_id: profile?.id ?? '',
            address: address.trim(),
            label,
            is_default: isDefault,
            latitude: lat,
            longitude: lng,
            location: wkt,
          } as any);
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
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(customer)/saved-addresses' as any)} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color="#0040e0" />
        </Pressable>
        <Text style={styles.title}>{isEditing ? 'Edit Address' : 'Add Address'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Address autocomplete */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>ADDRESS</Text>
          <View style={styles.autocompleteWrap}>
            <GooglePlacesAutocomplete
              ref={placesRef}
              placeholder="Search for an address..."
              minLength={2}
              fetchDetails
              onPress={(data, details) => {
                setAddress(data.description);
                if (details?.geometry?.location) {
                  setSelectedCoords({
                    lat: details.geometry.location.lat,
                    lng: details.geometry.location.lng,
                  });
                }
              }}
              query={{
                key: GOOGLE_API_KEY,
                language: 'en',
                components: 'country:ng',
                ...(userLocation ? {
                  location: `${userLocation.lat},${userLocation.lng}`,
                  radius: BIAS_RADIUS,
                } : {}),
              }}
              textInputProps={{
                placeholderTextColor: '#74777e',
                style: styles.placesInput,
              }}
              styles={{
                container: { flex: 0 },
                listView: styles.placesList,
                row: styles.placesRow,
                description: styles.placesDesc,
                poweredContainer: { display: 'none' },
              }}
              enablePoweredByContainer={false}
              renderLeftButton={() => (
                <View style={styles.placesIcon}>
                  <Ionicons name="search-outline" size={16} color="#74777e" />
                </View>
              )}
            />
          </View>
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
                <Ionicons
                  name={l.icon}
                  size={20}
                  color={label === l.value ? '#FFFFFF' : '#44474e'}
                />
                <Text style={[styles.labelText, label === l.value && styles.labelTextActive]}>
                  {l.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Default toggle */}
        <Pressable style={styles.defaultRow} onPress={() => setIsDefault((v) => !v)}>
          <View>
            <Text style={styles.defaultTitle}>Set as Default</Text>
            <Text style={styles.defaultSubtitle}>Auto-fill this address when ordering</Text>
          </View>
          <View style={[styles.checkbox, isDefault && styles.checkboxActive]}>
            {isDefault && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
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
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
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
  fieldGroup: { gap: 8 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: '#324768',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },

  // Autocomplete
  autocompleteWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  placesInput: {
    fontSize: Typography.sm,
    color: '#000D22',
    paddingVertical: 14,
    paddingRight: 14,
    flex: 1,
  },
  placesIcon: {
    paddingLeft: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placesList: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F4F6',
  },
  placesRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F7FAFC',
  },
  placesDesc: {
    fontSize: Typography.sm,
    color: '#000D22',
  },

  // Label
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
  labelBtnActive: { backgroundColor: '#0A2342' },
  labelText: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  labelTextActive: { color: '#FFFFFF' },

  // Default toggle
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
    color: '#44477e',
    marginTop: 2,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: '#c4c6cf',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#0040e0',
    borderColor: '#0040e0',
  },
  error: {
    fontSize: Typography.sm,
    color: '#ba1a1a',
    textAlign: 'center',
  },
});
