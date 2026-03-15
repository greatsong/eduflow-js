/**
 * 순수 JS 기반 Markdown → DOCX 변환기
 * pandoc 없이 동작하는 폴백 솔루션
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType, TabStopPosition, TabStopType,
  TableOfContents, StyleLevel, PageBreak,
  NumberFormat, Header, Footer, convertInchesToTwip,
} from 'docx';
import { marked } from 'marked';

// HeadingLevel 매핑
const HEADING_MAP = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

/**
 * 인라인 토큰을 TextRun 배열로 변환
 */
function parseInlineTokens(tokens, baseStyle = {}) {
  if (!tokens || tokens.length === 0) return [new TextRun({ text: '', ...baseStyle })];

  const runs = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        runs.push(new TextRun({ text: token.text, ...baseStyle }));
        break;
      case 'strong':
        runs.push(...parseInlineTokens(token.tokens, { ...baseStyle, bold: true }));
        break;
      case 'em':
        runs.push(...parseInlineTokens(token.tokens, { ...baseStyle, italics: true }));
        break;
      case 'codespan':
        runs.push(new TextRun({
          text: token.text,
          font: 'Courier New',
          size: 20, // 10pt
          shading: { type: ShadingType.SOLID, color: 'F0F0F0', fill: 'F0F0F0' },
          ...baseStyle,
        }));
        break;
      case 'link':
        runs.push(new TextRun({
          text: token.text || token.href,
          color: '0066CC',
          underline: {},
          ...baseStyle,
        }));
        break;
      case 'br':
        runs.push(new TextRun({ break: 1 }));
        break;
      case 'escape':
        runs.push(new TextRun({ text: token.text, ...baseStyle }));
        break;
      default:
        // 알 수 없는 인라인 토큰은 raw로 처리
        if (token.raw) {
          runs.push(new TextRun({ text: token.raw, ...baseStyle }));
        }
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text: '', ...baseStyle })];
}

/**
 * 코드 블록을 여러 줄 Paragraph로 변환
 */
function createCodeBlock(text, lang = '') {
  const lines = text.split('\n');
  const paragraphs = [];

  for (let i = 0; i < lines.length; i++) {
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({
          text: lines[i] || ' ', // 빈 줄도 공백으로
          font: 'Courier New',
          size: 18, // 9pt
        }),
      ],
      spacing: { before: 0, after: 0, line: 276 },
      shading: { type: ShadingType.SOLID, color: 'F5F5F5', fill: 'F5F5F5' },
      indent: { left: convertInchesToTwip(0.25) },
    }));
  }

  // 앞뒤 여백
  if (paragraphs.length > 0) {
    paragraphs[0] = new Paragraph({
      ...paragraphs[0],
      spacing: { before: 120, after: 0, line: 276 },
      children: paragraphs[0].root[1]?.root ? undefined : [
        new TextRun({
          text: lines[0] || ' ',
          font: 'Courier New',
          size: 18,
        }),
      ],
      shading: { type: ShadingType.SOLID, color: 'F5F5F5', fill: 'F5F5F5' },
      indent: { left: convertInchesToTwip(0.25) },
    });
  }

  return paragraphs;
}

/**
 * 리스트 아이템을 Paragraph로 변환
 */
function createListItems(items, ordered = false, level = 0) {
  const paragraphs = [];

  items.forEach((item, idx) => {
    const prefix = ordered ? `${idx + 1}. ` : '• ';
    const indent = level * 360 + 360; // twip 단위 들여쓰기

    const inlineRuns = item.tokens
      ? parseInlineTokens(item.tokens.filter((t) => t.type !== 'list'))
      : [new TextRun({ text: item.text || '' })];

    paragraphs.push(new Paragraph({
      children: [
        new TextRun({ text: prefix }),
        ...inlineRuns,
      ],
      spacing: { before: 40, after: 40 },
      indent: { left: indent },
    }));

    // 중첩 리스트
    if (item.tokens) {
      const nestedList = item.tokens.find((t) => t.type === 'list');
      if (nestedList) {
        paragraphs.push(...createListItems(nestedList.items, nestedList.ordered, level + 1));
      }
    }
  });

  return paragraphs;
}

/**
 * 테이블 토큰을 Table로 변환
 */
