import React, { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext } from 'react'
import Statistiques from './Statistiques.jsx'
import ImportPelehas from './ImportPelehas.jsx'
import { AuthProvider, AuthContext, useAuth, LoginScreen, ChangePasswordModal, GestionUtilisateurs, LogsActions, apiFetch } from './Auth.jsx'
import TelegramPanel from './Telegram.jsx'
import {
  EditWithMotifModal,
  HistoriqueFicheModal,
  TimelineDemandeur,
  AlertesBandeau,
  AlertesPage,
  CalendrierPage,
  CartePage,
  FicheEluPage,
  ScoringReglesPage,
  MOTIFS_MODIFICATION,
  MOTIFS_ARCHIVAGE
} from './Features.jsx'
import {
  RealtimeProvider,
  useRealtime,
  PresenceStrip,
  PresenceGlobale,
  LockBanner,
  CommentsThread,
  NotificationsBell,
  NotificationsPanel
} from './Realtime.jsx'
import {
  PiecesUploader,
  KanbanPage,
  MessagerieThread,
  MessageriePage,
  RelancesPage,
  IAPredictionCard,
  IAStatsPage
} from './Workflow.jsx'

// ===========================================================
// DESIGN SYSTEM
// ===========================================================

const C = {
  navy: '#0B1E3D',
  navyB: '#1D3557',
  accent: '#E05C2A',
  accentL: 'rgba(224,92,42,0.10)',
  bg: '#EEF1F6',
  card: '#FFFFFF',
  text: '#0B1E3D',
  muted: '#5B6B85',
  light: '#8A9BB5',
  border: '#DDE3EE',
  green: '#16A34A',
  greenBg: '#DCFCE7',
  amber: '#D97706',
  amberBg: '#FEF3C7',
  red: '#DC2626',
  redBg: '#FEE2E2',
  purple: '#7C3AED',
  purpleBg: '#EDE9FE',
  teal: '#0D9488',
  tealBg: '#CCFBF1',
  blue: '#1D6FA8',
  blueBg: '#DBEAFE'
}

const Fh = "'Syne',sans-serif"
const Fb = "'DM Sans',sans-serif"

function useFonts() {
  useEffect(() => {
    const l = document.createElement('link')
    l.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap'
    l.rel = 'stylesheet'
    document.head.appendChild(l)
  }, [])
}

// ===========================================================
// API
// ===========================================================

function getToken() { return localStorage.getItem('cal_token') }
function setToken(t) { localStorage.setItem('cal_token', t) }
function clearToken() { localStorage.removeItem('cal_token') }

async function api(path, options) {
  const token = getToken()
  const opts = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-auth-token': token } : {}),
      ...(options ? options.headers : {})
    }
  }
  if (options && options.body && typeof options.body === 'object') {
    opts.body = JSON.stringify(options.body)
  }
  const r = await fetch('/api' + path, opts)
  if (r.status === 401) { clearToken(); window.location.reload(); return }
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.status }))
    throw new Error(err.error || String(r.status))
  }
  return r.json()
}

function useApi(path) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const load = useCallback(async () => {
    if (!path) return
    setLoading(true)
    setErr(null)
    try { setData(await api(path)) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }, [path])
  useEffect(() => { load() }, [load])
  return { data, loading, err, reload: load }
}

// ===========================================================
// AUTH CONTEXT
// ===========================================================

const AuthCtx = createContext(null)
const useAuthCtx = () => useContext(AuthCtx)

function AuthProviderLocal({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    api('/auth/me')
      .then(d => setUser(d.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  const login = async (login, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { login, password } })
    setToken(d.token)
    setUser(d.user)
    return d.user
  }

  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }) } catch (e) {}
    clearToken()
    setUser(null)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg, fontFamily: Fb, color: C.muted }}>
        Chargement...
      </div>
    )
  }

  return (
    <AuthCtx.Provider value={{ user, login, logout }}>
      <AuthContext.Provider value={{ user, login, logout, loading }}>
        {children}
      </AuthContext.Provider>
    </AuthCtx.Provider>
  )
}

// ===========================================================
// TOAST
// ===========================================================

