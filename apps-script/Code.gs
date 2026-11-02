/**
 * PBM Readiness Check: leads and report email for the "PBM Readiness Check: Leads" Google Sheet.
 *
 * The Cloudflare Worker POSTs one JSON request when someone asks for their report. This script
 * checks the shared secret, appends a row to the "Leads" tab (first send only), and emails the
 * report, which the Worker has already rendered as HTML.
 *
 * Script properties (Project Settings > Script properties):
 *   LEADS_SECRET  same value as the Worker secret SHEET_SECRET
 *   SEND_FROM     steve.ditto@nautilushealth.org. Used as the From address if it is a
 *                 "Send mail as" alias of this Google account; otherwise used as Reply-To.
 *
 * Deploy > Manage deployments > Edit > Version: New version keeps the same web app URL.
 */

var SHEET_NAME = "Leads";

var LABELS = {
  role: { sponsor: "Plan sponsor or fiduciary", advisor: "Broker or consultant", attorney: "Attorney", other: "Other" },
  type: { private: "Private employer", multi: "Multiemployer", gov: "Government", church: "Church", unsure: "Not sure" },
  fund: { self: "Self-funded", level: "Level-funded", fully: "Fully insured", unsure: "Not sure" },
  size: { small: "Under 100", mid: "100 to 499", large: "500 or more", unsure: "Not sure" },
  holder: { pbm: "Plan, direct with PBM", tpa: "TPA", carrier: "Insurance carrier", unsure: "Not sure" }
};
var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function doPost(e) {
  var secret = PropertiesService.getScriptProperties().getProperty("LEADS_SECRET");
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply_({ ok: false, error: "bad_json" });
  }
  if (!secret || data.secret !== secret) return reply_({ ok: false, error: "unauthorized" });

  var p = data.profile || {};
  var label = function (k) { return (LABELS[k] && LABELS[k][p[k]]) || ""; };
  var month = function (v) { return /^\d+$/.test(v || "") ? MONTHS[Number(v) - 1] || "" : (v === "unsure" ? "Not sure" : ""); };
  var renewal = /^\d+$/.test(p.rmonth || "") && /^\d{4}$/.test(p.ryear || "") ? month(p.rmonth) + " " + p.ryear : (p.rmonth === "unsure" ? "Not sure" : "");
  var notice = /^\d+$/.test(p.notice || "") ? p.notice + " days" : (p.notice === "unsure" ? "Not sure" : "");

  var row = [
    new Date(),
    safe_(data.email),
    data.consent === true ? "Yes" : "No",
    label("role"), label("type"), label("fund"), label("size"),
    month(p.pymonth), renewal, notice, label("holder"),
    safe_(data.source), safe_(data.embed), safe_(data.pack),
    safe_((data.questions || []).map(function (q, i) { return (i + 1) + ". " + q; }).join("\n"), 5000)
  ];

  if (data.record !== false) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME).appendRow(row);
    } finally {
      lock.releaseLock();
    }
  }

  var emailed = false, error = "";
  if (data.report && data.report.html && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || "")) {
    try {
      var from = PropertiesService.getScriptProperties().getProperty("SEND_FROM") || "";
      var opts = { htmlBody: data.report.html, name: "Nautilus Health Institute" };
      if (from) opts.replyTo = from;
      if (from && GmailApp.getAliases().indexOf(from) >= 0) opts.from = from;
      GmailApp.sendEmail(data.email, data.report.subject || "Your PBM Rule Readiness Report",
        "Your PBM Rule Readiness Report is in this email. If it doesn't display, run the check again at https://www.nautilushealth.org/PBM.", opts);
      emailed = true;
    } catch (err) {
      error = String(err);
    }
  }
  return reply_({ ok: true, emailed: emailed, error: error });
}

// Stop a value from being read as a formula, and cap its length.
function safe_(v, max) {
  var s = String(v == null ? "" : v).slice(0, max || 300);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
