import { formatAuPhoneForSms, phoneCandidates } from './phone.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'

export const CUSTOMER_IMPORT_MAX_ROWS = 5000

export interface CustomerImportRow {
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
}

export interface CustomerImportReport {
  created: number
  merged: number
  skipped: number
  errors: string[]
  total: number
}

export type CustomerImportColumn = 'name' | 'phone' | 'email' | 'address' | 'notes' | 'skip'

/** Pure CSV line splitter (handles quoted fields). */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

export function parseCsv(text: string): string[][] {
  const normalised = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalised.split('\n').filter((l) => l.trim().length > 0)
  return lines.map(parseCsvLine)
}

const HEADER_ALIASES: Record<string, CustomerImportColumn> = {
  name: 'name',
  customer: 'name',
  customer_name: 'name',
  'customer name': 'name',
  full_name: 'name',
  'full name': 'name',
  phone: 'phone',
  mobile: 'phone',
  cellphone: 'phone',
  'phone number': 'phone',
  email: 'email',
  'e-mail': 'email',
  address: 'address',
  suburb: 'address',
  notes: 'notes',
  note: 'notes',
  comment: 'notes',
  comments: 'notes',
}

export function guessColumnMap(headers: string[]): CustomerImportColumn[] {
  return headers.map((h) => {
    const key = h.trim().toLowerCase()
    return HEADER_ALIASES[key] ?? 'skip'
  })
}

export function rowsFromMappedCsv(
  table: string[][],
  columnMap: CustomerImportColumn[],
  hasHeader: boolean
): CustomerImportRow[] {
  const dataRows = hasHeader ? table.slice(1) : table
  const out: CustomerImportRow[] = []
  for (const cells of dataRows) {
    let name = ''
    let phone: string | null = null
    let email: string | null = null
    let address: string | null = null
    let notes: string | null = null
    for (let i = 0; i < columnMap.length; i++) {
      const col = columnMap[i]
      const raw = (cells[i] ?? '').trim()
      if (!raw || col === 'skip') continue
      if (col === 'name') name = raw
      else if (col === 'phone') phone = raw
      else if (col === 'email') email = raw
      else if (col === 'address') address = raw
      else if (col === 'notes') notes = raw
    }
    out.push({ name, phone, email, address, notes })
  }
  return out
}

export function validateImportRow(
  row: CustomerImportRow,
  index: number
): string | null {
  if (!row.name.trim() && !row.phone?.trim() && !row.email?.trim()) {
    return `Row ${index + 1}: empty — need at least a name, phone, or email`
  }
  if (!row.phone?.trim() && !row.email?.trim()) {
    return `Row ${index + 1} (${row.name || 'unnamed'}): need a phone or email to match later inbound leads`
  }
  return null
}

/**
 * Import customers for an org. Dedupe by normalised phone (then email).
 * Merges into existing rows without overwriting non-null fields.
 */
export async function importCustomersForOrg(
  orgId: string,
  rows: CustomerImportRow[]
): Promise<CustomerImportReport> {
  const report: CustomerImportReport = {
    created: 0,
    merged: 0,
    skipped: 0,
    errors: [],
    total: rows.length,
  }

  if (!orgId) {
    report.errors.push('Missing organisation')
    report.skipped = rows.length
    return report
  }

  if (rows.length > CUSTOMER_IMPORT_MAX_ROWS) {
    report.errors.push(
      `Too many rows (${rows.length}). Cap is ${CUSTOMER_IMPORT_MAX_ROWS} — split the file and try again.`
    )
    report.skipped = rows.length
    return report
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    report.errors.push('Server not configured')
    report.skipped = rows.length
    return report
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const validationError = validateImportRow(row, i)
    if (validationError) {
      report.skipped++
      if (report.errors.length < 25) report.errors.push(validationError)
      continue
    }

    const name = row.name.trim() || 'Imported customer'
    const phone = row.phone?.trim() ? formatAuPhoneForSms(row.phone.trim()) : null
    const email = row.email?.trim() || null
    const address = row.address?.trim() || null
    const notes = row.notes?.trim() || null

    try {
      let existing: {
        id: string
        name: string | null
        phone: string | null
        email: string | null
        address: string | null
        notes: string | null
      } | null = null

      if (phone) {
        const { data } = await supabase
          .from('customers')
          .select('id, name, phone, email, address, notes')
          .eq('org_id', orgId)
          .in('phone', phoneCandidates(phone))
          .order('created_at', { ascending: false })
          .limit(1)
        existing = data?.[0] ?? null
      }

      if (!existing && email) {
        const { data } = await supabase
          .from('customers')
          .select('id, name, phone, email, address, notes')
          .eq('org_id', orgId)
          .ilike('email', email)
          .order('created_at', { ascending: false })
          .limit(1)
        existing = data?.[0] ?? null
      }

      if (existing) {
        const patch: Record<string, string> = {}
        if (!existing.name?.trim() && name) patch.name = name
        if (!existing.phone?.trim() && phone) patch.phone = phone
        if (!existing.email?.trim() && email) patch.email = email
        if (!existing.address?.trim() && address) patch.address = address
        if (!existing.notes?.trim() && notes) patch.notes = notes
        if (Object.keys(patch).length > 0) {
          await supabase.from('customers').update(patch).eq('id', existing.id).eq('org_id', orgId)
        }
        report.merged++
      } else {
        const { error } = await supabase.from('customers').insert({
          org_id: orgId,
          name,
          phone,
          email,
          address,
          notes,
        })
        if (error) {
          report.skipped++
          if (report.errors.length < 25) {
            report.errors.push(`Row ${i + 1}: ${error.message}`)
          }
        } else {
          report.created++
        }
      }
    } catch (err) {
      report.skipped++
      if (report.errors.length < 25) {
        report.errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'failed'}`)
      }
    }
  }

  return report
}
