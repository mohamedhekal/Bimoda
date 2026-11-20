import type { Conversation, Order, ReturnCase } from './types'

/** Fixed "now" for the synthetic dataset so signals are deterministic and testable. */
export const DEMO_NOW = new Date('2026-11-20T09:00:00Z')

export type SignalSeverity = 'info' | 'warn' | 'critical'
export interface Signal {
  id: string
  severity: SignalSeverity
  title: string
  detail: string
}

const DAY = 86_400_000
const LOCKED = ['packed', 'shipped', 'out_for_delivery', 'delivered'] as const

/**
 * Deterministic shipping analysis from recorded events only.
 * It never invents carrier events and never calls a model.
 */
export function shippingSignals(order: Order, conversation?: Conversation, now: Date = DEMO_NOW): Signal[] {
  const out: Signal[] = []
  const events = [...order.shipmentEvents].sort((a, b) => a.at.localeCompare(b.at))
  const failed = events.filter((e) => e.status === 'FAILED_ATTEMPT')

  if (failed.length >= 2)
    out.push({
      id: 'repeated_failed_attempts',
      severity: 'critical',
      title: 'Repeated failed delivery attempts',
      detail: `${failed.length} failed attempts recorded. Confirm contact details and delivery instructions before the next attempt.`,
    })

  const last = events.at(-1)
  if (last && last.status !== 'DELIVERED') {
    const idleDays = Math.floor((now.getTime() - new Date(last.at).getTime()) / DAY)
    if (idleDays >= 3 && order.fulfillment !== 'delivered')
      out.push({
        id: 'no_recent_update',
        severity: 'warn',
        title: 'No carrier update for 3+ days',
        detail: `Last event "${last.status}" was ${idleDays} days ago.`,
      })
  }

  const deliveredAt = events.findIndex((e) => e.status === 'DELIVERED')
  if (deliveredAt >= 0 && events.slice(deliveredAt + 1).some((e) => e.status !== 'DELIVERED'))
    out.push({
      id: 'status_regression',
      severity: 'critical',
      title: 'Status changed after delivery',
      detail: 'Events continue after a DELIVERED status. Verify with the carrier before acting.',
    })

  if (!order.address.complete)
    out.push({
      id: 'address_uncertain',
      severity: 'warn',
      title: 'Destination incomplete or inconsistent',
      detail: 'Ask only for the missing parts (street, building or landmark, district) instead of re-asking everything.',
    })

  const customerLast = conversation?.messages.at(-1)?.from === 'customer'
  const wantsChange = conversation && ['locked_shipment', 'late_reply', 'address'].includes(conversation.type)
  if (customerLast && wantsChange && (LOCKED as readonly string[]).includes(order.fulfillment))
    out.push({
      id: 'request_after_lock',
      severity: 'critical',
      title: 'Customer change request after fulfillment started',
      detail: `Order is "${order.fulfillment}". The edit lock applies even though the customer replied late.`,
    })

  return out
}

export interface ReturnStage {
  label: string
  /** Only true when the warehouse itself confirmed physical receipt */
  physicallyReceived: boolean
  caveat: string
}

/** Courier statuses never prove warehouse receipt; only warehouseReceipt === 'received' does. */
export function returnStage(rc: ReturnCase | undefined): ReturnStage {
  if (!rc) return { label: 'No return case', physicallyReceived: false, caveat: 'No return has been opened for this order.' }
  if (rc.warehouseReceipt === 'received')
    return {
      label: rc.settlement === 'settled' ? 'Received and settled' : 'Received at warehouse',
      physicallyReceived: true,
      caveat: 'Warehouse confirmed physical receipt.',
    }
  const label = {
    none: 'Return requested',
    requested: 'Return requested',
    scheduled: 'Pickup scheduled',
    carrier_confirmed: 'Carrier pickup confirmed',
    in_transit: 'Return in transit',
  }[rc.pickup]
  return {
    label,
    physicallyReceived: false,
    caveat: 'No warehouse receipt yet. Courier status does not prove the item arrived: do not restock or settle automatically.',
  }
}
