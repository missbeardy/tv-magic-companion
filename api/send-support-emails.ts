// api/send-support-email.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit } from './_rateLimit';

// We'll use Resend if available, otherwise fallback to console log
// To use Resend, add RESEND_API_KEY to environment variables
// and install "resend" package. For simplicity, we'll try to use Resend
// and if key missing, just log and return success (for development)

interface SupportPayload {
  type: 'feature' | 'issue';
  title: string;
  description: string;
  imageUrls: string[];
  userName: string;
  userEmail: string;
  orgName: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] as string) ?? 'unknown';
  if (!checkRateLimit(ip, 10, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }

  const { type, title, description, imageUrls, userName, userEmail, orgName } = req.body as SupportPayload;

  if (!title || !description || !userEmail) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const typeLabel = type === 'feature' ? '✨ Feature Request' : '🐛 Support Issue';
  const adminEmail = 'admin@fieldbournedigital.com.au';

  // Try to use Resend if API key is present
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@tv-magic-companion.com';

  const htmlContent = `
    <h2>${typeLabel}</h2>
    <p><strong>From:</strong> ${userName} (${userEmail})</p>
    <p><strong>Organization:</strong> ${orgName || 'Not specified'}</p>
    <p><strong>Title:</strong> ${title}</p>
    <p><strong>Description:</strong></p>
    <p>${description.replace(/\n/g, '<br/>')}</p>
    ${imageUrls.length ? `<p><strong>Attached images:</strong><br/>${imageUrls.map(url => `<a href="${url}">${url}</a><br/>`).join('')}</p>` : ''}
    <hr/>
    <p style="color:#666; font-size:12px;">Submitted via TVMagic Companion Support page</p>
  `;

  if (RESEND_API_KEY) {
    try {
      // Dynamic import to avoid needing resend in dev if not installed
      const { Resend } = await import('resend');
      const resend = new Resend(RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: adminEmail,
        subject: `[TVMagic Support] ${typeLabel}: ${title}`,
        html: htmlContent,
      });
      if (error) throw new Error(error.message);
      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error('Resend error:', err);
      // Fallback: log to console and return error to user
      return res.status(500).json({ error: 'Failed to send email. Please try again later.' });
    }
  } else {
    // No API key – log email content for development
    console.log('=== SUPPORT REQUEST (email not sent - missing RESEND_API_KEY) ===');
    console.log('To:', adminEmail);
    console.log('Subject:', `[TVMagic Support] ${typeLabel}: ${title}`);
    console.log('Body:', htmlContent);
    console.log('Images:', imageUrls);
    console.log('==========================================');
    // Still return success in dev mode to not break frontend
    return res.status(200).json({ success: true, note: 'Email not sent – missing RESEND_API_KEY' });
  }
}