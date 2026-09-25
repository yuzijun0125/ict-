import * as z from 'zod/v4';
import { errorResult, jsonResult, maskPhi } from './util.js';

export function registerMedicalTools(server) {
  server.registerTool('health_check', {
    title: 'Medical Toolkit Health Check',
    description: 'Check plugin availability, model proxy configuration and no-persistence mode.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async () => jsonResult({
    status: 'ok',
    name: 'fundus-medical-toolkit',
    features: {
      pubmed: true,
      deidentification: true,
      caseTimeline: true,
      fundusModelProxy: Boolean(process.env.FUNDUS_MODEL_API_URL)
    },
    storage: 'No patient data is persisted by this service.'
  }));

  server.registerTool('deidentify_medical_text', {
    title: 'De-identify Medical Text',
    description: 'Mask common PHI patterns in medical text and report residual risk. Does not persist input.',
    inputSchema: { text: z.string().min(1).max(100000).describe('Medical text to de-identify') },
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ text }) => jsonResult({ status: 'ok', ...maskPhi(text) }));

  server.registerTool('build_case_timeline', {
    title: 'Build Case Timeline',
    description: 'Sort and normalize clinical events by date while preserving conflicts and invalid dates.',
    inputSchema: {
      events: z.array(z.object({
        date: z.string().describe('ISO-like date'),
        type: z.string().describe('Exam, lab, diagnosis, treatment or follow-up'),
        name: z.string(),
        value: z.union([z.string(), z.number()]).optional(),
        unit: z.string().optional(),
        source: z.string().optional()
      })).max(1000)
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ events }) => {
    const normalized = events.map((event, index) => ({ ...event, originalIndex: index, parsedDate: Date.parse(event.date) })).sort((a, b) => {
      if (Number.isNaN(a.parsedDate) && Number.isNaN(b.parsedDate)) return a.originalIndex - b.originalIndex;
      if (Number.isNaN(a.parsedDate)) return 1;
      if (Number.isNaN(b.parsedDate)) return -1;
      return a.parsedDate - b.parsedDate;
    });
    return jsonResult({
      status: 'ok',
      eventCount: normalized.length,
      invalidDates: normalized.filter((event) => Number.isNaN(event.parsedDate)).map((event) => event.originalIndex),
      timeline: normalized.map(({ parsedDate, originalIndex, ...event }) => event)
    });
  });

  server.registerTool('fundus_model_infer', {
    title: 'Fundus Model Inference Proxy',
    description: 'Send a de-identified fundus image and clinical context to the configured internal model endpoint.',
    inputSchema: {
      imageResource: z.string().min(1).describe('De-identified HTTP(S) URL or local path under the allowed root'),
      model: z.string().optional().describe('Optional model identifier'),
      clinicalContext: z.record(z.string(), z.any()).optional().describe('Structured clinical context without PHI')
    },
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ imageResource, model, clinicalContext = {} }) => {
    const modelUrl = process.env.FUNDUS_MODEL_API_URL;
    if (!modelUrl) return errorResult('FUNDUS_MODEL_API_URL is not configured. Add the fundus model endpoint before enabling this tool.', 'MODEL_NOT_CONFIGURED');
    const headers = { 'content-type': 'application/json' };
    if (process.env.FUNDUS_MODEL_API_KEY) headers.authorization = `Bearer ${process.env.FUNDUS_MODEL_API_KEY}`;
    const response = await fetch(modelUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        image_resource: imageResource,
        model: model || process.env.FUNDUS_MODEL_NAME || 'default',
        clinical_context: clinicalContext
      })
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Fundus model failed: HTTP ${response.status} ${body.slice(0, 500)}`);
    return jsonResult({ status: 'ok', model: model || process.env.FUNDUS_MODEL_NAME || 'default', result: JSON.parse(body) });
  });
}
