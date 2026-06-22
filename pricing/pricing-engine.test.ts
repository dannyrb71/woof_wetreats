// =============================================================
// pricing-engine.test.ts
// Run with: npx ts-node pricing-engine.test.ts
// =============================================================

import {
  calculatePrice as calculatePriceWithRates,
  MaxStayExceededError,
  type PricingInput,
  type PricingOptions,
  type RateType,
  type RateTable,
} from './pricing-engine'

// The exact rates seeded into pricing_rates (the current live/tested values).
// Injected so the engine has no hardcoded dollar amounts while these tests
// still validate the math against the known-good numbers.
const TEST_RATES: RateTable = {
  regular_1st_cash:    60,
  regular_extra_cash:  35,
  extended_1st_cash:   55,
  extended_extra_cash: 30,
  holiday_1st_cash:    75,
  holiday_extra_cash:  50,
  daycare_1st_cash:    40,
  venmo_surcharge:     5,
  puppy_surcharge:     10,
}

// Wrapper so every existing test call site stays unchanged.
function calculatePrice(input: PricingInput, options?: PricingOptions) {
  return calculatePriceWithRates(input, TEST_RATES, options)
}

// =============================================================
// Minimal test harness — no framework dependency
// =============================================================
let passed = 0
let failed = 0
const failures: string[] = []

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  ✓  ${name}`)
    passed++
  } catch (e: any) {
    console.log(`  ✗  ${name}`)
    console.log(`       ${e.message}`)
    failures.push(name)
    failed++
  }
}

function assertEqual<T>(actual: T, expected: T, label = ''): void {
  if (actual !== expected) {
    throw new Error(
      `${label ? label + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    )
  }
}

function assertThrows(fn: () => void, expectedClass: { new(...a: any[]): Error }, label = ''): void {
  let threw = false
  try { fn() } catch (e: any) {
    threw = true
    if (!(e instanceof expectedClass)) {
      throw new Error(
        `${label ? label + ': ' : ''}expected ${expectedClass.name} but got ${e.constructor?.name}: ${e.message}`
      )
    }
  }
  if (!threw) throw new Error(`${label || 'Expected throw'} — function did not throw`)
}

function section(name: string): void {
  console.log(`\n${name}`)
}

// =============================================================
// Helper: count nights of each type in a result
// =============================================================
function nightCounts(result: ReturnType<typeof calculatePrice>): Record<RateType, number> {
  const counts: Record<RateType, number> = { regular: 0, extended: 0, holiday: 0, daycare: 0 }
  for (const p of result.breakdown) counts[p.type]++
  return counts
}

// =============================================================
// Required test cases
// =============================================================

section('Required test cases')

test('Test 1 — July 4 2026 (Saturday): 3-night stay Jul 2–5, correct holiday window', () => {
  // July 4 2026 is Saturday → Fri-Mon window = Jul 3, 4, 5, 6
  // Nights: Jul 2 (Thu) = Regular, Jul 3 (Fri) = Holiday, Jul 4 (Sat) = Holiday
  const result = calculatePrice({
    service_type:   'boarding',
    dropoff_date:   '2026-07-02',
    pickup_date:    '2026-07-05',
    dogs:           [{ id: 'dog-a', birthdate: '2020-01-01' }],
    payment_method: 'cash',
  })
  const counts = nightCounts(result)
  assertEqual(result.total_nights, 3, 'total_nights')
  assertEqual(result.is_extended,  false, 'is_extended')
  assertEqual(counts.regular,  1, 'regular nights')
  assertEqual(counts.holiday,  2, 'holiday nights')
  assertEqual(counts.extended, 0, 'extended nights')
  // Confirm which specific nights are which type
  assertEqual(result.breakdown[0].date, '2026-07-02', 'night 1 date')
  assertEqual(result.breakdown[0].type, 'regular',    'night 1 type')
  assertEqual(result.breakdown[1].date, '2026-07-03', 'night 2 date')
  assertEqual(result.breakdown[1].type, 'holiday',    'night 2 type')
  assertEqual(result.breakdown[2].date, '2026-07-04', 'night 3 date')
  assertEqual(result.breakdown[2].type, 'holiday',    'night 3 type')
})

