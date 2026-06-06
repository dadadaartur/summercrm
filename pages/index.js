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
    const [{ data: profileData }, { data: balanceData }, { data: taskAssignments }, { data: goalsData }] = await Promise.all([
      supabase.from('profiles').select('first_name, last_name, avatar_url, position_id, positions(title)').eq('user_id', userId).single(),
      supabase.from('karma_balance').select('balance').eq('user_id', userId).single(),
      supabase.from('task_assignments').select('id, status, task_id, tasks!inner(id, title, reward_karma, crm_action_type, crm_target_count)').eq('user_id', userId).eq('status', 'in_progress').eq('tasks.task_type', 'auto_crm'),
      supabase.from('goals').select('*').eq('user_id', userId).eq('is_active', true).order('period')
    ])
    if (profileData) setProfile(profileData)
    if (balanceData) setBalance(balanceData.balance)
    if (taskAssignments) setTasks(taskAssignments)
    if (goalsData) setGoals(goalsData)
    const savedCalls = localStorage.getItem(`crm_calls_${userId}`)
    if (savedCalls) setCalls(parseInt(savedCalls))
    setLoading(false)

    const timeout = setTimeout(() => setWindActive(true), 10 * 60 * 1000)
    return () => clearTimeout(timeout)
  }

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

  const handleCreateDeal = async () => {
    if (!newDeal.title.trim()) return
    const { error } = await supabase.from('deals').insert({
      company_id: profile.company_id,
      title: newDeal.title,
      description: newDeal.description,
      client_name: newDeal.client_name,
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
    alert('Сделка создана')
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
        <span className="nav-link" style={{ cursor: 'pointer' }}>Звонки</span>
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

        <div className="sidebar">
          {/* баланс и мини-дашборд без изменений */}
          <div className="balance-item">...</div>
          <div className="dash-mini">...</div>
          {goals.length > 0 && (<div className="dash-mini">...</div>)}
        </div>

        <div className="main-content">
          {/* здесь твоя основная вёрстка главной страницы (воронка, задания, цели) */}
        </div>
      </div>
    </>
  )
}
