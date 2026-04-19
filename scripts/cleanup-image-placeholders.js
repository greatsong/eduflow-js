#!/usr/bin/env node
/**
 * 일회성 정리 스크립트: 기존 프로젝트 챕터에서 `<!-- IMAGE: ... -->` 주석 제거
 *
 * 이미지 자동 생성 기능 제거(v0.5.1) 이후, 과거 챕터에 남아있는
 * 이미지 플레이스홀더 HTML 주석을 일괄 삭제한다.
 *
 * 안전 장치:
 * - dry-run 기본: `--apply` 플래그 없으면 변경 없이 탐색만
 * - 연속 개행 정리: `\n\n\n` → `\n\n` (주석 제거로 생긴 과다 공백 정리)
 * - 백업: 각 파일 변경 전 `<file>.bak-image-removal`로 복사
 *
 * 사용:
 *   node scripts/cleanup-image-placeholders.js                # dry-run
 *   node scripts/cleanup-image-placeholders.js --apply        # 실제 적용
 *   PROJECTS_DIR=/data/projects node scripts/cleanup-image-placeholders.js --apply
 */
import { readdir, readFile, writeFile, stat, copyFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const PROJECTS_DIR = process.env.PROJECTS_DIR || './projects';
const APPLY = process.argv.includes('--apply');
const PATTERN = /<!--\s*IMAGE:[^>]*?-->\s*\n?/g;

async function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

async function main() {
  console.log(`[cleanup] PROJECTS_DIR = ${PROJECTS_DIR}`);
  console.log(`[cleanup] mode = ${APPLY ? 'APPLY (실제 변경)' : 'DRY-RUN (변경 없음)'}`);

  if (!existsSync(PROJECTS_DIR)) {
    console.error(`[cleanup] 디렉터리 없음: ${PROJECTS_DIR}`);
    process.exit(1);
  }

  const projects = await readdir(PROJECTS_DIR, { withFileTypes: true });
  let totalFiles = 0, totalHits = 0, modifiedFiles = 0;

  for (const proj of projects) {
    if (!proj.isDirectory() || proj.name === 'template') continue;
    const docsDir = join(PROJECTS_DIR, proj.name, 'docs');
    const mdFiles = await walk(docsDir);
    for (const f of mdFiles) {
      totalFiles++;
      const raw = await readFile(f, 'utf-8');
      const matches = raw.match(PATTERN);
      if (!matches) continue;
      totalHits += matches.length;
      modifiedFiles++;
      const cleaned = raw.replace(PATTERN, '').replace(/\n{3,}/g, '\n\n');
      console.log(`  [${proj.name}] ${f.replace(PROJECTS_DIR + '/', '')} — ${matches.length}개 주석 제거`);
      if (APPLY) {
        await copyFile(f, f + '.bak-image-removal');
        await writeFile(f, cleaned, 'utf-8');
      }
    }
  }

  console.log(`\n[cleanup] 요약`);
  console.log(`  스캔 파일: ${totalFiles}`);
  console.log(`  주석 포함 파일: ${modifiedFiles}`);
  console.log(`  총 주석 수: ${totalHits}`);
  if (!APPLY && totalHits > 0) {
    console.log(`\n  → 실제 적용하려면: node ${process.argv[1]} --apply`);
  }
  if (APPLY && modifiedFiles > 0) {
    console.log(`\n  백업 파일: *.bak-image-removal (롤백: mv <file>.bak-image-removal <file>)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
