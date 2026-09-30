/**
 * How an event closed by hand on the payment monitor is marked. The transfer processor
 * looks for it, so a redelivery of a transfer somebody already credited by hand is not
 * credited a second time.
 */
export const SETTLED_BY_HAND_PREFIX = "Settled by hand by "
