/**
 * Payment provider boundary. The product ships with the "manual" provider: invoices are issued and a
 * platform billing admin records the payment (bank transfer, cheque, or an off-platform card link).
 * To take card payments, implement `BillingProvider` for a gateway (for example Stripe or Razorpay),
 * create a hosted-checkout session in `checkoutUrl`, and call `app.mark_invoice_paid(invoice_id)` from a
 * signed webhook handler. No gateway is wired in this repository: that needs your account and keys.
 */
export interface BillingProvider {
  name: string;
  /** Where the customer pays an open invoice, or null when payment is handled off-platform. */
  checkoutUrl(invoice: { id: string; number: string; amountMinor: number; currency: string; companyId: string }): Promise<string | null>;
  instructions(invoice: { number: string }): string;
}
export const manualProvider: BillingProvider = {
  name: "manual",
  async checkoutUrl() { return null; },
  instructions: (inv) => process.env.BILLING_INSTRUCTIONS ?? `Pay by bank transfer and quote ${inv.number} as the reference. We confirm payment within one business day.`,
};
export const billing: BillingProvider = manualProvider;
