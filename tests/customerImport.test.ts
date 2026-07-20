import { describe, expect, it } from 'vitest'
import {
  guessColumnMap,
  parseCsv,
  rowsFromMappedCsv,
  validateImportRow,
} from '../api/_lib/customerImport'

describe('customerImport CSV helpers', () => {
  it('parses quoted commas', () => {
    const table = parseCsv('Name,Phone\n"Smith, Jane",0412345678')
    expect(table[1]).toEqual(['Smith, Jane', '0412345678'])
  })

  it('guesses common headers', () => {
    expect(guessColumnMap(['Customer Name', 'Mobile', 'Email', 'Notes'])).toEqual([
      'name',
      'phone',
      'email',
      'notes',
    ])
  })

  it('maps rows with header', () => {
    const table = parseCsv('name,phone,email\nPat,0411111111,a@b.c\n,,')
    const rows = rowsFromMappedCsv(table, ['name', 'phone', 'email'], true)
    expect(rows[0]).toMatchObject({ name: 'Pat', phone: '0411111111', email: 'a@b.c' })
  })

  it('validates identity fields', () => {
    expect(validateImportRow({ name: 'x', phone: null, email: null, address: null, notes: null }, 0)).toContain(
      'phone or email'
    )
    expect(
      validateImportRow({ name: 'x', phone: '0412', email: null, address: null, notes: null }, 0)
    ).toBeNull()
  })
})
