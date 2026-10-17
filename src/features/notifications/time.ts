/** "11:30:00" ± minuti → "11:45:00" (il giro dopo mezzanotte riparte da 00:00). */
export function shiftTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}:00`;
}
