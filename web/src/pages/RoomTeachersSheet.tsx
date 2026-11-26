import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api, type Room, type RoomTeachers } from '../api'
import { useApp } from '../app-context'
import { ErrorText, Sheet } from '../components'

// ルームの担当の先生。
// 作った先生: 招待リンク(QR・コピー・作り直し)と、招待した先生を外す
// 招待された先生: 担当の先生の一覧と、自分が担当から抜ける
export function RoomTeachersSheet({ room, onClose }: { room: Room; onClose: () => void }) {
  const { user } = useApp()
  const nav = useNavigate()
  const [data, setData] = useState<RoomTeachers | null>(null)
  const [token, setToken] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isOwner = room.isOwner ?? false
  const inviteUrl = token ? `${location.origin}/invite/${token}` : ''

  const load = useCallback(async () => {
    try {
      setData(await api.roomTeachers(room.id))
      if (isOwner) setToken((await api.invite(room.id)).token)
    } catch (e) { setError((e as Error).message) }
  }, [room.id, isOwner])
  useEffect(() => { void load() }, [load])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch { prompt('先生を招待するリンク', inviteUrl) }
  }

  const reset = async () => {
    if (!confirm('招待リンクを作り直しますか?\n今のリンクは使えなくなります(すでに担当になった先生はそのままです)。')) return
    setBusy(true)
    try { setToken((await api.resetInvite(room.id)).token) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const remove = async (id: string, name: string) => {
    const self = id === user?.id
    if (!confirm(self
      ? `「${room.subject}」の担当から抜けますか?\n呼び出しの通知も届かなくなります。もう一度担当になるには、招待リンクを開きます。`
      : `${name} 先生をこのルームの担当から外しますか?`)) return
    setBusy(true)
    try {
      await api.removeRoomTeacher(room.id, id)
      if (self) { nav('/', { replace: true }); return }
      await load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Sheet title={isOwner ? '先生を招待' : '担当の先生'} onClose={onClose}>
      <div className="stack">
        {isOwner && (
          <section className="invite">
            <p className="muted">
              このリンクを開いた先生が、このルームの担当になります。担当の先生にも呼び出しの通知が届き、
              対応済にする・メモを書く・授業の開始と終了・メモの閲覧ができます。ルームの変更・削除・招待は、作った先生だけができます。
            </p>
            {inviteUrl && (
              <div className="invite-link">
                <QRCodeSVG value={inviteUrl} size={148} marginSize={1} className="invite-qr" />
                <p className="invite-url">{inviteUrl}</p>
                <div className="row">
                  <button type="button" className="btn" onClick={() => void copy()}>{copied ? 'コピーしました' : 'リンクをコピー'}</button>
                  <button type="button" className="btn" disabled={busy} onClick={() => void reset()}>作り直す</button>
                </div>
                <p className="hint">学生の参加用の QR コードとは別のリンクです。先生だけに共有してください。</p>
              </div>
            )}
          </section>
        )}

        <section className="stack-tight">
          <h3 className="section-title">担当の先生</h3>
          {data && (
            <ul className="teacher-list">
              <li>
                <span className="teacher-main"><b>{data.owner.name}</b><small>{data.owner.email}</small></span>
                <span className="chip">作成</span>
              </li>
              {data.teachers.map((t) => (
                <li key={t.id}>
                  <span className="teacher-main"><b>{t.name}</b><small>{t.email}</small></span>
                  {isOwner && (
                    <button type="button" className="btn small danger-outline" disabled={busy} onClick={() => void remove(t.id, t.name)}>外す</button>
                  )}
                  {!isOwner && t.id === user?.id && <span className="chip">自分</span>}
                </li>
              ))}
              {data.teachers.length === 0 && <li className="muted">招待した先生はまだいません</li>}
            </ul>
          )}
        </section>

        {!isOwner && user && (
          <button type="button" className="btn wide danger-outline" disabled={busy} onClick={() => void remove(user.id, user.name)}>
            このルームの担当から抜ける
          </button>
        )}
        <ErrorText error={error} />
      </div>
    </Sheet>
  )
}
