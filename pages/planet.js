import { useEffect } from 'react'

export default function PlanetPage() {
  useEffect(() => {
    // ===== ЗВЁЗДЫ =====
    const starsContainer = document.getElementById('starsContainer')
    const colors = ['#ffffff', '#e0f0ff', '#fbbf24', '#c084fc']
    for (let i = 0; i < 80; i++) {
      const star = document.createElement('div')
      star.className = 'star'
      const size = Math.random() * 3 + 1
      star.style.width = size + 'px'
      star.style.height = size + 'px'
      star.style.left = Math.random() * 100 + '%'
      star.style.top = Math.random() * 100 + '%'
      star.style.background = colors[Math.floor(Math.random() * colors.length)]
      star.style.animationDelay = Math.random() * 3 + 's'
      starsContainer.appendChild(star)
    }

    // ===== ВОПРОСЫ =====
    const QUESTIONS = [
      {
        question: "Какой газ поглощают растения и выделяют кислород?",
        options: ["Азот", "Кислород", "Углекислый газ", "Водород"],
        correct: 2
      },
      {
        question: "Сколько процентов поверхности Земли покрыто водой?",
        options: ["Около 50%", "Около 30%", "Около 90%", "Около 71%"],
        correct: 3
      },
      {
        question: "Какого числа отмечается Международный день Земли?",
        options: ["1 января", "8 марта", "22 апреля", "5 июня"],
        correct: 2
      },
      {
        question: "Что означает «вторая жизнь» вещей?",
        options: ["Сжигание", "Захоронение", "Переработка", "Выбрасывание"],
        correct: 2
      },
      {
        question: "Какое простое действие помогает сохранить природу?",
        options: ["Вырубка лесов", "Загрязнение рек", "Использование пластика", "Экономия воды"],
        correct: 3
      }
    ]

    let timerInterval,
        timeLeft = 30,
        currentQuestion = 0,
        totalPoints = 0,
        gameActive = false

    function switchScreen(id) {
      document.querySelectorAll('.game-screen').forEach(s => s.style.display = 'none')
      document.getElementById(id).style.display = 'block'
    }

    function startGame() {
      currentQuestion = 0
      totalPoints = 0
      gameActive = true
      document.getElementById('hostComment').style.display = 'none'
      switchScreen('gameScreen')
      loadQuestion()
    }

    function loadQuestion() {
      if (currentQuestion >= QUESTIONS.length) {
        endGame(true)
        return
      }
      const q = QUESTIONS[currentQuestion]
      document.getElementById('questionNum').textContent = currentQuestion + 1
      document.getElementById('questionText').textContent = q.question
      document.getElementById('points').textContent = totalPoints
      const btns = document.querySelectorAll('#optionsGrid .option-btn')
      btns.forEach((btn, idx) => {
        btn.textContent = q.options[idx]
        btn.className = 'option-btn'
        btn.disabled = false
        btn.onclick = () => answerQuestion(idx)
      })
      startTimer()
    }

    function startTimer() {
      timeLeft = 30
      document.getElementById('timer').textContent = timeLeft
      clearInterval(timerInterval)
      timerInterval = setInterval(() => {
        timeLeft--
        document.getElementById('timer').textContent = timeLeft
        if (timeLeft <= 0) {
          clearInterval(timerInterval)
          timeOut()
        }
      }, 1000)
    }

    function timeOut() {
      gameActive = false
      showHostComment('⏰ Время вышло! Игра окончена.')
      setTimeout(() => endGame(false), 1500)
    }

    async function answerQuestion(selected) {
      if (!gameActive) return
      clearInterval(timerInterval)
      gameActive = false
      const q = QUESTIONS[currentQuestion]
      const btns = document.querySelectorAll('#optionsGrid .option-btn')
      btns.forEach(b => b.disabled = true)

      if (selected === q.correct) {
        btns[selected].classList.add('correct')
        const points = 100 + timeLeft * 5
        totalPoints += points
        document.getElementById('points').textContent = totalPoints
        showHostComment(`✅ Правильно! +${points} баллов за скорость.`)
        currentQuestion++
        setTimeout(() => {
          gameActive = true
          loadQuestion()
        }, 1500)
      } else {
        btns[selected].classList.add('wrong')
        btns[q.correct].classList.add('correct')
        showHostComment('❌ Неправильно. Но не расстраивайся, попробуй снова!')
        setTimeout(() => endGame(false), 2000)
      }
    }

    function showHostComment(text) {
      const host = document.getElementById('hostComment')
      host.innerHTML = `<div class="host-avatar">🌍</div><p>${text}</p>`
      host.style.display = 'flex'
    }

    function endGame(won) {
      clearInterval(timerInterval)
      document.getElementById('finalScore').textContent = totalPoints
      document.getElementById('resultTitle').textContent = won ? '🎉 Поздравляем!' : 'Конец игры'
      document.getElementById('resultMessage').innerHTML = `<div class="host-avatar">🌍</div><p>Ты набрал ${totalPoints} баллов. ${won ? 'Отличный результат!' : 'Приходи ещё!'}</p>`
      updateRating()
      switchScreen('resultScreen')
    }

    function updateRating() {
      let rating = JSON.parse(localStorage.getItem('planetRating') || '[]')
      const login = localStorage.getItem('karmabank_login') || 'Гость'
      rating.push({ name: login, points: totalPoints, date: new Date().toLocaleDateString('ru-RU') })
      rating.sort((a, b) => b.points - a.points)
      rating = rating.slice(0, 10)
      localStorage.setItem('planetRating', JSON.stringify(rating))
      const table = document.getElementById('ratingTable')
      table.innerHTML = rating.map((r, i) => `<tr><td>${i+1}</td><td>${r.name}</td><td>${r.points}</td><td>${r.date}</td></tr>`).join('')
    }

    // Инициализация рейтинга при загрузке
    ;(function loadRating() {
      const rating = JSON.parse(localStorage.getItem('planetRating') || '[]')
      document.getElementById('ratingTable').innerHTML = rating.map((r, i) => `<tr><td>${i+1}</td><td>${r.name}</td><td>${r.points}</td><td>${r.date}</td></tr>`).join('')
    })()

    // Привязываем глобальную функцию для кнопки «Начать игру»
    window.startGame = startGame

    // Очистка интервала при уходе со страницы
    return () => clearInterval(timerInterval)
  }, [])

  return (
    <>
      <style jsx global>{`
        :root {
          --bg-primary: #0a1628; --bg-secondary: #0f1f35; --bg-card: #152238;
          --text-primary: #eaf0fb; --text-secondary: #9aa9c1; --accent: #f97316;
          --success: #10b981; --warning: #f59e0b; --border: #1f3350;
          --hologram-glow: 0 0 8px rgba(249,115,22,0.6), 0 0 16px rgba(192,132,252,0.4);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Inter', sans-serif;
          background: radial-gradient(ellipse at 30% 40%, #0f1f35 0%, #0a1628 70%);
          color: var(--text-primary); min-height: 100vh; display: flex;
          align-items: center; justify-content: center; padding: 20px;
          position: relative; overflow-x: hidden;
        }
        .stars {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          z-index: 0; pointer-events: none;
        }
        .star {
          position: absolute; background: white; border-radius: 50%;
          animation: twinkle 2s infinite alternate; opacity: 0.7;
        }
        @keyframes twinkle {
          0% { opacity: 0.3; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1.2); box-shadow: 0 0 6px #f97316, 0 0 12px #c084fc; }
        }
        .game-container {
          max-width: 700px; width: 100%; position: relative; z-index: 2;
          background: radial-gradient(circle at 20% 30%, #1a2f4a 0%, #0f1f35 100%);
          border: 1px solid var(--accent); border-radius: 32px; padding: 40px 30px;
          box-shadow: 0 0 60px rgba(249,115,22,0.6);
          text-align: center; animation: fadeInUp 0.6s ease;
        }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        .game-screen { display: none; }
        .game-screen.active { display: block; }
        h2 {
          font-size: 2rem; font-weight: 800; margin-bottom: 12px;
          background: linear-gradient(135deg, #f97316, #c084fc);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .host-message {
          background: rgba(21,38,56,0.6); border: 1px solid var(--border);
          border-radius: 16px; padding: 16px; margin: 20px 0;
          display: flex; align-items: center; gap: 12px;
        }
        .host-avatar {
          width: 40px; height: 40px; background: var(--accent); border-radius: 50%;
          display: flex; align-items: center; justify-content: center; font-size: 1.2rem;
        }
        .question-card {
          background: radial-gradient(circle at 20% 30%, #1a2a45 0%, #0a1628 70%);
          border: 1px solid var(--border); border-radius: 20px;
          padding: 24px; margin: 20px 0; font-size: 1.1rem; font-weight: 600;
        }
        .options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 20px 0; }
        .option-btn {
          background: transparent; border: 1px solid var(--border); border-radius: 16px;
          padding: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s;
          color: var(--text-primary); font-size: 1rem;
        }
        .option-btn:hover { border-color: var(--accent); box-shadow: var(--hologram-glow); }
        .option-btn.correct { background: var(--success); border-color: var(--success); color: white; }
        .option-btn.wrong { background: #ef4444; border-color: #ef4444; color: white; }
        .timer {
          font-size: 2rem; font-weight: 800; color: var(--warning); margin: 12px 0;
        }
        .score {
          font-size: 1.2rem; margin: 8px 0;
        }
        .score span { color: var(--accent); font-weight: 700; }
        .btn {
          background: transparent; border: 1px solid var(--accent); border-radius: 40px;
          padding: 12px 36px; font-weight: 800; font-size: 1rem; cursor: pointer;
          transition: all 0.3s; background: linear-gradient(135deg, #f97316, #c084fc);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .btn:hover { border-color: #c084fc; box-shadow: var(--hologram-glow); transform: scale(1.03); }
        .rating-table {
          width: 100%; border-collapse: collapse; margin: 20px 0;
        }
        .rating-table th, .rating-table td {
          padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border);
        }
        .rating-table th { color: var(--text-secondary); font-weight: 500; font-size: 0.85rem; }
        .back-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: transparent; border: 1px solid var(--border); color: var(--text-secondary);
          padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 0.85rem;
          text-decoration: none; margin-top: 20px;
        }
        .back-btn:hover { background: var(--border); color: var(--text-primary); }
      `}</style>

      <div className="stars" id="starsContainer"></div>
      <div className="game-container">
        {/* Стартовый экран */}
        <div className="game-screen active" id="startScreen">
          <h2>Моя любимая планета Земля</h2>
          <div className="host-message">
            <div className="host-avatar">🌍</div>
            <p>Добро пожаловать в викторину о природе и экологии! Проверь свои знания о нашей планете. 5 вопросов — и ты в рейтинге!</p>
          </div>
          <button className="btn" onClick={() => window.startGame()}>Начать игру</button>
        </div>

        {/* Экран игры */}
        <div className="game-screen" id="gameScreen">
          <div className="timer" id="timer">30</div>
          <div className="score">Вопрос <span id="questionNum">1</span> из 5 • Баллов: <span id="points">0</span></div>
          <div className="question-card" id="questionText">Загрузка вопроса...</div>
          <div className="options-grid" id="optionsGrid">
            <button className="option-btn">A</button>
            <button className="option-btn">B</button>
            <button className="option-btn">C</button>
            <button className="option-btn">D</button>
          </div>
          <div className="host-message" id="hostComment" style={{display:'none'}}></div>
        </div>

        {/* Экран результата */}
        <div className="game-screen" id="resultScreen">
          <h2 id="resultTitle"></h2>
          <div className="host-message" id="resultMessage"></div>
          <div className="score" style={{fontSize:'1.5rem'}}>Итоговый балл: <span id="finalScore">0</span></div>
          <button className="btn" onClick={() => window.startGame()}>Играть снова</button>
          <h3 style={{marginTop:24}}>🏆 Рейтинг</h3>
          <table className="rating-table" id="ratingTable"></table>
          <a href="/" className="back-btn">← Назад в CRM</a>
        </div>
      </div>
    </>
  )
}
