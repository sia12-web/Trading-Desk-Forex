import { startOfWeek, addDays, subDays, startOfDay, endOfDay, isBefore, isAfter, setHours, setMinutes, setSeconds } from 'date-fns'

/**
 * Get the market week range for a given date.
 * Market starts Sunday 5 PM EST (22:00 UTC)
 * Market ends Friday 5 PM EST (22:00 UTC)
 */
export function getMarketWeekRange(date: Date) {
    // We'll normalize to a "Trading Week" which starts Monday 00:00 and ends Friday 23:59
    // And include Sunday evening trades into Monday
    
    // For the purpose of the journal, we'll use Monday to Friday as the primary display days.
    // Sunday trades will be counted towards Monday.
    
    const mon = startOfWeek(date, { weekStartsOn: 1 })
    const fri = addDays(mon, 4)
    
    return {
        start: startOfDay(mon),
        end: endOfDay(fri),
        label: `${format(mon, 'MMM dd')} - ${format(fri, 'MMM dd, yyyy')}`
    }
}

import { format } from 'date-fns'

export function getWeekDisplayLabel(date: Date) {
    const mon = startOfWeek(date, { weekStartsOn: 1 })
    const fri = addDays(mon, 4)
    return {
        label: `Week ${format(date, 'I')}: ${format(mon, 'MMM dd')} - ${format(fri, 'MMM dd')}`,
        monday: mon,
        friday: fri
    }
}
