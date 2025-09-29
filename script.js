// Configuration
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbz13qMAr_iMbUfZ8COwaNYu-P766Zf1EjbI94lOLgJZvpRMgH7kwegGNm9PwyMIuVV-GA/exec";

const ROOT_FOLDER_ID = "1zRtyoWbD8SZDYZeAsV8QIJ95wbW0BbVu";
const POLLING_INTERVAL = 5000; // Check every 5 seconds

// DOM Elements
const foldersContainer = document.getElementById("folders-container");
const foldersList = document.getElementById("folders-list");
const loadingFolders = document.getElementById("loading-folders");
const folderSearch = document.getElementById("folder-search");
const welcomeMessage = document.getElementById("welcome-message");
const contentContainer = document.getElementById("content-container");
const subjectHeader = document.getElementById("subject-header");
const breadcrumbList = document.getElementById("breadcrumb-list");
const contentList = document.getElementById("content-list");
const loadingContent = document.getElementById("loading-content");
const emptyFolderMessage = document.getElementById("empty-folder-message");
const previewModal = document.getElementById("preview-modal");
const previewFilename = document.getElementById("preview-filename");
const previewContainer = document.getElementById("preview-container");
const previewLoading = document.getElementById("preview-loading");
const previewError = document.getElementById("preview-error");
const errorMessage = document.getElementById("error-message");
const pdfContainer = document.getElementById("pdf-container");
const docxContainer = document.getElementById("docx-container");
const docPreviewIframe = document.getElementById("doc-preview-iframe");
const closeModal = document.getElementById("close-modal");
const printButton = document.getElementById("print-button");
const downloadButton = document.getElementById("download-button");
const pinContainer = document.getElementById("pin-container");
const incorrectPin = document.getElementById("incorrect-pin");
const pinInputs = [
  document.getElementById("code-1"),
  document.getElementById("code-2"),
  document.getElementById("code-3"),
  document.getElementById("code-4"),
];
const globalmenuButton = document.getElementById("menu-button");
const flotingSvg = document.getElementById("flotingSvg");
const footerBottom = document.getElementById("footerBottom");

// State
let currentFolderId = null;
let currentSubject = null;
let currentFileId = null;
let currentPreviewUrl = null;
let currentFileBlob = null;
let allFolders = [];
let folderCache = {}; // { folderId: { type: "folders"|"files", content: [] } }
let fileCache = {}; // { fileId: { blob: string, mimeType: string } }
let currentCourse = null;
let cacheTimestamp = new Date().toDateString();
let pollingIntervalId = null;
let expectedPin = null; // To store the PIN extracted from filename
let currentGoogleDocId = null; // To store the Google Doc ID extracted from filename
// Routing control
let isProgrammaticNavigation = false; // prevent redundant hash updates

// A global object to manage animation timers and prevent overlaps
const progressAnimation = {
  textInterval: null,
  stageTimers: [],
};

function startProgressAnimation(iframeElement, loadingContainer, onCompletion) {
  // 1. Clear any leftover animations
  clearInterval(progressAnimation.textInterval);
  progressAnimation.stageTimers.forEach(clearTimeout);
  progressAnimation.stageTimers = [];

  // 2. Display the progress bar HTML.
  loadingContainer.innerHTML = `
    <div class="flex flex-col items-center justify-center">
      <svg class="w-16 h-16" viewBox="0 0 36 36" style="height: 95px; width: 95px;">
        <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none" stroke="#e5e7eb" stroke-width="3"/>
        <path id="progress-circle" class="circle" stroke-linecap="round" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none" stroke="#3b82f6" stroke-width="3"
          stroke-dasharray="100, 100"
          stroke-dashoffset="100"/>
        <text id="progress-text" x="18" y="21.5" font-size="8" text-anchor="middle" fill="#1f2937" class="dark:fill-white font-semibold">0%</text>
      </svg>
      <span id="status-text" class="text-gray-600 dark:text-gray-300 mt-3 text-sm font-medium">Connecting...</span>
    </div>
  `;
  loadingContainer.classList.remove("hidden");

  // 3. Get references to the animated elements
  const circle = document.getElementById("progress-circle");
  const text = document.getElementById("progress-text");
  const statusText = document.getElementById("status-text");

  // 4. Set up the CSS transition directly in JS for reliability
  circle.style.transition =
    "stroke-dashoffset 1.5s cubic-bezier(0.65, 0, 0.35, 1), stroke 0.6s ease";

  // 5. Helper to animate the circle and text to a target percentage
  const animateTo = (targetPercent, duration, label) => {
    const offset = 100 - targetPercent;
    circle.style.transitionDuration = `${duration / 1000}s`;
    circle.style.strokeDashoffset = offset;

    const startPercent = parseInt(text.textContent) || 0;
    const stepCount = 50;
    const increment = (targetPercent - startPercent) / stepCount;
    let currentStep = 0;

    clearInterval(progressAnimation.textInterval);
    progressAnimation.textInterval = setInterval(() => {
      if (currentStep < stepCount) {
        text.textContent = `${Math.round(
          startPercent + increment * currentStep
        )}%`;
        currentStep++;
      } else {
        text.textContent = `${targetPercent}%`;
        clearInterval(progressAnimation.textInterval);
      }
    }, duration / stepCount);

    if (label) statusText.textContent = label;
  };

  // 6. Run the animation stages
  progressAnimation.stageTimers.push(
    setTimeout(() => animateTo(30, 800, "Requesting file..."), 100)
  );
  progressAnimation.stageTimers.push(
    setTimeout(() => animateTo(85, 4000, "Loading preview..."), 1000)
  );

  // 7. Listen for the iframe to actually finish loading
  iframeElement.addEventListener(
    "load",
    () => {
      progressAnimation.stageTimers.forEach(clearTimeout);
      clearInterval(progressAnimation.textInterval);
      circle.style.stroke = "#10b981";
      animateTo(100, 500, "Complete!");
      setTimeout(onCompletion, 800);
    },
    { once: true }
  );
}

// Function to adjust main margin-bottom based on footer height
function adjustMainMargin() {
  const footer = document.getElementById("footerBottom");
  const main = document.querySelector("main");
  const gap = 4; // Gap in pixels between main and footer

  if (footer && main) {
    if (footer.classList.contains("hidden")) {
      main.style.marginBottom = "0px"; // No margin when footer is hidden
    } else {
      const footerHeight = footer.offsetHeight; // Includes padding, excludes margins
      main.style.marginBottom = `${footerHeight + gap}px`;
    }
  }
}

// Run on DOM load
document.addEventListener("DOMContentLoaded", adjustMainMargin);

// Update on window resize
window.addEventListener("resize", adjustMainMargin);

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  initApp();
  setupEventListeners();
  setupCacheClearInterval();
  setupPinInputListeners();
});

// Updated initApp to check initial content-list state
async function initApp() {
  previewModal.classList.add("hidden");
  const contentList = document.getElementById("content-list");
  const footer = document.getElementById("footerBottom");
  const menuButton = document.getElementById("menu-button");

  if (contentList.querySelector("li.mb-10.ms-6.chat-bubble")) {
    footer.classList.add("hidden");
    footer.style.bottom = "-100px"; // JavaScript fallback
    if (menuButton) menuButton.style.bottom = "28px";
  } else {
    footer.classList.remove("hidden");
    footer.style.bottom = "0px"; // JavaScript fallback
    if (menuButton) menuButton.style.bottom = "80px";
  }
  adjustMainMargin();
  try {
    await loadFolders(ROOT_FOLDER_ID);
  } catch (error) {
    console.error("Error initializing app:", error);
    showErrorMessage(
      foldersList,
      "Failed to load folders. Please refresh the page."
    );
  }
  // Handle any incoming route after folders are ready
  try {
    await handleRoute();
  } catch (e) {
    console.warn("Routing on init failed:", e);
  }
  initializeAnimations();
}

// Setup event listeners
function setupEventListeners() {
  closeModal.addEventListener("click", () => {
    resetPreviewModal();
  });

  previewModal.addEventListener("click", (e) => {
    if (e.target === previewModal) {
      resetPreviewModal();
    }
  });

  printButton.addEventListener("click", printFile);
  downloadButton.addEventListener("click", downloadFile);
  folderSearch.addEventListener("input", (e) =>
    filterFolders(e.target.value.toLowerCase())
  );

  // Scroll handling for content-container
  const contentContainer = document.getElementById("content-container");
  let lastScrollTop = 0;

  contentContainer.addEventListener("scroll", () => {
    const menuButton = document.getElementById("menu-button");
    const currentScrollTop = contentContainer.scrollTop;

    if (currentScrollTop > lastScrollTop) {
      // Scrolling down
      menuButton.classList.add("hidden-right");
      flotingSvg.classList.add("hidden");
    } else {
      // Scrolling up
      menuButton.classList.remove("hidden-right");
      flotingSvg.classList.remove("hidden");
    }
    lastScrollTop = currentScrollTop;
  });
}

// Setup PIN input listeners
function setupPinInputListeners() {
  pinInputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
      const value = e.target.value;
      if (value.length === 1 && index < 3) {
        pinInputs[index + 1].focus();
      }
      incorrectPin.classList.add("hidden"); // Hide error when user starts typing again
      checkPin();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && index > 0) {
        pinInputs[index - 1].focus();
      }
    });
  });
}

