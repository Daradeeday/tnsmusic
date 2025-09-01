// App.tsx
import React, { useEffect, useMemo, useState } from "react";
import { auth, db, provider } from "./firebase";
import { signInWithPopup, signOut } from "firebase/auth";
import { createBookingClient, listBookingsForDay } from "./booking";
import { buildGCalUrl } from "./calendar";
import { format } from "date-fns";
import "./app.css"; // ✅ เพิ่มไฟล์สไตล์ใหม่

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

export default function App() {
  const [user, setUser] = useState<any>(auth.currentUser);
  const [bandName, setBandName] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [startTime, setStartTime] = useState("13:00");
  const [durationMin, setDurationMin] = useState(60);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => auth.onAuthStateChanged((u) => setUser(u)), []);

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
      } catch (e) {
        console.error(e);
      }
    })();
  }, [dayKey]);

  async function login() {
    await signInWithPopup(auth, provider);
  }
  async function logout() {
    await signOut(auth);
  }
  async function submit() {
    if (!user) {
      setMsg("กรุณาเข้าสู่ระบบก่อน");
      return;
    }
    if (!bandName.trim()) {
      setMsg("กรุณากรอกชื่อวง");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      await createBookingClient({ db, uid: user.uid, bandName: bandName.trim(), start: startDate, end: endDate });
      setMsg("จองสำเร็จ ✅");
      setRows((await listBookingsForDay(db, dayKey)) as any);
    } catch (e: any) {
      setMsg(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  const minDate = todayLocal(),
    maxDate = plusDaysLocal(2);
  const gcalUrl = buildGCalUrl(bandName || "ซ้อมดนตรี", startDate, endDate);

  return (
    <div className="app">
      <header className="site-header">
        <div className="container header-inner">
          <h1 className="site-title">จองห้องซ้อมดนตรี</h1>
          <div className="auth-bar">
            {!user ? (
              <button className="btn primary" onClick={login}>
                เข้าสู่ระบบด้วย Google
              </button>
            ) : (
              <>
                <span className="pill user-pill" title={user.email}>
                  👤 {user.displayName || user.email}
                </span>
                <button className="btn ghost" onClick={logout}>
                  ออกจากระบบ
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container">
        <div className="grid">
          {/* การจอง */}
          <section className="card card-form" aria-labelledby="form-title">
            <h2 id="form-title" className="card-title">
              สร้างการจอง
            </h2>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="bandName">ชื่อวง</label>
                <input
                  id="bandName"
                  value={bandName}
                  onChange={(e) => setBandName(e.target.value)}
                  placeholder="เช่น TNS Band"
                  inputMode="text"
                  autoComplete="organization"
                />
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
                <span className="pill">
                  สิ้นสุด ~ {endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>

            <div className="actions">
              <a className="btn link" href={gcalUrl} target="_blank" rel="noreferrer">
                📅 เพิ่มลง Google Calendar
              </a>
              <button className="btn primary" onClick={submit} disabled={loading || !bandName.trim()}>
                {loading ? "กำลังบันทึก..." : "จองเลย"}
              </button>
            </div>

            <p className="note">
              เงื่อนไข: เลือกวันได้ภายใน 3 วัน, ห้ามจองติดกัน (เว้นอย่างน้อย 2 วัน), และเวลาซ้อมไม่เกิน 3 ชั่วโมง
            </p>

            {msg && (
              <div className={`alert ${msg.includes("สำเร็จ") ? "success" : "error"}`} aria-live="polite">
                {msg}
              </div>
            )}
          </section>

          {/* ตาราง */}
          <section className="card" aria-labelledby="table-title">
            <h2 id="table-title" className="card-title">
              ตารางจองของวัน {dayKey}
            </h2>

            <div className="table-wrap">
              <table role="table">
                <thead>
                  <tr>
                    <th>วง</th>
                    <th>เวลา</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={2}>
                        <span className="muted">ยังไม่มีการจอง</span>
                      </td>
                    </tr>
                  )}
                  {rows.map((r: any) => {
                    const s = r.startAt?.toDate ? r.startAt.toDate() : new Date(r.startAt);
                    const e = r.endAt?.toDate ? r.endAt.toDate() : new Date(r.endAt);
                    const key = (r.userId || "u") + "_" + (r.dayKey || dayKey);
                    return (
                      <tr key={key}>
                        <td data-label="วง">{r.bandName}</td>
                        <td data-label="เวลา">
                          {s.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                          {e.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      <footer className="site-footer">
        <div className="container">
          <small className="muted">© {new Date().getFullYear()} TNS Music — Booking</small>
        </div>
      </footer>
    </div>
  );
}
