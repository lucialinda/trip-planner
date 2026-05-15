#!/usr/bin/env node
/**
 * 포르투갈 & 니스 여행 — 전체 시드 스크립트
 * 멤버 4명(나라/유진/소정/성희) + 일정 + 각자 결제 내역
 *
 * 사용법 (에뮬레이터 켜진 상태에서):
 *   node scripts/seed-itinerary.mjs --reset
 */

import admin from "firebase-admin";

const PROJECT_ID = "trip-planner-2026-ec5ec";
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "localhost:8080";
admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();
const RESET = process.argv.includes("--reset");

// ── 멤버 ──────────────────────────────────────────────────────────────────────
// 나라: 현재 로그인된 DEV 계정 (실제 UID)
// 유진/소정/성희: 배포 후 실제 가입 시 uid가 바뀌므로 임시 UID 사용
const M = {
  nara:     { uid: "xdiqN6R92NbFXjf2zB8y0xdTB0Ky", name: "나라" },
  yujin:    { uid: "uid_yujin_2026_trip",            name: "유진" },
  sojeong:  { uid: "uid_sojeong_2026_trip",          name: "소정" },
  seonghui: { uid: "uid_seonghui_2026_trip",         name: "성희" },
};
const ALL_UIDS = Object.values(M).map(m => m.uid);
const ALL_PARTICIPANTS = Object.fromEntries(ALL_UIDS.map(u => [u, true]));

// ── 여행 ──────────────────────────────────────────────────────────────────────
const TRIP = {
  name: "✈️ 2026 포르투갈 & 니스",
  startDate: "2026-06-03",
  endDate:   "2026-06-13",
  code: "G6KPN7",
  members:    Object.fromEntries(Object.values(M).map(m => [m.uid, m.name])),
  memberUids: ALL_UIDS,
  createdByUid: M.nara.uid,
  heroPhotoURL: null,
  budgetPerPerson: 2500000,
};

