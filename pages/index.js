import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'

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

export default function CRM() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [balance, setBalance] = useState(0)
  const [tasks, setTasks] = useState([])
  const [calls, setCalls] = useState(0)
  const [loading, setLoading] = useState(true)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [goals, setGoals] = useState([])

  const [showCreateModal, setShowCreateModal] = useState(false)
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

  const [windActive, setWindActive] = useState(false)

  useEffect(() => {
    if (!router.isReady) return
    const init = async () => {
      const accessToken = router.query.access_token
      const refreshToken = router.query.refresh_token
      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (error || !data.user) { setNeedsLogin(true); setLoading(false); return }
        setUser(data.user)
        await loadAll(data.user.id)
        router.replace('/')
        return
      }
      const { data: { user: existingUser } } = await supabase.auth.getUser()
      if (!existingUser) { setNeedsLogin(true); setLoading(false); return }
      setUser(existingUser)
      await loadAll(existingUser.id)
    }
    init()
  }, [router.isReady, router.query])

  const loadAll = async (userId) => {
    try {
      // 1. Сначала загружаем профиль
      const { data: profileData } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url, position_id, positions(title)')
        .eq('user_id', userId)
        .single()

      if (!profileData) {
        setNeedsLogin(true)
        setLoading(false)
        return
      }
      setProfile(profileData)

      // 2. Параллельно загружаем всё остальное, используя company_id из профиля
      const companyId = profileData.company_id
      const [{ data: balanceData }, { data: taskAssignments }, { data: goalsData }, { data: employeesData }] = await Promise.all([
        supabase.from('karma_balance').select('balance').eq('user_id', userId).single(),
        supabase.from('task_assignments').select('id, status, task_id, tasks!inner(id, title, reward_karma, crm_action_type, crm_target_count)').eq('user_id', userId).eq('status', 'in_progress').eq('tasks.task_type', 'auto_crm'),
        supabase.from('goals').select('*').eq('user_id', userId).eq('is_active', true).order('period'),
        supabase.from('profiles').select('user_id, display_name, email').eq('company_id', companyId).not('role_id', 'in', '(1,2)').is('deleted_at', null)
      ])

      if (balanceData) setBalance(balanceData.balance)
      if (taskAssignments) setTasks(taskAssignments)
      if (goalsData) setGoals(goalsData)
      if (employeesData) setEmployees(employeesData)

      const savedCalls = localStorage.getItem(`crm_calls_${userId}`)
      if (savedCalls) setCalls(parseInt(savedCalls))

      setLoading(false)

      // Запускаем таймер облаков
      const timeout = setTimeout(() => setWindActive(true), 10 * 60 * 1000)
      return () => clearTimeout(timeout)
    } catch (error) {
      console.error('Ошибка загрузки данных:', error)
      setLoading(false)
    }
  }

  // ... (useEffect для облаков, addProgress, addCall, validateDealForm, handleCreateDeal — всё остаётся без изменений, как в предыдущем полном файле)

  // Ниже полный код с уже вставленными функциями
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

  const addProgress = async (goalId, currentVal) => {
    const newVal = currentVal + 1
    const goal = goals.find(g => g.id === goalId)
    if (!goal || newVal > goal.target_value) return

    const updates = { current_value: newVal, updated_at: new Date().toISOString() }
    if (newVal >= goal.target_value) {
      updates.is_active = false
      if (goal.reward_karma > 0) {
        await supabase.from('karma_transactions').insert({
          user_id: user.id, amount: goal.reward_karma, type: 'goal_reward',
          description: `Достижение цели: ${goal.title}`
        })
        const { data: bal } = await supabase.from('karma_balance').select('balance').eq('user_id', user.id).single()
        if (bal) await supabase.from('karma_balance').update({ balance: bal.balance + goal.reward_karma }).eq('user_id', user.id)
      }
    }
    const { error } = await supabase.from('goals').update(updates).eq('id', goalId)
    if (!error) {
      setGoals(prev => prev.map(g => g.id === goalId ? { ...g, ...updates } : g).filter(g => g.is_active))
      if (updates.is_active === false) alert('Цель достигнута! Награда начислена.')
    }
  }

  const addCall = async () => {
    const newCalls = calls + 1
    setCalls(newCalls)
    localStorage.setItem(`crm_calls_${user.id}`, newCalls.toString())
    for (const goal of goals.filter(g => g.goal_type === 'calls' && g.is_active)) {
      if (newCalls > goal.current_value) {
        await addProgress(goal.id, goal.current_value)
      }
    }
    for (const assignment of tasks) {
      const t = assignment.tasks
      if (t && t.crm_action_type === 'call' && newCalls >= t.crm_target_count) {
        await supabase.from('task_assignments').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', assignment.id)
      }
    }
    const { data: updatedAssignments } = await supabase.from('task_assignments').select('id, status, task_id, tasks(id, title, reward_karma, crm_action_type, crm_target_count)').eq('user_id', user.id).eq('status', 'in_progress').eq('tasks.task_type', 'auto_crm')
    if (updatedAssignments) setTasks(updatedAssignments)
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

    const { error } = await supabase.from('deals').insert({
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
    if (error) {
      alert('Ошибка создания сделки')
      return
    }
    setShowCreateModal(false)
    setNewDeal({ title: '', description: '', client_name: '', amount: '', priority: 'medium', deadline: '', responsible_user_id: '' })
    setFormErrors({})
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
  const activeTasksCount = tasks.length
  const potentialEarn = tasks.reduce((sum, a) => sum + (a.tasks?.reward_karma || 0), 0)

  return (
    <>
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
        <Head>
          <title>CRM Лето</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        </Head>

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
            <div className="dash-row"><span>Заданий CRM</span><span>{activeTasksCount}</span></div>
            <div className="dash-row"><span>Можно заработать</span><span style={{color:'#4CAF6A'}}>+{potentialEarn}</span></div>
            <div className="dash-row"><span>Звонков сегодня</span><span>{calls}</span></div>
          </div>

          {goals.length > 0 && (
            <div className="dash-mini">
              {goals.map(goal => (
                <div key={goal.id} className="dash-row">
                  <span>{goal.title} ({goal.period})</span>
                  <span>{goal.current_value}/{goal.target_value}</span>
                  <button onClick={() => addProgress(goal.id, goal.current_value)} className="text-xs text-green-400 hover:text-green-300 ml-2">+</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="main-content">
          <div className="left-col">
            <div className="actions">
              <button className="action-btn primary" onClick={() => setShowCreateModal(true)}>Новая сделка</button>
              <button className="action-btn" onClick={addCall}>Звонок</button>
              <button className="action-btn">Письмо</button>
              <button className="action-btn">Встреча</button>
            </div>

            {tasks.length > 0 && (
              <div className="panel">
                <h3>Задания CRM</h3>
                {tasks.map(assignment => {
                  const t = assignment.tasks
                  return (
                    <div key={assignment.id} className="activity-item" style={{ borderBottom: '1px solid #E5F0E8', padding: '10px 0' }}>
                      <div className="activity-text">
                        <span className="font-medium">{t.title}</span>
                        <div className="text-xs" style={{ color: '#5B7465' }}>Звонков: {calls} из {t.crm_target_count}</div>
                      </div>
                      <span className="text-sm" style={{ color: '#4CAF6A', fontWeight: 600 }}>+{t.reward_karma}</span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="panel">
              <h3>Воронка продаж</h3>
              <div className="funnel-stage"><span className="stage-name">Новые</span><div className="stage-bar"><div className="stage-fill" style={{width:'80%'}}></div></div><span className="stage-count">12 сделок</span></div>
              <div className="funnel-stage"><span className="stage-name">Квалификация</span><div className="stage-bar"><div className="stage-fill" style={{width:'55%'}}></div></div><span className="stage-count">8 сделок</span></div>
              <div className="funnel-stage"><span className="stage-name">Предложение</span><div className="stage-bar"><div className="stage-fill" style={{width:'40%'}}></div></div><span className="stage-count">5 сделок</span></div>
              <div className="funnel-stage"><span className="stage-name">Переговоры</span><div className="stage-bar"><div className="stage-fill" style={{width:'25%'}}></div></div><span className="stage-count">3 сделки</span></div>
              <div className="funnel-stage"><span className="stage-name">Закрыто</span><div className="stage-bar"><div className="stage-fill" style={{width:'15%'}}></div></div><span className="stage-count">2 сделки</span></div>
            </div>
          </div>

          <div className="right-col">
            <div className="panel" style={{flex:1, display:'flex', flexDirection:'column'}}>
              <h3>Цели на сегодня</h3>
              <div style={{display:'flex', flexDirection:'column', gap:12}}>
                <div>
                  <div style={{display:'flex', justifyContent:'space-between', fontSize:14}}><span>Звонки</span><span>{calls}/50</span></div>
                  <div style={{height:8, background:'#F0F7F2', borderRadius:4, marginTop:4}}><div style={{width: `${Math.min(100, (calls/50)*100)}%`, height:'100%', background:'linear-gradient(90deg, #F4B860, #F28B82)', borderRadius:4}}></div></div>
                </div>
                <div>
                  <div style={{display:'flex', justifyContent:'space-between', fontSize:14}}><span>Письма</span><span>2/3</span></div>
                  <div style={{height:8, background:'#F0F7F2', borderRadius:4, marginTop:4}}><div style={{width:'66%', height:'100%', background:'linear-gradient(90deg, #F4B860, #F28B82)', borderRadius:4}}></div></div>
                </div>
                <div>
                  <div style={{display:'flex', justifyContent:'space-between', fontSize:14}}><span>Встречи</span><span>1/2</span></div>
                  <div style={{height:8, background:'#F0F7F2', borderRadius:4, marginTop:4}}><div style={{width:'50%', height:'100%', background:'linear-gradient(90deg, #F4B860, #F28B82)', borderRadius:4}}></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
    </>
  )
}
