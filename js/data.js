'use strict';
/* =========================================================
 * 신들의 손님맞이 — 게임 데이터
 * 기획 수치(밸런스·텍스트·맵)는 전부 이 파일에서 조정합니다.
 * ========================================================= */

const TILE_W = 64;
const TILE_H = 32;

const OPEN_HOUR = 18;   // 영업 시작 18:00
const CLOSE_HOUR = 26;  // 영업 종료 02:00
const BATH_TIME = 30;   // 기본 목욕 시간(초) — 손님별 값은 GUEST_TYPES.bath
const CLEAN_TIME = 1.6; // 탕 청소 시간(초)
const GATHER_TIME = 0.8; // 약재 채집 시간(초) — 게이지가 다 차야 바구니에 들어간다
const START_TEMP = 34;  // 물을 처음 받았을 때 온도

/* ---------- 맵 (장면 3개) ----------
 * 메인 목욕탕 ↔ 탐험 구역(정원, 약재 창고)은 문으로 이어지며, 문을 지나면 장면이 전환된다.
 * 탕·접수대·보일러실이 있는 목욕탕 → 약재까지 편도 약 4~6초.
 * 정원·약재 창고의 빈 바닥은 앞으로 추가할 채집 지점(탕 재료)을 놓을 자리.
 *
 * #: 벽  (공백): 바깥(그리지 않음)  ~: 연못  D: 정문(손님 전용)
 * G/S/M: 구역 이동 문 (정원 / 약재 창고 / 목욕탕으로)
 * g: 정원  s: 욕탕·돌길  .: 복도(마루)  w: 약재 창고  b: 보일러실  r: 접수대(다다미)
 */
const SCENES = {
  main: {
    name: '목욕탕',
    rows: [
      '       ################',
      '       #ssssssssssssss#',
      '       #ssssssssssssss#',
      '       #ssssssssssssss#',
      '       #ssssssssssssss#',
      '       #ssssssssssssss#',
      '###G####..............#',
      '#.....................#',
      '#.....................#',
      '#####S###b##rrrrrrrrrr#',
      '       #bbbb#rrrrrrrrr#',
      '       #bbbb#rrrrrrrrr#',
      '       #bbbb#rrrrrrrrrD',
      '       #bbbb#rrrrrrrrr#',
      '       #bbbb#rrrrrrrrr#',
      '       ################',
    ],
    portals: {
      G: { to: 'garden', at: [6.5, 8.3], label: '정원', orient: 'x' },
      S: { to: 'storage', at: [5.5, 8.3], label: '약재 창고', orient: 'x' },
    },
    labels: [
      { text: '욕탕', x: 14.6, y: 5.0 },
      // 앞쪽 벽(높이 46)·가마·방석과 앉은 손님에 가리지 않는 빈 바닥에 둔다
      { text: '복도', x: 17.0, y: 7.5 },
      { text: '보일러실', x: 9.75, y: 10.85 },
      { text: '접수대', x: 20.2, y: 13.2 },
    ],
    // 벽 등롱 (벽면 아래 모서리 기준 좌표, wall: 붙어 있는 벽 타일)
    lanterns: [
      { x: 10.5, y: 1, wall: [10, 0] }, { x: 13.5, y: 1, wall: [13, 0] }, { x: 16.5, y: 1, wall: [16, 0] },
      { x: 19.5, y: 1, wall: [19, 0] }, { x: 1, y: 8, wall: [0, 7] },
    ],
  },
  garden: {
    name: '정원',
    rows: [
      '#############',
      '#ggggggggggg#',
      '#g~~~ggggggg#',
      '#g~~~ggggggg#',
      '#g~~~ggggggg#',   // 연못 그림이 정사각이라 3×3
      '#ggggggggggg#',
      '#ggggggggggg#',
      '#ggggggggggg#',
      '#ggggggggggg#',
      '######M######',
    ],
    portals: { M: { to: 'main', at: [3.5, 7.4], label: '목욕탕', orient: 'x' } },
    labels: [{ text: '정원', x: 6.5, y: 6.6 }],
    lanterns: [{ x: 3.5, y: 1, wall: [3, 0] }, { x: 8.5, y: 1, wall: [8, 0] }, { x: 1, y: 4.5, wall: [0, 4] }],
  },
  storage: {
    name: '약재 창고',
    rows: [
      '############',
      '#wwwwwwwwww#',
      '#wwwwwwwwww#',
      '#wwwwwwwwww#',
      '#wwwwwwwwww#',
      '#wwwwwwwwww#',
      '#wwwwwwwwww#',
      '#wwwwwwwwww#',
      '#wwwwwwwwww#',
      '#####M######',
    ],
    portals: { M: { to: 'main', at: [5.5, 8.0], label: '목욕탕', orient: 'x' } },
    labels: [{ text: '약재 창고', x: 5.6, y: 5.6 }],
    lanterns: [{ x: 5.5, y: 1, wall: [5, 0] }, { x: 8.5, y: 1, wall: [8, 0] }, { x: 1, y: 3.5, wall: [0, 3] }, { x: 1, y: 6.5, wall: [0, 6] }],
  },
};
for (const sc of Object.values(SCENES)) { sc.w = sc.rows[0].length; sc.h = sc.rows.length; }

// 메인 목욕탕 기준 값 (손님은 항상 메인 목욕탕에만 있음)
const MAP_ROWS = SCENES.main.rows;
const MAP_W = SCENES.main.w;
const MAP_H = SCENES.main.h;
const DOOR = { x: 22, y: 12 };
const PLAYER_START = { x: 15.5, y: 8.0 };
const SCENE_FADE = 0.3; // 장면 전환 페이드 시간(초, 나가기/들어오기 각각)

// 손님 대기석
const QUEUE_SPOTS = [
  [15.5, 12.5], [16.5, 12.5], [17.5, 12.5], [18.5, 12.5],
  [15.5, 13.6], [16.5, 13.6], [17.5, 13.6], [18.5, 13.6],
];
const K_SPOT = [20.5, 10.6]; // 특별한 손님이 서는 자리

/* ---------- 오브젝트 ----------
 * herbs 가 있으면 약재 채집 지점, kind:'tub' 이면 탕 · scene 생략 시 메인 목욕탕
 */
const OBJECT_DEFS = [
  { id: 'tub1', kind: 'tub', x: 9, y: 1, w: 2, h: 2, label: '탕 1' },
  { id: 'tub2', kind: 'tub', x: 12, y: 1, w: 2, h: 2, label: '탕 2' },
  { id: 'tub3', kind: 'tub', x: 15, y: 1, w: 2, h: 2, label: '탕 3' },
  { id: 'tub4', kind: 'tub', x: 18, y: 1, w: 2, h: 2, label: '탕 4', requires: 'tub4' },
  { id: 'yuja', scene: 'garden', kind: 'tree', x: 1, y: 1, w: 1, h: 1, label: '유자나무', herbs: ['yuja'], pickH: 84 },
  { id: 'ssuk', scene: 'garden', kind: 'patch', x: 8, y: 2, w: 2, h: 1, label: '쑥밭', herbs: ['ssuk'], pickH: 28, asset: 'patch_ssuk' },
  { id: 'pond', scene: 'garden', kind: 'pond', x: 2, y: 2, w: 3, h: 3, label: '연못', herbs: ['changpo', 'yeon'], block: false, pickH: 30 },
  { id: 'shelfA', scene: 'storage', kind: 'shelf', x: 1, y: 1, w: 1, h: 3, label: '약재 선반', herbs: ['gamcho', 'gyepi'], pickH: 110, asset: 'shelf_a' },
  { id: 'gukhwa', scene: 'garden', kind: 'patch', x: 8, y: 6, w: 2, h: 1, label: '국화밭', herbs: ['gukhwa'], pickH: 28, flower: '#f0a92e', asset: 'patch_gukhwa' },
  { id: 'pine', scene: 'garden', kind: 'pine', x: 6, y: 1, w: 1, h: 1, label: '소나무', herbs: ['solip'], pickH: 100 },
  { id: 'jars', scene: 'storage', kind: 'jar', x: 7, y: 1, w: 2, h: 1, label: '대추 항아리', herbs: ['daechu'], pickH: 50 },
  { id: 'ginger', scene: 'storage', kind: 'basket', x: 10, y: 4, w: 1, h: 1, label: '생강 바구니', herbs: ['saenggang'], pickH: 40 },
  { id: 'shelfB', scene: 'storage', kind: 'shelf', x: 3, y: 1, w: 3, h: 1, label: '약재 선반', herbs: ['bakha'], pickH: 90, asset: 'shelf_b' },
  { id: 'sulfur', kind: 'crate', x: 8, y: 10, w: 1, h: 1, label: '유황 소금 상자', herbs: ['yuhwang'], pickH: 34 },
  { id: 'furnace', kind: 'furnace', x: 9, y: 13, w: 2, h: 2, label: '보일러 가마', pickH: 110 },
  { id: 'counter', kind: 'counter', x: 16, y: 10, w: 3, h: 1, label: '접수대', pickH: 40,
    flavor: '오늘의 손님 명부. 손님은 접수대 앞 방석에서 기다린다.' },
];

