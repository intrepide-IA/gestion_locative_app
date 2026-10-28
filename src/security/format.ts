/** Temps restant avant `until` (horodatage en ms), lisible : « 30 s », « 2 min ». */
export function formatDelay(until: number, now: number = Date.now()): string {
  const seconds = Math.max(1, Math.ceil((until - now) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  return minutes % 60 ? `${heures} h ${minutes % 60} min` : `${heures} h`;
}
