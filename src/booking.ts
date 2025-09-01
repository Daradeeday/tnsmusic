// แก้ import: เอา writeBatch ออก ใส่ runTransaction เข้าไป
import {
  doc, getDoc, runTransaction, serverTimestamp, Timestamp,
  collection, query, where, getDocs
} from 'firebase/firestore'
import { format } from 'date-fns'

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
  // ตรวจพื้นฐาน
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

  // เตรียมสล็อตทั้งหมดก่อนเข้า transaction
  const slots = Array.from(iterate5Min(start, end)).map(t => ({
    t,
    ref: doc(db, 'slots', `${dayKey}_${format(t,'HHmm')}`)
  }))

  await runTransaction(db, async (tx) => {
    // 1) ห้ามมีหัวบิลวันเดียวกันอยู่แล้ว
    const headSnap = await tx.get(headRef)
    if (headSnap.exists()) {
      throw new Error('วันนี้คุณจองไว้แล้ว')
    }

    // 2) ตรวจสล็อตทุกช่อง ห้ามซ้ำ
    for (const s of slots) {
      const snap = await tx.get(s.ref)
      if (snap.exists()) {
        throw new Error('ช่วงเวลานี้ถูกจองแล้ว')
      }
    }

    // 3) สร้างหัวบิล
    tx.set(headRef, {
      userId: uid,
      bandName, dayKey,
      startAt: Timestamp.fromDate(start),
      endAt:   Timestamp.fromDate(end),
      createdAt: serverTimestamp(),
    })

    // 4) สร้างสล็อตทั้งหมด (5 นาที/ช่อง)
    for (const s of slots) {
      tx.set(s.ref, {
        dayKey,
        startAt: Timestamp.fromDate(s.t),
        endAt:   Timestamp.fromDate(new Date(s.t.getTime()+5*60*1000)),
        userId:  uid,
        bandName,
        groupId,
        createdAt: serverTimestamp(),
      })
    }
  })

  return { ok:true, dayKey, groupId }
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
