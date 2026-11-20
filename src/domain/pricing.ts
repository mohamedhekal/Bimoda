import type { Order } from './types'

export interface OrderTotals {
  subtotalCents: number
  discountCents: number
  shippingFeeCents: number
  freeShippingApplied: boolean
  totalCents: number
  /** Amount the courier collects on delivery (0 when prepaid) */
  amountDueCents: number
}

/** Single source of truth for money. Models never calculate amounts. */
export function computeOrderTotals(order: Order): OrderTotals {
  const subtotalCents = order.items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0)
  const discountCents = Math.min(order.discountCents, subtotalCents)
  const discounted = subtotalCents - discountCents
  const freeShippingApplied = discounted >= order.freeShippingThresholdCents
  const shippingFeeCents = freeShippingApplied ? 0 : order.baseShippingFeeCents
  const totalCents = discounted + shippingFeeCents
  const amountDueCents = order.paymentStatus === 'paid' ? 0 : totalCents
  return { subtotalCents, discountCents, shippingFeeCents, freeShippingApplied, totalCents, amountDueCents }
}

export function formatMoney(cents: number, locale = 'en-US', currency = 'USD'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
}
