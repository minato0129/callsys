package main

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
)

// ---------- routes ----------

func (app *App) routes(e *echo.Echo) {
	login := app.requireLogin
	teacher := requireRole("TEACHER", "先生のみ利用できます")
	student := requireRole("STUDENT", "学生のみ利用できます")

	e.GET("/auth/login", app.handleLogin)
	e.GET("/auth/callback", app.handleCallback)
	e.POST("/auth/dev-login", app.handleDevLogin)
	e.POST("/auth/logout", app.handleLogout)

	api := e.Group("/api")
	api.GET("/config", app.handleConfig)
	api.GET("/me", func(c echo.Context) error { return c.JSON(http.StatusOK, currentUser(c)) }, login)

	// 先生
	api.GET("/rooms", app.handleListRooms, login, teacher)
	api.POST("/rooms", app.handleCreateRoom, login, teacher)
	api.PATCH("/rooms/:id", app.handleUpdateRoom, login, teacher)
	api.DELETE("/rooms/:id", app.handleDeleteRoom, login, teacher)
	api.POST("/rooms/:id/calls/:callId/done", app.handleFinishCall, login, teacher)
	// 担当の先生(招待)
	api.GET("/rooms/:id/teachers", app.handleListRoomTeachers, login, teacher)
	api.DELETE("/rooms/:id/teachers/:userId", app.handleRemoveRoomTeacher, login, teacher)
	api.GET("/rooms/:id/invite", app.handleGetInvite, login, teacher)
	api.POST("/rooms/:id/invite/reset", app.handleResetInvite, login, teacher)
	api.GET("/invites/:token", app.handleShowInvite, login)
	api.POST("/invites/:token", app.handleAcceptInvite, login, teacher)
	api.POST("/rooms/:id/ack", app.handleAck, login, teacher)
	api.POST("/rooms/:id/open", app.handleOpenRoom, login, teacher)
	api.POST("/rooms/:id/close", app.handleCloseRoom, login, teacher)
	api.GET("/rooms/:id/memos", app.handleListMemos, login, teacher)
	api.GET("/rooms/:id/memo-dates", app.handleMemoDates, login, teacher)
	api.GET("/rooms/:id/memos.csv", app.handleMemosCSV, login, teacher)

	// 先生・学生共通
	api.GET("/rooms/:id", app.handleGetRoom, login)
	api.GET("/rooms/:id/queue", app.handleQueue, login)
	api.GET("/rooms/:id/events", app.handleEvents, login)

	// 学生
	api.POST("/join", app.handleJoin, login, student)
	api.DELETE("/rooms/:id/enrollment", app.handleLeave, login, student)
	api.GET("/my/rooms", app.handleMyRooms, login, student)
	api.POST("/rooms/:id/calls", app.handleCreateCall, login, student)
	api.DELETE("/rooms/:id/calls/mine", app.handleCancelCall, login, student)

	// Push
	api.POST("/push/subscribe", app.handlePushSubscribe, login)
	api.DELETE("/push/subscribe", app.handlePushUnsubscribe, login)
	api.POST("/push/test", app.handlePushTest, login)
}

// エラーはすべて {"error": "..."} で返す(フロントがこの形を前提にしている)
func errorHandler(err error, c echo.Context) {
	if c.Response().Committed {
		return
	}
	code, msg := http.StatusInternalServerError, "サーバーエラーが発生しました"
	var he *echo.HTTPError
	if errors.As(err, &he) {
		code = he.Code
		if s, ok := he.Message.(string); ok {
			msg = s
		} else {
			msg = http.StatusText(code)
		}
	} else {
		c.Logger().Error(err)
	}
	_ = c.JSON(code, map[string]string{"error": msg})
}

// ---------- helpers ----------

func (app *App) withOpen(r *Room) *Room {
	r.PeriodEnd = r.LastPeriod() // 古いルーム(0)も、レスポンスでは終了時限を入れて返す
	r.Slots = r.TimeSlots()      // 時間帯の表を読み込んでいないときも、1つの時間帯として返す
	r.IsOpen = app.cfg.roomOpen(r, time.Now())
	return r
}

