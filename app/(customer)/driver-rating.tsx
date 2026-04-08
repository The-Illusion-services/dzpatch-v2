import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Spacing, Typography } from '@/constants/theme';

// ─── Feedback tags ────────────────────────────────────────────────────────────

const FEEDBACK_TAGS = [
  'Fast',
  'Safe Driver',
  'Polite',
  'Great Communication',
  'Good Handling',
  'Professional',
];

// ─── Tip amounts (NGN) ────────────────────────────────────────────────────────

const TIP_AMOUNTS = [200, 500, 1000];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DriverRatingScreen() {
  const insets = useSafeAreaInsets();
  const { orderId, riderId, riderName } = useLocalSearchParams<{
    orderId: string;
    riderId?: string;
    riderName?: string;
  }>();
  const { profile } = useAuthStore();

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [review, setReview] = useState('');
  const [tip, setTip] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState('');
  const [isCustomTipMode, setIsCustomTipMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayRating = hoverRating || rating;

  // ── Toggle feedback tag ───────────────────────────────────────────────────

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // ── Rating label ──────────────────────────────────────────────────────────

  const ratingLabel = (r: number) => {
    switch (r) {
      case 1: return 'Poor';
      case 2: return 'Fair';
      case 3: return 'Good';
      case 4: return 'Great';
      case 5: return 'Excellent!';
      default: return 'Tap to rate';
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!orderId || !riderId) {
      setError('Missing trip details. Please reopen the delivery summary and try again.');
      return;
    }
    if (!profile?.id) {
      setError('You need to be signed in to submit a rating.');
      return;
    }
    if (rating === 0) {
      setError('Please select a rating.');
      return;
    }
    if (rating < 1 || rating > 5) {
      setError('Rating must be between 1 and 5.');
      return;
    }

    const tipAmount = isCustomTipMode && customTip ? Number(customTip) : (tip ?? 0);
    if (isCustomTipMode && customTip && (!Number.isFinite(tipAmount) || tipAmount <= 0)) {
      setError('Enter a valid custom tip amount or clear the field.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc('rate_rider', {
      p_order_id: orderId,
      p_customer_id: profile.id,
      p_score: rating,
      p_review: review.trim() || null,
    } as any);

    if (rpcError) {
      setError(rpcError.message);
      setSubmitting(false);
    } else {
      Alert.alert(
        'Feedback saved',
        tipAmount > 0
          ? `Your ${rating}-star rating was saved. Tip checkout is not enabled yet, so your tip preference of N${tipAmount.toLocaleString()} was not charged.`
          : 'Your rider rating has been saved successfully.',
        [
          {
            text: 'Done',
            onPress: () => router.replace('/(customer)/' as any),
          },
        ]
      );
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={8}>
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Rate Driver</Text>
        <Pressable onPress={() => router.replace('/(customer)/' as any)}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Rider section */}
        <View style={styles.riderSection}>
          <View style={styles.avatarGlowWrap}>
            <View style={styles.avatarGlow} />
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>{riderName?.charAt(0) ?? '?'}</Text>
            </View>
          </View>
          <Text style={styles.riderName}>{riderName ?? 'Your Rider'}</Text>
          <Text style={styles.riderVehicle}>🏍️  Delivery Rider</Text>
        </View>

        {/* Star rating */}
        <View style={styles.starSection}>
          <Text style={styles.starQuestion}>How was your delivery?</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                onPress={() => setRating(star)}
                onPressIn={() => setHoverRating(star)}
                onPressOut={() => setHoverRating(0)}
                hitSlop={4}
              >
                <Text style={[
                  styles.star,
                  displayRating >= star && styles.starActive,
                ]}>★</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.ratingLabel}>{ratingLabel(displayRating)}</Text>
        </View>

        {/* Feedback tags */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What went well?</Text>
          <View style={styles.tagsWrap}>
            {FEEDBACK_TAGS.map((tag) => {
              const selected = selectedTags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  style={[styles.tag, selected && styles.tagSelected]}
                  onPress={() => toggleTag(tag)}
                >
                  <Text style={[styles.tagText, selected && styles.tagTextSelected]}>{tag}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Review input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detailed Review</Text>
          <TextInput
            style={styles.reviewInput}
            placeholder="Tell us more about your experience (Optional)"
            placeholderTextColor="#74777e"
            multiline
            value={review}
            onChangeText={setReview}
            maxLength={500}
            textAlignVertical="top"
          />
        </View>

        {/* Tip selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add a Tip</Text>
          <View style={styles.tipsRow}>
            {TIP_AMOUNTS.map((amount) => {
              const selected = tip === amount && !isCustomTipMode;
              return (
                <Pressable
                  key={amount}
                  style={[styles.tipCircle, selected && styles.tipCircleSelected]}
                  onPress={() => {
                    setTip(selected ? null : amount);
                    setCustomTip('');
                    setIsCustomTipMode(false);
                  }}
                >
                  <Text style={[styles.tipText, selected && styles.tipTextSelected]}>
                    ₦{amount.toLocaleString()}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              style={[styles.tipCircle, isCustomTipMode && styles.tipCircleSelected]}
              onPress={() => {
                setTip(null);
                setIsCustomTipMode(true);
              }}
            >
              <Text style={[styles.tipText, isCustomTipMode && styles.tipTextSelected]}>Other</Text>
            </Pressable>
          </View>
          {isCustomTipMode && (
            <TextInput
              style={styles.customTipInput}
              placeholder="Enter custom amount (₦)"
              placeholderTextColor="#74777e"
              keyboardType="numeric"
              value={customTip}
              onChangeText={(v) => {
                setCustomTip(v);
                setTip(null);
                setIsCustomTipMode(true);
              }}
            />
          )}
          <Text style={styles.tipDisclaimer}>
            Tips are not charged in-app yet. We&apos;ll confirm your tip preference after you submit feedback.
          </Text>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>

      {/* Submit button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={[styles.submitBtn, (submitting || rating === 0) && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting || rating === 0}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.submitBtnText}>Submit Feedback</Text>
              <Text style={styles.submitBtnIcon}>→</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { fontSize: 14, color: '#44474e', fontWeight: Typography.bold },
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: '#000D22',
    letterSpacing: -0.3,
  },
  skipText: { fontSize: Typography.sm, fontWeight: Typography.medium, color: '#0040e0' },

  scroll: { paddingHorizontal: Spacing[5], paddingTop: 28, gap: 28 },

  // Rider
  riderSection: { alignItems: 'center', gap: 8 },
  avatarGlowWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatarGlow: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#0040e0',
    opacity: 0.12,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  avatarInitials: { fontSize: Typography['2xl'], fontWeight: Typography.bold, color: '#FFFFFF' },
  riderName: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: '#000D22',
    letterSpacing: -0.5,
  },
  riderVehicle: { fontSize: Typography.sm, color: '#44474e' },

  // Stars
  starSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000D22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  starQuestion: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: '#000D22',
  },
  starsRow: { flexDirection: 'row', gap: 8 },
  star: {
    fontSize: 44,
    color: '#E0E3E5',
  },
  starActive: { color: '#e66100' },
  ratingLabel: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    color: '#44474e',
    minHeight: 20,
  },

  // Section
  section: { gap: 12 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: Typography.bold,
    color: '#44474e',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    paddingHorizontal: 4,
  },

  // Tags
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tag: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#C4C6CF',
    backgroundColor: '#FFFFFF',
  },
  tagSelected: { backgroundColor: '#0040e0', borderColor: '#0040e0' },
  tagText: { fontSize: Typography.sm, fontWeight: Typography.semibold, color: '#181c1e' },
  tagTextSelected: { color: '#FFFFFF' },

  // Review
  reviewInput: {
    backgroundColor: '#E0E3E5',
    borderRadius: 16,
    padding: 16,
    fontSize: Typography.sm,
    color: '#181c1e',
    minHeight: 100,
    lineHeight: 20,
  },

  // Tips
  tipsRow: { flexDirection: 'row', gap: 12 },
  tipCircle: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#C4C6CF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipCircleSelected: { backgroundColor: '#dde1ff', borderColor: '#0040e0', borderWidth: 2 },
  tipText: { fontSize: Typography.sm, fontWeight: Typography.bold, color: '#181c1e' },
  tipTextSelected: { color: '#0040e0' },
  customTipInput: {
    marginTop: 8,
    backgroundColor: '#F1F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: Typography.sm,
    color: '#181c1e',
  },
  tipDisclaimer: {
    fontSize: Typography.xs,
    color: '#74777e',
    lineHeight: 18,
  },

  errorText: { fontSize: Typography.xs, color: '#ba1a1a', textAlign: 'center' },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: Spacing[5],
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(196,198,207,0.2)',
  },
  submitBtn: {
    height: 52,
    backgroundColor: '#0040e0',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  submitBtnText: { fontSize: Typography.md, fontWeight: Typography.extrabold, color: '#FFFFFF' },
  submitBtnIcon: { fontSize: 18, color: '#FFFFFF', fontWeight: Typography.bold },
});
