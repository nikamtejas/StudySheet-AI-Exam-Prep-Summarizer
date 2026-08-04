// Client-side page counting for the upload flow — structural only (page
// count), never rendering, same boundary the backend keeps around pdfjs-dist
// (see backend's CLAUDE.md note on why rendering goes through poppler
// instead). This module is only ever reached via a dynamic import from the
// upload page, so pdf.js never loads on the landing route
// (docs/studysheet-milestones.md M7: "no PDF library loaded on this route").
export async function countPdfPages(file: File): Promise<number> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pageCount = doc.numPages;
  await doc.destroy();
  return pageCount;
}
