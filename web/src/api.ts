export type Role = 'STUDENT' | 'TEACHER'
export type CallType = 'QUESTION' | 'CHECK'

export interface User { id: string; email: string; name: string; role: Role }
export interface Period { no: number; start: string; end: string }
export interface AppConfig {
  authMode: 'dev' | 'microsoft'
  devLogin: boolean              // 開発用ログインを出すか
  devLoginNeedsPassword: boolean // 開発用ログインにパスワードが要るか
  vapidPublicKey: string
  periods: Period[]
}

export interface Room {
  id: string
  ownerId: string
  ownerName: string
  subject: string
  className: string
  dayOfWeek: number
  period: number    // 開始時限
  periodEnd: number // 終了時限(1コマなら period と同じ)
  // 授業の時間帯(月曜1限から順)。曜日をまたぐ授業は複数。dayOfWeek / period / periodEnd は先頭の時間帯と同じ
  slots: Slot[]
  createdAt: string
  isOpen: boolean
  openUntil: string | null
  closedUntil: string | null
}

export interface Counts { total: number; question: number; check: number }
export interface Call {
  id: number
  studentId: string
  studentName: string
  type: CallType
  createdAt: string
  memo?: string       // この授業で書いたメモ(先生の画面のみ)。対応済で上書きされる
  callsToday?: number // この授業での呼び出し回数(今回を含む)
}
export interface TeacherQueue { counts: Counts; head: Call[]; isOpen: boolean; serverTime: string }
export interface StudentQueue { counts: Counts; position: number; myType: CallType | ''; isOpen: boolean }

export interface Memo {
  id: number
  studentId: string
  studentName: string
  studentEmail: string
  callType: CallType | null
  body: string
  lessonDate: string // 授業日(YYYY-MM-DD)。メモは授業ごとに1枚
  createdAt: string
  updatedAt: string
}

export class ApiError extends Error {
  // data: エラーのときにサーバーが返した JSON(参加の 409 では、参加中の同じ時間帯の授業など)
  constructor(public status: number, message: string, public data?: unknown) { super(message) }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let msg = `エラーが発生しました (${res.status})`
    let data: unknown
    try { data = await res.json(); msg = (data as { error?: string }).error ?? msg } catch { /* noop */ }
    throw new ApiError(res.status, msg, data)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const api = {
  config: () => request<AppConfig>('GET', '/api/config'),
  me: () => request<User>('GET', '/api/me'),
  devLogin: (email: string, name: string, password: string) =>
    request<User>('POST', '/auth/dev-login', { email, name, password }),
  logout: () => request<void>('POST', '/auth/logout'),

  // 先生
  rooms: () => request<Room[]>('GET', '/api/rooms'),
  createRoom: (r: RoomInput) => request<Room>('POST', '/api/rooms', r),
  updateRoom: (id: string, r: RoomInput) => request<Room>('PATCH', `/api/rooms/${id}`, r),
  deleteRoom: (id: string) => request<void>('DELETE', `/api/rooms/${id}`),
  finishCall: (roomId: string, callId: number, memo: string) =>
    request<void>('POST', `/api/rooms/${roomId}/calls/${callId}/done`, { memo }),
  ack: (roomId: string) => request<void>('POST', `/api/rooms/${roomId}/ack`),
  // replace: ほかのルームが授業中なら、そちらを終了してから開始する
  openRoom: (roomId: string, replace = false) => request<Room>('POST', `/api/rooms/${roomId}/open`, { replace }),
  closeRoom: (roomId: string) => request<Room>('POST', `/api/rooms/${roomId}/close`),
  memos: (roomId: string, date: string) =>
    request<Memo[]>('GET', `/api/rooms/${roomId}/memos?date=${encodeURIComponent(date)}`),
  memoDates: (roomId: string) => request<string[]>('GET', `/api/rooms/${roomId}/memo-dates`),

  // 共通
  room: (id: string) => request<Room>('GET', `/api/rooms/${id}`),
  teacherQueue: (id: string) => request<TeacherQueue>('GET', `/api/rooms/${id}/queue`),
  studentQueue: (id: string) => request<StudentQueue>('GET', `/api/rooms/${id}/queue`),

  // 学生
  // replace: 同じ時間帯の授業に参加しているとき、そちらを抜けてから参加する
  join: (roomId: string, replace = false) => request<Room>('POST', '/api/join', { roomId, replace }),
  leaveRoom: (roomId: string) => request<void>('DELETE', `/api/rooms/${roomId}/enrollment`),
  myRooms: () => request<{ rooms: Room[]; current: Room | null }>('GET', '/api/my/rooms'),
  call: (roomId: string, type: CallType) => request<void>('POST', `/api/rooms/${roomId}/calls`, { type }),
  cancelCall: (roomId: string) => request<void>('DELETE', `/api/rooms/${roomId}/calls/mine`),

  pushSubscribe: (sub: PushSubscriptionJSON) => request<void>('POST', '/api/push/subscribe', sub),
  pushUnsubscribe: (endpoint: string) => request<void>('DELETE', '/api/push/subscribe', { endpoint }),
}

export const DAYS = ['日', '月', '火', '水', '木', '金', '土']
export const CALL_LABEL: Record<CallType, string> = { QUESTION: '質問', CHECK: '課題チェック' }

// 「授業を開始」したとき、ほかのルームが授業中(409)。先生が同時に開けるルームは1つだけ
export interface OpenConflict { error: string; conflict: Room; waiting: number }

// 参加しようとした授業と同じ時間帯の授業に、すでに参加しているとき(409)
export interface JoinConflict { error: string; conflict: Room; room: Room }

export interface Slot { dayOfWeek: number; period: number; periodEnd: number }
export interface RoomInput { subject: string; className: string; slots: Slot[] }

// 1つの時間帯(例: 「火曜 3〜4限」)
function oneSlotLabel(s: { dayOfWeek: number; period: number; periodEnd?: number }) {
  const end = s.periodEnd && s.periodEnd > s.period ? s.periodEnd : s.period
  return end === s.period ? `${DAYS[s.dayOfWeek]}曜 ${s.period}限` : `${DAYS[s.dayOfWeek]}曜 ${s.period}〜${end}限`
}

// ルームの時間帯を1つずつ(一覧で1行に1つ出すとき)
export function slotLabels(r: Pick<Room, 'dayOfWeek' | 'period'> & { periodEnd?: number; slots?: Slot[] }) {
  return r.slots?.length ? r.slots.map(oneSlotLabel) : [oneSlotLabel(r)]
}

// ルームの時間帯をすべて並べる(例: 「月曜 1〜2限、木曜 3限」)
export function slotLabel(r: Pick<Room, 'dayOfWeek' | 'period'> & { periodEnd?: number; slots?: Slot[] }) {
  return r.slots?.length ? r.slots.map(oneSlotLabel).join('、') : oneSlotLabel(r)
}