/* ---------- 탕 온도 변화 · 보일러 ---------- */
const TUB_COOL_RATE = 1 / 12;  // 물을 받은 탕은 12초에 1°C씩 식는다
const TUB_MIN_TEMP = 30;       // 식어도 이 아래로는 내려가지 않음
const TEMP_OFF_MARGIN = 1.5;   // 목욕 중 요청 온도에서 이만큼 벗어나면 손님이 불평
const BOILER = {
  maxFuel: 100,   // 장작 가득
  heatDrain: 4,   // 불 지피는 동안 초당 소모량
  idleDrain: 0.12, // 가만히 있어도 초당 소모량
  lowSpeed: 0.35, // 장작이 떨어지면 가열 속도 배율
  refuelTime: 1.2, // 장작 넣는 시간(초)
  warnAt: 25,     // 이 아래로 떨어지면 경고
};

/* ---------- 손님 궁합 ----------
 * 옆 탕에서 함께 목욕하면 효과 발생
 * dislike: 둘 다 별점 −1 · like: 둘 다 팁 +COMPANY_TIP냥
 */
const TUB_NEIGHBORS = { tub1: ['tub2'], tub2: ['tub1', 'tub3'], tub3: ['tub2', 'tub4'], tub4: ['tub3'] }; // 탕은 한 줄로 배치
const GUEST_RELATIONS = {
  dislike: [['fox', 'river'], ['lantern', 'river'], ['turtle', 'rabbit'], ['fox', 'frog'], ['snow', 'fox'], ['snow', 'lantern'], ['dokkaebi', 'crane']],
  like: [['moss', 'turtle'], ['river', 'frog'], ['mushroom', 'moss'], ['rabbit', 'lantern'], ['crane', 'turtle'], ['butterfly', 'frog'], ['dokkaebi', 'lantern']],
};
const COMPANY_TIP = 10;

/* ---------- 약재 ---------- */
/* icon: 약재 아이콘 이미지(정사각 투명 PNG). 있으면 글자 배지 대신 그림으로 표시 */
const HERBS = {
  ssuk:    { name: '쑥',       short: '쑥', color: '#7da453', where: '정원(복도 끝 오른쪽 문) 쑥밭', icon: 'assets/herbs/ssuk.png' },
  yuja:    { name: '유자',     short: '유', color: '#e9b824', where: '정원(복도 끝 오른쪽 문) 유자나무', icon: 'assets/herbs/yuja.png' },
  changpo: { name: '창포',     short: '창', color: '#5b8fc0', where: '정원(복도 끝 오른쪽 문) 연못', icon: 'assets/herbs/changpo.png' },
  yeon:    { name: '연꽃',     short: '연', color: '#e88bb0', where: '정원(복도 끝 오른쪽 문) 연못', icon: 'assets/herbs/yeon.png' },
  gamcho:  { name: '감초',     short: '감', color: '#c4914f', where: '약재 창고(복도 끝 왼쪽 문) 선반', icon: 'assets/herbs/gamcho.png' },
  gyepi:   { name: '계피',     short: '계', color: '#a5532e', where: '약재 창고(복도 끝 왼쪽 문) 선반', icon: 'assets/herbs/gyepi.png' },
  bakha:   { name: '박하',     short: '박', color: '#4fbfa8', where: '약재 창고(복도 끝 왼쪽 문) 선반', icon: 'assets/herbs/bakha.png' },
  yuhwang: { name: '유황 소금', short: '황', color: '#cfc23c', where: '보일러실 상자', icon: 'assets/herbs/yuhwang.png' },
  gukhwa:  { name: '국화',     short: '국', color: '#f0a92e', where: '정원(복도 끝 오른쪽 문) 국화밭', icon: 'assets/herbs/gukhwa.png' },
  solip:   { name: '솔잎',     short: '솔', color: '#2f6b45', where: '정원(복도 끝 오른쪽 문) 소나무', icon: 'assets/herbs/solip.png' },
  daechu:  { name: '대추',     short: '대', color: '#9b2d2d', where: '약재 창고(복도 끝 왼쪽 문) 항아리', icon: 'assets/herbs/daechu.png' },
  saenggang: { name: '생강',   short: '생', color: '#d98c3a', where: '약재 창고(복도 끝 왼쪽 문) 바구니', icon: 'assets/herbs/saenggang.png' },
};

/* ---------- 손님(신령) ----------
 * {temp}, {herb}, {herb_eul}(을/를 자동) 치환
 * herb: 주로 찾는 약재 · alt: 가끔 대신 찾는 약재 (주문마다 무작위)
 * patience: 대기 시간(초, 40~90) · bath: 목욕 시간(초, 20~50) — 기획서 v2.0 기준
 * 대기 시간은 손님을 안내(따라오기)하는 동안 멈추고, 영업 마감 후에는 다시 줄어든다.
 */
const GUEST_TYPES = {
  moss: {
    name: '이끼 노인', herb: 'ssuk', alt: ['solip'], temp: [40, 42], patience: 80, bath: 40,
    line: '허허, 비에 젖은 이끼가 영 무겁구먼. {temp}도쯤 되는 물에 {herb_eul} 띄워 주겠나?',
  },
  lantern: {
    name: '등롱 요괴', herb: 'yuja', temp: [43, 45], patience: 70, bath: 30,
    line: '불씨가 꺼질 것 같아… {temp}도의 뜨끈한 물, 그리고 상큼한 {herb} 향이 필요해!',
  },
  river: {
    name: '강물 정령', herb: 'changpo', temp: [38, 40], patience: 90, bath: 20,
    line: '흘러온 길이 너무 길었어요. {temp}도 정도로 미지근하게, {herb_eul} 넣어 주세요.',
  },
  mushroom: {
    name: '버섯 할멈', herb: 'gamcho', alt: ['daechu'], temp: [41, 43], patience: 75, bath: 45,
    line: '얘야, 허리가 쑤시는구나. {temp}도 물에 {herb_eul} 달여 넣어 다오.',
  },
  fox: {
    name: '여우불 아가씨', herb: 'gyepi', alt: ['saenggang'], temp: [44, 46], patience: 60, bath: 30,
    line: '후후, 차가운 물은 질색이야. {temp}도로 뜨겁게, {herb} 향도 듬뿍.',
  },
  turtle: {
    name: '돌거북 신', herb: 'yuhwang', temp: [45, 47], patience: 85, bath: 50,
    line: '…천 년 묵은 등껍질이 굳었다. {temp}도… {herb_eul} 부탁한다.',
  },
  rabbit: {
    name: '달토끼', herb: 'bakha', alt: ['gukhwa'], temp: [38, 40], patience: 40, bath: 20,
    line: '방아를 너무 찧었더니 땀이 나요! {temp}도로 시원하게, {herb_eul} 넣어 주세요!',
  },
  frog: {
    name: '연잎 개구리 신', herb: 'yeon', temp: [39, 41], patience: 65, bath: 35,
    line: '개굴. 연못이 그리워서 왔다네. {temp}도 물에 {herb_eul} 띄워 주게, 개굴.',
  },
  butterfly: {
    name: '호랑나비 아씨', herb: 'gukhwa', alt: ['yuja'], temp: [39, 41], patience: 70, bath: 30,
    line: '꽃밭을 너무 오래 날았더니 날개가 무거워요. {temp}도쯤 되는 물에 {herb_eul} 띄워 주실래요?',
  },
  crane: {
    name: '학 선인', herb: 'solip', alt: ['ssuk'], temp: [42, 44], patience: 85, bath: 45,
    line: '흠, 천 리를 날아왔네. {temp}도의 물에 {herb} 향을 더해 주게. 솔바람이 그립구먼.',
  },
  dokkaebi: {
    name: '방망이 도깨비', herb: 'daechu', alt: ['gyepi'], temp: [44, 46], patience: 55, bath: 25,
    line: '뚝딱! 오늘 씨름에서 이겼으니 뜨끈하게 몸 좀 지져야지. {temp}도에 {herb_eul} 팍팍!',
  },
  snow: {
    name: '눈꽃 정령', herb: 'saenggang', alt: ['yuhwang'], temp: [46, 48], patience: 75, bath: 35,
    line: '추, 추워요… 조금 녹아도 괜찮으니까 {temp}도로 아주 뜨겁게, {herb_eul} 넣어 주세요.',
  },
};

