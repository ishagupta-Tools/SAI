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
    columnOrder: "sai_column_order"
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
  // per Master Report so it's remembered on export and on returning to the
  // preview later. This is purely a display/export ordering preference —
  // it never touches data.columns itself (that array's append order still
  // drives internal logic like column-mismatch dedup), so a column added by
  // a later Report Type upload just lands at the end until reordered again.
  function getColumnOrderFor(masterReportName) {
    var all = loadJSON(STORAGE_KEYS.columnOrder, {});
    return all[masterReportName] || null;
  }
  function saveColumnOrderFor(masterReportName, order) {
    var all = loadJSON(STORAGE_KEYS.columnOrder, {});
    all[masterReportName] = order;
    saveJSON(STORAGE_KEYS.columnOrder, all);
  }
  function getEffectiveExportColumns(masterReportName, dataColumns) {
    var saved = getColumnOrderFor(masterReportName);
    if (!saved) return dataColumns.slice();
    var ordered = saved.filter(function (c) { return dataColumns.indexOf(c) !== -1; });
    dataColumns.forEach(function (c) { if (ordered.indexOf(c) === -1) ordered.push(c); });
    return ordered;
  }

  function parseDateSafe(value) {
    if (value === "" || value === null || value === undefined) return null;
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function mergeReportTypeDataIntoMasterReport(masterReportName, reportTypeName, finalColumns, rows, fileMeta, dateColumnKey) {
    var data = getMasterReportData(masterReportName) || { columns: ["Report Type"], rows: [], uploadedFiles: [], lastUpdated: null };

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
    selectedDateColumnHeader: "" // renamed key of the marked date column, "" = none
  };

  /* ---------------------------------------------------------------------
   * Screen navigation
   * ------------------------------------------------------------------- */
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("screen--active", el.id === id);
    });
    var topbar = document.getElementById("topbar");
    topbar.hidden = id === "screen-landing";
    if (!topbar.hidden) {
      document.getElementById("topbarCompany").textContent = state.companyName ? "🏢 " + state.companyName : "";
    }
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

  var currentWorkbook = null;
  var currentFileHeaders = [];
  var currentFileRows = [];
  var currentRenamedRows = [];
  var cameFromSheetScreen = false;

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
  document.getElementById("btnEditCompany").addEventListener("click", function () {
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

      list.appendChild(card);
    });
  }

  /* ---------------------------------------------------------------------
   * Screen: Upload
   * ------------------------------------------------------------------- */
  document.getElementById("btnUploadBack").addEventListener("click", function () {
    renderMasterReportScreen(!!state.selectedMasterReport);
    showScreen("screen-master-report");
  });

  btnUploadContinue.addEventListener("click", function () {
    if (isDuplicateFileUpload(state.selectedMasterReport, state.fileName, state.fileSize)) {
      var proceedAnyway = window.confirm("This file looks like it was already uploaded (same name & size). Add it again?");
      if (!proceedAnyway) return;
    }
    proceedPastUploadScreen();
  });

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
      renderColumnScreen();
      showScreen("screen-columns");
    } catch (err) {
      alert("Could not read headers: " + err.message);
    }
  });

  /* ---------------------------------------------------------------------
   * Screen: Column selection & rename
   * ------------------------------------------------------------------- */
  var columnsTableBody = document.getElementById("columnsTableBody");
  var columnsMismatchBanner = document.getElementById("columnsMismatchBanner");
  var columnsMismatchText = document.getElementById("columnsMismatchText");

  function renderColumnScreen() {
    document.getElementById("columnsReportType").textContent = state.selectedReportType;
    document.getElementById("columnsAutofillNote").hidden = true;
    columnsMismatchBanner.hidden = true;

    console.log("[SAI] Rendering column screen from currentFileHeaders:", currentFileHeaders);

    // Column-mismatch check: this only reads the saved header *keys* to
    // diff against the current file, purely informational — it never
    // feeds the per-row defaults built below.
    var savedStructure = getColumnStructureFor(state.selectedReportType);
    if (savedStructure) {
      var savedKeys = Object.keys(savedStructure);
      var missing = savedKeys.filter(function (h) { return currentFileHeaders.indexOf(h) === -1; });
      var added = currentFileHeaders.filter(function (h) { return savedKeys.indexOf(h) === -1; });
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
    // This screen must show exactly the file's own headers and nothing else.
    // Every row is built solely from currentFileHeaders (set by
    // extractHeadersAndRows() once the sheet + header row are chosen) with
    // include=true and renameTo=header as the only defaults — localStorage
    // is never read here for prefilling, so a value saved in a previous
    // session can never resurface as if it came from the current file.
    currentFileHeaders.forEach(function (header) {
      var include = true;
      var renameTo = header;

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
      tr.appendChild(tdOrig);

      var tdRename = document.createElement("td");
      if (masterColumns.length) {
        var existingMatch = masterColumns.find(function (c) { return c.toLowerCase() === header.toLowerCase(); });

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

  // Any column already standardised on this Master Report that the current
  // file doesn't map onto (because it has no matching/included header) is
  // offered here so the user can fill every row of THIS file with one
  // default value instead of leaving the column blank for it. Recomputed
  // live whenever the include checkboxes or rename choices change, while
  // preserving whatever the user already typed for a column that's still
  // missing after the recompute.
  function updateMissingColumnsSection() {
    var wrap = document.getElementById("missingColumnsWrap");
    var hint = document.getElementById("missingColumnsHint");
    var list = document.getElementById("missingColumnsList");

    var masterData = getMasterReportData(state.selectedMasterReport);
    var masterColumns = masterData ? masterData.columns.filter(function (c) { return c !== "Report Type"; }) : [];

    if (!masterColumns.length) {
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

    var missing = masterColumns.filter(function (c) { return covered.indexOf(c.toLowerCase()) === -1; });

    wrap.hidden = missing.length === 0;
    list.innerHTML = "";
    hint.textContent = "These columns exist in \"" + state.selectedMasterReport + "\" but weren't found in this file. Enter a value to fill every row of this file, or leave blank.";

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
      var matches = available.filter(function (c) { return !partial || c.name.toLowerCase().indexOf(partial) !== -1; }).slice(0, 8);

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

    mergeReportTypeDataIntoMasterReport(
      state.selectedMasterReport,
      state.selectedReportType,
      state.selectedColumns.concat(formulaColumnNames),
      currentRenamedRows,
      { name: state.fileName, size: state.fileSize },
      state.selectedDateColumnHeader
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

  function makePreviewHeaderDraggable(th, column, headRow) {
    th.draggable = true;
    th.className = "preview-th-draggable";
    th.dataset.column = column;

    th.addEventListener("dragstart", function (e) {
      previewDraggedColumn = column;
      th.classList.add("preview-th--dragging");
      e.dataTransfer.effectAllowed = "move";
      // Firefox requires setData to be called for the drag to start at all.
      e.dataTransfer.setData("text/plain", column);
    });
    th.addEventListener("dragend", function () {
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
      var currentOrder = getEffectiveExportColumns(state.selectedMasterReport, data.columns);
      var fromIdx = currentOrder.indexOf(previewDraggedColumn);
      var toIdx = currentOrder.indexOf(column);
      if (fromIdx === -1 || toIdx === -1) return;
      currentOrder.splice(fromIdx, 1);
      currentOrder.splice(toIdx, 0, previewDraggedColumn);
      saveColumnOrderFor(state.selectedMasterReport, currentOrder);
      renderPreviewScreen();
    });
  }

  function renderPreviewScreen() {
    var data = getMasterReportData(state.selectedMasterReport);
    var mr = getMasterReport(state.selectedMasterReport);
    var exportColumns = data ? getEffectiveExportColumns(state.selectedMasterReport, data.columns) : [];

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

    var headRow = document.getElementById("previewTableHeadRow");
    headRow.innerHTML = "";
    var thSno = document.createElement("th");
    thSno.textContent = "S.No.";
    headRow.appendChild(thSno);
    exportColumns.forEach(function (c) {
      var th = document.createElement("th");
      th.textContent = c;
      makePreviewHeaderDraggable(th, c, headRow);
      headRow.appendChild(th);
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

  function generateMasterReportExport() {
    var data = getMasterReportData(state.selectedMasterReport);
    if (!data || !data.rows.length) {
      alert("No data to export yet.");
      return;
    }

    var exportColumns = getEffectiveExportColumns(state.selectedMasterReport, data.columns); // __saiDate is bookkeeping-only, never exported
    var todayText = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

    var aoa = [];
    aoa.push([state.companyName || ""]);
    aoa.push([state.selectedMasterReport]);
    aoa.push(["Date generated: " + todayText]);
    aoa.push(["Period covered: " + computePeriodCoveredText(data.rows)]);
    aoa.push([]);
    aoa.push(["S.No."].concat(exportColumns));
    data.rows.forEach(function (row, idx) {
      aoa.push([idx + 1].concat(exportColumns.map(function (c) {
        var v = row[c];
        return v === undefined || v === null ? "" : v;
      })));
    });

    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master Report");
    var safeName = state.selectedMasterReport.replace(/[\\/:*?"<>|]/g, "_");
    XLSX.writeFile(wb, safeName + ".xlsx");

    var msg = document.getElementById("previewExportMsg");
    msg.textContent = "Downloaded \"" + safeName + ".xlsx\".";
    msg.hidden = false;
  }

  document.getElementById("btnPreviewGenerate").addEventListener("click", function () {
    generateMasterReportExport();
  });

  /* ---------------------------------------------------------------------
   * Init
   * ------------------------------------------------------------------- */
  state.companyName = getCompanyName();
  showScreen("screen-landing");
})();
