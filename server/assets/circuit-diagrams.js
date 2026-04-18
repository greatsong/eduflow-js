/**
 * EduFlow Circuit Diagrams
 * MkDocs용 인터랙티브 회로도 렌더링 라이브러리
 *
 * 지원 다이어그램 타입:
 *   - pico-pinout: Raspberry Pi Pico 2 WH 40핀 배치도
 *   - connection: Pico-컴포넌트 연결 회로도
 *   - sensor-module: 센서 모듈 연결 다이어그램
 *   - breadboard: 브레드보드 구조 및 부품 배치도
 *
 * 사용법: <div class="hw-diagram" data-type="pico-pinout" ...></div>
 */
(function() {
  'use strict';

  // ──────────────────────────────────────────────
  // 상수 정의
  // ──────────────────────────────────────────────

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Pico 핀 데이터 (물리 핀 번호 → 핀 정보)
  // 왼쪽 핀: 1~20 (위→아래), 오른쪽 핀: 40~21 (위→아래)
  const PICO_PINS = {
    // 왼쪽 (물리 핀 1~20)
    1:  { name: 'GP0',  gpio: 0,  type: 'gpio', alt: 'UART0 TX / I2C0 SDA / SPI0 RX' },
    2:  { name: 'GP1',  gpio: 1,  type: 'gpio', alt: 'UART0 RX / I2C0 SCL / SPI0 CSn' },
    3:  { name: 'GND',  gpio: null, type: 'gnd', alt: '접지' },
    4:  { name: 'GP2',  gpio: 2,  type: 'gpio', alt: 'I2C1 SDA / SPI0 SCK' },
    5:  { name: 'GP3',  gpio: 3,  type: 'gpio', alt: 'I2C1 SCL / SPI0 TX' },
    6:  { name: 'GP4',  gpio: 4,  type: 'gpio', alt: 'UART1 TX / I2C0 SDA / SPI0 RX' },
    7:  { name: 'GP5',  gpio: 5,  type: 'gpio', alt: 'UART1 RX / I2C0 SCL / SPI0 CSn' },
    8:  { name: 'GND',  gpio: null, type: 'gnd', alt: '접지' },
    9:  { name: 'GP6',  gpio: 6,  type: 'gpio', alt: 'I2C1 SDA / SPI0 SCK' },
    10: { name: 'GP7',  gpio: 7,  type: 'gpio', alt: 'I2C1 SCL / SPI0 TX' },
    11: { name: 'GP8',  gpio: 8,  type: 'gpio', alt: 'UART1 TX / I2C0 SDA / SPI1 RX' },
    12: { name: 'GP9',  gpio: 9,  type: 'gpio', alt: 'UART1 RX / I2C0 SCL / SPI1 CSn' },
    13: { name: 'GND',  gpio: null, type: 'gnd', alt: '접지' },
    14: { name: 'GP10', gpio: 10, type: 'gpio', alt: 'I2C1 SDA / SPI1 SCK' },
    15: { name: 'GP11', gpio: 11, type: 'gpio', alt: 'I2C1 SCL / SPI1 TX' },
    16: { name: 'GP12', gpio: 12, type: 'gpio', alt: 'UART0 TX / I2C0 SDA / SPI1 RX' },
    17: { name: 'GP13', gpio: 13, type: 'gpio', alt: 'UART0 RX / I2C0 SCL / SPI1 CSn' },
    18: { name: 'GND',  gpio: null, type: 'gnd', alt: '접지' },
    19: { name: 'GP14', gpio: 14, type: 'gpio', alt: 'I2C1 SDA / SPI1 SCK' },
    20: { name: 'GP15', gpio: 15, type: 'gpio', alt: 'I2C1 SCL / SPI1 TX' },
    // 오른쪽 (물리 핀 21~40, 오른쪽 아래→위)
    21: { name: 'GP16', gpio: 16, type: 'gpio', alt: 'UART0 TX / I2C0 SDA / SPI0 RX' },
    22: { name: 'GP17', gpio: 17, type: 'gpio', alt: 'UART0 RX / I2C0 SCL / SPI0 CSn' },
    23: { name: 'GND',  gpio: null, type: 'gnd', alt: '접지' },
    24: { name: 'GP18', gpio: 18, type: 'gpio', alt: 'I2C1 SDA / SPI0 SCK' },
    25: { name: 'GP19', gpio: 19, type: 'gpio', alt: 'I2C1 SCL / SPI0 TX' },
    26: { name: 'GP20', gpio: 20, type: 'gpio', alt: 'I2C0 SDA / SPI0 RX' },
    27: { name: 'GP21', gpio: 21, type: 'gpio', alt: 'I2C0 SCL / SPI0 CSn' },
    28: { name: 'GND',  gpio: null, type: 'gnd', alt: '접지' },
    29: { name: 'GP22', gpio: 22, type: 'gpio', alt: 'I2C1 SDA' },
    30: { name: 'RUN',  gpio: null, type: 'special', alt: '리셋 (LOW로 당기면 리셋)' },
    31: { name: 'GP26', gpio: 26, type: 'adc', alt: 'ADC0 / I2C1 SDA' },
    32: { name: 'GP27', gpio: 27, type: 'adc', alt: 'ADC1 / I2C1 SCL' },
    33: { name: 'GND',  gpio: null, type: 'gnd', alt: '접지' },
    34: { name: 'GP28', gpio: 28, type: 'adc', alt: 'ADC2' },
    35: { name: 'ADC_VREF', gpio: null, type: 'power', alt: 'ADC 기준 전압' },
    36: { name: '3V3',     gpio: null, type: 'power', alt: '3.3V 출력' },
    37: { name: '3V3_EN',  gpio: null, type: 'special', alt: '3.3V 레귤레이터 활성화' },
    38: { name: 'GND',     gpio: null, type: 'gnd', alt: '접지' },
    39: { name: 'VSYS',    gpio: null, type: 'power', alt: '시스템 전원 입력 (1.8~5.5V)' },
    40: { name: 'VBUS',    gpio: null, type: 'power', alt: 'USB 전원 (5V)' },
  };

  // 핀 이름으로 물리 핀 번호 검색하는 룩업 맵
  const PIN_NAME_MAP = {};
  for (const [num, info] of Object.entries(PICO_PINS)) {
    const key = info.name.toUpperCase();
    // GND 핀은 여러 개이므로 첫 번째만 등록
    if (!PIN_NAME_MAP[key]) {
      PIN_NAME_MAP[key] = parseInt(num);
    }
    // GP26/ADC0 같은 별칭도 등록
    if (info.type === 'adc') {
      const adcNum = info.gpio - 26;
      PIN_NAME_MAP[`ADC${adcNum}`] = parseInt(num);
    }
  }
  // GND 핀 모든 물리 번호 목록
  const GND_PINS = [3, 8, 13, 18, 23, 28, 33, 38];

  // 센서 모듈 프리셋
  const SENSOR_PRESETS = {
    'MQ-2': {
      name: 'MQ-2 가스센서',
      description: '가연성 가스 및 연기 감지',
      pins: ['VCC', 'GND', 'DOUT', 'AOUT'],
      shape: 'cylinder',
      color: '#b45309',
    },
    'DHT11': {
      name: 'DHT11 온습도 센서',
      description: '온도와 습도 측정 (디지털)',
      pins: ['VCC', 'DATA', 'NC', 'GND'],
      shape: 'rect',
      color: '#0284c7',
    },
    'HC-SR04': {
      name: 'HC-SR04 초음파 센서',
      description: '거리 측정 (2cm~400cm)',
      pins: ['VCC', 'TRIG', 'ECHO', 'GND'],
      shape: 'eyes',
      color: '#7c3aed',
    },
    'LED': {
      name: 'LED',
      description: '발광 다이오드',
      pins: ['+', '-'],
      shape: 'led',
      color: '#ef4444',
    },
    'PIR': {
      name: 'PIR 모션 센서',
      description: '적외선 움직임 감지',
      pins: ['VCC', 'OUT', 'GND'],
      shape: 'dome',
      color: '#059669',
    },
  };

  // 색상 팔레트 (라이트/다크 모드)
  function getColors() {
    const isDark = document.documentElement.getAttribute('data-md-color-scheme') === 'slate';
    return {
      isDark,
      // 보드
      boardBg: isDark ? '#1e293b' : '#1e293b',
      boardBorder: isDark ? '#475569' : '#334155',
      boardLabel: '#94a3b8',
      chipBg: isDark ? '#0f172a' : '#0f172a',
      chipText: '#e2e8f0',
      // 핀 타입별
      gpio: isDark ? '#3b82f6' : '#2563eb',
      gnd: isDark ? '#374151' : '#1f2937',
      power: isDark ? '#ef4444' : '#dc2626',
      adc: isDark ? '#22c55e' : '#16a34a',
      special: isDark ? '#a855f7' : '#9333ea',
      pinGold: '#eab308',
      // 일반 UI
      text: isDark ? '#e2e8f0' : '#1e293b',
      textMuted: isDark ? '#94a3b8' : '#64748b',
      bg: isDark ? '#1e1e2e' : '#ffffff',
      bgSurface: isDark ? '#2a2a3e' : '#f8fafc',
      border: isDark ? '#475569' : '#cbd5e1',
      // 컴포넌트
      wire: isDark ? '#facc15' : '#ca8a04',
      breadboardBg: isDark ? '#f5f0e0' : '#f5f0e0',
      breadboardHole: isDark ? '#1a1a2e' : '#374151',
      breadboardPower: '#ef4444',
      breadboardGround: '#3b82f6',
      // 툴팁
      tooltipBg: isDark ? '#0f172a' : '#1e293b',
      tooltipText: '#f1f5f9',
      // 하이라이트
      highlight: '#f59e0b',
    };
  }

  // ──────────────────────────────────────────────
  // SVG 유틸리티
  // ──────────────────────────────────────────────

  /** SVG 요소 생성 헬퍼 */
  function svgEl(tag, attrs = {}, children = []) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== null && v !== undefined) {
        el.setAttribute(k, v);
      }
    }
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child) {
        el.appendChild(child);
      }
    }
    return el;
  }

  /** SVG 루트 생성 */
  function createSvg(width, height, viewBox) {
    return svgEl('svg', {
      xmlns: SVG_NS,
      width: '100%',
      viewBox: viewBox || `0 0 ${width} ${height}`,
      'aria-label': '회로도',
      role: 'img',
      style: `max-width: ${width}px; display: block; margin: 0 auto;`,
    });
  }

  /** SVG 텍스트 생성 */
  function svgText(x, y, text, attrs = {}) {
    return svgEl('text', {
      x, y,
      'font-family': "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Consolas', monospace",
      'font-size': attrs.fontSize || '11',
      fill: attrs.fill || '#e2e8f0',
      'text-anchor': attrs.anchor || 'middle',
      'dominant-baseline': attrs.baseline || 'central',
      'font-weight': attrs.bold ? 'bold' : 'normal',
      'pointer-events': 'none',
      ...attrs,
    }, [text]);
  }

  /** 둥근 사각형 */
  function svgRoundRect(x, y, w, h, r, attrs = {}) {
    return svgEl('rect', { x, y, width: w, height: h, rx: r, ry: r, ...attrs });
  }

  /** 툴팁 그룹 생성 */
  function createTooltip(svg) {
    const g = svgEl('g', {
      class: 'hw-tooltip',
      visibility: 'hidden',
      'pointer-events': 'none',
    });

    const bg = svgRoundRect(0, 0, 180, 60, 6, {
      fill: getColors().tooltipBg,
      stroke: getColors().border,
      'stroke-width': '1',
      filter: 'url(#tooltip-shadow)',
    });

    const title = svgText(10, 16, '', {
      anchor: 'start',
      fontSize: '12',
      fill: getColors().tooltipText,
      bold: true,
      class: 'tooltip-title',
    });

    const desc = svgText(10, 34, '', {
      anchor: 'start',
      fontSize: '10',
      fill: '#94a3b8',
      class: 'tooltip-desc',
    });

    const pinNum = svgText(10, 50, '', {
      anchor: 'start',
      fontSize: '10',
      fill: '#64748b',
      class: 'tooltip-pin',
    });

    g.appendChild(bg);
    g.appendChild(title);
    g.appendChild(desc);
    g.appendChild(pinNum);

    svg.appendChild(g);
    return g;
  }

  /** 툴팁 표시 */
  function showTooltip(tooltipGroup, x, y, titleText, descText, pinText) {
    const bg = tooltipGroup.querySelector('rect');
    const title = tooltipGroup.querySelector('.tooltip-title');
    const desc = tooltipGroup.querySelector('.tooltip-desc');
    const pin = tooltipGroup.querySelector('.tooltip-pin');

    title.textContent = titleText;
    desc.textContent = descText || '';
    pin.textContent = pinText || '';

    // 라인 수에 따른 높이 조정
    let h = 30;
    if (descText) h += 18;
    if (pinText) h += 16;
    bg.setAttribute('height', h);

    // 텍스트 길이에 따른 폭 조정
    const maxLen = Math.max(
      titleText.length,
      (descText || '').length,
      (pinText || '').length
    );
    const w = Math.max(140, maxLen * 7.5 + 20);
    bg.setAttribute('width', w);

    tooltipGroup.setAttribute('transform', `translate(${x}, ${y})`);
    tooltipGroup.setAttribute('visibility', 'visible');
  }

  /** 툴팁 숨기기 */
  function hideTooltip(tooltipGroup) {
    tooltipGroup.setAttribute('visibility', 'hidden');
  }

  /** 공통 필터/효과 정의 추가 */
  function addDefs(svg, colors) {
    const defs = svgEl('defs');

    // 툴팁 그림자
    const shadow = svgEl('filter', { id: 'tooltip-shadow', x: '-10%', y: '-10%', width: '130%', height: '140%' });
    const feOffset = svgEl('feDropShadow', {
      dx: '0', dy: '2', stdDeviation: '4', 'flood-color': 'rgba(0,0,0,0.3)', 'flood-opacity': '0.5',
    });
    shadow.appendChild(feOffset);
    defs.appendChild(shadow);

    // 핀 강조 펄스 애니메이션
    const style = svgEl('style');
    style.textContent = `
      @keyframes hw-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.6; transform: scale(1.3); }
      }
      .hw-pin-highlight {
        animation: hw-pulse 1.5s ease-in-out infinite;
        transform-origin: center;
        transform-box: fill-box;
      }
      .hw-wire:hover {
        stroke-width: 4 !important;
        filter: brightness(1.3);
        cursor: pointer;
      }
      .hw-pin-hover:hover {
        filter: brightness(1.3);
        cursor: pointer;
      }
      .hw-component:hover {
        filter: brightness(1.1);
        cursor: pointer;
      }
      .hw-diagram-container {
        position: relative;
        margin: 1.5em 0;
        border: 1px solid ${colors.border};
        border-radius: 12px;
        padding: 16px;
        background: ${colors.bgSurface};
        overflow: hidden;
      }
      .hw-diagram-title {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        font-weight: 600;
        color: ${colors.text};
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 2px solid ${colors.border};
      }
      .hw-diagram-notes {
        margin-top: 12px;
        padding: 12px;
        background: ${colors.isDark ? 'rgba(250,204,21,0.08)' : 'rgba(250,204,21,0.12)'};
        border-left: 3px solid #eab308;
        border-radius: 0 8px 8px 0;
        font-size: 13px;
        color: ${colors.text};
        line-height: 1.6;
      }
      .hw-diagram-notes li {
        list-style: none;
        padding-left: 0;
      }
      .hw-diagram-notes li::before {
        content: '💡 ';
      }
    `;
    defs.appendChild(style);

    // 글로우 필터 (강조용)
    const glow = svgEl('filter', { id: 'pin-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' });
    const feGaussian = svgEl('feGaussianBlur', { stdDeviation: '3', result: 'blur' });
    const feMerge = svgEl('feMerge');
    feMerge.appendChild(svgEl('feMergeNode', { in: 'blur' }));
    feMerge.appendChild(svgEl('feMergeNode', { in: 'SourceGraphic' }));
    glow.appendChild(feGaussian);
    glow.appendChild(feMerge);
    defs.appendChild(glow);

    svg.appendChild(defs);
  }

  /** data-highlight 파싱 */
  function parseHighlights(el) {
    try {
      return JSON.parse(el.dataset.highlight || '[]');
    } catch {
      return [];
    }
  }

  /** data-connections 파싱 */
  function parseConnections(el) {
    try {
      return JSON.parse(el.dataset.connections || '[]');
    } catch {
      return [];
    }
  }

  /** data-notes 파싱 */
  function parseNotes(el) {
    try {
      return JSON.parse(el.dataset.notes || '[]');
    } catch {
      return [];
    }
  }

  /** data-components 파싱 */
  function parseComponents(el) {
    try {
      return JSON.parse(el.dataset.components || '[]');
    } catch {
      return [];
    }
  }

  /** 컨테이너 래퍼 생성 */
  function createContainer(el, title) {
    const colors = getColors();
    const container = document.createElement('div');
    container.className = 'hw-diagram-container';

    if (title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'hw-diagram-title';
      titleEl.textContent = title;
      container.appendChild(titleEl);
    }

    el.innerHTML = '';
    el.appendChild(container);
    return container;
  }

  /** 노트 섹션 추가 */
  function appendNotes(container, notes) {
    if (!notes || notes.length === 0) return;
    const notesDiv = document.createElement('div');
    notesDiv.className = 'hw-diagram-notes';
    const ul = document.createElement('ul');
    ul.style.margin = '0';
    ul.style.padding = '0';
    for (const note of notes) {
      const li = document.createElement('li');
      li.textContent = note;
      ul.appendChild(li);
    }
    notesDiv.appendChild(ul);
    container.appendChild(notesDiv);
  }

  /** 핀 이름으로 핀 타입별 색상 반환 */
  function getPinColor(pinName, colors) {
    const upper = pinName.toUpperCase();
    if (upper === 'GND') return colors.gnd;
    if (upper === 'VBUS' || upper === 'VSYS' || upper === '3V3' || upper === 'ADC_VREF') return colors.power;
    if (upper === '3V3_EN' || upper === 'RUN') return colors.special;
    if (upper.startsWith('GP26') || upper.startsWith('GP27') || upper.startsWith('GP28') || upper.startsWith('ADC')) return colors.adc;
    return colors.gpio;
  }

  /** 핀 이름의 타입 텍스트 */
  function getPinTypeLabel(pinName) {
    const upper = pinName.toUpperCase();
    if (upper === 'GND') return '접지 (Ground)';
    if (upper === 'VBUS') return '전원 (5V USB)';
    if (upper === 'VSYS') return '전원 (시스템)';
    if (upper === '3V3') return '전원 (3.3V 출력)';
    if (upper === '3V3_EN') return '3.3V 레귤레이터 EN';
    if (upper === 'ADC_VREF') return 'ADC 기준전압';
    if (upper === 'RUN') return '리셋 핀';
    if (upper.includes('ADC') || upper.startsWith('GP26') || upper.startsWith('GP27') || upper.startsWith('GP28')) return 'ADC (아날로그 입력)';
    return 'GPIO (범용 입출력)';
  }

  // ──────────────────────────────────────────────
  // 렌더러 1: Pico 핀배치도 (pico-pinout)
  // ──────────────────────────────────────────────

  function renderPicoBoard(el) {
    const colors = getColors();
    const highlights = parseHighlights(el);
    const title = el.dataset.title || 'Raspberry Pi Pico 2 WH 핀 배치도';
    const container = createContainer(el, title);

    // 하이라이트 맵 (핀 이름 → {label, color})
    const highlightMap = {};
    for (const h of highlights) {
      highlightMap[h.pin.toUpperCase()] = h;
    }

    // SVG 크기
    const svgW = 700;
    const svgH = 560;
    const svg = createSvg(svgW, svgH);
    addDefs(svg, colors);

    // 보드 파라미터
    const boardX = 180;
    const boardY = 40;
    const boardW = 340;
    const boardH = 500;
    const pinSpacing = 22;
    const pinStartY = 70;
    const pinW = 40;    // 핀 사각형 가로
    const pinH = 16;    // 핀 사각형 세로
    const labelOffset = 65; // 핀 이름 라벨 오프셋

    // 보드 본체
    const boardGroup = svgEl('g', { 'aria-label': 'Pico 2 WH 보드' });

    // 보드 배경
    boardGroup.appendChild(svgRoundRect(boardX, boardY, boardW, boardH, 12, {
      fill: colors.boardBg,
      stroke: colors.boardBorder,
      'stroke-width': '2',
    }));

    // Micro USB 포트
    const usbW = 50;
    const usbH = 20;
    const usbX = boardX + (boardW - usbW) / 2;
    const usbY = boardY - 5;
    boardGroup.appendChild(svgRoundRect(usbX, usbY, usbW, usbH, 4, {
      fill: '#6b7280',
      stroke: '#9ca3af',
      'stroke-width': '1.5',
    }));
    boardGroup.appendChild(svgText(usbX + usbW / 2, usbY + usbH / 2, 'Micro USB', {
      fontSize: '8',
      fill: '#e5e7eb',
      bold: true,
    }));

    // RP2350 칩
    const chipW = 100;
    const chipH = 100;
    const chipX = boardX + (boardW - chipW) / 2;
    const chipY = boardY + 150;
    boardGroup.appendChild(svgRoundRect(chipX, chipY, chipW, chipH, 4, {
      fill: colors.chipBg,
      stroke: '#334155',
      'stroke-width': '1.5',
    }));
    boardGroup.appendChild(svgText(chipX + chipW / 2, chipY + chipH / 2 - 10, 'RP2350', {
      fontSize: '13',
      fill: colors.chipText,
      bold: true,
    }));
    boardGroup.appendChild(svgText(chipX + chipW / 2, chipY + chipH / 2 + 8, 'Dual Cortex-M33', {
      fontSize: '8',
      fill: '#64748b',
    }));
    // 칩 방향 마커 (도트)
    boardGroup.appendChild(svgEl('circle', {
      cx: chipX + 10, cy: chipY + 10, r: 4,
      fill: '#475569',
    }));

    // BOOTSEL 버튼
    const btnR = 12;
    const btnX = boardX + boardW / 2;
    const btnY = boardY + 310;
    boardGroup.appendChild(svgEl('circle', {
      cx: btnX, cy: btnY, r: btnR,
      fill: '#f8fafc',
      stroke: '#d1d5db',
      'stroke-width': '1.5',
    }));
    boardGroup.appendChild(svgText(btnX, btnY + 1, 'BOOT', {
      fontSize: '6',
      fill: '#374151',
      bold: true,
    }));
    boardGroup.appendChild(svgText(btnX, btnY + 20, 'BOOTSEL', {
      fontSize: '8',
      fill: colors.boardLabel,
    }));

    // LED
    boardGroup.appendChild(svgEl('circle', {
      cx: boardX + boardW / 2 + 40,
      cy: boardY + 80,
      r: 5,
      fill: '#22c55e',
      opacity: '0.7',
    }));
    boardGroup.appendChild(svgText(boardX + boardW / 2 + 40, boardY + 95, 'LED', {
      fontSize: '7',
      fill: colors.boardLabel,
    }));

    svg.appendChild(boardGroup);

    // 툴팁
    const tooltip = createTooltip(svg);

    // 핀 렌더링
    const pinsGroup = svgEl('g', { 'aria-label': '핀 배열' });

    // 왼쪽 핀 (1~20)
    for (let i = 0; i < 20; i++) {
      const physPin = i + 1;
      const pin = PICO_PINS[physPin];
      const y = pinStartY + i * pinSpacing;
      const pinColor = getPinColor(pin.name, colors);
      const isHighlighted = highlightMap[pin.name.toUpperCase()];

      const g = svgEl('g', {
        class: 'hw-pin-hover',
        tabindex: '0',
        'aria-label': `핀 ${physPin}: ${pin.name}`,
        role: 'button',
      });

      // 핀 몸체 (골드 패드)
      g.appendChild(svgRoundRect(boardX - 5, boardY + y - pinH / 2, 20, pinH, 2, {
        fill: colors.pinGold,
        stroke: '#a16207',
        'stroke-width': '0.5',
      }));

      // 핀 색상 원형 마커
      g.appendChild(svgEl('circle', {
        cx: boardX + 30,
        cy: boardY + y,
        r: 7,
        fill: pinColor,
        stroke: 'rgba(255,255,255,0.2)',
        'stroke-width': '1',
      }));

      // 핀 번호 (원 안)
      g.appendChild(svgText(boardX + 30, boardY + y, `${physPin}`, {
        fontSize: '7',
        fill: '#fff',
        bold: true,
      }));

      // 핀 이름 라벨 (왼쪽에)
      g.appendChild(svgText(boardX - labelOffset + 35, boardY + y, pin.name, {
        fontSize: '10',
        fill: pinColor,
        anchor: 'end',
        bold: !!isHighlighted,
      }));

      // 하이라이트 표시
      if (isHighlighted) {
        const hlCircle = svgEl('circle', {
          cx: boardX - labelOffset - 5,
          cy: boardY + y,
          r: 5,
          fill: isHighlighted.color || colors.highlight,
          class: 'hw-pin-highlight',
        });
        g.appendChild(hlCircle);

        // 하이라이트 라벨
        g.appendChild(svgText(boardX - labelOffset - 18, boardY + y, isHighlighted.label || '', {
          fontSize: '9',
          fill: isHighlighted.color || colors.highlight,
          anchor: 'end',
          bold: true,
        }));
      }

      // 이벤트 핸들러
      const pinInfo = pin;
      const pNum = physPin;
      g.addEventListener('mouseenter', (e) => {
        const rect = svg.getBoundingClientRect();
        const svgPoint = svg.viewBox.baseVal;
        const scaleX = svgPoint.width / rect.width;
        const tx = Math.min((e.clientX - rect.left) * scaleX + 10, svgW - 200);
        const ty = Math.max((e.clientY - rect.top) * scaleX - 30, 10);
        showTooltip(tooltip, tx, ty,
          pinInfo.name + (pinInfo.gpio !== null ? ` (GPIO ${pinInfo.gpio})` : ''),
          pinInfo.alt,
          `물리 핀 번호: ${pNum} | ${getPinTypeLabel(pinInfo.name)}`
        );
      });
      g.addEventListener('mouseleave', () => hideTooltip(tooltip));
      g.addEventListener('focus', () => {
        showTooltip(tooltip, boardX - labelOffset - 60, boardY + pinStartY + i * pinSpacing - 30,
          pinInfo.name + (pinInfo.gpio !== null ? ` (GPIO ${pinInfo.gpio})` : ''),
          pinInfo.alt,
          `물리 핀 번호: ${pNum} | ${getPinTypeLabel(pinInfo.name)}`
        );
      });
      g.addEventListener('blur', () => hideTooltip(tooltip));

      pinsGroup.appendChild(g);
    }

    // 오른쪽 핀 (40~21, 위→아래)
    for (let i = 0; i < 20; i++) {
      const physPin = 40 - i;
      const pin = PICO_PINS[physPin];
      const y = pinStartY + i * pinSpacing;
      const pinColor = getPinColor(pin.name, colors);
      const isHighlighted = highlightMap[pin.name.toUpperCase()];

      const g = svgEl('g', {
        class: 'hw-pin-hover',
        tabindex: '0',
        'aria-label': `핀 ${physPin}: ${pin.name}`,
        role: 'button',
      });

      // 핀 몸체 (골드 패드)
      g.appendChild(svgRoundRect(boardX + boardW - 15, boardY + y - pinH / 2, 20, pinH, 2, {
        fill: colors.pinGold,
        stroke: '#a16207',
        'stroke-width': '0.5',
      }));

      // 핀 색상 원형 마커
      g.appendChild(svgEl('circle', {
        cx: boardX + boardW - 30,
        cy: boardY + y,
        r: 7,
        fill: pinColor,
        stroke: 'rgba(255,255,255,0.2)',
        'stroke-width': '1',
      }));

      // 핀 번호
      g.appendChild(svgText(boardX + boardW - 30, boardY + y, `${physPin}`, {
        fontSize: '7',
        fill: '#fff',
        bold: true,
      }));

      // 핀 이름 라벨 (오른쪽에)
      g.appendChild(svgText(boardX + boardW + labelOffset - 35, boardY + y, pin.name, {
        fontSize: '10',
        fill: pinColor,
        anchor: 'start',
        bold: !!isHighlighted,
      }));

      // 하이라이트
      if (isHighlighted) {
        const hlCircle = svgEl('circle', {
          cx: boardX + boardW + labelOffset + 5,
          cy: boardY + y,
          r: 5,
          fill: isHighlighted.color || colors.highlight,
          class: 'hw-pin-highlight',
        });
        g.appendChild(hlCircle);

        g.appendChild(svgText(boardX + boardW + labelOffset + 18, boardY + y, isHighlighted.label || '', {
          fontSize: '9',
          fill: isHighlighted.color || colors.highlight,
          anchor: 'start',
          bold: true,
        }));
      }

      // 이벤트
      const pinInfo = pin;
      const pNum = physPin;
      g.addEventListener('mouseenter', (e) => {
        const rect = svg.getBoundingClientRect();
        const svgPoint = svg.viewBox.baseVal;
        const scaleX = svgPoint.width / rect.width;
        const tx = Math.min((e.clientX - rect.left) * scaleX + 10, svgW - 200);
        const ty = Math.max((e.clientY - rect.top) * scaleX - 30, 10);
        showTooltip(tooltip, tx, ty,
          pinInfo.name + (pinInfo.gpio !== null ? ` (GPIO ${pinInfo.gpio})` : ''),
          pinInfo.alt,
          `물리 핀 번호: ${pNum} | ${getPinTypeLabel(pinInfo.name)}`
        );
      });
      g.addEventListener('mouseleave', () => hideTooltip(tooltip));
      g.addEventListener('focus', () => {
        showTooltip(tooltip, boardX + boardW + labelOffset + 40, boardY + pinStartY + i * pinSpacing - 30,
          pinInfo.name + (pinInfo.gpio !== null ? ` (GPIO ${pinInfo.gpio})` : ''),
          pinInfo.alt,
          `물리 핀 번호: ${pNum} | ${getPinTypeLabel(pinInfo.name)}`
        );
      });
      g.addEventListener('blur', () => hideTooltip(tooltip));

      pinsGroup.appendChild(g);
    }

    svg.appendChild(pinsGroup);

    // 범례
    const legendY = boardY + boardH + 15;
    const legendGroup = svgEl('g', { 'aria-label': '범례' });
    const legendItems = [
      { color: colors.gpio, label: 'GPIO' },
      { color: colors.adc, label: 'ADC' },
      { color: colors.power, label: '전원' },
      { color: colors.gnd, label: 'GND' },
      { color: colors.special, label: '특수' },
    ];
    const legendStartX = boardX;
    legendItems.forEach((item, idx) => {
      const lx = legendStartX + idx * 70;
      legendGroup.appendChild(svgEl('circle', {
        cx: lx, cy: legendY, r: 5, fill: item.color,
      }));
      legendGroup.appendChild(svgText(lx + 10, legendY, item.label, {
        fontSize: '10',
        fill: colors.textMuted,
        anchor: 'start',
      }));
    });
    svg.appendChild(legendGroup);

    container.appendChild(svg);
  }

  // ──────────────────────────────────────────────
  // 렌더러 2: 회로 연결도 (connection)
  // ──────────────────────────────────────────────

  function renderConnection(el) {
    const colors = getColors();
    const connections = parseConnections(el);
    const title = el.dataset.title || '회로 연결도';
    const notes = parseNotes(el);
    const container = createContainer(el, title);

    const svgW = 750;
    const connCount = Math.max(connections.length, 1);
    const svgH = Math.max(300, connCount * 70 + 120);
    const svg = createSvg(svgW, svgH);
    addDefs(svg, colors);

    // Pico 간략 보드 (왼쪽)
    const picoX = 40;
    const picoY = 30;
    const picoW = 120;
    const picoH = svgH - 60;

    const picoGroup = svgEl('g', { 'aria-label': 'Pico 보드' });
    picoGroup.appendChild(svgRoundRect(picoX, picoY, picoW, picoH, 10, {
      fill: colors.boardBg,
      stroke: colors.boardBorder,
      'stroke-width': '2',
    }));
    picoGroup.appendChild(svgText(picoX + picoW / 2, picoY + 18, 'Pico 2 WH', {
      fontSize: '11',
      fill: colors.boardLabel,
      bold: true,
    }));
    svg.appendChild(picoGroup);

    // 컴포넌트 영역 (오른쪽)
    const compX = 550;
    const compW = 160;

    // 사용되는 핀 수집
    const usedPins = connections.map(c => c.from);
    const uniquePins = [...new Set(usedPins)];

    // 핀을 Pico 보드 좌측에 배치
    const pinSlots = {};
    const pinSpacing = Math.min(40, (picoH - 60) / Math.max(uniquePins.length, 1));
    uniquePins.forEach((pinName, idx) => {
      const py = picoY + 50 + idx * pinSpacing;
      pinSlots[pinName.toUpperCase()] = py;

      const pinColor = getPinColor(pinName, colors);
      picoGroup.appendChild(svgEl('circle', {
        cx: picoX + picoW - 15,
        cy: py,
        r: 6,
        fill: pinColor,
        stroke: 'rgba(255,255,255,0.2)',
        'stroke-width': '1',
      }));
      picoGroup.appendChild(svgText(picoX + picoW - 30, py, pinName, {
        fontSize: '9',
        fill: pinColor,
        anchor: 'end',
        bold: true,
      }));
    });

    // 연결선 및 컴포넌트 렌더링
    const wiresGroup = svgEl('g', { 'aria-label': '연결선' });
    const compGroup = svgEl('g', { 'aria-label': '컴포넌트' });

    const tooltip = createTooltip(svg);

    connections.forEach((conn, idx) => {
      const wireColor = conn.color || colors.wire;
      const fromY = pinSlots[conn.from.toUpperCase()] || (picoY + 50 + idx * pinSpacing);
      const toY = picoY + 50 + idx * pinSpacing;

      // "to" 컴포넌트 (중간 또는 오른쪽)
      const hasThen = !!conn.then;
      const midX = hasThen ? 340 : compX;

      // 중간 컴포넌트
      const compBoxW = 120;
      const compBoxH = 32;
      const midY = toY;

      // 연결선 (from → to)
      const startX = picoX + picoW - 9;
      const startY = fromY;
      const endX = midX - compBoxW / 2;
      const endY = midY;

      // cubic bezier 곡선
      const cx1 = startX + (endX - startX) * 0.4;
      const cx2 = startX + (endX - startX) * 0.6;

      const wire1 = svgEl('path', {
        d: `M ${startX} ${startY} C ${cx1} ${startY}, ${cx2} ${endY}, ${endX} ${endY}`,
        stroke: wireColor,
        'stroke-width': '2.5',
        fill: 'none',
        'stroke-linecap': 'round',
        class: 'hw-wire',
        'aria-label': `${conn.from} → ${conn.to}`,
      });
      wiresGroup.appendChild(wire1);

      // 컴포넌트 박스 (to)
      const compBoxX = midX - compBoxW / 2;
      const compBoxY = midY - compBoxH / 2;

      const compG = svgEl('g', { class: 'hw-component' });

      // 컴포넌트 배경
      compG.appendChild(svgRoundRect(compBoxX, compBoxY, compBoxW, compBoxH, 6, {
        fill: colors.bgSurface,
        stroke: wireColor,
        'stroke-width': '1.5',
      }));

      // 컴포넌트 아이콘 (타입 추정)
      const compName = conn.to.toLowerCase();
      const iconX = compBoxX + 16;
      const iconY = midY;

      if (compName.includes('저항') || compName.includes('resistor') || compName.includes('ω')) {
        // 저항: 지그재그
        const zigW = 18;
        const zigH = 6;
        const zx = iconX - zigW / 2;
        const zy = iconY;
        compG.appendChild(svgEl('path', {
          d: `M ${zx} ${zy} l 3 -${zigH} l 3 ${zigH * 2} l 3 -${zigH * 2} l 3 ${zigH * 2} l 3 -${zigH * 2} l 3 ${zigH}`,
          stroke: wireColor,
          'stroke-width': '1.5',
          fill: 'none',
        }));
      } else if (compName.includes('led')) {
        // LED: 원형 + 화살표
        compG.appendChild(svgEl('circle', {
          cx: iconX, cy: iconY, r: 6,
          fill: wireColor,
          opacity: '0.6',
        }));
        compG.appendChild(svgEl('path', {
          d: `M ${iconX + 5} ${iconY - 5} l 4 -4 M ${iconX + 5} ${iconY - 5} l -3 1 M ${iconX + 5} ${iconY - 5} l 1 -3`,
          stroke: wireColor,
          'stroke-width': '1',
          fill: 'none',
        }));
      } else if (compName.includes('센서') || compName.includes('sensor')) {
        // 센서: 사각형 + 전파 기호
        compG.appendChild(svgRoundRect(iconX - 6, iconY - 6, 12, 12, 2, {
          fill: 'none',
          stroke: wireColor,
          'stroke-width': '1.5',
        }));
      } else {
        // 기본: 점
        compG.appendChild(svgEl('circle', {
          cx: iconX, cy: iconY, r: 4,
          fill: wireColor,
        }));
      }

      // 컴포넌트 텍스트
      compG.appendChild(svgText(compBoxX + compBoxW / 2 + 5, midY, conn.to, {
        fontSize: '10',
        fill: colors.text,
        anchor: 'middle',
      }));

      compGroup.appendChild(compG);

      // then 컴포넌트 (있는 경우)
      if (hasThen) {
        const thenX = compX + compW / 2;
        const thenBoxX = thenX - compBoxW / 2;
        const thenBoxY = midY - compBoxH / 2;

        // 중간 → then 연결선
        const wire2StartX = midX + compBoxW / 2;
        const wire2EndX = thenBoxX;
        const wcx1 = wire2StartX + (wire2EndX - wire2StartX) * 0.4;
        const wcx2 = wire2StartX + (wire2EndX - wire2StartX) * 0.6;

        wiresGroup.appendChild(svgEl('path', {
          d: `M ${wire2StartX} ${midY} C ${wcx1} ${midY}, ${wcx2} ${midY}, ${wire2EndX} ${midY}`,
          stroke: wireColor,
          'stroke-width': '2.5',
          fill: 'none',
          'stroke-linecap': 'round',
          class: 'hw-wire',
        }));

        const thenG = svgEl('g', { class: 'hw-component' });
        thenG.appendChild(svgRoundRect(thenBoxX, thenBoxY, compBoxW, compBoxH, 6, {
          fill: colors.bgSurface,
          stroke: wireColor,
          'stroke-width': '1.5',
        }));

        // then 컴포넌트 아이콘
        const thenName = conn.then.toLowerCase();
        const thenIconX = thenBoxX + 16;
        if (thenName.includes('led')) {
          thenG.appendChild(svgEl('circle', {
            cx: thenIconX, cy: midY, r: 6,
            fill: wireColor,
            opacity: '0.6',
          }));
          thenG.appendChild(svgEl('path', {
            d: `M ${thenIconX + 5} ${midY - 5} l 4 -4 M ${thenIconX + 5} ${midY - 5} l -3 1 M ${thenIconX + 5} ${midY - 5} l 1 -3`,
            stroke: wireColor,
            'stroke-width': '1',
            fill: 'none',
          }));
        } else {
          thenG.appendChild(svgEl('circle', {
            cx: thenIconX, cy: midY, r: 4,
            fill: wireColor,
          }));
        }

        thenG.appendChild(svgText(thenBoxX + compBoxW / 2 + 5, midY, conn.then, {
          fontSize: '10',
          fill: colors.text,
          anchor: 'middle',
        }));

        compGroup.appendChild(thenG);
      }
    });

    svg.appendChild(wiresGroup);
    svg.appendChild(compGroup);
    svg.appendChild(tooltip);

    container.appendChild(svg);
    appendNotes(container, notes);
  }

  // ──────────────────────────────────────────────
  // 렌더러 3: 센서 모듈 다이어그램 (sensor-module)
  // ──────────────────────────────────────────────

  function renderSensorModule(el) {
    const colors = getColors();
    const sensorName = (el.dataset.sensor || '').toUpperCase();
    const connections = parseConnections(el);
    const title = el.dataset.title || `${sensorName} 센서 모듈 연결`;
    const notes = parseNotes(el);
    const container = createContainer(el, title);

    const preset = SENSOR_PRESETS[sensorName] || {
      name: sensorName || '센서 모듈',
      description: '',
      pins: connections.map(c => c.pin),
      shape: 'rect',
      color: '#6366f1',
    };

    const svgW = 700;
    const connCount = Math.max(connections.length, preset.pins.length, 1);
    const svgH = Math.max(280, connCount * 65 + 120);
    const svg = createSvg(svgW, svgH);
    addDefs(svg, colors);

    const tooltip = createTooltip(svg);

    // 센서 모듈 (중앙)
    const sensorX = 300;
    const sensorY = svgH / 2;
    const sensorW = 140;
    const sensorH = Math.max(120, connCount * 40 + 30);

    const sensorGroup = svgEl('g', { 'aria-label': `${preset.name} 모듈` });

    // 모듈 본체
    sensorGroup.appendChild(svgRoundRect(
      sensorX - sensorW / 2, sensorY - sensorH / 2,
      sensorW, sensorH, 10,
      {
        fill: colors.boardBg,
        stroke: preset.color,
        'stroke-width': '2.5',
      }
    ));

    // 센서 심볼 (shape에 따라)
    const symbolX = sensorX;
    const symbolY = sensorY - sensorH / 2 + 35;

    switch (preset.shape) {
      case 'cylinder': {
        // 가스센서 실린더
        const cr = 20;
        sensorGroup.appendChild(svgEl('ellipse', {
          cx: symbolX, cy: symbolY, rx: cr, ry: 8,
          fill: preset.color,
          opacity: '0.3',
        }));
        sensorGroup.appendChild(svgRoundRect(symbolX - cr, symbolY, cr * 2, 25, 0, {
          fill: preset.color,
          opacity: '0.2',
        }));
        sensorGroup.appendChild(svgEl('ellipse', {
          cx: symbolX, cy: symbolY + 25, rx: cr, ry: 8,
          fill: preset.color,
          opacity: '0.3',
        }));
        // 메쉬 패턴
        for (let i = -cr + 6; i < cr; i += 8) {
          sensorGroup.appendChild(svgEl('line', {
            x1: symbolX + i, y1: symbolY + 2,
            x2: symbolX + i, y2: symbolY + 23,
            stroke: preset.color,
            'stroke-width': '0.5',
            opacity: '0.4',
          }));
        }
        break;
      }
      case 'eyes': {
        // 초음파 센서: 두 개의 원
        sensorGroup.appendChild(svgEl('circle', {
          cx: symbolX - 16, cy: symbolY, r: 14,
          fill: 'none',
          stroke: preset.color,
          'stroke-width': '2',
        }));
        sensorGroup.appendChild(svgEl('circle', {
          cx: symbolX + 16, cy: symbolY, r: 14,
          fill: 'none',
          stroke: preset.color,
          'stroke-width': '2',
        }));
        sensorGroup.appendChild(svgEl('circle', {
          cx: symbolX - 16, cy: symbolY, r: 6,
          fill: preset.color,
          opacity: '0.3',
        }));
        sensorGroup.appendChild(svgEl('circle', {
          cx: symbolX + 16, cy: symbolY, r: 6,
          fill: preset.color,
          opacity: '0.3',
        }));
        break;
      }
      case 'led': {
        // LED 심볼
        sensorGroup.appendChild(svgEl('circle', {
          cx: symbolX, cy: symbolY, r: 16,
          fill: preset.color,
          opacity: '0.4',
        }));
        sensorGroup.appendChild(svgEl('circle', {
          cx: symbolX, cy: symbolY, r: 10,
          fill: preset.color,
          opacity: '0.6',
        }));
        // 빛 방사선
        for (let a = -30; a <= 30; a += 20) {
          const rad = (a - 90) * Math.PI / 180;
          const x1 = symbolX + Math.cos(rad) * 18;
          const y1 = symbolY + Math.sin(rad) * 18;
          const x2 = symbolX + Math.cos(rad) * 26;
          const y2 = symbolY + Math.sin(rad) * 26;
          sensorGroup.appendChild(svgEl('line', {
            x1, y1, x2, y2,
            stroke: preset.color,
            'stroke-width': '1.5',
            opacity: '0.5',
          }));
        }
        break;
      }
      case 'dome': {
        // PIR 센서: 돔형
        sensorGroup.appendChild(svgEl('path', {
          d: `M ${symbolX - 22} ${symbolY + 10}
              Q ${symbolX - 22} ${symbolY - 15}, ${symbolX} ${symbolY - 18}
              Q ${symbolX + 22} ${symbolY - 15}, ${symbolX + 22} ${symbolY + 10} Z`,
          fill: preset.color,
          opacity: '0.3',
          stroke: preset.color,
          'stroke-width': '1.5',
        }));
        // 프레넬 렌즈 패턴
        sensorGroup.appendChild(svgEl('circle', {
          cx: symbolX, cy: symbolY - 2, r: 8,
          fill: 'none',
          stroke: preset.color,
          'stroke-width': '0.8',
          opacity: '0.5',
        }));
        sensorGroup.appendChild(svgEl('circle', {
          cx: symbolX, cy: symbolY - 2, r: 14,
          fill: 'none',
          stroke: preset.color,
          'stroke-width': '0.8',
          opacity: '0.3',
        }));
        break;
      }
      default: {
        // 기본 사각형
        sensorGroup.appendChild(svgRoundRect(
          symbolX - 20, symbolY - 12, 40, 24, 4,
          {
            fill: preset.color,
            opacity: '0.25',
            stroke: preset.color,
            'stroke-width': '1.5',
          }
        ));
      }
    }

    // 모듈 이름
    sensorGroup.appendChild(svgText(sensorX, sensorY - sensorH / 2 + 75, preset.name, {
      fontSize: '12',
      fill: colors.text,
      bold: true,
    }));

    if (preset.description) {
      sensorGroup.appendChild(svgText(sensorX, sensorY - sensorH / 2 + 90, preset.description, {
        fontSize: '9',
        fill: colors.textMuted,
      }));
    }

    svg.appendChild(sensorGroup);

    // 센서 핀 (모듈 왼쪽에 배치)
    const pinStartY = sensorY - sensorH / 2 + 100;
    const pinSpacing = Math.min(35, (sensorH - 110) / Math.max(connections.length, 1));

    // Pico 보드 간략 표현 (오른쪽)
    const picoX = 580;
    const picoY2 = 30;
    const picoW = 100;
    const picoH = svgH - 60;

    const picoGroup = svgEl('g', { 'aria-label': 'Pico 보드' });
    picoGroup.appendChild(svgRoundRect(picoX, picoY2, picoW, picoH, 10, {
      fill: colors.boardBg,
      stroke: colors.boardBorder,
      'stroke-width': '2',
    }));
    picoGroup.appendChild(svgText(picoX + picoW / 2, picoY2 + 18, 'Pico 2 WH', {
      fontSize: '10',
      fill: colors.boardLabel,
      bold: true,
    }));
    svg.appendChild(picoGroup);

    // 연결 렌더링
    const wiresGroup = svgEl('g', { 'aria-label': '연결선' });

    connections.forEach((conn, idx) => {
      const wireColor = conn.color || preset.color;
      const py = pinStartY + idx * pinSpacing;

      // 센서 핀 표시 (모듈 왼쪽)
      const pinLabel = conn.pin;
      const sensorPinX = sensorX - sensorW / 2;
      const sensorPinDotX = sensorPinX - 10;

      sensorGroup.appendChild(svgEl('circle', {
        cx: sensorPinDotX, cy: py, r: 5,
        fill: wireColor,
        stroke: 'rgba(255,255,255,0.2)',
        'stroke-width': '1',
      }));

      sensorGroup.appendChild(svgText(sensorPinX + 15, py, pinLabel, {
        fontSize: '10',
        fill: wireColor,
        anchor: 'start',
        bold: true,
      }));

      // Pico 대상 핀 (오른쪽)
      const picoLabel = conn.to;
      const isPicoConnected = picoLabel && !picoLabel.includes('미사용') && picoLabel !== '-';

      if (isPicoConnected) {
        const picoPinY = picoY2 + 50 + idx * pinSpacing;
        const picoPinX = picoX + 12;

        // Pico 핀 표시
        picoGroup.appendChild(svgEl('circle', {
          cx: picoPinX, cy: picoPinY, r: 5,
          fill: wireColor,
          stroke: 'rgba(255,255,255,0.2)',
          'stroke-width': '1',
        }));

        picoGroup.appendChild(svgText(picoX + 25, picoPinY, picoLabel, {
          fontSize: '9',
          fill: wireColor,
          anchor: 'start',
        }));

        // 연결선 (센서 핀 → Pico 핀 사이의 곡선, 센서 왼쪽에서 Pico 왼쪽으로)
        // 경로: 센서 핀 왼쪽 → 아래로 내려감 → Pico 쪽으로 올라감
        const fromX = sensorPinDotX - 5;
        const fromY = py;
        const toX = picoPinX - 5;
        const toY = picoPinY;

        // 센서가 중앙, 피코가 오른쪽이므로 아래쪽으로 크게 돌아서 연결
        const midLowY = Math.max(fromY, toY) + 40 + idx * 10;
        const pathD = `M ${fromX} ${fromY}
                       C ${fromX - 40} ${fromY}, ${fromX - 60} ${midLowY}, ${(fromX + toX) / 2} ${midLowY}
                       C ${toX + 60} ${midLowY}, ${toX - 40} ${toY}, ${toX} ${toY}`;

        const wire = svgEl('path', {
          d: pathD,
          stroke: wireColor,
          'stroke-width': '2',
          fill: 'none',
          'stroke-linecap': 'round',
          'stroke-dasharray': conn.pin === 'DOUT' && picoLabel.includes('미사용') ? '5,5' : 'none',
          class: 'hw-wire',
        });

        // 호버 시 연결 정보 표시
        const cInfo = conn;
        wire.addEventListener('mouseenter', (e) => {
          const rect = svg.getBoundingClientRect();
          const scaleX = svg.viewBox.baseVal.width / rect.width;
          const tx = Math.min((e.clientX - rect.left) * scaleX + 10, svgW - 200);
          const ty = Math.max((e.clientY - rect.top) * scaleX - 30, 10);
          showTooltip(tooltip, tx, ty,
            `${cInfo.pin} → ${cInfo.to}`,
            cInfo.note || '',
            ''
          );
        });
        wire.addEventListener('mouseleave', () => hideTooltip(tooltip));

        wiresGroup.appendChild(wire);
      }

      // 미사용 핀 표시
      if (!isPicoConnected) {
        sensorGroup.appendChild(svgText(sensorPinDotX - 18, py, picoLabel || '(미연결)', {
          fontSize: '9',
          fill: colors.textMuted,
          anchor: 'end',
        }));
      }

      // 메모 표시 (있는 경우)
      if (conn.note) {
        sensorGroup.appendChild(svgText(sensorPinX + 15, py + 14, conn.note, {
          fontSize: '8',
          fill: colors.textMuted,
          anchor: 'start',
        }));
      }
    });

    svg.appendChild(wiresGroup);
    svg.appendChild(tooltip);

    container.appendChild(svg);
    appendNotes(container, notes);
  }

  // ──────────────────────────────────────────────
  // 렌더러 4: 브레드보드 구조도 (breadboard)
  // ──────────────────────────────────────────────

  function renderBreadboard(el) {
    const colors = getColors();
    const components = parseComponents(el);
    const title = el.dataset.title || '브레드보드 배선도';
    const notes = parseNotes(el);
    const container = createContainer(el, title);

    // 브레드보드 파라미터
    const cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const rows = 30;
    const holeR = 3.5;
    const holeSpacing = 16;
    const startX = 80;
    const startY = 80;
    const gapY = 30; // a-e와 f-j 사이 홈
    const powerRailW = 30;

    const bbW = startX * 2 + (rows - 1) * holeSpacing + powerRailW * 2;
    const bbH = startY + cols.length * holeSpacing + gapY + 80;

    const svgW = Math.max(700, bbW + 40);
    const svgH = bbH + 60;
    const svg = createSvg(svgW, svgH);
    addDefs(svg, colors);

    const bbGroup = svgEl('g', { 'aria-label': '브레드보드' });

    // 보드 배경
    bbGroup.appendChild(svgRoundRect(20, 20, svgW - 40, svgH - 40, 10, {
      fill: colors.breadboardBg,
      stroke: '#d4a853',
      'stroke-width': '2',
    }));

    // 행 번호 라벨
    for (let r = 1; r <= rows; r++) {
      const x = startX + (r - 1) * holeSpacing;
      bbGroup.appendChild(svgText(x, startY - 18, `${r}`, {
        fontSize: '8',
        fill: '#78716c',
        anchor: 'middle',
      }));
    }

    // 열 이름 함수
    function getColY(colName) {
      const idx = cols.indexOf(colName);
      if (idx === -1) return startY;
      // a-e는 위쪽, f-j는 아래쪽 (홈 사이)
      if (idx < 5) {
        return startY + idx * holeSpacing;
      } else {
        return startY + idx * holeSpacing + gapY;
      }
    }

    // 열 라벨
    cols.forEach((colName) => {
      const y = getColY(colName);
      bbGroup.appendChild(svgText(startX - 20, y, colName, {
        fontSize: '10',
        fill: '#78716c',
        anchor: 'middle',
        bold: true,
      }));
    });

    // 중앙 홈(divider) 표시
    const dividerY = startY + 4 * holeSpacing + holeSpacing / 2 + gapY / 2 - holeSpacing / 2;
    bbGroup.appendChild(svgRoundRect(startX - 10, dividerY, rows * holeSpacing, gapY - 2, 4, {
      fill: colors.isDark ? '#2a2a20' : '#e8dcc0',
      stroke: '#b8a070',
      'stroke-width': '1',
    }));
    bbGroup.appendChild(svgText(startX + (rows * holeSpacing) / 2 - 10, dividerY + gapY / 2 - 1, '← a~e 내부 연결 | f~j 내부 연결 →', {
      fontSize: '7',
      fill: '#a0937c',
    }));

    // 홀 렌더링
    for (let r = 1; r <= rows; r++) {
      const hx = startX + (r - 1) * holeSpacing;
      for (const colName of cols) {
        const hy = getColY(colName);

        bbGroup.appendChild(svgEl('circle', {
          cx: hx,
          cy: hy,
          r: holeR,
          fill: colors.breadboardHole,
          stroke: '#555',
          'stroke-width': '0.5',
        }));
      }
    }

    // 내부 연결 시각화 (각 행의 a-e, f-j가 연결됨을 표시)
    for (let r = 1; r <= rows; r++) {
      const hx = startX + (r - 1) * holeSpacing;
      // a-e 연결선 (은은하게)
      const topY = getColY('a');
      const midY = getColY('e');
      bbGroup.appendChild(svgEl('line', {
        x1: hx, y1: topY, x2: hx, y2: midY,
        stroke: '#c0b090',
        'stroke-width': '0.5',
        opacity: '0.4',
      }));
      // f-j 연결선
      const botTopY = getColY('f');
      const botY = getColY('j');
      bbGroup.appendChild(svgEl('line', {
        x1: hx, y1: botTopY, x2: hx, y2: botY,
        stroke: '#c0b090',
        'stroke-width': '0.5',
        opacity: '0.4',
      }));
    }

    // 전원 레일 (상단, 하단)
    const powerY = startY - 40;
    const gndRailY = getColY('j') + 35;

    // 상단 전원 레일 (+)
    bbGroup.appendChild(svgEl('line', {
      x1: startX, y1: powerY, x2: startX + (rows - 1) * holeSpacing, y2: powerY,
      stroke: colors.breadboardPower,
      'stroke-width': '2',
      opacity: '0.4',
    }));
    bbGroup.appendChild(svgText(startX - 20, powerY, '+', {
      fontSize: '14',
      fill: colors.breadboardPower,
      bold: true,
    }));

    // 상단 GND 레일 (-)
    bbGroup.appendChild(svgEl('line', {
      x1: startX, y1: powerY + 14, x2: startX + (rows - 1) * holeSpacing, y2: powerY + 14,
      stroke: colors.breadboardGround,
      'stroke-width': '2',
      opacity: '0.4',
    }));
    bbGroup.appendChild(svgText(startX - 20, powerY + 14, '−', {
      fontSize: '14',
      fill: colors.breadboardGround,
      bold: true,
    }));

    // 전원 레일 홀
    for (let r = 1; r <= rows; r++) {
      const hx = startX + (r - 1) * holeSpacing;
      // + 레일
      bbGroup.appendChild(svgEl('circle', {
        cx: hx, cy: powerY, r: 2.5,
        fill: colors.breadboardPower,
        opacity: '0.5',
      }));
      // - 레일
      bbGroup.appendChild(svgEl('circle', {
        cx: hx, cy: powerY + 14, r: 2.5,
        fill: colors.breadboardGround,
        opacity: '0.5',
      }));
    }

    svg.appendChild(bbGroup);

    // 컴포넌트 배치
    const compGroup = svgEl('g', { 'aria-label': '부품' });
    const tooltip = createTooltip(svg);

    for (const comp of components) {
      const row = comp.row || 1;
      const cx = startX + (row - 1) * holeSpacing;
      const cy = comp.col ? getColY(comp.col) : startY;
      const wireColor = comp.color || colors.wire;

      switch (comp.type) {
        case 'led': {
          const ledColor = comp.color || '#ef4444';
          // LED 심볼
          const ledG = svgEl('g', { class: 'hw-component', 'aria-label': 'LED' });
          ledG.appendChild(svgEl('circle', {
            cx, cy, r: holeR + 3,
            fill: ledColor,
            opacity: '0.7',
            stroke: ledColor,
            'stroke-width': '1',
          }));
          // 빛 표현
          ledG.appendChild(svgEl('circle', {
            cx, cy, r: holeR + 7,
            fill: 'none',
            stroke: ledColor,
            'stroke-width': '0.5',
            opacity: '0.3',
          }));
          ledG.appendChild(svgText(cx, cy + holeR + 14, 'LED', {
            fontSize: '8',
            fill: colors.text,
          }));
          compGroup.appendChild(ledG);
          break;
        }

        case 'resistor': {
          const span = comp.span || 3;
          const endX = cx + (span - 1) * holeSpacing;
          const rG = svgEl('g', { class: 'hw-component', 'aria-label': '저항' });

          // 저항 몸체
          const rW = (span - 1) * holeSpacing;
          const rH = 10;
          rG.appendChild(svgRoundRect(cx, cy - rH / 2, rW, rH, 3, {
            fill: '#c4a06a',
            stroke: '#a07840',
            'stroke-width': '1',
          }));

          // 색띠 (장식용)
          const bandColors = ['#854d0e', '#1e1e1e', '#dc2626', '#eab308'];
          const bandW = 3;
          bandColors.forEach((bc, bi) => {
            const bx = cx + rW * 0.2 + bi * (rW * 0.15);
            rG.appendChild(svgRoundRect(bx, cy - rH / 2 + 1, bandW, rH - 2, 1, {
              fill: bc,
            }));
          });

          // 리드선
          rG.appendChild(svgEl('line', {
            x1: cx - 3, y1: cy, x2: cx, y2: cy,
            stroke: '#888', 'stroke-width': '1.5',
          }));
          rG.appendChild(svgEl('line', {
            x1: endX, y1: cy, x2: endX + 3, y2: cy,
            stroke: '#888', 'stroke-width': '1.5',
          }));

          rG.appendChild(svgText((cx + endX) / 2, cy + rH / 2 + 12, comp.value || '220Ω', {
            fontSize: '8',
            fill: colors.text,
          }));
          compGroup.appendChild(rG);
          break;
        }

        case 'wire': {
          // Pico에서 브레드보드로 연결하는 점퍼 와이어
          const toRow = comp.toRow || row;
          const toCol = comp.toCol || comp.col || 'a';
          const toX = startX + (toRow - 1) * holeSpacing;
          const toY = getColY(toCol);

          const wireG = svgEl('g', { class: 'hw-wire', 'aria-label': `와이어: ${comp.from || '?'} → row${toRow}${toCol}` });

          // 와이어 시작점 (보드 외부에서 진입)
          const wireStartX = 30;
          const wireStartY = toY - 20;

          // 와이어 라벨
          wireG.appendChild(svgText(wireStartX, wireStartY - 10, comp.from || '', {
            fontSize: '9',
            fill: wireColor,
            anchor: 'start',
            bold: true,
          }));

          // 연결선
          wireG.appendChild(svgEl('path', {
            d: `M ${wireStartX + 20} ${wireStartY} C ${wireStartX + 40} ${wireStartY}, ${toX - 20} ${toY}, ${toX} ${toY}`,
            stroke: wireColor,
            'stroke-width': '2.5',
            fill: 'none',
            'stroke-linecap': 'round',
          }));

          // 진입점 표시
          wireG.appendChild(svgEl('circle', {
            cx: toX, cy: toY, r: holeR + 1,
            fill: wireColor,
            opacity: '0.8',
          }));

          compGroup.appendChild(wireG);
          break;
        }

        case 'jumper': {
          // 보드 내부 점퍼 와이어
          const toRow = comp.toRow || row;
          const toCol = comp.toCol || comp.col;
          const fromX = cx;
          const fromY = cy;
          const jToX = startX + (toRow - 1) * holeSpacing;
          const jToY = comp.toCol ? getColY(comp.toCol) : fromY;

          const jG = svgEl('g', { class: 'hw-wire' });
          jG.appendChild(svgEl('path', {
            d: `M ${fromX} ${fromY} C ${fromX} ${(fromY + jToY) / 2 - 15}, ${jToX} ${(fromY + jToY) / 2 - 15}, ${jToX} ${jToY}`,
            stroke: wireColor,
            'stroke-width': '2',
            fill: 'none',
            'stroke-linecap': 'round',
          }));
          // 끝점 표시
          jG.appendChild(svgEl('circle', {
            cx: fromX, cy: fromY, r: holeR,
            fill: wireColor,
            opacity: '0.8',
          }));
          jG.appendChild(svgEl('circle', {
            cx: jToX, cy: jToY, r: holeR,
            fill: wireColor,
            opacity: '0.8',
          }));
          compGroup.appendChild(jG);
          break;
        }

        default: {
          // 기본 컴포넌트: 사각형 마커
          const defG = svgEl('g', { class: 'hw-component' });
          defG.appendChild(svgRoundRect(cx - 8, cy - 8, 16, 16, 3, {
            fill: wireColor,
            opacity: '0.5',
            stroke: wireColor,
            'stroke-width': '1',
          }));
          defG.appendChild(svgText(cx, cy + 18, comp.type || '?', {
            fontSize: '8',
            fill: colors.text,
          }));
          compGroup.appendChild(defG);
        }
      }
    }

    svg.appendChild(compGroup);
    svg.appendChild(tooltip);

    // 범례
    const legendY2 = svgH - 25;
    const legendG = svgEl('g', { 'aria-label': '범례' });
    const legendItems = [
      { text: 'a~e 열 내부 연결', color: '#c0b090' },
      { text: 'f~j 열 내부 연결', color: '#c0b090' },
      { text: '+ 전원 레일', color: colors.breadboardPower },
      { text: '− GND 레일', color: colors.breadboardGround },
    ];
    legendItems.forEach((item, idx) => {
      const lx = 60 + idx * 150;
      legendG.appendChild(svgEl('rect', {
        x: lx, y: legendY2 - 5, width: 12, height: 10, rx: 2,
        fill: item.color,
        opacity: '0.6',
      }));
      legendG.appendChild(svgText(lx + 18, legendY2, item.text, {
        fontSize: '9',
        fill: colors.textMuted,
        anchor: 'start',
      }));
    });
    svg.appendChild(legendG);

    container.appendChild(svg);
    appendNotes(container, notes);
  }

  // ──────────────────────────────────────────────
  // 메인 초기화
  // ──────────────────────────────────────────────

  function init() {
    const diagrams = document.querySelectorAll('.hw-diagram');
    if (diagrams.length === 0) return;

    diagrams.forEach(el => {
      // 이미 렌더링된 경우 스킵
      if (el.dataset.rendered === 'true') return;

      const type = el.dataset.type;
      try {
        switch (type) {
          case 'pico-pinout':
            renderPicoBoard(el);
            break;
          case 'connection':
            renderConnection(el);
            break;
          case 'sensor-module':
            renderSensorModule(el);
            break;
          case 'breadboard':
            renderBreadboard(el);
            break;
          default:
            console.warn(`[EduFlow Circuit] 알 수 없는 다이어그램 타입: ${type}`);
            return;
        }
        el.dataset.rendered = 'true';
      } catch (err) {
        console.error(`[EduFlow Circuit] 렌더링 오류 (${type}):`, err);
        el.innerHTML = `<div style="padding:16px;color:#ef4444;border:1px solid #ef4444;border-radius:8px;">
          회로도 렌더링 오류: ${err.message}</div>`;
      }
    });
  }

  // MkDocs Material 테마 변경 감지 (다크/라이트 전환 시 재렌더링)
  function observeThemeChange() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-md-color-scheme') {
          // 모든 다이어그램 재렌더링
          document.querySelectorAll('.hw-diagram').forEach(el => {
            el.dataset.rendered = 'false';
          });
          init();
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-md-color-scheme'],
    });
  }

  // DOMContentLoaded에서 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      observeThemeChange();
    });
  } else {
    init();
    observeThemeChange();
  }
})();
