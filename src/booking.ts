// แก้ import: เอา writeBatch ออก ใส่ runTransaction เข้าไป
import {
  doc, getDoc, runTransaction, serverTimestamp, Timestamp,
  collection, query, where, getDocs ,collectionGroup 
} from 'firebase/firestore'
import { format } from 'date-fns'

// ===== Canonical band names (ปรับเพิ่มได้)
// ===== Canonical band mapping =====
const BAND_LABELS: Record<string, string> = {
  'sinnoble': 'Sinnoble',
  'flychicken': 'flychicken',
  'ส้นตีน': 'ส้นตีน',
  'poet': 'POET',
  'zhyphilis': 'zhyphilis',
};

export function makeBandKey(raw: string) {
  return (raw || '')
    .toString()
    .normalize('NFC')      // แก้ปัญหาโค้ดจุด/สระภาษาไทย
    .trim()
    .replace(/\s+/g, ' ')  // ช่องว่างหลายอัน -> อันเดียว
    .toLowerCase();
}
export function canonicalBand(raw: string) {
  const key = makeBandKey(raw);
  const label = BAND_LABELS[key] ?? (raw || '').toString().trim();
  return { bandKey: key, bandName: label };
}
// แทนทั้งสองตัวด้วยตัวนี้ตัวเดียว
function toDateAny(v: any): Date {
  return v?.toDate ? v.toDate() : (v instanceof Date ? v : new Date(v))
}





export function* iterate5Min(start: Date, end: Date){
  for (let t = new Date(start); t < end; t = new Date(t.getTime() + 5*60*1000)) {
    yield new Date(t)
  }
}

// (คงเวอร์ชันนี้ไว้) ไม่ต้องใช้ index
export async function getUserDayKeys(db: any, uid: string, dayKeys: string[]){
  const results = await Promise.all(dayKeys.map(async key => {
    const ref = doc(db, 'users', uid, 'bookings', key)
    const snap = await getDoc(ref)
    return snap.exists() ? key : null
  }))
  return results.filter(Boolean) as string[]
}

// ✅ เวอร์ชันใหม่: ใช้ Transaction แทน Batch.create
export async function createBookingClient({
  db, uid, bandName, start, end
}: { db:any; uid:string; bandName:string; start:Date; end:Date; }){

  const ms = end.getTime() - start.getTime()
  if (ms <= 0) throw new Error('เวลาสิ้นสุดต้องหลังเวลาเริ่ม')
  if (ms > 3*60*60*1000) throw new Error('ระยะเวลาเกิน 3 ชั่วโมง')

  const now = new Date()
  const max = new Date(now.getFullYear(), now.getMonth(), now.getDate()+2, 23, 59, 59)
  if (start < new Date(now.getFullYear(), now.getMonth(), now.getDate())) throw new Error('จองย้อนหลังไม่ได้')
  if (start > max) throw new Error('เลือกวันได้ภายใน 3 วัน (วันนี้ + 2 วันถัดไป)')

  const dayKey = format(start, 'yyyy-LL-dd')

  // เว้น 2 วัน (เช็กฝั่ง client)
  const prev  = format(new Date(start.getTime()-24*60*60*1000), 'yyyy-LL-dd')
  const next1 = format(new Date(start.getTime()+24*60*60*1000), 'yyyy-LL-dd')
  const next2 = format(new Date(start.getTime()+2*24*60*60*1000), 'yyyy-LL-dd')
  const has = await getUserDayKeys(db, uid, [prev, dayKey, next1, next2])
  if (has.length > 0) throw new Error('ห้ามจองติดกัน ต้องเว้นอย่างน้อย 2 วัน')

  const headRef = doc(db, 'users', uid, 'bookings', dayKey)
  const groupId = `${uid}_${dayKey}`

  // ✅ ทำชื่อวงเป็นมาตรฐาน + ได้ bandKey
  const { bandKey, bandName: bandLabel } = canonicalBand(bandName)

  // เตรียมสล็อต
  const slots = Array.from(iterate5Min(start, end)).map(t => ({
    t,
    ref: doc(db, 'slots', `${dayKey}_${format(t,'HHmm')}`)
  }))

  await runTransaction(db, async (tx) => {
    // 1) วันเดียวกันมีหัวบิลอยู่แล้วห้ามซ้ำ
    const headSnap = await tx.get(headRef)
    if (headSnap.exists()) throw new Error('วันนี้คุณจองไว้แล้ว')

    // 2) สล็อตห้ามทับ
    for (const s of slots) {
      const snap = await tx.get(s.ref)
      if (snap.exists()) throw new Error('ช่วงเวลานี้ถูกจองแล้ว')
    }

    // 3) สร้างหัวบิล (เก็บ bandKey/bandName)
    tx.set(headRef, {
      userId: uid,
      bandKey,
      bandName: bandLabel,
      dayKey,
      groupId,
      startAt: Timestamp.fromDate(start),
      endAt:   Timestamp.fromDate(end),
      createdAt: serverTimestamp(),
    })

    // 4) สร้างสล็อตพร้อม bandKey/bandName
    for (const s of slots) {
      tx.set(s.ref, {
        dayKey,
        startAt: Timestamp.fromDate(s.t),
        endAt:   Timestamp.fromDate(new Date(s.t.getTime()+5*60*1000)),
        userId:  uid,
        bandKey,
        bandName: bandLabel,
        groupId,
        createdAt: serverTimestamp(),
      })
    }
  })

  return { ok:true, dayKey, groupId }
}

