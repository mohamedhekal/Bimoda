export type FulfillmentStatus = 'pending' | 'processing' | 'packed' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled'

export type CaseType = 'free_shipping' | 'locked_shipment' | 'address' | 'return' | 'late_reply' | 'injection' | 'shipping_delay' | 'general'

export type Priority = 'low' | 'medium' | 'high' | 'critical'
export type CaseStatus = 'open' | 'needs_review' | 'waiting_customer' | 'resolved'

export interface OrderItem {
  sku: string
  name: string
  variant: string
  unitPriceCents: number
  qty: number
}

export interface Address {
  line1: string
  city: string
  district?: string
  /** false when the destination is incomplete or inconsistent */
  complete: boolean
}

export interface ShipmentEvent {
  at: string
  status: string
  note: string
}

export interface ReturnCase {
  pickup: 'none' | 'requested' | 'scheduled' | 'carrier_confirmed' | 'in_transit'
  warehouseReceipt: 'not_received' | 'received'
  settlement: 'none' | 'pending' | 'settled'
}

export interface Customer {
  id: string
  displayName: string
  phone: string
  email: string
}

export interface Order {
  id: string
  customerId: string
  items: OrderItem[]
  discountCents: number
  /** Base shipping fee before any free-shipping promotion */
  baseShippingFeeCents: number
  /** Orders with discounted subtotal >= this get free shipping */
  freeShippingThresholdCents: number
  /** Total a confirmation message stated to the customer, when known */
  statedTotalCents?: number
  paymentStatus: 'cod' | 'paid' | 'pending'
  fulfillment: FulfillmentStatus
  createdAt: string
  address: Address
  carrier?: string
  trackingRef?: string
  shipmentEvents: ShipmentEvent[]
  returnCase?: ReturnCase
  notes: string[]
}

export interface Message {
  from: 'customer' | 'agent'
  text: string
  at: string
}

export interface Conversation {
  id: string
  orderId: string
  channel: 'chat' | 'email' | 'whatsapp'
  status: CaseStatus
  priority: Priority
  type: CaseType
  assignee: string | null
  messages: Message[]
}

export type Role = 'agent' | 'manager' | 'admin'

export type ProposedActionKind =
  | 'DRAFT_REPLY'
  | 'CHANGE_VARIANT'
  | 'CHANGE_ADDRESS'
  | 'REFUND'
  | 'RESTORE_INVENTORY'
  | 'FLAG_ORDER'
  | 'REQUEST_CLARIFICATION'
  | 'ESCALATE_SHIPPING'
  | 'MANUAL_REVIEW'

export type ApprovalState = 'suggested' | 'pending_approval' | 'approved' | 'rejected' | 'executed'