func (app *App) loadRoom(c echo.Context) (*Room, error) {
	room, err := app.store.GetRoom(c.Request().Context(), c.Param("id"))
	if errors.Is(err, ErrNotFound) {
		return nil, echo.NewHTTPError(http.StatusNotFound, "ルームが見つかりません")
	}
	if err != nil {
		return nil, err
	}
	return app.withOpen(room), nil
}

// ルームのオーナー(先生)のみ
func (app *App) ownerRoom(c echo.Context) (*Room, error) {
	room, err := app.loadRoom(c)
	if err != nil {
		return nil, err
	}
	if room.OwnerID != currentUser(c).ID {
		return nil, echo.NewHTTPError(http.StatusForbidden, "このルームを作った先生だけができます")
	}
	room.IsOwner = true
	return room, nil
}

// オーナーか受講登録済みの学生
// ルームを作った先生か、招待されて担当している先生(呼び出しへの対応・授業の開始と終了・メモ)
func (app *App) staffRoom(c echo.Context) (*Room, error) {
	room, err := app.loadRoom(c)
	if err != nil {
		return nil, err
	}
	ok, err := app.isStaff(c.Request().Context(), room, currentUser(c))
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, echo.NewHTTPError(http.StatusForbidden, "このルームの先生ではありません")
	}
	return room, nil
}

func (app *App) isStaff(ctx context.Context, room *Room, u *User) (bool, error) {
	room.IsOwner = room.OwnerID == u.ID
	if room.IsOwner {
		return true, nil
	}
	if u.Role != "TEACHER" {
		return false, nil
	}
	return app.store.IsRoomTeacher(ctx, room.ID, u.ID)
}

func (app *App) memberRoom(c echo.Context) (*Room, error) {
	room, err := app.loadRoom(c)
	if err != nil {
		return nil, err
	}
	u := currentUser(c)
	if staff, err := app.isStaff(c.Request().Context(), room, u); err != nil {
		return nil, err
	} else if staff {
		return room, nil
	}
	ok, err := app.store.IsEnrolled(c.Request().Context(), room.ID, u.ID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, echo.NewHTTPError(http.StatusForbidden, "このルームに参加していません。QRコードを読み取ってください")
	}
	return room, nil
}

func (app *App) handleConfig(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]any{
		"authMode":              app.cfg.AuthMode,
		"devLogin":              app.cfg.devLoginEnabled(), // 開発用ログインを出すか
		"devLoginNeedsPassword": app.cfg.DevLoginPassword != "",
		"vapidPublicKey":        app.cfg.VapidPublic,
		"periods":               app.cfg.Periods,
	})
}

// ---------- teacher ----------

func (app *App) handleListRooms(c echo.Context) error {
	u := currentUser(c)
	rooms, err := app.store.ListTeacherRooms(c.Request().Context(), u.ID)
	if err != nil {
		return err
	}
	for _, r := range rooms {
		app.withOpen(r)
		r.IsOwner = r.OwnerID == u.ID
	}
	sortRooms(rooms)
	return c.JSON(http.StatusOK, rooms)
}

// 授業中のルームを一番上に、それ以外は月曜1限から順に並べる(日曜は最後)
func sortRooms(rooms []*Room) {
	weekday := weekdayOrder // 日曜は土曜のあと
	sort.SliceStable(rooms, func(i, j int) bool {
		a, b := rooms[i], rooms[j]
		if a.IsOpen != b.IsOpen {
			return a.IsOpen
		}
		if weekday(a.DayOfWeek) != weekday(b.DayOfWeek) {
			return weekday(a.DayOfWeek) < weekday(b.DayOfWeek)
		}
		if a.Period != b.Period {
			return a.Period < b.Period
		}
		return a.Subject < b.Subject
	})
}