// ลบการจองของตัวเอง (วันเดิมเท่านั้น) — ลบได้เฉพาะปัจจุบัน/อนาคต
// --- แทนที่ deleteMyBooking ทั้งฟังก์ชัน ---
export async function deleteMyBooking(db: any, params: {
  uid: string,
  dayKey: string,
}) {
  const { uid, dayKey } = params;
  const bookingRef = doc(db, `users/${uid}/bookings/${dayKey}`);
  const today0 = new Date(); today0.setHours(0,0,0,0);

  await runTransaction(db, async (tx) => {
    // READS
    const snap = await tx.get(bookingRef);
    if (!snap.exists()) throw new Error('ไม่พบการจอง');

    const b: any = snap.data();
    if ((b.userId || uid) !== uid) throw new Error('ไม่มีสิทธิ์ลบการจองนี้');

    const s0 = toDateAny(b.startAt);
    const e0 = toDateAny(b.endAt);
    if (e0.getTime() < Date.now() || s0 < today0) {
      throw new Error('ไม่สามารถลบการจองที่ผ่านมาแล้ว');
    }

    const slotRefs = Array.from(iterate5MinSlots(s0, e0))
      .map(([s]) => doc(db, `slots/${slotId(dayKey, s)}`));

    const slotSnaps = await Promise.all(slotRefs.map(r => tx.get(r)));

    // WRITES
    slotRefs.forEach((ref, i) => {
      const ds = slotSnaps[i];
      if (!ds.exists() || ds.get('userId') === uid) tx.delete(ref);
    });

    tx.delete(bookingRef);
  });

  return { ok: true, dayKey };
}



// (คงเวอร์ชันนี้ไว้) อ่านตารางจาก 'slots' → ไม่ต้องสร้าง index
export async function listBookingsForDay(db: any, dayKey: string){
  const qy = query(collection(db, 'slots'), where('dayKey', '==', dayKey))
  const snap = await getDocs(qy)

  const map = new Map<string, any>()
  snap.forEach(docSnap => {
    const d: any = docSnap.data()
    const g = d.groupId || `${d.userId}_${d.dayKey}`
    const cur = map.get(g)
    if (!cur) {
      map.set(g, { userId: d.userId, bandName: d.bandName, dayKey: d.dayKey, startAt: d.startAt, endAt: d.endAt })
    } else {
      if (d.startAt.toMillis() < cur.startAt.toMillis()) cur.startAt = d.startAt
      if (d.endAt.toMillis()   > cur.endAt.toMillis())   cur.endAt   = d.endAt
    }
  })

  return Array.from(map.values()).sort((a,b) => a.startAt.toMillis() - b.startAt.toMillis())
}