function checkPin() {
  const enteredPin = pinInputs.map((input) => input.value).join("");
  if (enteredPin.length !== 4) return;

  if (enteredPin === expectedPin) {
    pinContainer.classList.add("hidden");
    downloadButton.classList.remove("hidden");
    printButton.classList.remove("hidden");
    docPreviewIframe.classList.add("hidden");

    const isSmallScreen = window.innerWidth < 768;
    const fileExtension = previewFilename.textContent
      .split(".")
      .pop()
      .toLowerCase();
    const hasGoogleDocId = !!currentGoogleDocId;

    const onPreviewLoad = () => {
      previewLoading.classList.add("hidden");
      docPreviewIframe.classList.remove("hidden");
    };

    if (fileExtension === "pdf") {
      docPreviewIframe.src = `https://drive.google.com/file/d/${currentFileId}/preview`;
      fileCache[currentFileId] = {
        blob: docPreviewIframe.src,
        mimeType: "application/pdf",
      };
      startProgressAnimation(docPreviewIframe, previewLoading, onPreviewLoad);
    } else if (fileExtension === "doc" || fileExtension === "docx") {
      if (hasGoogleDocId) {
        docPreviewIframe.src = isSmallScreen
          ? `https://drive.google.com/file/d/${
              currentGoogleDocId || currentFileId
            }/preview`
          : `https://docs.google.com/document/d/${
              currentGoogleDocId || currentFileId
            }/preview?tab=t.0`;
        fileCache[currentFileId] = {
          blob: docPreviewIframe.src,
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        };
        startProgressAnimation(docPreviewIframe, previewLoading, onPreviewLoad);
      } else {
        printButton.classList.add("hidden");
        previewError.classList.remove("hidden");
        errorMessage.textContent =
          "Please wait while your file is being downloaded.";
        setTimeout(() => downloadButton.click(), 100);
      }
    }

    pinInputs.forEach((input) =>
      input.classList.replace("border-red-300", "border-gray-300")
    );
  } else {
    incorrectPin.classList.remove("hidden");
    pinInputs.forEach((input) =>
      input.classList.replace("border-gray-300", "border-red-300")
    );
    pinInputs[3].blur();
    setTimeout(() => {
      incorrectPin.classList.add("hidden");
      resetPinInputs();
    }, 500);
  }
}

// Reset PIN inputs
function resetPinInputs() {
  pinInputs.forEach((input) => {
    input.value = "";
    input.classList.remove("border-red-300");
    input.classList.add("border-gray-300");
  });
  pinInputs[0].focus();
}

// Reset preview modal state
function resetPreviewModal() {
  previewModal.classList.add("hidden");
  document.body.classList.remove("no-scroll"); // Re-enable page scrolling
  if (currentPreviewUrl) {
    revokeTemporaryAccess(currentFileId).catch((e) =>
      console.error("Failed to revoke temporary access:", e)
    );
    currentPreviewUrl = null;
  }
  docPreviewIframe.src = "";
  currentFileBlob = null;
  pinContainer.classList.add("hidden");
  incorrectPin.classList.add("hidden");
  downloadButton.classList.remove("hidden");
  printButton.classList.remove("hidden");
  resetPinInputs();
  expectedPin = null;
  currentGoogleDocId = null; // Reset Google Doc ID
}

// Setup daily cache clear interval
function setupCacheClearInterval() {
  setInterval(() => {
    const today = new Date().toDateString();
    if (today !== cacheTimestamp) {
      folderCache = {};
      fileCache = {};
      cacheTimestamp = today;
      console.log("Cache cleared for new day:", today);
    }
  }, 60 * 60 * 1000); // Check every hour
}

// Start polling for updates
function startPolling(folderId, isSubject) {
  if (pollingIntervalId) clearInterval(pollingIntervalId);
  pollingIntervalId = setInterval(async () => {
    try {
      if (isSubject) {
        await updateFiles(folderId);
      } else {
        await updateSubfolders(folderId);
      }
    } catch (error) {
      console.error("Polling error:", error);
    }
  }, POLLING_INTERVAL);
}

// Stop polling
function stopPolling() {
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
}

// Filter folders based on search term
function filterFolders(searchTerm) {
  const folderItems = foldersList.querySelectorAll(".folder-item");
  folderItems.forEach((item) => {
    const folderName = item
      .querySelector(".folder-name")
      .textContent.toLowerCase();
    item.classList.toggle("hidden", !folderName.includes(searchTerm));
  });
}

// Load folders from Database
async function loadFolders(folderId) {
  if (folderCache[folderId]) {
    renderFolders(folderCache[folderId].content);
    return;
  }

  const tbody = foldersList.querySelector("tbody");
  const loadingRow = document.getElementById("loading-folders");

  // Show loading spinner
  loadingRow.classList.remove("hidden");

  try {
    let folders = await fetchFolders(folderId);
    folders = folders.sort((a, b) => a.name.localeCompare(b.name)); // Sort before rendering
    allFolders = folders;
    folderCache[folderId] = { type: "folders", content: folders };
    console.log(`${folders[0]?.name || folderId} folder cached`);
    if (folders.length === 0) {
      tbody.innerHTML = "";
      tbody.innerHTML =
        '<tr><th scope="row" class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">No folders found</th></tr>';
      loadingRow.classList.add("hidden");
    } else {
      renderFolders(folders);
    }
  } catch (error) {
    console.error("Error loading folders:", error);
    tbody.innerHTML = "";
    showErrorMessage(tbody, "Failed to load folders. Please refresh the page.");
    loadingRow.classList.add("hidden");
  }
}

// Render folders in the left pane
function renderFolders(folders) {
  const tbody = foldersList.querySelector("tbody");
  const loadingRow = document.getElementById("loading-folders");

  // Ensure loading spinner is visible
  loadingRow.classList.remove("hidden");

  // Clear tbody but preserve the loading row
  tbody.innerHTML = "";
  tbody.appendChild(loadingRow);

  // Simulate async rendering (replace with actual async operation if needed)
  setTimeout(() => {
    // Clear tbody again to remove loading row before rendering folders
    tbody.innerHTML = "";

    // Render folders
    folders.forEach((folder) => {
      const folderItem = document.createElement("tr");
      folderItem.className =
        "folder-item bg-white border-b dark:bg-gray-800 dark:border-gray-700 border-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer";
      folderItem.dataset.id = folder.id;
      folderItem.dataset.name = folder.name;
      folderItem.innerHTML = `
        <th scope="row" class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">
          <div class="flex items-center">
            <div class="w-12 h-12 bg-white shadow-xl rounded-full flex items-center justify-center mr-3">
              <img src="./Folder_SVG.svg" class="w-8 h-8 shrink-0" alt="Folder Icon"/>
            </div>
            <div class="flex-1">
              <div class="folder-name">${folder.name}</div>
              <div class="text-xs text-gray-500">${
                folder.isSubject ? "Subject" : "Department"
              }</div>
            </div>
          </div>
        </th>
      `;

      folderItem.addEventListener("mouseenter", () => {
        const svg = folderItem.querySelector("svg");
        if (svg) {
          svg.classList.remove("text-gray-500", "dark:text-gray-500");
          svg.classList.add("text-blue-700");
        }
      });

      folderItem.addEventListener("mouseleave", () => {
        const svg = folderItem.querySelector("svg");
        if (svg) {
          svg.classList.remove("text-blue-700");
          svg.classList.add("text-gray-500", "dark:text-gray-500");
        }
      });

      folderItem.addEventListener("click", () =>
        selectFolder(folder.id, folder.name, folder.isSubject)
      );

      tbody.appendChild(folderItem);
    });

    // Ensure loading spinner is hidden after rendering
    loadingRow.classList.add("hidden");

    // Apply highlight if a course is currently selected
    updateSelectedCourseHighlight();
  }, 0); // Delay if needed or remove for synchronous rendering
}

// Highlight the currently selected course in the left pane
function updateSelectedCourseHighlight() {
  const selectedId = currentCourse ? currentCourse.id : null;
  const rows = foldersList.querySelectorAll(".folder-item");
  rows.forEach((row) => {
    const isSelected = !!selectedId && row.dataset.id === selectedId;

    // Elements inside the row
    const cell = row.querySelector("th");
    const avatarWrapper = row.querySelector("div.w-12.h-12");

    // Base hover/background and accent
    if (isSelected) {
      // Row-level accents
      row.classList.add("bg-blue-50", "hover:bg-blue-50", "dark:bg-blue-900");
      row.classList.remove("hover:bg-gray-50", "bg-white");

      // Cell-level left border for clearer accent in tables
      if (cell) {
        cell.classList.add("border-l-4", "border-blue-500");
      }
    } else {
      // Reset row-level accents
      row.classList.remove(
        "bg-blue-50",
        "hover:bg-blue-50",
        "dark:bg-blue-900"
      );
      row.classList.add("hover:bg-gray-50", "bg-white");

      // Remove cell-level left border
      if (cell) {
        cell.classList.remove("border-l-4", "border-blue-500");
      }
    }

    // Emphasize folder name color when selected
    const nameEl = row.querySelector(".folder-name");
    if (nameEl) {
      nameEl.classList.toggle("text-blue-700", isSelected);
      nameEl.classList.toggle("dark:text-blue-300", isSelected);
      nameEl.classList.toggle("font-semibold", isSelected);
    }
  });
}

