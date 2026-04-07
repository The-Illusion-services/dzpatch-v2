import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GooglePlacesAutocomplete, GooglePlacesAutocompleteRef } from 'react-native-google-places-autocomplete';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { buildWalletGuard } from '@/lib/sprint4-ux';
import { useAuthStore } from '@/store/auth.store';
import { useAppDataStore } from '@/store/app-data.store';
import { Spacing, Typography } from '@/constants/theme';
import type { PackageSize } from '@/types/database';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';
const BIAS_RADIUS = 20000; // 20km in metres

type PricingRule = {
  base_rate: number;
  per_km_rate: number;
  min_price: number;
  vat_percentage: number;
  surge_multiplier: number;
};

const SIZES: { value: PackageSize; label: string; icon: string; desc: string }[] = [
  { value: 'small',  label: 'Small',  icon: '??', desc: 'Docs, phone' },
  { value: 'medium', label: 'Medium', icon: '??', desc: 'Clothes, books' },
  { value: 'large',  label: 'Large',  icon: '??', desc: 'Big parcels' },
];

const SIZE_MULTIPLIER: Record<PackageSize, number> = {
  small: 1, medium: 1.5, large: 2.0, extra_large: 2,
};

export default function CreateOrderScreen() {
  const { profile } = useAuthStore();
  const { fetchCategories } = useAppDataStore();
  const insets = useSafeAreaInsets();

  const [pickupAddress,  setPickupAddress]  = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const pickupCoords  = useRef<{ lat: number; lng: number } | null>(null);
  const dropoffCoords = useRef<{ lat: number; lng: number } | null>(null);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const [currentLocationLabel, setCurrentLocationLabel] = useState('My current location');

  const pickupRef  = useRef<GooglePlacesAutocompleteRef>(null);
  const dropoffRef = useRef<GooglePlacesAutocompleteRef>(null);

  const [recipientName,  setRecipientName]  = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [selectedSize,   setSelectedSize]   = useState<PackageSize>('small');
  const [paymentMethod,  setPaymentMethod]  = useState<'cash' | 'wallet'>('cash');

  const [showPromo,    setShowPromo]    = useState(false);
  const [promoCode,    setPromoCode]    = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoError,   setPromoError]   = useState('');
  const [discount,     setDiscount]     = useState(0);

  const [pricingRule, setPricingRule] = useState<PricingRule | null>(null);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [serviceFee,  setServiceFee]  = useState(0);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  const [savedAddresses, setSavedAddresses] = useState<{ label: string; address: string; lat: number; lng: number }[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  // --- Get current location -------------------------------------------------

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        setUserLocation(coords);
        userLocationRef.current = coords;
        pickupCoords.current = coords;

        // Reverse geocode using Google Geocoding API (more reliable than Expo's on Android)
        try {
          const resp = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=${GOOGLE_API_KEY}&result_type=street_address|route|sublocality`
          );
          const json = await resp.json();
          const result = json.results?.[0];
          if (result?.formatted_address) {
            // Strip the country suffix (e.g. ", Nigeria") for brevity
            const label = result.formatted_address.replace(/,\s*Nigeria$/, '').trim();
            setCurrentLocationLabel(label);
            // If the user already tapped "Current Location", update their pickup address too
            setPickupAddress((prev) => (prev === 'My current location' || prev === '') ? label : prev);
          }
        } catch {
          // Network unavailable — keep default label
        }
      } catch {
        // GPS unavailable (emulator without mock location) — proceed without location
      }
    })();
  }, []);

  // --- Load package categories (cached in store, 30-min TTL) ---------------

  useEffect(() => {
    fetchCategories();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Load pricing rule ----------------------------------------------------

  useEffect(() => {
    supabase
      .from('pricing_rules')
      .select('base_rate, per_km_rate, min_price, vat_percentage, surge_multiplier')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPricingRule(data as PricingRule);
        } else {
          // Fallback matches RPC fallback: ?500 base + ?100/km, 7.5% VAT
          setPricingRule({ base_rate: 500, per_km_rate: 100, min_price: 500, vat_percentage: 7.5, surge_multiplier: 1 });
        }
      });
  }, []);

  // --- Load saved addresses for dropoff suggestions -------------------------

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('saved_addresses')
      .select('label, address_line, latitude, longitude')
      .eq('user_id', profile.id)
      .order('is_default', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (data) {
          const addrs = data as { label: string; address_line: string | null; latitude: number | null; longitude: number | null }[];
          setSavedAddresses(addrs.map((a) => ({
            label:   a.label,
            address: a.address_line ?? '',
            lat:     a.latitude ?? 0,
            lng:     a.longitude ?? 0,
          })));
        }
      });
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('wallets')
      .select('balance')
      .eq('owner_id', profile.id)
      .eq('owner_type', 'customer')
      .maybeSingle()
      .then(({ data }) => {
        setWalletBalance(typeof data?.balance === 'number' ? data.balance : 0);
      });
  }, [profile?.id]);

  // --- Recalculate price ----------------------------------------------------

  useEffect(() => {
    // Only calculate once both pickup AND dropoff coords are confirmed
    if (!pricingRule || !pickupCoords.current || !dropoffCoords.current) {
      setDeliveryFee(0);
      setServiceFee(0);
      return;
    }
    // Haversine distance between pickup and dropoff (matches backend RPC formula)
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371; // Earth radius km
    const dLat = toRad(dropoffCoords.current.lat - pickupCoords.current.lat);
    const dLng = toRad(dropoffCoords.current.lng - pickupCoords.current.lng);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(pickupCoords.current.lat)) * Math.cos(toRad(dropoffCoords.current.lat)) *
      Math.sin(dLng / 2) ** 2;
    const estimatedKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const multiplier  = SIZE_MULTIPLIER[selectedSize];
    const raw = (pricingRule.base_rate + estimatedKm * pricingRule.per_km_rate) * pricingRule.surge_multiplier;
    const price = Math.max(pricingRule.min_price, raw) * multiplier;
    const vat = price * (pricingRule.vat_percentage / 100);
    setDeliveryFee(Math.round(price));
    setServiceFee(Math.round(vat));
  }, [pricingRule, pickupAddress, dropoffAddress, selectedSize]);

  const total = useMemo(
    () => deliveryFee + serviceFee - discount,
    [deliveryFee, serviceFee, discount]
  );
  const walletGuard = useMemo(
    () => buildWalletGuard(walletBalance, total),
    [walletBalance, total]
  );
  const walletNeedsTopUp = paymentMethod === 'wallet' && total > 0 && !walletGuard.hasEnoughBalance;

  // --- Apply promo ----------------------------------------------------------

  const handleApplyPromo = useCallback(async () => {
    if (!promoCode.trim()) return;
    setPromoError('');
    const { data: promoRaw } = await supabase
      .from('promo_codes')
      .select('id, discount_type, discount_value, min_order_amount, is_active')
      .eq('code', promoCode.trim().toUpperCase())
      .eq('is_active', true)
      .single();
    const data = promoRaw as { id: string; min_order_amount: number; discount_type: string; discount_value: number } | null;
    if (!data) { setPromoError('Invalid or expired promo code'); return; }
    if (data.min_order_amount && deliveryFee < data.min_order_amount) {
      setPromoError(`Min order ?${data.min_order_amount.toLocaleString()} required`);
      return;
    }
    const disc = data.discount_type === 'percentage'
      ? Math.round((deliveryFee * data.discount_value) / 100)
      : data.discount_value;
    setDiscount(disc);
    setPromoApplied(true);
  }, [promoCode, deliveryFee]);

  // --- Submit ---------------------------------------------------------------

  const handleFindRider = useCallback(async () => {
    setError('');
    if (!pickupAddress.trim())  { setError('Enter pick-up address'); return; }
    if (!dropoffAddress.trim()) { setError('Enter drop-off address'); return; }
    if (!recipientName.trim())  { setError('Enter recipient name'); return; }
    if (!recipientPhone.trim()) { setError('Enter recipient phone'); return; }
    if (!pickupCoords.current)  { setError('Select pick-up from the suggestions'); return; }
    if (!dropoffCoords.current) { setError('Select drop-off from the suggestions'); return; }
    if (paymentMethod === 'wallet' && total > 0 && !walletGuard.hasEnoughBalance) {
      setError(`Insufficient wallet balance. Top up ?${walletGuard.shortfall.toLocaleString()} or switch to cash.`);
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('create_order', {
        p_customer_id:           profile!.id,
        p_pickup_address:        pickupAddress.trim(),
        p_pickup_lat:            pickupCoords.current.lat,
        p_pickup_lng:            pickupCoords.current.lng,
        p_dropoff_address:       dropoffAddress.trim(),
        p_dropoff_lat:           dropoffCoords.current.lat,
        p_dropoff_lng:           dropoffCoords.current.lng,
        p_dropoff_contact_name:  recipientName.trim(),
        p_dropoff_contact_phone: recipientPhone.trim(),
        p_package_size:          selectedSize,
        p_category_id:           null,
        p_suggested_price:       deliveryFee,
        p_payment_method:        paymentMethod,
        ...(promoApplied ? { p_promo_code: promoCode.trim().toUpperCase() } : {}),
      } as any);
      if (rpcErr) throw rpcErr;

      const result = data as any;
      const orderId = result?.order_id ?? data;
      router.replace({
        pathname: '/(customer)/finding-rider',
        params: {
          orderId,
          pickupAddress: pickupAddress.trim(),
          dropoffAddress: dropoffAddress.trim(),
          finalPrice: String(result?.final_price ?? ''),
        },
      } as any);
    } catch (err: any) {
      setError(err.message ?? 'Failed to create order. Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [profile, pickupAddress, dropoffAddress, recipientName, recipientPhone, selectedSize, paymentMethod, promoApplied, promoCode, total, walletGuard]);

  // --- Places query ---------------------------------------------------------

  const placesQuery = useMemo(
    () => userLocation
      ? { key: GOOGLE_API_KEY, language: 'en', components: 'country:ng', sessiontoken: true,
          location: `${userLocation.lat},${userLocation.lng}`, radius: BIAS_RADIUS, strictbounds: false }
      : { key: GOOGLE_API_KEY, language: 'en', components: 'country:ng', sessiontoken: true },
    [userLocation]
  );

  const formSections = [{ title: 'form', data: ['_'] as string[] }];

  // --- Render ---------------------------------------------------------------

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Minimal back header � no title */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backArrow}>?</Text>
        </Pressable>
        <Text style={styles.headerTitle}>New Delivery</Text>
        <View style={{ width: 40 }} />
      </View>

      <SectionList
        sections={formSections}
        keyExtractor={(item) => item}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={() => null}
        renderItem={() => (
          <View style={styles.formBody}>

            {/* -- Route card -------------------------------------------- */}
            <View style={styles.routeCard}>
              <View style={styles.dashLine} />

              {/* FROM */}
              <View style={styles.locRow}>
                <View style={styles.dotFrom} />
                <View style={styles.locInputWrap}>
                  <Text style={styles.locLabel}>FROM</Text>
                  <GooglePlacesAutocomplete
                    ref={pickupRef}
                    placeholder="Pick-up address"
                    onPress={async (data, details) => {
                      if ((data as any).isPredefinedPlace) {
                        // Use ref so we always have the latest coords even in stale closures
                        let coords = userLocationRef.current;
                        if (!coords) {
                          // GPS not resolved yet � fetch on demand (permission already granted)
                          try {
                            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                            coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
                            userLocationRef.current = coords;
                            setUserLocation(coords);
                          } catch {
                            return; // Can't get location � do nothing
                          }
                        }
                        pickupCoords.current = coords;
                        setPickupAddress(currentLocationLabel);
                        return;
                      }
                      const desc = data.description || (data as any).vicinity || '';
                      setPickupAddress(desc);
                      if (details?.geometry?.location) {
                        pickupCoords.current = {
                          lat: details.geometry.location.lat,
                          lng: details.geometry.location.lng,
                        };
                      }
                    }}
                    query={placesQuery}
                    fetchDetails
                    enablePoweredByContainer={false}
                    minLength={0}
                    debounce={400}
                    styles={placesStyles}
                    textInputProps={{
                      placeholderTextColor: '#74777e',
                      value: pickupAddress,
                      onChangeText: setPickupAddress,
                    }}
                    predefinedPlaces={[{
                      description: currentLocationLabel,
                      geometry: { location: { lat: userLocation?.lat ?? 0, lng: userLocation?.lng ?? 0 } },
                      isPredefinedPlace: true,
                    } as any]}
                    renderRow={(rowData) => {
                      const isPredefined = !!(rowData as any).isPredefinedPlace;
                      return (
                        <View style={placesRowStyles.row}>
                          <View style={[placesRowStyles.iconWrap, isPredefined && placesRowStyles.iconWrapBlue]}>
                            <Ionicons
                              name={isPredefined ? 'navigate' : 'location-outline'}
                              size={16}
                              color={isPredefined ? '#FFFFFF' : '#0040e0'}
                            />
                          </View>
                          <View style={placesRowStyles.textWrap}>
                            <Text style={placesRowStyles.primary} numberOfLines={1}>
                              {isPredefined ? 'Current Location' : rowData.structured_formatting?.main_text || rowData.description}
                            </Text>
                            {!isPredefined && rowData.structured_formatting?.secondary_text ? (
                              <Text style={placesRowStyles.secondary} numberOfLines={1}>
                                {rowData.structured_formatting.secondary_text}
                              </Text>
                            ) : isPredefined ? (
                              <Text style={placesRowStyles.secondary} numberOfLines={1}>{currentLocationLabel}</Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    }}
                    currentLocation={false}
                    keepResultsAfterBlur
                  />
                </View>
              </View>

              {/* TO */}
              <View style={[styles.locRow, { marginTop: 20 }]}>
                <View style={styles.dotTo}>
                  <View style={styles.dotToInner} />
                </View>
                <View style={styles.locInputWrap}>
                  <Text style={styles.locLabelTo}>TO</Text>
                  <GooglePlacesAutocomplete
                    ref={dropoffRef}
                    placeholder="Drop-off address"
                    onPress={(data, details) => {
                      const saved = (data as any)._savedAddress;
                      if (saved) {
                        setDropoffAddress(saved.address);
                        dropoffCoords.current = { lat: saved.lat, lng: saved.lng };
                        return;
                      }
                      setDropoffAddress(data.description);
                      if (details?.geometry?.location) {
                        dropoffCoords.current = {
                          lat: details.geometry.location.lat,
                          lng: details.geometry.location.lng,
                        };
                      }
                    }}
                    query={placesQuery}
                    fetchDetails
                    enablePoweredByContainer={false}
                    minLength={0}
                    debounce={400}
                    styles={placesStyles}
                    textInputProps={{
                      placeholderTextColor: '#74777e',
                      value: dropoffAddress,
                      onChangeText: setDropoffAddress,
                    }}
                    predefinedPlaces={savedAddresses.map((a) => ({
                      description: a.address,
                      geometry: { location: { lat: a.lat, lng: a.lng } },
                      _savedAddress: a,
                      isPredefinedPlace: true,
                    } as any))}
                    renderRow={(rowData) => {
                      const saved = (rowData as any)._savedAddress as typeof savedAddresses[0] | undefined;
                      return (
                        <View style={placesRowStyles.row}>
                          <View style={[placesRowStyles.iconWrap, saved && placesRowStyles.iconWrapGreen]}>
                            <Ionicons
                              name={saved ? 'bookmark-outline' : 'location-outline'}
                              size={16}
                              color={saved ? '#FFFFFF' : '#0040e0'}
                            />
                          </View>
                          <View style={placesRowStyles.textWrap}>
                            <Text style={placesRowStyles.primary} numberOfLines={1}>
                              {saved ? saved.label : (rowData.structured_formatting?.main_text || rowData.description)}
                            </Text>
                            <Text style={placesRowStyles.secondary} numberOfLines={1}>
                              {saved ? saved.address : rowData.structured_formatting?.secondary_text}
                            </Text>
                          </View>
                        </View>
                      );
                    }}
                    currentLocation={false}
                    keepResultsAfterBlur
                  />
                </View>
              </View>
            </View>

            {/* -- Recipient --------------------------------------------- */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Recipient</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Full name"
                placeholderTextColor="#74777e"
                value={recipientName}
                onChangeText={setRecipientName}
              />
              <TextInput
                style={[styles.textInput, { marginTop: 10 }]}
                placeholder="Phone number"
                placeholderTextColor="#74777e"
                value={recipientPhone}
                onChangeText={setRecipientPhone}
                keyboardType="phone-pad"
              />
            </View>

            {/* -- Package Size ------------------------------------------- */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Package Size</Text>
              <View style={styles.sizeRow}>
                {SIZES.map((s) => (
                  <Pressable
                    key={s.value}
                    style={[styles.sizeBtn, selectedSize === s.value && styles.sizeBtnActive]}
                    onPress={() => setSelectedSize(s.value)}
                  >
                    <Text style={styles.sizeIcon}>{s.icon}</Text>
                    <Text style={[styles.sizeName, selectedSize === s.value && styles.sizeNameActive]}>{s.label}</Text>
                    <Text style={[styles.sizeDesc, selectedSize === s.value && styles.sizeDescActive]}>{s.desc}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* -- Payment Method ----------------------------------------- */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Payment</Text>
              <View style={styles.payRow}>
                <Pressable
                  style={[styles.payBtn, paymentMethod === 'cash' && styles.payBtnActive]}
                  onPress={() => setPaymentMethod('cash')}
                >
                  <Text style={styles.payIcon}>??</Text>
                  <Text style={[styles.payLabel, paymentMethod === 'cash' && styles.payLabelActive]}>Cash</Text>
                  <Text style={[styles.payNote, paymentMethod === 'cash' && styles.payNoteActive]}>Pay on delivery</Text>
                </Pressable>
                <Pressable
                  style={[styles.payBtn, paymentMethod === 'wallet' && styles.payBtnActive]}
                  onPress={() => setPaymentMethod('wallet')}
                >
                  <Text style={styles.payIcon}>??</Text>
                  <Text style={[styles.payLabel, paymentMethod === 'wallet' && styles.payLabelActive]}>Wallet</Text>
                  <Text style={[styles.payNote, paymentMethod === 'wallet' && styles.payNoteActive]}>Pay now</Text>
                </Pressable>
              </View>
              {paymentMethod === 'wallet' && (
                <View style={[styles.walletStatusCard, walletNeedsTopUp && styles.walletStatusCardWarning]}>
                  <View style={styles.walletStatusHeader}>
                    <Ionicons
                      name={walletNeedsTopUp ? 'alert-circle-outline' : 'wallet-outline'}
                      size={16}
                      color={walletNeedsTopUp ? '#ba1a1a' : '#0040e0'}
                    />
                    <Text style={[styles.walletStatusTitle, walletNeedsTopUp && styles.walletStatusTitleWarning]}>
                      Wallet balance: ?{(walletBalance ?? 0).toLocaleString()}
                    </Text>
                  </View>
                  <Text style={[styles.walletStatusText, walletNeedsTopUp && styles.walletStatusTextWarning]}>
                    {walletNeedsTopUp
                      ? `Short by ?${walletGuard.shortfall.toLocaleString()}. Top up before requesting a rider, or switch to cash.`
                      : 'You have enough balance for this order total.'}
                  </Text>
                  {walletNeedsTopUp && (
                    <Pressable style={styles.walletTopUpBtn} onPress={() => router.push('/(customer)/fund-wallet' as any)}>
                      <Text style={styles.walletTopUpText}>Top Up Wallet</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {/* -- Promo -------------------------------------------------- */}
            <Pressable onPress={() => setShowPromo(!showPromo)} style={styles.promoToggle}>
              <Text style={styles.promoToggleText}>
                {showPromo ? '?' : '?'} {promoApplied ? `? Promo applied (-?${discount.toLocaleString()})` : 'Have a promo code?'}
              </Text>
            </Pressable>
            {showPromo && (
              <View style={styles.promoRow}>
                <TextInput
                  style={[styles.promoInput, promoApplied && styles.promoInputApplied]}
                  placeholder="Enter code"
                  placeholderTextColor="#74777e"
                  value={promoCode}
                  onChangeText={(v) => { setPromoCode(v); setPromoError(''); setPromoApplied(false); setDiscount(0); }}
                  autoCapitalize="characters"
                  editable={!promoApplied}
                />
                <Pressable style={[styles.promoBtn, promoApplied && styles.promoBtnApplied]} onPress={handleApplyPromo} disabled={promoApplied}>
                  <Text style={styles.promoBtnText}>{promoApplied ? '?' : 'Apply'}</Text>
                </Pressable>
              </View>
            )}
            {promoError ? <Text style={styles.promoError}>{promoError}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        )}
      />

      {/* -- Bottom CTA ------------------------------------------------ */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 6 }]}>
        {/* Surge price warning */}
        {pricingRule && pricingRule.surge_multiplier > 1 && (
          <View style={styles.surgeBanner}>
            <Text style={styles.surgeIcon}>⚡</Text>
            <Text style={styles.surgeText}>
              High demand: {pricingRule.surge_multiplier.toFixed(1)}× surge pricing is active
            </Text>
          </View>
        )}
        <View style={styles.bottomRow}>
        {/* Price� always shown, even if 0 while loading */}
        <View style={styles.pricePreview}>
          <Text style={styles.priceLabel}>Est. Total</Text>
          {deliveryFee > 0
            ? <Text style={styles.priceValue}>?{total.toLocaleString()}</Text>
            : <Text style={styles.priceLoading}>Calculating�</Text>
          }
        </View>
        <Pressable
          style={[styles.findRiderBtn, (submitting || walletNeedsTopUp) && { opacity: 0.6 }]}
          onPress={handleFindRider}
          disabled={submitting || walletNeedsTopUp}
        >
          {submitting
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Text style={styles.findRiderText}>? Find Rider</Text>
          }
        </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// --- Google Places styles -----------------------------------------------------

const placesStyles = {
  textInputContainer: { backgroundColor: 'transparent', padding: 0, margin: 0 },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 0,
    height: 48,
    fontSize: Typography.base,
    fontWeight: Typography.medium as any,
    color: '#000D22',
    elevation: 1,
    margin: 0,
  },
  listView: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 4,
    elevation: 10,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    zIndex: 1000,
  },
  row: { backgroundColor: '#FFFFFF', paddingVertical: 0, paddingHorizontal: 0 },
  description: { fontSize: Typography.sm as any, color: '#000D22', fontWeight: '500' as any },
  separator: { height: 1, backgroundColor: '#F1F4F6', marginHorizontal: 14 },
  poweredContainer: { display: 'none' as any },
};

// --- Custom row styles --------------------------------------------------------

const placesRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconWrapBlue: {
    backgroundColor: '#0040e0',
  },
  iconWrapGreen: {
    backgroundColor: '#16a34a',
  },
  textWrap: { flex: 1, gap: 2 },
  primary: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: '#000D22',
  },
  secondary: {
    fontSize: Typography.xs,
    color: '#74777e',
  },
});

// --- Styles -------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingVertical: 12,
    backgroundColor: '#F7FAFC',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  backArrow: { fontSize: 18, color: '#000D22', fontWeight: '700' },
  headerTitle: { fontSize: Typography.md, fontWeight: Typography.bold, color: '#000D22', letterSpacing: -0.3 },

  scroll: { paddingHorizontal: Spacing[5], paddingTop: 8, paddingBottom: 120 },
  formBody: { gap: 14 },

  // Route card
  routeCard: {
    backgroundColor: '#F1F4F6',
    borderRadius: 20,
    padding: 20,
    position: 'relative',
    zIndex: 100,
  },
  dashLine: {
    position: 'absolute', left: 27, top: 44, bottom: 44,
    width: 1, borderStyle: 'dashed', borderLeftWidth: 2,
    borderColor: 'rgba(196,198,207,0.6)',
  },
  locRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, zIndex: 1 },
  dotFrom: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: '#0040e0', backgroundColor: '#FFFFFF',
    marginTop: 16, flexShrink: 0,
  },
  dotTo: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#0A2342', alignItems: 'center', justifyContent: 'center',
    marginTop: 16, flexShrink: 0,
  },
  dotToInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  locInputWrap: { flex: 1, gap: 4, zIndex: 1 },
  locLabel:   { fontSize: 10, fontWeight: '700', color: '#0040e0', textTransform: 'uppercase', letterSpacing: 2 },
  locLabelTo: { fontSize: 10, fontWeight: '700', color: '#44474e', textTransform: 'uppercase', letterSpacing: 2 },

  // Card
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, gap: 4,
    shadowColor: '#000D22', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  cardTitle: {
    fontSize: 11, fontWeight: '700', color: '#44474e',
    textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#F1F4F6', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    fontSize: Typography.base, fontWeight: Typography.medium, color: '#000D22',
  },

  // Size
  sizeRow: { flexDirection: 'row', gap: 10 },
  sizeBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    borderRadius: 16, backgroundColor: '#F1F4F6', gap: 4,
    borderWidth: 2, borderColor: 'transparent',
  },
  sizeBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#0040e0' },
  sizeIcon: { fontSize: 24 },
  sizeName: { fontSize: Typography.sm, fontWeight: '700', color: '#44474e' },
  sizeNameActive: { color: '#0040e0' },
  sizeDesc: { fontSize: 10, color: '#74777e', textAlign: 'center' },
  sizeDescActive: { color: '#0040e0', opacity: 0.7 },

  // Payment
  payRow: { flexDirection: 'row', gap: 10 },
  payBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 16,
    borderRadius: 16, backgroundColor: '#F1F4F6', gap: 4,
    borderWidth: 2, borderColor: 'transparent',
  },
  payBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#0040e0' },
  payIcon: { fontSize: 24 },
  payLabel: { fontSize: Typography.sm, fontWeight: '700', color: '#44474e' },
  payLabelActive: { color: '#0040e0' },
  payNote: { fontSize: 10, color: '#74777e' },
  payNoteActive: { color: '#0040e0', opacity: 0.7 },
  walletStatusCard: {
    marginTop: 12,
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#EEF2FF',
    gap: 8,
  },
  walletStatusCardWarning: {
    backgroundColor: '#FFF4F4',
  },
  walletStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walletStatusTitle: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: '#0040e0',
  },
  walletStatusTitleWarning: {
    color: '#ba1a1a',
  },
  walletStatusText: {
    fontSize: Typography.xs,
    color: '#44474e',
    lineHeight: 18,
  },
  walletStatusTextWarning: {
    color: '#8c1d18',
  },
  walletTopUpBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#0040e0',
  },
  walletTopUpText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Promo
  promoToggle: { paddingVertical: 4 },
  promoToggleText: { fontSize: Typography.sm, color: '#0040e0', fontWeight: '600' },
  promoRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  promoInput: {
    flex: 1, backgroundColor: '#F1F4F6', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: Typography.sm, fontWeight: '600', color: '#000D22', letterSpacing: 1,
  },
  promoInputApplied: { backgroundColor: '#dde1ff' },
  promoBtn: {
    backgroundColor: '#0A2342', borderRadius: 12,
    paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center',
  },
  promoBtnApplied: { backgroundColor: '#0040e0' },
  promoBtnText: { fontSize: Typography.sm, fontWeight: '700', color: '#FFFFFF' },
  promoError: { fontSize: Typography.xs, color: '#ba1a1a', marginTop: 2 },
  error: { fontSize: Typography.sm, color: '#ba1a1a', textAlign: 'center', fontWeight: '500' },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: Spacing[5],
    paddingTop: 14, gap: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: 'rgba(196,198,207,0.2)',
    shadowColor: '#000D22', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06, shadowRadius: 20, elevation: 8,
  },
  surgeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF3C7', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#F59E0B',
  },
  surgeIcon: { fontSize: 14 },
  surgeText: { flex: 1, fontSize: Typography.xs, fontWeight: '600', color: '#92400E' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pricePreview: { gap: 2, minWidth: 90 },
  priceLabel: { fontSize: 10, color: '#74777e', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  priceValue: { fontSize: Typography.lg, fontWeight: '800', color: '#000D22' },
  priceLoading: { fontSize: Typography.sm, color: '#74777e', fontWeight: '500' },
  findRiderBtn: {
    flex: 1, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0040e0', borderRadius: 16,
    shadowColor: '#0040e0', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  findRiderText: { fontSize: Typography.md, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.2 },
});
