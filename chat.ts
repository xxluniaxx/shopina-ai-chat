// /api/chat.ts
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()

const supabase = createClient(
  'https://thdmpstmsmctsqcswenk.supabase.co', // Jouw Supabase project URL
  process.env.SUPABASE_ANON_KEY               // Environment variable voor je anon key
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { user_id, message } = req.body
  const assistant_id = 'asst_f8fQkfHZ4UbyjdrFhZ43br9W' // Susanne

  // 1. Sla user message op in Supabase
  await supabase.from('conversations').insert([
    { user_id, role: 'user', message }
  ])

  // 2. Start nieuwe thread bij OpenAI
  const threadRes = await fetch('https://api.openai.com/v1/threads', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  })
  const { id: thread_id } = await threadRes.json()

  // 3. Voeg user message toe aan thread
  await fetch(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ role: 'user', content: message })
  })

  // 4. Start een run van Susanne
  const runRes = await fetch(`https://api.openai.com/v1/threads/${thread_id}/runs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ assistant_id })
  })
  const { id: run_id } = await runRes.json()

  // 5. Wacht tot Susanne klaar is
  let status = 'queued'
  while (status !== 'completed') {
    const runStatus = await fetch(`https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      }
    })
    const data = await runStatus.json()
    status = data.status
    if (status !== 'completed') await new Promise(r => setTimeout(r, 1500))
  }

  // 6. Haal laatste bericht op
  const messagesRes = await fetch(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    }
  })
  const { data } = await messagesRes.json()
  const reply = data[0].content[0].text.value

  // 7. Sla AI-response op in Supabase
  await supabase.from('conversations').insert([
    { user_id, role: 'assistant', message: reply }
  ])

  // 8. Stuur antwoord terug naar frontend
  res.status(200).json({ reply })
}
