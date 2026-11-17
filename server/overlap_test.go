package main

import "testing"

func TestRoomOverlaps(t *testing.T) {
	room := func(day, from, to int) *Room { return &Room{DayOfWeek: day, Period: from, PeriodEnd: to} }
	cases := []struct {
		name string
		a, b *Room
		want bool
	}{
		{"同じ曜日・同じ時限", room(2, 3, 3), room(2, 3, 3), true},
		{"2コマ続きの後ろの時限と重なる", room(2, 3, 4), room(2, 4, 4), true},
		{"2コマ続き同士で1コマ重なる", room(2, 1, 2), room(2, 2, 3), true},
		{"隣の時限は重ならない", room(2, 1, 2), room(2, 3, 4), false},
		{"曜日が違えば重ならない", room(1, 3, 4), room(2, 3, 4), false},
		{"古いルーム(period_end=0)は1コマ", room(2, 3, 0), room(2, 4, 4), false},
	}
	for _, c := range cases {
		if got := c.a.Overlaps(c.b); got != c.want {
			t.Errorf("%s: a.Overlaps(b) = %v, want %v", c.name, got, c.want)
		}
		if got := c.b.Overlaps(c.a); got != c.want {
			t.Errorf("%s: b.Overlaps(a) = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestRoomOverlapsMultiSlots(t *testing.T) {
	slot := func(day, from, to int) RoomSlot { return RoomSlot{DayOfWeek: day, Period: from, PeriodEnd: to} }
	a := &Room{}
	a.SetSlots([]RoomSlot{slot(4, 3, 3), slot(1, 1, 2)}) // 木3限 と 月1〜2限
	if a.DayOfWeek != 1 || a.Period != 1 || a.PeriodEnd != 2 {
		t.Fatalf("先頭の時間帯は月曜1〜2限になるはず: %+v", a)
	}
	cases := []struct {
		name string
		b    *Room
		want bool
	}{
		{"2つ目の時間帯(木3限)と重なる", &Room{DayOfWeek: 4, Period: 2, PeriodEnd: 3}, true},
		{"1つ目の時間帯(月1〜2限)と重なる", &Room{DayOfWeek: 1, Period: 2}, true},
		{"どちらとも重ならない", &Room{DayOfWeek: 4, Period: 1, PeriodEnd: 2}, false},
		{"相手も複数の時間帯", &Room{Slots: []RoomSlot{slot(2, 1, 1), slot(4, 3, 4)}}, true},
	}
	for _, c := range cases {
		if got := a.Overlaps(c.b); got != c.want {
			t.Errorf("%s: a.Overlaps(b) = %v, want %v", c.name, got, c.want)
		}
		if got := c.b.Overlaps(a); got != c.want {
			t.Errorf("%s: b.Overlaps(a) = %v, want %v", c.name, got, c.want)
		}
	}
}
