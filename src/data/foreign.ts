// ─────────────────────────────────────────────────────────────
// 외국인 모드 안내 콘텐츠
// 요금: 서울시 교통요금 안내 (2025-06-28 시행) 기준
// 기후동행카드 단기권: 서울시 교통정책 안내 기준 (1·2·3·5·7일권)
// 관광지 출구 번호는 참고용 — 현장 안내도 확인 권장
// ─────────────────────────────────────────────────────────────
import type { Lang } from './network'

type L = Record<Lang, string>
const L = (ko: string, en: string, zh: string, ja: string): L => ({ ko, en, zh, ja })

export const FARE = {
  updated: '2025-06-28',
  source: L('서울시 교통요금 안내', 'Seoul Metropolitan Government fare notice', '首尔市交通费用公告', 'ソウル市交通料金案内'),
  adultCard: 1550,
  adultSingle: 1650,
  youthCard: 900,
  child: 550,
  earlyAdult: 1240,
}

/** 거리비례 운임 (교통카드 일반): 10km까지 기본, 50km까지 5km마다 100원, 50km 초과 8km마다 100원 */
export function estimateFare(km: number, base = FARE.adultCard) {
  if (km <= 10) return base
  if (km <= 50) return base + Math.ceil((km - 10) / 5) * 100
  return base + 800 + Math.ceil((km - 50) / 8) * 100
}

export const CLIMATE_PASS = [
  { days: 1, price: 5000 },
  { days: 2, price: 8000 },
  { days: 3, price: 10000 },
  { days: 5, price: 15000 },
  { days: 7, price: 20000 },
]

export interface GuideItem {
  title: L
  body: L
}

export const CARD_GUIDE: GuideItem[] = [
  {
    title: L('티머니(T-money) 카드', 'T-money card', 'T-money卡', 'T-moneyカード'),
    body: L(
      '편의점(GS25·CU·세븐일레븐 등)과 역 내 발매기에서 구매할 수 있어요. 역 충전기나 편의점에서 충전한 뒤 개찰구에 찍으면 돼요. 지하철·버스 환승 할인이 적용돼요.',
      'Buy at convenience stores (GS25, CU, 7-Eleven, etc.) or station machines. Top up at station machines or convenience stores, then tap at the gate. Subway–bus transfer discounts apply.',
      '可在便利店(GS25、CU、7-Eleven等)或车站售票机购买。在车站充值机或便利店充值后刷卡进站。地铁与公交换乘享优惠。',
      'コンビニ(GS25・CU・セブンイレブンなど)や駅の券売機で購入できます。駅のチャージ機やコンビニでチャージして改札にタッチします。地下鉄・バスの乗換割引が適用されます。',
    ),
  },
  {
    title: L('기후동행카드 단기권 (관광객 추천)', 'Climate Card short-term pass (for visitors)', '气候同行卡短期票(推荐游客)', '気候同行カード短期券(旅行者向け)'),
    body: L(
      '1·2·3·5·7일 동안 서울 지하철과 서울시 버스를 횟수 제한 없이 이용하는 무제한 이용권이에요. 관광정보센터, 1~8호선 고객안전실, 역 인근 편의점에서 실물카드를 산 뒤 역 충전기에서 원하는 기간을 충전해요. 신분당선 등 일부 노선은 제외돼요.',
      'Unlimited rides on Seoul subway and Seoul city buses for 1, 2, 3, 5 or 7 days. Buy the card at tourist information centers, Line 1–8 station offices or nearby convenience stores, then load the pass at station machines. Some lines such as the Shinbundang Line are excluded.',
      '在1、2、3、5、7天内无限次乘坐首尔地铁和首尔市公交。可在旅游咨询中心、1~8号线客服中心或车站附近便利店购买实体卡，再在车站充值机充值所需天数。新盆唐线等部分线路除外。',
      '1・2・3・5・7日間、ソウルの地下鉄とソウル市バスが乗り放題。観光案内所、1〜8号線の駅事務室、駅近くのコンビニでカードを購入し、駅のチャージ機で期間をチャージします。新盆唐線など一部路線は対象外です。',
    ),
  },
  {
    title: L('1회용 교통카드', 'Single-journey ticket', '单程交通卡', '1回用交通カード'),
    body: L(
      '역 발매기에서 목적지를 선택해 현금으로 구입해요. 요금에 보증금 500원이 포함되며, 도착역의 보증금 환급기에 카드를 넣으면 돌려받아요.',
      'Buy at station machines by choosing your destination and paying cash. A ₩500 deposit is included; get it back by inserting the card into the deposit refund machine at your destination.',
      '在车站售票机选择目的地并用现金购买。含500韩元押金，到站后将卡插入押金退还机即可取回。',
      '駅の券売機で目的地を選び現金で購入します。保証金500ウォンが含まれ、到着駅の保証金払戻機にカードを入れると戻ります。',
    ),
  },
  {
    title: L('환승 방법', 'How transfers work', '换乘方法', '乗換の方法'),
    body: L(
      '같은 교통카드로 하차 태그 후 30분 이내(21시~다음 날 7시는 60분)에 지하철·버스를 갈아타면 환승 할인이 적용돼요. 지하철끼리는 개찰구 밖으로 나가지 않고 환승통로로 이동하면 돼요.',
      'Tap out and transfer between subway and bus within 30 minutes (60 minutes from 21:00 to 07:00) with the same card to get a transfer discount. Between subway lines, just follow the transfer passage without leaving the gates.',
      '用同一张卡下车刷卡后30分钟内(21:00至次日7:00为60分钟)换乘地铁或公交可享优惠。地铁线路间换乘无需出闸，沿换乘通道走即可。',
      '同じカードで降車タッチ後30分以内(21時〜翌7時は60分)に地下鉄・バスを乗り換えると割引が適用されます。地下鉄同士は改札を出ずに乗換通路を進みます。',
    ),
  },
  {
    title: L('이용 유의사항', 'Good to know', '注意事项', 'ご注意'),
    body: L(
      '타고 내릴 때 모두 카드를 찍어야 해요. 한 카드로 여러 명이 탈 수 없어요. 충전기는 현금만 받는 경우가 많아요.',
      'Tap your card when entering and exiting. One card per person. Many top-up machines accept cash only.',
      '进出站都要刷卡。一卡仅限一人使用。很多充值机只收现金。',
      '乗車時・降車時ともにタッチが必要です。1枚のカードで複数人は乗れません。チャージ機は現金のみの場合が多いです。',
    ),
  },
]