type slotInput struct {
	DayOfWeek int `json:"dayOfWeek"`
	Period    int `json:"period"`    // 開始時限
	PeriodEnd int `json:"periodEnd"` // 終了時限。省略(0)なら開始時限と同じ
}

type roomInput struct {
	Subject   string `json:"subject"`
	ClassName string `json:"className"`
	// 授業の時間帯。曜日をまたぐ授業は複数。省略したときは下の dayOfWeek / period / periodEnd を1つの時間帯として使う(以前の形)
	Slots []slotInput `json:"slots"`
	slotInput
}

// 1つのルームに登録できる時間帯の数
const maxSlots = 10

// 入力を検証して Room の項目に反映する
func (app *App) applyRoomInput(c echo.Context, r *Room) error {
	var in roomInput
	if err := c.Bind(&in); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "入力が不正です")
	}
	in.Subject, in.ClassName = strings.TrimSpace(in.Subject), normalizeClassNames(in.ClassName)
	if len(in.Slots) == 0 {
		in.Slots = []slotInput{in.slotInput}
	}
	if in.Subject == "" || in.ClassName == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "科目名・クラス名・曜日・時限を正しく入力してください")
	}
	if len(in.Slots) > maxSlots {
		return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("時間帯は %d 個までです", maxSlots))
	}
	slots := make([]RoomSlot, 0, len(in.Slots))
	for _, s := range in.Slots {
		if s.PeriodEnd == 0 {
			s.PeriodEnd = s.Period
		}
		_, okStart := app.cfg.period(s.Period)
		_, okEnd := app.cfg.period(s.PeriodEnd)
		if s.DayOfWeek < 0 || s.DayOfWeek > 6 || !okStart || !okEnd {
			return echo.NewHTTPError(http.StatusBadRequest, "科目名・クラス名・曜日・時限を正しく入力してください")
		}
		if s.PeriodEnd < s.Period {
			return echo.NewHTTPError(http.StatusBadRequest, "終了の時限は開始の時限以降にしてください")
		}
		slot := RoomSlot{DayOfWeek: s.DayOfWeek, Period: s.Period, PeriodEnd: s.PeriodEnd}
		for _, o := range slots {
			if slot.Overlaps(o) {
				return echo.NewHTTPError(http.StatusBadRequest,
					fmt.Sprintf("時間帯が重なっています(%s と %s)", slotLabel(o.DayOfWeek, o.Period, o.LastPeriod()), slotLabel(slot.DayOfWeek, slot.Period, slot.LastPeriod())))
			}
		}
		slots = append(slots, slot)
	}
	if len(in.ClassName) > 255 || len(in.Subject) > 255 {
		return echo.NewHTTPError(http.StatusBadRequest, "科目名・クラス名が長すぎます")
	}
	r.Subject, r.ClassName = in.Subject, in.ClassName
	r.SetSlots(slots)
	return nil
}

// 合同授業などで複数のクラスがあるときは「IE2A、IE2B」のように「、」区切りで保存する。
// 「,」「，」「/」「／」区切りや前後の空白、重複もそろえる
func normalizeClassNames(s string) string {
	parts := strings.FieldsFunc(s, func(r rune) bool { return strings.ContainsRune("、,，/／\n", r) })
	seen := map[string]bool{}
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" && !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	return strings.Join(out, "、")
}

func slotTakenError(err error) error {
	var st *SlotTakenError
	if errors.As(err, &st) {
		o := st.Room
		return echo.NewHTTPError(http.StatusConflict,
			fmt.Sprintf("時間が重なるルームがあります(%s: %s)", roomSlotsLabel(o), o.Subject))
	}
	return echo.NewHTTPError(http.StatusConflict, "時間が重なるルームがあります")
}

// ルームの時間帯をすべて並べる(例: 「月曜 1〜2限、木曜 3限」)
func roomSlotsLabel(r *Room) string {
	var labels []string
	for _, s := range r.TimeSlots() {
		labels = append(labels, slotLabel(s.DayOfWeek, s.Period, s.LastPeriod()))
	}
	return strings.Join(labels, "、")
}

