import fs from 'node:fs/promises';
import path from 'node:path';

export const allowedRoot = path.resolve(process.env.MEDICAL_MCP_ALLOWED_ROOT || process.cwd());

export function jsonResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

export function errorResult(message, code = 'ERROR') {
  return jsonResult({ status: 'error', code, message, safety: 'No patient data was persisted.' });
}

export function maskPhi(input) {
  const redactedTypes = [];
  let text = String(input ?? '');
  const apply = (name, pattern, replacement) => {
    const before = text;
    text = text.replace(pattern, replacement);
    if (before !== text) redactedTypes.push(name);
  };
  apply('email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL_REDACTED]');
  apply('phone_cn', /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, '[PHONE_REDACTED]');
  apply('id_card_cn', /(?<!\d)\d{17}[\dXx](?!\d)/g, '[ID_REDACTED]');
  apply('mrn_like', /(?:病案号|住院号|门诊号|患者编号|MRN|Patient ID)\s*[:：]?\s*[A-Za-z0-9-]{4,}/gi, (m) => m.replace(/[A-Za-z0-9-]{4,}$/, '[MRN_REDACTED]'));
  apply('date_like', /(?<!\d)(?:19|20)\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/g, '[DATE_REDACTED]');
  apply('name_like', /(?:姓名|患者姓名)\s*[:：]?\s*[\u4e00-\u9fa5·]{2,8}/g, (m) => m.replace(/[\u4e00-\u9fa5·]{2,8}$/, '[NAME_REDACTED]'));
  return {
    text,
    redactedTypes: [...new Set(redactedTypes)],
    residualRisk: '正则脱敏不能替代医院级 DICOM/PHI 脱敏流程。'
  };
}

export async function readResource(resource) {
  if (/^https?:\/\//i.test(resource)) {
    const response = await fetch(resource);
    if (!response.ok) throw new Error(`Resource download failed: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  if (/^file:\/\//i.test(resource)) {
    const filePath = path.resolve(new URL(resource).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    return fs.readFile(filePath);
  }
  const filePath = path.resolve(allowedRoot, resource);
  if (!filePath.startsWith(allowedRoot + path.sep) && filePath !== allowedRoot) {
    throw new Error('Local path is outside MEDICAL_MCP_ALLOWED_ROOT');
  }
  return fs.readFile(filePath);
}
