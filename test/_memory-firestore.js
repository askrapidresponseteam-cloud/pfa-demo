'use strict';

/* An in-memory Firestore with the firebase-admin shape the backend uses, for
   tests that drive the real route handlers end to end: documents and
   subcollections; get, set (with merge), create, update (dotted paths, a
   lastUpdateTime precondition) and delete; queries with where, orderBy,
   limit, startAfter, select and count; transactions and batches; and the
   FieldValue sentinels (serverTimestamp, increment, arrayUnion, arrayRemove,
   delete). Timestamps are firebase-admin's own, so range queries over them
   compare as they would on the server.

   It is single-threaded and applies writes at once, so it proves what a
   route writes and reads, not how it behaves under contention.

     const db = memoryFirestore();
     require('../lib/firebase')._setDbForTests(db);
     db.dump()  ->  { 'submissions/PFA-Q-2026-00001': {...}, ... } */

const { Timestamp } = require('firebase-admin/firestore');

function clone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Timestamp || Buffer.isBuffer(value) || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(clone);
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = clone(v);
  return out;
}

const kindOf = (v) => (v && typeof v === 'object' && v.constructor ? v.constructor.name : '');
const isSentinel = (v) => /Transform$/.test(kindOf(v));

function resolve(current, value) {
  switch (kindOf(value)) {
    case 'ServerTimestampTransform': return Timestamp.now();
    case 'NumericIncrementTransform': return (Number(current) || 0) + value.operand;
    case 'ArrayUnionTransform': {
      const out = Array.isArray(current) ? current.slice() : [];
      for (const e of value.elements) if (!out.some((x) => JSON.stringify(x) === JSON.stringify(e))) out.push(clone(e));
      return out;
    }
    case 'ArrayRemoveTransform': {
      const drop = value.elements.map((e) => JSON.stringify(e));
      return (Array.isArray(current) ? current : []).filter((x) => !drop.includes(JSON.stringify(x)));
    }
    default: return clone(value);
  }
}

/* Writes an object into a document, resolving sentinels against what is
   there. merge keeps fields not named; a nested plain object merges too. */
function write(target, data, merge) {
  const out = merge ? Object.assign({}, target) : {};
  for (const [k, v] of Object.entries(data || {})) {
    if (kindOf(v) === 'DeleteTransform') { delete out[k]; continue; }
    if (merge && v && typeof v === 'object' && !Array.isArray(v) && !isSentinel(v) && kindOf(v) === 'Object'
        && out[k] && typeof out[k] === 'object' && kindOf(out[k]) === 'Object') {
      out[k] = write(out[k], v, true);
      continue;
    }
    out[k] = isSentinel(v) ? resolve(out[k], v) : (v && kindOf(v) === 'Object' ? write({}, v, false) : clone(v));
  }
  return out;
}

function getPath(data, field) {
  return String(field).split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
}

function setPath(data, field, value) {
  const keys = String(field).split('.');
  let o = data;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (!o[keys[i]] || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]];
  }
  const last = keys[keys.length - 1];
  if (kindOf(value) === 'DeleteTransform') delete o[last];
  else o[last] = isSentinel(value) ? resolve(o[last], value) : clone(value);
}

