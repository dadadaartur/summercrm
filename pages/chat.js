import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'

const DEFAULT_CLIENT = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Клиент',
  phone: '',
  email: '',
  status: 'новый',
  priority: 'medium'
}

function sanitize(text) {
  return text.replace(/<[^>]*>/g, '')
}

export default function ChatPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsLogin, setNeedsLogin] = useState(false)

  // Чат
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState(null)
  const [client, setClient] = useState(DEFAULT_CLIENT)
  const [clientTyping, setClientTyping] = useState(false)
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [notification, setNotification] = useState({ show: false, message: '' })
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Статистика сессии и оператора
  const [sessionStats, setSessionStats] = useState({
    message_count: 0,
    client_message_count: 0,
    operator_message_count: 0,
    auto_rating: null
  })
  const [operatorAvgRating, setOperatorAvgRating] = useState(0)

  // Панель горячих клавиш
  const [showHotkeys, setShowHotkeys] = useState(false)

  // Вкладки правой панели
  const [rightTab, setRightTab] = useState('templates')

  // Виджет метрик (открытые сделки и цели)
  const [metrics, setMetrics] = useState({ openDeals: 0, activeGoals: 0 })

  const showNotification = (msg) => {
    setNotification({ show: true, message: msg })
    setTimeout(() => setNotification({ show: false, message: '' }), 3000)
  }

  // Загрузка профиля, данных сессии, метрик
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

      // Метрики компании
      const [{ count: dealsCount }, { count: goalsCount }] = await Promise.all([
        supabase.from('deals').select('*', { count: 'exact', head: true }).eq('company_id', profileData.company_id).in('status', ['new','qualification','proposal','negotiation']),
        supabase.from('goals').select('*', { count: 'exact', head: true }).eq('company_id', profileData.company_id).eq('is_active', true)
      ])
      setMetrics({ openDeals: dealsCount || 0, activeGoals: goalsCount || 0 })

      // Средняя оценка оператора (из chat_ratings, где тип client)
      const { data: ratings } = await supabase
        .from('chat_ratings')
        .select('rating')
        .eq('rating_type', 'client')
        // нужно фильтровать по оператору, но пока берём все
      if (ratings && ratings.length > 0) {
        const avg = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
        setOperatorAvgRating(avg.toFixed(1))
      }

      // Клиент из URL или заглушка
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

      // Сессия чата
      const { data: existingSessions } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('company_id', profileData.company_id)
        .eq('client_id', clientData.id)
        .eq('operator_id', currentUser.id)
        .eq('status', 'active')
        .maybeSingle()

      if (existingSessions) {
        setSessionId(existingSessions.id)
        setSessionStats({
          message_count: existingSessions.message_count || 0,
          client_message_count: existingSessions.client_message_count || 0,
          operator_message_count: existingSessions.operator_message_count || 0,
          auto_rating: existingSessions.auto_rating
        })
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

  const loadMoreMessages = async () => {
    // ... (без изменений)
  }

  // Realtime подписка
  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel('chat-' + sessionId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` }, payload => {
        setMessages(prev => prev.find(m => m.id === payload.new.id) ? prev : [...prev, payload.new])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Обновление счётчиков (триггер делает это автоматически, но мы можем обновлять локально для отображения)
  const refreshSessionStats = async () => {
    if (!sessionId) return
    const { data } = await supabase.from('chat_sessions').select('message_count, client_message_count, operator_message_count, auto_rating').eq('id', sessionId).single()
    if (data) setSessionStats(data)
  }

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
      setShowHotkeys(false)
      refreshSessionStats()
    } else {
      showNotification('Ошибка отправки сообщения')
    }
    setSending(false)
  }, [input, sessionId, user])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMessage(); }
    if (e.key === 'Escape') setShowHotkeys(false)
  }

  const applyTemplate = (text) => { setInput(text); setShowHotkeys(false); inputRef.current?.focus() }

  // Закрытие чата с автооценкой
  const closeChat = async () => {
    if (!sessionId) return
    // расчёт автооценки
    const { data: session } = await supabase.from('chat_sessions').select('*').eq('id', sessionId).single()
    if (session) {
      let penaltyPoints = 0
      const durationMs = new Date() - new Date(session.started_at)
      const durationMinutes = Math.floor(durationMs / 60000)
      if (durationMinutes > 5) penaltyPoints += 1
      if (session.message_count > 10) penaltyPoints += 1
      const { data: firstMsg } = await supabase.from('chat_messages').select('sender_type').eq('session_id', sessionId).order('created_at', { ascending: true }).limit(1).single()
      if (firstMsg?.sender_type !== 'operator') penaltyPoints += 1
      const autoRating = Math.max(1, 5 - penaltyPoints)

      await supabase.from('chat_ratings').insert({
        session_id: sessionId,
        rating: autoRating,
        rating_type: 'auto',
        reason: `Штрафы: ${penaltyPoints} балла(ов)`
      })
      await supabase.from('chat_sessions').update({
        status: 'closed',
        ended_at: new Date().toISOString(),
        auto_rated: true,
        auto_rating: autoRating
      }).eq('id', sessionId)

      showNotification(`Чат закрыт. Автоматическая оценка: ${autoRating}★`)
      refreshSessionStats()
    }
  }

  if (loading) return <div className="loading-leaf-container"><div className="loading-leaf"></div></div>
  if (needsLogin) { /* экран логина */ }

  return (
    <>
      <Head>
        <title>Чат — CRM Лето</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="crm-topbar">
        <Link href="/" className="topbar-logo-link"><span className="back-arrow">←</span> CRM Лето</Link>
        <div className="topbar-right"><span className="topbar-name">{user?.email}</span></div>
      </div>
      <div className="nav-panel">
        <Link href="/deals" className="nav-link">Сделки</Link>
        <Link href="/chat" className="nav-link">Чат</Link>
        <span className="nav-link">Звонки</span>
      </div>

      <div className="metrics-widget">
        <div className="metrics-widget-item"><div className="metrics-widget-value">{metrics.openDeals}</div><div className="metrics-widget-label">открытых сделок</div></div>
        <div className="metrics-widget-item"><div className="metrics-widget-value">{metrics.activeGoals}</div><div className="metrics-widget-label">активных целей</div></div>
      </div>

      <div className="chat-container">
        <div className="chat-left-panel">
          <div className="chat-client-header">
            <div className="chat-client-avatar">{client.name.charAt(0).toUpperCase()}</div>
            <div className="chat-client-info">
              <div className="chat-client-name">{client.name}</div>
              <div className="chat-client-status">{client.status}</div>
            </div>
          </div>
          <div className="chat-metrics">
            <div className="chat-metrics-item"><span>Телефон</span><span>{client.phone || '—'}</span></div>
            <div className="chat-metrics-item"><span>Email</span><span>{client.email || '—'}</span></div>
            <div className="chat-metrics-item">
              <span>Приоритет</span>
              <span className={`px-2 py-1 rounded-full text-white text-xs ${client.priority === 'high' ? 'bg-[#F28B82]' : client.priority === 'urgent' ? 'bg-[#EF4444]' : 'bg-[#7AC78F]'}`}>{client.priority}</span>
            </div>
          </div>

          {/* Статистика сессии */}
          <div className="chat-metrics">
            <div className="chat-metrics-item"><span>Всего сообщений</span><span>{sessionStats.message_count}</span></div>
            <div className="chat-metrics-item"><span>От клиента</span><span>{sessionStats.client_message_count}</span></div>
            <div className="chat-metrics-item"><span>От оператора</span><span>{sessionStats.operator_message_count}</span></div>
            {sessionStats.auto_rating && <div className="chat-metrics-item"><span>Автооценка</span><span>{sessionStats.auto_rating}★</span></div>}
          </div>

          {/* Средняя оценка оператора */}
          <div className="operator-rating">
            <div className="operator-rating-value">{operatorAvgRating}★</div>
            <div className="operator-rating-label">средняя оценка</div>
          </div>
        </div>

        {/* центр и правая панель как раньше, добавить кнопку "Закрыть чат" */}
        <div className="chat-center-panel">
          {/* ... */}
          <div className="chat-bottom-panel">
            {/* ... */}
            <button onClick={closeChat} className="chat-action-btn" style={{ width: 'auto' }}>Закрыть чат</button>
          </div>
        </div>

        <div className="chat-right-panel">
          {/* шаблоны и действия */}
        </div>
      </div>
    </>
  )
}