const THANKS = {
  5: ['더할 나위 없군!', '최고의 탕이야!', '다음에 또 올게요!', '몸도 마음도 개운해!'],
  4: ['아주 좋았어.', '고마워, 잘 쉬었다.', '편안했어요.'],
  3: ['나쁘지 않았어.', '그럭저럭 괜찮네.'],
  2: ['으음… 조금 아쉽군.', '다음엔 신경 써 줘.'],
  1: ['이건 내가 말한 탕이 아니야!', '…실망이다.'],
};

/* ---------- 특별한 손님 ----------
 * 한 번에 한 분씩 찾아온다. 이틀 동안 목욕탕 곳곳에 단서(하루 2개씩, 총 4개)를 남기고, 사흘째 밤에 방문.
 * 그 손님의 단서를 CLUES_NEEDED개 이상 모았으면 손님으로 맞이할 수 있고, 단서가 알려 준 탕을 준비하면 선물을 남긴다.
 * 손님이 다녀가면 다음 날부터 다음 특별한 손님의 단서가 나타난다. 마지막 손님(얼굴 없는 손님)의 결과로 엔딩이 갈린다.
 */
const SPECIAL_START = 2; // 첫 특별한 손님의 단서가 나오는 날
const SPECIAL_ORDER = ['riverGod', 'spiderElder', 'sansin', 'imugi', 'kaonashi'];
const SPECIALS = {
  riverGod: {
    name: '강의 신', alias: '진흙 손님', h: 55, bathY: 20,
    request: { temp: 39, herbs: ['changpo'] }, bath: 35, reward: 80,
    days: [
      { title: '물비린내', intro: '오늘 밤은 어쩐지 강물 냄새가 난다.\n정원과 창고 어딘가에 누군가 다녀간 흔적이 있을지도.' },
      { title: '젖은 발자국', intro: '욕탕 바닥에 물기가 마르지 않는다.\n누군가 먼 길을 걸어오고 있는 것 같다.' },
      { title: '강의 신', intro: '물안개가 문턱까지 밀려왔다.\n오늘, 진흙 손님이 찾아올 것만 같다.' },
    ],
    arrive: '…… 물비린내와 함께, 진흙투성이 손님이 들어왔다.',
    greet: '「…먼 길을 왔소. 강이 더러워져 몸이 무겁구려.」\n진흙을 뒤집어쓴 손님이 지친 얼굴로 서 있다.',
    thanks: '「…몸이 한결 가볍구려. 강물 소리가 다시 들리오.」',
    sad: '「…….」 진흙 손님은 말없이 물안개 속으로 돌아갔다.',
    gift: { id: 'cool', name: '맑은 물방울', desc: '탕이 천천히 식는다 (식는 속도 −30%)' },
  },
  spiderElder: {
    name: '거미 할아범', alias: '실 잣는 손님', h: 52, bathY: 16,
    request: { temp: 44, herbs: ['gamcho'] }, bath: 30, reward: 80,
    days: [
      { title: '은빛 실', intro: '창고 선반 사이에 은실이 반짝인다.\n보일러실 구석도 살펴보자.' },
      { title: '천장의 기척', intro: '천장 쪽에서 사각사각 실 잣는 소리가 난다.\n정원과 창고를 둘러보자.' },
      { title: '거미 할아범', intro: '오늘 밤, 실을 타고 누군가 내려올 것 같다.' },
    ],
    arrive: '…… 천장에서 실을 타고, 거미 할아범이 내려왔다.',
    greet: '「허허, 실 잣다가 내려왔네. 뜨끈한 물에 몸 좀 지질 수 있겠나?」\n등불 지팡이를 짚은 할아범이 여덟 다리를 꼼지락거리며 웃는다.',
    thanks: '「어이쿠, 시원하다! 허리가 다 펴지는구먼.」',
    sad: '「허허… 다음에 또 오지.」 할아범은 실을 타고 천장으로 올라갔다.',
    gift: { id: 'basket', name: '튼튼한 거미줄 끈', desc: '바구니에 약재를 한 칸 더 담을 수 있다' },
  },
  sansin: {
    name: '산신 할머니', alias: '산에서 온 손님', h: 55, bathY: 20,
    request: { temp: 45, herbs: ['solip'] }, bath: 35, reward: 90,
    days: [
      { title: '솔방울', intro: '산바람이 담장을 넘어 불어온다.\n정원의 소나무 근처와 복도를 살펴보자.' },
      { title: '산에서 온 편지', intro: '누군가 산에서 편지를 보냈다는 소문이 돈다.\n창고와 정원을 둘러보자.' },
      { title: '산신 할머니', intro: '멀리서 호랑이 울음소리가 들렸다.\n오늘, 산에서 손님이 내려올 것 같다.' },
    ],
    arrive: '…… 산바람과 함께, 새끼 호랑이를 데리고 온 할머니가 들어왔다.',
    greet: '「산 아래 목욕탕에 정성이 깃들었다길래 내려와 봤지. 어디, 솜씨 좀 볼까?」\n흰 머리의 할머니가 지팡이를 짚고 서 있다.',
    thanks: '「호호, 산바람이 다 녹는구나. 정성이 갸륵하다.」',
    sad: '「그래, 오늘은 바쁜가 보구나.」 할머니는 호랑이와 함께 산으로 돌아갔다.',
    gift: { id: 'patience', name: '산신의 부적', desc: '손님들이 조금 더 느긋하게 기다린다 (인내심 +15%)' },
  },
  imugi: {
    name: '구름 이무기', alias: '구름 속 손님', h: 62, bathY: 18,
    request: { temp: 41, herbs: ['bakha'] }, bath: 35, reward: 90,
    days: [
      { title: '남빛 비늘', intro: '맑은 밤인데 목욕탕 안에만 옅은 안개가 낀다.\n정원 구석과 창고를 살펴보자.' },
      { title: '하늘에 띄운 소원', intro: '천장을 따라 무언가 기다란 것이 지나갔다는 이야기가 있다.\n욕탕과 복도를 살펴보자.' },
      { title: '구름 이무기', intro: '오늘 밤, 구름을 타고 손님이 찾아올 것 같다.' },
    ],
    arrive: '…… 구름을 타고, 기다란 이무기가 스르륵 들어왔다.',
    greet: '「…천 년을 기다렸어요. 하늘로 오르기 전에, 몸을 정갈히 하고 싶어서…」\n여의주를 품은 이무기가 구름 위에 몸을 동그랗게 말고 있다.',
    thanks: '「몸이 가벼워요… 이제 하늘에 오를 수 있을 것 같아요!」',
    sad: '「…아직은 때가 아닌가 봐요.」 이무기는 구름 속으로 숨어 버렸다.',
    gift: { id: 'fuel', name: '구름 구슬', desc: '보일러 장작이 천천히 닳는다 (소모 −30%)' },
  },
  kaonashi: {
    name: '얼굴 없는 손님', alias: '검은 그림자', h: 66, bathY: 24,
    request: { temp: 37, herbs: ['yeon'] }, bath: 30, reward: 0,
    days: [
      { title: '검은 그림자', intro: '요즘 밤마다 검은 그림자를 봤다는 일꾼들이 있다.\n연못가와 창고 구석을 유심히 살펴보자.' },
      { title: '말 없는 소문', intro: '그림자는 아무 말도 하지 않는다고 한다.\n보일러실과 복도에 무언가 남아 있을지도.' },
      { title: '얼굴 없는 손님', intro: '마지막 날 밤. 안개가 짙다.\n오늘, 그 손님이 찾아올 것만 같다.' },
    ],
    arrive: '…… 안개와 함께, 얼굴 없는 손님이 들어왔다.',
    // 얼굴 없는 손님은 금 / 거절 / 맞이하기 선택지가 따로 있다 (game.js kaonashiDialog)
    thanks: '「……따뜻해. 고마워.」',
    sad: '「……」',
    gift: null,
  },
};

