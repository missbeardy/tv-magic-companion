// api/send-support-email.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Inlined rate limit (matches pattern used in inbound-sms.ts)
const requests = new Map<string, { count: number; reset: number }>();
function checkRateLimit(ip: string, limit = 10, windowMs = 60000): boolean {
  const now = Date.now();
  const key = ip.split(',')[0].trim() || 'unknown';
  const entry = requests.get(key);
  if (!entry || now > entry.reset) {
    requests.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

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
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] as string) ?? 'unknown';
  if (!checkRateLimit(ip, 10, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }

  try {
    const { type, title, description, imageUrls, userName, userEmail, orgName } = req.body as SupportPayload;

    if (!title || !description || !userEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const typeLabel = type === 'feature' ? '✨ Feature Request' : '🐛 Support Issue';
    const adminEmail = 'admin@fieldbournedigital.com.au';

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

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    let emailSent = false;

    if (RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(RESEND_API_KEY);
        const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@tv-magic-companion.com';
        const { error } = await resend.emails.send({
          from: FROM_EMAIL,
          to: adminEmail,
          subject: `[TVMagic Support] ${typeLabel}: ${title}`,
          html: htmlContent,
        });
        if (error) throw new Error(error.message);
        emailSent = true;
      } catch (err) {
        console.error('Resend email failed:', err);
      }
    } else {
      console.log('RESEND_API_KEY not set – email not sent');
    }

    console.log('=== SUPPORT REQUEST ===');
    console.log('Type:', typeLabel);
    console.log('From:', userName, userEmail);
    console.log('Title:', title);
    console.log('Description:', description);
    console.log('Images:', imageUrls);
    console.log('Email sent:', emailSent);
    console.log('=======================');

    return res.status(200).json({
      success: true,
      emailSent,
      message: emailSent ? 'Request submitted and email sent!' : 'Request logged (email not configured). Our team will review.'
    });

  } catch (err: any) {
    console.error('Support API fatal error:', err);
    return res.status(500).json({ error: 'Internal server error. Please try again later.' });
  }
}