func slotLabel(dow, first, last int) string {
	days := []string{"日", "月", "火", "水", "木", "金", "土"}
	if first == last {
		return fmt.Sprintf("%s曜 %d限", days[dow], first)
	}
	return fmt.Sprintf("%s曜 %d〜%d限", days[dow], first, last)
}

func (app *App) handleCreateRoom(c echo.Context) error {
	u := currentUser(c)
	room := &Room{OwnerID: u.ID, OwnerName: u.Name}
	if err := app.applyRoomInput(c, room); err != nil {
		return err
	}
	if err := app.store.CreateRoom(c.Request().Context(), room); errors.Is(err, ErrSlotTaken) {
		return slotTakenError(err)
	} else if err != nil {
		return err
	}
	room.IsOwner = true
	return c.JSON(http.StatusCreated, app.withOpen(room))
}

// PATCH /api/rooms/:id 科目名・クラス名・曜日・時限の変更。メモ・受講登録・QR はそのまま
func (app *App) handleUpdateRoom(c echo.Context) error {
	room, err := app.ownerRoom(c)
	if err != nil {
		return err
	}
	if err := app.applyRoomInput(c, room); err != nil {
		return err
	}
	if err := app.store.UpdateRoom(c.Request().Context(), room); errors.Is(err, ErrSlotTaken) {
		return slotTakenError(err)
	} else if err != nil {
		return err
	}
	app.hub.publish(room.ID) // 開いている画面に開閉の変化を伝える
	return c.JSON(http.StatusOK, app.withOpen(room))
}

func (app *App) handleDeleteRoom(c echo.Context) error {
	room, err := app.ownerRoom(c)
	if err != nil {
		return err
	}
	if err := app.store.DeleteRoom(c.Request().Context(), room.ID); err != nil {
		return err
	}
	app.notifier.Ack(room.ID)
	app.hub.publish(room.ID)
	return c.NoContent(http.StatusNoContent)
}

func (app *App) handleFinishCall(c echo.Context) error {
	room, err := app.staffRoom(c)
	if err != nil {
		return err
	}
	callID, err := strconv.ParseInt(c.Param("callId"), 10, 64)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "不正な呼び出しIDです")
	}
	var in struct {
		Memo string `json:"memo"`
	}
	_ = c.Bind(&in)
	if err := app.store.FinishCall(c.Request().Context(), room.ID, callID, strings.TrimSpace(in.Memo), app.cfg.lessonDate(time.Now())); errors.Is(err, ErrNotFound) {
		return echo.NewHTTPError(http.StatusConflict, "この呼び出しはすでに終了しています")
	} else if err != nil {
		return err
	}
	app.notifier.QueueChanged(room.ID, reasonDone)
	return c.NoContent(http.StatusNoContent)
}

// 手動で開始したときに開いておく長さ(1コマ分 + 余裕)
const manualOpenDuration = 100 * time.Minute

