(function () {
  "use strict";

  /* ---------------------------------------------------------------------
   * Storage
   * ------------------------------------------------------------------- */
  var STORAGE_KEYS = {
    company: "sai_company_name",
    masterReports: "sai_master_reports",
    reportTypes: "sai_report_types",
    columnStructure: "sai_column_structure",
    sheetPreference: "sai_sheet_preference",
    headerRowPreference: "sai_header_row_preference",
    formulas: "sai_formulas",
    dateColumnPreference: "sai_date_column_preference",
    dateFormatPreference: "sai_date_format_preference",
    statusColumnPreference: "sai_status_column_preference",
    statusValueMap: "sai_status_value_map",
    masterReportData: "sai_master_report_data",
    setupProgress: "sai_setup_progress",
    columnOrder: "sai_column_order",
    dashboardCustom: "sai_dashboard_custom",
    exportDecoration: "sai_export_decoration"
  };

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /* --- Session activity ----------------------------------------------------
   * A Report Type is "active" only if the user has actually worked with it
   * during this browser visit — started an upload for it or merged its
   * data. Lives in sessionStorage: survives an accidental F5 mid-task,
   * resets when the tab closes, exactly matching "each visit is a fresh
   * standalone task". Merely LOOKING at the All Report Types view never
   * marks anything active. Preview & Export and the Analyse dashboard both
   * default to showing active types only.
   * ------------------------------------------------------------------------ */
  var SESSION_ACTIVE_KEY = "sai_session_active_types";

  function getSessionActiveTypes() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_ACTIVE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function markReportTypeActive(name) {
    if (!name) return;
    var list = getSessionActiveTypes();
    if (list.indexOf(name) !== -1) return;
    list.push(name);
    try { sessionStorage.setItem(SESSION_ACTIVE_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function isReportTypeActive(name) {
    var lower = String(name).toLowerCase();
    return getSessionActiveTypes().some(function (t) { return t.toLowerCase() === lower; });
  }

  function getCompanyName() { return localStorage.getItem(STORAGE_KEYS.company) || ""; }
  function setCompanyName(name) { localStorage.setItem(STORAGE_KEYS.company, name); }

  function formatDateForDisplay(isoStringOrNull) {
    if (!isoStringOrNull) return "";
    var d = new Date(isoStringOrNull);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  // Master Reports: the top-level container shown on the home screen. Only
  // written to once a Report Type's data is actually merged into it (see
  // mergeReportTypeDataIntoMasterReport) — never at the naming-screen step —
  // so a card only appears once a full upload flow has been completed.
  function getMasterReports() { return loadJSON(STORAGE_KEYS.masterReports, []); }
  function saveMasterReports(list) { saveJSON(STORAGE_KEYS.masterReports, list); }
  function getMasterReport(name) {
    return getMasterReports().find(function (m) { return m.name.toLowerCase() === name.toLowerCase(); }) || null;
  }
  function resolveExistingMasterReportName(typed) {
    var match = getMasterReports().find(function (m) { return m.name.toLowerCase() === typed.toLowerCase(); });
    return match ? match.name : typed;
  }
  function upsertMasterReportRegistry(masterReportName, reportTypeName, totalRows, lastUpdated) {
    var list = getMasterReports();
    var entry = list.find(function (m) { return m.name.toLowerCase() === masterReportName.toLowerCase(); });
    if (!entry) {
      entry = { name: masterReportName, reportTypesUsed: [], lastUpdated: lastUpdated, totalRows: totalRows };
      list.push(entry);
    }
    if (entry.reportTypesUsed.indexOf(reportTypeName) === -1) entry.reportTypesUsed.push(reportTypeName);
    entry.lastUpdated = lastUpdated;
    entry.totalRows = totalRows;
    saveMasterReports(list);
  }

  // Report Types are a flat, global, reusable list of source-file templates
  // (e.g. "Amazon Orders") shared across every Master Report that uses them —
  // their sheet/header-row/column/formula/date-column preferences below are
  // all keyed by Report Type alone, not by which Master Report is active.
  function getReportTypes() { return loadJSON(STORAGE_KEYS.reportTypes, []); }
  function saveReportTypes(list) { saveJSON(STORAGE_KEYS.reportTypes, list); }
  function addReportType(name) {
    var list = getReportTypes();
    var exists = list.some(function (t) { return t.toLowerCase() === name.toLowerCase(); });
    if (!exists) { list.push(name); saveReportTypes(list); }
    return list;
  }
  function resolveExistingReportTypeName(typed) {
    var match = getReportTypes().find(function (t) { return t.toLowerCase() === typed.toLowerCase(); });
    return match || typed;
  }

  // Column structure (which columns to keep + what to rename them to) is
  // saved per Report Type, keyed by the *original* column name. Writing is
  // the only thing the column selection screen itself may do with it — its
  // checkboxes/rename inputs are always initialised fresh from the current
  // file's own headers, never prefilled from here, since a value saved in
  // one session must not resurface as if it belonged to a different,
  // later-uploaded file. The read accessor below exists solely for the
  // column-mismatch diff (comparing saved header *names* against the
  // current file's), which is a different concern from prefilling defaults.
  function saveColumnStructureFor(reportType, headerStructure) {
    var all = loadJSON(STORAGE_KEYS.columnStructure, {});
    var existing = all[reportType] || {};
    Object.keys(headerStructure).forEach(function (h) { existing[h] = headerStructure[h]; });
    all[reportType] = existing;
    saveJSON(STORAGE_KEYS.columnStructure, all);
  }
  function getColumnStructureFor(reportType) {
    var all = loadJSON(STORAGE_KEYS.columnStructure, {});
    return all[reportType] || null;
  }

  // Which sheet holds the data is remembered per Report Type, so a report
  // type that's always in, say, "Sheet2" doesn't need to be picked again.
  function getSheetPreference(reportType) {
    var all = loadJSON(STORAGE_KEYS.sheetPreference, {});
    return all[reportType] || "";
  }
  function saveSheetPreference(reportType, sheetName) {
    var all = loadJSON(STORAGE_KEYS.sheetPreference, {});
    all[reportType] = sheetName;
    saveJSON(STORAGE_KEYS.sheetPreference, all);
  }

  // Which row holds the column headers is remembered per Report Type, so
  // the header row screen comes up with the previously-used row already
  // selected instead of always defaulting back to row 1.
  function getHeaderRowPreference(reportType) {
    var all = loadJSON(STORAGE_KEYS.headerRowPreference, {});
    return Object.prototype.hasOwnProperty.call(all, reportType) ? all[reportType] : null;
  }
  function saveHeaderRowPreference(reportType, rowIndex) {
    var all = loadJSON(STORAGE_KEYS.headerRowPreference, {});
    all[reportType] = rowIndex;
    saveJSON(STORAGE_KEYS.headerRowPreference, all);
  }

  // Formulas (validation checks) built on the Formula Builder screen are
  // saved per Report Type, so reopening a report type later pre-fills
  // whatever was built for it.
  function getFormulasFor(reportType) {
    var all = loadJSON(STORAGE_KEYS.formulas, {});
    return all[reportType] || [];
  }
  function saveFormulasFor(reportType, formulas) {
    var all = loadJSON(STORAGE_KEYS.formulas, {});
    all[reportType] = formulas;
    saveJSON(STORAGE_KEYS.formulas, all);
  }

  // Which original column is "the" date column for a Report Type (used to
  // compute the exported "Period covered" range). Saved per Report Type;
  // null/absent means this report type has no date column marked.
  function getDateColumnPreference(reportType) {
    var all = loadJSON(STORAGE_KEYS.dateColumnPreference, {});
    return Object.prototype.hasOwnProperty.call(all, reportType) ? all[reportType] : null;
  }
  function saveDateColumnPreferenceFor(reportType, originalHeaderOrNull) {
    var all = loadJSON(STORAGE_KEYS.dateColumnPreference, {});
    all[reportType] = originalHeaderOrNull;
    saveJSON(STORAGE_KEYS.dateColumnPreference, all);
  }

  // The user-confirmed date format for this Report Type's date column:
  // "dayfirst" (DD/MM/YYYY), "monthfirst" (MM/DD/YYYY) or "excel"
  // (native Excel date cells). Saved from the column screen's format
  // confirmation so next month it's preselected instead of asked again.
  function getDateFormatPreference(reportType) {
    var all = loadJSON(STORAGE_KEYS.dateFormatPreference, {});
    return all[reportType] || null;
  }
  function saveDateFormatPreferenceFor(reportType, format) {
    var all = loadJSON(STORAGE_KEYS.dateFormatPreference, {});
    all[reportType] = format;
    saveJSON(STORAGE_KEYS.dateFormatPreference, all);
  }

  // Which column holds order status (original header, like the date column
  // preference), and how each of its values counts towards dashboard
  // revenue: a per-Report-Type map of normalized status value →
  // "counted" | "excluded". The map is merged (never replaced) on save, so
  // values confirmed in earlier months survive a file that doesn't happen
  // to contain them this month. Dashboard-only: exports keep every row.
  // Returns undefined when this Report Type has never been configured
  // (auto-suggest applies), null when the user explicitly chose "no
  // status column" (no suggestion), or the saved original header.
  function getStatusColumnPreference(reportType) {
    var all = loadJSON(STORAGE_KEYS.statusColumnPreference, {});
    return Object.prototype.hasOwnProperty.call(all, reportType) ? all[reportType] : undefined;
  }
  function saveStatusColumnPreferenceFor(reportType, originalHeaderOrNull) {
    var all = loadJSON(STORAGE_KEYS.statusColumnPreference, {});
    all[reportType] = originalHeaderOrNull;
    saveJSON(STORAGE_KEYS.statusColumnPreference, all);
  }
  function getStatusValueMap(reportType) {
    var all = loadJSON(STORAGE_KEYS.statusValueMap, {});
    return all[reportType] || {};
  }
  function saveStatusValueMapFor(reportType, valueChoices) {
    var all = loadJSON(STORAGE_KEYS.statusValueMap, {});
    var existing = all[reportType] || {};
    Object.keys(valueChoices).forEach(function (k) { existing[k] = valueChoices[k]; });
    all[reportType] = existing;
    saveJSON(STORAGE_KEYS.statusValueMap, all);
  }

  // The actual accumulated dataset for a Master Report: a union of every
  // column seen across all Report Types merged into it so far, one row per
  // source row (blank-filled for columns that row's Report Type doesn't
  // have), tagged with which Report Type it came from, plus a hidden
  // __saiDate bookkeeping field (never rendered/exported) used only to
  // compute "Period covered" at export time.
  function getMasterReportData(masterReportName) {
    var all = loadJSON(STORAGE_KEYS.masterReportData, {});
    return all[masterReportName] || null;
  }
  function saveMasterReportData(masterReportName, data) {
    var all = loadJSON(STORAGE_KEYS.masterReportData, {});
    all[masterReportName] = data;
    saveJSON(STORAGE_KEYS.masterReportData, all);
  }

  // The user's drag-to-reorder column order on the Preview screen, saved
  // per Report Type (like sheet/header-row/column-structure preferences
  // above) rather than per Master Report, so the order sticks the next
  // time this same Report Type is used — including in a brand new Master
  // Report — instead of only within the one Master Report it was set on.
  // This is purely a display/export ordering preference — it never
  // touches data.columns itself (that array's append order still drives
  // internal logic like column-mismatch dedup), so a column from another
  // Report Type merged into the same Master Report (not covered by this
  // order) just lands at the end until reordered again.
  function getColumnOrderFor(reportTypeName) {
    var all = loadJSON(STORAGE_KEYS.columnOrder, {});
    return all[reportTypeName] || null;
  }
  function saveColumnOrderFor(reportTypeName, order) {
    var all = loadJSON(STORAGE_KEYS.columnOrder, {});
    all[reportTypeName] = order;
    saveJSON(STORAGE_KEYS.columnOrder, all);
  }
  function getEffectiveExportColumns(reportTypeName, dataColumns) {
    var saved = getColumnOrderFor(reportTypeName);
    var ordered;
    if (!saved) {
      ordered = dataColumns.slice();
    } else {
      ordered = saved.filter(function (c) { return dataColumns.indexOf(c) !== -1; });
      dataColumns.forEach(function (c) { if (ordered.indexOf(c) === -1) ordered.push(c); });
    }
    // Columns the user deleted on the Preview screen (see the × button in
    // makePreviewHeaderDraggable) are dropped here — from the preview table
    // and the Excel export together, since both are built from this one
    // function — but never from data.columns itself, so the Analysis
    // Dashboard and the stored rows are unaffected and the column can
    // always be restored.
    var deleted = getExportDecorationFor(reportTypeName).deletedColumns;
    return ordered.filter(function (c) { return deleted.indexOf(c) === -1; });
  }

  // Excel export "decoration" (column widths, header bold/fill, per-column
  // number format, freeze header row) is purely cosmetic formatting of the
  // downloaded file — it never touches data.rows/data.columns — and is
  // saved per Report Type, same pattern as column order above, so it's
  // remembered next time this Report Type is exported (including in a
  // brand new Master Report). columnWidths/numberFormats are keyed by
  // column name, using the reserved key EXPORT_SNO_KEY for the S.No.
  // column so a real column literally named "S.No." can't collide with it.
  var EXPORT_SNO_KEY = "__sai_sno__";

  function getExportDecorationFor(reportTypeName) {
    var all = loadJSON(STORAGE_KEYS.exportDecoration, {});
    var saved = all[reportTypeName];
    if (!saved) return { columnWidths: {}, headerBold: false, headerFillColor: "", headerFontColor: "", cellFillColor: "", cellBorders: false, numberFormats: {}, freezeHeader: false, deletedColumns: [] };
    return {
      columnWidths: saved.columnWidths || {},
      headerBold: !!saved.headerBold,
      headerFillColor: saved.headerFillColor || "",
      headerFontColor: saved.headerFontColor || "",
      cellFillColor: saved.cellFillColor || "",
      cellBorders: !!saved.cellBorders,
      numberFormats: saved.numberFormats || {},
      freezeHeader: !!saved.freezeHeader,
      deletedColumns: saved.deletedColumns || []
    };
  }
  function saveExportDecorationFor(reportTypeName, decoration) {
    var all = loadJSON(STORAGE_KEYS.exportDecoration, {});
    all[reportTypeName] = decoration;
    saveJSON(STORAGE_KEYS.exportDecoration, all);
  }

  // The Analysis Dashboard's Custom Analysis picks (Layer 2) are saved per
  // Master Report — which columns the user chose to chart, plus any typed
  // explanation for a column SAI couldn't confidently type on its own —
  // so reopening the dashboard for a report later restores the same charts
  // instead of starting from a blank picker every time.
  function getDashboardCustomFor(masterReportName) {
    var all = loadJSON(STORAGE_KEYS.dashboardCustom, {});
    return all[masterReportName] || { columns: [], explanations: {} };
  }
  function saveDashboardCustomFor(masterReportName, custom) {
    var all = loadJSON(STORAGE_KEYS.dashboardCustom, {});
    all[masterReportName] = custom;
    saveJSON(STORAGE_KEYS.dashboardCustom, all);
  }

  // Deletes a Master Report (template) everywhere it's stored: the home
  // screen registry, its merged row data, its dashboard custom-chart picks,
  // and any in-progress setup records pointing at it. Deliberately leaves
  // every per-Report-Type preference (column structure, formulas, sheet /
  // header row / column order / export decoration) alone — Report Types
  // are a global reusable list shared across Master Reports, so another
  // (or a future) Master Report using the same Report Type keeps working.
  function deleteMasterReportEverywhere(masterReportName) {
    saveMasterReports(getMasterReports().filter(function (m) { return m.name !== masterReportName; }));

    var allData = loadJSON(STORAGE_KEYS.masterReportData, {});
    delete allData[masterReportName];
    saveJSON(STORAGE_KEYS.masterReportData, allData);

    var allCustom = loadJSON(STORAGE_KEYS.dashboardCustom, {});
    delete allCustom[masterReportName];
    saveJSON(STORAGE_KEYS.dashboardCustom, allCustom);

    saveSetupProgressList(getSetupProgressList().filter(function (p) {
      return p.masterReportName.toLowerCase() !== masterReportName.toLowerCase();
    }));
  }

  // Deletes ONE Report Type from ONE Master Report: its rows go, it leaves
  // the card's tile list, and any in-progress setup for that combo is
  // discarded — but the Master Report itself and the Report Type's global
  // reusable prefs (mapping, formulas, etc.) both survive. Columns that end
  // up blank in every remaining row are dropped from the report's column
  // list too, so a column only this Report Type contributed doesn't linger
  // as an empty ghost column in the preview/export (an all-blank column
  // carries no information, so this can never lose data — and a remaining
  // Report Type's next upload re-adds its columns via the normal merge).
  function deleteReportTypeFromMasterReport(masterReportName, reportTypeName) {
    var data = getMasterReportData(masterReportName);
    if (data) {
      data.rows = data.rows.filter(function (r) { return r["Report Type"] !== reportTypeName; });
      data.columns = data.columns.filter(function (c) {
        if (c === "Report Type") return true;
        return data.rows.some(function (r) {
          var v = r[c];
          return v !== undefined && v !== null && String(v).trim() !== "";
        });
      });
      if (data.typeMeta) delete data.typeMeta[reportTypeName];
      saveMasterReportData(masterReportName, data);
    }

    var list = getMasterReports();
    var entry = list.find(function (m) { return m.name.toLowerCase() === masterReportName.toLowerCase(); });
    if (entry) {
      entry.reportTypesUsed = entry.reportTypesUsed.filter(function (t) { return t !== reportTypeName; });
      entry.totalRows = data ? data.rows.length : 0;
      saveMasterReports(list);
    }

    clearSetupProgress(masterReportName, reportTypeName);
  }

  /* --- Date column parsing ----------------------------------------------
   * Turning the marked date column into __saiDate has to survive what
   * marketplace files actually contain:
   *   - Excel-native date cells arrive as SERIAL NUMBERS because files are
   *     read with raw:true (e.g. 46216) — new Date(46216) is Jan 1970.
   *   - Indian reports write day-first text ("13/07/2026") — new Date()
   *     either misreads it as month-first or rejects it outright.
   * buildDateParserFor scans the whole column once per merge to decide how
   * to read it (serial vs text; day-first vs month-first, proven by any
   * value whose first part exceeds 12, defaulting to day-first), then
   * parses every row with that one decision instead of guessing per cell.
   * ------------------------------------------------------------------- */
  var EXCEL_EPOCH_OFFSET_DAYS = 25569; // Excel serial for 1970-01-01

  function excelSerialToISO(serial) {
    // Sanity window ~1954–2118: a number outside it isn't a date serial.
    if (serial < 20000 || serial >= 80000) return null;
    return new Date(Math.round((serial - EXCEL_EPOCH_OFFSET_DAYS) * 86400000)).toISOString();
  }

  var DATE_TRIPLE_RE = /^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

  function parseTripleDate(str, dayFirst) {
    var m = DATE_TRIPLE_RE.exec(str);
    if (!m) return null;
    var a = parseInt(m[1], 10), b = parseInt(m[2], 10), c = parseInt(m[3], 10);
    var year, month, day;
    if (m[1].length === 4) { year = a; month = b; day = c; }
    else {
      year = c < 100 ? 2000 + c : c;
      if (dayFirst) { day = a; month = b; } else { month = a; day = b; }
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    var d = new Date(Date.UTC(year, month - 1, day,
      parseInt(m[4] || "0", 10), parseInt(m[5] || "0", 10), parseInt(m[6] || "0", 10)));
    // Reject silent rollovers like 31/02 → 3 March.
    if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return d.toISOString();
  }

  // Auto-detection of a date column's format, used only as the DEFAULT
  // suggestion in the column screen's format confirmation (the user has
  // the final say — marketplaces differ too much to guess silently).
  // "proven" means the values themselves settle it: mostly-numeric cells
  // are Excel serials, and any dd/mm-style value with a first part over 12
  // proves day-first (second part over 12 proves month-first).
  function detectDateFormatForColumn(values) {
    var total = 0, numeric = 0, proven = null;
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (v === "" || v === null || v === undefined) continue;
      total++;
      if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v).trim())) { numeric++; continue; }
      var m = DATE_TRIPLE_RE.exec(String(v).trim());
      if (!m || m[1].length === 4) continue;
      if (!proven) {
        if (parseInt(m[1], 10) > 12) proven = "dayfirst";
        else if (parseInt(m[2], 10) > 12) proven = "monthfirst";
      }
    }
    if (total && numeric > total / 2) return { format: "excel", proven: true };
    if (proven) return { format: proven, proven: true };
    return { format: "dayfirst", proven: false }; // ambiguous → Indian default
  }

  // Every parsed date is standardised to DD/MM/YYYY in the stored rows and
  // therefore in the preview, the exported cells and the "Period covered"
  // line — regardless of what format the source file used. Local date
  // parts, matching how the dates were displayed to the user everywhere
  // else (en-IN locale).
  function formatDateDDMMYYYY(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    var dd = d.getDate(), mm = d.getMonth() + 1;
    return (dd < 10 ? "0" : "") + dd + "/" + (mm < 10 ? "0" : "") + mm + "/" + d.getFullYear();
  }

  function buildDateParserFor(rows, dateColumnKey, formatPreference) {
    var dayFirst;
    if (formatPreference === "dayfirst") dayFirst = true;
    else if (formatPreference === "monthfirst") dayFirst = false;
    else {
      // No explicit confirmation ("excel", or older data with none saved):
      // fall back to auto-detection over the column.
      dayFirst = detectDateFormatForColumn(rows.map(function (r) { return r[dateColumnKey]; })).format !== "monthfirst";
    }
    return function (value) {
      if (value === "" || value === null || value === undefined) return null;
      if (typeof value === "number") return excelSerialToISO(value);
      var str = String(value).trim();
      if (!str) return null;
      if (/^\d+(\.\d+)?$/.test(str)) return excelSerialToISO(parseFloat(str));
      var triple = parseTripleDate(str, dayFirst);
      if (triple) return triple;
      var d = new Date(str); // month-name formats ("13 Jul 2026"), ISO with time, …
      return isNaN(d.getTime()) ? null : d.toISOString();
    };
  }

  // How many rows already stored for this Master Report belong to this
  // Report Type — surfaced on the data-mode choice screen so the user
  // knows what "Replace" would remove and what "Add" would build on top of.
  function getReportTypeRowCount(masterReportName, reportTypeName) {
    var data = getMasterReportData(masterReportName);
    if (!data || !data.rows) return 0;
    return data.rows.filter(function (r) { return r["Report Type"] === reportTypeName; }).length;
  }

  // mode "replace" drops every row already stored for this Report Type
  // before merging the new ones in, so re-uploading a corrected file
  // doesn't pile its rows on top of the old ones; mode "add" (the
  // long-standing default) keeps prior rows and appends.
  function mergeReportTypeDataIntoMasterReport(masterReportName, reportTypeName, finalColumns, rows, fileMeta, dateColumnKey, mode) {
    var data = getMasterReportData(masterReportName) || { columns: ["Report Type"], rows: [], uploadedFiles: [], lastUpdated: null };

    if (mode === "replace") {
      data.rows = data.rows.filter(function (r) { return r["Report Type"] !== reportTypeName; });
    }

    finalColumns.forEach(function (c) {
      if (data.columns.indexOf(c) === -1) data.columns.push(c);
    });

    var parseDateValue = dateColumnKey
      ? buildDateParserFor(rows, dateColumnKey, getDateFormatPreference(reportTypeName))
      : null;
    rows.forEach(function (row) {
      var mergedRow = { "Report Type": reportTypeName };
      data.columns.forEach(function (c) {
        if (c === "Report Type") return;
        mergedRow[c] = Object.prototype.hasOwnProperty.call(row, c) ? row[c] : "";
      });
      mergedRow.__saiDate = parseDateValue ? parseDateValue(row[dateColumnKey]) : null;
      // Standardise the date column's visible value to DD/MM/YYYY wherever
      // it parsed — serials, day-first or month-first text all come out
      // identical in the preview and the exported file. Unparseable values
      // keep their original text rather than silently vanishing.
      if (mergedRow.__saiDate) mergedRow[dateColumnKey] = formatDateDDMMYYYY(new Date(mergedRow.__saiDate));
      data.rows.push(mergedRow);
    });

    data.uploadedFiles.push({ name: fileMeta.name, size: fileMeta.size });
    data.lastUpdated = new Date().toISOString();
    // Per-Report-Type freshness, shown on the Preview/Analyse chips so old
    // data is visibly old. Types merged before this field existed simply
    // have no entry ("last updated: unknown").
    if (!data.typeMeta) data.typeMeta = {};
    data.typeMeta[reportTypeName] = { lastUpdated: data.lastUpdated, fileName: fileMeta.name };
    saveMasterReportData(masterReportName, data);

    markReportTypeActive(reportTypeName);
    upsertMasterReportRegistry(masterReportName, reportTypeName, data.rows.length, data.lastUpdated);
  }

  function isDuplicateFileUpload(masterReportName, fileName, fileSize) {
    if (!masterReportName) return false;
    var data = getMasterReportData(masterReportName);
    if (!data || !data.uploadedFiles) return false;
    return data.uploadedFiles.some(function (f) { return f.name === fileName && f.size === fileSize; });
  }

  // Setup progress: tracks a Master Report + Report Type combo that the user
  // has started but not yet finished (i.e. not yet merged into the Master
  // Report — see mergeReportTypeDataIntoMasterReport). Each record's
  // "snapshot" holds just enough of the in-flight, normally-ephemeral upload
  // state (parsed headers/rows, column choices) to rebuild the exact screen
  // the user stopped on without asking them to re-upload the file. A record
  // is removed the moment that Report Type's setup is actually completed.
  var SETUP_STEP_LABELS = { 2: "File upload", 3: "Column mapping", 4: "Formula builder" };
  var SETUP_TOTAL_STEPS = 5;

  function getSetupProgressList() { return loadJSON(STORAGE_KEYS.setupProgress, []); }
  function saveSetupProgressList(list) { saveJSON(STORAGE_KEYS.setupProgress, list); }

  function findSetupProgressEntry(list, masterReportName, reportTypeName) {
    return list.find(function (p) {
      return p.masterReportName.toLowerCase() === masterReportName.toLowerCase() &&
        p.reportTypeName.toLowerCase() === reportTypeName.toLowerCase();
    });
  }

  function recordSetupProgress(masterReportName, reportTypeName, step, snapshot) {
    if (!masterReportName || !reportTypeName) return;
    var list = getSetupProgressList();
    var entry = findSetupProgressEntry(list, masterReportName, reportTypeName);
    if (!entry) {
      list.push({ masterReportName: masterReportName, reportTypeName: reportTypeName, step: step, snapshot: snapshot || null, lastUpdated: new Date().toISOString() });
    } else {
      if (step >= entry.step) {
        entry.step = step;
        if (snapshot) entry.snapshot = snapshot;
      }
      entry.lastUpdated = new Date().toISOString();
    }
    saveSetupProgressList(list);
  }

  function clearSetupProgress(masterReportName, reportTypeName) {
    if (!masterReportName || !reportTypeName) return;
    var list = getSetupProgressList().filter(function (p) {
      return !(p.masterReportName.toLowerCase() === masterReportName.toLowerCase() &&
        p.reportTypeName.toLowerCase() === reportTypeName.toLowerCase());
    });
    saveSetupProgressList(list);
  }

  // Only Master Reports with zero completed Report Types are "in progress" —
  // once at least one Report Type has been merged, the Master Report is a
  // Template (see getMasterReports()) and stays one even if another Report
  // Type is later started and abandoned on it. Grouped by Master Report name
  // since that's the unit shown on the home screen; when a Master Report has
  // more than one incomplete Report Type, the most recently touched one
  // represents the card (its step/snapshot drive the progress bar and Resume).
  function getInProgressMasterReports() {
    var completedNames = getMasterReports().map(function (m) { return m.name.toLowerCase(); });
    var groups = {};
    getSetupProgressList().forEach(function (p) {
      if (completedNames.indexOf(p.masterReportName.toLowerCase()) !== -1) return;
      var key = p.masterReportName.toLowerCase();
      if (!groups[key] || new Date(p.lastUpdated) > new Date(groups[key].lastUpdated)) {
        groups[key] = p;
      }
    });
    return Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) {
      return new Date(b.lastUpdated) - new Date(a.lastUpdated);
    });
  }

  /* ---------------------------------------------------------------------
   * App state (in-memory, per session)
   * ------------------------------------------------------------------- */
  var state = {
    companyName: "",
    fileName: "",
    fileSize: 0,
    selectedMasterReport: "",
    selectedReportType: "",
    selectedSheetName: "",
    selectedHeaderRowIndex: 0,
    selectedColumns: [],
    selectedDateColumnHeader: "", // renamed key of the marked date column, "" = none
    dataMode: "" // "replace" or "add" — how this upload's rows join any rows already stored for this Report Type
  };

  /* ---------------------------------------------------------------------
   * Global error surfacing
   *
   * Anything that throws uncaught (or rejects unhandled) used to die
   * silently in the console — the screen just stopped responding with no
   * clue why. This toast turns that into one honest line the user can act
   * on or report. Handled failures stay handled; only genuinely
   * unexpected errors (plus the few caught-but-degraded paths that opt in
   * by calling showErrorToast directly) surface here.
   * ------------------------------------------------------------------- */
  var errorToastTimer = null;
  function showErrorToast(message) {
    var toast = document.getElementById("errorToast");
    document.getElementById("errorToastText").textContent = message;
    toast.hidden = false;
    if (errorToastTimer) clearTimeout(errorToastTimer);
    errorToastTimer = setTimeout(function () { toast.hidden = true; }, 12000);
  }
  document.getElementById("errorToastClose").addEventListener("click", function () {
    document.getElementById("errorToast").hidden = true;
  });
  window.addEventListener("error", function (e) {
    showErrorToast("Something went wrong: " + (e.message || "unknown error") + ". If this keeps happening, take a screenshot and report it.");
  });
  window.addEventListener("unhandledrejection", function (e) {
    var reason = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    showErrorToast("Something went wrong: " + reason + ". If this keeps happening, take a screenshot and report it.");
  });

  /* ---------------------------------------------------------------------
   * Screen navigation
   *
   * A few screens are reachable from more than one place in the flow, so
   * the "go back one step" button on them needs to know where "one step
   * back" actually points this time rather than a single hardcoded target:
   *   - companyReturnScreen: where btnCompanyBack returns to — the landing
   *     screen on first-run setup, or whichever screen "Edit company" (in
   *     the topbar, visible on every screen) was clicked from.
   *   - dashboardEntryScreen: whether the Dashboard was opened from the
   *     Preview screen (via Download & Analyse) or straight from a Home
   *     card's "Analyse" button — btnDashboardBackPreview only makes sense
   *     (and is only shown) in the former case.
   * Both are set right before the showScreen() call that navigates TO the
   * screen in question, at every place that does so.
   * ------------------------------------------------------------------- */
  var companyReturnScreen = "screen-landing";
  var dashboardEntryScreen = "screen-home";

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("screen--active", el.id === id);
    });
    var topbar = document.getElementById("topbar");
    topbar.hidden = id === "screen-landing";
    if (!topbar.hidden) {
      document.getElementById("topbarCompany").textContent = state.companyName ? "🏢 " + state.companyName : "";
    }
    if (id === "screen-upload") renderUploadExistingFile();
    window.scrollTo(0, 0);
  }

  /* ---------------------------------------------------------------------
   * File upload + parsing
   *
   * currentFileHeaders is the ONLY source the column selection screen may
   * read from. It is set in exactly one place (extractHeadersAndRows,
   * called once the user's chosen sheet + header row are known) and
   * cleared in exactly one other place (resetFileState). Nothing here
   * ever touches localStorage.
   *
   * currentWorkbook holds the parsed, multi-sheet workbook for the
   * just-uploaded file so the Sheet Selection and Header Row screens can
   * re-derive headers/rows for whichever sheet + row the user picks,
   * without re-reading the file from disk.
   *
   * currentRenamedRows holds the final, included+renamed row data (built
   * once column selection is confirmed) — this is what formulas compute
   * against and what actually gets merged into the Master Report.
   * ------------------------------------------------------------------- */
  var fileInput = document.getElementById("fileInput");
  var dropzone = document.getElementById("dropzone");
  var dropzoneFilename = document.getElementById("dropzoneFilename");
  var uploadError = document.getElementById("uploadError");
  var btnUploadContinue = document.getElementById("btnUploadContinue");
  var uploadExistingWrap = document.getElementById("uploadExistingWrap");
  var uploadExistingFilename = document.getElementById("uploadExistingFilename");
  var btnUploadNext = document.getElementById("btnUploadNext");

  var currentWorkbook = null;
  var currentFileHeaders = [];
  var currentFileRows = [];
  var currentRenamedRows = [];
  var cameFromSheetScreen = false;

  // Snapshot of the Master Report's data + registry entry taken immediately
  // before the Formula screen's Next button merges this upload's rows in —
  // lets the Preview screen's "Back to Formulas" button restore this exact
  // pre-merge state before returning, so re-clicking Next (with or without
  // formula edits) performs one clean merge instead of appending duplicate
  // rows on top of the ones already merged. Only applied if the context
  // (same Master Report + Report Type) still matches when Back is clicked.
  var preMergeSnapshot = null;

  dropzone.addEventListener("click", function () { fileInput.click(); });
  dropzone.addEventListener("dragover", function (e) { e.preventDefault(); dropzone.classList.add("dropzone--drag"); });
  dropzone.addEventListener("dragleave", function () { dropzone.classList.remove("dropzone--drag"); });
  dropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    dropzone.classList.remove("dropzone--drag");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      readUploadedFile(e.dataTransfer.files[0]);
    }
  });
  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files[0]) readUploadedFile(fileInput.files[0]);
  });

  function showUploadError(message) {
    uploadError.textContent = message;
    uploadError.hidden = false;
    btnUploadContinue.disabled = true;
  }

  function readUploadedFile(file) {
    uploadError.hidden = true;
    currentWorkbook = null;
    currentFileHeaders = [];
    currentFileRows = [];
    btnUploadContinue.disabled = true;
    renderUploadExistingFile();

    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      showUploadError("Unsupported file type. Please upload a .csv, .xlsx or .xls file.");
      return;
    }

    var reader = new FileReader();
    reader.onerror = function () {
      showUploadError("Could not read this file.");
    };
    reader.onload = function (event) {
      try {
        var data = new Uint8Array(event.target.result);
        // raw:true keeps every cell as the literal value from the file
        // instead of letting SheetJS silently reinterpret ambiguous text.
        var workbook = XLSX.read(data, { type: "array", raw: true });
        if (!workbook.SheetNames.length) throw new Error("File appears to be empty.");

        currentWorkbook = workbook;
        state.fileName = file.name;
        state.fileSize = file.size;
        dropzoneFilename.textContent = file.name;
        console.log("[SAI] Workbook \"" + file.name + "\" parsed with " + workbook.SheetNames.length + " sheet(s):", workbook.SheetNames);

        btnUploadContinue.disabled = false;
        renderUploadExistingFile();
      } catch (err) {
        showUploadError("Could not read this file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Shared by the default single-sheet path and the Header Row screen: pulls
  // the header row + all data rows out of one sheet, given which row (0-based)
  // holds the column names.
  function extractHeadersAndRows(sheet, headerRowIndex) {
    var sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
    if (!sheetRows.length) throw new Error("Sheet appears to be empty.");
    if (headerRowIndex >= sheetRows.length) throw new Error("Selected header row is out of range.");

    var headerRow = sheetRows[headerRowIndex];
    var headers = [];
    var headerColumnIndexes = [];
    for (var col = 0; col < headerRow.length; col++) {
      var headerText = String(headerRow[col]).trim();
      if (headerText !== "") {
        headers.push(headerText);
        headerColumnIndexes.push(col);
      }
    }
    if (!headers.length) throw new Error("Could not find a header row.");

    var dataRows = [];
    for (var r = headerRowIndex + 1; r < sheetRows.length; r++) {
      var rawRow = sheetRows[r];
      var isBlankRow = !rawRow || rawRow.every(function (cell) { return cell === "" || cell === null || cell === undefined; });
      if (isBlankRow) continue;
      var rowObj = {};
      for (var c = 0; c < headers.length; c++) {
        rowObj[headers[c]] = rawRow[headerColumnIndexes[c]];
      }
      dataRows.push(rowObj);
    }

    return { headers: headers, rows: dataRows };
  }

  // Applies each included column's include/rename choice, producing rows
  // keyed by the FINAL renamed column names — this is what formulas and the
  // Master Report merge operate on, not the raw original-header rows.
  function buildRenamedRows(rawRows, structure) {
    return rawRows.map(function (row) {
      var out = {};
      Object.keys(structure).forEach(function (origHeader) {
        var col = structure[origHeader];
        if (col.include) out[col.renameTo] = row[origHeader];
      });
      return out;
    });
  }

  /* ---------------------------------------------------------------------
   * Screen: Landing
   * ------------------------------------------------------------------- */
  document.getElementById("btnGetStarted").addEventListener("click", function () {
    state.companyName = getCompanyName();
    if (!state.companyName) {
      companyReturnScreen = "screen-landing";
      showScreen("screen-company");
    } else {
      renderHomeScreen();
      showScreen("screen-home");
    }
  });

  /* ---------------------------------------------------------------------
   * Screen: Company setup
   * ------------------------------------------------------------------- */
  var inputCompanyName = document.getElementById("inputCompanyName");
  document.getElementById("btnSaveCompany").addEventListener("click", function () {
    var name = inputCompanyName.value.trim();
    if (!name) {
      inputCompanyName.focus();
      return;
    }
    setCompanyName(name);
    state.companyName = name;
    renderHomeScreen();
    showScreen("screen-home");
  });
  document.getElementById("btnCompanyBack").addEventListener("click", function () {
    showScreen(companyReturnScreen || "screen-home");
  });
  document.getElementById("btnEditCompany").addEventListener("click", function () {
    // Captured before switching screens, since the topbar (and therefore
    // this button) is reachable from every screen except Landing.
    var active = document.querySelector(".screen--active");
    companyReturnScreen = active ? active.id : "screen-home";
    inputCompanyName.value = state.companyName || getCompanyName();
    showScreen("screen-company");
  });

  function resetFileState() {
    uploadExpressPlanPending = null;
    state.fileName = "";
    state.fileSize = 0;
    state.selectedSheetName = "";
    state.selectedHeaderRowIndex = 0;
    state.selectedColumns = [];
    state.selectedDateColumnHeader = "";
    state.dataMode = "";
    currentWorkbook = null;
    currentFileHeaders = [];
    currentFileRows = [];
    currentRenamedRows = [];
    cameFromSheetScreen = false;
    btnUploadContinue.disabled = true;
    dropzoneFilename.textContent = "";
    fileInput.value = "";
    uploadError.hidden = true;
  }

  var startOverModal = document.getElementById("startOverModal");

  document.getElementById("btnStartOver").addEventListener("click", function () {
    startOverModal.hidden = false;
  });

  document.getElementById("btnStartOverCancel").addEventListener("click", function () {
    startOverModal.hidden = true;
  });

  document.getElementById("btnStartOverConfirm").addEventListener("click", function () {
    startOverModal.hidden = true;
    localStorage.clear();
    resetFileState();
    state.companyName = "";
    state.selectedMasterReport = "";
    state.selectedReportType = "";
    renderHomeScreen();
    showScreen("screen-home");
  });

  /* ---------------------------------------------------------------------
   * Backup & restore
   *
   * The backup file holds every SAI localStorage key exactly as stored
   * (raw strings, never re-parsed) so a restore round-trips byte-identical
   * and this code needs no updating when a key's internal shape evolves.
   * Restore replaces rather than merges: the whole file is validated
   * before a single key is written, so a bad file can never leave the app
   * half-restored, and only keys with the sai_ prefix are ever written so
   * a malformed file can't inject arbitrary browser storage.
   * ------------------------------------------------------------------- */
  var BACKUP_MARKER = "sai-backup";
  var backupFileInput = document.getElementById("backupFileInput");

  function showBackupMessage(text, isError) {
    var el = document.getElementById("backupMsg");
    el.textContent = text;
    el.className = isError ? "error" : "hint";
    el.hidden = false;
  }

  function buildBackupObject() {
    var data = {};
    Object.keys(STORAGE_KEYS).forEach(function (name) {
      var raw = localStorage.getItem(STORAGE_KEYS[name]);
      if (raw !== null) data[STORAGE_KEYS[name]] = raw;
    });
    return { app: BACKUP_MARKER, version: 1, createdAt: new Date().toISOString(), data: data };
  }

  function downloadBackup() {
    var blob = new Blob([JSON.stringify(buildBackupObject(), null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "SAI-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // Counts shown in the restore confirmation, read from the backup's own
  // contents (not the current app state) so the user knows what they're
  // about to restore before anything is replaced.
  function describeBackupContents(backup) {
    var masterReports = 0;
    var reportTypes = 0;
    try { masterReports = JSON.parse(backup.data[STORAGE_KEYS.masterReports] || "[]").length; } catch (e) {}
    try { reportTypes = JSON.parse(backup.data[STORAGE_KEYS.reportTypes] || "[]").length; } catch (e) {}
    return masterReports + " Master Report" + (masterReports === 1 ? "" : "s") +
      ", " + reportTypes + " Report Type" + (reportTypes === 1 ? "" : "s");
  }

  function restoreFromBackupFile(file) {
    var reader = new FileReader();
    reader.onerror = function () {
      showBackupMessage("Could not read \"" + file.name + "\".", true);
    };
    reader.onload = function (event) {
      var backup;
      try {
        backup = JSON.parse(event.target.result);
      } catch (err) {
        showBackupMessage("\"" + file.name + "\" is not a valid backup file (not readable as JSON). Nothing was changed.", true);
        return;
      }
      if (!backup || backup.app !== BACKUP_MARKER || !backup.data || typeof backup.data !== "object") {
        showBackupMessage("\"" + file.name + "\" is not a SAI backup file. Nothing was changed.", true);
        return;
      }
      if (backup.version !== 1) {
        showBackupMessage("This backup was made by a newer version of SAI and can't be restored here. Nothing was changed.", true);
        return;
      }

      var summary = describeBackupContents(backup);
      var when = formatDateForDisplay(backup.createdAt) || "unknown date";
      var ok = window.confirm(
        "Restore the backup from " + when + " (" + summary + ")?\n\n" +
        "This REPLACES all current SAI data — master reports, report types, mappings, formulas — with the backup's contents. This cannot be undone."
      );
      if (!ok) return;

      Object.keys(STORAGE_KEYS).forEach(function (name) {
        localStorage.removeItem(STORAGE_KEYS[name]);
      });
      Object.keys(backup.data).forEach(function (key) {
        if (key.indexOf("sai_") === 0 && typeof backup.data[key] === "string") {
          localStorage.setItem(key, backup.data[key]);
        }
      });

      resetFileState();
      state.companyName = getCompanyName();
      state.selectedMasterReport = "";
      state.selectedReportType = "";
      renderHomeScreen();
      showScreen("screen-home");
      showBackupMessage("Backup from " + when + " restored — " + summary + ".", false);
    };
    reader.readAsText(file);
  }

  document.getElementById("btnDownloadBackup").addEventListener("click", function () {
    downloadBackup();
    showBackupMessage("Backup downloaded.", false);
  });
  document.getElementById("btnStartOverBackup").addEventListener("click", downloadBackup);
  document.getElementById("btnRestoreBackup").addEventListener("click", function () {
    backupFileInput.value = "";
    backupFileInput.click();
  });
  backupFileInput.addEventListener("change", function () {
    if (backupFileInput.files && backupFileInput.files[0]) restoreFromBackupFile(backupFileInput.files[0]);
  });

  /* ---------------------------------------------------------------------
   * Screen: Home (Master Reports)
   * ------------------------------------------------------------------- */
  document.getElementById("btnHomeNewUpload").addEventListener("click", function () {
    resetFileState();
    state.selectedMasterReport = "";
    state.selectedReportType = "";
    renderMasterReportScreen(false);
    showScreen("screen-master-report");
  });

  function renderProgressSection() {
    var section = document.getElementById("progressSection");
    var list = document.getElementById("progressReportList");
    list.innerHTML = "";

    var inProgress = getInProgressMasterReports();
    section.hidden = inProgress.length === 0;

    inProgress.forEach(function (progress) {
      var card = document.createElement("div");
      card.className = "master-report-card master-report-card--progress";

      var header = document.createElement("div");
      header.className = "master-report-card__header";
      var title = document.createElement("h3");
      title.textContent = progress.masterReportName;
      header.appendChild(title);

      // Removes every in-progress record for this Master Report, not just
      // the most-recent one this card happens to display (see the grouping
      // in getInProgressMasterReports) — the card is the Master Report's
      // sole representative here, so deleting it must not leave an older
      // abandoned Report Type's record behind to resurrect the card.
      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "link-btn card-delete-btn";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", function () {
        var ok = window.confirm(
          "Delete the in-progress report \"" + progress.masterReportName + "\"?\n\n" +
          "Its setup progress will be discarded. This cannot be undone."
        );
        if (!ok) return;
        saveSetupProgressList(getSetupProgressList().filter(function (p) {
          return p.masterReportName.toLowerCase() !== progress.masterReportName.toLowerCase();
        }));
        renderHomeScreen();
      });
      header.appendChild(deleteBtn);
      card.appendChild(header);

      var meta = document.createElement("p");
      meta.className = "master-report-card__meta";
      meta.textContent = "Report Type: " + progress.reportTypeName;
      card.appendChild(meta);

      var percent = Math.round((progress.step / SETUP_TOTAL_STEPS) * 100);
      var barWrap = document.createElement("div");
      barWrap.className = "progress-bar";
      var barFill = document.createElement("div");
      barFill.className = "progress-bar__fill";
      barFill.style.width = percent + "%";
      barWrap.appendChild(barFill);
      card.appendChild(barWrap);

      var stopped = document.createElement("p");
      stopped.className = "master-report-card__meta";
      stopped.textContent = "Stopped at: " + SETUP_STEP_LABELS[progress.step] + " · Step " + progress.step + " of " + SETUP_TOTAL_STEPS;
      card.appendChild(stopped);

      var resumeBtn = document.createElement("button");
      resumeBtn.type = "button";
      resumeBtn.className = "link-btn master-report-card__resume";
      resumeBtn.textContent = "Resume setup →";
      resumeBtn.addEventListener("click", function () { resumeSetupProgress(progress); });
      card.appendChild(resumeBtn);

      list.appendChild(card);
    });
  }

  // Rebuilds whichever screen a setup was stopped on from its saved
  // snapshot, falling back a step at a time if the snapshot is missing the
  // data that step needs (e.g. an older record saved before this field
  // existed) — the Upload screen (re-select the file) is always a safe
  // final fallback since raw file bytes are never persisted.
  function resumeSetupProgress(progress) {
    resetFileState();
    state.selectedMasterReport = progress.masterReportName;
    state.selectedReportType = progress.reportTypeName;
    addReportType(state.selectedReportType);

    var snap = progress.snapshot;

    if (progress.step >= 4 && snap && snap.currentFileHeaders && snap.currentRenamedRows) {
      state.fileName = snap.fileName || "";
      state.fileSize = snap.fileSize || 0;
      state.selectedSheetName = snap.selectedSheetName || "";
      state.selectedHeaderRowIndex = snap.selectedHeaderRowIndex || 0;
      state.selectedColumns = snap.selectedColumns || [];
      state.selectedDateColumnHeader = snap.selectedDateColumnHeader || "";
      currentFileHeaders = snap.currentFileHeaders;
      currentFileRows = snap.currentFileRows || [];
      currentRenamedRows = snap.currentRenamedRows;
      dropzoneFilename.textContent = state.fileName;
      renderColumnScreen();
      goToFormulaStep();
      return;
    }

    if (progress.step >= 3 && snap && snap.currentFileHeaders && snap.currentFileHeaders.length) {
      state.fileName = snap.fileName || "";
      state.fileSize = snap.fileSize || 0;
      state.selectedSheetName = snap.selectedSheetName || "";
      state.selectedHeaderRowIndex = snap.selectedHeaderRowIndex || 0;
      currentFileHeaders = snap.currentFileHeaders;
      currentFileRows = snap.currentFileRows || [];
      dropzoneFilename.textContent = state.fileName;
      renderColumnScreen();
      showScreen("screen-columns");
      return;
    }

    showScreen("screen-upload");
  }

  function renderHomeScreen() {
    document.getElementById("backupMsg").hidden = true;
    renderProgressSection();

    var masterReports = getMasterReports();
    document.getElementById("blueprintMarker").hidden = masterReports.length === 0;
    var emptyState = document.getElementById("templatesEmptyState");
    var list = document.getElementById("masterReportList");
    list.innerHTML = "";

    emptyState.hidden = masterReports.length > 0;
    list.hidden = masterReports.length === 0;

    masterReports.forEach(function (mr) {
      var data = getMasterReportData(mr.name);
      var rowCount = data ? data.rows.length : 0;

      var card = document.createElement("div");
      card.className = "master-report-card";

      var header = document.createElement("div");
      header.className = "master-report-card__header";
      var title = document.createElement("h3");
      title.textContent = mr.name;
      header.appendChild(title);

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "link-btn card-delete-btn";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", function () {
        var ok = window.confirm(
          "Delete the template \"" + mr.name + "\"?\n\n" +
          "This removes the template and its stored data. Report Type mappings and formulas stay saved for reuse. This cannot be undone."
        );
        if (!ok) return;
        deleteMasterReportEverywhere(mr.name);
        renderHomeScreen();
      });
      header.appendChild(deleteBtn);
      card.appendChild(header);

      // A Template card describes the reusable blueprint (which Report
      // Types it standardises and how many columns they map onto), never
      // the specific rows that happen to be stored — a row count / updated
      // date here misreads as "last month's data is still sitting in this
      // template".
      var typeCount = mr.reportTypesUsed.length;
      var columnCount = data ? data.columns.filter(function (c) { return c !== "Report Type"; }).length : 0;
      var meta = document.createElement("p");
      meta.className = "master-report-card__meta";
      meta.textContent = typeCount + " report type" + (typeCount === 1 ? "" : "s") +
        " · " + columnCount + " column" + (columnCount === 1 ? "" : "s") + " mapped";
      card.appendChild(meta);

      if (mr.reportTypesUsed.length) {
        var tiles = document.createElement("div");
        tiles.className = "master-report-card__tiles";
        mr.reportTypesUsed.forEach(function (typeName) {
          // The tile is itself a <button>, so its delete control has to be
          // a sibling inside a wrapper (nesting a button in a button is
          // invalid HTML and breaks click handling), styled to read as one
          // chip with an × on its right edge.
          var wrap = document.createElement("span");
          wrap.className = "report-tile-wrap";

          var tile = document.createElement("button");
          tile.type = "button";
          tile.className = "report-tile";
          tile.textContent = typeName;
          tile.addEventListener("click", function () {
            resetFileState();
            state.selectedMasterReport = mr.name;
            state.selectedReportType = typeName;
            markReportTypeActive(typeName);
            showScreen("screen-upload");
          });
          wrap.appendChild(tile);

          var tileDelete = document.createElement("button");
          tileDelete.type = "button";
          tileDelete.className = "report-tile-delete";
          tileDelete.title = "Remove \"" + typeName + "\" from this Master Report";
          tileDelete.textContent = "×";
          tileDelete.addEventListener("click", function () {
            var count = getReportTypeRowCount(mr.name, typeName);
            var ok = window.confirm(
              "Remove the Report Type \"" + typeName + "\" from \"" + mr.name + "\"?\n\n" +
              "Its " + count + " row" + (count === 1 ? "" : "s") + " in this Master Report will be deleted. " +
              "The Report Type's saved mapping and formulas stay available for reuse. This cannot be undone."
            );
            if (!ok) return;
            deleteReportTypeFromMasterReport(mr.name, typeName);
            renderHomeScreen();
          });
          wrap.appendChild(tileDelete);

          tiles.appendChild(wrap);
        });
        card.appendChild(tiles);
      } else {
        var emptyMsg = document.createElement("p");
        emptyMsg.className = "master-report-card__empty";
        emptyMsg.textContent = "No report types yet in this Master Report.";
        card.appendChild(emptyMsg);
      }

      var addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn";
      addBtn.textContent = "+ Add Report Type";
      addBtn.addEventListener("click", function () {
        resetFileState();
        state.selectedMasterReport = mr.name;
        state.selectedReportType = "";
        renderMasterReportScreen(true);
        showScreen("screen-master-report");
      });
      card.appendChild(addBtn);

      if (rowCount > 0) {
        var analyseBtn = document.createElement("button");
        analyseBtn.type = "button";
        analyseBtn.className = "btn";
        analyseBtn.textContent = "Analyse";
        analyseBtn.addEventListener("click", function () {
          dashboardEntryScreen = "screen-home";
          openDashboardFor(mr.name);
        });
        card.appendChild(analyseBtn);
      }

      list.appendChild(card);
    });
  }

  /* ---------------------------------------------------------------------
   * Screen: Upload
   *
   * A file already read into memory this session (currentWorkbook, set by
   * readUploadedFile and cleared only by resetFileState) is surfaced at the
   * top of the screen with a Next button, so returning to this screen (e.g.
   * via a Back button) doesn't force a re-upload the user doesn't need. The
   * dropzone below remains fully usable if they want to swap the file.
   * ------------------------------------------------------------------- */
  function renderUploadExistingFile() {
    var hasFile = !!(currentWorkbook && state.fileName);
    uploadExistingWrap.hidden = !hasFile;
    uploadExistingFilename.textContent = hasFile ? state.fileName : "";
    updateExpressOffer();
  }

  document.getElementById("btnUploadBack").addEventListener("click", function () {
    renderMasterReportScreen(!!state.selectedMasterReport);
    showScreen("screen-master-report");
  });

  function handleUploadContinue() {
    if (isDuplicateFileUpload(state.selectedMasterReport, state.fileName, state.fileSize)) {
      var proceedAnyway = window.confirm("This file looks like it was already uploaded (same name & size). Add it again?");
      if (!proceedAnyway) return;
    }
    proceedPastUploadScreen();
  }

  btnUploadContinue.addEventListener("click", handleUploadContinue);
  btnUploadNext.addEventListener("click", handleUploadContinue);

  /* ---------------------------------------------------------------------
   * Screen: Master Report / Report Type
   *
   * Two modes: "free" (both fields editable — only reachable from the
   * top-level "+ New Upload" button) and "locked" (Master Report is
   * already known — from a card's "+ Add Report Type" or the Preview
   * screen's "Add Another Report Type" — so only Report Type is editable).
   * ------------------------------------------------------------------- */
  var masterReportLockedWrap = document.getElementById("masterReportLockedWrap");
  var masterReportInputWrap = document.getElementById("masterReportInputWrap");
  var masterReportLockedName = document.getElementById("masterReportLockedName");
  var inputMasterReport = document.getElementById("inputMasterReport");
  var inputReportType = document.getElementById("inputReportType");
  var btnMasterReportContinue = document.getElementById("btnMasterReportContinue");

  function renderMasterReportScreen(locked) {
    var masterReportDatalist = document.getElementById("masterReportDatalist");
    masterReportDatalist.innerHTML = "";
    getMasterReports().forEach(function (m) {
      var opt = document.createElement("option");
      opt.value = m.name;
      masterReportDatalist.appendChild(opt);
    });

    var reportTypeDatalist = document.getElementById("reportTypeDatalist");
    reportTypeDatalist.innerHTML = "";
    getReportTypes().forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t;
      reportTypeDatalist.appendChild(opt);
    });

    masterReportLockedWrap.hidden = !locked;
    masterReportInputWrap.hidden = locked;
    if (locked) {
      masterReportLockedName.textContent = state.selectedMasterReport;
    } else {
      inputMasterReport.value = state.selectedMasterReport || "";
    }
    inputReportType.value = state.selectedReportType || "";
    updateMasterReportContinueState();
  }

  function updateMasterReportContinueState() {
    var masterReportOk = masterReportLockedWrap.hidden ? !!inputMasterReport.value.trim() : !!state.selectedMasterReport;
    btnMasterReportContinue.disabled = !masterReportOk || !inputReportType.value.trim();
  }

  inputMasterReport.addEventListener("input", updateMasterReportContinueState);
  inputReportType.addEventListener("input", updateMasterReportContinueState);

  document.getElementById("btnMasterReportChange").addEventListener("click", function () {
    state.selectedMasterReport = "";
    renderMasterReportScreen(false);
  });

  document.getElementById("btnMasterReportBack").addEventListener("click", function () {
    renderHomeScreen();
    showScreen("screen-home");
  });

  btnMasterReportContinue.addEventListener("click", function () {
    var masterReportName = masterReportLockedWrap.hidden ? inputMasterReport.value.trim() : state.selectedMasterReport;
    var reportTypeName = inputReportType.value.trim();
    if (!masterReportName || !reportTypeName) return;
    state.selectedMasterReport = resolveExistingMasterReportName(masterReportName);
    state.selectedReportType = resolveExistingReportTypeName(reportTypeName);
    addReportType(state.selectedReportType);
    markReportTypeActive(state.selectedReportType);
    recordSetupProgress(state.selectedMasterReport, state.selectedReportType, 2, null);
    showScreen("screen-upload");
  });

  /* ---------------------------------------------------------------------
   * Screen: Sheet selection
   *
   * Only shown when the uploaded file has more than one sheet. If a sheet
   * name was already saved for this Report Type (and that sheet still
   * exists in this file), it's used automatically and this screen is
   * skipped entirely.
   * ------------------------------------------------------------------- */
  var sheetList = document.getElementById("sheetList");

  // Looks up the saved header row for the current Report Type and applies
  // it to state, defaulting to row 1 (index 0) if none is saved.
  function applyHeaderRowPreference() {
    var saved = getHeaderRowPreference(state.selectedReportType);
    state.selectedHeaderRowIndex = saved !== null ? saved : 0;
  }

  function proceedPastUploadScreen() {
    // Stepping through manually always abandons any half-taken express path.
    uploadExpressPlanPending = null;
    var sheetNames = currentWorkbook ? currentWorkbook.SheetNames : [];

    if (sheetNames.length > 1) {
      var saved = getSheetPreference(state.selectedReportType);
      if (saved && sheetNames.indexOf(saved) !== -1) {
        cameFromSheetScreen = false;
        state.selectedSheetName = saved;
        applyHeaderRowPreference();
        goToHeaderRowStep();
      } else {
        cameFromSheetScreen = true;
        renderSheetScreen();
        showScreen("screen-sheet");
      }
    } else {
      cameFromSheetScreen = false;
      state.selectedSheetName = sheetNames[0] || "";
      applyHeaderRowPreference();
      goToHeaderRowStep();
    }
  }

  /* --- Express run --------------------------------------------------------
   * For month-2+ uploads: when the just-parsed file can be processed with
   * the Report Type's remembered setup with nothing left to decide —
   * remembered (or only) sheet, remembered header row, headers matching
   * the saved column structure exactly (both directions, whitespace/case
   * normalized), and saved formulas that still validate — the upload
   * screen offers one button that applies all of it and jumps straight to
   * Preview. Any mismatch means no offer: step-by-step is the only safe
   * path when something changed. The add/replace decision is never
   * skipped — when this Report Type already has rows, Express routes
   * through the data-mode screen and completes from there
   * (uploadExpressPlanPending).
   * ---------------------------------------------------------------------- */
  var uploadExpressPlanPending = null;

  function getExpressRunPlan() {
    if (!currentWorkbook || !state.selectedReportType || !state.selectedMasterReport) return null;
    var savedStructure = getColumnStructureFor(state.selectedReportType);
    if (!savedStructure) return null;

    var sheetNames = currentWorkbook.SheetNames;
    var sheetName;
    if (sheetNames.length > 1) {
      var savedSheet = getSheetPreference(state.selectedReportType);
      if (!savedSheet || sheetNames.indexOf(savedSheet) === -1) return null;
      sheetName = savedSheet;
    } else {
      sheetName = sheetNames[0];
    }
    var savedHeaderRow = getHeaderRowPreference(state.selectedReportType);
    var headerRowIndex = savedHeaderRow !== null ? savedHeaderRow : 0;

    var extracted;
    try {
      extracted = extractHeadersAndRows(currentWorkbook.Sheets[sheetName], headerRowIndex);
    } catch (e) {
      return null;
    }

    // Exact two-way match between the file's headers and the saved
    // structure's original headers — any extra, missing or duplicate
    // column disqualifies the file from the express path.
    var byKey = {};
    Object.keys(savedStructure).forEach(function (k) { byKey[normalizeColumnKey(k)] = savedStructure[k]; });
    var headerKeys = extracted.headers.map(normalizeColumnKey);
    if (Object.keys(byKey).length !== headerKeys.length) return null;
    var seen = {};
    for (var i = 0; i < headerKeys.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(byKey, headerKeys[i])) return null;
      if (seen[headerKeys[i]]) return null;
      seen[headerKeys[i]] = true;
    }

    var effectiveStructure = {};
    var selectedColumns = [];
    extracted.headers.forEach(function (h) {
      var entry = byKey[normalizeColumnKey(h)];
      effectiveStructure[h] = { include: entry.include, renameTo: entry.renameTo };
      if (entry.include) selectedColumns.push(entry.renameTo);
    });
    if (!selectedColumns.length) return null;

    // Saved formulas must still validate and parse against these columns,
    // in their saved order — if anything is off, no express offer.
    var formulas = getFormulasFor(state.selectedReportType).map(function (f) {
      return { name: f.name, expression: f.expression };
    });
    var allNames = selectedColumns.concat(formulas.map(function (f) { return f.name; }));
    var knownSoFar = selectedColumns.slice();
    for (var k = 0; k < formulas.length; k++) {
      var f = formulas[k];
      if (!f.expression || !f.expression.trim()) { f.ast = null; knownSoFar.push(f.name); continue; }
      var names = allNames.filter(function (n) { return n.toLowerCase() !== f.name.toLowerCase(); });
      var tokens = tokenizeExpression(f.expression, names);
      if (tokens.some(function (t) { return t.type === "unknown"; })) return null;
      if (tokens.some(function (t) { return t.type === "column" && knownSoFar.indexOf(t.value) === -1; })) return null;
      try { f.ast = parseExpressionTokens(tokens); } catch (e2) { return null; }
      knownSoFar.push(f.name);
    }

    var dateHeader = getDateColumnPreference(state.selectedReportType);
    var dateKey = "";
    if (dateHeader) {
      var dateEntry = byKey[normalizeColumnKey(dateHeader)];
      if (dateEntry && dateEntry.include) dateKey = dateEntry.renameTo;
    }

    return {
      sheetName: sheetName,
      headerRowIndex: headerRowIndex,
      extracted: extracted,
      effectiveStructure: effectiveStructure,
      selectedColumns: selectedColumns,
      formulas: formulas,
      dateKey: dateKey
    };
  }

  function updateExpressOffer() {
    var wrap = document.getElementById("expressRunWrap");
    var plan = getExpressRunPlan();
    wrap.hidden = !plan;
    if (!plan) return;
    var formulaCount = plan.formulas.length;
    document.getElementById("expressRunText").textContent =
      "\"" + state.fileName + "\" matches the saved setup for \"" + state.selectedReportType + "\" — " +
      plan.selectedColumns.length + " column" + (plan.selectedColumns.length === 1 ? "" : "s") +
      (formulaCount ? " and " + formulaCount + " formula" + (formulaCount === 1 ? "" : "s") : "") +
      " will be applied exactly as last time.";
  }

  function runExpressPlan(plan) {
    state.selectedSheetName = plan.sheetName;
    state.selectedHeaderRowIndex = plan.headerRowIndex;
    currentFileHeaders = plan.extracted.headers;
    currentFileRows = plan.extracted.rows;
    currentRenamedRows = buildRenamedRows(currentFileRows, plan.effectiveStructure);
    state.selectedColumns = plan.selectedColumns;
    state.selectedDateColumnHeader = plan.dateKey;

    var existingCount = getReportTypeRowCount(state.selectedMasterReport, state.selectedReportType);
    if (existingCount > 0) {
      uploadExpressPlanPending = plan;
      dataModeMessage.textContent = "\"" + state.selectedReportType + "\" currently has " + existingCount +
        " row" + (existingCount === 1 ? "" : "s") + " from your last upload. What would you like to do with this new file?";
      showScreen("screen-data-mode");
    } else {
      state.dataMode = "add";
      mergeUploadIntoMasterAndPreview(plan.formulas);
    }
  }

  document.getElementById("btnExpressRun").addEventListener("click", function () {
    var plan = getExpressRunPlan();
    if (!plan) { document.getElementById("expressRunWrap").hidden = true; return; }
    runExpressPlan(plan);
  });

  function renderSheetScreen() {
    sheetList.innerHTML = "";
    currentWorkbook.SheetNames.forEach(function (name) {
      var tile = document.createElement("button");
      tile.type = "button";
      tile.className = "sheet-tile";
      tile.textContent = name;
      tile.addEventListener("click", function () {
        state.selectedSheetName = name;
        applyHeaderRowPreference();
        saveSheetPreference(state.selectedReportType, name);
        goToHeaderRowStep();
      });
      sheetList.appendChild(tile);
    });
  }

  document.getElementById("btnSheetBack").addEventListener("click", function () {
    showScreen("screen-upload");
  });

  /* ---------------------------------------------------------------------
   * Screen: Header row selection
   *
   * Shows the first 20 rows of the selected sheet so the user can click
   * whichever row actually holds the column names (not always row 1). The
   * row chosen last time for this Report Type is pre-selected (via
   * applyHeaderRowPreference), so returning users usually just confirm.
   * ------------------------------------------------------------------- */
  var headerRowPreviewBody = document.getElementById("headerRowPreviewBody");
  var btnHeaderRowContinue = document.getElementById("btnHeaderRowContinue");
  var btnHeaderRowChangeSheet = document.getElementById("btnHeaderRowChangeSheet");
  var HEADER_ROW_PREVIEW_LIMIT = 20;

  function goToHeaderRowStep() {
    renderHeaderRowScreen();
    showScreen("screen-header-row");
  }

  function renderHeaderRowScreen() {
    document.getElementById("headerRowSheetName").textContent = state.selectedSheetName;
    btnHeaderRowChangeSheet.hidden = !(currentWorkbook && currentWorkbook.SheetNames.length > 1);

    var sheet = currentWorkbook.Sheets[state.selectedSheetName];
    var previewRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true }).slice(0, HEADER_ROW_PREVIEW_LIMIT);

    // A saved header row preference may not fit this file (e.g. it points
    // past the last previewed row), so fall back to row 1 rather than
    // leaving no row selected.
    if (state.selectedHeaderRowIndex < 0 || state.selectedHeaderRowIndex >= previewRows.length) {
      state.selectedHeaderRowIndex = 0;
    }

    var maxCols = 0;
    previewRows.forEach(function (row) { if (row.length > maxCols) maxCols = row.length; });

    headerRowPreviewBody.innerHTML = "";
    previewRows.forEach(function (row, idx) {
      var tr = document.createElement("tr");
      tr.className = "header-row-preview-row";
      if (idx === state.selectedHeaderRowIndex) tr.classList.add("header-row-preview-row--selected");

      var tdSelect = document.createElement("td");
      tdSelect.className = "header-row-select-cell";
      var radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "headerRowChoice";
      radio.checked = idx === state.selectedHeaderRowIndex;
      tdSelect.appendChild(radio);
      tr.appendChild(tdSelect);

      var tdNum = document.createElement("td");
      tdNum.className = "header-row-num-cell";
      tdNum.textContent = "Row " + (idx + 1);
      tr.appendChild(tdNum);

      for (var c = 0; c < maxCols; c++) {
        var td = document.createElement("td");
        var cell = row[c];
        td.textContent = cell === undefined || cell === null ? "" : cell;
        tr.appendChild(td);
      }

      function selectRow() {
        state.selectedHeaderRowIndex = idx;
        headerRowPreviewBody.querySelectorAll(".header-row-preview-row").forEach(function (r) {
          r.classList.remove("header-row-preview-row--selected");
        });
        headerRowPreviewBody.querySelectorAll('input[name="headerRowChoice"]').forEach(function (r, i) {
          r.checked = i === idx;
        });
        tr.classList.add("header-row-preview-row--selected");
        btnHeaderRowContinue.disabled = false;
      }
      tr.addEventListener("click", selectRow);
      radio.addEventListener("click", function (e) { e.stopPropagation(); selectRow(); });

      headerRowPreviewBody.appendChild(tr);
    });

    btnHeaderRowContinue.disabled = previewRows.length === 0;
  }

  btnHeaderRowChangeSheet.addEventListener("click", function () {
    cameFromSheetScreen = true;
    renderSheetScreen();
    showScreen("screen-sheet");
  });

  document.getElementById("btnHeaderRowBack").addEventListener("click", function () {
    if (cameFromSheetScreen) {
      renderSheetScreen();
      showScreen("screen-sheet");
    } else {
      showScreen("screen-upload");
    }
  });

  btnHeaderRowContinue.addEventListener("click", function () {
    try {
      var sheet = currentWorkbook.Sheets[state.selectedSheetName];
      var extracted = extractHeadersAndRows(sheet, state.selectedHeaderRowIndex);
      currentFileHeaders = extracted.headers;
      currentFileRows = extracted.rows;
      saveHeaderRowPreference(state.selectedReportType, state.selectedHeaderRowIndex);
      console.log(
        "[SAI] First 5 headers extracted from sheet \"" + state.selectedSheetName + "\" (header row " + (state.selectedHeaderRowIndex + 1) + "):",
        currentFileHeaders.slice(0, 5)
      );
      recordSetupProgress(state.selectedMasterReport, state.selectedReportType, 3, {
        fileName: state.fileName,
        fileSize: state.fileSize,
        selectedSheetName: state.selectedSheetName,
        selectedHeaderRowIndex: state.selectedHeaderRowIndex,
        currentFileHeaders: currentFileHeaders,
        currentFileRows: currentFileRows
      });
      proceedToDataModeOrColumns();
    } catch (err) {
      alert("Could not read headers: " + err.message);
    }
  });

  /* ---------------------------------------------------------------------
   * Screen: Data mode choice (Replace vs Add)
   *
   * Shown once per fresh upload, right after headers are extracted and
   * before column mapping, whenever this Report Type already has rows
   * stored in the Master Report — otherwise mergeReportTypeDataIntoMasterReport
   * (called at the end of the Formula screen) always appended, which is
   * what caused repeat uploads of the same Report Type to pile rows on
   * top of each other with no way to start over. Skipped entirely when
   * there's nothing stored yet, since there's no real choice to make.
   * ------------------------------------------------------------------- */
  var dataModeMessage = document.getElementById("dataModeMessage");

  function proceedToDataModeOrColumns() {
    var existingCount = getReportTypeRowCount(state.selectedMasterReport, state.selectedReportType);
    if (existingCount > 0) {
      dataModeMessage.textContent = "\"" + state.selectedReportType + "\" currently has " + existingCount +
        " row" + (existingCount === 1 ? "" : "s") + " from your last upload. What would you like to do with this new file?";
      showScreen("screen-data-mode");
    } else {
      state.dataMode = "add";
      renderColumnScreen();
      showScreen("screen-columns");
    }
  }

  // An express run pauses here only for the add/replace decision — once
  // made, it merges directly instead of continuing to the columns screen.
  function afterDataModeChoice() {
    if (uploadExpressPlanPending) {
      var plan = uploadExpressPlanPending;
      uploadExpressPlanPending = null;
      mergeUploadIntoMasterAndPreview(plan.formulas);
      return;
    }
    renderColumnScreen();
    showScreen("screen-columns");
  }
  document.getElementById("btnDataModeReplace").addEventListener("click", function () {
    state.dataMode = "replace";
    afterDataModeChoice();
  });
  document.getElementById("btnDataModeAdd").addEventListener("click", function () {
    state.dataMode = "add";
    afterDataModeChoice();
  });
  document.getElementById("btnDataModeBack").addEventListener("click", function () {
    renderHeaderRowScreen();
    showScreen("screen-header-row");
  });

  /* ---------------------------------------------------------------------
   * Screen: Column selection & rename
   * ------------------------------------------------------------------- */
  var columnsTableBody = document.getElementById("columnsTableBody");
  var columnsMismatchBanner = document.getElementById("columnsMismatchBanner");
  var columnsMismatchText = document.getElementById("columnsMismatchText");
  var columnsAutofillNote = document.getElementById("columnsAutofillNote");
  var columnsErrorMsg = document.getElementById("columnsErrorMsg");

  function showColumnsError(message) {
    columnsErrorMsg.textContent = message;
    columnsErrorMsg.hidden = false;
  }

  // Case-insensitive lookup of a saved column-structure entry for a given
  // current-file header — the same file re-exported later can vary in
  // header casing, so matching "Order ID" against a saved "order id"
  // should still count as the same column.
  function findSavedStructureEntry(savedStructure, header) {
    if (!savedStructure) return null;
    var lowerHeader = header.toLowerCase();
    var key = Object.keys(savedStructure).find(function (k) { return k.toLowerCase() === lowerHeader; });
    return key ? savedStructure[key] : null;
  }

  function renderColumnScreen() {
    document.getElementById("columnsReportType").textContent = state.selectedReportType;
    columnsAutofillNote.hidden = true;
    columnsMismatchBanner.hidden = true;
    columnsErrorMsg.hidden = true;

    console.log("[SAI] Rendering column screen from currentFileHeaders:", currentFileHeaders);

    // The saved column structure for this Report Type (see
    // saveColumnStructureFor, written every time btnColumnsNext runs) is
    // what lets a returning upload skip remapping from scratch — every
    // row built below defaults from it (see findSavedStructureEntry)
    // instead of always defaulting to include=true/renameTo=header.
    var savedStructure = getColumnStructureFor(state.selectedReportType);

    if (savedStructure) {
      columnsAutofillNote.textContent = "Saved mapping loaded for " + state.selectedReportType + " — review and confirm below.";
      columnsAutofillNote.hidden = false;

      var savedKeys = Object.keys(savedStructure);
      var lowerCurrentHeaders = currentFileHeaders.map(function (h) { return h.toLowerCase(); });
      var lowerSavedKeys = savedKeys.map(function (h) { return h.toLowerCase(); });
      var missing = savedKeys.filter(function (h) { return lowerCurrentHeaders.indexOf(h.toLowerCase()) === -1; });
      var added = currentFileHeaders.filter(function (h) { return lowerSavedKeys.indexOf(h.toLowerCase()) === -1; });
      if (missing.length || added.length) {
        var parts = [];
        if (missing.length) parts.push("missing: " + missing.join(", "));
        if (added.length) parts.push("new: " + added.join(", "));
        columnsMismatchText.textContent = "Column mismatch detected — " + parts.join("; ") + ". Update template or remap manually?";
        columnsMismatchBanner.hidden = false;
      }
    }

    var savedDateHeader = getDateColumnPreference(state.selectedReportType);

    // When this Master Report already has at least one other Report Type
    // merged into it, its existing standardised column names (e.g. "City",
    // "Amount") are offered as a dropdown so a second/third file's columns
    // can be mapped onto the SAME names instead of accidentally creating
    // near-duplicate columns (e.g. "City" vs "city"). First time a Master
    // Report is being set up there's no existing schema yet, so the screen
    // falls back to the original plain rename text box, unchanged.
    var masterData = getMasterReportData(state.selectedMasterReport);
    var masterColumns = masterData ? masterData.columns.filter(function (c) { return c !== "Report Type"; }) : [];

    columnsTableBody.innerHTML = "";
    // This screen must show exactly the file's own headers and nothing
    // else. Every row is built solely from currentFileHeaders (set by
    // extractHeadersAndRows() once the sheet + header row are chosen), but
    // each row's include/renameTo now defaults from the saved structure
    // for this header (see findSavedStructureEntry) when one exists,
    // falling back to include=true/renameTo=header for a header that
    // isn't in the saved mapping (flagged below as "New column").
    currentFileHeaders.forEach(function (header) {
      var savedEntry = findSavedStructureEntry(savedStructure, header);
      var include = savedEntry ? savedEntry.include : true;
      var renameTo = savedEntry ? savedEntry.renameTo : header;
      var isNewHeader = !!savedStructure && !savedEntry;

      var tr = document.createElement("tr");
      tr.dataset.header = header;

      var tdCheck = document.createElement("td");
      tdCheck.className = "col-check-cell";
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "column-include";
      checkbox.checked = include;
      tdCheck.appendChild(checkbox);
      tr.appendChild(tdCheck);

      var tdOrig = document.createElement("td");
      tdOrig.textContent = header;
      if (isNewHeader) {
        var newTag = document.createElement("span");
        newTag.className = "chip column-tag";
        newTag.textContent = "New column";
        tdOrig.appendChild(newTag);
      }
      tr.appendChild(tdOrig);

      var tdRename = document.createElement("td");
      if (masterColumns.length) {
        var existingMatch = masterColumns.find(function (c) { return c.toLowerCase() === renameTo.toLowerCase(); });

        var renameSelect = document.createElement("select");
        renameSelect.className = "column-rename-select";
        masterColumns.forEach(function (c) {
          var opt = document.createElement("option");
          opt.value = c;
          opt.textContent = c;
          renameSelect.appendChild(opt);
        });
        var newOpt = document.createElement("option");
        newOpt.value = "__new__";
        newOpt.textContent = "+ Add new column…";
        renameSelect.appendChild(newOpt);

        var newNameInput = document.createElement("input");
        newNameInput.type = "text";
        newNameInput.className = "column-rename column-rename-new";
        newNameInput.placeholder = "New column name";

        if (existingMatch) {
          renameSelect.value = existingMatch;
          newNameInput.value = existingMatch;
          newNameInput.hidden = true;
        } else {
          renameSelect.value = "__new__";
          newNameInput.value = renameTo;
          newNameInput.hidden = false;
        }

        renameSelect.addEventListener("change", function () {
          if (renameSelect.value === "__new__") {
            newNameInput.hidden = false;
            newNameInput.value = "";
            newNameInput.focus();
          } else {
            newNameInput.hidden = true;
            newNameInput.value = renameSelect.value;
          }
        });

        tdRename.appendChild(renameSelect);
        tdRename.appendChild(newNameInput);
      } else {
        var renameInput = document.createElement("input");
        renameInput.type = "text";
        renameInput.className = "column-rename";
        renameInput.value = renameTo;
        tdRename.appendChild(renameInput);
      }
      tr.appendChild(tdRename);

      var tdDate = document.createElement("td");
      tdDate.className = "col-check-cell";
      var dateRadio = document.createElement("input");
      dateRadio.type = "radio";
      dateRadio.name = "dateColumnChoice";
      dateRadio.className = "column-date-radio";
      dateRadio.checked = header === savedDateHeader;
      tdDate.appendChild(dateRadio);
      tr.appendChild(tdDate);

      columnsTableBody.appendChild(tr);
    });

    updateMissingColumnsSection();
    updateDateFormatSection();
    // A fresh render must not inherit the previous file's in-session
    // status pick, so clear the select before recomputing it.
    statusColumnSelect.value = "";
    updateStatusSection();
  }

  // Reads the effective "rename to" value for a column-selection table row,
  // covering both the plain text box (first Report Type ever, or a Master
  // Report with no other columns yet) and the select+new-name-input pair
  // (second+ Report Type, mapping onto — or extending — the Master
  // Report's existing standardised columns).
  function getRenameToForRow(tr, header) {
    var select = tr.querySelector(".column-rename-select");
    if (select) {
      if (select.value === "__new__") {
        var newInput = tr.querySelector(".column-rename-new");
        return (newInput.value.trim() || header);
      }
      return select.value;
    }
    var plainInput = tr.querySelector(".column-rename");
    return plainInput.value.trim() || header;
  }

  // Column names that came out of real Excel files are routinely "dirty" —
  // trailing spaces, non-breaking spaces, doubled spaces — and those
  // variants render pixel-identically on screen. Any comparison between a
  // blueprint column and a mapped rename has to treat "Customer State ",
  // "Customer State" and "Customer State" as the same column, or a
  // column that IS mapped in the table stays listed below as missing while
  // looking exactly like the one just mapped.
  function normalizeColumnKey(name) {
    return String(name).replace(/\s+/g, " ").trim().toLowerCase();
  }

  // Final (renamed) names of every column currently ticked in the table —
  // read live from the DOM so checkbox/rename changes are reflected
  // immediately. These are the columns a missing-column formula may use.
  function getIncludedRenamedColumns() {
    var cols = [];
    columnsTableBody.querySelectorAll("tr").forEach(function (tr) {
      var checkbox = tr.querySelector(".column-include");
      if (!checkbox.checked) return;
      cols.push(getRenameToForRow(tr, tr.dataset.header));
    });
    return cols;
  }

  // Shown whenever a date column is marked: asks what format that column's
  // dates are in instead of guessing silently — marketplaces differ too
  // much for auto-detection alone. Defaults to this Report Type's saved
  // answer so month 2+ is a zero-click confirmation, unless this file's
  // own values PROVE a different format (see detectDateFormatForColumn),
  // in which case the proven detection wins the default. The choice is
  // saved on Next and drives parsing + the DD/MM/YYYY standardisation.
  function updateDateFormatSection() {
    var wrap = document.getElementById("dateFormatWrap");
    var checkedRadio = columnsTableBody.querySelector(".column-date-radio:checked");
    if (!checkedRadio) {
      wrap.hidden = true;
      return;
    }
    var header = checkedRadio.closest("tr").dataset.header;
    var auto = detectDateFormatForColumn(currentFileRows.map(function (r) { return r[header]; }));
    var saved = getDateFormatPreference(state.selectedReportType);
    var selection = (saved && !(auto.proven && auto.format !== saved)) ? saved : auto.format;
    document.getElementById("dateFormatQuestion").textContent =
      "This file's \"" + header + "\" column — what format are the dates in?";
    document.querySelectorAll("input[name=dateFormatChoice]").forEach(function (r) {
      r.checked = r.value === selection;
    });
    wrap.hidden = false;
  }

  /* --- Order status section (columns screen) -----------------------------
   * Optional, per Report Type: pick which column holds order status, then
   * decide per DISTINCT VALUE actually present in this file whether rows
   * with that status count towards dashboard revenue or are excluded
   * (fully cancelled/returned orders). Values are listed with row counts;
   * defaults come from the saved map first, else from keywords
   * (cancel/return/rto/refund/reject → excluded). Only affects the
   * Analysis Dashboard — exports keep every row.
   * ---------------------------------------------------------------------- */
  var STATUS_EXCLUDE_RE = /cancel|return|rto|refund|reject/;
  var statusColumnSelect = document.getElementById("statusColumnSelect");

  function defaultStatusChoice(normalizedValue, savedMap) {
    if (Object.prototype.hasOwnProperty.call(savedMap, normalizedValue)) return savedMap[normalizedValue];
    return STATUS_EXCLUDE_RE.test(normalizedValue) ? "excluded" : "counted";
  }

  function renderStatusValuesList() {
    var list = document.getElementById("statusValuesList");
    var header = statusColumnSelect.value;

    // Choices already toggled in this session survive a rebuild.
    var previous = {};
    list.querySelectorAll(".status-value-row").forEach(function (r) {
      previous[r.dataset.value] = r.dataset.choice;
    });
    list.innerHTML = "";
    if (!header) return;

    var savedMap = getStatusValueMap(state.selectedReportType);
    var buckets = {};
    var order = [];
    currentFileRows.forEach(function (row) {
      var v = row[header];
      if (v === undefined || v === null || String(v).trim() === "") return;
      var key = normalizeColumnKey(String(v));
      if (!buckets[key]) { buckets[key] = { label: String(v).trim(), count: 0 }; order.push(key); }
      buckets[key].count++;
    });

    order.forEach(function (key) {
      var row = document.createElement("div");
      row.className = "status-value-row";
      row.dataset.value = key;

      var label = document.createElement("span");
      label.className = "status-value-row__label";
      label.textContent = buckets[key].label + " ";
      var count = document.createElement("span");
      count.className = "status-value-row__count";
      count.textContent = "(" + buckets[key].count + " row" + (buckets[key].count === 1 ? "" : "s") + ")";
      label.appendChild(count);
      row.appendChild(label);

      var modeBar = document.createElement("div");
      modeBar.className = "missing-column-mode";
      var countedBtn = document.createElement("button");
      countedBtn.type = "button";
      countedBtn.className = "missing-column-mode__btn";
      countedBtn.textContent = "Counted";
      modeBar.appendChild(countedBtn);
      var excludedBtn = document.createElement("button");
      excludedBtn.type = "button";
      excludedBtn.className = "missing-column-mode__btn";
      excludedBtn.textContent = "Excluded";
      modeBar.appendChild(excludedBtn);
      row.appendChild(modeBar);

      function applyChoice(choice) {
        row.dataset.choice = choice;
        countedBtn.classList.toggle("missing-column-mode__btn--active", choice === "counted");
        excludedBtn.classList.toggle("missing-column-mode__btn--active", choice === "excluded");
      }
      countedBtn.addEventListener("click", function () { applyChoice("counted"); });
      excludedBtn.addEventListener("click", function () { applyChoice("excluded"); });
      applyChoice(previous[key] || defaultStatusChoice(key, savedMap));

      list.appendChild(row);
    });
  }

  function updateStatusSection() {
    var wrap = document.getElementById("statusColumnWrap");
    wrap.hidden = false;

    var includedHeaders = [];
    columnsTableBody.querySelectorAll("tr").forEach(function (tr) {
      if (tr.querySelector(".column-include").checked) includedHeaders.push(tr.dataset.header);
    });

    var current = statusColumnSelect.value;
    statusColumnSelect.innerHTML = "";
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "(no status column)";
    statusColumnSelect.appendChild(noneOpt);
    includedHeaders.forEach(function (h) {
      var opt = document.createElement("option");
      opt.value = h;
      opt.textContent = h;
      statusColumnSelect.appendChild(opt);
    });

    // Keep the user's in-session pick if still valid; otherwise the saved
    // preference for this Report Type; otherwise suggest by column name.
    var selection = "";
    if (current && includedHeaders.indexOf(current) !== -1) selection = current;
    else {
      var saved = getStatusColumnPreference(state.selectedReportType);
      var savedMatch = saved ? includedHeaders.find(function (h) { return normalizeColumnKey(h) === normalizeColumnKey(saved); }) : null;
      if (savedMatch) selection = savedMatch;
      else if (saved === undefined) {
        // Never configured for this Report Type → suggest by column name.
        // An explicit "(no status column)" answer (saved === null) sticks.
        var suggested = findColumnByKeywords(includedHeaders, ["order status", "status", "order state"]);
        if (suggested) selection = suggested;
      }
    }
    statusColumnSelect.value = selection;
    renderStatusValuesList();
  }

  statusColumnSelect.addEventListener("change", renderStatusValuesList);

  // Any column expected for this upload that the current file doesn't map
  // onto (because it has no matching/included header) is offered here so
  // the user can fill every row of THIS file with one default value
  // instead of leaving the column blank for it. "Expected" covers two
  // sources: columns already standardised on this Master Report (from an
  // earlier Report Type merged into it), and columns this same Report
  // Type's own saved structure had included last time but that aren't
  // present in this file (see findSavedStructureEntry). Recomputed live
  // whenever the include checkboxes or rename choices change, while
  // preserving whatever the user already typed for a column that's still
  // missing after the recompute.
  function updateMissingColumnsSection() {
    var wrap = document.getElementById("missingColumnsWrap");
    var hint = document.getElementById("missingColumnsHint");
    var list = document.getElementById("missingColumnsList");

    var masterData = getMasterReportData(state.selectedMasterReport);
    var masterColumns = masterData ? masterData.columns.filter(function (c) { return c !== "Report Type"; }) : [];

    var savedStructure = getColumnStructureFor(state.selectedReportType);
    // Deduped on the normalized key, so a whitespace/case variant of a
    // column that's already expected (e.g. "Customer State " from an old
    // upload's saved structure vs the Master Report's "Customer State")
    // never becomes a second, visually identical blueprint entry. The
    // first-seen spelling wins — master columns are added first, so their
    // spelling is the one shown and stamped.
    var expectedColumns = [];
    var expectedKeys = [];
    function addExpectedColumn(name) {
      var key = normalizeColumnKey(name);
      if (expectedKeys.indexOf(key) !== -1) return;
      expectedKeys.push(key);
      expectedColumns.push(name);
    }
    masterColumns.forEach(addExpectedColumn);
    if (savedStructure) {
      var currentHeaderKeys = currentFileHeaders.map(normalizeColumnKey);
      Object.keys(savedStructure).forEach(function (origHeader) {
        var entry = savedStructure[origHeader];
        if (!entry.include) return;
        if (currentHeaderKeys.indexOf(normalizeColumnKey(origHeader)) !== -1) return;
        addExpectedColumn(entry.renameTo);
      });
    }

    // A column produced by one of this Report Type's own saved formulas
    // (Formula Builder, run right after this screen) is never a genuine
    // source column — it's computed fresh every time this Report Type's
    // formulas run, so it must never be offered here asking for a default
    // value, even though it lingers in masterColumns from a past merge.
    // Scoped to THIS Report Type only: a formula column from a DIFFERENT
    // Report Type already merged into the same Master Report still won't
    // be produced by this upload, so it correctly stays flagged as missing.
    var formulaNames = getFormulasFor(state.selectedReportType).map(function (f) { return normalizeColumnKey(f.name); });
    expectedColumns = expectedColumns.filter(function (c) { return formulaNames.indexOf(normalizeColumnKey(c)) === -1; });

    if (!expectedColumns.length) {
      wrap.hidden = true;
      list.innerHTML = "";
      return;
    }

    var previousEntries = {};
    list.querySelectorAll(".missing-column-row").forEach(function (r) {
      previousEntries[r.dataset.column] = {
        mode: r.dataset.mode || "fixed",
        fixed: r.querySelector(".missing-column-value").value,
        expr: r.querySelector(".missing-column-formula-input").value
      };
    });

    var covered = getIncludedRenamedColumns().map(normalizeColumnKey);

    var missing = expectedColumns.filter(function (c) { return covered.indexOf(normalizeColumnKey(c)) === -1; });

    wrap.hidden = missing.length === 0;
    list.innerHTML = "";
    hint.textContent = "These columns aren't in this file. Fill every row of this file with a fixed value or a formula built from this file's columns, or leave blank.";

    missing.forEach(function (col) {
      var prev = previousEntries[col] || { mode: "fixed", fixed: "", expr: "" };

      var row = document.createElement("div");
      row.className = "missing-column-row";
      row.dataset.column = col;

      var name = document.createElement("span");
      name.className = "missing-column-row__name";
      name.textContent = col;
      row.appendChild(name);

      var editor = document.createElement("div");
      editor.className = "missing-column-editor";
      row.appendChild(editor);

      var modeBar = document.createElement("div");
      modeBar.className = "missing-column-mode";
      var fixedBtn = document.createElement("button");
      fixedBtn.type = "button";
      fixedBtn.className = "missing-column-mode__btn";
      fixedBtn.textContent = "Fixed value";
      modeBar.appendChild(fixedBtn);
      var formulaBtn = document.createElement("button");
      formulaBtn.type = "button";
      formulaBtn.className = "missing-column-mode__btn";
      formulaBtn.textContent = "Formula";
      modeBar.appendChild(formulaBtn);
      editor.appendChild(modeBar);

      var input = document.createElement("input");
      input.type = "text";
      input.className = "missing-column-value";
      input.dataset.column = col;
      input.placeholder = "Default value for every row (text or number)";
      input.value = prev.fixed;
      editor.appendChild(input);

      // Formula mode — the exact same bar + autocomplete + pill preview as
      // the Formula Builder, but its available columns are the columns this
      // file will actually produce (ticked + renamed), read live.
      var formulaWrap = document.createElement("div");
      formulaWrap.className = "missing-column-formula";

      var exprBar = document.createElement("div");
      exprBar.className = "formula-expr-bar";
      var prefix = document.createElement("span");
      prefix.className = "formula-expr-prefix";
      prefix.textContent = "=";
      exprBar.appendChild(prefix);
      var exprInput = document.createElement("input");
      exprInput.type = "text";
      exprInput.className = "formula-expr-input missing-column-formula-input";
      exprInput.placeholder = "e.g. CONCATENATE(Order ID, \"-\", Sku)";
      exprInput.autocomplete = "off";
      exprInput.value = prev.expr;
      exprBar.appendChild(exprInput);
      var dropdown = document.createElement("div");
      dropdown.className = "formula-autocomplete";
      dropdown.hidden = true;
      exprBar.appendChild(dropdown);
      formulaWrap.appendChild(exprBar);

      var previewEl = document.createElement("div");
      previewEl.className = "formula-expr-preview";
      formulaWrap.appendChild(previewEl);
      editor.appendChild(formulaWrap);

      function getAvailable() {
        var result = getIncludedRenamedColumns().map(function (c) { return { name: c, origin: state.selectedReportType }; });
        result.push({ name: "CONCATENATE", origin: "function" });
        return result;
      }
      function refreshPreview() {
        renderExpressionPreview(previewEl, exprInput.value, getIncludedRenamedColumns());
      }
      attachFormulaAutocomplete(exprInput, dropdown, getAvailable, refreshPreview);
      refreshPreview();

      function applyMode(mode) {
        row.dataset.mode = mode;
        fixedBtn.classList.toggle("missing-column-mode__btn--active", mode === "fixed");
        formulaBtn.classList.toggle("missing-column-mode__btn--active", mode === "formula");
        input.hidden = mode !== "fixed";
        formulaWrap.hidden = mode !== "formula";
      }
      fixedBtn.addEventListener("click", function () { applyMode("fixed"); });
      formulaBtn.addEventListener("click", function () { applyMode("formula"); });
      applyMode(prev.mode);

      list.appendChild(row);
    });
  }

  document.getElementById("btnColumnsSelectAll").addEventListener("click", function () {
    columnsTableBody.querySelectorAll(".column-include").forEach(function (cb) { cb.checked = true; });
    updateMissingColumnsSection();
  });
  document.getElementById("btnColumnsDeselectAll").addEventListener("click", function () {
    columnsTableBody.querySelectorAll(".column-include").forEach(function (cb) { cb.checked = false; });
    updateMissingColumnsSection();
  });
  // Delegated so it also covers the include checkbox and rename controls of
  // every row, which are (re)created fresh each time renderColumnScreen()
  // runs — any change that could affect which expected columns this file no
  // longer covers should refresh the missing-columns list live. The rename
  // can be a dropdown pick (.column-rename-select) or typed text
  // (.column-rename — the plain box on a new Master Report, and the
  // "+ Add new column…" name box); typed text also gets an input listener
  // so a mapped column disappears from the list as it's typed, not only
  // after the field blurs.
  columnsTableBody.addEventListener("change", function (e) {
    if (e.target.classList.contains("column-include") ||
        e.target.classList.contains("column-rename-select") ||
        e.target.classList.contains("column-rename")) {
      updateMissingColumnsSection();
    }
    if (e.target.classList.contains("column-include")) {
      updateStatusSection();
    }
    if (e.target.classList.contains("column-date-radio")) {
      updateDateFormatSection();
    }
  });
  columnsTableBody.addEventListener("input", function (e) {
    if (e.target.classList.contains("column-rename")) {
      updateMissingColumnsSection();
    }
  });
  document.getElementById("btnColumnsClearDate").addEventListener("click", function () {
    columnsTableBody.querySelectorAll(".column-date-radio").forEach(function (r) { r.checked = false; });
    updateDateFormatSection();
  });
  document.getElementById("btnColumnsMismatchUpdate").addEventListener("click", function () {
    columnsMismatchBanner.hidden = true;
  });
  document.getElementById("btnColumnsMismatchRemap").addEventListener("click", function () {
    columnsMismatchBanner.hidden = true;
  });

  document.getElementById("btnColumnsBack").addEventListener("click", function () {
    showScreen("screen-upload");
  });

  document.getElementById("btnColumnsNext").addEventListener("click", function () {
    var structure = {};
    var selectedColumns = [];
    var dateHeaderOriginal = "";
    columnsTableBody.querySelectorAll("tr").forEach(function (tr) {
      var header = tr.dataset.header;
      var checkbox = tr.querySelector(".column-include");
      var dateRadio = tr.querySelector(".column-date-radio");
      var renameTo = getRenameToForRow(tr, header);
      structure[header] = {
        include: checkbox.checked,
        renameTo: renameTo
      };
      if (checkbox.checked) selectedColumns.push(renameTo);
      if (dateRadio.checked) dateHeaderOriginal = header;
    });
    saveColumnStructureFor(state.selectedReportType, structure);
    saveDateColumnPreferenceFor(state.selectedReportType, dateHeaderOriginal || null);
    if (dateHeaderOriginal) {
      var fmtRadio = document.querySelector("input[name=dateFormatChoice]:checked");
      if (fmtRadio) saveDateFormatPreferenceFor(state.selectedReportType, fmtRadio.value);
    }

    saveStatusColumnPreferenceFor(state.selectedReportType, statusColumnSelect.value || null);
    if (statusColumnSelect.value) {
      var statusChoices = {};
      document.querySelectorAll("#statusValuesList .status-value-row").forEach(function (r) {
        statusChoices[r.dataset.value] = r.dataset.choice;
      });
      saveStatusValueMapFor(state.selectedReportType, statusChoices);
    }

    currentRenamedRows = buildRenamedRows(currentFileRows, structure);

    // Any Master Report column left unmapped by this file (see
    // updateMissingColumnsSection) gets stamped onto every row of this
    // file — either the fixed value the user typed, or a per-row value
    // computed from this file's own columns in formula mode — and is
    // tracked as a real column for this upload too, same as if the file
    // had actually contained it. A bad formula blocks Next with an error;
    // returning early is safe because every click of Next rebuilds
    // currentRenamedRows from scratch above.
    columnsErrorMsg.hidden = true;
    var missingRows = document.querySelectorAll("#missingColumnsList .missing-column-row");
    for (var m = 0; m < missingRows.length; m++) {
      var mRow = missingRows[m];
      var col = mRow.dataset.column;
      if (mRow.dataset.mode === "formula") {
        var expr = mRow.querySelector(".missing-column-formula-input").value.trim();
        if (!expr) continue;
        var tokens = tokenizeExpression(expr, selectedColumns);
        var unknownTok = tokens.find(function (t) { return t.type === "unknown"; });
        if (unknownTok) {
          showColumnsError("The formula for \"" + col + "\" uses an unknown column \"" + unknownTok.value + "\". Only columns ticked above can be used — check the spelling or pick from the autocomplete list.");
          return;
        }
        var ast;
        try {
          ast = parseExpressionTokens(tokens);
        } catch (err) {
          showColumnsError("The formula for \"" + col + "\" has an invalid expression: " + err.message);
          return;
        }
        currentRenamedRows.forEach(function (row) { row[col] = computeExpressionValue(row, ast); });
      } else {
        var value = mRow.querySelector(".missing-column-value").value.trim();
        if (!value) continue;
        currentRenamedRows.forEach(function (row) { row[col] = value; });
      }
      if (selectedColumns.indexOf(col) === -1) selectedColumns.push(col);
    }

    state.selectedColumns = selectedColumns;
    // Store the renamed key (not the original header) so the merge step
    // can look the date value up directly on the final row objects.
    state.selectedDateColumnHeader = (dateHeaderOriginal && structure[dateHeaderOriginal].include)
      ? structure[dateHeaderOriginal].renameTo
      : "";

    recordSetupProgress(state.selectedMasterReport, state.selectedReportType, 4, {
      fileName: state.fileName,
      fileSize: state.fileSize,
      selectedSheetName: state.selectedSheetName,
      selectedHeaderRowIndex: state.selectedHeaderRowIndex,
      currentFileHeaders: currentFileHeaders,
      currentFileRows: currentFileRows,
      selectedColumns: state.selectedColumns,
      selectedDateColumnHeader: state.selectedDateColumnHeader,
      currentRenamedRows: currentRenamedRows
    });

    goToFormulaStep();
  });

  /* ---------------------------------------------------------------------
   * Screen: Formula builder
   *
   * Formulas are typed as free-text expressions (e.g. "Quantity * Price +
   * GST - Discount") referencing column names, evaluated top to bottom in
   * DOM/array order so a later formula can use an earlier formula's own
   * output as one of its inputs. See the expression engine below
   * (tokenizeExpression / parseExpressionTokens / evaluateAst) and the
   * ordering validation in the btnFormulaNext handler.
   * ------------------------------------------------------------------- */
  var formulaList = document.getElementById("formulaList");
  var formulaEmptyState = document.getElementById("formulaEmptyState");
  var formulaErrorMsg = document.getElementById("formulaErrorMsg");
  var btnFormulaNext = document.getElementById("btnFormulaNext");

  function goToFormulaStep() {
    renderFormulaScreen();
    showScreen("screen-formula");
  }

  function updateFormulaEmptyState() {
    formulaEmptyState.hidden = formulaList.children.length > 0;
  }

  function showFormulaError(message) {
    formulaErrorMsg.textContent = message;
    formulaErrorMsg.hidden = false;
  }

  // Formulas saved before this screen's redesign used a dropdown-built
  // {firstColumn, steps} shape instead of a typed expression string. Rather
  // than discarding a user's previously-built validation checks, this
  // reconstructs an equivalent expression from that shape the first time
  // it's loaded — every save from this point on writes the new shape.
  function migrateLegacyFormula(f) {
    if (typeof f.expression === "string") return f;
    var expr = f.firstColumn || "";
    (f.steps || []).forEach(function (s) {
      var operand = s.operandType === "number" ? s.operandNumber : s.operandColumn;
      if (operand === undefined || operand === "") return;
      expr += " " + s.operator + " " + operand;
    });
    return { name: f.name || "", expression: expr };
  }

  /* --- Expression engine ------------------------------------------------
   * Column names may contain spaces (e.g. "Order ID"), so tokens aren't
   * split on whitespace — instead, at every position the longest known
   * column name that matches there wins (maximal munch), which is what
   * lets multi-word names coexist with single-character operators.
   *
   * Besides arithmetic, the engine supports the CONCATENATE(a, b, ...)
   * function (any mix of columns, quoted text like ", " and numbers),
   * which produces a text value instead of a numeric one.
   * ------------------------------------------------------------------- */
  function tokenizeExpression(expression, knownNames) {
    var names = knownNames.slice().sort(function (a, b) { return b.length - a.length; });
    var tokens = [];
    var i = 0;
    var expr = expression || "";
    while (i < expr.length) {
      var ch = expr[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === "(" || ch === ")") { tokens.push({ type: "paren", value: ch }); i++; continue; }
      if (ch === ",") { tokens.push({ type: "comma", value: "," }); i++; continue; }
      if ("+-*/".indexOf(ch) !== -1) { tokens.push({ type: "op", value: ch }); i++; continue; }

      // Quoted text literal ("..." or '...'), for CONCATENATE separators
      // like ", ". Tokenized before anything else so operator/comma
      // characters inside the quotes never split it.
      if (ch === '"' || ch === "'") {
        var closeIdx = expr.indexOf(ch, i + 1);
        if (closeIdx === -1) {
          tokens.push({ type: "unknown", value: expr.slice(i) });
          i = expr.length;
          continue;
        }
        tokens.push({ type: "string", value: expr.slice(i + 1, closeIdx) });
        i = closeIdx + 1;
        continue;
      }

      // Function name — only when actually followed by "(", so a source
      // column that happens to be named "Concatenate" still resolves as a
      // column via the name matching below.
      var funcMatch = /^CONCATENATE(?=\s*\()/i.exec(expr.slice(i));
      if (funcMatch) {
        tokens.push({ type: "func", value: "CONCATENATE" });
        i += funcMatch[0].length;
        continue;
      }

      var matchedName = null;
      for (var n = 0; n < names.length; n++) {
        var name = names[n];
        if (expr.substr(i, name.length).toLowerCase() === name.toLowerCase()) { matchedName = name; break; }
      }
      if (matchedName) { tokens.push({ type: "column", value: matchedName }); i += matchedName.length; continue; }

      var numMatch = /^\d+(\.\d+)?/.exec(expr.slice(i));
      if (numMatch) { tokens.push({ type: "number", value: parseFloat(numMatch[0]) }); i += numMatch[0].length; continue; }

      var unkMatch = /^[^\s+\-*/(),"']+/.exec(expr.slice(i));
      var unkStr = unkMatch ? unkMatch[0] : ch;
      tokens.push({ type: "unknown", value: unkStr });
      i += unkStr.length;
    }
    return tokens;
  }

  // Recursive-descent parser: expr := term (('+'|'-') term)*,
  // term := factor (('*'|'/') factor)*, factor := number | column | string |
  // CONCATENATE '(' expr (',' expr)* ')' | '(' expr ')' | ('+'|'-') factor.
  // Standard precedence + parentheses, same as any spreadsheet formula bar.
  // A comma is only meaningful inside a function's argument list — parseExpr
  // naturally stops at one, and anywhere else it falls through to the
  // trailing-token error below.
  function parseExpressionTokens(tokens) {
    var pos = 0;
    function peek() { return tokens[pos]; }
    function next() { return tokens[pos++]; }

    function parseExpr() {
      var node = parseTerm();
      while (peek() && peek().type === "op" && (peek().value === "+" || peek().value === "-")) {
        var op = next().value;
        node = { type: "binary", op: op, left: node, right: parseTerm() };
      }
      return node;
    }
    function parseTerm() {
      var node = parseFactor();
      while (peek() && peek().type === "op" && (peek().value === "*" || peek().value === "/")) {
        var op = next().value;
        node = { type: "binary", op: op, left: node, right: parseFactor() };
      }
      return node;
    }
    function parseFactor() {
      var tok = peek();
      if (!tok) throw new Error("Formula is incomplete.");
      if (tok.type === "op" && (tok.value === "-" || tok.value === "+")) {
        next();
        var inner = parseFactor();
        return tok.value === "-" ? { type: "unary", operand: inner } : inner;
      }
      if (tok.type === "paren" && tok.value === "(") {
        next();
        var innerExpr = parseExpr();
        if (!peek() || peek().type !== "paren" || peek().value !== ")") throw new Error("Missing closing parenthesis.");
        next();
        return innerExpr;
      }
      if (tok.type === "func") {
        next();
        if (!peek() || peek().type !== "paren" || peek().value !== "(") {
          throw new Error("CONCATENATE must be followed by (…).");
        }
        next();
        var args = [parseExpr()];
        while (peek() && peek().type === "comma") {
          next();
          args.push(parseExpr());
        }
        if (!peek() || peek().type !== "paren" || peek().value !== ")") {
          throw new Error("Missing closing parenthesis after CONCATENATE arguments.");
        }
        next();
        return { type: "concat", args: args };
      }
      if (tok.type === "string") { next(); return { type: "string", value: tok.value }; }
      if (tok.type === "number") { next(); return { type: "number", value: tok.value }; }
      if (tok.type === "column") { next(); return { type: "column", name: tok.value }; }
      if (tok.type === "unknown") throw new Error("Unknown column \"" + tok.value + "\".");
      throw new Error("Unexpected \"" + tok.value + "\" in formula.");
    }

    var ast = parseExpr();
    if (pos < tokens.length) {
      var trailing = tokens[pos];
      throw new Error("Unexpected \"" + trailing.value + "\" in formula.");
    }
    return ast;
  }

  function evaluateAst(node, row) {
    switch (node.type) {
      case "number": return node.value;
      case "column": {
        var v = parseFloat(row[node.name]);
        return isNaN(v) ? 0 : v;
      }
      case "unary": return -evaluateAst(node.operand, row);
      case "binary": {
        var l = evaluateAst(node.left, row);
        var r = evaluateAst(node.right, row);
        if (node.op === "+") return l + r;
        if (node.op === "-") return l - r;
        if (node.op === "*") return l * r;
        return r === 0 ? NaN : l / r;
      }
      // A CONCATENATE (or bare text literal) used inside arithmetic is
      // coerced to a number when its text happens to be numeric, NaN
      // otherwise — same as how Excel treats ="1"&"2" + 0.
      case "string": {
        var sv = parseFloat(node.value);
        return isNaN(sv) ? NaN : sv;
      }
      case "concat": {
        var cv = parseFloat(evaluateAstText(node, row));
        return isNaN(cv) ? NaN : cv;
      }
      default: return NaN;
    }
  }

  // Text-context evaluation, used for CONCATENATE arguments and results:
  // columns yield their raw cell text (not parseFloat'd to 0 like the
  // numeric evaluator does), and nested arithmetic yields its computed
  // number rendered as text ("" when it doesn't evaluate).
  function evaluateAstText(node, row) {
    switch (node.type) {
      case "string": return node.value;
      case "column": {
        var v = row[node.name];
        return v === undefined || v === null ? "" : String(v);
      }
      case "concat":
        return node.args.map(function (a) { return evaluateAstText(a, row); }).join("");
      default: {
        var n = evaluateAst(node, row);
        return isNaN(n) || !isFinite(n) ? "" : String(n);
      }
    }
  }

  function computeExpressionValue(row, ast) {
    if (!ast) return "";
    if (ast.type === "concat" || ast.type === "string") return evaluateAstText(ast, row);
    var v = evaluateAst(ast, row);
    return isNaN(v) || !isFinite(v) ? "" : v;
  }

  /* --- Row markup, drag reordering, autocomplete, pill preview --------- */

  // Every source column (tagged with the current Report Type) plus every
  // OTHER formula currently in the list (tagged "calculated") — always read
  // fresh from the live DOM so a rename or a newly-added row is reflected
  // immediately in every other row's autocomplete, with no extra wiring.
  function getAvailableColumnsForFormulaRow(row) {
    var result = state.selectedColumns.map(function (c) { return { name: c, origin: state.selectedReportType }; });
    formulaList.querySelectorAll(".formula-row").forEach(function (otherRow) {
      if (otherRow === row) return;
      var otherName = otherRow.querySelector(".formula-name").value.trim();
      if (otherName) result.push({ name: otherName, origin: "calculated" });
    });
    // Available functions, offered in the same autocomplete as columns.
    // Listed last so a matching column always outranks them visually.
    result.push({ name: "CONCATENATE", origin: "function" });
    return result;
  }

  function renderExpressionPreview(previewEl, expression, knownNames) {
    previewEl.innerHTML = "";
    if (!expression.trim()) {
      var placeholder = document.createElement("span");
      placeholder.className = "formula-expr-preview-empty";
      placeholder.textContent = "Type a formula, e.g. Quantity * Price + GST − Discount";
      previewEl.appendChild(placeholder);
      return;
    }
    tokenizeExpression(expression, knownNames).forEach(function (t) {
      var span = document.createElement("span");
      if (t.type === "column") { span.className = "formula-pill"; span.textContent = t.value; }
      else if (t.type === "unknown") { span.className = "formula-pill formula-pill--unknown"; span.textContent = t.value; }
      else if (t.type === "number") { span.className = "formula-token-number"; span.textContent = t.value; }
      else if (t.type === "func") { span.className = "formula-pill formula-pill--func"; span.textContent = t.value; }
      else if (t.type === "string") { span.className = "formula-token-string"; span.textContent = '"' + t.value + '"'; }
      else { span.className = "formula-token-op"; span.textContent = t.value; }
      previewEl.appendChild(span);
    });
  }

  function refreshFormulaPreview(row) {
    var input = row.querySelector(".formula-expr-input");
    var previewEl = row.querySelector(".formula-expr-preview");
    var names = getAvailableColumnsForFormulaRow(row).map(function (c) { return c.name; });
    renderExpressionPreview(previewEl, input.value, names);
  }

  function refreshAllFormulaPreviews() {
    formulaList.querySelectorAll(".formula-row").forEach(function (row) { refreshFormulaPreview(row); });
  }

  // Autocomplete matches against the "operand currently being typed" —
  // bounded by the nearest operator/parenthesis/comma on each side rather
  // than whitespace, since a column name like "Order ID" has to be able to
  // contain a space itself while still being treated as one candidate. The
  // comma boundary is what makes each CONCATENATE argument its own operand
  // — without it, the second argument's partial spans back to the "(" and
  // never matches anything, silently killing suggestions mid-function.
  // getAvailable supplies the {name, origin} candidates (called fresh on
  // every keystroke) and onChanged fires after any programmatic edit, so
  // the same bar works on both the Formula Builder and the missing-columns
  // section of the column screen.
  function attachFormulaAutocomplete(input, dropdown, getAvailable, onChanged) {
    var activeIndex = -1;
    var OPERAND_BOUNDARY_CHARS = "+-*/(),";

    function operandBounds() {
      var val = input.value;
      var pos = input.selectionStart;
      var start = pos;
      while (start > 0 && OPERAND_BOUNDARY_CHARS.indexOf(val[start - 1]) === -1) start--;
      var end = pos;
      while (end < val.length && OPERAND_BOUNDARY_CHARS.indexOf(val[end]) === -1) end++;
      return { start: start, end: end, pos: pos };
    }

    function setActive(items) {
      items.forEach(function (it, idx) { it.classList.toggle("formula-autocomplete-item--active", idx === activeIndex); });
    }

    function showSuggestions() {
      var bounds = operandBounds();
      var partial = input.value.slice(bounds.start, bounds.pos).trim().toLowerCase();
      var available = getAvailable();
      // No cap here — every selected/renamed source column and every other
      // in-progress formula name must stay reachable (the dropdown already
      // scrolls via max-height in CSS), otherwise columns past whatever
      // limit is picked here silently become impossible to reference.
      var matches = available.filter(function (c) { return !partial || c.name.toLowerCase().indexOf(partial) !== -1; });

      dropdown.innerHTML = "";
      if (!matches.length) { dropdown.hidden = true; return; }
      activeIndex = 0;
      matches.forEach(function (c, idx) {
        var item = document.createElement("div");
        item.className = "formula-autocomplete-item" + (idx === 0 ? " formula-autocomplete-item--active" : "");
        item.dataset.name = c.name;
        item.dataset.origin = c.origin;
        var nameSpan = document.createElement("span");
        nameSpan.className = "formula-autocomplete-name";
        nameSpan.textContent = c.name;
        item.appendChild(nameSpan);
        var originSpan = document.createElement("span");
        originSpan.className = "formula-autocomplete-origin";
        originSpan.textContent = c.origin;
        item.appendChild(originSpan);
        dropdown.appendChild(item);
      });
      dropdown.hidden = false;
    }

    function acceptSuggestion(name, origin) {
      var bounds = operandBounds();
      var before = input.value.slice(0, bounds.start);
      var after = input.value.slice(bounds.end);
      // Accepting a function inserts the complete bracket PAIR with the
      // caret left inside it — the closing ")" is thereby placed exactly
      // once, already at its final position, so the user just types the
      // argument list and never has to close (or prematurely closes) the
      // bracket themselves. A column inserts its name plus a trailing
      // space, as before.
      var inserted = origin === "function" ? name + "()" : name + " ";
      var caretOffset = origin === "function" ? inserted.length - 1 : inserted.length;
      input.value = before + inserted + after;
      var newPos = before.length + caretOffset;
      input.setSelectionRange(newPos, newPos);
      dropdown.hidden = true;
      onChanged();
      input.focus();
    }

    input.addEventListener("input", function () {
      onChanged();
      showSuggestions();
    });
    input.addEventListener("focus", showSuggestions);
    input.addEventListener("keydown", function (e) {
      if (dropdown.hidden) return;
      var items = dropdown.querySelectorAll(".formula-autocomplete-item");
      if (e.key === "ArrowDown") { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, items.length - 1); setActive(items); }
      else if (e.key === "ArrowUp") { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); setActive(items); }
      else if (e.key === "Enter" || e.key === "Tab") {
        if (activeIndex >= 0 && items[activeIndex]) { e.preventDefault(); acceptSuggestion(items[activeIndex].dataset.name, items[activeIndex].dataset.origin); }
      } else if (e.key === "Escape") {
        dropdown.hidden = true;
      }
    });
    // mousedown (not click) + preventDefault keeps focus on the input so it
    // never blurs — and therefore never hides the dropdown — before the
    // click on a suggestion has a chance to register.
    dropdown.addEventListener("mousedown", function (e) {
      e.preventDefault();
      var item = e.target.closest(".formula-autocomplete-item");
      if (item) acceptSuggestion(item.dataset.name, item.dataset.origin);
    });
    input.addEventListener("blur", function () {
      setTimeout(function () { dropdown.hidden = true; }, 100);
    });
  }

  // Drag-reorders whole .formula-row elements within #formulaList — since
  // execution/save order is just DOM order (read in readFormulasFromDOM),
  // reordering the rows IS reordering the formulas.
  var draggedFormulaRow = null;

  function makeFormulaRowDraggable(row, handle) {
    handle.draggable = true;
    handle.addEventListener("dragstart", function (e) {
      draggedFormulaRow = row;
      row.classList.add("formula-row--dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "formula-row");
    });
    handle.addEventListener("dragend", function () {
      row.classList.remove("formula-row--dragging");
      formulaList.querySelectorAll(".formula-row--drag-over").forEach(function (el) { el.classList.remove("formula-row--drag-over"); });
      draggedFormulaRow = null;
    });
    row.addEventListener("dragover", function (e) {
      if (!draggedFormulaRow || draggedFormulaRow === row) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      row.classList.add("formula-row--drag-over");
    });
    row.addEventListener("dragleave", function () {
      row.classList.remove("formula-row--drag-over");
    });
    row.addEventListener("drop", function (e) {
      e.preventDefault();
      row.classList.remove("formula-row--drag-over");
      if (!draggedFormulaRow || draggedFormulaRow === row) return;
      var rect = row.getBoundingClientRect();
      var dropAfter = (e.clientY - rect.top) > rect.height / 2;
      row.parentNode.insertBefore(draggedFormulaRow, dropAfter ? row.nextSibling : row);
      refreshAllFormulaPreviews();
    });
  }

  function addFormulaRow(formulaData) {
    var data = formulaData ? migrateLegacyFormula(formulaData) : null;

    var row = document.createElement("div");
    row.className = "formula-row";

    var header = document.createElement("div");
    header.className = "formula-row__header";

    var dragHandle = document.createElement("span");
    dragHandle.className = "formula-drag-handle";
    dragHandle.title = "Drag to reorder";
    dragHandle.textContent = "⠿";
    header.appendChild(dragHandle);

    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "formula-name";
    nameInput.placeholder = "e.g. Net Payout Check";
    nameInput.value = (data && data.name) || "";
    header.appendChild(nameInput);

    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn formula-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", function () {
      row.remove();
      updateFormulaEmptyState();
    });
    header.appendChild(deleteBtn);
    row.appendChild(header);

    var body = document.createElement("div");
    body.className = "formula-row__body";

    var exprBar = document.createElement("div");
    exprBar.className = "formula-expr-bar";

    var prefix = document.createElement("span");
    prefix.className = "formula-expr-prefix";
    prefix.textContent = "=";
    exprBar.appendChild(prefix);

    var exprInput = document.createElement("input");
    exprInput.type = "text";
    exprInput.className = "formula-expr-input";
    exprInput.placeholder = "Quantity * Price + GST - Discount";
    exprInput.autocomplete = "off";
    exprInput.value = (data && data.expression) || "";
    exprBar.appendChild(exprInput);

    var dropdown = document.createElement("div");
    dropdown.className = "formula-autocomplete";
    dropdown.hidden = true;
    exprBar.appendChild(dropdown);

    body.appendChild(exprBar);

    var previewEl = document.createElement("div");
    previewEl.className = "formula-expr-preview";
    body.appendChild(previewEl);

    row.appendChild(body);
    formulaList.appendChild(row);

    makeFormulaRowDraggable(row, dragHandle);
    attachFormulaAutocomplete(exprInput, dropdown,
      function () { return getAvailableColumnsForFormulaRow(row); },
      function () { refreshFormulaPreview(row); });
    refreshFormulaPreview(row);

    updateFormulaEmptyState();
    return row;
  }

  function renderFormulaScreen() {
    formulaList.innerHTML = "";
    formulaErrorMsg.hidden = true;

    var saved = getFormulasFor(state.selectedReportType);
    saved.forEach(function (f) { addFormulaRow(f); });

    updateFormulaEmptyState();
  }

  // Reads {name, expression} for each formula in current DOM (= drag)
  // order — that order is exactly the top-to-bottom execution/save order.
  function readFormulasFromDOM() {
    var formulas = [];
    formulaList.querySelectorAll(".formula-row").forEach(function (row) {
      formulas.push({
        name: row.querySelector(".formula-name").value.trim(),
        expression: row.querySelector(".formula-expr-input").value.trim()
      });
    });
    return formulas;
  }

  document.getElementById("btnAddFormula").addEventListener("click", function () {
    addFormulaRow(null);
  });

  document.getElementById("btnFormulaBack").addEventListener("click", function () {
    showScreen("screen-columns");
  });

  btnFormulaNext.addEventListener("click", function () {
    var formulas = readFormulasFromDOM();
    // A formula with no name would otherwise be silently dropped from
    // becoming a column (nothing to key the row property or header on) —
    // every formula the user builds must produce a real column, so an
    // untitled one still gets a usable fallback name instead of vanishing.
    formulas.forEach(function (f, idx) {
      if (!f.name) f.name = "Formula " + (idx + 1);
    });
    formulaErrorMsg.hidden = true;

    // Validate + parse in top-to-bottom order: a formula may only reference
    // a source column or a formula that appears ABOVE it (already computed
    // by the time this one runs) — anything else is either a typo or an
    // ordering problem the drag handles are there to fix.
    var allNames = state.selectedColumns.concat(formulas.map(function (f) { return f.name; }));
    var knownSoFar = state.selectedColumns.slice();
    var blocked = false;
    for (var i = 0; i < formulas.length && !blocked; i++) {
      var f = formulas[i];
      if (!f.expression.trim()) { f.ast = null; knownSoFar.push(f.name); continue; }

      var namesForThisFormula = allNames.filter(function (n) { return n.toLowerCase() !== f.name.toLowerCase(); });
      var tokens = tokenizeExpression(f.expression, namesForThisFormula);

      var unknownTok = tokens.find(function (t) { return t.type === "unknown"; });
      if (unknownTok) {
        showFormulaError("Formula \"" + f.name + "\" uses an unknown column \"" + unknownTok.value + "\". Check the spelling or pick it from the autocomplete list.");
        blocked = true;
        break;
      }
      var notYetAvailable = tokens.find(function (t) { return t.type === "column" && knownSoFar.indexOf(t.value) === -1; });
      if (notYetAvailable) {
        showFormulaError("Formula \"" + f.name + "\" uses \"" + notYetAvailable.value + "\", which is created by a formula below it. Drag that formula above \"" + f.name + "\" (or drag \"" + f.name + "\" below it), then try again.");
        blocked = true;
        break;
      }
      try {
        f.ast = parseExpressionTokens(tokens);
      } catch (err) {
        showFormulaError("Formula \"" + f.name + "\" has an invalid expression: " + err.message);
        blocked = true;
        break;
      }
      knownSoFar.push(f.name);
    }
    if (blocked) return;

    saveFormulasFor(state.selectedReportType, formulas.map(function (f) { return { name: f.name, expression: f.expression }; }));

    mergeUploadIntoMasterAndPreview(formulas);
  });

  // The merge tail shared by the Formula screen's Next button and the
  // Express Run path: computes each (already parsed) formula onto the
  // renamed rows, snapshots pre-merge state for "Back to Formulas", merges
  // this upload into the Master Report and lands on Preview.
  function mergeUploadIntoMasterAndPreview(formulas) {
    currentRenamedRows.forEach(function (row) {
      formulas.forEach(function (f) {
        row[f.name] = computeExpressionValue(row, f.ast);
      });
    });

    var formulaColumnNames = formulas.map(function (f) { return f.name; });

    preMergeSnapshot = {
      masterReportName: state.selectedMasterReport,
      reportTypeName: state.selectedReportType,
      data: JSON.parse(JSON.stringify(getMasterReportData(state.selectedMasterReport))),
      registry: JSON.parse(JSON.stringify(getMasterReports()))
    };

    mergeReportTypeDataIntoMasterReport(
      state.selectedMasterReport,
      state.selectedReportType,
      state.selectedColumns.concat(formulaColumnNames),
      currentRenamedRows,
      { name: state.fileName, size: state.fileSize },
      state.selectedDateColumnHeader,
      state.dataMode || "add"
    );
    clearSetupProgress(state.selectedMasterReport, state.selectedReportType);

    goToPreviewStep();
  }

  /* ---------------------------------------------------------------------
   * Screen: Preview & export
   * ------------------------------------------------------------------- */
  /* --- Preview scope ------------------------------------------------------
   * The Preview & Export screen defaults to "This session" — only the
   * Report Types actually worked with during this browser visit (see
   * markReportTypeActive). Data from untouched types never silently rides
   * along; switching to "All Report Types" shows everything, with stale
   * types clearly marked and offered for update/removal. Pure view/export
   * filter: the stored master data always keeps every Report Type's rows.
   * ---------------------------------------------------------------------- */
  var previewScope = "session"; // "session" | "all"

  function previewRowInScope(row) {
    return previewScope !== "session" || isReportTypeActive(row["Report Type"]);
  }

  document.getElementById("btnPreviewScopeType").addEventListener("click", function () {
    previewScope = "session";
    renderPreviewScreen();
  });
  document.getElementById("btnPreviewScopeAll").addEventListener("click", function () {
    previewScope = "all";
    renderPreviewScreen();
  });

  function goToPreviewStep() {
    previewScope = "session";
    renderPreviewScreen();
    showScreen("screen-preview");
  }

  // Drag state for header reordering — module-level since dragstart/drop
  // fire on two different <th> elements and both need to agree on which
  // column started the drag.
  var previewDraggedColumn = null;

  // The ⠿ handle (not the whole header cell) is what's draggable — same
  // pattern as the Formula Builder's row drag handle — so the header cell
  // itself stays free for future use (e.g. click-to-sort) without
  // conflicting with drag gestures. dragover/drop still listen on the
  // whole th so dropping anywhere in the column's header cell works, not
  // just precisely on the handle.
  function makePreviewHeaderDraggable(th, column, headRow) {
    th.className = "preview-th-draggable";
    th.dataset.column = column;
    th.innerHTML = "";

    var content = document.createElement("span");
    content.className = "preview-th-content";

    var handle = document.createElement("span");
    handle.className = "preview-th-handle";
    handle.title = "Drag to reorder";
    handle.textContent = "⠿";
    handle.draggable = true;
    content.appendChild(handle);

    var label = document.createElement("span");
    label.textContent = column;
    content.appendChild(label);

    // Excel-style column delete: hides the column from the preview table
    // and the exported file only (see getEffectiveExportColumns) — the
    // stored data keeps it, and the "Deleted from export" bar under the
    // table restores it with one click.
    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "preview-th-delete";
    delBtn.title = "Delete \"" + column + "\" from the export (restorable below)";
    delBtn.textContent = "×";
    delBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var fresh = getExportDecorationFor(state.selectedReportType);
      if (fresh.deletedColumns.indexOf(column) === -1) fresh.deletedColumns.push(column);
      saveExportDecorationFor(state.selectedReportType, fresh);
      renderPreviewScreen();
    });
    content.appendChild(delBtn);

    th.appendChild(content);

    handle.addEventListener("dragstart", function (e) {
      previewDraggedColumn = column;
      th.classList.add("preview-th--dragging");
      e.dataTransfer.effectAllowed = "move";
      // Firefox requires setData to be called for the drag to start at all.
      e.dataTransfer.setData("text/plain", column);
    });
    handle.addEventListener("dragend", function () {
      th.classList.remove("preview-th--dragging");
      headRow.querySelectorAll(".preview-th--drag-over").forEach(function (el) {
        el.classList.remove("preview-th--drag-over");
      });
      previewDraggedColumn = null;
    });
    th.addEventListener("dragover", function (e) {
      if (!previewDraggedColumn || previewDraggedColumn === column) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      th.classList.add("preview-th--drag-over");
    });
    th.addEventListener("dragleave", function () {
      th.classList.remove("preview-th--drag-over");
    });
    th.addEventListener("drop", function (e) {
      e.preventDefault();
      th.classList.remove("preview-th--drag-over");
      if (!previewDraggedColumn || previewDraggedColumn === column) return;

      var data = getMasterReportData(state.selectedMasterReport);
      var currentOrder = getEffectiveExportColumns(state.selectedReportType, data.columns);
      var fromIdx = currentOrder.indexOf(previewDraggedColumn);
      var toIdx = currentOrder.indexOf(column);
      if (fromIdx === -1 || toIdx === -1) return;
      currentOrder.splice(fromIdx, 1);
      currentOrder.splice(toIdx, 0, previewDraggedColumn);
      saveColumnOrderFor(state.selectedReportType, currentOrder);
      renderPreviewScreen();
    });
  }

  // Drag-resizes a <col> element (which is what actually controls the
  // rendered width under table-layout:fixed) from a resizer handle placed
  // on its <th>. Persists to this Report Type's saved decoration on
  // mouseup only (not on every mousemove) — re-reading the saved
  // decoration fresh at that point rather than closing over the one read
  // at render time, so a resize started before another decoration control
  // was changed doesn't clobber it.
  function attachColumnResizer(th, col, widthKey) {
    var resizer = document.createElement("span");
    resizer.className = "preview-th-resizer";
    resizer.title = "Drag to resize column";
    th.appendChild(resizer);

    resizer.addEventListener("mousedown", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var startX = e.clientX;
      // Read the <th>'s own rendered width rather than the <col>'s —
      // getBoundingClientRect() on a <col> element is unreliable across
      // browsers, even though setting col.style.width below (which is what
      // actually drives table-layout:fixed column sizing) is well-supported.
      var startWidth = th.getBoundingClientRect().width;
      resizer.classList.add("preview-th-resizer--active");

      function onMove(ev) {
        var newWidth = Math.max(50, Math.round(startWidth + (ev.clientX - startX)));
        col.style.width = newWidth + "px";
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        resizer.classList.remove("preview-th-resizer--active");
        var fresh = getExportDecorationFor(state.selectedReportType);
        fresh.columnWidths[widthKey] = parseInt(col.style.width, 10);
        saveExportDecorationFor(state.selectedReportType, fresh);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  // A small per-column number-format picker, shown only for columns whose
  // own values classify as numeric (same classifyColumn heuristic the
  // Analysis Dashboard uses) — applied to the exported Excel cells only,
  // never displayed/converted in this on-screen preview table.
  var NUMBER_FORMAT_OPTIONS = [
    ["plain", "Number"],
    ["currency", "Currency (₹)"],
    ["percentage", "Percentage"],
    ["decimal2", "2 decimals"]
  ];
  function attachNumberFormatSelect(th, column, data, decoration) {
    if (!data || !data.rows.length || classifyColumn(data.rows, column).type !== "numeric") return;

    var select = document.createElement("select");
    select.className = "preview-th-numfmt";
    select.title = "Number format for \"" + column + "\" in the exported Excel";
    NUMBER_FORMAT_OPTIONS.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt[0];
      o.textContent = opt[1];
      select.appendChild(o);
    });
    select.value = decoration.numberFormats[column] || "plain";
    // Keep the dropdown from also triggering the header's own drag/reorder
    // gesture handling on the same th.
    select.addEventListener("mousedown", function (e) { e.stopPropagation(); });
    select.addEventListener("click", function (e) { e.stopPropagation(); });
    select.addEventListener("change", function () {
      var fresh = getExportDecorationFor(state.selectedReportType);
      if (select.value === "plain") delete fresh.numberFormats[column];
      else fresh.numberFormats[column] = select.value;
      saveExportDecorationFor(state.selectedReportType, fresh);
    });
    th.appendChild(select);
  }

  // The three scalar decoration toggles (bold, fill colour, freeze) are
  // wired once here rather than re-attached on every renderPreviewScreen()
  // call — renderPreviewScreen only ever sets their current *value* to
  // match the saved decoration for whichever Report Type is now active.
  document.getElementById("chkHeaderBold").addEventListener("change", function (e) {
    var fresh = getExportDecorationFor(state.selectedReportType);
    fresh.headerBold = e.target.checked;
    saveExportDecorationFor(state.selectedReportType, fresh);
  });
  document.getElementById("colorHeaderFill").addEventListener("input", function (e) {
    var fresh = getExportDecorationFor(state.selectedReportType);
    fresh.headerFillColor = e.target.value.replace(/^#/, "").toUpperCase();
    saveExportDecorationFor(state.selectedReportType, fresh);
  });
  document.getElementById("btnHeaderFillClear").addEventListener("click", function () {
    var fresh = getExportDecorationFor(state.selectedReportType);
    fresh.headerFillColor = "";
    saveExportDecorationFor(state.selectedReportType, fresh);
    document.getElementById("colorHeaderFill").value = "#dbe6ff";
  });
  document.getElementById("colorHeaderFont").addEventListener("input", function (e) {
    var fresh = getExportDecorationFor(state.selectedReportType);
    fresh.headerFontColor = e.target.value.replace(/^#/, "").toUpperCase();
    saveExportDecorationFor(state.selectedReportType, fresh);
  });
  document.getElementById("btnHeaderFontClear").addEventListener("click", function () {
    var fresh = getExportDecorationFor(state.selectedReportType);
    fresh.headerFontColor = "";
    saveExportDecorationFor(state.selectedReportType, fresh);
    document.getElementById("colorHeaderFont").value = "#1c2433";
  });
  document.getElementById("colorCellFill").addEventListener("input", function (e) {
    var fresh = getExportDecorationFor(state.selectedReportType);
    fresh.cellFillColor = e.target.value.replace(/^#/, "").toUpperCase();
    saveExportDecorationFor(state.selectedReportType, fresh);
  });
  document.getElementById("btnCellFillClear").addEventListener("click", function () {
    var fresh = getExportDecorationFor(state.selectedReportType);
    fresh.cellFillColor = "";
    saveExportDecorationFor(state.selectedReportType, fresh);
    document.getElementById("colorCellFill").value = "#ffffff";
  });
  document.getElementById("chkCellBorders").addEventListener("change", function (e) {
    var fresh = getExportDecorationFor(state.selectedReportType);
    fresh.cellBorders = e.target.checked;
    saveExportDecorationFor(state.selectedReportType, fresh);
  });
  document.getElementById("chkFreezeHeader").addEventListener("change", function (e) {
    var fresh = getExportDecorationFor(state.selectedReportType);
    fresh.freezeHeader = e.target.checked;
    saveExportDecorationFor(state.selectedReportType, fresh);
  });

  function renderPreviewScreen() {
    var data = getMasterReportData(state.selectedMasterReport);
    var mr = getMasterReport(state.selectedMasterReport);
    var exportColumns = data ? getEffectiveExportColumns(state.selectedReportType, data.columns) : [];
    var decoration = getExportDecorationFor(state.selectedReportType);

    // Scope: the selector only matters when the session view and the full
    // view would differ (some type untouched this session). If NOTHING in
    // this master is active — e.g. a fresh visit landing here indirectly —
    // an empty session view would just look broken, so fall back to All.
    var masterTypes = mr ? mr.reportTypesUsed : [];
    var someActive = masterTypes.some(isReportTypeActive);
    var someInactive = masterTypes.some(function (t) { return !isReportTypeActive(t); });
    if (!someActive) previewScope = "all";
    var scopeAvailable = someActive && someInactive;
    var scopeBar = document.getElementById("previewScopeBar");
    scopeBar.hidden = !scopeAvailable;
    if (scopeAvailable) {
      document.getElementById("btnPreviewScopeType").textContent = "This session";
      document.getElementById("btnPreviewScopeType").classList.toggle("missing-column-mode__btn--active", previewScope === "session");
      document.getElementById("btnPreviewScopeAll").classList.toggle("missing-column-mode__btn--active", previewScope === "all");
    }

    var allRows = data ? data.rows : [];
    var scopedRows = allRows.filter(previewRowInScope);
    var deletedRowCount = 0;
    scopedRows.forEach(function (r) { if (r.__saiDeleted) deletedRowCount++; });

    document.getElementById("previewMasterReportName").textContent = state.selectedMasterReport;
    document.getElementById("previewMeta").textContent =
      (scopedRows.length - deletedRowCount) + " total rows" +
      (previewScope === "session" && scopeAvailable ? " (this session)" : "") +
      (deletedRowCount ? " (" + deletedRowCount + " deleted from export)" : "") +
      " · Updated " + formatDateForDisplay(data ? data.lastUpdated : null);

    // Chips carry each type's freshness; untouched types are visibly stale.
    var chips = document.getElementById("previewReportTypeChips");
    chips.innerHTML = "";
    masterTypes.forEach(function (t) {
      var chip = document.createElement("span");
      var meta = data && data.typeMeta ? data.typeMeta[t] : null;
      var active = isReportTypeActive(t);
      chip.className = "chip" + (active ? "" : " chip--stale");
      chip.textContent = t + " · " + (meta && meta.lastUpdated ? formatDateForDisplay(meta.lastUpdated) : "updated: unknown") + (active ? "" : " · not this session");
      chips.appendChild(chip);
    });

    // In the All view, every stale type gets one line: when it was last
    // updated, plus direct Update / Remove actions.
    var staleNotice = document.getElementById("previewStaleNotice");
    staleNotice.innerHTML = "";
    var staleTypes = masterTypes.filter(function (t) { return !isReportTypeActive(t); });
    staleNotice.hidden = !(previewScope === "all" && staleTypes.length > 0);
    if (!staleNotice.hidden) {
      staleTypes.forEach(function (t) {
        var meta = data && data.typeMeta ? data.typeMeta[t] : null;
        var line = document.createElement("div");
        line.className = "stale-notice__line";
        line.appendChild(document.createTextNode(
          "\"" + t + "\" hasn't been touched this session (last updated: " +
          (meta && meta.lastUpdated ? formatDateForDisplay(meta.lastUpdated) : "unknown") + "). "
        ));
        var updBtn = document.createElement("button");
        updBtn.type = "button";
        updBtn.className = "link-btn";
        updBtn.textContent = "Upload new data";
        updBtn.addEventListener("click", function () {
          var master = state.selectedMasterReport;
          resetFileState();
          state.selectedMasterReport = master;
          state.selectedReportType = t;
          markReportTypeActive(t);
          showScreen("screen-upload");
        });
        line.appendChild(updBtn);
        line.appendChild(document.createTextNode(" · "));
        var remBtn = document.createElement("button");
        remBtn.type = "button";
        remBtn.className = "link-btn";
        remBtn.textContent = "Remove from this report";
        remBtn.addEventListener("click", function () {
          var count = getReportTypeRowCount(state.selectedMasterReport, t);
          var ok = window.confirm(
            "Remove \"" + t + "\" from \"" + state.selectedMasterReport + "\"?\n\n" +
            "Its " + count + " row" + (count === 1 ? "" : "s") + " will be deleted from this Master Report. " +
            "The Report Type's saved mapping and formulas stay available for reuse. This cannot be undone."
          );
          if (!ok) return;
          deleteReportTypeFromMasterReport(state.selectedMasterReport, t);
          renderPreviewScreen();
        });
        line.appendChild(remBtn);
        staleNotice.appendChild(line);
      });
    }

    document.getElementById("previewExportMsg").hidden = true;

    document.getElementById("chkHeaderBold").checked = decoration.headerBold;
    document.getElementById("colorHeaderFill").value = decoration.headerFillColor ? "#" + decoration.headerFillColor : "#dbe6ff";
    document.getElementById("colorHeaderFont").value = decoration.headerFontColor ? "#" + decoration.headerFontColor : "#1c2433";
    document.getElementById("colorCellFill").value = decoration.cellFillColor ? "#" + decoration.cellFillColor : "#ffffff";
    document.getElementById("chkCellBorders").checked = decoration.cellBorders;
    document.getElementById("chkFreezeHeader").checked = decoration.freezeHeader;

    var deletedBar = document.getElementById("previewDeletedBar");
    deletedBar.innerHTML = "";
    deletedBar.hidden = decoration.deletedColumns.length === 0 && deletedRowCount === 0;
    if (decoration.deletedColumns.length) {
      deletedBar.appendChild(document.createTextNode("Deleted from export: "));
      decoration.deletedColumns.forEach(function (col, idx) {
        if (idx > 0) deletedBar.appendChild(document.createTextNode(", "));
        deletedBar.appendChild(document.createTextNode(col + " "));
        var restoreBtn = document.createElement("button");
        restoreBtn.type = "button";
        restoreBtn.className = "link-btn";
        restoreBtn.textContent = "(restore)";
        restoreBtn.addEventListener("click", function () {
          var fresh = getExportDecorationFor(state.selectedReportType);
          fresh.deletedColumns = fresh.deletedColumns.filter(function (c) { return c !== col; });
          saveExportDecorationFor(state.selectedReportType, fresh);
          renderPreviewScreen();
        });
        deletedBar.appendChild(restoreBtn);
      });
    }
    if (deletedRowCount) {
      if (decoration.deletedColumns.length) deletedBar.appendChild(document.createTextNode(" · "));
      deletedBar.appendChild(document.createTextNode(
        deletedRowCount + " row" + (deletedRowCount === 1 ? "" : "s") + " deleted from export "
      ));
      var restoreRowsBtn = document.createElement("button");
      restoreRowsBtn.type = "button";
      restoreRowsBtn.className = "link-btn";
      restoreRowsBtn.textContent = "(restore all rows)";
      restoreRowsBtn.addEventListener("click", function () {
        var fresh = getMasterReportData(state.selectedMasterReport);
        fresh.rows.forEach(function (r) { delete r.__saiDeleted; });
        saveMasterReportData(state.selectedMasterReport, fresh);
        renderPreviewScreen();
      });
      deletedBar.appendChild(restoreRowsBtn);
    }

    var colgroup = document.getElementById("previewTableColgroup");
    colgroup.innerHTML = "";
    var snoCol = document.createElement("col");
    if (decoration.columnWidths[EXPORT_SNO_KEY]) snoCol.style.width = decoration.columnWidths[EXPORT_SNO_KEY] + "px";
    colgroup.appendChild(snoCol);

    var headRow = document.getElementById("previewTableHeadRow");
    headRow.innerHTML = "";
    var thSno = document.createElement("th");
    thSno.className = "preview-th-draggable";
    thSno.textContent = "S.No.";
    headRow.appendChild(thSno);
    attachColumnResizer(thSno, snoCol, EXPORT_SNO_KEY);

    exportColumns.forEach(function (c) {
      var col = document.createElement("col");
      if (decoration.columnWidths[c]) col.style.width = decoration.columnWidths[c] + "px";
      colgroup.appendChild(col);

      var th = document.createElement("th");
      makePreviewHeaderDraggable(th, c, headRow);
      headRow.appendChild(th);
      attachColumnResizer(th, col, c);
      attachNumberFormatSelect(th, c, data, decoration);
    });

    var body = document.getElementById("previewTableBody");
    body.innerHTML = "";
    clearPreviewRowSelection();
    // The full merged dataset is shown (not a capped preview) — the
    // surrounding .header-row-preview-wrap already scrolls both ways with a
    // sticky header row, which is what makes that viable. Rows flagged
    // __saiDeleted are skipped here and in the export, but stay in the
    // stored data (restorable via the deleted bar), so deleting rows never
    // destroys the merged data itself. dataset.rowIndex keeps each visible
    // row tied to its position in data.rows; dataset.visIndex is its
    // position in the visible sequence, used for drag-range selection.
    var visIdx = 0;
    allRows.forEach(function (row, actualIdx) {
      if (row.__saiDeleted || !previewRowInScope(row)) return;
      var tr = document.createElement("tr");
      tr.dataset.rowIndex = String(actualIdx);
      tr.dataset.visIndex = String(visIdx);

      var tdSno = document.createElement("td");
      tdSno.className = "preview-sno-cell";
      tdSno.title = "Click to select this row, drag down to select several";
      var num = document.createElement("span");
      num.textContent = String(visIdx + 1);
      tdSno.appendChild(num);
      var rowDelBtn = document.createElement("button");
      rowDelBtn.type = "button";
      rowDelBtn.className = "preview-row-delete";
      rowDelBtn.title = "Delete this row from the export (restorable below)";
      rowDelBtn.textContent = "×";
      tdSno.appendChild(rowDelBtn);
      tr.appendChild(tdSno);

      exportColumns.forEach(function (c) {
        var td = document.createElement("td");
        var v = row[c];
        td.textContent = v === undefined || v === null ? "" : v;
        tr.appendChild(td);
      });
      body.appendChild(tr);
      visIdx++;
    });
  }

  /* --- Preview row selection & deletion ---------------------------------
   * Excel-style: click a row's S.No. cell to select it, or press and drag
   * down/up through the S.No. column to select a range, then delete the
   * whole selection from the bar above the table. Each row's own × deletes
   * just that row. Deletion only flags the stored row (__saiDeleted) — the
   * preview and the exported file skip flagged rows, the merged data keeps
   * them, and "(restore all rows)" in the deleted bar clears the flags.
   * ------------------------------------------------------------------- */
  var previewTableBodyEl = document.getElementById("previewTableBody");
  var previewRowSelecting = false;
  var previewRowAnchor = -1; // visIndex where the current drag started

  function updatePreviewRowHighlight(extentVisIdx) {
    var lo = Math.min(previewRowAnchor, extentVisIdx);
    var hi = Math.max(previewRowAnchor, extentVisIdx);
    previewTableBodyEl.querySelectorAll("tr").forEach(function (tr) {
      var v = parseInt(tr.dataset.visIndex, 10);
      tr.classList.toggle("preview-row--selected", v >= lo && v <= hi);
    });
  }

  function selectedPreviewRowIndices() {
    var out = [];
    previewTableBodyEl.querySelectorAll("tr.preview-row--selected").forEach(function (tr) {
      out.push(parseInt(tr.dataset.rowIndex, 10));
    });
    return out;
  }

  function updatePreviewRowSelectionBar() {
    var count = previewTableBodyEl.querySelectorAll("tr.preview-row--selected").length;
    document.getElementById("previewRowSelectionBar").hidden = count === 0;
    document.getElementById("previewRowSelectionCount").textContent =
      count + " row" + (count === 1 ? "" : "s") + " selected";
  }

  function clearPreviewRowSelection() {
    previewRowSelecting = false;
    previewRowAnchor = -1;
    previewTableBodyEl.querySelectorAll("tr.preview-row--selected").forEach(function (tr) {
      tr.classList.remove("preview-row--selected");
    });
    document.getElementById("previewRowSelectionBar").hidden = true;
  }

  function deletePreviewRowsByIndex(actualIndices) {
    if (!actualIndices.length) return;
    var data = getMasterReportData(state.selectedMasterReport);
    actualIndices.forEach(function (i) {
      if (data.rows[i]) data.rows[i].__saiDeleted = true;
    });
    saveMasterReportData(state.selectedMasterReport, data);
    renderPreviewScreen();
  }

  previewTableBodyEl.addEventListener("mousedown", function (e) {
    if (e.button !== 0 || e.target.closest(".preview-row-delete")) return;
    var sno = e.target.closest(".preview-sno-cell");
    if (!sno) return;
    e.preventDefault(); // keep the drag from text-selecting the table
    previewRowSelecting = true;
    previewRowAnchor = parseInt(sno.parentNode.dataset.visIndex, 10);
    updatePreviewRowHighlight(previewRowAnchor);
    updatePreviewRowSelectionBar();
  });
  previewTableBodyEl.addEventListener("mouseover", function (e) {
    if (!previewRowSelecting) return;
    var tr = e.target.closest("tr");
    if (!tr || tr.parentNode !== previewTableBodyEl) return;
    updatePreviewRowHighlight(parseInt(tr.dataset.visIndex, 10));
    updatePreviewRowSelectionBar();
  });
  document.addEventListener("mouseup", function () {
    previewRowSelecting = false;
  });

  previewTableBodyEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".preview-row-delete");
    if (!btn) return;
    deletePreviewRowsByIndex([parseInt(btn.closest("tr").dataset.rowIndex, 10)]);
  });

  document.getElementById("btnPreviewDeleteRows").addEventListener("click", function () {
    deletePreviewRowsByIndex(selectedPreviewRowIndices());
  });
  document.getElementById("btnPreviewClearRowSelection").addEventListener("click", clearPreviewRowSelection);

  // Undoes the merge that just ran (see the preMergeSnapshot capture in
  // btnFormulaNext) so the Formula screen's Next button can perform one
  // clean re-merge — of the same rows, or of edited formula output —
  // instead of appending a duplicate copy of this upload's rows on top of
  // itself. A no-op restore (snapshot doesn't match the current upload,
  // e.g. this Preview was somehow reached another way) just navigates back.
  document.getElementById("btnPreviewBack").addEventListener("click", function () {
    if (preMergeSnapshot &&
        preMergeSnapshot.masterReportName === state.selectedMasterReport &&
        preMergeSnapshot.reportTypeName === state.selectedReportType) {
      saveMasterReportData(state.selectedMasterReport, preMergeSnapshot.data);
      saveMasterReports(preMergeSnapshot.registry);
      recordSetupProgress(state.selectedMasterReport, state.selectedReportType, 4, {
        fileName: state.fileName,
        fileSize: state.fileSize,
        selectedSheetName: state.selectedSheetName,
        selectedHeaderRowIndex: state.selectedHeaderRowIndex,
        currentFileHeaders: currentFileHeaders,
        currentFileRows: currentFileRows,
        selectedColumns: state.selectedColumns,
        selectedDateColumnHeader: state.selectedDateColumnHeader,
        currentRenamedRows: currentRenamedRows
      });
    }
    renderFormulaScreen();
    showScreen("screen-formula");
  });

  document.getElementById("btnPreviewHome").addEventListener("click", function () {
    resetFileState();
    state.selectedMasterReport = "";
    state.selectedReportType = "";
    renderHomeScreen();
    showScreen("screen-home");
  });

  document.getElementById("btnPreviewAddReportType").addEventListener("click", function () {
    var keepMasterReport = state.selectedMasterReport;
    resetFileState();
    state.selectedMasterReport = keepMasterReport;
    state.selectedReportType = "";
    renderMasterReportScreen(true);
    showScreen("screen-master-report");
  });

  function computePeriodCoveredText(rows) {
    var dates = rows
      .map(function (r) { return r.__saiDate; })
      .filter(function (d) { return !!d; })
      .map(function (d) { return new Date(d); });
    if (!dates.length) return "N/A";
    var min = new Date(Math.min.apply(null, dates));
    var max = new Date(Math.max.apply(null, dates));
    // Standardised DD/MM/YYYY, same as the date cells themselves.
    return formatDateDDMMYYYY(min) + " to " + formatDateDDMMYYYY(max);
  }

  // Excel number-format codes behind each NUMBER_FORMAT_OPTIONS choice.
  // "plain" has no entry — it means "don't set a custom format", i.e.
  // leave the cell exactly as an untouched export would.
  var NUMBER_FORMAT_CODES = {
    currency: '"₹"#,##0.00',
    percentage: "0.00%",
    decimal2: "0.00"
  };

  // Rough px→Excel-"characters" conversion (Calibri 11, SheetJS's own
  // default column font): ~7px per character plus a little cell padding.
  // Precision doesn't matter here — this only has to look reasonably close
  // to what the user dragged on screen.
  function pxToExcelChars(px) {
    return Math.max(4, Math.round((px - 5) / 7));
  }

  // Applies whichever decoration prefs are actually set to the worksheet
  // that generateMasterReportExport() just built via aoa_to_sheet — every
  // piece here is skipped independently when untouched, so a user who
  // never opens the decoration toolbar gets a sheet with none of `!cols`,
  // cell `.s`, or cell `.z` set at all, identical to the export before this
  // feature existed. Borders/fills are applied to the table region only
  // (header row + data rows), never to the title block above it.
  function applyExportDecorationToSheet(ws, exportColumns, data, decoration, headerRowIndex0) {
    var hasCustomWidths = Object.keys(decoration.columnWidths).length > 0;
    if (hasCustomWidths) {
      var widthKeys = [EXPORT_SNO_KEY].concat(exportColumns);
      // Columns the user never resized must be null, not {} — the library
      // writes {} as <col min max> with no width attribute, which Excel
      // renders as a zero-width (hidden-looking) column. Null entries are
      // skipped entirely, leaving those columns at Excel's default width.
      ws["!cols"] = widthKeys.map(function (key) {
        return decoration.columnWidths[key] ? { wch: pxToExcelChars(decoration.columnWidths[key]) } : null;
      });
    }

    // Excel's "All Borders": a thin black border on every side of every
    // table cell. Shared by the header and data cell styles below.
    var borderStyle = decoration.cellBorders ? {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } }
    } : null;

    if (decoration.headerBold || decoration.headerFillColor || decoration.headerFontColor || borderStyle) {
      var headerStyle = {};
      if (decoration.headerBold || decoration.headerFontColor) {
        headerStyle.font = {};
        if (decoration.headerBold) headerStyle.font.bold = true;
        // 8-digit ARGB: xlsx-js-style prepends the FF alpha for fill
        // colours but writes font colours verbatim, and OOXML wants ARGB.
        if (decoration.headerFontColor) headerStyle.font.color = { rgb: "FF" + decoration.headerFontColor };
      }
      if (decoration.headerFillColor) headerStyle.fill = { fgColor: { rgb: decoration.headerFillColor } };
      if (borderStyle) headerStyle.border = borderStyle;
      for (var c = 0; c <= exportColumns.length; c++) {
        var addr = XLSX.utils.encode_cell({ r: headerRowIndex0, c: c });
        if (ws[addr]) ws[addr].s = headerStyle;
      }
    }

    var dataStyle = null;
    if (decoration.cellFillColor || borderStyle) {
      dataStyle = {};
      if (decoration.cellFillColor) dataStyle.fill = { fgColor: { rgb: decoration.cellFillColor } };
      if (borderStyle) dataStyle.border = borderStyle;
    }

    var formatByColIdx = {};
    exportColumns.forEach(function (colName, idx) {
      var fmtKey = decoration.numberFormats[colName];
      var fmtCode = fmtKey && NUMBER_FORMAT_CODES[fmtKey];
      if (fmtCode) formatByColIdx[idx + 1] = fmtCode; // +1 for the S.No. column
    });

    if (dataStyle || Object.keys(formatByColIdx).length) {
      for (var r = 0; r < data.rows.length; r++) {
        for (var c2 = 0; c2 <= exportColumns.length; c2++) {
          var addr2 = XLSX.utils.encode_cell({ r: headerRowIndex0 + 1 + r, c: c2 });
          var cell = ws[addr2];
          if (!cell) continue;
          var fmt = formatByColIdx[c2];
          if (fmt) cell.z = fmt;
          if (dataStyle) {
            // xlsx-js-style derives a styled cell's number format from
            // s.numFmt, so when a cell has both a style and a format the
            // format must ride along inside the style object — .z alone
            // is only honoured on style-less cells.
            if (fmt) {
              var styled = { numFmt: fmt };
              if (dataStyle.fill) styled.fill = dataStyle.fill;
              if (dataStyle.border) styled.border = dataStyle.border;
              cell.s = styled;
            } else {
              cell.s = dataStyle;
            }
          }
        }
      }
    }
  }

  // onDone(true) once the file has actually been handed to the browser for
  // download, onDone(false) if there was nothing to export — callers chain
  // their post-download navigation off this instead of a plain return
  // value, since the freeze-header path above is asynchronous.
  function generateMasterReportExport(onDone) {
    var data = getMasterReportData(state.selectedMasterReport);
    // Rows deleted on the Preview screen stay in the stored data but are
    // flagged __saiDeleted — the export must skip them, same as the
    // preview. The preview's scope applies too: what you see is what
    // downloads (only the uploaded Report Type when scoped).
    var activeRows = data ? data.rows.filter(function (r) { return !r.__saiDeleted && previewRowInScope(r); }) : [];
    if (!activeRows.length) {
      alert("No data to export yet.");
      onDone(false);
      return;
    }

    var exportColumns = getEffectiveExportColumns(state.selectedReportType, data.columns); // __saiDate is bookkeeping-only, never exported
    var todayText = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

    var aoa = [];
    aoa.push([state.companyName || ""]);
    aoa.push([state.selectedMasterReport]);
    aoa.push(["Date generated: " + todayText]);
    aoa.push(["Period covered: " + computePeriodCoveredText(activeRows)]);
    aoa.push([]);
    var headerRowIndex0 = aoa.length; // row index of the header row, 0-based
    aoa.push(["S.No."].concat(exportColumns));
    activeRows.forEach(function (row, idx) {
      aoa.push([idx + 1].concat(exportColumns.map(function (c) {
        var v = row[c];
        return v === undefined || v === null ? "" : v;
      })));
    });

    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var decoration = getExportDecorationFor(state.selectedReportType);
    applyExportDecorationToSheet(ws, exportColumns, data, decoration, headerRowIndex0);

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master Report");
    // A session-scoped export containing exactly one Report Type is named
    // after it, so a June "Amazon Report" download can't be mistaken for
    // the full master.
    var safeName = state.selectedMasterReport.replace(/[\\/:*?"<>|]/g, "_");
    if (previewScope === "session") {
      var exportedTypes = {};
      activeRows.forEach(function (r) { if (r["Report Type"]) exportedTypes[r["Report Type"]] = true; });
      var typeNames = Object.keys(exportedTypes);
      if (typeNames.length === 1) safeName += " - " + typeNames[0].replace(/[\\/:*?"<>|]/g, "_");
    }

    function finish() {
      var msg = document.getElementById("previewExportMsg");
      msg.textContent = "Downloaded \"" + safeName + ".xlsx\".";
      msg.hidden = false;
      onDone(true);
    }

    if (decoration.freezeHeader) {
      // Freeze just below the header row, whatever row that ends up being
      // (fixed at row 6 today, but derived rather than hardcoded).
      var freezeRow0 = headerRowIndex0 + 1; // 0-based first frozen-out (scrollable) row
      downloadWorkbookWithFreezeAt(wb, safeName, freezeRow0, finish);
    } else {
      XLSX.writeFile(wb, safeName + ".xlsx");
      finish();
    }
  }

  // Neither SheetJS nor xlsx-js-style can write frozen panes, so when the
  // user has asked for one, the already-written .xlsx (a zip archive) is
  // unzipped, the single sheet's XML is patched with a <pane> element
  // (frozen right under freezeRow0, this export's actual header row rather
  // than an assumed row 1), and rezipped for download — the one piece of
  // this feature no JS library exposes an API for. Falls back to a plain
  // (unfrozen) download if the patch fails for any reason, since freezing
  // is a nice-to-have that must never block getting the file at all.
  function downloadWorkbookWithFreezeAt(wb, safeName, freezeRow0, cb) {
    var topLeftCell = XLSX.utils.encode_cell({ r: freezeRow0, c: 0 });
    var paneXml = '<pane ySplit="' + freezeRow0 + '" topLeftCell="' + topLeftCell + '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>';
    var wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });

    JSZip.loadAsync(wbout).then(function (zip) {
      var sheetFile = zip.file("xl/worksheets/sheet1.xml");
      if (!sheetFile) {
        var matches = zip.file(/^xl\/worksheets\/sheet\d+\.xml$/);
        sheetFile = matches && matches[0] ? matches[0] : null;
      }
      if (!sheetFile) throw new Error("Worksheet XML not found in generated file.");
      var sheetPath = sheetFile.name;

      return sheetFile.async("string").then(function (xml) {
        var patched;
        if (/<sheetViews>[\s\S]*?<\/sheetViews>/.test(xml)) {
          patched = xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, function (block) {
            if (/<sheetView[^>]*\/>/.test(block)) {
              return block.replace(/<sheetView([^>]*)\/>/, function (m, attrs) {
                return "<sheetView" + attrs + ">" + paneXml + "</sheetView>";
              });
            }
            return block.replace(/(<sheetView[^>]*>)/, "$1" + paneXml);
          });
        } else {
          patched = xml.replace(/(<worksheet[^>]*>)/, '$1<sheetViews><sheetView workbookViewId="0">' + paneXml + "</sheetView></sheetViews>");
        }
        zip.file(sheetPath, patched);
        return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      });
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = safeName + ".xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      cb();
    }).catch(function (err) {
      console.error("[SAI] Freeze-header export failed, downloading without freeze:", err);
      showErrorToast("The frozen header row couldn't be applied to this export — the file was downloaded without it.");
      XLSX.writeFile(wb, safeName + ".xlsx");
      cb();
    });
  }

  function downloadExportAndGoHome() {
    generateMasterReportExport(function (ok) {
      if (!ok) return;
      resetFileState();
      state.selectedMasterReport = "";
      state.selectedReportType = "";
      renderHomeScreen();
      showScreen("screen-home");
    });
  }
  document.getElementById("btnPreviewDownload").addEventListener("click", downloadExportAndGoHome);
  document.getElementById("btnPreviewDownload2").addEventListener("click", downloadExportAndGoHome);

  // "Analyse" opens the unified Analyse tool on this master's merged data
  // (no download of its own — the Download buttons handle that).
  document.getElementById("btnPreviewAnalyse").addEventListener("click", function () {
    dashboardEntryScreen = "screen-preview";
    openDashboardFor(state.selectedMasterReport);
  });

  /* =======================================================================
   * Analyse a File (Stage 1)
   *
   * Standalone entry into the analysis dashboard for ANY uploaded file —
   * no Report Type, no Master Report. One clarify screen sits between
   * upload and analysis: SAI shows the roles it inferred per column
   * (metric / category / date / location / ignore) and asks instead of
   * guessing; the user can correct any of them, confirm the date column's
   * format (same choices as the columns screen), and tick 2+ metrics to
   * compare on one combined chart. Everything downstream reuses the same
   * Layer 1/2/3 dashboard rendering the Master Report path uses.
   * ===================================================================== */
  var ANALYSE_SESSION_KEY = "__analyse_session__";
  var analyseWorkbook = null;
  var analyseFileName = "";
  var analyseHeaders = [];
  var analyseRows = [];
  var analyseSessionData = null;      // {columns, rows} handed to the dashboard
  var analyseColumnOverrides = null;  // {revenueColumn, platformColumn} from confirmed roles
  var analyseCompareMetrics = null;   // 2+ metric names -> one combo chart

  var analyseFileInput = document.getElementById("analyseFileInput");
  var analyseDropzone = document.getElementById("analyseDropzone");

  function showAnalyseUploadError(message) {
    var el = document.getElementById("analyseUploadError");
    el.textContent = message;
    el.hidden = false;
  }

  document.getElementById("btnHomeAnalyseFile").addEventListener("click", function () {
    analyseWorkbook = null;
    analyseFileName = "";
    analyseFileInput.value = "";
    document.getElementById("analyseUploadError").hidden = true;
    document.getElementById("analyseDropzoneFilename").textContent = "";
    showScreen("screen-analyse-upload");
  });
  document.getElementById("btnAnalyseUploadBack").addEventListener("click", function () {
    renderHomeScreen();
    showScreen("screen-home");
  });

  analyseDropzone.addEventListener("click", function () { analyseFileInput.click(); });
  analyseDropzone.addEventListener("dragover", function (e) { e.preventDefault(); analyseDropzone.classList.add("dropzone--drag"); });
  analyseDropzone.addEventListener("dragleave", function () { analyseDropzone.classList.remove("dropzone--drag"); });
  analyseDropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    analyseDropzone.classList.remove("dropzone--drag");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) readAnalyseFile(e.dataTransfer.files[0]);
  });
  analyseFileInput.addEventListener("change", function () {
    if (analyseFileInput.files && analyseFileInput.files[0]) readAnalyseFile(analyseFileInput.files[0]);
  });

  function readAnalyseFile(file) {
    document.getElementById("analyseUploadError").hidden = true;
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      showAnalyseUploadError("Unsupported file type. Please upload a .csv, .xlsx or .xls file.");
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () { showAnalyseUploadError("Could not read this file."); };
    reader.onload = function (event) {
      try {
        var workbook = XLSX.read(new Uint8Array(event.target.result), { type: "array", raw: true });
        if (!workbook.SheetNames.length) throw new Error("File appears to be empty.");
        analyseWorkbook = workbook;
        analyseFileName = file.name;
        document.getElementById("analyseDropzoneFilename").textContent = file.name;
        goToAnalyseClarify();
      } catch (err) {
        showAnalyseUploadError("Could not read this file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /* --- Clarify screen ---------------------------------------------------- */
  function defaultRoleFor(header, classification) {
    if (/city|state|region|district|pincode|location|zone/i.test(header)) return "location";
    if (classification.type === "date" || /date|time/i.test(header)) return "date";
    if (classification.type === "numeric") return "metric";
    return "category";
  }

  var ANALYSE_ROLES = [
    ["metric", "Metric (numbers to total & chart)"],
    ["category", "Category (group / break down by)"],
    ["date", "Date"],
    ["location", "Location (city / state / region)"],
    ["ignore", "Ignore"]
  ];

  function goToAnalyseClarify() {
    var sheetWrap = document.getElementById("analyseSheetWrap");
    var sheetSelect = document.getElementById("analyseSheetSelect");
    sheetSelect.innerHTML = "";
    analyseWorkbook.SheetNames.forEach(function (name) {
      var opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sheetSelect.appendChild(opt);
    });
    sheetWrap.hidden = analyseWorkbook.SheetNames.length <= 1;
    document.getElementById("analyseClarifyFile").textContent = analyseFileName;
    rebuildAnalyseHeaderRowChoices();
    showScreen("screen-analyse-clarify");
  }

  // The first 10 rows of the chosen sheet are offered as header-row
  // candidates (same idea as the Header Row screen, in dropdown form).
  function rebuildAnalyseHeaderRowChoices() {
    var sheet = analyseWorkbook.Sheets[document.getElementById("analyseSheetSelect").value || analyseWorkbook.SheetNames[0]];
    var raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
    var headerSelect = document.getElementById("analyseHeaderRowSelect");
    headerSelect.innerHTML = "";
    var limit = Math.min(raw.length, 10);
    for (var i = 0; i < limit; i++) {
      var preview = raw[i].slice(0, 5).map(function (c) { return String(c === null || c === undefined ? "" : c); }).join(" | ");
      var opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = "Row " + (i + 1) + ": " + (preview || "(blank)");
      headerSelect.appendChild(opt);
    }
    headerSelect.value = "0";
    rebuildAnalyseColumns();
  }

  function rebuildAnalyseColumns() {
    var errEl = document.getElementById("analyseClarifyError");
    errEl.hidden = true;
    var sheetName = document.getElementById("analyseSheetSelect").value || analyseWorkbook.SheetNames[0];
    var headerRowIndex = parseInt(document.getElementById("analyseHeaderRowSelect").value || "0", 10);
    try {
      var extracted = extractHeadersAndRows(analyseWorkbook.Sheets[sheetName], headerRowIndex);
      analyseHeaders = extracted.headers;
      analyseRows = extracted.rows;
    } catch (err) {
      analyseHeaders = [];
      analyseRows = [];
      errEl.textContent = "Could not read columns with this sheet/header row: " + err.message;
      errEl.hidden = false;
    }

    var list = document.getElementById("analyseRolesList");
    list.innerHTML = "";
    analyseHeaders.forEach(function (header) {
      var row = document.createElement("div");
      row.className = "analyse-role-row";
      row.dataset.header = header;

      var name = document.createElement("span");
      name.className = "analyse-role-row__name";
      name.textContent = header;
      row.appendChild(name);

      var select = document.createElement("select");
      select.className = "analyse-role-select";
      ANALYSE_ROLES.forEach(function (r) {
        var opt = document.createElement("option");
        opt.value = r[0];
        opt.textContent = r[1];
        select.appendChild(opt);
      });
      select.value = defaultRoleFor(header, classifyColumn(analyseRows, header));
      select.addEventListener("change", rebuildAnalyseDependents);
      row.appendChild(select);

      list.appendChild(row);
    });
    rebuildAnalyseDependents();
  }

  function analyseHeadersWithRole(role) {
    var out = [];
    document.querySelectorAll("#analyseRolesList .analyse-role-row").forEach(function (r) {
      if (r.querySelector(".analyse-role-select").value === role) out.push(r.dataset.header);
    });
    return out;
  }

  // Date-column choice + format confirmation and the compare-metrics
  // checklist both depend on the current role assignments.
  function rebuildAnalyseDependents() {
    var dateWrap = document.getElementById("analyseDateWrap");
    var dateSelect = document.getElementById("analyseDateSelect");
    var dateCols = analyseHeadersWithRole("date");
    var previousDate = dateSelect.value;
    dateSelect.innerHTML = "";
    var noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "(no date column)";
    dateSelect.appendChild(noneOpt);
    dateCols.forEach(function (h) {
      var opt = document.createElement("option");
      opt.value = h;
      opt.textContent = h;
      dateSelect.appendChild(opt);
    });
    dateSelect.value = dateCols.indexOf(previousDate) !== -1 ? previousDate : (dateCols[0] || "");
    dateWrap.hidden = dateCols.length === 0;
    rebuildAnalyseDateFormat();

    var compareWrap = document.getElementById("analyseCompareWrap");
    var compareList = document.getElementById("analyseCompareList");
    var metrics = analyseHeadersWithRole("metric");
    var previouslyChecked = {};
    compareList.querySelectorAll("input:checked").forEach(function (cb) { previouslyChecked[cb.value] = true; });
    compareList.innerHTML = "";
    metrics.forEach(function (m) {
      var label = document.createElement("label");
      label.className = "analyse-compare-option";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = m;
      cb.checked = !!previouslyChecked[m];
      label.appendChild(cb);
      label.appendChild(document.createTextNode(" " + m));
      compareList.appendChild(label);
    });
    compareWrap.hidden = metrics.length < 2;
  }

  function rebuildAnalyseDateFormat() {
    var col = document.getElementById("analyseDateSelect").value;
    var radiosWrap = document.getElementById("analyseDateFormatChoices");
    radiosWrap.hidden = !col;
    if (!col) return;
    var auto = detectDateFormatForColumn(analyseRows.map(function (r) { return r[col]; }));
    document.querySelectorAll("input[name=analyseDateFormat]").forEach(function (r) {
      r.checked = r.value === auto.format;
    });
  }
  document.getElementById("analyseSheetSelect").addEventListener("change", rebuildAnalyseHeaderRowChoices);
  document.getElementById("analyseHeaderRowSelect").addEventListener("change", rebuildAnalyseColumns);
  document.getElementById("analyseDateSelect").addEventListener("change", rebuildAnalyseDateFormat);

  document.getElementById("btnAnalyseClarifyBack").addEventListener("click", function () {
    showScreen("screen-analyse-upload");
  });

  document.getElementById("btnAnalyseGo").addEventListener("click", function () {
    var errEl = document.getElementById("analyseClarifyError");
    errEl.hidden = true;
    if (!analyseRows.length) {
      errEl.textContent = "No data rows found — pick a different sheet or header row.";
      errEl.hidden = false;
      return;
    }

    var metrics = analyseHeadersWithRole("metric");
    var categories = analyseHeadersWithRole("category").concat(analyseHeadersWithRole("location"));
    var ignored = analyseHeadersWithRole("ignore");
    var dateCol = document.getElementById("analyseDateSelect").value;
    var fmtRadio = document.querySelector("input[name=analyseDateFormat]:checked");

    var parseDate = dateCol ? buildDateParserFor(analyseRows, dateCol, fmtRadio ? fmtRadio.value : null) : null;
    var rows = analyseRows.map(function (src) {
      var row = {};
      analyseHeaders.forEach(function (h) { row[h] = src[h]; });
      row.__saiDate = parseDate ? parseDate(src[dateCol]) : null;
      return row;
    });

    analyseSessionData = {
      columns: analyseHeaders.filter(function (h) { return ignored.indexOf(h) === -1; }),
      rows: rows,
      lastUpdated: null
    };
    // Primary metric: the most revenue-like of the confirmed metric
    // columns, falling back to the first one the file lists.
    analyseColumnOverrides = {
      revenueColumn: metrics.length
        ? (findColumnByKeywords(metrics, ["revenue", "net sales", "gross sales", "sales amount", "gmv", "total amount", "amount", "sales", "price"]) || metrics[0])
        : null,
      platformColumn: categories[0] || null,
      locationColumn: analyseHeadersWithRole("location")[0] || null
    };
    var compared = [];
    document.querySelectorAll("#analyseCompareList input:checked").forEach(function (cb) { compared.push(cb.value); });
    analyseCompareMetrics = compared.length >= 2 ? compared : null;

    // Each analysis session starts with a clean Custom Analysis slate.
    saveDashboardCustomFor(ANALYSE_SESSION_KEY, { columns: [], explanations: {} });

    dashboardEntryScreen = "screen-analyse-clarify";
    currentDashboardReport = ANALYSE_SESSION_KEY;
    renderDashboardScreen();
    showScreen("screen-dashboard");
  });

  document.getElementById("btnDashboardBackClarify").addEventListener("click", function () {
    showScreen("screen-analyse-clarify");
  });

  /* =======================================================================
   * Analysis Dashboard
   *
   * Three layers, built from whatever the Master Report's own data
   * happens to contain — there is no fixed schema, so every layer works
   * off name/value heuristics rather than assuming specific columns exist:
   *   1. Auto Analysis  — always-on stat tiles + charts, picked by
   *      scanning column names/values (classifyMasterReportColumns).
   *   2. Custom Analysis — user picks columns; SAI infers a chart type
   *      from the column's own values, falling back to a typed
   *      explanation when it can't tell confidently.
   *   3. Key Insights — one plain-English sentence per auto + custom
   *      chart, collected as they're built rather than derived separately.
   * ===================================================================== */

  var DASH_PALETTE = ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948", "#e87ba4", "#eb6834"];
  var DASH_GRID_COLOR = "#e1e0d9";
  var DASH_MUTED = "#898781";
  var DASH_POSITIVE_WORDS = ["yes", "y", "true", "1", "returned", "refund", "refunded", "rto", "cancelled", "canceled"];

  var currentDashboardReport = "";
  var dashboardAutoInsights = [];
  var dashboardCustomInsights = [];

  /* ---- value helpers ---- */
  function dashIsBlank(v) { return v === undefined || v === null || String(v).trim() === ""; }
  function dashLooksNumeric(v) {
    if (typeof v === "number") return isFinite(v);
    if (typeof v !== "string") return false;
    var s = v.trim().replace(/,/g, "").replace(/^[₹$]\s?/, "").replace(/%$/, "");
    if (s === "") return false;
    return !isNaN(Number(s));
  }
  function dashToNumber(v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v !== "string") return null;
    var s = v.trim().replace(/,/g, "").replace(/^[₹$]\s?/, "").replace(/%$/, "");
    if (s === "") return null;
    var n = Number(s);
    return isNaN(n) ? null : n;
  }
  var DASH_MONTH_NAMES = /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i;
  // Chrome/V8's Date parser has a very lenient non-standard fallback mode
  // that can return a "valid" (but nonsensical) Date for plain free text —
  // so any string must look date-shaped BEFORE being handed to `new
  // Date()`, otherwise a free-text column (e.g. delivery notes) gets
  // misread as a date column just because a few values happened to parse.
  function dashLooksLikeDateString(v) {
    if (typeof v !== "string") return v instanceof Date;
    var s = v.trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}([ t]\d{1,2}:\d{2}(:\d{2})?)?$/i.test(s)) return true;
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return true;
    if (DASH_MONTH_NAMES.test(s) && /\d{1,4}/.test(s) && s.length <= 24) return true;
    return false;
  }
  function mondayOf(dateObj) {
    var d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    var day = (d.getDay() + 6) % 7; // 0 = Monday
    d.setDate(d.getDate() - day);
    return d;
  }
  function weekLabel(d) { return "Week of " + d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }); }

  // Indian numbering (K / L / Cr) since SAI is built for Indian D2C brands —
  // plain toLocaleString would use the international 1,000,000 grouping.
  function formatIndianCompact(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    var sign = n < 0 ? "-" : "";
    var abs = Math.abs(n);
    if (abs >= 1e7) return sign + (abs / 1e7).toFixed(abs >= 1e8 ? 1 : 2).replace(/\.0+$/, "") + " Cr";
    if (abs >= 1e5) return sign + (abs / 1e5).toFixed(abs >= 1e6 ? 1 : 2).replace(/\.0+$/, "") + " L";
    if (abs >= 1000) return sign + (abs / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return sign + Math.round(abs).toLocaleString("en-IN");
  }
  function niceMetricLabel(column) {
    var c = column.toLowerCase();
    if (c.indexOf("revenue") !== -1) return "Revenue";
    if (c.indexOf("gmv") !== -1) return "GMV";
    if (c.indexOf("sales") !== -1) return "Sales";
    if (c.indexOf("amount") !== -1 || c.indexOf("value") !== -1 || c.indexOf("price") !== -1) return "Order Value";
    return column;
  }
  function looksLikeCurrencyColumn(column) {
    return /(revenue|amount|sales|price|value|gmv|payout|commission|charge|spend|cost|fee)/i.test(column);
  }
  function formatMetricValue(n, column) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return (looksLikeCurrencyColumn(column) ? "₹" : "") + formatIndianCompact(n);
  }

  /* ---- column classification ----
   * Samples up to 500 rows per column (full data is usually far smaller,
   * but this keeps a very large master report responsive) and classifies
   * it as numeric / date / categorical purely from its own values — the
   * same classification backs both the Layer 1 heuristics below and the
   * Layer 2 custom-column type detection. */
  function classifyColumn(rows, column) {
    var total = 0, numericHits = 0, dateHits = 0;
    var valueCounts = {};
    var sampleSize = Math.min(rows.length, 500);
    for (var i = 0; i < sampleSize; i++) {
      var v = rows[i][column];
      if (dashIsBlank(v)) continue;
      total++;
      if (dashLooksNumeric(v)) {
        numericHits++;
      } else if (dashLooksLikeDateString(v)) {
        var d = new Date(v);
        if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) dateHits++;
      }
      var key = String(v).trim().toLowerCase();
      valueCounts[key] = (valueCounts[key] || 0) + 1;
    }
    var uniqueCount = Object.keys(valueCounts).length;
    var numericRatio = total ? numericHits / total : 0;
    var dateRatio = total ? dateHits / total : 0;
    var type = "unknown";
    if (numericRatio >= 0.85) type = "numeric";
    else if (dateRatio >= 0.7) type = "date";
    else if (total > 0 && uniqueCount <= Math.max(20, Math.ceil(total * 0.5))) type = "categorical";
    return {
      column: column, total: total, numericRatio: numericRatio, dateRatio: dateRatio,
      uniqueCount: uniqueCount, valueCounts: valueCounts, type: type, confident: type !== "unknown"
    };
  }

  function findColumnByKeywords(columns, keywords) {
    var lowerCols = columns.map(function (c) { return c.toLowerCase(); });
    for (var k = 0; k < keywords.length; k++) {
      for (var i = 0; i < lowerCols.length; i++) {
        if (lowerCols[i].indexOf(keywords[k]) !== -1) return columns[i];
      }
    }
    return null;
  }

  function classifyMasterReportColumns(data) {
    var rows = data.rows;
    var classifications = {};
    data.columns.forEach(function (c) {
      // "Report Type" is SAI's own bookkeeping tag, not a value from any
      // uploaded file — its meaning is already known, so it's always a
      // confident categorical column rather than run through classifyColumn.
      classifications[c] = c === "Report Type"
        ? { column: c, total: rows.length, numericRatio: 0, dateRatio: 0, uniqueCount: 0, valueCounts: {}, type: "categorical", confident: true }
        : classifyColumn(rows, c);
    });

    var columns = data.columns.filter(function (c) { return c !== "Report Type"; });
    var numericColumns = columns.filter(function (c) { return classifications[c].type === "numeric"; });

    var platformColumn = findColumnByKeywords(columns, ["platform", "channel", "marketplace", "source", "store"]);
    if (platformColumn && classifications[platformColumn].type === "numeric") platformColumn = null;

    var locationColumn = findColumnByKeywords(columns, ["state", "city", "region", "district", "location", "zone"]);
    if (locationColumn && classifications[locationColumn].type === "numeric") locationColumn = null;

    var returnsColumn = findColumnByKeywords(columns, ["return", "refund", "rto"]);
    var adSpendColumn = findColumnByKeywords(numericColumns, ["ad spend", "adspend", "ad cost", "marketing spend", "marketing cost", "spend"]);
    var revenueColumn = findColumnByKeywords(numericColumns, ["revenue", "net sales", "gross sales", "sales amount", "gmv", "total amount", "amount", "sales", "price"]);
    if (adSpendColumn && adSpendColumn === revenueColumn) adSpendColumn = null;

    var primaryNumericColumn = revenueColumn || (numericColumns.length ? numericColumns[0] : null);

    // The Analyse tool's clarify screen lets the user say outright which
    // column is the main metric / breakdown dimension — those confirmed
    // roles beat every keyword heuristic above.
    if (analyseColumnOverrides) {
      if (analyseColumnOverrides.revenueColumn && columns.indexOf(analyseColumnOverrides.revenueColumn) !== -1) {
        revenueColumn = analyseColumnOverrides.revenueColumn;
        primaryNumericColumn = revenueColumn;
      }
      if (analyseColumnOverrides.platformColumn && columns.indexOf(analyseColumnOverrides.platformColumn) !== -1) {
        platformColumn = analyseColumnOverrides.platformColumn;
      }
      if (analyseColumnOverrides.locationColumn && columns.indexOf(analyseColumnOverrides.locationColumn) !== -1) {
        locationColumn = analyseColumnOverrides.locationColumn;
      }
    }

    return {
      classifications: classifications,
      numericColumns: numericColumns,
      platformColumn: platformColumn,
      locationColumn: locationColumn,
      returnsColumn: returnsColumn,
      adSpendColumn: adSpendColumn,
      revenueColumn: revenueColumn,
      primaryNumericColumn: primaryNumericColumn
    };
  }

  /* ---- aggregation ---- */
  function sumColumn(rows, column) {
    var total = 0, any = false;
    rows.forEach(function (r) { var n = dashToNumber(r[column]); if (n !== null) { total += n; any = true; } });
    return any ? total : null;
  }
  function averageColumn(rows, column) {
    var total = 0, count = 0;
    rows.forEach(function (r) { var n = dashToNumber(r[column]); if (n !== null) { total += n; count++; } });
    return count ? total / count : null;
  }

  // Groups by the master report's own canonical date (__saiDate, resolved
  // once per row at merge time from whichever column each Report Type
  // marked as its date column) rather than re-detecting a date column —
  // that resolution already exists and is more reliable than guessing.
  function groupBySaiDateWeek(rows, valueColumn) {
    var buckets = {};
    rows.forEach(function (r) {
      if (!r.__saiDate) return;
      var d = new Date(r.__saiDate);
      if (isNaN(d.getTime())) return;
      var monday = mondayOf(d);
      var key = monday.getTime();
      if (!buckets[key]) buckets[key] = { date: monday, count: 0, sum: 0 };
      buckets[key].count++;
      if (valueColumn) {
        var n = dashToNumber(r[valueColumn]);
        if (n !== null) buckets[key].sum += n;
      }
    });
    return Object.keys(buckets).map(function (k) { return buckets[k]; }).sort(function (a, b) { return a.date - b.date; });
  }

  // Same idea as groupBySaiDateWeek but for an arbitrary column the user
  // picked in Custom Analysis — __saiDate only tracks one canonical date
  // per row, but a file can have more than one date-like column (e.g. an
  // "Order Date" and a separate "Ship Date").
  function groupByCustomDateWeek(rows, column) {
    var buckets = {};
    rows.forEach(function (r) {
      var v = r[column];
      if (dashIsBlank(v) || !dashLooksLikeDateString(v)) return;
      var d = new Date(v);
      if (isNaN(d.getTime())) return;
      var monday = mondayOf(d);
      var key = monday.getTime();
      if (!buckets[key]) buckets[key] = { date: monday, count: 0 };
      buckets[key].count++;
    });
    return Object.keys(buckets).map(function (k) { return buckets[k]; }).sort(function (a, b) { return a.date - b.date; });
  }

  function groupByColumnValue(rows, column, valueColumn) {
    var buckets = {};
    rows.forEach(function (r) {
      var raw = r[column];
      if (dashIsBlank(raw)) return;
      var label = String(raw).trim();
      var key = label.toLowerCase();
      if (!buckets[key]) buckets[key] = { label: label, count: 0, sum: 0 };
      buckets[key].count++;
      if (valueColumn) {
        var n = dashToNumber(r[valueColumn]);
        if (n !== null) buckets[key].sum += n;
      }
    });
    var list = Object.keys(buckets).map(function (k) { return buckets[k]; });
    list.sort(function (a, b) { return valueColumn ? b.sum - a.sum : b.count - a.count; });
    return list;
  }

  // Beyond the palette's 8 categorical slots, fold the tail into "Other"
  // rather than generating a 9th hue (a generated hue is indistinguishable
  // from an existing one under colorblind simulation).
  function foldIntoOther(list, maxSlots) {
    if (list.length <= maxSlots) return list;
    var head = list.slice(0, maxSlots - 1);
    var tail = list.slice(maxSlots - 1);
    head.push({
      label: "Other",
      count: tail.reduce(function (s, x) { return s + x.count; }, 0),
      sum: tail.reduce(function (s, x) { return s + x.sum; }, 0)
    });
    return head;
  }

  function computeReturnRateForColumn(rows, column) {
    var total = 0, positive = 0;
    rows.forEach(function (r) {
      var v = r[column];
      if (dashIsBlank(v)) return;
      total++;
      if (dashLooksNumeric(v)) {
        if (dashToNumber(v) > 0) positive++;
      } else {
        var s = String(v).trim().toLowerCase();
        if (DASH_POSITIVE_WORDS.indexOf(s) !== -1 || s.indexOf("return") !== -1 || s.indexOf("refund") !== -1) positive++;
      }
    });
    return total ? (positive / total) * 100 : null;
  }

  // Spend is real regardless of an order's outcome, so it sums over ALL
  // rows; the revenue side only counts rows retained after the order
  // status exclusions.
  function computeROAS(allRows, countedRows, spendColumn, revenueColumn) {
    var spend = sumColumn(allRows, spendColumn);
    var revenue = sumColumn(countedRows, revenueColumn);
    if (!spend) return null;
    return revenue / spend;
  }

  function buildHistogram(rows, column, binCount) {
    var values = rows.map(function (r) { return dashToNumber(r[column]); }).filter(function (n) { return n !== null; });
    if (!values.length) return { labels: [], counts: [] };
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    if (min === max) return { labels: [formatIndianCompact(min)], counts: [values.length] };
    var bins = binCount || 8;
    var width = (max - min) / bins;
    var counts = new Array(bins).fill(0);
    values.forEach(function (v) {
      var idx = Math.min(bins - 1, Math.floor((v - min) / width));
      counts[idx]++;
    });
    var labels = [];
    for (var i = 0; i < bins; i++) {
      labels.push(formatIndianCompact(min + i * width) + "–" + formatIndianCompact(min + (i + 1) * width));
    }
    return { labels: labels, counts: counts };
  }

  // A column SAI can't confidently type on its own falls back to keyword
  // matching on the user's typed explanation, then to whichever raw ratio
  // (numeric vs date) the column's own values lean toward.
  function inferTypeFromExplanation(text, classification) {
    var t = (text || "").toLowerCase();
    if (t) {
      if (/(percent|percentage|%|rate|charge|charged|commission|cost|price|amount|revenue|spend|fee|quantity|count|number|units?)/.test(t)) {
        return classification.numericRatio >= 0.4 ? "numeric" : "categorical";
      }
      if (/(date|time|day|month|week|year|when)/.test(t)) return "date";
      if (/(category|type|status|platform|channel|group|segment|name|label|city|state|region)/.test(t)) return "categorical";
    }
    if (classification.numericRatio >= classification.dateRatio && classification.numericRatio >= 0.4) return "numeric";
    if (classification.dateRatio > 0.4) return "date";
    return "categorical";
  }

  /* ---- Chart.js rendering ---- */
  function dashAxisTitle(text) {
    return { display: true, text: text, color: DASH_MUTED, font: { size: 11 } };
  }
  // Every axis-based chart states what its X and Y axes are — callers pass
  // xLabel/yLabel through opts.
  function dashChartBaseOptions(opts) {
    opts = opts || {};
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false, labels: { color: "#52514e" } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: DASH_MUTED }, title: opts.xLabel ? dashAxisTitle(opts.xLabel) : { display: false } },
        y: { grid: { color: DASH_GRID_COLOR }, ticks: { color: DASH_MUTED }, beginAtZero: true, title: opts.yLabel ? dashAxisTitle(opts.yLabel) : { display: false } }
      }
    };
  }
  function renderBarChart(canvas, labels, values, opts) {
    opts = opts || {};
    var options = dashChartBaseOptions(opts);
    if (opts.horizontal) options.indexAxis = "y";
    new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{ data: values, backgroundColor: opts.colors || DASH_PALETTE[0], borderRadius: 4, maxBarThickness: 24 }]
      },
      options: options
    });
  }
  // One combined chart for 2+ metrics compared over the same buckets: the
  // first metric renders as bars, the rest as lines. A line series whose
  // scale is wildly different from the bars (>10x either way) gets its own
  // right-hand axis so neither series flattens the other.
  function renderComboChart(canvas, labels, series, opts) {
    opts = opts || {};
    var maxes = series.map(function (s) {
      return s.values.reduce(function (m, v) { return Math.max(m, Math.abs(v || 0)); }, 0);
    });
    var needsY2 = false;
    var datasets = series.map(function (s, i) {
      var y2 = i > 0 && maxes[0] > 0 && maxes[i] > 0 && (maxes[i] / maxes[0] > 10 || maxes[0] / maxes[i] > 10);
      if (y2) needsY2 = true;
      if (i === 0) {
        return { type: "bar", label: s.label, data: s.values, backgroundColor: DASH_PALETTE[0], borderRadius: 4, maxBarThickness: 24, yAxisID: "y", order: 2 };
      }
      return {
        type: "line", label: s.label, data: s.values,
        borderColor: DASH_PALETTE[i % DASH_PALETTE.length], backgroundColor: DASH_PALETTE[i % DASH_PALETTE.length],
        borderWidth: 2, pointRadius: 3, tension: 0.25, fill: false,
        yAxisID: y2 ? "y2" : "y", order: 1
      };
    });
    var options = dashChartBaseOptions(opts);
    options.plugins.legend.display = true;
    options.plugins.legend.position = "bottom";
    if (needsY2) {
      options.scales.y2 = {
        position: "right", beginAtZero: true,
        grid: { drawOnChartArea: false }, ticks: { color: DASH_MUTED },
        title: opts.y2Label ? dashAxisTitle(opts.y2Label) : { display: false }
      };
    }
    new Chart(canvas.getContext("2d"), { data: { labels: labels, datasets: datasets }, options: options });
  }
  function renderDoughnutChart(canvas, labels, values) {
    new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: labels.map(function (_, i) { return DASH_PALETTE[i % DASH_PALETTE.length]; }),
          borderColor: "#ffffff",
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: "bottom", labels: { color: "#52514e", boxWidth: 12, padding: 12 } } }
      }
    });
  }
  function renderLineChart(canvas, labels, values, opts) {
    var options = dashChartBaseOptions(opts);
    new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          data: values,
          borderColor: DASH_PALETTE[0],
          backgroundColor: "rgba(42, 120, 214, 0.1)",
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: DASH_PALETTE[0],
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          fill: true,
          tension: 0.25
        }]
      },
      options: options
    });
  }

  /* ---- DOM builders ---- */
  function createStatTile(container, label, value) {
    var tile = document.createElement("div");
    tile.className = "stat-tile";
    var lab = document.createElement("span");
    lab.className = "stat-tile__label";
    lab.textContent = label;
    var val = document.createElement("span");
    val.className = "stat-tile__value";
    val.textContent = value;
    tile.appendChild(lab);
    tile.appendChild(val);
    container.appendChild(tile);
  }
  function createChartCard(container, title, removable, onRemove) {
    var card = document.createElement("div");
    card.className = "chart-card";

    var header = document.createElement("div");
    header.className = "chart-card__header";
    var h4 = document.createElement("h4");
    h4.className = "chart-card__title";
    h4.textContent = title;
    header.appendChild(h4);
    if (removable) {
      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "link-btn chart-card__remove";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", onRemove);
      header.appendChild(removeBtn);
    }
    card.appendChild(header);

    var canvasWrap = document.createElement("div");
    canvasWrap.className = "chart-card__canvas-wrap";
    var canvas = document.createElement("canvas");
    canvasWrap.appendChild(canvas);
    card.appendChild(canvasWrap);

    var insightEl = document.createElement("p");
    insightEl.className = "chart-card__insight";
    card.appendChild(insightEl);

    container.appendChild(card);
    return { canvas: canvas, insightEl: insightEl };
  }

  // Same card shell as createChartCard, but with a tile grid instead of a
  // canvas — used by the geographic "By <location>" view.
  function createGeoCard(container, title) {
    var card = document.createElement("div");
    card.className = "chart-card";
    var header = document.createElement("div");
    header.className = "chart-card__header";
    var h4 = document.createElement("h4");
    h4.className = "chart-card__title";
    h4.textContent = title;
    header.appendChild(h4);
    card.appendChild(header);
    var gridEl = document.createElement("div");
    gridEl.className = "geo-tiles";
    card.appendChild(gridEl);
    var insightEl = document.createElement("p");
    insightEl.className = "chart-card__insight";
    card.appendChild(insightEl);
    container.appendChild(card);
    return { gridEl: gridEl, insightEl: insightEl };
  }

  /* ---- Layer 3: Key Insights ---- */
  function renderInsightsPanel() {
    var list = document.getElementById("dashboardInsightsList");
    list.innerHTML = "";
    var all = dashboardAutoInsights.concat(dashboardCustomInsights);
    if (!all.length) {
      var li = document.createElement("li");
      li.textContent = "Not enough data yet to generate insights.";
      list.appendChild(li);
      return;
    }
    all.forEach(function (text) {
      var item = document.createElement("li");
      item.textContent = text;
      list.appendChild(item);
    });
  }

  /* ---- Interpret layer -------------------------------------------------
   * Cross-column interpretations — the connections a person doing the
   * analysis by hand would look for. Every recipe has hard minimum-data
   * guards and stays SILENT when the data doesn't clearly support a
   * finding: a missing insight is better than a flimsy one. Wording is
   * deliberately correlational ("moves together", "accounted for"),
   * never causal. At most 3 are emitted, strongest recipe types first.
   * ------------------------------------------------------------------- */
  function weeklySeriesMap(rows, column) {
    var m = {};
    rows.forEach(function (r) {
      if (!r.__saiDate) return;
      var d = new Date(r.__saiDate);
      if (isNaN(d.getTime())) return;
      var k = mondayOf(d).getTime();
      var n = dashToNumber(r[column]);
      if (n === null) return;
      m[k] = (m[k] || 0) + n;
    });
    return m;
  }

  function pearsonCorrelation(xs, ys) {
    var n = xs.length;
    if (n < 2) return null;
    var sx = 0, sy = 0;
    for (var i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    var mx = sx / n, my = sy / n;
    var num = 0, dx = 0, dy = 0;
    for (var j = 0; j < n; j++) {
      num += (xs[j] - mx) * (ys[j] - my);
      dx += (xs[j] - mx) * (xs[j] - mx);
      dy += (ys[j] - my) * (ys[j] - my);
    }
    if (dx === 0 || dy === 0) return null;
    return num / Math.sqrt(dx * dy);
  }

  function buildInterpretInsights(rows, countedRows, info, isStatusExcluded) {
    var out = [];
    var dimension = info.locationColumn || info.platformColumn;
    var metric = info.primaryNumericColumn;

    // Recipe 1: biggest week-over-week move in the primary metric (≥20%,
    // ≥4 weeks of data) — named only when one segment clearly drove it
    // (same direction, ≥40% of the total change).
    if (metric && dimension) {
      var weekly = groupBySaiDateWeek(countedRows, metric);
      if (weekly.length >= 4) {
        var best = null;
        for (var w = 1; w < weekly.length; w++) {
          var a = weekly[w - 1], b = weekly[w];
          if (a.sum <= 0) continue;
          var pct = (b.sum - a.sum) / a.sum;
          if (Math.abs(pct) >= 0.2 && (!best || Math.abs(pct) > Math.abs(best.pct))) best = { a: a, b: b, pct: pct };
        }
        if (best) {
          var deltaTotal = best.b.sum - best.a.sum;
          var perSegment = {};
          countedRows.forEach(function (r) {
            if (!r.__saiDate) return;
            var d = new Date(r.__saiDate);
            if (isNaN(d.getTime())) return;
            var wk = mondayOf(d).getTime();
            if (wk !== best.a.date.getTime() && wk !== best.b.date.getTime()) return;
            var n = dashToNumber(r[metric]);
            if (n === null) return;
            var seg = String(r[dimension] === undefined || r[dimension] === null ? "" : r[dimension]).trim() || "(blank)";
            perSegment[seg] = (perSegment[seg] || 0) + (wk === best.b.date.getTime() ? n : -n);
          });
          var driver = null;
          Object.keys(perSegment).forEach(function (seg) {
            var dlt = perSegment[seg];
            if (dlt * deltaTotal <= 0) return;
            if (!driver || Math.abs(dlt) > Math.abs(driver.delta)) driver = { seg: seg, delta: dlt };
          });
          if (driver && Math.abs(driver.delta) >= 0.4 * Math.abs(deltaTotal)) {
            out.push(niceMetricLabel(metric) + " " + (best.pct < 0 ? "fell" : "rose") + " " +
              Math.round(Math.abs(best.pct) * 100) + "% in " + weekLabel(best.b.date) + " vs the week before — " +
              driver.seg + " (" + (driver.delta < 0 ? "−" : "+") + formatMetricValue(Math.abs(driver.delta), metric) +
              ") accounted for most of that move.");
          }
        }
      }
    }

    // Recipe 2: cancellations/returns concentrating in one segment
    // (Master Report data only — needs the status exclusions).
    var excluded = rows.filter(isStatusExcluded);
    if (excluded.length >= 5 && dimension) {
      var overallShare = excluded.length / rows.length;
      var segTotals = {}, segExcluded = {};
      rows.forEach(function (r) {
        var seg = String(r[dimension] === undefined || r[dimension] === null ? "" : r[dimension]).trim();
        if (!seg) return;
        segTotals[seg] = (segTotals[seg] || 0) + 1;
        if (isStatusExcluded(r)) segExcluded[seg] = (segExcluded[seg] || 0) + 1;
      });
      var worst = null;
      Object.keys(segTotals).forEach(function (seg) {
        if (segTotals[seg] < 5) return;
        var share = (segExcluded[seg] || 0) / segTotals[seg];
        if (share >= 0.1 && share >= 2 * overallShare && (!worst || share > worst.share)) worst = { seg: seg, share: share };
      });
      if (worst) {
        out.push("Cancelled/returned orders concentrate in " + worst.seg + ": " +
          Math.round(worst.share * 100) + "% of its rows vs " + Math.round(overallShare * 100) + "% overall.");
      }
    }

    // Recipe 3: two metrics moving together (or apart) week to week —
    // needs ≥5 shared weeks and |r| ≥ 0.7.
    var pair = analyseCompareMetrics && analyseCompareMetrics.length >= 2
      ? analyseCompareMetrics.slice(0, 2)
      : (info.adSpendColumn && info.revenueColumn ? [info.adSpendColumn, info.revenueColumn]
        : (info.numericColumns.length >= 2 ? info.numericColumns.slice(0, 2) : null));
    if (pair) {
      var mA = weeklySeriesMap(countedRows, pair[0]);
      var mB = weeklySeriesMap(countedRows, pair[1]);
      var common = Object.keys(mA).filter(function (k) { return Object.prototype.hasOwnProperty.call(mB, k); });
      if (common.length >= 5) {
        var r2 = pearsonCorrelation(common.map(function (k) { return mA[k]; }), common.map(function (k) { return mB[k]; }));
        if (r2 !== null && Math.abs(r2) >= 0.7) {
          out.push("\"" + pair[0] + "\" and \"" + pair[1] + "\" " +
            (r2 > 0 ? "move together" : "move in opposite directions") + " week to week (correlation " + r2.toFixed(2) + ").");
        }
      }
    }

    // Recipe 4: heavy dependence on one segment (≥60% of the metric
    // across ≥3 segments).
    if (metric && dimension) {
      var conc = groupByColumnValue(countedRows, dimension, metric);
      if (conc.length >= 3) {
        var concTotal = conc.reduce(function (s, g) { return s + g.sum; }, 0);
        if (concTotal > 0 && conc[0].sum / concTotal >= 0.6) {
          out.push(conc[0].label + " alone contributes " + Math.round((conc[0].sum / concTotal) * 100) +
            "% of total " + niceMetricLabel(metric).toLowerCase() + " — a concentration worth watching.");
        }
      }
    }

    return out.slice(0, 3);
  }

  // Resolves each row's Report Type to its configured status column
  // (original header → this Report Type's saved structure → renamed key)
  // and value map, returning a predicate for "this row's status is mapped
  // to Excluded". Report Types with no status column configured — and rows
  // with blank/unmapped status values — always count. Applied at
  // dashboard-render time so re-confirming the mapping on a later upload
  // retroactively fixes already-merged rows too.
  function buildStatusExclusionChecker(data) {
    var byType = {};
    data.rows.forEach(function (r) {
      var t = r["Report Type"];
      if (t === undefined || Object.prototype.hasOwnProperty.call(byType, t)) return;
      byType[t] = null;
      var orig = getStatusColumnPreference(t);
      if (!orig) return;
      var entry = findSavedStructureEntry(getColumnStructureFor(t), orig);
      var key = entry && entry.include ? entry.renameTo : orig;
      byType[t] = { key: key, map: getStatusValueMap(t) };
    });
    return function (row) {
      var conf = byType[row["Report Type"]];
      if (!conf) return false;
      var v = row[conf.key];
      if (v === undefined || v === null || String(v).trim() === "") return false;
      // defaultStatusChoice = the user's saved answer for this value, or
      // the same keyword suggestion the columns screen would preselect —
      // so a value that arrived via Express Run (never shown in the UI)
      // behaves exactly as its on-screen default would have.
      return defaultStatusChoice(normalizeColumnKey(String(v)), conf.map) === "excluded";
    };
  }

  /* ---- Layer 1: Auto Analysis ---- */
  function renderAutoAnalysis(data, mr) {
    var kpiRow = document.getElementById("dashboardKpiRow");
    var chartsGrid = document.getElementById("dashboardChartsGrid");
    kpiRow.innerHTML = "";
    chartsGrid.innerHTML = "";
    dashboardAutoInsights = [];

    var rows = data.rows;
    var info = classifyMasterReportColumns(data);

    // Revenue-style numbers only count rows whose order status isn't
    // mapped to Excluded (fully cancelled/returned orders). Row counts and
    // the return rate still describe ALL rows — they're operational
    // metrics, not retained money.
    var isStatusExcluded = buildStatusExclusionChecker(data);
    var countedRows = rows.filter(function (r) { return !isStatusExcluded(r); });
    var excludedCount = rows.length - countedRows.length;
    var retainedSuffix = excludedCount ? " (retained)" : "";

    createStatTile(kpiRow, "Total Rows", rows.length.toLocaleString("en-IN"));
    // Only meaningful for a Master Report — an uploaded file analysed
    // directly has no Report Types.
    if (mr) createStatTile(kpiRow, "Report Types Merged", String(mr.reportTypesUsed.length));
    createStatTile(kpiRow, "Date Range Covered", computePeriodCoveredText(rows));

    if (info.primaryNumericColumn) {
      var col = info.primaryNumericColumn;
      var total = sumColumn(countedRows, col);
      var avg = averageColumn(countedRows, col);
      createStatTile(kpiRow, "Total " + niceMetricLabel(col) + retainedSuffix, formatMetricValue(total, col));
      createStatTile(kpiRow, "Average " + niceMetricLabel(col) + retainedSuffix, formatMetricValue(avg, col));
      if (excludedCount) {
        var excludedSum = sumColumn(rows.filter(isStatusExcluded), col);
        createStatTile(kpiRow, "Excluded (Cancelled/Returned)",
          formatMetricValue(excludedSum, col) + " · " + excludedCount + " row" + (excludedCount === 1 ? "" : "s"));
        dashboardAutoInsights.push("Total " + niceMetricLabel(col).toLowerCase() + " retained is " + formatMetricValue(total, col) +
          " — " + formatMetricValue(excludedSum, col) + " from " + excludedCount + " cancelled/returned row" + (excludedCount === 1 ? "" : "s") + " excluded.");
      } else {
        dashboardAutoInsights.push("Total " + niceMetricLabel(col).toLowerCase() + " across all rows is " + formatMetricValue(total, col) + ".");
      }
    }

    var hasDates = rows.some(function (r) { return !!r.__saiDate; });

    // Combo comparison chart (Analyse tool): 2+ metrics the user asked to
    // compare, on one chart over the same weekly buckets — first as bars,
    // the rest as lines (own right axis when scales differ wildly).
    if (analyseCompareMetrics && analyseCompareMetrics.length >= 2 && hasDates) {
      var comboWeeks = groupBySaiDateWeek(countedRows, null);
      if (comboWeeks.length) {
        var comboLabels = comboWeeks.map(function (w) { return weekLabel(w.date); });
        var comboSeries = analyseCompareMetrics.map(function (m) {
          var byKey = {};
          countedRows.forEach(function (r) {
            if (!r.__saiDate) return;
            var d = new Date(r.__saiDate);
            if (isNaN(d.getTime())) return;
            var k = mondayOf(d).getTime();
            var n = dashToNumber(r[m]);
            if (n !== null) byKey[k] = (byKey[k] || 0) + n;
          });
          return { label: m, values: comboWeeks.map(function (w) { return byKey[w.date.getTime()] || 0; }) };
        });
        var comboCard = createChartCard(chartsGrid, "Comparison: " + analyseCompareMetrics.join(" vs "), false);
        renderComboChart(comboCard.canvas, comboLabels, comboSeries, {
          xLabel: "Week", yLabel: analyseCompareMetrics[0],
          y2Label: analyseCompareMetrics.length === 2 ? analyseCompareMetrics[1] : "Other metrics"
        });
        comboCard.insightEl.textContent = "Weekly totals of " + analyseCompareMetrics.join(", ") + " on one chart.";
      }
    }

    if (hasDates) {
      var weeks = groupBySaiDateWeek(countedRows, info.primaryNumericColumn);
      if (weeks.length) {
        var labels = weeks.map(function (w) { return weekLabel(w.date); });
        var values = weeks.map(function (w) { return info.primaryNumericColumn ? w.sum : w.count; });
        var lineTitle = info.primaryNumericColumn ? (niceMetricLabel(info.primaryNumericColumn) + " Over Time") : "Rows Over Time";
        var lineCard = createChartCard(chartsGrid, lineTitle, false);
        renderLineChart(lineCard.canvas, labels, values, {
          xLabel: "Week",
          yLabel: info.primaryNumericColumn ? niceMetricLabel(info.primaryNumericColumn) : "Rows"
        });
        var maxIdx = values.indexOf(Math.max.apply(null, values));
        var metricWord = info.primaryNumericColumn ? niceMetricLabel(info.primaryNumericColumn).toLowerCase() : "order volume";
        var lineInsight = labels[maxIdx] + " had the highest " + metricWord + ".";
        lineCard.insightEl.textContent = lineInsight;
        dashboardAutoInsights.push(lineInsight);
      }
    }

    // Geographic tiles: one tile per location value, tinted by the metric's
    // share of the maximum — a "map without the map shapes". Shown instead
    // of (not alongside) the generic breakdown when they'd be the same
    // column.
    if (info.locationColumn) {
      var geo = groupByColumnValue(countedRows, info.locationColumn, info.primaryNumericColumn);
      if (geo.length) {
        var geoShown = geo.slice(0, 20);
        var geoMax = geoShown.reduce(function (m, g) {
          return Math.max(m, info.primaryNumericColumn ? g.sum : g.count);
        }, 0);
        var geoCard = createGeoCard(chartsGrid, "By " + info.locationColumn);
        geoShown.forEach(function (g) {
          var value = info.primaryNumericColumn ? g.sum : g.count;
          var tile = document.createElement("div");
          tile.className = "geo-tile";
          tile.style.background = "rgba(42, 120, 214, " + (geoMax > 0 ? (0.12 + 0.58 * (value / geoMax)).toFixed(2) : "0.12") + ")";
          var tName = document.createElement("span");
          tName.className = "geo-tile__name";
          tName.textContent = g.label;
          tile.appendChild(tName);
          var tVal = document.createElement("span");
          tVal.className = "geo-tile__value";
          tVal.textContent = info.primaryNumericColumn
            ? formatMetricValue(value, info.primaryNumericColumn)
            : value + " row" + (value === 1 ? "" : "s");
          tile.appendChild(tVal);
          geoCard.gridEl.appendChild(tile);
        });
        if (geo.length > geoShown.length) {
          var moreTile = document.createElement("div");
          moreTile.className = "geo-tile geo-tile--more";
          moreTile.textContent = "+" + (geo.length - geoShown.length) + " more";
          geoCard.gridEl.appendChild(moreTile);
        }
        var geoTotal = geo.reduce(function (s, g) { return s + (info.primaryNumericColumn ? g.sum : g.count); }, 0);
        var geoTopPct = geoTotal ? Math.round(((info.primaryNumericColumn ? geo[0].sum : geo[0].count) / geoTotal) * 100) : 0;
        var geoMetricWord = info.primaryNumericColumn ? niceMetricLabel(info.primaryNumericColumn).toLowerCase() : "rows";
        var geoInsight = geo[0].label + " leads on " + geoMetricWord + " with " + geoTopPct + "% of the total.";
        geoCard.insightEl.textContent = geoInsight;
        dashboardAutoInsights.push(geoInsight);
      }
    }

    if (info.platformColumn && info.platformColumn !== info.locationColumn) {
      var breakdown = foldIntoOther(groupByColumnValue(countedRows, info.platformColumn, info.primaryNumericColumn), 8);
      if (breakdown.length) {
        var bLabels = breakdown.map(function (b) { return b.label; });
        var bValues = breakdown.map(function (b) { return info.primaryNumericColumn ? b.sum : b.count; });
        var bTotal = bValues.reduce(function (s, v) { return s + v; }, 0);
        var bCard = createChartCard(chartsGrid, "Breakdown by " + info.platformColumn, false);
        if (breakdown.length <= 6) {
          renderDoughnutChart(bCard.canvas, bLabels, bValues);
        } else {
          renderBarChart(bCard.canvas, bLabels, bValues, {
            horizontal: true,
            colors: bLabels.map(function (_, i) { return DASH_PALETTE[i % DASH_PALETTE.length]; }),
            xLabel: info.primaryNumericColumn ? niceMetricLabel(info.primaryNumericColumn) : "Rows",
            yLabel: info.platformColumn
          });
        }
        var topPct = bTotal ? Math.round((bValues[0] / bTotal) * 100) : 0;
        var metricWord2 = info.primaryNumericColumn ? niceMetricLabel(info.primaryNumericColumn).toLowerCase() : "orders";
        var breakdownInsight = bLabels[0] + " contributed " + topPct + "% of total " + metricWord2 + ".";
        bCard.insightEl.textContent = breakdownInsight;
        dashboardAutoInsights.push(breakdownInsight);
      }
    }

    if (info.returnsColumn) {
      var rate = computeReturnRateForColumn(rows, info.returnsColumn);
      if (rate !== null) {
        createStatTile(kpiRow, "Return Rate", rate.toFixed(1) + "%");
        dashboardAutoInsights.push(rate.toFixed(1) + "% of rows were marked as returned or refunded (" + info.returnsColumn + ").");

        if (hasDates) {
          var weeklyReturns = {};
          rows.forEach(function (r) {
            if (!r.__saiDate) return;
            var d = new Date(r.__saiDate);
            if (isNaN(d.getTime())) return;
            var key = mondayOf(d).getTime();
            if (!weeklyReturns[key]) weeklyReturns[key] = { date: mondayOf(d), total: 0, positive: 0 };
            weeklyReturns[key].total++;
            var v = r[info.returnsColumn];
            var isPositive = dashLooksNumeric(v)
              ? dashToNumber(v) > 0
              : (function () { var s = String(v || "").trim().toLowerCase(); return DASH_POSITIVE_WORDS.indexOf(s) !== -1 || s.indexOf("return") !== -1 || s.indexOf("refund") !== -1; })();
            if (isPositive) weeklyReturns[key].positive++;
          });
          var weeksWithEnoughRows = Object.keys(weeklyReturns).map(function (k) { return weeklyReturns[k]; }).filter(function (w) { return w.total >= 3; });
          if (weeksWithEnoughRows.length) {
            weeksWithEnoughRows.sort(function (a, b) { return (b.positive / b.total) - (a.positive / a.total); });
            var worst = weeksWithEnoughRows[0];
            var worstRate = (worst.positive / worst.total) * 100;
            dashboardAutoInsights.push(weekLabel(worst.date) + " had the highest return rate at " + worstRate.toFixed(1) + "%.");
          }
        }
      }
    }

    if (info.adSpendColumn && info.revenueColumn) {
      var roas = computeROAS(rows, countedRows, info.adSpendColumn, info.revenueColumn);
      if (roas !== null) {
        createStatTile(kpiRow, "ROAS", roas.toFixed(2) + "x");
        dashboardAutoInsights.push("Every ₹1 spent on ads returned ₹" + roas.toFixed(2) + " in revenue.");
      }
    }

    dashboardAutoInsights = dashboardAutoInsights.concat(
      buildInterpretInsights(rows, countedRows, info, isStatusExcluded)
    );
  }

  /* ---- Layer 2: Custom Analysis ---- */
  function renderCustomAnalysisChecklist(data) {
    var checklist = document.getElementById("dashboardColumnChecklist");
    checklist.innerHTML = "";
    var custom = getDashboardCustomFor(currentDashboardReport);
    var info = classifyMasterReportColumns(data);

    data.columns.forEach(function (column) {
      var classification = info.classifications[column];
      var item = document.createElement("div");
      item.className = "column-check-item";
      item.dataset.column = column;

      var label = document.createElement("label");
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "column-check-checkbox";
      checkbox.checked = custom.columns.indexOf(column) !== -1;
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(column));
      item.appendChild(label);

      var prompt = document.createElement("div");
      prompt.className = "column-explain-prompt";
      prompt.hidden = !(checkbox.checked && !classification.confident);
      var p = document.createElement("p");
      p.textContent = "What does \"" + column + "\" represent? e.g. \"commission charged by the platform\"";
      var input = document.createElement("input");
      input.type = "text";
      input.className = "column-explain-input";
      input.placeholder = "Type a short explanation…";
      input.value = custom.explanations[column] || "";
      prompt.appendChild(p);
      prompt.appendChild(input);
      item.appendChild(prompt);

      checkbox.addEventListener("change", function () {
        prompt.hidden = !(checkbox.checked && !classification.confident);
      });

      checklist.appendChild(item);
    });
  }

  function readCustomAnalysisSelections(data) {
    var info = classifyMasterReportColumns(data);
    var errorEl = document.getElementById("dashboardCustomError");
    errorEl.hidden = true;

    var selectedColumns = [];
    var explanations = {};
    var missingExplanation = null;

    document.querySelectorAll("#dashboardColumnChecklist .column-check-item").forEach(function (item) {
      var column = item.dataset.column;
      var checkbox = item.querySelector(".column-check-checkbox");
      if (!checkbox.checked) return;
      selectedColumns.push(column);
      var explainInput = item.querySelector(".column-explain-input");
      var text = explainInput ? explainInput.value.trim() : "";
      if (text) explanations[column] = text;
      var classification = info.classifications[column];
      if (!classification.confident && !text && !missingExplanation) missingExplanation = column;
    });

    if (missingExplanation) {
      errorEl.textContent = "Please add a short explanation for \"" + missingExplanation + "\" so SAI knows how to chart it.";
      errorEl.hidden = false;
      return null;
    }
    return { columns: selectedColumns, explanations: explanations };
  }

  function renderCustomCharts(data) {
    var grid = document.getElementById("dashboardCustomChartsGrid");
    var emptyState = document.getElementById("dashboardCustomEmptyState");
    grid.innerHTML = "";
    dashboardCustomInsights = [];

    var custom = getDashboardCustomFor(currentDashboardReport);
    var info = classifyMasterReportColumns(data);
    var rows = data.rows;

    emptyState.hidden = custom.columns.length > 0;

    custom.columns.forEach(function (column) {
      if (data.columns.indexOf(column) === -1) return; // no longer part of this report's schema
      var classification = info.classifications[column];
      var explanation = custom.explanations[column] || "";
      var type = classification.confident ? classification.type : inferTypeFromExplanation(explanation, classification);
      var titleSuffix = explanation ? " — " + explanation : "";

      function removeThisColumn() {
        var updated = getDashboardCustomFor(currentDashboardReport);
        updated.columns = updated.columns.filter(function (c) { return c !== column; });
        delete updated.explanations[column];
        saveDashboardCustomFor(currentDashboardReport, updated);
        refreshCustomSection(data);
      }

      if (type === "numeric") {
        var hist = buildHistogram(rows, column, 8);
        if (!hist.labels.length) return;
        var numCard = createChartCard(grid, column + titleSuffix, true, removeThisColumn);
        renderBarChart(numCard.canvas, hist.labels, hist.counts, { xLabel: column, yLabel: "Rows" });
        var maxBinIdx = hist.counts.indexOf(Math.max.apply(null, hist.counts));
        var numInsight = "Most values of " + column + " fall between " + hist.labels[maxBinIdx] + " (" + hist.counts[maxBinIdx] + " rows).";
        numCard.insightEl.textContent = numInsight;
        dashboardCustomInsights.push(numInsight);
      } else if (type === "date") {
        var weeks = groupByCustomDateWeek(rows, column);
        if (!weeks.length) return;
        var dateLabels = weeks.map(function (w) { return weekLabel(w.date); });
        var dateValues = weeks.map(function (w) { return w.count; });
        var dateCard = createChartCard(grid, column + " Over Time" + titleSuffix, true, removeThisColumn);
        renderLineChart(dateCard.canvas, dateLabels, dateValues, { xLabel: "Week", yLabel: "Rows" });
        var maxWeekIdx = dateValues.indexOf(Math.max.apply(null, dateValues));
        var dateInsight = dateLabels[maxWeekIdx] + " had the most entries for " + column + ".";
        dateCard.insightEl.textContent = dateInsight;
        dashboardCustomInsights.push(dateInsight);
      } else {
        var breakdown = foldIntoOther(groupByColumnValue(rows, column, null), 8);
        if (!breakdown.length) return;
        var catLabels = breakdown.map(function (b) { return b.label; });
        var catValues = breakdown.map(function (b) { return b.count; });
        var catTotal = catValues.reduce(function (s, v) { return s + v; }, 0);
        var catCard = createChartCard(grid, "Breakdown by " + column + titleSuffix, true, removeThisColumn);
        if (breakdown.length <= 6) renderDoughnutChart(catCard.canvas, catLabels, catValues);
        else renderBarChart(catCard.canvas, catLabels, catValues, { horizontal: true, colors: catLabels.map(function (_, i) { return DASH_PALETTE[i % DASH_PALETTE.length]; }), xLabel: "Rows", yLabel: column });
        var catTopPct = catTotal ? Math.round((catValues[0] / catTotal) * 100) : 0;
        var catInsight = catLabels[0] + " is the most common value in " + column + ", appearing in " + catTopPct + "% of rows.";
        catCard.insightEl.textContent = catInsight;
        dashboardCustomInsights.push(catInsight);
      }
    });
  }

  function refreshCustomSection(data) {
    renderCustomCharts(data);
    renderInsightsPanel();
  }

  // The dashboard analyses exactly the rows the exported report contains:
  // rows deleted on the Preview screen (flagged __saiDeleted, never
  // removed from the stored data) are filtered out here once, so every
  // consumer — KPIs, auto charts, custom analysis — sees the same rows the
  // downloaded Excel has. Restoring the rows on Preview brings them back
  // into the analysis too.
  function getDashboardData(masterReportName) {
    // The Analyse tool feeds an uploaded file's rows straight in — no
    // master report behind them.
    if (masterReportName === ANALYSE_SESSION_KEY) return analyseSessionData;
    var data = getMasterReportData(masterReportName);
    if (!data) return null;
    return {
      columns: data.columns,
      rows: data.rows.filter(function (r) { return !r.__saiDeleted; }),
      uploadedFiles: data.uploadedFiles,
      lastUpdated: data.lastUpdated
    };
  }

  // Same session rule as Preview & Export: the dashboard defaults to
  // Report Types touched this browser visit, so both screens always show
  // the same numbers. "All Report Types" is one click away.
  var dashboardScope = "session"; // "session" | "all"

  function getScopedDashboardData() {
    var data = getDashboardData(currentDashboardReport);
    if (!data || currentDashboardReport === ANALYSE_SESSION_KEY || dashboardScope !== "session") return data;
    return {
      columns: data.columns,
      rows: data.rows.filter(function (r) { return isReportTypeActive(r["Report Type"]); }),
      uploadedFiles: data.uploadedFiles,
      lastUpdated: data.lastUpdated,
      typeMeta: data.typeMeta
    };
  }

  document.getElementById("btnDashScopeSession").addEventListener("click", function () {
    dashboardScope = "session";
    renderDashboardScreen();
  });
  document.getElementById("btnDashScopeAll").addEventListener("click", function () {
    dashboardScope = "all";
    renderDashboardScreen();
  });

  document.getElementById("btnCustomiseAnalysis").addEventListener("click", function () {
    var data = getScopedDashboardData();
    if (!data) return;
    renderCustomAnalysisChecklist(data);
    document.getElementById("dashboardCustomError").hidden = true;
    document.getElementById("dashboardCustomPanel").hidden = false;
  });
  document.getElementById("btnCustomAnalysisCancel").addEventListener("click", function () {
    document.getElementById("dashboardCustomPanel").hidden = true;
  });
  document.getElementById("btnCustomAnalysisApply").addEventListener("click", function () {
    var data = getScopedDashboardData();
    if (!data) return;
    var result = readCustomAnalysisSelections(data);
    if (!result) return;
    saveDashboardCustomFor(currentDashboardReport, result);
    document.getElementById("dashboardCustomPanel").hidden = true;
    refreshCustomSection(data);
  });

  /* ---- Entry point + chrome ---- */
  function openDashboardFor(masterReportName) {
    // A master report entry must never inherit the previous Analyse-a-File
    // session's confirmed roles or comparison picks.
    if (masterReportName !== ANALYSE_SESSION_KEY) {
      analyseColumnOverrides = null;
      analyseCompareMetrics = null;
      dashboardScope = "session";
    }
    currentDashboardReport = masterReportName;
    renderDashboardScreen();
    showScreen("screen-dashboard");
  }

  function renderDashboardScreen() {
    var isAnalyseSession = currentDashboardReport === ANALYSE_SESSION_KEY;
    var mr = isAnalyseSession ? null : getMasterReport(currentDashboardReport);

    // Same fallback as Preview: nothing active this visit → an empty
    // "session" view helps nobody, so show everything with the toggle
    // visibly set to All. The toggle only appears when the views differ.
    var dashTypes = mr ? mr.reportTypesUsed : [];
    var dashSomeActive = dashTypes.some(isReportTypeActive);
    var dashSomeInactive = dashTypes.some(function (t) { return !isReportTypeActive(t); });
    if (!isAnalyseSession && !dashSomeActive) dashboardScope = "all";
    var dashScopeAvailable = !isAnalyseSession && dashSomeActive && dashSomeInactive;
    var dashScopeBar = document.getElementById("dashScopeBar");
    dashScopeBar.hidden = !dashScopeAvailable;
    if (dashScopeAvailable) {
      document.getElementById("btnDashScopeSession").classList.toggle("missing-column-mode__btn--active", dashboardScope === "session");
      document.getElementById("btnDashScopeAll").classList.toggle("missing-column-mode__btn--active", dashboardScope === "all");
    }

    var data = getScopedDashboardData();

    // Back buttons match how this visit was entered: from the Preview
    // screen, from the Analyse-a-File setup, or from Home.
    document.getElementById("btnDashboardBackPreview").hidden = dashboardEntryScreen !== "screen-preview";
    document.getElementById("btnDashboardBackClarify").hidden = dashboardEntryScreen !== "screen-analyse-clarify";

    document.getElementById("dashboardTitle").textContent = isAnalyseSession ? analyseFileName : currentDashboardReport;
    document.getElementById("dashboardSubtitle").textContent = isAnalyseSession
      ? (data ? data.rows.length : 0) + " rows · uploaded file"
      : (data ? data.rows.length : 0) + " rows" +
        (dashScopeAvailable && dashboardScope === "session" ? " (this session)" : "") +
        " · Updated " + formatDateForDisplay(data ? data.lastUpdated : null);
    document.getElementById("dashboardCustomPanel").hidden = true;
    document.getElementById("dashboardCustomError").hidden = true;

    if (!data || !data.rows.length) {
      document.getElementById("dashboardKpiRow").innerHTML = "";
      document.getElementById("dashboardChartsGrid").innerHTML = "";
      document.getElementById("dashboardColumnChecklist").innerHTML = "";
      document.getElementById("dashboardCustomChartsGrid").innerHTML = "";
      document.getElementById("dashboardCustomEmptyState").hidden = true;
      dashboardAutoInsights = [];
      dashboardCustomInsights = [];
      renderInsightsPanel();
      return;
    }

    renderAutoAnalysis(data, mr);
    renderCustomAnalysisChecklist(data);
    renderCustomCharts(data);
    renderInsightsPanel();
  }

  document.getElementById("btnDashboardBackPreview").addEventListener("click", function () {
    renderPreviewScreen();
    showScreen("screen-preview");
  });
  document.getElementById("btnDashboardBack").addEventListener("click", function () {
    renderHomeScreen();
    showScreen("screen-home");
  });
  document.getElementById("btnDashboardPdf").addEventListener("click", function () {
    window.print();
  });

  /* ---------------------------------------------------------------------
   * Init
   * ------------------------------------------------------------------- */
  state.companyName = getCompanyName();
  showScreen("screen-landing");
})();
