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
    masterReportData: "sai_master_report_data"
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

  document.getElementById("btnStartOver").addEventListener("click", function () {
    resetFileState();
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

  function renderHomeScreen() {
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
      var renameInput = document.createElement("input");
      renameInput.type = "text";
      renameInput.className = "column-rename";
      renameInput.value = renameTo;
      tdRename.appendChild(renameInput);
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
  }

  document.getElementById("btnColumnsSelectAll").addEventListener("click", function () {
    columnsTableBody.querySelectorAll(".column-include").forEach(function (cb) { cb.checked = true; });
  });
  document.getElementById("btnColumnsDeselectAll").addEventListener("click", function () {
    columnsTableBody.querySelectorAll(".column-include").forEach(function (cb) { cb.checked = false; });
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
      var renameInput = tr.querySelector(".column-rename");
      var dateRadio = tr.querySelector(".column-date-radio");
      var renameTo = renameInput.value.trim() || header;
      structure[header] = {
        include: checkbox.checked,
        renameTo: renameTo
      };
      if (checkbox.checked) selectedColumns.push(renameTo);
      if (dateRadio.checked) dateHeaderOriginal = header;
    });
    saveColumnStructureFor(state.selectedReportType, structure);
    saveDateColumnPreferenceFor(state.selectedReportType, dateHeaderOriginal || null);

    state.selectedColumns = selectedColumns;
    // Store the renamed key (not the original header) so the merge step
    // can look the date value up directly on the final row objects.
    state.selectedDateColumnHeader = (dateHeaderOriginal && structure[dateHeaderOriginal].include)
      ? structure[dateHeaderOriginal].renameTo
      : "";
    currentRenamedRows = buildRenamedRows(currentFileRows, structure);

    goToFormulaStep();
  });

  /* ---------------------------------------------------------------------
   * Screen: Formula builder
   *
   * Column dropdowns are populated solely from state.selectedColumns (the
   * included + renamed columns from the Column Selection screen), so this
   * screen is always in sync with whatever the user just chose to keep.
   * If a saved formula references a column that no longer exists in the
   * current selection, it's still added as an extra option so the saved
   * choice stays visible instead of silently reverting to blank.
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

  function buildColumnSelect(selectEl, selectedValue) {
    selectEl.innerHTML = "";
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select column…";
    selectEl.appendChild(placeholder);

    var cols = state.selectedColumns.slice();
    if (selectedValue && cols.indexOf(selectedValue) === -1) cols.push(selectedValue);
    cols.forEach(function (col) {
      var opt = document.createElement("option");
      opt.value = col;
      opt.textContent = col;
      selectEl.appendChild(opt);
    });
    selectEl.value = selectedValue || "";
  }

  function buildOperandSelect(selectEl, selectedColumnValue) {
    selectEl.innerHTML = "";
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select column…";
    selectEl.appendChild(placeholder);

    var numberOpt = document.createElement("option");
    numberOpt.value = "__number__";
    numberOpt.textContent = "Enter a number…";
    selectEl.appendChild(numberOpt);

    var cols = state.selectedColumns.slice();
    if (selectedColumnValue && cols.indexOf(selectedColumnValue) === -1) cols.push(selectedColumnValue);
    cols.forEach(function (col) {
      var opt = document.createElement("option");
      opt.value = col;
      opt.textContent = col;
      selectEl.appendChild(opt);
    });
    selectEl.value = selectedColumnValue || "";
  }

  function createStepRow(stepData) {
    var row = document.createElement("div");
    row.className = "formula-step";

    var operatorSelect = document.createElement("select");
    operatorSelect.className = "formula-operator";
    [["+", "+"], ["-", "−"], ["*", "×"], ["/", "÷"]].forEach(function (pair) {
      var opt = document.createElement("option");
      opt.value = pair[0];
      opt.textContent = pair[1];
      operatorSelect.appendChild(opt);
    });
    operatorSelect.value = (stepData && stepData.operator) || "+";
    row.appendChild(operatorSelect);

    var operandSelect = document.createElement("select");
    operandSelect.className = "formula-operand-select";
    var isNumber = stepData && stepData.operandType === "number";
    buildOperandSelect(operandSelect, isNumber ? "" : (stepData && stepData.operandColumn) || "");

    var numberInput = document.createElement("input");
    numberInput.type = "number";
    numberInput.step = "any";
    numberInput.placeholder = "Value";
    numberInput.className = "formula-operand-number";

    if (isNumber) {
      operandSelect.value = "__number__";
      numberInput.value = stepData.operandNumber !== undefined ? stepData.operandNumber : "";
      numberInput.hidden = false;
    } else {
      numberInput.hidden = true;
    }

    operandSelect.addEventListener("change", function () {
      if (operandSelect.value === "__number__") {
        numberInput.hidden = false;
        numberInput.focus();
      } else {
        numberInput.hidden = true;
      }
    });

    row.appendChild(operandSelect);
    row.appendChild(numberInput);

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "link-btn formula-step-remove";
    removeBtn.textContent = "Remove step";
    removeBtn.addEventListener("click", function () { row.remove(); });
    row.appendChild(removeBtn);

    return row;
  }

  function addFormulaRow(formulaData) {
    var row = document.createElement("div");
    row.className = "formula-row";

    var header = document.createElement("div");
    header.className = "formula-row__header";

    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "formula-name";
    nameInput.placeholder = "e.g. Net Payout Check";
    nameInput.value = (formulaData && formulaData.name) || "";
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

    var firstColumnSelect = document.createElement("select");
    firstColumnSelect.className = "formula-first-column";
    buildColumnSelect(firstColumnSelect, formulaData && formulaData.firstColumn);
    body.appendChild(firstColumnSelect);

    var stepsWrap = document.createElement("div");
    stepsWrap.className = "formula-steps";
    body.appendChild(stepsWrap);

    var addStepBtn = document.createElement("button");
    addStepBtn.type = "button";
    addStepBtn.className = "btn formula-add-step";
    addStepBtn.textContent = "+ Add Step";
    addStepBtn.addEventListener("click", function () {
      stepsWrap.appendChild(createStepRow());
    });
    body.appendChild(addStepBtn);

    row.appendChild(body);

    var steps = (formulaData && formulaData.steps) || [];
    steps.forEach(function (s) { stepsWrap.appendChild(createStepRow(s)); });
    if (!formulaData) {
      stepsWrap.appendChild(createStepRow());
    }

    formulaList.appendChild(row);
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

  function readFormulasFromDOM() {
    var formulas = [];
    formulaList.querySelectorAll(".formula-row").forEach(function (row) {
      var name = row.querySelector(".formula-name").value.trim();
      var firstColumn = row.querySelector(".formula-first-column").value;
      var steps = [];
      row.querySelectorAll(".formula-step").forEach(function (stepEl) {
        var operator = stepEl.querySelector(".formula-operator").value;
        var operandSelect = stepEl.querySelector(".formula-operand-select");
        var isNumber = operandSelect.value === "__number__";
        steps.push({
          operator: operator,
          operandType: isNumber ? "number" : "column",
          operandColumn: isNumber ? "" : operandSelect.value,
          operandNumber: isNumber ? stepEl.querySelector(".formula-operand-number").value : ""
        });
      });
      formulas.push({ name: name, firstColumn: firstColumn, steps: steps });
    });
    return formulas;
  }

  function collectFormulaReferencedColumns(formula) {
    var cols = [formula.firstColumn];
    formula.steps.forEach(function (s) {
      if (s.operandType === "column" && s.operandColumn) cols.push(s.operandColumn);
    });
    return cols.filter(function (c) { return !!c; });
  }

  function computeFormulaValue(row, formula) {
    var value = parseFloat(row[formula.firstColumn]);
    if (isNaN(value)) value = 0;
    for (var i = 0; i < formula.steps.length; i++) {
      var step = formula.steps[i];
      var operand = step.operandType === "number" ? parseFloat(step.operandNumber) : parseFloat(row[step.operandColumn]);
      if (isNaN(operand)) operand = 0;
      switch (step.operator) {
        case "+": value += operand; break;
        case "-": value -= operand; break;
        case "*": value *= operand; break;
        case "/": value = operand === 0 ? NaN : value / operand; break;
      }
    }
    return isNaN(value) || !isFinite(value) ? "" : value;
  }

  document.getElementById("btnAddFormula").addEventListener("click", function () {
    addFormulaRow(null);
  });

  document.getElementById("btnFormulaBack").addEventListener("click", function () {
    showScreen("screen-columns");
  });

  btnFormulaNext.addEventListener("click", function () {
    var formulas = readFormulasFromDOM();
    saveFormulasFor(state.selectedReportType, formulas);
    formulaErrorMsg.hidden = true;

    for (var i = 0; i < formulas.length; i++) {
      var referenced = collectFormulaReferencedColumns(formulas[i]);
      var missingCol = referenced.find(function (c) { return state.selectedColumns.indexOf(c) === -1; });
      if (missingCol) {
        formulaErrorMsg.textContent = "Required column \"" + missingCol + "\" (used in formula \"" + (formulas[i].name || "Untitled") + "\") is missing from this file. Include it on the previous screen or adjust the formula.";
        formulaErrorMsg.hidden = false;
        return;
      }
    }

    currentRenamedRows.forEach(function (row) {
      formulas.forEach(function (f) {
        if (f.name) row[f.name] = computeFormulaValue(row, f);
      });
    });

    var formulaColumnNames = formulas.filter(function (f) { return f.name; }).map(function (f) { return f.name; });

    mergeReportTypeDataIntoMasterReport(
      state.selectedMasterReport,
      state.selectedReportType,
      state.selectedColumns.concat(formulaColumnNames),
      currentRenamedRows,
      { name: state.fileName, size: state.fileSize },
      state.selectedDateColumnHeader
    );

    goToPreviewStep();
  });

  /* ---------------------------------------------------------------------
   * Screen: Preview & export
   * ------------------------------------------------------------------- */
  var PREVIEW_ROW_LIMIT = 10;

  function goToPreviewStep() {
    renderPreviewScreen();
    showScreen("screen-preview");
  }

  function renderPreviewScreen() {
    var data = getMasterReportData(state.selectedMasterReport);
    var mr = getMasterReport(state.selectedMasterReport);
    var exportColumns = data ? data.columns : [];

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
      headRow.appendChild(th);
    });

    var body = document.getElementById("previewTableBody");
    body.innerHTML = "";
    var previewRows = data ? data.rows.slice(0, PREVIEW_ROW_LIMIT) : [];
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

    var exportColumns = data.columns; // __saiDate is bookkeeping-only, never exported
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
