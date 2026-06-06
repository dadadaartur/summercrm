import { useState } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabaseClient'

export default function ClientChat() {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [step, setStep] = useState('form')
  const [sending, setSending] = useState(false)

  const startChat = async () => {
    if (!name.trim() || !message.trim()) return
    setSending(true)
    try {
      // Создаём профиль клиента
      const { data: newClient } = await supabase.from('profiles').insert({
        email: `${name.toLowerCase().replace(/\s/g, '.')}@client.test`,
        display_name: name.trim(),
        role_id: 6,
        company_id: 1  // замените на ID вашей компании
      }).select().single()

      if (newClient) {
        // Создаём сделку
        await supabase.from('deals').insert({
          company_id: 1,
          title: `Сделка с ${name.trim()}`,
          client_name: name.trim(),
          status: 'new',
          priority: 'medium',
          progress: 10
        })
      }

      // Создаём чат-сессию
      const { data: session } = await supabase.from('chat_sessions').insert({
        company_id: 1,
        client_id: newClient?.user_id || null,
        operator_id: null,
        status: 'active',
        subject: `Чат с ${name.trim()}`
      }).select().single()

      if (session) {
        setSessionId(session.id)
        // Отправляем первое сообщение
        await supabase.from('chat_messages').insert({
          session_id: session.id,
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
                maxWidth: '70%',
                padding: '8px 14px',
                borderRadius: 14,
                marginBottom: 8,
                alignSelf: msg.sender_type === 'client' ? 'flex-start' : 'flex-end',
                background: msg.sender_type === 'client' ? '#4CAF6A' : '#F2F9F4',
                color: msg.sender_type === 'client' ? 'white' : '#1F2E23'
              }}>
                {msg.message}
              </div>
            ))}
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
