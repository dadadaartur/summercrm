import '../styles/globals.css'

export default function App({ Component, pageProps }) {
  return (
    <>
      {/* Глобальные стили, которые точно применятся */}
      <style jsx global>{`
        /* Железное отключение мигающих курсоров */
        html, body, div, span, p, h1, h2, h3, h4, h5, h6, a, button, svg,
        li, ul, ol, table, tr, td, th, section, header, footer, nav, aside,
        main, article, form, label, input[type="checkbox"], input[type="radio"],
        select, option, textarea, [contenteditable="false"] {
          cursor: default !important;
        }

        input[type="text"], input[type="email"], input[type="password"],
        input[type="number"], input[type="search"], input[type="tel"],
        input[type="url"], textarea, [contenteditable="true"] {
          cursor: text !important;
        }

        a, button, .action-btn, .wind-btn, .topbar-logo-link, .nav-link,
        .quick-templates-btn, .chat-send-btn, .deal-card, .modal-overlay,
        .chat-load-more, .chat-tab, .chat-template-btn, .chat-action-btn,
        .quick-template-btn, .hotkey-item {
          cursor: pointer !important;
        }

        /* Метрики не будут перекрывать навигацию */
        .metrics-widget {
          top: 110px !important;
          right: 20px !important;
          max-width: 220px !important;
          background: rgba(255,255,255,0.9) !important;
          border: 1px solid #E5F0E8 !important;
          border-radius: 16px !important;
          padding: 12px 16px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important;
          display: flex !important;
          gap: 16px !important;
          font-size: 12px !important;
          backdrop-filter: blur(4px) !important;
        }

        /* На узких экранах правая панель чата скрыта */
        @media (max-width: 900px) {
          .chat-right-panel {
            display: none !important;
          }
        }
      `}</style>
      <Component {...pageProps} />
    </>
  )
}