const ToastCtx = createContext(null)
const useToast = () => useContext(ToastCtx)

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const counter = useRef(0)

  const toast = useCallback((msg, type) => {
    const id = ++counter.current
    setToasts(p => [...p, { id, msg, type: type || 'success', out: false }])
    setTimeout(() => {
      setToasts(p => p.map(t => t.id === id ? { ...t, out: true } : t))
      setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 350)
    }, 4000)
  }, [])

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360 }}>
        <style>{`
          @keyframes tIn { from { transform:translateX(120%); opacity:0 } to { transform:translateX(0); opacity:1 } }
          @keyframes tOut { from { transform:translateX(0); opacity:1 } to { transform:translateX(120%); opacity:0 } }
          .t-in { animation: tIn 0.3s ease forwards }
          .t-out { animation: tOut 0.3s ease forwards }
        `}</style>
        {toasts.map(t => {
          const col = t.type === 'error' ? C.red : t.type === 'warning' ? C.amber : t.type === 'info' ? C.blue : C.green
          return (
            <div key={t.id} className={t.out ? 't-out' : 't-in'}
              onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}
              style={{ background: '#fff', borderRadius: 12, padding: '13px 16px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', border: '1px solid ' + col + '33', borderLeft: '4px solid ' + col, display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontFamily: Fb }}>
              <span style={{ flexShrink: 0, color: col, marginTop: 1 }}>
                <Icon name={t.type === 'error' ? 'alert' : t.type === 'warning' ? 'alert' : t.type === 'info' ? 'info' : 'check'} size={18} color={col} />
              </span>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>{t.msg}</div>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

// ===========================================================
// ICONS (SVG - remplace tous les [XX] pseudo-icônes)
// ===========================================================

const ICON_PATHS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  logements: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z',
  demandeurs: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  matching: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
  cal: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z',
  audiences: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  elus: 'M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm-1.06 13.54L7.4 12l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41-5.64 5.66z',
  calendrier: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z',
  carte: 'M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z',
  rapport: 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  scoring: 'M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z',
  stats: 'M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z',
  import: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  notifications: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  portail: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  users: 'M9 13.75c-2.34 0-7 1.17-7 3.5V19h14v-1.75c0-2.33-4.66-3.5-7-3.5zM9 12c1.93 0 3.5-1.57 3.5-3.5S10.93 5 9 5 5.5 6.57 5.5 8.5 7.07 12 9 12zm7 1.96c1.16.84 2 1.98 2 3.54V19h4v-1.75c0-2.02-3.5-3.17-6-3.29zM15 12c1.93 0 3.5-1.57 3.5-3.5S16.93 5 15 5c-.54 0-1.04.13-1.5.35.63.89 1 1.98 1 3.15s-.37 2.26-1 3.15c.46.22.96.35 1.5.35z',
  telegram: 'M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z',
  logs: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM10 19l-3-3 1.41-1.41L10 16.17l3.59-3.58L15 14l-5 5z',
  check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z',
  alert: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  arrow: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z',
  spinner: 'M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z',
  eye: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z'
}

function Icon({ name, size, color, style }) {
  const path = ICON_PATHS[name]
  if (!path) return null
  return (
    <svg width={size || 16} height={size || 16} viewBox="0 0 24 24" fill={color || 'currentColor'}
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle', ...(style || {}) }}>
      <path d={path} />
    </svg>
  )
}

// ===========================================================
// ATOMS
// ===========================================================

function Spin() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, color: C.muted, fontFamily: Fb, fontSize: 13 }}>
      <style>{`@keyframes sp{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      <svg width="20" height="20" viewBox="0 0 24 24" style={{ animation: 'sp 0.9s linear infinite', marginRight: 10 }}>
        <circle cx="12" cy="12" r="10" stroke={C.border} strokeWidth="3" fill="none" />
        <path d="M12 2 A10 10 0 0 1 22 12" stroke={C.accent} strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
      Chargement...
    </div>
  )
}

// ===========================================================
// SPLASH SCREEN (animation d'entrée)
// ===========================================================

function SplashScreen({ onDone }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const t1 = setTimeout(() => setVisible(false), 2100)
    const t2 = setTimeout(() => onDone && onDone(), 2600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'linear-gradient(135deg, #0B1E3D 0%, #1D3557 60%, #0B1E3D 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease',
      pointerEvents: visible ? 'auto' : 'none', overflow: 'hidden'
    }}>
      <style>{`
        @keyframes lgFade { from { opacity: 0; transform: translateY(14px) scale(0.96) } to { opacity: 1; transform: none } }
        @keyframes lgLetter { 0% { opacity: 0; transform: translateY(24px) } 60% { transform: translateY(-4px) } 100% { opacity: 1; transform: none } }
        @keyframes lgPulse { 0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(224,92,42,0.5) } 50% { transform: scale(1.08); box-shadow: 0 0 0 18px rgba(224,92,42,0) } }
        @keyframes lgShine { 0% { transform: translateX(-100%) } 50%, 100% { transform: translateX(240%) } }
        @keyframes lgBar { from { width: 0 } to { width: 100% } }
        @keyframes lgFloat { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
        .splash-letter { display: inline-block; animation: lgLetter 0.7s cubic-bezier(.2,.8,.2,1) both }
      `}</style>

      {/* halos décoratifs */}
      <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(224,92,42,0.18) 0%, transparent 70%)',
        top: '20%', left: '15%', animation: 'lgFloat 4s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(29,111,168,0.15) 0%, transparent 70%)',
        bottom: '15%', right: '12%', animation: 'lgFloat 5s ease-in-out infinite reverse' }} />

      {/* Logo */}
      <div style={{
        width: 94, height: 94, borderRadius: 22,
        background: 'linear-gradient(135deg, #E05C2A 0%, #F68144 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: Fh, fontWeight: 900, fontSize: 48, color: '#fff',
        animation: 'lgPulse 2.2s ease-in-out infinite',
        marginBottom: 24, position: 'relative', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(224,92,42,0.35)'
      }}>
        <span style={{ position: 'relative', zIndex: 2, textShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>L</span>
        {/* Shine effect */}
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '30%', height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
          animation: 'lgShine 2.4s ease-in-out infinite', transform: 'skewX(-20deg)'
        }} />
      </div>

      {/* Nom animé lettre par lettre */}
      <div style={{
        fontFamily: Fh, fontSize: 44, fontWeight: 800,
        color: '#fff', letterSpacing: '-0.04em', marginBottom: 10
      }}>
        {'Logivia'.split('').map((ch, i) => (
          <span key={i} className="splash-letter" style={{ animationDelay: (i * 80) + 'ms' }}>{ch}</span>
        ))}
      </div>

      <div style={{
        color: 'rgba(255,255,255,0.55)', fontFamily: Fb, fontSize: 13.5,
        letterSpacing: '0.02em', marginBottom: 34,
        animation: 'lgFade 0.7s ease 0.9s both'
      }}>
        L&apos;attribution de logement, en clair.
      </div>

      {/* Barre de progression */}
      <div style={{ width: 200, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', background: 'linear-gradient(90deg, #E05C2A, #F68144)',
          borderRadius: 99, animation: 'lgBar 1.8s cubic-bezier(.4,0,.2,1) forwards'
        }} />
      </div>

      <div style={{
        color: 'rgba(255,255,255,0.3)', fontFamily: Fb, fontSize: 10,
        letterSpacing: '0.15em', textTransform: 'uppercase',
        position: 'absolute', bottom: 32,
        animation: 'lgFade 0.7s ease 1.3s both'
      }}>
        Ville de Saint-Denis
      </div>
    </div>
  )
}

// ===========================================================
// ERROR BOUNDARY
// ===========================================================

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err, info) { console.error('[Logivia] Erreur interceptée', err, info) }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 40, fontFamily: Fb, color: C.text, maxWidth: 560, margin: '60px auto', background: C.card, borderRadius: 12, border: '1px solid ' + C.border }}>
          <div style={{ fontFamily: Fh, fontSize: 18, fontWeight: 800, marginBottom: 10, color: C.red }}>
            <Icon name="alert" size={20} color={C.red} /> Une erreur inattendue s&apos;est produite
          </div>
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>
            L&apos;application a rencontré un problème. Rechargez la page ou contactez l&apos;administrateur.
          </div>
          <div style={{ background: C.bg, padding: 12, borderRadius: 8, fontFamily: 'monospace', fontSize: 11, color: C.muted, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {String(this.state.err && this.state.err.message || this.state.err)}
          </div>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '10px 20px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontWeight: 700, fontSize: 13 }}>
            Recharger
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function Pill({ label, color, bg }) {
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, color, background: bg, marginRight: 4, marginBottom: 3 }}>{label}</span>
}

function Tag({ text, color, bg }) {
  return <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: bg || C.bg, color: color || C.muted, fontWeight: 600, marginRight: 3 }}>{text}</span>
}

function Modal({ title, onClose, children, maxW }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,30,61,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: C.card, borderRadius: 14, padding: 28, width: '100%', maxWidth: maxW || 600, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: Fh, fontSize: 17, fontWeight: 800, color: C.text, margin: 0 }}>{title}</h2>
          <button onClick={onClose} aria-label="Fermer" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <Icon name="close" size={20} color={C.muted} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inp = { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid ' + C.border, fontFamily: Fb, fontSize: 13, color: C.text, boxSizing: 'border-box', outline: 'none', background: '#fff' }

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}

function adequation(score) {
  if (score >= 80) return { label: 'Tres forte', color: C.green, bg: C.greenBg }
  if (score >= 60) return { label: 'Forte', color: C.blue, bg: C.blueBg }
  if (score >= 40) return { label: 'Moyenne', color: C.amber, bg: C.amberBg }
  return { label: 'Faible', color: C.red, bg: C.redBg }
}

// ===========================================================
// LOGIN SCREEN
// ===========================================================

function Login() {
  const { login } = useAuthCtx()
  const [loginV, setLoginV] = useState('')
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    setLoading(true)
    try { await login(loginV, pwd) }
    catch (e) { setErr('Identifiants incorrects') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.navy, fontFamily: Fb }}>
      <div style={{ flex: '0 0 440px', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 52px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 44 }}>
          <div style={{ width: 46, height: 46, background: 'linear-gradient(135deg, #E05C2A 0%, #F68144 100%)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: Fh, boxShadow: '0 8px 20px rgba(224,92,42,0.3)' }}>L</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 20, fontFamily: Fh, letterSpacing: '-0.03em' }}>Logivia</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Ville de Saint-Denis</div>
          </div>
        </div>
        <div style={{ color: '#fff', fontFamily: Fh, fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 6 }}>Connexion</div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 28 }}>Accès réservé aux agents et élus</div>
        <form onSubmit={submit}>
          {[['Identifiant', loginV, setLoginV, 'text'], ['Mot de passe', pwd, setPwd, 'password']].map(([label, val, setter, type]) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
              <input value={val} onChange={e => setter(e.target.value)} type={type}
                style={{ width: '100%', padding: '11px 14px', borderRadius: 9, border: '1.5px solid ' + (err ? C.red : 'rgba(255,255,255,0.12)'), background: 'rgba(255,255,255,0.06)', color: '#fff', fontFamily: Fb, fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
            </div>
          ))}
          {err && <div style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '9px 14px', marginBottom: 14, fontSize: 13, color: '#FCA5A5' }}>{err}</div>}
          <button type="submit" disabled={loading || !loginV || !pwd}
            style={{ width: '100%', padding: '12px', borderRadius: 9, border: 'none', background: C.accent, color: '#fff', cursor: 'pointer', fontFamily: Fh, fontSize: 14, fontWeight: 700, opacity: loading || !loginV || !pwd ? 0.6 : 1 }}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
        <div style={{ marginTop: 24, padding: '13px 15px', background: 'rgba(255,255,255,0.05)', borderRadius: 9, border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comptes de demonstration</div>
          {[{ r: 'Directeur', l: 'admin', p: 'calsmart2024' }, { r: 'Agent', l: 'agent1', p: 'agent2024' }, { r: 'Elu Nord', l: 'dupont', p: 'elu2024' }].map(c => (
            <div key={c.l} style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.3)', marginBottom: 3, cursor: 'pointer' }}
              onClick={() => { setLoginV(c.l); setPwd(c.p) }}>
              <span style={{ color: C.accent, fontWeight: 600 }}>{c.r}</span> - {c.l} / {c.p}
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        <div style={{ color: 'rgba(255,255,255,0.06)', fontSize: 13, lineHeight: 2.2, textAlign: 'center', fontFamily: Fh, fontWeight: 700 }}>
          {['Score transparent 8 criteres', 'Correction anti-biais automatique', 'Suivi audiences elus', 'Notifications Telegram', 'Import depuis Pelehas', 'Export CSV', 'Carte territoriale', 'Rapport mensuel', 'Portail candidat'].map((f, i) => (
            <div key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.12)' }}>+ {f}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ===========================================================
// SIDEBAR
// ===========================================================

function Sidebar({ active, setActive, badge, onLogout, onChangePwd, onDemo, isDemo }) {
  const { user } = useAuthCtx()

  const nav = [
    { id: 'dashboard', ico: 'dashboard', label: 'Tableau de bord', roles: ['agent', 'directeur', 'elu'] },
    { id: 'alertes', ico: 'notifications', label: 'Alertes', roles: ['agent', 'directeur'] },
    { id: 'logements', ico: 'logements', label: 'Logements', roles: ['agent', 'directeur'] },
    { id: 'demandeurs', ico: 'demandeurs', label: 'Demandeurs', roles: ['agent', 'directeur'] },
    { id: 'matching', ico: 'matching', label: 'Matching', roles: ['agent', 'directeur'] },
    { id: 'cal', ico: 'cal', label: 'Prépa CAL', roles: ['agent', 'directeur'] },
    { id: 'audiences', ico: 'audiences', label: 'Audiences Élus', roles: ['agent', 'directeur', 'elu'] },
    { id: 'elus', ico: 'elus', label: 'Gestion Élus', roles: ['agent', 'directeur'] },
    { id: 'calendrier', ico: 'calendrier', label: 'Calendrier CAL', roles: ['agent', 'directeur'] },
    { id: 'kanban', ico: 'matching', label: 'Kanban workflow', roles: ['agent', 'directeur'] },
    { id: 'messagerie', ico: 'notifications', label: 'Messagerie', roles: ['agent', 'directeur', 'elu'] },
    { id: 'relances', ico: 'notifications', label: 'Relances auto', roles: ['agent', 'directeur'] },
    { id: 'ia-stats', ico: 'stats', label: 'IA prédictive', roles: ['agent', 'directeur'] },
    { id: 'carte', ico: 'carte', label: 'Carte territoire', roles: ['agent', 'directeur', 'elu'] },
    { id: 'rapport', ico: 'rapport', label: 'Rapport mensuel', roles: ['directeur', 'agent'] },
    { id: 'scoring', ico: 'scoring', label: 'Scoring et règles', roles: ['directeur'] },
    { id: 'stats', ico: 'stats', label: 'Statistiques', roles: ['agent', 'directeur', 'elu'] },
    { id: 'import', ico: 'import', label: 'Import Pelehas', roles: ['agent', 'directeur'] },
    { id: 'notifications', ico: 'notifications', label: 'Notifications', badge, roles: ['agent', 'directeur', 'elu'] },
    { id: 'portail', ico: 'portail', label: 'Portail Candidat', roles: ['directeur', 'agent'] },
    { id: 'users', ico: 'users', label: 'Utilisateurs', roles: ['directeur'] },
    { id: 'telegram', ico: 'telegram', label: 'Telegram', roles: ['directeur', 'agent'] },
    { id: 'logs', ico: 'logs', label: 'Journal', roles: ['directeur', 'agent'] }
  ].filter(n => !user || n.roles.includes(user.role))

  const RC = { agent: C.blue, directeur: C.accent, elu: C.purple }
  const RL = { agent: 'Agent', directeur: 'Directeur', elu: 'Elu' }

  return (
    <div style={{ width: 214, minWidth: 214, background: C.navy, display: 'flex', flexDirection: 'column', userSelect: 'none', overflowY: 'auto' }}>
      <div style={{ padding: '22px 16px 18px', borderBottom: '1px solid ' + C.navyB }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, background: isDemo ? C.amber : 'linear-gradient(135deg, #E05C2A 0%, #F68144 100%)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#fff', fontFamily: Fh, boxShadow: isDemo ? 'none' : '0 4px 12px rgba(224,92,42,0.25)' }}>L</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 14, fontFamily: Fh, letterSpacing: '-0.03em' }}>Logivia</div>
            <div style={{ color: isDemo ? C.amber : C.light, fontSize: 10, fontWeight: isDemo ? 700 : 400 }}>{isDemo ? 'MODE DÉMO' : 'Saint-Denis'}</div>
          </div>
        </div>
      </div>
      <nav style={{ padding: '10px 8px', flex: 1 }}>
        {nav.map(n => (
          <button key={n.id} onClick={() => setActive(n.id)}
            onMouseEnter={e => { if (active !== n.id) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#fff' } }}
            onMouseLeave={e => { if (active !== n.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.light } }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', marginBottom: 2, fontFamily: Fh, fontSize: 12, fontWeight: active === n.id ? 700 : 500, background: active === n.id ? C.accent : 'transparent', color: active === n.id ? '#fff' : C.light, transition: 'all 0.15s ease', textAlign: 'left' }}>
            <Icon name={n.ico} size={16} color={active === n.id ? '#fff' : C.light} />
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.badge > 0 && <span style={{ fontSize: 10, background: active === n.id ? '#fff' : C.red, color: active === n.id ? C.accent : '#fff', borderRadius: 99, padding: '1px 7px', fontWeight: 800, minWidth: 18, textAlign: 'center' }}>{n.badge}</span>}
          </button>
        ))}
      </nav>
      {user && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid ' + C.navyB }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: RC[user.role] || C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
              {user.prenom ? user.prenom[0] : ''}{user.nom ? user.nom[0] : ''}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.prenom} {user.nom}</div>
              <div style={{ fontSize: 9.5, color: RC[user.role] || C.light, fontWeight: 600 }}>{RL[user.role] || user.role}{user.secteur ? ' - ' + user.secteur : ''}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <button onClick={onChangePwd} style={{ flex: 1, padding: '4px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', fontSize: 9.5, color: 'rgba(255,255,255,0.35)', fontFamily: Fh }}>Mdp</button>
            <button onClick={onLogout} style={{ flex: 1, padding: '4px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', fontSize: 9.5, color: 'rgba(255,255,255,0.35)', fontFamily: Fh }}>Quitter</button>
            <button onClick={onDemo} style={{ flex: 1, padding: '4px', borderRadius: 5, border: '1px solid rgba(224,92,42,0.4)', background: isDemo ? C.accentL : 'transparent', cursor: 'pointer', fontSize: 9.5, color: isDemo ? C.accent : 'rgba(224,92,42,0.6)', fontFamily: Fh, fontWeight: isDemo ? 700 : 400 }}>{isDemo ? 'Vrai' : 'Demo'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ===========================================================
// DASHBOARD
// ===========================================================

function Dashboard({ setActive }) {
  const { data, loading } = useApi('/dashboard')
  if (loading) return <Spin />
  if (!data) return null
  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Tableau de bord</h1>
      <p style={{ color: C.muted, fontSize: 12.5, marginBottom: 22 }}>Donnees en temps reel</p>
      <AlertesBandeau onClick={() => setActive('alertes')} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Demandeurs actifs', val: data.nb_demandeurs_actifs, color: C.accent },
          { label: 'Logements dispon.', val: data.nb_logements_disponibles, color: C.blue },
          { label: 'Dossiers urgents', val: data.nb_urgents, color: C.red },
          { label: 'Audiences', val: data.nb_audiences, color: C.purple },
          { label: 'Attributions', val: data.nb_attribues, color: C.green },
          { label: 'Notif. non lues', val: data.nb_notifications_non_lues, color: C.amber }
        ].map((k, i) => (
          <div key={i} style={{ background: C.card, borderRadius: 12, padding: '14px 18px', border: '1px solid ' + C.border, flex: '1 1 120px' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.color, fontFamily: Fh, letterSpacing: '-0.04em' }}>{k.val}</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ background: C.card, borderRadius: 12, padding: 18, border: '1px solid ' + C.border, flex: 1 }}>
          <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>Tension par typologie</div>
          {Object.entries(data.tension_par_typ || {}).map(([typ, nb]) => {
            const max = Math.max(1, ...Object.values(data.tension_par_typ))
            const col = nb / max >= 0.8 ? C.red : nb / max >= 0.5 ? C.amber : C.green
            return (
              <div key={typ} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <span style={{ fontFamily: Fh, fontWeight: 700, fontSize: 11, width: 28, color: C.text }}>{typ}</span>
                <div style={{ flex: 1, height: 7, background: '#EEF1F6', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: (nb / max * 100) + '%', background: col, borderRadius: 99 }} />
                </div>
                <span style={{ fontSize: 11, color: C.muted, width: 20, textAlign: 'right' }}>{nb}</span>
              </div>
            )
          })}
        </div>
        <div style={{ background: C.card, borderRadius: 12, padding: 18, border: '1px solid ' + C.border, flex: 1 }}>
          <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>Demandes par quartier</div>
          {(data.tension_par_quartier || []).slice(0, 6).map(({ quartier, nb }) => (
            <div key={quartier} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
              <span style={{ fontSize: 12, color: C.text }}>{quartier}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.accent, fontFamily: Fh }}>{nb}</span>
            </div>
          ))}
        </div>
        <div style={{ background: C.card, borderRadius: 12, padding: 18, border: '1px solid ' + C.border, flex: 1 }}>
          <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>Actions rapides</div>
          {[
            { label: 'Nouveau logement', id: 'logements', color: C.accent },
            { label: 'Nouveau demandeur', id: 'demandeurs', color: C.blue },
            { label: 'Lancer un matching', id: 'matching', color: C.navy },
            { label: 'Nouvelle audience', id: 'audiences', color: C.purple }
          ].map(a => (
            <button key={a.id} onClick={() => setActive(a.id)}
              style={{ display: 'block', width: '100%', padding: '8px 14px', borderRadius: 8, border: 'none', background: a.color, color: '#fff', cursor: 'pointer', fontFamily: Fh, fontSize: 11.5, fontWeight: 700, marginBottom: 6, textAlign: 'left' }}>
              {a.label}
            </button>
          ))}
          {data.delai_moyen && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: C.bg, borderRadius: 8, fontSize: 12, color: C.text }}>
              Delai moyen : <b>{data.delai_moyen}j</b>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ===========================================================
// LOGEMENTS
// ===========================================================

function Logements({ goMatch }) {
  const { data: logements, loading, reload } = useApi('/logements')
  const { data: ref } = useApi('/referentiels')
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editLog, setEditLog] = useState(null)
  const [histLog, setHistLog] = useState(null)
  const [archiveLog, setArchiveLog] = useState(null)
  const [archiveMotif, setArchiveMotif] = useState('')
  const [archiveLibre, setArchiveLibre] = useState('')
  const [saving, setSaving] = useState(false)
  const blank = { ref: '', bailleur: '', adresse: '', quartier: '', secteur: '', typ: 'T3', surface: '', etage: '0', asc: false, rdc: false, pmr: false, loyer_hc: '', charges: '', plafond: 'PLUS', dispo: '', contingent: 'Ville' }
  const [form, setForm] = useState(blank)
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = async () => {
    if (!form.ref || !form.adresse) return toast('Reference et adresse obligatoires', 'error')
    setSaving(true)
    try {
      await api('/logements', { method: 'POST', body: form })
      setShowForm(false)
      setForm(blank)
      reload()
      toast('Logement ' + form.ref + ' ajoute', 'success')
    } catch (e) { toast('Erreur: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  const doArchive = async () => {
    const motif = archiveMotif === 'Autre motif (precise ci-dessous)' ? archiveLibre.trim() : archiveMotif
    if (!motif) return toast('Motif d archivage obligatoire', 'error')
    try {
      await api('/logements/' + archiveLog.id, { method: 'DELETE', body: { motif } })
      setArchiveLog(null); setArchiveMotif(''); setArchiveLibre('')
      reload()
      toast('Logement archive', 'warning')
    } catch (e) { toast('Erreur : ' + e.message, 'error') }
  }

  if (loading) return <Spin />

  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Logements disponibles</h1>
          <p style={{ color: C.muted, fontSize: 12.5 }}>{(logements || []).length} logements vacants</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => window.open('/api/export/logements', '_blank')}
            style={{ padding: '9px 16px', border: '1px solid ' + C.border, borderRadius: 9, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>
            Export CSV
          </button>
          <button onClick={() => setShowForm(true)}
            style={{ padding: '10px 18px', background: C.accent, color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontFamily: Fh, fontSize: 12.5, fontWeight: 700 }}>
            + Nouveau logement
          </button>
        </div>
      </div>
      {(logements || []).map(l => (
        <div key={l.id} style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
          <div style={{ width: 46, height: 46, background: C.accentL, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontFamily: Fh, fontWeight: 800, color: C.accent, flexShrink: 0 }}>{l.typ}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: C.text, fontFamily: Fh }}>{l.adresse}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{l.quartier} - {l.bailleur} - {l.surface} m2</div>
            <div style={{ marginTop: 5 }}>
              <Tag text={l.contingent} color={C.accent} bg={C.accentL} />
              <Tag text={l.plafond} />
              {l.pmr && <Tag text="PMR" color={C.green} bg={C.greenBg} />}
              {l.rdc && <Tag text="RDC" color={C.blue} bg={C.blueBg} />}
              {l.asc && <Tag text="Ascenseur" />}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: Fh }}>{l.loyer} EUR</div>
            <div style={{ fontSize: 11, color: C.muted }}>Dispo le {l.dispo}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => goMatch(l)} style={{ padding: '8px 14px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>Matcher</button>
            <button onClick={() => setEditLog(l)} style={{ padding: '8px 10px', background: C.blueBg, color: C.blue, border: '1px solid ' + C.blue + '33', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>Modifier</button>
            <button onClick={() => setHistLog(l)} style={{ padding: '8px 10px', background: C.bg, color: C.muted, border: '1px solid ' + C.border, borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>Historique</button>
            <button onClick={() => { setArchiveLog(l); setArchiveMotif(''); setArchiveLibre('') }} style={{ padding: '8px 10px', background: C.redBg, color: C.red, border: '1px solid ' + C.red + '33', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>Archive</button>
          </div>
        </div>
      ))}
      {(logements || []).length === 0 && (
        <div style={{ background: C.card, borderRadius: 12, padding: 32, border: '1px solid ' + C.border, textAlign: 'center', color: C.muted }}>
          Aucun logement. Cliquez sur + pour en ajouter.
        </div>
      )}
      {showForm && (
        <Modal title="Nouveau logement" onClose={() => setShowForm(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Reference *"><input style={inp} value={form.ref} onChange={set('ref')} /></Field>
            <Field label="Bailleur">
              <select style={inp} value={form.bailleur} onChange={set('bailleur')}>
                <option value="">---</option>
                {(ref && ref.bailleurs ? ref.bailleurs : []).map(b => <option key={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Adresse *"><input style={inp} value={form.adresse} onChange={set('adresse')} /></Field>
            <Field label="Quartier">
              <select style={inp} value={form.quartier} onChange={set('quartier')}>
                <option value="">---</option>
                {(ref && ref.quartiers ? ref.quartiers : []).map(q => <option key={q}>{q}</option>)}
              </select>
            </Field>
            <Field label="Secteur">
              <select style={inp} value={form.secteur} onChange={set('secteur')}>
                <option value="">---</option>
                {(ref && ref.secteurs ? ref.secteurs : []).map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Typologie">
              <select style={inp} value={form.typ} onChange={set('typ')}>
                {['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Surface m2"><input style={inp} type="number" value={form.surface} onChange={set('surface')} /></Field>
            <Field label="Loyer HC (EUR)"><input style={inp} type="number" value={form.loyer_hc} onChange={set('loyer_hc')} /></Field>
            <Field label="Charges (EUR)"><input style={inp} type="number" value={form.charges} onChange={set('charges')} /></Field>
            <Field label="Plafond">
              <select style={inp} value={form.plafond} onChange={set('plafond')}>
                {['PLAI', 'PLUS', 'PLS'].map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Contingent">
              <select style={inp} value={form.contingent} onChange={set('contingent')}>
                {(ref && ref.contingents ? ref.contingents : ['Ville', 'Prefecture', 'Action Logement', 'Bailleur']).map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Date disponibilite"><input style={inp} value={form.dispo} placeholder="JJ/MM/AAAA" onChange={set('dispo')} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
            {[['asc', 'Ascenseur'], ['rdc', 'RDC'], ['pmr', 'PMR']].map(([k, l]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: form[k] ? C.accent : C.text }}>
                <input type="checkbox" checked={!!form[k]} onChange={set(k)} /> {l}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 16px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>Annuler</button>
            <button onClick={submit} disabled={saving} style={{ padding: '9px 16px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>{saving ? '...' : 'Enregistrer'}</button>
          </div>
        </Modal>
      )}
      {editLog && (
        <EditWithMotifModal
          title={'Modifier logement - ' + editLog.ref}
          item={editLog}
          endpoint={'/logements/' + editLog.id}
          toast={toast}
          motifs={MOTIFS_MODIFICATION}
          onClose={() => setEditLog(null)}
          onSaved={() => { setEditLog(null); reload() }}
          fields={[
            { key: 'ref', label: 'Reference', type: 'text' },
            { key: 'bailleur', label: 'Bailleur', type: 'select', options: (ref && ref.bailleurs ? ref.bailleurs : []) },
            { key: 'adresse', label: 'Adresse', type: 'text', full: true },
            { key: 'quartier', label: 'Quartier', type: 'select', options: (ref && ref.quartiers ? ref.quartiers : []) },
            { key: 'secteur', label: 'Secteur', type: 'select', options: (ref && ref.secteurs ? ref.secteurs : []) },
            { key: 'typ', label: 'Typologie', type: 'select', options: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'] },
            { key: 'surface', label: 'Surface m2', type: 'number' },
            { key: 'loyer_hc', label: 'Loyer HC (EUR)', type: 'number' },
            { key: 'charges', label: 'Charges (EUR)', type: 'number' },
            { key: 'plafond', label: 'Plafond', type: 'select', options: ['PLAI', 'PLUS', 'PLS'] },
            { key: 'contingent', label: 'Contingent', type: 'select', options: (ref && ref.contingents ? ref.contingents : ['Ville', 'Prefecture', 'Action Logement', 'Bailleur']) },
            { key: 'dispo', label: 'Date disponibilite', type: 'text' },
            { key: 'asc', label: 'Ascenseur', type: 'boolean', checkboxLabel: 'Ascenseur' },
            { key: 'rdc', label: 'RDC', type: 'boolean', checkboxLabel: 'Rez-de-chaussee' },
            { key: 'pmr', label: 'PMR', type: 'boolean', checkboxLabel: 'Accessible PMR' }
          ]}
        />
      )}
      {histLog && (
        <HistoriqueFicheModal
          entity_type="logement"
          entity_id={histLog.id}
          onClose={() => setHistLog(null)}
        />
      )}
      {archiveLog && (
        <Modal title={'Archiver le logement - ' + archiveLog.ref} onClose={() => setArchiveLog(null)}>
          <div style={{ background: C.redBg, border: '1px solid ' + C.red + '33', borderRadius: 9, padding: '10px 14px', fontSize: 12, color: C.red, marginBottom: 16, fontWeight: 600 }}>
            Archivage definitif. Le motif sera trace dans l audit.
          </div>
          <div style={{ fontSize: 13, marginBottom: 14, color: C.text }}>
            <b>{archiveLog.adresse}</b> - {archiveLog.quartier}
          </div>
          <Field label="Motif d archivage *">
            <select style={inp} value={archiveMotif} onChange={e => setArchiveMotif(e.target.value)}>
              <option value="">--- Choisir un motif ---</option>
              {MOTIFS_ARCHIVAGE.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          {archiveMotif === 'Autre motif (precise ci-dessous)' && (
            <Field label="Precision">
              <input style={inp} value={archiveLibre} onChange={e => setArchiveLibre(e.target.value)} placeholder="Precisez le motif" />
            </Field>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button onClick={() => setArchiveLog(null)} style={{ padding: '9px 16px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>Annuler</button>
            <button onClick={doArchive} style={{ padding: '9px 20px', background: C.red, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>Confirmer l archivage</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ===========================================================
// DEMANDEURS
// ===========================================================

function Demandeurs() {
  const { data: demandeurs, loading, reload } = useApi('/demandeurs')
  const { data: ref } = useApi('/referentiels')
  const { data: audiences } = useApi('/audiences')
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editDem, setEditDem] = useState(null)
  const [histDem, setHistDem] = useState(null)
  const [timelineDem, setTimelineDem] = useState(null)
  const [archiveDem, setArchiveDem] = useState(null)
  const [archiveMotif, setArchiveMotif] = useState('')
  const [archiveLibre, setArchiveLibre] = useState('')

  const blank = {
    nom: '', prenom: '', nud: '', anc: '0', adultes: '1', enfants: '0',
    compo: '', typ_v: 'T3', typ_min: 'T2', typ_max: 'T4',
    secteurs: [], quartiers: [], rev: '0', sit: '', quartier_origine: '',
    pmr: false, rdc: false, violences: false, handicap: false,
    sans_log: false, expulsion: false, urgence: false, suroc: false,
    grossesse: false, dalo: false, mutation: false,
    prio_handicap: false, prio_expulsion: false, pieces: false
  }
  const [form, setForm] = useState(blank)

  const filtered = useMemo(() =>
    (demandeurs || []).filter(d =>
      (d.nom + ' ' + d.prenom + ' ' + (d.nud || '')).toLowerCase().includes(search.toLowerCase())
    ), [demandeurs, search])

  const selAud = useMemo(() =>
    (audiences || []).filter(a => a.dem_id === (sel && sel.id)), [audiences, sel])

  // Auto-selection depuis kanban/messagerie/relances
  useEffect(() => {
    try {
      const id = sessionStorage.getItem('logivia_open_dem')
      if (id && demandeurs && demandeurs.length > 0) {
        const d = demandeurs.find(x => x.id === id)
        if (d) { setSel(d); sessionStorage.removeItem('logivia_open_dem') }
      }
    } catch (_) {}
  }, [demandeurs])

  const toggleArr = (k, v) => setForm(p => ({
    ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v]
  }))

  const submit = async () => {
    if (!form.nom || !form.prenom) return toast('Nom et prenom obligatoires', 'error')
    setSaving(true)
    try {
      await api('/demandeurs', { method: 'POST', body: form })
      setShowForm(false)
      setForm(blank)
      reload()
      toast(form.nom + ' ' + form.prenom + ' ajoute(e)', 'success')
    } catch (e) { toast('Erreur: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  const doArchive = async () => {
    const motif = archiveMotif === 'Autre motif (precise ci-dessous)' ? archiveLibre.trim() : archiveMotif
    if (!motif) return toast('Motif d archivage obligatoire', 'error')
    try {
      await api('/demandeurs/' + archiveDem.id, { method: 'DELETE', body: { motif } })
      setArchiveDem(null); setArchiveMotif(''); setArchiveLibre('')
      setSel(null)
      reload()
      toast('Demandeur archive', 'warning')
    } catch (e) { toast('Erreur : ' + e.message, 'error') }
  }

  const changerStatut = async (d, statut) => {
    try {
      await api('/demandeurs/' + d.id, { method: 'PUT', body: { statut } })
      setSel({ ...d, statut })
      reload()
      toast('Statut mis a jour : ' + statut, 'success')
    } catch (e) { toast('Erreur', 'error') }
  }

  const BOOLS = [
    ['pmr', 'PMR requis'], ['rdc', 'RDC requis'], ['violences', 'VIF'],
    ['handicap', 'Handicap'], ['sans_log', 'Sans logement'], ['expulsion', 'Expulsion'],
    ['urgence', 'Urgence sociale'], ['suroc', 'Suroccupation'], ['grossesse', 'Grossesse'],
    ['dalo', 'DALO reconnu'], ['mutation', 'Mutation'],
    ['prio_handicap', 'Prio. handicap'], ['prio_expulsion', 'Prio. expulsion'],
    ['pieces', 'Dossier complet']
  ]

  if (loading) return <Spin />

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', fontFamily: Fb }}>
      <div style={{ width: 268, borderRight: '1px solid ' + C.border, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 12, borderBottom: '1px solid ' + C.border, display: 'flex', gap: 8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." style={{ ...inp, flex: 1 }} />
          <button onClick={() => setShowForm(true)} style={{ padding: '7px 11px', background: C.accent, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: Fh, fontSize: 13, fontWeight: 700 }}>+</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
          {filtered.map(d => {
            const hasAud = (audiences || []).some(a => a.dem_id === d.id)
            return (
              <button key={d.id} onClick={() => setSel(d)}
                style={{ display: 'block', width: '100%', padding: '9px 12px', borderRadius: 8, border: '2px solid ' + (sel && sel.id === d.id ? C.accent : C.border), background: sel && sel.id === d.id ? C.accentL : C.card, cursor: 'pointer', textAlign: 'left', marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, fontFamily: Fh, color: sel && sel.id === d.id ? C.accent : C.text }}>{d.nom} {d.prenom}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{d.compo} - {d.anc} mois</div>
                <div style={{ marginTop: 4 }}>
                  <Tag text={d.typ_v} />
                  {d.dalo && <Tag text="DALO" color={C.red} bg={C.redBg} />}
                  {hasAud && <Tag text="Audience" color={C.purple} bg={C.purpleBg} />}
                  {!d.pieces && <Tag text="Incomplet" color={C.amber} bg={C.amberBg} />}
                </div>
              </button>
            )
          })}
          {filtered.length === 0 && <div style={{ textAlign: 'center', color: C.muted, fontSize: 12, padding: 20 }}>Aucun resultat</div>}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid ' + C.border }}>
          <button onClick={() => window.open('/api/export/demandeurs', '_blank')}
            style={{ width: '100%', padding: '7px', border: '1px solid ' + C.border, borderRadius: 7, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 11, fontWeight: 600, color: C.muted }}>
            Export CSV ({filtered.length})
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {!sel ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80%', flexDirection: 'column', color: C.muted }}>
            <div style={{ fontSize: 14, marginBottom: 8, fontFamily: Fh, fontWeight: 700, color: C.text }}>Selectionnez un demandeur</div>
            <div style={{ fontSize: 12 }}>ou cliquez sur + pour en creer un</div>
          </div>
        ) : (
          <>
            <PresenceStrip entityType="demandeur" entityId={sel.id} />
            <LockBanner entityType="demandeur" entityId={sel.id} />
            <div style={{ background: C.navy, borderRadius: 12, padding: '16px 20px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, background: C.accent, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: '#fff', fontFamily: Fh, flexShrink: 0 }}>
                {sel.nom ? sel.nom[0] : ''}{sel.prenom ? sel.prenom[0] : ''}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, fontFamily: Fh }}>{sel.nom} {sel.prenom}</div>
                <div style={{ color: C.light, fontSize: 11.5, marginTop: 1 }}>{sel.nud || '---'} - {sel.sit || '---'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: Fh }}>{(sel.rev || 0).toLocaleString()} EUR/mois</div>
                <div style={{ color: C.light, fontSize: 11 }}>{sel.anc} mois</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
              <select value={sel.statut || 'active'}
                onChange={e => changerStatut(sel, e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid ' + C.border, fontFamily: Fb, fontSize: 12, color: C.text, background: C.card, cursor: 'pointer' }}>
                <option value="active">Dossier actif</option>
                <option value="attribue">Attribue</option>
                <option value="annule">Annule</option>
              </select>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, fontWeight: 600, background: sel.statut === 'attribue' ? C.greenBg : sel.statut === 'annule' ? C.redBg : C.accentL, color: sel.statut === 'attribue' ? C.green : sel.statut === 'annule' ? C.red : C.accent }}>
                {sel.statut === 'attribue' ? 'Attribue' : sel.statut === 'annule' ? 'Annule' : 'En cours'}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={() => setEditDem(sel)} style={{ padding: '6px 12px', background: C.blueBg, color: C.blue, border: '1px solid ' + C.blue + '33', borderRadius: 7, cursor: 'pointer', fontFamily: Fh, fontSize: 11, fontWeight: 600 }}>Modifier</button>
                <button onClick={() => setHistDem(sel)} style={{ padding: '6px 12px', background: C.bg, color: C.muted, border: '1px solid ' + C.border, borderRadius: 7, cursor: 'pointer', fontFamily: Fh, fontSize: 11, fontWeight: 600 }}>Historique</button>
                <button onClick={() => setTimelineDem(sel)} style={{ padding: '6px 12px', background: C.purpleBg, color: C.purple, border: '1px solid ' + C.purple + '33', borderRadius: 7, cursor: 'pointer', fontFamily: Fh, fontSize: 11, fontWeight: 600 }}>Timeline</button>
                <button onClick={() => { setArchiveDem(sel); setArchiveMotif(''); setArchiveLibre('') }} style={{ padding: '6px 12px', background: C.redBg, color: C.red, border: '1px solid ' + C.red + '33', borderRadius: 7, cursor: 'pointer', fontFamily: Fh, fontSize: 11, fontWeight: 600 }}>Archiver</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              {[
                { l: 'Composition', v: sel.compo || '---' },
                { l: 'Typ.', v: (sel.typ_min || '') + '>' + (sel.typ_v || '') + '>' + (sel.typ_max || '') },
                { l: 'Quartiers', v: (sel.quartiers || []).join(', ') || '---' },
                { l: 'Revenu', v: (sel.rev || 0).toLocaleString() + ' EUR' }
              ].map((f, i) => (
                <div key={i} style={{ background: C.card, borderRadius: 9, padding: '10px 14px', border: '1px solid ' + C.border, flex: '1 1 120px' }}>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{f.l}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginTop: 3 }}>{f.v}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {sel.dalo && <Pill label="DALO" color={C.red} bg={C.redBg} />}
              {sel.violences && <Pill label="VIF" color={C.red} bg={C.redBg} />}
              {sel.sans_log && <Pill label="Sans logement" color={C.red} bg={C.redBg} />}
              {sel.prio_expulsion && <Pill label="Expulsion" color={C.amber} bg={C.amberBg} />}
              {sel.urgence && <Pill label="Urgence" color={C.amber} bg={C.amberBg} />}
              {sel.suroc && <Pill label="Suroccupation" color={C.amber} bg={C.amberBg} />}
              {sel.handicap && <Pill label="Handicap" color={C.purple} bg={C.purpleBg} />}
              {!sel.pieces && <Pill label="Dossier incomplet" color={C.amber} bg={C.amberBg} />}
            </div>

            {selAud.length > 0 && (
              <div style={{ background: C.card, borderRadius: 12, padding: 18, border: '2px solid ' + C.purple + '33', marginBottom: 14 }}>
                <div style={{ fontFamily: Fh, fontSize: 11, fontWeight: 700, color: C.purple, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                  Audiences elus ({selAud.length})
                </div>
                {selAud.map(a => (
                  <div key={a.id} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid ' + C.border, marginBottom: 7, borderLeft: '3px solid ' + (a.favorable ? C.green : C.amber) }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: C.text }}>{a.date_audience} <span style={{ color: C.muted, fontWeight: 400 }}>{a.objet}</span></div>
                    <div style={{ fontSize: 11.5, color: a.favorable ? C.green : C.amber, marginTop: 2 }}>{a.suite}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{a.statut}{a.quartier_attribue ? ' - ' + a.quartier_attribue : ''}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: C.card, borderRadius: 12, padding: 18, border: '1px solid ' + C.border }}>
              <div style={{ fontFamily: Fh, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Frise de parcours</div>
              <div style={{ position: 'relative', paddingLeft: 22 }}>
                <div style={{ position: 'absolute', left: 7, top: 6, bottom: 6, width: 2, background: C.border }} />
                {(sel.parcours || []).map((ev, i) => (
                  <div key={i} style={{ position: 'relative', marginBottom: i === (sel.parcours || []).length - 1 ? 0 : 16 }}>
                    <div style={{ position: 'absolute', left: -19, top: 3, width: 10, height: 10, borderRadius: '50%', background: C.accent, boxShadow: '0 0 0 3px white, 0 0 0 4px ' + C.accent }} />
                    <div style={{ fontSize: 10, color: C.muted }}>{ev.date}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{ev.type}</div>
                    {ev.detail && <div style={{ fontSize: 11.5, color: C.muted }}>{ev.detail}</div>}
                  </div>
                ))}
                {!(sel.parcours || []).length && <div style={{ color: C.muted, fontSize: 12 }}>Aucun evenement.</div>}
              </div>
            </div>

            {/* Temps reel : commentaires, pieces, messagerie, IA */}
            <IAPredictionCard demandeur={sel} />
            <PiecesUploader demId={sel.id} />
            <CommentsThread entityType="demandeur" entityId={sel.id} />
            <MessagerieThread demId={sel.id} />
          </>
        )}
      </div>

      {showForm && (
        <Modal title="Nouveau demandeur" onClose={() => setShowForm(false)} maxW={700}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Nom *"><input style={inp} value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value.toUpperCase() }))} /></Field>
            <Field label="Prenom *"><input style={inp} value={form.prenom} onChange={e => setForm(p => ({ ...p, prenom: e.target.value }))} /></Field>
            <Field label="NUD"><input style={inp} value={form.nud} placeholder="93284-AAAA-NNNNN" onChange={e => setForm(p => ({ ...p, nud: e.target.value }))} /></Field>
            <Field label="Anciennete (mois)"><input style={inp} type="number" value={form.anc} onChange={e => setForm(p => ({ ...p, anc: e.target.value }))} /></Field>
            <Field label="Nb adultes"><input style={inp} type="number" value={form.adultes} onChange={e => setForm(p => ({ ...p, adultes: e.target.value }))} /></Field>
            <Field label="Nb enfants"><input style={inp} type="number" value={form.enfants} onChange={e => setForm(p => ({ ...p, enfants: e.target.value }))} /></Field>
            <Field label="Composition"><input style={inp} value={form.compo} placeholder="ex: Couple + 2 enfants" onChange={e => setForm(p => ({ ...p, compo: e.target.value }))} /></Field>
            <Field label="Revenu mensuel (EUR)"><input style={inp} type="number" value={form.rev} onChange={e => setForm(p => ({ ...p, rev: e.target.value }))} /></Field>
            <Field label="Typ. souhaitee">
              <select style={inp} value={form.typ_v} onChange={e => setForm(p => ({ ...p, typ_v: e.target.value }))}>
                {['T1', 'T2', 'T3', 'T4', 'T5'].map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Situation">
              <select style={inp} value={form.sit} onChange={e => setForm(p => ({ ...p, sit: e.target.value }))}>
                <option value="">---</option>
                {(ref && ref.situations_logement ? ref.situations_logement : []).map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Quartiers souhaites</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(ref && ref.quartiers ? ref.quartiers : []).map(q => (
                <label key={q} style={{ cursor: 'pointer', padding: '4px 10px', borderRadius: 6, background: form.quartiers.includes(q) ? C.accentL : C.bg, border: '1px solid ' + (form.quartiers.includes(q) ? C.accent : C.border), fontSize: 12, color: form.quartiers.includes(q) ? C.accent : C.text, fontWeight: form.quartiers.includes(q) ? 600 : 400 }}>
                  <input type="checkbox" checked={form.quartiers.includes(q)} onChange={() => toggleArr('quartiers', q)} style={{ display: 'none' }} />
                  {q}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Secteurs</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(ref && ref.secteurs ? ref.secteurs : []).map(s => (
                <label key={s} style={{ cursor: 'pointer', padding: '4px 12px', borderRadius: 6, background: form.secteurs.includes(s) ? C.purpleBg : C.bg, border: '1px solid ' + (form.secteurs.includes(s) ? C.purple : C.border), fontSize: 12, color: form.secteurs.includes(s) ? C.purple : C.text }}>
                  <input type="checkbox" checked={form.secteurs.includes(s)} onChange={() => toggleArr('secteurs', s)} style={{ display: 'none' }} />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {BOOLS.map(([k, l]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: form[k] ? C.accent : C.text, fontWeight: form[k] ? 600 : 400 }}>
                <input type="checkbox" checked={!!form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.checked }))} />
                {l}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 16px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>Annuler</button>
            <button onClick={submit} disabled={saving} style={{ padding: '9px 16px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>{saving ? '...' : 'Enregistrer le demandeur'}</button>
          </div>
        </Modal>
      )}

      {editDem && (
        <EditWithMotifModal
          title={'Modifier demandeur - ' + editDem.nom + ' ' + editDem.prenom}
          item={editDem}
          endpoint={'/demandeurs/' + editDem.id}
          toast={toast}
          motifs={MOTIFS_MODIFICATION}
          onClose={() => setEditDem(null)}
          onSaved={(upd) => { setEditDem(null); setSel(upd); reload() }}
          fields={[
            { key: 'nom', label: 'Nom', type: 'text', upper: true },
            { key: 'prenom', label: 'Prenom', type: 'text' },
            { key: 'nud', label: 'NUD', type: 'text' },
            { key: 'anc', label: 'Anciennete (mois)', type: 'number' },
            { key: 'adultes', label: 'Nb adultes', type: 'number' },
            { key: 'enfants', label: 'Nb enfants', type: 'number' },
            { key: 'compo', label: 'Composition', type: 'text', full: true },
            { key: 'rev', label: 'Revenu mensuel (EUR)', type: 'number' },
            { key: 'sit', label: 'Situation logement', type: 'select', options: (ref && ref.situations_logement ? ref.situations_logement : []) },
            { key: 'quartier_origine', label: 'Quartier origine', type: 'select', options: (ref && ref.quartiers ? ref.quartiers : []) },
            { key: 'typ_v', label: 'Typologie souhaitee', type: 'select', options: ['T1', 'T2', 'T3', 'T4', 'T5'] },
            { key: 'typ_min', label: 'Typologie min', type: 'select', options: ['T1', 'T2', 'T3', 'T4', 'T5'] },
            { key: 'typ_max', label: 'Typologie max', type: 'select', options: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'] },
            { key: 'quartiers', label: 'Quartiers souhaites', type: 'multi', options: (ref && ref.quartiers ? ref.quartiers : []), full: true },
            { key: 'secteurs', label: 'Secteurs', type: 'multi', options: (ref && ref.secteurs ? ref.secteurs : []), full: true },
            { key: 'dalo', label: 'DALO', type: 'boolean' },
            { key: 'violences', label: 'VIF (violences)', type: 'boolean' },
            { key: 'sans_log', label: 'Sans logement', type: 'boolean' },
            { key: 'expulsion', label: 'Expulsion', type: 'boolean' },
            { key: 'urgence', label: 'Urgence sociale', type: 'boolean' },
            { key: 'suroc', label: 'Suroccupation', type: 'boolean' },
            { key: 'handicap', label: 'Handicap', type: 'boolean' },
            { key: 'pmr', label: 'PMR', type: 'boolean' },
            { key: 'rdc', label: 'RDC requis', type: 'boolean' },
            { key: 'grossesse', label: 'Grossesse', type: 'boolean' },
            { key: 'mutation', label: 'Mutation', type: 'boolean' },
            { key: 'prio_handicap', label: 'Prio. handicap', type: 'boolean' },
            { key: 'prio_expulsion', label: 'Prio. expulsion', type: 'boolean' },
            { key: 'pieces', label: 'Dossier complet', type: 'boolean' }
          ]}
        />
      )}

      {histDem && (
        <HistoriqueFicheModal
          entity_type="demandeur"
          entity_id={histDem.id}
          onClose={() => setHistDem(null)}
        />
      )}

      {timelineDem && (
        <TimelineDemandeur
          dem_id={timelineDem.id}
          onClose={() => setTimelineDem(null)}
        />
      )}

      {archiveDem && (
        <Modal title={'Archiver - ' + archiveDem.nom + ' ' + archiveDem.prenom} onClose={() => setArchiveDem(null)}>
          <div style={{ background: C.redBg, border: '1px solid ' + C.red + '33', borderRadius: 9, padding: '10px 14px', fontSize: 12, color: C.red, marginBottom: 16, fontWeight: 600 }}>
            Archivage definitif. Le motif sera trace dans l audit.
          </div>
          <Field label="Motif d archivage *">
            <select style={inp} value={archiveMotif} onChange={e => setArchiveMotif(e.target.value)}>
              <option value="">--- Choisir un motif ---</option>
              {MOTIFS_ARCHIVAGE.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          {archiveMotif === 'Autre motif (precise ci-dessous)' && (
            <Field label="Precision">
              <input style={inp} value={archiveLibre} onChange={e => setArchiveLibre(e.target.value)} placeholder="Precisez le motif" />
            </Field>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button onClick={() => setArchiveDem(null)} style={{ padding: '9px 16px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>Annuler</button>
            <button onClick={doArchive} style={{ padding: '9px 20px', background: C.red, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>Confirmer l archivage</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ===========================================================
// MATCHING
// ===========================================================

function Matching({ initLog, addToCAL }) {
  const { data: logements, loading: loadLog } = useApi('/logements')
  const { data: audiences } = useApi('/audiences')
  const [selLog, setSelLog] = useState(initLog || null)
  const [results, setResults] = useState(null)
  const [matching, setMatching] = useState(false)

  const doMatch = useCallback(async (lg) => {
    setSelLog(lg)
    setResults(null)
    setMatching(true)
    try { setResults(await api('/matching/' + lg.id)) }
    catch (e) { alert('Erreur matching: ' + e.message) }
    finally { setMatching(false) }
  }, [])

  useEffect(() => { if (initLog) doMatch(initLog) }, [initLog && initLog.id])

  if (loadLog) return <Spin />

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', fontFamily: Fb }}>
      <div style={{ width: 248, minWidth: 248, background: C.card, borderRight: '1px solid ' + C.border, overflowY: 'auto', padding: 14 }}>
        <div style={{ fontFamily: Fh, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Logements</div>
        {(logements || []).map(l => (
          <button key={l.id} onClick={() => doMatch(l)}
            style={{ display: 'block', width: '100%', padding: '11px 13px', borderRadius: 9, border: '2px solid ' + (selLog && selLog.id === l.id ? C.accent : C.border), background: selLog && selLog.id === l.id ? C.accentL : 'transparent', cursor: 'pointer', textAlign: 'left', marginBottom: 8 }}>
            <div style={{ fontFamily: Fh, fontWeight: 700, fontSize: 13, color: selLog && selLog.id === l.id ? C.accent : C.text }}>{l.typ} - {l.quartier}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{l.adresse}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{l.loyer} EUR - {l.surface} m2</div>
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
        {!selLog && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80%', color: C.muted }}>
            <div style={{ fontFamily: Fh, fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Selectionnez un logement</div>
            <div style={{ fontSize: 12.5 }}>Le moteur calcule les scores cote serveur</div>
          </div>
        )}
        {matching && <Spin />}
        {results && !matching && (
          <>
            <div style={{ background: C.navy, borderRadius: 12, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, background: C.accent, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: '#fff', fontFamily: Fh, flexShrink: 0 }}>{results.logement.typ}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: Fh }}>{results.logement.adresse}</div>
                <div style={{ color: C.light, fontSize: 11.5, marginTop: 2 }}>{results.logement.quartier} - {results.logement.bailleur} - {results.logement.surface} m2</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ color: '#fff', fontSize: 19, fontWeight: 800, fontFamily: Fh }}>{results.logement.loyer} EUR</div>
                <div style={{ color: C.light, fontSize: 11 }}>{results.logement.contingent}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'center' }}>
              {[
                { label: 'Eligibles', val: results.stats.nb_eligible, color: C.green },
                { label: 'Top 4', val: Math.min(4, results.stats.nb_eligible), color: C.accent },
                { label: 'Avec audience', val: results.stats.nb_avec_audience, color: C.purple },
                { label: 'Non eligibles', val: results.stats.nb_ineligible, color: C.red }
              ].map((s, i) => (
                <div key={i} style={{ background: C.card, borderRadius: 8, padding: '9px 14px', border: '1px solid ' + C.border, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: Fh }}>{s.val}</div>
                  <div style={{ fontSize: 10.5, color: C.muted }}>{s.label}</div>
                </div>
              ))}
              <div style={{ flex: 1 }} />
              <button onClick={() => addToCAL(results.logement, results.top4)}
                style={{ padding: '9px 18px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontWeight: 700, fontSize: 12.5 }}>
                Top 4 vers CAL
              </button>
            </div>
            {(results.eligible || []).map((x, i) => {
              const adq = adequation(x.res.total)
              const isTop4 = i < 4
              const audFav = (audiences || []).find(a => a.dem_id === x.dem.id && a.favorable)
              return (
                <div key={x.dem.id} style={{ background: C.card, borderRadius: 11, border: '1px solid ' + (isTop4 ? C.accent : C.border), marginBottom: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 7, flexShrink: 0, background: isTop4 ? C.accent : '#EEF1F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, fontFamily: Fh, color: isTop4 ? '#fff' : C.muted }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.text, fontFamily: Fh }}>{x.dem.nom} {x.dem.prenom}</div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>{x.dem.compo} - {x.dem.anc} mois</div>
                    <div style={{ marginTop: 4 }}>
                      <Pill label={adq.label} color={adq.color} bg={adq.bg} />
                      {x.dem.dalo && <Pill label="DALO" color={C.red} bg={C.redBg} />}
                      {x.dem.violences && <Pill label="VIF" color={C.red} bg={C.redBg} />}
                      {x.dem.sans_log && <Pill label="SDF" color={C.red} bg={C.redBg} />}
                      {audFav && <Pill label="Audience fav." color={C.purple} bg={C.purpleBg} />}
                      {!x.dem.pieces && <Pill label="Incomplet" color={C.amber} bg={C.amberBg} />}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: C.muted }}>Score</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: adq.color, fontFamily: Fh }}>{x.res.total}</div>
                    {x.res.base !== x.res.total && <div style={{ fontSize: 9, color: C.muted }}>base {x.res.base}</div>}
                  </div>
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: Fh, color: parseFloat(x.res.te) <= 30 ? C.green : parseFloat(x.res.te) <= 35 ? C.amber : C.red }}>{x.res.te}%</div>
                    <div style={{ fontSize: 10, color: C.muted }}>effort</div>
                  </div>
                </div>
              )
            })}
            {(results.ineligible || []).length > 0 && (
              <>
                <div style={{ fontFamily: Fh, fontSize: 10.5, fontWeight: 700, color: C.red, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '14px 0 8px' }}>
                  Non eligibles ({results.ineligible.length})
                </div>
                {results.ineligible.map(x => (
                  <div key={x.dem.id} style={{ background: C.card, borderRadius: 8, padding: '9px 14px', border: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 5, opacity: 0.6 }}>
                    <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.text }}>{x.dem.nom} {x.dem.prenom}</div>
                    {(x.res.excl || []).map((e, i) => <Pill key={i} label={e} color={C.red} bg={C.redBg} />)}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ===========================================================
// CAL PREPA
// ===========================================================

const MOTIFS_REFUS = [
  'Inadéquation ressources / loyer',
  'Composition familiale incompatible',
  'Logement non adapté au handicap',
  'Secteur non souhaité',
  'Candidat a refusé la proposition',
  'Dossier incomplet en commission',
  'Candidat déjà attributaire',
  'Logement retiré par le bailleur',
  'Priorité DALO accordée',
  'Décision reportée'
]

const STATUTS_POST = ['En attente réponse candidat', 'Accepté', 'Refusé par candidat', 'Refusé par bailleur', 'Bail signé', 'Entrée dans les lieux', 'Sans suite']

function CALPrepa({ dossiers }) {
  const [decisions, setDecisions] = useState({})
  const [postCAL, setPostCAL] = useState({})
  const [tab, setTab] = useState('commission')
  const [saving, setSaving] = useState({})
  const [saved, setSaved] = useState({})
  const toast = useToast()

  const dk = (d, c) => d.logement.id + '-' + c.dem.id

  const saveDecision = async (d) => {
    const candidats = (d.candidats || []).map((c, i) => {
      const k = dk(d, c)
      return {
        dem_id: c.dem.id,
        nom: c.dem.nom + ' ' + c.dem.prenom,
        rang: i + 1,
        score: c.res.total,
        decision: decisions[k] || '',
        motif: decisions[k + 'm'] || ''
      }
    })
    setSaving(p => ({ ...p, [d.logement.id]: true }))
    try {
      await api('/decisions-cal', {
        method: 'POST',
        body: {
          logement_id: d.logement.id,
          logement_ref: d.logement.ref,
          logement_adresse: d.logement.adresse,
          date_cal: new Date().toLocaleDateString('fr-FR'),
          candidats
        }
      })
      setSaved(p => ({ ...p, [d.logement.id]: true }))
      setTimeout(() => setSaved(p => ({ ...p, [d.logement.id]: false })), 3000)
      const rang1 = candidats.find(c => c.decision && c.decision.includes('Retenu rang 1'))
      if (rang1) toast('Attribution confirmee - ' + rang1.nom + ' - ' + d.logement.ref, 'success')
      else toast('Decision CAL enregistree - ' + d.logement.ref, 'info')
    } catch (e) { toast('Erreur: ' + e.message, 'error') }
    finally { setSaving(p => ({ ...p, [d.logement.id]: false })) }
  }

  if (!dossiers.length) {
    return (
      <div style={{ padding: 28, fontFamily: Fb }}>
        <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 24px', letterSpacing: '-0.03em' }}>Preparation CAL</h1>
        <div style={{ background: C.card, borderRadius: 12, padding: 32, border: '1px solid ' + C.border, textAlign: 'center', color: C.muted }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>Aucun dossier</div>
          <div style={{ fontSize: 12.5 }}>Lancez un matching et envoyez le top 4.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Preparation CAL</h1>
      <p style={{ color: C.muted, fontSize: 12.5, marginBottom: 18 }}>{dossiers.length} logement(s) en commission</p>
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: C.bg, borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {[{ id: 'commission', label: 'Commission' }, { id: 'post', label: 'Suivi post-CAL' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: tab === t.id ? 700 : 500, background: tab === t.id ? C.card : 'transparent', color: tab === t.id ? C.text : C.muted, boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'commission' && dossiers.map(d => (
        <div key={d.logement.id} style={{ background: C.card, borderRadius: 13, border: '1px solid ' + C.border, marginBottom: 24, overflow: 'hidden' }}>
          <div style={{ background: C.navy, padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, background: C.accent, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff', fontFamily: Fh, flexShrink: 0 }}>{d.logement.typ}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontFamily: Fh, fontSize: 13.5 }}>{d.logement.adresse}</div>
              <div style={{ color: C.light, fontSize: 11 }}>{d.logement.quartier} - {d.logement.bailleur}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ color: '#fff', fontWeight: 800, fontFamily: Fh, fontSize: 17 }}>{d.logement.loyer} EUR</div>
              <div style={{ color: C.light, fontSize: 11 }}>{d.logement.ref} - {d.logement.contingent}</div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  {['#', 'Candidat', 'Composition', 'Revenu', 'Effort', 'Score', 'Priorites', 'Decision', 'Motif'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid ' + C.border }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(d.candidats || []).map((c, i) => {
                  const adq = adequation(c.res.total)
                  const k = dk(d, c)
                  return (
                    <tr key={c.dem.id} style={{ borderBottom: '1px solid ' + C.border, background: i === 0 ? '#FFFAF7' : 'transparent' }}>
                      <td style={{ padding: '9px 12px' }}>
                        <div style={{ width: 24, height: 24, borderRadius: 5, background: i === 0 ? C.accent : C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, fontFamily: Fh, color: i === 0 ? '#fff' : C.muted }}>{i + 1}</div>
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <div style={{ fontWeight: 700, color: C.text, fontFamily: Fh }}>{c.dem.nom} {c.dem.prenom}</div>
                        <div style={{ fontSize: 10, color: C.muted }}>{c.dem.nud}</div>
                      </td>
                      <td style={{ padding: '9px 12px', color: C.text }}>{c.dem.compo}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 600 }}>{(c.dem.rev || 0).toLocaleString()} EUR</td>
                      <td style={{ padding: '9px 12px' }}><span style={{ fontWeight: 700, color: parseFloat(c.res.te) <= 30 ? C.green : parseFloat(c.res.te) <= 35 ? C.amber : C.red }}>{c.res.te}%</span></td>
                      <td style={{ padding: '9px 12px' }}><span style={{ fontWeight: 800, fontSize: 15, color: adq.color, fontFamily: Fh }}>{c.res.total}</span></td>
                      <td style={{ padding: '9px 12px' }}>
                        {c.dem.dalo && <Pill label="DALO" color={C.red} bg={C.redBg} />}
                        {c.dem.violences && <Pill label="VIF" color={C.red} bg={C.redBg} />}
                        {c.dem.sans_log && <Pill label="SDF" color={C.red} bg={C.redBg} />}
                        {!c.dem.dalo && !c.dem.violences && !c.dem.sans_log && <span style={{ color: C.muted }}>---</span>}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <select value={decisions[k] || ''} onChange={e => setDecisions(p => ({ ...p, [k]: e.target.value }))}
                          style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid ' + C.border, fontFamily: Fb, fontSize: 11, color: C.text, background: C.card }}>
                          <option value="">--- Decision ---</option>
                          {['Retenu rang 1', 'Retenu rang 2', 'Retenu rang 3', 'Retenu rang 4', 'Suppleant', 'Ajourn', 'Refuse'].map(v => <option key={v}>{v}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        {(decisions[k] || '').match(/Refuse|Ajourn/) ? (
                          <select value={decisions[k + 'm'] || ''} onChange={e => setDecisions(p => ({ ...p, [k + 'm']: e.target.value }))}
                            style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid ' + C.amber, fontFamily: Fb, fontSize: 11, color: C.text, background: C.card, maxWidth: 190 }}>
                            <option value="">--- Motif ---</option>
                            {MOTIFS_REFUS.map(m => <option key={m}>{m}</option>)}
                          </select>
                        ) : <span style={{ color: C.muted }}>---</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '11px 18px', borderTop: '1px solid ' + C.border, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => window.open('/api/cal/pdf/' + d.logement.id, '_blank')}
              style={{ padding: '7px 14px', border: '1px solid ' + C.border, borderRadius: 7, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 11.5, fontWeight: 600, color: C.muted }}>
              Export PDF
            </button>
            <button onClick={() => saveDecision(d)} disabled={saving[d.logement.id]}
              style={{ padding: '7px 14px', border: 'none', borderRadius: 7, background: saved[d.logement.id] ? C.green : C.accent, cursor: 'pointer', fontFamily: Fh, fontSize: 11.5, fontWeight: 700, color: '#fff' }}>
              {saving[d.logement.id] ? '...' : saved[d.logement.id] ? 'Enregistre !' : 'Valider'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ===========================================================
// AUDIENCES
// ===========================================================

function AudiencesElus() {
  const { data: audiences, loading, reload } = useApi('/audiences')
  const { data: elus } = useApi('/elus')
  const { data: demandeurs } = useApi('/demandeurs')
  const { data: ref } = useApi('/referentiels')
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const blank = { dem_id: '', elu_id: '', date_audience: '', quartier_origine: '', quartier_elu: '', quartier_souhaite: '', objet: '', favorable: false, suite: '' }
  const [form, setForm] = useState(blank)
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = async () => {
    if (!form.dem_id || !form.elu_id || !form.date_audience) return toast('Demandeur, elu et date obligatoires', 'error')
    setSaving(true)
    try {
      await api('/audiences', { method: 'POST', body: form })
      setShowForm(false)
      setForm(blank)
      reload()
      const elu = (elus || []).find(e => e.id === form.elu_id)
      const dem = (demandeurs || []).find(d => d.id === form.dem_id)
      toast('Audience enregistree - ' + (dem ? dem.nom : '') + (form.favorable ? ' - Favorable' : ''), 'success')
    } catch (e) { toast('Erreur: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  const attribues = (audiences || []).filter(a => a.statut === 'Attribue')

  if (loading) return <Spin />

  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Audiences Elus</h1>
          <p style={{ color: C.muted, fontSize: 12.5 }}>{(audiences || []).length} audiences - {attribues.length} attributions</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => window.open('/api/export/audiences', '_blank')}
            style={{ padding: '9px 16px', border: '1px solid ' + C.border, borderRadius: 9, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>
            Export CSV
          </button>
          <button onClick={() => setShowForm(true)}
            style={{ padding: '10px 18px', background: C.purple, color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontFamily: Fh, fontSize: 12.5, fontWeight: 700 }}>
            + Nouvelle audience
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { l: 'Total', v: (audiences || []).length, c: C.purple },
          { l: 'Favorables', v: (audiences || []).filter(a => a.favorable).length, c: C.green },
          { l: 'Attribuees', v: attribues.length, c: C.accent }
        ].map((k, i) => (
          <div key={i} style={{ background: C.card, borderRadius: 11, padding: '13px 18px', border: '1px solid ' + C.border, flex: '1 1 100px' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.c, fontFamily: Fh }}>{k.v}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{k.l}</div>
          </div>
        ))}
      </div>
      <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {['Date', 'Demandeur', 'Elu', 'Q. origine', 'Q. souhaite', 'Objet', 'Favorable', 'Statut'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid ' + C.border }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(audiences || []).map(a => {
                const dem = (demandeurs || []).find(d => d.id === a.dem_id)
                const elu = (elus || []).find(e => e.id === a.elu_id)
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid ' + C.border }}>
                    <td style={{ padding: '9px 12px', color: C.muted, whiteSpace: 'nowrap' }}>{a.date_audience}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: C.text, fontFamily: Fh }}>{dem ? dem.nom + ' ' + dem.prenom : a.dem_id}</td>
                    <td style={{ padding: '9px 12px', color: C.purple, fontWeight: 600 }}>{elu ? elu.nom : a.elu_id}</td>
                    <td style={{ padding: '9px 12px', color: C.muted }}>{a.quartier_origine || '---'}</td>
                    <td style={{ padding: '9px 12px', color: C.muted }}>{a.quartier_souhaite || '---'}</td>
                    <td style={{ padding: '9px 12px', color: C.muted, fontSize: 11 }}>{a.objet}</td>
                    <td style={{ padding: '9px 12px' }}><span style={{ color: a.favorable ? C.green : C.amber, fontWeight: 600 }}>{a.favorable ? 'Oui' : 'Non'}</span></td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: a.statut === 'Attribue' ? C.greenBg : C.amberBg, color: a.statut === 'Attribue' ? C.green : C.amber }}>{a.statut}</span>
                    </td>
                  </tr>
                )
              })}
              {(audiences || []).length === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: C.muted }}>Aucune audience. Cliquez sur + pour commencer.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {showForm && (
        <Modal title="Nouvelle audience elu" onClose={() => setShowForm(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Demandeur *">
              <select style={inp} value={form.dem_id} onChange={set('dem_id')}>
                <option value="">--- Choisir ---</option>
                {(demandeurs || []).map(d => <option key={d.id} value={d.id}>{d.nom} {d.prenom}</option>)}
              </select>
            </Field>
            <Field label="Elu *">
              <select style={inp} value={form.elu_id} onChange={set('elu_id')}>
                <option value="">--- Choisir ---</option>
                {(elus || []).filter(e => e.actif !== false).map(e => <option key={e.id} value={e.id}>{e.nom} - {e.secteur}</option>)}
              </select>
            </Field>
            <Field label="Date *"><input style={inp} value={form.date_audience} placeholder="JJ/MM/AAAA" onChange={set('date_audience')} /></Field>
            <Field label="Quartier de l elu">
              <select style={inp} value={form.quartier_elu} onChange={set('quartier_elu')}>
                <option value="">---</option>
                {(ref && ref.quartiers ? ref.quartiers : []).map(q => <option key={q}>{q}</option>)}
              </select>
            </Field>
            <Field label="Quartier origine">
              <select style={inp} value={form.quartier_origine} onChange={set('quartier_origine')}>
                <option value="">---</option>
                {(ref && ref.quartiers ? ref.quartiers : []).map(q => <option key={q}>{q}</option>)}
              </select>
            </Field>
            <Field label="Quartier souhaite">
              <select style={inp} value={form.quartier_souhaite} onChange={set('quartier_souhaite')}>
                <option value="">---</option>
                {(ref && ref.quartiers ? ref.quartiers : []).map(q => <option key={q}>{q}</option>)}
              </select>
            </Field>
            <Field label="Objet"><input style={inp} value={form.objet} placeholder="ex: Suroccupation T4 urgent" onChange={set('objet')} /></Field>
            <Field label="Suite donnee"><input style={inp} value={form.suite} placeholder="ex: Instruction renforcee" onChange={set('suite')} /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginTop: 12, color: form.favorable ? C.green : C.text, fontWeight: form.favorable ? 600 : 400 }}>
            <input type="checkbox" checked={form.favorable} onChange={set('favorable')} />
            Audience favorable - instruction renforcee
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 16px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>Annuler</button>
            <button onClick={submit} disabled={saving} style={{ padding: '9px 16px', background: C.purple, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>{saving ? '...' : 'Enregistrer'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ===========================================================
// NOTIFICATIONS
// ===========================================================

function Notifications() {
  const { data: notifs, loading, reload } = useApi('/notifications')
  const { data: elus } = useApi('/elus')
  const { data: demandeurs } = useApi('/demandeurs')
  const [selElu, setSelElu] = useState('all')

  const markLu = async (id) => { await api('/notifications/' + id + '/lu', { method: 'PUT', body: {} }); reload() }
  const markAll = async () => { await api('/notifications/tout-marquer-lu', { method: 'PUT', body: selElu !== 'all' ? { elu_id: selElu } : {} }); reload() }

  const TYPE_META = {
    attribution_audience: { label: 'Attribution', color: C.green, bg: C.greenBg },
    urgence_territoire: { label: 'Urgence', color: C.red, bg: C.redBg },
    cal_a_venir: { label: 'CAL', color: C.accent, bg: C.accentL },
    digest: { label: 'Digest', color: C.muted, bg: C.bg }
  }

  const filtered = (notifs || []).filter(n => selElu === 'all' || n.elu_id === selElu)
  const nonLus = filtered.filter(n => !n.lu).length

  if (loading) return <Spin />

  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Notifications</h1>
          <p style={{ color: C.muted, fontSize: 12.5 }}>Alertes territoire et attributions</p>
        </div>
        {nonLus > 0 && (
          <button onClick={markAll} style={{ padding: '8px 16px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>
            Tout marquer lu ({nonLus})
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 180, flexShrink: 0 }}>
          <div style={{ fontFamily: Fh, fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Par elu</div>
          <button onClick={() => setSelElu('all')}
            style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid ' + (selElu === 'all' ? C.navy : C.border), background: selElu === 'all' ? C.navy : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: selElu === 'all' ? '#fff' : C.text, marginBottom: 6 }}>
            Tous ({(notifs || []).length})
          </button>
          {(elus || []).map(e => {
            const nb = (notifs || []).filter(n => n.elu_id === e.id)
            const nl = nb.filter(n => !n.lu).length
            return (
              <button key={e.id} onClick={() => setSelElu(e.id)}
                style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid ' + (selElu === e.id ? C.purple : C.border), background: selElu === e.id ? C.purpleBg : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: Fh, fontSize: 12, marginBottom: 6 }}>
                <div style={{ fontWeight: 700, color: selElu === e.id ? C.purple : C.text }}>
                  {e.nom}
                  {nl > 0 && <span style={{ float: 'right', fontSize: 10, background: C.red, color: '#fff', padding: '1px 6px', borderRadius: 99 }}>{nl}</span>}
                </div>
                <div style={{ fontSize: 10, color: C.muted }}>{e.secteur} - {nb.length}</div>
              </button>
            )
          })}
        </div>
        <div style={{ flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ background: C.card, borderRadius: 12, padding: 32, border: '1px solid ' + C.border, textAlign: 'center', color: C.muted }}>
              Aucune notification
            </div>
          )}
          {filtered.map(n => {
            const meta = TYPE_META[n.type] || TYPE_META.digest
            const dem = n.dem_id ? (demandeurs || []).find(d => d.id === n.dem_id) : null
            const elu = (elus || []).find(e => e.id === n.elu_id)
            return (
              <div key={n.id} onClick={() => !n.lu && markLu(n.id)}
                style={{ background: C.card, borderRadius: 11, padding: '14px 18px', border: '1px solid ' + (n.lu ? C.border : meta.color), marginBottom: 10, cursor: n.lu ? 'default' : 'pointer', borderLeft: '4px solid ' + (n.lu ? C.border : meta.color), opacity: n.lu ? 0.75 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: C.text, fontFamily: Fh }}>{n.titre}</span>
                      {!n.lu && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: C.purple, color: '#fff', fontWeight: 700 }}>NOUVEAU</span>}
                      <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 99, background: meta.bg, color: meta.color, fontWeight: 600, marginLeft: 'auto' }}>{meta.label}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6, marginBottom: 8 }}>{n.message}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {elu && <Tag text={elu.nom} color={C.purple} bg={C.purpleBg} />}
                      {dem && <Tag text={dem.nom + ' ' + dem.prenom} />}
                      {n.logement_ref && <Tag text={n.logement_ref} color={C.accent} bg={C.accentL} />}
                      <span style={{ fontSize: 11, color: C.light, marginLeft: 'auto' }}>{n.date} a {n.heure}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ===========================================================
// GESTION ELUS
// ===========================================================

function GestionElus() {
  const { data: elus, loading, reload } = useApi('/elus')
  const { data: ref } = useApi('/referentiels')
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editElu, setEditElu] = useState(null)
  const [saving, setSaving] = useState(false)
  const [ficheElu, setFicheElu] = useState(null)
  const blank = { nom: '', prenom: '', secteur: '', quartiers: [], email: '', telephone: '' }
  const [form, setForm] = useState(blank)

  if (ficheElu) return <FicheEluPage elu_id={ficheElu} onBack={() => setFicheElu(null)} />

  const openEdit = (elu) => {
    setEditElu(elu)
    setForm({ nom: elu.nom, prenom: elu.prenom || '', secteur: elu.secteur || '', quartiers: elu.quartiers || [], email: elu.email || '', telephone: elu.telephone || '' })
    setShowForm(true)
  }

  const openNew = () => { setEditElu(null); setForm(blank); setShowForm(true) }

  const submit = async () => {
    if (!form.nom || !form.secteur) return toast('Nom et secteur obligatoires', 'error')
    setSaving(true)
    try {
      if (editElu) {
        await api('/elus/' + editElu.id, { method: 'PUT', body: form })
        toast(form.nom + ' mis a jour', 'success')
      } else {
        await api('/elus', { method: 'POST', body: form })
        toast(form.nom + ' ajoute(e)', 'success')
      }
      setShowForm(false)
      reload()
    } catch (e) { toast('Erreur: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  const archiver = async (elu) => {
    if (!confirm('Archiver l elu ' + elu.nom + ' ?')) return
    try {
      await api('/elus/' + elu.id, { method: 'DELETE' })
      reload()
      toast(elu.nom + ' archive', 'warning')
    } catch (e) { toast('Erreur', 'error') }
  }

  const toggleQ = (q) => setForm(p => ({ ...p, quartiers: p.quartiers.includes(q) ? p.quartiers.filter(x => x !== q) : [...p.quartiers, q] }))
  const SECT_C = { Nord: C.accent, Sud: C.green, Est: C.teal, Ouest: C.purple, Centre: C.blue }

  const actifs = (elus || []).filter(e => e.actif !== false)

  if (loading) return <Spin />

  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Gestion des Elus</h1>
          <p style={{ color: C.muted, fontSize: 12.5 }}>{actifs.length} elu(s) references - Saint-Denis</p>
        </div>
        <button onClick={openNew} style={{ padding: '10px 18px', background: C.purple, color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontFamily: Fh, fontSize: 12.5, fontWeight: 700 }}>
          + Nouvel elu
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 14 }}>
        {actifs.map(elu => {
          const sectCol = SECT_C[elu.secteur] || C.muted
          return (
            <div key={elu.id} style={{ background: C.card, borderRadius: 13, border: '1px solid ' + C.border, overflow: 'hidden' }}>
              <div style={{ background: sectCol, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff', fontFamily: Fh, flexShrink: 0 }}>
                  {elu.prenom ? elu.prenom[0] : ''}{elu.nom ? elu.nom[0] : ''}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: 14, fontFamily: Fh }}>{elu.nom}</div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11.5 }}>{elu.prenom || ''}</div>
                </div>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700 }}>{elu.secteur}</span>
              </div>
              <div style={{ padding: '14px 18px' }}>
                {(elu.quartiers || []).length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Quartiers</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(elu.quartiers || []).map(q => <span key={q} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: C.bg, color: C.text }}>{q}</span>)}
                    </div>
                  </div>
                )}
                {(elu.email || elu.telephone) && (
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, lineHeight: 1.7 }}>
                    {elu.email && <div>mail: <a href={'mailto:' + elu.email} style={{ color: C.blue, textDecoration: 'none' }}>{elu.email}</a></div>}
                    {elu.telephone && <div>tel: <a href={'tel:' + elu.telephone.replace(/\s/g, '')} style={{ color: C.blue, textDecoration: 'none' }}>{elu.telephone}</a></div>}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 12, borderTop: '1px solid ' + C.border, flexWrap: 'wrap' }}>
                  <button onClick={() => setFicheElu(elu.id)} style={{ flex: '1 1 auto', padding: '7px', borderRadius: 7, border: '1px solid ' + C.purple + '33', background: C.purpleBg, cursor: 'pointer', fontFamily: Fh, fontSize: 11.5, fontWeight: 700, color: C.purple }}>Fiche detaillee</button>
                  <button onClick={() => openEdit(elu)} style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid ' + C.border, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 11.5, fontWeight: 600, color: C.text }}>Modifier</button>
                  <button onClick={() => archiver(elu)} style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid ' + C.red + '33', background: C.redBg, cursor: 'pointer', fontFamily: Fh, fontSize: 11.5, fontWeight: 600, color: C.red }}>Archive</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {actifs.length === 0 && (
        <div style={{ background: C.card, borderRadius: 12, padding: 40, border: '1px solid ' + C.border, textAlign: 'center', color: C.muted }}>
          <div style={{ fontFamily: Fh, fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>Aucun elu reference</div>
          <div style={{ fontSize: 12.5, marginBottom: 20 }}>Ajoutez les elus pour activer les audiences</div>
          <button onClick={openNew} style={{ padding: '10px 22px', background: C.purple, color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontFamily: Fh, fontSize: 13, fontWeight: 700 }}>
            + Ajouter le premier elu
          </button>
        </div>
      )}
      {showForm && (
        <Modal title={editElu ? 'Modifier l elu' : 'Nouvel elu'} onClose={() => setShowForm(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Nom *"><input style={inp} value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value.toUpperCase() }))} /></Field>
            <Field label="Prenom"><input style={inp} value={form.prenom} onChange={e => setForm(p => ({ ...p, prenom: e.target.value }))} /></Field>
            <Field label="Secteur *">
              <select style={inp} value={form.secteur} onChange={e => setForm(p => ({ ...p, secteur: e.target.value }))}>
                <option value="">--- Choisir ---</option>
                {(ref && ref.secteurs ? ref.secteurs : ['Nord', 'Sud', 'Est', 'Ouest', 'Centre']).map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Email"><input style={inp} type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="elu@saint-denis.fr" /></Field>
            <Field label="Telephone"><input style={inp} value={form.telephone} onChange={e => setForm(p => ({ ...p, telephone: e.target.value }))} placeholder="06 XX XX XX XX" /></Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Quartiers</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(ref && ref.quartiers ? ref.quartiers : []).map(q => (
                <label key={q} style={{ cursor: 'pointer', padding: '5px 12px', borderRadius: 7, background: form.quartiers.includes(q) ? C.purpleBg : C.bg, border: '1px solid ' + (form.quartiers.includes(q) ? C.purple : C.border), fontSize: 12, color: form.quartiers.includes(q) ? C.purple : C.text }}>
                  <input type="checkbox" checked={form.quartiers.includes(q)} onChange={() => toggleQ(q)} style={{ display: 'none' }} />
                  {q}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 16px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>Annuler</button>
            <button onClick={submit} disabled={saving} style={{ padding: '9px 20px', background: C.purple, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>{saving ? '...' : editElu ? 'Modifier' : 'Ajouter'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ===========================================================
// STATISTIQUES SIMPLE
// ===========================================================

function Stats() {
  const { data: dem } = useApi('/demandeurs')
  const { data: aud } = useApi('/audiences')
  if (!dem || !aud) return <Spin />
  const actifs = dem.filter(d => d.statut === 'active')
  const attribues = aud.filter(a => a.statut === 'Attribue')
  const parTyp = ['T1', 'T2', 'T3', 'T4', 'T5'].map(t => ({ l: t, v: actifs.filter(d => d.typ_v === t).length }))
  const max = Math.max(1, ...parTyp.map(t => t.v))
  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 20px', letterSpacing: '-0.03em' }}>Statistiques</h1>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { l: 'Demandeurs actifs', v: actifs.length, c: C.accent },
          { l: 'Audiences favorables', v: aud.filter(a => a.favorable).length, c: C.green },
          { l: 'Attributions', v: attribues.length, c: C.blue },
          { l: 'Taux attribution', v: aud.length ? Math.round(attribues.length / aud.length * 100) + '%' : '0%', c: C.purple }
        ].map((k, i) => (
          <div key={i} style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: '1px solid ' + C.border, flex: '1 1 130px' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.c, fontFamily: Fh }}>{k.v}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{k.l}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ background: C.card, borderRadius: 12, padding: 20, border: '1px solid ' + C.border, flex: 1 }}>
          <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>Demandes par typologie</div>
          {parTyp.map(t => (
            <div key={t.l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: Fh, fontWeight: 700, fontSize: 11, width: 26, color: C.text }}>{t.l}</span>
              <div style={{ flex: 1, height: 8, background: '#EEF1F6', borderRadius: 99 }}>
                <div style={{ height: '100%', width: (t.v / max * 100) + '%', background: C.accent, borderRadius: 99 }} />
              </div>
              <span style={{ fontSize: 11, color: C.muted, width: 20, textAlign: 'right' }}>{t.v}</span>
            </div>
          ))}
        </div>
        <div style={{ background: C.card, borderRadius: 12, padding: 20, border: '1px solid ' + C.border, flex: 1 }}>
          <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>Situations urgentes</div>
          {[
            { l: 'DALO', v: actifs.filter(d => d.dalo).length, c: C.red },
            { l: 'Sans logement', v: actifs.filter(d => d.sans_log).length, c: C.red },
            { l: 'VIF', v: actifs.filter(d => d.violences).length, c: C.red },
            { l: 'Expulsion', v: actifs.filter(d => d.prio_expulsion).length, c: C.amber },
            { l: 'Suroccupation', v: actifs.filter(d => d.suroc).length, c: C.amber },
            { l: 'Handicap', v: actifs.filter(d => d.handicap).length, c: C.purple }
          ].filter(x => x.v > 0).map((x, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={{ fontSize: 12, color: C.text }}>{x.l}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: x.c, fontFamily: Fh }}>{x.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ===========================================================
// RAPPORT MENSUEL
// ===========================================================

function RapportMensuel() {
  const { data: rapport, loading, reload } = useApi('/rapport-mensuel')
  if (loading) return <Spin />
  if (!rapport) return null
  const maxTyp = Math.max(1, ...Object.values(rapport.par_typ || {}))
  const maxQ = Math.max(1, ...(rapport.par_quartier || []).map(q => q.nb))
  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Rapport d activite</h1>
          <p style={{ color: C.muted, fontSize: 12.5 }}>Genere le {rapport.generated_at}</p>
        </div>
        <button onClick={() => reload()} style={{ padding: '9px 16px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>Actualiser</button>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { l: 'Demandeurs actifs', v: rapport.nb_demandeurs_actifs, c: C.accent },
          { l: 'Logements dispon.', v: rapport.nb_logements, c: C.blue },
          { l: 'Audiences', v: rapport.nb_audiences, c: C.purple },
          { l: 'Attributions', v: rapport.nb_attributions, c: C.green },
          { l: 'Taux attribution', v: rapport.taux_attribution + '%', c: rapport.taux_attribution >= 50 ? C.green : C.amber }
        ].map((k, i) => (
          <div key={i} style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: '1px solid ' + C.border, flex: '1 1 120px' }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{k.l}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: k.c, fontFamily: Fh }}>{k.v}</div>
          </div>
        ))}
      </div>
      <div style={{ background: rapport.compliance_dalo && rapport.compliance_dalo.ok ? C.greenBg : C.redBg, borderRadius: 12, padding: '14px 20px', marginBottom: 20, border: '1px solid ' + (rapport.compliance_dalo && rapport.compliance_dalo.ok ? C.green : C.red) + '44', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: Fh, fontWeight: 800, fontSize: 13.5, color: rapport.compliance_dalo && rapport.compliance_dalo.ok ? C.green : C.red }}>
            Compliance DALO - {rapport.compliance_dalo ? rapport.compliance_dalo.taux : 0}%
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            Objectif legal : minimum 25%
          </div>
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 800, fontFamily: Fh, color: rapport.compliance_dalo && rapport.compliance_dalo.ok ? C.green : C.red }}>{rapport.compliance_dalo ? rapport.compliance_dalo.taux : 0}%</div>
          <div style={{ fontSize: 10, color: C.muted }}>/ 25% requis</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ background: C.card, borderRadius: 12, padding: 20, border: '1px solid ' + C.border, flex: 1 }}>
          <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>Demandes par typ.</div>
          {Object.entries(rapport.par_typ || {}).map(([typ, nb]) => (
            <div key={typ} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: Fh, fontWeight: 700, fontSize: 11, width: 30, color: C.text }}>{typ}</span>
              <div style={{ flex: 1, height: 10, background: '#EEF1F6', borderRadius: 99 }}>
                <div style={{ height: '100%', width: (nb / maxTyp * 100) + '%', background: nb / maxTyp >= 0.8 ? C.red : nb / maxTyp >= 0.5 ? C.amber : C.green, borderRadius: 99 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text, width: 24, textAlign: 'right' }}>{nb}</span>
            </div>
          ))}
        </div>
        <div style={{ background: C.card, borderRadius: 12, padding: 20, border: '1px solid ' + C.border, flex: 1 }}>
          <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>Pression par quartier</div>
          {(rapport.par_quartier || []).map(({ quartier, nb }) => (
            <div key={quartier} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{quartier}</span>
              <div style={{ width: 80, height: 8, background: '#EEF1F6', borderRadius: 99 }}>
                <div style={{ height: '100%', width: (nb / maxQ * 100) + '%', background: C.accent, borderRadius: 99 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: Fh, width: 20, textAlign: 'right' }}>{nb}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ background: C.navy, padding: '12px 18px' }}>
          <div style={{ color: '#fff', fontFamily: Fh, fontWeight: 700, fontSize: 13 }}>Performance des elus</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {['Elu', 'Secteur', 'Audiences', 'Favorables', 'Attributions', 'Taux'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid ' + C.border }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(rapport.stats_elus || []).map((e, i) => (
                <tr key={e.id} style={{ borderBottom: '1px solid ' + C.border, background: i === 0 ? '#FFFAF7' : 'transparent' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: C.text, fontFamily: Fh }}>{e.nom}</td>
                  <td style={{ padding: '10px 14px', color: C.muted }}>{e.secteur}</td>
                  <td style={{ padding: '10px 14px' }}>{e.nb_audiences}</td>
                  <td style={{ padding: '10px 14px' }}><span style={{ color: C.green, fontWeight: 600 }}>{e.nb_favorables}</span></td>
                  <td style={{ padding: '10px 14px' }}><span style={{ fontSize: 15, fontWeight: 800, color: C.accent, fontFamily: Fh }}>{e.nb_attributions}</span></td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 12, padding: '2px 9px', borderRadius: 99, fontWeight: 700, background: e.taux >= 50 ? C.greenBg : e.taux >= 25 ? C.amberBg : C.redBg, color: e.taux >= 50 ? C.green : e.taux >= 25 ? C.amber : C.red }}>{e.taux}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {rapport.nb_urgents_sans_proposition > 0 && (
        <div style={{ background: C.redBg, borderRadius: 12, padding: '16px 20px', border: '1px solid ' + C.red + '44' }}>
          <div style={{ fontFamily: Fh, fontWeight: 800, fontSize: 14, color: C.red, marginBottom: 12 }}>
            {rapport.nb_urgents_sans_proposition} dossier(s) urgent(s) sans attribution
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(rapport.urgents_sans_proposition || []).map(d => (
              <div key={d.id} style={{ background: '#fff', borderRadius: 8, padding: '8px 12px', border: '1px solid ' + C.red + '33' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: Fh }}>{d.nom} {d.prenom}</div>
                <div style={{ fontSize: 10.5, color: C.muted }}>{d.anc}m - {d.nud || '---'}</div>
                <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                  {(d.flags || []).map(f => <span key={f} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: C.redBg, color: C.red, fontWeight: 700 }}>{f}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ===========================================================
// PORTAIL CANDIDAT - page publique
// ===========================================================

function PortailCandidatPage() {
  const [nud, setNud] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const search = async (e) => {
    if (e) e.preventDefault()
    if (!nud.trim()) return
    setLoading(true)
    setErr('')
    setResult(null)
    try {
      const r = await fetch('/api/portail/dossier/' + encodeURIComponent(nud.trim()))
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Dossier introuvable'); return }
      setResult(d)
    } catch (e) { setErr('Erreur de connexion') }
    finally { setLoading(false) }
  }

  const ETAPES = [
    { n: 1, label: 'Demande enregistree' },
    { n: 2, label: 'Suivi actif' },
    { n: 3, label: 'Proposition attendue' },
    { n: 4, label: 'Attribution' }
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0B1E3D 0%,#1D3557 100%)', display: 'flex', flexDirection: 'column', fontFamily: Fb }}>
      <div style={{ padding: '22px 30px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #E05C2A 0%, #F68144 100%)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, color: '#fff', fontFamily: Fh, boxShadow: '0 6px 16px rgba(224,92,42,0.3)' }}>L</div>
        <div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 16, fontFamily: Fh }}>Logivia</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Suivi de dossier · Ville de Saint-Denis</div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          {!result ? (
            <>
              <div style={{ textAlign: 'center', marginBottom: 36 }}>
                <h1 style={{ color: '#fff', fontFamily: Fh, fontSize: 24, fontWeight: 800, margin: '0 0 10px', letterSpacing: '-0.03em' }}>Suivi de votre dossier</h1>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
                  Entrez votre numero unique de demande (NUD) pour consulter l avancement de votre dossier.
                </p>
              </div>
              <form onSubmit={search}>
                <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 26, border: '1px solid rgba(255,255,255,0.1)' }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    Votre NUD
                  </label>
                  <input value={nud} onChange={e => setNud(e.target.value)} placeholder="ex: 93284-2021-00142"
                    style={{ width: '100%', padding: '13px 15px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontFamily: Fb, fontSize: 15, boxSizing: 'border-box', outline: 'none', letterSpacing: '0.04em' }} />
                  {err && <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(220,38,38,0.15)', borderRadius: 8, border: '1px solid rgba(220,38,38,0.3)', fontSize: 13, color: '#FCA5A5' }}>{err}</div>}
                  <button type="submit" disabled={loading || !nud.trim()}
                    style={{ width: '100%', marginTop: 14, padding: '13px', borderRadius: 10, border: 'none', background: nud.trim() ? C.accent : 'rgba(255,255,255,0.1)', color: nud.trim() ? '#fff' : 'rgba(255,255,255,0.3)', cursor: nud.trim() ? 'pointer' : 'default', fontFamily: Fh, fontSize: 14, fontWeight: 700 }}>
                    {loading ? 'Recherche...' : 'Consulter mon dossier'}
                  </button>
                </div>
              </form>
              <div style={{ textAlign: 'center', marginTop: 20, color: 'rgba(255,255,255,0.2)', fontSize: 12, lineHeight: 1.8 }}>
                Votre NUD figure sur l accusé d enregistrement de votre demande
              </div>
            </>
          ) : (
            <div>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.12)', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 48, height: 48, background: C.accent, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 900, color: '#fff', fontFamily: Fh, flexShrink: 0 }}>
                    {result.prenom ? result.prenom[0] : ''}{result.nom_initial || ''}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#fff', fontWeight: 800, fontSize: 17, fontFamily: Fh }}>{result.prenom} {result.nom_initial}</div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 }}>NUD: {result.nud} - {result.anc_mois} mois</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, fontWeight: 700, background: result.etape === 4 ? C.green : result.etape === 3 ? C.amber : 'rgba(255,255,255,0.15)', color: '#fff' }}>{result.statut}</div>
                  </div>
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.12)', marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Etape de votre dossier</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 16, left: '10%', right: '10%', height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 99 }}>
                    <div style={{ height: '100%', width: Math.min(100, (result.etape - 1) / 3 * 100) + '%', background: C.accent, borderRadius: 99 }} />
                  </div>
                  {ETAPES.map(et => (
                    <div key={et.n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1, position: 'relative' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: et.n <= result.etape ? C.accent : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, border: et.n === result.etape ? '3px solid #fff' : '3px solid transparent', zIndex: 1 }}>
                        <span style={{ color: '#fff', fontWeight: 700 }}>{et.n < result.etape ? 'v' : et.n}</span>
                      </div>
                      <div style={{ fontSize: 10, color: et.n <= result.etape ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)', textAlign: 'center', fontWeight: et.n === result.etape ? 700 : 400, maxWidth: 80, lineHeight: 1.3 }}>{et.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              {(result.actions_requises || []).length > 0 && (
                <div style={{ background: 'rgba(217,119,6,0.15)', borderRadius: 12, padding: '14px 18px', border: '1px solid rgba(217,119,6,0.3)', marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, color: '#FCD34D', fontSize: 13, marginBottom: 8 }}>Action(s) requise(s)</div>
                  {result.actions_requises.map((a, i) => <div key={i} style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>- {a}</div>)}
                </div>
              )}
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.12)', marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Historique</div>
                <div style={{ position: 'relative', paddingLeft: 20 }}>
                  <div style={{ position: 'absolute', left: 7, top: 6, bottom: 0, width: 2, background: 'rgba(255,255,255,0.1)' }} />
                  {(result.historique || []).map((ev, i) => (
                    <div key={i} style={{ position: 'relative', marginBottom: 12 }}>
                      <div style={{ position: 'absolute', left: -17, top: 4, width: 10, height: 10, borderRadius: '50%', background: C.accent, boxShadow: '0 0 0 3px #0B1E3D, 0 0 0 4px ' + C.accent }} />
                      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)' }}>{ev.date}</div>
                      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', fontWeight: 600, marginTop: 1 }}>{ev.type}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '14px 18px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Contact</div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', lineHeight: 2 }}>
                  <div>{result.contact && result.contact.adresse}</div>
                  <div>Tel: {result.contact && result.contact.tel}</div>
                  <div>Mail: {result.contact && result.contact.email}</div>
                  <div>Horaires: {result.contact && result.contact.horaires}</div>
                </div>
              </div>
              <button onClick={() => { setResult(null); setNud('') }}
                style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: Fh, fontSize: 13, fontWeight: 600 }}>
                Rechercher un autre dossier
              </button>
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: '14px 30px', borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>
        Logivia · Ville de Saint-Denis · Données sécurisées · RGPD
      </div>
    </div>
  )
}

// ===========================================================
// PORTAIL INFO (page dans l'app)
// ===========================================================

function PortailInfo() {
  const portailUrl = window.location.origin + '/portail'
  const nuds = ['93284-2021-00142', '93284-2020-00891', '93284-2022-01204']
  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Portail Candidat</h1>
      <p style={{ color: C.muted, fontSize: 12.5, marginBottom: 24 }}>URL publique - les candidats consultent leur dossier sans login</p>
      <div style={{ background: C.navy, borderRadius: 13, padding: '18px 22px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>URL du portail</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 9, padding: '10px 15px', fontFamily: 'monospace', fontSize: 13, color: '#fff', wordBreak: 'break-all' }}>{portailUrl}</div>
          <button onClick={() => { navigator.clipboard.writeText(portailUrl) }}
            style={{ padding: '10px 16px', background: C.accent, color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Copier</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        {[
          { ico: 'portail', titre: 'Sans login', desc: 'Le candidat accède avec son seul NUD. Pas de compte ni de mot de passe.' },
          { ico: 'elus', titre: 'Sécurisé', desc: 'Seules les informations non sensibles sont affichées. Nom partiellement masqué.' },
          { ico: 'notifications', titre: '100% mobile', desc: 'Interface adaptée téléphone. Le candidat consulte depuis n’importe où.' },
          { ico: 'check', titre: 'Unique sur le marché', desc: 'Aucun outil concurrent ne propose un portail candidat aussi simple.' }
        ].map((f, i) => (
          <div key={i} style={{ background: C.card, borderRadius: 12, padding: '16px 18px', border: '1px solid ' + C.border }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: C.accentL, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <Icon name={f.ico} size={18} color={C.accent} />
            </div>
            <div style={{ fontFamily: Fh, fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 4 }}>{f.titre}</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>
      <div style={{ background: C.bg, borderRadius: 12, padding: '16px 20px', border: '1px solid ' + C.border }}>
        <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10 }}>NUD de test</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {nuds.map(n => (
            <span key={n} style={{ padding: '5px 12px', borderRadius: 7, background: C.card, border: '1px solid ' + C.border, fontFamily: 'monospace', fontSize: 12, color: C.text, cursor: 'pointer' }}
              onClick={() => navigator.clipboard.writeText(n)}>
              {n}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ===========================================================
// APP INNER
// ===========================================================

function AppInner() {
  const { user, logout } = useAuthCtx()
  const [active, setActive] = useState('dashboard')
  const [matchLog, setMatchLog] = useState(null)
  const [calDossiers, setCalDossiers] = useState([])
  const { data: notifs, reload: reloadNotifs } = useApi('/notifications')
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  const toast = useToast()
  const prevBadge = useRef(0)
  const badge = (notifs || []).filter(n => !n.lu).length

  useEffect(() => {
    const interval = setInterval(reloadNotifs, 30000)
    return () => clearInterval(interval)
  }, [reloadNotifs])

  useEffect(() => {
    if (badge > prevBadge.current && prevBadge.current > 0) {
      toast(badge - prevBadge.current + ' nouvelle(s) notification(s)', 'info')
    }
    prevBadge.current = badge
  }, [badge])

  useEffect(() => {
    if (user && user.role === 'elu') setActive('audiences')
  }, [user])

  const goMatch = (log) => { setMatchLog(log); setActive('matching') }
  const addToCAL = (logement, candidats) => {
    setCalDossiers(prev => [...prev.filter(d => d.logement.id !== logement.id), { logement, candidats }])
    toast('Top 4 envoye en commission - ' + logement.ref, 'info')
    setActive('cal')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, overflow: 'hidden', fontFamily: Fb }}>
      {isDemo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9990, background: 'linear-gradient(90deg,' + C.amber + ',' + C.accent + ')', padding: '7px 20px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 12px rgba(224,92,42,0.4)' }}>
          <span style={{ color: '#fff', fontFamily: Fh, fontWeight: 800, fontSize: 12 }}>MODE DEMONSTRATION - Donnees fictives</span>
          <button onClick={() => { setIsDemo(false); toast('Mode reel retabli', 'success') }} style={{ marginLeft: 'auto', padding: '4px 14px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, cursor: 'pointer', fontFamily: Fh, fontSize: 11, fontWeight: 700 }}>x Quitter la demo</button>
        </div>
      )}
      <div style={{ display: 'flex', width: '100%', height: '100%', marginTop: isDemo ? 36 : 0 }}>
        <Sidebar
          active={active}
          setActive={setActive}
          badge={badge}
          onLogout={logout}
          onChangePwd={() => setShowChangePwd(true)}
          isDemo={isDemo}
          onDemo={() => { setIsDemo(!isDemo); toast(isDemo ? 'Mode reel retabli' : 'Mode demo active - donnees fictives', 'info') }}
        />
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {active === 'dashboard' && <div style={{ flex: 1, overflowY: 'auto' }}><Dashboard setActive={setActive} /></div>}
          {active === 'logements' && <div style={{ flex: 1, overflowY: 'auto' }}><Logements goMatch={goMatch} /></div>}
          {active === 'demandeurs' && <Demandeurs />}
          {active === 'matching' && <Matching initLog={matchLog} addToCAL={addToCAL} />}
          {active === 'cal' && <div style={{ flex: 1, overflowY: 'auto' }}><CALPrepa dossiers={calDossiers} /></div>}
          {active === 'audiences' && <div style={{ flex: 1, overflowY: 'auto' }}><AudiencesElus /></div>}
          {active === 'elus' && <div style={{ flex: 1, overflowY: 'auto' }}><GestionElus /></div>}
          {active === 'stats' && <div style={{ flex: 1, overflowY: 'auto' }}><Stats /></div>}
          {active === 'rapport' && <div style={{ flex: 1, overflowY: 'auto' }}><RapportMensuel /></div>}
          {active === 'notifications' && <div style={{ flex: 1, overflowY: 'auto' }}><Notifications /></div>}
          {active === 'portail' && <div style={{ flex: 1, overflowY: 'auto' }}><PortailInfo /></div>}
          {active === 'import' && <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
            <ImportPelehas onDone={(res) => {
              if (res.type === 'demandeurs') setActive('demandeurs')
              else if (res.type === 'logements') setActive('logements')
              else if (res.type === 'audiences') setActive('audiences')
            }} />
          </div>}
          {active === 'users' && <div style={{ flex: 1, overflowY: 'auto' }}><GestionUtilisateurs /></div>}
          {active === 'telegram' && <div style={{ flex: 1, overflowY: 'auto' }}><TelegramPanel /></div>}
          {active === 'logs' && <div style={{ flex: 1, overflowY: 'auto' }}><LogsActions /></div>}
          {active === 'alertes' && <div style={{ flex: 1, overflowY: 'auto' }}><AlertesPage /></div>}
          {active === 'calendrier' && <div style={{ flex: 1, overflowY: 'auto' }}><CalendrierPage toast={toast} /></div>}
          {active === 'carte' && <div style={{ flex: 1, overflowY: 'auto' }}><CartePage /></div>}
          {active === 'scoring' && <div style={{ flex: 1, overflowY: 'auto' }}><ScoringReglesPage isDirecteur={user && user.role === 'directeur'} toast={toast} /></div>}
          {active === 'kanban' && <div style={{ flex: 1, overflowY: 'auto' }}><KanbanPage onOpenDemandeur={(id) => { setActive('demandeurs'); sessionStorage.setItem('logivia_open_dem', id) }} /></div>}
          {active === 'messagerie' && <div style={{ flex: 1, overflowY: 'auto' }}><MessageriePage onOpenDemandeur={(id) => { setActive('demandeurs'); sessionStorage.setItem('logivia_open_dem', id) }} /></div>}
          {active === 'relances' && <div style={{ flex: 1, overflowY: 'auto' }}><RelancesPage onOpenDemandeur={(id) => { setActive('demandeurs'); sessionStorage.setItem('logivia_open_dem', id) }} /></div>}
          {active === 'ia-stats' && <div style={{ flex: 1, overflowY: 'auto' }}><IAStatsPage /></div>}
        </div>
      </div>
      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
      <RealtimeTopBar />
    </div>
  )
}

// Top-right HUD : presence globale + cloche notifications.
function RealtimeTopBar() {
  const [panelOpen, setPanelOpen] = useState(false)
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 900,
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'white', padding: '6px 12px', borderRadius: 10,
      boxShadow: '0 4px 14px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0'
    }}>
      <PresenceGlobale />
      <div style={{ width: 1, height: 24, background: '#e2e8f0' }} />
      <NotificationsBell onOpen={() => setPanelOpen(v => !v)} />
      {panelOpen && <NotificationsPanel onClose={() => setPanelOpen(false)} />}
    </div>
  )
}

// ===========================================================
// APP ROOT
// ===========================================================

function AppRoot() {
  const { user } = useAuthCtx()
  if (window.location.pathname.startsWith('/portail')) return <PortailCandidatPage />
  if (!user) return <Login />
  const token = getToken()
  return (
    <RealtimeProvider token={token} user={user}>
      <AppInner />
    </RealtimeProvider>
  )
}

export default function App() {
  useFonts()
  // Affiche le splash screen une fois par session
  const [splashDone, setSplashDone] = useState(() => {
    try { return sessionStorage.getItem('logivia_splash_done') === '1' } catch { return false }
  })
  const finishSplash = useCallback(() => {
    try { sessionStorage.setItem('logivia_splash_done', '1') } catch {}
    setSplashDone(true)
  }, [])

  // Injecte styles globaux + titre
  useEffect(() => {
    document.title = 'Logivia — Saint-Denis'
    const style = document.createElement('style')
    style.id = 'logivia-global-styles'
    style.textContent = `
      * { box-sizing: border-box; }
      html, body, #root { margin: 0; padding: 0; height: 100%; }
      body { background: #EEF1F6; -webkit-font-smoothing: antialiased; }
      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #C5CDDC; border-radius: 10px; border: 2px solid #EEF1F6; }
      ::-webkit-scrollbar-thumb:hover { background: #8A9BB5; }
      input:focus, select:focus, textarea:focus { border-color: #E05C2A !important; box-shadow: 0 0 0 3px rgba(224,92,42,0.1) !important; }
      button { transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.15s ease; }
      button:not(:disabled):hover { filter: brightness(1.05); }
      button:not(:disabled):active { transform: scale(0.98); }
      @keyframes pageFade { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
      .logivia-page { animation: pageFade 0.35s ease both; }
    `
    if (!document.getElementById('logivia-global-styles')) document.head.appendChild(style)
    return () => { const el = document.getElementById('logivia-global-styles'); if (el) el.remove() }
  }, [])

  return (
    <ErrorBoundary>
      {!splashDone && <SplashScreen onDone={finishSplash} />}
      <ToastProvider>
        <AuthProviderLocal>
          <AppRoot />
        </AuthProviderLocal>
      </ToastProvider>
    </ErrorBoundary>
  )
}