/* 단서 — guest: 특별한 손님, phase: 0이면 첫째 날, 1이면 둘째 날. npc: 다가가 말을 거는 그림자 단서 */
const CLUES = {
  // 강의 신
  reed: { guest: 'riverGod', phase: 0, name: '낯선 갈대 다발', scene: 'garden', x: 5.5, y: 3.5, icon: 'reed', img: 'assets/clues/reed.png',
    text: '연못가에 강에서나 자라는 굵은 갈대가 한 다발 놓여 있다. 창포 냄새가 짙게 배어 있다.' },
  scale: { guest: 'riverGod', phase: 0, name: '은빛 비늘', scene: 'storage', x: 6.5, y: 6.5, icon: 'scale', img: 'assets/clues/scale.png',
    text: '창고 바닥에 손바닥만 한 은빛 비늘이 떨어져 있다.\n"강물이 제일 좋을 때는 39도쯤이지." 비늘을 본 선배 일꾼이 중얼거렸다.' },
  wetprint: { guest: 'riverGod', phase: 1, name: '젖은 발자국', x: 11.5, y: 4.5, icon: 'print', img: 'assets/clues/wetprint.png',
    text: '욕탕 바닥에 물기 어린 발자국이 줄지어 있다. 발자국마다 작은 조약돌이 하나씩. 누군가 아주 먼 길을 걸어온 모양이다.' },
  riverShadow: { guest: 'riverGod', phase: 1, name: '진흙투성이 그림자', x: 12.5, y: 7.5, npc: true,
    meet: { text: '……\n(복도에 진흙을 뒤집어쓴 손님이 서 있다. 발밑에 흙탕물이 고인다.)', button: '저기… 길을 잃으셨어요?' },
    text: '진흙 손님은 "강이 더러워져 쉴 곳을 찾고 있소…"라고 말하고 물안개처럼 흩어졌다. 몹시 지쳐 보였다.' },
  // 거미 할아범
  thread: { guest: 'spiderElder', phase: 0, name: '반짝이는 거미줄', scene: 'storage', x: 9.5, y: 7.5, icon: 'thread', img: 'assets/clues/thread.png',
    text: '창고 선반 사이에 은실 같은 거미줄이 쳐져 있다. 거미줄 끝에 작은 쪽지가 매달려 있다.\n"뼈마디가 쑤시니 뜨끈하게, 44도."' },
  spool: { guest: 'spiderElder', phase: 0, name: '작은 실타래', x: 10.5, y: 10.5, icon: 'spool', img: 'assets/clues/spool.png', upright: true,
    text: '보일러실 구석에서 손톱만 한 실타래를 주웠다. 가마 옆 따뜻한 자리를 좋아하는 누군가가 두고 간 것 같다.' },
  wrapper: { guest: 'spiderElder', phase: 1, name: '감초 사탕 껍질', scene: 'garden', x: 11.5, y: 7.5, icon: 'wrapper', img: 'assets/clues/wrapper.png',
    text: '정원 바위 위에 감초 사탕 껍질이 잔뜩 쌓여 있다. 감초처럼 달큰한 것을 무척 좋아하는 손님인가 보다.' },
  spiderShadow: { guest: 'spiderElder', phase: 1, name: '여덟 다리 그림자', scene: 'storage', x: 5.5, y: 4.5, npc: true,
    meet: { text: '……\n(천장에서 실을 타고 동그란 그림자가 내려왔다.)', button: '안녕하세요…?' },
    text: '동그란 거미 노인이 꾸벅 인사했다. "허허, 실 잣느라 허리가 남아나질 않는구먼." 그러고는 다시 천장으로 올라가 버렸다.' },
  // 산신 할머니
  pinecone: { guest: 'sansin', phase: 0, name: '솔방울 세 개', scene: 'garden', x: 6.6, y: 2.5, icon: 'pinecone', img: 'assets/clues/pinecone.png', upright: true,
    text: '소나무 아래 솔방울 세 개가 가지런히 놓여 있다. 누군가 솔잎 향을 찾아 이곳에 들른 것 같다.' },
  fur: { guest: 'sansin', phase: 0, name: '줄무늬 털 뭉치', x: 4.5, y: 7.5, icon: 'fur', img: 'assets/clues/fur.png',
    text: '복도에 주황빛 줄무늬 털 뭉치가 떨어져 있다. 커다란 고양이…일까? 아니면…' },
  mountainLetter: { guest: 'sansin', phase: 1, name: '산에서 온 편지', scene: 'storage', x: 2.5, y: 5.5, icon: 'note', img: 'assets/clues/mountainLetter.png',
    text: '"산바람에 몸이 식었으니 뜨겁게, 45도로 데워 주게. — 산 위에 사는 이가"' },
  sansinShadow: { guest: 'sansin', phase: 1, name: '흰 머리의 노인', scene: 'garden', x: 6.5, y: 7.5, npc: true,
    meet: { text: '……\n(정원에 흰 머리를 길게 늘어뜨린 노인이 지팡이를 짚고 서 있다.)', button: '어르신, 어떻게 오셨어요?' },
    text: '노인의 발치에서 새끼 호랑이가 꼬리를 흔들었다. "정성 있는 아이에겐 복을 주지." 노인은 웃으며 바람처럼 사라졌다.' },
  // 구름 이무기
  cloudScale: { guest: 'imugi', phase: 0, name: '남빛 비늘', scene: 'garden', x: 11.5, y: 1.5, icon: 'cloud', img: 'assets/clues/cloudScale.png',
    text: '정원 구석에 금빛 무늬가 새겨진 남빛 비늘이 떨어져 있다. 손에 올리자 스르르 안개가 되어 사라졌다. 수줍음이 많은 손님 같다.' },
  mintMist: { guest: 'imugi', phase: 0, name: '박하 향 안개', scene: 'storage', x: 8.5, y: 3.5, icon: 'mint', img: 'assets/clues/mintMist.png', upright: true,
    text: '창고 안에 박하 향이 섞인 안개가 낮게 깔려 있다. 안개가 지나간 자리에 박하 잎이 몇 장 흩어져 있다.' },
  wish: { guest: 'imugi', phase: 1, name: '하늘에 띄운 소원', x: 20.5, y: 5.5, icon: 'note', img: 'assets/clues/wish.png',
    text: '욕탕 창가에 소원지가 걸려 있다.\n"용이 되기 전에 몸을 정갈히 하고 싶어요. 너무 뜨거우면 구름이 흩어지니 41도로."' },
  imugiShadow: { guest: 'imugi', phase: 1, name: '긴 그림자', x: 19.5, y: 7.5, npc: true,
    meet: { text: '……\n(복도 천장을 따라 기다란 그림자가 스르륵 움직인다.)', button: '거기 누구 있어요?' },
    text: '여의주를 품은 이무기가 부끄러운 듯 고개를 숨겼다. "천 년을 기다렸는데… 아직 용이 못 됐어요."' },
  // 얼굴 없는 손님
  mask: { guest: 'kaonashi', phase: 0, name: '깨진 가면 조각', scene: 'garden', x: 1.5, y: 4.5, icon: 'mask', img: 'assets/clues/mask.png',
    text: '연못가에서 하얀 가면 조각을 주웠다. 희미하게 연꽃 향이 배어 있다.' },
  gold: { guest: 'kaonashi', phase: 0, name: '흙으로 변한 금덩이', scene: 'storage', x: 1.5, y: 7.5, icon: 'gold', img: 'assets/clues/gold.png', upright: true,
    text: '창고 구석에서 반짝이던 금덩이가, 손에 쥐자 흙으로 부서졌다. 누군가 금으로 마음을 사려 했던 걸까.' },
  note: { guest: 'kaonashi', phase: 1, name: '일꾼의 쪽지', x: 8.5, y: 10.5, icon: 'note', img: 'assets/clues/note.png',
    text: '"검은 그림자가 머물다 간 자리는 미지근했다. 꼭 사람 체온 같았어. 37도쯤?"' },
  shadow: { guest: 'kaonashi', phase: 1, name: '외로운 그림자', x: 2.5, y: 7.5, npc: true,
    meet: { text: '……\n(복도 끝의 검은 손님이 가만히 이쪽을 바라보고 있다.)', button: '저기… 괜찮으세요?' },
    text: '복도 끝의 검은 손님은 말없이 나를 바라보다 사라졌다. 금보다… 누군가 자신을 손님으로 봐 주길 바라는 것 같았다.' },
};
const CLUES_NEEDED = 3;
const CLOSING_GRACE = 150; // 영업 마감 후 남은 손님을 마무리할 수 있는 최대 시간(초, 안전장치)