// Updated selectFolder to handle empty folders
async function selectFolder(folderId, folderName, isSubject) {
  currentFolderId = folderId;
  welcomeMessage.remove();
  contentContainer.classList.remove("hidden");

  if (folderCache[folderId]) {
    emptyFolderMessage.classList.add("hidden");
    contentList.innerHTML = "";
    if (isSubject) {
      currentSubject = folderName;
      subjectHeader.classList.remove("hidden");
      updateBreadcrumb(
        currentCourse ? currentCourse.name : "Courses",
        folderName
      );
      renderFiles(folderCache[folderId].content);
      preloadFiles(folderCache[folderId].content);
      // Keep course highlight when navigating into a subject
      updateSelectedCourseHighlight();
      // Update route hash for subject
      if (currentCourse) {
        const targetHash = `#/course/${currentCourse.id}/subject/${folderId}`;
        if (window.location.hash !== targetHash) {
          isProgrammaticNavigation = true;
          window.location.hash = targetHash;
        }
      }
    } else {
      currentCourse = { id: folderId, name: folderName };
      currentSubject = null;
      subjectHeader.classList.add("hidden");
      renderSubfolders(folderCache[folderId].content);
      // Highlight the selected course in the left pane
      updateSelectedCourseHighlight();
      // Update route hash for course
      const targetHash = `#/course/${folderId}`;
      if (window.location.hash !== targetHash) {
        isProgrammaticNavigation = true;
        window.location.hash = targetHash;
      }
    }
    startPolling(folderId, isSubject);
    return;
  }

  loadingContent.classList.remove("hidden");
  emptyFolderMessage.classList.add("hidden");
  contentList.innerHTML = "";

  try {
    if (isSubject) {
      currentSubject = folderName;
      subjectHeader.classList.remove("hidden");
      updateBreadcrumb(
        currentCourse ? currentCourse.name : "Courses",
        folderName
      );
      await loadFiles(folderId);
      // Maintain left-pane highlight for the current course
      updateSelectedCourseHighlight();
      // Update route hash for subject
      if (currentCourse) {
        const targetHash = `#/course/${currentCourse.id}/subject/${folderId}`;
        if (window.location.hash !== targetHash) {
          isProgrammaticNavigation = true;
          window.location.hash = targetHash;
        }
      }
    } else {
      currentCourse = { id: folderId, name: folderName };
      currentSubject = null;
      subjectHeader.classList.add("hidden");
      await loadSubfolders(folderId);
      // Highlight the selected course in the left pane
      updateSelectedCourseHighlight();
      // Update route hash for course
      const targetHash = `#/course/${folderId}`;
      if (window.location.hash !== targetHash) {
        isProgrammaticNavigation = true;
        window.location.hash = targetHash;
      }
    }
    startPolling(folderId, isSubject);
  } catch (error) {
    console.error("Error loading content:", error);
    showErrorMessage(contentList, "Failed to load content");
    footerBottom.classList.remove("hidden");
    footerBottom.style.bottom = "0px"; // Reset footer
    const menuButton = document.getElementById("menu-button");
    if (menuButton) menuButton.style.bottom = "80px";
    adjustMainMargin();
    stopPolling();
  } finally {
    loadingContent.classList.add("hidden");
  }
}

// Breadcrumb and the search bar
function updateBreadcrumb(courseName, subjectName = null) {
  const breadcrumbList = document.getElementById("breadcrumb-list");
  const searchBarContainer = document.getElementById("search-bar");
  breadcrumbList.innerHTML = "";
  searchBarContainer.innerHTML = "";

  // Course breadcrumb
  const courseLi = document.createElement("li");
  courseLi.className = "inline-flex items-center";
  courseLi.innerHTML = `
      <a href="#/course/${
        currentCourse ? currentCourse.id : ""
      }" class="inline-flex items-center text-sm font-medium text-gray-700 hover:text-blue-800 dark:text-gray-400 dark:hover:text-white">
      <svg class="w-4 h-4 me-2.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 48 48">
        <path
            d="M39.5,43h-9c-1.381,0-2.5-1.119-2.5-2.5v-9c0-1.105-0.895-2-2-2h-4c-1.105,0-2,0.895-2,2v9c0,1.381-1.119,2.5-2.5,2.5h-9	C7.119,43,6,41.881,6,40.5V21.413c0-2.299,1.054-4.471,2.859-5.893L23.071,4.321c0.545-0.428,1.313-0.428,1.857,0L39.142,15.52	C40.947,16.942,42,19.113,42,21.411V40.5C42,41.881,40.881,43,39.5,43z" />
    </svg>
          ${courseName}
      </a>
  `;
  breadcrumbList.appendChild(courseLi);

  // Subject breadcrumb
  if (subjectName) {
    const subjectLi = document.createElement("li");
    subjectLi.innerHTML = `
          <div class="flex items-center">
              <svg class="rtl:rotate-180 w-3 h-3 text-gray-400 mx-1" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 6 10">
                  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 9 4-4-4-4"/>
              </svg>
              <a href="#/course/${
                currentCourse ? currentCourse.id : ""
              }/subject/${
      currentFolderId || ""
    }" class="ms-1 text-sm font-medium text-blue-600 hover:text-blue-800 md:ms-2 dark:text-gray-400 dark:hover:text-white">${subjectName}</a>
          </div>
      `;
    breadcrumbList.appendChild(subjectLi);
  }

  // Dropdown options
  const dropdownOptions = [
    { value: "Experiment No.", display: "File Name" },
    { value: "Roll Number", display: "Name" },
    { value: "File ID", display: "Year" },
    { value: "Time", display: "Date/Time" },
    { value: "Size", display: "File Size" },
    // { value: "File Type", display: "File Type" },
  ];

  // Search bar HTML
  const isMobile = window.innerWidth < 768;
  const searchButtonHtml = isMobile
    ? `<button type="button" id="mobile-search-close" class="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-blue-200 flex items-center justify-center shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300" aria-label="Close search"><svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button>`
    : `<button type="submit" class="absolute top-0 end-0 p-2.5 text-sm font-medium h-full text-blue-600" aria-label="Search">
         <svg class="w-5 h-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
           <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
         </svg>
         <span class="sr-only">Search</span>
       </button>`;

  const searchHtml = `
      <form class="max-w-lg w-full">
          <div class="flex">
              <label for="category-select" class="sr-only">Category</label>
              <div class="relative z-0">
                  <select id="category-select" class="cursor-pointer bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-s-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 ${
                    isMobile ? "truncate-select" : ""
                  }" style="border-top-left-radius: 15px; border-bottom-left-radius: 15px; ${
    isMobile
      ? "width: 70px; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;"
      : ""
  }">
                      <option disabled value="">Select Category</option>
                      ${dropdownOptions
                        .map(
                          (opt) =>
                            `<option class="cursor-pointer" value="${opt.value}">${opt.display}</option>`
                        )
                        .join("")}
                  </select>
              </div>
        <div class="relative w-full">
          <input type="text" id="search-dropdown" class="block p-2.5 pr-12 w-full z-20 text-sm text-gray-900 bg-gray-50 rounded-e-lg border-s-gray-50 border-s-2 border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-s-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:border-blue-500" placeholder="Search files..." required style="border-top-right-radius: 15px; border-bottom-right-radius: 15px;"/>
                  ${searchButtonHtml}
              </div>
          </div>
      </form>
  `;

  // Handle category selection and search
  let selectedCategory = "Experiment No."; // Default category
  let categorySelect, searchInput;

  if (window.innerWidth >= 768) {
    // Larger screens: Append search bar to breadcrumb list
    const searchLi = document.createElement("li");
    searchLi.className = "inline-flex items-center ms-4";
    searchLi.innerHTML = searchHtml;
    breadcrumbList.appendChild(searchLi);
    categorySelect = searchLi.querySelector("#category-select");
    searchInput = searchLi.querySelector("#search-dropdown");
    // Ensure search bar is visible
    searchBarContainer.classList.remove("block");
    searchBarContainer.classList.add("hidden");
  } else {
    // Mobile screens: Append search bar to search-bar container
    searchBarContainer.innerHTML = searchHtml;
    categorySelect = searchBarContainer.querySelector("#category-select");
    searchInput = searchBarContainer.querySelector("#search-dropdown");
  }

  // Set default selected category
  categorySelect.value = selectedCategory;

  // Update selected category on change
  categorySelect.addEventListener("change", (e) => {
    selectedCategory = e.target.value;
    filterFiles(searchInput.value, selectedCategory);
  });

  // Search input handling
  searchInput.addEventListener("input", (e) => {
    filterFiles(e.target.value, selectedCategory);
  });

  // Prevent form submission and trigger search
  const searchForm = categorySelect.closest("form");
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    filterFiles(searchInput.value, selectedCategory);
  });

  // Search toggle for mobile
  if (window.innerWidth < 768) {
    const searchToggle = document.getElementById("search-toggle");
    const breadcrumbNav = document.querySelector("#subject-header nav");

    const closeSearchBar = () => {
      searchBarContainer.classList.add("hidden");
      searchBarContainer.classList.remove("block");
      breadcrumbNav.classList.remove("hidden");
      searchToggle.classList.remove("hidden");
    };

    searchToggle.addEventListener("click", () => {
      searchBarContainer.classList.add("block");
      searchBarContainer.classList.remove("hidden");
      breadcrumbNav.classList.add("hidden");
      searchToggle.classList.add("hidden");
      searchInput.focus();
    });

    // Close search bar on outside click
    document.addEventListener("click", (e) => {
      if (
        !searchBarContainer.contains(e.target) &&
        !searchToggle.contains(e.target)
      ) {
        closeSearchBar();
      }
    });

    // Wire up mobile close button inside the input on mobile
    const mobileCloseBtn = searchBarContainer.querySelector(
      "#mobile-search-close"
    );
    if (mobileCloseBtn) {
      mobileCloseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeSearchBar();
      });
    }
  }
}