export interface Attraction {
  id: string
  station: string
  name: L
  kind: 'sight' | 'shopping' | 'food' | 'park'
  /** 출구 번호 — 확인된 경우에만, 없으면 현장 안내 확인 */
  exit?: string
}

export const ATTRACTIONS: Attraction[] = [
  { id: 'gyeongbok', station: '경복궁', name: L('경복궁', 'Gyeongbokgung Palace', '景福宫', '景福宮'), kind: 'sight', exit: '5' },
  { id: 'bukchon', station: '안국', name: L('북촌한옥마을', 'Bukchon Hanok Village', '北村韩屋村', '北村韓屋村'), kind: 'sight' },
  { id: 'insadong', station: '안국', name: L('인사동', 'Insadong', '仁寺洞', '仁寺洞'), kind: 'shopping' },
  { id: 'deoksu', station: '시청', name: L('덕수궁', 'Deoksugung Palace', '德寿宫', '徳寿宮') , kind: 'sight' },
  { id: 'myeongdong', station: '명동', name: L('명동 거리', 'Myeongdong Shopping Street', '明洞商业街', '明洞ショッピング街'), kind: 'shopping' },
  { id: 'ddp', station: '동대문역사문화공원', name: L('동대문디자인플라자 (DDP)', 'Dongdaemun Design Plaza (DDP)', '东大门设计广场(DDP)', '東大門デザインプラザ(DDP)'), kind: 'sight' },
  { id: 'hongdae', station: '홍대입구', name: L('홍대 거리', 'Hongdae Street', '弘大街', '弘大ストリート'), kind: 'food', exit: '9' },
  { id: 'ewha', station: '이대', name: L('이화여자대학교', 'Ewha Womans University', '梨花女子大学', '梨花女子大学'), kind: 'sight' },
  { id: 'sinchon', station: '신촌', name: L('신촌 연세로', 'Sinchon Yonsei-ro', '新村延世路', '新村延世路'), kind: 'food' },
  { id: 'lotteworld', station: '잠실', name: L('롯데월드', 'Lotte World', '乐天世界', 'ロッテワールド'), kind: 'sight' },
  { id: 'coex', station: '삼성', name: L('코엑스·별마당 도서관', 'COEX & Starfield Library', 'COEX·星空图书馆', 'COEX・ピョルマダン図書館'), kind: 'shopping' },
  { id: 'gangnam', station: '강남', name: L('강남역 거리', 'Gangnam Station area', '江南站商圈', '江南駅周辺'), kind: 'food' },
  { id: 'express', station: '고속터미널', name: L('고속터미널 지하상가 (고투몰)', 'Express Bus Terminal underground mall', '高速巴士客运站地下商街', '高速ターミナル地下街'), kind: 'shopping' },
  { id: 'seoulst', station: '서울', name: L('서울역·서울로7017', 'Seoul Station & Seoullo 7017', '首尔站·首尔路7017', 'ソウル駅・ソウルロ7017'), kind: 'sight' },
  { id: 'yeouido', station: '여의나루', name: L('여의도 한강공원', 'Yeouido Hangang Park', '汝矣岛汉江公园', '汝矣島漢江公園'), kind: 'park' },
  { id: 'seongsu', station: '성수', name: L('성수동 카페거리', 'Seongsu café street', '圣水洞咖啡街', '聖水洞カフェ通り'), kind: 'food' },
]

