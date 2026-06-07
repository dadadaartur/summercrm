import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabaseClient'

export default function ClientChat() {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [step, setStep] = useState('form')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)
  const [anonymousUser, setAnonymousUser] = useState(null)

  // Автоматический анонимный вход
  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error) {
        console.error('Не удалось выполнить анонимный вход:', error)
      } else if (data?.user) {
        setAnonymousUser(data.user)
      }
    }
    init()
  }, [])

  // Автоскролл
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  // Подписка на новые сообщения
  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel('client_messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setChatMessages(prev => {
            if (prev.find(m => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  const startChat = async () => {
    if (!name.trim() || !message.trim() || !anonymousUser) return
    setSending(true)
    try {
      const userId = anonymousUser.id

      // Проверяем, существует ли профиль, и создаём только при отсутствии
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (!existingProfile) {
        const { error: profileError } = await supabase.from('profiles').insert({
          user_id: userId,
          email: `${name.toLowerCase().replace(/\s/g, '.')}@client.test`,
          display_name: name.trim(),
          role_id: 6,
          company_id: 1 // замени на ID своей компании, если не 1
        })
        if (profileError) {
          console.warn('Ошибка создания профиля:', profileError)
        }
      }

      // Создаём сделку
      const { data: newDeal, error: dealError } = await supabase
        .from('deals')
        .insert({
          company_id: 1,
          title: `Новое обращение: ${name.trim()}`,
          client_name: name.trim(),
          description: message.trim(),
          status: 'new',
          priority: 'medium',
          progress: 0,
          responsible_user_id: userId
        })
        .select()
        .single()
      if (dealError) throw dealError

      // Создаём чат-сессию
      const { data: session, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({
          company_id: 1,
          client_id: userId,
          deal_id: newDeal.id,
          status: 'active',
          subject: `Чат: ${name.trim()}`
        })
        .select()
        .single()
      if (sessionError) throw sessionError

      // Отправляем первое сообщение (оптимистично)
      setSessionId(session.id)
      const firstMsg = {
        id: Date.now(),
        session_id: session.id,
        sender_type: 'client',
        message: message.trim(),
        created_at: new Date().toISOString()
      }
      setChatMessages([firstMsg])
      await supabase.from('chat_messages').insert({
        session_id: session.id,
        sender_type: 'client',
        message: message.trim(),
        read_status: false
      })

      setStep('chat')
      setMessage('')
    } catch (err) {
      console.error('Ошибка создания чата:', err)
      alert('Произошла ошибка, попробуйте позже')
    } finally {
      setSending(false)
    }
  }

  const sendClientMessage = async () => {
    if (!message.trim() || !sessionId) return

    const textToSend = message.trim()
    setMessage('')

    const temporaryMessage = {
      id: Date.now(),
      session_id: sessionId,
      sender_type: 'client',
      message: textToSend,
      created_at: new Date().toISOString()
    }
    setChatMessages(prev => [...prev, temporaryMessage])

    try {
      const { error } = await supabase.from('chat_messages').insert({
        session_id: sessionId,
        sender_type: 'client',
        message: textToSend,
        read_status: false
      })
      if (error) console.error('Ошибка при отправке в БД:', error)
    } catch (err) {
      console.error('Непредвиденная ошибка отправки:', err)
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', background: '#E8F4FD', height: '80vh', borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'Inter', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
      <Head><title>Тестовый чат клиента</title></Head>
      <div style={{ background: '#4CAF6A', padding: '20px', color: 'white', textAlign: 'center', fontWeight: 600, fontSize: '18px' }}>
        Служба поддержки "Лето"
      </div>
      {step === 'form' && (
        <div style={{ padding: 32, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: 32, borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h2 style={{ color: '#2D6A4F', marginBottom: 24, fontSize: 20 }}>Напишите нам</h2>
            <input style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #E5F0E8', marginBottom: 16, outline: 'none' }} placeholder="Ваше имя" value={name} onChange={e => setName(e.target.value)} />
            <textarea style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #E5F0E8', marginBottom: 24, outline: 'none', resize: 'vertical' }} rows={4} placeholder="Опишите ваш вопрос" value={message} onChange={e => setMessage(e.target.value)} />
            <button onClick={startChat} disabled={sending || !anonymousUser} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: '#4CAF6A', color: 'white', fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer', opacity: sending || !anonymousUser ? 0.7 : 1 }}>
              {sending ? 'Отправка...' : 'Начать чат'}
            </button>
          </div>
        </div>
      )}
      {step === 'chat' && (
        <>
          <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', background: '#F8FCF9' }}>
            {chatMessages.map(msg => {
              const isClient = msg.sender_type === 'client'
              return (
                <div key={msg.id} style={{
                  maxWidth: '75%',
                  padding: '12px 16px',
                  borderRadius: '16px',
                  borderBottomRightRadius: isClient ? 4 : 16,
                  borderBottomLeftRadius: !isClient ? 4 : 16,
                  marginBottom: 12,
                  alignSelf: isClient ? 'flex-end' : 'flex-start',
                  background: isClient ? '#4CAF6A' : 'white',
                  color: isClient ? 'white' : '#1F2E23',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                  lineHeight: '1.4'
                }}>
                  {msg.message}
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
          <div style={{ padding: '16px 24px', background: 'white', borderTop: '1px solid #E5F0E8', display: 'flex', gap: 12 }}>
            <input style={{ flex: 1, padding: '12px 16px', borderRadius: 24, border: '1px solid #E5F0E8', outline: 'none', background: '#F8FCF9' }} value={message} onChange={e => setMessage(e.target.value)} onKeyPress={e => e.key === 'Enter' && sendClientMessage()} placeholder="Введите сообщение..." />
            <button onClick={sendClientMessage} style={{ padding: '0 24px', borderRadius: 24, border: 'none', background: '#4CAF6A', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Отправить</button>
          </div>
        </>
      )}
    </div>
  )
}