// ------------------------
// Simple Hash Router
// Routes:
//   #/course/:courseId
//   #/course/:courseId/subject/:subjectId
// Note: Breadcrumbs always display original names; routes carry IDs
// ------------------------
function parseRoute() {
  const hash = window.location.hash || "";
  if (!hash || hash === "#" || hash === "#/") return { route: "home" };
  if (hash === "#search" || hash.startsWith("#search"))
    return { route: "search" };
  if (!hash.startsWith("#/")) return { route: "unknown" };
  const parts = hash.slice(2).split("/"); // remove '#/'
  if (parts[0] === "course" && parts[1]) {
    const courseId = decodeURIComponent(parts[1]);
    if (parts[2] === "subject" && parts[3]) {
      const subjectId = decodeURIComponent(parts[3]);
      return { route: "subject", courseId, subjectId };
    }
    return { route: "course", courseId };
  }
  return { route: "unknown" };
}

async function ensureRootFoldersLoaded() {
  // If allFolders isn't populated, load root folders
  if (!Array.isArray(allFolders) || allFolders.length === 0) {
    await loadFolders(ROOT_FOLDER_ID);
  }
}

async function handleRoute() {
  // Prevent reacting to our own hash set immediately
  if (isProgrammaticNavigation) {
    // Let the UI update and then clear the flag
    isProgrammaticNavigation = false;
    return;
  }
  const route = parseRoute();
  if (route.route === "home" || route.route === "search") return; // no-op

  await ensureRootFoldersLoaded();

  if (route.route === "course") {
    const course = allFolders.find((f) => f.id === route.courseId);
    if (course) {
      await selectFolder(course.id, course.name, false);
    } else {
      console.warn("Course not found for id:", route.courseId);
    }
  } else if (route.route === "subject") {
    const course = allFolders.find((f) => f.id === route.courseId);
    if (!course) {
      console.warn("Course not found for id:", route.courseId);
      return;
    }
    // First navigate to course to set context
    await selectFolder(course.id, course.name, false);
    // Ensure subfolders are available to retrieve subject name
    let subfolders;
    if (folderCache[course.id]?.type === "folders") {
      subfolders = folderCache[course.id].content;
    } else {
      subfolders = await fetchFolders(course.id);
      folderCache[course.id] = { type: "folders", content: subfolders };
    }
    const subject = subfolders.find((s) => s.id === route.subjectId);
    if (subject) {
      await selectFolder(subject.id, subject.name, true);
    } else {
      console.warn("Subject not found for id:", route.subjectId);
    }
  }
}

// React to user navigation via hash changes
window.addEventListener("hashchange", () => {
  // Ignore the special mobile search hash, it's handled elsewhere
  if (
    window.location.hash === "#search" ||
    window.location.hash.startsWith("#search")
  )
    return;
  handleRoute().catch((e) => console.error("Route error:", e));
});

// Updated filterFiles to handle new class names
function filterFiles(searchTerm, category) {
  const searchValue = searchTerm.toLowerCase();
  const fileItems = contentList.querySelectorAll(".chat-bubble");

  fileItems.forEach((item) => {
    let textToSearch = "";
    switch (category) {
      case "Roll Number":
        textToSearch = item.querySelector("h4").textContent.toLowerCase();
        break;
      case "File ID":
        textToSearch = item
          .querySelector(".file-year")
          .textContent.toLowerCase();
        break;
      case "Experiment No.":
        textToSearch = item
          .querySelector(".file-exam-semester")
          .textContent.toLowerCase();
        break;
      case "Time":
        textToSearch = item.querySelector("time").textContent.toLowerCase();
        break;
      case "Size":
        textToSearch = item
          .querySelector(".file-size")
          .textContent.toLowerCase();
        break;
      case "File Type":
        textToSearch = item
          .querySelector(".file-type")
          .textContent.toLowerCase();
        break;
    }
    item.style.display = textToSearch.includes(searchValue) ? "" : "none";
  });
}

// Load subfolders for a course folder
async function loadSubfolders(folderId) {
  let subfolders = await fetchFolders(folderId);
  subfolders = subfolders.sort((a, b) => a.name.localeCompare(b.name)); // Sort before caching/rendering
  folderCache[folderId] = { type: "folders", content: subfolders };
  if (subfolders.length === 0) {
    emptyFolderMessage.classList.remove("hidden");
  } else {
    emptyFolderMessage.classList.add("hidden");
    renderSubfolders(subfolders);
  }
}

// Update subfolders automatically
async function updateSubfolders(folderId) {
  if (currentFolderId !== folderId) return;
  let subfolders = await fetchFolders(folderId);
  subfolders = subfolders.sort((a, b) => a.name.localeCompare(b.name)); // Sort before comparison
  const cached = folderCache[folderId];
  if (JSON.stringify(cached.content) !== JSON.stringify(subfolders)) {
    folderCache[folderId] = { type: "folders", content: subfolders };
    console.log(`${currentCourse?.name || folderId} folder cached`);
    if (subfolders.length === 0) {
      emptyFolderMessage.classList.remove("hidden");
      contentList.innerHTML = "";
    } else {
      emptyFolderMessage.classList.add("hidden");
      renderSubfolders(subfolders);
    }
  }
}

// Render subfolders in the right pane
function renderSubfolders(subfolders) {
  contentList.classList.remove("pl-4");

  contentList.innerHTML = `
    <div class="p-5 border border-gray-100 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 shadow-xl dynamic-div-height">
    <time class="text-lg font-semibold text-gray-900 dark:text-white"></time>
    <form class="max-w-md mx-auto mb-3 sticky top-0 z-10">
        <label for="subject-search" class="mb-2 text-sm font-medium text-gray-900 sr-only dark:text-white">Search</label>
        <div class="relative">
            <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
                <svg class="w-5 h-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
  <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
</svg>
            </div>
            <input type="text" id="subject-search" class="block w-full p-2 ps-10 text-sm text-gray-900 border border-gray-300 rounded-lg bg-gray-50 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500" placeholder="Search Semester..." required style="border-radius: 15px;"/>
        </div>
    </form>
    <ol class="mt-3 divide-y divide-y-gray-200 dark:divide-gray-700 overflow-y-auto dynamic-ol-height"></ol>
</div>
  `;
  const ol = contentList.querySelector("ol");
  subfolders.forEach((folder) => {
    const subfolderItem = document.createElement("li");
    subfolderItem.innerHTML = `<a href="#" class="flex items-center p-2 bg-gray-100 hover:bg-blue-600 transform scale-95 transition duration-300 ease-in-out hover:scale-100 group" style="
    border-radius: 40px;
    margin-top: 5px;
    margin-bottom: 5px;
    margin-right: 7px;">
        <div class="w-12 h-12 bg-white shadow-xl rounded-full flex-shrink-0 mr-3">
          <img class="w-8 h-8 flex items-center justify-center" src="./Folder_SVG.svg" alt="Folder Icon" style="margin-top: 8px; margin-left: 8px;"/>
        </div>
        <div class="text-base font-normal text-gray-600 dark:text-gray-400 sm:flex-1">
          <span class="font-medium text-gray-900 dark:text-white group-hover:text-gray-200">${folder.name}</span>
        </div>
        <svg class="w-6 h-6 text-gray-800 dark:text-white ml-auto sm:ml-3 group-hover:text-gray-200" aria-hidden="true"
             xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 12H5m14 0-4 4m4-4-4-4" />
        </svg>
      </a>`;
    subfolderItem.querySelector("a").addEventListener("click", (e) => {
      e.preventDefault();
      selectFolder(folder.id, folder.name, true);
    });
    ol.appendChild(subfolderItem);
  });

  footerBottom.classList.remove("hidden");
  footerBottom.style.bottom = "0px"; // Reset footer
  const menuButton = document.getElementById("menu-button");
  if (menuButton) {
    menuButton.style.bottom = "80px";
    menuButton.classList.remove("hidden-right");
    flotingSvg.classList.remove("hidden");
  }
  adjustMainMargin();

  let lastOlScrollTop = 0;
  ol.addEventListener("scroll", () => {
    const menuButton = document.getElementById("menu-button");
    const currentOlScrollTop = ol.scrollTop;
    if (currentOlScrollTop > lastOlScrollTop) {
      menuButton.classList.add("hidden-right");
      flotingSvg.classList.add("hidden");
    } else {
      menuButton.classList.remove("hidden-right");
      flotingSvg.classList.remove("hidden");
    }
    lastOlScrollTop = currentOlScrollTop;
  });

  document.getElementById("subject-search").addEventListener("input", (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const subjectItems = contentList.querySelectorAll("li");
    subjectItems.forEach((item) => {
      const subjectName = item.querySelector("span").textContent.toLowerCase();
      item.style.display = subjectName.includes(searchTerm) ? "" : "none";
    });
  });
}

// Load files for a subject folder
async function loadFiles(folderId) {
  let files = await fetchFiles(folderId);
  files = files.sort((a, b) => {
    const rollA = a.rollNumber || "Unknown";
    const rollB = b.rollNumber || "Unknown";
    return rollA.localeCompare(rollB, undefined, { numeric: true });
  }); // Sort before caching/rendering
  folderCache[folderId] = { type: "files", content: files };
  console.log(`${currentSubject || folderId} folder cached`);
  if (files.length === 0) {
    emptyFolderMessage.classList.remove("hidden");
  } else {
    emptyFolderMessage.classList.add("hidden");
    renderFiles(files);
    preloadFiles(files);
  }
}

