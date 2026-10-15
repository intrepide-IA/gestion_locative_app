/** Temps restant avant `until` (horodatage en ms), lisible : « 30 s », « 2 min ». */
export function formatDelay(until: number, now: number = Date.now()): string {
  const seconds = Math.max(1, Math.ceil((until - now) / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.ceil(seconds / 60)} min`;
}
