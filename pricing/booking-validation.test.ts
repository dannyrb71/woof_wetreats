// =============================================================
// booking-validation.test.ts
// Run with: npx ts-node booking-validation.test.ts
// =============================================================

import { validateBookingDates, BookingValidationError } from './booking-validation'

let passed = 0, failed = 0
const failures: string[] = []

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  ✓  ${name}`)
    passed++
  } catch (e: any) {
    console.log(`  ✗  ${name}: ${e.message}`)
    failures.push(name)
    failed++
  }
}

function assertPasses(dropoff: string, serverDate: string): void {
  validateBookingDates(dropoff, serverDate)  // must not throw
}

function assertRejects(dropoff: string, serverDate: string, expectedMsg?: string): void {
  try {
    validateBookingDates(dropoff, serverDate)
    throw new Error('Expected BookingValidationError but no error was thrown')
  } catch (e: any) {
    if (!(e instanceof BookingValidationError)) throw e
    if (expectedMsg && !e.message.includes(expectedMsg)) {
      throw new Error(`Expected message to include "${expectedMsg}", got: "${e.message}"`)
    }
  }
}

// =============================================================
// Tests
// =============================================================

const TODAY  = '2026-06-20'
const PAST   = '2026-06-19'
const FUTURE = '2026-06-21'

test('Past date is rejected', () => {
  assertRejects(PAST, TODAY, 'Drop-off date cannot be in the past')
})

test('Today (same-day booking) is allowed', () => {
  assertPasses(TODAY, TODAY)
})

test('Future date is allowed', () => {
  assertPasses(FUTURE, TODAY)
})

test('Error is a BookingValidationError with field=dropoff_date', () => {
  try {
    validateBookingDates(PAST, TODAY)
    throw new Error('Should have thrown')
  } catch (e: any) {
    if (!(e instanceof BookingValidationError)) throw new Error('Wrong error type')
    if (e.field !== 'dropoff_date') throw new Error(`Wrong field: ${e.field}`)
  }
})

test('Server date is used — client supplying a future clock cannot bypass the check', () => {
  // Simulate a client whose device clock shows tomorrow (FUTURE),
  // but the server date is still TODAY. A past dropoff is still rejected.
  const clientClockDate = FUTURE   // attacker sets device to tomorrow
  const serverDate      = TODAY    // server ignores client clock entirely
  void clientClockDate             // not passed to validateBookingDates
  assertRejects(PAST, serverDate, 'Drop-off date cannot be in the past')
})

test('Year boundary: Dec 31 is past when server date is Jan 1 next year', () => {
  assertRejects('2025-12-31', '2026-01-01')
})

test('Year boundary: Jan 1 future year is allowed', () => {
  assertPasses('2027-01-01', TODAY)
})

// =============================================================
// Summary
// =============================================================
console.log(`\n${'─'.repeat(50)}`)
console.log(`  ${passed + failed} tests   ${passed} passed   ${failed} failed`)
if (failures.length) {
  console.log(`\n  Failed:`)
  for (const f of failures) console.log(`    • ${f}`)
}
console.log(`${'─'.repeat(50)}`)
process.exit(failed > 0 ? 1 : 0)
