import { getAuthHeaders } from './apiAuth';

/** Alert managers (bell + SMS) after creating an unassigned lead. */
export async function alertManagersOnNewLead(leadId: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/send-sms?action=new-lead-alert', {
      method: 'POST',
      headers,
      body: JSON.stringify({ leadId }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Manager alert failed:', error);
    }
  } catch (err) {
    console.error('Failed to alert managers:', err);
  }
}

export async function sendNotification(
  userId: string,
  title: string,
  message: string,
  url?: string
): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/send-sms?action=notify', {
      method: 'POST',
      headers,
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