function specialSchedule(id) {
  const d0 = SPECIAL_START + SPECIAL_ORDER.indexOf(id) * 3;
  return { clueDays: [d0, d0 + 1], visit: d0 + 2 };
}
function cluesOf(id) { return Object.keys(CLUES).filter(k => CLUES[k].guest === id); }
function clueDay(id) { return specialSchedule(CLUES[id].guest).clueDays[CLUES[id].phase]; }
// 이 날 단서를 모으거나 방문하는 특별한 손님 (없으면 null)
function specialOfDay(day) {
  if (day < SPECIAL_START) return null;
  return SPECIAL_ORDER[Math.floor((day - SPECIAL_START) / 3)] || null;
}

/* ---------- 영업일 ----------
 * 1일차는 연습, 이후 특별한 손님 한 분당 사흘(단서 이틀 + 방문). 손님 구성은 날이 갈수록 늘어난다.
 */
const POOL_A = ['moss', 'river', 'lantern'];
const POOL_B = [...POOL_A, 'mushroom', 'fox', 'crane'];
const POOL_C = [...POOL_B, 'turtle', 'rabbit', 'butterfly'];
const POOL_D = [...POOL_C, 'frog', 'dokkaebi', 'snow'];
const NEWCOMERS = {
  2: { forced: ['mushroom', 'fox'], note: '손님이 늘었다. 오늘은 약재 창고의 약재를 찾는 손님도 온다.' },
  3: { forced: ['turtle', 'rabbit', 'butterfly'], note: '보일러실의 유황 소금을 찾는 손님과,\n정원의 국화를 좋아하는 나비 손님도 온다.' },
  5: { forced: ['frog', 'dokkaebi', 'snow'], note: '오늘부터는 약재를 두 가지 찾는 까다로운 손님,\n추위를 타는 눈꽃 정령과 시끌벅적한 도깨비도 온다.' },
};
function makeDay(day) {
  if (day === 1) {
    return {
      title: '첫 영업', length: 190, guests: 3, twoHerb: 0,
      pool: POOL_A, forced: ['river', 'moss', 'lantern'], keepOrder: true,   // 첫 손님은 가장 느긋한 강물 정령
      intro: '선배 일꾼이 말했다. "손님 말을 잘 듣고, 약재는 정원이랑 연못에서 찾아.\n다 쓴 탕은 꼭 닦아 두고!"',
    };
  }
  const late = day >= 11;
  const cfg = {
    title: '', intro: '',
    length: day < 3 ? 200 : day < 5 ? 210 : late ? 230 : 220,
    guests: day < 3 ? 4 : day < 5 ? 5 : late ? 7 : 6,
    twoHerb: day < 5 ? 0 : Math.min(0.45, 0.25 + (day - 5) * 0.02),
    pool: day < 3 ? POOL_B : day < 5 ? POOL_C : POOL_D,
    forced: NEWCOMERS[day] ? NEWCOMERS[day].forced : [],
  };
  const sid = specialOfDay(day);
  if (sid) {
    const phase = (day - SPECIAL_START) % 3, sd = SPECIALS[sid].days[phase];
    cfg.title = sd.title; cfg.intro = sd.intro;
    if (phase < 2) cfg.clues = cluesOf(sid).filter(k => CLUES[k].phase === phase);
    else { cfg.special = sid; cfg.specialAt = 0.3; cfg.guests -= 1; }
    if (sid === 'kaonashi' && phase === 0) cfg.ghost = true;
  }
  if (NEWCOMERS[day]) cfg.intro += '\n' + NEWCOMERS[day].note;
  return cfg;
}
const DAY_COUNT = SPECIAL_START - 1 + SPECIAL_ORDER.length * 3; // 16일
const DAYS = Array.from({ length: DAY_COUNT }, (_, k) => makeDay(k + 1));

const GHOST_SPOTS = [ // [x, y, 장면]
  [2.5, 8.2, 'main'], [3.5, 3.5, 'storage'], [16.5, 7.5, 'main'], [10.5, 4.6, 'main'], [6.5, 5.8, 'garden'], [9.5, 11.5, 'main'],
];

/* ---------- 업그레이드 (일과 종료 후 상점) ----------
 * line: 같은 줄의 물건은 단계(lv) 순서대로 하나씩 산다 — 상점에는 줄마다 다음 단계 하나만 보인다.
 * 효과 수치는 줄 단위로 game.js 의 upLv(line)·UP_FX 가 읽는다. 다 사려면 약 4,250냥 (16일 동안 벌 수 있는 돈 ≈ 3,500~4,500냥)
 * id 는 예전 저장과 맞추려고 1단계에 원래 이름(sandals·firewood·basket·incense·tub4)을 그대로 둔다 */
const UPGRADES = [
  { id: 'sandals',   line: 'speed',  lv: 1, name: '가벼운 짚신',     desc: '이동 속도 +12%', cost: 60 },
  { id: 'sandals2',  line: 'speed',  lv: 2, name: '날랜 버선',       desc: '이동 속도 +24%', cost: 200 },
  { id: 'sandals3',  line: 'speed',  lv: 3, name: '바람결 나막신',   desc: '이동 속도 +36%', cost: 420 },
  { id: 'firewood',  line: 'heat',   lv: 1, name: '잘 마른 장작',     desc: '탕 데우는 속도 1.3배', cost: 50 },
  { id: 'firewood2', line: 'heat',   lv: 2, name: '참나무 장작',     desc: '탕 데우는 속도 1.6배', cost: 180 },
  { id: 'firewood3', line: 'heat',   lv: 3, name: '백탄 숯',         desc: '탕 데우는 속도 1.9배', cost: 400 },
  { id: 'basket',    line: 'bag',    lv: 1, name: '대나무 바구니',   desc: '약재 보관 3칸 → 4칸', cost: 90 },
  { id: 'basket2',   line: 'bag',    lv: 2, name: '큰 대나무 바구니', desc: '약재 보관 4칸 → 5칸', cost: 280 },
  { id: 'incense',   line: 'calm',   lv: 1, name: '은은한 향로',     desc: '손님 인내심 +15%', cost: 70 },
  { id: 'incense2',  line: 'calm',   lv: 2, name: '백단향',         desc: '손님 인내심 +30%', cost: 240 },
  { id: 'incense3',  line: 'calm',   lv: 3, name: '신목 향',         desc: '손님 인내심 +45%', cost: 450 },
  { id: 'gloves',    line: 'gather', lv: 1, name: '채집 장갑',       desc: '약재 채집 시간 −35%', cost: 150 },
  { id: 'mop',       line: 'clean',  lv: 1, name: '새 대걸레',       desc: '탕 청소 시간 −40%', cost: 140 },
  { id: 'bellows',   line: 'fuel',   lv: 1, name: '보일러 풀무',     desc: '보일러 장작 소모 −25% · 장작 넣기 빨라짐', cost: 160 },
  { id: 'bellows2',  line: 'fuel',   lv: 2, name: '무쇠 보일러 문',  desc: '보일러 장작 소모 −45% · 장작 넣기 더 빨라짐', cost: 360 },
  { id: 'lid',       line: 'warm',   lv: 1, name: '편백나무 탕 뚜껑', desc: '손님이 없는 탕이 천천히 식는다 (식는 속도 −35%)', cost: 220 },
  { id: 'tub4',      line: 'tub',    lv: 1, name: '네 번째 탕',      desc: '욕탕에 탕을 하나 더 놓는다', cost: 400 },
  { id: 'tea',       line: 'tea',    lv: 1, name: '보리차 다과상',   desc: '목욕을 마친 손님이 내는 돈 +25%', cost: 380 },
];
const UP_LINES = [...new Set(UPGRADES.map(u => u.line))];

