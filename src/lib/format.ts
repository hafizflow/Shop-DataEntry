const dhakaParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true,
});
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }); // YYYY-MM-DD
const priceFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatDhaka(iso: string): string {
  const p = Object.fromEntries(dhakaParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`;
}
export function dhakaDayKey(d: Date | string): string {
  return dayFmt.format(typeof d === 'string' ? new Date(d) : d);
}
export const formatPrice = (n: number) => priceFmt.format(n);
