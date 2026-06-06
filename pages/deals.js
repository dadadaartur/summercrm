// ... (импорты)

export default function DealsPage() {
  // ... (состояния и эффекты)

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

      {/* остальной контент сделок */}
    </>
  )
}