// POST /api/rooms/:id/open 「授業を開始」。時間割に関係なく、今から 100 分間開く。
// 先生が同時に開けるルームは1つだけ。ほかのルームが授業中なら 409 で、そのルームと待っている人数を返す。
// replace: true なら、そのルームを終了してから開始する
func (app *App) handleOpenRoom(c echo.Context) error {
	room, err := app.staffRoom(c)
	if err != nil {
		return err
	}
	var in struct {
		Replace bool `json:"replace"`
	}
	_ = c.Bind(&in)
	ctx := c.Request().Context()
	// 自分が作ったルームと、招待されて担当しているルームのうち、ほかに授業中のものがないか
	rooms, err := app.store.ListTeacherRooms(ctx, currentUser(c).ID)
	if err != nil {
		return err
	}
	t := time.Now()
	for _, o := range rooms {
		if o.ID == room.ID || !app.cfg.roomOpen(o, t) {
			continue
		}
		if !in.Replace {
			waiting, err := app.store.WaitingCalls(ctx, o.ID)
			if err != nil {
				return err
			}
			return c.JSON(http.StatusConflict, map[string]any{
				"error":    "「" + o.Subject + "」が授業中です。同時に開始できる授業は1つだけです",
				"conflict": app.withOpen(o),
				"waiting":  len(waiting),
			})
		}
		if err := app.closeRoom(ctx, o); err != nil {
			return err
		}
	}
	// 100 分の間に、ほかのルームの授業が時間割どおり始まるなら、その時刻で閉じる(2つ同時に授業中にならないように)
	until := now().Add(manualOpenDuration)
	for _, o := range rooms {
		if o.ID == room.ID {
			continue
		}
		if start, ok := app.cfg.nextScheduledStart(o, t, until); ok {
			until = start
		}
	}
	if err := app.store.SetManualState(ctx, room.ID, &until, nil); err != nil {
		return err
	}
	room.OpenUntil, room.ClosedUntil = &until, nil
	app.hub.publish(room.ID) // 学生の画面を更新させる
	return c.JSON(http.StatusOK, app.withOpen(room))
}

// POST /api/rooms/:id/close 「授業を終了」。時間割上の授業中なら、その時限が終わるまで閉じたままにする
func (app *App) handleCloseRoom(c echo.Context) error {
	room, err := app.staffRoom(c)
	if err != nil {
		return err
	}
	if err := app.closeRoom(c.Request().Context(), room); err != nil {
		return err
	}
	return c.JSON(http.StatusOK, app.withOpen(room))
}

// 授業を終了する。残っている呼び出しは取り消し、学生・先生の画面に知らせる
func (app *App) closeRoom(ctx context.Context, room *Room) error {
	var closedUntil *time.Time
	if end, ok := app.cfg.roomScheduledEnd(room, time.Now()); ok {
		closedUntil = &end
	}
	if err := app.store.SetManualState(ctx, room.ID, nil, closedUntil); err != nil {
		return err
	}
	// 残っている呼び出しは取り消す
	if err := app.store.CancelAllWaiting(ctx, room.ID); err != nil {
		return err
	}
	room.OpenUntil, room.ClosedUntil = nil, closedUntil
	app.notifier.QueueChanged(room.ID, reasonClosed) // SSE の通知も含む
	return nil
}

func (app *App) handleAck(c echo.Context) error {
	room, err := app.staffRoom(c)
	if err != nil {
		return err
	}
	app.notifier.Ack(room.ID)
	return c.NoContent(http.StatusNoContent)
}

func (app *App) handleListMemos(c echo.Context) error {
	room, err := app.staffRoom(c)
	if err != nil {
		return err
	}
	memos, err := app.store.ListMemos(c.Request().Context(), room.ID, c.QueryParam("date"))
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, memos)
}

func (app *App) handleMemoDates(c echo.Context) error {
	room, err := app.staffRoom(c)
	if err != nil {
		return err
	}
	dates, err := app.store.MemoDates(c.Request().Context(), room.ID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, dates)
}

