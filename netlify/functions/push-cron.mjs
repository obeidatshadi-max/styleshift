// Hourly trigger for the debrief reminders. The logic lives in the Next route so it shares the app's code and tests.
export default async () => {
  const base = process.env.URL
  const secret = process.env.CRON_SECRET
  if (!base || !secret) return
  await fetch(`${base}/api/push/send`, { method: 'POST', headers: { authorization: `Bearer ${secret}` } })
}

export const config = { schedule: '0 * * * *' }
