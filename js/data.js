// 영끌말판 게임 데이터 (금액 단위: 만원)
// 집값 기준: 국토교통부 아파트 매매 실거래가, 2026년 7~9월 계약분
// 지역 평균 평당가 × 전용면적(59㎡ 17.85평, 84㎡ 25.41평)으로 계산한 추정치

const REGIONS = [
  { key: 'local',   name: '지방',   ref: '청주시',   price59: 21260,  price84: 30260,  squares: 16, salary: 900,  living: 450, drift: 0.006, commute: 0, color: '#7cb342' },
  { key: 'gyeonggi',name: '경기도', ref: '수원시',   price59: 51300,  price84: 73030,  squares: 18, salary: 1400, living: 600, drift: 0.013, commute: 2, color: '#29b6f6' },
  { key: 'seoul',   name: '서울',   ref: '마포구',   price59: 119970, price84: 170780, squares: 20, salary: 1900, living: 800, drift: 0.013, commute: 1, color: '#ab47bc' },
  { key: 'gangnam', name: '강남',   ref: '강남구',   price59: 205760, price84: 292900, squares: 22, salary: 2400, living: 1000, drift: 0.014, commute: 0, color: '#ef5350' },
];

const FEATURES = {
  big:    { label: '대단지',   pct: 0.10, desc: '집값 하락 폭이 작아요' },
  school: { label: '초품아',   pct: 0.08, desc: '매 분기 가족 만족도 +1' },
  subway: { label: '역세권',   pct: 0.12, desc: '출퇴근 피로 없음, 개발 호재 2배' },
  mall:   { label: '상가 근처', pct: 0.05, desc: '휴식 효과 2배' },
  none:   { label: '구축·외곽', pct: -0.15, desc: '싸지만 오르는 폭이 작아요' },
};

// 가상 단지 (실제 단지명·브랜드 아님)
const COMPLEXES = [
  [
    { name: '햇살마을 1단지', f: ['big', 'school'] },
    { name: '시청역 센트럴', f: ['subway', 'mall'] },
    { name: '구도심 하늘아파트', f: ['none'] },
  ],
  [
    { name: '호수공원 그랑빌', f: ['big', 'school', 'mall'] },
    { name: '신도시역 파크뷰', f: ['subway'] },
    { name: '언덕위 주공3단지', f: ['none'] },
  ],
  [
    { name: '한강뷰 리버스테이', f: ['subway', 'mall'] },
    { name: '학군로 에듀힐스', f: ['school', 'big'] },
    { name: '골목안 그린맨션', f: ['none'] },
  ],
  [
    { name: '대치 에듀캐슬', f: ['school', 'big', 'subway'] },
    { name: '테헤란 스카이타워', f: ['subway', 'mall'] },
    { name: '개포 언덕마을', f: ['none'] },
  ],
];

const TILE = {
  start:  { icon: '🚩', name: '출발' },
  pay:    { icon: '💰', name: '월급날' },
  good:   { icon: '🍀', name: '호재' },
  bad:    { icon: '⚡', name: '악재' },
  news:   { icon: '📰', name: '뉴스' },
  invest: { icon: '📈', name: '투자 기회' },
  fork:   { icon: '🔀', name: '갈림길' },
  rest:   { icon: '☕', name: '휴식' },
  finish: { icon: '🏁', name: '이사 심사' },
};

// 지역별 칸 비율 (뒤로 갈수록 뉴스·악재가 많아짐)
const TILE_WEIGHTS = [
  { pay: 4, good: 4, bad: 3, news: 1, invest: 3, fork: 3, rest: 2 },
  { pay: 4, good: 4, bad: 4, news: 2, invest: 3, fork: 3, rest: 2 },
  { pay: 4, good: 4, bad: 5, news: 3, invest: 3, fork: 3, rest: 2 },
  { pay: 4, good: 3, bad: 5, news: 5, invest: 3, fork: 3, rest: 2 },
];

const BASE_RATE = 0.04;   // 기본 대출금리(연)
const BASE_LTV = 0.8;     // 영끌 한도(집값 대비 대출 비율)
const RENT_COST = 300;    // 원룸 월세(분기)
