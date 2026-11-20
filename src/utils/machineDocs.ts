/**
 * Links documents to Fleet Hub machines by model. A document's machine model is written the way the Fleet Hub
 * model list spells it ("C-1550", "883+ Spaleck", "TDS V20"), while a unit's model in the register is longer and
 * sometimes spelt slightly differently ("Finlay C1550P Cone Crusher"). Both are reduced to a short key and compared.
 */

import type { WhsDocument } from './documents.ts';

const BRANDS = new Set(['finlay', 'pilot', 'te', 'terex', 'ecotec', 'crushtec']);

/** Keys for a model text. One text can name several models, separated by "/" ("I-140 / I-120RS"). */
export function modelKeys(text: string): string[] {
  const keys: string[] = [];
  for (const part of text.toLowerCase().replace(/\+/g, '').split('/')) {
    const tokens = part.split(/[\s-]+/).filter(t => t && !BRANDS.has(t));
    let key = '';
    for (const t of tokens) {
      key += t;
      if (/\d/.test(t)) break;
    }
    if (!/\d/.test(key)) continue;
    // The Fleet Hub register has TD820 where the model list has TDS 820
    keys.push(key.replace(/^tds(\d)/, 'td$1'));
  }
  return keys;
}

/** A unit key belongs to a document key when they are equal, or it is a lettered variant of it (C1550P, VS350E). */
function same(unit: string, doc: string): boolean {
  if (unit === doc) return true;
  if (!unit.startsWith(doc)) return false;
  const rest = unit.slice(doc.length);
  return /^[pseh]$/.test(rest) || (rest === 'rs' && doc.startsWith('c'));
}

export function unitMatchesModel(unitModel: string, docModel: string): boolean {
  if (!unitModel || !docModel) return false;
  const units = modelKeys(unitModel);
  return modelKeys(docModel).some(d => units.some(u => same(u, d)));
}

/** Documents that apply to a unit of this model. */
export function docsForUnit<T extends Pick<WhsDocument, 'machine_model'>>(unitModel: string, docs: T[]): T[] {
  return docs.filter(d => unitMatchesModel(unitModel, d.machine_model));
}
