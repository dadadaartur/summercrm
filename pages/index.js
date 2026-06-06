import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../lib/supabaseClient'

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
  }

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

  // ===== ЛИСТОПАД И ОБЛАКА =====
  useEffect(() => {
    const leafContainer = document.getElementById('leafContainer')
    if (!leafContainer) return
    let leafInterval

    function createLeaf() {
      const leaf = document.createElementNS("http://www.w3.org/2000/svg", "svg")
      leaf.setAttribute("viewBox", "0 0 30 30")
      leaf.classList.add("leaf")
      leaf.style.left = Math.random() * 100 + "%"
      const duration = 8 + Math.random() * 4
      leaf.style.animationDuration = duration + "s"
      const size = Math.random() * 22 + 18
      leaf.setAttribute("width", size)
      leaf.setAttribute("height", size)
      const colors = ['#7AC78F', '#4CAF6A', '#A3E0B0', '#F4B860', '#F28B82', '#FFD700']
      leaf.innerHTML = `<path d="M15 3C15 3 7 9 7 16C7 23 15 26 15 26C15 26 23 23 23 16C23 9 15 3 15 3Z" fill="${colors[Math.floor(Math.random() * colors.length)]}" opacity="0.8" stroke="#4CAF6A" stroke-width="1.5"/><line x1="15" y1="26" x2="15" y2="29" stroke="#4CAF6A" stroke-width="1.5"/>`
      leafContainer.appendChild(leaf)
      setTimeout(() => { if (leaf.parentNode) leaf.remove() }, duration * 1000 + 500)
    }

    leafInterval = setInterval(createLeaf, 200)
    setTimeout(() => clearInterval(leafInterval), 5000)

    const windButton = document.getElementById('windButton')
    if (windButton) {
      windButton.onclick = () => {
        clearInterval(leafInterval)
        leafInterval = setInterval(createLeaf, 150)
        setTimeout(() => clearInterval(leafInterval), 10000)
      }
    }

    return () => clearInterval(leafInterval)
  }, [])

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', background:'#E8F4FD' }}>Загрузка...</div>

  if (needsLogin) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#E8F4FD' }}>
        <div style={{ textAlign: 'center', background: 'white', padding: '48px', borderRadius: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h2 style={{ marginBottom: '16px', fontWeight: 600, color: '#2D6A4F' }}>Добро пожаловать в CRM Лето</h2>
          <p style={{ marginBottom: '24px', color: '#5B7465' }}>Для работы с CRM необходимо авторизоваться в Кармическом банке</p>
          <a href="https://arthurcrm.vercel.app/login?message=Для+доступа+в+CRM+авторизуйтесь+в+Кармическом+банке"
             style={{ display: 'inline-block', background: '#4CAF6A', color: 'white', padding: '12px 32px', borderRadius: '14px', textDecoration: 'none', fontWeight: 500 }}>
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
        <div className="topbar-logo">CRM Лето</div>
        <div className="topbar-right">
          <a className="planet-link" href="/planet">Моя любимая планета Земля</a>
          <a href="/deals" style={{ marginLeft: 12, background: 'transparent', color: '#4CAF6A', border: '1px solid #4CAF6A', borderRadius: 8, padding: '6px 14px', fontSize: 13, textDecoration: 'none' }}>Сделки</a>
          <a className="topbar-name" href="https://arthurcrm.vercel.app/profile" target="_blank" rel="noopener noreferrer">{displayName}</a>
        </div>
      </div>

      <div className="crm-wrapper">
        <Head>
          <title>CRM Лето</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        </Head>

        <div className="cloud-bg">
          <div className="cloud cloud1"></div>
          <div className="cloud cloud2"></div>
          <div className="cloud cloud3"></div>
        </div>
        <div className="leaf-container" id="leafContainer" />
        <div className="wind-btn" id="windButton" title="Вызвать лёгкий ветер">
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
              <button className="action-btn primary">Новая сделка</button>
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
    </>
  )
}
