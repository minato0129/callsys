import { useState, type FormEvent } from 'react'
import { DAYS, type RoomInput } from './api'
import { useApp } from './app-context'
import { ErrorText } from './components'
import { IconClose, IconPlus } from './icons'

// クラス名は「IE2A、IE2B」のように「、」区切りで保存する(合同授業など、複数のクラスが一緒に受ける授業)
const splitClasses = (s: string) => s.split(/[、,，/／\n]/).map((c) => c.trim()).filter(Boolean)

// ルームの作成・変更で使う入力フォーム。開始〜終了の時限で、連続した複数コマを指定できる
export function RoomForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: RoomInput
  submitLabel: string
  onSubmit: (v: RoomInput) => Promise<void>
  onCancel?: () => void
}) {
  const { config } = useApp()
  const [form, setForm] = useState<RoomInput>(initial)
  const [classes, setClasses] = useState<string[]>(() => { const c = splitClasses(initial.className); return c.length ? c : [''] })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const periods = config?.periods ?? []

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try { await onSubmit({ ...form, className: classes.map((c) => c.trim()).filter(Boolean).join('、') }) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label>科目名
        <input required enterKeyHint="next" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="IoT制作" />
      </label>
      <fieldset className="class-fields">
        <legend>クラス名</legend>
        {classes.map((c, i) => (
          <div className="class-field" key={i}>
            <input
              required={i === 0} value={c} placeholder={i === 0 ? 'IE2A' : 'IE2B'}
              aria-label={`クラス名 ${i + 1}`} autoFocus={i > 0 && c === ''}
              onChange={(e) => setClasses(classes.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {classes.length > 1 && (
              <button type="button" className="icon-btn" aria-label={`クラス名 ${i + 1} を削除`}
                onClick={() => setClasses(classes.filter((_, j) => j !== i))}><IconClose /></button>
            )}
          </div>
        ))}
        <button type="button" className="btn small add-class" onClick={() => setClasses([...classes, ''])}>
          <IconPlus />クラスを追加
        </button>
        <p className="hint">合同授業など、複数のクラスが一緒に受ける授業はクラスを追加します。</p>
      </fieldset>
      <label>曜日
        <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{DAYS[d]}曜</option>)}
        </select>
      </label>
      <div className="row">
        <label>開始
          <select
            value={form.period}
            // 開始を後ろにずらしたら、終了も最低その時限まで動かす
            onChange={(e) => { const v = Number(e.target.value); setForm({ ...form, period: v, periodEnd: Math.max(v, form.periodEnd) }) }}
          >
            {periods.map((p) => <option key={p.no} value={p.no}>{p.no}限 ({p.start}〜)</option>)}
          </select>
        </label>
        <label>終了
          <select value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: Number(e.target.value) })}>
            {periods.filter((p) => p.no >= form.period).map((p) => <option key={p.no} value={p.no}>{p.no}限 (〜{p.end})</option>)}
          </select>
        </label>
      </div>
      <p className="hint">2コマ続きの授業は「開始 1限・終了 2限」のように指定します。間の休み時間も呼び出しの列は続きます。</p>
      <div className="row">
        {onCancel && <button type="button" className="btn large" onClick={onCancel}>キャンセル</button>}
        <button className="btn primary large" disabled={busy}>{submitLabel}</button>
      </div>
      <ErrorText error={error} />
    </form>
  )
}
