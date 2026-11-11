// When a word belongs to an item list that is switched off, the app offers to switch it on.
import { compileWorld, worldLists } from './world.js?v=92d0321e';
import { parse } from './parser.js?v=92d0321e';

export const LIST_LABEL = { srd: '5e SRD items', fantasy: 'Fantasy basics', modern: 'Modern day', scifi: 'Science fiction' };
export const listOf = e => (e.src === 'scifi' ? 'scifi' : e.src === 'modern' ? 'modern' : e.src === 'srd' && !e.generic ? 'srd' : 'fantasy');

let cache = { key: '', ctx: null };
// the same world with every list on, built once and reused until the world's own items or words change
export function allListsCtx(world) {
  const key = JSON.stringify([world.items, world.vocabulary]);
  if (cache.key !== key || !cache.ctx) cache = { key, ctx: compileWorld({ ...world, lists: ['srd', 'fantasy', 'modern', 'scifi'] }) };
  return cache.ctx;
}

// Returns null, or { list, label, item } when `text` names something that only a switched-off list has.
export function findOffer(text, world, ctx) {
  if (!text || !text.trim()) return null;
  const full = allListsCtx(world);
  const id = parse(text, full).query.subject;
  if (!id || ctx.byId.has(id)) return null;
  const e = full.byId.get(id);
  if (!e) return null;
  const list = listOf(e);
  if (worldLists(world).includes(list)) return null;
  return { list, label: LIST_LABEL[list], item: e.name };
}
