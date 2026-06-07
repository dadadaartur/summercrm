import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'

const DEFAULT_CLIENT = { id: '00000000-0000-0000-0000-000000000000', name: 'Клиент', phone: '', email: '', status: 'новый', priority: 'medium' }
function sanitize(text) { return text.replace(/<[^>]*>/g, '') }
function formatDateSeparator(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  if (date >= today) return 'Сегодня'
  if (date >= yesterday) return 'Вчера'
  return date.toLocaleDateString('ru')
}
function LightningIcon({ size = 20, color = '#F4B860' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill={color} fillOpacity="0.3" />
    </svg>
  )
}

export default function ChatPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsLogin, setNeedsLogin] = useState(false)
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
  const [sessionStats, setSessionStats] = useState({ message_count: 0, client_message_count: 0, operator_message_count: 0, auto_rating: null })
  const [operatorAvgRating, setOperatorAvgRating] = useState(0)
  const [showQuickTemplates, setShowQuickTemplates] = useState(false)
  const [rightTab, setRightTab] = useState('templates')
  const [metrics, setMetrics] = useState({ openDeals: 0, activeGoals: 0 })

  // Состояния для модального окна заполнения сделки
  const [showDealModal, setShowDealModal] = useState(false)
  const [dealForm, setDealForm] = useState({
    amount: '',
    priority: 'medium',
    description: '',
    deadline: '',
    responsible_user_id: ''
  })
  const [dealId, setDealId] = useState(null)  // ID привязанной сделки

  const showNotification = (msg) => {
    setNotification({ show: true, message: msg })
    setTimeout(() => setNotification({ show: false, message: '' }), 3000)
  }

  useEffect(() => {
    const init = async () => {
      try {
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

        const [{ count: dealsCount }, { count: goalsCount }] = await Promise.all([
          supabase.from('deals').select('*', { count: 'exact', head: true }).eq('company_id', profileData.company_id).in('status', ['new','qualification','proposal','negotiation']),
          supabase.from('goals').select('*', { count: 'exact', head: true }).eq('company_id', profileData.company_id).eq('is_active', true)
        ])
        setMetrics({ openDeals: dealsCount || 0, activeGoals: goalsCount || 0 })

        const { data: ratings } = await supabase.from('chat_ratings').select('rating').eq('rating_type', 'client')
        if (ratings && ratings.length > 0) {
          const avg = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
          setOperatorAvgRating(avg.toFixed(1))
        }

        // Определяем сессию: либо по sessionId в URL, либо по dealId
        const sid = router.query.sessionId
        const did = router.query.dealId

        if (sid) {
          setSessionId(sid)
          const { data: sess } = await supabase.from('chat_sessions').select('*').eq('id', sid).single()
          if (sess) {
            setDealId(sess.deal_id)
            setSessionStats({
              message_count: sess.message_count || 0,
              client_message_count: sess.client_message_count || 0,
              operator_message_count: sess.operator_message_count || 0,
              auto_rating: sess.auto_rating
            })
            // Загружаем данные клиента
            if (sess.client_id) {
              const { data: cl } = await supabase.from('profiles').select('user_id, email, display_name').eq('user_id', sess.client_id).maybeSingle()
              if (cl) setClient({ id: cl.user_id, name: cl.display_name || cl.email, email: cl.email, phone: '', status: 'клиент', priority: 'medium' })
            }
            await loadMessages(sid)
          }
        } else if (did) {
          // Найти сессию по сделке
          const { data: sess } = await supabase.from('chat_sessions').select('*').eq('deal_id', did).maybeSingle()
          if (sess) {
            router.replace(`/chat?sessionId=${sess.id}`)
          } else {
            // Создать новую сессию для сделки
            const { data: deal } = await supabase.from('deals').select('*').eq('id', did).single()
            if (deal) {
              const { data: newSess } = await supabase.from('chat_sessions').insert({
                company_id: profileData.company_id,
                client_id: deal.responsible_user_id,
                deal_id: deal.id,
                status: 'active',
                subject: `Сделка: ${deal.title}`
              }).select('id').single()
              if (newSess) router.replace(`/chat?sessionId=${newSess.id}`)
            }
          }
        }
      } catch (err) {
        console.error('Ошибка инициализации чата:', err)
        showNotification('Ошибка загрузки данных')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [router.query])

  const loadMessages = async (sid) => {
    const { data } = await supabase.from('chat_messages').select('*').eq('session_id', sid).order('created_at', { ascending: false }).limit(30)
    if (data) { setMessages(data.reverse()); setHasMore(data.length === 30) }
  }

  const loadMoreMessages = async () => {
    if (!sessionId || messages.length === 0) return
    const oldest = messages[0]
    const { data } = await supabase.from('chat_messages').select('*').eq('session_id', sessionId).lt('created_at', oldest.created_at).order('created_at', { ascending: false }).limit(30)
    if (data && data.length > 0) { setMessages(prev => [...data.reverse(), ...prev]); setHasMore(data.length === 30) } else setHasMore(false)
  }

  useEffect(() => {
    if (!sessionId) return
    const channel = supabase.channel('chat-' + sessionId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` }, payload => {
        setMessages(prev => prev.find(m => m.id === payload.new.id) ? prev : [...prev, payload.new])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const refreshSessionStats = async () => {
    if (!sessionId) return
    const { data } = await supabase.from('chat_sessions').select('message_count, client_message_count, operator_message_count, auto_rating').eq('id', sessionId).single()
    if (data) setSessionStats(data)
  }

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !sessionId || !user) return
    setSending(true)
    const sanitized = sanitize(input.trim())
    const { error } = await supabase.from('chat_messages').insert({ session_id: sessionId, sender_id: user.id, sender_type: 'operator', message: sanitized, read_status: false })
    if (!error) { setInput(''); setShowQuickTemplates(false); refreshSessionStats() }
    else showNotification('Ошибка отправки сообщения')
    setSending(false)
  }, [input, sessionId, user])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMessage() }
    else if (e.key === 'Escape') { setShowQuickTemplates(false) }
  }

  const applyTemplate = (text) => { setInput(text); setShowQuickTemplates(false); inputRef.current?.focus() }

  const closeChat = async () => {
    if (!sessionId) return
    try {
      const { data: session } = await supabase.from('chat_sessions').select('*').eq('id', sessionId).single()
      if (!session) return
      let penaltyPoints = 0; const reasons = []
      const durationMs = new Date() - new Date(session.started_at)
      if (Math.floor(durationMs / 60000) > 5) { penaltyPoints += 1; reasons.push('долгое ожидание') }
      if (session.message_count > 10) { penaltyPoints += 1; reasons.push('много сообщений') }
      const { data: firstMsg } = await supabase.from('chat_messages').select('sender_type').eq('session_id', sessionId).order('created_at', { ascending: true }).limit(1).single()
      if (firstMsg?.sender_type !== 'operator') { penaltyPoints += 1; reasons.push('оператор не ответил первым') }
      const autoRating = Math.max(1, 5 - penaltyPoints)
      const reasonText = reasons.length > 0 ? `Штрафы: ${reasons.join(', ')}` : 'Без штрафов'
      await supabase.from('chat_ratings').insert({ session_id: sessionId, rating: autoRating, rating_type: 'auto', reason: reasonText })
      await supabase.from('chat_sessions').update({ status: 'closed', ended_at: new Date().toISOString(), auto_rated: true, auto_rating: autoRating }).eq('id', sessionId)
      showNotification(`Чат закрыт. Автоматическая оценка: ${autoRating}★. ${reasonText}`)
      refreshSessionStats()
      setTimeout(() => router.push('/'), 2000)
    } catch (err) { console.error(err); showNotification('Ошибка при закрытии чата') }
  }

  const takeChat = async () => {
    if (!sessionId || !dealId) return
    await supabase.from('chat_sessions').update({ status: 'taken', assigned_to: user.id }).eq('id', sessionId)
    await supabase.from('deals').update({ responsible_user_id: user.id, status: 'qualification' }).eq('id', dealId)
    showNotification('Чат взят в работу')
    refreshSessionStats()
  }

  // Обновление сделки из модального окна
  const handleUpdateDeal = async () => {
    if (!dealId) return
    const { error } = await supabase.from('deals').update({
      amount: parseFloat(dealForm.amount) || null,
      priority: dealForm.priority,
      description: dealForm.description,
      deadline: dealForm.deadline || null,
      responsible_user_id: dealForm.responsible_user_id || null
    }).eq('id', dealId)
    if (!error) {
      showNotification('Сделка обновлена')
      setShowDealModal(false)
    } else {
      showNotification('Ошибка обновления сделки')
    }
  }

  const createDealFromChat = () => {
    // Открываем модальное окно заполнения сделки
    setShowDealModal(true)
  }

  if (loading) return <div className="loading-leaf-container"><div className="loading-leaf"></div></div>
  if (needsLogin) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#E8F4FD' }}>
        <div style={{ textAlign: 'center', background: 'white', padding: '48px', borderRadius: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h2 style={{ marginBottom: '16px', fontWeight: 600, color: '#2D6A4F' }}>Добро пожаловать в CRM Лето</h2>
          <p style={{ marginBottom: '24px', color: '#5B7465' }}>Для работы с чатом необходимо авторизоваться</p>
          <a href="https://arthurcrm.vercel.app/login" style={{ display: 'inline-block', background: '#4CAF6A', color: 'white', padding: '12px 32px', borderRadius: '14px', textDecoration: 'none', fontWeight: 500 }}>Войти в Кармический банк</a>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head><title>Чат — CRM Лето</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" /></Head>

      <div className="crm-topbar">
        <Link href="/" className="topbar-logo-link"><span className="back-arrow">←</span> CRM Лето</Link>
        <div className="topbar-right"><span className="topbar-name">{user?.email}</span></div>
      </div>

      <div className="metrics-widget">
        <div className="metrics-widget-item"><div className="metrics-widget-value">{metrics.openDeals}</div><div className="metrics-widget-label">открытых сделок</div></div>
        <div className="metrics-widget-item"><div className="metrics-widget-value">{metrics.activeGoals}</div><div className="metrics-widget-label">активных целей</div></div>
      </div>

      <div className="chat-container">
        <div className="chat-left-panel">
          <div className="chat-client-header">
            <div className="chat-client-avatar">{client.name.charAt(0).toUpperCase()}</div>
            <div className="chat-client-info"><div className="chat-client-name">{client.name}</div><div className="chat-client-status">{client.status}</div></div>
          </div>
          <div className="chat-metrics">
            <div className="chat-metrics-item"><span>Телефон</span><span>{client.phone || '—'}</span></div>
            <div className="chat-metrics-item"><span>Email</span><span>{client.email || '—'}</span></div>
            <div className="chat-metrics-item"><span>Приоритет</span><span className={`px-2 py-1 rounded-full text-white text-xs ${client.priority === 'high' ? 'bg-[#F28B82]' : client.priority === 'urgent' ? 'bg-[#EF4444]' : 'bg-[#7AC78F]'}`}>{client.priority}</span></div>
          </div>
          <div className="chat-metrics">
            <div className="chat-metrics-item"><span>Всего сообщений</span><span>{sessionStats.message_count}</span></div>
            <div className="chat-metrics-item"><span>От клиента</span><span>{sessionStats.client_message_count}</span></div>
            <div className="chat-metrics-item"><span>От оператора</span><span>{sessionStats.operator_message_count}</span></div>
            {sessionStats.auto_rating && <div className="chat-metrics-item"><span>Автооценка</span><span>{sessionStats.auto_rating}★</span></div>}
          </div>
          <div className="operator-rating"><div className="operator-rating-value">{operatorAvgRating}★</div><div className="operator-rating-label">средняя оценка</div></div>
        </div>

        <div className="chat-center-panel">
          <div className="chat-messages">
            {hasMore && <div className="chat-load-more" onClick={loadMoreMessages}>Загрузить более ранние сообщения</div>}
            {messages.length === 0 && !loading && <div style={{ textAlign: 'center', color: '#5B7465', marginTop: 40 }}>Нет сообщений. Начните диалог.</div>}
            {messages.map((msg, index) => {
              const prevMsg = index > 0 ? messages[index - 1] : null
              const currentDate = new Date(msg.created_at).toDateString()
              const prevDate = prevMsg ? new Date(prevMsg.created_at).toDateString() : null
              const showDateSeparator = prevDate !== currentDate
              return (
                <div key={msg.id}>
                  {showDateSeparator && <div className="chat-date-separator">{formatDateSeparator(msg.created_at)}</div>}
                  <div className={`chat-message ${msg.sender_type}`}>
                    <div>{msg.message}</div>
                    <div className="chat-message-time">{new Date(msg.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              )
            })}
            {clientTyping && <div className="typing-indicator">...печатает</div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-bottom-panel">
            <button className="quick-templates-btn" onClick={() => setShowQuickTemplates(!showQuickTemplates)} title="Быстрые ответы"><LightningIcon size={20} /></button>
            <input ref={inputRef} className="chat-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Напишите сообщение... (Ctrl+Enter для отправки)" disabled={sending} />
            <button className="chat-send-btn" onClick={sendMessage} disabled={sending || !input.trim()}>{sending ? '...' : 'Отправить'}</button>
            {showQuickTemplates && (
              <div className="quick-templates-panel">
                <button className="quick-template-btn" onClick={() => applyTemplate("Здравствуйте! Чем могу помочь?")}>Приветствие</button>
                <button className="quick-template-btn" onClick={() => applyTemplate("Уточните детали, пожалуйста.")}>Уточнение</button>
                <button className="quick-template-btn" onClick={() => applyTemplate("Спасибо за обращение! Хорошего дня.")}>Прощание</button>
                <button className="quick-template-btn" onClick={() => setShowQuickTemplates(false)}>Закрыть</button>
              </div>
            )}
          </div>
        </div>

        <div className="chat-right-panel">
          <div className="chat-tabs">
            <button className={`chat-tab ${rightTab === 'templates' ? 'active' : ''}`} onClick={() => setRightTab('templates')}>Шаблоны</button>
            <button className={`chat-tab ${rightTab === 'actions' ? 'active' : ''}`} onClick={() => setRightTab('actions')}>Действия</button>
          </div>
          {rightTab === 'templates' && (
            <div>
              <button className="chat-template-btn" onClick={() => applyTemplate("Здравствуйте! Чем могу помочь?")}>Стандартное приветствие</button>
              <button className="chat-template-btn" onClick={() => applyTemplate("Уточните детали, пожалуйста.")}>Запрос уточнения</button>
              <button className="chat-template-btn" onClick={() => applyTemplate("Спасибо за обращение! Хорошего дня.")}>Прощание</button>
            </div>
          )}
          {rightTab === 'actions' && (
            <div>
              <button className="chat-action-btn" onClick={createDealFromChat}>Заполнить сделку</button>
              <button className="chat-action-btn" onClick={takeChat}>Взять в работу</button>
              <button className="chat-action-btn" style={{ background: '#F2F9F4', color: '#2D6A4F' }} onClick={() => showNotification('Функция в разработке')}>Назначить встречу</button>
              <button className="chat-action-btn" style={{ background: '#FEE2E2', color: '#B91C1C' }} onClick={closeChat}>Закрыть чат</button>
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно заполнения сделки */}
      {showDealModal && (
        <div className="modal-overlay" onClick={() => setShowDealModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', padding: '28px' }}>
            <h3 style={{ fontSize: 20, fontWeight: 600, color: '#1F2E23', marginBottom: 20 }}>Заполнить сделку</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input className="input-field" type="number" placeholder="Сумма (₽)" value={dealForm.amount} onChange={e => setDealForm({...dealForm, amount: e.target.value})} />
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#5B7465' }}>Приоритет:</span>
                <select className="input-field" value={dealForm.priority} onChange={e => setDealForm({...dealForm, priority: e.target.value})}>
                  <option value="low">Низкий</option>
                  <option value="medium">Средний</option>
                  <option value="high">Высокий</option>
                  <option value="urgent">Критичный</option>
                </select>
              </div>
              <textarea className="input-field" rows={3} placeholder="Описание" value={dealForm.description} onChange={e => setDealForm({...dealForm, description: e.target.value})} />
              <input className="input-field" type="date" placeholder="Дедлайн" value={dealForm.deadline} onChange={e => setDealForm({...dealForm, deadline: e.target.value})} />
              <input className="input-field" placeholder="ID ответственного (пока вручную)" value={dealForm.responsible_user_id} onChange={e => setDealForm({...dealForm, responsible_user_id: e.target.value})} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
                <button onClick={() => setShowDealModal(false)} className="action-btn" style={{ background: '#F2F9F4', color: '#5B7465' }}>Отмена</button>
                <button onClick={handleUpdateDeal} className="action-btn primary">Сохранить</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {notification.show && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1100, background: 'white', borderRadius: 14, padding: '16px 24px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', color: '#1F2E23', border: '1px solid #E5F0E8' }}>{notification.message}</div>
      )}
    </>
  )
}
