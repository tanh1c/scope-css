// sidepanel.js
let currentData = null;
let currentTab = "css";

const instructions = document.getElementById("instructions");
const tabs = document.getElementById("tabs");
const outputWrapper = document.getElementById("outputWrapper");
const output = document.getElementById("output");
const warning = document.getElementById("warning");
const toast = document.getElementById("toast");
const copyBtn = document.getElementById("copyBtn");
const tabButtons = document.querySelectorAll(".tab");

function showToast(msg = "Copied!") {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

function render() {
  if (!currentData) return;
  const text = currentTab === "css" ? currentData.cssFormat : currentData.htmlFormat;
  output.textContent = text || "(no styles extracted)";
}

function autoCopy(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(
    () => showToast(),
    () => {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast();
    }
  );
}

// Tab switching
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTab = btn.dataset.tab;
    render();
    if (currentData) {
      const text = currentTab === "css" ? currentData.cssFormat : currentData.htmlFormat;
      autoCopy(text);
    }
  });
});

// Manual copy button
copyBtn.addEventListener("click", () => {
  if (!currentData) return;
  const text = currentTab === "css" ? currentData.cssFormat : currentData.htmlFormat;
  autoCopy(text);
});

// Receive extraction result from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "EXTRACTION_RESULT") {
    currentData = msg.payload;

    // Show output UI, hide instructions
    instructions.style.display = "none";
    tabs.style.display = "flex";
    outputWrapper.style.display = "block";

    // Reset to CSS tab
    tabButtons.forEach((b) => b.classList.remove("active"));
    tabButtons[0].classList.add("active");
    currentTab = "css";

    render();

    // Auto-copy CSS format
    autoCopy(currentData.cssFormat);

    // Warning if any
    if (currentData.warning) {
      warning.style.display = "block";
      warning.textContent = currentData.warning;
    } else {
      warning.style.display = "none";
    }
  }
});