// Preload files into fileCache
async function preloadFiles(files) {
  for (const file of files) {
    if (!fileCache[file.id]) {
      const fileExtension = file.name.split(".").pop().toLowerCase();
      if (["pdf", "doc", "docx"].includes(fileExtension)) {
        try {
          const content = await fetchFileContent(file.id);
          if (content) {
            const blob = `data:${file.mimeType};base64,${content}`;
            fileCache[file.id] = { blob, mimeType: file.mimeType };
            console.log(`${file.name} cached`);
          }
        } catch (error) {
          console.error(`Error preloading file ${file.id}:`, error);
        }
      }
    }
  }
}

// Update files automatically
async function updateFiles(folderId) {
  if (currentFolderId !== folderId) return;
  let files = await fetchFiles(folderId);
  files = files.sort((a, b) => {
    const rollA = a.rollNumber || "Unknown";
    const rollB = b.rollNumber || "Unknown";
    return rollA.localeCompare(rollB, undefined, { numeric: true });
  }); // Sort before comparison
  const cached = folderCache[folderId];
  if (JSON.stringify(cached.content) !== JSON.stringify(files)) {
    folderCache[folderId] = { type: "files", content: files };
    console.log(`${currentSubject || folderId} folder cached`);
    if (files.length === 0) {
      emptyFolderMessage.classList.remove("hidden");
      contentList.innerHTML = "";
    } else {
      emptyFolderMessage.classList.add("hidden");
      renderFiles(files);
      preloadFiles(files);
    }
  }
}

// Updated renderFiles to handle new exam type format
function renderFiles(files) {
  contentList.innerHTML = `
    <ol class="relative"></ol>
  `;
  const ol = contentList.querySelector("ol");

  function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    const day = date.getDate().toString().padStart(2, "0");
    const monthNames = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
  }

  function generateGradient(name) {
    const colorGroups = {
      warm: [
        "#dc2626",
        "#ea580c",
        "#d97706",
        "#ca8a04",
        "#f59e0b",
        "#fbbf24",
        "#facc15",
        "#ef4444",
        "#f97316",
        "#fb923c",
      ],
      cool: [
        "#0891b2",
        "#0d9488",
        "#059669",
        "#16a34a",
        "#2563eb",
        "#4f46e5",
        "#7c3aed",
        "#06b6d4",
        "#14b8a6",
        "#10b981",
      ],
      vibrant: [
        "#ec4899",
        "#be185d",
        "#e11d48",
        "#f43f5e",
        "#fb7185",
        "#f472b6",
        "#ff006e",
        "#fb8500",
        "#ffbe0b",
        "#8338ec",
      ],
      electric: [
        "#8b5cf6",
        "#9333ea",
        "#a855f7",
        "#c084fc",
        "#6366f1",
        "#3b82f6",
        "#7c3aed",
        "#5b21b6",
        "#6d28d9",
        "#581c87",
      ],
      nature: [
        "#65a30d",
        "#84cc16",
        "#22c55e",
        "#10b981",
        "#14b8a6",
        "#06d6a0",
        "#059669",
        "#047857",
        "#065f46",
        "#064e3b",
      ],
      sunset: [
        "#f97316",
        "#fb923c",
        "#f87171",
        "#60a5fa",
        "#0ea5e9",
        "#06b6d4",
        "#ff7c7c",
        "#ff9f43",
        "#ffc93c",
        "#06d6a0",
      ],
    };

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      const char = name.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    const absHash = Math.abs(hash);
    const groupNames = Object.keys(colorGroups);
    const selectedGroup = groupNames[absHash % groupNames.length];
    const colors = colorGroups[selectedGroup];

    // Select 3 colors for richer gradients
    const color1 = colors[absHash % colors.length];
    const color2 = colors[(absHash + 3) % colors.length];
    const color3 = colors[(absHash + 6) % colors.length];

    // Dynamic positioning
    const angle = absHash % 360;
    const centerX = 25 + (absHash % 50);
    const centerY = 25 + ((absHash * 7) % 50);

    // Improved mesh pattern
    return [
      `conic-gradient(from ${angle}deg at ${centerX}% ${centerY}%, ${color1}95, ${color2}90, ${color3}85, ${color1}95)`,
      `radial-gradient(ellipse 140% 110% at 20% 80%, ${color2}75, transparent 60%)`,
      `radial-gradient(ellipse 120% 140% at 80% 20%, ${color1}70, transparent 65%)`,
      `radial-gradient(ellipse 90% 90% at 70% 70%, ${color3}50, transparent 80%)`,
      `radial-gradient(ellipse 70% 70% at 30% 30%, ${color1}40, transparent 85%)`,
      `linear-gradient(${
        angle + 45
      }deg, ${color1}10, transparent 50%, ${color2}15)`,
    ].join(", ");
  }

  files.forEach((file) => {
    const fileExtension =
      file.extension || file.name.split(".").pop().toLowerCase();
    const uploaderName = file.uploaderName || "Unknown";
    const year = file.year || "Unknown";
    // Format examTypeAndSemester, keeping Resources_* intact
    const examTypeAndSemester = file.examType.startsWith("Resources_")
      ? `${file.examType}_${file.semester}`
      : `${file.examType}_${file.semester}`;
    const time = file.lastUpdated
      ? formatDateTime(file.lastUpdated)
      : "Unknown";
    const size = file.size || "Unknown";
    const fileType = file.googleDocId
      ? "G DOC"
      : (file.extension || "Unknown").toUpperCase();

    // Generate unique gradient for this user's avatar background
    const userGradient = generateGradient(uploaderName);

    // Create avatar with gradient background
    const avatarWithGradient = `
      <div class="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-lg" 
           style="background-image: ${userGradient};">
        ${uploaderName.charAt(0).toUpperCase()}
      </div>
    `;

    // Create status indicator with same gradient
    const statusIndicator = `
      <div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 border border-white dark:border-gray-700 rounded-full" 
           style="background-image: ${userGradient};">
      </div>
    `;

    const isMobile = window.innerWidth < 768;
    const sizeInPixel = isMobile ? 35 : 40;

    const pdfIcon = `<img style="height: ${sizeInPixel}px; width: ${sizeInPixel}px;" src="./PDF_icon.svg" alt="PDF Icon" />`;
    const docIcon = `<img src="./MsWord_SVG.svg" class="w-7 h-7 shrink-0 ${
      window.innerWidth < 768 ? "md:w-7 md:h-7" : ""
    }" alt="Document Icon" />`;
    const googleDocIcon = `<img src="./GoogleDoc_SVG.svg" class="w-7 h-7 shrink-0 ${
      window.innerWidth < 768 ? "md:w-7 md:h-7" : ""
    }" alt="Document Icon" />`;

    const hasGoogleDocId = !!file.googleDocId;
    const icon =
      fileType === "PDF" ? pdfIcon : hasGoogleDocId ? googleDocIcon : docIcon;
    const displaySize = hasGoogleDocId ? "Uploaded Through Link" : size;

    const chatBubble = document.createElement("li");
    chatBubble.className = "mb-10 chat-bubble";
    chatBubble.innerHTML = `      
      <!-- Profile Section -->
      <div class="mb-3 flex items-center gap-3">
        <div class="relative">
          ${avatarWithGradient}
          ${statusIndicator}
        </div>
        <div class="flex-1">
          <p class="text-xs text-gray-500 dark:text-gray-400">Uploaded By</p>
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white">${uploaderName}</h4>
        </div>
      </div>

      <!-- Chat Bubble Content -->
      <div class="p-4 ms-8 bg-white border border-gray-200 rounded-lg shadow-lg dark:bg-gray-700 dark:border-gray-600 cursor-pointer relative group min-h-fit" style="border-radius: 35px;">
        <div class="items-center justify-between mb-3 sm:flex">
          <time class="mb-1 text-xs font-normal text-gray-400 sm:order-last sm:mb-0">
            <span class="bg-blue-100 text-blue-800 text-xs font-medium inline-flex items-center px-2.5 py-0.5 rounded-sm dark:bg-gray-700 dark:text-blue-400 border border-blue-400" style="border-radius: 30px;">
              <svg class="w-2.5 h-2.5 me-1.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 0a10 10 0 1 0 10 10A10.011 10.011 0 0 0 10 0Zm3.982 13.982a1 1 0 0 1-1.414 0l-3.274-3.274A1.012 1.012 0 0 1 9 10V6a1 1 0 0 1 2 0v3.586l2.982 2.982a1 1 0 0 1 0 1.414Z"/>
              </svg>
              ${time}
            </span>
          </time>
          <div class="text-sm font-normal text-gray-500 dark:text-gray-300 ${
            window.innerWidth < 768 ? "pt-3" : ""
          }">
            <a href="#" class="file-year font-semibold text-gray-900 dark:text-white">${year}</a>
          </div>
        </div>
        <div class="p-3 mb-2 text-xs italic font-normal text-gray-500 border border-gray-200 rounded-lg bg-gray-50 dark:bg-gray-600 dark:border-gray-500 dark:text-gray-300 min-h-fit" style="border-radius: 30px;">
          <div class="flex items-start gap-2.5">
            <div class="flex flex-col gap-2.5">
              <div class="leading-1.5 flex w-full ${
                window.innerWidth < 768 ? "max-w-xs" : "max-w-md"
              } flex-col">
                <div class="flex items-start bg-gray-50 dark:bg-gray-700 rounded-xl p-2 h-auto w-full md:w-auto" style="border-radius: 15px;">
                  <div class="me-2 flex-1">
                    <span class="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white pb-2 flex-wrap">
                      ${icon}
                      <span class="file-exam-semester break-all">${examTypeAndSemester}</span>
                    </span>
                    <span class="flex text-xs font-normal text-gray-500 dark:text-gray-400 gap-2 flex-wrap">
                      <span class="file-size">${displaySize}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="self-center" width="3" height="4" viewBox="0 0 3 4" fill="none">
                        <circle cx="1.5" cy="2" r="1.5" fill="#6B7280"></circle>
                      </svg>
                      <span class="file-type">${fileType}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <button class="absolute top-2 right-2 hidden group-hover:block text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200" onclick="downloadFileFromGDrive('${
              file.id
            }', '${file.course}_${file.examType}_${file.semester}(${
      file.year
    }).${file.extension}')">
              <svg class="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 15v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 4v12m0 0-4-4m4 4 4-4"/>
              </svg>
            </button>
          </div>
        </div>
      </div>`;

    chatBubble.querySelector("a").addEventListener("click", (e) => {
      e.preventDefault();
      openFilePreview(file);
    });
    chatBubble.addEventListener("click", (e) => {
      if (!e.target.closest("a")) {
        openFilePreview(file);
      }
    });
    ol.appendChild(chatBubble);
  });

  footerBottom.classList.add("hidden");
  footerBottom.style.bottom = "-100px";
  const menuButton = document.getElementById("menu-button");
  // if (menuButton) menuButton.style.bottom = "28px";
  if (menuButton) {
    menuButton.style.bottom = "28px";
    menuButton.classList.remove("hidden-right");
    flotingSvg.classList.remove("hidden");
  }
  adjustMainMargin();
}

