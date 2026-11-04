/**
 * An amount written out in words, the way a receipt book does it:
 * "Rupees Twenty-Five Thousand Only", "Rupees One Lakh Five Hundred and Fifty Paise Only".
 *
 * Indian grouping (thousand, lakh, crore) for rupees, because that is how a
 * school in India writes a cheque; international grouping (thousand, million)
 * for everything else.
 */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

const UNITS: Record<string, [string, string]> = {
  INR: ['Rupees', 'Paise'],
  AED: ['Dirhams', 'Fils'],
  USD: ['Dollars', 'Cents'],
}

function belowHundred(n: number): string {
  if (n < 20) return ONES[n]
  const tens = TENS[Math.floor(n / 10)]
  return n % 10 ? `${tens}-${ONES[n % 10]}` : tens
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const parts = []
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`)
  if (rest) parts.push(belowHundred(rest))
  return parts.join(' ')
}

function indian(n: number): string {
  if (n === 0) return 'Zero'
  const parts = []
  const crore = Math.floor(n / 10_000_000)
  const lakh = Math.floor((n % 10_000_000) / 100_000)
  const thousand = Math.floor((n % 100_000) / 1000)
  const rest = n % 1000
  if (crore) parts.push(`${indian(crore)} Crore`)
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`)
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`)
  if (rest) parts.push(belowThousand(rest))
  return parts.join(' ')
}

function international(n: number): string {
  if (n === 0) return 'Zero'
  const scales = ['', 'Thousand', 'Million', 'Billion']
  const parts = []
  let scale = 0
  while (n > 0 && scale < scales.length) {
    const chunk = n % 1000
    if (chunk) parts.unshift(`${belowThousand(chunk)}${scales[scale] ? ` ${scales[scale]}` : ''}`)
    n = Math.floor(n / 1000)
    scale += 1
  }
  return parts.join(' ')
}

export function amountInWords(amount: number, currency: string): string {
  const code = currency.trim().toUpperCase()
  const [major, minor] = UNITS[code] ?? [code, 'Cents']
  const spell = code === 'INR' ? indian : international
  const cents = Math.round(Math.abs(amount) * 100)
  const whole = Math.floor(cents / 100)
  const fraction = cents % 100
  const words = `${major} ${spell(whole)}`
  return fraction ? `${words} and ${belowHundred(fraction)} ${minor} Only` : `${words} Only`
}
