import type { ReactNode } from 'react'
import { useApp } from '../app-context'
import { Header, TabBar } from '../components'

// 先生向けの使い方。はじめて使う先生が、上から順に読めば使い始められるように書く
type Section = { id: string; title: string; body: ReactNode; img?: { src: string; alt: string } }

const SECTIONS: Section[] = [
  {
    id: 'start',
    title: 'はじめに',
    body: (
      <>
        <ol className="guide-steps">
          <li><b>ホーム画面に追加</b>します。iPhone は Safari の共有ボタン →「ホーム画面に追加」。Android は Chrome のメニュー →「アプリをインストール」。</li>
          <li>追加したアプリを開き、<b>通知をオン</b>にします(ルーム一覧の上の案内、またはアカウント画面から)。</li>
        </ol>
        <p className="guide-note">iPhone は、ホーム画面に追加したアプリでないと通知が届きません。</p>
      </>
    ),
  },
  {
    id: 'create',
    title: 'ルームを作る',
    img: { src: '/guide/create.webp', alt: 'ルームを作成する画面。科目名、クラス名、曜日・時限の入力欄' },
    body: (
      <>
        <p>授業ごとに「ルーム」を1つ作ります。ルーム一覧の右上の <b>＋</b> から作成します。</p>
        <ul className="guide-list">
          <li><b>科目名・クラス名</b>: 合同授業は「クラスを追加」で複数のクラスを入れられます。</li>
          <li><b>曜日・時限</b>: 2コマ続きの授業は「開始 1限・終了 2限」のように指定します。月曜と木曜など、曜日をまたぐ授業は「時間帯を追加」で追加します。</li>
        </ul>
        <p>ルームは一度作れば、毎週そのまま使えます。あとから「…」→「ルームを変更」で直せます。</p>
      </>
    ),
  },
  {
    id: 'join',
    title: '学生に参加してもらう',
    img: { src: '/guide/qr.webp', alt: '参加用の QR コードを全画面で表示した画面' },
    body: (
      <>
        <p>最初の授業で、学生にルームの <b>QR コード</b>を読み取ってもらいます(1回だけ)。</p>
        <ol className="guide-steps">
          <li>ルームを開き、右上の <b>QR アイコン</b>を押すと、QR コードが大きく表示されます。スマホを見せるか、PC からプロジェクターに映します。</li>
          <li>学生は自分のアプリの「<b>QR コードを読み取る</b>」で読み取ります(スマホの標準カメラではなく、アプリの中のボタンから)。</li>
        </ol>
        <p>Teams などで送るときは、PC のルーム画面の「<b>リンクをコピー</b>」で参加用のリンクを貼れます。</p>
        <p className="guide-note">一度参加した学生は、次の授業からはアプリを開くだけで、その授業の画面が自動で開きます。</p>
      </>
    ),
  },
  {
    id: 'session',
    title: '授業中にする',
    body: (
      <>
        <p>ルームの曜日・時限の時間になると、<b>自動で「授業中」</b>になり、学生が呼び出せるようになります。</p>
        <ul className="guide-list">
          <li>時間割と違う時間に使うときは、ルームの画面の「<b>授業を開始</b>」で開きます(100 分間)。</li>
          <li>早めに終わるときは「<b>授業を終了</b>」。待っている学生の呼び出しは取り消されます。</li>
          <li>同時に授業中にできるルームは<b>1つだけ</b>です。ほかのルームが授業中のときは、終了してから開始するか選べます。</li>
        </ul>
      </>
    ),
  },
  {
    id: 'calls',
    title: '呼び出しに対応する',
    img: { src: '/guide/room.webp', alt: 'ルームの画面。いちばん前の学生が大きく表示され、その下に次の学生と待っている人数' },
    body: (
      <>
        <p>学生は「<b>質問</b>」か「<b>課題チェック</b>」で先生を呼び出し、押した順に並びます。</p>
        <ul className="guide-list">
          <li>誰も待っていないところに呼び出しが入ると、<b>5 秒後に通知</b>が届きます。ルームの画面を開くまで、<b>3 分ごとに通知</b>が届き直します。</li>
          <li>ルームの画面では、<b>いちばん前の学生</b>を大きく表示します。色で種類が分かります(<span className="guide-question">紫 = 質問</span>、<span className="guide-check">青緑 = 課題チェック</span>)。その下が次の学生と人数です。</li>
          <li>学生のところへ行き、対応が終わったら「<b>対応する</b>」→「<b>対応済にする</b>」。次の学生に「次があなたの番です」と通知が届きます。</li>
        </ul>
      </>
    ),
  },
  {
    id: 'memo',
    title: 'メモを書く・保存する',
    img: { src: '/guide/finish.webp', alt: '対応済にする画面。学生の名前と、メモの入力欄' },
    body: (
      <>
        <p>「対応する」を押すと、その学生の<b>メモ</b>を書けます(進み具合など)。</p>
        <ul className="guide-list">
          <li>メモは授業ごとに学生1人につき1枚です。同じ授業でまた呼び出されたときは、前のメモがルームの画面に出て、書き換えると上書きされます。</li>
          <li>メニュー(スマホは画面の下、PC は左)の「<b>メモ</b>」で、授業・日付ごとに見られます。右上のボタンで <b>CSV(Excel で開けます)</b>に保存できます。</li>
        </ul>
      </>
    ),
  },
  {
    id: 'invite',
    title: 'ほかの先生・TA と一緒に担当する',
    img: { src: '/guide/invite.webp', alt: '先生を招待する画面。招待リンクの QR コードと、担当の先生の一覧' },
    body: (
      <>
        <p>ルームの「…」→「<b>先生を招待</b>」の招待リンク(QR・リンクをコピー)を、一緒に担当する先生に送ります。開いた先生が「このルームの担当になる」を押すと担当になります。</p>
        <ul className="guide-list">
          <li>担当の先生にも<b>呼び出しの通知</b>が届き、対応済にする・メモを書く・授業の開始と終了・メモの閲覧ができます。</li>
          <li>ルームの変更・削除・招待は、ルームを作った先生だけができます。担当の先生を外すこともできます。</li>
        </ul>
        <p className="guide-note">学生の参加用の QR とは別のリンクです。先生だけに送ってください。</p>
      </>
    ),
  },
  {
    id: 'student',
    title: '学生の画面',
    img: { src: '/guide/student.webp', alt: '学生の画面。待っている人数と、質問・課題チェックのボタン' },
    body: (
      <>
        <p>学生は授業中、画面の下の「質問」「課題チェック」で先生を呼び出します。</p>
        <ul className="guide-list">
          <li>呼び出すと<b>自分が何番目か</b>が表示され、1番目になると「次があなたの番です」と通知が届きます。</li>
          <li>自分で取り消すこともできます(先生に対応してもらった場合は取り消さないよう案内しています)。</li>
          <li>間違えて別のクラスに参加したときは、学生が自分で「…」→「この授業から抜ける」で抜けられます。同じ時間帯の授業には、1つしか参加できません。</li>
        </ul>
      </>
    ),
  },
  {
    id: 'faq',
    title: 'こんなときは',
    body: (
      <dl className="guide-faq">
        <dt>通知が届かない</dt>
        <dd>アカウント画面の「テスト通知を送る」で確認できます。iPhone はホーム画面に追加したアプリから通知をオンにしてください。端末の設定でこのアプリの通知が許可されているかも確認してください。</dd>
        <dt>通知を止めたい</dt>
        <dd>アカウント画面の「この端末の通知をオフにする」で、その端末だけ止められます(ほかの端末はそのまま)。</dd>
        <dt>学生が呼び出せない</dt>
        <dd>ルームが「授業時間外」になっていないか確認してください。時間割と違う時間なら「授業を開始」を押します。</dd>
        <dt>学生が QR を読み取れない</dt>
        <dd>スマホの標準カメラではなく、アプリの「QR コードを読み取る」から読み取ってもらってください。</dd>
      </dl>
    ),
  },
]