// ── 일정 ──────────────────────────────────────────────────────────────────────
const PLACES = [
  { date:"2026-06-03", startTime:"08:10", endTime:"08:10", name:"✈️ 인천 출발 LO98 (LOT 폴란드항공)", note:"예약번호 G6KPN7" },
  { date:"2026-06-03", startTime:"14:05", endTime:"17:40", name:"🔄 바르샤바 환승", note:"LO98 도착 14:05 → LO4797 출발 17:40" },
  { date:"2026-06-03", startTime:"21:05", endTime:"22:30", name:"🛬 리스본 도착 & 숙소 이동", note:"공항→숙소 택시 미리 예약\n🏨 Calçada do Desterro 13 · 체크인 15:00" },
  { date:"2026-06-04", startTime:"09:00", endTime:"11:00", name:"🚋 28번 트램 (알파마 지구)", note:"리스본 명물 트램! 소매치기 주의" },
  { date:"2026-06-04", startTime:"11:00", endTime:"13:00", name:"🗼 벨렝탑 & 제로니무스 수도원", note:"유네스코 세계문화유산" },
  { date:"2026-06-04", startTime:"13:00", endTime:"15:00", name:"🍽️ 타임아웃 마켓 (점심)", note:"파스텔 드 나타 필수!", placeUrl:"https://www.timeoutmarket.com/lisboa/" },
  { date:"2026-06-04", startTime:"19:30", endTime:"21:00", name:"🎵 파두 공연 ✅예약완료", note:"리스보아 인 파두\n예약번호: CRY204783 · 4명 · ₩118,000 (유진 결제)" },
  { date:"2026-06-05", startTime:"09:00", endTime:"17:00", name:"🏰 신트라·호카곶 투어 ✅예약완료", note:"로맨틱 파라다이스 한국어 투어\n예약번호: EXP-20260512-00009450 · ₩636,000 (유진 결제)" },
  { date:"2026-06-06", startTime:"11:00", endTime:"11:30", name:"🏨 리스본 체크아웃", note:"⚠️ 11:00 체크아웃" },
  { date:"2026-06-06", startTime:"12:00", endTime:"15:00", name:"🚆 리스본→포르투 기차", note:"⚠️ 기차 예약 필요!" },
  { date:"2026-06-06", startTime:"15:00", endTime:"15:30", name:"🏨 포르투 체크인", note:"Rua do Campinho 18 · 키패드 입장 (나라 결제)" },
  { date:"2026-06-07", startTime:"09:00", endTime:"10:00", name:"📚 렐루 서점 ✅예약완료", note:"예약번호: 99229108 · 4명 x €12 (성희 결제)\n⚠️ 09:00 입장", placeUrl:"https://www.livrariarlello.com/" },
  { date:"2026-06-07", startTime:"10:00", endTime:"11:00", name:"⛪ 카르무 성당", note:"아줄레주 타일 외벽" },
  { date:"2026-06-07", startTime:"11:00", endTime:"12:00", name:"🗼 클레리구스 성당 & 탑" },
  { date:"2026-06-07", startTime:"12:30", endTime:"13:30", name:"🍟 포르투 맥도날드", note:"세계에서 가장 아름다운 맥도날드!" },
  { date:"2026-06-07", startTime:"14:00", endTime:"16:00", name:"🏛️ 상벤투역 & 포르투 대성당" },
  { date:"2026-06-07", startTime:"16:00", endTime:"18:00", name:"🌉 동루이스 1세 다리 & 히베이루 강변" },
  { date:"2026-06-07", startTime:"18:00", endTime:"20:00", name:"🍷 빌라 노바 데 가이아 포트와인 셀러", note:"도우루강 건너편. 시음 포함" },
  { date:"2026-06-08", startTime:"08:00", endTime:"10:00", name:"🥬 볼량 시장", note:"⚠️ 오전 일찍!" },
  { date:"2026-06-08", startTime:"10:00", endTime:"18:00", name:"🚶 포르투 자유 일정" },
  { date:"2026-06-08", startTime:"21:00", endTime:"21:00", name:"😴 일찍 취침 & 짐 싸기", note:"⚠️ 내일 04:00 출발!" },
  { date:"2026-06-09", startTime:"04:00", endTime:"04:00", name:"🚕 포르투 공항 택시 출발", note:"⚠️ 04:00 정각" },
  { date:"2026-06-09", startTime:"06:45", endTime:"09:55", name:"✈️ 포르투→니스 EJU6805" },
  { date:"2026-06-09", startTime:"10:30", endTime:"11:30", name:"🚗 니스 공항 렌터카 픽업 ✅예약완료", note:"니스 프랑스 리비에라 공항(NCE)\n푸조 3008급 · 오토 · 5인승\n⚠️ 국제운전면허증 필수!\n추가 드라이버: 배성희, 양소정\n반납: 6/11 니스 기차역 10:00\n현장결제 €336.78 (유진 결제)" },
  { date:"2026-06-09", startTime:"11:30", endTime:"14:00", name:"🚗 프로방스 드라이브 (1시간 30분)" },
  { date:"2026-06-09", startTime:"14:00", endTime:"20:00", name:"🍷 와이너리 투어 & 수영장", note:"🏨 717 route de mappe, 83510 Saint Antonin du Var\n숙소비 $419.41 (나라 결제)" },
  { date:"2026-06-10", startTime:"09:00", endTime:"09:30", name:"🏨 농가 체크아웃" },
  { date:"2026-06-10", startTime:"10:30", endTime:"12:00", name:"💧 생트크루와 호수" },
  { date:"2026-06-10", startTime:"12:00", endTime:"13:00", name:"🍽️ 무스티에 생트마리 (점심)" },
  { date:"2026-06-10", startTime:"13:00", endTime:"15:00", name:"🏔️ 베르동 협곡 드라이브", note:"유럽의 그랜드캐니언!" },
  { date:"2026-06-10", startTime:"15:00", endTime:"16:00", name:"🌿 발롱솔 라벤더 밭 (옵션)", note:"개화 미확실 — 6월 초중순" },
  { date:"2026-06-10", startTime:"18:30", endTime:"19:00", name:"🏨 니스 가리발리 체크인", note:"11 Boulevard Carnot\n체크인 16:00~ · 나라 결제 약 160만원" },
  { date:"2026-06-11", startTime:"08:00", endTime:"10:00", name:"💐 꽃시장 Cours Saleya", note:"⚠️ 오전에만 열림!" },
  { date:"2026-06-11", startTime:"10:00", endTime:"10:00", name:"🚗 렌터카 반납", note:"니스 기차역 오베르 거리 34번지 10:00" },
  { date:"2026-06-11", startTime:"10:30", endTime:"18:00", name:"🏖️ 니스 해변 자유시간" },
  { date:"2026-06-12", startTime:"10:00", endTime:"12:00", name:"🏘️ 에즈 마을", note:"⚠️ 언덕 많음 · 편한 신발!" },
  { date:"2026-06-12", startTime:"12:00", endTime:"15:00", name:"🎰 모나코", note:"카지노 광장, 왕궁" },
  { date:"2026-06-12", startTime:"15:30", endTime:"18:00", name:"🏖️ 칸(Cannes) 해변", note:"기차 30분" },
  { date:"2026-06-12", startTime:"22:00", endTime:"22:00", name:"😴 일찍 취침 & 짐 싸기", note:"⚠️ 내일 10:00 즉시 체크아웃!" },
  { date:"2026-06-13", startTime:"10:00", endTime:"10:10", name:"🚕 체크아웃 즉시 택시", note:"⚠️ 10:05 택시 예약 필수!" },
  { date:"2026-06-13", startTime:"10:40", endTime:"13:00", name:"✈️ 니스→바르샤바 LO342" },
  { date:"2026-06-13", startTime:"15:20", endTime:"15:20", name:"✈️ 바르샤바→인천 LO99", note:"익일 09:25 인천 도착 🏠" },
];

