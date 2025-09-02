# ระบบจองห้องซ้อมดนตรี · Dark Mode · Responsive

[![React](https://img.shields.io/badge/React-18-61dafb.svg?logo=react&logoColor=000)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646cff.svg?logo=vite&logoColor=fff)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg?logo=typescript&logoColor=fff)](https://www.typescriptlang.org)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-ffca28.svg?logo=firebase&logoColor=000)](https://firebase.google.com)
[![License](https://img.shields.io/badge/License-MIT-2ea44f)](#license)

แอปเว็บสำหรับ **จองห้องซ้อมดนตรี** โทน **Dark Mode** ดีไซน์เรียบหรู ใช้งานง่าย รองรับทุกขนาดหน้าจอ  
ยืนยันตัวตนด้วย **Google Sign-In** (popup → redirect) และ **อีเมล/รหัสผ่าน** (ใช้ได้ใน in-app browser เช่น LINE/FB/IG)  
ข้อมูลเก็บใน **Cloud Firestore** (Spark ฟรี) — ไม่มี Cloud Functions/CORS จึง **ไม่มีค่าใช้จ่าย** และติดตั้งง่าย

---

## สารบัญ
- [คุณสมบัติเด่น](#คุณสมบัติเด่น)
- [สถาปัตยกรรมและโครงสร้างโค้ด](#สถาปัตยกรรมและโครงสร้างโค้ด)
- [เริ่มต้นอย่างรวดเร็ว](#เริ่มต้นอย่างรวดเร็ว)
- [ตั้งค่า Firebase](#ตั้งค่า-firebase)
- [กฎความปลอดภัย Firestore](#กฎความปลอดภัย-firestore)
- [แบบข้อมูล (Data Model)](#แบบข้อมูล-data-model)
- [กติกาการจอง](#กติกาการจอง)
- [การดีพลอย (Hosting)](#การดีพลอย-hosting)
- [การรองรับ in-app browser](#การรองรับ-inapp-browser)
- [การแก้ปัญหาเบื้องต้น](#การแก้ปัญหาเบื้องต้น)
- [สคริปต์ NPM](#สคริปต์-npm)
- [License](#license)
- [ผู้ดูแลระบบ](#ผู้ดูแลระบบ)

---

## คุณสมบัติเด่น
- 🎛️ **UI/UX ระดับโปร**: Dark theme, glass/blur, Navbar สวย, Toast แจ้งเตือนสำเร็จ/ผิดพลาดพร้อมเหตุผล
- 📱 **Responsive เต็มรูปแบบ**: รองรับ Desktop/Tablet/Mobile
- 🔐 **ยืนยันตัวตน**
  - Google Sign-In (ลอง popup ก่อน และ fallback เป็น redirect อัตโนมัติ)
  - Email/Password (รองรับ in-app browser ที่ Google ไม่ยอมให้ล็อกอิน)
- 🗓️ **กติกาการจอง**
  - จองได้เฉพาะ **วันนี้ + 2 วันถัดไป**
  - ช่วงเวลาซ้อม **ไม่เกิน 3 ชั่วโมง**
  - **ต้องเว้น 2 วัน** ก่อนจองครั้งถัดไป
  - กันเวลาทับซ้อนด้วย **สล็อต 5 นาที** + Transaction
- 📊 **ตารางรายวัน**: สรุปว่าใครจองเวลาใดในวันนั้น
- 📌 **เพิ่มลง Google Calendar** ได้ในคลิกเดียว
- 💸 **ฟรี 100%**: ใช้เฉพาะ Auth + Firestore (Spark) ไม่มีเซิร์ฟเวอร์

---

## สถาปัตยกรรมและโครงสร้างโค้ด
**Stack**: React + Vite + TypeScript · Firebase Auth · Cloud Firestore  
**ไม่มี** Cloud Functions — ตรรกะธุรกิจทำบน client ผ่าน **Firestore Transaction**

