import * as z from 'zod/v4';
import dicomParser from 'dicom-parser';
import Tesseract from 'tesseract.js';
import { jsonResult, maskPhi, readResource } from './util.js';

async function extractPdfText(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push({ page: pageNumber, text: content.items.map((item) => item.str).join(' ') });
  }
  return { pageCount: document.numPages, pages, text: pages.map((page) => page.text).join('\n\n') };
}

export function registerDocumentTools(server) {
  server.registerTool('dicom_metadata_inspect', {
    title: 'Inspect DICOM Metadata',
    description: 'Inspect DICOM tags and flag PHI-bearing metadata before model use. Does not modify the source file.',
    inputSchema: { resource: z.string().min(1).describe('HTTP(S) URL or path under the allowed medical root') },
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ resource }) => {
    const buffer = await readResource(resource);
    const dataSet = dicomParser.parseDicom(new Uint8Array(buffer));
    const tags = {
      patientName: dataSet.string('x00100010'),
      patientId: dataSet.string('x00100020'),
      birthDate: dataSet.string('x00100030'),
      studyDate: dataSet.string('x00080020'),
      accessionNumber: dataSet.string('x00080050'),
      institutionName: dataSet.string('x00080080'),
      modality: dataSet.string('x00080060'),
      manufacturer: dataSet.string('x00080070'),
      rows: dataSet.uint16('x00280010'),
      columns: dataSet.uint16('x00280011')
    };
    const phiFields = Object.entries(tags)
      .filter(([key, value]) => value && ['patientName', 'patientId', 'birthDate', 'studyDate', 'accessionNumber', 'institutionName'].includes(key))
      .map(([key]) => key);
    return jsonResult({
      status: 'ok',
      modality: tags.modality,
      dimensions: { rows: tags.rows, columns: tags.columns },
      metadata: maskPhi(JSON.stringify(tags)).text,
      phiFields,
      recommendation: 'Remove PHI tags and burned-in annotations before model inference.'
    });
  });

  server.registerTool('extract_pdf_text', {
    title: 'Extract PDF Text',
    description: 'Extract selectable text from a PDF medical report. Scanned PDFs require OCR or a VLM.',
    inputSchema: { resource: z.string().min(1).describe('HTTP(S) URL or path under the allowed medical root') },
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ resource }) => {
    const buffer = await readResource(resource);
    const result = await extractPdfText(buffer);
    return jsonResult({
      status: 'ok',
      pageCount: result.pageCount,
      text: maskPhi(result.text).text,
      pages: result.pages.map((page) => ({ page: page.page, text: maskPhi(page.text).text }))
    });
  });

  server.registerTool('ocr_medical_image', {
    title: 'OCR Medical Image',
    description: 'Run local Tesseract OCR on a report image. Data stays local and output must be reviewed.',
    inputSchema: {
      resource: z.string().min(1).describe('HTTP(S) URL or path under the allowed medical root'),
      languages: z.string().optional().default('eng+chi_sim').describe('Tesseract language list')
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ resource, languages = 'eng+chi_sim' }) => {
    const buffer = await readResource(resource);
    const result = await Tesseract.recognize(buffer, languages, { logger: () => {} });
    return jsonResult({
      status: 'ok',
      confidence: result.data.confidence,
      text: maskPhi(result.data.text || '').text,
      warning: 'OCR output can contain errors and must be checked against the source.'
    });
  });
}
