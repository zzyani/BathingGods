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
      { text: '복도', x: 8.0, y: 8.2 },
      { text: '보일러실', x: 9.6, y: 11.4 },
      { text: '접수대', x: 18.6, y: 14.6 },
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
      '#ggggggggggg#',
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
const K_SPOT = [20.5, 10.6]; // 5일차, 얼굴 없는 손님이 서는 자리

/* ---------- 오브젝트 ----------
 * herbs 가 있으면 약재 채집 지점, kind:'tub' 이면 탕 · scene 생략 시 메인 목욕탕
 */
const OBJECT_DEFS = [
  { id: 'tub1', kind: 'tub', x: 9, y: 1, w: 2, h: 2, label: '탕 1' },
  { id: 'tub2', kind: 'tub', x: 12, y: 1, w: 2, h: 2, label: '탕 2' },
  { id: 'tub3', kind: 'tub', x: 15, y: 1, w: 2, h: 2, label: '탕 3' },
  { id: 'tub4', kind: 'tub', x: 18, y: 1, w: 2, h: 2, label: '탕 4', requires: 'tub4' },
  { id: 'yuja', scene: 'garden', kind: 'tree', x: 1, y: 1, w: 1, h: 1, label: '유자나무', herbs: ['yuja'], pickH: 80 },
  { id: 'ssuk', scene: 'garden', kind: 'patch', x: 8, y: 2, w: 2, h: 1, label: '쑥밭', herbs: ['ssuk'], pickH: 18 },
  { id: 'pond', scene: 'garden', kind: 'pond', x: 2, y: 2, w: 3, h: 2, label: '연못', herbs: ['changpo', 'yeon'], block: false, pickH: 14 },
  { id: 'shelfA', scene: 'storage', kind: 'shelf', x: 1, y: 1, w: 1, h: 2, label: '약재 선반', herbs: ['gamcho', 'gyepi'], pickH: 64 },
  { id: 'shelfB', scene: 'storage', kind: 'shelf', x: 3, y: 1, w: 2, h: 1, label: '약재 선반', herbs: ['bakha'], pickH: 64 },
  { id: 'sulfur', kind: 'crate', x: 11, y: 10, w: 1, h: 1, label: '유황 소금 상자', herbs: ['yuhwang'], pickH: 26 },
  { id: 'furnace', kind: 'furnace', x: 9, y: 13, w: 2, h: 2, label: '보일러 가마', pickH: 90 },
  { id: 'counter', kind: 'counter', x: 16, y: 10, w: 3, h: 1, label: '접수대', pickH: 34,
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
  dislike: [['fox', 'river'], ['lantern', 'river'], ['turtle', 'rabbit'], ['fox', 'frog']],
  like: [['moss', 'turtle'], ['river', 'frog'], ['mushroom', 'moss'], ['rabbit', 'lantern']],
};
const COMPANY_TIP = 10;

/* ---------- 약재 ---------- */
const HERBS = {
  ssuk:    { name: '쑥',       short: '쑥', color: '#7da453', where: '정원(복도 왼쪽 끝 위쪽 문) 쑥밭' },
  yuja:    { name: '유자',     short: '유', color: '#e9b824', where: '정원(복도 왼쪽 끝 위쪽 문) 유자나무' },
  changpo: { name: '창포',     short: '창', color: '#5b8fc0', where: '정원(복도 왼쪽 끝 위쪽 문) 연못' },
  yeon:    { name: '연꽃',     short: '연', color: '#e88bb0', where: '정원(복도 왼쪽 끝 위쪽 문) 연못' },
  gamcho:  { name: '감초',     short: '감', color: '#c4914f', where: '약재 창고(복도 왼쪽 끝 아래쪽 문) 선반' },
  gyepi:   { name: '계피',     short: '계', color: '#a5532e', where: '약재 창고(복도 왼쪽 끝 아래쪽 문) 선반' },
  bakha:   { name: '박하',     short: '박', color: '#4fbfa8', where: '약재 창고(복도 왼쪽 끝 아래쪽 문) 선반' },
  yuhwang: { name: '유황 소금', short: '황', color: '#cfc23c', where: '보일러실 상자' },
};

/* ---------- 손님(신령) ----------
 * {temp}, {herb}, {herb_eul}(을/를 자동) 치환
 * patience: 대기 시간(초, 40~90) · bath: 목욕 시간(초, 20~50) — 기획서 v2.0 기준
 * 대기 시간은 손님을 안내(따라오기)하는 동안 멈추고, 영업 마감 후에는 다시 줄어든다.
 */
const GUEST_TYPES = {
  moss: {
    name: '이끼 노인', herb: 'ssuk', temp: [40, 42], patience: 80, bath: 40,
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
    name: '버섯 할멈', herb: 'gamcho', temp: [41, 43], patience: 75, bath: 45,
    line: '얘야, 허리가 쑤시는구나. {temp}도 물에 {herb_eul} 달여 넣어 다오.',
  },
  fox: {
    name: '여우불 아가씨', herb: 'gyepi', temp: [44, 46], patience: 60, bath: 30,
    line: '후후, 차가운 물은 질색이야. {temp}도로 뜨겁게, {herb} 향도 듬뿍.',
  },
  turtle: {
    name: '돌거북 신', herb: 'yuhwang', temp: [45, 47], patience: 85, bath: 50,
    line: '…천 년 묵은 등껍질이 굳었다. {temp}도… {herb_eul} 부탁한다.',
  },
  rabbit: {
    name: '달토끼', herb: 'bakha', temp: [38, 40], patience: 40, bath: 20,
    line: '방아를 너무 찧었더니 땀이 나요! {temp}도로 시원하게, {herb_eul} 넣어 주세요!',
  },
  frog: {
    name: '연잎 개구리 신', herb: 'yeon', temp: [39, 41], patience: 65, bath: 35,
    line: '개굴. 연못이 그리워서 왔다네. {temp}도 물에 {herb_eul} 띄워 주게, 개굴.',
  },
};

const THANKS = {
  5: ['더할 나위 없군!', '최고의 탕이야!', '다음에 또 올게요!', '몸도 마음도 개운해!'],
  4: ['아주 좋았어.', '고마워, 잘 쉬었다.', '편안했어요.'],
  3: ['나쁘지 않았어.', '그럭저럭 괜찮네.'],
  2: ['으음… 조금 아쉽군.', '다음엔 신경 써 줘.'],
  1: ['이건 내가 말한 탕이 아니야!', '…실망이다.'],
};

/* ---------- 영업일 ---------- */
const DAYS = [
  {
    title: '첫 영업', length: 190, guests: 3, twoHerb: 0,
    pool: ['moss', 'river', 'lantern'], forced: ['moss', 'river', 'lantern'], keepOrder: true,
    intro: '선배 일꾼이 말했다. "손님 말을 잘 듣고, 약재는 정원이랑 연못에서 찾아. 다 쓴 탕은 꼭 닦아 두고!"',
  },
  {
    title: '늘어나는 손님', length: 200, guests: 4, twoHerb: 0,
    pool: ['moss', 'river', 'lantern', 'mushroom', 'fox'], forced: ['mushroom', 'fox'],
    intro: '소문이 돌았는지 손님이 늘었다. 오늘은 약재 창고의 약재를 찾는 손님도 온다고 한다.',
  },
  {
    title: '검은 그림자', length: 210, guests: 5, twoHerb: 0,
    pool: ['moss', 'river', 'lantern', 'mushroom', 'fox', 'turtle', 'rabbit'], forced: ['turtle', 'rabbit'],
    clues: ['mask', 'gold'], ghost: true,
    intro: '요즘 밤마다 검은 그림자를 봤다는 일꾼들이 있다. 연못가와 창고 구석을 유심히 살펴보자. 보일러실의 유황 소금을 찾는 손님도 온다.',
  },
  {
    title: '말 없는 소문', length: 220, guests: 6, twoHerb: 0.3,
    pool: ['moss', 'river', 'lantern', 'mushroom', 'fox', 'turtle', 'rabbit', 'frog'], forced: ['frog'],
    clues: ['note', 'shadow'],
    intro: '그림자는 아무 말도 하지 않는다고 한다. 보일러실과 복도에 무언가 남아 있을지도. 오늘부터는 약재를 두 가지 찾는 까다로운 손님도 온다.',
  },
  {
    title: '얼굴 없는 손님', length: 220, guests: 5, twoHerb: 0.35,
    pool: ['moss', 'river', 'lantern', 'mushroom', 'fox', 'turtle', 'rabbit', 'frog'], forced: [],
    kaonashiAt: 0.3,
    intro: '마지막 날 밤. 안개가 짙다. 오늘, 그 손님이 찾아올 것만 같다.',
  },
];

/* ---------- 가오나시 단서 (3~4일차) ---------- */
const CLUES = {
  mask: {
    day: 3, name: '깨진 가면 조각', scene: 'garden', x: 1.5, y: 4.5, icon: 'mask',
    text: '연못가에서 하얀 가면 조각을 주웠다. 희미하게 연꽃 향이 배어 있다.',
  },
  gold: {
    day: 3, name: '흙으로 변한 금덩이', scene: 'storage', x: 1.5, y: 7.5, icon: 'gold',
    text: '창고 구석에서 반짝이던 금덩이가, 손에 쥐자 흙으로 부서졌다. 누군가 금으로 마음을 사려 했던 걸까.',
  },
  note: {
    day: 4, name: '일꾼의 쪽지', x: 8.5, y: 10.5, icon: 'note',
    text: '"검은 그림자가 머물다 간 자리는 미지근했다. 꼭 사람 체온 같았어. 37도쯤?"',
  },
  shadow: {
    day: 4, name: '외로운 그림자', x: 2.5, y: 7.5, npc: true,
    text: '복도 끝의 검은 손님은 말없이 나를 바라보다 사라졌다. 금보다… 누군가 자신을 손님으로 봐 주길 바라는 것 같았다.',
  },
};
const CLUE_ORDER = ['mask', 'gold', 'note', 'shadow'];
const CLUES_NEEDED = 3;
const KAONASHI_REQUEST = { temp: 37, herbs: ['yeon'] };
const KAONASHI_BATH = 30; // 얼굴 없는 손님 목욕 시간(초)
const CLOSING_GRACE = 150; // 영업 마감 후 남은 손님을 마무리할 수 있는 최대 시간(초, 안전장치)

const GHOST_SPOTS = [ // [x, y, 장면]
  [2.5, 8.2, 'main'], [3.5, 3.5, 'storage'], [16.5, 7.5, 'main'], [10.5, 4.6, 'main'], [3.5, 4.6, 'garden'], [9.5, 11.5, 'main'],
];

/* ---------- 업그레이드 (일과 종료 후 상점) ---------- */
const UPGRADES = [
  { id: 'sandals', name: '가벼운 짚신', desc: '이동 속도 +22%', cost: 60 },
  { id: 'firewood', name: '잘 마른 장작', desc: '탕 데우는 속도 1.6배', cost: 50 },
  { id: 'basket', name: '큰 대나무 바구니', desc: '약재 보관 3칸 → 5칸', cost: 80 },
  { id: 'incense', name: '은은한 향로', desc: '손님 인내심 +25%', cost: 70 },
  { id: 'tub4', name: '네 번째 탕', desc: '욕탕에 탕을 하나 더 놓는다', cost: 150 },
];

/* ---------- 이야기 ---------- */
const STORY_PAGES = [
  '강 건너 불빛이 하나둘 켜지는 밤.\n길을 잃은 소녀 치히로는 신들이 쉬어 가는 목욕탕에서 일하게 되었다.',
  '이곳을 찾는 손님은 모두 신령.\n저마다 좋아하는 물의 온도와 약재가 다르다.\n손님의 이야기를 잘 듣고, 목욕탕 곳곳에서 약재를 구해 와 탕을 준비하자.',
  '닷새.\n닷새 동안 손님을 정성껏 맞이하면,\n이 목욕탕의 진짜 일꾼으로 인정받을 수 있을 것이다.',
];

const RANKS = {
  S: { title: '전설의 일꾼', text: '닷새 동안 치히로의 탕을 다녀간 신들은 모두 만족스러운 얼굴로 돌아갔다. 이제 목욕탕의 누구도 그녀를 견습생이라 부르지 않는다.' },
  A: { title: '믿음직한 일꾼', text: '실수도 있었지만, 신들은 치히로의 이름을 기억하게 되었다. 선배 일꾼은 말없이 그녀의 어깨를 두드려 주었다.' },
  B: { title: '성실한 견습생', text: '서툴지만 성실했던 닷새. 치히로는 손님의 말에 귀 기울이는 법을 조금씩 배워 가고 있다.' },
  C: { title: '아직은 서툰 견습생', text: '탕은 뜨겁거나 미지근했고, 약재는 자주 바뀌었다. 그래도 치히로는 내일도 걸레를 들 것이다.' },
};

const KAONASHI_LINES = {
  gold: '얼굴 없는 손님이 건넨 금은 다음 날 아침, 한 줌의 흙으로 변해 있었다. 그는 다시 나타나지 않았다.',
  refuse: '거절당한 얼굴 없는 손님은 고개를 떨군 채 안개 속으로 사라졌다. 그가 정말 원했던 건 무엇이었을까.',
  none: '그날 밤, 접수대 앞에 서 있던 검은 손님은 아무도 모르게 사라졌다.',
  failed: '탕에서 나온 얼굴 없는 손님은 조용히 고개를 숙이고 떠났다. 무언가 조금, 어긋나 있었던 것 같다.',
};

const SPECIAL_ENDING = [
  '연꽃 향이 피어오르는 미지근한 물. 사람의 체온과 같은 온도에 몸을 담근 얼굴 없는 손님은, 한참 동안 아무 말도 하지 않았다.',
  '이윽고 가면 아래에서 작은 목소리가 흘러나왔다.\n「……따뜻해. ……고마워.」',
  '그는 더 이상 금을 내밀지 않았다. 대신 연못가에서 꺾어 온 연꽃 한 송이를 치히로의 손에 쥐여 주고, 천천히 안개 너머로 걸어갔다.',
  '그에게 필요했던 건 금이 아니라, 자신을 손님으로 맞아 주는 단 한 사람이었다.',
];

/* ---------- 에셋 교체용 매니페스트 ----------
 * AI 제작 이미지를 쓰려면 여기에 등록하세요. 없으면 도형으로 그립니다.
 * key: 'chihiro' | 'kaonashi' | 손님 타입(moss, fox …) | 오브젝트 kind(tree, shelf, furnace, counter, crate, patch)
 * ax, ay: 이미지 안의 기준점(0~1). 캐릭터는 발밑, 오브젝트는 바닥 중앙.
 * 예) chihiro: { src: 'assets/chihiro.png', w: 48, h: 64, ax: 0.5, ay: 0.95 },
 */
const ASSET_MANIFEST = {
};
