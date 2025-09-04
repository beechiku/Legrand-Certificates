// === Legrand Certificate Lookup — MULTI + Naming Rules (Apps Script, JSONP) ===
// Rules handled:
//  - LOTs are 7 digits standard (we derive a zero-padded 7-digit variant)
//  - If lot < 1,000,000, filenames may have a leading '0' OR '_' before the lot
//  - Multi-image LOTs: filenames may have trailing parts: "-1", "c", " (c)" etc.
//  - Case-insensitive, ignores spaces in LOT when matching
// Returns all matches sorted by last updated (newest first).
//
// CALL: /exec?lot=1234567&callback=cb123
//
// CONFIG
const FOLDER_ID    = '1udad2EQUWI4U36P3jJgBNG2DgtPUIN2E';
const ALLOWED_EXTS = ['pdf','jpg','jpeg','png'];
const CACHE_SECS   = 300;

function doGet(e) {
  const lotIn = (e && e.parameter && e.parameter.lot || '').trim();
  const cb    = (e && e.parameter && e.parameter.callback || '').trim();
  if (!lotIn) return respond({ ok:false, error:'missing_lot' }, cb);

  const lotRaw  = lotIn;
  const lotDigits = lotIn.replace(/\D+/g, ''); // keep digits only for numeric logic
  const lotNum = lotDigits ? parseInt(lotDigits, 10) : NaN;
  const lot7   = pad7(lotDigits || lotIn);      // best-effort 7-digit
  const lotNorm= normalizeKey(lotIn);           // UPPERCASE + no spaces

  const cacheKey = 'rules_' + lotNorm;
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) return respond(JSON.parse(cached), cb);

  let folder;
  try { folder = DriveApp.getFolderById(FOLDER_ID); }
  catch(err) { return respond({ ok:false, error:'invalid_folder_id' }, cb); }

  // Build candidate prefixes (leading '0' or '_' if lot < 1,000,000)
  const needsPrefixVariant = (isFinite(lotNum) && lotNum < 1000000);
  const prefixes = needsPrefixVariant ? ['', '0', '_'] : [''];

  // Build name bases we accept (raw, normalized, 7-digit)
  const bases = unique([lotRaw, lotNorm, lot7]);

  // Compose a regex that matches:
  //   ^(?:[0_]?)(?:<any of the bases>)(?:[\s\-()]*[0-9A-Za-z]*)?\.(ext)$
  const exts = ALLOWED_EXTS.join('|');
  const baseAlt = bases.map(esc).join('|');
  const prefixAlt = prefixes.map(esc).join('|');
  const rx = new RegExp(
    '^' +
    '(?:' + (prefixAlt || '') + ')' +    // optional 0 or _ (or empty)
    '(?:' + baseAlt + ')' +              // base lot
    '(?:[\\s\-()]*[0-9A-Za-z]*)?' +   // optional suffix like -1, c, (c)
    '\\.(' + exts + ')' +              // extension
    '$',
    'i'
  );

  const items = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const name = f.getName();
    if (rx.test(name)) {
      items.push(fileInfo(f));
    }
  }

  // Also try exact-name lookups (LOT.ext) in case scanning misses due to odd chars
  for (const ext of ALLOWED_EXTS) {
    const namesToTry = [];
    for (const b of bases) {
      namesToTry.push(b + '.' + ext);
      if (needsPrefixVariant) {
        namesToTry.push('0' + b + '.' + ext);
        namesToTry.push('_' + b + '.' + ext);
      }
    }
    for (const nm of namesToTry) {
      const files = toArray(folder.getFilesByName(nm));
      for (const f of files) items.push(fileInfo(f));
    }
  }

  // De-duplicate by fileId, sort newest first
  const uniq = dedupe(items, x => x.fileId).sort((a,b) => b.updated - a.updated);

  const out = uniq.length
    ? { ok:true, lot: lotIn, count: uniq.length, items: uniq, primary: uniq[0] }
    : { ok:false, lot: lotIn, notFound:true, items: [] };

  if (out.ok) cache.put(cacheKey, JSON.stringify(out), CACHE_SECS);
  return respond(out, cb);
}

// Helpers
function pad7(s) { s = String(s).replace(/\D+/g,''); return s.length >= 7 ? s.slice(-7) : ('0000000' + s).slice(-7); }
function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function normalizeKey(s) { return String(s).replace(/\s+/g,'').toUpperCase(); }
function toArray(it) { const arr = []; while (it.hasNext()) arr.push(it.next()); return arr; }
function dedupe(arr, keyFn) { const seen = Object.create(null); const out = []; for (const x of arr) { const k = keyFn(x); if (!seen[k]) { seen[k]=1; out.push(x); } } return out; }
function fileInfo(f) { const id = f.getId(); return { fileId:id, name:f.getName(), updated:f.getLastUpdated(), preview:`https://drive.google.com/file/d/${id}/preview`, view:`https://drive.google.com/uc?export=view&id=${id}`, open:`https://drive.google.com/file/d/${id}/view` }; }
function respond(obj, cb) { const body = JSON.stringify(obj); if (cb) return ContentService.createTextOutput(cb + '(' + body + ');').setMimeType(ContentService.MimeType.JAVASCRIPT); else return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON); }
