// Home, Matchmaking, Lobby, ResultSheet. Presentational; logic lives in App.
import React from 'react'
import { Avatar, Icon, TgHeader } from './ui.jsx'

export const TIME_CONTROLS = [
  { id: '1+0', base: 60, inc: 0, name: 'Bullet', icon: 'bolt' },
  { id: '3+2', base: 180, inc: 2, name: 'Blitz', icon: 'bolt' },
  { id: '5+0', base: 300, inc: 0, name: 'Blitz', icon: 'bolt' },
  { id: '10+0', base: 600, inc: 0, name: 'Rapid', icon: 'clock' },
  { id: '15+10', base: 900, inc: 10, name: 'Rapid', icon: 'clock' },
  { id: '30+0', base: 1800, inc: 0, name: 'Classical', icon: 'rabbit' },
]

function MiniBoardBanner() {
  const cells = []
  for (let i = 0; i < 64; i++) {
    const r = Math.floor(i / 8), c = i % 8
    cells.push(<div key={i} style={{ background: (r + c) % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'transparent' }} />)
  }
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid',
      gridTemplateColumns: 'repeat(8,1fr)', gridTemplateRows: 'repeat(8,1fr)',
      opacity: 0.9, maskImage: 'linear-gradient(120deg, #000 10%, transparent 75%)',
      WebkitMaskImage: 'linear-gradient(120deg, #000 10%, transparent 75%)',
    }}>{cells}</div>
  )
}

// ── HOME ─────────────────────────────────────────────────────────
export function HomeScreen({ me, tc, setTc, onPlayFriend, onFindOpponent, onOpenClock, recent }) {
  return (
    <div className="tg-app">
      <TgHeader title="Chess" subtitle="online" accentSub onMenu={() => {}} />
      <div className="tg-scroll">
        <div style={{
          position: 'relative', margin: '12px 12px 0', borderRadius: 18, overflow: 'hidden',
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 32%, var(--panel)), var(--panel))', padding: 16,
        }}>
          <MiniBoardBanner />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 13 }}>
            <Avatar name={me.name} size={54} photoUrl={me.photoUrl} online />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{me.name}</div>
              <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 2 }}>Rating {me.rating} · {me.wins}W / {me.losses}L</div>
            </div>
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', filter: 'brightness(1.25)' }}>{me.streak}</div>
              <div style={{ fontSize: 10.5, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '.5px' }}>streak</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '18px 12px 4px', fontSize: 13, fontWeight: 600, color: 'var(--hint)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Time control</div>
        <div style={{ padding: '0 12px' }}>
          <div className="chips">
            {TIME_CONTROLS.map((t) => (
              <div key={t.id} className="chip" data-on={t.id === tc.id} onClick={() => setTc(t)}>
                <div className="chip-time">{t.id}</div>
                <div className="chip-name"><Icon name={t.icon} size={11} style={{ verticalAlign: '-1px', marginRight: 3 }} />{t.name}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '18px 12px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-primary btn-block" onClick={onPlayFriend}>
            <Icon name="users" size={20} /> Play a friend
          </button>
          <button className="btn btn-ghost btn-block" onClick={onFindOpponent}>
            <Icon name="search" size={19} /> Find an opponent
          </button>
          <button className="btn btn-ghost btn-block" onClick={onOpenClock}>
            <Icon name="clock" size={19} /> Chess clock
            <span className="new-pill">NEW</span>
          </button>
        </div>

        {recent && recent.length > 0 && (
          <>
            <div style={{ padding: '14px 12px 6px', fontSize: 13, fontWeight: 600, color: 'var(--hint)', textTransform: 'uppercase', letterSpacing: '.6px' }}>Recent games</div>
            <div className="card" style={{ margin: '0 12px 16px', overflow: 'hidden' }}>
              {recent.map((g, i) => (
                <div key={g.id || i}>
                  {i > 0 && <div className="divider" style={{ marginLeft: 60 }} />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px' }}>
                    <Avatar name={g.name} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600 }}>{g.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--hint)' }}>{g.tc} · {g.moves} moves</div>
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 8,
                      background: g.result === 'W' ? 'color-mix(in srgb, var(--good) 22%, transparent)' : g.result === 'L' ? 'color-mix(in srgb, var(--bad) 22%, transparent)' : 'rgba(255,255,255,0.08)',
                      color: g.result === 'W' ? 'var(--good)' : g.result === 'L' ? 'var(--bad)' : 'var(--sub)',
                    }}>{g.result === 'W' ? 'Won' : g.result === 'L' ? 'Lost' : 'Draw'}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{ height: 16 }} />
      </div>
    </div>
  )
}

// ── MATCHMAKING ──────────────────────────────────────────────────
export function MatchmakingScreen({ tc, elapsed, found, opponent, onCancel }) {
  return (
    <div className="tg-app">
      <TgHeader title="Finding opponent" onBack={onCancel} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 22 }}>
        <div style={{ position: 'relative', width: 150, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!found && [0, 1, 2].map((i) => (
            <span key={i} style={{
              position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid var(--accent)',
              animation: `radar 2.4s ${i * 0.8}s ease-out infinite`,
            }} />
          ))}
          <div style={{ position: 'relative', transition: 'transform .4s' }}>
            {found
              ? <Avatar name={opponent.name} size={92} photoUrl={opponent.photoUrl} online />
              : <div style={{ width: 92, height: 92, borderRadius: '50%', background: 'var(--panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                <Icon name="search" size={40} stroke={2.2} />
              </div>}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 19, fontWeight: 700 }}>{found ? opponent.name : 'Searching…'}</div>
          <div style={{ fontSize: 13.5, color: 'var(--sub)', marginTop: 4 }}>
            {found ? `Rating ${opponent.rating} · starting game` : `${tc.name} ${tc.id} · ${elapsed}s`}
          </div>
        </div>
        {!found && (
          <div style={{ display: 'flex', gap: 6, color: 'var(--hint)', fontSize: 13, alignItems: 'center' }}>
            <span className="spinner" style={{ width: 15, height: 15 }} /> matching players near your level
          </div>
        )}
        {!found && <button className="btn btn-ghost" style={{ padding: '12px 30px', marginTop: 6 }} onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  )
}

// ── LOBBY (play a friend) ────────────────────────────────────────
export function LobbyScreen({ tc, link, joined, opponent, me, onCopy, onShare, onBack, toast }) {
  return (
    <div className="tg-app">
      <TgHeader title="Invite a friend" subtitle={`${tc.name} · ${tc.id}`} onBack={onBack} />
      <div className="tg-scroll" style={{ padding: '14px 12px' }}>
        <div className="card" style={{ padding: '18px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-around', marginBottom: 14 }}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
            <Avatar name={me.name} size={56} photoUrl={me.photoUrl} online />
            <div style={{ fontSize: 14, fontWeight: 600 }}>{me.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--hint)' }}>{me.rating}</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--hint)', letterSpacing: '1px' }}>VS</div>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
            {joined
              ? <Avatar name={opponent.name} size={56} photoUrl={opponent.photoUrl} online />
              : <div className="pulse" style={{ width: 56, height: 56, borderRadius: '50%', border: '2px dashed var(--hint)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hint)' }}><Icon name="plus" size={24} /></div>}
            <div style={{ fontSize: 14, fontWeight: 600, color: joined ? 'var(--text)' : 'var(--hint)' }}>{joined ? opponent.name : 'Waiting…'}</div>
            <div style={{ fontSize: 11.5, color: 'var(--hint)' }}>{joined ? opponent.rating : '—'}</div>
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--hint)', textTransform: 'uppercase', letterSpacing: '.6px', padding: '4px 4px 8px' }}>Invite link</div>
        <div className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 18%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
            <Icon name="link" size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</div>
          <button className="tg-hbtn" style={{ color: 'var(--accent)', width: 36, height: 36 }} onClick={onCopy} aria-label="Copy"><Icon name="copy" size={20} /></button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onShare}><Icon name="share" size={18} /> Share</button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCopy}><Icon name="copy" size={18} /> Copy link</button>
        </div>

        <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--hint)', textAlign: 'center', lineHeight: 1.5, padding: '0 14px' }}>
          {joined ? 'Your friend is here — the game is starting!' : 'Share this link in any chat. The game begins as soon as they open it.'}
        </div>
      </div>

      <div className="controls" style={{ borderTop: 'none' }}>
        <button className="btn btn-primary btn-block" disabled>
          {joined ? 'Starting game…' : 'Waiting for opponent…'}
        </button>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

