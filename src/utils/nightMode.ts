/**
 * Evaluates whether a given date/time falls within the scheduled night mode window.
 * Supports schedules that cross midnight (e.g. 22:00 -> 07:00) as well as same-day windows (e.g. 01:00 -> 05:00).
 *
 * @param now Current Date object
 * @param startTime String in "HH:MM" format (24-hour)
 * @param endTime String in "HH:MM" format (24-hour)
 * @returns boolean
 */
export function isTimeInNightWindow(
  now: Date,
  startTime: string,
  endTime: string
): boolean {
  if (!startTime || !endTime) return false;

  const [startHour, startMin] = startTime.split(':').map((v) => parseInt(v, 10));
  const [endHour, endMin] = endTime.split(':').map((v) => parseInt(v, 10));

  if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
    return false;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  if (startMinutes === endMinutes) {
    return false;
  }

  if (startMinutes > endMinutes) {
    // Window crosses midnight, e.g. 22:00 (1320) -> 07:00 (420)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  } else {
    // Same-day window, e.g. 01:00 (60) -> 05:00 (300)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
}
