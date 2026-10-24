// Canonical H-Global education center catalog (01/06 decision record, 2026-10-24).
// EC-001/002 are historical placeholders and MUST NOT be selectable.
export const HGLOBAL_CENTERS = Object.freeze([
  {
    "code": "EC-003",
    "name": "飛登"
  },
  {
    "code": "EC-004",
    "name": "南京"
  },
  {
    "code": "EC-005",
    "name": "自強"
  },
  {
    "code": "EC-006",
    "name": "明星"
  },
  {
    "code": "EC-007",
    "name": "民權"
  },
  {
    "code": "EC-008",
    "name": "中山"
  },
  {
    "code": "EC-009",
    "name": "桃園"
  },
  {
    "code": "EC-010",
    "name": "新竹"
  },
  {
    "code": "EC-011",
    "name": "台中"
  },
  {
    "code": "EC-012",
    "name": "彰化"
  },
  {
    "code": "EC-013",
    "name": "員林"
  },
  {
    "code": "EC-014",
    "name": "嘉義"
  },
  {
    "code": "EC-015",
    "name": "台南"
  },
  {
    "code": "EC-016",
    "name": "高雄"
  },
  {
    "code": "EC-017",
    "name": "屏東"
  },
  {
    "code": "EC-018",
    "name": "中國"
  },
  {
    "code": "EC-019",
    "name": "香港"
  },
  {
    "code": "EC-020",
    "name": "澳門"
  },
  {
    "code": "EC-021",
    "name": "日本"
  },
  {
    "code": "EC-022",
    "name": "韓國"
  },
  {
    "code": "EC-023",
    "name": "馬來西亞"
  },
  {
    "code": "EC-024",
    "name": "泰國"
  },
  {
    "code": "EC-025",
    "name": "越南"
  },
  {
    "code": "EC-026",
    "name": "印尼"
  },
  {
    "code": "EC-027",
    "name": "美國"
  },
  {
    "code": "EC-028",
    "name": "澳洲"
  },
  {
    "code": "EC-029",
    "name": "加拿大"
  },
  {
    "code": "EC-030",
    "name": "英國"
  },
  {
    "code": "EC-031",
    "name": "義大利"
  },
  {
    "code": "EC-032",
    "name": "其他"
  }
].map(v=>Object.freeze(v)));
const codes = new Set(HGLOBAL_CENTERS.map(c=>c.code));
export const isValidHglobalCenter = code => typeof code === "string" && codes.has(code);
