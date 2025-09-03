import React, { useEffect, useMemo, useState } from "react";
import { auth, db, provider } from "./firebase";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  browserPopupRedirectResolver ,
  
} from "firebase/auth";
import { createBookingClient, listBookingsForDay, listTopUsersByMinutes, formatDuration } from "./booking";
import { buildGCalUrl } from "./calendar";
import { format } from "date-fns";
import "./app.css";

type BookingRow = { id: string; bandName: string; startAt: any; endAt: any; userId: string };

function todayLocal() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
function plusDaysLocal(d: number) {
  const n = new Date();
  n.setDate(n.getDate() + d);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/* === In-app browser detect & helpers === */
function isInAppBrowser() {
  const ua = navigator.userAgent || "";
  return /Line\/|FBAN|FBAV|FB_IAB|Instagram|Twitter/i.test(ua) || /; wv\)/i.test(ua) || /\bWKWebView\b/i.test(ua);
}
function openExternally() {
  if (/android/i.test(navigator.userAgent)) {
    location.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
  } else {
    location.href = `googlechrome://${location.host}${location.pathname}${location.search}`;
  }
}

/* === Toast / Popup === */
type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; type: ToastType; title: string; message?: string };
function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  function push(t: Omit<ToastItem, "id">, autoCloseMs = 3600) {
    const id = Date.now() + Math.random();
    setToasts((s) => [...s, { id, ...t }]);
    if (autoCloseMs > 0) setTimeout(() => dismiss(id), autoCloseMs);
  }
  function dismiss(id: number) {
    setToasts((s) => s.filter((x) => x.id !== id));
  }
  const api = {
    success: (title: string, message?: string) => push({ type: "success", title, message }),
    error: (title: string, message?: string) => push({ type: "error", title, message }, 5400),
    info: (title: string, message?: string) => push({ type: "info", title, message }),
    dismiss,
  };
  return { toasts, ...api };
}
function ToastHost({ items, onClose }: { items: ToastItem[]; onClose: (id: number) => void }) {
  return (
    <div className="toast-wrap" aria-live="polite" aria-atomic="true" role="status">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <div aria-hidden> {t.type === "success" ? "✅" : t.type === "error" ? "⚠️" : "ℹ️"} </div>
          <div>
            <div className="title">{t.title}</div>
            {t.message && <div className="msg">{t.message}</div>}
          </div>
          <button className="close" onClick={() => onClose(t.id)} aria-label="ปิดการแจ้งเตือน">✕</button>
        </div>
      ))}
    </div>
  );
}

/* === Email login (works in in-app browsers) === */
function EmailLogin({ onDone }: { onDone?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>("");
  

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      await auth.setPersistence(browserLocalPersistence);
      if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      onDone?.();
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h2 className="card-title">เข้าสู่ระบบด้วยอีเมล</h2>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="field">
          <label>อีเมล</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
        </div>
        <div className="field">
          <label>รหัสผ่าน</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="อย่างน้อย 6 ตัวอักษร"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </div>
      </div>
      <div className="actions">
        <button className="btn primary" onClick={submit} disabled={busy || !email || password.length < 6}>
          {busy ? "กำลังดำเนินการ..." : mode === "signin" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
        </button>
        <button className="btn ghost" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "สมัครสมาชิก" : "มีบัญชีแล้ว? เข้าสู่ระบบ"}
        </button>
      </div>
      {err && <div className="toast error" style={{ position: "relative", marginTop: 10 }}><div /> <div><div className="title">เกิดข้อผิดพลาด</div><div className="msg">{err}</div></div></div>}
    </div>
  );
}
// == Helpers: Days until next 19th ==
function daysUntilNext19th(base = new Date()): number {
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = base.getDate();
  // เป้าหมาย = วันที่ 19 ของเดือนนี้ หากวันนี้เกิน 19 แล้ว ให้เป็นเดือนถัดไป
  let target = new Date(y, m, 19, 0, 0, 0, 0);
  if (d > 19) target = new Date(y, m + 1, 19, 0, 0, 0, 0);

  // นับเป็นจำนวน "วัน" แบบปัดขึ้น (อีก 0 วัน = วันนี้)
  const ms = target.getTime() - new Date(y, m, d, 0, 0, 0, 0).getTime();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

// == Modal: Countdown to 19th ==
function Days19Modal({
  open,
  days,
  onClose,
}: {
  open: boolean;
  days: number;
  onClose: () => void;
}) {
  if (!open) return null;
  const title = days === 0 ? "วันนี้วันที่ 19!" : `อีก ${days} วัน ถึงวันที่ 19`;
  const note = "ใกล้จะขึ้นแล้ว ขอให้ทุกวงสู้ ๆ ✨";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="d19-title">
      <div className="modal-card">
        <div className="modal-head">
          <h3 id="d19-title" className="modal-title">{title}</h3>
          <button className="modal-close" aria-label="ปิด" onClick={onClose}>✕</button>
        </div>
        <p className="modal-text">{note}</p>
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  );
}
function withRipple(e: React.MouseEvent<HTMLElement>) {
  const btn = e.currentTarget as HTMLElement;
  // ลบ ripple เก่าที่ค้าง
  btn.querySelectorAll('.ripple').forEach(el => el.remove());

  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const span = document.createElement('span');
  span.className = 'ripple';
  span.style.width = span.style.height = `${size}px`;
  span.style.left = `${e.clientX - rect.left - size/2}px`;
  span.style.top  = `${e.clientY - rect.top - size/2}px`;
  btn.appendChild(span);

  // เก็บกวาดหลังแอนิเมชัน
  setTimeout(() => span.remove(), 650);
}

