const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://thdmpstmsmctsqcswenk.supabase.co',
  process.env.SUPABASE_ANON_KEY
)

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const { user_id, message } = req.body
  const assistant_id = 'asst_f8fQkfHZ4UbyjdrFhZ43br9W' // Susanne

  await supabase.from('conversations').insert([{ user_id, role: 'user', message }])

  const threadRes = await fetch('https://api.openai.com/v1/threads', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  })
  const { id: thread_id } = await threadRes.json()

  await fetch(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ role: 'user', content: message })
  })

  const runRes = await fetch(`https://api.openai.com/v1/threads/${thread_id}/runs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ assistant_id })
  })
  const { id: run_id } = await runRes.json()

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

  const messagesRes = await fetch(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    }
  })
  const { data } = await messagesRes.json()
  const reply = data[0].content[0].text.value

  await supabase.from('conversations').insert([{ user_id, role: 'assistant', message: reply }])

  res.status(200).json({ reply })
}
