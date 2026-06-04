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

  // Листопад и облака
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
      windButton.onclick = () => { clearInterval(leafInterval); leafInterval = setInterval(createLeaf, 150); setTimeout(() => clearInterval(leafInterval), 10000) }
    }
    return () => clearInterval(leafInterval)
  }, [])

  const addCall = async () => { /* без изменений */ }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', background:'#E8F4FD' }}>Загрузка...</div>
  if (needsLogin) return ( /* статичная страница входа, как раньше */ )

  const displayName = profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : user?.email
  const positionTitle = profile?.positions?.title || 'Сотрудник'

  // Мини‑дашборд
  const activeTasksCount = tasks.length
  const potentialEarn = tasks.reduce((sum, a) => sum + (a.tasks?.reward_karma || 0), 0)

  return (
    <>
      {/* Верхняя панель */}
      <div className="crm-topbar">
        <div className="topbar-logo">CRM Лето</div>
        <div className="topbar-right">
          <a className="planet-link" href="/planet">Моя любимая планета Земля</a>
          <a className="topbar-name" href="https://arthurcrm.vercel.app/profile" target="_blank" rel="noopener noreferrer">
            {displayName}
          </a>
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

        {/* Сайдбар */}
        <div className="sidebar">
          <div className="balance-item">
            <div className="balance-icon">
              <svg viewBox="0 0 32 32" fill="none"><path d="M16 4C16 4 8 10 8 18C8 26 16 28 16 28C16 28 24 26 24 18C24 10 16 4 16 4Z" stroke="#4CAF6A" strokeWidth="2" fill="#A3E0B0" fillOpacity="0.3"/><path d="M13 12L16 15L19 12" stroke="#4CAF6A" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
            <div className="balance-info"><span className="balance-value karma-color">{balance}</span><span className="balance-label">Кармики</span></div>
          </div>

          {/* Мини‑дашборд */}
          <div className="dash-mini">
            <div className="dash-row"><span>Заданий CRM</span><span>{activeTasksCount}</span></div>
            <div className="dash-row"><span>Можно заработать</span><span style={{color: '#4CAF6A'}}>+{potentialEarn}</span></div>
            <div className="dash-row"><span>Звонков сегодня</span><span>{calls}</span></div>
          </div>

          {/* Цели (день / неделя / месяц) */}
          {goals.length > 0 && (
            <div className="dash-mini">
              {goals.map(g => (
                <div key={g.id} className="dash-row">
                  <span>{g.title} ({g.period})</span>
                  <span>{g.current_value}/{g.target_value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Основной контент – без изменений */}
        <div className="main-content">
          {/* ... всё как в предыдущем index.js ... */}
        </div>
      </div>
    </>
  )
}
