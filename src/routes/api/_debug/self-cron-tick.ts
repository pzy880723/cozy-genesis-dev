import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/_debug/self-cron-tick')({
  server: {
    handlers: {
      POST: async () => {
        const secret = process.env.WORKER_SHARED_SECRET
        if (!secret) {
          return Response.json({ error: 'WORKER_SHARED_SECRET not set' }, { status: 500 })
        }
        const res = await fetch('https://cozy-genesis-dev.lovable.app/api/public/worker/cron-tick', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${secret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ worker_id: 'secret-check', max_batch: 1, platforms: ['__none__'] }),
        })
        const text = await res.text()
        let body: unknown
        try { body = JSON.parse(text) } catch { body = text }
        return Response.json({ status: res.status, body })
      },
    },
  },
})