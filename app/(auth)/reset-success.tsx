import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';

export default function ResetSuccessScreen() {
  const { email, phone } = useLocalSearchParams<{ email?: string; phone?: string }>();

  const maskedTarget = email
    ? email.replace(/^(.{2})(.*)(@.*)/, '$1****$3')
    : phone?.replace(/(\+\d{3})\d+(\d{4})/, '$1****$2') ?? '';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brand}>Dzpatch</Text>
      </View>

      <View style={styles.content}>
        {/* Success icon */}
        <View style={styles.iconOuter}>
          <View style={styles.iconGlow} />
          <View style={styles.iconInner}>
            <Text style={styles.iconEmoji}>✓</Text>
          </View>
        </View>

        {/* Text */}
        <View style={styles.textBlock}>
          <Text style={styles.title}>Password Updated</Text>
          <Text style={styles.subtitle}>
            Your security credentials have been successfully reset. You can now access your account.
          </Text>
        </View>

        {/* CTA */}
        <View style={styles.actions}>
          <Button
            label="Back to Login"
            onPress={() => router.replace('/(auth)/login')}
          />

          {maskedTarget ? (
            <View style={styles.sentTo}>
              <Text style={styles.sentToLabel}>Verification code sent to</Text>
              <View style={styles.sentToBadge}>
                <View style={styles.sentToDot} />
                <Text style={styles.sentToValue}>{maskedTarget}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Progress bars decoration */}
        <View style={styles.progressBars}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.progressTrack}>
              <View style={styles.progressFill} />
            </View>
          ))}
        </View>
      </View>

      {/* Decorative watermarks */}
      <View style={styles.watermarkTop}>
        <Text style={styles.watermarkText}>⬡</Text>
      </View>
      <View style={styles.watermarkBottom}>
        <Text style={styles.watermarkText}>🚚</Text>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>Dzpatch Secure Infrastructure</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,198,207,0.2)',
  },
  brand: {
    fontSize: 22,
    fontWeight: '900',
    color: '#000D22',
    letterSpacing: -0.5,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 40,
  },
  iconOuter: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlow: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,64,224,0.05)',
    borderRadius: 64,
    transform: [{ scale: 1.5 }],
  },
  iconInner: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#0040e0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0040e0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  iconEmoji: {
    fontSize: 44,
    color: '#FFFFFF',
    fontWeight: '900',
  },
  textBlock: {
    gap: 12,
    alignItems: 'center',
    maxWidth: 320,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#181c1e',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 17,
    color: '#44474e',
    lineHeight: 28,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    gap: 20,
    alignItems: 'center',
  },
  sentTo: {
    alignItems: 'center',
    gap: 8,
  },
  sentToLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(68,71,78,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
  sentToBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  sentToDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e66100',
  },
  sentToValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#44474e',
  },
  progressBars: {
    flexDirection: 'row',
    gap: 8,
    opacity: 0.4,
    width: '100%',
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#e0e3e5',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    width: '100%',
    backgroundColor: '#0040e0',
  },
  watermarkTop: {
    position: 'absolute',
    top: 96,
    left: 40,
    opacity: 0.03,
  },
  watermarkBottom: {
    position: 'absolute',
    bottom: 40,
    right: 40,
    opacity: 0.03,
  },
  watermarkText: {
    fontSize: 200,
  },
  footer: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(68,71,78,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
});
