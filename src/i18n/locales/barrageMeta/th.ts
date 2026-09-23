// Elemental Barrage meta strings ('barrageMeta' namespace: achievements, pass, collections, daily, supply drop).
// Mirrors the shape of ./en.ts — translated from English.
export default {
  'achievements': {
    'title': 'ความสำเร็จ',
    'subtitle': 'ทำเป้าหมายถาวรให้สำเร็จเพื่อรับเหรียญ',
    'claim': 'รับ',
    'claimed': 'รับแล้ว',
    'unlocked': 'ปลดล็อกความสำเร็จ!',
    'progress': '{c} / {t}',
    'items': {
      'kills100': 'ร้อยตัวแรก',
      'kills1k': 'นักล่าอสูร',
      'kills10k': 'ผู้กวาดล้าง',
      'row10': 'บุกเข้าสนามรบ',
      'row30': 'การล้อมลึก',
      'row60': 'กำแพงเหล็ก',
      'row100': 'ตำนานแห่งห้วงลึก',
      'boss1': 'ผู้ปราบยักษ์',
      'boss10': 'นักล่าบอส',
      'boss50': 'หายนะแห่งราชา',
      'merges10': 'พลังแฝด',
      'merges100': 'ปรมาจารย์การรวม',
      'merges500': 'เตาหลอมฟิวชัน',
      'tier3': 'ประกายแรก',
      'tier5': 'ธาตุผงาด',
      'tier7': 'พลังธาตุ',
      'tier9': 'พลังดึกดำบรรพ์',
      'combo25': 'กระดอน',
      'combo50': 'ปฏิกิริยาลูกโซ่',
      'combo150': 'พ่อมดพินบอล',
      'fever1': 'ไข้ขึ้น',
      'fevers25': 'สายรุ้งคลั่ง'
    },
    'desc': {
      'kills': 'อสูรที่ปราบ: {n}',
      'bestRow': 'ไปถึงแถว {n}',
      'bossKills': 'บอสที่ปราบ: {n}',
      'merges': 'การรวมลูกบอล: {n}',
      'maxBallTier': 'สร้างลูกบอลระดับ {n}',
      'bestCombo': 'จำนวนครั้งที่โดนในหนึ่งชุดยิง: {n}',
      'fevers': 'ชุดยิงฟีเวอร์: {n}'
    }
  },
  'pass': {
    'title': 'บัตรผ่าน Barrage',
    'progress': 'ขั้น {current} / {total}',
    'daysLeft': 'เหลือ {n} วัน',
    'maxed': 'บัตรผ่านครบแล้ว',
    'xpProgress': '{current} / {total} XP',
    'xpAmount': '+{n} XP',
    'howToEarn': 'วิธีรับ XP',
    'perKill': 'ต่อการกำจัด',
    'perMerge': 'ต่อการรวม',
    'perRow': 'ต่อแถว',
    'perBoss': 'ต่อบอส',
    'unlockHint': 'สะสมให้ครบ {n} XP เพื่อปลดล็อกรางวัลถัดไป — รางวัลที่ยังไม่รับจะรออยู่จนกว่าคุณจะแตะ',
    'ballReward': 'ลูกบอลระดับ {tier} ฟรี'
  },
  'collections': {
    'title': 'คอลเลกชัน',
    'launchers': 'เครื่องยิง',
    'skins': 'สกินลูกบอล',
    'buy': 'ซื้อ',
    'equip': 'สวมใส่',
    'equipped': 'สวมใส่แล้ว',
    'new': 'ใหม่!',
    'undiscovered': 'ยังไม่ค้นพบ',
    'discoverHint': 'รวมลูกบอลระดับ {tier} เพื่อค้นพบ',
    'tier': 'ระดับ {tier}',
    'rarity': {
      'common': 'ธรรมดา',
      'rare': 'หายาก',
      'epic': 'มหากาพย์',
      'legendary': 'ตำนาน'
    },
    'skinNames': {
      'orb': 'ลูกแก้ว',
      'stone': 'หิน',
      'tide': 'กระแสน้ำ',
      'gale': 'พายุ',
      'frost': 'น้ำค้างแข็ง',
      'amber': 'อำพัน',
      'lava': 'ลาวา',
      'diamond': 'เพชร',
      'obsidian': 'ออบซิเดียน',
      'glow': 'รูนเรืองแสง',
      'gilded': 'ทองคำ',
      'eclipse': 'สุริยุปราคา'
    }
  },
  'daily': {
    'title': 'Barrage ประจำวัน',
    'subtitle': 'วันนี้ทุกคนเล่นกระดานเดียวกัน คุณจะไปได้ลึกแค่ไหน?',
    'rules': 'ไม่มีอัปเกรด ไม่มีเล่นต่อ — มีแค่ฝีมือการเล็ง',
    'play': 'เล่น',
    'best': 'สถิติวันนี้: แถว {n}',
    'attempts': 'จำนวนครั้งวันนี้: {n}',
    'streak': 'เล่นต่อเนื่อง: {n} วัน',
    'newBest': 'สถิติใหม่ประจำวัน!'
  },
  'supply': {
    'title': 'หีบสมบัติ',
    'ready': 'พร้อมแล้ว!',
    'readyIn': 'ของขวัญถัดไปใน {time}',
    'biggerIn': 'ของขวัญที่ใหญ่กว่า (+{n}) ใน {time}',
    'gift': '+{n}',
    'open': 'เปิด',
    'coins': '+{n} เหรียญ',
    'bonusCharge': 'โบนัสพิเศษ: {skill}'
  }
}
