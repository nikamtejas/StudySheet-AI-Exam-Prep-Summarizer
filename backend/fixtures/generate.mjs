#!/usr/bin/env node
// Generates the synthetic PDF fixtures M1 probes against, into fixtures/pdfs/.
// Run with: node fixtures/generate.mjs (from backend/). Requires `qpdf` on PATH
// (brew install qpdf) for the encrypted fixture — everything else is pure npm.
//
// These are synthetic, not real scans/slides — good enough to exercise every
// branch of the probe logic (text layer present/absent, density, rotation,
// encryption, corruption) without any copyright question over real course
// material.

import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(import.meta.dirname, 'pdfs');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function scanImageBuffer(seed, width = 1200, height = 1600) {
  const lineCount = 14 + (seed % 5);
  const lines = Array.from({ length: lineCount }, (_, i) => {
    const y = 100 + i * (height - 200) / lineCount;
    const w = width * 0.25 + ((seed + i * 53) % (width * 0.45));
    const x = width * 0.08 + ((seed + i * 17) % (width * 0.06));
    return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${Math.round(height * 0.012)}" rx="6" fill="#20232a" opacity="0.85"/>`;
  }).join('');
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f3ecd8"/>
    ${lines}
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

async function buildTyped({ pages = 5, title = 'Typed lecture notes' } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`${title} — page ${i}`, { x: 50, y: 740, size: 18, font: bold });
    const body = [
      'This page contains a normal amount of extracted body text, so the',
      'probe stage should classify it as having a real text layer and',
      `route it down the fast text-extraction path instead of vision. (${i})`,
      'Repeated across every page: lorem ipsum dolor sit amet, consectetur',
      'adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore.',
    ];
    body.forEach((line, idx) => {
      page.drawText(line, { x: 50, y: 690 - idx * 22, size: 12, font });
    });
  }
  return doc;
}

async function buildScannedHandwritten({ pages = 4 } = {}) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const jpg = await scanImageBuffer(i * 7 + 3);
    const img = await doc.embedJpg(jpg);
    const page = doc.addPage([800, 1000]);
    page.drawImage(img, { x: 0, y: 0, width: 800, height: 1000 });
  }
  return doc;
}

async function buildSlides({ pages = 6 } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([960, 540]);
    const jpg = await scanImageBuffer(i * 11 + 1, 960, 460);
    const img = await doc.embedJpg(jpg);
    page.drawImage(img, { x: 0, y: 60, width: 960, height: 460 });
    // Sparse text on purpose — a slide deck's defining trait per the spec.
    page.drawText(`Slide ${i}`, { x: 24, y: 16, size: 14, font });
  }
  return doc;
}

async function buildMixed() {
  const typed = await buildTyped({ pages: 3, title: 'Lecture 3' });
  const scanned = await buildScannedHandwritten({ pages: 2 });
  const merged = await PDFDocument.create();
  for (const p of await merged.copyPages(typed, typed.getPageIndices())) merged.addPage(p);
  for (const p of await merged.copyPages(scanned, scanned.getPageIndices())) merged.addPage(p);
  return merged;
}

async function buildZeroTextLayer({ pages = 2 } = {}) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]); // genuinely blank
  return doc;
}

async function buildRotated() {
  const doc = await buildTyped({ pages: 2, title: 'Rotated notes' });
  doc.getPages()[0].setRotation(degrees(90));
  return doc;
}

async function buildStress({ pages = 100 } = {}) {
  return buildTyped({ pages, title: 'Stress test document' });
}

// Distinct from buildTyped: a running header (identical every page), a
// page-numbered footer, and genuinely unique body content per page — for
// exercising pipeline/prepare.ts's header/footer stripping, which needs
// content that varies per page to prove only the repeated lines get cut.
async function buildLectureWithHeaderFooter({ pages = 5 } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const topics = [
    'the first law of thermodynamics states energy is conserved in a closed system',
    'entropy always increases in an isolated system, which is the second law',
    'a Carnot engine sets the theoretical upper bound on conversion efficiency',
    'phase transitions release or absorb latent heat without a temperature change',
    'the Gibbs free energy determines whether a reaction proceeds spontaneously',
  ];
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText('CS 301 — Thermodynamics', { x: 50, y: 750, size: 10, font: bold });
    page.drawText(`Lecture ${i}: unique topic for this page`, { x: 50, y: 700, size: 14, font: bold });
    const topic = topics[(i - 1) % topics.length];
    page.drawText(`On page ${i} specifically, we cover: ${topic}.`, {
      x: 50,
      y: 660,
      size: 11,
      font,
    });
    page.drawText(`Page ${i} of ${pages}`, { x: 50, y: 40, size: 9, font });
  }
  return doc;
}

async function writePdf(doc, filename) {
  const bytes = await doc.save();
  fs.writeFileSync(path.join(OUT_DIR, filename), bytes);
  console.log(`wrote ${filename} (${(bytes.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  await writePdf(await buildTyped(), 'typed.pdf');
  await writePdf(await buildScannedHandwritten(), 'scanned-handwritten.pdf');
  await writePdf(await buildSlides(), 'slides.pdf');
  await writePdf(await buildMixed(), 'mixed.pdf');
  await writePdf(await buildZeroTextLayer(), 'zero-text-layer.pdf');
  await writePdf(await buildRotated(), 'rotated.pdf');
  await writePdf(await buildStress(), 'stress-100pages.pdf');
  await writePdf(await buildLectureWithHeaderFooter(), 'lecture-with-header-footer.pdf');

  const typedPath = path.join(OUT_DIR, 'typed.pdf');

  const encryptedPath = path.join(OUT_DIR, 'encrypted.pdf');
  execFileSync('qpdf', [
    '--encrypt',
    'sesame',
    'owner-secret',
    '256',
    '--',
    typedPath,
    encryptedPath,
  ]);
  console.log('wrote encrypted.pdf');

  // Truncate a valid PDF mid-stream so the xref/trailer is broken.
  const corruptSource = fs.readFileSync(typedPath);
  const truncated = corruptSource.subarray(0, Math.floor(corruptSource.length * 0.6));
  fs.writeFileSync(path.join(OUT_DIR, 'corrupt.pdf'), truncated);
  console.log('wrote corrupt.pdf');

  // Not a PDF at all, but named .pdf — for MIME-sniffing tests.
  fs.writeFileSync(path.join(OUT_DIR, 'not-a-pdf.pdf'), 'This is actually a plain text file.\n');
  console.log('wrote not-a-pdf.pdf');
}

main();