// ── RESULT SHEET ─────────────────────────────────────────────────
export function ResultSheet({ result, title, reason, delta, newRating, onRematch, onHome, onReview }) {
  const win = result === 'win', draw = result === 'draw'
  const color = win ? 'var(--good)' : draw ? 'var(--warn)' : 'var(--bad)'
  const icon = win ? 'trophy' : draw ? 'draw' : 'flag'
  const heading = title || (win ? 'You won!' : draw ? 'Draw' : 'You lost')
  return (
    <div className="overlay">
      <div className="sheet">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ width: 66, height: 66, borderRadius: '50%', background: `color-mix(in srgb, ${color} 20%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
            <Icon name={icon} size={34} stroke={2} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, whiteSpace: 'nowrap' }}>{heading}</div>
          <div style={{ fontSize: 14, color: 'var(--sub)' }}>{reason}</div>
          {newRating != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, background: 'var(--panel2)', padding: '7px 14px', borderRadius: 11 }}>
              <span style={{ fontSize: 13, color: 'var(--hint)' }}>Rating</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{newRating}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: delta >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                {delta >= 0 ? '+' : ''}{delta}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {onRematch && <button className="btn btn-primary btn-block" onClick={onRematch}><Icon name="redo" size={19} /> Rematch</button>}
          <div style={{ display: 'flex', gap: 9 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onReview}><Icon name="search" size={18} /> Review</button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onHome}><Icon name="home" size={18} /> Home</button>
          </div>
        </div>
      </div>
    </div>
  )
}