export default function Guide() {
  const { user } = useApp()
  const teacher = user?.role === 'TEACHER'
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <>
      <Header title="使い方" back={teacher ? '/account' : '/'} />
      <main className={`page page-wide stack guide ${teacher ? 'with-tabbar' : ''}`}>
        <section className="guide-intro">
          <p className="guide-lead">学生が手を挙げ続けなくても、<b>呼んだ順に</b>先生のところに呼び出しが届くアプリです。</p>
          <ol className="guide-flow" aria-label="使う流れ">
            <li><span>1</span>ルームを作る</li>
            <li><span>2</span>学生が QR で参加</li>
            <li><span>3</span>学生が呼び出す</li>
            <li><span>4</span>順番に対応する</li>
          </ol>
        </section>

        <nav className="guide-toc" aria-label="目次">
          {SECTIONS.map((s, i) => (
            <button key={s.id} type="button" onClick={() => jump(s.id)}><span>{i + 1}</span>{s.title}</button>
          ))}
        </nav>

        {SECTIONS.map((s, i) => (
          <section key={s.id} id={s.id} className={`guide-section ${s.img ? 'has-img' : ''}`}>
            <div className="guide-text">
              <h2><span className="guide-no">{i + 1}</span>{s.title}</h2>
              {s.body}
            </div>
            {s.img && <img className="guide-img" src={s.img.src} alt={s.img.alt} width={260} height={563} loading="lazy" />}
          </section>
        ))}
      </main>
      {teacher && <TabBar />}
    </>
  )
}
