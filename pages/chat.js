import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../lib/supabaseClient'

// Временные данные клиента (позже будут браться из параметров или контекста)
const MOCK_CLIENT = {
  id: 'client-uuid', // нужно заменить на реальный UUID клиента
  name: 'Иван Петров',
  phone: '+7 (999) 123-45-67',
  email: 'ivan@example.com',
  status: 'постоянный',
  priority: 'high'
}

export default function ChatPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsLogin, setNeedsLogin] = useState(false)

  // Состояния чата
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState(null)
  const [clientTyping, setClientTyping] = useState(false)
  const messagesEndRef = useRef(null)

  // Загрузка пользователя и создание/загрузка сессии чата
  useEffect(() => {
    const init = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) { setNeedsLogin(true); setLoading(false); return }
      setUser(currentUser)

      const { data: profileData } = await supabase
        .from('profiles')
        .select('first_name, last_name, company_id')
        .eq('user_id', currentUser.id)
        .single()

      if (!profileData?.company_id) { setNeedsLogin(true); setLoading(false); return }
      setProfile(profileData)

      // Найти или создать сессию чата с клиентом (пока используем мокового клиента)
      const { data: existingSessions } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('company_id', profileData.company_id)
        .eq('client_id', MOCK_CLIENT.id)
        .eq('operator_id', currentUser.id)
        .eq('status', 'active')
        .maybeSingle()

      if (existingSessions) {
        setSessionId(existingSessions.id)
        await loadMessages(existingSessions.id)
      } else {
        // Создаём новую сессию
        const { data: newSession, error } = await supabase
          .from('chat_sessions')
          .insert({
            company_id: profileData.company_id,
            client_id: MOCK_CLIENT.id,
            operator_id: currentUser.id,
            status: 'active',
            subject: 'Чат с ' + MOCK_CLIENT.name
          })
          .select()
          .single()
        if (!error && newSession) {
          setSessionId(newSession.id)
        }
      }

      setLoading(false)
    }
    init()
  }, [])

  // Загрузка сообщений сессии
  const loadMessages = async (sid) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sid)
      .order('created_at', { ascending: true })
      .limit(50)
    if (data) setMessages(data)
  }

  // Подписка на новые сообщения в реальном времени
  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel('chat-' + sessionId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId])

  // Автоскролл к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Отправка сообщения
  const sendMessage = async () => {
    if (!input.trim() || !sessionId || !user) return
    const { error } = await supabase.from('chat_messages').insert({
      session_id: sessionId,
      sender_id: user.id,
      sender_type: 'operator',
      message: input.trim(),
      read_status: false
    })
    if (!error) {
      setInput('')
    }
  }

  // Горячие клавиши
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Вставка шаблона
  const applyTemplate = (templateText) => {
    setInput(templateText)
  }

  // Действия (заглушки)
  const createDealFromChat = () => {
    alert('Создание сделки будет добавлено')
  }

  if (loading) {
    return (
      <div className="loading-leaf-container">
        <div className="loading-leaf"></div>
      </div>
    )
  }

  if (needsLogin) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#E8F4FD' }}>
        <div style={{ textAlign: 'center', background: 'white', padding: '48px', borderRadius: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h2 style={{ marginBottom: '16px', fontWeight: 600, color: '#2D6A4F' }}>Добро пожаловать в CRM Лето</h2>
          <p style={{ marginBottom: '24px', color: '#5B7465' }}>Для работы с чатом необходимо авторизоваться</p>
          <a href="https://arthurcrm.vercel.app/login" style={{ display: 'inline-block', background: '#4CAF6A', color: 'white', padding: '12px 32px', borderRadius: '14px', textDecoration: 'none', fontWeight: 500 }}>
            Войти в Кармический банк
          </a>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Чат — CRM Лето</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="crm-topbar">
        <a href="/" className="topbar-logo-link">
          <span className="back-arrow">←</span> CRM Лето
        </a>
        <div className="topbar-right">
          <a className="planet-link" href="/planet">Моя любимая планета Земля</a>
          <a href="/" className="topbar-name" style={{ textDecoration: 'none' }}>
            {profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : user?.email}
          </a>
        </div>
      </div>

      <div className="chat-container">
        {/* Левая панель */}
        <div className="chat-left-panel">
          <div className="chat-client-header">
            <div className="chat-client-avatar">
              {MOCK_CLIENT.name.charAt(0).toUpperCase()}
            </div>
            <div className="chat-client-info">
              <div className="chat-client-name">{MOCK_CLIENT.name}</div>
              <div className="chat-client-status">{MOCK_CLIENT.status}</div>
            </div>
          </div>

          <div className="chat-metrics">
            <div className="chat-metrics-item">
              <span>Телефон</span>
              <span>{MOCK_CLIENT.phone}</span>
            </div>
            <div className="chat-metrics-item">
              <span>Email</span>
              <span>{MOCK_CLIENT.email}</span>
            </div>
            <div className="chat-metrics-item">
              <span>Приоритет</span>
              <span className={`px-2 py-1 rounded-full text-white text-xs ${
                MOCK_CLIENT.priority === 'high' ? 'bg-[#F28B82]' :
                MOCK_CLIENT.priority === 'urgent' ? 'bg-[#EF4444]' : 'bg-[#7AC78F]'
              }`}>
                {MOCK_CLIENT.priority}
              </span>
            </div>
          </div>
        </div>

        {/* Центральная область */}
        <div className="chat-center-panel">
          <div className="chat-messages">
            {messages.map(msg => (
              <div key={msg.id} className={`chat-message ${msg.sender_type}`}>
                <div>{msg.message}</div>
                <div className="chat-message-time">
                  {new Date(msg.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
            {clientTyping && <div className="typing-indicator">...печатает</div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-bottom-panel">
            <input
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Напишите сообщение... (Ctrl+Enter для отправки)"
            />
            <button className="chat-send-btn" onClick={sendMessage}>
              Отправить
            </button>
          </div>
        </div>

        {/* Правая панель */}
        <div className="chat-right-panel">
          <div>
            <div className="chat-templates-title">Шаблоны</div>
            <button className="chat-template-btn" onClick={() => applyTemplate("Здравствуйте! Чем могу помочь?")}>
              Стандартное приветствие
            </button>
            <button className="chat-template-btn" onClick={() => applyTemplate("Уточните детали, пожалуйста.")}>
              Запрос уточнения
            </button>
            <button className="chat-template-btn" onClick={() => applyTemplate("Спасибо за обращение! Хорошего дня.")}>
              Прощание
            </button>
          </div>
          <div>
            <button className="chat-action-btn" onClick={createDealFromChat}>
              Создать сделку
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