/* === Loading Overlay === */
function LoadingOverlay({
  open,
  title = "กำลังบันทึกการจอง...",
  subtitle = "โปรดรอสักครู่ ระบบกำลังตรวจสอบเงื่อนไขและบันทึกข้อมูล",
}: {
  open: boolean;
  title?: string;
  subtitle?: string;
}) {
  if (!open) return null;
  return (
    <div className="loading-backdrop" role="alertdialog" aria-modal="true" aria-live="assertive">
      <div className="loading-card">
        <div className="loading-spinner" aria-hidden />
        <div className="loading-texts">
          <div className="loading-title">{title}</div>
          <div className="loading-sub">{subtitle}</div>
          <div className="loading-hint">
            เคล็ดลับ: หลีกเลี่ยงเวลาทับกับคนอื่น และเว้นอย่างน้อย 2 วันตามกติกา
          </div>
        </div>
      </div>
    </div>
  );
}


export default function App() {
  const [user, setUser] = useState<any>(auth.currentUser);
  const [bandName, setBandName] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [startTime, setStartTime] = useState("13:00");
  const [durationMin, setDurationMin] = useState(60);
  const [loading, setLoading] = useState(false);
  const [showD19, setShowD19] = useState(false);
const [daysD19, setDaysD19] = useState(0);

  const [rows, setRows] = useState<BookingRow[]>([]);

  const toast = useToast();
  const [leaders, setLeaders] = useState<any[]>([]);
const [loadingLeaders, setLoadingLeaders] = useState(true);
useEffect(() => {
  try {
    const dismissed = sessionStorage.getItem("dismiss-d19") === "1";
    if (!dismissed) {
      const d = daysUntilNext19th(new Date());
      setDaysD19(d);
      setShowD19(true);
    }
  } catch {
    // เงียบไว้หาก sessionStorage ใช้ไม่ได้
    const d = daysUntilNext19th(new Date());
    setDaysD19(d);
    setShowD19(true);
  }
}, []);
useEffect(() => {
  document.documentElement.classList.toggle("is-loading", loading);
  return () => document.documentElement.classList.remove("is-loading");
}, [loading]);


useEffect(() => {
  (async () => {
    try {
      setLoadingLeaders(true);
      const data = await listTopUsersByMinutes(db); // ทั้งหมด เรียงมาก→น้อย
      setLeaders(data);
    } catch (e: any) {
      console.error(e);
      toast.error("โหลดสถิติไม่สำเร็จ", e?.message);
    } finally {
      setLoadingLeaders(false);
    }
  })();
}, []);


  useEffect(() => auth.onAuthStateChanged((u) => setUser(u)), []);

  // Swallow redirect leftovers (avoid "missing initial state")
  useEffect(() => {
    (async () => {
      try {
        await auth.setPersistence(browserLocalPersistence);
        await getRedirectResult(auth);
      } catch (err: any) {
        const m = String(err?.message || "");
        if (m.includes("missing initial state") || err?.code === "auth/no-auth-event") {
          // ignore
        } else {
          console.error("getRedirectResult:", err);
        }
      }
    })();
  }, []);

  const startDate = useMemo(() => {
    const [y, m, d] = (date || "").split("-").map(Number);
    const [hh, mm] = (startTime || "").split(":").map(Number);
    return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  }, [date, startTime]);
  const endDate = useMemo(() => new Date(startDate.getTime() + durationMin * 60 * 1000), [startDate, durationMin]);
  const dayKey = useMemo(() => format(startDate, "yyyy-LL-dd"), [startDate]);

  useEffect(() => {
    (async () => {
      try {
        setRows((await listBookingsForDay(db, dayKey)) as any);
      } catch (e: any) {
        console.error(e);
        toast.error("โหลดตารางไม่สำเร็จ", e?.message);
      }
    })();
  }, [dayKey]);

  async function handleGoogleLogin() {
  // ห้ามเริ่ม Google Sign-In ใน in-app (LINE/FB/IG) — คุณมี Email Login อยู่แล้ว
  if (isInAppBrowser()) return;

  await auth.setPersistence(browserLocalPersistence);

  // สภาพแวดล้อมที่ popup ชอบมีปัญหา → ใช้ redirect ไปเลย
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const riskyEnv = isIOS || isSafari || (window as any).crossOriginIsolated;

  if (riskyEnv) {
    await signInWithRedirect(auth, provider);
    return;
  }

  // อื่น ๆ: ลอง popup ก่อนด้วยตัว resolver อย่างเป็นทางการ แล้วค่อย fallback เป็น redirect
  try {
    await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    toast.success("เข้าสู่ระบบสำเร็จ");
  } catch (err: any) {
    // popup ถูกบล็อก/ปิด/หรือมี COOP issue → redirect ต่อ
    await signInWithRedirect(auth, provider);
  }
}

  async function logout() {
    await signOut(auth);
    toast.info("ออกจากระบบแล้ว");
  }

  async function submit() {
    if (!user) {
      toast.error("จองไม่สำเร็จ", "กรุณาเข้าสู่ระบบก่อน");
      return;
    }
    if (!bandName.trim()) {
      toast.error("จองไม่สำเร็จ", "กรุณากรอกชื่อวง");
      return;
    }
    setLoading(true);
    try {
      await createBookingClient({ db, uid: user.uid, bandName: bandName.trim(), start: startDate, end: endDate });
      toast.success("จองสำเร็จ", `${bandName} เวลา ${startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      setRows((await listBookingsForDay(db, dayKey)) as any);
    } catch (e: any) {
      // ส่งเหตุผลจริงให้ผู้ใช้เข้าใจได้
      toast.error("จองไม่สำเร็จ", e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  const minDate = todayLocal();
  const maxDate = plusDaysLocal(2);
  const gcalUrl = buildGCalUrl(bandName || "ซ้อมดนตรี", startDate, endDate);

  return (
    <div className="app">
      <ToastHost items={toast.toasts} onClose={toast.dismiss} />

      <header className="site-header">
        <div className="container header-inner">
          <h1 className="site-title">จองห้องซ้อมดนตรี</h1>
          <div className="auth-bar">
            {!user ? (
              isInAppBrowser() ? (
                <>
                  <EmailLogin onDone={() => toast.success("เข้าสู่ระบบด้วยอีเมลสำเร็จ")} />
                  <button className="btn ghost" onClick={openExternally}>ต้องการใช้ Google? เปิดด้วย Chrome/Safari</button>
                </>
              ) : (
                <>
                  <button className="btn primary" onClick={handleGoogleLogin}>เข้าสู่ระบบด้วย Google</button>
                  <span className="muted">หรือ</span>
                  <EmailLogin onDone={() => toast.success("เข้าสู่ระบบด้วยอีเมลสำเร็จ")} />
                </>
              )
            ) : (
              <>
                <span className="pill" title={user.email}>👤 {user.displayName || user.email}</span>
                <button className="btn ghost" onClick={logout}>ออกจากระบบ</button>
              </>
            )}
            <div className="header-ig">
              ผู้ดูแล: <a href="https://instagram.com/dxday_.dxch" target="_blank" rel="noreferrer">@dxday_.dxch</a>
            </div>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="grid">
          {/* ฟอร์มการจอง */}
          <section className="card card-form" aria-labelledby="form-title">
            <h2 id="form-title" className="card-title">สร้างการจอง</h2>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="bandName">ชื่อวง</label>
                <input id="bandName" value={bandName} onChange={(e) => setBandName(e.target.value)} placeholder="เช่น TNS Band" />
              </div>
              <div className="field">
                <label htmlFor="date">วันที่ (วันนี้ ถึง {maxDate})</label>
                <input id="date" type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="startTime">เวลาเริ่ม</label>
                <input id="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="duration">ระยะเวลา (นาที) — ไม่เกิน 180</label>
              <input
                id="duration"
                className="range"
                type="range"
                min={30}
                max={180}
                step={5}
                value={durationMin}
                onChange={(e) => setDurationMin(parseInt(e.target.value))}
              />
              <div className="kpi">
                <span className="pill">⏱️ {durationMin} นาที</span>
                <span className="pill">สิ้นสุด ~ {endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>

            <div className="actions">
              <a className="btn link" href={gcalUrl} target="_blank" rel="noreferrer">📅 เพิ่มลง Google Calendar</a>
              <button className="btn primary" onClick={submit} disabled={loading || !bandName.trim()}>
                {loading ? "กำลังบันทึก..." : "จองเลย"}
              </button>
            </div>

            <p className="note">
              เงื่อนไข: เลือกวันได้ภายใน 3 วัน, ห้ามจองติดกัน (เว้นอย่างน้อย 2 วัน), และเวลาซ้อมไม่เกิน 3 ชั่วโมง
            </p>
          </section>

          {/* ตาราง */}
          <section className="card" aria-labelledby="table-title">
            <h2 id="table-title" className="card-title">ตารางจองของวัน {dayKey}</h2>
            <div className="table-wrap">
              <table role="table">
                <thead>
                  <tr><th>วง</th><th>เวลา</th></tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={2}><span className="muted">ยังไม่มีการจอง</span></td></tr>
                  )}
                  {rows.map((r: any) => {
                    const s = r.startAt?.toDate ? r.startAt.toDate() : new Date(r.startAt);
                    const e = r.endAt?.toDate ? r.endAt.toDate() : new Date(r.endAt);
                    const key = (r.userId || "u") + "_" + (r.dayKey || dayKey);
                    return (
                      <tr key={key}>
                        <td data-label="วง">{r.bandName}</td>
                        <td data-label="เวลา">
                          {s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        {/* สถิติ */}
<section className="card" id="stats" aria-labelledby="stats-title">
  <h2 id="stats-title" className="card-title">สถิติผู้ซ้อมเยอะที่สุด</h2>

  {loadingLeaders ? (
    <div className="muted">กำลังโหลด…</div>
  ) : leaders.length === 0 ? (
    <div className="muted">ยังไม่มีข้อมูล</div>
  ) : (
    <>
      {/* Top 1–3 แบบเด่น */}
      <ol className="leader-top3">
        {leaders.slice(0, 3).map((p, i) => (
          <li key={p.userId}>
            <span className="rank">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
            <span className="name">{p.bandName || p.userId}</span>
            <span className="mins">{formatDuration(p.minutes)}</span>
          </li>
        ))}
      </ol>

      {/* อันดับถัดไปทั้งหมดเรียงลงมา */}
      {leaders.length > 3 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>อันดับ</th><th>วง/ผู้ใช้</th><th>เวลารวม</th><th>ครั้ง</th></tr>
            </thead>
            <tbody>
              {leaders.slice(3).map((p, idx) => (
                <tr key={p.userId}>
                  <td>{idx + 4}</td>
                  <td>{p.bandName || p.userId}</td>
                  <td>{formatDuration(p.minutes)}</td>
                  <td>{p.sessions || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          

        </div>
      )}
    </>
  )}
</section>
<LoadingOverlay open={loading} />
      </main>

      <footer className="site-footer">
        <div className="container">
          <small className="muted">© {new Date().getFullYear()} TNS Music — Booking · ติดต่อผู้ดูแล IG <a className="btn link" href="https://instagram.com/dxday_.dxch" target="_blank" rel="noreferrer">@dxday_.dxch</a></small>
        </div>
      </footer>
      <Days19Modal
  open={showD19}
  days={daysD19}
  onClose={() => {
    try { sessionStorage.setItem("dismiss-d19", "1"); } catch {}
    setShowD19(false);
  }}
/>

    </div>
  );
}
