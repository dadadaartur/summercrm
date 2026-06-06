import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../lib/supabaseClient'

// Заглушка клиента, если не передан clientId в URL
const DEFAULT_CLIENT = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Клиент',
  phone: '',
  email: '',
  status: 'новый',
  priority: 'medium'
}

// Простейшая санитизация текста (удаление HTML-тегов)
function sanitize(text) {
  return text.replace(/<[^>]*>/g, '')
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
  const [client, setClient] = useState(DEFAULT_CLIENT)
  const [clientTyping, setClientTyping] = useState(false)
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [notification, setNotification] = useState({ show: false, message: '' })
  const messagesEndRef = useRef(null)
  const messagesStartRef = useRef(null) // для скролла при подгрузке старых

  // Отобразить уведомление на 3 секунды
  const showNotification = (msg) => {
    setNotification({ show: true, message: msg })
    setTimeout(() => setNotification({ show: false, message: '' }), 3000)
  }

  // Загрузка профиля и инициализация сессии
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

      // Определяем клиента: из URL или заглушка
      const clientId = router.query.clientId
      let clientData = DEFAULT_CLIENT
      if (clientId) {
        const { data: clientProfile } = await supabase
          .from('profiles')
          .select('user_id, email, display_name')
          .eq('user_id', clientId)
          .maybeSingle()
        if (clientProfile) {
          clientData = {
            id: clientProfile.user_id,
            name: clientProfile.display_name || clientProfile.email,
            phone: '',
            email: clientProfile.email,
            status: 'постоянный',
            priority: 'medium'
          }
        }
      }
      setClient(clientData)

      // Создаём или находим активную сессию с этим клиентом
      const { data: existingSessions } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('company_id', profileData.company_id)
        .eq('client_id', clientData.id)
        .eq('operator_id', currentUser.id)
        .eq('status', 'active')
        .maybeSingle()

      if (existingSessions) {
        setSessionId(existingSessions.id)
        await loadMessages(existingSessions.id)
      } else {
        const { data: newSession, error } = await supabase
          .from('chat_sessions')
          .insert({
            company_id: profileData.company_id,
            client_id: clientData.id,
            operator_id: currentUser.id,
            status: 'active',
            subject: 'Чат с ' + clientData.name
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
  }, [router.query.clientId])

  // Загрузка сообщений (последние 30)
  const loadMessages = async (sid) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sid)
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) {
      setMessages(data.reverse())
      setHasMore(data.length === 30)
    }
  }

  // Подгрузка более старых сообщений
  const loadMoreMessages = async () => {
    if (!sessionId || messages.length === 0) return
    const oldest = messages[0]
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(30)
    if (data && data.length > 0) {
      setMessages(prev => [...data.reverse(), ...prev])
      setHasMore(data.length === 30)
    } else {
      setHasMore(false)
    }
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
          setMessages((prev) => {
            // избегаем дублирования
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

  // Автоскролл вниз при новом сообщении
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Отправка сообщения
  const sendMessage = useCallback(async () => {
    if (!input.trim() || !sessionId || !user) return
    setSending(true)
    const sanitized = sanitize(input.trim())
    const { error } = await supabase.from('chat_messages').insert({
      session_id: sessionId,
      sender_id: user.id,
      sender_type: 'operator',
      message: sanitized,
      read_status: false
    })
    if (!error) {
      setInput('')
    } else {
      showNotification('Ошибка отправки сообщения')
    }
    setSending(false)
  }, [input, sessionId, user])

  // Горячие клавиши
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      sendMessage()
    } else if (e.key === '/' && input === '') {
      e.preventDefault()
      // Открыть поиск шаблонов (здесь просто фокус на первом шаблоне)
      const firstTemplate = document.querySelector('.chat-template-btn')
      if (firstTemplate) firstTemplate.focus()
    }
  }

  // Вставка шаблона
  const applyTemplate = (templateText) => {
    setInput(templateText)
  }

  // Действия (заглушка)
  const createDealFromChat = () => {
    showNotification('Создание сделки будет добавлено')
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
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div className="chat-client-info">
              <div className="chat-client-name">{client.name}</div>
              <div className="chat-client-status">{client.status}</div>
            </div>
          </div>

          <div className="chat-metrics">
            <div className="chat-metrics-item">
              <span>Телефон</span>
              <span>{client.phone || '—'}</span>
            </div>
            <div className="chat-metrics-item">
              <span>Email</span>
              <span>{client.email || '—'}</span>
            </div>
            <div className="chat-metrics-item">
              <span>Приоритет</span>
              <span className={`px-2 py-1 rounded-full text-white text-xs ${
                client.priority === 'high' ? 'bg-[#F28B82]' :
                client.priority === 'urgent' ? 'bg-[#EF4444]' : 'bg-[#7AC78F]'
              }`}>
                {client.priority}
              </span>
            </div>
          </div>
        </div>

        {/* Центральная область */}
        <div className="chat-center-panel">
          <div className="chat-messages">
            {hasMore && (
              <div className="chat-load-more" onClick={loadMoreMessages}>
                Загрузить более ранние сообщения
              </div>
            )}
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
              disabled={sending}
            />
            <button className="chat-send-btn" onClick={sendMessage} disabled={sending || !input.trim()}>
              {sending ? '...' : 'Отправить'}
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

      {/* Уведомление */}
      {notification.show && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 1100,
          background: 'white', borderRadius: 14, padding: '16px 24px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', color: '#1F2E23',
          border: '1px solid #E5F0E8'
        }}>
          {notification.message}
        </div>
      )}
    </>
  )
}
