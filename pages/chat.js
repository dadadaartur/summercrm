import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import DOMPurify from 'dompurify'; // Для санитизации HTML
import { supabase } from '../lib/supabaseClient';

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [sending, setSending] = useState(false); // Состояние отправки

  // Состояния чата
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [clientTyping, setClientTyping] = useState(false);
  const messagesEndRef = useRef(null);

  // Загрузка пользователя и создание/загрузка сессии чата
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser) {
          setNeedsLogin(true);
          setLoading(false);
          return;
        }
        setUser(currentUser);

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('first_name, last_name, company_id')
          .eq('user_id', currentUser.id)
          .single();

        if (profileError || !profileData?.company_id) {
          setNeedsLogin(true);
          setLoading(false);
          return;
        }
        setProfile(profileData);

        // Получаем ID клиента из параметров URL
        const clientId = router.query.clientId;

        // Найти или создать сессию чата с клиентом
        const { data: existingSessions, error: sessionError } = await supabase
          .from('chat_sessions')
          .select('id')
          .eq('company_id', profileData.company_id)
          .eq('client_id', clientId)
          .eq('operator_id', currentUser.id)
          .eq('status', 'active')
          .maybeSingle();

        if (sessionError) throw sessionError;

        if (existingSessions) {
          setSessionId(existingSessions.id);
          await loadMessages(existingSessions.id);
        } else {
          // Создаём новую сессию
          const { data: newSession, error: createError } = await supabase
            .from('chat_sessions')
            .insert({
              company_id: profileData.company_id,
              client_id: clientId,
              operator_id: currentUser.id,
              status: 'active',
              subject: 'Чат с клиентом'
            })
            .select()
            .single();
          if (createError) throw createError;
          if (newSession) setSessionId(newSession.id);
        }

        setLoading(false);
      } catch (error) {
        console.error('Ошибка инициализации чата:', error);
        setLoading(false);
      }
    };
    init();
  }, [router.query.clientId]);

  // Загрузка сообщений сессии с пагинацией
  const loadMessages = async (sid, limit = 50, offset = 0) => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sid)
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      if (data) {
        setMessages(prev => offset === 0 ? data : [...prev, ...data]);
      }
    } catch (err) {
      console.error('Ошибка загрузки сообщений:', err);
    }
  };

  // Подписка на новые сообщения в реальном времени
  useEffect(() => {
    if (!sessionId) return;

    const messageChannel = supabase
      .channel('chat-' + sessionId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    // Подписка на индикатор набора текста
    const typingChannel = supabase
      .channel('typing-' + sessionId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_typing',
          filter: `session_id=eq.${sessionId}`
        },
        () => {
          setClientTyping(true);
          setTimeout(() => setClientTyping(false), 2000); // Debounce
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(typingChannel);
    };
  }, [sessionId]);

  // Автоскролл к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Отправка сообщения
  const sendMessage = useCallback(async () => {
    if (!input.trim() || !sessionId || !user) return;
    setSending(true);
    try {
      const { error } = await supabase.from('chat_messages').insert({
        session_id: sessionId,
        sender_id: user.id,
        sender_type: 'operator',
        message: DOMPurify.sanitize(input.trim()), // Санитизация
        read_status: false
      });
      if (error) throw error;
      setInput('');
    } catch (err) {
      console.error('Ошибка отправки сообщения:', err);
      // Показать уведомление пользователю
    } finally {
      setSending(false);
    }
  }, [input, sessionId, user]);

  // Горячие клавиши
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Вставка шаблона
  const applyTemplate = useCallback((templateText) => {
    setInput(templateText);
  }, []);

  // Действия
  const createDealFromChat = useCallback(() => {
    alert('Создание сделки будет добавлено');
  }, []);

  if (loading) {
    return (
      <div className="loading-leaf-container">
        <div className="loading-leaf"></div>
      </div>
    );
  }

  if (needsLogin) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#E8F4FD' }}>
        <div style={{ textAlign: 'center', background: 'white', padding: '48px', borderRadius: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h2 style={{ marginBottom: '16px', fontWeight: 600, color: '#2D6A4F' }}>Добро пожаловать в CRM Лето</h2>
          <p style={{ marginBottom: '24px', color: '#5B7465' }}>Для работы с чатом необходимо авторизоваться</p>
          <a href="https://arthurcrm.vercel.app/login" style={{ display: 'inline-block', background: '#4CAF6A', color: 'white', padding: '12px 32px', borderRadius: '14px', textDecoration: 'none', fontWeight: 500 }}>
            Войти в Кармический банк
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Чат — CRM Лето</title>
        <link
