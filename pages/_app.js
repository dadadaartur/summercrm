import '../styles/globals.css'

export default function App({ Component, pageProps }) {
  return (
    <>
      <style jsx global>{`
        /* Убираем мигающую каретку везде */
        * {
          caret-color: transparent !important;
        }

        /* Возвращаем каретку только в поля ввода */
        input, textarea, [contenteditable="true"] {
          caret-color: #4CAF6A !important;
        }
      `}</style>
      <Component {...pageProps} />
    </>
  )
}