// ── 지출 ──────────────────────────────────────────────────────────────────────
// EUR 1 = 1,735원 / USD 1 = 1,350원 (달러 항목은 카드값 미확정 추정)
const EXPENSES = [
  // 유진 결제
  { category:"activity", description:"🎵 파두 공연 (CRY204783) · 4명",
    localCurrency:"KRW", localAmount:118000, rate:1, krwAmount:118000,
    paidByUid:M.yujin.uid, paidBy:M.yujin.name, status:"tentative", paidAt:daysAgo(2),
    participants:ALL_PARTICIPANTS, memo:"예약번호 CRY204783" },

  { category:"activity", description:"🏰 신트라·호카곶 한국어 투어 · 4명",
    localCurrency:"KRW", localAmount:636000, rate:1, krwAmount:636000,
    paidByUid:M.yujin.uid, paidBy:M.yujin.name, status:"tentative", paidAt:daysAgo(2),
    participants:ALL_PARTICIPANTS, memo:"예약번호 EXP-20260512-00009450" },

  { category:"transit", description:"🚗 니스 렌터카 (6/9~11) · 현장결제",
    localCurrency:"EUR", localAmount:336.78, rate:1735, krwAmount:584115,
    paidByUid:M.yujin.uid, paidBy:M.yujin.name, status:"tentative", paidAt:daysAgo(0),
    participants:ALL_PARTICIPANTS, memo:"현장결제 예정" },

  { category:"activity", description:"📚 렐루 서점 입장권 · 4명",
    localCurrency:"EUR", localAmount:48, rate:1735, krwAmount:83280,
    paidByUid:M.seonghui.uid, paidBy:M.seonghui.name, status:"tentative", paidAt:daysAgo(2),
    participants:ALL_PARTICIPANTS, memo:"예약번호 99229108 · 6/7 09:00" },

  // 나라 결제 (합계 ₩3,700,000)
  { category:"lodging", description:"포르투 숙소 (Rua do Campinho 18)",
    localCurrency:"KRW", localAmount:1500000, rate:1, krwAmount:1500000,
    paidByUid:M.nara.uid, paidBy:M.nara.name, status:"tentative", paidAt:daysAgo(5),
    participants:ALL_PARTICIPANTS, memo:"추정 금액 · 카드값 확정 후 수정 필요" },

  { category:"lodging", description:"🍷 프로방스 와이너리 숙소 (Saint Antonin du Var)",
    localCurrency:"KRW", localAmount:600000, rate:1, krwAmount:600000,
    paidByUid:M.nara.uid, paidBy:M.nara.name, status:"tentative", paidAt:daysAgo(3),
    participants:ALL_PARTICIPANTS, memo:"추정 금액 ($419.41) · 카드값 확정 후 수정 필요" },

  { category:"lodging", description:"🏨 니스 가리발리 숙소 (11 Boulevard Carnot)",
    localCurrency:"KRW", localAmount:1600000, rate:1, krwAmount:1600000,
    paidByUid:M.nara.uid, paidBy:M.nara.name, status:"tentative", paidAt:daysAgo(3),
    participants:ALL_PARTICIPANTS, memo:"추정 금액 · 카드값 확정 후 수정 필요" },

  // 소정 결제
  { category:"lodging", description:"🏨 리스본 숙소 (Calçada do Desterro 13)",
    localCurrency:"USD", localAmount:710, rate:1479, krwAmount:1050090,
    paidByUid:M.sojeong.uid, paidBy:M.sojeong.name, status:"tentative", paidAt:daysAgo(5),
    participants:ALL_PARTICIPANTS, memo:"⚠️ 달러 결제 · 카드값 확정 후 수정 필요" },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return admin.firestore.Timestamp.fromDate(d);
}