// Updated openFilePreview function using the reusable animation helper
async function openFilePreview(file) {
  try {
    // 1.Initial UI and Data Setup
    currentFileId = file.id;
    const fileExtension =
      file.extension || file.name.split(".").pop().toLowerCase();
    const displayName = file.examType.startsWith("Resources_")
      ? `${file.course}_${file.examType}_${file.semester}(${file.year}).${fileExtension}`
      : `${file.course}_${file.examType}_${file.semester}(${file.year}).${fileExtension}`;

    expectedPin = null;
    currentGoogleDocId = file.googleDocId || null;
    currentFileBlob = null;
    docPreviewIframe.src = ""; // Clear previous content

    // Set up the modal state
    previewFilename.textContent = displayName;
    previewModal.classList.remove("hidden");
    document.body.classList.add("no-scroll");

    // Hide all content containers initially
    pdfContainer.classList.add("hidden");
    docxContainer.classList.add("hidden");
    docPreviewIframe.classList.add("hidden");
    previewError.classList.add("hidden");
    pinContainer.classList.add("hidden");

    // 2.Determine File Source and Handle Special Cases
    const isSmallScreen = window.innerWidth < 768;
    const hasGoogleDocId = !!file.googleDocId;
    let iframeSrc = null;
    let mimeType = null;

    if (fileExtension === "pdf") {
      iframeSrc = `https://drive.google.com/file/d/${file.id}/preview`;
      mimeType = "application/pdf";
      printButton.classList.add("hidden"); // PDFs are not directly printable from preview
    } else if (fileExtension === "doc" || fileExtension === "docx") {
      if (hasGoogleDocId) {
        iframeSrc = isSmallScreen
          ? `https://drive.google.com/file/d/${
              file.googleDocId || file.id
            }/preview`
          : `https://docs.google.com/document/d/${
              file.googleDocId || file.id
            }/preview?tab=t.0`;
        mimeType =
          fileExtension === "doc"
            ? "application/msword"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        printButton.classList.remove("hidden");
      } else {
        // This is a special case: a DOCX without a preview ID. Force download.
        previewError.classList.remove("hidden");
        errorMessage.textContent =
          "Please wait while your file is being downloaded.";
        setTimeout(() => downloadButton.click(), 100);
        return; // Stop further execution
      }
    } else {
      showPreviewError("Unsupported file type");
      return; // Stop further execution
    }

    // 3.Initiate Loading with Animation
    docPreviewIframe.src = iframeSrc;

    // Update cache if the item is not already there
    if (!fileCache[file.id]) {
      fileCache[file.id] = { blob: iframeSrc, mimeType: mimeType };
      console.log(`${displayName} cached`);
    }

    // Define what happens after the preview successfully loads and animation completes
    const onPreviewLoad = () => {
      previewLoading.classList.add("hidden");
      docPreviewIframe.classList.remove("hidden");
    };

    // Kick off animation!
    startProgressAnimation(docPreviewIframe, previewLoading, onPreviewLoad);
  } catch (error) {
    console.error("Error opening file preview:", error);
    showPreviewError("Error loading file");
  }
}

// Preview DOC/DOCX file using Google Docs preview
async function previewDocFile(file, googleDocId = null, isMobile = false) {
  try {
    const docId = googleDocId || file.id;
    docPreviewIframe.src = `https://docs.google.com/document/d/${docId}/preview?tab=t.0${
      isMobile ? "&mobilebasic=0&hl=en" : ""
    }`;
    fileCache[file.id] = {
      blob: docPreviewIframe.src,
      mimeType: file.mimeType,
    };
    console.log(`${file.name} cached`);
    docPreviewIframe.addEventListener(
      "load",
      () => {
        previewLoading.classList.add("hidden");
        if (!expectedPin && !isMobile) {
          docPreviewIframe.classList.remove("hidden");
        } else if (isMobile && !expectedPin) {
          previewError.classList.remove("hidden");
          errorMessage.innerHTML =
            'File preview not available on mobile. Use the <svg class="inline-block w-5 h-5 text-gray-800 group-hover:text-blue-700 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 24 24"> <path fill-rule="evenodd" d="M8 3a2 2 0 0 0-2 2v3h12V5a2 2 0 0 0-2-2H8Zm-3 7a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1v-4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v4h1a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H5Zm4 11a1 1 0 0 1-1-1v-4h8v4a1 1 0 0 1-1 1H9Z" clip-rule="evenodd"></path> </svg> button to preview the file.';
          docPreviewIframe.classList.add("hidden");
          printButton.click(); // Auto-trigger print only if no PIN
        }
      },
      { once: true }
    );
  } catch (error) {
    console.error("Error previewing DOC file:", error);
    showPreviewError("Error loading document");
  }
}

async function previewPdfFile(file) {
  try {
    docPreviewIframe.src = `https://drive.google.com/file/d/${file.id}/preview`;
    fileCache[file.id] = {
      blob: docPreviewIframe.src,
      mimeType: "application/pdf",
    };
    console.log(`${file.name} cached`);

    // Define what to do when the preview is fully loaded and animated
    const onPreviewLoad = () => {
      previewLoading.classList.add("hidden");
      if (!expectedPin) {
        docPreviewIframe.classList.remove("hidden");
      }
    };

    // Kick off the animation
    startProgressAnimation(docPreviewIframe, previewLoading, onPreviewLoad);
  } catch (error) {
    console.error("Error previewing PDF:", error);
    showPreviewError("Error loading PDF");
  }
}

// Show preview error
function showPreviewError(message) {
  previewLoading.classList.add("hidden");
  previewError.classList.remove("hidden");
  errorMessage.textContent = message || "Unable to preview file";
}

// Print the current file
async function printFile() {
  const fileExtension = previewFilename.textContent
    .split(".")
    .pop()
    .toLowerCase();
  if (fileExtension === "doc" || fileExtension === "docx") {
    if (!currentFileId && !currentGoogleDocId) {
      console.error("Print failed: no file ID or Google Doc ID is set");
      alert("Please wait for the document to load before printing");
      return;
    }

    const fileIdToUse = currentGoogleDocId || currentFileId; // Prefer Google Doc ID if available
    const printUrl = `https://docs.google.com/document/d/${fileIdToUse}/preview?tab=t.0`;
    const printWindow = window.open(printUrl, "_blank");
    if (!printWindow) {
      alert("Please allow pop-ups to print the document");
      return;
    }

    printWindow.addEventListener(
      "load",
      () => {
        setTimeout(() => {
          try {
            printWindow.focus();
            printWindow.print();
            printWindow.close();
          } catch (e) {
            console.error("Error during print operation:", e);
            alert(
              "Failed to print document. Please try printing manually from the preview."
            );
          }
        }, 2000);
      },
      { once: true }
    );

    setTimeout(() => {
      if (printWindow.document.readyState !== "complete") {
        alert(
          "Failed to load document for printing. Please try printing manually."
        );
        printWindow.close();
      }
    }, 10000);
  } else {
    alert("Printing is not supported for this file type");
  }
}

