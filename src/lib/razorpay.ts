import type { RazorpayCheckout, RazorpayConfirm } from '@/api/types'

/**
 * Razorpay Checkout, opened over our own page.
 *
 * The script is loaded on first use rather than in index.html, so pages that
 * never take a payment never fetch it. Resolves with what Razorpay hands back
 * (order id, payment id, signature), which the server checks before crediting;
 * rejects with `RazorpayDismissed` when the payer closes the window, or with
 * Razorpay's own reason when they close it after a payment failed.
 */

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'

export class RazorpayDismissed extends Error {
  constructor() {
    super('Payment window closed before paying.')
  }
}

/** The payer tried to pay, Razorpay declined it, and they then closed the window. */
export class RazorpayFailed extends Error {}

type RazorpayResponse = RazorpayConfirm
interface RazorpayInstance {
  open: () => void
  on: (event: 'payment.failed', handler: (e: { error?: { description?: string } }) => void) => void
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
}

let loading: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const tag = document.createElement('script')
      tag.src = SCRIPT
      tag.async = true
      tag.onload = () => resolve()
      tag.onerror = () => {
        loading = null
        reject(new Error('Could not load Razorpay. Check the internet connection and try again.'))
      }
      document.body.appendChild(tag)
    })
  }
  return loading
}

export async function openRazorpay(
  checkout: RazorpayCheckout,
  options: { merchant: string; logoUrl?: string | null } = { merchant: 'School fees' },
): Promise<RazorpayResponse> {
  await loadScript()
  const Razorpay = window.Razorpay
  if (!Razorpay) throw new Error('Could not load Razorpay. Try again.')

  return new Promise<RazorpayResponse>((resolve, reject) => {
    let failure: string | null = null
    const instance = new Razorpay({
      key: checkout.key_id,
      order_id: checkout.order_id,
      amount: checkout.amount_minor,
      currency: checkout.currency,
      name: options.merchant,
      description: checkout.description ?? undefined,
      image: options.logoUrl ?? undefined,
      prefill: {
        name: checkout.prefill?.name ?? undefined,
        email: checkout.prefill?.email ?? undefined,
        contact: checkout.prefill?.contact ?? undefined,
      },
      theme: { color: '#4f46e5' },
      handler: (response: RazorpayResponse) => resolve(response),
      modal: {
        ondismiss: () => reject(failure ? new RazorpayFailed(failure) : new RazorpayDismissed()),
      },
    })
    instance.on('payment.failed', (e) => {
      // Razorpay keeps its window open so the payer can retry. The reason is kept
      // for the page in case they give up and close it instead.
      failure = e.error?.description || 'The payment did not go through. Try again, or pay another way.'
    })
    instance.open()
  })
}
