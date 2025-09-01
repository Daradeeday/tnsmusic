
# Rehearsal Booking (Spark-only, no server)

เว็บจองห้องซ้อมดนตรีแบบ **ฟรี 100%** (Spark) — ไม่มี Cloud Functions/FCM
- Google Login (Firebase Auth)
- เก็บที่ Firestore
- กันซ้อนเวลาแบบชัวร์ด้วย slot 5 นาที (atomic batch)
- เลือกวันได้เฉพาะวันนี้ + 2 วันถัดไป
- เวลาซ้อมไม่เกิน 3 ชั่วโมง
- เว้นอย่างน้อย 2 วันระหว่างการจอง (ตรวจกฎฝั่งแอป)
- ปุ่ม Add to Google Calendar แทน Push

## เริ่มต้น
1) คัดลอก `.env.example` เป็น `.env` แล้วกรอกค่าจาก Firebase Console > Project settings > General
2) ติดตั้งและรัน
```bash
npm install
npm run dev
```

## Firestore Rules
```bash
firebase login
firebase init firestore      # ถ้ายังไม่เคย
firebase deploy --only firestore:rules
```
ไฟล์กฎ: `firestore.rules`

## Deploy Hosting (Spark ฟรี)
```bash
npm run build
firebase init hosting        # ครั้งแรก เลือก public = dist
firebase deploy --only hosting
```

> หมายเหตุ: ถ้าต้องบังคับ "เว้น 2 วัน" ด้าน server จริง ๆ จะต้องใช้ Cloud Functions (ต้องอัปเกรด Blaze)
