import { getAuthHeaders } from './apiAuth';
import { fetchWithTimeout } from './fetchWithTimeout';

/** Alert managers (bell + push + SMS) after creating an unassigned lead. */
export async function alertManagersOnNewLead(leadId: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout('/api/send-sms?action=new-lead-alert', {
      method: 'POST',
      headers,
      body: JSON.stringify({ leadId }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Manager alert failed:', error);
      return;
    }
    const data = await response.json();
    if (data.skipped) {
      console.warn('Manager alert skipped:', data.reason);
    }
  } catch (err) {
    console.error('Failed to alert managers:', err);
  }
}

export async function sendNotification(
  userId: string,
  title: string,
  message: string,
  url?: string,
  type = 'lead_assigned',
): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout('/api/send-sms?action=notify', {
      method: 'POST',
      headers,
      // The server rejects over-length title/message (AUD-17) — trim rather than lose the alert.
      body: JSON.stringify({ userId, title: title.slice(0, 120), message: message.slice(0, 500), url, type }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Notification failed:', error);
    }
  } catch (err) {
    console.error('Failed to send notification:', err);
  }
}