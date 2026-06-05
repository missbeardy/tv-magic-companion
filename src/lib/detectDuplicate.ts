import { supabase } from './supabase';

async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingLeadId?: string;
  hash: string;
}

export async function checkForDuplicate(
  rawEmail: string
): Promise<DuplicateCheckResult> {
  const hash = await hashText(rawEmail);

  const { data } = await supabase
    .from('leads')
    .select('id')
    .eq('email_hash', hash)
    .maybeSingle();

  return {
    isDuplicate: !!data,
    existingLeadId: data?.id,
    hash,
  };
}