// Download the current file
async function downloadFile() {
  // Store the original button content
  const originalButtonContent = downloadButton.innerHTML;

  // Show spinner
  downloadButton.innerHTML = `
    <div role="status">
      <svg aria-hidden="true" class="w-6 h-6 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor"/>
        <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill"/>
      </svg>
      <span class="sr-only">Loading...</span>
    </div>
  `;
  downloadButton.disabled = true; // Disable button to prevent multiple clicks

  try {
    const fileExtension = previewFilename.textContent
      .split(".")
      .pop()
      .toLowerCase();
    let downloadUrl;

    if (
      currentGoogleDocId &&
      (fileExtension === "doc" || fileExtension === "docx")
    ) {
      // Use Google Doc ID for DOC/DOCX files with Google Doc ID
      downloadUrl = `https://docs.google.com/document/d/${currentGoogleDocId}/export?format=docx`;
    } else if (currentFileId) {
      // Use Google Drive direct download for PDFs or DOC/DOCX without Google Doc ID
      downloadUrl = `https://drive.usercontent.google.com/download?id=${currentFileId}&export=download`;
    } else {
      throw new Error("No valid file ID or Google Doc ID available");
    }

    // Create a download link with renamed file
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = previewFilename.textContent; // e.g., "course_examType_semester(year).extension"
    document.body.appendChild(downloadLink);

    // Trigger download and wait briefly to ensure browser initiates it
    downloadLink.click();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Short delay to approximate download start
    document.body.removeChild(downloadLink);

    // Show checkmark with animation
    downloadButton.innerHTML = `
      <svg fill="#259d49" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 342.508 342.508" xml:space="preserve" stroke="#259d49" class="w-6 h-6 animate-checkmark">
        <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
        <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
        <g id="SVGRepo_iconCarrier">
          <g>
            <path d="M171.254,0C76.837,0,0.003,76.819,0.003,171.248c0,94.428,76.829,171.26,171.251,171.26 c94.438,0,171.251-76.826,171.251-171.26C342.505,76.819,265.697,0,171.254,0z M245.371,136.161l-89.69,89.69 c-2.693,2.69-6.242,4.048-9.758,4.048c-3.543,0-7.059-1.357-9.761-4.048l-39.007-39.007c-5.393-5.398-5.393-14.129,0-19.521 c5.392-5.392,14.123-5.392,19.516,0l29.252,29.262l79.944-79.948c5.381-5.386,14.111-5.386,19.504,0 C250.764,122.038,250.764,130.769,245.371,136.161z"></path>
          </g>
        </g>
      </svg>
      <style>
        @keyframes checkmark {
          0% { opacity: 0; transform: scale(0); }
          50% { opacity: 1; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
        .animate-checkmark {
          animation: checkmark 0.3s ease-in-out forwards;
        }
      </style>
    `;
    setTimeout(() => {
      // Restore original button content with fade-in effect
      downloadButton.innerHTML = `
        <div style="opacity: 0; transition: opacity 0.3s ease-in-out;">
          ${originalButtonContent}
        </div>
      `;
      setTimeout(() => {
        downloadButton.querySelector("div").style.opacity = "1";
      }, 50);
    }, 1000); // Show checkmark for 1000ms
  } catch (error) {
    console.error("Error initiating download:", error);
    alert("Failed to initiate download. Please try again.");
  } finally {
    // Ensure button is re-enabled
    downloadButton.disabled = false;
  }
}

// Download a file from Google Drive
async function downloadFileFromGDrive(fileId, fileName) {
  // Store the original button content
  const originalButtonContent = downloadButton.innerHTML;

  // Show spinner
  downloadButton.innerHTML = `
    <div role="status">
      <svg aria-hidden="true" class="w-6 h-6 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor"/>
        <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill"/>
      </svg>
      <span class="sr-only">Loading...</span>
    </div>
  `;
  downloadButton.disabled = true; // Disable button to prevent multiple clicks

  try {
    const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);

    // Trigger download and wait briefly to ensure browser initiates it
    downloadLink.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    document.body.removeChild(downloadLink);

    // Show checkmark with animation
    downloadButton.innerHTML = `
      <svg fill="#259d49" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 342.508 342.508" xml:space="preserve" stroke="#259d49" class="w-6 h-6 animate-checkmark">
        <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
        <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
        <g id="SVGRepo_iconCarrier">
          <g>
            <path d="M171.254,0C76.837,0,0.003,76.819,0.003,171.248c0,94.428,76.829,171.26,171.251,171.26 c94.438,0,171.251-76.826,171.251-171.26C342.505,76.819,265.697,0,171.254,0z M245.371,136.161l-89.69,89.69 c-2.693,2.69-6.242,4.048-9.758,4.048c-3.543,0-7.059-1.357-9.761-4.048l-39.007-39.007c-5.393-5.398-5.393-14.129,0-19.521 c5.392-5.392,14.123-5.392,19.516,0l29.252,29.262l79.944-79.948c5.381-5.386,14.111-5.386,19.504,0 C250.764,122.038,250.764,130.769,245.371,136.161z"></path>
          </g>
        </g>
      </svg>
      <style>
        @keyframes checkmark {
          0% { opacity: 0; transform: scale(0); }
          50% { opacity: 1; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
        .animate-checkmark {
          animation: checkmark 0.3s ease-in-out forwards;
        }
      </style>
    `;
    setTimeout(() => {
      // Restore original button content with fade-in effect
      downloadButton.innerHTML = `
        <div style="opacity: 0; transition: opacity 0.3s ease-in-out;">
          ${originalButtonContent}
        </div>
      `;
      setTimeout(() => {
        downloadButton.querySelector("div").style.opacity = "1";
      }, 50);
    }, 3000); // Show checkmark for 3000ms
  } catch (error) {
    console.error("Error initiating download:", error);
    alert("Failed to initiate download. Please try again.");
  } finally {
    // Ensure button is re-enabled
    downloadButton.disabled = false;
  }
}

// Show error message in a container
function showErrorMessage(container, message) {
  container.innerHTML = `
    <div class="p-4 text-center">
      <i class="fas fa-exclamation-circle text-red-500 text-2xl mb-2"></i>
      <p class="text-gray-700">${message}</p>
    </div>
  `;
}