/* ---------- 이야기 ---------- */
const STORY_PAGES = [
  '강 건너 불빛이 하나둘 켜지는 밤.\n길을 잃은 소녀 치히로는 신들이 쉬어 가는\n목욕탕에서 일하게 되었다.',
  '이곳을 찾는 손님은 모두 신령.\n저마다 좋아하는 물의 온도와 약재가 다르다.\n손님의 이야기를 잘 듣고,\n목욕탕 곳곳에서 약재를 구해 와 탕을 준비하자.',
  '손님 한 분 한 분을 정성껏 맞이하면,\n언젠가 이 목욕탕의 진짜 일꾼으로\n인정받을 수 있을 것이다.',
];

const RANKS = {
  S: { title: '전설의 일꾼', text: '치히로의 탕을 다녀간 신들은 모두 만족스러운 얼굴로 돌아갔다. 이제 목욕탕의 누구도 그녀를 견습생이라 부르지 않는다.' },
  A: { title: '믿음직한 일꾼', text: '실수도 있었지만, 신들은 치히로의 이름을 기억하게 되었다. 선배 일꾼은 말없이 그녀의 어깨를 두드려 주었다.' },
  B: { title: '성실한 견습생', text: '서툴지만 성실했던 날들. 치히로는 손님의 말에 귀 기울이는 법을 조금씩 배워 가고 있다.' },
  C: { title: '아직은 서툰 견습생', text: '탕은 뜨겁거나 미지근했고, 약재는 자주 바뀌었다. 그래도 치히로는 내일도 걸레를 들 것이다.' },
};

const KAONASHI_LINES = {
  gold: '얼굴 없는 손님이 건넨 금은 다음 날 아침, 한 줌의 흙으로 변해 있었다. 그는 다시 나타나지 않았다.',
  refuse: '거절당한 얼굴 없는 손님은 고개를 떨군 채 안개 속으로 사라졌다. 그가 정말 원했던 건 무엇이었을까.',
  none: '그날 밤, 접수대 앞에 서 있던 검은 손님은 아무도 모르게 사라졌다.',
  failed: '탕에서 나온 얼굴 없는 손님은 조용히 고개를 숙이고 떠났다. 무언가 조금, 어긋나 있었던 것 같다.',
};

/* ---------- 엔딩 ----------
 * 특별한 손님 5명 중 몇 명을 잘 모셨는지(맞는 탕으로 대접해 선물을 받았는지)에 따라 6가지 엔딩.
 * 문구의 {names} 는 모신 손님 이름, {gifts} 는 받은 선물 이름으로 바뀐다.
 * 뒤에 은/는·이/가 같은 조사를 붙일 땐 {names|은} {gifts|이} 처럼 쓰면 받침에 맞춰 바뀐다. */
const ENDING_TYPES = ['h0', 'h1', 'h2', 'h3', 'h4', 'h5'];
const ENDING_INFO = {
  h0: { tag: '엔딩 · 선물 0개', title: '빈 선반',
    hint: '특별한 손님을 한 명도 모시지 못한 채 마지막 날을 마치면.',
    text: ['16일의 손님맞이가 끝났다. 접수대 뒤 선반은 처음 그대로 비어 있다.',
      '먼 길을 온 특별한 손님들은 모두 말없이 돌아갔다. 무엇을 원했는지, 끝내 알 수 없었다.',
      '그래도 탕의 물은 오늘도 따뜻하다. 다음에 그들이 찾아온다면, 이번엔 꼭 맞는 탕을 준비하자.'] },
  h1: { tag: '엔딩 · 선물 1개', title: '작은 인연 하나',
    hint: '특별한 손님 한 명을 잘 모시고 마지막 날을 마치면.',
    text: ['16일의 손님맞이가 끝났다. 선반 위에는 {gifts|이} 홀로 놓여 있다.',
      '{names|만이} 치히로의 탕에서 지친 몸을 녹이고 갔다. 다른 손님들의 단서는 아직 수첩 속에 잠들어 있다.',
      '작은 인연 하나. 그래도 그 하나가 목욕탕의 밤을 조금 밝혀 주었다.'] },
  h2: { tag: '엔딩 · 선물 2개', title: '두 개의 선물',
    hint: '특별한 손님 두 명을 잘 모시고 마지막 날을 마치면.',
    text: ['16일의 손님맞이가 끝났다. 선반 위에 {gifts|이} 나란히 놓였다.',
      '{names|은} 고마운 마음을 남기고 떠났다. 하지만 나머지 손님들은 맞는 탕을 만나지 못했다.',
      '두 개의 선물을 닦으며 치히로는 수첩을 다시 펼친다. 놓친 단서가 어딘가 있었을 것이다.'] },
  h3: { tag: '엔딩 · 선물 3개', title: '세 개의 선물',
    hint: '특별한 손님 세 명을 잘 모시고 마지막 날을 마치면.',
    text: ['16일의 손님맞이가 끝났다. 선반 위에 {gifts|이} 놓였다.',
      '{names|은} 치히로의 탕에서 몸을 녹이고 고마움을 남겼다. 하지만 그 뒤로 찾아온 손님들은 끝내 맞는 탕을 만나지 못했다.',
      '반쯤 채운 선반을 바라보며 치히로는 생각한다. 다음엔, 모두를.'] },
  h4: { tag: '엔딩 · 선물 4개', title: '거의 다 채운 선반',
    hint: '특별한 손님 네 명을 잘 모시고 마지막 날을 마치면.',
    text: ['16일의 손님맞이가 끝났다. 선반 위에 {gifts|이} 놓였다.',
      '{names|은} 저마다의 선물을 두고 떠났다. 선반에는 단 한 자리만이 비어 있다.',
      '목욕탕의 일꾼들은 이제 치히로를 견습생이라 부르지 않는다. 남은 한 자리는, 언젠가 채워질 것이다.'] },
  h5: { tag: '엔딩 · 선물 5개', title: '모든 손님의 미소',
    hint: '특별한 손님 다섯 명을 모두 잘 모시고 마지막 날을 마치면.',
    text: ['16일의 손님맞이가 끝났다. 선반 위에 다섯 손님의 선물이 모두 놓였다.',
      '맑은 물방울은 탕을 오래 데우고, 거미줄 끈은 바구니를 단단히 묶고, 산신의 부적과 구름 구슬은 밤마다 은은하게 빛난다. 그리고 그 가운데, 시들지 않는 연꽃 한 송이.',
      '강에서, 산에서, 구름 위에서, 그리고 아무도 맞아 주지 않던 어둠 속에서 찾아온 손님들. 그들 모두가 치히로의 탕에서 웃으며 돌아갔다.',
      '목욕탕의 등불이 하나둘 꺼지는 새벽, 치히로는 처음으로 자신이 이곳의 일꾼이라는 것이 자랑스러웠다.'] },
};
// 얼굴 없는 손님은 선물 효과가 없어서, 엔딩 선반에만 놓이는 선물
// 엔딩 일러스트 그림 (16:9). 없는 엔딩은 render.js endingArt 의 코드 그림(밤하늘·목욕탕 실루엣)
const ENDING_ART = {
  h0: 'assets/endings/ending_h0.webp',   // 빈 선반 — 다리 밑에서 혼자 주먹밥을 먹는 치히로
  h1: 'assets/endings/ending_h1.webp',   // 작은 인연 하나 — 손님이 남기고 간 빛나는 복주머니
  h2: 'assets/endings/ending_h2.webp',   // 두 개의 선물 — 거미 할아범·강의 신과 함께 웃는 저녁
  h3: 'assets/endings/ending_h3.webp',   // 세 개의 선물 — 거미 할아범·산신 할머니와 벚꽃 아래 잔칫상
  h4: 'assets/endings/ending_h4.webp',   // 거의 다 채운 선반 — 거미 할아범·산신 할머니와 언덕에 앉아 하늘의 용을 바라봄
  h5: 'assets/endings/ending_h5.webp',   // 모든 손님의 미소 — 구름을 타고 떠나는 손님들에게 손 흔들기
};
const KAONASHI_GIFT = { name: '연꽃 한 송이', desc: '금 대신 건넨 마음' };
const KAONASHI_HEALED_LINE = '마지막 밤, 얼굴 없는 손님은 더 이상 금을 내밀지 않았다. 대신 연꽃 한 송이를 치히로의 손에 쥐여 주고 안개 너머로 걸어갔다.';
const RANK_ORDER = ['S', 'A', 'B', 'C'];


