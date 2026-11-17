import { useState, type FormEvent } from 'react'
import { DAYS, type RoomInput, type Slot } from './api'
import { useApp } from './app-context'
import { ErrorText } from './components'
import { IconClose, IconPlus } from './icons'

// クラス名は「IE2A、IE2B」のように「、」区切りで保存する(合同授業など、複数のクラスが一緒に受ける授業)
const splitClasses = (s: string) => s.split(/[、,，/／\n]/).map((c) => c.trim()).filter(Boolean)

// ルームの作成・変更で使う入力フォーム。
// 時間帯は「曜日 + 開始〜終了の時限」で、連続した複数コマを指定できる。曜日をまたぐ授業は時間帯を追加する
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
  const setSlot = (i: number, s: Slot) => setForm({ ...form, slots: form.slots.map((x, j) => (j === i ? s : x)) })
  // 追加する時間帯は、最後の時間帯の次の曜日・同じ時限にしておく(月〜土)
  const addSlot = () => {
    const last = form.slots[form.slots.length - 1]
    setForm({ ...form, slots: [...form.slots, { ...last, dayOfWeek: last.dayOfWeek >= 6 ? 1 : last.dayOfWeek + 1 }] })
  }

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
      <fieldset className="slot-fields">
        <legend>曜日・時限</legend>
        {form.slots.map((slot, i) => (
          <div className="slot-field" key={i}>
            <div className="slot-field-head">
              <label>曜日
                <select value={slot.dayOfWeek} onChange={(e) => setSlot(i, { ...slot, dayOfWeek: Number(e.target.value) })}
                  aria-label={`時間帯 ${i + 1} の曜日`}>
                  {[1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{DAYS[d]}曜</option>)}
                </select>
              </label>
              {form.slots.length > 1 && (
                <button type="button" className="icon-btn" aria-label={`時間帯 ${i + 1} を削除`}
                  onClick={() => setForm({ ...form, slots: form.slots.filter((_, j) => j !== i) })}><IconClose /></button>
              )}
            </div>
            <div className="row">
              <label>開始
                <select
                  value={slot.period} aria-label={`時間帯 ${i + 1} の開始`}
                  // 開始を後ろにずらしたら、終了も最低その時限まで動かす
                  onChange={(e) => { const v = Number(e.target.value); setSlot(i, { ...slot, period: v, periodEnd: Math.max(v, slot.periodEnd) }) }}
                >
                  {periods.map((p) => <option key={p.no} value={p.no}>{p.no}限 ({p.start}〜)</option>)}
                </select>
              </label>
              <label>終了
                <select value={slot.periodEnd} aria-label={`時間帯 ${i + 1} の終了`} onChange={(e) => setSlot(i, { ...slot, periodEnd: Number(e.target.value) })}>
                  {periods.filter((p) => p.no >= slot.period).map((p) => <option key={p.no} value={p.no}>{p.no}限 (〜{p.end})</option>)}
                </select>
              </label>
            </div>
          </div>
        ))}
        <button type="button" className="btn small add-class" onClick={addSlot}>
          <IconPlus />時間帯を追加
        </button>
      </fieldset>
      <p className="hint">2コマ続きの授業は「開始 1限・終了 2限」のように指定します。間の休み時間も呼び出しの列は続きます。曜日をまたぐ授業(月曜と木曜など)は「時間帯を追加」で追加します。</p>
      <div className="row">
        {onCancel && <button type="button" className="btn large" onClick={onCancel}>キャンセル</button>}
        <button className="btn primary large" disabled={busy}>{submitLabel}</button>
      </div>
      <ErrorText error={error} />
    </form>
  )
}