// API functions to communicate with Google Apps Script
async function fetchFolders(folderId) {
  try {
    const response = await fetch(
      `${SCRIPT_URL}?action=getFolders&folderId=${folderId}`
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.folders || [];
  } catch (error) {
    console.error("Error fetching folders:", error);
    throw error;
  }
}

// Updated fetchFiles to parse filename components
async function fetchFiles(folderId) {
  try {
    const response = await fetch(
      `${SCRIPT_URL}?action=getFiles&folderId=${folderId}`
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    // Parse filenames and extract components
    const parsedFiles = data.files.map((file) => {
      // Updated regex to handle both new and existing filename patterns
      const filePattern =
        /^([A-Za-z&]+)_((?:ISE\s*\d|ESE|Combined|Resources_[^_]+|[^_]+))_SEM\s*(\d)\s*(?:\(([A-Za-z]+)\))?<(\d{4}-\d{2})>(?:\{([A-Za-z0-9_-]+)\})?\.([a-zA-Z]+)/;
      const match = file.name.match(filePattern);
      if (match) {
        const [
          ,
          course,
          examType,
          semester,
          uploaderName,
          year,
          googleDocId,
          extension,
        ] = match;
        return {
          ...file,
          course,
          examType: examType.trim(),
          semester: `SEM${semester}`,
          uploaderName,
          year,
          googleDocId,
          extension,
        };
      }
      return {
        ...file,
        course: "Unknown",
        examType: "Unknown",
        semester: "Unknown",
        uploaderName: "Unknown",
        year: "Unknown",
        extension: file.name.split(".").pop().toLowerCase(),
      };
    });

    // Sort files by year (descending), exam type, and resources alphabetically
    parsedFiles.sort((a, b) => {
      // Primary sorting: Year (most recent first)
      const yearA = a.year || "0000-00";
      const yearB = b.year || "0000-00";
      if (yearA !== yearB) {
        return yearB.localeCompare(yearA);
      }

      // Secondary sorting: Exam type
      const examOrder = ["ISE1", "ISE2", "ESE", "Combined"];
      const aIndex =
        examOrder.indexOf(a.examType) !== -1
          ? examOrder.indexOf(a.examType)
          : examOrder.length;
      const bIndex =
        examOrder.indexOf(b.examType) !== -1
          ? examOrder.indexOf(b.examType)
          : examOrder.length;
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }

      // Tertiary sorting: Alphabetical for other exam types (e.g., Resources_*, DAA, DSA)
      return a.examType.localeCompare(b.examType);
    });

    return parsedFiles;
  } catch (error) {
    console.error("Error fetching files:", error);
    throw error;
  }
}

async function fetchFileContent(fileId) {
  try {
    const response = await fetch(
      `${SCRIPT_URL}?action=getFileContent&fileId=${fileId}`
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.content;
  } catch (error) {
    console.error("Error fetching file content:", error);
    throw error;
  }
}

async function fetchTemporaryUrl(fileId) {
  try {
    const response = await fetch(
      `${SCRIPT_URL}?action=getTemporaryUrl&fileId=${fileId}`
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return { url: data.url, expires: data.expires };
  } catch (error) {
    console.error("Error fetching temporary URL:", error);
    throw error;
  }
}

async function revokeTemporaryAccess(fileId) {
  try {
    const response = await fetch(
      `${SCRIPT_URL}?action=revokeTemporaryAccess&fileId=${fileId}`,
      { method: "POST" }
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.success;
  } catch (error) {
    console.error("Error revoking temporary access:", error);
    throw error;
  }
}

document.addEventListener("DOMContentLoaded", function () {
  // Get references to elements
  const firstYear = document.getElementById("firstYear");
  const secondYear = document.getElementById("secondYear");
  const firstYearUpload = document.getElementById("firstYearUpload");
  const secondYearUpload = document.getElementById("secondYearUpload");
  const switchButtonContainer = document.getElementById(
    "switchButtonContainer"
  );
  const switchButton = document.getElementById("switchButton");
  const closeSwitchModal = document.getElementById("closeSwitchModal");
  const switchModal = document.getElementById("switchModal");

  // Get references to switch trigger elements
  const switchSpan = document.getElementById("switch");
  const switchSvg = switchSpan ? switchSpan.querySelector("svg") : null;

  // URL mappings for each radio button
  const urlMappings = {
    firstYear: "https://pyqs-isk.pages.dev",
    secondYear: "https://rpsa-isk.pages.dev",
    firstYearUpload: "https://1yr-pyqsupload-isk.pages.dev",
    secondYearUpload: "https://rpsaupload-isk.pages.dev",
  };

  // Function to show the modal
  function showModal() {
    // First, show the modal without overlay
    switchModal.classList.remove("hidden");
    switchModal.style.display = "flex";

    // Get the modal content element
    const modalContent = switchModal.querySelector(".bg-gray-800");
    const modalOverlay = switchModal.querySelector(".fixed.inset-0");

    // Initially hide overlay with dramatic starting state
    if (modalOverlay) {
      modalOverlay.style.opacity = "0";
      modalOverlay.style.transform = "scale(1.1)";
      modalOverlay.style.filter = "blur(8px)";
    }

    // Initial state for modal content (stack-out animation)
    if (modalContent) {
      modalContent.style.opacity = "0";
      modalContent.style.transform = "scale(0.8) translateY(20px)";
      modalContent.style.transition =
        "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    }

    // First animate the modal content
    setTimeout(() => {
      if (modalContent) {
        modalContent.style.opacity = "1";
        modalContent.style.transform = "scale(1) translateY(0px)";
      }

      // Then apply dramatic overlay effect after a short delay
      setTimeout(() => {
        if (modalOverlay) {
          modalOverlay.style.transition =
            "all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
          modalOverlay.style.opacity = "1";
          modalOverlay.style.transform = "scale(1)";
          modalOverlay.style.filter = "blur(0px)";
        }
      }, 150);
    }, 10);

    // Enhanced auto-scroll to center modal perfectly
    setTimeout(() => {
      centerModalOnScreen();
    }, 50);
  }

  // Enhanced function to center modal perfectly on screen
  function centerModalOnScreen() {
    const modalContent = switchModal.querySelector(".bg-gray-800");
    if (modalContent) {
      const rect = modalContent.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const modalHeight = rect.height;

      // Calculate the exact center position
      const currentModalCenter = rect.top + modalHeight / 2;
      const desiredModalCenter = viewportHeight / 2;
      const scrollAdjustment = currentModalCenter - desiredModalCenter;

      // Only scroll if the modal isn't already perfectly centered (with 50px tolerance)
      if (Math.abs(scrollAdjustment) > 50) {
        const targetScrollY = window.pageYOffset + scrollAdjustment;

        // Enhanced smooth scroll with custom easing
        const startScrollY = window.pageYOffset;
        const distance = targetScrollY - startScrollY;
        const duration = 800; // Longer, more elegant scroll
        let startTime = null;

        function animateScroll(currentTime) {
          if (startTime === null) startTime = currentTime;
          const timeElapsed = currentTime - startTime;
          const progress = Math.min(timeElapsed / duration, 1);

          // Custom easing function (ease-out-cubic)
          const easeOutCubic = 1 - Math.pow(1 - progress, 3);

          const currentScrollY = startScrollY + distance * easeOutCubic;
          window.scrollTo(0, currentScrollY);

          if (progress < 1) {
            requestAnimationFrame(animateScroll);
          }
        }

        requestAnimationFrame(animateScroll);
      }
    }
  }

  // Function to show switch button with enhanced animation
  function showSwitchButton(url) {
    switchButton.href = url;

    // If button is already visible, show selection change animation
    if (!switchButtonContainer.classList.contains("hidden")) {
      // Quick pulse and color change animation for selection change
      switchButton.style.transition = "all 0.2s ease-in-out";
      switchButton.style.transform = "scale(0.95)";
      switchButton.style.backgroundColor = "#059669"; // darker green

      setTimeout(() => {
        switchButton.style.transform = "scale(1.05)";
        switchButton.style.backgroundColor = "#10b981"; // brighter green
      }, 100);

      setTimeout(() => {
        switchButton.style.transform = "scale(1)";
        switchButton.style.backgroundColor = ""; // reset to default
        switchButton.style.transition = "";
      }, 300);
    } else {
      // Initial show animation
      switchButtonContainer.classList.remove("hidden");

      // Enhanced entrance animation with multiple effects
      switchButton.style.transform = "scale(0.8) rotateX(90deg)";
      switchButton.style.opacity = "0";
      switchButton.style.transition =
        "all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)";

      // Trigger animation after a small delay to ensure the element is rendered
      setTimeout(() => {
        switchButtonContainer.classList.remove("opacity-0", "translate-y-4");
        switchButtonContainer.classList.add("opacity-100", "translate-y-0");

        switchButton.style.transform = "scale(1) rotateX(0deg)";
        switchButton.style.opacity = "1";

        // Add a subtle glow effect
        setTimeout(() => {
          switchButton.style.boxShadow = "0 0 20px rgba(16, 185, 129, 0.4)";
          setTimeout(() => {
            switchButton.style.boxShadow = "";
            switchButton.style.transition = "";
          }, 800);
        }, 200);
      }, 10);
    }
  }

  // Function to hide switch button with enhanced animation
  function hideSwitchButton() {
    // Enhanced exit animation
    switchButton.style.transition =
      "all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)";
    switchButton.style.transform = "scale(0.7) rotateX(-90deg)";
    switchButton.style.opacity = "0";

    switchButtonContainer.classList.remove("opacity-100", "translate-y-0");
    switchButtonContainer.classList.add("opacity-0", "translate-y-4");

    // Hide the element after animation completes
    setTimeout(() => {
      switchButtonContainer.classList.add("hidden");

      // Reset button state
      switchButton.style.transform = "scale(1) rotateX(0deg)";
      switchButton.style.opacity = "1";
      switchButton.style.transition = "";
    }, 400);
  }

  // Add event listeners to switch trigger elements
  if (switchSpan) {
    switchSpan.addEventListener("click", function (e) {
      e.preventDefault();
      showModal();
    });
  }

  if (switchSvg) {
    switchSvg.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation(); // Prevent event bubbling
      showModal();
    });
  }

  // Add event listeners to radio buttons
  if (firstYear) {
    firstYear.addEventListener("change", function () {
      if (this.checked) {
        showSwitchButton(urlMappings.firstYear);
      }
    });
  }

  if (secondYear) {
    secondYear.addEventListener("change", function () {
      if (this.checked) {
        showSwitchButton(urlMappings.secondYear);
      }
    });
  }

  if (firstYearUpload) {
    firstYearUpload.addEventListener("change", function () {
      if (this.checked) {
        showSwitchButton(urlMappings.firstYearUpload);
      }
    });
  }

  if (secondYearUpload) {
    secondYearUpload.addEventListener("change", function () {
      if (this.checked) {
        showSwitchButton(urlMappings.secondYearUpload);
      }
    });
  }

  // Close modal functionality with enhanced stack-in animation and dramatic overlay removal
  if (closeSwitchModal) {
    closeSwitchModal.addEventListener("click", function () {
      const modalContent = switchModal.querySelector(".bg-gray-800");
      const modalOverlay = switchModal.querySelector(".fixed.inset-0");

      // First create dramatic overlay fade-out with reverse effects
      if (modalOverlay) {
        modalOverlay.style.transition =
          "all 0.4s cubic-bezier(0.55, 0.085, 0.68, 0.53)";
        modalOverlay.style.opacity = "0";
        modalOverlay.style.transform = "scale(1.05)";
        modalOverlay.style.filter = "blur(4px)";
      }

      // Then animate modal content with enhanced stack-in effect
      setTimeout(() => {
        if (modalContent) {
          modalContent.style.transition =
            "all 0.35s cubic-bezier(0.68, -0.55, 0.265, 1.55)";
          modalContent.style.opacity = "0";
          modalContent.style.transform =
            "scale(0.65) translateY(-40px) rotateX(10deg)";
        }
      }, 100);

      // Hide modal after all animations complete
      setTimeout(() => {
        switchModal.classList.add("hidden");
        switchModal.style.display = "none";

        // Reset modal state for next opening
        if (modalContent) {
          modalContent.style.opacity = "1";
          modalContent.style.transform =
            "scale(1) translateY(0px) rotateX(0deg)";
          modalContent.style.transition = "";
        }

        if (modalOverlay) {
          modalOverlay.style.opacity = "1";
          modalOverlay.style.transform = "scale(1)";
          modalOverlay.style.filter = "blur(0px)";
          modalOverlay.style.transition = "";
        }

        // Reset radio buttons and hide switch button
        const radioButtons = document.querySelectorAll(
          'input[name="default-radio"]'
        );
        radioButtons.forEach((radio) => (radio.checked = false));
        hideSwitchButton();
      }, 450);
    });
  }

  // Close modal when clicking outside of it
  if (switchModal) {
    switchModal.addEventListener("click", function (e) {
      if (e.target === switchModal || e.target.classList.contains("fixed")) {
        if (closeSwitchModal) {
          closeSwitchModal.click();
        }
      }
    });
  }

  // Alternative: Add event listener to any element with class 'switch-trigger'
  const switchTriggers = document.querySelectorAll(".switch-trigger");
  switchTriggers.forEach((trigger) => {
    trigger.addEventListener("click", function (e) {
      e.preventDefault();
      showModal();
    });
  });
});
