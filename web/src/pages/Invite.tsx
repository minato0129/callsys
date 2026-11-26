import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, slotLabel, type Room } from '../api'
import { useApp } from '../app-context'
import { Header } from '../components'

// 先生を招待するリンク(/invite/:token)を開いたとき。確認してから、このルームの担当になる
export default function Invite() {
  const { token = '' } = useParams()
  const { user } = useApp()
  const nav = useNavigate()
  const [room, setRoom] = useState<Room | null>(null)
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.showInvite(token).then((d) => { setRoom(d.room); setJoined(d.joined) }).catch((e) => setError(e.message))
  }, [token])

  const accept = async () => {
    setBusy(true)
    try {
      const r = await api.acceptInvite(token)
      nav(`/rooms/${r.id}`, { replace: true })
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <>
      <Header title="ルームへの招待" back="/" />
      <main className="page stack">
        {error ? (
          <>
            <p className="error">{error}</p>
            <Link to="/" className="btn wide">ホームへ</Link>
          </>
        ) : !room ? (
          <p className="muted">読み込み中…</p>
        ) : (
          <>
            <div className="stack-tight">
              <h2 className="page-title">{room.ownerName} 先生から、ルームの担当に招待されています</h2>
              <p className="muted">担当になると、このルームの呼び出しの通知が届き、対応済にする・メモを書く・授業の開始と終了・メモの閲覧ができます。</p>
            </div>
            <div className="join-room highlight">
              <span className="join-room-label">ルーム</span>
              <span className="join-room-title">{room.subject}</span>
              <span className="join-room-sub">{room.className}・{slotLabel(room)}・{room.ownerName}</span>
            </div>
            {joined ? (
              <>
                <p>{room.ownerId === user?.id ? '自分で作ったルームです。' : 'すでにこのルームの担当です。'}</p>
                <Link to={`/rooms/${room.id}`} className="btn primary wide large">ルームを開く</Link>
              </>
            ) : (
              <div className="stack-tight">
                <button type="button" className="btn primary wide large" disabled={busy} onClick={() => void accept()}>このルームの担当になる</button>
                <Link to="/" className="btn wide" replace>やめる</Link>
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}
