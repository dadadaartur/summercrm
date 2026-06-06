import { useState, useEffect } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabaseClient'

export default function ClientChat() {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [step, setStep] = useState('form')
  const [sending, setSending] = useState(false)
  const [rating, setRating] = useState(0)
  const [ratingSubmitted, setRatingSubmitted] = useState(false)

  const startChat = async () => {
    if (!name.trim() || !message.trim()) return
    setSending(true)
    try {
      const clientName = name.trim()
      const { data: newClient } = await supabase.from('profiles').insert({
        email: `${clientName.toLowerCase().replace(/\s/g, '.')}@client.test`,
        display_name: clientName,
        role_id: 6,
        company_id: 1
      }).select().single()

      if (newClient) {
        await supabase.from('deals').insert({
          company_id: 1,
          title: `Сделка с ${clientName}`,
          client_name: clientName,
          status: 'new',
          priority: 'medium',
          progress: 10
        })
      }

      const { data: session } = await supabase.from('chat_sessions').insert({
        company_id: 1,
        client_id: newClient?.user_id || null,
        operator_id: null,
        status: 'active',
        subject: `Чат с ${clientName}`
      }).select().single()

      if (session) {
        setSessionId(session.id)
        await supabase.from('chat_messages').insert({
          session_id: session.id,
          sender_id: newClient?.user_id,
          sender_type: 'client',
          message: message.trim(),
          read_status: false
        })
        const { data: msgs } = await supabase.from('chat_messages').select('*').eq('session_id', session.id).order('created_at', { ascending: true })
        if (msgs) setChatMessages(msgs)
        setStep('chat')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  const sendClientMessage = async () => {
    if (!message.trim() || !sessionId) return
    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      sender_type: 'client',
      message: message.trim(),
      read_status: false
    })
    const { data: msgs } = await supabase.from('chat_messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })
    if (msgs) setChatMessages(msgs)
    setMessage('')
  }

  const submitRating = async (stars) => {
    if (ratingSubmitted || !sessionId) return
    await supabase.from('chat_ratings').insert({
      session_id: sessionId,
      rating: stars
    })
    setRating(stars)
    setRatingSubmitted(true)
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', background: '#E8F4FD', minHeight: '100vh', fontFamily: 'Inter' }}>
      <Head><title>Тестовый чат клиента</title></Head>
      {step === 'form' && (
        <div style={{ padding: 24, background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h2 style={{ color: '#2D6A4F', marginBottom: 16 }}>Обращение в компанию</h2>
          <input className="input-field" placeholder="Ваше имя" value={name} onChange={e => setName(e.target.value)} style={{ marginBottom: 12 }} />
          <textarea className="input-field" rows={3} placeholder="Опишите ваш вопрос" value={message} onChange={e => setMessage(e.target.value)} style={{ marginBottom: 12 }} />
          <button className="action-btn primary" onClick={startChat} disabled={sending} style={{ width: '100%' }}>
            {sending ? 'Отправка...' : 'Отправить'}
          </button>
        </div>
      )}
      {step === 'chat' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
            {chatMessages.map(msg => (
              <div key={msg.id} style={{
                maxWidth: '70%', padding: '8px 14px', borderRadius: 14, marginBottom: 8,
                alignSelf: msg.sender_type === 'client' ? 'flex-start' : 'flex-end',
                background: msg.sender_type === 'client' ? '#4CAF6A' : '#F2F9F4',
                color: msg.sender_type === 'client' ? 'white' : '#1F2E23'
              }}>
                {msg.message}
              </div>
            ))}
            {!ratingSubmitted && chatMessages.length >= 3 && (
              <div style={{ marginTop: 16, padding: 12, background: 'white', borderRadius: 12, textAlign: 'center' }}>
                <p style={{ marginBottom: 8, color: '#2D6A4F', fontSize: 14 }}>Оцените работу оператора</p>
                <div className="rating-stars" style={{ justifyContent: 'center' }}>
                  {[1,2,3,4,5].map(star => (
                    <span key={star} className={`star ${star <= rating ? 'filled' : ''}`} onClick={() => submitRating(star)}>
                      ★
                    </span>
                  ))}
                </div>
              </div>
            )}
            {ratingSubmitted && (
              <div style={{ textAlign: 'center', color: '#4CAF6A', marginTop: 12 }}>Спасибо за оценку!</div>
            )}
          </div>
          <div style={{ padding: 12, background: 'white', borderTop: '1px solid #E5F0E8', display: 'flex', gap: 8 }}>
            <input className="chat-input" value={message} onChange={e => setMessage(e.target.value)} placeholder="Введите сообщение..." />
            <button className="chat-send-btn" onClick={sendClientMessage}>Отправить</button>
          </div>
        </div>
      )}
    </div>
  )
}
