// =============================================================
// booking-validation.ts
// Pre-flight validation that runs before the pricing engine.
// All date comparisons use a serverDate parameter so the
// caller (Edge Function / server route) supplies the current
// date from the server clock — never the client's device.
// =============================================================

export class BookingValidationError extends Error {
  readonly field: string
  constructor(field: string, message: string) {
    super(message)
    this.name  = 'BookingValidationError'
    this.field = field
  }
}

// Compares calendar dates only (no time component).
// dropoff_date and serverDate must both be YYYY-MM-DD strings.
export function validateBookingDates(
  dropoff_date: string,
  serverDate:   string,   // injected by the server — never trust client clock
): void {
  if (dropoff_date < serverDate) {
    throw new BookingValidationError(
      'dropoff_date',
      'Drop-off date cannot be in the past.',
    )
  }
}
