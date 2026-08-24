// Game-screen layout: player rows, moves list, chat, controls, review nav.
// Stateless/presentational; all logic lives in App.
import React from 'react'
import { Avatar, Icon, TgHeader, fmtClock, pieceCSS, SOLID } from './ui.jsx'

function PlayerRow({ player, clockMs, active, captured, adv, lowAt }) {
  if (!player) {
    return (
      <div className="player-row">
        <div className="avatar" style={{ width: 40, height: 40, background: 'var(--panel)' }} />
        <div className="player-meta"><div className="player-name" style={{ color: 'var(--hint)' }}>Waiting…</div></div>
        <div className="clock">{fmtClock(clockMs)}</div>
      </div>
    )
  }
  const low = clockMs <= (lowAt || 20000)
  return (
    <div className="player-row">
      <Avatar name={player.name} size={40} photoUrl={player.photoUrl} online={player.online} />
      <div className="player-meta">
        <div className="player-name">
          {player.name}
          {player.you && <span style={{ fontSize: 11, color: 'var(--hint)', fontWeight: 500 }}>you</span>}
        </div>
        <div className="captured">
          {captured.map((p, i) => <span key={i} className="cp" style={pieceCSS(p, 'flat')}>{SOLID[p[1]]}</span>)}
          {adv > 0 && <span className="adv">+{adv}</span>}
          {captured.length === 0 && adv <= 0 && <span className="player-rating">{player.rating}</span>}
        </div>
      </div>
      <div className="clock" data-active={active} data-low={active && low}>{fmtClock(clockMs)}</div>
    </div>
  )
}

function MovesList({ sans, viewPly, onSelect, scrollRef }) {
  const rows = []
  for (let i = 0; i < sans.length; i += 2) {
    rows.push(
      <div className="moves-row" key={i} style={{ display: 'contents' }}>
        <div className="mv-num">{i / 2 + 1}.</div>
        <div className="mv" data-on={viewPly === i + 1} onClick={() => onSelect(i + 1)}>{sans[i]}</div>
        {sans[i + 1]
          ? <div className="mv" data-on={viewPly === i + 2} onClick={() => onSelect(i + 2)}>{sans[i + 1]}</div>
          : <div />}
      </div>
    )
  }
  return (
    <div className="panel-body" ref={scrollRef}>
      {sans.length === 0
        ? <div style={{ padding: '26px 16px', textAlign: 'center', color: 'var(--hint)', fontSize: 13.5 }}>No moves yet. White to play.</div>
        : <div className="moves">{rows}</div>}
    </div>
  )
}

function ChatPanel({ messages, draft, setDraft, onSend, scrollRef, youColor }) {
  return (
    <>
      <div className="panel-body" ref={scrollRef}>
        <div className="chat">
          {messages.map((m, i) => (
            m.from === 'sys'
              ? <div key={i} className="msg msg-sys">{m.text}</div>
              : <div key={i} className={'msg ' + (m.from === youColor ? 'msg-me' : 'msg-them')}>
                {m.text}
                <span className="msg-time">{m.time}</span>
              </div>
          ))}
        </div>
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); onSend() }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message" maxLength={140} />
        <button type="submit" className="send-btn" aria-label="Send"><Icon name="send" size={18} color="#fff" fill="#fff" /></button>
      </form>
    </>
  )
}

export function GameScreen(props) {
  const {
    title, subtitle, onExit, topPlayer, bottomPlayer, topClock, bottomClock,
    activeSide, topCaptured, bottomCaptured, topAdv, bottomAdv, lowAt,
    board, tab, setTab, sans, viewPly, onSelectPly, movesRef,
    messages, draft, setDraft, onSend, chatRef, unread, youColor,
    isLive, atStart, atEnd, onStep, onLive,
    canControl, playing, onFlip, onResign, onDraw, drawBanner, onAcceptDraw, onDeclineDraw,
    statusNote,
  } = props

  return (
    <div className="tg-app">
      <TgHeader title={title} subtitle={subtitle} onBack={onExit} accentSub={!!statusNote} />
      <PlayerRow player={topPlayer} clockMs={topClock} active={activeSide === (topPlayer && topPlayer.color)} captured={topCaptured} adv={topAdv} lowAt={lowAt} />
      {board}
      <PlayerRow player={bottomPlayer} clockMs={bottomClock} active={activeSide === (bottomPlayer && bottomPlayer.color)} captured={bottomCaptured} adv={bottomAdv} lowAt={lowAt} />

      {drawBanner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'color-mix(in srgb, var(--accent) 16%, var(--bg))', borderTop: '1px solid var(--border)' }}>
          <Icon name="draw" size={20} color="var(--accent)" />
          <span style={{ flex: 1, fontSize: 13.5 }}>{topPlayer ? topPlayer.name : 'Opponent'} offers a draw</span>
          <button className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 13 }} onClick={onDeclineDraw}>Decline</button>
          <button className="btn btn-primary" style={{ padding: '7px 14px', fontSize: 13 }} onClick={onAcceptDraw}>Accept</button>
        </div>
      )}

      {!isLive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--panel2)', borderTop: '1px solid var(--border)' }}>
          <Icon name="search" size={15} color="var(--hint)" />
          <span style={{ flex: 1, fontSize: 12.5, color: 'var(--sub)' }}>Reviewing move {viewPly} of {sans.length}</span>
          <button className="ctrl" style={{ flexDirection: 'row', flex: 'none', padding: '6px 11px' }} disabled={atStart} onClick={() => onStep(-1)}><Icon name="back" size={16} /></button>
          <button className="ctrl" style={{ flexDirection: 'row', flex: 'none', padding: '6px 11px' }} disabled={atEnd} onClick={() => onStep(1)}><Icon name="back" size={16} style={{ transform: 'rotate(180deg)' }} /></button>
          <button className="btn btn-primary" style={{ padding: '7px 13px', fontSize: 13 }} onClick={onLive}>Live</button>
        </div>
      )}

      <div className="panel">
        <div className="tabs">
          <div className="tab" data-on={tab === 'moves'} onClick={() => setTab('moves')}>Moves</div>
          <div className="tab" data-on={tab === 'chat'} onClick={() => setTab('chat')}>
            Chat{unread > 0 && <span className="badge">{unread}</span>}
          </div>
        </div>
        {tab === 'moves'
          ? <MovesList sans={sans} viewPly={viewPly} onSelect={onSelectPly} scrollRef={movesRef} />
          : <ChatPanel messages={messages} draft={draft} setDraft={setDraft} onSend={onSend} scrollRef={chatRef} youColor={youColor} />}
      </div>

      {tab === 'moves' && (
        <div className="controls">
          <button className="ctrl" onClick={onFlip}><Icon name="flip" size={20} /> Flip</button>
          {canControl && playing && <button className="ctrl" onClick={onDraw}><Icon name="draw" size={20} /> Draw</button>}
          {canControl && playing && <button className="ctrl" data-danger="true" onClick={onResign}><Icon name="flag" size={20} /> Resign</button>}
          {(!canControl || !playing) && <button className="ctrl" onClick={onExit}><Icon name="home" size={20} /> Exit</button>}
        </div>
      )}
    </div>
  )
}
