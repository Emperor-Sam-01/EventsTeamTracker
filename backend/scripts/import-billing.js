#!/usr/bin/env node
/**
 * Import a billing CSV into the billing_records table.
 *
 * Usage:
 *   node scripts/import-billing.js \
 *     --file /path/to/sheet.csv \
 *     --user-id 3 \
 *     --month 3 \
 *     --year 2026 \
 *     [--batch "march-2026-sam"] \
 *     [--dry-run]
 *
 * The script is idempotent within a (user_id, period_month, period_year, batch) scope:
 * it deletes existing rows for that batch before re-inserting so re-runs are safe.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const get = key => {
  const i = args.indexOf(key);
  return i !== -1 ? args[i + 1] : null;
};
const has = key => args.includes(key);

const filePath  = get('--file');
const userId    = parseInt(get('--user-id'), 10);
const month     = parseInt(get('--month'), 10);
const year      = parseInt(get('--year'), 10);
const dryRun    = has('--dry-run');
const batchArg  = get('--batch');

if (!filePath || !userId || !month || !year) {
  console.error('Usage: node scripts/import-billing.js --file <path> --user-id <id> --month <1-12> --year <yyyy> [--batch <label>] [--dry-run]');
  process.exit(1);
}

const batch = batchArg || `${year}-${String(month).padStart(2,'0')}-u${userId}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseMoney(s) {
  if (!s || s.trim() === '') return null;
  const n = parseFloat(s.replace(/[$,]/g, '').trim());
  return isNaN(n) ? null : n;
}

function parsePct(s) {
  if (!s || s.trim() === '') return null;
  const n = parseFloat(s.replace('%', '').trim());
  return isNaN(n) ? null : n / 100;
}

const MONTH_NAMES = {
  jan:1,feb:2,mar:3,apr:4,may:5,jun:6,
  jul:7,aug:8,sep:9,oct:10,nov:11,dec:12
};

function parseDate(s) {
  if (!s || s.trim() === '') return null;
  // Handles "31-Mar-2026" and "31 Mar 2026"
  const m = s.trim().match(/^(\d{1,2})[\s-]([A-Za-z]+)[\s-](\d{4})$/);
  if (!m) return null;
  const mo = MONTH_NAMES[m[2].toLowerCase().slice(0,3)];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}

// ---------------------------------------------------------------------------
// CSV tokeniser — handles multi-line quoted fields
// ---------------------------------------------------------------------------
function parseCSV(raw) {
  const rows = [];
  let cur = [];
  let field = '';
  let inQuote = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];
    if (inQuote) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuote = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuote = true; i++; continue; }
    if (ch === ',') { cur.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

// ---------------------------------------------------------------------------
// Sections to skip
// ---------------------------------------------------------------------------
const SKIP_SECTION_HEADERS = ['delayed billing', 'advanced billing'];
const SKIP_ROW_KEYWORDS    = ['total gp', 'gp impairment', 'gp after impairment', 'invoice co-broke'];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const raw = fs.readFileSync(filePath, 'utf8');
  const allRows = parseCSV(raw);

  // Remove header row (row 0 = "No.,Invoice Date,...")
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
      dueDate, paymentStatus, paymentDate, impairmentDays, impairmentAmt
    ] = row;

    const colB = invoiceDate.trim().toLowerCase();
    const colD = accountType.trim().toLowerCase();

    // Detect section header rows ("Delayed Billing", "Advanced Billing")
    if (SKIP_SECTION_HEADERS.includes(colB) || SKIP_SECTION_HEADERS.includes(colD)) {
      inSkipSection = true;
      continue;
    }

    // Detect summary / footer rows
    const colP = (estimatedGP || '').trim().toLowerCase();
    const colQ = (gpMarginRaw || '').trim().toLowerCase();
    if (SKIP_ROW_KEYWORDS.some(k => colP.includes(k) || colQ.includes(k) || colB.includes(k) || colD.includes(k))) {
      continue;
    }

    // Skip truly blank rows
    if (!clientName.trim() && !invoiceNo.trim() && !invoiceAmtEx.trim()) continue;

    // Determine section
    const section = inSkipSection ? 'delayed' : 'normal';

    // Normalise invoice numbers (may be multi-line within a single cell)
    const invoiceNosNorm = invoiceNo.split('\n').map(s => s.trim()).filter(Boolean).join(', ');

    records.push({
      row_number:        rowNo.trim() !== '' ? parseInt(rowNo.trim(), 10) : null,
      account_type:      accountType.trim() || null,
      client_name:       clientName.trim() || null,
      billing_company:   billingCompany.trim() || null,
      invoice_nos:       invoiceNosNorm || null,
      quotation_no:      quotationNo.trim() || null,
      invoice_amt_ex_gst: parseMoney(invoiceAmtEx),
      gst_amt:           parseMoney(gstAmt),
      invoice_amt_inc_gst: parseMoney(invoiceAmtInc),
      estimated_cost:    parseMoney(estimatedCost),
      estimated_gp:      parseMoney(estimatedGP),
      gp_margin:         parsePct(gpMarginRaw),
      personal_gp_pct:   parsePct(personalGPPctRaw),
      personal_gp:       parseMoney(personalGPRaw),
      remarks_bd:        remarksBD.trim() || null,
      remarks_finance:   remarksFinance.trim() || null,
      due_date:          parseDate(dueDate),
      payment_status:    paymentStatus.trim() || null,
      payment_date:      parseDate(paymentDate),
      impairment_days:   impairmentDays.trim() !== '' ? parseInt(impairmentDays.trim(), 10) : null,
      impairment_amount: parseMoney(impairmentAmt),
      section,
    });
  }

  console.log(`Parsed ${records.length} billing records from CSV.`);
  if (dryRun) {
    console.log('DRY RUN — sample records:');
    records.slice(0, 5).forEach((r, i) => console.log(`  [${i+1}]`, JSON.stringify(r)));
    console.log('No database changes made.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete existing rows for this batch (idempotent)
    const del = await client.query(
      'DELETE FROM billing_records WHERE user_id=$1 AND period_year=$2 AND period_month=$3 AND import_batch=$4',
      [userId, year, month, batch]
    );
    if (del.rowCount > 0) console.log(`Deleted ${del.rowCount} existing rows for batch "${batch}".`);

    let inserted = 0;
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
      inserted++;
    }

    await client.query('COMMIT');
    console.log(`Inserted ${inserted} records. Batch: "${batch}".`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
