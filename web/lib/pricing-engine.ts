// =============================================================
// pricing-engine.ts
// Standalone pricing module for dog boarding/daycare.
// No runtime dependencies — safe to import in Edge Functions,
// server code, or unit tests.
// =============================================================

export type PaymentMethod = 'cash' | 'venmo'
export type ServiceType   = 'boarding' | 'daycare'
export type RateType      = 'regular' | 'extended' | 'holiday' | 'daycare'

export interface DogInput {
  id:        string
  birthdate: string   // YYYY-MM-DD
}

export interface PricingInput {
  service_type:   ServiceType
  dropoff_date:   string        // YYYY-MM-DD
  pickup_date:    string        // YYYY-MM-DD (boarding: exclusive end; daycare: same as dropoff_date)
  dogs:           DogInput[]    // order matters — index 0 gets first-dog rate
  payment_method: PaymentMethod
}

export interface DogPeriodCost {
  dog_id:          string
  base_rate:       number
  puppy_surcharge: number
  subtotal:        number
}

export interface PeriodBreakdown {
  date:     string          // YYYY-MM-DD (night start date for boarding, booking date for daycare)
  type:     RateType
  dogs:     DogPeriodCost[]
  subtotal: number
}

export interface PricingResult {
  total:         number
  total_nights:  number     // 0 for daycare
  is_extended:   boolean    // false for daycare
  breakdown:     PeriodBreakdown[]
}

export class MaxStayExceededError extends Error {
  readonly nights: number
  constructor(nights: number) {
    super(
      `Stay of ${nights} nights exceeds the 14-night self-service maximum. ` +
      `Please contact us directly to arrange a longer stay.`
    )
    this.name   = 'MaxStayExceededError'
    this.nights = nights
  }
}

// =============================================================
// Business rules (NOT editable — these are logic, not dollar amounts)
// =============================================================
const EXTENDED_THRESHOLD  = 8

// =============================================================
// Rate table — all DOLLAR amounts are injected from the database
// (pricing_rates) at calculation time. No dollar values are hardcoded
// here. Venmo prices are always computed as cash + venmo_surcharge.
// =============================================================
export interface RateTable {
  regular_1st_cash:    number
  regular_extra_cash:  number
  extended_1st_cash:   number
  extended_extra_cash: number
  holiday_1st_cash:    number
  holiday_extra_cash:  number
  daycare_1st_cash:    number
  venmo_surcharge:     number   // added to every cash rate to get the Venmo price
  puppy_surcharge:     number   // per night, per puppy
}

// Cash base rate for a given night type + first/extra-dog position.
function cashBaseRate(rates: RateTable, type: RateType, isFirst: boolean): number {
  switch (type) {
    case 'regular':  return isFirst ? rates.regular_1st_cash  : rates.regular_extra_cash
    case 'extended': return isFirst ? rates.extended_1st_cash : rates.extended_extra_cash
    case 'holiday':  return isFirst ? rates.holiday_1st_cash  : rates.holiday_extra_cash
    case 'daycare':  return rates.daycare_1st_cash   // every daycare dog billed at this rate
  }
}

// Effective rate for a payment method: Venmo = cash + venmo_surcharge.
function effectiveRate(rates: RateTable, type: RateType, isFirst: boolean, pm: PaymentMethod): number {
  const cash = cashBaseRate(rates, type, isFirst)
  return pm === 'venmo' ? cash + rates.venmo_surcharge : cash
}

// =============================================================
// Date utilities
// All dates parsed as local (no UTC) to avoid DST/timezone drift.
// =============================================================
function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDate(d: Date): string {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

// A dog is a puppy if strictly under 1 year old on the given night date.
function isPuppy(birthdate: string, nightDate: string): boolean {
  const birth        = parseDate(birthdate)
  const night        = parseDate(nightDate)
  const firstBirthday = new Date(birth.getFullYear() + 1, birth.getMonth(), birth.getDate())
  return night < firstBirthday
}

// =============================================================
// Holiday calendar
// Returns the set of YYYY-MM-DD strings that are holiday nights
// for a given calendar year.
// =============================================================
function getHolidayDates(year: number): Set<string> {
  const dates = new Set<string>()

  // 1. New Year's: Dec 31 and Jan 1 (always exactly 2 nights)
  dates.add(`${year}-01-01`)
  dates.add(`${year}-12-31`)

  // 2. Presidents Day (3rd Mon in Feb), Memorial Day (last Mon in May),
  //    Labor Day (1st Mon in Sep) — all Mondays, always get Fri-Mon window
  addFriMonWindow(dates, nthWeekday(year, 2, 1, 3))   // Presidents Day
  addFriMonWindow(dates, lastWeekday(year, 5, 1))      // Memorial Day
  addFriMonWindow(dates, nthWeekday(year, 9, 1, 1))    // Labor Day

  // 3. July 4 and Veterans Day (Nov 11): fixed dates
  //    Tue/Wed/Thu → single night only; Fri/Sat/Sun/Mon → Fri-Mon window
  for (const fixedDate of [new Date(year, 6, 4), new Date(year, 10, 11)]) {
    const dow = fixedDate.getDay()
    if (dow === 2 || dow === 3 || dow === 4) {  // Tue / Wed / Thu
      dates.add(formatDate(fixedDate))
    } else {                                     // Fri / Sat / Sun / Mon
      addFriMonWindow(dates, fixedDate)
    }
  }

  // 4. Thanksgiving (4th Thu in Nov): always exactly Thu+Fri+Sat+Sun (4 nights)
  const thanksgiving = nthWeekday(year, 11, 4, 4)
  for (let i = 0; i < 4; i++) dates.add(formatDate(addDays(thanksgiving, i)))

  // 5. Christmas: always exactly Dec 24 and Dec 25 (2 nights)
  dates.add(`${year}-12-24`)
  dates.add(`${year}-12-25`)

  return dates
}

// Adds exactly 4 dates (Fri through Mon) anchored to the Fri-Mon window
// that contains the given holiday date. Only valid when the holiday is
// a Fri, Sat, Sun, or Mon.
function addFriMonWindow(dates: Set<string>, holiday: Date): void {
  const dow = holiday.getDay()  // 0=Sun 1=Mon … 5=Fri 6=Sat
  const offsetToFriday: Record<number, number> = { 5: 0, 6: -1, 0: -2, 1: -3 }
  const friday = addDays(holiday, offsetToFriday[dow])
  for (let i = 0; i < 4; i++) dates.add(formatDate(addDays(friday, i)))
}

// nth occurrence of weekday in year/month.
// month: 1-indexed. weekday: 0=Sun … 6=Sat.
function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
  const first    = new Date(year, month - 1, 1)
  const firstDow = first.getDay()
  let   diff     = weekday - firstDow
  if (diff < 0) diff += 7
  return new Date(year, month - 1, 1 + diff + (nth - 1) * 7)
}