func (app *App) handleMemosCSV(c echo.Context) error {
	room, err := app.staffRoom(c)
	if err != nil {
		return err
	}
	memos, err := app.store.ListMemos(c.Request().Context(), room.ID, "")
	if err != nil {
		return err
	}
	w := c.Response()
	w.Header().Set(echo.HeaderContentType, "text/csv; charset=utf-8")
	w.Header().Set(echo.HeaderContentDisposition, `attachment; filename="memos-`+room.ID+`.csv"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("\xEF\xBB\xBF")) // Excel で文字化けしないよう BOM を付ける
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"授業日", "最終更新", "学籍メール", "氏名", "種別", "メモ"})
	for _, m := range memos {
		typ := ""
		if m.CallType != nil {
			typ = map[string]string{"QUESTION": "質問", "CHECK": "課題チェック"}[*m.CallType]
		}
		_ = cw.Write([]string{m.LessonDate, m.UpdatedAt.In(app.cfg.Loc).Format("2006-01-02 15:04"), m.StudentEmail, m.StudentName, typ, m.Body})
	}
	cw.Flush()
	return cw.Error()
}

// ---------- shared ----------

func (app *App) handleGetRoom(c echo.Context) error {
	room, err := app.memberRoom(c)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, room)
}

type queueCounts struct {
	Total    int `json:"total"`
	Question int `json:"question"`
	Check    int `json:"check"`
}

func (app *App) handleQueue(c echo.Context) error {
	room, err := app.memberRoom(c)
	if err != nil {
		return err
	}
	calls, err := app.store.WaitingCalls(c.Request().Context(), room.ID)
	if err != nil {
		return err
	}
	var cnt queueCounts
	cnt.Total = len(calls)
	for _, cl := range calls {
		if cl.Type == "QUESTION" {
			cnt.Question++
		} else {
			cnt.Check++
		}
	}
	u := currentUser(c)
	staff, err := app.isStaff(c.Request().Context(), room, u)
	if err != nil {
		return err
	}
	if staff {
		// 先生(作った先生・招待された先生)には先頭2人まで
		head := calls
		if len(head) > 2 {
			head = head[:2]
		}
		// この授業で書いたメモと呼び出し回数を付ける(2回目以降は前のメモを上書きする)
		t := time.Now()
		if err := app.store.FillLessonInfo(c.Request().Context(), room.ID, app.cfg.lessonDate(t), app.cfg.dayStart(t), head); err != nil {
			return err
		}
		return c.JSON(http.StatusOK, map[string]any{"counts": cnt, "head": head, "isOpen": room.IsOpen, "serverTime": time.Now().UTC()})
	}
	// 学生には自分の順番だけ(他の学生の名前は見せない)
	position, myType := 0, ""
	for i, cl := range calls {
		if cl.StudentID == u.ID {
			position, myType = i+1, cl.Type
			break
		}
	}
	return c.JSON(http.StatusOK, map[string]any{"counts": cnt, "position": position, "myType": myType, "isOpen": room.IsOpen})
}

// ---------- student ----------

// POST /api/join QR から授業に参加する。
// 同じ時間帯(同じ曜日で時限が重なる)の別の授業には参加できない。そのときは 409 で、参加中の授業を返す。
// replace: true なら、その授業を抜けてから参加する(間違えて別のクラスに入ったとき用)
func (app *App) handleJoin(c echo.Context) error {
	var in struct {
		RoomID  string `json:"roomId"`
		Replace bool   `json:"replace"`
	}
	if err := c.Bind(&in); err != nil || in.RoomID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "QRコードが不正です")
	}
	ctx := c.Request().Context()
	room, err := app.store.GetRoom(ctx, in.RoomID)
	if errors.Is(err, ErrNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, "ルームが見つかりません")
	} else if err != nil {
		return err
	}
	u := currentUser(c)
	enrolled, err := app.store.ListEnrolledRooms(ctx, u.ID)
	if err != nil {
		return err
	}
	var conflicts []*Room
	for _, r := range enrolled {
		if r.ID == room.ID {
			return c.JSON(http.StatusOK, app.withOpen(room)) // 参加済み
		}
		if r.Overlaps(room) {
			conflicts = append(conflicts, r)
		}
	}
	if len(conflicts) > 0 && !in.Replace {
		return c.JSON(http.StatusConflict, map[string]any{
			"error":    "同じ時間帯の授業「" + conflicts[0].Subject + "」に参加しています",
			"conflict": conflicts[0],
			"room":     room,
		})
	}
	for _, r := range conflicts {
		if err := app.leave(ctx, r.ID, u.ID); err != nil {
			return err
		}
	}
	if err := app.store.Enroll(ctx, room.ID, u.ID); err != nil {
		return err
	}
	return c.JSON(http.StatusOK, app.withOpen(room))
}

// DELETE /api/rooms/:id/enrollment 学生が授業から抜ける(間違えて別のクラスに入ったとき用)。
// 呼び出し中なら取り消す。メモは先生の記録なので残す。もう一度参加するには QR を読み取る
func (app *App) handleLeave(c echo.Context) error {
	room, err := app.memberRoom(c)
	if err != nil {
		return err
	}
	if err := app.leave(c.Request().Context(), room.ID, currentUser(c).ID); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

func (app *App) leave(ctx context.Context, roomID, userID string) error {
	cancelled, err := app.store.Unenroll(ctx, roomID, userID)
	if err != nil {
		return err
	}
	if cancelled {
		app.notifier.QueueChanged(roomID, reasonCancelled)
	}
	return nil
}

// 受講中のルーム一覧と、今開いているルーム
func (app *App) handleMyRooms(c echo.Context) error {
	rooms, err := app.store.ListEnrolledRooms(c.Request().Context(), currentUser(c).ID)
	if err != nil {
		return err
	}
	var current *Room
	for _, r := range rooms {
		app.withOpen(r)
		if r.IsOpen && current == nil {
			current = r
		}
	}
	sortRooms(rooms)
	return c.JSON(http.StatusOK, map[string]any{"rooms": rooms, "current": current})
}

func (app *App) handleCreateCall(c echo.Context) error {
	room, err := app.memberRoom(c)
	if err != nil {
		return err
	}
	if !room.IsOpen {
		return echo.NewHTTPError(http.StatusConflict, "授業時間外です")
	}
	var in struct {
		Type string `json:"type"`
	}
	if err := c.Bind(&in); err != nil || (in.Type != "QUESTION" && in.Type != "CHECK") {
		return echo.NewHTTPError(http.StatusBadRequest, "呼び出しの種類が不正です")
	}
	if err := app.store.CreateCall(c.Request().Context(), room.ID, currentUser(c).ID, in.Type); errors.Is(err, ErrAlreadyWaiting) {
		return echo.NewHTTPError(http.StatusConflict, "すでに呼び出し中です")
	} else if err != nil {
		return err
	}
	app.notifier.QueueChanged(room.ID, reasonCalled)
	return c.NoContent(http.StatusCreated)
}

func (app *App) handleCancelCall(c echo.Context) error {
	room, err := app.memberRoom(c)
	if err != nil {
		return err
	}
	changed, err := app.store.CancelMyCall(c.Request().Context(), room.ID, currentUser(c).ID)
	if err != nil {
		return err
	}
	if changed {
		app.notifier.QueueChanged(room.ID, reasonCancelled)
	}
	return c.NoContent(http.StatusNoContent)
}

// ---------- push ----------

func (app *App) handlePushSubscribe(c echo.Context) error {
	var in PushSubInput
	if err := c.Bind(&in); err != nil || in.Endpoint == "" || in.Keys.P256dh == "" || in.Keys.Auth == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "購読情報が不正です")
	}
	if err := app.store.SavePushSub(c.Request().Context(), currentUser(c).ID, &in); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

// DELETE /api/push/subscribe この端末の通知をオフにする(購読をサーバーから消す)。ほかの端末の通知はそのまま
func (app *App) handlePushUnsubscribe(c echo.Context) error {
	var in struct {
		Endpoint string `json:"endpoint"`
	}
	if err := c.Bind(&in); err != nil || in.Endpoint == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "購読情報が不正です")
	}
	if err := app.store.DeleteMyPushSub(c.Request().Context(), currentUser(c).ID, in.Endpoint); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

// POST /api/push/test 自分の端末にテスト通知を送り、結果を返す
func (app *App) handlePushTest(c echo.Context) error {
	if !app.push.enabled() {
		return echo.NewHTTPError(http.StatusConflict, "サーバーに VAPID 鍵が設定されていません(.env の VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)")
	}
	res, err := app.push.SendSync(c.Request().Context(), currentUser(c).ID, Notification{
		Title: "テスト通知",
		Body:  "通知は正しく届いています",
		URL:   "/",
		Kind:  "test",
	})
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, res)
}

// ---------- 担当の先生(招待) ----------

type teacherView struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

// GET /api/rooms/:id/teachers ルームを作った先生と、招待された先生
func (app *App) handleListRoomTeachers(c echo.Context) error {
	room, err := app.staffRoom(c)
	if err != nil {
		return err
	}
	users, err := app.store.ListRoomTeachers(c.Request().Context(), room.ID)
	if err != nil {
		return err
	}
	teachers := make([]teacherView, 0, len(users))
	for _, u := range users {
		teachers = append(teachers, teacherView{u.ID, u.Name, u.Email})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"owner":    teacherView{room.Owner.ID, room.Owner.Name, room.Owner.Email},
		"teachers": teachers,
		"isOwner":  room.IsOwner,
	})
}

// DELETE /api/rooms/:id/teachers/:userId 招待した先生を外す(作った先生)、または自分が担当から抜ける(招待された先生)
func (app *App) handleRemoveRoomTeacher(c echo.Context) error {
	room, err := app.staffRoom(c)
	if err != nil {
		return err
	}
	target := c.Param("userId")
	if !room.IsOwner && target != currentUser(c).ID {
		return echo.NewHTTPError(http.StatusForbidden, "ほかの先生を外せるのは、ルームを作った先生だけです")
	}
	if target == room.OwnerID {
		return echo.NewHTTPError(http.StatusBadRequest, "ルームを作った先生は外せません")
	}
	if err := app.store.RemoveRoomTeacher(c.Request().Context(), room.ID, target); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

// GET /api/rooms/:id/invite 先生を招待するリンクのトークン(なければ作る)。ルームを作った先生だけ
func (app *App) handleGetInvite(c echo.Context) error {
	room, err := app.ownerRoom(c)
	if err != nil {
		return err
	}
	token, err := app.store.InviteToken(c.Request().Context(), room)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, map[string]string{"token": token})
}

// POST /api/rooms/:id/invite/reset 招待リンクを作り直す(前のリンクは使えなくなる)
func (app *App) handleResetInvite(c echo.Context) error {
	room, err := app.ownerRoom(c)
	if err != nil {
		return err
	}
	token, err := app.store.ResetInviteToken(c.Request().Context(), room)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, map[string]string{"token": token})
}

const invalidInvite = "招待リンクが無効です。ルームの先生に新しいリンクをもらってください"

// GET /api/invites/:token 招待リンクを開いたとき。どのルームへの招待か(担当になる前の確認用)
func (app *App) handleShowInvite(c echo.Context) error {
	ctx := c.Request().Context()
	room, err := app.store.RoomByInviteToken(ctx, c.Param("token"))
	if errors.Is(err, ErrNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, invalidInvite)
	} else if err != nil {
		return err
	}
	if currentUser(c).Role != "TEACHER" {
		return echo.NewHTTPError(http.StatusForbidden, "先生を招待するリンクです。学生は授業の QR コードから参加してください")
	}
	joined, err := app.isStaff(ctx, room, currentUser(c))
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, map[string]any{"room": app.withOpen(room), "joined": joined})
}

// POST /api/invites/:token 招待を受けて、このルームの担当になる(先生だけ)
func (app *App) handleAcceptInvite(c echo.Context) error {
	ctx := c.Request().Context()
	room, err := app.store.RoomByInviteToken(ctx, c.Param("token"))
	if errors.Is(err, ErrNotFound) {
		return echo.NewHTTPError(http.StatusNotFound, invalidInvite)
	} else if err != nil {
		return err
	}
	u := currentUser(c)
	if room.OwnerID != u.ID {
		if err := app.store.AddRoomTeacher(ctx, room.ID, u.ID); err != nil {
			return err
		}
	}
	return c.JSON(http.StatusOK, app.withOpen(room))
}