function comparable(v) {
  if (v instanceof Timestamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return v;
}

function compare(a, b) {
  const x = comparable(a);
  const y = comparable(b);
  if (x === y) return 0;
  if (x === undefined || x === null) return -1;
  if (y === undefined || y === null) return 1;
  return x < y ? -1 : 1;
}

function matches(data, [field, op, value]) {
  const v = getPath(data, field);
  if (v === undefined) return op === '!=' ? false : false;
  const same = (a, b) => JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
  switch (op) {
    case '==': return same(v, value);
    case '!=': return !same(v, value);
    case '<': return compare(v, value) < 0;
    case '<=': return compare(v, value) <= 0;
    case '>': return compare(v, value) > 0;
    case '>=': return compare(v, value) >= 0;
    case 'in': return value.some((x) => same(v, x));
    case 'not-in': return !value.some((x) => same(v, x));
    case 'array-contains': return Array.isArray(v) && v.some((x) => same(x, value));
    case 'array-contains-any': return Array.isArray(v) && v.some((x) => value.some((y) => same(x, y)));
    default: throw new Error(`memory firestore: operator ${op} not supported`);
  }
}

function memoryFirestore() {
  const store = new Map();          // path -> { data, createTime, updateTime }
  let clock = 0;
  const tick = () => { clock += 1; return Timestamp.fromMillis(1790000000000 + clock); };

  function snapshot(ref) {
    const hit = store.get(ref.path);
    const data = hit ? clone(hit.data) : undefined;
    return {
      id: ref.id,
      ref,
      exists: Boolean(hit),
      createTime: hit && hit.createTime,
      updateTime: hit && hit.updateTime,
      data: () => (hit ? clone(hit.data) : undefined),
      get: (field) => (data ? getPath(data, field) : undefined)
    };
  }

  function fail(code, message) { return Object.assign(new Error(`${code} ${message}`), { code }); }

  function docRef(path) {
    const parts = path.split('/');
    const ref = {
      id: parts[parts.length - 1],
      path,
      get parent() { return collectionRef(parts.slice(0, -1).join('/')); },
      collection: (name) => collectionRef(`${path}/${name}`),
      async get() { return snapshot(ref); },
      async set(data, opts) {
        const hit = store.get(path);
        const now = tick();
        store.set(path, { data: write(hit ? hit.data : {}, data, Boolean(opts && opts.merge)), createTime: hit ? hit.createTime : now, updateTime: now });
        return { writeTime: now };
      },
      async create(data) {
        if (store.has(path)) throw fail(6, `ALREADY_EXISTS: ${path}`);
        return ref.set(data);
      },
      async update(data, precondition) {
        const hit = store.get(path);
        if (!hit) throw fail(5, `NOT_FOUND: ${path}`);
        if (precondition && precondition.lastUpdateTime && !precondition.lastUpdateTime.isEqual(hit.updateTime)) {
          throw fail(9, `FAILED_PRECONDITION: ${path}`);
        }
        const next = clone(hit.data);
        for (const [k, v] of Object.entries(data || {})) setPath(next, k, v);
        const now = tick();
        store.set(path, { data: next, createTime: hit.createTime, updateTime: now });
        return { writeTime: now };
      },
      async delete() { store.delete(path); for (const k of [...store.keys()]) if (k.startsWith(`${path}/`)) store.delete(k); }
    };
    return ref;
  }

  function query(collection, spec) {
    const q = {
      where: (field, op, value) => query(collection, Object.assign({}, spec, { filters: spec.filters.concat([[field, op, value]]) })),
      orderBy: (field, dir) => query(collection, Object.assign({}, spec, { orders: spec.orders.concat([[field, dir === 'desc' ? -1 : 1]]) })),
      limit: (n) => query(collection, Object.assign({}, spec, { limit: n })),
      startAfter: (...values) => query(collection, Object.assign({}, spec, { after: values })),
      select: () => q,
      count: () => ({ async get() { const r = await q.get(); return { data: () => ({ count: r.size }) }; } }),
      async get() {
        const depth = collection.split('/').length + 1;
        let docs = [...store.keys()]
          .filter((k) => k.startsWith(`${collection}/`) && k.split('/').length === depth)
          .map((k) => snapshot(docRef(k)))
          .filter((s) => spec.filters.every((f) => matches(s.data(), f)));
        const orders = spec.orders.length ? spec.orders : [];
        /* as Firestore does: a query ordered by a field leaves out every
           document that does not have it */
        docs = docs.filter((s) => orders.every(([field]) => getPath(s.data(), field) !== undefined));
        docs.sort((a, b) => {
          for (const [field, dir] of orders) {
            const c = compare(getPath(a.data(), field), getPath(b.data(), field));
            if (c) return c * dir;
          }
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
        if (spec.after) {
          const marks = spec.after.length === 1 && spec.after[0] && spec.after[0].ref
            ? orders.map(([field]) => spec.after[0].get(field))
            : spec.after;
          const i = docs.findIndex((s) => {
            for (let n = 0; n < orders.length && n < marks.length; n += 1) {
              const c = compare(getPath(s.data(), orders[n][0]), marks[n]) * orders[n][1];
              if (c !== 0) return c > 0;
            }
            return false;
          });
          docs = i < 0 ? [] : docs.slice(i);
        }
        if (spec.limit != null) docs = docs.slice(0, spec.limit);
        return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn) };
      }
    };
    return q;
  }

  function collectionRef(path) {
    const base = query(path, { filters: [], orders: [] });
    let auto = 0;
    return Object.assign(base, {
      id: path.split('/').pop(),
      path,
      doc: (id) => docRef(`${path}/${id == null ? `auto${(auto += 1)}${Date.now().toString(36)}` : id}`),
      async add(data) { const ref = docRef(`${path}/auto${(auto += 1)}${Date.now().toString(36)}`); await ref.set(data); return ref; }
    });
  }

  function writer() {
    const ops = [];
    const api = {
      set(ref, data, opts) { ops.push(() => ref.set(data, opts)); return api; },
      create(ref, data) { ops.push(() => ref.create(data)); return api; },
      update(ref, data, pre) { ops.push(() => ref.update(data, pre)); return api; },
      delete(ref) { ops.push(() => ref.delete()); return api; },
      async commit() {
        /* all or nothing: check every create and update first */
        const plan = ops.slice();
        ops.length = 0;
        const before = new Map(store);
        try { for (const op of plan) await op(); } catch (error) { store.clear(); for (const [k, v] of before) store.set(k, v); throw error; }
        return [];
      }
    };
    return api;
  }

  return {
    collection: collectionRef,
    doc: docRef,
    batch: writer,
    async runTransaction(fn) {
      const tx = writer();
      tx.get = (refOrQuery) => refOrQuery.get();
      const result = await fn(tx);
      await tx.commit();
      return result;
    },
    async getAll(...refs) { return Promise.all(refs.map((r) => r.get())); },
    dump() { const out = {}; for (const [k, v] of store) out[k] = clone(v.data); return out; },
    _store: store
  };
}

module.exports = { memoryFirestore };
