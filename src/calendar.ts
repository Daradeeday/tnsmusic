
function pad(n:number){ return String(n).padStart(2,'0') }
function toUTCString(d:Date){ return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z` }
export function buildGCalUrl(bandName:string,start:Date,end:Date){
  const text = encodeURIComponent(`ซ้อมดนตรี: ${bandName}`)
  const details = encodeURIComponent('จองผ่านระบบห้องซ้อม')
  const dates = `${toUTCString(start)}/${toUTCString(end)}`
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&sf=true&output=xml`
}