/* ---------- 에셋 교체용 매니페스트 ----------
 * AI 제작 이미지를 쓰려면 여기에 등록하세요. 없으면 도형으로 그립니다.
 * key: 'chihiro' | 'kaonashi' | 손님 타입(moss, fox …) | 오브젝트 kind(tree, pine, patch, shelf, jar, basket, crate, furnace, counter)
 * 타이틀 배경: title_bg (1600×900, 글자 없는 그림) — 예) title_bg: { src: 'assets/title_bg.webp' }
 * ax, ay: 이미지 안의 기준점(0~1). 캐릭터는 발밑, 오브젝트는 바닥 중앙.
 * 예) chihiro: { src: 'assets/chihiro.png', w: 48, h: 64, ax: 0.5, ay: 0.95 },
 * 스프라이트 시트: sheet: { fw, fh, anims: { 이름: { row, seq: [프레임 번호…], fps } } }, scale 로 그릴 크기 조절
 */
const ASSET_MANIFEST = {
  title_bg: { src: 'assets/title/title_bg.webp' },
  // 바닥 타일: 64×32 마름모 투명 PNG (파일은 2배) — render.js 의 FLOOR_IMG 로 맵 기호와 연결
  floor_wood: { src: 'assets/tiles/floor_wood.png' },   // 밝은 나무 마루 ('.' 복도·탕 앞, 'D' 입구)
  floor_wood_dark: { src: 'assets/tiles/floor_wood_dark.png' },   // 어두운 나무 마루 ('w' 약재 창고)
  floor_stone: { src: 'assets/tiles/floor_stone.png' },   // 회색 돌바닥 ('s' 탕 구역)
  floor_tatami: { src: 'assets/tiles/floor_tatami.png' },   // 다다미 ('r' 접수 구역)
  floor_boiler: { src: 'assets/tiles/floor_boiler.png' },   // 어두운 돌판 ('b' 보일러실)
  floor_grass1: { src: 'assets/tiles/floor_grass1.png' },   // 풀밭 2종을 칸마다 섞음 ('g' 정원)
  floor_grass2: { src: 'assets/tiles/floor_grass2.png' },
  // 벽: 4칸짜리 무늬 띠 (칸당 64×148, 2배) — y축 벽면용 wall_r, x축 벽면용 좌우 반전 wall_l
  // 구역 이동 문: 받은 그림을 좌우 반전(x축 벽)하고 기울여 2:1에 맞춤 · 키 = 'door_' + 가는 곳
  door_garden: { src: 'assets/objects/door_garden.png', w: 45, h: 83, ax: 0.860, ay: 0.998 },    // 정원으로 (솔 무늬 노렌·석등)
  door_storage: { src: 'assets/objects/door_storage.png', w: 40, h: 73, ax: 0.891, ay: 0.997 },  // 약재 창고로 (잎 간판·약재 주머니)
  door_main: { src: 'assets/objects/door_main.png', w: 40, h: 74, ax: 0.893, ay: 0.997 },        // 목욕탕으로 (♨ 간판·수건)
  tub_empty: { src: 'assets/objects/tub_empty.png', w: 131, h: 82, ax: 0.497, ay: 0.398 },   // 빈 나무 탕 2×2 (기준점 = 테두리 윗면 가운데) · 물·손님은 코드로 그 위에
  cushion: { src: 'assets/objects/cushion.png', w: 59.5, h: 35, ax: 0.499, ay: 0.424 },   // 대기석 방석 (윗면 네 꼭짓점을 바닥 마름모에 맞춰 변형, 바닥 층에 그림)
  gate: { src: 'assets/objects/gate.png', w: 42, h: 78, ax: 0.126, ay: 0.997 },   // 손님 입구 (♨ 노렌 문, 기준점 = 아래쪽 기둥 밑동) · 각도를 바닥 2:1에 맞춰 기울임
  wall_lantern: { src: 'assets/objects/wall_lantern.png', w: 22, h: 46, ax: 0.870, ay: 0.149 },   // 벽 등롱 (기준점 = 벽판)
  wall_r: { src: 'assets/tiles/wall_r.png', slices: 4 },
  wall_l: { src: 'assets/tiles/wall_l.png', slices: 4 },
  // 맨 앞 잘린 낮은 벽(높이 14): 칸마다 한 장 (양끝 기둥 + 종이 판)
  wall_low_r: { src: 'assets/tiles/wall_low_r.png' },
  wall_low_l: { src: 'assets/tiles/wall_low_l.png' },
  // 오브젝트: 종류(kind) 키로 등록하면 코드 그림 대신 그려진다. w·h는 화면 표시 크기(파일은 2배 해상도),
  // ax·ay는 바닥 칸 가운데가 놓일 이미지 속 위치(비율)
  counter: { src: 'assets/objects/counter.png', w: 124, h: 103, ax: 0.504, ay: 0.712 },   // 접수대 3×1 (원본을 좌우 반전)
  // 쑥밭·국화밭은 같은 patch 종류라 오브젝트의 asset 값으로 그림을 나눈다 (2×1 · 원본을 좌우 반전하고 세로로 눌러 2:1 각도에 맞춤)
  patch_ssuk: { src: 'assets/objects/patch_ssuk.png', w: 105, h: 64, ax: 0.500, ay: 0.570 },
  patch_gukhwa: { src: 'assets/objects/patch_gukhwa.png', w: 105, h: 64, ax: 0.500, ay: 0.569 },
  // 약재 선반 두 개는 방향이 달라 asset 값으로 그림을 나눈다. 원본이 정면에 가까운 시점이라 기울여(전단) 2:1 각도에 맞추고, 뒷면을 벽에 붙임
  shelf_a: { src: 'assets/objects/shelf_a.png', w: 113, h: 139, ax: 0.527, ay: 0.804 },   // 왼쪽 벽 선반 1×3 (앞면이 +x 쪽) · 오른쪽 선반과 같은 앞면 폭 2.7칸
  shelf_b: { src: 'assets/objects/shelf_b.png', w: 116, h: 123, ax: 0.487, ay: 0.762 },   // 뒤쪽 벽 선반 3×1 (앞면이 +y 쪽) · 세로는 누르지 않고 기울이기만 함
  jar: { src: 'assets/objects/jar.png', w: 104, h: 75, ax: 0.499, ay: 0.773 },        // 대추 항아리 무리 2×1 (원본 좌우 반전: 큰 항아리를 벽이 높은 왼쪽으로 · 벽에 걸치지 않게 조금 앞으로)
  basket: { src: 'assets/objects/basket.png', w: 80, h: 65, ax: 0.500, ay: 0.865 },   // 생강 바구니 무리 1×1 (칸 양옆으로 조금 넘침)
  pond_water: { src: 'assets/objects/pond_water.png' },   // 연못 그림의 물 영역 마스크 (물결 효과를 이 안에만 그림)
  pond: { src: 'assets/objects/pond.png', w: 193, h: 104, ax: 0.499, ay: 0.539 },   // 정원 연못 3×3 (석등·대나무 물길 포함) · 있으면 코드 연못(pondDecor) 대신
  tree: { src: 'assets/objects/tree.png', w: 81, h: 84, ax: 0.510, ay: 0.940, shadow: 24, sway: 2.6 },   // 유자나무 1×1 · 기준점은 줄기 밑동 · sway: 바람에 꼭대기가 흔들리는 폭(px)
  pine: { src: 'assets/objects/pine.png', w: 91, h: 106, ax: 0.466, ay: 0.944, shadow: 24, sway: 2.2 },   // 소나무 1×1
  crate: { src: 'assets/objects/crate.png', w: 56, h: 42, ax: 0.499, ay: 0.671 },   // 유황 소금 상자 1×1 (원본 30° 시점을 세로로 눌러 바닥 2:1 각도에 맞춤)
  furnace: { src: 'assets/objects/furnace.png', w: 127, h: 175, ax: 0.485, ay: 0.821 },   // 보일러 가마 2×2 (원본의 장작더미는 지움) · 불구멍 연출은 render.js furnaceFire
  // 플레이어: 91×114 칸, 1줄 대기(눈 깜빡임) · 2줄 걷기 8프레임 · 3줄 앉아서 작업
  // 걷기 프레임은 모두 대기 0번의 머리를 그대로 붙여 씀 (걸을 때 머리 크기가 바뀌지 않게)
  chihiro: {
    src: 'assets/chars/chihiro.png', ax: 0.4954, ay: 105 / 114, scale: 0.52,
    sheet: {
      fw: 91, fh: 114,
      anims: {
        idle:  { row: 0, seq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 2, 1], fps: 8 },
        // 걷기: 보폭 프레임과 발 모은 프레임을 번갈아 → 한 발짝마다 리듬이 생김.
        // fps 대신 perTile(이동 1칸당 프레임 수)로 실제 걸은 거리에 맞춰 넘김 → 발 미끄러짐 방지
        walk:  { row: 1, seq: [1, 2, 6, 4, 5, 0], perTile: 4.5 },
        kneel: { row: 2, seq: [0, 1, 2, 3, 4, 5], fps: 8 },
      },
    },
  },
  // 대화창 초상화용 원본 해상도 주인공 (게임 시트는 절반 크기라 키우면 흐려짐)
  chihiro_portrait: { src: 'assets/chars/chihiro_portrait.png' },
  // 특별한 손님: 1줄 대기 · 2줄 이동 6프레임 · 3줄 탕 속(셋째 칸은 기뻐하는 얼굴)
  // 같은 3줄 형식의 시트를 assets/chars/<손님id>.png 로 넣고 한 줄 추가하면 도형 대신 그려진다
  riverGod: specialSheet('riverGod', 180, 125, 0.5973, 121, 0.54, 4, 24, { walk: 1.2, bath: 0.8 }),
  spiderElder: specialSheet('spiderElder', 181, 139, 0.5914, 135, 0.5, 4, 26, { walk: 1.15, bath: 0.8 }),
  sansin: specialSheet('sansin', 134, 108, 0.4723, 103, 0.6, 4, 20, { walk: 1.05, bath: 0.9 }),
  imugi: specialSheet('imugi', 130, 119, 0.5472, 110, 0.59, 4, 24, { walk: 1.5, bath: 0.8 }),
  kaonashi: specialSheet('kaonashi', 144, 154, 0.5322, 150, 0.455, 3, 18),
  // 일반 손님도 같은 3줄 형식 시트를 쓸 수 있다 (h: 초상화 크기 맞춤용 키)
  moss: { ...specialSheet('moss', 164, 148, 0.4728, 143, 0.33, 4, 11, { walk: 1.12, bath: 0.78 }), h: 44 },   // 이끼 노인
  // 등롱 요괴: 떠다니는 손님이라 float(px)만큼 바닥에서 띄우고 살짝 오르내린다
  lantern: { ...specialSheet('lantern', 161, 135, 0.5553, 131, 0.32, 4, 14), h: 42, float: 7 },
  fox: { ...specialSheet('fox', 178, 120, 0.489, 116, 0.38, 4, 14), h: 42 },   // 여우불 아가씨
  river: { ...specialSheet('river', 177, 134, 0.4534, 118, 0.42, 4, 12), h: 42, float: 6 },   // 강물 정령 (떠다님)
  mushroom: { ...specialSheet('mushroom', 139, 144, 0.4658, 140, 0.32, 3, 5), h: 44 },   // 버섯 할멈
  turtle: { ...specialSheet('turtle', 178, 138, 0.4247, 133, 0.38, 3, 14, { walk: 1.2, bath: 0.9 }), h: 46 },   // 돌거북 신
  rabbit: { ...specialSheet('rabbit', 146, 165, 0.4828, 158, 0.29, 3, 14, { walk: 1.2, bath: 0.92 }), h: 44 },   // 달토끼
  crane: { ...specialSheet('crane', 113, 150, 0.4304, 146, 0.36, 3, 16, { walk: 1.13, bath: 0.9, walkN: 7, bathN: 5, happy: 3 }), h: 48 },   // 학 선인
  frog: { ...specialSheet('frog', 144, 156, 0.5133, 152, 0.31, 3, 14, { walk: 1.15, bath: 0.93, walkN: 7 }), h: 44 },   // 연잎 개구리 신
  butterfly: { ...specialSheet('butterfly', 132, 159, 0.498, 155, 0.30, 3, 14, { walk: 1.07, bath: 0.95, bathN: 5 }), h: 44, float: 5 },   // 호랑나비 아씨 (날갯짓하며 떠다님)
  dokkaebi: { ...specialSheet('dokkaebi', 124, 136, 0.4866, 131, 0.35, 3, 12), h: 44 },   // 방망이 도깨비
  snow: { ...specialSheet('snow', 118, 145, 0.5284, 134, 0.33, 3, 14), h: 44, float: 5 },   // 눈꽃 정령 (떠다님)
};
// 밭은 상자(_base)와 식물(_leaf) 두 층으로도 불러 둔다 — 식물만 살랑살랑 흔들기 (크기·기준점은 원래 그림과 같음)
for (const k of ['patch_ssuk', 'patch_gukhwa']) for (const sfx of ['_base', '_leaf']) ASSET_MANIFEST[k + sfx] = { ...ASSET_MANIFEST[k], src: `assets/objects/${k}${sfx}.png` };
// 약재 아이콘도 에셋으로 불러 둔다 (캔버스 말풍선·탕 태그에서 사용) — 키: herb_<약재 id>
for (const [id, h] of Object.entries(HERBS)) if (h.icon) ASSET_MANIFEST['herb_' + id] = { src: h.icon };
// 단서 그림 (CLUES[id].img) — 맵 위 단서와 단서 수첩에서 사용 · 키: clue_<단서 id>
for (const [id, c] of Object.entries(CLUES)) if (c.img) ASSET_MANIFEST['clue_' + id] = { src: c.img };
/* 특별한 손님 시트 정의: fw·fh 칸 크기, ax 기준점 가로 위치, foot 발 높이, scale 그릴 크기,
 * idleN 대기 프레임 수, bathY 탕 속에 잠기는 깊이(px),
 * size 걷기·탕 속 줄의 크기 배율 — 원본 시트에서 줄마다 그려진 크기가 달라서 대기 모습 크기에 맞춘다
 *   walkN·bathN: 걷기·탕 속 프레임 수(기본 6·4), happy: 탕 속에서 기뻐하는 칸 번호(기본 2) */
