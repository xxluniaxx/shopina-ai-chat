const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://thdmpstmsmctsqcswenk.supabase.co',
  process.env.SUPABASE_ANON_KEY
)

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { user_id, message } = body
    const assistant_id = 'asst_f8fQkfHZ4UbyjdrFhZ43br9W' // Susanne

    if (!user_id || !message) {
      return res.status(400).json({ error: 'user_id en message zijn verplicht' })
    }

    // Voeg user-bericht toe aan Supabase
    await supabase.from('conversations').insert([{ user_id, role: 'user', message }])

    // Stap 1: Maak een nieuwe thread aan
    const threadRes = await fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    const threadData = await threadRes.json()
    if (!threadRes.ok || !threadData.id) {
      console.error('Fout bij aanmaken thread:', threadData)
      return res.status(500).json({ error: 'Kon geen AI-thread aanmaken.' })
    }

    const thread_id = threadData.id

    // Stap 2: Voeg het bericht toe aan de thread
    const messageRes = await fetch(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: 'user', content: message })
    })

    if (!messageRes.ok) {
      const err = await messageRes.json()
      console.error('Fout bij toevoegen bericht:', err)
      return res.status(500).json({ error: 'Bericht toevoegen aan AI-thread mislukt.' })
    }

    // Stap 3: Start de AI-run
    const runRes = await fetch(`https://api.openai.com/v1/threads/${thread_id}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ assistant_id })
    })

    const runData = await runRes.json()
    if (!runRes.ok || !runData.id) {
      console.error('Fout bij starten run:', runData)
      return res.status(500).json({ error: 'Kon AI-run niet starten.' })
    }

    const run_id = runData.id

    // Stap 4: Wacht op voltooiing
    let status = 'queued'
    let retries = 10
    while (status !== 'completed' && retries > 0) {
      const statusRes = await fetch(`https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      })

      const statusData = await statusRes.json()
      status = statusData.status
      if (status !== 'completed') {
        await new Promise(resolve => setTimeout(resolve, 1500))
        retries--
      }
    }

    if (status !== 'completed') {
      return res.status(500).json({ error: 'AI heeft geen antwoord gegeven binnen de tijd.' })
    }

    // Stap 5: Haal het antwoord op
    const messagesRes = await fetch(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    })

    const messagesData = await messagesRes.json()
    const reply = messagesData?.data?.[0]?.content?.[0]?.text?.value

    if (!reply) {
      console.error('Geen reply ontvangen:', messagesData)
      return res.status(500).json({ error: 'Geen antwoord ontvangen van AI.' })
    }

    // Sla het AI-antwoord op in Supabase
    await supabase.from('conversations').insert([{ user_id, role: 'assistant', message: reply }])

    return res.status(200).json({ reply })

  } catch (err) {
    console.error('Serverfout:', err)
    return res.status(500).json({ error: 'Interne serverfout.' })
  }
}
