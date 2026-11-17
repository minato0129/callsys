package main

import "testing"

func TestNormalizeClassNames(t *testing.T) {
	cases := map[string]string{
		"IE2A":           "IE2A",
		"  IE2A  ":       "IE2A",
		"IE2A、IE2B":      "IE2A、IE2B",
		"IE2A, IE2B":     "IE2A、IE2B",
		"IE2A，IE2B／IE2C": "IE2A、IE2B、IE2C",
		"IE2A、、IE2B、":    "IE2A、IE2B",
		"IE2A、IE2A、IE2B": "IE2A、IE2B",
		"情報・電子 合同":       "情報・電子 合同", // 「・」や空白はクラス名の一部として残す
		"、 ,":            "",
	}
	for in, want := range cases {
		if got := normalizeClassNames(in); got != want {
			t.Errorf("normalizeClassNames(%q) = %q, want %q", in, got, want)
		}
	}
}