export type Leader = {
  bandKey: string
  bandName: string
  minutes: number
  sessions: number
}


function toDate(ts: any): Date {
  return ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts))
}

export function formatDuration(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`
}

/**
 * รวมเวลาซ้อมของทุกคน (นาที) จาก bookings ทั้งหมด
 * - พยายามใช้ collectionGroup('bookings') ก่อน (เร็ว/เบา)
 * - ถ้าเครื่องผู้ใช้ยังไม่รองรับ/ติด index → fallback ไปที่คอลเลกชัน 'slots' (คิด 5 นาทีต่อสล็อต)
 */
export async function listTopUsersByMinutes(db: any, limitN = 100) {
  const agg = new Map<string, Leader>()

  try {
    // รวมจากหัวบิลของทุกคน (ไม่ต้อง composite index)
    const snap = await getDocs(collectionGroup(db, 'bookings'))
    snap.forEach((docSnap) => {
      const d: any = docSnap.data()
      const key = d.bandKey || makeBandKey(d.bandName || '')
      if (!key) return
      const name = d.bandName || canonicalBand(d.bandName || '').bandName

      const s = toDateAny(d.startAt)
      const e = toDateAny(d.endAt)
      const mins = Math.max(0, Math.round((e.getTime() - s.getTime()) / 60000))

      const cur = agg.get(key) || { bandKey: key, bandName: name, minutes: 0, sessions: 0 }
      cur.minutes += mins
      cur.sessions += 1
      if (!agg.has(key)) agg.set(key, cur)
    })
  } catch {
    // Fallback: รวมจาก slots (เอกสารละ 5 นาที) + นับ sessions จาก groupId
    const groupsByBand = new Map<string, Set<string>>()
    const sSnap = await getDocs(collection(db, 'slots'))
    sSnap.forEach((docSnap) => {
      const d: any = docSnap.data()
      const key = d.bandKey || makeBandKey(d.bandName || '')
      if (!key) return
      const name = d.bandName || canonicalBand(d.bandName || '').bandName

      const cur = agg.get(key) || { bandKey: key, bandName: name, minutes: 0, sessions: 0 }
      cur.minutes += 5
      agg.set(key, cur)

      const g = d.groupId || `${d.userId || 'u'}_${d.dayKey || ''}`
      const set = groupsByBand.get(key) || new Set<string>()
      set.add(g)
      groupsByBand.set(key, set)
    })
    for (const [k, info] of agg) {
      info.sessions = groupsByBand.get(k)?.size || info.sessions
    }
  }

  return Array.from(agg.values()).sort((a, b) => b.minutes - a.minutes).slice(0, limitN)
}


// === Stats & Booking helpers (ต่อท้ายไฟล์เดิม) ===

// แปลง Date เป็น slot id (ช่องละ 5 นาที)
function slotId(dayKey: string, dt: Date) {
  const hh = String(dt.getHours()).padStart(2, '0')
  const mm = String(dt.getMinutes()).padStart(2, '0')
  return `${dayKey}_${hh}${mm}`
}
function* iterate5MinSlots(start: Date, end: Date) {
  const ms = 5 * 60 * 1000
  for (let t = start.getTime(); t < end.getTime(); t += ms) {
    const s = new Date(t)
    const e = new Date(Math.min(t + ms, end.getTime()))
    yield [s, e] as [Date, Date]
  }
}
function sameDayKey(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate()
}

export async function getMyUpcomingBookings(db: any, uid: string) {
  // อ่านเฉพาะของ user นี้ (subcollection ไม่ต้อง index เสริมถ้าไม่ filter ซับซ้อน)
  const snap = await getDocs(collection(db, `users/${uid}/bookings`))
  const now = new Date()
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() as any }))
    .filter(b => {
      const s = b.startAt?.toDate ? b.startAt.toDate() : new Date(b.startAt)
      return s.getTime() >= now.setHours(0,0,0,0) // วันนี้และอนาคต
    })
    .sort((a,b) => {
      const sa = (a.startAt?.toDate ? a.startAt.toDate() : new Date(a.startAt)).getTime()
      const sb = (b.startAt?.toDate ? b.startAt.toDate() : new Date(b.startAt)).getTime()
      return sa - sb
    })
  return items
}

/**
 * แก้ไขเวลาการจองของตนเอง (วันเดิมเท่านั้น)
 * - ห้ามแก้ถ้า booking เป็นอดีต (เช่น เมื่อวาน/ก่อนหน้า/ก่อนเวลาปัจจุบันของวันนี้)
 * - ระยะเวลาใหม่ <= 180 นาที
 * - ต้องไม่ทับกับ slot ของคนอื่น
 * - แก้ไขโดยลบ slot เก่า + เขียน slot ใหม่ ภายใน transaction
 */
// --- แทนที่ updateBookingTime ทั้งฟังก์ชัน ---
export async function updateBookingTime(db: any, params: {
  uid: string,
  dayKey: string,
  newStart: Date,
  newEnd: Date,
}) {
  const { uid, dayKey, newStart, newEnd } = params;

  if (newEnd <= newStart) throw new Error('เวลาสิ้นสุดต้องหลังเวลาเริ่ม');
  const durationMin = Math.round((newEnd.getTime() - newStart.getTime()) / 60000);
  if (durationMin > 180) throw new Error('ระยะเวลาเกิน 3 ชั่วโมง');

  const today0 = new Date(); today0.setHours(0,0,0,0);
  const bookingRef = doc(db, `users/${uid}/bookings/${dayKey}`);

  await runTransaction(db, async (tx) => {
    // ---------- READS ----------
    const snap = await tx.get(bookingRef);
    if (!snap.exists()) throw new Error('ไม่พบการจอง');

    const b: any = snap.data();
    const oldStart: Date = toDateAny(b.startAt);
    const oldEnd:   Date = toDateAny(b.endAt);

    if (oldEnd.getTime() < Date.now() || oldStart < today0) {
      throw new Error('ไม่สามารถแก้ไขการจองที่ผ่านมาแล้ว');
    }
    if (!sameDayKey(oldStart, newStart) || !sameDayKey(oldStart, newEnd)) {
      throw new Error('เปลี่ยนวันไม่ได้ อนุญาตแก้ได้เฉพาะเวลาในวันเดิม');
    }

    const oldSlotRefs = Array.from(iterate5MinSlots(oldStart, oldEnd))
      .map(([s]) => doc(db, `slots/${slotId(dayKey, s)}`));

    const newSlots = Array.from(iterate5MinSlots(newStart, newEnd))
      .map(([s, e]) => ({ s, e, ref: doc(db, `slots/${slotId(dayKey, s)}`) }));

    const [oldSnaps, newSnaps] = await Promise.all([
      Promise.all(oldSlotRefs.map(r => tx.get(r))),
      Promise.all(newSlots.map(ns => tx.get(ns.ref))),
    ]);

    newSnaps.forEach((ds) => {
      if (ds.exists()) {
        const owner = ds.get('userId');
        if (owner && owner !== uid) throw new Error('เวลาที่เลือกทับกับผู้อื่น');
      }
    });

    // ---------- WRITES ----------
    oldSlotRefs.forEach((ref, i) => {
      const ds = oldSnaps[i];
      // ลบทิ้งได้แม้เอกสารไม่มีอยู่ (ปลอดภัย)
      if (!ds.exists() || ds.get('userId') === uid) tx.delete(ref);
    });

    newSlots.forEach(({ s, e, ref }) => {
      tx.set(ref, {
        userId: uid,
        bandKey: b.bandKey || makeBandKey(b.bandName || ''),
        bandName: b.bandName,
        dayKey,
        startAt: Timestamp.fromDate(s),
        endAt:   Timestamp.fromDate(e),
        groupId: b.groupId || `${uid}_${dayKey}`,
        createdAt: serverTimestamp(),
      });
    });

    tx.set(bookingRef, {
      ...b,
      bandKey: b.bandKey || makeBandKey(b.bandName || ''),
      startAt: Timestamp.fromDate(newStart),
      endAt:   Timestamp.fromDate(newEnd),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
}
