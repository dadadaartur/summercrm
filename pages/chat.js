import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../utils/supabaseClient'

export default function ChatPage() {
  const [session, setSession] = useState(null)
  const [profileData, setProfileData] = useState(null)
  
  // Чат-сессии
  const [chatSessions, setChatSessions] = useState([])
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  
  // Данные текущей сессии
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [clientInfo, setClientInfo] = useState(null)
  const [dealInfo, setDealInfo] = useState(null)
  
  // Статусы и фичи
  const [clientTyping, setClientTyping] = useState(false)
  const [activeTab, setActiveTab] = useState('templates') // templates | rating
  const [quickTemplatesOpen, setQuickTemplatesOpen] = useState(false)
  
  const messagesEndRef = useRef(null)
  const broadcastChannelRef = useRef(null)

  // Шаблоны ответов
  const templates = [
    { id: 1, label: 'Приветствие', text: '☀️ Прекрасного летнего дня! Меня зовут [Имя оператора], чем я могу вам помочь?' },
    { id: 2, label: 'Пауза', text: 'Минутку, пожалуйста, сверяю информацию по вашему вопросу. Скоро вернусь!' },
    { id: 3, label: 'Успех', text: 'Всё готово! Сделка успешно оформлена. Солнечного настроения и отличного дня! 🌴' }
  ]

  // Скролл вниз
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, clientTyping])

  // 1. Проверка авторизации оператора
  useEffect(() => {
    async function checkUser() {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (!currentSession) {
        window.location.href = '/login'
        return
      }
      setSession(currentSession)

      const { data: prof, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentSession.user.id)
        .single()

      if (error || !prof?.company_id) {
        window.location.href = '/login'
        return
      }
      setProfileData(prof)
      loadChatSessions(prof.company_id)
    }
    checkUser()
  }, [])

  // 2. Realtime-подписка на новые чат-сессии для компании
  useEffect(() => {
    if (!profileData?.company_id) return

    const sessionChannel = supabase.channel('company-sessions-grid')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_sessions', filter: `company_id=eq.${profileData.company_id}` },
        () => {
          loadChatSessions(profileData.company_id)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(sessionChannel)
  }, [profileData])

  // 3. Подписка на сообщения диалога и Broadcast статуса печати клиента
  useEffect(() => {
    if (!selectedSessionId) return

    // Подписка на сообщения базы данных
    const msgChannel = supabase.channel(`operator-msg-${selectedSessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${selectedSessionId}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.some(m => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
        }
      )
      .subscribe()

    // Подписка на Broadcast сигналы "Клиент печатает"
    broadcastChannelRef.current = supabase.channel(`chat-broadcast-${selectedSessionId}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        setClientTyping(payload.payload.isTyping)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(msgChannel)
      if (broadcastChannelRef.current) {
        supabase.removeChannel(broadcastChannelRef.current)
      }
    }
  }, [selectedSessionId])

  // Загрузка всех сессий
  async function loadChatSessions(companyId) {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select(`
        id, created_at, client_id, deal_id,
        profiles!chat_sessions_client_id_fkey(full_name, email),
        deals!chat_sessions_deal_id_fkey(title, status, responsible_user_id)
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (!error && data) setChatSessions(data)
  }

  // Выбор конкретного чата
  async function selectSession(sessionItem) {
    setSelectedSessionId(sessionItem.id)
    setClientTyping(false)
    
    // Загрузка сообщений
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionItem.id)
      .order('created_at', { ascending: true })
    
    setMessages(msgs || [])

    // Данные клиента
    setClientInfo({
      id: sessionItem.client_id,
      name: sessionItem.profiles?.full_name || 'Летний Гость',
      email: sessionItem.profiles?.email || ''
    })

    // Данные сделки напрямую из актуального состояния базы
    if (sessionItem.deal_id) {
      const { data: currentDeal } = await supabase
        .from('deals')
        .select('*')
        .eq('id', sessionItem.deal_id)
        .single()
      
      setDealInfo(currentDeal)
    } else {
      setDealInfo(null)
    }
  }

  // Кнопка: Взять чат и сделку в работу
  async function takeChat() {
    if (!dealInfo || !profileData) return

    // Обновляем только ответственного оператора и статус сделки
    const { error } = await supabase
      .from('deals')
      .update({ 
        responsible_user_id: profileData.id, 
        status: 'qualification' 
      })
      .eq('id', dealInfo.id)

    if (!error) {
      setDealInfo(prev => ({ 
        ...prev, 
        responsible_user_id: profileData.id, 
        status: 'qualification' 
      }))
      // Перезагружаем список сессий, чтобы обновить UI в левой колонке
      loadChatSessions(profileData.company_id)
    }
  }

  // Отправка ответа оператора
  async function sendResponse(textToSend = null) {
    const text = textToSend ? textToSend.trim() : inputValue.trim()
    if (!text || !selectedSessionId || !profileData) return

    if (!textToSend) setInputValue('')

    await supabase.from('chat_messages').insert({
      session_id: selectedSessionId,
      sender_id: profileData.id,
      sender_role: 'operator',
      message_text: text
    })
  }

  return (
    <div className="chat-container">
      
      {/* ЛЕВАЯ ПАНЕЛЬ: Список активных летних диалогов */}
      <div className="chat-left-panel">
        <h3 style={{ fontSize: '16px', color: '#1B4332', fontWeight: '800', marginBottom: '8px' }}>🍉 Текущие диалоги</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {chatSessions.map((s) => {
            const isSelected = s.id === selectedSessionId
            const isMyDeal = s.deals?.responsible_user_id === profileData?.id
            const isNew = !s.deals?.responsible_user_id

            return (
              <div 
                key={s.id}
                onClick={() => selectSession(s)}
                style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: isSelected ? '2px solid #10B981' : '1px solid #B7E4C7',
                  background: isSelected ? '#D8F3DC' : 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontWeight: '700', fontSize: '14px', color: '#1B4332' }}>
                  {s.profiles?.full_name || 'Летний Гость'}
                </div>
                <div style={{ fontSize: '12px', color: '#40916C', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{s.deals?.title || 'Чат'}</span>
                  <span style={{ 
                    fontWeight: 'bold', 
                    color: isNew ? '#F59E0B' : (isMyDeal ? '#059669' : '#9AA9C1') 
                  }}>
                    {isNew ? 'Новый 🌟' : (isMyDeal ? 'Мой 🟢' : 'Чужой')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ЦЕНТРАЛЬНАЯ ПАНЕЛЬ: Окно переписки */}
      <div className="chat-center-panel">
        {selectedSessionId ? (
          <>
            <div className="chat-messages">
              {messages.map((m) => {
                const isOperator = m.sender_role === 'operator'
                return (
                  <div key={m.id || m.created_at} className={`chat-message ${isOperator ? 'operator' : 'client'}`}>
                    <div>{m.message_text}</div>
                    <div className="chat-message-time">
                      {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'сейчас'}
                    </div>
                  </div>
                )
              })}
              
              {/* Сочный индикатор набора текста клиентской стороны */}
              {clientTyping && (
                <div className="typing-indicator" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontWeight: '600' }}>
                  <span className="typing-dots">✏️ Гость что-то печатает...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Панель ввода с кнопкой быстрых шаблонов */}
            <div className="chat-bottom-panel">
              <button className="quick-templates-btn" onClick={() => setQuickTemplatesOpen(!quickTemplatesOpen)}>
                🏝️
              </button>

              {quickTemplatesOpen && (
                <div className="quick-templates-panel">
                  {templates.map(t => (
                    <button 
                      key={t.id} 
                      className="quick-template-btn"
                      onClick={() => {
                        setInputValue(prev => prev + t.text)
                        setQuickTemplatesOpen(false)
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              <input
                type="text"
                className="chat-input"
                placeholder="Напишите сочный ответ оператора..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendResponse()}
              />
              <button className="chat-send-btn" onClick={() => sendResponse()}>
                Отправить
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyCenter: 'center', flexDirection: 'column', color: '#40916C', gap: '8px', paddingTop: '20vh' }}>
            <span style={{ fontSize: '48px' }}>🍹</span>
            <div style={{ fontWeight: '600' }}>Выберите диалог слева для начала летней работы</div>
          </div>
        )}
      </div>

      {/* ПРАВАЯ ПАНЕЛЬ: Карточка сделки и экшены */}
      {selectedSessionId && (
        <div className="chat-right-panel">
          <div className="chat-tabs">
            <button className={`chat-tab ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>
              Инфо
            </button>
            <button className={`chat-tab ${activeTab === 'rating' ? 'active' : ''}`} onClick={() => setActiveTab('rating')}>
              Оценка
            </button>
          </div>

          {activeTab === 'templates' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
              <div>
                <div style={{ color: '#40916C', marginBottom: '2px' }}>Клиент:</div>
                <div style={{ fontWeight: '700', color: '#1B4332' }}>{clientInfo?.name}</div>
                <div style={{ color: '#74C69D' }}>{clientInfo?.email}</div>
              </div>

              <div style={{ borderTop: '1px solid #B7E4C7', paddingTop: '12px' }}>
                <div style={{ color: '#40916C', marginBottom: '2px' }}>Сделка:</div>
                <div style={{ fontWeight: '700', color: '#1B4332' }}>{dealInfo?.title || 'Не заведена'}</div>
                <div style={{ color: '#F59E0B', fontWeight: 'bold', marginTop: '2px' }}>
                  Этап: {dealInfo?.status}
                </div>
              </div>

              {dealInfo && !dealInfo.responsible_user_id && (
                <button className="chat-action-btn" onClick={takeChat} style={{ marginTop: '10px' }}>
                  ☀️ Взять в работу
                </button>
              )}
            </div>
          )}

          {activeTab === 'rating' && (
            <div className="operator-rating">
              <div className="operator-rating-value">5.0</div>
              <div className="operator-rating-label">Рейтинг этого чата</div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