// Last occurrence of weekday in year/month.
function lastWeekday(year: number, month: number, weekday: number): Date {
  const last    = new Date(year, month, 0)   // last day of month
  const lastDow = last.getDay()
  let   diff    = lastDow - weekday
  if (diff < 0) diff += 7
  return new Date(last.getFullYear(), last.getMonth(), last.getDate() - diff)
}

// Collects holiday dates for all calendar years spanned by the stay.
function buildHolidaySet(dropoff: string, pickup: string): Set<string> {
  const startYear = parseDate(dropoff).getFullYear()
  const endYear   = parseDate(pickup).getFullYear()
  const all       = new Set<string>()
  for (let y = startYear; y <= endYear; y++) {
    for (const d of getHolidayDates(y)) all.add(d)
  }
  return all
}

// Exported for calendar highlighting — returns every holiday date in the given
// year range (inclusive). Safe to call client-side; no I/O.
export function getHolidayDateRange(fromYmd: string, toYmd: string): Set<string> {
  return buildHolidaySet(fromYmd, toYmd)
}

// =============================================================
// Main pricing function
// =============================================================

export interface PricingOptions {
  // Staff edits bypass the 14-night self-service cap — the dog
  // is already there, the situation is real, and staff need to
  // be able to reprice without the engine throwing.
  skipMaxStayCheck?: boolean
}

export function calculatePrice(input: PricingInput, rates: RateTable, options: PricingOptions = {}): PricingResult {
  const { service_type, dropoff_date, pickup_date, dogs, payment_method } = input

  if (service_type === 'daycare') {
    return priceDaycare(dropoff_date, dogs, payment_method, rates)
  }

  const dropoff      = parseDate(dropoff_date)
  const pickup       = parseDate(pickup_date)
  const total_nights = diffDays(dropoff, pickup)

  // The former 14-night hard cap was removed (Batch 3). Long stays now price
  // normally on the regular/extended/holiday engine; the UI surfaces a
  // custom-flat-rate note and staff can override the total afterwards.
  // `options.skipMaxStayCheck` is retained for call-site compatibility but is
  // now a no-op.
  void options.skipMaxStayCheck

  const is_extended  = total_nights >= EXTENDED_THRESHOLD
  const holidaySet   = buildHolidaySet(dropoff_date, pickup_date)
  const breakdown:  PeriodBreakdown[] = []
  let   total = 0

  for (let n = 0; n < total_nights; n++) {
    const nightDate = formatDate(addDays(dropoff, n))
    const rateType: RateType = holidaySet.has(nightDate)
      ? 'holiday'
      : is_extended ? 'extended' : 'regular'

    const dogCosts = dogs.map((dog, idx): DogPeriodCost => {
      const isFirst   = idx === 0
      const baseRate  = effectiveRate(rates, rateType, isFirst, payment_method)
      const surcharge = isPuppy(dog.birthdate, nightDate) ? rates.puppy_surcharge : 0
      return { dog_id: dog.id, base_rate: baseRate, puppy_surcharge: surcharge, subtotal: baseRate + surcharge }
    })

    const nightTotal = dogCosts.reduce((s, d) => s + d.subtotal, 0)
    total += nightTotal
    breakdown.push({ date: nightDate, type: rateType, dogs: dogCosts, subtotal: nightTotal })
  }

  return { total, total_nights, is_extended, breakdown }
}

function priceDaycare(date: string, dogs: DogInput[], payment_method: PaymentMethod, rates: RateTable): PricingResult {
  const dogCosts = dogs.map((dog): DogPeriodCost => {
    const baseRate  = effectiveRate(rates, 'daycare', true, payment_method)  // every dog at the daycare rate
    const surcharge = isPuppy(dog.birthdate, date) ? rates.puppy_surcharge : 0
    return { dog_id: dog.id, base_rate: baseRate, puppy_surcharge: surcharge, subtotal: baseRate + surcharge }
  })

  const total = dogCosts.reduce((s, d) => s + d.subtotal, 0)
  return {
    total,
    total_nights: 0,
    is_extended:  false,
    breakdown: [{ date, type: 'daycare', dogs: dogCosts, subtotal: total }],
  }
}
