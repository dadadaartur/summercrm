import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'

const STATUS_COLUMNS = [
  { key: 'new', label: 'Новые' },
  { key: 'qualification', label: 'Квалификация' },
  { key: 'proposal', label: 'Предложение' },
  { key: 'negotiation', label: 'Переговоры' },
  { key: 'won', label: 'Успешно' },
  { key: 'lost', label: 'Закрыто' }
]

const PRIORITY_LABELS = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  urgent: 'Критичный'
}

const PRIORITY_COLORS = {
  low: '#7AC78F',
  medium: '#F4B860',
  high: '#F28B82',
  urgent: '#EF4444'
}

function ActionButton({ children, onClick, primary = false, style = {} }) {
  return (
    <button
      onClick={onClick}
      className={primary ? 'action-btn primary' : 'action-btn'}
      style={{
        padding: '10px 24px',
        borderRadius: '12px',
        border: 'none',
        backgroundColor: primary ? '#4CAF6A' : '#F2F9F4',
        color: primary ? 'white' : '#5B7465',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 500,
        transition: 'all 0.2s',
        ...style
      }}
    >
      {children}
    </button>
  )
}

export default function DealsPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [balance, setBalance] = useState(0)
  const [tasks, setTasks] = useState([])
  const [goals, setGoals] = useState([])
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [focusDeal, setFocusDeal] = useState(null)
  const [notification, setNotification] = useState({ show: false, message: '' })
  const [windActive, setWindActive] = useState(false)
  const [employees, setEmployees] = useState([])
  const [formErrors, setFormErrors] = useState({})

  const [newDeal, setNewDeal] = useState({
    title: '',
    description: '',
    client_name: '',
    amount: '',
    priority: 'medium',
    deadline: '',
    responsible_user_id: ''
  })

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (!currentUser) { setNeedsLogin(true); setLoading(false); return }
        setUser(currentUser)

        const { data: profileData } = await supabase
          .from('profiles')
          .select('first_name, last_name, company_id, position_id, positions(title)')
          .eq('user_id', currentUser.id)
          .single()

        if (!profileData?.company_id) { setNeedsLogin(true); setLoading(false); return }
        setProfile(profileData)
        const companyId = profileData.company_id

        const [{ data: balanceData }, { data: taskAssignments }, { data: goalsData }, { data: dealsData }, { data: employeesData }] = await Promise.all([
          supabase.from('karma_balance').select('balance').eq('user_id', currentUser.id).single(),
          supabase.from('task_assignments').select('id, status, task_id, tasks!inner(id, title, reward_karma, crm_action_type, crm_target_count)').eq('user_id', currentUser.id).eq('status', 'in_progress').eq('tasks.task_type', 'auto_crm'),
          supabase.from('goals').select('*').eq('user_id', currentUser.id).eq('is_active', true).order('period'),
          supabase.from('deals').select('*, responsible:responsible_user_id ( email, display_name )').eq('company_id', companyId).order('created_at', { ascending: false }),
          supabase.from('profiles').select('user_id, display_name, email').eq('company_id', companyId).not('role_id', 'in', '(1,2)').is('deleted_at', null)
        ])

        if (balanceData) setBalance(balanceData.balance)
        if (taskAssignments) setTasks(taskAssignments)
        if (goalsData) setGoals(goalsData)
        if (dealsData) setDeals(dealsData)
        if (employeesData) setEmployees(employeesData)

        setLoading(false)

        const timeout = setTimeout(() => setWindActive(true), 10 * 60 * 1000)
        return () => clearTimeout(timeout)
      } catch (error) {
        console.error('Ошибка загрузки данных сделок:', error)
        setLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (!windActive) return
    const timer = setTimeout(() => setWindActive(false), 20000)
    return () => clearTimeout(timer)
  }, [windActive])

  useEffect(() => {
    if (windActive) return
    const interval = setInterval(() => setWindActive(true), 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [windActive])

  const showNotification = (msg) => {
    setNotification({ show: true, message: msg })
    setTimeout(() => setNotification({ show: false, message: '' }), 3000)
  }

  const validateDealForm = () => {
    const errors = {}
    if (!newDeal.title.trim()) errors.title = 'Обязательное поле'
    if (!newDeal.client_name.trim()) errors.client_name = 'Обязательное поле'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreateDeal = async () => {
    if (!validateDealForm()) return

    const { data, error } = await supabase
      .from('deals')
      .insert({
        company_id: profile.company_id,
        title: newDeal.title.trim(),
        description: newDeal.description.trim(),
        client_name: newDeal.client_name.trim(),
        amount: parseFloat(newDeal.amount) || null,
        priority: newDeal.priority,
        deadline: newDeal.deadline || null,
        responsible_user_id: newDeal.responsible_user_id || null,
        status: 'new',
        progress: 0
      })
      .select('*, responsible:responsible_user_id ( email, display_name )')
      .single()

    if (error) {
      showNotification('Ошибка создания сделки')
      return
    }

    setDeals(prev => [data, ...prev])
    setShowCreateModal(false)
    setNewDeal({ title: '', description: '', client_name: '', amount: '', priority: 'medium', deadline: '', responsible_user_id: '' })
    setFormErrors({})
    showNotification('Сделка создана')
  }

  const updateDealStatus = async (dealId, newStatus) => {
    const { error } = await supabase
      .from('deals')
      .update({ status: newStatus, updated_at: new Date() })
      .eq('id', dealId)

    if (!error) {
      setDeals(prev => prev.map(deal => deal.id === dealId ? { ...deal, status: newStatus } : deal))
      setFocusDeal(null)
    } else {
      showNotification('Ошибка обновления статуса')
    }
  }

  const deadlineIndicator = (deadline) => {
    if (!deadline) return null
    const diff = new Date(deadline) - new Date()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    if (diff < 0) return { color: '#EF4444', text: 'Просрочено' }
    if (days <= 1) return { color: '#F28B82', text: `${days} д.` }
    return { color: '#7AC78F', text: `${days} д.` }
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
          <p style={{ marginBottom: '24px', color: '#5B7465' }}>Для работы с CRM необходимо авторизоваться в Кармическом банке</p>
          <a href="https://arthurcrm.vercel.app/login" style={{ display: 'inline-block', background: '#4CAF6A', color: 'white', padding: '12px 32px', borderRadius: '14px', textDecoration: 'none', fontWeight: 500 }}>
            Войти в Кармический банк
          </a>
        </div>
      </div>
    )
  }

  const displayName = profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : user?.email

  return (
    <>
      <Head>
        <title>Сделки — CRM Лето</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="crm-topbar">
        <Link href="/" className="topbar-logo-link">
          <span className="back-arrow">←</span> CRM Лето
        </Link>
        <div className="topbar-right">
          <span className="topbar-name">{displayName}</span>
        </div>
      </div>

      <div className="nav-panel">
        <Link href="/deals" className="nav-link">Сделки</Link>
        <Link href="/chat" className="nav-link">Чат</Link>
        <span className="nav-link">Звонки</span>
      </div>

      <div className="crm-wrapper">
        <div className={`cloud-bg ${windActive ? 'active' : ''}`}>
          <div className="cloud cloud1"></div>
          <div className="cloud cloud2"></div>
          <div className="cloud cloud3"></div>
        </div>
        <div className={`leaf-container ${windActive ? 'active' : ''}`} />

        <div className="wind-btn" onClick={() => setWindActive(true)} title="Вызвать лёгкий ветер">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2C12 2 6 7 6 12C6 17 12 20 12 20C12 20 18 17 18 12C18 7 12 2 12 2Z" strokeLinecap="round"/>
            <line x1="12" y1="20" x2="12" y2="22" strokeLinecap="round"/>
          </svg>
        </div>

        <div className="sidebar">
          <div className="balance-item">
            <div className="balance-icon">
              <svg viewBox="0 0 32 32" fill="none"><path d="M16 4C16 4 8 10 8 18C8 26 16 28 16 28C16 28 24 26 24 18C24 10 16 4 16 4Z" stroke="#4CAF6A" strokeWidth="2" fill="#A3E0B0" fillOpacity="0.3"/><path d="M13 12L16 15L19 12" stroke="#4CAF6A" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
            <div className="balance-info"><span className="balance-value karma-color">{balance}</span><span className="balance-label">Кармики</span></div>
          </div>
          <div className="dash-mini">
            <div className="dash-row"><span>Заданий CRM</span><span>{tasks.length}</span></div>
            <div className="dash-row"><span>Можно заработать</span><span style={{color:'#4CAF6A'}}>+{tasks.reduce((sum, a) => sum + (a.tasks?.reward_karma || 0), 0)}</span></div>
            <div className="dash-row"><span>Звонков сегодня</span><span>0</span></div>
          </div>
          {goals.length > 0 && (
            <div className="dash-mini">
              {goals.map(goal => (
                <div key={goal.id} className="dash-row">
                  <span>{goal.title} ({goal.period})</span>
                  <span>{goal.current_value}/{goal.target_value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="main-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, color: '#1F2E23' }}>Сделки</h2>
            <ActionButton primary onClick={() => setShowCreateModal(true)}>
              Новая сделка
            </ActionButton>
          </div>

          <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 16, paddingTop: 16 }}>
            {STATUS_COLUMNS.map(col => {
              const columnDeals = deals.filter(d => d.status === col.key)
              return (
                <div key={col.key} style={{ minWidth: '260px', maxWidth: '300px', flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: '#2D6A4F', padding: '0 4px' }}>{col.label} ({columnDeals.length})</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {columnDeals.map(deal => {
                      const deadlineInfo = deadlineIndicator(deal.deadline)
                      return (
                        <div key={deal.id} className="deal-card" onClick={() => setFocusDeal(deal)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 14, color: '#1F2E23' }}>{deal.title}</span>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: PRIORITY_COLORS[deal.priority] }} />
                          </div>
                          {deal.client_name && <div style={{ fontSize: 12, color: '#5B7465', marginBottom: 4 }}>{deal.client_name}</div>}
                          {deal.amount && <div style={{ fontSize: 12, fontWeight: 600, color: '#4CAF6A' }}>{Number(deal.amount).toLocaleString()} ₽</div>}
                          <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: '#F0F7F2', overflow: 'hidden' }}>
                            <div style={{ width: `${deal.progress}%`, height: '100%', background: '#4CAF6A', borderRadius: 2 }} />
                          </div>
                          {deadlineInfo && (
                            <div style={{ fontSize: 11, color: deadlineInfo.color, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: deadlineInfo.color }} />
                              {deadlineInfo.text}
                            </div>
                          )}
                          {deal.responsible && <div style={{ fontSize: 11, color: '#9AA9C1', marginTop: 4 }}>{deal.responsible.display_name || deal.responsible.email}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {showCreateModal && (
            <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', padding: '32px' }}>
                <h3 style={{ fontSize: 22, fontWeight: 600, color: '#1F2E23', marginBottom: 24, borderBottom: '1px solid #E5F0E8', paddingBottom: 12 }}>
                  Новая сделка
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
                  {/* Название */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 13, color: '#5B7465', marginBottom: 4, display: 'block' }}>
                      Название сделки <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      className={`input-field ${formErrors.title ? 'border-red-400' : ''}`}
                      placeholder="Краткое описание сути"
                      value={newDeal.title}
                      onChange={e => { setNewDeal({...newDeal, title: e.target.value}); if (formErrors.title) setFormErrors({...formErrors, title: null}) }}
                    />
                    {formErrors.title && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 2 }}>{formErrors.title}</div>}
                  </div>

                  {/* Клиент */}
                  <div>
                    <label style={{ fontSize: 13, color: '#5B7465', marginBottom: 4, display: 'block' }}>
                      Клиент <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <input
                      className={`input-field ${formErrors.client_name ? 'border-red-400' : ''}`}
                      placeholder="Компания или ФИО"
                      value={newDeal.client_name}
                      onChange={e => { setNewDeal({...newDeal, client_name: e.target.value}); if (formErrors.client_name) setFormErrors({...formErrors, client_name: null}) }}
                    />
                    {formErrors.client_name && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 2 }}>{formErrors.client_name}</div>}
                  </div>

                  {/* Сумма */}
                  <div>
                    <label style={{ fontSize: 13, color: '#5B7465', marginBottom: 4, display: 'block' }}>Сумма сделки (₽)</label>
                    <input
                      className="input-field"
                      type="number"
                      placeholder="0"
                      value={newDeal.amount}
                      onChange={e => setNewDeal({...newDeal, amount: e.target.value})}
                    />
                  </div>

                  {/* Приоритет */}
                  <div>
                    <label style={{ fontSize: 13, color: '#5B7465', marginBottom: 4, display: 'block' }}>Приоритет</label>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', height: 42 }}>
                      {['low', 'medium', 'high', 'urgent'].map(level => (
                        <label key={level} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="priority"
                            value={level}
                            checked={newDeal.priority === level}
                            onChange={e => setNewDeal({...newDeal, priority: e.target.value})}
                            style={{ accentColor: '#4CAF6A' }}
                          />
                          <span style={{
                            width: 12, height: 12, borderRadius: 4,
                            backgroundColor: level === 'low' ? '#7AC78F' : level === 'medium' ? '#F4B860' : level === 'high' ? '#F28B82' : '#EF4444'
                          }} />
                          <span style={{ fontSize: 13, color: '#1F2E23' }}>
                            {level === 'low' ? 'Низкий' : level === 'medium' ? 'Средний' : level === 'high' ? 'Высокий' : 'Критичный'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Дедлайн */}
                  <div>
                    <label style={{ fontSize: 13, color: '#5B7465', marginBottom: 4, display: 'block' }}>Дедлайн</label>
                    <input
                      className="input-field"
                      type="date"
                      value={newDeal.deadline}
                      onChange={e => setNewDeal({...newDeal, deadline: e.target.value})}
                    />
                  </div>

                  {/* Ответственный */}
                  <div>
                    <label style={{ fontSize: 13, color: '#5B7465', marginBottom: 4, display: 'block' }}>Ответственный</label>
                    <select
                      className="input-field"
                      value={newDeal.responsible_user_id}
                      onChange={e => setNewDeal({...newDeal, responsible_user_id: e.target.value})}
                    >
                      <option value="">Не назначен</option>
                      {employees.map(emp => (
                        <option key={emp.user_id} value={emp.user_id}>{emp.display_name || emp.email}</option>
                      ))}
                    </select>
                  </div>

                  {/* Описание */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 13, color: '#5B7465', marginBottom: 4, display: 'block' }}>Описание</label>
                    <textarea
                      className="input-field"
                      rows={4}
                      placeholder="Детали, особые условия, примечания"
                      value={newDeal.description}
                      onChange={e => setNewDeal({...newDeal, description: e.target.value})}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                  <ActionButton onClick={() => { setShowCreateModal(false); setFormErrors({}) }}>Отмена</ActionButton>
                  <ActionButton primary onClick={handleCreateDeal}>Создать</ActionButton>
                </div>
              </div>
            </div>
          )}

          {focusDeal && (
            <div className="modal-overlay" onClick={() => setFocusDeal(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h3 style={{ fontSize: 22, fontWeight: 600, color: '#1F2E23', marginBottom: 16 }}>{focusDeal.title}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14, color: '#5B7465' }}>
                  <div>Клиент: {focusDeal.client_name || '—'}</div>
                  <div>Сумма: {focusDeal.amount ? Number(focusDeal.amount).toLocaleString() + ' ₽' : '—'}</div>
                  <div>Статус: {STATUS_COLUMNS.find(s => s.key === focusDeal.status)?.label}</div>
                  <div>Приоритет: <span style={{ color: PRIORITY_COLORS[focusDeal.priority] }}>{PRIORITY_LABELS[focusDeal.priority]}</span></div>
                  <div>Прогресс: {focusDeal.progress}%</div>
                  {focusDeal.deadline && <div>Дедлайн: {new Date(focusDeal.deadline).toLocaleDateString('ru')}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
                  {focusDeal.status === 'new' && (
                    <ActionButton primary onClick={() => updateDealStatus(focusDeal.id, 'qualification')}>На квалификацию</ActionButton>
                  )}
                  {focusDeal.status === 'qualification' && (
                    <ActionButton primary onClick={() => updateDealStatus(focusDeal.id, 'proposal')}>Предложить</ActionButton>
                  )}
                  {focusDeal.status === 'proposal' && (
                    <ActionButton primary onClick={() => updateDealStatus(focusDeal.id, 'negotiation')}>В переговоры</ActionButton>
                  )}
                  {focusDeal.status === 'negotiation' && (
                    <>
                      <ActionButton primary onClick={() => updateDealStatus(focusDeal.id, 'won')}>Успешно закрыто</ActionButton>
                      <ActionButton onClick={() => updateDealStatus(focusDeal.id, 'lost')} style={{ backgroundColor: '#FEE2E2', color: '#B91C1C' }}>Закрыть с проигрышем</ActionButton>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                  <ActionButton onClick={() => setFocusDeal(null)}>Закрыть</ActionButton>
                </div>
              </div>
            </div>
          )}

          {notification.show && (
            <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1100, background: 'white', borderRadius: 14, padding: '16px 24px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', color: '#1F2E23', border: '1px solid #E5F0E8' }}>
              {notification.message}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
