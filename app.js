(function () {
  "use strict";

  /* ---------------------------------------------------------------------
   * Storage
   * ------------------------------------------------------------------- */
  var STORAGE_KEYS = {
    company: "sai_company_name",
    categories: "sai_categories",
    columnStructure: "sai_column_structure",
    sheetPreference: "sai_sheet_preference",
    formulas: "sai_formulas"
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

  // Report Categories/Types: two-level template tree shown on the home
  // screen and reused by the upload flow's category/type picker.
  function getCategories() { return loadJSON(STORAGE_KEYS.categories, []); }
  function saveCategories(categories) { saveJSON(STORAGE_KEYS.categories, categories); }
  function addCategory(name) {
    var categories = getCategories();
    var exists = categories.some(function (c) { return c.name.toLowerCase() === name.toLowerCase(); });
    if (!exists) {
      categories.push({ name: name, reportTypes: [] });
      saveCategories(categories);
    }
    return categories;
  }
  function addReportTypeToCategory(categoryName, reportTypeName) {
    var categories = getCategories();
    var category = categories.find(function (c) { return c.name.toLowerCase() === categoryName.toLowerCase(); });
    if (!category) return categories;
    var exists = category.reportTypes.some(function (t) { return t.toLowerCase() === reportTypeName.toLowerCase(); });
    if (!exists) {
      category.reportTypes.push(reportTypeName);
      saveCategories(categories);
    }
    return categories;
  }

  // Column structure (which columns to keep + what to rename them to) is
  // saved per Category + Report Type, keyed by the *original* column name.
  // This is write-only for now (read by the Part C formula builder later) —
  // the column selection screen itself must never read it back, since a
  // value saved in one session must not resurface as if it belonged to a
  // different, later-uploaded file.
  function columnStructureKey(category, reportType) {
    return category + "␟" + reportType;
  }
  function saveColumnStructureFor(category, reportType, headerStructure) {
    var all = loadJSON(STORAGE_KEYS.columnStructure, {});
    var key = columnStructureKey(category, reportType);
    var existing = all[key] || {};
    Object.keys(headerStructure).forEach(function (h) { existing[h] = headerStructure[h]; });
    all[key] = existing;
    saveJSON(STORAGE_KEYS.columnStructure, all);
  }

  // Which sheet holds the data is remembered per Category + Report Type
  // (same key shape as the column structure above), so a report type that's
  // always in, say, "Sheet2" doesn't need to be picked again on every upload.
  function sheetPreferenceKey(category, reportType) {
    return category + "␟" + reportType;
  }
  function getSheetPreference(category, reportType) {
    var all = loadJSON(STORAGE_KEYS.sheetPreference, {});
    return all[sheetPreferenceKey(category, reportType)] || "";
  }
  function saveSheetPreference(category, reportType, sheetName) {
    var all = loadJSON(STORAGE_KEYS.sheetPreference, {});
    all[sheetPreferenceKey(category, reportType)] = sheetName;
    saveJSON(STORAGE_KEYS.sheetPreference, all);
  }

  // Formulas (validation checks) built on the Formula Builder screen are
  // saved per Category + Report Type (same key shape as above), so
  // reopening a report type later pre-fills whatever was built for it.
  function formulaKey(category, reportType) {
    return category + "␟" + reportType;
  }
  function getFormulasFor(category, reportType) {
    var all = loadJSON(STORAGE_KEYS.formulas, {});
    return all[formulaKey(category, reportType)] || [];
  }
  function saveFormulasFor(category, reportType, formulas) {
    var all = loadJSON(STORAGE_KEYS.formulas, {});
    all[formulaKey(category, reportType)] = formulas;
    saveJSON(STORAGE_KEYS.formulas, all);
  }

  /* ---------------------------------------------------------------------
   * App state (in-memory, per session)
   * ------------------------------------------------------------------- */
  var state = {
    companyName: "",
    fileName: "",
    selectedCategory: "",
    selectedReportType: "",
    selectedSheetName: "",
    selectedHeaderRowIndex: 0,
    selectedColumns: []
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
   * ------------------------------------------------------------------- */
  var fileInput = document.getElementById("fileInput");
  var dropzone = document.getElementById("dropzone");
  var dropzoneFilename = document.getElementById("dropzoneFilename");
  var uploadError = document.getElementById("uploadError");
  var btnUploadContinue = document.getElementById("btnUploadContinue");

  var currentWorkbook = null;
  var currentFileHeaders = [];
  var currentFileRows = [];
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
    state.selectedSheetName = "";
    state.selectedHeaderRowIndex = 0;
    state.selectedColumns = [];
    currentWorkbook = null;
    currentFileHeaders = [];
    currentFileRows = [];
    cameFromSheetScreen = false;
    btnUploadContinue.disabled = true;
    dropzoneFilename.textContent = "";
    fileInput.value = "";
    uploadError.hidden = true;
  }

  document.getElementById("btnStartOver").addEventListener("click", function () {
    resetFileState();
    state.selectedCategory = "";
    state.selectedReportType = "";
    renderHomeScreen();
    showScreen("screen-home");
  });

  /* ---------------------------------------------------------------------
   * Screen: Home (report templates)
   * ------------------------------------------------------------------- */
  var newCategoryForm = document.getElementById("newCategoryForm");
  var inputNewCategory = document.getElementById("inputNewCategory");

  document.getElementById("btnHomeNewUpload").addEventListener("click", function () {
    resetFileState();
    showScreen("screen-upload");
  });

  document.getElementById("btnNewCategory").addEventListener("click", function () {
    inputNewCategory.value = "";
    newCategoryForm.hidden = false;
    inputNewCategory.focus();
  });

  document.getElementById("btnCancelCategory").addEventListener("click", function () {
    newCategoryForm.hidden = true;
  });

  document.getElementById("btnSaveCategory").addEventListener("click", function () {
    var name = inputNewCategory.value.trim();
    if (!name) {
      inputNewCategory.focus();
      return;
    }
    addCategory(name);
    newCategoryForm.hidden = true;
    renderHomeScreen();
  });

  function renderHomeScreen() {
    var categories = getCategories();
    var emptyState = document.getElementById("templatesEmptyState");
    var list = document.getElementById("categoryList");
    list.innerHTML = "";

    emptyState.hidden = categories.length > 0;
    list.hidden = categories.length === 0;

    categories.forEach(function (category) {
      var card = document.createElement("div");
      card.className = "category-card";

      var header = document.createElement("div");
      header.className = "category-card__header";
      var title = document.createElement("h3");
      title.textContent = category.name;
      header.appendChild(title);
      card.appendChild(header);

      if (category.reportTypes.length) {
        var tiles = document.createElement("div");
        tiles.className = "category-card__tiles";
        category.reportTypes.forEach(function (typeName) {
          var tile = document.createElement("button");
          tile.type = "button";
          tile.className = "report-tile";
          tile.textContent = typeName;
          tile.addEventListener("click", function () {
            alert("Template selected: " + typeName);
          });
          tiles.appendChild(tile);
        });
        card.appendChild(tiles);
      } else {
        var emptyMsg = document.createElement("p");
        emptyMsg.className = "category-card__empty";
        emptyMsg.textContent = "No report types yet in this category.";
        card.appendChild(emptyMsg);
      }

      var addForm = document.createElement("div");
      addForm.className = "inline-form";
      addForm.hidden = true;
      var addInput = document.createElement("input");
      addInput.type = "text";
      addInput.placeholder = "e.g. Amazon Orders";
      var addSaveBtn = document.createElement("button");
      addSaveBtn.type = "button";
      addSaveBtn.className = "btn btn--primary";
      addSaveBtn.textContent = "Add";
      var addCancelBtn = document.createElement("button");
      addCancelBtn.type = "button";
      addCancelBtn.className = "btn";
      addCancelBtn.textContent = "Cancel";
      addForm.appendChild(addInput);
      addForm.appendChild(addSaveBtn);
      addForm.appendChild(addCancelBtn);
      card.appendChild(addForm);

      var addToggleBtn = document.createElement("button");
      addToggleBtn.type = "button";
      addToggleBtn.className = "btn";
      addToggleBtn.textContent = "+ Add Report Type";
      addToggleBtn.addEventListener("click", function () {
        addInput.value = "";
        addForm.hidden = false;
        addInput.focus();
      });
      card.appendChild(addToggleBtn);

      addCancelBtn.addEventListener("click", function () { addForm.hidden = true; });
      addSaveBtn.addEventListener("click", function () {
        var typeName = addInput.value.trim();
        if (!typeName) {
          addInput.focus();
          return;
        }
        addReportTypeToCategory(category.name, typeName);
        renderHomeScreen();
      });

      list.appendChild(card);
    });
  }

  /* ---------------------------------------------------------------------
   * Screen: Upload -> Category / Report type
   * ------------------------------------------------------------------- */
  document.getElementById("btnUploadBack").addEventListener("click", function () {
    renderHomeScreen();
    showScreen("screen-home");
  });

  btnUploadContinue.addEventListener("click", function () {
    renderCategoryScreen();
    showScreen("screen-category");
  });

  /* ---------------------------------------------------------------------
   * Screen: Report Category / Type
   * ------------------------------------------------------------------- */
  var inputCategory = document.getElementById("inputCategory");
  var inputCatReportType = document.getElementById("inputCatReportType");
  var btnCategoryContinue = document.getElementById("btnCategoryContinue");

  function renderCategoryScreen() {
    var categoryDatalist = document.getElementById("categoryDatalist");
    categoryDatalist.innerHTML = "";
    getCategories().forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.name;
      categoryDatalist.appendChild(opt);
    });
    inputCategory.value = state.selectedCategory || "";
    inputCatReportType.value = state.selectedReportType || "";
    updateCatReportTypeDatalist();
    updateCategoryContinueState();
  }

  function updateCatReportTypeDatalist() {
    var catName = inputCategory.value.trim();
    var list = document.getElementById("catReportTypeDatalist");
    list.innerHTML = "";
    var match = getCategories().find(function (c) { return c.name.toLowerCase() === catName.toLowerCase(); });
    if (match) {
      match.reportTypes.forEach(function (t) {
        var opt = document.createElement("option");
        opt.value = t;
        list.appendChild(opt);
      });
    }
  }

  function updateCategoryContinueState() {
    btnCategoryContinue.disabled = !inputCategory.value.trim() || !inputCatReportType.value.trim();
  }

  inputCategory.addEventListener("input", function () {
    updateCatReportTypeDatalist();
    updateCategoryContinueState();
  });
  inputCatReportType.addEventListener("input", updateCategoryContinueState);

  document.getElementById("btnCategoryBack").addEventListener("click", function () {
    showScreen("screen-upload");
  });

  btnCategoryContinue.addEventListener("click", function () {
    var cat = inputCategory.value.trim();
    var type = inputCatReportType.value.trim();
    if (!cat || !type) return;
    addCategory(cat);
    addReportTypeToCategory(cat, type);
    state.selectedCategory = cat;
    state.selectedReportType = type;
    proceedPastCategoryScreen();
  });

  /* ---------------------------------------------------------------------
   * Screen: Sheet selection
   *
   * Only shown when the uploaded file has more than one sheet. If a sheet
   * name was already saved for this Category + Report Type combo (and
   * that sheet still exists in this file), it's used automatically and
   * this screen is skipped entirely.
   * ------------------------------------------------------------------- */
  var sheetList = document.getElementById("sheetList");

  function proceedPastCategoryScreen() {
    var sheetNames = currentWorkbook ? currentWorkbook.SheetNames : [];

    if (sheetNames.length > 1) {
      var saved = getSheetPreference(state.selectedCategory, state.selectedReportType);
      if (saved && sheetNames.indexOf(saved) !== -1) {
        cameFromSheetScreen = false;
        state.selectedSheetName = saved;
        state.selectedHeaderRowIndex = 0;
        goToHeaderRowStep();
      } else {
        cameFromSheetScreen = true;
        renderSheetScreen();
        showScreen("screen-sheet");
      }
    } else {
      cameFromSheetScreen = false;
      state.selectedSheetName = sheetNames[0] || "";
      state.selectedHeaderRowIndex = 0;
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
        state.selectedHeaderRowIndex = 0;
        saveSheetPreference(state.selectedCategory, state.selectedReportType, name);
        goToHeaderRowStep();
      });
      sheetList.appendChild(tile);
    });
  }

  document.getElementById("btnSheetBack").addEventListener("click", function () {
    showScreen("screen-category");
  });

  /* ---------------------------------------------------------------------
   * Screen: Header row selection
   *
   * Shows the first 20 rows of the selected sheet so the user can click
   * whichever row actually holds the column names (not always row 1).
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
      showScreen("screen-category");
    }
  });

  btnHeaderRowContinue.addEventListener("click", function () {
    try {
      var sheet = currentWorkbook.Sheets[state.selectedSheetName];
      var extracted = extractHeadersAndRows(sheet, state.selectedHeaderRowIndex);
      currentFileHeaders = extracted.headers;
      currentFileRows = extracted.rows;
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

  function renderColumnScreen() {
    document.getElementById("columnsReportType").textContent = state.selectedReportType;
    document.getElementById("columnsAutofillNote").hidden = true;

    console.log("[SAI] Rendering column screen from currentFileHeaders:", currentFileHeaders);

    columnsTableBody.innerHTML = "";
    // This screen must show exactly the file's own headers and nothing else.
    // Every row is built solely from currentFileHeaders (set by
    // extractHeadersAndRows() once the sheet + header row are chosen) with
    // include=true and renameTo=header as the only defaults — localStorage
    // is never read here, so a value saved in a previous session can never
    // resurface as if it came from the current file.
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

      columnsTableBody.appendChild(tr);
    });
  }

  document.getElementById("btnColumnsSelectAll").addEventListener("click", function () {
    columnsTableBody.querySelectorAll(".column-include").forEach(function (cb) { cb.checked = true; });
  });
  document.getElementById("btnColumnsDeselectAll").addEventListener("click", function () {
    columnsTableBody.querySelectorAll(".column-include").forEach(function (cb) { cb.checked = false; });
  });

  document.getElementById("btnColumnsBack").addEventListener("click", function () {
    showScreen("screen-upload");
  });

  document.getElementById("btnColumnsNext").addEventListener("click", function () {
    var structure = {};
    var selectedColumns = [];
    columnsTableBody.querySelectorAll("tr").forEach(function (tr) {
      var header = tr.dataset.header;
      var checkbox = tr.querySelector(".column-include");
      var renameInput = tr.querySelector(".column-rename");
      var renameTo = renameInput.value.trim() || header;
      structure[header] = {
        include: checkbox.checked,
        renameTo: renameTo
      };
      if (checkbox.checked) selectedColumns.push(renameTo);
    });
    saveColumnStructureFor(state.selectedCategory, state.selectedReportType, structure);
    state.selectedColumns = selectedColumns;
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
  var formulaSuccessMsg = document.getElementById("formulaSuccessMsg");
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
    formulaSuccessMsg.hidden = true;

    var saved = getFormulasFor(state.selectedCategory, state.selectedReportType);
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

  document.getElementById("btnAddFormula").addEventListener("click", function () {
    addFormulaRow(null);
  });

  document.getElementById("btnFormulaBack").addEventListener("click", function () {
    showScreen("screen-columns");
  });

  btnFormulaNext.addEventListener("click", function () {
    var formulas = readFormulasFromDOM();
    saveFormulasFor(state.selectedCategory, state.selectedReportType, formulas);
    formulaSuccessMsg.textContent = "Formulas saved for \"" + state.selectedReportType + "\".";
    formulaSuccessMsg.hidden = false;
  });

  /* ---------------------------------------------------------------------
   * Init
   * ------------------------------------------------------------------- */
  state.companyName = getCompanyName();
  showScreen("screen-landing");
})();
