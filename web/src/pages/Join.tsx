import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, slotLabel, type JoinConflict, type Room } from '../api'
import { useApp } from '../app-context'
import { Header } from '../components'

// QR から授業に参加する。
// 同じ時間帯の別の授業にすでに参加しているときは、どちらにするか選んでもらう(間違えて別のクラスに入ったとき用)
export default function Join() {
  const { roomId = '' } = useParams()
  const { user } = useApp()
  const nav = useNavigate()
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState<JoinConflict | null>(null)
  const [busy, setBusy] = useState(false)

  const join = useCallback(async (replace: boolean) => {
    setError('')
    setBusy(true)
    try {
      const r = await api.join(roomId, replace)
      nav(r.isOpen ? `/rooms/${r.id}` : '/', { replace: true })
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && (e.data as JoinConflict)?.conflict) setConflict(e.data as JoinConflict)
      else setError((e as Error).message)
    } finally { setBusy(false) }
  }, [roomId, nav])

  useEffect(() => {
    if (user?.role === 'STUDENT') void join(false)
  }, [user, join])

  if (user?.role === 'TEACHER') {
    return (
      <>
        <Header title="参加" back="/" />
        <main className="page"><p>先生のアカウントでは参加できません。</p><Link to="/" className="btn wide">ホームへ</Link></main>
      </>
    )
  }

  if (conflict) {
    return (
      <>
        <Header title="参加" back="/" />
        <main className="page stack">
          <div className="stack-tight">
            <h2 className="page-title">同じ時間帯の授業に参加しています</h2>
            <p className="muted">同じ時間帯の授業には、1つしか参加できません。間違えて参加していた場合は、抜けてからこの授業に参加できます。</p>
          </div>
          <div className="join-compare">
            <RoomRow label="参加中" room={conflict.conflict} />
            <RoomRow label="読み取った授業" room={conflict.room} highlight />
          </div>
          <p className="hint">「{conflict.conflict.subject}」で呼び出し中の場合は、呼び出しも取り消されます。</p>
          <div className="stack-tight">
            <button type="button" className="btn primary wide large" disabled={busy} onClick={() => void join(true)}>
              抜けて、こちらに参加する
            </button>
            <Link to="/" className="btn wide" replace>参加しない</Link>
          </div>
          {error && <p className="error">{error}</p>}
        </main>
      </>
    )
  }

  return (
    <>
      <Header title="参加" back="/" />
      <main className="page center">{error ? <p className="error">{error}</p> : <p className="muted">参加しています…</p>}</main>
    </>
  )
}

function RoomRow({ label, room, highlight = false }: { label: string; room: Room; highlight?: boolean }) {
  return (
    <div className={`join-room ${highlight ? 'highlight' : ''}`}>
      <span className="join-room-label">{label}</span>
      <span className="join-room-title">{room.subject}</span>
      <span className="join-room-sub">{room.className}・{slotLabel(room)}・{room.ownerName}</span>
    </div>
  )
}
