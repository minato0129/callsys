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
