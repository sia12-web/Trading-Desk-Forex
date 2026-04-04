/**
 * Calendar & Trading Day Checker
 *
 * Validates if tomorrow is a trading day (not weekend or public holiday)
 */

import { createClient } from '@/lib/supabase/server'

export interface TradingDayStatus {
  isTradingDay: boolean
  reason?: string
  nextTradingDay?: string
  dayOfWeek: string
}

/**
 * Check if tomorrow is a valid trading day
 */
export async function checkTomorrowTradingDay(): Promise<TradingDayStatus> {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  const dayOfWeek = tomorrow.toLocaleDateString('en-US', { weekday: 'long' })
  const tomorrowDateString = tomorrow.toISOString().split('T')[0]

  // Check if weekend (Saturday = 6, Sunday = 0)
  const dayNum = tomorrow.getDay()
  if (dayNum === 0 || dayNum === 6) {
    // Find next Monday
    const daysUntilMonday = dayNum === 0 ? 1 : 2
    const nextMonday = new Date(tomorrow)
    nextMonday.setDate(nextMonday.getDate() + daysUntilMonday)

    return {
      isTradingDay: false,
      reason: `Weekend - ${dayOfWeek}. Forex markets are closed.`,
      nextTradingDay: nextMonday.toISOString().split('T')[0],
      dayOfWeek
    }
  }

  // Check for public holidays
  try {
    const client = await createClient()

    const { data: holidays } = await client
      .from('calendar_events')
      .select('title, event_type, impact')
      .eq('date', tomorrowDateString)
      .in('event_type', ['holiday', 'market_close'])

    if (holidays && holidays.length > 0) {
      const holiday = holidays[0]

      // Major holidays that close forex markets (New Year, Christmas, etc.)
      const majorHolidays = [
        'New Year',
        'Christmas',
        'Good Friday',
        'Easter Monday'
      ]

      const isMajorHoliday = majorHolidays.some(h =>
        holiday.title.toLowerCase().includes(h.toLowerCase())
      )

      if (isMajorHoliday || holiday.impact === 'high') {
        // Find next trading day
        const nextDay = new Date(tomorrow)
        nextDay.setDate(nextDay.getDate() + 1)

        return {
          isTradingDay: false,
          reason: `Public Holiday - ${holiday.title}. Markets may have reduced hours or be closed.`,
          nextTradingDay: nextDay.toISOString().split('T')[0],
          dayOfWeek
        }
      }
    }

    // It's a regular trading day
    return {
      isTradingDay: true,
      dayOfWeek
    }
  } catch (error) {
    console.error('[CalendarChecker] Error checking holidays:', error)

    // If calendar check fails, assume it's a trading day (safer)
    return {
      isTradingDay: true,
      dayOfWeek
    }
  }
}

/**
 * Get a human-readable message about tomorrow's trading status
 */
export function getTradingDayMessage(status: TradingDayStatus): string {
  if (!status.isTradingDay) {
    return `⚠️ Tomorrow is ${status.dayOfWeek} - ${status.reason} Next trading day: ${new Date(status.nextTradingDay!).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`
  }

  return `✓ Tomorrow (${status.dayOfWeek}) is a trading day`
}
