export async function nudgePartnerWebhookDispatcher() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) return;

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/partner-webhook-dispatcher`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    if (!response.ok) {
      console.warn('partner webhook dispatcher nudge failed:', response.status);
    }
  } catch (error) {
    console.warn('partner webhook dispatcher nudge error:', error);
  }
}