// ── 실행 ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌍 포르투갈 & 니스 전체 데이터 시드\n");
  console.log("👥 멤버 4명:");
  Object.values(M).forEach(m => console.log(`   ${m.name} (${m.uid.slice(0,12)}...)`));

  // 여행 찾기 / 생성
  const tripsSnap = await db.collection("trips")
    .where("memberUids", "array-contains", M.nara.uid).get();
  let tripId;
  if (!tripsSnap.empty) {
    tripId = tripsSnap.docs[0].id;
    await db.collection("trips").doc(tripId).update({
      name: TRIP.name, startDate: TRIP.startDate, endDate: TRIP.endDate,
      code: TRIP.code, members: TRIP.members, memberUids: TRIP.memberUids,
      budgetPerPerson: TRIP.budgetPerPerson,
    });
    console.log(`\n✅ 기존 여행 업데이트: ${tripId}`);
  } else {
    const ref = await db.collection("trips").add({
      ...TRIP, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tripId = ref.id;
    console.log(`\n✅ 새 여행 생성: ${tripId}`);
  }

  if (RESET) {
    for (const col of ["places", "expenses"]) {
      const snap = await db.collection(`trips/${tripId}/${col}`).get();
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log(`🗑️  ${col} ${snap.size}개 삭제`);
    }
  }

  // 일정
  console.log(`\n📍 일정 ${PLACES.length}개 추가 중...`);
  let order = 0;
  for (const place of PLACES) {
    await db.collection(`trips/${tripId}/places`).add({
      ...place, addedBy: M.nara.name, addedByUid: M.nara.uid,
      order: order++, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      likes: {}, dislikes: {},
    });
    process.stdout.write(".");
  }

  // 지출
  console.log(`\n\n💰 지출 ${EXPENSES.length}개 추가 중...`);
  for (const expense of EXPENSES) {
    await db.collection(`trips/${tripId}/expenses`).add({
      ...expense,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    process.stdout.write(".");
  }

  // 요약
  const totalByPayer = {};
  for (const e of EXPENSES) {
    totalByPayer[e.paidBy] = (totalByPayer[e.paidBy] ?? 0) + e.krwAmount;
  }
  const grandTotal = Object.values(totalByPayer).reduce((a, b) => a + b, 0);
  const perPerson = Math.round(grandTotal / 4);

  console.log(`\n\n📊 결제 현황`);
  console.log("─".repeat(45));
  for (const [name, amt] of Object.entries(totalByPayer)) {
    const net = amt - perPerson;
    const sign = net >= 0 ? "+" : "";
    console.log(`  ${name.padEnd(4)}: ${amt.toLocaleString().padStart(12)}원  (${sign}${net.toLocaleString()}원)`);
  }
  console.log("─".repeat(45));
  console.log(`  합계: ${grandTotal.toLocaleString()}원  1인당 ${perPerson.toLocaleString()}원`);
  console.log(`\n⚠️  달러 결제 항목은 카드값 확정 후 앱에서 직접 수정해줘요`);
  console.log(`   소정: 리스본 숙소 $710  /  나라: 와이너리 $419.41 (현재 ₩600,000으로 임시 입력)`);
  console.log(`\n✅ 완료! http://localhost:3000 에서 확인하세요\n`);
  process.exit(0);
}

main().catch(e => { console.error("❌ 오류:", e.message); process.exit(1); });
