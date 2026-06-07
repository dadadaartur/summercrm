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

  // Автоскролл к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  // Подписка на новые сообщения от оператора в реальном времени
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel('client_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          // Добавляем сообщение, только если его еще нет в стейте (защита от дублей при собственной отправке)
          setChatMessages(prev => {
            if (prev.find(m => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId])

  const startChat = async () => {
    if (!name.trim() || !message.trim()) return
    setSending(true)
    try {
      // 1. Создаём профиль клиента
      // ВНИМАНИЕ: Если в вашей БД стоит жесткая привязка profiles.user_id к auth.users, 
      // этот инсерт может выдать ошибку. В идеале для лидов лучше иметь отдельную таблицу `leads` 
      // или создавать анонимного пользователя через supabase.auth.signInAnonymously()
      const { data: newClient, error: clientError } = await supabase
        .from('profiles')
        .insert({
          email: `${name.toLowerCase().replace(/\s/g, '.')}@client.test`,
          display_name: name.trim(),
          role_id: 6,
          company_id: 1 // Тестовый ID компании
        })
        .select()
        .single()

      if (clientError) console.error('Ошибка создания клиента:', clientError)

      // 2. Автоматически создаём сделку (Замыкаем цепочку!)
      if (newClient) {
        await supabase.from('deals').insert({
          company_id: 1,
          title: `Новое обращение: ${name.trim()}`,
          client_name: name.trim(),
          description: message.trim(), // Сразу добавляем суть вопроса в сделку
          status: 'new',
          priority: 'medium',
          progress: 0 // Для новых сделок логичнее 0%
        })
      }

      // 3. Создаём чат-сессию
      const { data: session, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({
          company_id: 1,
          client_id: newClient?.user_id || null,
          status: 'active',
          subject: `Чат: ${name.trim()}`
        })
        .select()
        .single()

      if (sessionError) console.error('Ошибка создания сессии:', sessionError)

      if (session) {
        setSessionId(session.id)
        
        // 4. Отправляем первое сообщение
        await supabase.from('chat_messages').insert({
          session_id: session.id,
          sender_type: 'client',
          message: message.trim(),
          read_status: false
        })

        // Загружаем начальную историю (пока там только 1 сообщение)
        const { data: msgs } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('session_id', session.id)
          .order('created_at', { ascending: true })
          
        if (msgs) setChatMessages(msgs)
        
        setStep('chat')
        setMessage('') // Очищаем поле ввода для дальнейшего чата
      }
    } catch (err) {
      console.error('Непредвиденная ошибка:', err)
    } finally {
      setSending(false)
    }
  }

  const sendClientMessage = async () => {
    if (!message.trim() || !sessionId) return
    
    // Сразу добавляем сообщение оптимистично (для скорости UI)
    const tempMsg = {
      id: Date.now(), // временный ID
      session_id: sessionId,
      sender_type: 'client',
      message: message.trim(),
      created_at: new Date().toISOString()
    }
    setChatMessages(prev => [...prev, tempMsg])
    
    const msgToSend = message.trim()
    setMessage('') // Очищаем инпут

    // Отправляем в базу
    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      sender_type: 'client',
      message: msgToSend,
      read_status: false
    })
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', background: '#E8F4FD', height: '80vh', borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'Inter', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
      <Head><title>Тестовый чат клиента</title></Head>
      
      {/* Шапка чата */}
      <div style={{ background: '#4CAF6A', padding: '20px', color: 'white', textAlign: 'center', fontWeight: 600, fontSize: '18px' }}>
        Служба поддержки "Лето"
      </div>

      {step === 'form' && (
        <div style={{ padding: 32, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: 32, borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h2 style={{ color: '#2D6A4F', marginBottom: 24, fontSize: 20 }}>Напишите нам</h2>
            <input 
              style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #E5F0E8', marginBottom: 16, outline: 'none' }} 
              placeholder="Ваше имя" 
              value={name} 
              onChange={e => setName(e.target.value)} 
            />
            <textarea 
              style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #E5F0E8', marginBottom: 24, outline: 'none', resize: 'vertical' }} 
              rows={4} 
              placeholder="Опишите ваш вопрос" 
              value={message} 
              onChange={e => setMessage(e.target.value)} 
            />
            <button 
              onClick={startChat} 
              disabled={sending} 
              style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: '#4CAF6A', color: 'white', fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1 }}
            >
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
            <input 
              style={{ flex: 1, padding: '12px 16px', borderRadius: 24, border: '1px solid #E5F0E8', outline: 'none', background: '#F8FCF9' }}
              value={message} 
              onChange={e => setMessage(e.target.value)} 
              onKeyPress={e => e.key === 'Enter' && sendClientMessage()}
              placeholder="Введите сообщение..." 
            />
            <button 
              onClick={sendClientMessage}
              style={{ padding: '0 24px', borderRadius: 24, border: 'none', background: '#4CAF6A', color: 'white', fontWeight: 600, cursor: 'pointer' }}
            >
              Отправить
            </button>
          </div>
        </>
      )}
    </div>
  )
}
