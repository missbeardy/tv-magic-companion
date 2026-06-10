export async function sendNotification(
  userId: string,
  title: string,
  message: string,
  url?: string
): Promise<void> {
  try {
    const response = await fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, title, message, url }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Notification failed:', error);
    }
  } catch (err) {
    console.error('Failed to send notification:', err);
  }
}