test('Test 2 — Thanksgiving 2026: 10-night stay = 4 holiday + 6 extended', () => {
  // Thanksgiving 2026 = Nov 26 (4th Thursday)
  // Holiday window: Nov 26, 27, 28, 29
  // Stay: Nov 20 – Nov 30 = 10 nights; is_extended (10 >= 8)
  // Holiday: Nov 26–29 (4 nights); Extended: Nov 20–25 + Nov 30 = 6 nights
  const result = calculatePrice({
    service_type:   'boarding',
    dropoff_date:   '2026-11-20',
    pickup_date:    '2026-11-30',
    dogs:           [{ id: 'dog-a', birthdate: '2020-01-01' }],
    payment_method: 'cash',
  })
  const counts = nightCounts(result)
  assertEqual(result.total_nights, 10,   'total_nights')
  assertEqual(result.is_extended,  true,  'is_extended')
  assertEqual(counts.holiday,  4, 'holiday nights')
  assertEqual(counts.extended, 6, 'extended nights')
  assertEqual(counts.regular,  0, 'no regular nights')
  // Spot-check: Nov 26 = holiday
  const nov26 = result.breakdown.find(n => n.date === '2026-11-26')
  assertEqual(nov26?.type, 'holiday', 'Nov 26 type')
  // Spot-check: Nov 25 = extended (not holiday, but stay is extended)
  const nov25 = result.breakdown.find(n => n.date === '2026-11-25')
  assertEqual(nov25?.type, 'extended', 'Nov 25 type')
})

test('Test 3 — Christmas: Dec 23–27, only Dec 24+25 are holiday (not Dec 26)', () => {
  const result = calculatePrice({
    service_type:   'boarding',
    dropoff_date:   '2026-12-23',
    pickup_date:    '2026-12-27',
    dogs:           [{ id: 'dog-a', birthdate: '2020-01-01' }],
    payment_method: 'cash',
  })
  const counts = nightCounts(result)
  assertEqual(result.total_nights, 4, 'total_nights')
  assertEqual(counts.holiday, 2, 'exactly 2 holiday nights')
  assertEqual(counts.regular, 2, 'exactly 2 regular nights')
  assertEqual(result.breakdown[0].type, 'regular', 'Dec 23 = regular')
  assertEqual(result.breakdown[1].type, 'holiday', 'Dec 24 = holiday')
  assertEqual(result.breakdown[2].type, 'holiday', 'Dec 25 = holiday')
  assertEqual(result.breakdown[3].type, 'regular', 'Dec 26 = regular (not holiday)')
})

test('Test 4 — 15-night stay throws MaxStayExceededError', () => {
  assertThrows(
    () => calculatePrice({
      service_type:   'boarding',
      dropoff_date:   '2026-01-01',
      pickup_date:    '2026-01-16',   // 15 nights
      dogs:           [{ id: 'dog-a', birthdate: '2020-01-01' }],
      payment_method: 'cash',
    }),
    MaxStayExceededError,
    '15-night stay',
  )
})

test('Test 4b — 14-night stay does NOT throw (boundary check)', () => {
  const result = calculatePrice({
    service_type:   'boarding',
    dropoff_date:   '2026-02-01',
    pickup_date:    '2026-02-15',   // exactly 14 nights
    dogs:           [{ id: 'dog-a', birthdate: '2020-01-01' }],
    payment_method: 'cash',
  })
  assertEqual(result.total_nights, 14, 'exactly 14 nights allowed')
})

test('Test 5 — 1 dog, 1 regular night, cash, no puppy = $60', () => {
  // Aug 10 2026 (Monday) — no holiday
  const result = calculatePrice({
    service_type:   'boarding',
    dropoff_date:   '2026-08-10',
    pickup_date:    '2026-08-11',
    dogs:           [{ id: 'dog-a', birthdate: '2020-01-01' }],
    payment_method: 'cash',
  })
  assertEqual(result.total, 60, 'total')
  assertEqual(result.breakdown[0].dogs[0].base_rate,       60, 'base rate')
  assertEqual(result.breakdown[0].dogs[0].puppy_surcharge,  0, 'no surcharge')
})