export const SIGNS: { ko: string; en: string; zh: string; ja: string }[] = [
  { ko: '출구', en: 'Exit', zh: '出口', ja: '出口' },
  { ko: '나가는 곳', en: 'Way out', zh: '出站口', ja: '出口(改札外)' },
  { ko: '타는 곳', en: 'Platform / Boarding', zh: '乘车处', ja: '乗り場' },
  { ko: '갈아타는 곳', en: 'Transfer', zh: '换乘处', ja: '乗換口' },
  { ko: '방면', en: 'Bound for', zh: '方向', ja: '方面' },
  { ko: '내선순환 / 외선순환', en: 'Inner / Outer circle (Line 2)', zh: '内环 / 外环(2号线)', ja: '内回り / 外回り(2号線)' },
  { ko: '상행 / 하행', en: 'Inbound / Outbound', zh: '上行 / 下行', ja: '上り / 下り' },
  { ko: '급행', en: 'Express', zh: '快车', ja: '急行' },
  { ko: '첫차 / 막차', en: 'First train / Last train', zh: '首班车 / 末班车', ja: '始発 / 終電' },
  { ko: '개찰구', en: 'Fare gate', zh: '检票口', ja: '改札口' },
  { ko: '고객안전실', en: 'Station office (help)', zh: '客服安全室', ja: '駅事務室(お客様案内)' },
  { ko: '화장실', en: 'Restroom', zh: '洗手间', ja: 'トイレ' },
  { ko: '엘리베이터', en: 'Elevator', zh: '电梯', ja: 'エレベーター' },
  { ko: '에스컬레이터', en: 'Escalator', zh: '自动扶梯', ja: 'エスカレーター' },
  { ko: '비상구', en: 'Emergency exit', zh: '紧急出口', ja: '非常口' },
  { ko: '비상벨', en: 'Emergency bell', zh: '紧急呼叫铃', ja: '非常ボタン' },
  { ko: '노약자석', en: 'Priority seating', zh: '老弱病残专座', ja: '優先席' },
  { ko: '임산부 배려석', en: 'Seat for pregnant women', zh: '孕妇专座', ja: '妊婦優先席' },
  { ko: '물품보관함', en: 'Lockers', zh: '储物柜', ja: 'コインロッカー' },
  { ko: '수유실', en: 'Nursing room', zh: '哺乳室', ja: '授乳室' },
  { ko: '승차권 발매기', en: 'Ticket machine', zh: '售票机', ja: '券売機' },
  { ko: '보증금 환급기', en: 'Deposit refund machine', zh: '押金退还机', ja: '保証金払戻機' },
  { ko: '운행 중단', en: 'Service suspended', zh: '停运', ja: '運転見合わせ' },
  { ko: '지연', en: 'Delayed', zh: '延误', ja: '遅延' },
]

export const EMERGENCY_NUMBERS = [
  { no: '112', label: L('경찰', 'Police', '警察', '警察') },
  { no: '119', label: L('화재·구급', 'Fire & ambulance', '火警·急救', '消防・救急') },
  { no: '1330', label: L('관광통역안내 (24시간 다국어)', 'Korea Travel Helpline (24h, multilingual)', '旅游咨询热线(24小时多语种)', '観光通訳案内(24時間・多言語)') },
  { no: '1577-1234', label: L('서울교통공사 고객센터', 'Seoul Metro customer center', '首尔交通公社客服中心', 'ソウル交通公社お客様センター') },
]

export const PHRASES: { ko: string; tr: L }[] = [
  { ko: '도와주세요.', tr: L('도와주세요.', 'Please help me.', '请帮帮我。', '助けてください。') },
  { ko: '역무실(고객안전실)이 어디예요?', tr: L('역무실이 어디예요?', 'Where is the station office?', '站务室在哪里？', '駅事務室はどこですか？') },
  { ko: '길을 잃었어요.', tr: L('길을 잃었어요.', 'I am lost.', '我迷路了。', '道に迷いました。') },
  { ko: '물건을 잃어버렸어요.', tr: L('물건을 잃어버렸어요.', 'I lost my belongings.', '我丢了东西。', '物をなくしました。') },
  { ko: '엘리베이터는 어디에 있어요?', tr: L('엘리베이터는 어디에 있어요?', 'Where is the elevator?', '电梯在哪里？', 'エレベーターはどこですか？') },
  { ko: '이 역에서 내려야 해요.', tr: L('이 역에서 내려야 해요.', 'I need to get off at this station.', '我要在这一站下车。', 'この駅で降りたいです。') },
  { ko: '의사가 필요해요.', tr: L('의사가 필요해요.', 'I need a doctor.', '我需要医生。', '医者が必要です。') },
]
