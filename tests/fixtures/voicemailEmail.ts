/**
 * Fixtures derived from real 3CX voicemail mail, with the customer's number
 * scrubbed to 0400000000. The live samples (vmail_*.wav, *.eml in the repo
 * root) are gitignored because the number appears in both filename and body.
 *
 * Measured from the real WAV: RIFF/PCM (format tag 1), mono, 8 kHz, 16-bit —
 * i.e. 16000 bytes per second. A 26.6 s recording is 425,646 bytes, which is
 * 554 KB base64-encoded and so exceeds CloudMailin's 524,288-byte ceiling.
 */

/** Body text exactly as 3CX formats it, including the odd trailing `""` on To:. */
export const VOICEMAIL_BODY = [
  'You have received a new voice mail from "0400000000 - 0400000000 "',
  '',
  'From: 0400000000',
  'To: "166" - "TV Magic VM" ""',
  'Received:"Monday, July 27, 2026 11:55:14 AM"',
  'Duration:"00:00:26"',
  'File:"vmail_0400000000_166_20260727015014"',
  '',
].join('\r\n')

export const VOICEMAIL_SUBJECT = 'New Voicemail from 0400000000 - 0400000000'
export const VOICEMAIL_FROM =
  '3CX Communications System - French Technologies Business 1 <noreply@3cx.net>'

/** Message-ID survives Gmail's auto-forward, so both paths see this same value. */
export const VOICEMAIL_MESSAGE_ID = '<oiXbIzArSCCjFWdeIG7Slw@geopod-ismtpd-14>'

export const VOICEMAIL_FILE_NAME = 'vmail_0400000000_166_20260727015014.wav'

/** Bytes-per-second of the real recordings: 8000 Hz × 1 channel × 2 bytes. */
export const VOICEMAIL_BYTE_RATE = 16000

/**
 * Build a WAV matching the real 3CX encoding (PCM mono 8 kHz 16-bit) so tests
 * can assert on a genuine RIFF header without committing a binary blob.
 */
export function buildPcmWav(seconds = 0.1): Buffer {
  const sampleRate = 8000
  const bitsPerSample = 16
  const channels = 1
  const blockAlign = (channels * bitsPerSample) / 8
  const byteRate = sampleRate * blockAlign
  const dataSize = Math.round(sampleRate * seconds) * blockAlign

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // format tag 1 = PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  return Buffer.concat([header, Buffer.alloc(dataSize)])
}
