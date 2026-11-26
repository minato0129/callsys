import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, slotLabel, slotLabels, type Room } from '../api'
import { RoomForm } from '../RoomForm'
import { useApp } from '../app-context'
import { ErrorText, Header, IconButton, PushBanner, Sheet, TabBar } from '../components'
import { IconHelp, IconPlus } from '../icons'

export default function TeacherHome() {
  const { user } = useApp()
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const load = () => api.rooms().then(setRooms).catch((e) => setError(e.message))
  useEffect(() => { void load() }, [])

  // サーバーが「授業中が先頭、あとは月曜1限から」の順で返す
  const live = rooms?.filter((r) => r.isOpen) ?? []
  const rest = rooms?.filter((r) => !r.isOpen) ?? []

  return (
    <>
      <Header title="ルーム" sub={user ? `${user.name} 先生` : undefined}
        actions={<>
          <Link to="/guide" className="icon-btn" aria-label="使い方" title="使い方"><IconHelp /></Link>
          <IconButton label="ルームを作成" onClick={() => setCreating(true)}><IconPlus /></IconButton>
        </>} />
      <main className="page page-wide stack with-tabbar">
        <PushBanner text="呼び出されたときに通知を受け取る" />

        {live.length > 0 && (
          <div className="live-grid">
            {live.map((r) => (
              <Link key={r.id} to={`/rooms/${r.id}`} className="room-live">
                <span className="room-live-label">授業中</span>
                <span className="room-live-title">{r.subject}</span>
                <span className="room-live-sub">{r.className}・{slotLabel(r)}{r.isOwner === false && `・${r.ownerName} 先生のルーム`}</span>
              </Link>
            ))}
          </div>
        )}

        {rest.length > 0 && (
          <ul className="list" aria-label="ルーム">
            {rest.map((r) => (
              <li key={r.id}>
                <Link to={`/rooms/${r.id}`} className="list-row">
                  <span className="slot">{slotLabels(r).map((l) => <span key={l}>{l}</span>)}</span>
                  <span className="list-main">
                    <span className="list-title">{r.subject}</span>
                    {/* 招待されて担当しているルームは、作った先生の名前も出す */}
                    <span className="list-sub">{r.className}{r.isOwner === false && `・${r.ownerName} 先生のルーム`}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {rooms && rooms.length === 0 && (
          <div className="empty">
            <p>授業ごとにルームを作ると、学生が QR コードから参加して呼び出せるようになります。</p>
            <button type="button" className="btn primary wide" onClick={() => setCreating(true)}>最初のルームを作成</button>
            <Link to="/guide" className="btn wide">使い方を見る</Link>
          </div>
        )}
        <ErrorText error={error} />
      </main>
      <TabBar />

      {creating && (
        <Sheet title="ルームを作成" onClose={() => setCreating(false)}>
          <RoomForm
            initial={{ subject: '', className: '', slots: [{ dayOfWeek: 1, period: 1, periodEnd: 1 }] }}
            submitLabel="作成"
            onCancel={() => setCreating(false)}
            onSubmit={async (v) => {
              await api.createRoom(v)
              setCreating(false)
              await load()
            }}
          />
        </Sheet>
      )}
    </>
  )
}
