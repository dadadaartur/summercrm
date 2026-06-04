import { useEffect, useState } from 'react'
import Head from 'next/head'

export default function CRM() {
  const [calls, setCalls] = useState(0)

  // Инициализация листьев и облаков (без изменений)
  useEffect(() => {
    const leafContainer = document.getElementById('leafContainer')
    const windButton = document.getElementById('windButton')
    let leafInterval = null

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
      const fill = colors[Math.floor(Math.random() * colors.length)]
      leaf.innerHTML = `
        <path d="M15 3C15 3 7 9 7 16C7 23 15 26 15 26C15 26 23 23 23 16C23 9 15 3 15 3Z" 
              fill="${fill}" opacity="0.8" stroke="#4CAF6A" stroke-width="1.5"/>
        <line x1="15" y1="26" x2="15" y2="29" stroke="#4CAF6A" stroke-width="1.5"/>
      `
      leafContainer.appendChild(leaf)
      setTimeout(() => { if (leaf.parentNode) leaf.remove() }, duration * 1000 + 500)
    }

    function startLeafFall(durationMs, frequencyMs = 180) {
      if (leafInterval) clearInterval(leafInterval)
      leafInterval = setInterval(createLeaf, frequencyMs)
      setTimeout(() => { clearInterval(leafInterval); leafInterval = null }, durationMs)
    }

    startLeafFall(5000, 200)

    windButton?.addEventListener('click', () => {
      if (leafInterval) { clearInterval(leafInterval); leafInterval = null }
      startLeafFall(10000, 150)
    })

    return () => clearInterval(leafInterval)
  }, [])

  const addCall = () => {
    setCalls(prev => prev + 1)
  }

  return (
    <div className="crm-wrapper">
      <Head><title>CRM Весна</title></Head>

      {/* Облака */}
      <div className="cloud-bg">
        <div className="cloud cloud1"></div>
        <div className="cloud cloud2"></div>
        <div className="cloud cloud3"></div>
      </div>

      {/* Листопад */}
      <div className="leaf-container" id="leafContainer" />

      {/* Кнопка ветра */}
      <div className="wind-btn" id="windButton" title="Вызвать лёгкий ветер">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2C12 2 6 7 6 12C6 17 12 20 12 20C12 20 18 17 18 12C18 7 12 2 12 2Z" strokeLinecap="round"/>
          <line x1="12" y1="20" x2="12" y2="22" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Маленькая ссылка "Моя любимая планета Земля" */}
      <a href="/planet" className="planet-link">Моя любимая планета Земля</a>

      {/* Логотип */}
      <div style={{ position: 'fixed', top: 12, left: 24, zIndex: 1000, fontWeight: 700, color: '#2D6A4F' }}>
        CRM Весна
      </div>

      {/* Сайдбар */}
      <div className="sidebar">
        <div className="user-panel">
          <svg className="avatar-svg" viewBox="0 0 52 52" fill="none">
            <rect width="52" height="52" rx="16" fill="url(#av-grad)"/>
            <circle cx="26" cy="20" r="8" fill="white" opacity="0.9"/>
            <ellipse cx="26" cy="40" rx="14" ry="8" fill="white" opacity="0.7"/>
            <defs>
              <linearGradient id="av-grad" x1="0" y1="0" x2="52" y2="52">
                <stop offset="0%" stopColor="#A3E0B0"/>
                <stop offset="100%" stopColor="#4CAF6A"/>
              </linearGradient>
            </defs>
          </svg>
          <div>
            <div className="username">Артур</div>
            <div className="user-role">Менеджер</div>
          </div>
        </div>
        <div className="balance">
          <div className="balance-item">
            <div className="balance-icon">
              <svg viewBox="0 0 32 32" fill="none"><path d="M16 4C16 4 8 10 8 18C8 26 16 28 16 28C16 28 24 26 24 18C24 10 16 4 16 4Z" stroke="#4CAF6A" strokeWidth="2" fill="#A3E0B0" fillOpacity="0.3"/><path d="M13 12L16 15L19 12" stroke="#4CAF6A" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
            <div className="balance-info"><span className="balance-value karma-color">1 250</span><span className="balance-label">Кармики</span></div>
          </div>
          <div className="balance-item">
            <div className="balance-icon">
              <svg viewBox="0 0 32 32" fill="none"><path d="M18 4L10 16H16L14 28L24 13H17L18 4Z" stroke="#F4B860" strokeWidth="2" fill="#F4B860" fillOpacity="0.2"/></svg>
            </div>
            <div className="balance-info"><span className="balance-value energy-color">340</span><span className="balance-label">Энергия</span></div>
          </div>
          <div className="balance-item">
            <div className="balance-icon">
              <svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="12" stroke="#F28B82" strokeWidth="2"/><text x="16" y="21" textAnchor="middle" fill="#F28B82" fontSize="14" fontWeight="700">₽</text></svg>
            </div>
            <div className="balance-info"><span className="balance-value rubles-color">15 200</span><span className="balance-label">Бонус (₽)</span></div>
          </div>
        </div>
      </div>

      {/* Основной контент */}
      <div className="main-content">
        <div className="left-col">
          <div className="actions">
            <button className="action-btn primary">Новая сделка</button>
            <button className="action-btn" onClick={addCall}>Звонок</button>
            <button className="action-btn">Письмо</button>
            <button className="action-btn">Встреча</button>
          </div>

          <div className="panel">
            <h3>Воронка продаж</h3>
            <div className="funnel-stage"><span className="stage-name">Новые</span><div className="stage-bar"><div className="stage-fill" style={{width:'80%'}}></div></div><span className="stage-count">12 сделок</span></div>
            <div className="funnel-stage"><span className="stage-name">Квалификация</span><div className="stage-bar"><div className="stage-fill" style={{width:'55%'}}></div></div><span className="stage-count">8 сделок</span></div>
            <div className="funnel-stage"><span className="stage-name">Предложение</span><div className="stage-bar"><div className="stage-fill" style={{width:'40%'}}></div></div><span className="stage-count">5 сделок</span></div>
            <div className="funnel-stage"><span className="stage-name">Переговоры</span><div className="stage-bar"><div className="stage-fill" style={{width:'25%'}}></div></div><span className="stage-count">3 сделки</span></div>
            <div className="funnel-stage"><span className="stage-name">Закрыто</span><div className="stage-bar"><div className="stage-fill" style={{width:'15%'}}></div></div><span className="stage-count">2 сделки</span></div>
          </div>

          <div className="panel" style={{flex:1}}>
            <h3>Активность команды</h3>
            <div className="activity-item"><div className="activity-text">Петров позвонил клиенту и получил <span className="activity-highlight" style={{color:'#4CAF6A'}}>+5 кармиков</span></div><div className="activity-time">5 мин назад</div></div>
            <div className="activity-item"><div className="activity-text">Иванова закрыла сделку на 500 000 ₽ и получила <span className="activity-highlight" style={{color:'#4CAF6A'}}>+50 кармиков</span> <span className="activity-highlight" style={{color:'#F28B82'}}>+5 000 ₽</span></div><div className="activity-time">12 мин назад</div></div>
            <div className="activity-item"><div className="activity-text">Сидоров ответил на письмо клиента <span className="activity-highlight" style={{color:'#4CAF6A'}}>+3 кармика</span></div><div className="activity-time">22 мин назад</div></div>
          </div>
        </div>
        <div className="right-col">
          <div className="panel" style={{flex:1}}>
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
  )
}
