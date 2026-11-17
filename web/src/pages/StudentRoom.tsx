import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, CALL_LABEL, slotLabel, type CallType, type Room, type StudentQueue } from '../api'
import { useRoomEvents } from '../app-context'
import { ErrorText, Header, IconButton, MenuSheet, PushBanner, Sheet, TypeBadge } from '../components'
import { IconCheck, IconLeave, IconMore, IconQuestion, IconUser } from '../icons'
import { chime, onForegroundPush } from '../push'

export default function StudentRoom() {
  const { id = '' } = useParams()
  const [room, setRoom] = useState<Room | null>(null)
  const [queue, setQueue] = useState<StudentQueue | null>(null)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [sheet, setSheet] = useState<'menu' | 'leave' | 'cancel' | null>(null)
  const nav = useNavigate()

  const load = useCallback(async () => {
    try {
      setQueue(await api.studentQueue(id))
      setLoadError('')
    } catch (e) { setLoadError((e as Error).message) }
  }, [id])

  useEffect(() => { api.room(id).then(setRoom).catch((e) => setError(e.message)) }, [id])
  useRoomEvents(id, load)
  useEffect(() => onForegroundPush((d) => { chime(); setNotice(d.body) }), [])
  useEffect(() => { if (queue?.position !== 1) setNotice('') }, [queue?.position])

  const call = async (type: CallType) => {
    setError('')
    setBusy(true)
    try { await api.call(id, type); await load() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const cancel = async () => {
    setError('')
    setBusy(true)
    try { await api.cancelCall(id); await load() } catch (e) { setError((e as Error).message) } finally { setBusy(false); setSheet(null) }
  }

  // 間違えて別のクラスに入ったとき用。呼び出し中なら取り消される
  const leave = async () => {
    setError('')
    setBusy(true)
    try {
      await api.leaveRoom(id)
      nav('/', { replace: true })
    } catch (e) { setError((e as Error).message); setSheet(null) } finally { setBusy(false) }
  }

  const open = queue?.isOpen ?? false
  const waiting = !!queue?.myType
  const first = waiting && queue!.position === 1

  return (
    <>
      {/* 授業中は戻るボタンを出さない(ホームに戻っても、授業中はこの画面に戻ってくるため)。
          代わりに右上からプロフィール(アカウント)を開けるようにする */}
      <Header
        title={room?.subject ?? '授業'}
        sub={room ? `${room.className}・${slotLabel(room)}・${room.ownerName}` : undefined}
        back={queue && !queue.isOpen ? '/' : undefined}
        actions={<>
          <Link to="/account" className="icon-btn" aria-label="プロフィール" title="プロフィール"><IconUser /></Link>
          <IconButton label="その他の操作" onClick={() => setSheet('menu')}><IconMore /></IconButton>
        </>}
      />
      <main className="page stack with-actionbar tall">
        <PushBanner text="自分の番が近づいたら通知を受け取る" />

        {/* 整理券。呼び出し中は自分の順番を大きく出す */}
        <section className={`ticket ${waiting ? 'waiting' : ''} ${first ? 'first' : ''} ${waiting ? (queue!.myType === 'CHECK' ? 'check' : 'question') : ''}`} aria-live="polite">
          {loadError ? (
            <>
              <p className="ticket-head">状況を取得できませんでした</p>
              <p className="error">{loadError}</p>
              <button type="button" className="btn small" onClick={() => void load()}>再読み込み</button>
            </>
          ) : !queue ? (
            <p className="muted">読み込み中…</p>
          ) : waiting ? (
            <>
              <p className="ticket-head"><TypeBadge type={queue.myType as CallType} />で呼び出し中</p>
              <p className="ticket-no"><b>{queue.position}</b><span>番目</span></p>
              <p className="ticket-foot">
                {first ? (notice || '次はあなたの番です。先生が来るまで待ってください') : `前に ${queue.position - 1} 人います`}
              </p>
            </>
          ) : open ? (
            <>
              <p className="ticket-head">待っている人</p>
              <p className="ticket-no idle"><b>{queue.counts.total}</b><span>人</span></p>
              <p className="ticket-foot">下のボタンで先生を呼び出せます</p>
            </>
          ) : (
            <>
              <p className="ticket-head">授業時間外です</p>
              <p className="ticket-foot">先生が授業を開始すると、呼び出せるようになります</p>
            </>
          )}
        </section>
        <ErrorText error={error} />
      </main>

      {/* 親指が届く画面の下に、呼び出しのボタンを置く */}
      <div className="actionbar">
        {waiting ? (
          <button type="button" className="btn wide large danger-outline" disabled={busy} onClick={() => setSheet('cancel')}>
            呼び出しを取り消す
          </button>
        ) : (
          <div className="call-buttons">
            {(['QUESTION', 'CHECK'] as CallType[]).map((t) => (
              <button key={t} type="button" className={`call-btn ${t === 'CHECK' ? 'check' : 'question'}`}
                disabled={!open || busy} onClick={() => void call(t)}>
                {t === 'CHECK' ? <IconCheck /> : <IconQuestion />}
                {CALL_LABEL[t]}
              </button>
            ))}
          </div>
        )}
      </div>

      {sheet === 'menu' && (
        <MenuSheet onClose={() => setSheet(null)} items={[
          { label: 'この授業から抜ける', icon: <IconLeave />, danger: true, onSelect: () => setSheet('leave') },
        ]} />
      )}
      {/* 取り消す前に確認する。先生に対応してもらったあとは、先生が「対応済」にするので取り消さない */}
      {sheet === 'cancel' && (
        <Sheet title="呼び出しを取り消しますか?" onClose={() => setSheet(null)}>
          <div className="stack">
            <div className="callout">
              <p className="callout-title">先生に対応してもらった場合は、取り消さないでください</p>
              <p>対応が終わったら、先生が「対応済」にします。</p>
            </div>
            <p className="muted">質問が解決した・呼び出す必要がなくなったときだけ取り消してください。取り消すと列から外れ、もう一度呼び出すと最後に並びます。</p>
            <div className="row">
              <button type="button" className="btn large" onClick={() => setSheet(null)}>取り消さない</button>
              <button type="button" className="btn large danger" disabled={busy} onClick={() => void cancel()}>取り消す</button>
            </div>
          </div>
        </Sheet>
      )}
      {sheet === 'leave' && (
        <Sheet title="この授業から抜けますか?" onClose={() => setSheet(null)}>
          <div className="stack">
            <p>「{room?.subject ?? 'この授業'}」{room && `(${room.className}・${slotLabel(room)})`}から抜けます。間違えて別のクラスに参加したときに使ってください。</p>
            <ul className="bullets">
              {waiting && <li>今の呼び出しは取り消されます</li>}
              <li>もう一度参加するには、先生の QR コードを読み取ります</li>
            </ul>
            <div className="row">
              <button type="button" className="btn" onClick={() => setSheet(null)}>キャンセル</button>
              <button type="button" className="btn danger" disabled={busy} onClick={() => void leave()}>抜ける</button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  )
}
