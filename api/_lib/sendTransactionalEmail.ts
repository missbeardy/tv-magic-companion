export interface TransactionalEmailAttachment {
  filename: string
  content: Buffer
}

export interface SendTransactionalEmailInput {
  to: string
  subject: string
  html: string
  from?: string
  attachments?: TransactionalEmailAttachment[]
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput
): Promise<{ sent: boolean; message: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { sent: false, message: 'Email not sent (RESEND_API_KEY is missing).' }
  }

  const fromAddress = input.from || process.env.INVOICE_EMAIL_FROM || process.env.QUOTE_EMAIL_FROM || process.env.EMAIL_FROM || 'noreply@tv-magic-companion.com'

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    })
    if (error) throw new Error(error.message)
    return { sent: true, message: `Email sent to ${input.to} from ${fromAddress}.` }
  } catch (err) {
    console.error('Transactional email failed:', err)
    return {
      sent: false,
      message: err instanceof Error ? err.message : 'Email delivery failed.',
    }
  }
}
