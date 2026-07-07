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
    if (!saved) return dataColumns.slice();
    var ordered = saved.filter(function (c) { return dataColumns.indexOf(c) !== -1; });
    dataColumns.forEach(function (c) { if (ordered.indexOf(c) === -1) ordered.push(c); });
    return ordered;
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
    if (!saved) return { columnWidths: {}, headerBold: false, headerFillColor: "", numberFormats: {}, freezeHeader: false };
    return {
      columnWidths: saved.columnWidths || {},
      headerBold: !!saved.headerBold,
      headerFillColor: saved.headerFillColor || "",
      numberFormats: saved.numberFormats || {},
      freezeHeader: !!saved.freezeHeader
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

  function parseDateSafe(value) {
    if (value === "" || value === null || value === undefined) return null;
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
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

    rows.forEach(function (row) {
      var mergedRow = { "Report Type": reportTypeName };
      data.columns.forEach(function (c) {
        if (c === "Report Type") return;
        mergedRow[c] = Object.prototype.hasOwnProperty.call(row, c) ? row[c] : "";
      });
      mergedRow.__saiDate = dateColumnKey ? parseDateSafe(row[dateColumnKey]) : null;
      data.rows.push(mergedRow);
    });

    data.uploadedFiles.push({ name: fileMeta.name, size: fileMeta.size });
    data.lastUpdated = new Date().toISOString();
    saveMasterReportData(masterReportName, data);

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
    renderProgressSection();

    var masterReports = getMasterReports();
    var emptyState = document.getElementById("templatesEmptyState");
    var list = document.getElementById("masterReportList");
    list.innerHTML = "";

    emptyState.hidden = masterReports.length > 0;
    list.hidden = masterReports.length === 0;

    masterReports.forEach(function (mr) {
      var data = getMasterReportData(mr.name);
      var rowCount = data ? data.rows.length : 0;
      var updatedText = formatDateForDisplay(mr.lastUpdated);

      var card = document.createElement("div");
      card.className = "master-report-card";

      var header = document.createElement("div");
      header.className = "master-report-card__header";
      var title = document.createElement("h3");
      title.textContent = mr.name;
      header.appendChild(title);
      card.appendChild(header);

      var meta = document.createElement("p");
      meta.className = "master-report-card__meta";
      meta.textContent = rowCount + " row" + (rowCount === 1 ? "" : "s") + (updatedText ? " · Updated " + updatedText : "");
      card.appendChild(meta);

      if (mr.reportTypesUsed.length) {
        var tiles = document.createElement("div");
        tiles.className = "master-report-card__tiles";
        mr.reportTypesUsed.forEach(function (typeName) {
          var tile = document.createElement("button");
          tile.type = "button";
          tile.className = "report-tile";
          tile.textContent = typeName;
          tile.addEventListener("click", function () {
            resetFileState();
            state.selectedMasterReport = mr.name;
            state.selectedReportType = typeName;
            showScreen("screen-upload");
          });
          tiles.appendChild(tile);
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

  document.getElementById("btnDataModeReplace").addEventListener("click", function () {
    state.dataMode = "replace";
    renderColumnScreen();
    showScreen("screen-columns");
  });
  document.getElementById("btnDataModeAdd").addEventListener("click", function () {
    state.dataMode = "add";
    renderColumnScreen();
    showScreen("screen-columns");
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
    var expectedColumns = masterColumns.slice();
    if (savedStructure) {
      var lowerCurrentHeaders = currentFileHeaders.map(function (h) { return h.toLowerCase(); });
      Object.keys(savedStructure).forEach(function (origHeader) {
        var entry = savedStructure[origHeader];
        if (!entry.include) return;
        if (lowerCurrentHeaders.indexOf(origHeader.toLowerCase()) !== -1) return;
        if (expectedColumns.indexOf(entry.renameTo) === -1) expectedColumns.push(entry.renameTo);
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
    var formulaNames = getFormulasFor(state.selectedReportType).map(function (f) { return f.name.toLowerCase(); });
    expectedColumns = expectedColumns.filter(function (c) { return formulaNames.indexOf(c.toLowerCase()) === -1; });

    if (!expectedColumns.length) {
      wrap.hidden = true;
      list.innerHTML = "";
      return;
    }

    var previousValues = {};
    list.querySelectorAll(".missing-column-value").forEach(function (input) {
      previousValues[input.dataset.column] = input.value;
    });

    var covered = [];
    columnsTableBody.querySelectorAll("tr").forEach(function (tr) {
      var checkbox = tr.querySelector(".column-include");
      if (!checkbox.checked) return;
      covered.push(getRenameToForRow(tr, tr.dataset.header).toLowerCase());
    });

    var missing = expectedColumns.filter(function (c) { return covered.indexOf(c.toLowerCase()) === -1; });

    wrap.hidden = missing.length === 0;
    list.innerHTML = "";
    hint.textContent = "These columns aren't in this file. Enter a value to fill every row of this file, or leave blank.";

    missing.forEach(function (col) {
      var row = document.createElement("div");
      row.className = "missing-column-row";

      var name = document.createElement("span");
      name.className = "missing-column-row__name";
      name.textContent = col;
      row.appendChild(name);

      var input = document.createElement("input");
      input.type = "text";
      input.className = "missing-column-value";
      input.dataset.column = col;
      input.placeholder = "Default value for every row (text or number)";
      if (Object.prototype.hasOwnProperty.call(previousValues, col)) input.value = previousValues[col];
      row.appendChild(input);

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
  // Delegated so it also covers the include checkbox and rename dropdown of
  // every row, which are (re)created fresh each time renderColumnScreen()
  // runs — any change that could affect which Master Report columns this
  // file no longer covers should refresh the missing-columns list live.
  columnsTableBody.addEventListener("change", function (e) {
    if (e.target.classList.contains("column-include") || e.target.classList.contains("column-rename-select")) {
      updateMissingColumnsSection();
    }
  });
  document.getElementById("btnColumnsClearDate").addEventListener("click", function () {
    columnsTableBody.querySelectorAll(".column-date-radio").forEach(function (r) { r.checked = false; });
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

    currentRenamedRows = buildRenamedRows(currentFileRows, structure);

    // Any Master Report column left unmapped by this file (see
    // updateMissingColumnsSection) gets the value the user typed stamped
    // onto every row of this file, and is tracked as a real column for this
    // upload too — same as if the file had actually contained it.
    document.querySelectorAll("#missingColumnsList .missing-column-value").forEach(function (input) {
      var value = input.value.trim();
      if (!value) return;
      var col = input.dataset.column;
      currentRenamedRows.forEach(function (row) { row[col] = value; });
      if (selectedColumns.indexOf(col) === -1) selectedColumns.push(col);
    });

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
      if ("+-*/".indexOf(ch) !== -1) { tokens.push({ type: "op", value: ch }); i++; continue; }

      var matchedName = null;
      for (var n = 0; n < names.length; n++) {
        var name = names[n];
        if (expr.substr(i, name.length).toLowerCase() === name.toLowerCase()) { matchedName = name; break; }
      }
      if (matchedName) { tokens.push({ type: "column", value: matchedName }); i += matchedName.length; continue; }

      var numMatch = /^\d+(\.\d+)?/.exec(expr.slice(i));
      if (numMatch) { tokens.push({ type: "number", value: parseFloat(numMatch[0]) }); i += numMatch[0].length; continue; }

      var unkMatch = /^[^\s+\-*/()]+/.exec(expr.slice(i));
      var unkStr = unkMatch ? unkMatch[0] : ch;
      tokens.push({ type: "unknown", value: unkStr });
      i += unkStr.length;
    }
    return tokens;
  }

  // Recursive-descent parser: expr := term (('+'|'-') term)*,
  // term := factor (('*'|'/') factor)*, factor := number | column |
  // '(' expr ')' | ('+'|'-') factor. Standard precedence + parentheses,
  // same as any spreadsheet formula bar.
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
      default: return NaN;
    }
  }

  function computeExpressionValue(row, ast) {
    if (!ast) return "";
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
  // bounded by the nearest operator/parenthesis on each side rather than
  // whitespace, since a column name like "Order ID" has to be able to
  // contain a space itself while still being treated as one candidate.
  function attachFormulaAutocomplete(row, input, dropdown) {
    var activeIndex = -1;

    function operandBounds() {
      var val = input.value;
      var pos = input.selectionStart;
      var start = pos;
      while (start > 0 && "+-*/()".indexOf(val[start - 1]) === -1) start--;
      var end = pos;
      while (end < val.length && "+-*/()".indexOf(val[end]) === -1) end++;
      return { start: start, end: end, pos: pos };
    }

    function setActive(items) {
      items.forEach(function (it, idx) { it.classList.toggle("formula-autocomplete-item--active", idx === activeIndex); });
    }

    function showSuggestions() {
      var bounds = operandBounds();
      var partial = input.value.slice(bounds.start, bounds.pos).trim().toLowerCase();
      var available = getAvailableColumnsForFormulaRow(row);
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

    function acceptSuggestion(name) {
      var bounds = operandBounds();
      var before = input.value.slice(0, bounds.start);
      var after = input.value.slice(bounds.end);
      input.value = before + name + " " + after;
      var newPos = (before + name + " ").length;
      input.setSelectionRange(newPos, newPos);
      dropdown.hidden = true;
      refreshFormulaPreview(row);
      input.focus();
    }

    input.addEventListener("input", function () {
      refreshFormulaPreview(row);
      showSuggestions();
    });
    input.addEventListener("focus", showSuggestions);
    input.addEventListener("keydown", function (e) {
      if (dropdown.hidden) return;
      var items = dropdown.querySelectorAll(".formula-autocomplete-item");
      if (e.key === "ArrowDown") { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, items.length - 1); setActive(items); }
      else if (e.key === "ArrowUp") { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); setActive(items); }
      else if (e.key === "Enter" || e.key === "Tab") {
        if (activeIndex >= 0 && items[activeIndex]) { e.preventDefault(); acceptSuggestion(items[activeIndex].dataset.name); }
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
      if (item) acceptSuggestion(item.dataset.name);
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
    attachFormulaAutocomplete(row, exprInput, dropdown);
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
  });

  /* ---------------------------------------------------------------------
   * Screen: Preview & export
   * ------------------------------------------------------------------- */
  function goToPreviewStep() {
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

    document.getElementById("previewMasterReportName").textContent = state.selectedMasterReport;
    document.getElementById("previewMeta").textContent =
      (data ? data.rows.length : 0) + " total rows · Updated " + formatDateForDisplay(data ? data.lastUpdated : null);

    var chips = document.getElementById("previewReportTypeChips");
    chips.innerHTML = "";
    (mr ? mr.reportTypesUsed : []).forEach(function (t) {
      var chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = t;
      chips.appendChild(chip);
    });

    document.getElementById("previewExportMsg").hidden = true;

    document.getElementById("chkHeaderBold").checked = decoration.headerBold;
    document.getElementById("colorHeaderFill").value = decoration.headerFillColor ? "#" + decoration.headerFillColor : "#dbe6ff";
    document.getElementById("chkFreezeHeader").checked = decoration.freezeHeader;

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
    // The full merged dataset is shown (not a capped preview) — the
    // surrounding .header-row-preview-wrap already scrolls both ways with a
    // sticky header row, which is what makes that viable.
    var previewRows = data ? data.rows : [];
    previewRows.forEach(function (row, idx) {
      var tr = document.createElement("tr");
      var tdSno = document.createElement("td");
      tdSno.textContent = String(idx + 1);
      tr.appendChild(tdSno);
      exportColumns.forEach(function (c) {
        var td = document.createElement("td");
        var v = row[c];
        td.textContent = v === undefined || v === null ? "" : v;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

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
    var fmt = function (d) { return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
    return fmt(min) + " to " + fmt(max);
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
  // feature existed.
  function applyExportDecorationToSheet(ws, exportColumns, data, decoration, headerRowIndex0) {
    var hasCustomWidths = Object.keys(decoration.columnWidths).length > 0;
    if (hasCustomWidths) {
      var widthKeys = [EXPORT_SNO_KEY].concat(exportColumns);
      ws["!cols"] = widthKeys.map(function (key) {
        return decoration.columnWidths[key] ? { wch: pxToExcelChars(decoration.columnWidths[key]) } : {};
      });
    }

    if (decoration.headerBold || decoration.headerFillColor) {
      var headerStyle = {};
      if (decoration.headerBold) headerStyle.font = { bold: true };
      if (decoration.headerFillColor) headerStyle.fill = { fgColor: { rgb: decoration.headerFillColor } };
      for (var c = 0; c <= exportColumns.length; c++) {
        var addr = XLSX.utils.encode_cell({ r: headerRowIndex0, c: c });
        if (ws[addr]) ws[addr].s = headerStyle;
      }
    }

    exportColumns.forEach(function (colName, idx) {
      var fmtKey = decoration.numberFormats[colName];
      var fmtCode = fmtKey && NUMBER_FORMAT_CODES[fmtKey];
      if (!fmtCode) return;
      var colIdx = idx + 1; // +1 for the S.No. column
      for (var r = 0; r < data.rows.length; r++) {
        var addr = XLSX.utils.encode_cell({ r: headerRowIndex0 + 1 + r, c: colIdx });
        if (ws[addr]) ws[addr].z = fmtCode;
      }
    });
  }

  // onDone(true) once the file has actually been handed to the browser for
  // download, onDone(false) if there was nothing to export — callers chain
  // their post-download navigation off this instead of a plain return
  // value, since the freeze-header path above is asynchronous.
  function generateMasterReportExport(onDone) {
    var data = getMasterReportData(state.selectedMasterReport);
    if (!data || !data.rows.length) {
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
    aoa.push(["Period covered: " + computePeriodCoveredText(data.rows)]);
    aoa.push([]);
    var headerRowIndex0 = aoa.length; // row index of the header row, 0-based
    aoa.push(["S.No."].concat(exportColumns));
    data.rows.forEach(function (row, idx) {
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
    var safeName = state.selectedMasterReport.replace(/[\\/:*?"<>|]/g, "_");

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
      XLSX.writeFile(wb, safeName + ".xlsx");
      cb();
    });
  }

  document.getElementById("btnPreviewDownload").addEventListener("click", function () {
    generateMasterReportExport(function (ok) {
      if (!ok) return;
      resetFileState();
      state.selectedMasterReport = "";
      state.selectedReportType = "";
      renderHomeScreen();
      showScreen("screen-home");
    });
  });

  document.getElementById("btnPreviewDownloadAnalyse").addEventListener("click", function () {
    var masterReportName = state.selectedMasterReport;
    generateMasterReportExport(function (ok) {
      if (!ok) return;
      dashboardEntryScreen = "screen-preview";
      openDashboardFor(masterReportName);
    });
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

    var returnsColumn = findColumnByKeywords(columns, ["return", "refund", "rto"]);
    var adSpendColumn = findColumnByKeywords(numericColumns, ["ad spend", "adspend", "ad cost", "marketing spend", "marketing cost", "spend"]);
    var revenueColumn = findColumnByKeywords(numericColumns, ["revenue", "net sales", "gross sales", "sales amount", "gmv", "total amount", "amount", "sales", "price"]);
    if (adSpendColumn && adSpendColumn === revenueColumn) adSpendColumn = null;

    var primaryNumericColumn = revenueColumn || (numericColumns.length ? numericColumns[0] : null);

    return {
      classifications: classifications,
      numericColumns: numericColumns,
      platformColumn: platformColumn,
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

  function computeROAS(rows, spendColumn, revenueColumn) {
    var spend = sumColumn(rows, spendColumn);
    var revenue = sumColumn(rows, revenueColumn);
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
  function dashChartBaseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false, labels: { color: "#52514e" } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: DASH_MUTED } },
        y: { grid: { color: DASH_GRID_COLOR }, ticks: { color: DASH_MUTED }, beginAtZero: true }
      }
    };
  }
  function renderBarChart(canvas, labels, values, opts) {
    opts = opts || {};
    var options = dashChartBaseOptions();
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
  function renderLineChart(canvas, labels, values) {
    var options = dashChartBaseOptions();
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

  /* ---- Layer 1: Auto Analysis ---- */
  function renderAutoAnalysis(data, mr) {
    var kpiRow = document.getElementById("dashboardKpiRow");
    var chartsGrid = document.getElementById("dashboardChartsGrid");
    kpiRow.innerHTML = "";
    chartsGrid.innerHTML = "";
    dashboardAutoInsights = [];

    var rows = data.rows;
    var info = classifyMasterReportColumns(data);

    createStatTile(kpiRow, "Total Rows", rows.length.toLocaleString("en-IN"));
    createStatTile(kpiRow, "Report Types Merged", String(mr ? mr.reportTypesUsed.length : 0));
    createStatTile(kpiRow, "Date Range Covered", computePeriodCoveredText(rows));

    if (info.primaryNumericColumn) {
      var col = info.primaryNumericColumn;
      var total = sumColumn(rows, col);
      var avg = averageColumn(rows, col);
      createStatTile(kpiRow, "Total " + niceMetricLabel(col), formatMetricValue(total, col));
      createStatTile(kpiRow, "Average " + niceMetricLabel(col), formatMetricValue(avg, col));
      dashboardAutoInsights.push("Total " + niceMetricLabel(col).toLowerCase() + " across all rows is " + formatMetricValue(total, col) + ".");
    }

    var hasDates = rows.some(function (r) { return !!r.__saiDate; });
    if (hasDates) {
      var weeks = groupBySaiDateWeek(rows, info.primaryNumericColumn);
      if (weeks.length) {
        var labels = weeks.map(function (w) { return weekLabel(w.date); });
        var values = weeks.map(function (w) { return info.primaryNumericColumn ? w.sum : w.count; });
        var lineTitle = info.primaryNumericColumn ? (niceMetricLabel(info.primaryNumericColumn) + " Over Time") : "Rows Over Time";
        var lineCard = createChartCard(chartsGrid, lineTitle, false);
        renderLineChart(lineCard.canvas, labels, values);
        var maxIdx = values.indexOf(Math.max.apply(null, values));
        var metricWord = info.primaryNumericColumn ? niceMetricLabel(info.primaryNumericColumn).toLowerCase() : "order volume";
        var lineInsight = labels[maxIdx] + " had the highest " + metricWord + ".";
        lineCard.insightEl.textContent = lineInsight;
        dashboardAutoInsights.push(lineInsight);
      }
    }

    if (info.platformColumn) {
      var breakdown = foldIntoOther(groupByColumnValue(rows, info.platformColumn, info.primaryNumericColumn), 8);
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
            colors: bLabels.map(function (_, i) { return DASH_PALETTE[i % DASH_PALETTE.length]; })
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
      var roas = computeROAS(rows, info.adSpendColumn, info.revenueColumn);
      if (roas !== null) {
        createStatTile(kpiRow, "ROAS", roas.toFixed(2) + "x");
        dashboardAutoInsights.push("Every ₹1 spent on ads returned ₹" + roas.toFixed(2) + " in revenue.");
      }
    }
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
        renderBarChart(numCard.canvas, hist.labels, hist.counts);
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
        renderLineChart(dateCard.canvas, dateLabels, dateValues);
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
        else renderBarChart(catCard.canvas, catLabels, catValues, { horizontal: true, colors: catLabels.map(function (_, i) { return DASH_PALETTE[i % DASH_PALETTE.length]; }) });
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

  document.getElementById("btnCustomiseAnalysis").addEventListener("click", function () {
    var data = getMasterReportData(currentDashboardReport);
    if (!data) return;
    renderCustomAnalysisChecklist(data);
    document.getElementById("dashboardCustomError").hidden = true;
    document.getElementById("dashboardCustomPanel").hidden = false;
  });
  document.getElementById("btnCustomAnalysisCancel").addEventListener("click", function () {
    document.getElementById("dashboardCustomPanel").hidden = true;
  });
  document.getElementById("btnCustomAnalysisApply").addEventListener("click", function () {
    var data = getMasterReportData(currentDashboardReport);
    if (!data) return;
    var result = readCustomAnalysisSelections(data);
    if (!result) return;
    saveDashboardCustomFor(currentDashboardReport, result);
    document.getElementById("dashboardCustomPanel").hidden = true;
    refreshCustomSection(data);
  });

  /* ---- Entry point + chrome ---- */
  function openDashboardFor(masterReportName) {
    currentDashboardReport = masterReportName;
    renderDashboardScreen();
    showScreen("screen-dashboard");
  }

  function renderDashboardScreen() {
    var data = getMasterReportData(currentDashboardReport);
    var mr = getMasterReport(currentDashboardReport);

    // Only shown when this Dashboard visit came from the Preview screen
    // (via Download & Analyse) — reaching it straight from a Home card's
    // "Analyse" button has no Preview step to step back into.
    document.getElementById("btnDashboardBackPreview").hidden = dashboardEntryScreen !== "screen-preview";

    document.getElementById("dashboardTitle").textContent = currentDashboardReport;
    document.getElementById("dashboardSubtitle").textContent =
      (data ? data.rows.length : 0) + " rows · Updated " + formatDateForDisplay(data ? data.lastUpdated : null);
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
