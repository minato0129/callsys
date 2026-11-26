// 文字列をクリップボードにコピーする。必ずボタンのタップ(クリック)の中から呼ぶこと。
// navigator.clipboard は https か localhost でしか使えない(http://192.168.x.x などでは undefined)ので、
// 使えないときや失敗したときは、昔ながらの方法(隠したテキストを選択して execCommand('copy'))でコピーする
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch { /* 下の方法で試す */ }
  }
  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  // 画面に見えないように置く(iOS は font-size が 16px 未満だと選択時に拡大するので 16px)
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;'
  document.body.appendChild(ta)
  const sel = document.getSelection()
  const saved = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
  ta.focus()
  ta.select()
  ta.setSelectionRange(0, text.length) // iOS は select() だけでは選択されない
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  document.body.removeChild(ta)
  if (saved && sel) { sel.removeAllRanges(); sel.addRange(saved) }
  return ok
}
