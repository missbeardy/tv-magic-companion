// api/send-support-email.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateRequest } from './_lib/auth.js';
import { escapeHtml, nl2brHtml } from './_lib/emailTemplates.js';

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
}

const MAX_IMAGE_URLS = 5;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;

function isOwnSupportAttachmentUrl(url: unknown, userId: string): boolean {
  if (typeof url !== 'string') return false;
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return false;
  const prefix = `${supabaseUrl}/storage/v1/object/public/support-attachments/support/${userId}/`;
  return url.startsWith(prefix);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const ip = (req.headers['x-forwarded-for'] as string) ?? auth.userId;
  if (!checkRateLimit(ip, 10, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }

  try {
    const { type, title, description, imageUrls } = req.body as SupportPayload;

    if (!title || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (type !== 'feature' && type !== 'issue') {
      return res.status(400).json({ error: 'Invalid request type' });
    }
    if (title.length > MAX_TITLE_LENGTH || description.length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).json({ error: 'Title or description too long' });
    }

    const urls = Array.isArray(imageUrls) ? imageUrls : [];
    if (urls.length > MAX_IMAGE_URLS) {
      return res.status(400).json({ error: 'Too many attached images' });
    }
    if (urls.some((url) => !isOwnSupportAttachmentUrl(url, auth.userId))) {
      return res.status(400).json({ error: 'Invalid attachment URL' });
    }

    const userName = auth.fullName || auth.email?.split('@')[0] || 'User';
    const userEmail = auth.email || 'no-email@example.com';
    const orgName = auth.org.name;

    const cleanTitle = title.replace(/[\r\n]+/g, ' ').trim();
    const typeLabel = type === 'feature' ? '✨ Feature Request' : '🐛 Support Issue';
    const adminEmail = 'admin@fieldbournedigital.com.au';

    const htmlContent = `
      <h2>${escapeHtml(typeLabel)}</h2>
      <p><strong>From:</strong> ${escapeHtml(userName)} (${escapeHtml(userEmail)})</p>
      <p><strong>Organization:</strong> ${escapeHtml(orgName || 'Not specified')}</p>
      <p><strong>Title:</strong> ${escapeHtml(cleanTitle)}</p>
      <p><strong>Description:</strong></p>
      <p>${nl2brHtml(description)}</p>
      ${urls.length ? `<p><strong>Attached images:</strong><br/>${urls.map(url => `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a><br/>`).join('')}</p>` : ''}
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
          replyTo: userEmail,
          subject: `[TVMagic Support] ${typeLabel}: ${cleanTitle}`,
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
    console.log('Title:', cleanTitle);
    console.log('Description:', description);
    console.log('Images:', urls);
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