test('Test 6 — 2 dogs, 1 regular night, venmo, dog 1 is puppy = $115', () => {
  // Dog 1: born 2025-12-01 → puppy on 2026-08-10 (under 1 year)
  // Dog 1: first-dog venmo $65 + $10 puppy = $75
  // Dog 2: extra-dog venmo $40, not a puppy
  // Total: $115
  const result = calculatePrice({
    service_type:   'boarding',
    dropoff_date:   '2026-08-10',
    pickup_date:    '2026-08-11',
    dogs: [
      { id: 'dog-a', birthdate: '2025-12-01' },  // puppy
      { id: 'dog-b', birthdate: '2020-06-01' },  // adult
    ],
    payment_method: 'venmo',
  })
  const night = result.breakdown[0]
  assertEqual(night.dogs[0].base_rate,       65,  'dog 1 base (first, venmo)')
  assertEqual(night.dogs[0].puppy_surcharge, 10,  'dog 1 puppy surcharge')
  assertEqual(night.dogs[0].subtotal,        75,  'dog 1 subtotal')
  assertEqual(night.dogs[1].base_rate,       40,  'dog 2 base (extra, venmo)')
  assertEqual(night.dogs[1].puppy_surcharge,  0,  'dog 2 no surcharge')
  assertEqual(night.dogs[1].subtotal,        40,  'dog 2 subtotal')
  assertEqual(result.total,                 115,  'grand total')
})

test('Test 7 — daycare, 1 dog, cash = $40', () => {
  const result = calculatePrice({
    service_type:   'daycare',
    dropoff_date:   '2026-08-10',
    pickup_date:    '2026-08-10',
    dogs:           [{ id: 'dog-a', birthdate: '2020-01-01' }],
    payment_method: 'cash',
  })
  assertEqual(result.total,        40, 'total')
  assertEqual(result.total_nights,  0, 'no nights for daycare')
  assertEqual(result.breakdown[0].type, 'daycare', 'period type')
})

// =============================================================
// Additional edge-case tests
// =============================================================

section('Additional edge cases')

test('Puppy surcharge — dog is a puppy right up to its birthday, not after', () => {
  // Dog born 2025-08-10; first birthday 2026-08-10
  // Night of 2026-08-09 → still a puppy (surcharge applies)
  // Night of 2026-08-10 → no longer a puppy (no surcharge)
  const dayBefore = calculatePrice({
    service_type:   'boarding',
    dropoff_date:   '2026-08-09',
    pickup_date:    '2026-08-10',
    dogs:           [{ id: 'dog-a', birthdate: '2025-08-10' }],
    payment_method: 'cash',
  })
  assertEqual(dayBefore.breakdown[0].dogs[0].puppy_surcharge, 10, 'puppy day before birthday')

  const onBirthday = calculatePrice({
    service_type:   'boarding',
    dropoff_date:   '2026-08-10',
    pickup_date:    '2026-08-11',
    dogs:           [{ id: 'dog-a', birthdate: '2025-08-10' }],
    payment_method: 'cash',
  })
  assertEqual(onBirthday.breakdown[0].dogs[0].puppy_surcharge, 0, 'no surcharge on birthday')
})

test('Extended rate kicks in at exactly 8 nights, not 7', () => {
  const sevenNights = calculatePrice({
    service_type:   'boarding',
    dropoff_date:   '2026-08-01',
    pickup_date:    '2026-08-08',  // 7 nights
    dogs:           [{ id: 'dog-a', birthdate: '2020-01-01' }],
    payment_method: 'cash',
  })
  assertEqual(sevenNights.is_extended, false, '7 nights not extended')
  assertEqual(sevenNights.breakdown[0].dogs[0].base_rate, 60, '7-night regular rate $60')

  const eightNights = calculatePrice({
    service_type:   'boarding',
    dropoff_date:   '2026-08-01',
    pickup_date:    '2026-08-09',  // 8 nights
    dogs:           [{ id: 'dog-a', birthdate: '2020-01-01' }],
    payment_method: 'cash',
  })
  assertEqual(eightNights.is_extended, true, '8 nights is extended')
  assertEqual(eightNights.breakdown[0].dogs[0].base_rate, 55, '8-night extended rate $55')
})