/* 탕 속 프레임 순서: 기뻐하는 칸을 뺀 나머지를 두 박자씩 오가다 끝에 기뻐하는 칸 */
function bathSeq(n, happy) {
  const rest = [...Array(n).keys()].filter(i => i !== happy);
  const loop = [...rest, ...rest.slice(1, -1).reverse()].flatMap(i => [i, i]);
  return [...loop, happy, happy, happy];
}
function specialSheet(key, fw, fh, ax, foot, scale, idleN, bathY, size = {}) {
  return {
    src: `assets/chars/${key}.png`, ax, ay: foot / fh, scale, bathY,
    sheet: {
      fw, fh,
      anims: {
        idle:    { row: 0, seq: idleN === 3 ? [0, 1, 2, 1] : [0, 1, 2, 3, 2, 1], fps: 4 },
        walk:    { row: 1, seq: [...Array(size.walkN || 6).keys()], fps: 9, scale: size.walk || 1 },
        bath:    { row: 2, seq: bathSeq(size.bathN || 4, size.happy ?? 2), fps: 3, scale: size.bath || 1 },
        bathOff: { row: 2, seq: [0, 1], fps: 2, scale: size.bath || 1 },   // 물이 차갑거나 뜨거울 때 — 웃는 얼굴 없이
      },
    },
  };
}
