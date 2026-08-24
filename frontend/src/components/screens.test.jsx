import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomeScreen, TIME_CONTROLS } from './screens.jsx'

const me = { name: 'Test Player', rating: 1200, wins: 3, losses: 1, streak: 2, photoUrl: null }

describe('HomeScreen', () => {
  it('renders the three primary action buttons', () => {
    render(
      <HomeScreen
        me={me}
        tc={TIME_CONTROLS[0]}
        setTc={() => {}}
        onPlayFriend={() => {}}
        onFindOpponent={() => {}}
        onOpenClock={() => {}}
        recent={[]}
      />
    )
    expect(screen.getByText('Play a friend')).toBeInTheDocument()
    expect(screen.getByText('Find an opponent')).toBeInTheDocument()
    expect(screen.getByText('Chess clock')).toBeInTheDocument()
  })

  it('fires the correct handler for each action button', async () => {
    const user = userEvent.setup()
    const onPlayFriend = vi.fn()
    const onFindOpponent = vi.fn()
    const onOpenClock = vi.fn()
    render(
      <HomeScreen
        me={me}
        tc={TIME_CONTROLS[0]}
        setTc={() => {}}
        onPlayFriend={onPlayFriend}
        onFindOpponent={onFindOpponent}
        onOpenClock={onOpenClock}
        recent={[]}
      />
    )
    await user.click(screen.getByText('Play a friend'))
    expect(onPlayFriend).toHaveBeenCalled()
    await user.click(screen.getByText('Find an opponent'))
    expect(onFindOpponent).toHaveBeenCalled()
    await user.click(screen.getByText('Chess clock'))
    expect(onOpenClock).toHaveBeenCalled()
  })

  it('selects a time control chip via setTc', async () => {
    const user = userEvent.setup()
    const setTc = vi.fn()
    render(
      <HomeScreen
        me={me}
        tc={TIME_CONTROLS[0]}
        setTc={setTc}
        onPlayFriend={() => {}}
        onFindOpponent={() => {}}
        onOpenClock={() => {}}
        recent={[]}
      />
    )
    await user.click(screen.getByText(TIME_CONTROLS[1].id))
    expect(setTc).toHaveBeenCalledWith(TIME_CONTROLS[1])
  })

  it('renders recent games when provided', () => {
    render(
      <HomeScreen
        me={me}
        tc={TIME_CONTROLS[0]}
        setTc={() => {}}
        onPlayFriend={() => {}}
        onFindOpponent={() => {}}
        onOpenClock={() => {}}
        recent={[{ id: 1, name: 'Rival', tc: '5+0', moves: 30, result: 'W' }]}
      />
    )
    expect(screen.getByText('Rival')).toBeInTheDocument()
    expect(screen.getByText('Won')).toBeInTheDocument()
  })
})
