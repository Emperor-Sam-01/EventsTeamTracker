#!/usr/bin/env node
/**
 * Import a billing sheet into the billing_records table.
 *
 * Pulls data directly from Google Sheets (private sheets supported via service account).
 *
 * ── Setup (one-time) ────────────────────────────────────────────────────────
 * 1. Google Cloud Console → APIs & Services → Enable "Google Sheets API"
 * 2. IAM & Admin → Service Accounts → Create service account → Create JSON key
 * 3. Save the JSON key file, e.g. backend/google-credentials.json
 * 4. Add to backend/.env:
 *      GOOGLE_CREDENTIALS_PATH=./google-credentials.json
 * 5. Share each person's billing Google Sheet with the service account email
 *    (found in the JSON key as "client_email") — Viewer access is enough.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   node scripts/import-billing.js \
 *     --sheet-url "https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=0" \
 *     --user-id 3 \
 *     --month 3 \
 *     --year 2026 \
 *     [--tab "March 2026"]      # sheet tab name (default: first visible tab)
 *     [--batch "march-2026-sam"] \
 *     [--dry-run]
 *
 *   # Fallback: still accepts a local CSV file
 *   node scripts/import-billing.js \
 *     --file /path/to/sheet.csv \
 *     --user-id 3 --month 3 --year 2026
 *
 * The script is idempotent: re-running the same batch deletes then re-inserts.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const pool = require('../src/config/database');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const get  = key => { const i = args.indexOf(key); return i !== -1 ? args[i + 1] : null; };
const has  = key => args.includes(key);

const sheetUrl  = get('--sheet-url');
const tabName   = get('--tab');
const filePath  = get('--file');
const userId    = parseInt(get('--user-id'), 10);
const month     = parseInt(get('--month'), 10);
const year      = parseInt(get('--year'), 10);
const dryRun    = has('--dry-run');
const batchArg  = get('--batch');

if ((!sheetUrl && !filePath) || !userId || !month || !year) {
  console.error([
    'Usage:',
    '  node scripts/import-billing.js \\',
    '    --sheet-url "https://docs.google.com/spreadsheets/d/..." \\',
    '    --user-id <id> --month <1-12> --year <yyyy>',
    '    [--tab "Sheet Tab Name"] [--batch <label>] [--dry-run]',
    '',
    '  # or use a local CSV:',
    '  node scripts/import-billing.js \\',
    '    --file /path/to/sheet.csv \\',
    '    --user-id <id> --month <1-12> --year <yyyy>',
  ].join('\n'));
  process.exit(1);
}

const batch = batchArg || `${year}-${String(month).padStart(2,'0')}-u${userId}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseMoney(s) {
  if (!s || String(s).trim() === '') return null;
  const n = parseFloat(String(s).replace(/[$,]/g, '').trim());
  return isNaN(n) ? null : n;
}

function parsePct(s) {
  if (!s || String(s).trim() === '') return null;
  const clean = String(s).replace('%', '').trim();
  const n = parseFloat(clean);
  return isNaN(n) ? null : n / 100;
}

const MONTH_MAP = {
  jan:1,feb:2,mar:3,apr:4,may:5,jun:6,
  jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
};

function parseDate(s) {
  if (!s || String(s).trim() === '') return null;
  const m = String(s).trim().match(/^(\d{1,2})[\s-]([A-Za-z]+)[\s-](\d{4})$/);
  if (!m) return null;
  const mo = MONTH_MAP[m[2].toLowerCase().slice(0, 3)];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}

// ---------------------------------------------------------------------------
// CSV tokeniser (for --file fallback) — handles multi-line quoted fields
// ---------------------------------------------------------------------------
function parseCSV(raw) {
  const rows = [];
  let cur = [], field = '', inQuote = false, i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (inQuote) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuote = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"')  { inQuote = true; i++; continue; }
    if (ch === ',')  { cur.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

// ---------------------------------------------------------------------------
// Google Sheets fetch
// ---------------------------------------------------------------------------
function extractSheetId(url) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) throw new Error(`Cannot extract sheet ID from URL: ${url}`);
  return m[1];
}

async function fetchSheetRows(sheetUrl, tabName) {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH;
  if (!credPath) {
    throw new Error(
      'GOOGLE_CREDENTIALS_PATH not set in .env.\n' +
      'Set it to the path of your Google service account JSON key file.\n' +
      'e.g. GOOGLE_CREDENTIALS_PATH=./google-credentials.json'
    );
  }

  const resolvedCredPath = path.resolve(__dirname, '..', credPath);
  if (!fs.existsSync(resolvedCredPath)) {
    throw new Error(`Credentials file not found: ${resolvedCredPath}`);
  }

  const { google } = require('googleapis');
  const credentials = JSON.parse(fs.readFileSync(resolvedCredPath, 'utf8'));

  console.log(`Service account: ${credentials.client_email}`);
  console.log('(Make sure the billing sheet is shared with this email as Viewer)');

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = extractSheetId(sheetUrl);

  // Resolve tab name — if not specified, use the first visible sheet
  let range;
  if (tabName) {
    range = `'${tabName}'`;
  } else {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const firstSheet = meta.data.sheets.find(s => !s.properties.hidden);
    if (!firstSheet) throw new Error('No visible sheets found in spreadsheet');
    const title = firstSheet.properties.title;
    console.log(`Using tab: "${title}"`);
    range = `'${title}'`;
  }

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: 'FORMATTED_VALUE', // keeps $ signs, % signs, date strings as-is
  });

  return resp.data.values || [];
}

// ---------------------------------------------------------------------------
// Row processor — shared by both CSV and Sheets paths
// ---------------------------------------------------------------------------
const SKIP_SECTION_HEADERS = ['delayed billing', 'advanced billing'];
const SKIP_ROW_KEYWORDS    = ['total gp', 'gp impairment', 'gp after impairment', 'invoice co-broke'];

function processRows(allRows) {
  // Skip the header row
  const dataRows = allRows.slice(1);
  const records = [];
  let inSkipSection = false;

  for (const row of dataRows) {
    // Pad to 26 columns
    while (row.length < 26) row.push('');

    const [
      rowNo, invoiceDate, invoiceNo, accountType, clientName, billingCompany,
      _intercoInvNo, _intercoBillingCo, _po, quotationNo, _supportingDoc,
      invoiceAmtEx, gstAmt, invoiceAmtInc, estimatedCost, estimatedGP,
      gpMarginRaw, personalGPPctRaw, personalGPRaw, remarksBD, remarksFinance,
      dueDate, paymentStatus, paymentDate, impairmentDays, impairmentAmt,
    ] = row;

    const colB = String(invoiceDate || '').trim().toLowerCase();
    const colD = String(accountType  || '').trim().toLowerCase();

    // Detect section headers
    if (SKIP_SECTION_HEADERS.includes(colB) || SKIP_SECTION_HEADERS.includes(colD)) {
      inSkipSection = true;
      continue;
    }

    // Detect summary / footer rows
    const colP = String(estimatedGP  || '').trim().toLowerCase();
    const colQ = String(gpMarginRaw  || '').trim().toLowerCase();
    if (SKIP_ROW_KEYWORDS.some(k => colP.includes(k) || colQ.includes(k) || colB.includes(k) || colD.includes(k))) {
      continue;
    }

    // Skip blank rows
    const cn = String(clientName   || '').trim();
    const iv = String(invoiceNo    || '').trim();
    const am = String(invoiceAmtEx || '').trim();
    if (!cn && !iv && !am) continue;

    // Normalise invoice numbers — Google Sheets returns newlines within a cell value
    const invoiceNosNorm = iv.split('\n').map(s => s.trim()).filter(Boolean).join(', ');

    records.push({
      row_number:          String(rowNo || '').trim() !== '' ? parseInt(String(rowNo).trim(), 10) : null,
      account_type:        String(accountType    || '').trim() || null,
      client_name:         cn || null,
      billing_company:     String(billingCompany || '').trim() || null,
      invoice_nos:         invoiceNosNorm || null,
      quotation_no:        String(quotationNo    || '').trim() || null,
      invoice_amt_ex_gst:  parseMoney(invoiceAmtEx),
      gst_amt:             parseMoney(gstAmt),
      invoice_amt_inc_gst: parseMoney(invoiceAmtInc),
      estimated_cost:      parseMoney(estimatedCost),
      estimated_gp:        parseMoney(estimatedGP),
      gp_margin:           parsePct(gpMarginRaw),
      personal_gp_pct:     parsePct(personalGPPctRaw),
      personal_gp:         parseMoney(personalGPRaw),
      remarks_bd:          String(remarksBD     || '').trim() || null,
      remarks_finance:     String(remarksFinance|| '').trim() || null,
      due_date:            parseDate(dueDate),
      payment_status:      String(paymentStatus || '').trim() || null,
      payment_date:        parseDate(paymentDate),
      impairment_days:     String(impairmentDays || '').trim() !== '' ? parseInt(String(impairmentDays).trim(), 10) : null,
      impairment_amount:   parseMoney(impairmentAmt),
      section:             inSkipSection ? 'delayed' : 'normal',
    });
  }

  return records;
}

// ---------------------------------------------------------------------------
// Database insert
// ---------------------------------------------------------------------------
async function insertRecords(records) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const del = await client.query(
      'DELETE FROM billing_records WHERE user_id=$1 AND period_year=$2 AND period_month=$3 AND import_batch=$4',
      [userId, year, month, batch]
    );
    if (del.rowCount > 0) console.log(`Deleted ${del.rowCount} existing rows for batch "${batch}".`);

    for (const r of records) {
      await client.query(
        `INSERT INTO billing_records (
          user_id, period_month, period_year, row_number, account_type, client_name,
          billing_company, invoice_nos, quotation_no,
          invoice_amt_ex_gst, gst_amt, invoice_amt_inc_gst,
          estimated_cost, estimated_gp, gp_margin,
          personal_gp_pct, personal_gp,
          remarks_bd, remarks_finance,
          due_date, payment_status, payment_date,
          impairment_days, impairment_amount, section, import_batch
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
          $20,$21,$22,$23,$24,$25,$26
        )`,
        [
          userId, month, year, r.row_number, r.account_type, r.client_name,
          r.billing_company, r.invoice_nos, r.quotation_no,
          r.invoice_amt_ex_gst, r.gst_amt, r.invoice_amt_inc_gst,
          r.estimated_cost, r.estimated_gp, r.gp_margin,
          r.personal_gp_pct, r.personal_gp,
          r.remarks_bd, r.remarks_finance,
          r.due_date || null, r.payment_status, r.payment_date || null,
          r.impairment_days, r.impairment_amount, r.section, batch,
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`✓ Inserted ${records.length} records. Batch: "${batch}".`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  let allRows;

  if (sheetUrl) {
    console.log(`Fetching sheet: ${sheetUrl}`);
    allRows = await fetchSheetRows(sheetUrl, tabName);
    console.log(`Fetched ${allRows.length} rows from Google Sheets.`);
  } else {
    const raw = fs.readFileSync(filePath, 'utf8');
    allRows = parseCSV(raw);
    console.log(`Read ${allRows.length} rows from ${filePath}.`);
  }

  const records = processRows(allRows);
  console.log(`Parsed ${records.length} billing records.`);

  if (dryRun) {
    console.log('\nDRY RUN — first 5 records:');
    records.slice(0, 5).forEach((r, i) => console.log(`  [${i+1}]`, JSON.stringify(r)));
    console.log('\nNo database changes made.');
    return;
  }

  await insertRecords(records);
}

main().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