function createTable(token) {
  const rows = [];

  // 헤더 행
  if (token.header && token.header.length > 0) {
    rows.push(new TableRow({
      tableHeader: true,
      children: token.header.map((cell) => new TableCell({
        children: [new Paragraph({
          children: parseInlineTokens(cell.tokens, { bold: true }),
          alignment: AlignmentType.CENTER,
        })],
        shading: { type: ShadingType.SOLID, color: 'E8E8E8', fill: 'E8E8E8' },
      })),
    }));
  }

  // 본문 행
  for (const row of (token.rows || [])) {
    rows.push(new TableRow({
      children: row.map((cell) => new TableCell({
        children: [new Paragraph({
          children: parseInlineTokens(cell.tokens),
        })],
      })),
    }));
  }

  if (rows.length === 0) return null;

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/**
 * Markdown → DOCX Buffer
 * @param {string} markdown - 합쳐진 마크다운 전체 텍스트
 * @param {string} title - 문서 제목
 * @returns {Promise<Buffer>} DOCX 바이너리 버퍼
 */
export async function markdownToDocx(markdown, title = '교육자료') {
  const tokens = marked.lexer(markdown);
  const children = [];

  // 제목 페이지
  children.push(new Paragraph({ spacing: { before: 3000 } }));
  children.push(new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 56, font: 'Malgun Gothic' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'EduFlow AI로 생성된 교육자료', size: 24, color: '666666' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `생성일: ${new Date().toLocaleDateString('ko-KR')}`, size: 20, color: '999999' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }));

  // 본문 처리
  for (const token of tokens) {
    try {
      switch (token.type) {
        case 'heading':
          children.push(new Paragraph({
            children: parseInlineTokens(token.tokens || [{ type: 'text', text: token.text }]),
            heading: HEADING_MAP[token.depth] || HeadingLevel.HEADING_3,
            spacing: { before: token.depth <= 2 ? 360 : 240, after: 120 },
          }));
          break;

        case 'paragraph':
          children.push(new Paragraph({
            children: parseInlineTokens(token.tokens || [{ type: 'text', text: token.text }]),
            spacing: { before: 60, after: 60 },
          }));
          break;

        case 'code':
          children.push(...createCodeBlock(token.text, token.lang));
          children.push(new Paragraph({ spacing: { before: 60 } })); // 코드 블록 후 여백
          break;

        case 'list':
          children.push(...createListItems(token.items, token.ordered));
          break;

        case 'table':
          const table = createTable(token);
          if (table) {
            children.push(new Paragraph({ spacing: { before: 120 } }));
            children.push(table);
            children.push(new Paragraph({ spacing: { after: 120 } }));
          }
          break;

        case 'blockquote': {
          // 인용 블록 → 들여쓰기 + 왼쪽 선
          const bqTokens = token.tokens || [];
          for (const bqt of bqTokens) {
            if (bqt.type === 'paragraph') {
              children.push(new Paragraph({
                children: parseInlineTokens(bqt.tokens || [{ type: 'text', text: bqt.text }], { italics: true, color: '555555' }),
                indent: { left: convertInchesToTwip(0.5) },
                spacing: { before: 60, after: 60 },
                border: {
                  left: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 8 },
                },
              }));
            }
          }
          break;
        }

        case 'hr':
          children.push(new Paragraph({
            children: [new TextRun({ text: '' })],
            spacing: { before: 200, after: 200 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
            },
          }));
          break;

        case 'space':
          // 빈 줄 무시
          break;

        case 'html':
          // HTML 태그는 무시
          break;

        default:
          // 알 수 없는 토큰 → 텍스트로 출력
          if (token.raw && token.raw.trim()) {
            children.push(new Paragraph({
              children: [new TextRun({ text: token.raw.trim() })],
              spacing: { before: 60, after: 60 },
            }));
          }
      }
    } catch (e) {
      // 개별 토큰 변환 실패 → 건너뛰기
      console.warn('[docxGenerator] 토큰 변환 실패:', token.type, e.message);
    }
  }

  // DOCX 문서 생성
  const doc = new Document({
    title,
    creator: 'EduFlow AI',
    description: 'AI 기반 교육자료',
    styles: {
      default: {
        document: {
          run: {
            font: 'Malgun Gothic',
            size: 22, // 11pt
          },
        },
        heading1: {
          run: { font: 'Malgun Gothic', size: 36, bold: true, color: '1a1a2e' },
          paragraph: { spacing: { before: 480, after: 200 } },
        },
        heading2: {
          run: { font: 'Malgun Gothic', size: 30, bold: true, color: '16213e' },
          paragraph: { spacing: { before: 360, after: 160 } },
        },
        heading3: {
          run: { font: 'Malgun Gothic', size: 26, bold: true, color: '0f3460' },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.2),
            right: convertInchesToTwip(1),
          },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [new TextRun({ text: title, size: 16, color: 'AAAAAA', font: 'Malgun Gothic' })],
            alignment: AlignmentType.RIGHT,
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [new TextRun({ text: 'EduFlow AI | ', size: 16, color: 'AAAAAA' })],
            alignment: AlignmentType.CENTER,
          })],
        }),
      },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}
