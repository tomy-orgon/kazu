// ===== ぬりえの絵柄（20種、やさしい→むずかしい） =====
// 各絵は 0 0 300 300 の座標系。線は共通スタイル（color.css 側の .cpic g）で描く。
// level: 0=やさしい 1=ふつう 2=むずかしい
window.COLOR_PICS = [
  // ---- やさしい (7) ----
  { id:'circle',   label:'まる',   level:0,
    svg:'<circle cx="150" cy="150" r="105"/>' },
  { id:'triangle', label:'さんかく', level:0,
    svg:'<path d="M150,45 L255,240 L45,240 Z"/>' },
  { id:'square',   label:'しかく', level:0,
    svg:'<rect x="50" y="50" width="200" height="200" rx="20"/>' },
  { id:'star',     label:'ほし',   level:0,
    svg:'<polygon points="150.0,45.0 174.7,116.0 249.9,117.6 189.9,163.0 211.7,234.9 150.0,192.0 88.3,234.9 110.1,163.0 50.1,117.6 125.3,116.0"/>' },
  { id:'heart',    label:'ハート', level:0,
    svg:'<path d="M150,235 C70,175 35,120 70,80 C95,50 140,60 150,95 C160,60 205,50 230,80 C265,120 230,175 150,235 Z"/>' },
  { id:'moon',     label:'つき',   level:0,
    svg:'<path d="M175,50 A105,105 0 1,0 175,250 A78,78 0 1,1 175,50 Z"/>' },
  { id:'cloud',    label:'くも',   level:0,
    svg:'<path d="M75,195 Q40,195 40,160 Q40,128 72,124 Q75,90 115,90 Q145,62 185,90 Q222,88 228,124 Q262,128 258,162 Q258,195 220,195 Z"/>' },

  // ---- ふつう (7) ----
  { id:'sun',      label:'たいよう', level:1,
    svg:'<circle cx="150" cy="150" r="58"/>' +
        '<line x1="212.0" y1="150.0" x2="245.0" y2="150.0"/><line x1="193.8" y1="193.8" x2="217.2" y2="217.2"/>' +
        '<line x1="150.0" y1="212.0" x2="150.0" y2="245.0"/><line x1="106.2" y1="193.8" x2="82.8" y2="217.2"/>' +
        '<line x1="88.0" y1="150.0" x2="55.0" y2="150.0"/><line x1="106.2" y1="106.2" x2="82.8" y2="82.8"/>' +
        '<line x1="150.0" y1="88.0" x2="150.0" y2="55.0"/><line x1="193.8" y1="106.2" x2="217.2" y2="82.8"/>' },
  { id:'flower',   label:'はな',   level:1,
    svg:'<ellipse cx="208.0" cy="150.0" rx="28" ry="55" transform="rotate(90.0 208.0 150.0)"/>' +
        '<ellipse cx="179.0" cy="200.2" rx="28" ry="55" transform="rotate(150.0 179.0 200.2)"/>' +
        '<ellipse cx="121.0" cy="200.2" rx="28" ry="55" transform="rotate(210.0 121.0 200.2)"/>' +
        '<ellipse cx="92.0" cy="150.0" rx="28" ry="55" transform="rotate(270.0 92.0 150.0)"/>' +
        '<ellipse cx="121.0" cy="99.8" rx="28" ry="55" transform="rotate(330.0 121.0 99.8)"/>' +
        '<ellipse cx="179.0" cy="99.8" rx="28" ry="55" transform="rotate(390.0 179.0 99.8)"/>' +
        '<circle cx="150" cy="150" r="26"/>' },
  { id:'butterfly',label:'ちょう', level:1,
    svg:'<path d="M150,150 C110,90 40,90 40,140 C40,180 100,180 150,150 Z"/>' +
        '<path d="M150,150 C190,90 260,90 260,140 C260,180 200,180 150,150 Z"/>' +
        '<path d="M150,150 C120,180 80,210 90,235 C100,255 140,230 150,150 Z"/>' +
        '<path d="M150,150 C180,180 220,210 210,235 C200,255 160,230 150,150 Z"/>' +
        '<line x1="150" y1="108" x2="150" y2="225"/>' +
        '<path d="M150,112 Q138,92 128,80"/><path d="M150,112 Q162,92 172,80"/>' },
  { id:'fish',     label:'さかな', level:1,
    svg:'<ellipse cx="125" cy="150" rx="90" ry="55"/>' +
        '<path d="M210,150 L270,105 L270,195 Z"/>' +
        '<path d="M118,97 Q140,70 163,97"/>' +
        '<circle cx="82" cy="138" r="8" class="dot"/>' },
  { id:'it_ringo', label:'りんご', level:1,
    svg:'<path d="M150,95 C100,80 55,120 60,175 C64,225 105,250 150,250 C195,250 236,225 240,175 C245,120 200,80 150,95 Z"/>' +
        '<line x1="150" y1="95" x2="156" y2="62"/>' +
        '<ellipse cx="180" cy="68" rx="22" ry="11" transform="rotate(-30 180 68)"/>' },
  { id:'umbrella', label:'かさ',   level:1,
    svg:'<path d="M55,150 A95,95 0 0,1 245,150 Z"/>' +
        '<line x1="150" y1="150" x2="150" y2="225"/>' +
        '<path d="M150,225 Q150,255 120,255"/>' },
  { id:'mushroom', label:'きのこ', level:1,
    svg:'<path d="M65,150 A85,68 0 0,1 235,150 Z"/>' +
        '<rect x="120" y="150" width="60" height="85" rx="14"/>' +
        '<circle cx="115" cy="120" r="11" class="dot"/><circle cx="175" cy="110" r="9" class="dot"/>' },

  // ---- むずかしい (6) ----
  { id:'rabbit',   label:'うさぎ', level:2,
    svg:'<ellipse cx="122" cy="78" rx="20" ry="58" transform="rotate(-12 122 78)"/>' +
        '<ellipse cx="178" cy="78" rx="20" ry="58" transform="rotate(12 178 78)"/>' +
        '<circle cx="150" cy="155" r="55"/>' +
        '<ellipse cx="150" cy="240" rx="68" ry="46"/>' +
        '<circle cx="150" cy="283" r="12"/>' +
        '<circle cx="133" cy="150" r="6" class="dot"/><circle cx="167" cy="150" r="6" class="dot"/>' +
        '<circle cx="150" cy="163" r="5" class="dot"/>' },
  { id:'cat',      label:'ねこ',   level:2,
    svg:'<path d="M110,120 L95,55 L150,105 Z"/><path d="M190,120 L205,55 L150,105 Z"/>' +
        '<circle cx="150" cy="160" r="55"/>' +
        '<ellipse cx="150" cy="245" rx="65" ry="45"/>' +
        '<path d="M212,255 Q260,255 255,210 Q250,175 220,180"/>' +
        '<circle cx="133" cy="155" r="6" class="dot"/><circle cx="167" cy="155" r="6" class="dot"/>' },
  { id:'car',      label:'くるま', level:2,
    svg:'<path d="M95,170 L120,120 L195,120 L220,170 Z"/>' +
        '<line x1="157" y1="120" x2="157" y2="170"/>' +
        '<rect x="45" y="170" width="210" height="70" rx="25"/>' +
        '<circle cx="100" cy="245" r="28"/><circle cx="200" cy="245" r="28"/>' },
  { id:'house',    label:'いえ',   level:2,
    svg:'<path d="M50,140 L150,60 L250,140 Z"/>' +
        '<rect x="70" y="140" width="160" height="120" rx="6"/>' +
        '<rect x="135" y="190" width="40" height="70" rx="6"/>' +
        '<rect x="90" y="165" width="35" height="35" rx="4"/><rect x="175" y="165" width="35" height="35" rx="4"/>' },
  { id:'rocket',   label:'ロケット', level:2,
    svg:'<path d="M150,45 C130,45 118,90 118,120 L182,120 C182,90 170,45 150,45 Z"/>' +
        '<rect x="118" y="120" width="64" height="110" rx="10"/>' +
        '<circle cx="150" cy="155" r="18"/>' +
        '<path d="M118,190 L75,235 L118,225 Z"/><path d="M182,190 L225,235 L182,225 Z"/>' +
        '<path d="M132,230 Q150,270 168,230"/>' },
  { id:'cake',     label:'ケーキ', level:2,
    svg:'<rect x="60" y="190" width="180" height="70" rx="10"/>' +
        '<rect x="95" y="140" width="110" height="55" rx="10"/>' +
        '<rect x="140" y="95" width="20" height="45" rx="4"/>' +
        '<path d="M150,70 C140,85 140,95 150,95 C160,95 160,85 150,70 Z"/>' +
        '<circle cx="90" cy="225" r="8" class="dot"/><circle cx="150" cy="225" r="8" class="dot"/><circle cx="210" cy="225" r="8" class="dot"/>' },
];
