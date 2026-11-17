package main

import (
	"testing"
	"time"
)

func testConfig(t *testing.T) *Config {
	t.Helper()
	loc, err := time.LoadLocation("Asia/Tokyo")
	if err != nil {
		t.Fatal(err)
	}
	ps, err := parsePeriods("1=09:15-10:45,2=11:00-12:30,3=13:30-15:00,4=15:15-16:45")
	if err != nil {
		t.Fatal(err)
	}
	return &Config{Periods: ps, Loc: loc}
}

func TestScheduledOpenMultiPeriod(t *testing.T) {
	c := testConfig(t)
	// 2026-11-05 は木曜(4)
	at := func(hhmm string) time.Time {
		tm, err := time.ParseInLocation("2006-01-02 15:04", "2026-11-05 "+hhmm, c.Loc)
		if err != nil {
			t.Fatal(err)
		}
		return tm
	}
	cases := []struct {
		name        string
		first, last int
		dow         int
		at          string
		want        bool
	}{
		{"1コマ: 時限中", 2, 2, 4, "11:30", true},
		{"1コマ: 終了直後", 2, 2, 4, "12:30", false},
		{"1コマ: 休み時間", 2, 2, 4, "13:00", false},
		{"2〜3限: 2限中", 2, 3, 4, "11:00", true},
		{"2〜3限: 間の休み時間も授業中", 2, 3, 4, "13:00", true},
		{"2〜3限: 3限中", 2, 3, 4, "14:59", true},
		{"2〜3限: 3限終了後", 2, 3, 4, "15:00", false},
		{"2〜3限: 開始前", 2, 3, 4, "10:59", false},
		{"2〜3限: 曜日が違う", 2, 3, 3, "13:00", false},
	}
	for _, tc := range cases {
		if got := c.scheduledOpen(tc.dow, tc.first, tc.last, at(tc.at)); got != tc.want {
			t.Errorf("%s: scheduledOpen(%d, %d〜%d, %s) = %v, want %v", tc.name, tc.dow, tc.first, tc.last, tc.at, got, tc.want)
		}
	}

	// 授業中に終了したときは、最後の時限の終了まで閉じる
	end, ok := c.scheduledEnd(4, 2, 3, at("13:00"))
	if !ok || !end.Equal(at("15:00")) {
		t.Errorf("scheduledEnd(木 2〜3限, 13:00) = %v, %v; want 15:00", end.In(c.Loc), ok)
	}
}

func TestLastPeriod(t *testing.T) {
	for _, tc := range []struct{ period, end, want int }{
		{3, 0, 3}, // 古いルーム(period_end 未設定)
		{3, 3, 3},
		{3, 4, 4},
		{3, 2, 3}, // 不正な値は 1 コマ扱い
	} {
		r := &Room{Period: tc.period, PeriodEnd: tc.end}
		if got := r.LastPeriod(); got != tc.want {
			t.Errorf("LastPeriod(period=%d, end=%d) = %d, want %d", tc.period, tc.end, got, tc.want)
		}
	}
}

func TestRoomOpenMultiSlots(t *testing.T) {
	c := testConfig(t)
	r := &Room{}
	r.SetSlots([]RoomSlot{{DayOfWeek: 1, Period: 1, PeriodEnd: 2}, {DayOfWeek: 4, Period: 3, PeriodEnd: 3}}) // 月1〜2限・木3限
	at := func(s string) time.Time {
		tm, err := time.ParseInLocation("2006-01-02 15:04", s, c.Loc)
		if err != nil {
			t.Fatal(err)
		}
		return tm
	}
	// 2026-11-16 は月曜、2026-11-19 は木曜
	cases := []struct {
		at   string
		want bool
	}{
		{"2026-11-16 09:30", true},  // 月1限
		{"2026-11-16 12:00", true},  // 月2限
		{"2026-11-16 13:45", false}, // 月3限(時間帯の外)
		{"2026-11-19 10:00", false}, // 木1限(時間帯の外)
		{"2026-11-19 14:00", true},  // 木3限
		{"2026-11-17 14:00", false}, // 火曜
	}
	for _, cs := range cases {
		if got := c.roomOpen(r, at(cs.at)); got != cs.want {
			t.Errorf("roomOpen(%s) = %v, want %v", cs.at, got, cs.want)
		}
	}
	// 「授業を終了」で閉じておく時刻は、今の時間帯の終わり
	end, ok := c.roomScheduledEnd(r, at("2026-11-19 14:00"))
	if !ok || !end.Equal(at("2026-11-19 15:00").UTC()) {
		t.Errorf("roomScheduledEnd = %v %v, want 15:00", end.In(c.Loc), ok)
	}
}