test('New Year\'s Eve + Day are always holiday, regardless of day of week', () => {
  // Check 2026: Dec 31 is Thursday (not in any Fri-Mon window on its own merit)
  // but New Year's rule overrides → should still be holiday
  const result = calculatePrice({
    service_type:   'boarding',
    dropoff_date:   '2026-12-30',
    pickup_date:    '2027-01-03',
    dogs:           [{ id: 'dog-a', birthdate: '2020-01-01' }],
    payment_method: 'cash',
  })
  const dec31 = result.breakdown.find(n => n.date === '2026-12-31')
  const jan01 = result.breakdown.find(n => n.date === '2027-01-01')
  assertEqual(dec31?.type, 'holiday', 'Dec 31 = holiday')
  assertEqual(jan01?.type, 'holiday', 'Jan 1 = holiday')
  const dec30 = result.breakdown.find(n => n.date === '2026-12-30')
  assertEqual(dec30?.type, 'regular', 'Dec 30 = regular (New Year\'s is exactly 2 nights)')
})

test('Thanksgiving is exactly 4 nights (Thu–Sun), not Fri-Mon window', () => {
  // Thanksgiving 2026 = Nov 26 (Thu). Window: Nov 26–29 (Thu/Fri/Sat/Sun).
  // Nov 30 (Mon) must NOT be a holiday night.
  const result = calculatePrice({
    service_type:   'boarding',
    dropoff_date:   '2026-11-26',
    pickup_date:    '2026-11-30',
    dogs:           [{ id: 'dog-a', birthdate: '2020-01-01' }],
    payment_method: 'cash',
  })
  const counts = nightCounts(result)
  assertEqual(counts.holiday, 4, 'exactly 4 holiday nights')
  const nov29 = result.breakdown.find(n => n.date === '2026-11-29')
  assertEqual(nov29?.type, 'holiday', 'Nov 29 (Sun) = holiday')
})

test('Daycare puppy surcharge applies per dog', () => {
  const result = calculatePrice({
    service_type:   'daycare',
    dropoff_date:   '2026-08-10',
    pickup_date:    '2026-08-10',
    dogs: [
      { id: 'dog-a', birthdate: '2025-12-01' },  // puppy
      { id: 'dog-b', birthdate: '2020-01-01' },  // adult
    ],
    payment_method: 'venmo',
  })
  // Dog 1: $45 + $10 = $55. Dog 2: $45. Total: $100
  assertEqual(result.breakdown[0].dogs[0].subtotal, 55, 'puppy daycare subtotal')
  assertEqual(result.breakdown[0].dogs[1].subtotal, 45, 'adult daycare subtotal')
  assertEqual(result.total, 100, 'daycare total with 1 puppy venmo')
})

test('Labor Day 2026 (Sep 7, Monday) — Fri-Mon window = Sep 4–7', () => {
  // Sep 1 2026 is Tuesday; Labor Day = first Monday = Sep 7.
  // Fri-Mon window: Sep 4 (Fri) through Sep 7 (Mon).
  const result = calculatePrice({
    service_type:   'boarding',
    dropoff_date:   '2026-09-03',
    pickup_date:    '2026-09-08',
    dogs:           [{ id: 'dog-a', birthdate: '2020-01-01' }],
    payment_method: 'cash',
  })
  const counts = nightCounts(result)
  const sep03 = result.breakdown.find(n => n.date === '2026-09-03')
  const sep04 = result.breakdown.find(n => n.date === '2026-09-04')
  const sep07 = result.breakdown.find(n => n.date === '2026-09-07')
  assertEqual(sep03?.type, 'regular', 'Sep 3 (Thu before window) = regular')
  assertEqual(sep04?.type, 'holiday', 'Sep 4 (Fri) = holiday')
  assertEqual(sep07?.type, 'holiday', 'Sep 7 (Mon, Labor Day) = holiday')
  assertEqual(counts.holiday, 4, '4 holiday nights in window')
})

test('MaxStayExceededError carries the night count', () => {
  try {
    calculatePrice({
      service_type:   'boarding',
      dropoff_date:   '2026-01-01',
      pickup_date:    '2026-02-01',  // 31 nights
      dogs:           [{ id: 'dog-a', birthdate: '2020-01-01' }],
      payment_method: 'cash',
    })
    throw new Error('should have thrown')
  } catch (e: any) {
    if (!(e instanceof MaxStayExceededError)) throw e
    assertEqual(e.nights, 31, 'error.nights')
  }
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
