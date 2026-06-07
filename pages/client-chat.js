import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../utils/supabaseClient'

// Системная настройка вашей компании (чтобы не хардкодить единицу внутри функций)
const DEFAULT_COMPANY_ID = 1

export default function ClientChat() {
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState(null)
  
  const chatEndRef = useRef(null)
  const broadcastChannelRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  // Прокрутка чата вниз
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Авторизация анонимного пользователя при первой загрузке
  useEffect(() => {
    async function initClient() {
      const { data: { session } } = await supabase.auth.getSession()
      let currentUserId = session?.user?.id

      if (!currentUserId) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) {
          console.error('Ошибка анонимного входа:', error.message)
          return
        }
        currentUserId = data.user?.id
      }
      
      setUserId(currentUserId)

      // Проверяем, нет ли уже созданного профиля для этого анонима
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', currentUserId)
        .single()

      if (!profile) {
        await supabase.from('profiles').insert({
          id: currentUserId,
          role_id: 6, // Роль клиента
          email: `client_${Date.now()}@summer-crm.test`,
          full_name: 'Летний Гость'
        })
      }

      // Ищем, нет ли у этого пользователя уже активной сессии чата
      const { data: activeSession } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('client_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (activeSession) {
        setSessionId(activeSession.id)
        loadMessages(activeSession.id)
      }
    }
    initClient()
  }, [])

  // Подписка на сообщения в реальном времени и инициализация канала для статуса печати
  useEffect(() => {
    if (!sessionId) return

    // 1. Подписка на новые сообщения в базе данных (Postgres Changes)
    const msgChannel = supabase.channel(`client-msg-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setMessages((prev) => {
            // Защита от дублей по ID сообщения
            if (prev.some(m => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
        }
      )
      .subscribe()

    // 2. Инициализация Broadcast-канала для отправки сигнала "Печатает..."
    broadcastChannelRef.current = supabase.channel(`chat-broadcast-${sessionId}`).subscribe()

    return () => {
      supabase.removeChannel(msgChannel)
      if (broadcastChannelRef.current) {
        supabase.removeChannel(broadcastChannelRef.current)
      }
    }
  }, [sessionId])

  // Загрузка истории сообщений
  async function loadMessages(sid) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sid)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setMessages(data)
    }
  }

  // Обработчик ввода текста (уведомляет оператора, что клиент печатает)
  const handleInputChange = (e) => {
    setInputValue(e.target.value)

    if (broadcastChannelRef.current) {
      // Отправляем сигнал оператору
      broadcastChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { isTyping: true }
      })

      // Сбрасываем таймер "затишья". Если клиент не нажимает клавиши 1.5 секунды — сигнал отключится
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        broadcastChannelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { isTyping: false }
        })
      }, 1500)
    }
  }

  // Создание чата при первом сообщении
  async function startChat(firstText) {
    setLoading(true)

    // 1. Создаем сделку (Поле responsible_user_id теперь пустует, клиент пишется в client_id)
    const { data: deal, error: dErr } = await supabase
      .from('deals')
      .insert({
        company_id: DEFAULT_COMPANY_ID,
        title: 'Обращение с сайта (Лето)',
        status: 'new',
        budget: 0,
        client_id: userId,
        responsible_user_id: null 
      })
      .select()
      .single()

    if (dErr) {
      console.error('Ошибка создания сделки:', dErr.message)
      setLoading(false)
      return
    }

    // 2. Создаем сессию чата
    const { data: session, error: sErr } = await supabase
      .from('chat_sessions')
      .insert({
        company_id: DEFAULT_COMPANY_ID,
        client_id: userId,
        deal_id: deal.id
      })
      .select()
      .single()

    if (sErr) {
      console.error('Ошибка создания сессии:', sErr.message)
      setLoading(false)
      return
    }

    setSessionId(session.id)

    // 3. Отправляем сообщение в базу. setChatMessages вручную НЕ делаем, 
    // сообщение само прилетит через подписку Postgres Changes, предотвращая дубли!
    await supabase.from('chat_messages').insert({
      session_id: session.id,
      sender_id: userId,
      sender_role: 'client',
      message_text: firstText
    })

    setLoading(false)
  }

  // Отправка обычного последующего сообщения
  async function sendMessage() {
    const text = inputValue.trim()
    if (!text) return

    setInputValue('')
    
    // Сразу принудительно гасим статус "печатает" после нажатия Enter/кнопки
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    broadcastChannelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { isTyping: false }
    })

    if (!sessionId) {
      await startChat(text)
    } else {
      await supabase.from('chat_messages').insert({
        session_id: sessionId,
        sender_id: userId,
        sender_role: 'client',
        message_text: text
      })
    }
  }

  return (
    <div className="chat-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="chat-center-panel" style={{ maxWidth: '600px', width: '100%', height: '90vh', borderRadius: '24px', boxShadow: '0 12px 40px rgba(0,0,0,0.08)', overflow: 'hidden', border: '1px solid #B7E4C7' }}>
        
        {/* Шапка чата клиента */}
        <div style={{ padding: '20px', background: 'white', borderBottom: '1px solid #B7E4C7', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="chat-client-avatar">☀️</div>
          <div>
            <div className="chat-client-name">Поддержка Летнего CRM</div>
            <div style={{ fontSize: '13px', color: '#10B981', fontWeight: '600' }}>Онлайн • Отвечаем моментально</div>
          </div>
        </div>

        {/* Область сообщений */}
        <div className="chat-messages">
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#40916C', marginTop: '40px', fontSize: '14px', fontWeight: '500' }}>
              👋 Напишите нам! Наш летний оператор сразу подключится к диалогу.
            </div>
          )}
          {messages.map((m) => {
            const isClient = m.sender_role === 'client'
            return (
              <div key={m.id || m.created_at} className={`chat-message ${isClient ? 'client' : 'operator'}`}>
                <div>{m.message_text}</div>
                <div className="chat-message-time">
                  {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'сейчас'}
                </div>
              </div>
            )
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Панель ввода */}
        <div className="chat-bottom-panel">
          <input
            type="text"
            className="chat-input"
            placeholder="Задайте ваш летний вопрос..."
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            disabled={loading}
          />
          <button 
            className="chat-send-btn" 
            onClick={sendMessage}
            disabled={loading || !inputValue.trim()}
          >
            {loading ? '...' : 'Ракета'}
          </button>
        </div>

      </div>
    </div>
  )
}
