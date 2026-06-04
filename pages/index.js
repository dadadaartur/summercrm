import Head from 'next/head'

export default function CRM() {
  return (
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

      <div className="top-logo">CRM Лето (тест)</div>

      <div className="sidebar">
        <div className="user-panel">
          <div>
            <div className="username">Тестовый пользователь</div>
            <div className="user-role">Сотрудник</div>
          </div>
        </div>
        <div className="balance">
          <div className="balance-item">
            <div className="balance-info"><span className="balance-value karma-color">100</span><span className="balance-label">Кармики</span></div>
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="left-col">
          <div className="actions">
            <button className="action-btn primary">Новая сделка</button>
            <button className="action-btn">Звонок</button>
            <button className="action-btn">Письмо</button>
            <button className="action-btn">Встреча</button>
          </div>
          <div className="panel">
            <h3>Воронка продаж</h3>
            <div className="funnel-stage"><span className="stage-name">Новые</span><div className="stage-bar"><div className="stage-fill" style={{width:'80%'}}></div></div><span className="stage-count">12 сделок</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
