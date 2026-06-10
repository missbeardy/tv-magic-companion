import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, title, message, url } = req.body;

  if (!userId || !title || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;

  if (!appId || !apiKey) {
    return res.status(500).json({ error: 'OneSignal not configured' });
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        target_channel: 'push',
        include_aliases: {
          external_id: [userId]
        },
        headings: { en: title },
        contents: { en: message },
        url: url || 'https://tv-magic-companion.vercel.app/leads',
      }),
    });

    const data = await response.json() as { id?: string; errors?: unknown };

    if (!response.ok) {
      console.error('OneSignal error:', data);
      return res.status(500).json({ error: 'Failed to send notification', details: data });
    }

    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    console.error('send-notification error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}